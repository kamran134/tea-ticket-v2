import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../services/api';
import type { Ticket, TicketStatus, Currency } from '../types';
import { formatPrice } from '../types';

const STATUS_LABELS: Record<TicketStatus, string> = {
  BOOKED: 'Ожидает оплаты',
  PENDING: 'Чек на проверке',
  CONFIRMED: 'Подтверждён',
  REJECTED: 'Отклонён',
  EXPIRED: 'Истёк',
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  BOOKED: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-600',
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TicketView() {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [members, setMembers] = useState<Ticket[]>([]);
  const [currency, setCurrency] = useState<Currency>('₸');
  const [countdown, setCountdown] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return;
    api.getTicket(id).then(({ ticket, members, currency }) => {
      setTicket(ticket);
      setCurrency(currency);
      if (members) setMembers(members);
    });
  }, []);

  // Countdown for BOOKED tickets
  useEffect(() => {
    if (!ticket || ticket.status !== 'BOOKED') return;
    const expiry = new Date(ticket.bookedAt).getTime() + 60 * 60 * 1000;
    const tick = () => {
      const remaining = expiry - Date.now();
      setCountdown(formatCountdown(remaining));
      if (remaining <= 0) {
        setTicket(t => (t ? { ...t, status: 'EXPIRED' } : null));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ticket?.status, ticket?.bookedAt]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  };

  const handleUpload = async () => {
    if (!ticket || !selectedFile) return;
    setUploading(true);
    setUploadError('');
    try {
      const updated = await api.uploadReceipt(ticket.id, selectedFile);
      setTicket(updated);
      setSelectedFile(null);
      setPreviewUrl(null);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  };

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Загрузка...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{ticket.name}</h1>
              <p className="text-gray-500 text-sm">{ticket.zoneName}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[ticket.status]}`}
            >
              {STATUS_LABELS[ticket.status]}
            </span>
          </div>
          <div className="text-sm text-gray-600 space-y-0.5 mt-1">
            <div>Телефон: {ticket.phone}</div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {members.length > 1 ? `Итого · ${members.length} чел.` : 'Стоимость'}
            </span>
            <span className="text-xl font-bold text-emerald-700">
              {formatPrice(members.length > 1 ? ticket.price * members.length : ticket.price, currency)}
            </span>
          </div>
        </div>

        {/* BOOKED: payment instructions */}
        {ticket.status === 'BOOKED' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-yellow-900">Оплатите билет</h2>

            {countdown && (
              <div className="text-center">
                <div className="text-3xl font-mono font-bold text-yellow-800">{countdown}</div>
                <div className="text-xs text-yellow-600 mt-0.5">осталось до истечения брони</div>
              </div>
            )}

            {ticket.cardNumber && (
              <div className="bg-white rounded-xl p-3 text-center border border-yellow-100">
                <div className="text-xs text-gray-400 mb-1">Номер карты для перевода</div>
                <div className="font-mono text-lg font-bold tracking-wider">
                  {ticket.cardNumber}
                </div>
              </div>
            )}

            <div>
              <p className="text-sm text-yellow-800 mb-2">После оплаты загрузите скриншот чека:</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-2.5 border-2 border-dashed border-yellow-400 rounded-xl text-yellow-700 hover:bg-yellow-100 transition-colors text-sm"
              >
                {selectedFile ? selectedFile.name : 'Выбрать файл'}
              </button>
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="preview"
                  className="mt-2 rounded-lg max-h-40 object-contain mx-auto"
                />
              )}
              {selectedFile && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="mt-2 w-full py-2.5 bg-yellow-500 text-white rounded-xl font-semibold hover:bg-yellow-600 disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Загрузка...' : 'Отправить чек'}
                </button>
              )}
              {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
            </div>
          </div>
        )}

        {/* PENDING: waiting for admin */}
        {ticket.status === 'PENDING' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">⏳</div>
            <h2 className="font-semibold text-amber-900">Чек отправлен</h2>
            <p className="text-sm text-amber-700 mt-1">
              Ваш чек проверяется администратором. Обычно это занимает несколько минут.
            </p>
          </div>
        )}

        {/* CONFIRMED: QR code */}
        {ticket.status === 'CONFIRMED' && (
          <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center gap-3">
            <div className="text-2xl">✅</div>
            <h2 className="font-semibold text-green-800">Билет подтверждён</h2>
            <div className="p-3 bg-gray-50 rounded-xl">
              <QRCodeSVG value={ticket.groupId ?? ticket.id} size={200} />
            </div>
            <p className="text-xs text-gray-500">Покажите этот QR-код на входе</p>
          </div>
        )}

        {/* REJECTED */}
        {ticket.status === 'REJECTED' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">❌</div>
            <h2 className="font-semibold text-red-800">Билет отклонён</h2>
            <p className="text-sm text-red-600 mt-1">
              Свяжитесь с организаторами для уточнения деталей.
            </p>
          </div>
        )}

        {/* EXPIRED */}
        {ticket.status === 'EXPIRED' && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">⌛</div>
            <h2 className="font-semibold text-gray-700">Бронь истекла</h2>
            <p className="text-sm text-gray-500 mt-1">
              Время оплаты вышло. Пожалуйста, зарегистрируйтесь снова.
            </p>
          </div>
        )}

        {/* Group members */}
        {members.length > 1 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="font-semibold text-gray-800 mb-3">
              Группа ({members.length} чел.)
            </h3>
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex justify-between items-center py-1.5 border-b last:border-0">
                  <span className="text-sm text-gray-800">{m.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      m.checkedIn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {m.checkedIn ? 'Вошёл' : 'Ожидает'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
