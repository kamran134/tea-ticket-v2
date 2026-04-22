import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { formatPrice } from '../types';
import type { Venue, Zone, Ticket } from '../types';

interface ZoneStat {
  zone: Zone;
  confirmed: number;
  pending: number;
  booked: number;
}

function useVenueStats(venueId: string) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!venueId) {
      setZones([]);
      setTickets([]);
      return;
    }
    setLoading(true);
    Promise.all([api.getZones(venueId), api.getTickets(venueId)])
      .then(([z, t]) => { setZones(z); setTickets(t); })
      .finally(() => setLoading(false));
  }, [venueId]);

  return { zones, tickets, loading };
}

function buildZoneStats(zones: Zone[], tickets: Ticket[]): ZoneStat[] {
  return zones.map(zone => {
    const zoneTickets = tickets.filter(t => t.zoneId === zone.id);
    return {
      zone,
      confirmed: zoneTickets.filter(t => t.status === 'CONFIRMED').length,
      pending: zoneTickets.filter(t => t.status === 'PENDING').length,
      booked: zoneTickets.filter(t => t.status === 'BOOKED').length,
    };
  });
}

interface Props {
  venues: Venue[];
}

export function StatsTab({ venues }: Props) {
  const [venueId, setVenueId] = useState('');
  const { zones, tickets, loading } = useVenueStats(venueId);

  const venue = venues.find(v => v.id === venueId);
  const currency = venue?.currency ?? '₼';

  const stats = useMemo(() => buildZoneStats(zones, tickets), [zones, tickets]);

  const totals = useMemo(() => ({
    capacity: zones.reduce((s, z) => s + z.capacity, 0),
    confirmed: stats.reduce((s, z) => s + z.confirmed, 0),
    pending: stats.reduce((s, z) => s + z.pending, 0),
    confirmedRevenue: stats.reduce((s, z) => s + z.confirmed * z.zone.price, 0),
    pendingRevenue: stats.reduce((s, z) => s + z.pending * z.zone.price, 0),
  }), [stats, zones]);

  return (
    <div className="space-y-4">
      <select
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
        value={venueId}
        onChange={e => setVenueId(e.target.value)}
      >
        <option value="">Выберите мероприятие</option>
        {venues.map(v => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>

      {!venueId && (
        <div className="text-center text-gray-400 py-10">Выберите мероприятие</div>
      )}

      {venueId && loading && (
        <div className="text-center text-gray-400 py-10">Загрузка...</div>
      )}

      {venueId && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="text-xs text-gray-400 mb-1">Подтверждено</div>
              <div className="text-2xl font-bold text-gray-800">{totals.confirmed}</div>
              <div className="text-xs text-gray-400">из {totals.capacity} мест</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="text-xs text-gray-400 mb-1">Ожидают проверки</div>
              <div className="text-2xl font-bold text-amber-600">{totals.pending}</div>
              <div className="text-xs text-gray-400">чеков</div>
            </div>
            <div className="bg-emerald-50 rounded-xl shadow-sm p-4 border border-emerald-100">
              <div className="text-xs text-emerald-600 mb-1">Подтверждённая выручка</div>
              <div className="text-lg font-bold text-emerald-700">{formatPrice(totals.confirmedRevenue, currency)}</div>
            </div>
            <div className="bg-amber-50 rounded-xl shadow-sm p-4 border border-amber-100">
              <div className="text-xs text-amber-600 mb-1">Ожидаемая выручка</div>
              <div className="text-lg font-bold text-amber-700">{formatPrice(totals.pendingRevenue, currency)}</div>
            </div>
          </div>

          <div className="space-y-3">
            {stats.map(({ zone, confirmed, pending }) => {
              const confirmedPct = zone.capacity > 0 ? (confirmed / zone.capacity) * 100 : 0;
              const pendingPct = zone.capacity > 0 ? (pending / zone.capacity) * 100 : 0;
              const isFull = confirmedPct + pendingPct >= 100;

              return (
                <div key={zone.id} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-800">{zone.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isFull ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {confirmed + pending}/{zone.capacity}{isFull ? ' · Распродано' : ''}
                    </span>
                  </div>

                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full flex">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300"
                        style={{ width: `${confirmedPct}%` }}
                      />
                      <div
                        className="bg-amber-400 h-full transition-all duration-300"
                        style={{ width: `${pendingPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      {confirmed} подтв. · {formatPrice(confirmed * zone.price, currency)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      {pending} ожид.
                    </span>
                    <span className="ml-auto text-gray-400">{formatPrice(zone.price, currency)}/чел.</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
