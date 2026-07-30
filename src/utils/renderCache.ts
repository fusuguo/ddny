import { type RGB } from './colorMatch';

/** 最多缓存的高亮渲染结果数量 */
const MAX_HIGHLIGHT_CACHE = 3;

/**
 * 渲染缓冲区：缓存原图 + 最近 3 个高亮渲染结果
 * 使用 LRU 策略淘汰最久未使用的渲染图
 */
export class RenderCache {
  private original: ImageData | null = null;
  private cache = new Map<string, ImageData>();

  private key(color: RGB, threshold: number): string {
    return `${color.r},${color.g},${color.b}@${threshold}`;
  }

  /** 缓存原图（上传新图时调用，同时清空高亮缓存） */
  setOriginal(data: ImageData): void {
    this.original = data;
    this.cache.clear();
  }

  getOriginal(): ImageData | null {
    return this.original;
  }

  /** 获取已缓存的高亮渲染结果（按颜色 + 阈值缓存） */
  getHighlight(color: RGB, threshold: number): ImageData | undefined {
    const k = this.key(color, threshold);
    const val = this.cache.get(k);
    if (val) {
      // LRU：刷新访问顺序
      this.cache.delete(k);
      this.cache.set(k, val);
    }
    return val;
  }

  /** 存入高亮渲染结果，超出上限时淘汰最旧条目 */
  setHighlight(color: RGB, threshold: number, data: ImageData): void {
    const k = this.key(color, threshold);
    if (this.cache.has(k)) this.cache.delete(k);
    this.cache.set(k, data);

    while (this.cache.size > MAX_HIGHLIGHT_CACHE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  clear(): void {
    this.original = null;
    this.cache.clear();
  }
}
