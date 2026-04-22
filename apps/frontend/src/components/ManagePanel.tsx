import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Venue, Zone, Ticket, Currency } from '../types';
import { CURRENCIES, formatPrice } from '../types';
import { toast } from '../services/toast';

type Tab = 'venues' | 'zones' | 'tickets';

function isTokenValid(): boolean {
  const token = localStorage.getItem('admin_token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp: number };
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

const ZONE_DEFAULTS = { name: '', price: '', cardNumber: '', capacity: '', sortOrder: '0' };

export function ManagePanel() {
  const [authenticated, setAuthenticated] = useState(isTokenValid);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('venues');

  // Venues
  const [venues, setVenues] = useState<Venue[]>([]);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueDate, setNewVenueDate] = useState('');
  const [newVenueCurrency, setNewVenueCurrency] = useState<Currency>('₼');

  // Zones
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [zones, setZones] = useState<Zone[]>([]);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [newZone, setNewZone] = useState(ZONE_DEFAULTS);

  // Pending tickets
  const [pendingTickets, setPendingTickets] = useState<Ticket[]>([]);
  const [filterVenueId, setFilterVenueId] = useState('');
  const [pendingLoading, setPendingLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const { token } = await api.login(password);
      localStorage.setItem('admin_token', token);
      setAuthenticated(true);
    } catch {
      setAuthError('Неверный пароль');
    }
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    setAuthenticated(false);
  };

  useEffect(() => {
    if (!authenticated) return;
    api.getVenues(true).then(setVenues);
  }, [authenticated]);

  useEffect(() => {
    if (!selectedVenueId) { setZones([]); return; }
    api.getZones(selectedVenueId).then(setZones);
  }, [selectedVenueId]);

  const loadPending = () => {
    setPendingLoading(true);
    api.getPendingTickets(filterVenueId || undefined)
      .then(setPendingTickets)
      .finally(() => setPendingLoading(false));
  };

  useEffect(() => {
    if (tab === 'tickets' && authenticated) loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filterVenueId, authenticated]);

  const errMsg = (err: unknown) => err instanceof Error ? err.message : 'Ошибка';

  const createVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const venue = await api.createVenue(
        newVenueName.trim(),
        new Date(newVenueDate).toISOString(),
        newVenueCurrency,
      );
      setVenues(v => [venue, ...v]);
      setNewVenueName('');
      setNewVenueDate('');
      setNewVenueCurrency('₼');
      toast.success('Мероприятие создано');
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const createZone = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const zone = await api.createZone({
        venueId: selectedVenueId,
        name: newZone.name,
        price: Number(newZone.price),
        cardNumber: newZone.cardNumber,
        capacity: Number(newZone.capacity),
        sortOrder: Number(newZone.sortOrder),
      });
      setZones(z => [...z, zone]);
      setNewZone(ZONE_DEFAULTS);
      toast.success('Зона добавлена');
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const saveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingZone) return;
    try {
      const updated = await api.updateZone(editingZone.id, {
        name: editingZone.name,
        price: editingZone.price,
        cardNumber: editingZone.cardNumber,
        capacity: editingZone.capacity,
        sortOrder: editingZone.sortOrder,
      });
      setZones(z => z.map(zone => (zone.id === updated.id ? updated : zone)));
      setEditingZone(null);
      toast.success('Зона сохранена');
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const deleteZone = async (id: string) => {
    if (!confirm('Удалить зону? Билеты не удаляются.')) return;
    try {
      await api.deleteZone(id);
      setZones(z => z.filter(zone => zone.id !== id));
      toast.success('Зона удалена');
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const handleTicketStatus = async (id: string, status: 'CONFIRMED' | 'REJECTED') => {
    try {
      await api.updateTicketStatus(id, status);
      setPendingTickets(t => t.filter(ticket => ticket.id !== id));
      toast.success(status === 'CONFIRMED' ? 'Билет подтверждён' : 'Билет отклонён');
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const copyRegistrationLink = (venueId: string) => {
    const url = `${window.location.origin}/?venue=${venueId}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Ссылка скопирована'));
  };

  const toggleVenueActive = async (id: string, active: boolean) => {
    try {
      const updated = await api.toggleVenue(id, active);
      setVenues(v => v.map(venue => (venue.id === updated.id ? updated : venue)));
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const selectedVenue = venues.find(v => v.id === selectedVenueId);
  const zoneCurrency = selectedVenue?.currency ?? '₼';
  const filterVenue = venues.find(v => v.id === filterVenueId);
  const ticketCurrency = filterVenue?.currency ?? '₼';

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-6">
          <h1 className="text-xl font-bold text-gray-800 mb-4">Управление</h1>
          {authError && (
            <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{authError}</div>
          )}
          <form onSubmit={login} className="space-y-3">
            <input
              type="password"
              placeholder="Пароль"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="w-full py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
            >
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">Управление</h1>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            Выйти
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(['venues', 'zones', 'tickets'] as Tab[]).map(t => {
            const labels: Record<Tab, string> = { venues: 'Мероприятия', zones: 'Зоны', tickets: 'Билеты' };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {labels[t]}
                {t === 'tickets' && pendingTickets.length > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                    {pendingTickets.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* VENUES TAB */}
        {tab === 'venues' && (
          <div className="space-y-4">
            <form onSubmit={createVenue} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <h2 className="font-semibold text-gray-800">Новое мероприятие</h2>
              <input
                type="text"
                placeholder="Название"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                value={newVenueName}
                onChange={e => setNewVenueName(e.target.value)}
                required
              />
              <input
                type="datetime-local"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                value={newVenueDate}
                onChange={e => setNewVenueDate(e.target.value)}
                required
              />
              <select
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                value={newVenueCurrency}
                onChange={e => setNewVenueCurrency(e.target.value as Currency)}
              >
                {CURRENCIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
              >
                Создать
              </button>
            </form>

            <div className="space-y-2">
              {venues.map(v => (
                <div key={v.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-gray-800">{v.name} <span className="text-gray-400 font-normal text-xs">{v.currency}</span></div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          v.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {v.active ? 'Активно' : 'Скрыто'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5">
                        {new Date(v.date).toLocaleString('ru-RU')}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 ml-4 shrink-0">
                      {v.active && (
                        <button
                          onClick={() => copyRegistrationLink(v.id)}
                          className="text-xs text-emerald-700 hover:underline"
                        >
                          Скопировать ссылку
                        </button>
                      )}
                      <button
                        onClick={() => toggleVenueActive(v.id, !v.active)}
                        className={`text-xs hover:underline ${
                          v.active ? 'text-gray-400 hover:text-red-500' : 'text-emerald-600'
                        }`}
                      >
                        {v.active ? 'Скрыть' : 'Активировать'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ZONES TAB */}
        {tab === 'zones' && (
          <div className="space-y-4">
            <select
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
              value={selectedVenueId}
              onChange={e => setSelectedVenueId(e.target.value)}
            >
              <option value="">Выберите мероприятие</option>
              {venues.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>

            {selectedVenueId && (
              <>
                <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Валюта мероприятия</span>
                  <select
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                    value={zoneCurrency}
                    onChange={async e => {
                      const c = e.target.value as Currency;
                      try {
                        const updated = await api.updateVenueCurrency(selectedVenueId, c);
                        setVenues(v => v.map(venue => venue.id === updated.id ? updated : venue));
                      } catch (err) {
                        toast.error(errMsg(err));
                      }
                    }}
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <form
                  onSubmit={editingZone ? saveZone : createZone}
                  className="bg-white rounded-2xl shadow-sm p-4 space-y-3"
                >
                  <h2 className="font-semibold text-gray-800">
                    {editingZone ? 'Редактировать зону' : 'Новая зона'}
                  </h2>

                  <input
                    type="text"
                    placeholder="Название зоны"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                    value={editingZone ? editingZone.name : newZone.name}
                    onChange={e =>
                      editingZone
                        ? setEditingZone({ ...editingZone, name: e.target.value })
                        : setNewZone({ ...newZone, name: e.target.value })
                    }
                    required
                  />

                  <input
                    type="text"
                    placeholder="Номер карты для оплаты"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                    value={editingZone ? editingZone.cardNumber : newZone.cardNumber}
                    onChange={e =>
                      editingZone
                        ? setEditingZone({ ...editingZone, cardNumber: e.target.value })
                        : setNewZone({ ...newZone, cardNumber: e.target.value })
                    }
                    required
                  />

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { field: 'price', label: `Цена (${zoneCurrency})` },
                      { field: 'capacity', label: 'Мест' },
                      { field: 'sortOrder', label: 'Порядок' },
                    ].map(({ field, label }) => (
                      <input
                        key={field}
                        type="number"
                        placeholder={label}
                        min="0"
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                        value={
                          editingZone
                            ? String(editingZone[field as keyof Zone])
                            : newZone[field as keyof typeof newZone]
                        }
                        onChange={e =>
                          editingZone
                            ? setEditingZone({ ...editingZone, [field]: Number(e.target.value) })
                            : setNewZone({ ...newZone, [field]: e.target.value })
                        }
                        required
                      />
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
                    >
                      {editingZone ? 'Сохранить' : 'Добавить'}
                    </button>
                    {editingZone && (
                      <button
                        type="button"
                        onClick={() => setEditingZone(null)}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors"
                      >
                        Отмена
                      </button>
                    )}
                  </div>
                </form>

                <div className="space-y-2">
                  {zones.map(z => (
                    <div key={z.id} className="bg-white rounded-xl shadow-sm p-4 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-gray-800">{z.name}</div>
                        <div className="text-sm text-gray-500">
                          {formatPrice(z.price, zoneCurrency)} ·{' '}
                          {z.available !== undefined ? `${z.available}/` : ''}{z.capacity} мест
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setEditingZone(z)}
                          className="text-sm text-emerald-700 hover:underline"
                        >
                          Ред.
                        </button>
                        <button
                          onClick={() => deleteZone(z.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Удал.
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* TICKETS TAB */}
        {tab === 'tickets' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <select
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                value={filterVenueId}
                onChange={e => setFilterVenueId(e.target.value)}
              >
                <option value="">Все мероприятия</option>
                {venues.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button
                onClick={loadPending}
                disabled={pendingLoading}
                className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm transition-colors disabled:opacity-50"
              >
                {pendingLoading ? '...' : '↻'}
              </button>
            </div>

            {pendingTickets.length === 0 && (
              <div className="text-center text-gray-400 py-10">Нет билетов на проверке</div>
            )}

            <div className="space-y-3">
              {pendingTickets.map(t => (
                <div key={t.id} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-gray-800">{t.name}</div>
                      <div className="text-sm text-gray-500">
                        {t.phone} · {t.zoneName} · {formatPrice(t.price, ticketCurrency)}
                      </div>
                      {t.groupId && (
                        <div className="text-xs text-emerald-700 mt-0.5">Групповой билет</div>
                      )}
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full shrink-0">
                      Pending
                    </span>
                  </div>

                  {t.receiptLink && (
                    <a
                      href={t.receiptLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-emerald-700 hover:underline block"
                    >
                      Открыть чек →
                    </a>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTicketStatus(t.id, 'CONFIRMED')}
                      className="flex-1 py-2 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors text-sm"
                    >
                      Подтвердить
                    </button>
                    <button
                      onClick={() => handleTicketStatus(t.id, 'REJECTED')}
                      className="flex-1 py-2 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors text-sm"
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
