import { createClient } from '@/lib/supabase/server';
import {
  ChapterReadingError,
  completeChapterReading,
  parseProgressRequest,
  PROGRESS_BODY_LIMIT_BYTES,
  saveChapterReading,
  type ChapterReadingErrorCode,
  type ChapterReadingState,
} from '@/lib/reader/chapter-reading';

/**
 * READ-04 (03-13): scroll-progress save / completion endpoint.
 *
 * A Route Handler instead of a Server Action on purpose: Next dispatches Server Actions one at
 * a time per client, so periodic progress saves would queue behind (and delay) report/like
 * actions. This fetch runs independently. It never calls revalidatePath.
 *
 * Identity comes only from the session cookie (auth.getUser); writes go only through the
 * 0024/0025 RPCs, which recheck readability, session and sequence.
 */

type ErrorBody = { ok: false; error: string };

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: { ok: true; state: ChapterReadingState } | ErrorBody, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

const fail = (error: string, status: number) => json({ ok: false, error }, status);

const STATUS_BY_CODE: Record<Exclude<ChapterReadingErrorCode, 'unknown'>, number> = {
  authentication_required: 401,
  invalid_input: 400,
  write_access_denied: 403,
  chapter_unavailable: 404,
  chapter_not_readable: 403,
  active_time_exceeds_elapsed: 400,
};

/** Same-origin check, like the Server Action CSRF guard: Origin host must equal the request host. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Reads at most `limit` bytes; returns null when the body is larger. */
async function readLimitedText(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return fail('forbidden_origin', 403);

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.split(';')[0].trim().toLowerCase() !== 'application/json') return fail('invalid_request', 400);

  let text: string | null;
  try {
    text = await readLimitedText(request, PROGRESS_BODY_LIMIT_BYTES);
  } catch {
    return fail('invalid_request', 400);
  }
  if (text === null) return fail('payload_too_large', 413);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('invalid_request', 400);
  }
  const parsed = parseProgressRequest(raw);
  if (!parsed.ok) return fail('invalid_request', 400);
  const sample = parsed.value;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail('authentication_required', 401);

    // Always store the sample first. A stale sample is ignored by save (unchanged snapshot),
    // so complete then judges only the current session's stored state.
    const saved = await saveChapterReading(supabase, sample);
    if (sample.operation === 'save') return json({ ok: true, state: saved }, 200);
    const completed = await completeChapterReading(supabase, sample);
    return json({ ok: true, state: completed }, 200);
  } catch (error) {
    if (error instanceof ChapterReadingError && error.code !== 'unknown') {
      return fail(error.code, STATUS_BY_CODE[error.code]);
    }
    return fail('internal_error', 500);
  }
}
