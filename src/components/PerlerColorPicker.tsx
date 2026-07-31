import { useState, useMemo } from 'react';
import {
  type PerlerColor,
  getLetters,
  getNumbersForLetter,
  findByCode,
} from '../utils/perlerPalette';
import MatchRangeSlider from './MatchRangeSlider';

interface PerlerColorPickerProps {
  /** 确认选择回调，传出完整色号数据 */
  onConfirm: (color: PerlerColor) => void;
  /** 当前颜色匹配阈值 */
  threshold: number;
  /** 阈值变化回调 */
  onThresholdChange: (value: number) => void;
  /** 禁用状态（如图片未上传或正在处理） */
  disabled?: boolean;
}

/**
 * Perler 色号选择器：字母 + 数字两级下拉框，实时预览颜色，确认后触发高亮
 * 内嵌“颜色匹配范围”滑动条（位于色卡预览与确认按钮之间）
 */
export default function PerlerColorPicker({
  onConfirm,
  threshold,
  onThresholdChange,
  disabled,
}: PerlerColorPickerProps) {
  const letters = useMemo(() => getLetters(), []);
  const [letter, setLetter] = useState(letters[0] ?? 'A');

  const numbers = useMemo(() => getNumbersForLetter(letter), [letter]);
  const [number, setNumber] = useState(numbers[0] ?? 1);

  // 组合色号并查找色板数据
  const code = `${letter}${number}`;
  const current = findByCode(code);

  /** 切换字母时，重置数字为该字母下的第一个编号 */
  const handleLetterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLetter = e.target.value;
    setLetter(newLetter);
    const newNumbers = getNumbersForLetter(newLetter);
    setNumber(newNumbers[0] ?? 1);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNumber(parseInt(e.target.value, 10));
  };

  const handleConfirm = () => {
    if (current) onConfirm(current);
  };

  return (
    <div className="perler-picker">
      <h3>选择拼豆颜色</h3>

      <div className="picker-row">
        <select
          id="letter-select"
          value={letter}
          onChange={handleLetterChange}
          disabled={disabled}
          aria-label="字母"
        >
          {letters.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          id="number-select"
          value={number}
          onChange={handleNumberChange}
          disabled={disabled}
          aria-label="数字"
        >
          {numbers.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="picker-preview">
        <span
          className="color-swatch"
          style={{ backgroundColor: current?.hex ?? '#eee' }}
        />
        <div className="picker-info">
          <span className="picker-code">色号：{current?.code ?? '--'}</span>
          <span className="picker-rgb">
            RGB：{current ? current.rgb.join(', ') : '--'}
          </span>
        </div>
      </div>

      <MatchRangeSlider
        value={threshold}
        onChange={onThresholdChange}
        disabled={disabled}
      />

      <button
        className="btn btn-confirm"
        onClick={handleConfirm}
        disabled={disabled || !current}
      >
        ✅ 确认选择
      </button>
    </div>
  );
}
