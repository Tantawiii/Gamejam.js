/**
 * Push a circle out of an axis-aligned rectangle (rectangle uses center x,y and full width/height).
 */
export function pushCircleOutOfCenteredRect(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { x: number; y: number } {
  const halfW = rw * 0.5;
  const halfH = rh * 0.5;
  const left = rx - halfW;
  const right = rx + halfW;
  const top = ry - halfH;
  const bottom = ry + halfH;

  const qx = Math.min(Math.max(cx, left), right);
  const qy = Math.min(Math.max(cy, top), bottom);
  let dx = cx - qx;
  let dy = cy - qy;
  const dSq = dx * dx + dy * dy;

  if (dSq >= radius * radius) {
    return { x: cx, y: cy };
  }

  if (dSq < 1e-8) {
    const dl = Math.abs(cx - left);
    const dr = Math.abs(right - cx);
    const dt = Math.abs(cy - top);
    const db = Math.abs(bottom - cy);
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) {
      cx = left - radius;
    } else if (m === dr) {
      cx = right + radius;
    } else if (m === dt) {
      cy = top - radius;
    } else {
      cy = bottom + radius;
    }
    return { x: cx, y: cy };
  }

  const d = Math.sqrt(dSq);
  const nx = dx / d;
  const ny = dy / d;
  return {
    x: qx + nx * radius,
    y: qy + ny * radius,
  };
}
