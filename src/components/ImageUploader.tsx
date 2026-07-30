import { useRef } from 'react';

interface ImageUploaderProps {
  onImageLoad: (img: HTMLImageElement) => void;
  /** 开始上传回调（用于触发进度条与暂停态） */
  onUploadStart?: () => void;
  /** 禁用状态（加载中暂停） */
  disabled?: boolean;
}

/**
 * 图片上传组件：用户选择本地拼豆图纸图片
 */
export default function ImageUploader({ onImageLoad, onUploadStart, disabled }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onUploadStart?.();

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onImageLoad(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;

    // 允许重复选择同一文件
    e.target.value = '';
  };

  return (
    <div className="uploader">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        className="btn btn-primary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        {disabled ? '⏸ 加载中...' : '📁 上传拼豆图纸'}
      </button>
    </div>
  );
}
