// Vehicle position helpers shared by the vehicle profile and departure estimates.

export function estimateNextStop(stops, vehicle) {
  const metersPerLongitude = 111_320 * Math.cos(vehicle.lat * Math.PI / 180);
  const points = stops.map(stop => ({
    x: (stop.lon - vehicle.lon) * metersPerLongitude,
    y: (stop.lat - vehicle.lat) * 111_320
  }));
  const candidates = [];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length === 0) continue;
    const fraction = Math.max(0, Math.min(1, -(start.x * dx + start.y * dy) / (length * length)));
    const distance = Math.hypot(start.x + fraction * dx, start.y + fraction * dy);
    const nextIndex = Math.hypot(start.x, start.y) <= 35 ? index - 1 : index;
    candidates.push({ distance, nextIndex });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const closest = candidates[0];
  if (!closest || closest.distance > 180) return null;
  const plausible = candidates.filter(item => item.distance <= closest.distance + 25);
  const earliest = Math.min(...plausible.map(item => item.nextIndex));
  const latest = Math.max(...plausible.map(item => item.nextIndex));
  return latest - earliest > 1 ? null : stops[earliest].sequence;
}

// True when the vehicle is already past the stop with this sequence on its trip.
// Unknown position counts as passed: a departure estimate needs proof the vehicle is still coming.
// Pass getTripStops as a function so the trip geometry is only built when it is needed.
export function vehicleHasPassedStop(vehicle, stopSequence, getTripStops) {
  const reported = Number(vehicle.currentStopSequence);
  if (reported > 0) return reported > stopSequence;
  const nextSequence = estimateNextStop(getTripStops(), vehicle);
  if (nextSequence === null) return true;
  return nextSequence > stopSequence;
}
