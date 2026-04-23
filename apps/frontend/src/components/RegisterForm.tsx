import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Venue, Zone, Seat, ZoneTable } from '../types';
import { formatPrice } from '../types';
import { SeatPicker } from './SeatPicker';
import { TablePicker } from './TablePicker';
import { VenueMap } from './VenueMap';

const ZONE_TYPE_BADGE: Record<string, string> = {
  GENERAL: '',
  SEATED: 'С местами',
  TABLE: 'Столы',
};

export function RegisterForm() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [venueId, setVenueId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState<{ name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [seats, setSeats] = useState<Seat[]>([]);
  const [tables, setTables] = useState<ZoneTable[]>([]);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const venueParam = params.get('venue');
    api.getVenues().then(v => {
      setVenues(v);
      if (venueParam) setVenueId(venueParam);
    });
  }, []);

  useEffect(() => {
    if (!venueId) { setZones([]); setZoneId(''); return; }
    api.getZones(venueId).then(setZones);
  }, [venueId]);

  useEffect(() => {
    setSelectedSeatId(null);
    setSelectedTableId(null);
    setSeats([]);
    setTables([]);
    if (!zoneId) return;

    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;

    if (zone.type === 'SEATED') {
      setSubLoading(true);
      api.getSeats(zoneId).then(setSeats).finally(() => setSubLoading(false));
    } else if (zone.type === 'TABLE') {
      setSubLoading(true);
      api.getTables(zoneId).then(setTables).finally(() => setSubLoading(false));
    }
  }, [zoneId, zones]);

  const selectedVenue = venues.find(v => v.id === venueId);
  const currency = selectedVenue?.currency ?? '₼';
  const selectedZone = zones.find(z => z.id === zoneId);
  const selectedSeat = seats.find(s => s.id === selectedSeatId);
  const selectedTable = tables.find(t => t.id === selectedTableId);

  const maxGuests = (() => {
    if (!selectedZone) return 0;
    if (selectedZone.type === 'TABLE' && selectedTable) {
      return selectedTable.available - 1;
    }
    if (selectedZone.type === 'SEATED') return 0;
    return (selectedZone.available ?? 0) - 1;
  })();

  const totalPrice = selectedZone ? selectedZone.price * (1 + guests.length) : 0;

  const canSubmit = (() => {
    if (!selectedZone || !name || !phone) return false;
    if (selectedZone.type === 'SEATED') return !!selectedSeatId;
    if (selectedZone.type === 'TABLE') return !!selectedTableId;
    return (selectedZone.available ?? 0) >= 1 + guests.length;
  })();

  const addGuest = () => setGuests(g => [...g, { name: '' }]);
  const removeGuest = (i: number) => setGuests(g => g.filter((_, idx) => idx !== i));
  const updateGuest = (i: number, val: string) =>
    setGuests(g => g.map((g, idx) => (idx === i ? { name: val } : g)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.register({
        name: name.trim(),
        phone: phone.trim(),
        venueId,
        zoneId,
        guests,
        ...(selectedSeatId && { seatId: selectedSeatId }),
        ...(selectedTableId && { tableId: selectedTableId }),
      });
      window.location.href = `/ticket?id=${result.id}`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка при регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-emerald-800">🍵 Tea Ticket</h1>
          <p className="text-gray-600 mt-2">Забронируйте место на мероприятие</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {venues.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Мероприятие</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                  value={venueId}
                  onChange={e => setVenueId(e.target.value)}
                  required
                >
                  <option value="">Выберите мероприятие</option>
                  {venues.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({new Date(v.date).toLocaleDateString('ru-RU')})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Zone selector: map if available, cards otherwise */}
            {zones.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Зона</label>
                {selectedVenue && zones.some(z => z.layoutData !== null) ? (
                  <VenueMap
                    venue={selectedVenue}
                    zones={zones}
                    selectedZoneId={zoneId}
                    currency={currency}
                    onZoneClick={z => setZoneId(z.id)}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {zones.map(z => {
                      const isSelected = z.id === zoneId;
                      const isEmpty = (z.available ?? 0) <= 0;
                      const badge = ZONE_TYPE_BADGE[z.type];
                      return (
                        <button
                          key={z.id}
                          type="button"
                          disabled={isEmpty}
                          onClick={() => setZoneId(z.id)}
                          className={[
                            'flex justify-between items-center rounded-xl border-2 px-4 py-3 text-left transition-colors',
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50'
                              : isEmpty
                                ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 hover:border-emerald-300',
                          ].join(' ')}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{z.name}</span>
                              {badge && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                  {badge}
                                </span>
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
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Seat picker for SEATED zones */}
            {selectedZone?.type === 'SEATED' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Выберите место
                  {selectedSeat && (
                    <span className="ml-2 text-emerald-600 font-semibold">
                      · Место {selectedSeat.label ?? selectedSeat.number}, ряд {selectedSeat.row}
                    </span>
                  )}
                </label>
                {subLoading ? (
                  <div className="text-center text-gray-400 py-4 text-sm">Загрузка...</div>
                ) : (
                  <SeatPicker
                    seats={seats}
                    selectedSeatId={selectedSeatId}
                    onSelect={s => setSelectedSeatId(s.id)}
                  />
                )}
              </div>
            )}

            {/* Table picker for TABLE zones */}
            {selectedZone?.type === 'TABLE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Выберите стол
                  {selectedTable && (
                    <span className="ml-2 text-emerald-600 font-semibold">
                      · Стол {selectedTable.number}
                    </span>
                  )}
                </label>
                {subLoading ? (
                  <div className="text-center text-gray-400 py-4 text-sm">Загрузка...</div>
                ) : (
                  <TablePicker
                    tables={tables}
                    selectedTableId={selectedTableId}
                    guestCount={guests.length}
                    onSelect={t => setSelectedTableId(t.id)}
                  />
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ваше имя</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
              <input
                type="tel"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>

            {/* Guests — only for GENERAL and TABLE zones */}
            {selectedZone && selectedZone.type !== 'SEATED' && (
              <>
                {guests.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Гости</label>
                    {guests.map((g, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          placeholder={`Гость ${i + 1}`}
                          className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                          value={g.name}
                          onChange={e => updateGuest(i, e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => removeGuest(i)}
                          className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addGuest}
                  disabled={!selectedZone || guests.length >= maxGuests}
                  className="text-sm text-emerald-700 hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  + Добавить гостя
                </button>
              </>
            )}

            {totalPrice > 0 && (
              <div className="p-4 bg-emerald-600 rounded-xl text-white">
                <div className="flex justify-between items-center">
                  <span className="text-sm opacity-90">
                    Итого · {1 + guests.length} {guests.length === 0 ? 'человек' : 'чел.'}
                  </span>
                  <span className="text-2xl font-bold">{formatPrice(totalPrice, currency)}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
