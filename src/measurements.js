// Only successful weighing actions may update the balance; units are explicit.
export const BALANCE_FIELDS = Object.freeze({
  "weigh-tare": "ringGlassTareG",
  "aliquot-tare": "aliquotTareG",
  "aliquot-wet": "aliquotWetCanG",
  "aliquot-dry": "aliquotDryCanG",
  "measure-gs": "pycnometerSoilWaterG",
  "weigh-wet": "initialWetAssemblyG",
  "weigh-final-wet": "finalWetAssemblyG",
  "weigh-can": "finalCanTareG",
  "weigh-dry": "finalDryCanG",
});
export function balanceMeasurement(state) {
  for (const h of [...(state.history || [])].reverse()) {
    const field = BALANCE_FIELDS[h.actionId],
      value = h.measurements?.[field];
    if (field && Number.isFinite(value))
      return { field, value, unit: "g", actionId: h.actionId };
  }
  return null;
}
export function appliedLoad(state) {
  const done = new Set((state.history || []).map((h) => h.actionId));
  const released = done.has("release-load"),
    engaged = done.has("adjust-contact") && !released;
  return {
    released,
    engaged,
    pressureTsf: engaged ? (state.model?.pressureTsf ?? 0) : 0,
    pressureKPa: engaged ? (state.model?.pressureKPa ?? 0) : 0,
  };
}
