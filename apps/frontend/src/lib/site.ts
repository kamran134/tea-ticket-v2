export const WHATSAPP_URL = 'https://wa.me/994503614959';
export const PHONE_DISPLAY = '+994 50 361 49 59';
export const PHONE_HREF = 'tel:+994503614959';
export const EMAIL = 'support@birmanat.band';
export const INSTAGRAM = 'https://instagram.com/bir_manat_band';
export const TIKTOK = 'https://www.tiktok.com/@bir.manat.band';
export const SITE_URL = 'https://birmanat.band';

export function ridersUrl(lang: string): string {
  return `${SITE_URL}/${lang}/technical-rider`;
}

export function siteSectionUrl(lang: string, path: string): string {
  return `${SITE_URL}/${lang}${path}`;
}
