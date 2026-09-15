# Architecture Research

**Domain:** AI-assisted webnovel writing/reading platform with real payments (Korean market) — single Next.js app + BaaS, solo-founder MVP scale
**Researched:** 2026-08-25
**Confidence:** MEDIUM-HIGH (Next.js/Vercel runtime facts and ledger patterns HIGH; PortOne-specific webhook mechanics MEDIUM — verify against live PortOne console docs during Phase implementation)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Next.js 16 App (single deployment, Vercel)           │
│                                                                            │
│  ┌───────────────────────────┐   ┌───────────────────────────┐           │
│  │  Route Group: (studio)    │   │  Route Group: (reader)     │           │
│  │  /studio/works/[id]/...   │   │  /works/[id]/ch/[n]        │           │
│  │  - KB doc CRUD (RSC)      │   │  - Chapter viewer (RSC)    │           │
│  │  - Editor (client island) │   │  - Discovery feed (RSC)    │           │
│  │  - @-mention picker       │   │  - Paid-unlock CTA         │           │
│  └─────────────┬─────────────┘   └─────────────┬───────────────┘         │
│                │  fetch/streaming                │  fetch                 │
│  ┌─────────────▼─────────────────────────────────▼───────────────┐       │
│  │            Route Handlers (Node.js runtime — app/api/*)        │       │
│  │  /api/ai/generate (SSE/stream)   /api/wallet/spend             │       │
│  │  /api/kb/*                       /api/chapters/[id]/unlock     │       │
│  │  /api/payments/checkout          /api/payments/webhook         │       │
│  │  /api/admin/moderation/*                                       │       │
│  └───┬──────────────┬──────────────────────┬───────────────┬─────┘       │
│      │              │                      │               │             │
│  ┌───▼───┐   ┌───────▼───────┐    ┌─────────▼───────┐  ┌────▼─────┐      │
│  │ AI    │   │ Wallet/Ledger │    │ Payment Gateway  │  │ Content  │      │
│  │Gateway│   │ Module        │    │ Adapter (PortOne)│  │ / Admin  │      │
│  │module │   │ (Postgres RPC)│    │                  │  │ module   │      │
│  └───┬───┘   └───────┬───────┘    └─────────┬────────┘  └────┬─────┘      │
└──────┼───────────────┼──────────────────────┼────────────────┼───────────┘
       │               │                      │                │
┌──────▼──────┐  ┌─────▼─────────────────────▼────────────────▼─────────┐
│ External LLM│  │              Supabase (BaaS)                          │
│ vendor API  │  │  - Postgres (wallets, ledger_entries, works, chapters,│
│ (1 vendor,  │  │    kb_docs, purchases, spend_caps, reports)           │
│ platform key│  │  - Auth (session cookies, shared across route groups)│
│ via server) │  │  - Storage (cover images, KB attachments)             │
└─────────────┘  └────────────────────────────────────────────────────────┘
                                     ▲
                          ┌──────────┴──────────┐
                          │ Korean PG (PortOne / │
                          │ Toss) — webhook push │
                          └──────────────────────┘
```

**Domain/subdomain decision:** Build as **one Next.js app with path-based route groups** (`(studio)`, `(reader)`, `(admin)`) sharing one origin, one session cookie, one deployment — **not** the subdomain split the full-vision docs describe. The docs' own requirement ("GNB 토큰 잔액이 도메인 이동과 무관하게 동기화") is a problem subdomains *create* (cross-domain cookies, CORS, shared-session complexity) and a single-origin app *avoids for free*. Revisit subdomain split only when the Asset Store (out of scope for MVP) is built and there's an actual reason (independent deploy cadence, different team) to separate it.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Studio UI (route group) | KB doc CRUD, rich-text/markdown editor, `@`-mention picker, publish flow | React Server Components for lists/CRUD pages; one client-side "editor island" (Tiptap/Lexical or plain textarea+markdown) for the writing surface |
| Reader UI (route group) | Chapter viewer, discovery/ranking feed, paid-chapter unlock CTA | RSC for feed/list pages (cacheable), client component only for read-progress tracking and unlock button |
| AI Gateway module | Assemble prompt from `@`-mentioned docs + preset tone, call vendor LLM, stream tokens back, meter actual usage, reconcile wallet reservation | Single Node.js route handler + a plain TS service module (`lib/ai/`) — not a separate service |
| Wallet/Ledger module | Single source of truth for token balance; all debits/credits go through it; enforces non-negative balance atomically | Postgres schema + `SECURITY DEFINER` RPC functions, called via Supabase service-role client from route handlers only (never from client) |
| Payment Gateway Adapter | Create PG checkout session, verify PG webhook signature, translate PG events into ledger credits | Thin adapter module (`lib/payments/portone.ts`) wrapping PortOne/Toss server SDK; webhook route handler is the only public entry point |
| Spend Cap / Circuit Breaker | Refuse or degrade AI calls once platform-wide AI spend approaches budget threshold | A guard function called inside `/api/ai/generate` before invoking the vendor SDK; reads/updates an aggregate spend counter table |
| Content/Admin module | Chapter publish state, report queue, manual moderation actions (block/unpublish/warn) | RSC admin pages gated by role check + a small set of mutation route handlers/server actions |
| Discovery/Ranking | Simplified popularity score (views, likes, next-chapter continuation rate) | Scheduled recomputation (Vercel Cron hitting a route handler) writing a denormalized `ranking_score` column — no real-time ML needed at this scale |

## Recommended Project Structure

```
src/
├── app/
│   ├── (reader)/                    # main reader-facing routes, no auth wall except purchase actions
│   │   ├── page.tsx                 # discovery/home feed
│   │   └── works/[workId]/ch/[n]/page.tsx
│   ├── (studio)/                    # writer-only routes, auth-gated via layout
│   │   ├── layout.tsx               # ownership + auth guard
│   │   └── works/[workId]/
│   │       ├── kb/                  # markdown knowledge-base CRUD
│   │       └── editor/[chapterId]/page.tsx
│   ├── (admin)/                     # moderator-only routes
│   │   └── reports/page.tsx
│   └── api/
│       ├── ai/generate/route.ts     # Node runtime, streaming, wallet-gated
│       ├── wallet/spend/route.ts    # generic paid-action debit (chapter unlock, donations)
│       ├── payments/checkout/route.ts
│       ├── payments/webhook/route.ts
│       └── admin/moderation/route.ts
├── lib/
│   ├── ai/
│   │   ├── promptAssembly.ts        # @-mention resolution → context block
│   │   ├── vendorClient.ts          # single-vendor SDK wrapper (swap point if vendor changes)
│   │   └── spendGuard.ts            # circuit breaker check, reservation/reconciliation
│   ├── wallet/
│   │   ├── ledger.ts                # typed wrappers around Postgres RPCs (reserve/settle/refund/credit)
│   │   └── types.ts
│   ├── payments/
│   │   └── portone.ts               # checkout session + webhook signature verify
│   └── db/
│       └── supabaseServerClient.ts  # service-role client, server-only
├── db/
│   └── migrations/                  # SQL migrations (wallets, ledger_entries, spend_caps, works, chapters, kb_docs, reports)
└── components/
    ├── studio/                      # editor, mention picker, KB forms
    └── reader/                      # chapter viewer, unlock CTA, GNB token balance widget
```

### Structure Rationale

- **Route groups instead of subdomains/separate apps:** one deploy, one auth session, no cross-origin cookie problem for the GNB balance widget.
- **`lib/ai/`, `lib/wallet/`, `lib/payments/` as plain modules, not services:** at this scale (solo founder, MVP) these are library boundaries inside one process, not network boundaries. They give the same "clean seam" benefit for handoff to `agy` (each module = one file set, one test target) without operational overhead of separate deployables.
- **`spendGuard.ts` lives next to the AI vendor client, not inside the wallet module:** the circuit breaker is an AI-cost-specific policy (platform-wide budget), distinct from the wallet's job (per-user balance correctness). Keeping them separate means the wallet ledger stays a boring, generic "debit/credit" primitive reusable for chapter unlocks and donations too.

## Architectural Patterns

### Pattern 1: Node.js streaming route handler for LLM calls (not Edge)

**What:** As of Next.js 16.3, `runtime = 'edge'` is no longer supported for route handlers/pages — everything runs on the Node.js runtime, which now streams natively. This removes the historical "Edge for low-latency streaming vs Node for full API access" tradeoff for this project: there is only one runtime, and it does support streaming.
**When to use:** All AI generation and any other route that needs Server-Sent-Events-style incremental output.
**Trade-offs:** No edge-network TTFB advantage, but you get full Node API access (needed for Supabase service-role client, crypto for webhook signature verification, PG SDKs) with zero runtime-split complexity. On Vercel, default function duration is now 5 minutes (Fluid Compute) with `maxDuration` configurable up to much higher values on Pro — comfortably covers LLM generation latency; set an explicit `maxDuration` in the route file to avoid relying on plan defaults.

**Example:**
```typescript
// app/api/ai/generate/route.ts
export const maxDuration = 120; // seconds; explicit, don't rely on plan default

export async function POST(req: Request) {
  const { userId, workId, mentionedDocIds, presetTier, instruction } = await parseAndAuth(req);

  // 1. Assemble prompt (deterministic, no I/O beyond a few doc lookups)
  const prompt = await assemblePrompt({ workId, mentionedDocIds, presetTier, instruction });

  // 2. Reserve estimated cost BEFORE calling the vendor (see Pattern 3)
  const reservation = await reserveAiSpend({ userId, estimatedMaxTokens: estimateMax(prompt) });
  if (!reservation.ok) {
    return Response.json({ error: reservation.reason }, { status: 402 }); // insufficient balance or cap tripped
  }

  const stream = await vendorClient.streamCompletion(prompt); // returns ReadableStream of text chunks

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      let usedTokens = 0;
      for await (const chunk of stream) {
        usedTokens += chunk.tokenCount;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.text })}\n\n`));
      }
      // 3. Reconcile: settle actual cost, refund the unused portion of the reservation
      await settleAiSpend({ reservationId: reservation.id, actualTokens: usedTokens });
      controller.close();
    },
    cancel() {
      // client disconnected mid-stream — still settle/refund on whatever was generated so far
      settleAiSpend({ reservationId: reservation.id, actualTokens: 0, aborted: true });
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
```

If using the Vercel AI SDK's `streamText`/`toDataStreamResponse` instead of hand-rolled SSE, the reserve/settle calls wrap the same way — reserve before `streamText()`, settle in `onFinish`. Hand-rolled `ReadableStream` + `text/event-stream` is shown above because it makes the reserve→stream→settle lifecycle explicit, which matters for the ledger correctness requirement.

### Pattern 2: Double-entry-flavored ledger for the token wallet

**What:** Every balance change is a row in an immutable `ledger_entries` table (append-only, one row per debit or credit with a `type` and `reference_id`), and `wallets.balance` is a denormalized cache that is only ever mutated inside the same transaction as its ledger row, via a Postgres function — never by direct client `UPDATE`. This is the pattern financial-grade systems and Postgres ledger writeups (Modern Treasury, pgledger, freeCodeCamp bank-ledger tutorial) converge on: correctness comes from the *same transaction* writing both the ledger line and the balance.
**When to use:** Every token movement in this system — PG top-up credit, AI-generation debit, paid-chapter-unlock debit, refund/reconciliation adjustments. One schema, three call sites.
**Trade-offs:** Slightly more schema/plumbing up front (one extra table, one set of RPCs) versus "just an integer column," but it is the only design that gives you: (a) an audit trail for the founder's cost-sensitivity concern (you can literally sum `ledger_entries WHERE type = 'ai_debit'` to see AI spend), (b) idempotent replay safety for PG webhooks, and (c) race-condition safety under concurrent requests.

**Schema sketch:**
```sql
create table wallets (
  user_id uuid primary key references auth.users(id),
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  amount bigint not null,                 -- positive = credit, negative = debit
  type text not null,                     -- 'topup' | 'ai_reserve' | 'ai_settle' | 'ai_refund' | 'chapter_unlock' | 'admin_adjust'
  reference_id text not null,             -- idempotency key: PG order id, generation request id, chapter id, etc.
  status text not null default 'posted',  -- 'reserved' | 'posted' | 'reversed'
  created_at timestamptz not null default now(),
  unique (reference_id, type)             -- webhook/duplicate-request idempotency
);

create index on ledger_entries (user_id, created_at desc);
```

**Atomic debit RPC (race-condition-safe):**
```sql
create or replace function debit_wallet(p_user_id uuid, p_amount bigint, p_type text, p_reference_id text)
returns table (ok boolean, new_balance bigint) as $$
declare v_balance bigint;
begin
  -- row lock prevents concurrent debits from both reading a stale balance
  select balance into v_balance from wallets where user_id = p_user_id for update;

  if v_balance < p_amount then
    return query select false, v_balance;
    return;
  end if;

  insert into ledger_entries (user_id, amount, type, reference_id)
    values (p_user_id, -p_amount, p_type, p_reference_id)
    on conflict (reference_id, type) do nothing; -- idempotent replay: no-op if already applied
  if not found then
    -- already processed this exact request before; return current balance, don't double-debit
    return query select true, v_balance;
    return;
  end if;

  update wallets set balance = balance - p_amount, updated_at = now() where user_id = p_user_id;
  select balance into v_balance from wallets where user_id = p_user_id;
  return query select true, v_balance;
end;
$$ language plpgsql security definer;
```
`SELECT ... FOR UPDATE` on the wallet row is the concurrency control: two simultaneous requests from the same user (e.g., double-click "unlock chapter", or an AI reservation racing a chapter-unlock) serialize on that row lock, so the second one sees the post-first-debit balance rather than a stale read. This is pessimistic locking, which is the right call here (per the Modern Treasury / dev.to sources) because contention per single user's own wallet is low-volume — you are never locking more than one row at a time, so it doesn't threaten throughput at MVP scale.

**Credit path (PG webhook) uses the same function shape** (`credit_wallet`) with `reference_id = pg_transaction_id`, so a webhook that Toss/PortOne redelivers (they do retry on non-200 responses) is a safe no-op the second time, not a double top-up.

### Pattern 3: Reserve → Stream → Settle for AI spend (handles unknown-cost-until-done)

**What:** You cannot know the exact token cost of an LLM call until it finishes streaming, but you must guarantee the user can't overdraw their balance mid-generation and that a single runaway request can't blow past the platform's cap. Solve this with a two-phase debit: (1) reserve a conservative worst-case amount before calling the vendor (debit now, marked `status='reserved'`), (2) after streaming completes (or the client disconnects), settle to the actual usage and refund the difference as a small credit.
**When to use:** Any metered AI call. Not needed for flat-price actions like chapter unlock (exact price known upfront — just call `debit_wallet` directly, no reserve/settle needed).
**Trade-offs:** Slight balance-display "wobble" (user sees balance drop by the max estimate, then a small refund a few seconds later) — cosmetically handle by showing "reserved" state in the GNB widget, or accept the wobble for MVP. The alternative (charge only after completion) is unsafe: a user could fire 10 concurrent generation requests with a balance that only covers 1, and by the time any of them finishes to settle, all 10 have already spent vendor tokens you can't get back.

### Pattern 4: Spend cap / circuit breaker as a pre-flight guard, checked in two places

**What:** The cap has two distinct scopes and both need a check inside `spendGuard.ts`, called at the top of `/api/ai/generate` before the vendor call:
1. **Per-user affordability** — is `wallets.balance >= estimatedCost`? (this is really just the reserve step in Pattern 3 — `debit_wallet` returning `ok:false` already covers this).
2. **Platform-wide AI budget circuit breaker** — independent of any single user's balance, is *today's/this month's total AI vendor spend* approaching the founder's cost ceiling? This needs its own aggregate counter (`spend_caps` table: `period`, `spent_amount`, `cap_amount`), incremented atomically in the same `settleAiSpend` transaction that reconciles the per-user ledger, and checked (read, not locked — a slightly stale read is acceptable here since this is a soft brake, not a correctness-critical balance) before allowing a new reservation.

**Where in the request path:** Inside the route handler, after auth/ownership checks, **before** any network call to the LLM vendor. Never in client code (trivially bypassable) and never only in a UI banner. Concretely:
```
auth check → ownership check → spendGuard.checkPlatformCap() → wallet.reserve() → vendor call → stream → settle() → spendGuard.recordSpend()
```
If the platform cap is tripped, fail closed: return 503/429 with a clear "AI temporarily unavailable, please try later" — do not silently degrade to a cheaper model unless that's an explicit product decision (out of scope for MVP per PROJECT.md, which specifies single-vendor only).
**Trade-offs:** A hard global cap risks blocking all users if traffic spikes; consider a soft warning threshold (e.g., 80% of monthly cap → Slack/email alert to founder) plus a hard stop (100% → block new generations) rather than only a binary switch. This is cheap to add (two threshold checks against the same counter) and directly serves the founder's "cost-sensitive, don't want a runaway bill" constraint from PROJECT.md.

### Pattern 5: Idempotent payment webhook handling

**What:** `/api/payments/webhook` is the only code path that credits a wallet from a real money transaction. It must: (1) verify the PG's signature/secret before trusting the payload (PortOne V2's `@portone/server-sdk` `Webhook.verify()` takes the *raw* request body string — do not `JSON.parse` before verifying, per PortOne's docs), (2) treat delivery as at-least-once (PGs retry on non-2xx) and rely on the `unique(reference_id, type)` constraint in `ledger_entries` to make replays no-ops, (3) return 200 quickly and do any slow follow-up (e.g., notification) asynchronously.
**When to use:** Every PG webhook (top-up completion, and later any refund/cancel webhook the PG sends).
**Trade-offs:** Requires reading the raw body (Next.js route handlers give you `req.text()` before parsing — fine, just don't use body-parsing middleware that consumes the stream first).

## Data Flow

### Key Data Flows

1. **AI generation:** Editor (`@`-mention) → client sends `{workId, mentionedDocIds, instruction}` → route handler resolves mentions to KB doc content → `spendGuard` + `wallet.reserve` → vendor LLM streamed → chunks piped to client via SSE → editor appends text live → on stream end, `wallet.settle` + `spendGuard.recordSpend` → final ledger entry visible in user's "결제 내역".
2. **Token top-up:** GNB `+` button → checkout route creates a PortOne/Toss payment session → user completes payment on PG's hosted page/widget → PG redirects browser back (client-side "looks done") **and independently** POSTs a webhook to `/api/payments/webhook` → webhook handler verifies signature → `credit_wallet` (idempotent) → balance now correct. The client-side redirect callback should *never* itself credit the wallet — treat it as "looks successful, awaiting webhook confirmation" and let the webhook be the source of truth, since redirect callbacks are spoofable/skippable but server-to-server webhooks (signature-verified) are not.
3. **Paid chapter unlock:** Reader clicks "다음 화 보기 (10 토큰)" → route handler calls `debit_wallet(userId, 10, 'chapter_unlock', chapterId)` → on success, insert/upsert a `purchases` row (`user_id, chapter_id`) granting permanent access → return chapter content in the same response so the UI renders immediately (per the UX doc's "흐름이 끊기지 않도록" requirement) → on `ok:false` (insufficient balance), return 402 and route the client to the top-up modal.
4. **Manual moderation:** Reader reports a chapter → `reports` row created → admin route lists pending reports → moderator action (block/unpublish) flips `chapters.status` → no async pipeline, purely synchronous CRUD.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Beta (hundreds of users) | Exactly as described above. Single Postgres instance via Supabase, no queue, no cache layer beyond Next.js RSC caching for discovery pages. |
| Low thousands of users | Watch two things first: (1) Supabase connection count under concurrent AI streaming requests holding connections open for the duration of generation — use Supabase's pooled connection string (Supavisor, transaction mode) for short queries and a **separate, minimal** direct/session-mode path only if you need long-lived transactions; keep the wallet RPC calls short (they are, by design — lock is held only for the single `UPDATE`, not for the whole streaming duration). (2) Discovery/ranking recompute job frequency — a cron every few minutes is plenty; don't compute ranking on every page view. |
| Well beyond MVP | If AI spend or traffic genuinely outgrows one Postgres instance, consider a queue (`Inngest`/Cloud Tasks) in front of the SLM moderation pipeline and BYOK multi-vendor routing — but this is explicitly out of scope per PROJECT.md and shouldn't shape MVP architecture. |

### Scaling Priorities

1. **First likely bottleneck:** DB connection exhaustion during concurrent streaming AI requests if the *reserve* step is accidentally implemented to hold a transaction open for the full stream duration. Prevention: reserve and settle are each their own short transaction (see Pattern 3); the long-lived stream itself does not hold a DB connection.
2. **Second likely bottleneck:** Vendor LLM API rate limits under beta traffic spikes (e.g., a community post drives a burst of writers). Prevention: the platform-wide spend cap (Pattern 4) doubles as a natural rate-limiting backstop; add a lightweight per-user cooldown (e.g., min interval between generations) if the vendor's own rate limits get hit in practice.

## Anti-Patterns

### Anti-Pattern 1: Splitting into microservices / separate apps for AI, wallet, and payments

**What people do:** Stand up a separate "AI service," a separate "payments service," maybe on Cloud Run or a separate Vercel project, "for scalability."
**Why it's wrong:** At solo-founder MVP scale this adds deployment surface area, cross-service auth, and network-boundary failure modes for zero benefit — the entire point of "one Next.js app + BaaS" from PROJECT.md's constraints. It also fragments the ledger's transactional guarantees across service boundaries.
**Do this instead:** Keep AI Gateway, Wallet, and Payments as **modules within the single app** (as laid out above). Module boundaries are enforced by folder structure and TypeScript interfaces, not network calls — this still gives `agy` clean, self-contained seams to implement against.

### Anti-Pattern 2: Trusting client-supplied price/amount for any wallet mutation

**What people do:** Client sends `{amount: 10}` to a generic "debit" endpoint and the server trusts it.
**Why it's wrong:** Trivially exploitable (tamper the request, get free tokens/chapters) and breaks the audit trail's meaning.
**Do this instead:** Server derives the price from the (chapter, work) DB row or the vendor's actual metered usage — the client only ever sends *intent* (which chapter, which generation request), never the amount.

### Anti-Pattern 3: Crediting the wallet from the payment redirect/return URL instead of the webhook

**What people do:** On the page the user lands on after paying, call an API to credit tokens because "the payment succeeded, the PG redirected me here."
**Why it's wrong:** Redirect-based "success" pages can be reached without a real payment (user navigates back, replays the URL, or the browser is closed before redirect but payment still completes). This is a known Korean-PG-integration footgun.
**Do this instead:** Only the signature-verified server-to-server webhook credits the wallet (Pattern 5). The redirect page may show an optimistic "processing" state and poll/refetch the balance, but never mutates it directly.

### Anti-Pattern 4: Optimistic UI balance updates without server reconciliation

**What people do:** Decrement the GNB token counter client-side immediately on button click for snappy UX, and never reconcile.
**Why it's wrong:** If the server-side debit fails (race lost, cap tripped, balance actually insufficient due to a concurrent request), the UI silently shows a wrong balance until next full reload.
**Do this instead:** Optimistic decrement is fine for perceived responsiveness, but always refetch/reconcile the true balance from the server response of the same request (the debit RPC returns `new_balance` — use it directly rather than trusting the optimistic guess).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Single LLM vendor (platform key) | Server-only SDK call from `lib/ai/vendorClient.ts`, key in server env var, never exposed to client | Isolate behind this one module so a future vendor swap or BYOK addition (v2) touches one file |
| Supabase (Postgres + Auth + Storage) | `@supabase/supabase-js` service-role client for server-side wallet/ledger RPCs; anon/session client for user-scoped reads (RLS-protected) in RSCs | Use Supabase's pooled (Supavisor transaction-mode) connection string for the app; RPC functions should be `SECURITY DEFINER` so the service role, not raw table grants, controls wallet mutation |
| Korean PG (PortOne V2 recommended over legacy 아임포트 v1, or Toss Payments directly via PortOne as the PG-abstraction layer) | Client-side PG widget/redirect for checkout UI + server-side webhook for confirmation (Pattern 5) | PortOne V2 unifies verification through one PortOne API rather than per-PG-provider calls — verify this still holds at implementation time against the current PortOne console docs, since the fetched webhook doc page 404'd during this research pass (MEDIUM confidence on exact payload shape; HIGH confidence on the webhook-is-source-of-truth pattern itself) |
| Vercel (hosting) | Node.js runtime route handlers with explicit `maxDuration`; Vercel Cron for ranking recompute | Edge runtime is gone as of Next.js 16.3 — don't plan around an edge/node split |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Studio editor (client) ↔ AI Gateway route | HTTP POST + SSE stream, same origin | No websocket needed (SSE is unidirectional and sufficient, matches the original docs' own reasoning) |
| Any feature module ↔ Wallet module | Direct function calls to `lib/wallet/ledger.ts`, which wraps Postgres RPCs | No feature module ever writes to `wallets`/`ledger_entries` directly — always through the ledger module's typed functions |
| Payment webhook route ↔ Wallet module | Same as above (`credit_wallet`) | Webhook route has no other responsibility than verify → credit → 200 |
| Admin module ↔ Content tables | Direct server actions/route handlers with a role check | No separate moderation service; manual-only per PROJECT.md v1 scope |

## Build Order Implications

Recommended phase sequencing (dependency-driven, and structured to de-risk the two highest-risk pieces — the ledger and the live PG integration — separately rather than together):

1. **Foundation:** Auth (Supabase Auth), core schema (`works`, `chapters`, `kb_docs`, `wallets`, `ledger_entries`), route group scaffolding. Nothing user-facing yet, but the ledger schema and RPCs (Pattern 2) should be built and unit-tested here with a **stubbed credit path** (an internal-only "grant test tokens" admin action, not a real charge) — this validates the race-condition-safety of `debit_wallet`/`credit_wallet` in isolation before any PG code exists.
2. **Studio core (no AI):** KB doc CRUD, editor shell, chapter draft/publish — validates the writing loop's non-AI half independently.
3. **Reader core (no payment):** Chapter viewer, simplified discovery feed, all chapters free — validates the reading loop's non-payment half independently.
4. **AI Gateway wired to the stubbed wallet:** `@`-mention prompt assembly, vendor streaming call, Pattern 1 + Pattern 3 (reserve/settle) against the wallet built in step 1. This is the riskiest *functional* piece (external API, streaming, cost control) — de-risking it against a stub wallet (test tokens) means a PG integration bug can't block AI feature validation, and vice versa.
5. **Real PG integration:** Swap the stub credit path for the real PortOne/Toss checkout + webhook (Pattern 5), behind the exact same `credit_wallet` interface built in step 1 — no changes needed to the ledger schema or the AI/chapter-unlock debit call sites.
6. **Paid chapter unlock:** Now that both the wallet (step 1) and real payments (step 5) exist, wire the reader's unlock CTA to `debit_wallet` — this is a thin feature on top of already-proven infrastructure.
7. **Spend cap / circuit breaker:** Layer Pattern 4 on top of the now-working AI Gateway + wallet — implementable as an additive guard without touching prior steps.
8. **Admin moderation surface:** Independent of everything above except auth/roles; can be built any time after step 1, but naturally last since it's lowest-risk and has no hard dependency on AI/payment code.

This order means the wallet/ledger's correctness (the hardest-to-retrofit piece) is proven with fake money before real money touches it, and the AI cost-control logic is proven against a stub before it has to coexist with live PG webhook timing.

## Sources

- [Next.js 16 blog — runtime changes](https://nextjs.org/blog/next-16)
- [Next.js 16 Route Handlers Explained (Strapi)](https://strapi.io/blog/nextjs-16-route-handlers-explained-3-advanced-usecases) — confirms `runtime='edge'` unsupported as of 16.3, Node.js is the only route handler runtime, native streaming support
- [Vercel Edge Runtime docs](https://vercel.com/docs/functions/runtimes/edge) and [Edge Functions (Deprecated)](https://vercel.com/docs/functions/runtimes/edge/edge-functions.rsc) — corroborates edge deprecation direction
- [Vercel — Functions can now run up to 30 minutes](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes) — Fluid Compute default 5 min duration, configurable maxDuration
- [Vercel AI SDK — Next.js App Router getting started](https://ai-sdk.dev/docs/getting-started/nextjs-app-router)
- [Modern Treasury — Designing Ledgers with Optimistic/Pessimistic Locking](https://www.moderntreasury.com/journal/designing-ledgers-with-optimistic-locking) — HIGH confidence, industry-standard ledger concurrency reasoning
- [The race condition a stress test found in my double-entry ledger (dev.to)](https://dev.to/xidoke/the-race-condition-a-stress-test-found-in-my-double-entry-ledger-and-how-i-fixed-it-b5o) — corroborates lost-update risk under READ COMMITTED, motivates row-level locking
- [Ledger Implementation in PostgreSQL — pgledger](https://www.pgrs.net/2025/03/24/pgledger-ledger-implementation-in-postgresql/)
- [Build a Bank Ledger in Go with Postgres (freeCodeCamp)](https://www.freecodecamp.org/news/build-a-bank-ledger-in-go-with-postgresql-using-the-double-entry-accounting-principle/) — double-entry pattern reference
- [PortOne server-sdk (JS) docs](https://portone-io.github.io/server-sdk/js/) and [GitHub — portone-io/server-sdk](https://github.com/portone-io/server-sdk/tree/main/javascript) — webhook `Webhook.verify()` raw-body requirement (MEDIUM confidence; primary gitbook webhook doc page 404'd during this research pass, re-verify at implementation time)
- `docs/4. 시스템 아키텍처 및 기술 스택.md` (project's own full-vision architecture doc) — source of the Supabase/Vercel/Zustand baseline and the deferred SLM/pgvector/subdomain items treated as candidate ideas, not MVP requirements
- `docs/5-4 통합 결제 시스템...md` (project's own UX doc) — source of the GNB shared-session/token-balance requirement and the "1-click buy now must not interrupt viewer flow" requirement reflected in the paid-chapter-unlock data flow above

---
*Architecture research for: NovelScript MVP (AI writing/reading platform + token wallet/payments)*
*Researched: 2026-08-25*
