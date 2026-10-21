import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// 16-02: AST guard for the mobile wiring of the shared studio shell (layout + two editor pages).
// Pure source checks: no DOM, no DB. Real tab/mount behaviour is verified in 16-03.

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}

function tagName(el: ts.JsxOpeningLikeElement): string {
  return el.tagName.getText();
}

function attrString(el: ts.JsxOpeningLikeElement, name: string): string | null {
  for (const a of el.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === name && a.initializer && ts.isStringLiteral(a.initializer)) {
      return a.initializer.text;
    }
  }
  return null;
}

function openings(sf: ts.SourceFile): ts.JsxOpeningLikeElement[] {
  const out: ts.JsxOpeningLikeElement[] = [];
  walk(sf, (n) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) out.push(n);
  });
  return out;
}

function countTag(sf: ts.SourceFile, name: string): number {
  return openings(sf).filter((o) => tagName(o) === name).length;
}

/** Names of JSX attributes' initializer subtree that contain a <StudioPane pane="x">. */
function panesInAttr(sf: ts.SourceFile, component: string, attr: string): string[] {
  const panes: string[] = [];
  for (const o of openings(sf)) {
    if (tagName(o) !== component) continue;
    for (const a of o.attributes.properties) {
      if (!ts.isJsxAttribute(a) || a.name.getText() !== attr || !a.initializer) continue;
      walk(a.initializer, (n) => {
        if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && tagName(n) === 'StudioPane') {
          const p = attrString(n, 'pane');
          if (p) panes.push(p);
        }
      });
    }
  }
  return panes;
}

function usesIdentifier(sf: ts.SourceFile, name: string): boolean {
  let found = false;
  walk(sf, (n) => {
    if (ts.isIdentifier(n) && n.text === name) found = true;
  });
  return found;
}

/** notifyInsert() called inside function insertTextAtCursor, after the read-only guard. */
function insertNotifies(sf: ts.SourceFile): boolean {
  let ok = false;
  walk(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === 'insertTextAtCursor' && n.body) {
      let calls = false;
      walk(n.body, (c) => {
        if (ts.isCallExpression(c) && c.expression.getText() === 'notifyInsert') calls = true;
      });
      ok = calls;
    }
  });
  return ok;
}

/** True when a tab-derived value drives a conditional render or a key. */
function tabDerivedRender(sf: ts.SourceFile): boolean {
  let bad = false;
  walk(sf, (n) => {
    if (ts.isJsxAttribute(n) && n.name.getText() === 'key' && n.initializer?.getText().includes('activePane')) bad = true;
    if (ts.isConditionalExpression(n) || ts.isBinaryExpression(n) || ts.isIfStatement(n)) {
      const t = ts.isIfStatement(n) ? n.expression.getText() : ts.isConditionalExpression(n) ? n.condition.getText() : n.left.getText();
      if (t.includes('activePane')) bad = true;
    }
  });
  return bad;
}

function layoutProblems(source: string): string[] {
  const sf = parse(source);
  const p: string[] = [];
  if (countTag(sf, 'details') > 0) p.push('legacy details present');
  if (countTag(sf, 'StudioSidebar') !== 1) p.push('StudioSidebar must be passed exactly once');
  if (countTag(sf, 'StudioWorkspace') !== 1) p.push('StudioWorkspace missing');
  if (countTag(sf, 'StudioMobileNavigation') !== 1) p.push('StudioMobileNavigation missing');
  if (countTag(sf, 'StudioStage') !== 1) p.push('StudioStage missing');
  const treePanes = openings(sf).filter((o) => tagName(o) === 'StudioPane' && attrString(o, 'pane') === 'tree');
  if (treePanes.length !== 1) p.push('tree pane must appear once');
  if (tabDerivedRender(sf)) p.push('tab-derived conditional render');
  return p;
}

