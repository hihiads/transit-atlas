import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { API_ROOT } from '../services/platform';
import { language, t } from '../services/i18n';

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

interface VehicleNotice {
  id: string;
  type: 'bus' | 'tram';
  line: string;
  reason: 'breakdown' | 'delay';
  count: number;
  expiresAt: string;
}

export interface Bulletin {
  _id: string;
  text: string;
  textEn: string;
  level: Announcement['level'];
  kind: 'announcement' | 'detour' | 'stop' | 'replacement';
  audience: 'all' | 'zet' | 'hzpp';
  line: string | null;
  startsAt: string;
  expiresAt: string;
}

export const bulletinKinds = { announcement: 'Najava', detour: 'Obilazak', stop: 'Preskočeno stajalište', replacement: 'Zamjenski autobus' };

export default function SiteAnnouncement({ audience = 'zet', line = '' }: { audience?: 'zet' | 'hzpp'; line?: string }) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [vehicleNotices, setVehicleNotices] = useState<VehicleNotice[]>([]);
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [dismissedAt, setDismissedAt] = useState('');

  useEffect(() => {
    let pending: AbortController | undefined;
    async function refresh() {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      setAnnouncement(current => current?.expiresAt && Date.parse(current.expiresAt) <= Date.now() ? null : current);
      setVehicleNotices(current => current.filter(notice => Date.parse(notice.expiresAt) > Date.now()));
      setBulletins(current => current.filter(notice => Date.parse(notice.expiresAt) > Date.now()));
      try {
        const response = await fetch(API_ROOT + '/announcement?audience=' + audience, { signal: controller.signal });
        if (!response.ok) return;
        const { announcement, vehicleNotices, bulletins } = await response.json();
        if (!controller.signal.aborted) {
          setAnnouncement(announcement);
          setVehicleNotices(vehicleNotices ?? []);
          setBulletins(bulletins ?? []);
        }
      } catch {
        // Keep the last active announcement if the connection temporarily drops.
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { pending?.abort(); window.clearInterval(timer); };
  }, [audience]);

  const relevant = bulletins.filter(entry => !line || !entry.line || line === entry.line);
  return <>
    {relevant.length > 0 && <section aria-label={t("Obavijesti o prometu")} className="max-h-[22dvh] shrink-0 overflow-y-auto">
      {relevant.map(entry => <AnnouncementBanner key={entry._id} level={entry.level}
        text={(entry.line ? `${t("Linija")} ${entry.line} · ${t(bulletinKinds[entry.kind])} · ` : '') + (language === 'en' && entry.textEn ? entry.textEn : entry.text)} />)}
    </section>}
    {announcement && announcement.updatedAt !== dismissedAt && <AnnouncementBanner {...announcement} onDismiss={() => setDismissedAt(announcement.updatedAt)} />}
    {vehicleNotices.length > 0 && <section aria-label={t("Dojave putnika")} className="max-h-[22dvh] shrink-0 overflow-y-auto border-b border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-950">
      <h2 className="text-xs font-bold">{t("Dojave putnika")}</h2>
      <ul className="divide-y divide-amber-200">
        {vehicleNotices.map(({ id, line, type, count, reason }) => <li key={id} className="py-1">
          {reason === 'breakdown'
            ? t("{0} korisnika prijavilo je kvar na liniji {1} · {2}.", count, line, type === 'bus' ? t("Autobus") : t("Tramvaj"))
            : t("{0} korisnika prijavilo je kašnjenje na liniji {1} · {2}.", count, line, type === 'bus' ? t("Autobus") : t("Tramvaj"))}
        </li>)}
      </ul>
    </section>}
  </>;
}
