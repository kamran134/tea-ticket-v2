// Contact channels for Header/Footer. Empty social/phone values are not rendered.
export const WHATSAPP_URL = '';
export const PHONE_DISPLAY = '+994 10 475 95 37';
export const PHONE_HREF = 'tel:+994104759537';
export const EMAIL = 'support@stolits.art';
export const INSTAGRAM = '';
export const TIKTOK = '';
export const SITE_URL = 'https://stolits.art';

export function ridersUrl(lang: string): string {
  return `${SITE_URL}/${lang}/technical-rider`;
}

export function siteSectionUrl(lang: string, path: string): string {
  return `${SITE_URL}/${lang}${path}`;
}
