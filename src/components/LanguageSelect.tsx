import { language, selectLanguage, t } from '../services/i18n';

export default function LanguageSelect() {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-800">
      <label htmlFor="transitly-language-select">{t("Jezik")}</label>
      <select id="transitly-language-select" value={language} onChange={event => selectLanguage(event.target.value === 'en' ? 'en' : 'hr')}
        className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900">
        <option value="hr" lang="hr">Hrvatski</option>
        <option value="en" lang="en">English</option>
      </select>
    </div>
  );
}
