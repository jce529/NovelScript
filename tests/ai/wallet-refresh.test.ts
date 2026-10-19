import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createWalletRefreshController, shouldRefreshWalletAfterChat, type WalletLoadResult, type WalletStatusState,
} from '@/lib/ai/wallet-refresh';
import { resolveChatOutcome } from '@/lib/ai/chat-request';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const ok = (balance: number, recentDebit = 0): WalletLoadResult => ({ ok: true, balance, recentDebit });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const pending: ReturnType<typeof deferred<WalletLoadResult>>[] = [];
  const load = vi.fn(() => { const d = deferred<WalletLoadResult>(); pending.push(d); return d.promise; });
  const applied: WalletStatusState[] = [];
  const controller = createWalletRefreshController({ load, apply: (s) => applied.push(s) });
  return { pending, load, applied, controller };
}

describe('wallet refresh controller', () => {
  it('mount / workId / retry show loading then the result; focus / settled / regenerate refresh silently', async () => {
    for (const trigger of ['mount', 'workId', 'retry'] as const) {
      const t = setup();
      const p = t.controller.refresh(trigger);
      t.pending[0].resolve(ok(10, 2));
      await p;
      expect(t.applied).toEqual([{ kind: 'loading' }, { kind: 'ok', balance: 10, recentDebit: 2 }]);
    }
    for (const trigger of ['focus', 'settled', 'regenerate'] as const) {
      const t = setup();
      const p = t.controller.refresh(trigger);
      t.pending[0].resolve(ok(7));
      await p;
      expect(t.applied).toEqual([{ kind: 'ok', balance: 7, recentDebit: 0 }]);
    }
  });

  it('applies only the latest request when responses complete out of order', async () => {
    const t = setup();
    const first = t.controller.refresh('mount');
    const second = t.controller.refresh('focus');
    expect(t.load).toHaveBeenCalledTimes(2);
    t.pending[1].resolve(ok(200));
    await second;
    t.pending[0].resolve(ok(100));
    await first;
    expect(t.applied.filter((s) => s.kind === 'ok')).toEqual([{ kind: 'ok', balance: 200, recentDebit: 0 }]);
  });

  it('applies nothing after dispose (unmount / workId change) and refuses new refreshes', async () => {
    const t = setup();
    const p = t.controller.refresh('mount');
    t.controller.dispose();
    t.pending[0].resolve(ok(5));
    await p;
    expect(t.applied).toEqual([{ kind: 'loading' }]);
    await t.controller.refresh('focus');
    expect(t.load).toHaveBeenCalledTimes(1);
    expect(t.controller.disposed).toBe(true);
  });

  it('turns a failed or thrown load into an error state, never a zero balance', async () => {
    const t = setup();
    const a = t.controller.refresh('settled');
    t.pending[0].resolve({ ok: false, error: '읽기 실패' });
    await a;
    const b = t.controller.refresh('settled');
    t.pending[1].reject(new Error('network'));
    await b;
    expect(t.applied).toEqual([{ kind: 'error', error: '읽기 실패' }, { kind: 'error', error: '지갑 잔액을 불러오지 못했어요.' }]);
    expect(t.applied.some((s) => s.kind === 'ok')).toBe(false);
  });
});

describe('shouldRefreshWalletAfterChat', () => {
  it('re-reads after success, response loss, and notices that carry refreshBalance', () => {
    expect(shouldRefreshWalletAfterChat(null)).toBe(true);
    expect(shouldRefreshWalletAfterChat(resolveChatOutcome({ ok: true, status: 'completed', reply: 'x' }))).toBe(true);
    expect(shouldRefreshWalletAfterChat(resolveChatOutcome({ ok: true, status: 'completed', reply: 'x', remainingBalance: 3 }))).toBe(true);
    expect(shouldRefreshWalletAfterChat(resolveChatOutcome({ ok: false, status: 'already_processed' }))).toBe(true);
  });

  it('does not re-read for failures that never touched the wallet', () => {
    expect(shouldRefreshWalletAfterChat(resolveChatOutcome({ ok: false, status: 'failed', failureKind: 'unavailable' }))).toBe(false);
  });
});

describe('panel and modal wiring (static, no provider/ledger access)', () => {
  const dir = 'app/studio/[workId]/chapters/[chapterId]/ai-panel';
  const panel = readFileSync(`${dir}/AiPanel.tsx`, 'utf8');
  const modal = readFileSync(`${dir}/SaveDocumentPlanModal.tsx`, 'utf8');

  it('AiPanel reads the wallet on mount/workId, focus, retry and after every settled attempt', () => {
    expect(panel).toContain('loadAiWalletStatusAction');
    expect(panel).toMatch(/refreshWallet\('mount'\)/);
    expect(panel).toMatch(/addEventListener\('focus'/);
    expect(panel).toMatch(/\[workId\]/);
    expect(panel).toMatch(/refreshWallet\('retry'\)/);
    expect((panel.match(/refreshWallet\('settled'\)/g) ?? []).length).toBe(3);
    expect(panel).toContain('onWalletRefresh={() => refreshWallet(\'regenerate\')}');
    expect(panel).toContain('<WalletBalanceGauge keySource={keySource}');
  });

  it('modal calls onWalletRefresh on both the resolve and the throw path of regeneration', () => {
    expect((modal.match(/onWalletRefresh\?\.\(\)/g) ?? []).length).toBe(2);
  });

  it('refresh code adds no provider send, new idempotency key or ledger write', () => {
    const lib = readFileSync('lib/ai/wallet-refresh.ts', 'utf8') + readFileSync('lib/ai/wallet-status.ts', 'utf8');
    expect(lib).not.toMatch(/chatAction|randomUUID|\.rpc\(|\.insert\(|\.update\(|\.upsert\(|createAdminClient/);
  });
});
