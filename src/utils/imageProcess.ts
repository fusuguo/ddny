import { type RGB, COLOR_THRESHOLD, rgbDistanceFromChannels } from './colorMatch';

/** 非目标区域默认亮度系数（25% 原亮度） */
export const DEFAULT_DIM_FACTOR = 0.25;

/** 高亮渲染结果 */
export interface HighlightResult {
  imageData: ImageData;
  matchedPixels: number;
  totalPixels: number;
}

/**
 * 高亮指定颜色：与目标颜色 RGB 距离 < 阈值的像素保持原样，其他区域降低亮度
 * 返回新的 ImageData 及匹配统计（不修改原始数据）
 */
export function highlightColor(
  source: ImageData,
  target: RGB,
  threshold: number = COLOR_THRESHOLD,
  dimFactor: number = DEFAULT_DIM_FACTOR
): HighlightResult {
  const { width, height } = source;
  const result = new ImageData(width, height);
  const src = source.data;
  const dst = result.data;

  const totalPixels = width * height;
  let matchedPixels = 0;

  for (let i = 0; i < src.length; i += 4) {
    const distance = rgbDistanceFromChannels(src[i], src[i + 1], src[i + 2], target);

    if (distance < threshold) {
      // 目标颜色区域：保持原样
      dst[i] = src[i];
      dst[i + 1] = src[i + 1];
      dst[i + 2] = src[i + 2];
      matchedPixels++;
    } else {
      // 非目标区域：降低亮度
      dst[i] = Math.round(src[i] * dimFactor);
      dst[i + 1] = Math.round(src[i + 1] * dimFactor);
      dst[i + 2] = Math.round(src[i + 2] * dimFactor);
    }
    // alpha 通道保持不变
    dst[i + 3] = src[i + 3];
  }

  return { imageData: result, matchedPixels, totalPixels };
}

/**
 * 将图片绘制到 canvas 并获取完整 ImageData
 */
export function getImageDataFromImage(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * 将 ImageData 渲染到指定 canvas
 */
export function renderImageData(canvas: HTMLCanvasElement, imageData: ImageData): void {
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
}
