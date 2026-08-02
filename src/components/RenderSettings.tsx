import {
  OUTLINE_WIDTH_MIN,
  OUTLINE_WIDTH_MAX,
} from '../utils/maskProcessor';

/**
 * 背景亮度固定档位（10 档）：10%（极暗）→ 90%（接近原图）。
 * 滑动条与加减按钮均只允许在固定档位间移动，不支持连续数值。
 */
export const DIM_LEVELS = [10, 19, 28, 37, 46, 54, 63, 72, 81, 90];

/** 默认背景亮度（取最接近旧默认值 75 的档位） */
export const DEFAULT_DIM_PERCENT = 72;

/** 查找与给定值最接近的档位索引（兼容非档位值） */
function nearestLevelIndex(levels: number[], value: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const d = Math.abs(levels[i] - value);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** 描边颜色固定选项：名称 + hex 值 */
export const OUTLINE_COLOR_OPTIONS: { name: string; value: string }[] = [
  { name: '红色', value: '#FF0000' },
  { name: '白色', value: '#FFFFFF' },
  { name: '青色', value: '#00FFFF' },
  { name: '蓝色', value: '#0000FF' },
  { name: '黑色', value: '#000000' },
  { name: '黄色', value: '#FFFF00' },
  { name: '粉色', value: '#FF69B4' },
  { name: '紫色', value: '#800080' },
  { name: '绿色', value: '#00FF00' },
];

interface RenderSettingsProps {
  /** 当前背景亮度百分比（档位值） */
  value: number;
  /** 亮度变化回调（实时生效） */
  onChange: (value: number) => void;
  /** 色块描边开关 */
  outlineEnabled: boolean;
  onOutlineEnabledChange: (v: boolean) => void;
  /** 描边宽度（0~5 px，0 = 关闭描边效果） */
  outlineWidth: number;
  onOutlineWidthChange: (v: number) => void;
  /** 描边颜色（hex 字符串） */
  outlineColor: string;
  onOutlineColorChange: (v: string) => void;
  /** 禁用状态（如图片未上传） */
  disabled?: boolean;
}

/**
 * 渲染设置面板：控制最终显示效果，所有修改均实时刷新预览
 * - 背景亮度：10 档固定调节（滑动条 + 加减按钮），暗 = 非目标区域更暗，亮 = 保留细节
 * - 色块描边：开关 / 宽度（输入框 + 外侧加减按钮）/ 颜色
 */
export default function RenderSettings({
  value,
  onChange,
  outlineEnabled,
  onOutlineEnabledChange,
  outlineWidth,
  onOutlineWidthChange,
  outlineColor,
  onOutlineColorChange,
  disabled,
}: RenderSettingsProps) {
  const dimIndex = nearestLevelIndex(DIM_LEVELS, value);
  const dimMaxIndex = DIM_LEVELS.length - 1;

  /** 亮度逐档调整：-1 = 更暗，+1 = 更亮 */
  const stepDim = (dir: -1 | 1) => {
    const next = dimIndex + dir;
    if (next >= 0 && next <= dimMaxIndex) onChange(DIM_LEVELS[next]);
  };

  return (
    <div className="render-settings">
      <h3>渲染设置</h3>
      <div className="render-settings-item">
        <label className="render-settings-label">背景亮度</label>
        <div className="range-row">
          <span className="range-end">暗</span>
          <button
            type="button"
            className="step-btn"
            onClick={() => stepDim(-1)}
            disabled={disabled || dimIndex <= 0}
            aria-label="背景调暗"
          >
            −
          </button>
          <input
            type="range"
            className="range-slider"
            min={0}
            max={dimMaxIndex}
            step={1}
            value={dimIndex}
            onChange={(e) => onChange(DIM_LEVELS[parseInt(e.target.value, 10)])}
            disabled={disabled}
            aria-label="背景亮度"
          />
          <button
            type="button"
            className="step-btn"
            onClick={() => stepDim(1)}
            disabled={disabled || dimIndex >= dimMaxIndex}
            aria-label="背景调亮"
          >
            +
          </button>
          <span className="range-end">亮</span>
        </div>
        <p className="range-hint">暗：目标颜色更突出，其他区域更弱化；<br />亮：保留更多原图色彩</p>
      </div>

      {/* 色块描边设置 */}
      <div className="render-settings-item outline-settings">
        <label className="outline-toggle">
          <input
            type="checkbox"
            checked={outlineEnabled}
            onChange={(e) => onOutlineEnabledChange(e.target.checked)}
            disabled={disabled}
          />
          <span className="render-settings-label" style={{ marginBottom: 0 }}>色块描边</span>
        </label>

        <div className={`outline-options${outlineEnabled ? '' : ' outline-options-disabled'}`}>
          {/* 描边宽度：数字输入框 + 外侧加减按钮 + px 单位（按钮始终可见，方便移动端） */}
          <div className="outline-width-row">
            <label className="outline-option-label" htmlFor="outline-width-input">描边宽度:</label>
            <input
              id="outline-width-input"
              type="number"
              className="outline-width-input"
              min={OUTLINE_WIDTH_MIN}
              max={OUTLINE_WIDTH_MAX}
              step={1}
              value={outlineWidth}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) {
                  onOutlineWidthChange(Math.min(OUTLINE_WIDTH_MAX, Math.max(OUTLINE_WIDTH_MIN, v)));
                }
              }}
              disabled={disabled || !outlineEnabled}
              aria-label="描边宽度"
            />
            <button
              type="button"
              className="step-btn step-btn--sm"
              onClick={() => onOutlineWidthChange(Math.max(OUTLINE_WIDTH_MIN, outlineWidth - 1))}
              disabled={disabled || !outlineEnabled || outlineWidth <= OUTLINE_WIDTH_MIN}
              aria-label="减小描边宽度"
            >
              −
            </button>
            <button
              type="button"
              className="step-btn step-btn--sm"
              onClick={() => onOutlineWidthChange(Math.min(OUTLINE_WIDTH_MAX, outlineWidth + 1))}
              disabled={disabled || !outlineEnabled || outlineWidth >= OUTLINE_WIDTH_MAX}
              aria-label="增大描边宽度"
            >
              +
            </button>
            <span className="outline-width-unit">px</span>
          </div>
          <p className="range-hint">0 表示关闭描边效果</p>

          {/* 描边颜色：固定颜色选项（色块预览 + 名称） */}
          <div className="outline-color-row">
            <span className="outline-option-label">描边颜色:</span>
            <div className="outline-color-grid">
              {OUTLINE_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`outline-color-btn${outlineColor === opt.value ? ' active' : ''}`}
                  onClick={() => onOutlineColorChange(opt.value)}
                  disabled={disabled || !outlineEnabled}
                  title={opt.name}
                  aria-label={`描边颜色：${opt.name}`}
                >
                  <span
                    className="outline-color-swatch"
                    style={{ background: opt.value }}
                  />
                  <span className="outline-color-name">{opt.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
