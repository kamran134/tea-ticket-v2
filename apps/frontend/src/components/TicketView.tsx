import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { translateApiError } from '../i18n/apiErrors';
import type {
  PublicTicket,
  TicketStatus,
  Currency,
  TicketEmailDelivery,
  TicketEmailDeliveryStatus,
} from '../types';
import { formatPrice } from '../types';
// import { Header } from './Header';
// import { Footer } from './Footer';

const TERMINAL_PAYMENT_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REQUIRES_REVIEW']);

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function isHoldExpired(ticket: PublicTicket): boolean {
  if (ticket.status !== 'BOOKED' || !ticket.expiresAt) return false;
  return new Date(ticket.expiresAt).getTime() <= Date.now();
}

async function reloadTicket(id: string): Promise<{
  ticket: PublicTicket;
  members: PublicTicket[] | null;
  currency: Currency;
  emailDelivery: TicketEmailDelivery | null;
}> {
  return api.getTicket(id);
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  BOOKED: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-700',
};

const EMAIL_STATUS_COLORS: Record<TicketEmailDeliveryStatus, string> = {
  PENDING: 'text-amber-700',
  PROCESSING: 'text-amber-700',
  ACCEPTED: 'text-emerald-700',
  DELIVERED: 'text-emerald-700',
  BOUNCED: 'text-red-700',
  COMPLAINED: 'text-red-700',
  FAILED: 'text-red-700',
};

