interface Props {
  title: string;
  message: string;
  copyLabel: string;
  stayLabel: string;
  leaveLabel: string;
  onCopy: () => void;
  onStay: () => void;
  onLeave: () => void;
}

export function SaveLinkLeaveDialog({
  title,
  message,
  copyLabel,
  stayLabel,
  leaveLabel,
  onCopy,
  onStay,
  onLeave,
}: Props) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onStay} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-link-leave-title"
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
      >
        <h3 id="save-link-leave-title" className="text-lg font-semibold text-gray-800">
          {title}
        </h3>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={onCopy}
            className="w-full py-2.5 text-sm text-white rounded-xl bg-emerald-600 hover:bg-emerald-700 transition-colors font-semibold"
          >
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={onStay}
            className="w-full py-2.5 text-sm text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            {stayLabel}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            {leaveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
