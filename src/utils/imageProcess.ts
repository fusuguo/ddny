import { type RGB, COLOR_THRESHOLD } from './colorMatch';
import {
  type MaskProcessOptions,
  type MaskStats,
  computeColorMask,
  processMask,
  extractBoundary,
  showMaskDebugOverlay,
  MASK_DEBUG,
  DEFAULT_OUTLINE_ENABLED,
  DEFAULT_OUTLINE_WIDTH,
  DEFAULT_OUTLINE_COLOR,
} from './maskProcessor';

/** 非目标区域默认亮度系数（70% 原亮度） */
export const DEFAULT_DIM_FACTOR = 0.7;

/** 色块描边信息（开启描边时随 HighlightResult 返回） */
export interface OutlineInfo {
  /** 描边宽度（像素） */
  strokeWidth: number;
  /** 描边颜色（用户选择的固定颜色） */
  borderColor: RGB;
  /** 边界像素总数 */
  boundaryPixels: number;
}

/** 高亮渲染结果 */
export interface HighlightResult {
  imageData: ImageData;
  matchedPixels: number;
  totalPixels: number;
  /** mask 后处理统计（V1.1）：去噪与填洞信息 */
  maskStats?: MaskStats;
  /** 色块描边信息（V1.3，开启描边时返回） */
  outline?: OutlineInfo;
}

/**
 * 高亮指定颜色（V1.2 内存优化管线）：
 *   图片 → RGB 颜色匹配 → 原始 mask → mask 后处理（连通域去噪 + 形态学闭运算）
 *        → 最终渲染 mask → 背景暗化 → 显示结果
 *
 * 渲染规则：renderMask=true 保持原始像素亮度（不暗化），renderMask=false 执行背景暗化。
 * 注意：后处理只作用于渲染层 mask，绝不修改原始图片像素——
 * 被闭运算填补的洞（如色号文字）仅表示“不降低亮度”，文字本身仍保持原色。
 *
 * 内存优化：processMask 全程原地操作 rawMask（不分配 labels/queue/output 大数组），
 * 临时内存仅 1 个 n 字节缓冲 + 40B 队列，较旧版省约 13n（36MP 图约 470MB）。
 * 返回新的 ImageData 及匹配/后处理统计（不修改原始数据）。
 */
export function highlightColor(
  source: ImageData,
  target: RGB,
  threshold: number = COLOR_THRESHOLD,
  dimFactor: number = DEFAULT_DIM_FACTOR,
  maskOptions?: MaskProcessOptions
): HighlightResult {
  const { width, height } = source;
  const src = source.data;
  const totalPixels = width * height;

  // debug 模式需要展示原始 mask，而 processMask 会原地改写，故先拷贝一份（仅 debug 时分配）
  const debugEnabled = maskOptions?.debug ?? MASK_DEBUG;
  // 色块描边参数（开关 / 宽度 / 颜色，由用户在渲染设置中控制）
  const outlineWidth = maskOptions?.outlineWidth ?? DEFAULT_OUTLINE_WIDTH;
  const outlineEnabled =
    (maskOptions?.outlineEnabled ?? DEFAULT_OUTLINE_ENABLED) && outlineWidth > 0;

  // Step 1：RGB 颜色匹配 → 原始二值 mask
  const rawMask = computeColorMask(source, target, threshold);
  const debugRawCopy = debugEnabled ? new Uint8Array(rawMask) : null;

  // Step 2：mask 后处理（连通域去噪 + 形态学闭运算）→ 最终渲染 mask（原地改写 rawMask）
  const { mask: renderMask, stats } = processMask(rawMask, width, height, maskOptions);

  // Step 2.5：色块描边（V1.4）——提取 renderMask 内侧边界环，用用户选择的固定颜色描边。
  // 描边宽度由用户在渲染设置中指定（0~5px，0 = 关闭）。
  // 描边只影响渲染输出，不修改 mask 与原始像素。
  let boundaryMask: Uint8Array | null = null;
  let outline: OutlineInfo | undefined;
  if (outlineEnabled) {
    const strokeWidth = outlineWidth;
    // 将 hex 颜色字符串解析为 RGB
    const hex = maskOptions?.outlineColor ?? DEFAULT_OUTLINE_COLOR;
    const borderColor: RGB = {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
    boundaryMask = extractBoundary(renderMask, width, height, strokeWidth);
    let boundaryPixels = 0;
    for (let i = 0; i < totalPixels; i++) if (boundaryMask[i] === 1) boundaryPixels++;
    outline = { strokeWidth, borderColor, boundaryPixels };
  }

  // Step 3：渲染——边界像素描边色，renderMask=true 保留原像素，false 暗化
  const result = new ImageData(width, height);
  const dst = result.data;
  for (let i = 0, p = 0; i < totalPixels; i++, p += 4) {
    if (boundaryMask !== null && boundaryMask[i] === 1) {
      // 色块边界：描边色覆盖原像素（仅边界环，不影响色块内部填充）
      dst[p] = outline!.borderColor.r;
      dst[p + 1] = outline!.borderColor.g;
      dst[p + 2] = outline!.borderColor.b;
    } else if (renderMask[i] === 1) {
      // 目标颜色区域：保持原样
      dst[p] = src[p];
      dst[p + 1] = src[p + 1];
      dst[p + 2] = src[p + 2];
    } else {
      // 非目标区域：降低亮度
      dst[p] = Math.round(src[p] * dimFactor);
      dst[p + 1] = Math.round(src[p + 1] * dimFactor);
      dst[p + 2] = Math.round(src[p + 2] * dimFactor);
    }
    // alpha 通道保持不变
    dst[p + 3] = src[p + 3];
  }

  // debug 模式：弹出原始 mask / 后处理 mask 对比浮层
  if (debugEnabled && debugRawCopy) {
    showMaskDebugOverlay(debugRawCopy, renderMask, width, height, stats);
  }

  // matchedPixels 保留为原始颜色匹配数（与阈值调试语义一致），后处理统计另存于 maskStats
  return { imageData: result, matchedPixels: stats.rawTruePixels, totalPixels, maskStats: stats, outline };
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
 * 将 ImageData 渲染到指定 canvas。
 * 仅在尺寸变化时重设 canvas 宽高（重设会清空画布并重新分配后备存储，
 * 大图场景下每次约 144MB；尺寸不变时直接 putImageData 覆盖即可）。
 */
export function renderImageData(canvas: HTMLCanvasElement, imageData: ImageData): void {
  if (canvas.width !== imageData.width || canvas.height !== imageData.height) {
    canvas.width = imageData.width;
    canvas.height = imageData.height;
  }

  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
}
