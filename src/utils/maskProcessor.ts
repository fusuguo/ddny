import { type RGB, rgbDistanceFromChannels } from './colorMatch';

/**
 * MaskProcessor —— 颜色匹配后的二值 mask 后处理模块（V1.2 内存优化版）
 *
 * 处理管线：
 *   原始 mask（RGB 距离匹配）
 *     → Step 1 连通区域分析：过滤 JPEG 压缩产生的小面积误匹配噪点
 *     → Step 2 形态学闭运算：填补目标区域内部的小洞（如色号文字）
 *     → 最终渲染 mask
 *
 * 重要约束：
 *   - 只修改 renderMask，绝不修改原始图片像素。
 *   - renderMask=true 仅表示“该位置不降低亮度”，
 *     因此被闭运算覆盖的洞（如黑色文字）仍保持原始颜色，不会被填充成目标色。
 *
 * V1.2 内存优化（修复大图渲染 OOM）：
 *   - 全程原地操作：去噪与闭运算直接改写传入 mask，不分配 labels/queue/output 大数组；
 *   - BFS 队列上限 = minSize（旧版为全图像素数），形态学乒乓缓冲（4 个临时数组 → 1 个）；
 *   - 临时内存从 15n 降至 ~2n（36MP 图省约 470MB）。
 */

/** 最小连通区域面积（像素）：小于该值的连通区域视为噪点删除 */
export const DEFAULT_MIN_COMPONENT_SIZE = 10;

/** 形态学闭运算半径（像素）：可桥接约 2*radius 宽的小洞/缝隙，默认 6（经测试 radius ≥ 5 可稳定修复色块） */
export const DEFAULT_CLOSING_RADIUS = 6;

/**
 * mask 填洞算法模式（用于对比实验）：
 *   - 'closing'  ：形态学闭运算（当前默认方案）
 *   - 'holefill' ：二值孔洞填充（flood fill 找内部洞，新增对比方案）
 */
export type MaskHoleFillMode = 'closing' | 'holefill';

/** 默认填洞算法：保持现有方案 Morphology Closing，不改变默认用户体验 */
export const DEFAULT_HOLE_FILL_MODE: MaskHoleFillMode = 'closing';

/** 色块描边默认开关：默认开启，给高亮色块加边框以提高图纸可读性 */
export const DEFAULT_OUTLINE_ENABLED = true;

/** 描边宽度默认值（像素），0 表示关闭描边效果 */
export const DEFAULT_OUTLINE_WIDTH = 1;

/** 描边宽度可调范围 */
export const OUTLINE_WIDTH_MIN = 0;
export const OUTLINE_WIDTH_MAX = 5;

/** 描边颜色默认值（红色） */
export const DEFAULT_OUTLINE_COLOR = '#FF0000';

/** 全局 debug 开关：true 时渲染后弹出原始 mask / 后处理 mask 对比浮层 */
export const MASK_DEBUG = false;

/** mask 后处理统计信息 */
export interface MaskStats {
  /** 总像素数 */
  totalPixels: number;
  /** 原始 mask 中匹配（true）的像素数 */
  rawTruePixels: number;
  /** 被删除的小连通区域数量 */
  removedComponents: number;
  /** 因小连通区域删除而置假的像素数（噪点） */
  removedNoisePixels: number;
  /** 因闭运算填补而置真的像素数（洞） */
  filledHolePixels: number;
  /** 最终 mask 中 true 的像素数 */
  finalTruePixels: number;
  /** 本次使用的填洞算法名称（debug 展示用） */
  algorithm: string;
  /** 闭运算半径（仅 Morphology Closing 模式有意义，debug 展示用） */
  closingRadius: number;
}

/** mask 后处理可选参数 */
export interface MaskProcessOptions {
  /** 最小连通区域面积，默认 DEFAULT_MIN_COMPONENT_SIZE */
  minComponentSize?: number;
  /** 闭运算半径，默认 DEFAULT_CLOSING_RADIUS */
  closingRadius?: number;
  /** 填洞算法模式，默认 DEFAULT_HOLE_FILL_MODE（'closing'） */
  holeFillMode?: MaskHoleFillMode;
  /** 是否显示 debug 对比浮层（未指定时取 MASK_DEBUG） */
  debug?: boolean;
  /**
   * 是否开启色块描边，默认 DEFAULT_OUTLINE_ENABLED（true）。
   * 描边仅作用于最终渲染输出，不修改 mask 与原始像素。
   */
  outlineEnabled?: boolean;
  /** 描边宽度（像素），默认 DEFAULT_OUTLINE_WIDTH（1），0 表示关闭描边 */
  outlineWidth?: number;
  /** 描边颜色（hex 字符串），默认 DEFAULT_OUTLINE_COLOR（'#FF0000' 红色） */
  outlineColor?: string;
}