function pageProblems(source: string): string[] {
  const sf = parse(source);
  const p: string[] = [];
  if (countTag(sf, 'StudioEditorPanels') !== 1) p.push('StudioEditorPanels missing');
  if (!panesInAttr(sf, 'StudioEditorPanels', 'editor').includes('write')) p.push('editor not in write pane');
  if (!panesInAttr(sf, 'StudioEditorPanels', 'toolbar').includes('write')) p.push('toolbar not in write pane');
  if (!panesInAttr(sf, 'StudioEditorPanels', 'ai').includes('ai')) p.push('AiPanel not in ai pane');
  if (!insertNotifies(sf)) p.push('insert does not notify');
  if (usesIdentifier(sf, 'activePane')) p.push('page reads activePane');
  if (tabDerivedRender(sf)) p.push('tab-derived conditional render');
  return p;
}

const LAYOUT = 'app/studio/[workId]/layout.tsx';
const PAGES = ['app/studio/[workId]/chapters/[chapterId]/page.tsx', 'app/studio/[workId]/kb/[nodeId]/page.tsx'];

describe('studio layout mobile wiring', () => {
  it('has the provider, nav, single sidebar slot and tree pane; no legacy details', () => {
    expect(layoutProblems(read(LAYOUT))).toEqual([]);
  });

  it('keeps the server auth gate and both KbTree scopes (no forced merge)', () => {
    const src = read(LAYOUT);
    expect(src).toContain("redirect('/login')");
    expect(src).not.toContain("'use client'");
    expect(countTag(parse(src), 'KbTree')).toBeGreaterThanOrEqual(3);
  });

  it('rejects a layout that keeps the legacy details or a second sidebar', () => {
    const bad = `export default function L(){ return <StudioPanelProvider><StudioWorkspace>
      <details><summary>x</summary>{sidebar}</details>
      <StudioSidebar>{sidebar}</StudioSidebar><StudioSidebar>{sidebar}</StudioSidebar>
      <StudioPane pane="tree">{sidebar}</StudioPane><StudioStage>{children}</StudioStage>
      <StudioMobileNavigation /></StudioWorkspace></StudioPanelProvider>; }`;
    const problems = layoutProblems(bad);
    expect(problems).toContain('legacy details present');
    expect(problems).toContain('StudioSidebar must be passed exactly once');
  });
});

describe.each(PAGES)('editor page mobile wiring: %s', (rel) => {
  it('routes editor/toolbar/ai through always-mounted panes and notifies on insert', () => {
    expect(pageProblems(read(rel))).toEqual([]);
  });

  it('keeps the loaded / provider guard and the document identity key', () => {
    const src = read(rel);
    expect(src).toMatch(/defaultProviderModel/);
    expect(src).toMatch(/<AiPanel\s+key=\{(chapterId|nodeId)\}/);
  });
});

describe('guard negatives', () => {
  const good = read(PAGES[0]);

  it('rejects an ai pane rendered only for the active tab', () => {
    const bad = good.replace(
      '<StudioPane pane="ai">',
      '{activePane === \'ai\' && <StudioPane pane="ai">'
    );
    expect(usesIdentifier(parse(bad), 'activePane')).toBe(true);
    const fixture = `function P(){ const { activePane } = useStudioWorkspace();
      return <StudioEditorPanels editor={<StudioPane pane="write">e</StudioPane>} toolbar={<StudioPane pane="write">t</StudioPane>}
      ai={activePane === 'ai' ? <StudioPane pane="ai"><AiPanel key={id} /></StudioPane> : undefined} />; }`;
    const problems = pageProblems(fixture);
    expect(problems).toContain('page reads activePane');
    expect(problems).toContain('tab-derived conditional render');
  });

  it('rejects a tab-derived key and a missing insert notification', () => {
    const fixture = `function insertTextAtCursor(t:string){ onEdit(t); }
      function P(){ return <StudioEditorPanels key={activePane} editor={<StudioPane pane="write" />} toolbar={<StudioPane pane="write" />} ai={<StudioPane pane="ai" />} />; }`;
    const problems = pageProblems(fixture);
    expect(problems).toContain('insert does not notify');
    expect(problems).toContain('tab-derived conditional render');
  });

  it('rejects a page without the write pane for the editor', () => {
    const fixture = `function insertTextAtCursor(t:string){ onEdit(t); notifyInsert(); }
      function P(){ return <StudioEditorPanels editor={<div />} toolbar={<StudioPane pane="write" />} ai={<StudioPane pane="ai" />} />; }`;
    expect(pageProblems(fixture)).toContain('editor not in write pane');
  });
});
