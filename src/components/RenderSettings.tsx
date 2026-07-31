/** 背景亮度可调范围：最小 10%（极暗），最大 90%（接近原图） */
const DIM_MIN = 10;
const DIM_MAX = 90;

interface RenderSettingsProps {
  /** 当前背景亮度百分比（10~90） */
  value: number;
  /** 亮度变化回调 */
  onChange: (value: number) => void;
  /** 禁用状态（如图片未上传） */
  disabled?: boolean;
}

/**
 * 渲染设置面板：控制非高亮区域（暗部）的明暗程度
 * 暗 = 非目标区域更暗（突出高亮），亮 = 非目标区域更亮（保留细节）
 */
export default function RenderSettings({ value, onChange, disabled }: RenderSettingsProps) {
  return (
    <div className="render-settings">
      <h3>渲染设置</h3>
      <div className="render-settings-item">
        <label className="render-settings-label">背景亮度</label>
        <div className="range-row">
          <span className="range-end">暗</span>
          <input
            type="range"
            className="range-slider"
            min={DIM_MIN}
            max={DIM_MAX}
            step={1}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            disabled={disabled}
            aria-label="背景亮度"
          />
          <span className="range-end">亮</span>
        </div>
        <p className="range-hint">暗：目标颜色更突出，其他区域更弱化；亮：保留更多原图色彩</p>
      </div>
    </div>
  );
}