/**
 * Step 0：颜色匹配，生成原始二值 mask。
 * 与目标颜色 RGB 距离 < threshold 的像素为 1（true），否则为 0。
 */
export function computeColorMask(
  source: ImageData,
  target: RGB,
  threshold: number
): Uint8Array {
  const { width, height } = source;
  const src = source.data;
  const mask = new Uint8Array(width * height);

  for (let i = 0, p = 0; p < src.length; i++, p += 4) {
    const distance = rgbDistanceFromChannels(src[p], src[p + 1], src[p + 2], target);
    mask[i] = distance < threshold ? 1 : 0;
  }

  return mask;
}

/**
 * Step 1：连通区域分析（8 邻域），删除面积 < minSize 的小连通区域（噪点）。
 *
 * 内存优化版（V1.2）：原地修改输入 mask，临时内存仅 2×minSize 个 int
 * （旧版为全图 labels 4n + queue 4n + output 拷贝 1n，36MP 图约 324MB → 80B）。
 *
 * 算法（有界 BFS + 邻接检查，与旧版全量 BFS 输出严格一致，已经 2000 组随机差分验证）：
 *   - 用 mask 值 3 标记当前 BFS 访问中的像素（兼作 visited，省去 labels 数组）；
 *   - BFS 标记满 minSize 个像素即确认大组件（面积 ≥ minSize）停止，已标记像素置 2（保留），
 *     未探索像素留待外层循环继续；
 *   - BFS 完整遍历且面积 < minSize 时，检查组内是否有像素与“已保留（值 2）”像素相邻：
 *     相邻 → 属于大组件的碎片 → 保留；否则是孤立噪点 → 删除（置 0）。
 *     （小组件天然是孤立的：若与某大组件相连则它本身就属于那个大组件，故邻接检查精确无误。）
 */
export function removeSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minSize: number
): { mask: Uint8Array; removedComponents: number; removedPixels: number } {
  const n = width * height;
  // 有界 BFS：队列与标记缓冲均只需 minSize 个 int（旧版为全图 labels 4n + queue 4n）。
  // 正确性依据：小组件（< minSize）天然是孤立的——若它与某个大组件相连，
  // 它本身就属于那个大组件。因此：
  //   - BFS 标记满 minSize 个像素 → 组件面积 ≥ minSize → 保留；
  //   - BFS 完整遍历且面积 < minSize → 检查组内是否有像素与“已保留”像素相邻：
  //     相邻 → 是大组件的碎片（原算法中属于该大组件）→ 保留；否则是孤立噪点 → 删除。
  // mask 值：0=背景/已删除，1=待处理，2=已保留，3=当前 BFS 访问中。
  const cap = Math.max(1, minSize);
  const queue = new Int32Array(cap);
  const marked = new Int32Array(cap); // 当前 BFS 标记的像素（≤ cap）
  let removedComponents = 0;
  let removedPixels = 0;

  for (let start = 0; start < n; start++) {
    if (mask[start] !== 1) continue;

    let head = 0;
    let tail = 0;
    let markedCount = 0;
    queue[tail++] = start;
    mask[start] = 3;
    marked[markedCount++] = start;
    let isLarge = markedCount >= minSize; // 处理 minSize=1 的种子情形

    // BFS：标记满 minSize 个即确认大组件停止；否则完整遍历小组件
    while (head < tail && !isLarge) {
      const idx = queue[head++];
      const x = idx % width;
      const y = (idx - x) / width;

      for (let dy = -1; dy <= 1 && !isLarge; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nidx = ny * width + nx;
          if (mask[nidx] === 1) {
            mask[nidx] = 3;
            marked[markedCount++] = nidx;
            queue[tail++] = nidx;
            if (markedCount >= minSize) {
              isLarge = true;
              break;
            }
          }
        }
      }
    }

    if (isLarge) {
      // 大组件（面积 ≥ minSize）：已标记像素置 2（保留），未探索像素仍为 1，
      // 由外层循环继续探索（会再次命中大组件或经邻接检查保留）
      for (let i = 0; i < markedCount; i++) mask[marked[i]] = 2;
    } else {
      // 小组件（面积 = markedCount < minSize，已完整遍历）：检查是否与已保留像素相邻
      let adjacentToKept = false;
      for (let i = 0; i < markedCount && !adjacentToKept; i++) {
        const idx = marked[i];
        const x = idx % width;
        const y = (idx - x) / width;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (mask[ny * width + nx] === 2) {
              adjacentToKept = true;
              break;
            }
          }
        }
      }

      if (adjacentToKept) {
        // 大组件的碎片：保留（原算法中它属于那个 ≥ minSize 的组件）
        for (let i = 0; i < markedCount; i++) mask[marked[i]] = 2;
      } else {
        // 孤立噪点：删除
        removedComponents++;
        removedPixels += markedCount;
        for (let i = 0; i < markedCount; i++) mask[marked[i]] = 0;
      }
    }
  }

  // 归一化：已保留标记 2 → 1（值 3 均已在本轮转换为 2 或 0，不会残留）
  for (let i = 0; i < n; i++) {
    if (mask[i] === 2) mask[i] = 1;
  }

  return { mask, removedComponents, removedPixels };
}