export function TicketView() {
  const { t } = useTranslation();
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [members, setMembers] = useState<PublicTicket[]>([]);
  const [currency, setCurrency] = useState<Currency>('₼');
  const [emailDelivery, setEmailDelivery] = useState<TicketEmailDelivery | null>(null);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pollingPayment, setPollingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [holdCountdown, setHoldCountdown] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const params = new URLSearchParams(window.location.search);
  const ticketId = params.get('id') ?? params.get('checkoutId');

  const ticketUrl = `${window.location.origin}/ticket?id=${ticketId ?? ''}`;

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const statusLabels = useMemo(() => ({
    BOOKED: t('ticket.statusBooked'),
    PENDING: t('ticket.statusPending'),
    CONFIRMED: t('ticket.statusConfirmed'),
    REJECTED: t('ticket.statusRejected'),
    EXPIRED: t('ticket.statusExpired'),
  }), [t]);

  const emailStatusLabels = useMemo(() => ({
    PENDING: t('ticket.emailPending'),
    PROCESSING: t('ticket.emailProcessing'),
    ACCEPTED: t('ticket.emailAccepted'),
    DELIVERED: t('ticket.emailDelivered'),
    BOUNCED: t('ticket.emailBounced'),
    COMPLAINED: t('ticket.emailComplained'),
    FAILED: t('ticket.emailFailed'),
  }), [t]);

  useEffect(() => {
    document.title = t('titles.ticket');
  }, [t]);

  const applyTicketData = useCallback((data: {
    ticket: PublicTicket;
    members: PublicTicket[] | null;
    currency: Currency;
    emailDelivery?: TicketEmailDelivery | null;
  }) => {
    setTicket(data.ticket);
    setCurrency(data.currency);
    if (data.members) setMembers(data.members);
    setEmailDelivery(data.emailDelivery ?? null);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPollingPayment(false);
  }, []);

  const startPaymentPolling = useCallback((paymentId: string, returnToken: string, id: string) => {
    stopPolling();
    setPollingPayment(true);
    setPaymentMessage(t('ticket.checkingPayment'));

    const poll = async () => {
      try {
        const status = await api.getPaymentStatus(paymentId, returnToken);
        if (status.ticketsConfirmed || status.status === 'SUCCEEDED') {
          stopPolling();
          setPaymentMessage(null);
          const fresh = await reloadTicket(id);
          applyTicketData(fresh);
          toast.success(t('ticket.paymentSuccess'));
          window.history.replaceState(null, '', `/ticket?id=${id}`);
          return;
        }
        if (TERMINAL_PAYMENT_STATUSES.has(status.status) && status.status !== 'SUCCEEDED') {
          stopPolling();
          if (status.status === 'REQUIRES_REVIEW') {
            setPaymentMessage(t('ticket.paymentReview'));
          } else {
            setPaymentMessage(t('ticket.paymentFailed'));
          }
          window.history.replaceState(null, '', `/ticket?id=${id}`);
        }
      } catch {
        // keep polling until timeout
      }
    };

    void poll();
    pollRef.current = setInterval(() => { void poll(); }, 2000);
    setTimeout(() => stopPolling(), 120_000);
  }, [applyTicketData, stopPolling, t]);

  useEffect(() => {
    if (!ticketId) return;

    reloadTicket(ticketId).then(applyTicketData);

    const urlParams = new URLSearchParams(window.location.search);
    const paymentId = urlParams.get('paymentId');
    const returnToken = urlParams.get('returnToken');

    if (paymentId && returnToken) {
      startPaymentPolling(paymentId, returnToken, ticketId);
    }

    if (urlParams.get('new') === '1') {
      window.history.replaceState(null, '', `/ticket?id=${ticketId}`);
      navigator.clipboard.writeText(`${window.location.origin}/ticket?id=${ticketId}`)
        .then(() => toast.success(t('ticket.linkCopied')))
        .catch(() => {});
    }

    return () => stopPolling();
  }, [ticketId, applyTicketData, startPaymentPolling, stopPolling, t]);

  useEffect(() => {
    if (!ticket?.expiresAt || ticket.status !== 'BOOKED') {
      setHoldCountdown(null);
      return;
    }

    const update = () => {
      const remaining = new Date(ticket.expiresAt!).getTime() - Date.now();
      setHoldCountdown(formatCountdown(remaining));
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [ticket?.expiresAt, ticket?.status]);

  const handlePay = async () => {
    if (!ticket) return;
    if (isHoldExpired(ticket)) {
      const msg = t('errors.bookingExpired');
      setPaymentMessage(msg);
      toast.error(msg);
      return;
    }
    setPaying(true);
    setPaymentMessage(null);
    try {
      const payment = await api.createPayment(ticket.id);
      window.location.href = payment.redirectUrl;
    } catch (err) {
      const msg = translateApiError(err, 'ticket.paymentStartError');
      setPaymentMessage(msg);
      toast.error(msg);
      setPaying(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(ticketUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleShare = () => {
    navigator.share({ url: ticketUrl }).catch(() => {});
  };

  if (!ticket) {
    const urlParams = new URLSearchParams(window.location.search);
    const hasReturnParams = urlParams.get('paymentId') && urlParams.get('returnToken');
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        {hasReturnParams && !urlParams.get('id') && !urlParams.get('checkoutId')
          ? t('ticket.ticketResolveError')
          : t('common.loading')}
      </div>
    );
  }

  const holdExpired = isHoldExpired(ticket);
  const displayStatus: TicketStatus = holdExpired ? 'EXPIRED' : ticket.status;
  const showSaveLink =
    displayStatus === 'BOOKED' || displayStatus === 'PENDING' || displayStatus === 'CONFIRMED';

  return (
    <div data-testid="ticket-page" className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 flex flex-col">
      {/* Header stays hidden on public pages — it carries the other instance's branding. */}
      {/* <Header /> */}
      <div className="flex-1 p-4">

      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{ticket.name}</h1>
              <p className="text-gray-500 text-sm">
                {ticket.tableNumber != null && ticket.seatNumber != null
                  ? `${ticket.zoneName} · ${t('register.placeLine', { table: ticket.tableNumber, seat: ticket.seatNumber })}`
                  : ticket.seatNumber != null
                    ? `${ticket.zoneName} · ${t('register.seatLine', { number: ticket.seatNumber })}`
                    : ticket.tableNumber != null
                      ? `${ticket.zoneName} · ${t('register.tableLine', { number: ticket.tableNumber })}`
                      : ticket.zoneName}
              </p>
              <span data-testid="ticket-number" className="sr-only">{ticket.groupId ?? ticket.id}</span>
            </div>
            <span
              data-testid="ticket-status"
              data-ticket-status={displayStatus}
              className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[displayStatus]}`}
            >
              {statusLabels[displayStatus]}
            </span>
          </div>
          <div className="text-sm text-gray-600 space-y-0.5 mt-1">
            {ticket.phone && <div>{t('common.phone')}: {ticket.phone}</div>}
            {ticket.email && <div>{t('common.email')}: {ticket.email}</div>}
            {emailDelivery && (
              <div className={EMAIL_STATUS_COLORS[emailDelivery.status]}>
                {emailStatusLabels[emailDelivery.status]}
                {emailDelivery.status === 'ACCEPTED' && (
                  <span className="text-gray-400">{t('ticket.emailCheckSpam')}</span>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {members.length > 1 ? `${t('common.total')} · ${t('common.people', { count: members.length })}` : t('common.cost')}
            </span>
            <span data-testid="ticket-total" className="text-xl font-bold text-emerald-700">
              {formatPrice(
                members.length > 1 ? members.reduce((sum, m) => sum + m.price, 0) : ticket.price,
                currency,
              )}
            </span>
          </div>
        </div>

        {showSaveLink && (
          <div className="bg-white rounded-2xl shadow-sm px-5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700">{t('ticket.saveLink')}</p>
              <p className="text-xs text-gray-400 truncate">{ticketUrl}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleCopy}
                title={t('ticket.copyLink')}
                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {copied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
              {canShare && (
                <button
                  onClick={handleShare}
                  title={t('ticket.share')}
                  className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

          {ticket.status === 'BOOKED' && (
          <div
            data-payment-status={pollingPayment ? 'PROCESSING' : holdExpired ? 'EXPIRED' : 'CREATED'}
            className={`rounded-2xl p-6 text-center space-y-4 border ${
            holdExpired
              ? 'bg-gray-50 border-gray-300'
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="text-4xl mb-1">{holdExpired ? '⌛' : '🕐'}</div>
            <h2 className={`font-semibold ${holdExpired ? 'text-gray-700' : 'text-yellow-900'}`}>
              {holdExpired ? t('ticket.holdExpired') : t('ticket.holdActive')}
            </h2>
            {!holdExpired && holdCountdown && (
              <p className="text-sm text-yellow-800">
                {t('ticket.payWithin')} <span className="font-semibold tabular-nums">{holdCountdown}</span>
              </p>
            )}
            {pollingPayment ? (
              <p className="text-sm text-yellow-800 animate-pulse">{paymentMessage}</p>
            ) : paymentMessage ? (
              <p className="text-sm text-red-700 font-medium">{paymentMessage}</p>
            ) : holdExpired ? (
              <p className="text-sm text-gray-600">
                {t('ticket.holdExpiredHint')}
              </p>
            ) : (
              <p className="text-sm text-yellow-800">
                {t('ticket.payHint')}
              </p>
            )}
            {!holdExpired && (
              <button
                type="button"
                data-testid="payment-button"
                onClick={() => { void handlePay(); }}
                disabled={paying || pollingPayment}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {paying ? t('ticket.paying') : t('ticket.pay')}
              </button>
            )}
            {holdExpired && (
              <a
                href="/"
                className="inline-block w-full py-3 px-4 rounded-xl bg-gray-800 text-white font-semibold hover:bg-gray-900 transition-colors"
              >
                {t('common.toAfisha')}
              </a>
            )}
          </div>
        )}

        {ticket.status === 'EXPIRED' && (
          <div className="bg-gray-50 border border-gray-300 rounded-2xl p-6 text-center space-y-3">
            <div className="text-4xl">⌛</div>
            <h2 className="font-semibold text-gray-800">{t('ticket.holdExpired')}</h2>
            <p className="text-sm text-gray-600">
              {t('ticket.holdExpiredHintGroup')}
            </p>
            <a
              href="/"
              className="inline-block w-full py-3 px-4 rounded-xl bg-gray-800 text-white font-semibold hover:bg-gray-900 transition-colors"
            >
              {t('common.toAfisha')}
            </a>
          </div>
        )}

        {ticket.status === 'PENDING' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">⏳</div>
            <h2 className="font-semibold text-amber-900">{t('ticket.receiptSent')}</h2>
            <p className="text-sm text-amber-700 mt-1">
              {t('ticket.receiptPending')}
            </p>
          </div>
        )}

        {ticket.status === 'CONFIRMED' && (
          <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center gap-3">
            <div className="text-2xl">✅</div>
            <h2 className="font-semibold text-green-800">{t('ticket.confirmed')}</h2>
            <div data-testid="ticket-qr" className="p-3 bg-gray-50 rounded-xl">
              <QRCodeSVG value={ticket.groupId ?? ticket.id} size={200} />
            </div>
            <p className="text-xs text-gray-500">{t('ticket.showQr')}</p>
          </div>
        )}

        {ticket.status === 'REJECTED' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">❌</div>
            <h2 className="font-semibold text-red-800">{t('ticket.rejected')}</h2>
            <p className="text-sm text-red-600 mt-1">
              {t('ticket.rejectedHint')}
            </p>
          </div>
        )}

        {members.length > 1 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="font-semibold text-gray-800 mb-3">
              {t('ticket.groupTitle', { name: ticket.name, count: members.length - 1 })}
            </h3>
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex justify-between items-center py-1.5 border-b last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800">{m.name}</div>
                    <div className="text-xs text-gray-400">
                      {m.tableNumber != null && m.seatNumber != null
                        ? `${m.zoneName} · ${t('register.placeLine', { table: m.tableNumber, seat: m.seatNumber })}`
                        : m.seatNumber != null
                          ? `${m.zoneName} · ${t('register.seatLine', { number: m.seatNumber })}`
                          : m.zoneName}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      m.checkedIn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {m.checkedIn ? t('ticket.checkedIn') : t('ticket.waiting')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
      {/* <Footer /> */}
    </div>
  );
}
