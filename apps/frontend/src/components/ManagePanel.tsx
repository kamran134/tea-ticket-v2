import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { Venue, Ticket, TicketStatus, TicketEmailDeliveryStatus } from '../types';
import { formatPrice } from '../types';
import { toast } from '../services/toast';
import { generateVenueSlug, slugify } from '../utils/slug';
import { StatsTab } from './StatsTab';
import { GridMapEditor } from './GridMapEditor';
import { ConfirmDialog } from './ConfirmDialog';

type PendingConfirm = { title: string; message: string; onConfirm: () => void };

type Tab = 'venues' | 'gridmap' | 'tickets' | 'stats';
type TicketFilter = TicketStatus | 'ALL';

const TICKET_FILTERS: { value: TicketFilter; label: string }[] = [
  { value: 'ALL', label: 'Все' },
  { value: 'BOOKED', label: 'Новые' },
  { value: 'PENDING', label: 'Ожидают' },
  { value: 'CONFIRMED', label: 'Подтверждены' },
  { value: 'REJECTED', label: 'Отклонены' },
  { value: 'EXPIRED', label: 'Истекли' },
];

const STATUS_STYLE: Record<TicketStatus, { label: string; className: string }> = {
  BOOKED:    { label: 'Забронирован', className: 'bg-blue-100 text-blue-700' },
  PENDING:   { label: 'Ожидает',      className: 'bg-amber-100 text-amber-700' },
  CONFIRMED: { label: 'Подтверждён',  className: 'bg-green-100 text-green-700' },
  REJECTED:  { label: 'Отклонён',     className: 'bg-red-100 text-red-600' },
  EXPIRED:   { label: 'Истёк',        className: 'bg-gray-100 text-gray-600' },
};