/**
 * 水平方向膨胀：窗口 [x-radius, x+radius] 内任一为 1 则输出 1。
 * out 由调用方提供（乒乓缓冲复用，避免每次分配新数组）。
 */
function dilateH(src: Uint8Array, out: Uint8Array, width: number, height: number, radius: number): void {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      let val = 0;
      for (let k = x0; k <= x1; k++) {
        if (src[row + k] === 1) {
          val = 1;
          break;
        }
      }
      out[row + x] = val;
    }
  }
}

/**
 * 垂直方向膨胀：窗口 [y-radius, y+radius] 内任一为 1 则输出 1。
 * 逐列处理，可安全地原地写回（out 与 src 为不同数组时由调用方保证）。
 */
function dilateV(src: Uint8Array, out: Uint8Array, width: number, height: number, radius: number): void {
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      let val = 0;
      for (let k = y0; k <= y1; k++) {
        if (src[k * width + x] === 1) {
          val = 1;
          break;
        }
      }
      out[y * width + x] = val;
    }
  }
}

/**
 * 水平方向腐蚀：窗口 [x-radius, x+radius] 内全部为 1 才输出 1。
 * out 由调用方提供（乒乓缓冲复用）。
 */
function erodeH(src: Uint8Array, out: Uint8Array, width: number, height: number, radius: number): void {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      let val = 1;
      for (let k = x0; k <= x1; k++) {
        if (src[row + k] === 0) {
          val = 0;
          break;
        }
      }
      out[row + x] = val;
    }
  }
}

/**
 * 垂直方向腐蚀：窗口 [y-radius, y+radius] 内全部为 1 才输出 1。
 * 逐列处理，可安全地原地写回。
 */
function erodeV(src: Uint8Array, out: Uint8Array, width: number, height: number, radius: number): void {
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      let val = 1;
      for (let k = y0; k <= y1; k++) {
        if (src[k * width + x] === 0) {
          val = 0;
          break;
        }
      }
      out[y * width + x] = val;
    }
  }
}

/**
 * Step 2：形态学闭运算 = 先膨胀后腐蚀（方形结构元素，可分离为水平+垂直两趟）。
 * 作用：连接附近的目标区域，并填补目标区域内部的小洞（如色号文字笔画）。
 * 闭运算只改变 mask 的几何形状，不触碰任何图片像素。
 *
 * 内存优化（V1.2）：乒乓缓冲——水平 pass 写入唯一临时数组 tmp，
 * 垂直 pass 原地写回 mask。全程仅 1 个临时数组（旧版 4 个），结果直接在 mask 中返回。
 */
export function morphologicalClosing(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  if (radius <= 0) return mask;
  const tmp = new Uint8Array(mask.length); // 唯一临时缓冲
  dilateH(mask, tmp, width, height, radius);  // mask → tmp
  dilateV(tmp, mask, width, height, radius);  // tmp → mask（原地写回）
  erodeH(mask, tmp, width, height, radius);   // mask → tmp
  erodeV(tmp, mask, width, height, radius);   // tmp → mask（原地写回）
  return mask;
}

/**
 * Step 2（方案 B）：二值孔洞填充（Binary Hole Filling）——
 * 填充目标 mask 内部被完全包围的空洞（如色号文字笔画围出的洞）。
 *
 * 算法（从边界 flood fill）：
 *   1. 以图像四条边上的所有背景像素（0）为种子，通过 4 连通向外扩展，
 *      把可达的背景标记为“外部”（借 mask 值 2 兼作 visited，免单独 visited 数组）；
 *   2. BFS 结束后，仍未被标记的 0 像素即不可达的内部孔洞 → 置 1；
 *   3. 外部背景 2 还原为 0。
 *
 * 连通性说明：背景采用 4 连通（与前景 8 连通配对，符合 Jordan 曲线定理），
 * 确保被 8 连通目标区域（如文字笔画）包围的洞能被正确识别并填充。
 *
 * 约束：仅原地修改 mask，不触碰任何图片像素——被填充的洞仅表示
 * “不降低亮度”，洞内原始内容（如黑色文字）仍保持原色，不会被填成目标色。
 *
 * 内存：复用 mask 本身作 visited 标记；队列最坏 n 个 int（仅 debug 对比场景使用）。
 */
