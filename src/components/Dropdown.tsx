import { useState, useRef, useEffect, useCallback } from 'react';

export interface DropdownOption {
  value: string | number;
  label: string;
}

interface DropdownProps {
  /** 当前选中值 */
  value: string | number;
  /** 选中变化回调 */
  onChange: (value: string | number) => void;
  /** 选项列表 */
  options: DropdownOption[];
  /** 禁用状态 */
  disabled?: boolean;
  /** 无障碍标签 */
  ariaLabel?: string;
}

/**
 * 自定义下拉选择器：替代原生 <select>，避免移动端点击后弹出全屏系统选择界面。
 * - 下拉列表就近展示在触发按钮下方，支持滚动（max-height 限制）
 * - 点击外部区域 / 按 Esc 自动关闭，选中选项后关闭
 * - 展开/收起带简单过渡动画
 */
export default function Dropdown({
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const current = options.find((o) => o.value === value);

  /** 点击外部区域或按 Esc 关闭 */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /** 展开时将当前选中项滚动到可视区域 */
  useEffect(() => {
    if (open && listRef.current) {
      const active = listRef.current.querySelector('.dropdown-item.active');
      active?.scrollIntoView({ block: 'nearest' });
    }
  }, [open]);

  const handleSelect = useCallback(
    (v: string | number) => {
      onChange(v);
      setOpen(false);
    },
    [onChange]
  );

  return (
    <div
      className={`dropdown${open ? ' dropdown--open' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="dropdown-value">{current?.label ?? '--'}</span>
        <span className="dropdown-arrow" aria-hidden="true">▾</span>
      </button>
      <ul className="dropdown-list" role="listbox" aria-label={ariaLabel} ref={listRef}>
        {options.map((opt) => (
          <li
            key={opt.value}
            role="option"
            aria-selected={opt.value === value}
            className={`dropdown-item${opt.value === value ? ' active' : ''}`}
            onClick={() => handleSelect(opt.value)}
          >
            {opt.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
