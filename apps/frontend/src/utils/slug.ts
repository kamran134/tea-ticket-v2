// Cyrillic (Russian) plus the Azerbaijani-specific Latin letters not already
// ASCII (ə ğ ı ö ü ş ç) — this app runs events in Baku, and event names are
// routinely a mix of Russian and Azerbaijani, e.g. "Çay gecəsi".
const RU_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ə: 'e', ğ: 'g', ı: 'i', ö: 'o', ü: 'u', ş: 'sh', ç: 'ch',
};

function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map(ch => RU_TO_LATIN[ch] ?? ch)
    .join('');
}

export function slugify(text: string): string {
  return transliterate(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function generateVenueSlug(name: string, dateIso: string): string {
  const datePart = dateIso ? dateIso.slice(0, 10) : '';
  const base = slugify(name);
  return [base, datePart].filter(Boolean).join('-');
}