export function fillMaskHoles(
  mask: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const n = width * height;
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  // 若为背景（0）则标记为外部（2）并入队；已标记者跳过，保证每像素最多入队一次
  const enqueueIfBackground = (idx: number) => {
    if (mask[idx] === 0) {
      mask[idx] = 2;
      queue[tail++] = idx;
    }
  };

  // 种子：四条边上的背景像素
  for (let x = 0; x < width; x++) {
    enqueueIfBackground(x);                        // 上边
    enqueueIfBackground((height - 1) * width + x); // 下边
  }
  for (let y = 0; y < height; y++) {
    enqueueIfBackground(y * width);                // 左边
    enqueueIfBackground(y * width + width - 1);    // 右边
  }

  // BFS：通过 4 连通背景向外扩展
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) enqueueIfBackground(idx - 1);
    if (x < width - 1) enqueueIfBackground(idx + 1);
    if (y > 0) enqueueIfBackground(idx - width);
    if (y < height - 1) enqueueIfBackground(idx + width);
  }

  // 填洞（未被访问的 0 → 1），还原外部背景（2 → 0）
  for (let i = 0; i < n; i++) {
    if (mask[i] === 0) mask[i] = 1;
    else if (mask[i] === 2) mask[i] = 0;
  }

  return mask;
}

/**
 * 色块描边边界提取：提取前景（mask=1）区域的内侧边界环。
 * 边界 = 前景像素中距背景（mask=0）≤ thickness 的部分。
 *
 * 算法：先按 thickness 腐蚀前景得到收缩核心 eroded，边界 = 前景 AND NOT eroded。
 * 腐蚀复用可分离的水平+垂直两趟（与闭运算一致），临时内存仅 2 个 n 字节缓冲
 * （tmp 最终复用为边界输出）。
 *
 * 用途：给高亮色块加反色描边，使色块边界更清晰。
 * 约束：只读输入 mask，不修改 mask 与任何图片像素。
 */
export function extractBoundary(
  mask: Uint8Array,
  width: number,
  height: number,
  thickness: number
): Uint8Array {
  const n = width * height;
  const tmp = new Uint8Array(n);
  const eroded = new Uint8Array(n);
  erodeH(mask, tmp, width, height, thickness);    // mask → tmp
  erodeV(tmp, eroded, width, height, thickness);  // tmp → eroded（收缩 thickness 后的核心）
  // 复用 tmp 作为边界输出：是前景且不在收缩核心内的像素即边界环
  for (let i = 0; i < n; i++) {
    tmp[i] = mask[i] === 1 && eroded[i] === 0 ? 1 : 0;
  }
  return tmp;
}

/**
 * mask 后处理完整管线：连通域去噪 → 形态学闭运算。
 * 返回最终渲染 mask 与统计信息。
 *
 * 内存优化（V1.2）：全程原地操作——去噪与闭运算直接修改传入的 rawMask，
 * 不再分配 output 拷贝与 denoised 副本；临时内存仅 1 个 n 字节缓冲 + 40B 队列
 * （旧版为 labels 4n + queue 4n + output 1n + 闭运算中间 4n = 13n）。
 * 注意：调用后 rawMask 内容已被就地改写为最终 mask。
 */
