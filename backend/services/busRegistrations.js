import { fetchFeed } from './gtfsArchive.js';

const source = new URL('https://autobusi.org/forum/index.php?topic=3819.0');
const depotPosts = ['29388', '29389', '226485'];
const postsPattern = /<div\b[^>]*\bclass="inner"[^>]*\bdata-msgid="(\d+)"[^>]*>/gi;
const rowPattern = /^(\d{1,8})\s*[-–—]{2,3}\s*([A-ZČĆĐŠŽ]{2}-\d{3,4}-[A-ZČĆĐŠŽ]{1,2})(?=\s|$)/u;

export function parseBusRegistrations(html) {
  const posts = [...html.matchAll(postsPattern)];
  const registrations = new Map();
  const plateOwners = new Map();
  const ambiguous = new Set();

  for (const id of depotPosts) {
    const index = posts.findIndex(post => post[1] === id);
    if (index === -1) return null;
    const post = posts[index];
    const lines = html.slice(post.index + post[0].length, posts[index + 1]?.index ?? html.length)
      .replace(/<br\s*\/?>|<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
      .split(/\r?\n/).map(line => line.trim());

    const heading = lines.findIndex(line => /^garažni broj\s*[-–—]+\s*(tablica|registracija)\b/i.test(line));
    if (heading === -1) return null;
    let found = false;
    for (const line of lines.slice(heading + 1)) {
      if (/^(?:prijevoz osoba|reklame\b|\*\s*označeni|-{10,})/i.test(line)) break;
      // A leading asterisk identifies an unregistered vehicle in the forum.
      const row = rowPattern.exec(line);
      if (!row) continue;
      const [, garage, plate] = row;
      found = true;
      if (registrations.has(garage) && registrations.get(garage) !== plate) ambiguous.add(garage);
      if (plateOwners.has(plate) && plateOwners.get(plate) !== garage) {
        ambiguous.add(garage);
        ambiguous.add(plateOwners.get(plate));
      }
      registrations.set(garage, plate);
      plateOwners.set(plate, garage);
    }
    if (!found) return null;
  }

  for (const garage of ambiguous) registrations.delete(garage);
  return registrations;
}

const hour = 3600_000;
let registrations = new Map();
let freshAt = 0;
let retryAt = 0;
let pending;

export async function getBusRegistration(garage) {
  if (Date.now() >= retryAt && !pending) {
    pending = (async () => {
      try {
        const response = await fetchFeed(source, {
          allowedOrigin: source.origin, maxBytes: 512 * 1024, timeout: 3500,
          headers: { 'User-Agent': 'Transitly/1.0 (+https://transitly.eu)', Accept: 'text/html' }
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Invalid forum response');
        const next = parseBusRegistrations(await response.text());
        if (!next?.size) throw new Error('Invalid forum fleet list');
        registrations = next;
        freshAt = Date.now();
        retryAt = freshAt + 6 * hour;
      } catch {
        retryAt = Date.now() + hour / 2;
      } finally {
        pending = undefined;
      }
    })();
  }
  if (Date.now() - freshAt >= 48 * hour) await pending;
  if (Date.now() - freshAt >= 48 * hour) return null;
  return registrations.get(garage) ?? null;
}
