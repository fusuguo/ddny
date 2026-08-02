/**
 * 颜色匹配范围固定档位（10 档）：精确（5）→ 宽松（60）。
 * 滑动条与加减按钮均只允许在固定档位间移动，不支持连续数值。
 */
export const THRESHOLD_LEVELS = [5, 11, 17, 23, 29, 36, 42, 48, 54, 60];

/** 默认匹配阈值（取最接近旧默认值 20 的档位） */
export const DEFAULT_THRESHOLD = 23;

/** 查找与给定值最接近的档位索引（兼容非档位值） */
function nearestLevelIndex(value: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < THRESHOLD_LEVELS.length; i++) {
    const d = Math.abs(THRESHOLD_LEVELS[i] - value);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

interface MatchRangeSliderProps {
  /** 当前匹配阈值 */
  value: number;
  /** 阈值变化回调 */
  onChange: (value: number) => void;
  /** 禁用状态（如图片未上传） */
  disabled?: boolean;
}

/**
 * 颜色匹配范围滑动条：精确（严格匹配）→ 宽松（宽泛匹配）
 * 10 档固定调节，不直接展示具体数值，避免用户困惑。
 * 保持原有交互约定：调整仅更新状态，不做实时重渲染，
 * 在下次确认色号 / 点击已选色号时生效。
 */
export default function MatchRangeSlider({
  value,
  onChange,
  disabled,
}: MatchRangeSliderProps) {
  const levelIndex = nearestLevelIndex(value);
  const maxIndex = THRESHOLD_LEVELS.length - 1;

  /** 逐档调整：-1 = 更精确，+1 = 更宽松 */
  const step = (dir: -1 | 1) => {
    const next = levelIndex + dir;
    if (next >= 0 && next <= maxIndex) onChange(THRESHOLD_LEVELS[next]);
  };

  return (
    <div className="match-range">
      <h3>颜色匹配范围</h3>
      <div className="range-row">
        <span className="range-end">精确</span>
        <button
          type="button"
          className="step-btn"
          onClick={() => step(-1)}
          disabled={disabled || levelIndex <= 0}
          aria-label="缩小匹配范围（更精确）"
        >
          −
        </button>
        <input
          type="range"
          className="range-slider"
          min={0}
          max={maxIndex}
          step={1}
          value={levelIndex}
          onChange={(e) => onChange(THRESHOLD_LEVELS[parseInt(e.target.value, 10)])}
          disabled={disabled}
          aria-label="颜色匹配范围"
        />
        <button
          type="button"
          className="step-btn"
          onClick={() => step(1)}
          disabled={disabled || levelIndex >= maxIndex}
          aria-label="扩大匹配范围（更宽松）"
        >
          +
        </button>
        <span className="range-end">宽松</span>
      </div>
      <p className="range-hint">精确：颜色更接近会被高亮；<br />宽松：更多相似颜色会被高亮</p>
    </div>
  );
}
