/**
 * Split sizing math (pure, shared by mouse drag and keyboard resize).
 */
export function clampSplit(totalWidth, leftWidth, minLeft = 12, minRight = 12) {
  const max = Math.max(0, totalWidth - minRight);
  const min = Math.min(minLeft, max);
  return Math.max(min, Math.min(leftWidth, max));
}
