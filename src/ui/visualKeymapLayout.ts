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
  /**
   * Height in key units. Below 1, the key stacks above the next key in the
   * row instead of taking its own column. Esc is 0.5, above `` ` ``.
   */
  h?: number;
};

/** One keyboard row left → right. */
export type KeyRow = readonly KeyCap[];

/**
 * Compact US-ish layout of keys that matter in this theater.
 * Unbound keys still render (outline only) so the board reads as a keyboard.
 */
export const KEYMAP_ROWS: readonly KeyRow[] = [
  [
    { label: "Esc", action: "Close", h: 0.5 },
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
    { label: "0", action: "t minus 5" },
    { label: "-", action: "Slower" },
    { label: "+", action: "Faster" },
    { label: "⌫", w: 1.5 },
  ],
  [
    { label: "Tab", action: "Dashboards", w: 1.5 },
    { label: "Q", action: "Yaw ←" },
    { label: "W", action: "Pan fwd" },
    { label: "E", action: "Yaw →" },
    { label: "R", action: "Pitch ↑" },
    { label: "T", action: "Pan ↑" },
    { label: "Y" },
    { label: "U" },
    { label: "I" },
    { label: "O", action: "Toggle Orbits" },
    { label: "P", action: "Play / pause" },
    { label: "[", action: "Prev camera" },
    { label: "]", action: "Next camera" },
    { label: "\\", action: "Toggle Auto-camera", w: 1.5 },
  ],
  [
    { label: "Caps", w: 1.75 },
    { label: "A", action: "Pan ←" },
    { label: "S", action: "Pan back" },
    { label: "D", action: "Pan →" },
    { label: "F", action: "Pitch ↓" },
    { label: "G" },
    { label: "H", action: "Help" },
    { label: "J" },
    { label: "K", action: "KeyMap" },
    { label: "L", action: "Toggle Labels" },
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
    { label: "B", action: "Pan ↓" },
    { label: "N" },
    { label: "M", action: "Menu" },
    { label: "," },
    { label: "." },
    { label: "/" },
    { label: "Shift", w: 2.25 },
  ],
  [
    { label: "Ctrl", w: 1.5 },
    { label: "Alt", w: 1.25 },
    { label: "Space", action: "Play / pause", w: 6.5 },
    { label: "Alt", w: 1.25 },
    { label: "Ctrl", w: 1.5 },
  ],
  [
    { label: "←", action: "Back 1 s" },
    { label: "→", action: "Forward 1 s" },
  ],
];

/**
 * Copy rows, replacing digit-key captions.
 * A missing caption clears a generic "Bookmark" label on that key.
 */
export function rowsWithDigitActions(
  actionForDigit: (digit: number) => string | undefined,
  rows: readonly KeyRow[] = KEYMAP_ROWS,
): KeyRow[] {
  return rows.map((row) => row.map((key) => digitKeyWithAction(key, actionForDigit)));
}

function digitKeyWithAction(
  key: KeyCap,
  actionForDigit: (digit: number) => string | undefined,
): KeyCap {
  if (key.label.length !== 1 || key.label < "0" || key.label > "9") return key;
  const action = actionForDigit(Number(key.label));
  if (!action) return key.w != null ? { label: key.label, w: key.w } : { label: key.label };
  return { ...key, action };
}

export const GAP = 0.08; // key-unit gap
export const ROW_GAP = 0.1;

/** One key's position in a row, in key units from the row's left edge. */
export type KeySlot = { x: number; w: number };

export type LegendAlign = "left" | "center" | "right";

/**
 * Tab, Caps, and the left Shift print on the left of the cap.
 * Backslash, Enter, Backspace, and the right Shift print on the right.
 * `trailing` distinguishes the two Shift keys.
 */
export function keyLegendAlign(label: string, trailing = false): LegendAlign {
  if (label === "Tab" || label === "Caps") return "left";
  if (label === "Shift") return trailing ? "right" : "left";
  if (label === "\\" || label === "Enter" || label === "⌫") return "right";
  return "center";
}

/** True when the key takes a column. Half-height keys stack above the next one. */
function inlineKey(key: KeyCap): boolean {
  return (key.h ?? 1) >= 1;
}

/** Total width in key units for a row (inline keys + gaps). Half-height keys add none. */
export function rowWidthUnits(row: KeyRow): number {
  let w = 0;
  let seen = 0;
  for (const key of row) {
    if (!inlineKey(key)) continue;
    if (seen > 0) w += GAP;
    w += key.w ?? 1;
    seen++;
  }
  return w;
}

/**
 * Extra height above a row for stacked keys, including the gap under them.
 * Zero when every key is full height.
 */
export function rowLiftUnits(row: KeyRow): number {
  let h = 0;
  for (const key of row) {
    const kh = key.h ?? 1;
    if (kh < 1) h = Math.max(h, kh);
  }
  return h > 0 ? h + ROW_GAP : 0;
}

/**
 * Lay a row out from x = 0 so Tab, Caps, and Shift share the left edge.
 * Spare width goes to Space, or to the last key, so the row ends at `boardW`.
 */
export function rowKeySlots(row: KeyRow, boardW: number): KeySlot[] {
  const slack = Math.max(0, boardW - rowWidthUnits(row));
  const growAt = slackKeyIndex(row);
  const slots: KeySlot[] = row.map(() => ({ x: 0, w: 1 }));
  placeInlineSlots(row, slots, slack, growAt);
  copyStackedSlots(row, slots);
  return slots;
}

function placeInlineSlots(
  row: KeyRow,
  slots: KeySlot[],
  slack: number,
  growAt: number,
): void {
  const inlineCount = row.filter(inlineKey).length;
  let x = 0;
  let placed = 0;
  for (let i = 0; i < row.length; i++) {
    const key = row[i]!;
    if (!inlineKey(key)) continue;
    const w = (key.w ?? 1) + (i === growAt ? slack : 0);
    slots[i] = { x, w };
    x += w;
    placed++;
    if (placed < inlineCount) x += GAP;
  }
}

/** A half-height key shares the column of the next full key (Esc sits on `` ` ``). */
function copyStackedSlots(row: KeyRow, slots: KeySlot[]): void {
  for (let i = 0; i < row.length; i++) {
    if (inlineKey(row[i]!)) continue;
    const host = nextInlineIndex(row, i);
    slots[i] = host >= 0 ? { ...slots[host]! } : { x: 0, w: row[i]!.w ?? 1 };
  }
}

function nextInlineIndex(row: KeyRow, from: number): number {
  for (let i = from + 1; i < row.length; i++) {
    if (inlineKey(row[i]!)) return i;
  }
  return -1;
}

/** Space absorbs a short bottom row; every other row grows its right-hand key. */
function slackKeyIndex(row: KeyRow): number {
  const space = row.findIndex((key) => key.label === "Space" && inlineKey(key));
  if (space >= 0) return space;
  for (let i = row.length - 1; i >= 0; i--) {
    if (inlineKey(row[i]!)) return i;
  }
  return 0;
}

/** Board width = widest row; height = rows, gaps, and any half-key stack. */
export function boardSizeUnits(rows: readonly KeyRow[] = KEYMAP_ROWS): {
  w: number;
  h: number;
} {
  let maxW = 0;
  let h = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    maxW = Math.max(maxW, rowWidthUnits(row));
    h += rowLiftUnits(row) + 1;
    if (i < rows.length - 1) h += ROW_GAP;
  }
  return { w: maxW, h };
}
