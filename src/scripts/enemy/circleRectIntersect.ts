/**
 * Circle vs axis-aligned rectangle (rectangle by center rx, ry and full size).
 */
export function circleIntersectsCenteredRect(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const hw = rw * 0.5;
  const hh = rh * 0.5;
  const nx = Math.min(Math.max(cx, rx - hw), rx + hw);
  const ny = Math.min(Math.max(cy, ry - hh), ry + hh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= radius * radius;
}
