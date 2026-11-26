import mongoose from 'mongoose';
import express from 'express';
import { body, validationResult } from 'express-validator';
import { asyncRoute } from '../middleware/security.js';
import User from '../models/User.js';
import { addBulletin, auditDashboard, cleanText, dashboardCollection, feedbackCollection, listBulletins, listRareVehicles,
  parseBulletin, readDashboardSettings, saveDashboardSettings } from '../services/dashboard.js';
import { moderateVehicleNotice, readVehicleNotices } from '../services/vehicleReports.js';

const router = express.Router();
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const zetId = /^\d{1,8}$/;
const settingsKeys = ['hideLiveVehicles', 'pauseReports', 'statusMessage'];

router.get('/controls', asyncRoute(async (req, res) => {
  const values = await readDashboardSettings();
  res.json(Object.fromEntries(settingsKeys.map(key => [key, values[key]])));
}));
router.put('/controls', asyncRoute(async (req, res) => {
  const { hideLiveVehicles, pauseReports } = req.body ?? {};
  const statusMessage = cleanText(req.body?.statusMessage, 220);
  if (typeof hideLiveVehicles !== 'boolean' || typeof pauseReports !== 'boolean' || statusMessage === null) return res.sendStatus(400);
  const next = { hideLiveVehicles, pauseReports, statusMessage };
  await saveDashboardSettings(next);
  await auditDashboard('controls.save', [hideLiveVehicles ? 'maintenance.on' : 'maintenance.off', pauseReports ? 'reports.paused' : 'reports.active'].join(' · '));
  res.json(next);
}));

router.get('/bulletins', asyncRoute(async (req, res) => res.json(await listBulletins())));
router.post('/bulletins', asyncRoute(async (req, res) => {
  const entry = parseBulletin(req.body);
  if (!entry) return res.status(400).json({ error: 'Provjerite poruku, liniju i vrijeme objave i isteka.' });
  await addBulletin(entry);
  await auditDashboard('bulletin.publish', entry.line || entry.audience);
  res.sendStatus(201);
}));
router.delete('/bulletins/:id', asyncRoute(async (req, res) => {
  if (!uuid.test(req.params.id)) return res.sendStatus(400);
  const result = await (await dashboardCollection('dashboard_bulletins')).deleteOne({ _id: req.params.id });
  if (!result.deletedCount) return res.sendStatus(404);
  await auditDashboard('bulletin.withdraw', req.params.id);
  res.sendStatus(204);
}));

router.get('/rare-vehicles', asyncRoute(async (req, res) => res.json(await listRareVehicles())));
router.put('/rare-vehicles/:id', asyncRoute(async (req, res) => {
  const { type, rare: isRare } = req.body ?? {};
  const model = cleanText(req.body?.model, 80);
  const garageNumber = cleanText(req.body?.garageNumber ?? '', 16);
  const source = cleanText(req.body?.source, 400);
  let url;
  try { url = new URL(source); } catch { return res.status(400).json({ error: 'Unesite HTTPS poveznicu na izvor.' }); }
  if (!zetId.test(req.params.id) || typeof isRare !== 'boolean' || !['bus', 'tram'].includes(type) || !model || garageNumber === null ||
      (garageNumber && !/^[a-z0-9-]+$/i.test(garageNumber)) || url.protocol !== 'https:' || url.username || url.password) return res.sendStatus(400);
  const rare = await dashboardCollection('dashboard_rare_vehicles');
  await rare.updateOne({ _id: req.params.id }, [{ $set: {
    previous: { $cond: [{ $eq: [{ $type: '$model' }, 'missing'] }, '$$REMOVE',
      { type: '$type', model: '$model', garageNumber: '$garageNumber', source: '$source', rare: '$rare' }] },
    type: { $literal: type }, model: { $literal: model }, garageNumber: { $literal: garageNumber },
    source: { $literal: url.href }, rare: isRare
  } }], { upsert: true });
  await auditDashboard('rare.save', req.params.id);
  res.sendStatus(204);
}));
router.post('/rare-vehicles/:id/restore', asyncRoute(async (req, res) => {
  if (!zetId.test(req.params.id)) return res.sendStatus(400);
  const fields = ['type', 'model', 'garageNumber', 'source', 'rare'];
  const result = await (await dashboardCollection('dashboard_rare_vehicles')).updateOne(
    { _id: req.params.id, previous: { $exists: true } },
    [{ $set: Object.fromEntries(fields.map(field => [field, '$previous.' + field])) }, { $unset: 'previous' }]
  );
  if (!result.matchedCount) return res.sendStatus(404);
  await auditDashboard('rare.restore', req.params.id);
  res.sendStatus(204);
}));

router.delete('/rare-vehicles/:id', asyncRoute(async (req, res) => {
  if (!zetId.test(req.params.id)) return res.sendStatus(400);
  await (await dashboardCollection('dashboard_rare_vehicles')).deleteOne({ _id: req.params.id });
  await auditDashboard('rare.delete', req.params.id);
  res.sendStatus(204);
}));

router.get('/reports', asyncRoute(async (req, res) => res.json(await readVehicleNotices(true))));
router.patch('/reports', asyncRoute(async (req, res) => {
  const { id, state } = req.body ?? {};
  if (typeof id !== 'string' || !/^[a-f0-9]{64}\/(?:breakdown|delay)$/.test(id) || !['hidden', 'resolved', 'visible'].includes(state)) return res.sendStatus(400);
  if (!(await readVehicleNotices(true)).some(report => report.id === id)) return res.sendStatus(404);
  await moderateVehicleNotice(id, state);
  await auditDashboard(`report.${state}`, id.slice(0, 12));
  res.sendStatus(204);
}));
router.put('/report-restriction',
  body('email').isString().bail().isLength({ max: 254 }).isEmail().bail().normalizeEmail(),
  body('days').isInt({ min: 0, max: 30 }),
  asyncRoute(async (req, res) => {
    if (!validationResult(req).isEmpty() || !Number.isInteger(req.body.days)) return res.sendStatus(400);
    const until = req.body.days ? new Date(Date.now() + req.body.days * 86400_000) : null;
    const updated = await User.updateOne({ email: req.body.email }, until ? { $set: { vehicleReportsBlockedUntil: until } } :
      { $unset: { vehicleReportsBlockedUntil: '' } });
    if (!updated.matchedCount) return res.status(404).json({ error: 'Račun nije pronađen.' });
    await auditDashboard(until ? 'restriction.set' : 'restriction.clear');
    res.json({ until });
  }));

router.get('/feedback', asyncRoute(async (req, res) => {
  res.json(await (await feedbackCollection()).find({ expiresAt: { $gt: new Date() } })
    .sort({ state: 1, createdAt: -1 }).limit(80).toArray());
}));
router.patch('/feedback/:id', asyncRoute(async (req, res) => {
  const { state } = req.body ?? {};
  if (!/^[a-f0-9]{24}$/.test(req.params.id) || !['open', 'resolved'].includes(state)) return res.sendStatus(400);
  const updated = await (await feedbackCollection()).updateOne({ _id: new mongoose.Types.ObjectId(req.params.id), expiresAt: { $gt: new Date() } }, { $set: { state } });
  if (!updated.matchedCount) return res.sendStatus(404);
  await auditDashboard(`feedback.${state}`);
  res.sendStatus(204);
}));

router.get('/audit', asyncRoute(async (req, res) => {
  res.json(await (await dashboardCollection('dashboard_audit')).find({}).sort({ _id: -1 }).limit(100).toArray());
}));
export default router;
