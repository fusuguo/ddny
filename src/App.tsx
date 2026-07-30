import { useState, useCallback, useRef } from 'react';
import ImageUploader from './components/ImageUploader';
import ImageCanvas from './components/ImageCanvas';
import PerlerColorPicker from './components/PerlerColorPicker';
import ControlPanel from './components/ControlPanel';
import ProgressOverlay from './components/ProgressOverlay';
import { type RGB, COLOR_THRESHOLD } from './utils/colorMatch';
import { getImageDataFromImage, highlightColor } from './utils/imageProcess';
import { type PerlerColor } from './utils/perlerPalette';
import { RenderCache } from './utils/renderCache';
import './App.css';

/**
 * 应用主组件
 * 流程：上传图片 → 选择拼豆色号 → 确认 → 高亮渲染 → 循环选择
 */
export default function App() {
  /** 原始图片像素数据 */
  const [originalData, setOriginalData] = useState<ImageData | null>(null);
  /** 当前显示的像素数据 */
  const [displayData, setDisplayData] = useState<ImageData | null>(null);
  /** 已确认的色号列表 */
  const [colorList, setColorList] = useState<PerlerColor[]>([]);
  /** 当前高亮的颜色索引，-1 = 原图 */
  const [activeIndex, setActiveIndex] = useState(-1);
  /** 是否正在处理 */
  const [processing, setProcessing] = useState(false);
  /** 颜色匹配阈值（默认 20，可滑动调节） */
  const [threshold, setThreshold] = useState(COLOR_THRESHOLD);
  /** 是否正在上传/加载图纸（暂停态） */
  const [uploading, setUploading] = useState(false);

  /** 渲染缓冲区：原图 + 最近3个高亮结果 */
  const cacheRef = useRef(new RenderCache());

  /** 当前显示数据 ref：用于判断“目标数据已在展示”，避免遮罩永不收起 */
  const displayDataRef = useRef<ImageData | null>(null);
  displayDataRef.current = displayData;

  /** 待执行的高亮渲染定时器：任何新操作开始前先取消它，避免过期计算覆盖新显示、或遗留永不收起的遮罩 */
  const renderTimerRef = useRef<number | null>(null);

  /** 取消待执行的高亮渲染（上传 / 切换颜色 / 查看原图 / 删除等新操作前调用） */
  const cancelPendingRender = useCallback(() => {
    if (renderTimerRef.current !== null) {
      window.clearTimeout(renderTimerRef.current);
      renderTimerRef.current = null;
    }
  }, []);

  /** 开始上传：取消待执行渲染并进入暂停态（由 canvas 绘制完成的 onRendered 收起） */
  const handleUploadStart = useCallback(() => {
    cancelPendingRender();
    setProcessing(false);
    setUploading(true);
  }, [cancelPendingRender]);

  /** 图片加载完成 */
  const handleImageLoad = useCallback((img: HTMLImageElement) => {
    // 延迟一帧再提取像素，让遮罩动画先渲染，避免同步阻塞卡住动画
    window.setTimeout(() => {
      cancelPendingRender();
      const data = getImageDataFromImage(img);
      cacheRef.current.setOriginal(data);
      setOriginalData(data);
      setDisplayData(data);
      setColorList([]);
      setActiveIndex(-1);
      // 保持暂停态：canvas 的 putImageData（真正耗时步骤）完成后由 onRendered 收起
    }, 60);
  }, [cancelPendingRender]);

  /** 将色号的 rgb 数组转换为 RGB 对象 */
  const toRgb = useCallback((color: PerlerColor): RGB => {
    return { r: color.rgb[0], g: color.rgb[1], b: color.rgb[2] };
  }, []);

  /**
   * 执行高亮渲染（优先从缓冲区读取）。
   * 无论缓存命中与否都显示进度遮罩：putImageData（把像素绘制到 canvas）
   * 是真正耗时的步骤，由 ImageCanvas 的 onRendered 在绘制完成后收起遮罩。
   * 关键不变式：processing=true 必然伴随一次 setDisplayData（新引用），
   * 从而触发 canvas 重绘 → onRendered 收起遮罩；任何提前返回分支都必须自行收起遮罩。
   */
  const doHighlight = useCallback(
    (color: PerlerColor, index: number, th: number) => {
      if (!originalData) return;

      const rgb = toRgb(color);
      const cached = cacheRef.current.getHighlight(rgb, th);

      // 目标数据就是当前显示的数据：无需重绘。
      // 必须收起可能遗留的遮罩（上一次待执行渲染已被取消，不会再有 onRendered）
      if (cached && cached === displayDataRef.current) {
        cancelPendingRender();
        setProcessing(false);
        setActiveIndex(index);
        return;
      }

      // 取消上一次待执行的渲染，避免过期结果覆盖本次
      cancelPendingRender();
      setActiveIndex(index);
      setProcessing(true);

      // 缓存命中：直接切换显示数据（putImageData 仍耗时，由 onRendered 收起遮罩）
      if (cached) {
        console.log(
          `[颜色高亮] 缓存命中 ${color.code} RGB(${rgb.r}, ${rgb.g}, ${rgb.b}) 阈值=${th}，直接切换`
        );
        setDisplayData(cached);
        return;
      }

      // 缓存未命中：延迟计算并写入缓冲区。
      // 延迟执行让遮罩动画先渲染；定时器 id 存入 ref，供后续操作取消
      renderTimerRef.current = window.setTimeout(() => {
        renderTimerRef.current = null;
        const result = highlightColor(originalData, rgb, th);
        cacheRef.current.setHighlight(rgb, th, result.imageData);
        setDisplayData(result.imageData);

        // 调试信息：用于判断阈值效果
        console.log(
          `[颜色高亮] ${color.code} RGB(${rgb.r}, ${rgb.g}, ${rgb.b})\n` +
            `Threshold: ${th}\n` +
            `Matched pixels: ${result.matchedPixels}\n` +
            `Total pixels: ${result.totalPixels}\n` +
            `Match ratio: ${((result.matchedPixels / result.totalPixels) * 100).toFixed(2)}%`
        );
      }, 100);
    },
    [originalData, toRgb, cancelPendingRender]
  );

  /** 确认选择色号：去重后加入列表并触发高亮 */
  const handleConfirm = useCallback(
    (color: PerlerColor) => {
      const existingIndex = colorList.findIndex((c) => c.code === color.code);
      if (existingIndex >= 0) {
        // 重复色号：不重复加入列表，但仍切换高亮渲染
        doHighlight(color, existingIndex, threshold);
        return;
      }
      const newIndex = colorList.length;
      setColorList((prev) => [...prev, color]);
      doHighlight(color, newIndex, threshold);
    },
    [colorList, doHighlight, threshold]
  );

  /** 点击已选色号，重新查看高亮 */
  const handleSelectColor = useCallback(
    (index: number) => {
      doHighlight(colorList[index], index, threshold);
    },
    [colorList, doHighlight, threshold]
  );

  /** 删除已选色号：若删的是当前高亮项则回到原图（同样展示进度遮罩），其余索引顺延 */
  const handleDeleteColor = useCallback(
    (index: number) => {
      setColorList((prev) => prev.filter((_, i) => i !== index));
      if (activeIndex === index) {
        cancelPendingRender();
        const original = cacheRef.current.getOriginal();
        if (original && original !== displayDataRef.current) {
          setProcessing(true);
          setDisplayData(original);
        } else {
          // 无需重绘：收起可能遗留的遮罩
          setProcessing(false);
        }
        setActiveIndex(-1);
      } else if (activeIndex > index) {
        setActiveIndex(activeIndex - 1);
      }
    },
    [activeIndex, cancelPendingRender]
  );

  /** 查看原图（直接从缓冲区取，展示与渲染一致的进度遮罩） */
  const handleShowOriginal = useCallback(() => {
    const original = cacheRef.current.getOriginal();
    if (!original) return;
    cancelPendingRender();
    // 已在展示原图：无需重绘，收起可能遗留的遮罩
    if (original === displayDataRef.current) {
      setProcessing(false);
      setActiveIndex(-1);
      return;
    }
    setProcessing(true);
    setDisplayData(original);
    setActiveIndex(-1);
  }, [cancelPendingRender]);

  /** Canvas 绘制完成：putImageData 真正完成后才收起进度遮罩（上传 / 渲染通用） */
  const handleCanvasRendered = useCallback(() => {
    setProcessing(false);
    setUploading(false);
  }, []);

  /**
   * 滑动条拖动回调：仅更新阈值状态，不做实时重渲染。
   * 阈值变化触发的重渲染是同步遍历全图的重操作，实时执行会卡死页面；
   * 新阈值在下次确认色号 / 点击已选色号时生效。
   */
  const handleThresholdChange = useCallback((value: number) => {
    setThreshold(value);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎨 拼豆图纸颜色高亮工具</h1>
        <p className="subtitle">上传图片 → 选择色号 → 确认高亮 → 循环选择</p>
      </header>

      <div className="app-layout">
        <div className="toolbar">
          <ImageUploader
            onImageLoad={handleImageLoad}
            onUploadStart={handleUploadStart}
            disabled={uploading}
          />
          {originalData && !processing && !uploading && (
            <span className="pick-hint">💡 选择拼豆色号并确认，即可高亮对应颜色区域</span>
          )}
        </div>

        {/* 色号选择器：宽屏在右侧栏，窄屏在上传栏与画布之间（由 CSS Grid 控制位置） */}
        <PerlerColorPicker
          onConfirm={handleConfirm}
          threshold={threshold}
          onThresholdChange={handleThresholdChange}
          disabled={!originalData || processing || uploading}
        />

        <div className="canvas-area">
          {(uploading || processing) && (
            <div className="upload-overlay">
              <ProgressOverlay
                label={
                  uploading ? '⏸ 图纸加载中，其他操作已暂停' : '🎨 正在渲染高亮，请稍候...'
                }
              />
            </div>
          )}
          <ImageCanvas
            originalData={originalData}
            displayData={displayData}
            activeColor={activeIndex >= 0 ? colorList[activeIndex] ?? null : null}
            onRendered={handleCanvasRendered}
          />
        </div>

        <ControlPanel
          colorList={colorList}
          activeIndex={activeIndex}
          processing={processing}
          hasImage={originalData !== null}
          onSelectColor={handleSelectColor}
          onShowOriginal={handleShowOriginal}
          onDeleteColor={handleDeleteColor}
        />
      </div>
    </div>
  );
}
