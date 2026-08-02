const TIME_ZONE = 'Asia/Baku';

export interface TicketEmailTemplateData {
  checkoutId: string;
  ticketUrl: string;
  eventName: string;
  eventDate: Date;
  buyerName: string;
  zoneName: string;
  seatLabels: string[];
  tableLabel: string | null;
  ticketCount: number;
  totalAmount: number;
  currency: string;
  supportEmail: string;
}

export interface RenderedTicketEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEventDate(date: Date): { az: string; ru: string } {
  const az = new Intl.DateTimeFormat('az-AZ', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  const ru = new Intl.DateTimeFormat('ru-RU', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return { az, ru };
}

function formatPrice(amount: number, currency: string): string {
  const formatted = amount.toLocaleString('az-AZ');
  if (currency === '$') return `$${formatted}`;
  return `${formatted} ${currency}`;
}

function placesLine(data: TicketEmailTemplateData): { az: string; ru: string } | null {
  if (data.tableLabel) {
    return {
      az: `Masa: ${data.tableLabel}`,
      ru: `Стол: ${data.tableLabel}`,
    };
  }
  if (data.seatLabels.length > 0) {
    const seats = data.seatLabels.join(', ');
    return {
      az: `Yerlər: ${seats}`,
      ru: `Места: ${seats}`,
    };
  }
  return null;
}

export function renderTicketConfirmedEmail(data: TicketEmailTemplateData): RenderedTicketEmail {
  const dates = formatEventDate(data.eventDate);
  const places = placesLine(data);
  const total = formatPrice(data.totalAmount, data.currency);

  const e = {
    brand: escapeHtml('BirManat'),
    eventName: escapeHtml(data.eventName),
    buyerName: escapeHtml(data.buyerName),
    zoneName: escapeHtml(data.zoneName),
    dateAz: escapeHtml(dates.az),
    dateRu: escapeHtml(dates.ru),
    placesAz: places ? escapeHtml(places.az) : null,
    placesRu: places ? escapeHtml(places.ru) : null,
    ticketCount: String(data.ticketCount),
    total: escapeHtml(total),
    ticketUrl: escapeHtml(data.ticketUrl),
    supportEmail: escapeHtml(data.supportEmail),
  };

  const subject = `BirManat — Bilet təsdiqləndi / Билет подтверждён · ${data.eventName}`;

  const html = `<!DOCTYPE html>
<html lang="az">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:700;letter-spacing:0.02em;">${e.brand}</td></tr>
        <tr><td style="padding:8px 28px 0;font-size:18px;font-weight:600;">Bilet təsdiqləndi / Билет подтверждён</td></tr>
        <tr><td style="padding:16px 28px 0;font-size:15px;line-height:1.5;">
          <strong>${e.eventName}</strong><br>
          <span style="color:#52525b;">${e.dateAz}</span><br>
          <span style="color:#52525b;">${e.dateRu}</span>
        </td></tr>
        <tr><td style="padding:16px 28px 0;font-size:15px;line-height:1.6;">
          Alıcı / Покупатель: <strong>${e.buyerName}</strong><br>
          Zona / Зона: <strong>${e.zoneName}</strong><br>
          ${e.placesAz ? `${e.placesAz}<br>${e.placesRu}<br>` : ''}
          Bilet sayı / Кол-во билетов: <strong>${e.ticketCount}</strong><br>
          Cəmi / Итого: <strong>${e.total}</strong>
        </td></tr>
        <tr><td align="center" style="padding:24px 28px 8px;">
          <img src="cid:ticket-qr" width="240" height="240" alt="QR-код билета" style="display:block;border:0;width:240px;height:240px;">
        </td></tr>
        <tr><td align="center" style="padding:8px 28px 0;">
          <a href="${e.ticketUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;">
            Bileti aç / Открыть билет
          </a>
        </td></tr>
        <tr><td style="padding:16px 28px 0;font-size:13px;line-height:1.5;color:#52525b;word-break:break-all;">
          ${e.ticketUrl}
        </td></tr>
        <tr><td style="padding:16px 28px 28px;font-size:13px;line-height:1.5;color:#52525b;">
          Girişdə bu QR kodu göstərin.<br>
          Покажите этот QR-код на входе.<br><br>
          Dəstək / Поддержка: ${e.supportEmail}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    'BirManat',
    'Bilet təsdiqləndi / Билет подтверждён',
    '',
    data.eventName,
    dates.az,
    dates.ru,
    '',
    `Alıcı / Покупатель: ${data.buyerName}`,
    `Zona / Зона: ${data.zoneName}`,
    places ? places.az : null,
    places ? places.ru : null,
    `Bilet sayı / Кол-во билетов: ${data.ticketCount}`,
    `Cəmi / Итого: ${total}`,
    '',
    `Bilet / Билет: ${data.ticketUrl}`,
    '',
    'Girişdə bu QR kodu göstərin.',
    'Покажите этот QR-код на входе.',
    '',
    `Dəstək / Поддержка: ${data.supportEmail}`,
  ]
    .filter(line => line !== null)
    .join('\n');

  return { subject, html, text };
}
