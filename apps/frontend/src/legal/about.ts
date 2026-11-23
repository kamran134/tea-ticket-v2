import type { Lang } from '../i18n/types';

export const BAND_WEBSITE_URL = 'https://birmanat.band/';

export interface AboutSection {
  heading: string;
  paragraphs: string[];
  list?: string[];
}

export interface AboutCopy {
  title: string;
  intro: string[];
  sections: AboutSection[];
  bookingTitle: string;
  legalTitle: string;
}

const ru: AboutCopy = {
  title: 'BIR MANAT BAND — живая музыка, которая объединяет!',
  intro: [
    'BIR MANAT BAND — кавер-группа из Баку, объединяющая разные музыкальные направления, культуры и поколения.',
    'Мы исполняем лучшие хиты русской, зарубежной, азербайджанской и турецкой музыки, наполняя каждое выступление энергией живого звука и атмосферой настоящего праздника.',
    'Наш репертуар охватывает самые разные жанры: от легендарных рок-композиций до современных поп-хитов и танцевальной музыки. Мы подбираем программу так, чтобы каждый гость мероприятия мог услышать знакомые и любимые песни.',
    'Для нас музыка — это не просто исполнение песен. Это эмоции, общение и особая атмосфера, которая объединяет людей. Наша задача — сделать каждое выступление ярким событием, которое захочется вспоминать.',
  ],
  sections: [
    {
      heading: 'Живая музыка для ваших мероприятий',
      paragraphs: ['BIR MANAT BAND выступает на мероприятиях различных форматов:'],
      list: [
        'Свадьбы и частные торжества',
        'Корпоративные мероприятия и вечеринки',
        'Фестивали и концерты',
        'Бары, рестораны и клубы',
        'Частные вечеринки и специальные события',
      ],
    },
    {
      heading: 'Профессиональные музыканты и собственное оборудование',
      paragraphs: [
        'В составе BIR MANAT BAND — опытные музыканты, объединённые любовью к живой музыке и качественному сценическому исполнению.',
        'Мы уделяем особое внимание звучанию, слаженности коллектива и энергетике выступления.',
        'Одно из наших важных преимуществ — собственное профессиональное звуковое и сценическое оборудование. Это позволяет нам самостоятельно обеспечивать техническую сторону выступления, адаптироваться под формат мероприятия и особенности площадки.',
      ],
    },
    {
      heading: 'Музыка без границ',
      paragraphs: [
        'BIR MANAT BAND объединяет музыку разных стран и культур. Благодаря разнообразному репертуару мы можем создать программу как для русскоязычной аудитории, так и для гостей, предпочитающих азербайджанскую, турецкую и международную музыку.',
        'Мы базируемся в Баку и открыты для выступлений по всему Азербайджану и за его пределами.',
      ],
    },
    {
      heading: 'Давайте сделаем ваше мероприятие незабываемым!',
      paragraphs: [
        'Пригласите BIR MANAT BAND на своё мероприятие и подарите гостям атмосферу живой музыки, ярких эмоций и отличного настроения.',
      ],
    },
  ],
  bookingTitle: 'Бронирование и сотрудничество:',
  legalTitle: 'Правовая информация',
};