const EMAIL_STATUS_STYLE: Record<TicketEmailDeliveryStatus, { label: string; className: string }> = {
  PENDING:    { label: 'Email в очереди',     className: 'text-amber-700' },
  PROCESSING: { label: 'Email отправляется',  className: 'text-amber-700' },
  ACCEPTED:   { label: 'Email отправлен',     className: 'text-emerald-700' },
  DELIVERED:  { label: 'Email доставлен',     className: 'text-emerald-700' },
  BOUNCED:    { label: 'Email не доставлен',  className: 'text-red-700' },
  COMPLAINED: { label: 'Email — жалоба',      className: 'text-red-700' },
  FAILED:     { label: 'Ошибка email',        className: 'text-red-700' },
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

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ManagePanel() {
  const [authenticated, setAuthenticated] = useState(isTokenValid);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('venues');

  // Venues
  const [venues, setVenues] = useState<Venue[]>([]);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueDate, setNewVenueDate] = useState('');
  const [newVenueSlug, setNewVenueSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [editingSlugId, setEditingSlugId] = useState<string | null>(null);
  const [editingSlugValue, setEditingSlugValue] = useState('');
  const [uploadingPosterId, setUploadingPosterId] = useState<string | null>(null);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [editVenueName, setEditVenueName] = useState('');
  const [editVenueDate, setEditVenueDate] = useState('');
  const [savingVenueEdit, setSavingVenueEdit] = useState(false);

  // Schema (grid map) — which venue is selected for editing
  const [selectedVenueId, setSelectedVenueId] = useState('');

  // Tickets
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('BOOKED');
  const [filterVenueId, setFilterVenueId] = useState('');
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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
    api.getVenues({ all: true }).then(setVenues);
  }, [authenticated]);

  // Auto-suggest a slug from name+date until the admin edits it by hand
  useEffect(() => {
    if (slugManuallyEdited) return;
    setNewVenueSlug(generateVenueSlug(newVenueName, newVenueDate));
  }, [newVenueName, newVenueDate, slugManuallyEdited]);

  // Debounced availability check for the new-venue slug
  useEffect(() => {
    if (!newVenueSlug) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    const t = setTimeout(() => {
      api.checkSlugAvailable(newVenueSlug)
        .then(r => setSlugStatus(r.available ? 'available' : 'taken'))
        .catch(() => setSlugStatus('idle'));
    }, 400);
    return () => clearTimeout(t);
  }, [newVenueSlug]);

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
        newVenueSlug || undefined,
      );
      setVenues(v => [venue, ...v]);
      setNewVenueName('');
      setNewVenueDate('');
      setNewVenueSlug('');
      setSlugManuallyEdited(false);
      setSlugStatus('idle');
      toast.success('Мероприятие создано');
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const startEditVenue = (v: Venue) => {
    setEditingVenueId(v.id);
    setEditVenueName(v.name);
    setEditVenueDate(toDatetimeLocal(v.date));
  };

  const saveVenueEdit = async (id: string) => {
    if (!editVenueName.trim() || !editVenueDate) return;
    setSavingVenueEdit(true);
    try {
      const updated = await api.updateVenue(id, {
        name: editVenueName.trim(),
        date: new Date(editVenueDate).toISOString(),
      });
      setVenues(v => v.map(venue => (venue.id === updated.id ? updated : venue)));
      setEditingVenueId(null);
      toast.success('Мероприятие обновлено');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingVenueEdit(false);
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

  const copyRegistrationLink = (slug: string) => {
    const url = `${window.location.origin}/e/${slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Ссылка скопирована'));
  };

  const copyTicketLink = (id: string) => {
    const url = `${window.location.origin}/ticket?id=${id}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Ссылка на билет скопирована'));
  };

  const saveVenueSlug = async (id: string) => {
    const slug = slugify(editingSlugValue);
    if (!slug) { toast.error('Пустой слаг'); return; }
    try {
      const updated = await api.updateVenueSlug(id, slug);
      setVenues(v => v.map(venue => (venue.id === updated.id ? updated : venue)));
      setEditingSlugId(null);
      toast.success('Слаг обновлён');
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const uploadPoster = async (id: string, file: File) => {
    setUploadingPosterId(id);
    try {
      const updated = await api.uploadPoster(id, file);
      setVenues(v => v.map(venue => (venue.id === updated.id ? updated : venue)));
      toast.success('Постер загружен');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setUploadingPosterId(null);
    }
  };

  // --- Ticket handlers ---

  const deleteTicket = (ticket: Ticket) => {
    const isGroup = Boolean(ticket.groupId);
    requestConfirm(
      'Удалить билет?',
      isGroup
        ? `Билет «${ticket.name}» будет удалён безвозвратно. Остальные участники группы останутся.`
        : `Билет «${ticket.name}» будет удалён безвозвратно.`,
      async () => {
        try {
          await api.deleteTicket(ticket.id);
          setAllTickets(ts => ts.filter(t => t.id !== ticket.id));
          toast.success('Билет удалён');
        } catch (err) {
          toast.error(errMsg(err));
        }
      },
    );
  };

  // Receipts are served via an authenticated endpoint now, not a plain static
  // URL — a bare <a href> can't carry the admin token, so fetch it as a blob
  // and open that instead.
  const openReceipt = async (ticketId: string) => {
    try {
      const blob = await api.getReceiptBlob(ticketId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(errMsg(err));
    }
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
      // Refresh to pick up EmailJob status after enqueue
      if (status === 'CONFIRMED') {
        loadTickets();
      }
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const toggleGroupExpanded = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // --- Derived state ---

  const selectedVenue = venues.find(v => v.id === selectedVenueId);

  const filterVenue = venues.find(v => v.id === filterVenueId);
  const ticketCurrency = filterVenue?.currency ?? '₼';

  const ticketCounts = useMemo(() => ({
    ALL: allTickets.length,
    BOOKED: allTickets.filter(t => t.status === 'BOOKED').length,
    PENDING: allTickets.filter(t => t.status === 'PENDING').length,
    CONFIRMED: allTickets.filter(t => t.status === 'CONFIRMED').length,
    REJECTED: allTickets.filter(t => t.status === 'REJECTED').length,
    EXPIRED: allTickets.filter(t => t.status === 'EXPIRED').length,
  }), [allTickets]);

  const displayedTickets = useMemo(() =>
    ticketFilter === 'ALL' ? allTickets : allTickets.filter(t => t.status === ticketFilter),
    [allTickets, ticketFilter],
  );

  // Group tickets sharing a groupId into one accordion row; solo tickets
  // (groupId === null) stay as their own single-item "group".
  const displayedGroups = useMemo(() => {
    const order: string[] = [];
    const byKey = new Map<string, Ticket[]>();
    for (const t of displayedTickets) {
      const key = t.groupId ?? t.id;
      if (!byKey.has(key)) { byKey.set(key, []); order.push(key); }
      byKey.get(key)!.push(t);
    }
    return order.map(key => ({ key, tickets: byKey.get(key)! }));
  }, [displayedTickets]);

  const TAB_LABELS: Record<Tab, string> = {
    venues: 'Мероприятия',
    gridmap: 'Схема',
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
          <div className="flex items-center gap-3">
            <a href="/admin.html" className="text-sm text-emerald-700 hover:underline">
              Сканер
            </a>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
              Выйти
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {(['venues', 'gridmap', 'tickets', 'stats'] as Tab[]).map(t => (
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
              {t === 'tickets' && ticketCounts.BOOKED > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {ticketCounts.BOOKED}
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
              <div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <span className="font-mono">/e/</span>
                  <span>слаг ссылки на страницу мероприятия</span>
                </div>
                <input
                  type="text"
                  placeholder="letnyaya-vecherinka-2026-08-15"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                  value={newVenueSlug}
                  onChange={e => { setSlugManuallyEdited(true); setNewVenueSlug(slugify(e.target.value)); }}
                  required
                />
                {slugStatus === 'checking' && (
                  <p className="text-xs text-gray-400 mt-1">Проверка...</p>
                )}
                {slugStatus === 'available' && (
                  <p className="text-xs text-emerald-600 mt-1">✓ свободен</p>
                )}
                {slugStatus === 'taken' && (
                  <p className="text-xs text-red-600 mt-1">Уже занят, выберите другой</p>
                )}
              </div>
              <button
                type="submit"
                disabled={slugStatus === 'taken'}
                className="w-full py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                Создать
              </button>
            </form>

            <div className="space-y-2">
              {venues.map(v => (
                <div key={v.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex gap-3 min-w-0">
                      {v.posterImage ? (
                        <img
                          src={v.posterImage}
                          alt=""
                          className="w-14 h-14 rounded-lg object-cover shrink-0 border border-gray-100"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-xl shrink-0">
                          🍵
                        </div>
                      )}
                      <div className="min-w-0">
                        {editingVenueId === v.id ? (
                          <div className="space-y-1.5 mb-1.5">
                            <input
                              type="text"
                              autoFocus
                              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-emerald-300"
                              value={editVenueName}
                              onChange={e => setEditVenueName(e.target.value)}
                            />
                            <input
                              type="datetime-local"
                              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-emerald-300"
                              value={editVenueDate}
                              onChange={e => setEditVenueDate(e.target.value)}
                            />
                            <div className="flex gap-3">
                              <button
                                onClick={() => saveVenueEdit(v.id)}
                                disabled={savingVenueEdit}
                                className="text-xs text-emerald-700 hover:underline disabled:opacity-50"
                              >
                                Сохранить
                              </button>
                              <button
                                onClick={() => setEditingVenueId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-semibold text-gray-800">{v.name}</div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                v.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {v.active ? 'Активно' : 'Скрыто'}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-0.5">
                              {new Date(v.date).toLocaleString('ru-RU')}
                            </div>
                          </>
                        )}

                        {editingSlugId === v.id ? (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-xs text-gray-400 font-mono shrink-0">/e/</span>
                            <input
                              type="text"
                              autoFocus
                              className="border border-gray-300 rounded px-2 py-1 text-xs font-mono w-40 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                              value={editingSlugValue}
                              onChange={e => setEditingSlugValue(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveVenueSlug(v.id)}
                            />
                            <button
                              onClick={() => saveVenueSlug(v.id)}
                              className="text-xs text-emerald-700 hover:underline shrink-0"
                            >
                              Сохранить
                            </button>
                            <button
                              onClick={() => setEditingSlugId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingSlugId(v.id); setEditingSlugValue(v.slug); }}
                            className="text-xs text-gray-400 hover:text-emerald-700 font-mono mt-1.5 truncate block"
                            title="Изменить слаг"
                          >
                            /e/{v.slug}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 ml-4 shrink-0">
                      {v.active && (
                        <button
                          onClick={() => copyRegistrationLink(v.slug)}
                          className="text-xs text-emerald-700 hover:underline"
                        >
                          Скопировать ссылку
                        </button>
                      )}
                      <button
                        onClick={() => startEditVenue(v)}
                        className="text-xs text-gray-400 hover:text-emerald-700"
                      >
                        Редактировать
                      </button>
                      <label className="text-xs text-gray-400 hover:text-emerald-700 cursor-pointer">
                        {uploadingPosterId === v.id ? 'Загрузка...' : v.posterImage ? 'Сменить постер' : 'Загрузить постер'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingPosterId === v.id}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) uploadPoster(v.id, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
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

            {!ticketsLoading && displayedGroups.length === 0 && (
              <div className="text-center text-gray-400 py-10">Нет билетов</div>
            )}

            <div className="space-y-3">
              {displayedGroups.map(group => {
                if (group.tickets.length === 1) {
                  const t = group.tickets[0];
                  const badge = STATUS_STYLE[t.status];
                  return (
                    <div key={group.key} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-gray-800">{t.name}</div>
                          <div className="text-sm text-gray-500">
                            {t.phone}{t.email && ` · ${t.email}`} · {t.zoneName} · {formatPrice(t.price, ticketCurrency)}
                          </div>
                          {t.emailDelivery && (
                            <div className={`text-xs mt-0.5 font-medium ${EMAIL_STATUS_STYLE[t.emailDelivery.status].className}`}>
                              {EMAIL_STATUS_STYLE[t.emailDelivery.status].label}
                            </div>
                          )}
                          {t.status === 'CONFIRMED' && t.email && !t.emailDelivery && (
                            <div className="text-xs mt-0.5 text-gray-400">Email ещё не в очереди</div>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full shrink-0 font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>

                      {t.receiptLink && (
                        <button
                          type="button"
                          onClick={() => openReceipt(t.id)}
                          className="text-sm text-emerald-700 hover:underline block text-left"
                        >
                          Открыть чек →
                        </button>
                      )}

                      <button
                        onClick={() => copyTicketLink(t.id)}
                        className="text-sm text-emerald-700 hover:underline block"
                      >
                        Скопировать ссылку на билет
                      </button>

                      <div className="flex gap-2">
                        {(t.status === 'PENDING' || t.status === 'BOOKED') && (
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
                }

                // Group of tickets sharing a groupId — status/email changes always
                // cascade to every member on the backend, so members share one
                // status badge and one confirm/reject action.
                const primary = group.tickets[0];
                const badge = STATUS_STYLE[primary.status];
                const totalPrice = group.tickets.reduce((sum, t) => sum + t.price, 0);
                const zoneNames = [...new Set(group.tickets.map(t => t.zoneName))].join(', ');
                const isExpanded = expandedGroups.has(group.key);

                return (
                  <div key={group.key} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpanded(group.key)}
                      className="w-full flex justify-between items-start text-left"
                    >
                      <div>
                        <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                          <span className={`inline-block text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                            ›
                          </span>
                          Групповой билет · {group.tickets.length} чел.
                        </div>
                        <div className="text-sm text-gray-500">
                          {primary.phone}{primary.email && ` · ${primary.email}`} · {zoneNames} · {formatPrice(totalPrice, ticketCurrency)}
                        </div>
                        {primary.emailDelivery && (
                          <div className={`text-xs mt-0.5 font-medium ${EMAIL_STATUS_STYLE[primary.emailDelivery.status].className}`}>
                            {EMAIL_STATUS_STYLE[primary.emailDelivery.status].label}
                          </div>
                        )}
                        {primary.status === 'CONFIRMED' && primary.email && !primary.emailDelivery && (
                          <div className="text-xs mt-0.5 text-gray-400">Email ещё не в очереди</div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full shrink-0 font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="space-y-2 border-t border-gray-100 pt-3">
                        {group.tickets.map(t => (
                          <div key={t.id} className="flex justify-between items-center gap-2 text-sm">
                            <div>
                              <div className="text-gray-700 font-medium">{t.name}</div>
                              <div className="text-gray-400 text-xs">
                                {t.zoneName} · {formatPrice(t.price, ticketCurrency)}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {t.receiptLink && (
                                <button
                                  type="button"
                                  onClick={() => openReceipt(t.id)}
                                  className="text-emerald-700 hover:underline text-xs"
                                >
                                  Чек
                                </button>
                              )}
                              <button
                                onClick={() => deleteTicket(t)}
                                className="px-2 py-1 text-gray-400 hover:text-red-600 transition-colors text-xs rounded-lg hover:bg-red-50"
                                title="Удалить"
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => copyTicketLink(group.key)}
                      className="text-sm text-emerald-700 hover:underline block"
                    >
                      Скопировать ссылку на билет
                    </button>

                    {(primary.status === 'PENDING' || primary.status === 'BOOKED') && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTicketStatus(primary.id, 'CONFIRMED')}
                          className="flex-1 py-2 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors text-sm"
                        >
                          Подтвердить группу
                        </button>
                        <button
                          onClick={() => handleTicketStatus(primary.id, 'REJECTED')}
                          className="flex-1 py-2 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors text-sm"
                        >
                          Отклонить группу
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* GRID MAP TAB */}
        {tab === 'gridmap' && (
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
              <GridMapEditor
                key={selectedVenueId}
                venue={selectedVenue}
                onVenueUpdated={updated => setVenues(vs => vs.map(v => v.id === updated.id ? updated : v))}
              />
            )}

            {selectedVenueId && !selectedVenue && (
              <p className="text-sm text-gray-400 text-center py-8">Загрузка...</p>
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
