import 'server-only';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentByOrderId } from '@/lib/payments/toss';
import { TOPUP_REFERENCE_TYPE } from '@/lib/payments/tiers';

// Toss PAYMENT_STATUS_CHANGED webhook (PAY-03, second half). This is the ONLY
// Phase 5 call site of apply_wallet_delta. The event carries no signature, so
// the body is treated as an untrusted lookup hint: only data.orderId is read,
// the stored order is loaded, and Toss is re-queried with the secret key. Credit
// happens only when the authenticated lookup reports DONE for the same order
// with totalAmount exactly equal to the stored amount_krw. The credited amount
// is always the persisted order snapshot (token_amount), never the current
// catalog and never webhook body fields.
//
// Response contract: 200 for handled or permanently invalid events (Toss stops
// retrying), 500 for transient DB/network failures (Toss retries). Idempotency
// is enforced by apply_wallet_delta's unique(wallet_id, reference_type,
// reference_id); credited_at is a marker set only after a successful RPC.

const EVENT_TYPE = 'PAYMENT_STATUS_CHANGED';
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const ORDER_COLUMNS = 'order_id,user_id,tier_id,amount_krw,token_amount,credited_at';

type OrderRow = {
  order_id: string;
  user_id: string;
  tier_id: string;
  amount_krw: number | string;
  token_amount: number | string;
  credited_at: string | null;
};

function ack() {
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

function retry() {
  return new NextResponse(null, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}

/** Server-side operational log. Never pass secrets, paymentKey or raw bodies here. */
function logIssue(level: 'warn' | 'error', reason: string, details: Record<string, unknown> = {}) {
  console[level]('[payments/toss/webhook]', { reason, ...details });
}

function readOrderId(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const event = parsed as { eventType?: unknown; data?: unknown };
  if (event.eventType !== EVENT_TYPE) return null;
  if (!event.data || typeof event.data !== 'object') return null;
  const orderId = (event.data as { orderId?: unknown }).orderId;
  if (typeof orderId !== 'string' || !ORDER_ID_PATTERN.test(orderId)) return null;
  return orderId;
}

function toSafeInteger(value: number | string): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function POST(request: Request) {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return ack();
  }

  const orderId = readOrderId(raw);
  if (!orderId) return ack();

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    logIssue('error', 'admin_client_unavailable', { orderId });
    return retry();
  }

  const { data: orderData, error: selectError } = await supabase
    .from('payment_orders')
    .select(ORDER_COLUMNS)
    .eq('order_id', orderId)
    .maybeSingle();
  if (selectError) {
    logIssue('error', 'order_lookup_failed', { orderId });
    return retry();
  }
  const order = orderData as OrderRow | null;
  if (!order) {
    logIssue('warn', 'unknown_order', { orderId });
    return ack();
  }
  if (order.credited_at) return ack();

  const amountKrw = toSafeInteger(order.amount_krw);
  const tokenAmount = toSafeInteger(order.token_amount);
  if (amountKrw === null || tokenAmount === null) {
    logIssue('error', 'invalid_order_snapshot', { orderId });
    return ack();
  }

  let lookup: Awaited<ReturnType<typeof getPaymentByOrderId>>;
  try {
    lookup = await getPaymentByOrderId(order.order_id);
  } catch {
    logIssue('error', 'toss_lookup_unreachable', { orderId });
    return retry();
  }
  if (!lookup.ok) {
    if (lookup.code === 'NOT_FOUND_PAYMENT') {
      logIssue('warn', 'toss_payment_not_found', { orderId });
      return ack();
    }
    logIssue('error', 'toss_lookup_failed', { orderId, code: lookup.code });
    return retry();
  }

  const payment = lookup.payment;
  if (payment.orderId !== order.order_id) {
    logIssue('error', 'toss_order_mismatch', { orderId });
    return ack();
  }
  if (payment.status !== 'DONE') {
    return ack();
  }
  if (typeof payment.totalAmount !== 'number' || payment.totalAmount !== amountKrw) {
    logIssue('error', 'amount_mismatch', {
      orderId,
      expected: amountKrw,
      received: typeof payment.totalAmount === 'number' ? payment.totalAmount : null,
    });
    return ack();
  }

  const { error: rpcError } = await supabase.rpc('apply_wallet_delta', {
    p_wallet_id: order.user_id,
    p_delta: tokenAmount,
    p_reference_type: TOPUP_REFERENCE_TYPE,
    p_reference_id: order.order_id,
    p_reason: `topup:${order.tier_id}`,
  });
  if (rpcError) {
    logIssue('error', 'wallet_credit_failed', { orderId, tierId: order.tier_id });
    return retry();
  }

  const { error: updateError } = await supabase
    .from('payment_orders')
    .update({ credited_at: new Date().toISOString() })
    .eq('order_id', order.order_id)
    .is('credited_at', null);
  if (updateError) {
    // Ledger row exists; Toss retry re-runs the idempotent RPC and repairs the marker.
    logIssue('error', 'credited_at_update_failed', { orderId });
    return retry();
  }

  return ack();
}
