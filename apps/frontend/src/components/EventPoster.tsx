import { useTranslation } from 'react-i18next';
import { formatEventDateTime } from '../i18n/format';
import { formatPrice, type Currency } from '../types';

interface Props {
  name: string;
  date: string;
  posterImage: string | null;
  ageRating: string | null;
  currency: Currency | string;
  /** Min zone price; omit or null when there are no sellable zones yet. */
  minPrice: number | null;
  /** True when zone prices differ (show "from min"). */
  hasPriceRange: boolean;
}

/**
 * Hero poster for the public event page. Overlay text stays light on a dark
 * gradient so it remains readable in both light and dark themes.
 */
export function EventPoster({
  name,
  date,
  posterImage,
  ageRating,
  currency,
  minPrice,
  hasPriceRange,
}: Props) {
  const { t } = useTranslation();

  const priceLabel =
    minPrice == null
      ? null
      : hasPriceRange
        ? t('register.priceFrom', { price: formatPrice(minPrice, currency) })
        : formatPrice(minPrice, currency);

  return (
    <div className="relative aspect-[16/9] rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-emerald-100 to-amber-100">
      {posterImage ? (
        <img
          src={posterImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-5xl" aria-hidden>
          🍵
        </div>
      )}

      {/* keep-white: dark-theme CSS remaps gray/emerald text; overlay stays light */}
      <div className="keep-white absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10" />

      <div className="keep-white absolute inset-0 flex flex-col justify-end p-4 sm:p-5 text-white">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight drop-shadow-sm">
            {name}
          </h1>
          {ageRating && (
            <span className="shrink-0 rounded-md bg-white/20 px-2 py-0.5 text-sm font-semibold backdrop-blur-sm">
              {ageRating}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm sm:text-base text-white/90">
          {formatEventDateTime(date)}
        </p>
        {priceLabel && (
          <p className="mt-1 text-sm sm:text-base font-semibold text-white/95">
            {priceLabel}
          </p>
        )}
      </div>
    </div>
  );
}
