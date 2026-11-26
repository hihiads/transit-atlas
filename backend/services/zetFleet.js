export function zetVehicleId(entityId, descriptor) {
  return /^[A-Z0-9]+_(\d{1,8})$/.exec(entityId)?.[1] ||
    (/^\d{1,8}$/.test(descriptor?.id ?? '') ? descriptor.id : null) ||
    (/^\d{1,8}$/.test(descriptor?.label ?? '') ? descriptor.label : null);
}
