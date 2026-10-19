import 'server-only';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTopupTier } from '@/lib/payments/catalog';
import { confirmPayment } from '@/lib/payments/toss';

// Toss successUrl handler (PAY-03, first half). It CONFIRMS the payment and
// sends the browser back to the app. It never credits a wallet: crediting is
// webhook-only (app/api/payments/toss/webhook) after re-querying Toss.

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const PAYMENT_KEY_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const AMOUNT_PATTERN = /^[1-9]\d{0,9}$/;

type OrderRow = {
  order_id: string;
  tier_id: string;
  amount_krw: number | string;
  token_amount: number | string;
  return_path: string | null;
  confirm_idempotency_key: string;
  // Read-only timestamps; this handler never writes credited_at (webhook-only).
} & Readonly<Record<'confirmed_at' | 'credited_at', string | null>>;

const ORDER_COLUMNS = 'order_id,tier_id,amount_krw,token_amount,return_path,confirm_idempotency_key,confirmed_at,credited_at';

/** Same-origin destination: stored path + its query, plus exactly one marker. */
function appRedirect(request: Request, returnPath: string | null | undefined, marker: 'topup' | 'topupFail', value: string) {
  const origin = new URL(request.url).origin;
  let destination: URL;
  try {
    destination = new URL(returnPath && returnPath.startsWith('/') ? returnPath : '/', origin);
  } catch {
    destination = new URL('/', origin);
  }
  if (destination.origin !== origin) destination = new URL('/', origin);
  destination.hash = '';
  destination.searchParams.set(marker, value);
  return NextResponse.redirect(destination);
}

function retryable() {
  return new NextResponse('잠시 후 다시 시도해주세요.', {
    status: 503,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5' },
  });
}

function logReject(reason: string, order: Pick<OrderRow, 'order_id' | 'tier_id'> | null, orderId?: string) {
  console.error('[payments/toss/success] rejected', {
    reason,
    orderId: order?.order_id ?? orderId,
    tierId: order?.tier_id,
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const orderId = params.get('orderId') ?? '';
  const paymentKey = params.get('paymentKey') ?? '';
  const amountParam = params.get('amount') ?? '';

  if (!ORDER_ID_PATTERN.test(orderId)) {
    logReject('malformed_order_id', null);
    return appRedirect(request, '/', 'topupFail', '1');
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payment_orders')
    .select(ORDER_COLUMNS)
    .eq('order_id', orderId)
    .maybeSingle();
  if (error) {
    console.error('[payments/toss/success] order lookup failed', { orderId });
    return retryable();
  }
  const order = data as OrderRow | null;
  if (!order) {
    logReject('unknown_order', null, orderId);
    return appRedirect(request, '/', 'topupFail', '1');
  }

  // Back/refresh or an early webhook: never confirm again, never re-price.
  if (order.credited_at || order.confirmed_at) {
    return appRedirect(request, order.return_path, 'topup', order.order_id);
  }

  const storedAmount = Number(order.amount_krw);
  const storedTokens = Number(order.token_amount);
  if (!PAYMENT_KEY_PATTERN.test(paymentKey) || !AMOUNT_PATTERN.test(amountParam)) {
    logReject('malformed_params', order);
    return appRedirect(request, order.return_path, 'topupFail', '1');
  }
  const urlAmount = Number(amountParam);
  if (urlAmount !== storedAmount) {
    logReject('amount_mismatch', order);
    return appRedirect(request, order.return_path, 'topupFail', '1');
  }

  // Reopen D-01: re-read the DB catalog and only proceed when its terms still
  // match the order snapshot. Operators change terms via a NEW tier ID.
  let tier: Awaited<ReturnType<typeof getTopupTier>>;
  try {
    tier = await getTopupTier(order.tier_id);
  } catch {
    console.error('[payments/toss/success] catalog lookup failed', { orderId: order.order_id, tierId: order.tier_id });
    return retryable();
  }
  if (!tier) {
    logReject('tier_unavailable', order);
    return appRedirect(request, order.return_path, 'topupFail', '1');
  }
  if (tier.priceKrw !== storedAmount || tier.tokens !== storedTokens || urlAmount !== tier.priceKrw) {
    logReject('catalog_terms_changed', order);
    return appRedirect(request, order.return_path, 'topupFail', '1');
  }

  // Persist before confirm so a webhook that races the confirm response can
  // still match the payment.
  const authenticated = await admin
    .from('payment_orders')
    .update({ payment_key: paymentKey, authenticated_at: new Date().toISOString() })
    .eq('order_id', order.order_id);
  if (authenticated.error) {
    console.error('[payments/toss/success] storing payment key failed', { orderId: order.order_id });
    return retryable();
  }

  let result: Awaited<ReturnType<typeof confirmPayment>>;
  try {
    result = await confirmPayment({
      paymentKey,
      orderId: order.order_id,
      amount: tier.priceKrw,
      idempotencyKey: order.confirm_idempotency_key,
    });
  } catch {
    // Outcome unknown (timeout/network). The same Idempotency-Key makes a
    // reload safe; the webhook still credits if Toss approved it.
    console.error('[payments/toss/success] confirm request failed', { orderId: order.order_id });
    return retryable();
  }

  if (!result.ok) {
    const failCode = typeof result.code === 'string' ? result.code.slice(0, 64) : 'CONFIRM_FAILED';
    console.error('[payments/toss/success] confirm rejected', { orderId: order.order_id, code: failCode });
    const failed = await admin
      .from('payment_orders')
      .update({ failed_at: new Date().toISOString(), fail_code: failCode })
      .eq('order_id', order.order_id)
      .is('credited_at', null);
    if (failed.error) console.error('[payments/toss/success] recording failure failed', { orderId: order.order_id });
    return appRedirect(request, order.return_path, 'topupFail', '1');
  }

  // Only confirmed_at is written; credited_at belongs to the webhook.
  const confirmed = await admin
    .from('payment_orders')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('order_id', order.order_id);
  if (confirmed.error) console.error('[payments/toss/success] recording confirmation failed', { orderId: order.order_id });

  return appRedirect(request, order.return_path, 'topup', order.order_id);
}
