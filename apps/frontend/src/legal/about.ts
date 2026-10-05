import type { Lang } from '../i18n/types';

export interface AboutActivity {
  title: string;
  body: string;
}

export interface AboutCopy {
  intro: string[];
  whatWeDo: string;
  activities: AboutActivity[];
  partners: string;
  closing: string[];
  cooperationTitle: string;
  legalTitle: string;
}

const ru: AboutCopy = {
  intro: [
    'StolitsArt — агентство по организации культурных и концертных мероприятий в Баку. С 2022 года мы создаём и проводим театральные постановки, концертные программы, литературные и творческие вечера, городские праздники и другие культурные события.',
    'Мы занимаемся организацией мероприятия целиком: от разработки концепции и сценария до подбора артистов, площадки, технического оснащения, оформления, продвижения и проведения события.',
  ],
  whatWeDo: 'Чем конкретно мы занимаемся:',
  activities: [
    {
      title: 'Театр и спектакли',
      body: 'От камерных постановок до масштабных шоу — как на самых престижных площадках города, так и под открытым небом. Тематические, стилизованные интерактивные спектакли.',
    },
    {
      title: 'Литературные и творческие вечера',
      body: 'Поэзия, проза, музыка, встречи с авторами. Салонные вечера в стиле 19 века.',
    },
    {
      title: 'Концертные программы',
      body: 'Классика, джаз, этно, рок, современные проекты. Фестивали искусств.',
    },
    {
      title: 'Культурные события',
      body: 'Балы, городские праздники, детские спектакли. Все, что делает город ярче.',
    },
  ],
  partners:
    'StolitsArt сотрудничает с музыкальными коллективами и артистами разных жанров, среди которых Bir Manat Band, Gr3y Band, Sadnos и другие исполнители.',
  closing: [
    'А теперь мы открываем и онлайн-кассу — чтобы вам было еще удобнее, мы запустили StolitsArt Ticket — нашу собственную платформу продажи билетов. Больше не нужно искать по разным сайтам. Все лучшие события от нашей команды и партнеров — теперь в одном месте, 24/7.',
    'Билеты на самые интересные события города — в один клик. Удобный сайт, понятные билеты, вежливый сервис. Выбирайте место, оплачивайте онлайн и приходите наслаждаться искусством.',
  ],
  cooperationTitle: 'По вопросам сотрудничества:',
  legalTitle: 'Правовая информация',
};

const az: AboutCopy = {
  intro: [
    'StolitsArt — Bakıda mədəni və konsert tədbirlərinin təşkili üzrə agentlikdir. 2022-ci ildən teatr quruluşları, konsert proqramları, ədəbi və yaradıcı axşamlar, şəhər bayramları və digər mədəni tədbirlər yaradır və keçiririk.',
    'Tədbiri bütövlükdə təşkil edirik: konsepsiya və ssenarinin hazırlanmasından artistlərin, məkanın və texniki təchizatın seçilməsinə, tərtibata, təbliğata və tədbirin keçirilməsinə qədər.',
  ],
  whatWeDo: 'Konkret olaraq nə ilə məşğul oluruq:',
  activities: [
    {
      title: 'Teatr və tamaşalar',
      body: 'Kamera quruluşlarından irimiqyaslı şoulara qədər — həm şəhərin ən nüfuzlu səhnələrində, həm də açıq səma altında. Tematik, stilizə olunmuş interaktiv tamaşalar.',
    },
    {
      title: 'Ədəbi və yaradıcı axşamlar',
      body: 'Poeziya, nəsr, musiqi, müəlliflərlə görüşlər. XIX əsr üslubunda salon axşamları.',
    },
    {
      title: 'Konsert proqramları',
      body: 'Klassika, caz, etno, rok, müasir layihələr. İncəsənət festivalları.',
    },
    {
      title: 'Mədəni tədbirlər',
      body: 'Ballar, şəhər bayramları, uşaq tamaşaları. Şəhəri daha parlaq edən hər şey.',
    },
  ],
  partners:
    'StolitsArt müxtəlif janrlı musiqi kollektivləri və artistlərlə əməkdaşlıq edir, onların sırasında Bir Manat Band, Gr3y Band, Sadnos və digər ifaçılar var.',
  closing: [
    'İndi isə onlayn kassa da açırıq — sizə daha rahat olsun deyə StolitsArt Ticket-i, öz bilet satış platformamızı işə saldıq. Artıq müxtəlif saytlarda axtarmaq lazım deyil. Komandamızın və tərəfdaşlarımızın ən yaxşı tədbirləri — indi bir yerdə, 24/7.',
    'Şəhərin ən maraqlı tədbirlərinə biletlər — bir kliklə. Rahat sayt, anlaşılan biletlər, nəzakətli xidmət. Yerinizi seçin, onlayn ödəyin və sənətdən zövq almağa gəlin.',
  ],
  cooperationTitle: 'Əməkdaşlıq məsələləri üzrə:',
  legalTitle: 'Hüquqi məlumat',
};

const en: AboutCopy = {
  intro: [
    'StolitsArt is an agency organising cultural and concert events in Baku. Since 2022 we have been creating and staging theatre productions, concert programmes, literary and creative evenings, city celebrations and other cultural events.',
    'We organise the event in full: from developing the concept and script to selecting the artists, the venue and the technical equipment, and on to the design, promotion and running of the event.',
  ],
  whatWeDo: 'What we do:',
  activities: [
    {
      title: 'Theatre and performances',
      body: 'From intimate productions to large-scale shows — on the city’s most prestigious stages and under the open sky. Thematic, stylised interactive performances.',
    },
    {
      title: 'Literary and creative evenings',
      body: 'Poetry, prose, music, meetings with authors. Salon evenings in the style of the 19th century.',
    },
    {
      title: 'Concert programmes',
      body: 'Classical, jazz, ethno, rock, contemporary projects. Arts festivals.',
    },
    {
      title: 'Cultural events',
      body: 'Balls, city celebrations, children’s performances. Everything that makes the city brighter.',
    },
  ],
  partners:
    'StolitsArt collaborates with musical groups and artists across different genres, including Bir Manat Band, Gr3y Band, Sadnos and other performers.',
  closing: [
    'And now we are opening an online box office too — to make things easier, we launched StolitsArt Ticket, our own ticketing platform. No more searching across different sites. The best events from our team and partners are now in one place, 24/7.',
    'Tickets to the city’s most interesting events — in one click. A clear website, straightforward tickets, considerate service. Choose your seat, pay online and come enjoy the art.',
  ],
  cooperationTitle: 'For cooperation enquiries:',
  legalTitle: 'Legal information',
};

export const ABOUT_COPY: Record<Lang, AboutCopy> = { ru, az, en };
