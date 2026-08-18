/**
 * Full-bleed visual KeyMap: white line keyboard on black, with the app action
 * under each keycap. Pure canvas draw — no DOM keys.
 */

export type KeyCap = {
  /** Glyph on the key (letter / symbol / name). */
  label: string;
  /** App action shown under the glyph; omit for unbound keys. */
  action?: string;
  /** Width in key units (1 = standard letter key). */
  w?: number;
};

/** One keyboard row left → right. */
export type KeyRow = readonly KeyCap[];

/**
 * Compact US-ish layout of keys that matter in this theater.
 * Unbound keys still render (outline only) so the board reads as a keyboard.
 */
export const KEYMAP_ROWS: readonly KeyRow[] = [
  [
    { label: "`" },
    { label: "1", action: "Bookmark" },
    { label: "2", action: "Bookmark" },
    { label: "3", action: "Bookmark" },
    { label: "4", action: "Bookmark" },
    { label: "5", action: "Bookmark" },
    { label: "6", action: "Bookmark" },
    { label: "7" },
    { label: "8" },
    { label: "9" },
    { label: "0" },
    { label: "-", action: "Prev camera" },
    { label: "=", action: "Next camera" },
    { label: "⌫", w: 1.5 },
  ],
  [
    { label: "Tab", action: "Dashboards", w: 1.5 },
    { label: "Q", action: "Yaw ←" },
    { label: "W", action: "Pan fwd" },
    { label: "E", action: "Yaw →" },
    { label: "R", action: "Pitch ↑" },
    { label: "T" },
    { label: "Y" },
    { label: "U" },
    { label: "I" },
    { label: "O", action: "Orbits" },
    { label: "P" },
    { label: "[" },
    { label: "]" },
    { label: "\\", w: 1.5 },
  ],
  [
    { label: "Caps", w: 1.75 },
    { label: "A", action: "Pan →" },
    { label: "S", action: "Pan back" },
    { label: "D", action: "Pan ←" },
    { label: "F", action: "Pitch ↓" },
    { label: "G", action: "Auto-cam" },
    { label: "H", action: "HUD" },
    { label: "J" },
    { label: "K", action: "KeyMap" },
    { label: "L", action: "Labels" },
    { label: ";" },
    { label: "'" },
    { label: "Enter", w: 1.75 },
  ],
  [
    { label: "Shift", w: 2.25 },
    { label: "Z", action: "Zoom in" },
    { label: "X", action: "Zoom out" },
    { label: "C", action: "Roll ←" },
    { label: "V", action: "Roll →" },
    { label: "B" },
    { label: "N" },
    { label: "M", action: "Metrics" },
    { label: "," , action: "Slower" },
    { label: ".", action: "Faster" },
    { label: "/" },
    { label: "Shift", w: 2.25 },
  ],
  [
    { label: "Ctrl", w: 1.5 },
    { label: "Alt", w: 1.25 },
    { label: "Space", action: "Play / pause", w: 6.5 },
    { label: "Alt", w: 1.25 },
    { label: "Ctrl", w: 1.5 },
    { label: "Esc", action: "Close", w: 1.5 },
  ],
];

export const GAP = 0.08; // key-unit gap
export const ROW_GAP = 0.1;

/** Total width in key units for a row (keys + gaps). */
export function rowWidthUnits(row: KeyRow): number {
  let w = 0;
  for (let i = 0; i < row.length; i++) {
    w += row[i]!.w ?? 1;
    if (i < row.length - 1) w += GAP;
  }
  return w;
}

/** Board width = widest row; height = rows + gaps. */
export function boardSizeUnits(rows: readonly KeyRow[] = KEYMAP_ROWS): {
  w: number;
  h: number;
} {
  let maxW = 0;
  for (const row of rows) maxW = Math.max(maxW, rowWidthUnits(row));
  const h = rows.length + Math.max(0, rows.length - 1) * ROW_GAP;
  return { w: maxW, h };
}
