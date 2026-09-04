import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { translateApiError } from '../i18n/apiErrors';
import { formatEventDateTime } from '../i18n/format';
import { api } from '../services/api';
import type { Venue, Zone, Seat, ZoneTable } from '../types';
import { formatPrice } from '../types';
import {
  cartCount as countCart,
  cartSeatIds as idsFromCart,
  cartTotal as sumCart,
  pruneOccupiedSeats,
  toCheckoutItems,
  toggleSeatInCart,
  type CartLine,
} from '../lib/cart';
import { SeatPicker } from './SeatPicker';
import { TablePicker } from './TablePicker';
import { VenueGridMap } from './VenueGridMap';
import { QuantityModal } from './QuantityModal';
import { BackLink } from './BackLink';
import { TableSeatPicker } from './TableSeatPicker';
// Header/Footer stay out of public pages — they carry the other instance's branding.
// import { Header } from './Header';
// import { Footer } from './Footer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  slug: string;
}

export function RegisterForm({ slug }: Props) {
  const { t } = useTranslation();
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
  const [quantityModalTable, setQuantityModalTable] = useState<{ zone: Zone; table: ZoneTable } | null>(null);
  const [gridMapOpen, setGridMapOpen] = useState(false);
  const [gridCartSnapshot, setGridCartSnapshot] = useState<CartLine[] | null>(null);

  useEffect(() => {
    document.title = t('titles.register');
  }, [t]);

  useEffect(() => {
    api.getVenueBySlug(slug)
      .then(setVenue)
      .catch(() => setVenueNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!venue) return;
    api.getZones(venue.id).then(setZones);
  }, [venue]);

  const currency = venue?.currency ?? '₼';
  const zoneById = new Map(zones.map(z => [z.id, z]));

  const gridZoneIds = new Set<string>();
  if (venue?.gridLayout) {
    for (const row of venue.gridLayout.cells) {
      for (const cell of row) if (cell !== 'empty' && cell !== 'blocked' && cell !== 'stage') gridZoneIds.add(cell);
    }
  }
  const hasGridZones = gridZoneIds.size > 0;
  // A SEATED/TABLE zone with zero ever-created seats/tables is an unfinished
  // admin draft (created but never drawn on the grid) — not a sellable legacy
  // zone. GENERAL zones are excluded from this check: their capacity is a
  // standalone field set by the admin and is valid without any drawing.
  const isPhantomZone = (z: Zone) => (z.type === 'SEATED' || z.type === 'TABLE') && (z.totalCapacity ?? 0) === 0;
  const tableZones = zones.filter(z => z.type === 'TABLE' && !gridZoneIds.has(z.id) && !isPhantomZone(z));
  const cardZones = zones.filter(z => z.type !== 'TABLE' && !gridZoneIds.has(z.id) && !isPhantomZone(z));

  const legacyTableZoneKey = tableZones.map(z => z.id).join(',');
  useEffect(() => {
    const tableZoneIds = legacyTableZoneKey ? legacyTableZoneKey.split(',') : [];
    if (tableZoneIds.length === 0) { setTablesByZone({}); return; }
    let cancelled = false;
    Promise.all(tableZoneIds.map(id => api.getTables(id).then(tables => [id, tables] as const)))
      .then(entries => { if (!cancelled) setTablesByZone(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [legacyTableZoneKey]);

  const cartSeatIds = idsFromCart(cart);
  const cartQuantityByZone: Record<string, number> = {};
  const cartQuantityByTable: Record<string, number> = {};
  for (const line of cart) {
    if (line.tableId) cartQuantityByTable[line.tableId] = (cartQuantityByTable[line.tableId] ?? 0) + line.quantity;
    else if (!line.seatId) cartQuantityByZone[line.zoneId] = (cartQuantityByZone[line.zoneId] ?? 0) + line.quantity;
  }
  const cartCount = countCart(cart);
  const cartTotal = sumCart(cart);
  const gridCartCount = cart.filter(l => gridZoneIds.has(l.zoneId)).reduce((s, l) => s + l.quantity, 0);

  useEffect(() => {
    const needed = Math.max(0, cartCount - 1);
    setGuestNameInputs(prev => {
      if (prev.length === needed) return prev;
      const next = prev.slice(0, needed);
      while (next.length < needed) next.push('');
      return next;
    });
  }, [cartCount]);

  const ticketsLabel = (count: number) => t('register.totalTickets', {
    count,
    tickets: t('register.tickets', { count }),
  });

  const toggleSeat = (zone: Zone, seat: Seat, table?: ZoneTable) => {
    setCart(prev => toggleSeatInCart(prev, zone, seat, table));
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

  const openGridMap = () => {
    setGridCartSnapshot(cart);
    setGridMapOpen(true);
  };

  const closeGridMap = () => {
    setGridMapOpen(false);
    setGridCartSnapshot(null);
  };

  const cancelGridSelection = () => {
    if (gridCartSnapshot) setCart(gridCartSnapshot);
    closeGridMap();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venue || cart.length === 0) return;
    setError('');
    setLoading(true);
    try {
      const items = toCheckoutItems(cart);
      if (items.some(i => i.seatIds?.length)) {
        try {
          const inventory = await api.getGridData(venue.id);
          const occupied = [
            ...inventory.seats.filter(s => s.occupied).map(s => s.id),
            ...inventory.tables.flatMap(tbl => (tbl.seats ?? []).filter(s => s.occupied).map(s => s.id)),
          ];
          const nextCart = pruneOccupiedSeats(cart, occupied);
          if (nextCart.length !== cart.length) {
            setCart(nextCart);
            setError(t('errors.seatAlreadyBooked'));
            setLoading(false);
            return;
          }
        } catch {
          // Backend still re-checks availability; continue with local cart.
        }
      }
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
      setError(translateApiError(err, 'register.registerError'));
    } finally {
      setLoading(false);
    }
  };

  if (venueNotFound) {
    return (
      <div className="app-bg flex flex-col">
        {/* <Header /> */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-4xl mb-2">🔍</div>
            <h1 className="text-xl font-semibold text-gray-700">{t('register.notFoundTitle')}</h1>
            <p className="text-gray-500 mt-1">{t('register.notFoundHint')}</p>
            <a href="/" className="inline-block mt-4 text-emerald-700 hover:underline">{t('common.toAfisha')}</a>
          </div>
        </div>
        {/* <Footer /> */}
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="app-bg flex items-center justify-center text-gray-400">
        {t('common.loading')}
      </div>
    );
  }

  const canSubmit = cart.length > 0 && !!name.trim() && !!phone && isValidPhoneNumber(phone) &&
    EMAIL_RE.test(email.trim()) && (!namedGuests || guestNameInputs.every(g => g.trim()));

  const legacySeatZone = legacySeatZoneId ? zoneById.get(legacySeatZoneId) : undefined;
  const quantityModalZone = quantityModalZoneId ? zoneById.get(quantityModalZoneId) : undefined;

  return (
    <div className="app-bg flex flex-col">
      {/* <Header /> */}
      <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <BackLink href="/" label={t('common.toAfisha')} className="mb-4" />
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-emerald-800">🍵 {venue.name}</h1>
          <p className="text-gray-600 mt-2">{formatEventDateTime(venue.date)}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {hasGridZones && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('register.seats')}</label>
                <button
                  type="button"
                  onClick={openGridMap}
                  className={[
                    'w-full flex justify-between items-center rounded-xl border-2 px-4 py-3 text-left transition-colors',
                    gridCartCount > 0 ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300',
                  ].join(' ')}
                >
                  <span className="font-medium text-gray-800">
                    {gridCartCount > 0 ? t('register.changeSeats') : t('register.chooseSeats')}
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
                cartQuantityByTable={cartQuantityByTable}
                onZoneOpen={zone => setQuantityModalZoneId(zone.id)}
                onSeatToggle={(zone, seat, table) => toggleSeat(zone, seat, table)}
                onClearZone={zone => setGeneralQuantity(zone, 0)}
                onTableOpen={(zone, table) => setQuantityModalTable({ zone, table })}
                onOccupiedSeatIds={ids => setCart(prev => pruneOccupiedSeats(prev, ids))}
                onClose={closeGridMap}
                onCancel={cancelGridSelection}
                quantityModalOpen={!!quantityModalZoneId || !!quantityModalTable}
              />
            )}

            {cardZones.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {hasGridZones ? t('register.otherZones') : t('register.zone')}
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
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{t('register.withSeats')}</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 mt-0.5">
                            {formatPrice(z.price, currency)}
                            {z.available !== undefined && (
                              <span className={z.available <= 5 ? 'text-amber-600 ml-1' : 'ml-1'}>
                                · {t('register.seatsCount', { count: z.available })}
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

            {legacySeatZoneId && legacySeatZone && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('register.seatsLabel', { name: legacySeatZone.name })}
                </label>
                {legacySeatsLoading ? (
                  <div className="text-center text-gray-400 py-4 text-sm">{t('common.loading')}</div>
                ) : (
                  <SeatPicker
                    seats={legacySeatsCache[legacySeatZoneId] ?? []}
                    selectedSeatIds={cartSeatIds}
                    onToggle={seat => toggleSeat(legacySeatZone, seat)}
                  />
                )}
              </div>
            )}

            {tableZones.length > 0 && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">{t('register.tables')}</label>
                {tableZones.map(zone => (
                  <div key={zone.id}>
                    {tableZones.length > 1 && (
                      <div className="text-xs text-gray-500 mb-1">{zone.name} · {formatPrice(zone.price, currency)}</div>
                    )}
                    <TablePicker
                      tables={tablesByZone[zone.id] ?? []}
                      selectedSeatIds={cartSeatIds}
                      onOpen={table => setQuantityModalTable({ zone, table })}
                    />
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div data-testid="cart" className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-200">
                <div className="text-sm font-medium text-gray-700">{t('register.cart')}</div>
                <div className="space-y-1.5">
                  {cart.map(line => {
                    const max = line.tableId
                      ? (line.tableAvailable ?? Infinity)
                      : (zoneById.get(line.zoneId)?.available ?? Infinity);
                    return (
                      <div key={line.key} data-testid="cart-item" className="flex items-center justify-between text-sm gap-2">
                        <div className="min-w-0 truncate">
                          <span className="text-gray-800">{line.zoneName}</span>
                          {line.tableNumber !== undefined && (
                            <span className="text-gray-400"> · {t('register.tableLine', { number: line.tableNumber })}</span>
                          )}
                          {line.seatLabel && (
                            <span className="text-gray-400"> · {t('register.seatLine', { number: line.seatLabel })}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {line.seatId ? (
                            <button
                              type="button"
                              data-testid="cart-remove"
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
                <div data-testid="cart-total" className="flex justify-between items-center border-t border-gray-200 pt-2 font-semibold text-gray-800 text-sm">
                  <span>{ticketsLabel(cartCount)}</span>
                  <span>{formatPrice(cartTotal, currency)}</span>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="register-name" className="block text-sm font-medium text-gray-700 mb-1">{t('register.yourName')}</label>
              <input
                id="register-name"
                data-testid="register-name"
                type="text"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="register-phone" className="block text-sm font-medium text-gray-700 mb-1">{t('register.phoneLabel')}</label>
              <PhoneInput
                international
                defaultCountry="AZ"
                placeholder="XX XXX XX XX"
                value={phone}
                onChange={setPhone}
                numberInputProps={{ id: 'register-phone', 'data-testid': 'register-phone' }}
                required
              />
              {!!phone && !isValidPhoneNumber(phone) && (
                <p className="text-xs text-red-500 mt-1">{t('register.phoneInvalid')}</p>
              )}
            </div>

            <div>
              <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">{t('register.emailLabel')}</label>
              <input
                id="register-email"
                data-testid="register-email"
                type="email"
                placeholder={t('register.emailPlaceholder')}
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
                  {t('register.nameOtherGuests', { count: cartCount - 1 })}
                </label>
                {!namedGuests ? (
                  <p className="text-xs text-gray-400 mt-1">
                    {t('register.guestDefaultHint')}
                  </p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {guestNameInputs.map((val, i) => (
                      <input
                        key={i}
                        type="text"
                        placeholder={t('register.guestPlaceholder', { number: i + 1 })}
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
                    {ticketsLabel(cartCount)}
                  </span>
                  <span className="text-2xl font-bold text-emerald-800">{formatPrice(cartTotal, currency)}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              data-testid="register-submit"
              disabled={loading || !canSubmit}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <span data-testid="cart-checkout">
                {loading ? t('register.buying') : t('register.buy')}
              </span>
            </button>
          </form>
        </div>
      </div>
      </div>

      {quantityModalZone && (
        <QuantityModal
          title={quantityModalZone.name}
          price={quantityModalZone.price}
          currency={currency}
          quantity={cartQuantityByZone[quantityModalZone.id] ?? 0}
          max={quantityModalZone.available ?? Infinity}
          onChange={qty => setGeneralQuantity(quantityModalZone, qty)}
          onClose={() => setQuantityModalZoneId(null)}
        />
      )}

      {quantityModalTable && (
        <TableSeatPicker
          zoneName={quantityModalTable.zone.name}
          table={quantityModalTable.table}
          seats={quantityModalTable.table.seats ?? []}
          selectedSeatIds={cartSeatIds}
          price={quantityModalTable.zone.price}
          currency={currency}
          onToggle={seat => toggleSeat(quantityModalTable.zone, seat, quantityModalTable.table)}
          onClose={() => setQuantityModalTable(null)}
        />
      )}
      {/* <Footer /> */}
    </div>
  );
}
