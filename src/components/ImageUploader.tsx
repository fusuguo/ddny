import { useEffect, useRef } from 'react';

interface ImageUploaderProps {
  onImageLoad: (img: HTMLImageElement) => void;
  /** 开始上传回调（用于触发进度条与暂停态） */
  onUploadStart?: () => void;
  /** 上传/加载失败回调（用于退出暂停态） */
  onUploadError?: () => void;
  /** 禁用状态（加载中暂停） */
  disabled?: boolean;
  /** 暴露“打开文件选择器”函数（供 canvas 占位区点击上传使用） */
  openPickerRef?: React.MutableRefObject<(() => void) | null>;
}

/**
 * 图片上传组件：用户选择本地拼豆图纸图片
 */
export default function ImageUploader({
  onImageLoad,
  onUploadStart,
  onUploadError,
  disabled,
  openPickerRef,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // 注册“打开文件选择器”函数，供外部（canvas 占位区）触发上传
  useEffect(() => {
    if (openPickerRef) {
      openPickerRef.current = () => inputRef.current?.click();
      return () => { openPickerRef.current = null; };
    }
  }, [openPickerRef]);

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
    img.onerror = () => {
      // 加载失败（文件损坏等）：释放资源并通知上层退出暂停态
      URL.revokeObjectURL(url);
      onUploadError?.();
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
