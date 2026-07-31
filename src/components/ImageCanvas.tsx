import { useEffect, useRef, useState } from 'react';
import { renderImageData } from '../utils/imageProcess';
import { type PerlerColor } from '../utils/perlerPalette';

interface ImageCanvasProps {
  /** 原始图片数据 */
  originalData: ImageData | null;
  /** 当前渲染的图片数据（可能是高亮后的） */
  displayData: ImageData | null;
  /** 当前高亮的颜色（null = 原图，不标注） */
  activeColor: PerlerColor | null;
  /** Canvas 绘制完成回调（用于精确控制进度遮罩的收起时机） */
  onRendered?: () => void;
  /** 占位区点击上传回调（仅首次未上传时提供，传入后占位区可点击触发上传） */
  onPlaceholderClick?: () => void;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.5;

/**
 * 图片画布组件：显示图纸图片，支持缩放，尺寸栏右侧标注当前高亮颜色
 */
export default function ImageCanvas({
  originalData,
  displayData,
  activeColor,
  onRendered,
  onPlaceholderClick,
}: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 缩放倍率：1 = 适应容器宽度 */
  const [zoom, setZoom] = useState(1);

  // 渲染当前显示数据
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !displayData) return;
    renderImageData(canvas, displayData);
    // putImageData 是真正耗时的步骤：在其完成后才通知绘制结束，
    // 保证进度遮罩在 canvas 真正画完后才收起，避免“进度条消失但页面仍在卡顿”
    onRendered?.();
  }, [displayData, onRendered]);

  // 上传新图时重置缩放
  useEffect(() => {
    setZoom(1);
  }, [originalData]);

  // 缩放操作
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, +(z * ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, +(z / ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoom(1);

  if (!displayData) {
    return (
      <div
        className={`canvas-placeholder${onPlaceholderClick ? ' canvas-placeholder--clickable' : ''}`}
        onClick={onPlaceholderClick}
        role={onPlaceholderClick ? 'button' : undefined}
        aria-label={onPlaceholderClick ? '点击上传拼豆图纸图片' : undefined}
      >
        <p>请先上传拼豆图纸图片</p>
        <p className="hint">支持 JPG / PNG 格式{onPlaceholderClick ? '，点击此处直接上传' : ''}</p>
      </div>
    );
  }

  return (
    <div className="canvas-container">
      <div className="zoom-bar">
        <button className="btn-zoom" onClick={zoomOut} title="缩小">
          ➖
        </button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button className="btn-zoom" onClick={zoomIn} title="放大">
          ➕
        </button>
        <button className="btn-zoom" onClick={zoomReset} title="适应宽度">
          适应
        </button>
        {activeColor && (
          <span className="active-color-badge">
            <span
              className="active-color-swatch"
              style={{ backgroundColor: activeColor.hex }}
            />
            <span className="active-color-code">{activeColor.code}</span>
          </span>
        )}
      </div>
      <div className="canvas-viewport">
        <canvas ref={canvasRef} style={{ width: `${zoom * 100}%` }} />
      </div>
    </div>
  );
}
