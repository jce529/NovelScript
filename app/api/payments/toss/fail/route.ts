import 'server-only';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Toss failUrl handler (D-07). Sends the browser back to the tier-select step
// with a single `topupFail=1` marker. It never credits a wallet, never trusts a
// client-supplied return path, and never forwards Toss error text to the app.

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const FAIL_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;

type OrderRow = {
  order_id: string;
  return_path: string | null;
} & Readonly<Record<'confirmed_at' | 'credited_at', string | null>>;

function failRedirect(request: Request, returnPath: string | null | undefined) {
  const origin = new URL(request.url).origin;
  let destination: URL;
  try {
    destination = new URL(returnPath && returnPath.startsWith('/') ? returnPath : '/', origin);
  } catch {
    destination = new URL('/', origin);
  }
  if (destination.origin !== origin) destination = new URL('/', origin);
  destination.hash = '';
  destination.searchParams.delete('topup');
  destination.searchParams.set('topupFail', '1');
  return NextResponse.redirect(destination);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const orderId = params.get('orderId');
  if (!orderId || !ORDER_ID_PATTERN.test(orderId)) return failRedirect(request, '/');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payment_orders')
    .select('order_id,return_path,confirmed_at,credited_at')
    .eq('order_id', orderId)
    .maybeSingle();
  if (error) {
    console.error('[payments/toss/fail] order lookup failed', { orderId });
    return failRedirect(request, '/');
  }
  const order = data as OrderRow | null;
  if (!order) return failRedirect(request, '/');

  // A confirmed/credited order must not be marked failed by a stray fail return.
  if (!order.confirmed_at && !order.credited_at) {
    const rawCode = params.get('code') ?? '';
    const failCode = FAIL_CODE_PATTERN.test(rawCode) ? rawCode : 'UNKNOWN';
    const failed = await admin
      .from('payment_orders')
      .update({ failed_at: new Date().toISOString(), fail_code: failCode })
      .eq('order_id', order.order_id)
      .is('credited_at', null);
    if (failed.error) console.error('[payments/toss/fail] recording failure failed', { orderId: order.order_id });
  }

  return failRedirect(request, order.return_path);
}
