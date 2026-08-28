import { describe, it, expect } from 'vitest';
import { substituteTitle, readCanonicalSeed, buildSeedContent } from '../../lib/kb/templates';

describe('Template substitution (lib/kb/templates.ts)', () => {
  it('substituteTitle replaces every occurrence of the title placeholder', () => {
    const raw = '# 👤 <% tp.file.title %>\n**이름**: <% tp.file.title %>';
    expect(substituteTitle(raw, '아서')).toBe('# 👤 아서\n**이름**: 아서');
  });

  it('substituteTitle returns the string unchanged when there is no placeholder (사건 case)', () => {
    const raw = '## 📌 사건 개요';
    expect(substituteTitle(raw, '아무 제목')).toBe(raw);
  });

  it('readCanonicalSeed(인물) reads the real docs/Template file and contains the placeholder', async () => {
    const content = await readCanonicalSeed('인물');
    expect(content).toContain('<% tp.file.title %>');
  });

  it('readCanonicalSeed(사건) reads the real docs/Template file and has NO placeholder', async () => {
    const content = await readCanonicalSeed('사건');
    expect(content).not.toContain('<% tp.file.title %>');
  });

  it('buildSeedContent(인물, 아서) substitutes the title and leaves no placeholder remaining', async () => {
    const content = await buildSeedContent('인물', '아서');
    expect(content).toContain('아서');
    expect(content).not.toContain('<% tp.file.title %>');
  });

  it('buildSeedContent uses an override template content instead of the canonical file when provided', async () => {
    const overrideContent = '# 🛡️ <% tp.file.title %>\ncustom override body';
    const content = await buildSeedContent('세력', '흑기사단', overrideContent);
    expect(content).toBe('# 🛡️ 흑기사단\ncustom override body');
  });
});
