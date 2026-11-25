// Site-level SEO copy. Russian is the indexed language until per-language URLs exist.

export const SITE_NAME = 'Tickets Bir Manat';
export const SITE_LANG = 'ru';
export const EVENT_CITY = 'Баку';
export const EVENT_COUNTRY_CODE = 'AZ';

/** The band, as described by its own site (birmanat.band, schema.org MusicGroup). */
export const PERFORMER = {
  name: 'BIR MANAT BAND',
  alternateName: ['Bir Manat Band', 'Bir Manat', 'Бир Манат'],
  url: 'https://birmanat.band/',
  sameAs: [
    'https://instagram.com/bir_manat_band',
    'https://www.tiktok.com/@bir.manat.band',
    'https://www.youtube.com/@BirManatBand',
  ],
} as const;

export const HOME_TITLE = 'Билеты на концерты BIR MANAT BAND в Баку | Tickets Bir Manat';
export const HOME_HEADING = 'Билеты на концерты BIR MANAT BAND в Баку';
export const HOME_DESCRIPTION =
  'Официальная продажа билетов на концерты кавер-группы BIR MANAT BAND (Бир Манат) в Баку: ' +
  'афиша ближайших концертов, выбор мест на схеме зала и покупка билетов онлайн.';
export const HOME_INTRO =
  'Здесь продаются билеты на концерты BIR MANAT BAND (Bir Manat Band, Бир Манат) — кавер-группы ' +
  'из Баку, которая исполняет русский рок и поп-хиты. Выберите концерт, отметьте места на схеме ' +
  'зала и оформите билет онлайн.';

export interface StaticPageCopy {
  title: string;
  description: string;
}

/** Pages whose content lives only in the frontend bundle; the head still needs real titles. */
export const STATIC_PAGES: Record<string, StaticPageCopy> = {
  '/about': {
    title: `О нас — ${SITE_NAME}`,
    description: 'Кто продаёт билеты на концерты BIR MANAT BAND: реквизиты продавца и контакты.',
  },
  '/privacy-policy': {
    title: `Политика конфиденциальности — ${SITE_NAME}`,
    description: 'Как Tickets Bir Manat обрабатывает и хранит персональные данные покупателей билетов.',
  },
  '/terms': {
    title: `Пользовательское соглашение — ${SITE_NAME}`,
    description: 'Условия покупки и использования билетов на концерты BIR MANAT BAND.',
  },
  '/refund-policy': {
    title: `Условия возврата билетов — ${SITE_NAME}`,
    description: 'Как вернуть билет на концерт BIR MANAT BAND и в какие сроки возвращаются деньги.',
  },
};
