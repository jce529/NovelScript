import 'server-only';

const TOSS_API_BASE = 'https://api.tosspayments.com';

type TossApiResult<T> =
  | { ok: true; payment: T }
  | { ok: false; code?: string; message?: string };

function authorizationHeader(): string {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) throw new Error('Toss secret key is not configured');
  return `Basic ${Buffer.from(`${secretKey}:`, 'utf8').toString('base64')}`;
}

async function readResult<T>(response: Response): Promise<TossApiResult<T>> {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (response.ok) return { ok: true, payment: payload as T };
  return {
    ok: false,
    ...(typeof payload.code === 'string' ? { code: payload.code } : {}),
    ...(typeof payload.message === 'string' ? { message: payload.message } : {}),
  };
}

export async function confirmPayment(args: {
  paymentKey: string;
  orderId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<TossApiResult<Record<string, unknown>>> {
  const response = await fetch(`${TOSS_API_BASE}/v1/payments/confirm`, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader(),
      'Content-Type': 'application/json',
      'Idempotency-Key': args.idempotencyKey,
    },
    body: JSON.stringify({ paymentKey: args.paymentKey, orderId: args.orderId, amount: args.amount }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  return readResult(response);
}

export async function getPaymentByOrderId(orderId: string): Promise<TossApiResult<Record<string, unknown>>> {
  const response = await fetch(`${TOSS_API_BASE}/v1/payments/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: { Authorization: authorizationHeader() },
    signal: AbortSignal.timeout(5_000),
    cache: 'no-store',
  });
  return readResult(response);
}
