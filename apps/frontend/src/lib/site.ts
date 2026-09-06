// Contact channels for Header/Footer. Empty social/phone values are not rendered.
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
