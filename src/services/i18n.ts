import english from './en.json';

type Language = 'hr' | 'en';
export const languageCookie = 'transitly-language';

export const language: Language = document.cookie.split(';')
  .some(cookie => cookie.trim() === `${languageCookie}=en`) ? 'en' : 'hr';
export const locale = language === 'hr' ? 'hr-HR' : 'en-GB';

export function selectLanguage(next: Language) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${languageCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  window.location.reload();
}

const translations: Record<string, string> = english;

export function t(source: string, ...values: (string | number)[]): string {
  const hasTranslation = Object.prototype.hasOwnProperty.call(translations, source);
  const text = language === 'en' && hasTranslation ? translations[source] : source;
  return values.length ? text.replace(/\{(\d+)\}/g, (placeholder, index) => String(values[Number(index)] ?? placeholder)) : text;
}

export function localizeDocument() {
  document.documentElement.lang = language;
  document.title = t(document.title);
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = t(description.content);
}

const relativeTime = new Intl.RelativeTimeFormat(locale, { style: 'short' });

export function relativeUpdateTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return relativeTime.format(-seconds, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return relativeTime.format(-minutes, 'minute');
  return relativeTime.format(-Math.floor(minutes / 60), 'hour');
}