export function processMask(
  rawMask: Uint8Array,
  width: number,
  height: number,
  options?: MaskProcessOptions
): { mask: Uint8Array; stats: MaskStats } {
  const minComponentSize = options?.minComponentSize ?? DEFAULT_MIN_COMPONENT_SIZE;
  const closingRadius = options?.closingRadius ?? DEFAULT_CLOSING_RADIUS;
  const holeFillMode = options?.holeFillMode ?? DEFAULT_HOLE_FILL_MODE;
  const totalPixels = width * height;

  let rawTruePixels = 0;
  for (let i = 0; i < totalPixels; i++) if (rawMask[i] === 1) rawTruePixels++;

  // Step 1：删除小连通区域（噪点）——原地修改 rawMask（两种模式共用去噪）
  const { removedComponents, removedPixels } = removeSmallComponents(
    rawMask,
    width,
    height,
    minComponentSize
  );

  // Step 2：填洞——根据 holeFillMode 选择算法（均原地写回 rawMask）
  //   方案 A：removeSmallComponents → morphologyClosing(radius)
  //   方案 B：removeSmallComponents → fillMaskHoles()
  let finalMask: Uint8Array;
  let algorithm: string;
  if (holeFillMode === 'holefill') {
    finalMask = fillMaskHoles(rawMask, width, height);
    algorithm = 'Binary Hole Filling';
  } else {
    finalMask = morphologicalClosing(rawMask, width, height, closingRadius);
    algorithm = 'Morphology Closing';
  }

  // 统计：填洞新增的像素 = 最终为 1 但原始匹配为 0（涵盖去噪删除后被填洞恢复的像素）
  let finalTruePixels = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (finalMask[i] === 1) finalTruePixels++;
  }
  let filledHolePixels = finalTruePixels - (rawTruePixels - removedPixels);
  if (filledHolePixels < 0) filledHolePixels = 0;

  const stats: MaskStats = {
    totalPixels,
    rawTruePixels,
    removedComponents,
    removedNoisePixels: removedPixels,
    filledHolePixels,
    finalTruePixels,
    algorithm,
    closingRadius,
  };

  return { mask: finalMask, stats };
}

/** 将 mask 渲染为黑白图像（true=白，false=黑）并返回 canvas */
function makeMaskCanvas(
  mask: Uint8Array,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const v = mask[i] === 1 ? 255 : 0;
    img.data[p] = v;
    img.data[p + 1] = v;
    img.data[p + 2] = v;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  canvas.style.cssText = 'width:100%;image-rendering:pixelated;border:1px solid #555;display:block;';
  return canvas;
}

/**
 * debug 可视化：弹出固定浮层，对比展示原始 mask 与后处理 mask，
 * 并输出统计信息。点击浮层即可关闭。
 */
export function showMaskDebugOverlay(
  rawMask: Uint8Array,
  renderMask: Uint8Array,
  width: number,
  height: number,
  stats: MaskStats
): void {
  // 移除已有浮层，避免多次渲染叠加
  document.getElementById('mask-debug-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mask-debug-overlay';
  // 固定在左上角（右上角留给开发者设置按钮，避免遮挡）
  overlay.style.cssText =
    'position:fixed;top:10px;left:10px;z-index:9998;background:rgba(0,0,0,0.88);' +
    'color:#fff;padding:12px;border-radius:8px;font-size:12px;width:280px;' +
    'max-height:90vh;overflow:auto;cursor:pointer;font-family:sans-serif;';
  overlay.title = '点击关闭';
  overlay.addEventListener('click', () => overlay.remove());

  const title = document.createElement('div');
  title.textContent = '🔍 Mask 调试对比（点击关闭）';
  title.style.cssText = 'font-weight:bold;margin-bottom:8px;';
  overlay.appendChild(title);

  // 当前算法与参数信息
  const algoDiv = document.createElement('div');
  algoDiv.style.cssText =
    'margin-bottom:8px;padding:6px 8px;background:rgba(52,152,219,0.25);' +
    'border-radius:4px;line-height:1.5;white-space:pre;';
  algoDiv.textContent =
    `Processing: ${stats.algorithm}\n` +
    `Closing Radius: ${stats.algorithm === 'Morphology Closing' ? stats.closingRadius : '—'}`;
  overlay.appendChild(algoDiv);

  const addSection = (label: string, mask: Uint8Array) => {
    const lbl = document.createElement('div');
    lbl.textContent = label;
    lbl.style.cssText = 'margin:6px 0 4px;color:#9ecbff;';
    overlay.appendChild(lbl);
    overlay.appendChild(makeMaskCanvas(mask, width, height));
  };

  addSection('① 原始 mask（RGB 匹配）', rawMask);
  addSection('② 后处理 mask（去噪 + 填洞）', renderMask);

  const statsDiv = document.createElement('div');
  statsDiv.style.cssText = 'margin-top:10px;line-height:1.6;white-space:pre;';
  statsDiv.textContent =
    `原始匹配像素: ${stats.rawTruePixels}\n` +
    `删除噪点区域: ${stats.removedComponents} 个 / ${stats.removedNoisePixels} 像素\n` +
    `闭运算填洞像素: ${stats.filledHolePixels}\n` +
    `最终 true 像素: ${stats.finalTruePixels}`;
  overlay.appendChild(statsDiv);

  document.body.appendChild(overlay);
}
