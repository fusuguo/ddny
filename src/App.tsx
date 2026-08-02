import { useState, useCallback, useRef, useEffect } from 'react';
import ImageUploader from './components/ImageUploader';
import ImageCanvas from './components/ImageCanvas';
import PerlerColorPicker from './components/PerlerColorPicker';
import RenderSettings, { DEFAULT_DIM_PERCENT } from './components/RenderSettings';
import ControlPanel, { type SelectedColor } from './components/ControlPanel';
import ProgressOverlay from './components/ProgressOverlay';
// import DebugSettings from './components/DebugSettings';
import { DEFAULT_THRESHOLD } from './components/MatchRangeSlider';
import { type RGB } from './utils/colorMatch';
import { getImageDataFromImage, highlightColor } from './utils/imageProcess';
import {
  type MaskHoleFillMode,
  DEFAULT_CLOSING_RADIUS,
  DEFAULT_HOLE_FILL_MODE,
  DEFAULT_OUTLINE_ENABLED,
  DEFAULT_OUTLINE_WIDTH,
  DEFAULT_OUTLINE_COLOR,
} from './utils/maskProcessor';
import { type PerlerColor } from './utils/perlerPalette';
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
  /** 已确认的色号列表（每项独立保存匹配范围） */
  const [colorList, setColorList] = useState<SelectedColor[]>([]);
  /** 当前高亮的颜色索引，-1 = 原图 */
  const [activeIndex, setActiveIndex] = useState(-1);
  /** 是否正在处理 */
  const [processing, setProcessing] = useState(false);
  /** 颜色匹配阈值（10 档固定调节，默认 DEFAULT_THRESHOLD） */
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  /** 背景亮度百分比（10 档固定调节，默认 DEFAULT_DIM_PERCENT，实时生效） */
  const [dimPercent, setDimPercent] = useState(DEFAULT_DIM_PERCENT);
  /** 是否正在上传/加载图纸（暂停态） */
  const [uploading, setUploading] = useState(false);
  /** 是否已触发过上传（首次上传后 canvas 占位区不再支持点击上传） */
  const [hasEverUploaded, setHasEverUploaded] = useState(false);

  /** “打开文件选择器”函数 ref：由 ImageUploader 注册，供 canvas 占位区点击触发 */
  const openPickerRef = useRef<(() => void) | null>(null);

  /* ---- 开发者调试设置（默认值保证普通用户体验不变） ---- */
  /** Debug 模式开关（默认关闭） */
  const [debugEnabled, _setDebugEnabled] = useState(false);
  /** mask 填洞算法模式（默认 Morphology Closing） */
  const [maskMode, _setMaskMode] = useState<MaskHoleFillMode>(DEFAULT_HOLE_FILL_MODE);
  /** 闭运算半径（默认 DEFAULT_CLOSING_RADIUS） */
  const [closingRadius, _setClosingRadius] = useState(DEFAULT_CLOSING_RADIUS);
  /** 色块描边开关（默认开启，渲染设置中控制） */
  const [outlineEnabled, setOutlineEnabled] = useState(DEFAULT_OUTLINE_ENABLED);
  /** 描边宽度（0~5 px，默认 1，0 = 关闭描边效果） */
  const [outlineWidth, setOutlineWidth] = useState(DEFAULT_OUTLINE_WIDTH);
  /** 描边颜色（hex，默认红色 #FF0000） */
  const [outlineColor, setOutlineColor] = useState(DEFAULT_OUTLINE_COLOR);

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

  /** 开始上传：取消待执行渲染、立即释放旧图数据（降低重传内存峰值）并进入暂停态 */
  const handleUploadStart = useCallback(() => {
    cancelPendingRender();
    setProcessing(false);
    setHasEverUploaded(true);
    // 关键：立即解除旧图原图与当前显示数据的引用。
    // 重新上传卡死的根因是“旧图未释放 + 新图已分配”使内存峰值翻倍（out of memory）；
    // 在选定文件时（与像素提取相隔多个事件循环，GC 有机会回收）就解除引用，
    // 可把峰值从“旧原图+旧显示图+旧显存+新位图+新临时canvas+新ImageData”降为仅新图几份
    setOriginalData(null);
    setDisplayData(null);
    setColorList([]);
    setActiveIndex(-1);
    setUploading(true);
  }, [cancelPendingRender]);

  /** 上传/加载失败：退出暂停态（旧图已在开始上传时释放，回到空状态） */
  const handleUploadError = useCallback(() => {
    setUploading(false);
  }, []);

  /** 图片加载完成 */
  const handleImageLoad = useCallback((img: HTMLImageElement) => {
    // 延迟一帧再提取像素，让遮罩动画先渲染，避免同步阻塞卡住动画
    window.setTimeout(() => {
      cancelPendingRender();
      const data = getImageDataFromImage(img);
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
   * 高亮渲染核心计算（纯函数调用，不涉及 UI 状态）。
   * doHighlight（带過度遮罩）与描边实时刷新（无遮罩）共用。
   */
  const computeHighlight = useCallback(
    (color: PerlerColor, th: number, dim: number, olEnabled: boolean, olWidth: number, olColor: string) => {
      if (!originalData) return null;
      const rgb = toRgb(color);
      return highlightColor(originalData, rgb, th, dim / 100, {
        closingRadius,
        holeFillMode: maskMode,
        debug: debugEnabled,
        outlineEnabled: olEnabled,
        outlineWidth: olWidth,
        outlineColor: olColor,
      });
    },
    [originalData, toRgb, closingRadius, maskMode, debugEnabled]
  );

  /**
   * 执行高亮渲染（每次实时计算，不缓存结果——计算本身不费时，
   * 缓存多份全尺寸 ImageData 反而占用大量内存）。
   * putImageData（把像素绘制到 canvas）是真正耗时的步骤，
   * 由 ImageCanvas 的 onRendered 在绘制完成后收起遮罩。
   * 关键不变式：processing=true 必然伴随一次 setDisplayData（新引用），
   * 从而触发 canvas 重绘 → onRendered 收起遮罩。
   */
  const doHighlight = useCallback(
    (color: PerlerColor, index: number, th: number, dim: number) => {
      if (!originalData) return;

      // 取消上一次待执行的渲染，避免过期结果覆盖本次
      cancelPendingRender();
      setActiveIndex(index);
      setProcessing(true);

      // 延迟计算，让遮罩动画先渲染；定时器 id 存入 ref，供后续操作取消。
      // 结果为新的 ImageData，必然触发 canvas 重绘 → onRendered 收起遮罩
      renderTimerRef.current = window.setTimeout(() => {
        renderTimerRef.current = null;
        const result = computeHighlight(color, th, dim, outlineEnabled, outlineWidth, outlineColor);
        if (!result) return;
        setDisplayData(result.imageData);

        // 调试信息：用于判断阈值效果与 mask 后处理效果
        const ms = result.maskStats;
        const ol = result.outline;
        console.log(
          `[颜色高亮] ${color.code} RGB(${toRgb(color).r}, ${toRgb(color).g}, ${toRgb(color).b})\n` +
            `Threshold: ${th} | DimFactor: ${dim}%\n` +
            `Matched pixels: ${result.matchedPixels}\n` +
            `Total pixels: ${result.totalPixels}\n` +
            `Match ratio: ${((result.matchedPixels / result.totalPixels) * 100).toFixed(2)}%\n` +
            `[mask 后处理] 算法: ${ms?.algorithm ?? '-'} | Closing Radius: ${ms?.closingRadius ?? '-'}\n` +
            `删除噪点: ${ms?.removedComponents ?? 0} 个区域 / ${ms?.removedNoisePixels ?? 0} 像素 | 填洞: ${ms?.filledHolePixels ?? 0} 像素 | 最终 true: ${ms?.finalTruePixels ?? 0}\n` +
            `[色块描边] ${ol ? `开启 | 宽度 ${ol.strokeWidth}px | 颜色 ${outlineColor} RGB(${ol.borderColor.r}, ${ol.borderColor.g}, ${ol.borderColor.b}) | 边界 ${ol.boundaryPixels} 像素` : '关闭'}`
        );
      }, 100);
    },
    [originalData, computeHighlight, cancelPendingRender, outlineEnabled, outlineWidth, outlineColor, toRgb]
  );

  /** 确认选择色号：去重后加入列表（同时保存当前匹配范围）并触发高亮 */
  const handleConfirm = useCallback(
    (color: PerlerColor) => {
      const existingIndex = colorList.findIndex((item) => item.color.code === color.code);
      if (existingIndex >= 0) {
        // 重复色号：不重复加入列表，但更新其保存的匹配范围并切换高亮渲染
        setColorList((prev) =>
          prev.map((item, i) => (i === existingIndex ? { ...item, threshold } : item))
        );
        doHighlight(color, existingIndex, threshold, dimPercent);
        return;
      }
      const newIndex = colorList.length;
      setColorList((prev) => [...prev, { color, threshold }]);
      doHighlight(color, newIndex, threshold, dimPercent);
    },
    [colorList, doHighlight, threshold, dimPercent]
  );

  /** 点击已选色号：恢复该颜色独立保存的匹配范围，并重新查看高亮 */
  const handleSelectColor = useCallback(
    (index: number) => {
      const item = colorList[index];
      setThreshold(item.threshold);
      doHighlight(item.color, index, item.threshold, dimPercent);
    },
    [colorList, doHighlight, dimPercent]
  );

  /** 删除已选色号：若删的是当前高亮项则回到原图（同样展示进度遮罩），其余索引顺延 */
  const handleDeleteColor = useCallback(
    (index: number) => {
      setColorList((prev) => prev.filter((_, i) => i !== index));
      if (activeIndex === index) {
        cancelPendingRender();
        if (originalData && originalData !== displayDataRef.current) {
          setProcessing(true);
          setDisplayData(originalData);
        } else {
          // 无需重绘：收起可能遗留的遮罩
          setProcessing(false);
        }
        setActiveIndex(-1);
      } else if (activeIndex > index) {
        setActiveIndex(activeIndex - 1);
      }
    },
    [activeIndex, originalData, cancelPendingRender]
  );

  /** 查看原图（展示与渲染一致的进度遮罩） */
  const handleShowOriginal = useCallback(() => {
    if (!originalData) return;
    cancelPendingRender();
    // 已在展示原图：无需重绘，收起可能遗留的遮罩
    if (originalData === displayDataRef.current) {
      setProcessing(false);
      setActiveIndex(-1);
      return;
    }
    setProcessing(true);
    setDisplayData(originalData);
    setActiveIndex(-1);
  }, [originalData, cancelPendingRender]);

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

  /**
   * 背景亮度回调：更新状态后由下方 effect 实时重新渲染当前高亮。
   * 10 档固定调节 + 30ms 防抖定时器，避免连续拖动时重复计算堆积。
   */
  const handleDimChange = useCallback((value: number) => {
    setDimPercent(value);
  }, []);

  /* ---- 渲染参数实时刷新：修改描边开关/宽度/颜色或背景亮度后，
         立即重新渲染当前高亮结果（不重跑识别、不显示进度遮罩） ---- */

  /** 最新渲染上下文 ref：供实时刷新 effect 读取当前高亮状态 */
  const renderContextRef = useRef({ activeIndex, colorList, dimPercent, computeHighlight });
  renderContextRef.current = { activeIndex, colorList, dimPercent, computeHighlight };

  /** 上一次渲染参数值：用于区分“真实变更”与“初次挂载” */
  const prevRenderParamsRef = useRef({
    enabled: outlineEnabled, width: outlineWidth, color: outlineColor, dim: dimPercent,
  });

  useEffect(() => {
    const prev = prevRenderParamsRef.current;
    prevRenderParamsRef.current = {
      enabled: outlineEnabled, width: outlineWidth, color: outlineColor, dim: dimPercent,
    };
    // 初次挂载或未变更：跳过
    if (
      prev.enabled === outlineEnabled && prev.width === outlineWidth &&
      prev.color === outlineColor && prev.dim === dimPercent
    ) return;

    const ctx = renderContextRef.current;
    if (ctx.activeIndex < 0 || !ctx.colorList[ctx.activeIndex]) return;

    // 取消待执行的渲染，短延迟后重新计算（不显示进度遮罩，保持 UI 响应）。
    // 阈值使用该颜色独立保存的值（而非滑动条当前值），确保仅变更本次修改的参数
    cancelPendingRender();
    renderTimerRef.current = window.setTimeout(() => {
      renderTimerRef.current = null;
      const item = ctx.colorList[ctx.activeIndex];
      const result = ctx.computeHighlight(
        item.color,
        item.threshold,
        ctx.dimPercent,
        outlineEnabled,
        outlineWidth,
        outlineColor
      );
      if (result) setDisplayData(result.imageData);
    }, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlineEnabled, outlineWidth, outlineColor, dimPercent, cancelPendingRender]);

  return (
    <div className="app">
      {/* 开发者调试设置（暂时隐藏） */}
      {/* <DebugSettings
        debugEnabled={debugEnabled}
        onDebugEnabledChange={setDebugEnabled}
        maskMode={maskMode}
        onMaskModeChange={setMaskMode}
        closingRadius={closingRadius}
        onClosingRadiusChange={setClosingRadius}
      /> */}

      <header className="app-header">
        <h1>
          <img className="app-logo" src={`${import.meta.env.BASE_URL}icon.png`} alt="豆豆你呀" />
          豆豆你呀 - 拼豆图纸颜色高亮
        </h1>
        <p className="subtitle">上传图片 → 选择色号 → 确认高亮 → 循环选择</p>
      </header>

      <div className="app-layout">
        <div className="toolbar">
          <ImageUploader
            onImageLoad={handleImageLoad}
            onUploadStart={handleUploadStart}
            onUploadError={handleUploadError}
            disabled={uploading}
            openPickerRef={openPickerRef}
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

        {/* 渲染设置：宽屏在右侧栏（选择器下方），窄屏在选择器与画布之间 */}
        <RenderSettings
          value={dimPercent}
          onChange={handleDimChange}
          outlineEnabled={outlineEnabled}
          onOutlineEnabledChange={setOutlineEnabled}
          outlineWidth={outlineWidth}
          onOutlineWidthChange={setOutlineWidth}
          outlineColor={outlineColor}
          onOutlineColorChange={setOutlineColor}
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
            activeColor={activeIndex >= 0 ? colorList[activeIndex]?.color ?? null : null}
            onRendered={handleCanvasRendered}
            onPlaceholderClick={
              !hasEverUploaded && !uploading
                ? () => openPickerRef.current?.()
                : undefined
            }
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

      <footer className="app-footer">
        <p>豆豆你呀 · 开源拼豆工具</p>
        <p>Source Code licensed under AGPL-3.0. "豆豆你呀" name and logo are protected brand assets.</p>
      </footer>
    </div>
  );
}
