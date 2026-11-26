import User from '../models/User.js';
import { sendRareVehicleEmail, hasRareVehicleMail } from './email.js';

const dayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' });
export const maxRareFollows = 10;
const maxAge = 5 * 60_000;

export function alertsFromLiveVehicles(vehicles, now = Date.now()) {
  const active = new Map();
  const day = dayKey.format(now);
  for (const vehicle of vehicles) {
    if (!vehicle.rare || !vehicle.zetId || !Number.isFinite(vehicle.lastUpdate) ||
        vehicle.lastUpdate > now || now - vehicle.lastUpdate > maxAge ||
        dayKey.format(vehicle.lastUpdate) !== day) continue;
    if ((active.get(vehicle.zetId)?.lastUpdate ?? -Infinity) < vehicle.lastUpdate) active.set(vehicle.zetId, vehicle);
  }
  return { day, active };
}

export async function alertRareVehicleFollowers(vehicles) {
  if (!hasRareVehicleMail()) return;
  const { day, active } = alertsFromLiveVehicles(vehicles);
  let left = 20;
  for (const [id, vehicle] of active) {
    while (left > 0) {
      // Claim the day's delivery before handing it to SMTP to avoid duplicate email on retries.
      const user = await User.findOneAndUpdate({
        emailVerified: true, 'rareVehicleFollows.vehicleId': id,
        $or: [{ 'rareAlertDay.date': { $ne: day } }, { 'rareAlertDay.vehicles': { $ne: id } }]
      }, [{ $set: { rareAlertDay: {
        date: day,
        vehicles: { $setUnion: [{ $cond: [
          { $eq: ['$rareAlertDay.date', day] }, { $ifNull: ['$rareAlertDay.vehicles', []] }, []
        ] }, [id]] }
      } } }], { returnDocument: 'after', updatePipeline: true }).select('email +rareVehicleFollows').lean();
      if (!user) break;
      const follow = user.rareVehicleFollows.find(item => item.vehicleId === id);
      await sendRareVehicleEmail(user.email, vehicle, follow.language);
      left--;
    }
    if (left === 0) return;
  }
}
