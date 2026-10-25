import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Phase 16 BUG-04: below lg the studio shell sits under the 56px site header and the stage must
// scroll inside it, otherwise the bottom tab bar drifts off-screen / into the page content.
const layout = readFileSync('app/studio/[workId]/layout.tsx', 'utf8');
const stage = readFileSync('components/studio/workspace/StudioStage.tsx', 'utf8');

describe('studio mobile shell layout (BUG-04)', () => {
  it('subtracts the site header from the viewport height and clips overflow below lg', () => {
    const shell = layout.match(/<div className="(flex h-\[calc\(100dvh-3\.5rem\)\][^"]*)"/)?.[1] ?? '';
    expect(shell).toContain('max-lg:overflow-hidden');
    expect(shell).toContain('lg:h-auto');
    expect(layout).not.toMatch(/flex h-dvh min-h-0 flex-col/);
  });

  it('gives the stage wrapper a definite height below lg so <main> can scroll itself', () => {
    expect(stage).toContain('relative min-h-0 min-w-0 flex-1 max-lg:h-full');
    expect(stage).toContain('max-lg:h-full max-lg:overflow-y-auto');
  });
});
