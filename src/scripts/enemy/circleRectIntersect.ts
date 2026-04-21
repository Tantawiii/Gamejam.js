/**
 * CIRCLERCTI NTERSECT.TS - Collision Detection Utility
 * 
 * PURPOSE:
 * This file provides collision detection between circles (enemies) and axis-aligned rectangles 
 * (train car hulls). It's used to determine when enemies touch the train and whether to apply 
 * damage, knockback, and explosion effects.
 * 
 * WHY THIS SPECIFIC COLLISION CHECK:
 * - Enemies are circles (fast and simple to calculate)
 * - Train cars are rectangles (match visual shape, efficient storage)
 * - This is the most common collision test needed in the game
 * - Separating collision math into utility makes it reusable and testable
 * 
 * THE ALGORITHM (Circle vs Centered Rectangle):
 * 1. Find the closest point on the rectangle to the circle's center
 *    - Clamp the circle's X between (rect.left, rect.right)
 *    - Clamp the circle's Y between (rect.top, rect.bottom)
 * 2. Calculate distance from circle center to that closest point
 * 3. If distance <= radius, the circle is overlapping the rectangle
 * 4. Return true (collision) or false (no collision)
 * 
 * PARAMETER BREAKDOWN:
 * 
 * Circle parameters:
 * - cx, cy: Center position of the circle in world space (enemy position)
 * - radius: Radius of the circle (enemy collision radius)
 * 
 * Rectangle parameters (specified as CENTER + HALF-SIZE):
 * - rx, ry: CENTER position of the rectangle in world space (train car center)
 * - rw, rh: FULL WIDTH and HEIGHT of the rectangle
 * - NOTE: NOT the corners! This is the centered rectangle format
 *   Example: Rectangle at (100, 50) with size (50, 100) has:
 *   - Left edge at 75, Right edge at 125
 *   - Top edge at 0, Bottom edge at 100
 * 
 * USAGE IN GAME:
 * 1. Enemy.handleTrainCollision() gets all train hull rectangles
 * 2. Loops through each hull: if (circleIntersectsCenteredRect(...)) then collision
 * 3. If collision detected: apply damage, knockback, and update cooldown
 * 4. Used for bomb enemy detonation trigger as well
 * 
 * PERFORMANCE NOTE:
 * - Very efficient: only uses basic math (min, max, hypot)
 * - No object allocations or garbage collection
 * - Called ~28 times per frame (max 28 enemies × train hulls)
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
  // Calculate half-width and half-height from full size
  const hw = rw * 0.5;
  const hh = rh * 0.5;
  
  // Find closest point on rectangle to circle center
  // Clamp circle's X and Y to rectangle bounds
  const nx = Math.min(Math.max(cx, rx - hw), rx + hw);
  const ny = Math.min(Math.max(cy, ry - hh), ry + hh);
  
  // Calculate distance from circle center to closest point
  const dx = cx - nx;
  const dy = cy - ny;
  
  // Check if distance is within radius (collision)
  return dx * dx + dy * dy <= radius * radius;
}
