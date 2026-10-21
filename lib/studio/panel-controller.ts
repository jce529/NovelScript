/**
 * Pure desktop panel controller for the studio three-panel layout (plan 02-11).
 *
 * No React/DOM. The React shell consumes `presentPanels` for visibility and aria attributes.
 * Collapsing only flips `visible`; the editor/AI slot descriptors keep their identity, and
 * `slotCommands` never emits mount/unmount commands for a toggle.
 */

export type PanelSide = 'left' | 'right';
export type StudioSurface = 'sidebar' | 'editor' | 'ai';

export interface PanelState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

export type PanelAction = { type: 'toggle'; side: PanelSide } | { type: 'set'; side: PanelSide; collapsed: boolean };

export const INITIAL_PANEL_STATE: PanelState = { leftCollapsed: false, rightCollapsed: false };

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  const key = action.side === 'left' ? 'leftCollapsed' : 'rightCollapsed';
  const next = action.type === 'toggle' ? !state[key] : action.collapsed;
  if (next === state[key]) return state;
  return { ...state, [key]: next };
}

export interface SlotDescriptor {
  slot: 'editor' | 'ai';
  resourceKey: string;
}

export interface PanelMeta {
  resourceKey: string | null;
  hasAi: boolean;
}

export interface PanelPresentation {
  visible: boolean;
  ariaExpanded: boolean;
  /** Show the narrow vertical strip with the reopen button. */
  showStrip: boolean;
  /** Mounted in the tree (always true when the panel exists; collapse never unmounts). */
  mounted: boolean;
}

export interface PanelsPresentation {
  left: PanelPresentation;
  /** `null` when there is no AI panel (load / default-template mode): no empty strip. */
  right: PanelPresentation | null;
  editor: SlotDescriptor | null;
  ai: SlotDescriptor | null;
}

const descriptorCache = new Map<string, SlotDescriptor>();

function descriptor(slot: 'editor' | 'ai', resourceKey: string): SlotDescriptor {
  const cacheKey = `${slot}:${resourceKey}`;
  let d = descriptorCache.get(cacheKey);
  if (!d) {
    d = Object.freeze({ slot, resourceKey });
    descriptorCache.set(cacheKey, d);
  }
  return d;
}

function side(collapsed: boolean): PanelPresentation {
  return { visible: !collapsed, ariaExpanded: !collapsed, showStrip: collapsed, mounted: true };
}

export function presentPanels(state: PanelState, meta: PanelMeta): PanelsPresentation {
  return {
    left: side(state.leftCollapsed),
    right: meta.hasAi ? side(state.rightCollapsed) : null,
    editor: meta.resourceKey === null ? null : descriptor('editor', meta.resourceKey),
    ai: meta.resourceKey !== null && meta.hasAi ? descriptor('ai', meta.resourceKey) : null,
  };
}

export type SlotCommand =
  | { type: 'mount'; slot: 'editor' | 'ai'; resourceKey: string }
  | { type: 'unmount'; slot: 'editor' | 'ai'; resourceKey: string };

/** Commands needed to go from one presentation to another. Toggles produce none. */
export function slotCommands(prev: PanelsPresentation, next: PanelsPresentation): SlotCommand[] {
  const out: SlotCommand[] = [];
  for (const slot of ['editor', 'ai'] as const) {
    const a = prev[slot];
    const b = next[slot];
    if (a === b) continue;
    if (a) out.push({ type: 'unmount', slot, resourceKey: a.resourceKey });
    if (b) out.push({ type: 'mount', slot, resourceKey: b.resourceKey });
  }
  return out;
}

/** Arrow glyphs: collapse button points toward the edge, reopen strip points back into the page. */
export function panelGlyphs(sideName: PanelSide): { collapse: string; expand: string } {
  return sideName === 'left'
    ? { collapse: '«', expand: '»' }
    : { collapse: '»', expand: '«' };
}

export function panelLabels(sideName: PanelSide): { collapse: string; expand: string } {
  const name = sideName === 'left' ? '문서 목록' : 'AI 패널';
  return { collapse: `${name} 접기`, expand: `${name} 펼치기` };
}
