import { type PerlerColor } from '../utils/perlerPalette';

interface ControlPanelProps {
  /** 已确认的色号列表 */
  colorList: PerlerColor[];
  /** 当前正在高亮的颜色索引（-1 表示显示原图） */
  activeIndex: number;
  /** 是否正在处理 */
  processing: boolean;
  /** 是否已上传图片 */
  hasImage: boolean;
  /** 点击已选色号，查看高亮 */
  onSelectColor: (index: number) => void;
  /** 查看原图 */
  onShowOriginal: () => void;
  /** 删除某个已选色号 */
  onDeleteColor: (index: number) => void;
}

/**
 * 控制面板：已选色号列表 + 状态显示
 * 「查看原图」作为列表首项，与色卡同宽，整体更整齐
 */
export default function ControlPanel({
  colorList,
  activeIndex,
  processing,
  hasImage,
  onSelectColor,
  onShowOriginal,
  onDeleteColor,
}: ControlPanelProps) {
  return (
    <div className="control-panel">
      <h3>已选颜色列表</h3>

      {processing && <div className="status processing">⏳ 正在处理...</div>}
      {!processing && activeIndex >= 0 && (
        <div className="status done">✅ 已高亮该颜色</div>
      )}

      {!hasImage ? (
        <p className="empty-hint">请先上传拼豆图纸图片</p>
      ) : (
        <>
          <ul className="color-list">
            {/* 查看原图：置顶，与色卡同宽 */}
            <li>
              <button
                className={`color-item original-item ${activeIndex === -1 ? 'active' : ''}`}
                onClick={onShowOriginal}
              >
                <span className="original-icon">🖼️</span>
                <span className="color-label">
                  查看原图
                  <span className="color-hex">显示未高亮的原始图纸</span>
                </span>
              </button>
            </li>

            {colorList.map((color, i) => (
              <li key={`${color.code}-${i}`} className="color-item-wrap">
                <button
                  className={`color-item ${i === activeIndex ? 'active' : ''}`}
                  onClick={() => onSelectColor(i)}
                >
                  <span
                    className="color-swatch small"
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="color-label">
                    {color.code}
                    <span className="color-hex">RGB: {color.rgb.join(', ')}</span>
                  </span>
                </button>
                <button
                  className="color-delete"
                  onClick={() => onDeleteColor(i)}
                  title="删除该颜色"
                  aria-label={`删除 ${color.code}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          {colorList.length === 0 && (
            <p className="empty-hint">尚未选择颜色，请在上方选择拼豆色号并确认</p>
          )}
        </>
      )}
    </div>
  );
}
