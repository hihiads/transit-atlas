// Public bike share stations in Croatia (nextbike network, branded Bajs in Zagreb).
// Source: nextbike GBFS v2 per network domain, see https://github.com/nextbike/gbfs
// Domains are the Croatian networks listed in https://maps.nextbike.net/maps/nextbike-live.json
// (country HR). Station info changes rarely; availability is refreshed on every request after the cache ages.

export const bikeDomains = [
  'hd', 'hr', 'gt', 'gd', 'gk', 'zd', 'sb', 'em', 'cv', 'kc', 'bc',
  'br', 'cg', 'cj', 'cm', 'cs', 'ig', 'ma', 'se', 'sg', 'vu'
];

const gbfsBase = 'https://gbfs.nextbike.net/maps/gbfs/v2';
const infoTtlMs = 60 * 60 * 1000;
const statusTtlMs = 60 * 1000;
const fetchTimeoutMs = 10_000;

const infoCache = new Map(); // domain -> { at, value }
const statusCache = new Map(); // domain -> { at, value }

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(fetchTimeoutMs) });
  if (!response.ok) throw new Error(`GBFS ${response.status}`);
  return response.json();
}

// Finds the Croatian language feeds of one network from its gbfs.json discovery file.
async function feedUrls(domain) {
  const discovery = await getJson(`${gbfsBase}/nextbike_${domain}/gbfs.json`);
  const language = discovery.data?.hr ? 'hr' : Object.keys(discovery.data ?? {})[0];
  const feeds = discovery.data?.[language]?.feeds ?? [];
  const url = name => feeds.find(feed => feed.name === name)?.url;
  return { information: url('station_information'), status: url('station_status'), system: url('system_information') };
}

async function cached(map, key, ttl, load) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  map.set(key, { at: Date.now(), value });
  return value;
}

async function domainStations(domain) {
  const urls = await cached(infoCache, `urls:${domain}`, infoTtlMs, () => feedUrls(domain));
  const information = await cached(infoCache, `info:${domain}`, infoTtlMs, () => getJson(urls.information));
  const status = urls.status ? await cached(statusCache, domain, statusTtlMs, () => getJson(urls.status)) : null;
  const availability = new Map((status?.data?.stations ?? []).map(station => [String(station.station_id), station]));
  const system = urls.system ? await cached(infoCache, `system:${domain}`, infoTtlMs, () => getJson(urls.system)) : null;
  const city = (system?.data?.name ?? domain).replace(/\s*\(Croatia\)$/, '');
  return normaliseStations(domain, city, information.data?.stations ?? [], availability);
}

const listCache = { at: 0, value: null };

// All Croatian stations, cached for one minute. A network that fails is left out, the others still show.
export async function listCroatianBikeStations() {
  if (listCache.value && Date.now() - listCache.at < statusTtlMs) return listCache.value;
  const results = await Promise.allSettled(bikeDomains.map(domainStations));
  const stations = results.flatMap(result => (result.status === 'fulfilled' ? result.value : []));
  listCache.value = { stations, updatedAt: Date.now(), attribution: 'Podaci: nextbike / Bajs (GBFS)' };
  listCache.at = Date.now();
  return listCache.value;
}

// Pure helper for tests: keeps only stations with usable coordinates and normalises the numbers.
export function normaliseStations(domain, city, rawStations, availability = new Map()) {
  return rawStations.map(station => {
    const live = availability.get(String(station.station_id));
    return {
      id: `${domain}:${station.station_id}`,
      name: station.name,
      lat: Number(station.lat),
      lon: Number(station.lon),
      capacity: station.capacity ?? null,
      bikesAvailable: live?.num_bikes_available ?? null,
      docksAvailable: live?.num_docks_available ?? null,
      city,
      operator: 'nextbike'
    };
  }).filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lon));
}
