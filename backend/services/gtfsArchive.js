import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import fetch from 'node-fetch';

const MiB = 1024 * 1024;
const redirects = new Set([301, 302, 303, 307, 308]);

export async function fetchFeed(url, { allowedOrigin, maxBytes, headers, timeout = 30_000 }) {
  const signal = AbortSignal.timeout(timeout);
  let destination = new URL(url);
  for (let hop = 0; hop <= 3; hop++) {
    if (destination.protocol !== 'https:' || destination.origin !== allowedOrigin ||
        destination.username || destination.password) {
      throw new Error('GTFS destination is outside the configured HTTPS origin');
    }

    const response = await fetch(destination, { redirect: 'manual', signal, size: maxBytes, headers });
    if (!redirects.has(response.status)) return response;
    const location = response.headers.get('location');
    response.body?.destroy();
    if (!location) throw new Error('GTFS redirect has no destination');
    destination = new URL(location, destination);
  }
  throw new Error('Too many GTFS redirects');
}

export async function extractFeed(response, directory, allowedFiles) {
  const archive = new AdmZip(Buffer.from(await response.arrayBuffer()));
  const files = new Map();
  let totalSize = 0;
  for (const entry of archive.getEntries()) {
    if (entry.isDirectory || !allowedFiles.includes(entry.entryName)) continue;
    const size = entry.header.size;
    if (!Number.isSafeInteger(size) || size < 0 || size > 256 * MiB ||
        totalSize + size > 384 * MiB || files.has(entry.entryName)) {
      throw new Error('Invalid GTFS archive size or duplicate file');
    }
    files.set(entry.entryName, entry);
    totalSize += size;
  }
  for (const [name, entry] of files) {
    const contents = entry.getData();
    if (contents.length !== entry.header.size) throw new Error('GTFS archive entry size mismatch');
    await writeFile(join(directory, name), contents, { flag: 'wx' });
  }
}
