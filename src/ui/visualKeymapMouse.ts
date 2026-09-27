/**
 * Top-view mouse beside the KeyMap. Left button, right button, and wheel
 * carry the drag / scroll actions — no separate caption line.
 */

export const MOUSE_LEFT_ACTION = "Orbit";
export const MOUSE_RIGHT_ACTION = "Pan";
export const MOUSE_WHEEL_ACTION = "Zoom";

const MOUSE_LEFT_HINT = "drag";
const MOUSE_RIGHT_HINT = "drag";
const MOUSE_WHEEL_HINT = "scroll";

/** Draw a white line mouse in the given box (device pixels). */
export function drawKeymapMouse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dpr: number,
): void {
  if (w < 8 || h < 8) return;
  const body = traceMouseBody(ctx, x, y, w, h);
  ctx.lineWidth = Math.max(1, 1.25 * dpr);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.06;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
  strokeMouseSeams(ctx, body);
  strokeMouseWheel(ctx, body, dpr);
  labelMouse(ctx, body, dpr);
  ctx.globalAlpha = 1;
}

type MouseBody = {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  seamY: number;
  wheelX: number;
  wheelY: number;
  wheelW: number;
  wheelH: number;
};

function traceMouseBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): MouseBody {
  ctx.beginPath();
  ctx.moveTo(x + w * 0.08, y + h * 0.22);
  ctx.quadraticCurveTo(x + w * 0.05, y + h * 0.02, x + w * 0.5, y + h * 0.01);
  ctx.quadraticCurveTo(x + w * 0.95, y + h * 0.02, x + w * 0.92, y + h * 0.22);
  ctx.lineTo(x + w * 0.97, y + h * 0.58);
  ctx.quadraticCurveTo(x + w * 1.01, y + h * 0.9, x + w * 0.5, y + h * 0.985);
  ctx.quadraticCurveTo(x - w * 0.01, y + h * 0.9, x + w * 0.03, y + h * 0.58);
  ctx.closePath();
  return {
    x, y, w, h,
    cx: x + w * 0.5,
    seamY: y + h * 0.4,
    wheelX: x + w * 0.43,
    wheelY: y + h * 0.2,
    wheelW: w * 0.14,
    wheelH: h * 0.26,
  };
}

function strokeMouseSeams(ctx: CanvasRenderingContext2D, body: MouseBody): void {
  const { x, w, cx, seamY, wheelX, wheelY, wheelW, wheelH } = body;
  const top = body.y + body.h * 0.06;
  const left = x + w * 0.1;
  const right = x + w * 0.9;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx, wheelY);
  ctx.moveTo(cx, wheelY + wheelH);
  ctx.lineTo(cx, seamY);
  ctx.moveTo(left, seamY);
  ctx.lineTo(wheelX, seamY);
  ctx.moveTo(wheelX + wheelW, seamY);
  ctx.lineTo(right, seamY);
  ctx.stroke();
}

function strokeMouseWheel(
  ctx: CanvasRenderingContext2D,
  body: MouseBody,
  dpr: number,
): void {
  const { wheelX, wheelY, wheelW, wheelH } = body;
  roundMouseRect(ctx, wheelX, wheelY, wheelW, wheelH, wheelW * 0.45);
  ctx.stroke();
  const ridge = Math.max(1, dpr);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const ry = wheelY + wheelH * (0.62 + i * 0.1);
    ctx.moveTo(wheelX + wheelW * 0.22, ry);
    ctx.lineTo(wheelX + wheelW * 0.78, ry);
  }
  ctx.lineWidth = ridge;
  ctx.stroke();
}

function labelMouse(
  ctx: CanvasRenderingContext2D,
  body: MouseBody,
  dpr: number,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  const buttonW = body.w * 0.32;
  labelControl(
    ctx,
    MOUSE_LEFT_ACTION,
    MOUSE_LEFT_HINT,
    body.x + body.w * 0.27,
    body.y + body.h * 0.2,
    buttonW,
    dpr,
  );
  labelControl(
    ctx,
    MOUSE_RIGHT_ACTION,
    MOUSE_RIGHT_HINT,
    body.x + body.w * 0.73,
    body.y + body.h * 0.2,
    buttonW,
    dpr,
  );
  labelControl(
    ctx,
    MOUSE_WHEEL_ACTION,
    MOUSE_WHEEL_HINT,
    body.cx,
    body.wheelY + body.wheelH * 0.42,
    Math.max(body.wheelW * 2.4, 48 * dpr),
    dpr,
  );
}

function fittedSize(text: string, maxW: number, maxSize: number, minSize: number): number {
  const natural = maxW / Math.max(1, text.length * 0.56);
  return Math.max(minSize, Math.min(maxSize, natural));
}

function labelControl(
  ctx: CanvasRenderingContext2D,
  action: string,
  hint: string,
  cx: number,
  cy: number,
  maxW: number,
  dpr: number,
): void {
  const actionSize = fittedSize(action, maxW, 26 * dpr, 8 * dpr);
  const hintSize = fittedSize(hint, maxW, actionSize * 0.72, 7 * dpr);
  ctx.globalAlpha = 0.7;
  ctx.font = `500 ${hintSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(hint, cx, cy - actionSize * 0.48, maxW);
  ctx.globalAlpha = 1;
  ctx.font = `600 ${actionSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(action, cx, cy + hintSize * 0.42, maxW);
}

function roundMouseRect(
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
