export const VIEWER_COOKIE = 'ns_viewer';
export const VIEWER_COOKIE_MAX_AGE = 31536000;

export const FONTS = ['gothic', 'serif'] as const;
export const MODES = ['light', 'dark', 'system'] as const;
export const FONT_SIZES = [17, 19, 21, 24] as const;
export const PADDINGS = [16, 24, 32] as const;
export const LINE_HEIGHTS = [1.6, 1.9, 2.2] as const;

export type ViewerPreferences = {
  font: (typeof FONTS)[number];
  mode: (typeof MODES)[number];
  fontSize: (typeof FONT_SIZES)[number];
  padding: (typeof PADDINGS)[number];
  lineHeight: (typeof LINE_HEIGHTS)[number];
};

export const DEFAULT_VIEWER_PREFERENCES: ViewerPreferences = {
  font: 'gothic',
  mode: 'system',
  fontSize: 19,
  padding: 24,
  lineHeight: 1.9,
};

function pick<T extends string | number>(list: readonly T[], value: unknown, fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

/** Accepts the raw ns_viewer cookie value (URI-encoded JSON). Never throws. */
export function parseViewerPreferences(rawCookie?: string): ViewerPreferences {
  const d = DEFAULT_VIEWER_PREFERENCES;
  if (!rawCookie) return { ...d };
  let data: unknown;
  try {
    data = JSON.parse(decodeURIComponent(rawCookie));
  } catch {
    return { ...d };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ...d };
  const o = data as Record<string, unknown>;
  const mode = o.mode === 'sepia' ? 'light' : o.mode;
  return {
    font: pick(FONTS, o.font, d.font),
    mode: pick(MODES, mode, d.mode),
    fontSize: pick(FONT_SIZES, o.fontSize, d.fontSize),
    padding: pick(PADDINGS, o.padding, d.padding),
    lineHeight: pick(LINE_HEIGHTS, o.lineHeight, d.lineHeight),
  };
}

/** Cookie value only (URI-encoded JSON of exactly the 5 keys). */
export function encodeViewerPreferences(preferences: ViewerPreferences): string {
  const p = parseViewerPreferences(encodeURIComponent(JSON.stringify(preferences)));
  return encodeURIComponent(
    JSON.stringify({ font: p.font, mode: p.mode, fontSize: p.fontSize, padding: p.padding, lineHeight: p.lineHeight }),
  );
}

/** Full `document.cookie` assignment string. */
export function serializeViewerPreferences(preferences: ViewerPreferences, opts: { secure?: boolean } = {}): string {
  return `${VIEWER_COOKIE}=${encodeViewerPreferences(preferences)}; max-age=${VIEWER_COOKIE_MAX_AGE}; SameSite=Lax; Path=/${opts.secure ? '; Secure' : ''}`;
}
