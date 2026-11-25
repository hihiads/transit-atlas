import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { API_ROOT } from '../services/platform';
import { t } from '../services/i18n';

export interface Announcement {
  text: string;
  level: 'info' | 'warning';
  expiresAt: string | null;
  updatedAt: string;
}

export function AnnouncementBanner({ text, level, onDismiss }: Pick<Announcement, 'text' | 'level'> & { onDismiss?: () => void }) {
  const colors = level === 'warning' ? 'border-amber-300 bg-amber-100 text-amber-950' : 'border-sky-300 bg-sky-100 text-sky-950';
  return (
    <div className={"flex shrink-0 items-start gap-3 max-h-32 overflow-y-auto border-b px-4 py-2.5 text-sm " + colors}>
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-5">{text}</p>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label={t("Zatvori najavu")} className="shrink-0 rounded p-1 hover:bg-black/10 focus-visible:outline focus-visible:outline-2"><X size={17} aria-hidden="true" /></button>}
    </div>
  );
}

export default function SiteAnnouncement() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissedAt, setDismissedAt] = useState('');

  useEffect(() => {
    let pending: AbortController | undefined;
    async function refresh() {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      setAnnouncement(current => current?.expiresAt && Date.parse(current.expiresAt) <= Date.now() ? null : current);
      try {
        const response = await fetch(API_ROOT + '/announcement', { signal: controller.signal });
        if (!response.ok) return;
        const { announcement } = await response.json();
        if (!controller.signal.aborted) setAnnouncement(announcement);
      } catch {
        // Keep the last active announcement if the connection temporarily drops.
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { pending?.abort(); window.clearInterval(timer); };
  }, []);

  if (!announcement || announcement.updatedAt === dismissedAt) return null;
  return <AnnouncementBanner {...announcement} onDismiss={() => setDismissedAt(announcement.updatedAt)} />;
}
