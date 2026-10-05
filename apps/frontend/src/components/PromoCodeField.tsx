import { useTranslation } from 'react-i18next';

interface Props {
  id: string;
  input: string;
  appliedCode: string | null;
  shownCode: string | null;
  loading: boolean;
  error: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  tone: 'form' | 'map';
  testId?: string;
  applyTestId?: string;
}

export function PromoCodeField({
  id,
  input,
  appliedCode,
  shownCode,
  loading,
  error,
  onChange,
  onApply,
  onClear,
  tone,
  testId,
  applyTestId,
}: Props) {
  const { t } = useTranslation();
  const map = tone === 'map';

  const apply = () => {
    if (!input.trim() || loading) return;
    onApply();
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className={map ? 'block text-xs seat-map-muted' : 'block text-sm font-medium text-gray-700'}
      >
        {t('register.promoLabel')}
      </label>
      {appliedCode ? (
        <div
          className={map
            ? 'flex items-center justify-between gap-2 rounded-lg px-3 py-2'
            : 'flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2'}
          style={map ? {
            border: '1px solid var(--map-chip-border)',
            background: 'var(--map-chip-bg)',
            color: 'var(--map-chip-fg)',
          } : undefined}
        >
          <span className={map ? 'text-sm font-medium' : 'text-sm font-medium text-emerald-800'}>
            {shownCode ?? appliedCode}
            {loading ? '…' : ''}
          </span>
          <button
            type="button"
            onClick={onClear}
            className={map ? 'text-xs hover:underline' : 'text-xs text-emerald-700 hover:underline'}
          >
            {t('register.promoRemove')}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            id={id}
            data-testid={testId}
            value={input}
            onChange={e => onChange(e.target.value.toUpperCase())}
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              apply();
            }}
            placeholder={t('register.promoPlaceholder')}
            autoCapitalize="characters"
            className={map
              ? 'flex-1 min-w-0 rounded-lg px-3 py-2 text-sm uppercase bg-transparent border focus:outline-none focus:ring-2 focus:ring-emerald-500/40'
              : 'flex-1 border border-gray-300 rounded-lg px-4 py-2.5 uppercase focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500'}
            style={map ? { borderColor: 'var(--map-border)', color: 'var(--map-fg)' } : undefined}
          />
          <button
            type="button"
            data-testid={applyTestId}
            disabled={loading || !input.trim()}
            onClick={apply}
            className={map
              ? 'px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50'
              : 'px-4 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50'}
          >
            {t('register.promoApply')}
          </button>
        </div>
      )}
      {error && (
        <p className={map ? 'text-xs text-red-400' : 'text-xs text-red-500'}>{error}</p>
      )}
    </div>
  );
}
