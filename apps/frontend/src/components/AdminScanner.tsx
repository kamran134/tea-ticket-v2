import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../services/api';
import type { PublicTicket } from '../types';

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

export function AdminScanner() {
  const [authenticated, setAuthenticated] = useState(isTokenValid);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [members, setMembers] = useState<PublicTicket[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [stats, setStats] = useState<{ purchased: number; checkedIn: number } | null>(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef('');

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => undefined);
    };
  }, []);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3000);
  };

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
    stopScanning();
    localStorage.removeItem('admin_token');
    setAuthenticated(false);
  };

  const startScanning = () => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    scanner
      .start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, handleScan, undefined)
      .then(() => setScanning(true))
      .catch(() => showMessage('Нет доступа к камере', 'error'));
  };

  const stopScanning = () => {
    if (!scannerRef.current) return;
    scannerRef.current
      .stop()
      .then(() => {
        setScanning(false);
        scannerRef.current = null;
      })
      .catch(() => undefined);
  };

  const handleScan = async (scannedId: string) => {
    if (scannedId === lastScanRef.current) return;
    lastScanRef.current = scannedId;

    setStats(null);
    stopScanning();
    try {
      const { ticket, members } = await api.getTicket(scannedId);
      setTicket(ticket);
      setMembers(members ?? []);
      const groupMembers = members ?? [];
      const allDone = groupMembers.length > 0 ? groupMembers.every(m => m.checkedIn) : ticket.checkedIn;
      setSelectedMemberIds(new Set(
        groupMembers.filter(m => !m.checkedIn && m.status === 'CONFIRMED').map(m => m.id),
      ));
      if (allDone) {
        showMessage('По этому билету все уже прошли', 'error');
      }
    } catch {
      setTicket(null);
      setMembers([]);
      showMessage('Билет не найден', 'error');
    } finally {
      lastScanRef.current = '';
    }
  };

  const isGroup = members.length > 0;
  const remainingToCheckIn = ticket
    ? isGroup
      ? members.filter(m => !m.checkedIn && m.status === 'CONFIRMED').length
      : ticket.status === 'CONFIRMED' && !ticket.checkedIn ? 1 : 0
    : 0;
  const allCheckedIn = ticket ? (isGroup ? members.every(m => m.checkedIn) : ticket.checkedIn) : false;

  const toggleMember = (id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirmEntry = async () => {
    if (!ticket) return;
    if (isGroup && selectedMemberIds.size === 0) return;
    if (!isGroup && remainingToCheckIn === 0) return;
    setConfirming(true);
    try {
      let updated = ticket;
      let passedCount = 1;
      if (isGroup && ticket.groupId) {
        const ids = [...selectedMemberIds];
        const { members: updatedMembers } = await api.checkinGroup(ticket.groupId, ids);
        setMembers(updatedMembers);
        updated = updatedMembers.find(m => m.id === ticket.id) ?? ticket;
        passedCount = ids.length;
        setSelectedMemberIds(new Set());
      } else {
        updated = await api.checkin(ticket.id);
      }
      setTicket(updated);
      showMessage(`Вход разрешён ✓ (${passedCount} чел.)`, 'success');

      const venueTickets = await api.getTickets(ticket.venueId, 'CONFIRMED');
      setStats({
        purchased: venueTickets.length,
        checkedIn: venueTickets.filter(t => t.checkedIn).length,
      });
    } catch {
      showMessage('Ошибка при регистрации', 'error');
    } finally {
      setConfirming(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-6">
          <h1 className="text-xl font-bold text-gray-800 mb-4">Вход для администратора</h1>
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
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">QR Сканер</h1>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-white transition-colors">
            Выйти
          </button>
        </div>

        {message && (
          <div
            className={`p-3 rounded-xl text-center font-semibold transition-all ${
              messageType === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {message}
          </div>
        )}

        {/* Camera viewport */}
        <div id="qr-reader" className="w-full rounded-xl overflow-hidden bg-gray-800" />

        <button
          onClick={scanning ? stopScanning : startScanning}
          className={`w-full py-3 rounded-xl font-semibold transition-colors ${
            scanning ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {scanning ? 'Остановить сканер' : 'Сканировать'}
        </button>

        {ticket && (
          <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">
                  {ticket.name}{isGroup ? ` + ${members.length - 1}` : ''}
                </div>
                <div className="text-sm text-gray-400">{ticket.zoneName}</div>
              </div>
              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-full">
                {ticket.status}
              </span>
            </div>

            {allCheckedIn ? (
              <div className="text-center text-red-400 text-sm font-bold py-1">⚠ Уже вошли</div>
            ) : remainingToCheckIn === 0 ? (
              <div className="text-center text-amber-400 text-sm font-medium py-1">Билет не подтверждён</div>
            ) : (
              <>
                {isGroup && (
                  <div className="space-y-1">
                    {members.map(m => (
                      <label
                        key={m.id}
                        className={`flex items-center gap-2 py-1 px-2 rounded-lg text-sm ${
                          m.checkedIn ? 'text-gray-500' : 'text-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={m.checkedIn || selectedMemberIds.has(m.id)}
                          disabled={m.checkedIn || m.status !== 'CONFIRMED'}
                          onChange={() => toggleMember(m.id)}
                          className="rounded border-gray-500"
                        />
                        <span className="flex-1 truncate">{m.name}</span>
                        {m.checkedIn && <span className="text-xs text-green-400">вошёл</span>}
                      </label>
                    ))}
                  </div>
                )}
                <button
                  onClick={confirmEntry}
                  disabled={confirming || (isGroup && selectedMemberIds.size === 0)}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-xl font-semibold transition-colors"
                >
                  {confirming
                    ? '...'
                    : isGroup
                      ? `Подтвердить вход (${selectedMemberIds.size} чел.)`
                      : 'Подтвердить вход'}
                </button>
              </>
            )}

            {stats && (
              <div className="border-t border-gray-700 pt-3 flex justify-between text-sm">
                <span className="text-gray-400">
                  Куплено: <span className="text-white font-semibold">{stats.purchased}</span>
                </span>
                <span className="text-gray-400">
                  Прошло: <span className="text-white font-semibold">{stats.checkedIn}</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
