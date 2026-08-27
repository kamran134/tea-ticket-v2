// TODO: fill in TeaTicket's real contact channels before Header/Footer are rendered
// again anywhere — both are currently commented out on every public page (see commit
// b404664 "Скрыть header и footer с брендингом BirManatBand"), so these are unused.
// Left empty rather than fabricated: a fake phone/Instagram/TikTok handle would be
// actively wrong if someone re-enables these components later.
export const WHATSAPP_URL = '';
export const PHONE_DISPLAY = '';
export const PHONE_HREF = '';
export const EMAIL = 'support@tea-ticket.com';
export const INSTAGRAM = '';
export const TIKTOK = '';
export const SITE_URL = 'https://tea-ticket.com';

export function ridersUrl(lang: string): string {
  return `${SITE_URL}/${lang}/technical-rider`;
}

export function siteSectionUrl(lang: string, path: string): string {
  return `${SITE_URL}/${lang}${path}`;
}
