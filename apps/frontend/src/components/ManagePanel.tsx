import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { Venue, Zone, Ticket, Currency, TicketStatus } from '../types';
import { CURRENCIES, formatPrice } from '../types';
import { toast } from '../services/toast';
import { StatsTab } from './StatsTab';
import { ZoneConfigurator } from './ZoneConfigurator';
import { ZoneMapEditor } from './ZoneMapEditor';
import { ConfirmDialog } from './ConfirmDialog';

type PendingConfirm = { title: string; message: string; onConfirm: () => void };

type Tab = 'venues' | 'zones' | 'map' | 'tickets' | 'stats';
type TicketFilter = TicketStatus | 'ALL';

const TICKET_FILTERS: { value: TicketFilter; label: string }[] = [
  { value: 'ALL', label: 'Все' },
  { value: 'PENDING', label: 'Ожидают' },
  { value: 'CONFIRMED', label: 'Подтверждены' },
  { value: 'REJECTED', label: 'Отклонены' },
];

const STATUS_STYLE: Record<TicketStatus, { label: string; className: string }> = {
  BOOKED:    { label: 'Забронирован', className: 'bg-blue-100 text-blue-700' },
  PENDING:   { label: 'Ожидает',      className: 'bg-amber-100 text-amber-700' },
  CONFIRMED: { label: 'Подтверждён',  className: 'bg-green-100 text-green-700' },
  REJECTED:  { label: 'Отклонён',     className: 'bg-red-100 text-red-600' },
  EXPIRED:   { label: 'Истёк',        className: 'bg-gray-100 text-gray-500' },
};

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
  const [zoneTickets, setZoneTickets] = useState<Ticket[]>([]);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [newZone, setNewZone] = useState(ZONE_DEFAULTS);

  // Tickets
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('PENDING');
  const [filterVenueId, setFilterVenueId] = useState('');
  const [ticketsLoading, setTicketsLoading] = useState(false);

  // Confirm dialog
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const requestConfirm = (title: string, message: string, onConfirm: () => void) =>
    setPendingConfirm({ title, message, onConfirm });

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
    if (!selectedVenueId) { setZones([]); setZoneTickets([]); return; }
    Promise.all([api.getZones(selectedVenueId), api.getTickets(selectedVenueId)])
      .then(([z, t]) => { setZones(z); setZoneTickets(t); });
  }, [selectedVenueId]);

  const loadTickets = () => {
    setTicketsLoading(true);
    api.getTickets(filterVenueId || undefined)
      .then(setAllTickets)
      .finally(() => setTicketsLoading(false));
  };

  useEffect(() => {
    if (tab === 'tickets' && authenticated) loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filterVenueId, authenticated]);

  const errMsg = (err: unknown) => err instanceof Error ? err.message : 'Ошибка';

  // --- Venue handlers ---

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

  const toggleVenueActive = async (id: string, active: boolean) => {
    try {
      const updated = await api.toggleVenue(id, active);
      setVenues(v => v.map(venue => (venue.id === updated.id ? updated : venue)));
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const copyRegistrationLink = (venueId: string) => {
    const url = `${window.location.origin}/?venue=${venueId}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Ссылка скопирована'));
  };

  // --- Zone handlers ---

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
        type: 'GENERAL',
        layoutData: null,
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

  const deleteZone = (id: string) => {
    requestConfirm('Удалить зону?', 'Билеты в этой зоне не будут удалены.', async () => {
      try {
        await api.deleteZone(id);
        setZones(z => z.filter(zone => zone.id !== id));
        toast.success('Зона удалена');
      } catch (err) {
        toast.error(errMsg(err));
      }
    });
  };

  // --- Ticket handlers ---

  const deleteTicket = (ticket: Ticket) => {
    const isGroup = Boolean(ticket.groupId);
    requestConfirm(
      isGroup ? 'Удалить групповой билет?' : 'Удалить билет?',
      isGroup
        ? `Будут удалены все ${allTickets.filter(t => t.groupId === ticket.groupId).length} участника группы.`
        : `Билет «${ticket.name}» будет удалён безвозвратно.`,
      async () => {
        try {
          await api.deleteTicket(ticket.id);
          setAllTickets(ts =>
            isGroup
              ? ts.filter(t => t.groupId !== ticket.groupId)
              : ts.filter(t => t.id !== ticket.id),
          );
          toast.success(isGroup ? 'Групповой билет удалён' : 'Билет удалён');
        } catch (err) {
          toast.error(errMsg(err));
        }
      },
    );
  };

  const handleTicketStatus = async (id: string, status: 'CONFIRMED' | 'REJECTED') => {
    try {
      const ticket = allTickets.find(t => t.id === id);
      await api.updateTicketStatus(id, status);
      setAllTickets(ts =>
        ts.map(t =>
          (ticket?.groupId ? t.groupId === ticket.groupId : t.id === id)
            ? { ...t, status }
            : t,
        ),
      );
      toast.success(status === 'CONFIRMED' ? 'Билет подтверждён' : 'Билет отклонён');
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  // --- Derived state ---

  const selectedVenue = venues.find(v => v.id === selectedVenueId);
  const zoneCurrency = selectedVenue?.currency ?? '₼';

  const zoneRevenue = useMemo(() => {
    if (!zones.length || !zoneTickets.length) return null;
    let confirmed = 0;
    let pending = 0;
    for (const z of zones) {
      const zt = zoneTickets.filter(t => t.zoneId === z.id);
      confirmed += zt.filter(t => t.status === 'CONFIRMED').length * z.price;
      pending += zt.filter(t => t.status === 'PENDING').length * z.price;
    }
    return { confirmed, pending };
  }, [zones, zoneTickets]);

  const filterVenue = venues.find(v => v.id === filterVenueId);
  const ticketCurrency = filterVenue?.currency ?? '₼';

  const ticketCounts = useMemo(() => ({
    ALL: allTickets.length,
    PENDING: allTickets.filter(t => t.status === 'PENDING').length,
    CONFIRMED: allTickets.filter(t => t.status === 'CONFIRMED').length,
    REJECTED: allTickets.filter(t => t.status === 'REJECTED').length,
  }), [allTickets]);

  const displayedTickets = useMemo(() =>
    ticketFilter === 'ALL' ? allTickets : allTickets.filter(t => t.status === ticketFilter),
    [allTickets, ticketFilter],
  );

  const TAB_LABELS: Record<Tab, string> = {
    venues: 'Мероприятия',
    zones: 'Зоны',
    map: 'Схема',
    tickets: 'Билеты',
    stats: 'Статистика',
  };

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
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {(['venues', 'zones', 'map', 'tickets', 'stats'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {TAB_LABELS[t]}
              {t === 'tickets' && ticketCounts.PENDING > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {ticketCounts.PENDING}
                </span>
              )}
            </button>
          ))}
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
                        <div className="font-semibold text-gray-800">
                          {v.name} <span className="text-gray-400 font-normal text-xs">{v.currency}</span>
                        </div>
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

                {zoneRevenue && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                      <div className="text-xs text-emerald-600">Подтверждённая выручка</div>
                      <div className="text-base font-bold text-emerald-700 mt-0.5">
                        {formatPrice(zoneRevenue.confirmed, zoneCurrency)}
                      </div>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                      <div className="text-xs text-amber-600">Ожидаемая выручка</div>
                      <div className="text-base font-bold text-amber-700 mt-0.5">
                        {formatPrice(zoneRevenue.pending, zoneCurrency)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {zones.map(z => (
                    <div key={z.id} className="bg-white rounded-xl shadow-sm p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-gray-800">{z.name}</div>
                          <div className="text-sm text-gray-500">
                            {formatPrice(z.price, zoneCurrency)} ·{' '}
                            {z.available !== undefined ? `${z.available}/` : ''}{z.capacity} мест
                          </div>
                        </div>
                        <div className="flex gap-3 shrink-0 ml-4">
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
                      <div className="mt-2">
                        <ZoneConfigurator
                          zone={z}
                          onUpdated={updated => setZones(zs => zs.map(z2 => z2.id === updated.id ? updated : z2))}
                        />
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
                onClick={loadTickets}
                disabled={ticketsLoading}
                className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm transition-colors disabled:opacity-50"
              >
                {ticketsLoading ? '...' : '↻'}
              </button>
            </div>

            {/* Status filter chips */}
            <div className="flex gap-2 flex-wrap">
              {TICKET_FILTERS.map(({ value, label }) => {
                const count = ticketCounts[value as keyof typeof ticketCounts] ?? ticketCounts.ALL;
                const isActive = ticketFilter === value;
                return (
                  <button
                    key={value}
                    onClick={() => setTicketFilter(value)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm'
                    }`}
                  >
                    {label}
                    <span className={`ml-1.5 text-xs ${isActive ? 'text-emerald-100' : 'text-gray-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {ticketsLoading && (
              <div className="text-center text-gray-400 py-10">Загрузка...</div>
            )}

            {!ticketsLoading && displayedTickets.length === 0 && (
              <div className="text-center text-gray-400 py-10">Нет билетов</div>
            )}

            <div className="space-y-3">
              {displayedTickets.map(t => {
                const badge = STATUS_STYLE[t.status];
                return (
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
                      <span className={`text-xs px-2 py-1 rounded-full shrink-0 font-medium ${badge.className}`}>
                        {badge.label}
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
                      {t.status === 'PENDING' && (
                        <>
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
                        </>
                      )}
                      <button
                        onClick={() => deleteTicket(t)}
                        className="px-3 py-2 text-gray-400 hover:text-red-600 transition-colors text-sm rounded-xl hover:bg-red-50"
                        title="Удалить"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MAP TAB */}
        {tab === 'map' && (
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

            {selectedVenueId && selectedVenue && (
              <ZoneMapEditor
                venue={selectedVenue}
                zones={zones}
                onVenueUpdated={updated => setVenues(vs => vs.map(v => v.id === updated.id ? updated : v))}
                onZoneUpdated={updated => setZones(zs => zs.map(z => z.id === updated.id ? updated : z))}
              />
            )}

            {selectedVenueId && !zones.length && (
              <p className="text-sm text-gray-400 text-center py-8">
                Сначала создайте зоны во вкладке «Зоны»
              </p>
            )}
          </div>
        )}

        {/* STATS TAB */}
        {tab === 'stats' && <StatsTab venues={venues} />}
      </div>

      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          onConfirm={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}
