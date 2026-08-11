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
    { label: "`", action: "Cycle cameras" },
    { label: "1", action: "Sun" },
    { label: "2", action: "Moon" },
    { label: "3", action: "Earth" },
    { label: "4", action: "Pad" },
    { label: "5", action: "Launchpad" },
    { label: "6", action: "Booster" },
    { label: "7", action: "Starship" },
    { label: "8", action: "Fin cam" },
    { label: "9" },
    { label: "0" },
    { label: "-" },
    { label: "=" },
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
    { label: "A", action: "Pan ←" },
    { label: "S", action: "Pan back" },
    { label: "D", action: "Pan →" },
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
    { label: "Shift", action: "+1…6 bookmark", w: 2.25 },
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

const GAP = 0.08; // key-unit gap
const ROW_GAP = 0.1;

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

/**
 * Draw the KeyMap keyboard into a 2-D canvas (device pixels).
 * White strokes / text on pure black — matches cross-section theater style.
 */
export function drawVisualKeymap(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
  rows: readonly KeyRow[] = KEYMAP_ROWS,
): void {
  const W = Math.max(1, Math.round(cssW * dpr));
  const H = Math.max(1, Math.round(cssH * dpr));
  if (ctx.canvas.width !== W || ctx.canvas.height !== H) {
    ctx.canvas.width = W;
    ctx.canvas.height = H;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const { w: boardU, h: boardH } = boardSizeUnits(rows);
  // Fit board with padding; leave a bit of bottom room for the mouse legend
  const padX = 28 * dpr;
  const padTop = 20 * dpr;
  const padBottom = 48 * dpr;
  const availW = W - padX * 2;
  const availH = H - padTop - padBottom;
  const unit = Math.min(availW / boardU, availH / boardH);
  const boardPxW = boardU * unit;
  const boardPxH = boardH * unit;
  const originX = (W - boardPxW) * 0.5;
  const originY = padTop + (availH - boardPxH) * 0.35;

  const gapPx = GAP * unit;
  const rowGapPx = ROW_GAP * unit;
  const radius = Math.max(3 * dpr, unit * 0.12);

  ctx.lineWidth = Math.max(1, 1.25 * dpr);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let y = originY;
  for (const row of rows) {
    const rowU = rowWidthUnits(row);
    let x = originX + ((boardU - rowU) * unit) * 0.5; // center short rows
    const keyH = unit;

    for (const key of row) {
      const kw = (key.w ?? 1) * unit;
      const active = Boolean(key.action);

      // Outline
      ctx.globalAlpha = active ? 1 : 0.35;
      roundRect(ctx, x, y, kw, keyH, radius);
      ctx.stroke();

      // Soft fill for bound keys so labels read
      if (active) {
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = "#fff";
        roundRect(ctx, x, y, kw, keyH, radius);
        ctx.fill();
      }

      ctx.globalAlpha = active ? 1 : 0.4;
      ctx.fillStyle = "#fff";

      const hasAction = Boolean(key.action);
      const labelSize = Math.min(unit * 0.28, kw * 0.22) / (hasAction ? 1 : 1);
      const actionSize = Math.min(unit * 0.155, kw * 0.14);

      if (hasAction) {
        ctx.font = `600 ${labelSize}px ui-monospace, "Cascadia Code", Menlo, monospace`;
        ctx.fillText(key.label, x + kw * 0.5, y + keyH * 0.34);
        ctx.globalAlpha = 0.85;
        ctx.font = `500 ${actionSize}px "Segoe UI", system-ui, sans-serif`;
        // Wrap long actions lightly by shrinking
        const act = key.action!;
        ctx.fillText(act, x + kw * 0.5, y + keyH * 0.68, kw - 6 * dpr);
      } else {
        ctx.font = `600 ${labelSize}px ui-monospace, "Cascadia Code", Menlo, monospace`;
        ctx.fillText(key.label, x + kw * 0.5, y + keyH * 0.5);
      }

      x += kw + gapPx;
    }
    y += keyH + rowGapPx;
  }

  // Mouse legend under the board
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#fff";
  ctx.font = `500 ${11 * dpr}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(
    "Mouse · left-drag orbit  ·  right-drag pan  ·  scroll zoom   ·   double-tap 1–5 frame",
    W * 0.5,
    H - padBottom * 0.45,
  );
  ctx.globalAlpha = 1;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
