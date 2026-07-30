interface ProgressOverlayProps {
  /** 提示文字 */
  label: string;
}

/**
 * 进度遮罩内容：提示文字 + 三个跳动小点动画（上传 / 渲染高亮通用）
 * 不显示具体进度数字；小点动画仅用 transform / opacity（GPU 合成），
 * 即使主线程被图像处理重活短暂阻塞，动画依然流畅跳动
 */
export default function ProgressOverlay({ label }: ProgressOverlayProps) {
  return (
    <div className="upload-progress">
      <span className="upload-progress-title">{label}</span>
      <span className="loading-dots" aria-hidden="true">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </span>
    </div>
  );
}
