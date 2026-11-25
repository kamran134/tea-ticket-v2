// Site-level SEO copy in every public language (see locale.ts).
import type { SeoLang } from './locale';

export const SITE_NAME = 'Tickets Bir Manat';
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

const BAND = PERFORMER.name;

export interface StaticPageCopy {
  title: string;
  description: string;
}

export interface SiteCopy {
  city: string;
  homeTitle: string;
  homeHeading: string;
  homeDescription: string;
  homeIntro: string;
  upcomingHeading: string;
  noUpcoming: string;
  bandSite: string;
  allConcerts: string;
  concertsListName: string;
  eventTitle: (name: string, day: string) => string;
  eventLead: (name: string, date: string, city: string) => string;
  eventTicketsLine: (price: string | null) => string;
  priceFrom: (price: string) => string;
  posterAlt: (name: string) => string;
  ticketsHeading: string;
  pricesSoon: string;
  soldOut: string;
  howToBuy: string;
  aboutConcert: string;
  pastTitle: (name: string, day: string) => string;
  pastNotice: (date: string) => string;
  notFoundTitle: string;
  notFoundText: string;
  staticPages: Record<string, StaticPageCopy>;
}

export const SITE_COPY: Record<SeoLang, SiteCopy> = {
  ru: {
    city: 'Баку',
    homeTitle: `Билеты на концерты ${BAND} в Баку | ${SITE_NAME}`,
    homeHeading: `Билеты на концерты ${BAND} в Баку`,
    homeDescription:
      `Официальная продажа билетов на концерты кавер-группы ${BAND} (Бир Манат) в Баку: ` +
      'афиша ближайших концертов, выбор мест на схеме зала и покупка билетов онлайн.',
    homeIntro:
      `Здесь продаются билеты на концерты ${BAND} (Bir Manat Band, Бир Манат) — кавер-группы ` +
      'из Баку, которая исполняет русский рок и поп-хиты. Выберите концерт, отметьте места на схеме ' +
      'зала и оформите билет онлайн.',
    upcomingHeading: 'Ближайшие концерты',
    noUpcoming: 'Пока нет предстоящих концертов — следите за анонсами.',
    bandSite: 'О группе, репертуаре и заказе выступлений — на сайте',
    allConcerts: `Все концерты ${BAND}`,
    concertsListName: `Концерты ${BAND}`,
    eventTitle: (name, day) => `${name}, ${day} — билеты | ${BAND}`,
    eventLead: (name, date, city) => `${name} — ${date}, ${city}.`,
    eventTicketsLine: price => (price ? `Билеты на ${BAND} ${price} онлайн.` : `Билеты на ${BAND} онлайн.`),
    priceFrom: price => `от ${price}`,
    posterAlt: name => `${name} — афиша концерта`,
    ticketsHeading: 'Билеты',
    pricesSoon: 'Цены появятся, когда откроется продажа.',
    soldOut: 'мест нет',
    howToBuy:
      'Билеты продаются онлайн на этой странице: выберите места на схеме зала, укажите контакты и оформите заказ.',
    aboutConcert: 'О концерте',
    pastTitle: (name, day) => `${name}, ${day} — концерт прошёл | ${BAND}`,
    pastNotice: date => `Этот концерт прошёл ${date}. Билеты на ближайшие концерты — на афише.`,
    notFoundTitle: `Страница не найдена — ${SITE_NAME}`,
    notFoundText: 'Такой страницы нет: возможно, ссылка устарела или концерт снят с продажи.',
    staticPages: {
      '/about': {
        title: `О нас — ${SITE_NAME}`,
        description: `Кто продаёт билеты на концерты ${BAND}: реквизиты продавца и контакты.`,
      },
      '/privacy-policy': {
        title: `Политика конфиденциальности — ${SITE_NAME}`,
        description: `Как ${SITE_NAME} обрабатывает и хранит персональные данные покупателей билетов.`,
      },
      '/terms': {
        title: `Пользовательское соглашение — ${SITE_NAME}`,
        description: `Условия покупки и использования билетов на концерты ${BAND}.`,
      },
      '/refund-policy': {
        title: `Условия возврата билетов — ${SITE_NAME}`,
        description: `Как вернуть билет на концерт ${BAND} и в какие сроки возвращаются деньги.`,
      },
    },
  },
  az: {
    city: 'Bakı',
    homeTitle: `Bakıda ${BAND} konsertlərinə biletlər | ${SITE_NAME}`,
    homeHeading: `Bakıda ${BAND} konsertlərinə biletlər`,
    homeDescription:
      `${BAND} (Bir Manat) cover qrupunun Bakıdakı konsertlərinə rəsmi bilet satışı: ` +
      'yaxın konsertlərin afişası, zal sxemində yer seçimi və onlayn bilet alışı.',
    homeIntro:
      `Burada ${BAND} (Bir Manat Band) — rus roku və pop hitləri ifa edən Bakı cover qrupunun ` +
      'konsertlərinə biletlər satılır. Konserti seçin, zal sxemində yerləri qeyd edin və bileti onlayn rəsmiləşdirin.',
    upcomingHeading: 'Yaxın konsertlər',
    noUpcoming: 'Hələ ki, qarşıdan gələn konsert yoxdur — elanları izləyin.',
    bandSite: 'Qrup, repertuar və çıxış sifarişi haqqında — saytda',
    allConcerts: `Bütün ${BAND} konsertləri`,
    concertsListName: `${BAND} konsertləri`,
    eventTitle: (name, day) => `${name}, ${day} — biletlər | ${BAND}`,
    eventLead: (name, date, city) => `${name} — ${date}, ${city}.`,
    eventTicketsLine: price => (price ? `${BAND} biletləri onlayn, ${price}.` : `${BAND} biletləri onlayn.`),
    priceFrom: price => `${price}-dən`,
    posterAlt: name => `${name} — konsert afişası`,
    ticketsHeading: 'Biletlər',
    pricesSoon: 'Qiymətlər satış açılanda görünəcək.',
    soldOut: 'yer yoxdur',
    howToBuy:
      'Biletlər bu səhifədə onlayn satılır: zal sxemində yerləri seçin, əlaqə məlumatlarını göstərin və sifarişi rəsmiləşdirin.',
    aboutConcert: 'Konsert haqqında',
    pastTitle: (name, day) => `${name}, ${day} — konsert keçib | ${BAND}`,
    pastNotice: date => `Bu konsert ${date} tarixində keçib. Yaxın konsertlərin biletləri — afişada.`,
    notFoundTitle: `Səhifə tapılmadı — ${SITE_NAME}`,
    notFoundText: 'Belə səhifə yoxdur: link köhnəlmiş ola bilər və ya konsert satışdan çıxarılıb.',
    staticPages: {
      '/about': {
        title: `Haqqımızda — ${SITE_NAME}`,
        description: `${BAND} konsertlərinə biletləri kim satır: satıcının rekvizitləri və əlaqə.`,
      },
      '/privacy-policy': {
        title: `Məxfilik Siyasəti — ${SITE_NAME}`,
        description: `${SITE_NAME} bilet alıcılarının şəxsi məlumatlarını necə emal edir və saxlayır.`,
      },
      '/terms': {
        title: `İstifadəçi Sazişi — ${SITE_NAME}`,
        description: `${BAND} konsertlərinə biletlərin alınması və istifadəsi şərtləri.`,
      },
      '/refund-policy': {
        title: `Biletlərin Qaytarılması Şərtləri — ${SITE_NAME}`,
        description: `${BAND} konsertinə bileti necə qaytarmaq olar və pul hansı müddətdə qaytarılır.`,
      },
    },
  },
  en: {
    city: 'Baku',
    homeTitle: `${BAND} concert tickets in Baku | ${SITE_NAME}`,
    homeHeading: `${BAND} concert tickets in Baku`,
    homeDescription:
      `Official ticket sales for concerts of ${BAND} (Bir Manat), a cover band from Baku: ` +
      'upcoming shows, seat selection on the hall map and online ticket purchase.',
    homeIntro:
      `Tickets for ${BAND} (Bir Manat Band) — a Baku cover band playing Russian rock and pop hits. ` +
      'Pick a concert, choose your seats on the hall map and get your ticket online.',
    upcomingHeading: 'Upcoming concerts',
    noUpcoming: 'No upcoming concerts yet — stay tuned for announcements.',
    bandSite: 'About the band, repertoire and booking — on the website of',
    allConcerts: `All ${BAND} concerts`,
    concertsListName: `${BAND} concerts`,
    eventTitle: (name, day) => `${name}, ${day} — tickets | ${BAND}`,
    eventLead: (name, date, city) => `${name} — ${date}, ${city}.`,
    eventTicketsLine: price => (price ? `${BAND} tickets ${price} online.` : `${BAND} tickets online.`),
    priceFrom: price => `from ${price}`,
    posterAlt: name => `${name} — concert poster`,
    ticketsHeading: 'Tickets',
    pricesSoon: 'Prices will appear when sales open.',
    soldOut: 'sold out',
    howToBuy:
      'Tickets are sold online on this page: choose seats on the hall map, enter your contacts and place the order.',
    aboutConcert: 'About the concert',
    pastTitle: (name, day) => `${name}, ${day} — concert has passed | ${BAND}`,
    pastNotice: date => `This concert took place on ${date}. Tickets for upcoming concerts are on the events page.`,
    notFoundTitle: `Page not found — ${SITE_NAME}`,
    notFoundText: 'This page does not exist: the link may be outdated or the concert was taken off sale.',
    staticPages: {
      '/about': {
        title: `About us — ${SITE_NAME}`,
        description: `Who sells tickets for ${BAND} concerts: seller details and contacts.`,
      },
      '/privacy-policy': {
        title: `Privacy Policy — ${SITE_NAME}`,
        description: `How ${SITE_NAME} processes and stores ticket buyers' personal data.`,
      },
      '/terms': {
        title: `User Agreement — ${SITE_NAME}`,
        description: `Terms of buying and using tickets for ${BAND} concerts.`,
      },
      '/refund-policy': {
        title: `Ticket Refund Policy — ${SITE_NAME}`,
        description: `How to return a ${BAND} concert ticket and when the money is refunded.`,
      },
    },
  },
};

/** Paths of pages that exist only in the frontend bundle but still get real head tags. */
export const STATIC_PAGE_PATHS = Object.keys(SITE_COPY.ru.staticPages);
