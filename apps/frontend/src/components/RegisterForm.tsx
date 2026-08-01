import { useState, useEffect } from 'react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { api } from '../services/api';
import type { Venue, Zone, Seat, ZoneTable, CartItem } from '../types';
import { formatPrice } from '../types';
import { SeatPicker } from './SeatPicker';
import { TablePicker } from './TablePicker';
import { VenueMap } from './VenueMap';
import { VenueGridMap } from './VenueGridMap';
import { QuantityModal } from './QuantityModal';

interface CartLine {
  key: string;
  zoneId: string;
  zoneName: string;
  price: number;
  quantity: number;
  seatId?: string;
  seatLabel?: string;
  tableId?: string;
  tableNumber?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

interface Props {
  slug: string;
}

export function RegisterForm({ slug }: Props) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venueNotFound, setVenueNotFound] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<string | undefined>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [namedGuests, setNamedGuests] = useState(false);
  const [guestNameInputs, setGuestNameInputs] = useState<string[]>([]);

  const [tablesByZone, setTablesByZone] = useState<Record<string, ZoneTable[]>>({});

  const [legacySeatZoneId, setLegacySeatZoneId] = useState<string | null>(null);
  const [legacySeatsCache, setLegacySeatsCache] = useState<Record<string, Seat[]>>({});
  const [legacySeatsLoading, setLegacySeatsLoading] = useState(false);

  const [quantityModalZoneId, setQuantityModalZoneId] = useState<string | null>(null);
  const [gridMapOpen, setGridMapOpen] = useState(false);

  useEffect(() => {
    api.getVenueBySlug(slug)
      .then(setVenue)
      .catch(() => setVenueNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!venue) return;
    api.getZones(venue.id).then(setZones);
  }, [venue]);

  // Tables live outside the grid — fetch them for every table zone up front.
  useEffect(() => {
    const tableZoneIds = zones.filter(z => z.type === 'TABLE').map(z => z.id);
    if (tableZoneIds.length === 0) { setTablesByZone({}); return; }
    let cancelled = false;
    Promise.all(tableZoneIds.map(id => api.getTables(id).then(tables => [id, tables] as const)))
      .then(entries => { if (!cancelled) setTablesByZone(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [zones]);

  const currency = venue?.currency ?? '₼';
  const zoneById = new Map(zones.map(z => [z.id, z]));

  const gridZoneIds = new Set<string>();
  if (venue?.gridLayout) {
    for (const row of venue.gridLayout.cells) {
      for (const cell of row) if (cell !== 'empty' && cell !== 'blocked') gridZoneIds.add(cell);
    }
  }
  const schemaZoneIds = new Set(zones.filter(z => z.layoutData !== null).map(z => z.id));
  const hasGridZones = gridZoneIds.size > 0;
  const hasSchemaZones = !hasGridZones && schemaZoneIds.size > 0;
  const tableZones = zones.filter(z => z.type === 'TABLE');
  const cardZones = zones.filter(z => z.type !== 'TABLE' && !gridZoneIds.has(z.id) && !schemaZoneIds.has(z.id));

  const cartSeatIds = cart.filter(l => l.seatId).map(l => l.seatId!);
  const cartQuantityByZone: Record<string, number> = {};
  const cartQuantityByTable: Record<string, number> = {};
  for (const line of cart) {
    if (line.tableId) cartQuantityByTable[line.tableId] = (cartQuantityByTable[line.tableId] ?? 0) + line.quantity;
    else if (!line.seatId) cartQuantityByZone[line.zoneId] = (cartQuantityByZone[line.zoneId] ?? 0) + line.quantity;
  }
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const gridCartCount = cart.filter(l => gridZoneIds.has(l.zoneId)).reduce((s, l) => s + l.quantity, 0);

  // Keep the optional per-guest name inputs in sync with the cart size
  useEffect(() => {
    const needed = Math.max(0, cartCount - 1);
    setGuestNameInputs(prev => {
      if (prev.length === needed) return prev;
      const next = prev.slice(0, needed);
      while (next.length < needed) next.push('');
      return next;
    });
  }, [cartCount]);

  const toggleSeatInCart = (zone: Zone, seat: Seat) => {
    const key = `seat:${seat.id}`;
    setCart(prev => {
      if (prev.some(l => l.key === key)) return prev.filter(l => l.key !== key);
      return [...prev, {
        key, zoneId: zone.id, zoneName: zone.name, price: zone.price,
        seatId: seat.id, seatLabel: seat.label ?? String(seat.number), quantity: 1,
      }];
    });
  };

  const setGeneralQuantity = (zone: Zone, quantity: number) => {
    const key = `general:${zone.id}`;
    setCart(prev => {
      if (quantity <= 0) return prev.filter(l => l.key !== key);
      const existing = prev.find(l => l.key === key);
      if (existing) return prev.map(l => (l.key === key ? { ...l, quantity } : l));
      return [...prev, { key, zoneId: zone.id, zoneName: zone.name, price: zone.price, quantity }];
    });
  };

  const addTableToCart = (zone: Zone, table: ZoneTable) => {
    const key = `table:${table.id}`;
    setCart(prev => {
      const existing = prev.find(l => l.key === key);
      if ((existing?.quantity ?? 0) >= table.available) return prev;
      if (existing) return prev.map(l => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, {
        key, zoneId: zone.id, zoneName: zone.name, price: zone.price,
        tableId: table.id, tableNumber: table.number, quantity: 1,
      }];
    });
  };

  const adjustQuantity = (key: string, delta: number, max: number) => {
    setCart(prev => prev
      .map(l => (l.key === key ? { ...l, quantity: Math.min(max, l.quantity + delta) } : l))
      .filter(l => l.quantity > 0));
  };

  const removeLine = (key: string) => setCart(prev => prev.filter(l => l.key !== key));

  const openSeatZone = (zone: Zone) => {
    setLegacySeatZoneId(zone.id);
    if (legacySeatsCache[zone.id]) return;
    setLegacySeatsLoading(true);
    api.getSeats(zone.id)
      .then(seats => setLegacySeatsCache(prev => ({ ...prev, [zone.id]: seats })))
      .finally(() => setLegacySeatsLoading(false));
  };

  const handleZoneClick = (zone: Zone) => {
    if (zone.type === 'SEATED') openSeatZone(zone);
    else if (zone.type === 'GENERAL') setQuantityModalZoneId(zone.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venue || cart.length === 0) return;
    setError('');
    setLoading(true);
    try {
      const items: CartItem[] = cart.map(line => {
        if (line.seatId) return { zoneId: line.zoneId, seatIds: [line.seatId] };
        if (line.tableId) return { zoneId: line.zoneId, tableId: line.tableId, quantity: line.quantity };
        return { zoneId: line.zoneId, quantity: line.quantity };
      });
      const result = await api.register({
        name: name.trim(),
        phone: (phone ?? '').trim(),
        email: email.trim(),
        venueId: venue.id,
        items,
        ...(namedGuests && { guestNames: guestNameInputs.map(g => g.trim()) }),
      });
      window.location.href = `/ticket?id=${result.id}&new=1`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка при регистрации');
    } finally {
      setLoading(false);
    }
  };

  if (venueNotFound) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-4xl mb-2">🔍</div>
          <h1 className="text-xl font-semibold text-gray-700">Мероприятие не найдено</h1>
          <p className="text-gray-500 mt-1">Возможно, ссылка устарела или мероприятие уже прошло.</p>
          <a href="/" className="inline-block mt-4 text-emerald-700 hover:underline">На афишу</a>
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Загрузка...
      </div>
    );
  }

  const canSubmit = cart.length > 0 && !!name.trim() && !!phone && isValidPhoneNumber(phone) &&
    EMAIL_RE.test(email.trim()) && (!namedGuests || guestNameInputs.every(g => g.trim()));

  const legacySeatZone = legacySeatZoneId ? zoneById.get(legacySeatZoneId) : undefined;
  const quantityModalZone = quantityModalZoneId ? zoneById.get(quantityModalZoneId) : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-emerald-800">🍵 {venue.name}</h1>
          <p className="text-gray-600 mt-2">
            {new Date(venue.date).toLocaleString('ru-RU', {
              day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Grid / schema map */}
            {hasGridZones && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Места</label>
                <button
                  type="button"
                  onClick={() => setGridMapOpen(true)}
                  className={[
                    'w-full flex justify-between items-center rounded-xl border-2 px-4 py-3 text-left transition-colors',
                    gridCartCount > 0 ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300',
                  ].join(' ')}
                >
                  <span className="font-medium text-gray-800">
                    {gridCartCount > 0 ? 'Изменить выбор мест' : 'Выберите места'}
                  </span>
                  {gridCartCount > 0 && (
                    <span className="text-emerald-700 font-semibold text-sm shrink-0">× {gridCartCount}</span>
                  )}
                </button>
              </div>
            )}

            {gridMapOpen && (
              <VenueGridMap
                venue={venue}
                zones={zones}
                currency={currency}
                cartSeatIds={cartSeatIds}
                cartQuantityByZone={cartQuantityByZone}
                onZoneOpen={zone => setQuantityModalZoneId(zone.id)}
                onSeatToggle={toggleSeatInCart}
                onClose={() => setGridMapOpen(false)}
              />
            )}

            {hasSchemaZones && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Зона</label>
                <VenueMap
                  venue={venue}
                  zones={zones}
                  selectedZoneId={legacySeatZoneId}
                  currency={currency}
                  onZoneClick={handleZoneClick}
                />
              </div>
            )}

            {/* Zones without any visual layout — plain cards */}
            {cardZones.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {hasGridZones || hasSchemaZones ? 'Другие зоны' : 'Зона'}
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {cardZones.map(z => {
                    const inCartQty = cartQuantityByZone[z.id] ?? 0;
                    const isEmpty = (z.available ?? 0) <= inCartQty;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        disabled={isEmpty}
                        onClick={() => handleZoneClick(z)}
                        className={[
                          'flex justify-between items-center rounded-xl border-2 px-4 py-3 text-left transition-colors',
                          inCartQty > 0 || legacySeatZoneId === z.id
                            ? 'border-emerald-600 bg-emerald-50'
                            : isEmpty
                              ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                              : 'border-gray-200 hover:border-emerald-300',
                        ].join(' ')}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">{z.name}</span>
                            {z.type === 'SEATED' && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">С местами</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 mt-0.5">
                            {formatPrice(z.price, currency)}
                            {z.available !== undefined && (
                              <span className={z.available <= 5 ? 'text-amber-600 ml-1' : 'ml-1'}>
                                · {z.available} мест
                              </span>
                            )}
                          </div>
                        </div>
                        {inCartQty > 0 && (
                          <span className="text-emerald-700 font-semibold text-sm shrink-0">× {inCartQty}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Seats for a SEATED zone picked via the schema map or a card */}
            {legacySeatZoneId && legacySeatZone && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Места · {legacySeatZone.name}
                </label>
                {legacySeatsLoading ? (
                  <div className="text-center text-gray-400 py-4 text-sm">Загрузка...</div>
                ) : (
                  <SeatPicker
                    seats={legacySeatsCache[legacySeatZoneId] ?? []}
                    selectedSeatIds={cartSeatIds}
                    onToggle={seat => toggleSeatInCart(legacySeatZone, seat)}
                  />
                )}
              </div>
            )}

            {/* Tables */}
            {tableZones.length > 0 && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Столы</label>
                {tableZones.map(zone => (
                  <div key={zone.id}>
                    {tableZones.length > 1 && (
                      <div className="text-xs text-gray-500 mb-1">{zone.name} · {formatPrice(zone.price, currency)}</div>
                    )}
                    <TablePicker
                      tables={tablesByZone[zone.id] ?? []}
                      cartQuantityByTable={cartQuantityByTable}
                      onAdd={table => addTableToCart(zone, table)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Cart */}
            {cart.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-200">
                <div className="text-sm font-medium text-gray-700">Корзина</div>
                <div className="space-y-1.5">
                  {cart.map(line => {
                    const max = line.tableId
                      ? (tablesByZone[line.zoneId]?.find(t => t.id === line.tableId)?.available ?? Infinity)
                      : (zoneById.get(line.zoneId)?.available ?? Infinity);
                    return (
                      <div key={line.key} className="flex items-center justify-between text-sm gap-2">
                        <div className="min-w-0 truncate">
                          <span className="text-gray-800">{line.zoneName}</span>
                          {line.seatLabel && <span className="text-gray-400"> · место {line.seatLabel}</span>}
                          {line.tableNumber !== undefined && <span className="text-gray-400"> · стол {line.tableNumber}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {line.seatId ? (
                            <button
                              type="button"
                              onClick={() => removeLine(line.key)}
                              className="text-red-400 hover:text-red-600 text-xs px-1"
                            >
                              ✕
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => adjustQuantity(line.key, -1, max)}
                                className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 text-xs leading-none"
                              >
                                –
                              </button>
                              <span className="w-4 text-center text-xs">{line.quantity}</span>
                              <button
                                type="button"
                                onClick={() => adjustQuantity(line.key, 1, max)}
                                disabled={line.quantity >= max}
                                className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 text-xs leading-none disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                          )}
                          <span className="text-gray-500 text-xs w-16 text-right shrink-0">
                            {formatPrice(line.price * line.quantity, currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center border-t border-gray-200 pt-2 font-semibold text-gray-800 text-sm">
                  <span>Итого · {cartCount} {pluralize(cartCount, 'билет', 'билета', 'билетов')}</span>
                  <span>{formatPrice(cartTotal, currency)}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ваше имя *</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
              <PhoneInput
                international
                defaultCountry="AZ"
                placeholder="XX XXX XX XX"
                value={phone}
                onChange={setPhone}
                required
              />
              {!!phone && !isValidPhoneNumber(phone) && (
                <p className="text-xs text-red-500 mt-1">Проверьте номер телефона</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            {cartCount > 1 && (
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={namedGuests}
                    onChange={e => setNamedGuests(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Указать имена остальных ({cartCount - 1})
                </label>
                {!namedGuests ? (
                  <p className="text-xs text-gray-400 mt-1">
                    Будут отмечены как «Гость 1», «Гость 2»...
                  </p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {guestNameInputs.map((val, i) => (
                      <input
                        key={i}
                        type="text"
                        placeholder={`Гость ${i + 1}`}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                        value={val}
                        onChange={e => setGuestNameInputs(g => g.map((x, idx) => (idx === i ? e.target.value : x)))}
                        required
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {cartTotal > 0 && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-emerald-700">
                    Итого · {cartCount} {pluralize(cartCount, 'билет', 'билета', 'билетов')}
                  </span>
                  <span className="text-2xl font-bold text-emerald-800">{formatPrice(cartTotal, currency)}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Покупка...' : 'Купить'}
            </button>
          </form>
        </div>
      </div>

      {quantityModalZone && (
        <QuantityModal
          zone={quantityModalZone}
          currency={currency}
          quantity={cartQuantityByZone[quantityModalZone.id] ?? 0}
          max={quantityModalZone.available ?? Infinity}
          onChange={qty => setGeneralQuantity(quantityModalZone, qty)}
          onClose={() => setQuantityModalZoneId(null)}
        />
      )}
    </div>
  );
}