const az: AboutCopy = {
  title: 'BIR MANAT BAND — canlı musiqi, unudulmaz anlar!',
  intro: [
    'BIR MANAT BAND — Bakı şəhərində fəaliyyət göstərən, müxtəlif musiqi üslublarını və mədəniyyətləri bir araya gətirən canlı musiqi qrupudur.',
    'Biz rus, beynəlxalq, Azərbaycan və türk musiqisinin sevilən hitlərini özünəməxsus enerji və canlı ifa ilə təqdim edirik. Repertuarımızda əfsanəvi rok mahnılarından müasir pop hitlərinə və rəqs musiqilərinə qədər geniş seçim var.',
    'Bizim üçün musiqi sadəcə ifa deyil. Musiqi insanları bir araya gətirən, tədbirə xüsusi ab-hava və unudulmaz emosiyalar bəxş edən enerjidir. Məqsədimiz hər çıxışımızı qonaqların uzun müddət xatırlayacağı bir təcrübəyə çevirməkdir.',
  ],
  sections: [
    {
      heading: 'Tədbirləriniz üçün canlı musiqi',
      paragraphs: ['BIR MANAT BAND müxtəlif formatlı tədbirlərdə çıxış edir:'],
      list: [
        'Toylar və özəl tədbirlər',
        'Korporativ tədbirlər və şirkət gecələri',
        'Festivallar və konsertlər',
        'Barlar, restoranlar və klublar',
        'Özəl partilər və digər xüsusi tədbirlər',
      ],
    },
    {
      heading: 'Peşəkar musiqiçilər və öz avadanlığımız',
      paragraphs: [
        'Qrupumuz təcrübəli musiqiçilərdən ibarətdir. Biz canlı ifanın keyfiyyətinə, musiqi uyğunluğuna və səhnə performansına xüsusi diqqət yetiririk.',
        'Öz peşəkar səs və səhnə avadanlıqlarımız tədbirin formatına və məkanın xüsusiyyətlərinə uyğunlaşmağa, musiqi proqramını və texniki təminatı birlikdə təşkil etməyə imkan verir.',
      ],
    },
    {
      heading: 'Musiqi sərhəd tanımır',
      paragraphs: [
        'Azərbaycan, türk, rus və beynəlxalq musiqi repertuarını bir araya gətirərək müxtəlif zövqlərə malik auditoriya üçün çıxış edirik. Bakıda fəaliyyət göstəririk və Azərbaycan daxilində, eləcə də xaricdə keçirilən tədbirlərdə iştirak etməyə açığıq.',
      ],
    },
    {
      heading: 'Tədbirinizi birlikdə unudulmaz edək!',
      paragraphs: [
        'BIR MANAT BAND-ı tədbirinizə dəvət edin və qonaqlarınıza canlı musiqinin enerjisini yaşadın.',
      ],
    },
  ],
  bookingTitle: 'Sifariş və əməkdaşlıq üçün:',
  legalTitle: 'Hüquqi məlumat',
};

const en: AboutCopy = {
  title: 'BIR MANAT BAND — Live Music That Brings People Together!',
  intro: [
    'BIR MANAT BAND is a live cover band based in Baku, Azerbaijan, bringing together different musical styles, cultures and generations.',
    'We perform popular hits from Russian, international, Azerbaijani and Turkish music, combining energetic live performances with a vibrant atmosphere for every event.',
    'Our repertoire covers a wide range of genres, from iconic rock anthems to modern pop hits and dance classics. We shape our music program to create an engaging experience for audiences of different ages and musical tastes.',
    'For us, music is more than just performing songs. It is about emotion, connection and creating an atmosphere that brings people together. Our goal is to make every performance a memorable part of your event.',
  ],
  sections: [
    {
      heading: 'Live Music for Your Events',
      paragraphs: ['BIR MANAT BAND performs at a variety of events:'],
      list: [
        'Weddings and private celebrations',
        'Corporate events and parties',
        'Festivals and concerts',
        'Bars, restaurants and clubs',
        'Private parties and special occasions',
      ],
    },
    {
      heading: 'Professional Musicians and Our Own Equipment',
      paragraphs: [
        'BIR MANAT BAND brings together experienced musicians who share a passion for live music and quality performances.',
        'We pay close attention to sound quality, musical coordination and stage presence.',
        'One of our key advantages is that we provide our own professional sound and stage equipment. This allows us to take care of the technical side of the performance and adapt to the format and requirements of each venue.',
      ],
    },
    {
      heading: 'Music Without Borders',
      paragraphs: [
        'Our repertoire brings together music from Azerbaijan, Turkey, Russia and around the world, allowing us to connect with audiences from different backgrounds.',
        'Based in Baku, we are available for events throughout Azerbaijan and internationally.',
      ],
    },
    {
      heading: "Let's Make Your Event Unforgettable!",
      paragraphs: [
        'Invite BIR MANAT BAND to your event and give your guests the energy of live music, memorable moments and a great atmosphere.',
      ],
    },
  ],
  bookingTitle: 'Bookings and inquiries:',
  legalTitle: 'Legal information',
};

export const ABOUT_COPY: Record<Lang, AboutCopy> = { ru, az, en };
