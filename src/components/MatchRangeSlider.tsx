/** 匹配阈值可调范围：小 = 严格匹配，大 = 宽泛匹配 */
const THRESHOLD_MIN = 5;
const THRESHOLD_MAX = 60;

interface MatchRangeSliderProps {
  /** 当前匹配阈值 */
  value: number;
  /** 阈值变化回调 */
  onChange: (value: number) => void;
  /** 禁用状态（如图片未上传） */
  disabled?: boolean;
}

/**
 * 颜色匹配范围滑动条：弱（严格匹配）→ 强（宽泛匹配）
 * 不直接展示具体数值，避免用户困惑
 */
export default function MatchRangeSlider({
  value,
  onChange,
  disabled,
}: MatchRangeSliderProps) {
  return (
    <div className="match-range">
      <h3>颜色匹配范围</h3>
      <div className="range-row">
        <span className="range-end">弱</span>
        <input
          type="range"
          className="range-slider"
          min={THRESHOLD_MIN}
          max={THRESHOLD_MAX}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          disabled={disabled}
          aria-label="颜色匹配范围"
        />
        <span className="range-end">强</span>
      </div>
      <p className="range-hint">弱：仅高亮最接近的区域；强：高亮更多相似颜色</p>
    </div>
  );
}
