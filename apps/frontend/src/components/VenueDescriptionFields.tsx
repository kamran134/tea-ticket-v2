import { useState } from 'react';
import { descriptionForApi, isEmptyDescription } from '../lib/descriptionHtml';
import { RichTextEditor } from './RichTextEditor';

const DESCRIPTION_LANGS = [
  { id: 'ru', label: 'RU', title: 'Русский', placeholder: 'Описание на русском' },
  { id: 'az', label: 'AZ', title: 'Azərbaycan', placeholder: 'Təsvir azərbaycan dilində' },
  { id: 'en', label: 'EN', title: 'English', placeholder: 'Description in English' },
] as const;

export type DescriptionLang = (typeof DESCRIPTION_LANGS)[number]['id'];

export interface VenueDescriptions {
  ru: string;
  az: string;
  en: string;
}

export function emptyVenueDescriptions(): VenueDescriptions {
  return { ru: '', az: '', en: '' };
}

export function venueDescriptionsPayload(value: VenueDescriptions) {
  return {
    description: descriptionForApi(value.ru),
    descriptionAz: descriptionForApi(value.az),
    descriptionEn: descriptionForApi(value.en),
  };
}

interface Props {
  value: VenueDescriptions;
  onChange: (next: VenueDescriptions) => void;
  compact?: boolean;
}

export function VenueDescriptionFields({ value, onChange, compact = false }: Props) {
  const [lang, setLang] = useState<DescriptionLang>('ru');
  const current = DESCRIPTION_LANGS.find(item => item.id === lang) ?? DESCRIPTION_LANGS[0];

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <span className={`text-gray-400 mr-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>Описание</span>
        {DESCRIPTION_LANGS.map(item => {
          const filled = !isEmptyDescription(value[item.id]);
          const active = item.id === lang;
          return (
            <button
              key={item.id}
              type="button"
              title={item.title}
              aria-pressed={active}
              onClick={() => setLang(item.id)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide transition-colors ${
                active
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
            >
              {item.label}
              {filled && (
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-emerald-500'}`}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
      <RichTextEditor
        key={lang}
        value={value[lang]}
        onChange={html => onChange({ ...value, [lang]: html })}
        placeholder={current.placeholder}
        compact={compact}
      />
      <p className={`text-gray-400 mt-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        Пустой перевод на сайте заменяется русским описанием.
      </p>
    </div>
  );
}
