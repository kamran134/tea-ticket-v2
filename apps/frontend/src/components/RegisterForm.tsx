import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Venue, Zone } from '../types';
import { formatPrice } from '../types';

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

  const selectedVenue = venues.find(v => v.id === venueId);
  const currency = selectedVenue?.currency ?? '₼';
  const selectedZone = zones.find(z => z.id === zoneId);
  const totalPrice = selectedZone ? selectedZone.price * (1 + guests.length) : 0;
  const maxGuests = selectedZone ? (selectedZone.available ?? 0) - 1 : 0;

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Зона</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
              value={zoneId}
              onChange={e => setZoneId(e.target.value)}
              required
              disabled={!venueId}
            >
              <option value="">Выберите зону</option>
              {zones.map(z => (
                <option key={z.id} value={z.id} disabled={(z.available ?? 0) <= 0}>
                  {z.name} — {formatPrice(z.price, currency)}
                  {z.available !== undefined ? ` (мест: ${z.available})` : ''}
                </option>
              ))}
            </select>
          </div>

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
            disabled={loading}
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
