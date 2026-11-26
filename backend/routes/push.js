import express from 'express';
import { requireTrustedOrigin } from '../config/origins.js';
import { pushConfigured } from '../services/apns.js';
import { addWatch, registerDevice, removeWatch, watchLifetimeMs } from '../services/pushWatches.js';

const tokenPattern = /^[0-9a-f]{64,200}$/i;
const idPattern = /^[A-Za-z0-9_.:-]{1,80}$/;

// resolveStop(cityId, tripId, stopId) -> { stopSequence, stopName, line, label } or null
export function createPushRouter({ resolveStop }) {
  const router = express.Router();
  router.use(requireTrustedOrigin);

  router.post('/devices', express.json({ limit: '2kb' }), async (req, res) => {
    if (!pushConfigured) return res.status(503).json({ error: 'Obavijesti na iPhoneu nisu uključene na serveru.' });
    const token = String(req.body?.token ?? '').trim();
    if (!tokenPattern.test(token)) return res.status(400).json({ error: 'Neispravan token uređaja.' });
    await registerDevice(token.toLowerCase(), 'ios');
    res.status(201).json({ message: 'Uređaj je prijavljen.' });
  });

  // Body: { token, cityId, tripId, stopId, departureAt }. Adds a watch for one tracked departure.
  router.post('/watches', express.json({ limit: '2kb' }), async (req, res) => {
    if (!pushConfigured) return res.status(503).json({ error: 'Obavijesti na iPhoneu nisu uključene na serveru.' });
    const token = String(req.body?.token ?? '').trim().toLowerCase();
    const { cityId, tripId, stopId } = req.body ?? {};
    const departureAt = Number(req.body?.departureAt);
    if (!tokenPattern.test(token) || cityId !== 'zagreb' || !idPattern.test(String(tripId)) || !idPattern.test(String(stopId)) ||
        !Number.isFinite(departureAt) || departureAt < Date.now() - 10 * 60_000 || departureAt > Date.now() + 24 * 3600_000) {
      return res.status(400).json({ error: 'Neispravan zahtjev za praćenje polaska.' });
    }
    const stop = resolveStop(cityId, String(tripId), String(stopId));
    if (!stop) return res.status(404).json({ error: 'Polazak nije pronađen u voznom redu.' });
    const key = `${token}:${tripId}:${stopId}:${departureAt}`;
    await addWatch({
      key, token, tripId: String(tripId), stopId: String(stopId), departureAt,
      stopSequence: stop.stopSequence, stopName: stop.stopName, line: stop.line,
      expiresAt: new Date(departureAt + watchLifetimeMs), delayNotifiedAt: null, earlyNotifiedAt: null, arrivalNotifiedAt: null,
      createdAt: new Date()
    });
    res.status(201).json({ message: 'Praćenje polaska je uključeno.' });
  });

  router.delete('/watches', express.json({ limit: '2kb' }), async (req, res) => {
    const token = String(req.body?.token ?? '').trim().toLowerCase();
    const { tripId, stopId } = req.body ?? {};
    const departureAt = Number(req.body?.departureAt);
    if (!tokenPattern.test(token) || !idPattern.test(String(tripId)) || !idPattern.test(String(stopId)) || !Number.isFinite(departureAt)) {
      return res.status(400).json({ error: 'Neispravan zahtjev.' });
    }
    await removeWatch(token, `${token}:${tripId}:${stopId}:${departureAt}`);
    res.json({ message: 'Praćenje polaska je isključeno.' });
  });

  return router;
}
