import { t } from '../services/i18n';
import { installPromptUnavailable, openInstallPrompt } from './InstallAppPrompt';

// Menu entry: opens the install pop-up.
export default function InstallAppButton() {
  if (installPromptUnavailable()) return null;
  return (
    <div className="mb-2">
      <button type="button" onClick={openInstallPrompt}
        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm">
        {t("Instaliraj aplikaciju")}
      </button>
    </div>
  );
}
