export interface VenuePlace {
  name: string;
  address: string;
}

export const emptyVenuePlace = (): VenuePlace => ({ name: '', address: '' });

export function venuePlaceFromVenue(v: { venueName: string | null; venueAddress: string | null }): VenuePlace {
  return { name: v.venueName ?? '', address: v.venueAddress ?? '' };
}

/** Blank fields clear the stored value. */
export function venuePlacePayload(place: VenuePlace): { venueName: string | null; venueAddress: string | null } {
  return { venueName: place.name.trim() || null, venueAddress: place.address.trim() || null };
}

const PLACE_MAX = 200;

interface Props {
  value: VenuePlace;
  onChange: (value: VenuePlace) => void;
  compact?: boolean;
}

/** Hall name and street address: shown on the event page and sent to search engines. */
export function VenuePlaceFields({ value, onChange, compact = false }: Props) {
  const inputClass = compact
    ? 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-brand/40'
    : 'w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {!compact && <label className="block text-xs text-gray-400 -mb-2">Площадка (город — Баку)</label>}
      <input
        className={inputClass}
        placeholder="Название площадки, напр. Jazz Center"
        aria-label="Название площадки"
        maxLength={PLACE_MAX}
        value={value.name}
        onChange={e => onChange({ ...value, name: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="Адрес, напр. ул. Рашида Бейбутова, 19"
        aria-label="Адрес площадки"
        maxLength={PLACE_MAX}
        value={value.address}
        onChange={e => onChange({ ...value, address: e.target.value })}
      />
    </div>
  );
}
