import { useInboundEmailUnread } from '../lib/useInboundEmailUnread';

interface Props {
  authenticated: boolean;
  variant?: 'light' | 'dark';
}

export function InboundEmailBadge({ authenticated, variant = 'light' }: Props) {
  const { unreadCount, marking, markAllRead } = useInboundEmailUnread(authenticated);

  if (!authenticated || unreadCount === 0) {
    return null;
  }

  const isDark = variant === 'dark';

  return (
    <button
      type="button"
      onClick={() => void markAllRead()}
      disabled={marking}
      title="Отметить прочитанными"
      aria-label={`${unreadCount} непрочитанных писем. Отметить прочитанными`}
      className={`relative inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
        isDark
          ? 'text-gray-300 hover:text-white hover:bg-gray-800'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      <MailIcon />
      <span
        className={`absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[10px] font-bold leading-[1.125rem] text-center ${
          isDark ? 'bg-emerald-500 text-gray-900' : 'bg-emerald-600 text-white'
        }`}
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    </button>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8.25V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.25M3 8.25 12 13.5 21 8.25M3 8.25l8.1-4.5a1 1 0 0 1 .98 0L21 8.25"
      />
    </svg>
  );
}
