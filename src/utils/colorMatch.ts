/** RGB 颜色类型 */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** 颜色匹配阈值（RGB 欧氏距离）：距离 < 阈值 视为同一颜色，可根据实际效果调整 */
export const COLOR_THRESHOLD = 20;

/**
 * RGB 转 CSS 颜色字符串
 */
export function rgbToCss(color: RGB): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/**
 * RGB 转 HEX 字符串
 */
export function rgbToHex(color: RGB): string {
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/**
 * RGB 欧氏距离：
 * distance = sqrt((r1-r2)^2 + (g1-g2)^2 + (b1-b2)^2)
 */
export function rgbDistance(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * 高性能版本：像素通道值 (r,g,b) 到目标颜色的 RGB 欧氏距离
 * 供逐像素遍历使用，避免中间对象分配
 */
export function rgbDistanceFromChannels(r: number, g: number, b: number, target: RGB): number {
  const dr = r - target.r;
  const dg = g - target.g;
  const db = b - target.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * 判断两个颜色是否属于同一颜色（RGB 距离 < 阈值）
 */
export function isSameColor(a: RGB, b: RGB, threshold: number = COLOR_THRESHOLD): boolean {
  return rgbDistance(a, b) < threshold;
}
