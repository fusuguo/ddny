import { useState } from 'react';
import { type MaskHoleFillMode } from '../utils/maskProcessor';

/** Closing Radius 可选项（1~12，用于测试不同 kernel 大小对色号洞填充的影响） */
const RADIUS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

interface DebugSettingsProps {
  /** Debug 模式是否开启 */
  debugEnabled: boolean;
  onDebugEnabledChange: (v: boolean) => void;
  /** 当前 mask 后处理填洞算法模式 */
  maskMode: MaskHoleFillMode;
  onMaskModeChange: (m: MaskHoleFillMode) => void;
  /** 闭运算半径 */
  closingRadius: number;
  onClosingRadiusChange: (r: number) => void;
}

/* ---- 内联样式：调试浮层独立于主 UI，避免污染 App.css ---- */
const btnStyle: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  right: 12,
  zIndex: 9999,
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: '1px solid #bdc3c7',
  background: '#fff',
  fontSize: 20,
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 60,
  right: 12,
  zIndex: 9999,
  width: 264,
  background: '#fff',
  border: '1px solid #d0d0d0',
  borderRadius: 10,
  boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
  padding: 14,
  fontSize: 13,
  color: '#2c3e50',
  fontFamily: 'sans-serif',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 12,
  paddingBottom: 10,
  borderBottom: '1px solid #eee',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

const radioRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 6,
  cursor: 'pointer',
};

/**
 * 开发者调试设置（右上角浮动按钮 + 面板）。
 *
 * 定位：开发者调试功能，仅用于算法测试，普通用户无需修改。
 * 包含：
 *   1. Debug 模式开关（默认关闭）：开启后显示 mask 调试对比浮层与额外日志；
 *   2. Mask 后处理模式：Morphology Closing（当前方案）/ Binary Hole Filling（对比方案）；
 *   3. Closing Radius（1~12）：仅 Morphology Closing 模式生效。
 *
 * 交互约定（与渲染参数滑动条一致，防卡死）：所有设置仅更新状态，
 * 不触发实时重渲染，在下次确认色号 / 点击已选色号（即下一次高亮）时生效。
 */
export default function DebugSettings({
  debugEnabled,
  onDebugEnabledChange,
  maskMode,
  onMaskModeChange,
  closingRadius,
  onClosingRadiusChange,
}: DebugSettingsProps) {
  /** 面板展开/收起 */
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        style={btnStyle}
        onClick={() => setOpen((v) => !v)}
        aria-label="开发者调试设置"
        title="开发者调试设置"
      >
        🛠️
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>开发者调试设置</div>
          <div style={{ fontSize: 11, color: '#95a5a6', lineHeight: 1.5, marginBottom: 12 }}>
            开发者调试功能，仅用于算法测试，普通用户无需修改。
          </div>

          {/* 1. Debug 模式开关 */}
          <div style={sectionStyle}>
            <label style={labelStyle}>
              <input
                type="checkbox"
                checked={debugEnabled}
                onChange={(e) => onDebugEnabledChange(e.target.checked)}
              />
              Debug 模式
            </label>
            <div style={{ fontSize: 11, color: '#95a5a6', marginTop: 4 }}>
              开启后显示 mask 调试对比浮层与额外日志
            </div>
          </div>

          {/* 2. Mask 后处理模式选择 */}
          <div style={sectionStyle}>
            <div style={{ fontWeight: 600 }}>Mask 后处理模式</div>
            <label style={radioRowStyle}>
              <input
                type="radio"
                name="mask-mode"
                value="closing"
                checked={maskMode === 'closing'}
                onChange={() => onMaskModeChange('closing')}
              />
              A. Morphology Closing（当前方案）
            </label>
            <label style={radioRowStyle}>
              <input
                type="radio"
                name="mask-mode"
                value="holefill"
                checked={maskMode === 'holefill'}
                onChange={() => onMaskModeChange('holefill')}
              />
              B. Binary Hole Filling（对比方案）
            </label>
          </div>

          {/* 3. Closing Radius（仅 closing 模式可调） */}
          <div style={{ ...sectionStyle, borderBottom: 'none', marginBottom: 4, paddingBottom: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Closing Radius</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onClosingRadiusChange(r)}
                  disabled={maskMode !== 'closing'}
                  style={{
                    width: 'calc((100% - 30px) / 6)',
                    padding: '4px 0',
                    borderRadius: 4,
                    border: '1px solid',
                    borderColor: closingRadius === r ? '#3498db' : '#ccc',
                    background: closingRadius === r ? '#3498db' : '#fff',
                    color: closingRadius === r ? '#fff' : '#2c3e50',
                    cursor: maskMode === 'closing' ? 'pointer' : 'not-allowed',
                    opacity: maskMode === 'closing' ? 1 : 0.4,
                    fontSize: 12,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#95a5a6', marginTop: 6 }}>
              仅 Morphology Closing 模式生效
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#e67e22', marginTop: 8 }}>
            ⚠️ 设置在下次高亮渲染时生效
          </div>
        </div>
      )}
    </>
  );
}
