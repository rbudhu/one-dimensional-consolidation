import { READING_MINUTES } from "./physics.js";
export function finiteInput(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
}
function positiveRows(readings) {
  if (
    readings.some(
      (r) =>
        !Number.isFinite(r.minutes) ||
        r.minutes < 0 ||
        !Number.isFinite(r.dialDivisions),
    )
  )
    return [];
  const rows = readings.filter((r) => r.minutes > 0);
  return rows.every(
    (r, i) =>
      Number.isFinite(r.minutes) &&
      Number.isFinite(r.dialDivisions) &&
      (!i || r.minutes > rows[i - 1].minutes),
  )
    ? rows
    : [];
}
export function fitCompression(points) {
  if (
    points.length < 2 ||
    points.some((p) => !(p.pressureKPa > 0) || !Number.isFinite(p.voidRatio))
  )
    return null;
  const xs = points.map((p) => Math.log10(p.pressureKPa)),
    ys = points.map((p) => p.voidRatio),
    n = xs.length,
    mx = xs.reduce((a, b) => a + b) / n,
    my = ys.reduce((a, b) => a + b) / n,
    den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (!den) return null;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den;
  return { slope, intercept: my - slope * mx, index: -slope };
}
export function interpolateTime(readings, dial) {
  if (!Number.isFinite(dial)) return null;
  const rows = positiveRows(readings);
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1],
      b = rows[i],
      delta = b.dialDivisions - a.dialDivisions;
    if (delta === 0) continue;
    if ((dial - a.dialDivisions) * (dial - b.dialDivisions) <= 0) {
      const f = (dial - a.dialDivisions) / delta,
        t =
          10 ** (Math.log10(a.minutes) + f * Math.log10(b.minutes / a.minutes));
      return Number.isFinite(t) && t > 0 ? t : null;
    }
  }
  return null;
}
export function casagrandeIntersection(point, tangentSlope, virgin) {
  if (
    !point ||
    !(point.pressureKPa > 0) ||
    !Number.isFinite(point.voidRatio) ||
    !Number.isFinite(tangentSlope) ||
    !virgin
  )
    return null;
  const m = Math.tan(Math.atan(tangentSlope) / 2),
    b = point.voidRatio - m * Math.log10(point.pressureKPa);
  if (Math.abs(virgin.slope - m) < 1e-12) return null;
  const p = 10 ** ((b - virgin.intercept) / (virgin.slope - m));
  return Number.isFinite(p) && p > 0 ? p : null;
}
export function secondarySlope(a, b) {
  return a &&
    b &&
    a.minutes > 0 &&
    b.minutes > a.minutes &&
    Number.isFinite(a.voidRatio) &&
    Number.isFinite(b.voidRatio)
    ? (a.voidRatio - b.voidRatio) / Math.log10(b.minutes / a.minutes)
    : null;
}
export function endPrimaryVoidRatio(D100, initialHeightM, solidsHeightM) {
  return Number.isFinite(D100) &&
    Number.isFinite(initialHeightM) &&
    solidsHeightM > 0
    ? (initialHeightM - D100 * 0.00000254) / solidsHeightM - 1
    : null;
}
export const STAGE_DEFAULTS = Object.freeze({
  D0: null,
  D100: null,
  manualD0: false,
  manualD100: false,
  earlyTime: 0.25,
  primaryStart: 4,
  primaryEnd: 15,
  secondaryStart: 240,
  secondaryEnd: 1440,
  secondaryA: 12,
  secondaryB: 14,
});
const PRESSURE_DEFAULTS = {
  firstVirgin: 3,
  lastVirgin: 5,
  reloadBranch: "unloading",
  firstReload: 0,
  lastReload: 4,
  curvature: 1,
  tangent: null,
};
export function createAnalysisState() {
  const records = new Map();
  return {
    selectedStage: 0,
    pressure: { ...PRESSURE_DEFAULTS },
    stage(i) {
      if (!records.has(i)) records.set(i, { ...STAGE_DEFAULTS });
      return records.get(i);
    },
    reset() {
      records.clear();
      this.selectedStage = 0;
      this.pressure = { ...PRESSURE_DEFAULTS };
    },
  };
}
export function casagrandeTimeConstruction(readings, controls = {}) {
  const c = { ...STAGE_DEFAULTS, ...controls },
    rows = positiveRows(readings),
    issues = [];
  const dialAt = (t) => {
    if (!(t > 0) || !Number.isFinite(t)) return null;
    const exact = rows.find((r) => r.minutes === t);
    if (exact) return exact.dialDivisions;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1],
        b = rows[i];
      if (a.minutes < t && b.minutes > t)
        return (
          a.dialDivisions +
          ((b.dialDivisions - a.dialDivisions) * Math.log10(t / a.minutes)) /
            Math.log10(b.minutes / a.minutes)
        );
    }
    return null;
  };
  const d1 = dialAt(c.earlyTime),
    d4 = dialAt(c.earlyTime * 4),
    D0 = d1 === null || d4 === null ? null : 2 * d1 - d4;
  const line = (a, b, label) => {
    if (!(a > 0 && b > a)) {
      issues.push(`${label} times must be positive and strictly increasing.`);
      return null;
    }
    const ya = dialAt(a),
      yb = dialAt(b);
    if (ya === null || yb === null) {
      issues.push(`${label} needs both selected readings.`);
      return null;
    }
    const slope = (yb - ya) / Math.log10(b / a);
    return { slope, intercept: ya - slope * Math.log10(a) };
  };
  const primary = line(c.primaryStart, c.primaryEnd, "Primary tangent"),
    secondary = line(c.secondaryStart, c.secondaryEnd, "Secondary tangent");
  let D100 = null,
    intersectionMinutes = null;
  if (
    primary &&
    secondary &&
    Math.abs(primary.slope - secondary.slope) > 1e-12
  ) {
    const x =
        (secondary.intercept - primary.intercept) /
        (primary.slope - secondary.slope),
      t = 10 ** x,
      d = primary.intercept + primary.slope * x;
    if (Number.isFinite(t) && t > 0 && Number.isFinite(d)) {
      intersectionMinutes = t;
      D100 = d;
    }
  } else
    issues.push(
      "Tangent intersection unavailable (partial or parallel/flat readings).",
    );
  if (!(c.earlyTime > 0)) issues.push("Early time must be positive.");
  if (D0 === null) issues.push("Early construction needs t₁ and 4t₁ readings.");
  return { D0, D100, intersectionMinutes, primary, secondary, issues };
}
export function analyzeExperiment(state, selection, specimen, measurements) {
  const m = measurements(state),
    stages = state.stages.map((stage, i) => {
      const controls = { ...selection.stage(i) },
        rows = state.readings.filter((r) => r.stageIndex === i),
        automatic = casagrandeTimeConstruction(rows, controls),
        D0 = controls.manualD0 ? finiteInput(controls.D0) : automatic.D0,
        D100 = controls.manualD100
          ? finiteInput(controls.D100)
          : automatic.D100,
        D50 =
          Number.isFinite(D0) && Number.isFinite(D100) ? (D0 + D100) / 2 : null,
        t50 = interpolateTime(rows, D50),
        cv =
          t50 && stage.HdrM > 0
            ? ((0.197 * stage.HdrM ** 2) / (t50 * 60)) * 365.25 * 86400
            : null,
        secondaryPoints = [
          rows[controls.secondaryA] ?? null,
          rows[controls.secondaryB] ?? null,
        ],
        alpha = secondarySlope(...secondaryPoints),
        eEOP = endPrimaryVoidRatio(
          D100,
          m.initialHeightM ?? specimen.heightM,
          m.heightSolidsM,
        );
      return {
        stageIndex: i,
        pressureTsf: stage.pressureTsf,
        pressureKPa: stage.pressureKPa,
        controls,
        automatic,
        D0,
        D100,
        D50,
        t50,
        cv,
        alpha,
        secondaryPoints,
        eEOP,
        complete: rows.length === READING_MINUTES.length,
        issues: [
          ...automatic.issues,
          ...(alpha === null
            ? [
                "Secondary points need finite void ratios and positive increasing times.",
              ]
            : []),
        ],
      };
    });
  const ends = stages
    .filter((s) => s.complete)
    .map((s) => {
      const end = state.readings
        .filter((r) => r.stageIndex === s.stageIndex)
        .at(-1);
      return {
        ...end,
        index: s.stageIndex,
        loading: s.stageIndex < 6,
        finalVoidRatio: end.voidRatio,
        voidRatio: s.eEOP ?? end.voidRatio,
        primaryDial: s.D100,
        isPrimary: Number.isFinite(s.eEOP),
      };
    });
  const controls = { ...selection.pressure },
    load = ends.filter((p) => p.loading && p.isPrimary),
    recompression =
      controls.reloadBranch === "unloading"
        ? ends.filter((p) => !p.loading && p.isPrimary)
        : load;
  const range = (data, a, b) =>
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a >= 0 &&
    b > a &&
    b < data.length
      ? data.slice(a, b + 1)
      : [];
  const virginPoints = range(load, controls.firstVirgin, controls.lastVirgin),
    recompressionPoints = range(
      recompression,
      controls.firstReload,
      controls.lastReload,
    ),
    virgin = fitCompression(virginPoints),
    reload = fitCompression(recompressionPoints),
    cur = load[controls.curvature] ?? null,
    a = load[controls.curvature - 1],
    z = load[controls.curvature + 1],
    autoTangent =
      a && z
        ? (z.voidRatio - a.voidRatio) /
          Math.log10(z.pressureKPa / a.pressureKPa)
        : null,
    tangent =
      controls.tangent === null ? autoTangent : finiteInput(controls.tangent),
    bisector = Number.isFinite(tangent)
      ? Math.tan(Math.atan(tangent) / 2)
      : null,
    pc = casagrandeIntersection(cur, tangent, virgin);
  return {
    selectedStage: selection.selectedStage,
    stages,
    ends,
    pressure: {
      controls,
      load,
      recompression,
      virginPoints,
      recompressionPoints,
      virgin,
      reload,
      cur,
      tangent,
      tangentManual: controls.tangent !== null,
      bisector,
      pc,
      Cc: virgin?.index ?? null,
      Cr: reload?.index ?? null,
      PcKPa: pc,
    },
    units: {
      D0: "div",
      D100: "div",
      D50: "div",
      t50: "min",
      cv: "m²/year",
      alpha: "Δe/log10(t)",
      eEOP: "dimensionless",
      pressure: "kPa",
      geometry: "m",
      mass: "g",
      tangent: "e/log10(kPa)",
      Cc: "dimensionless",
      Cr: "dimensionless",
      PcKPa: "kPa",
      secondaryTime: "min",
    },
    assumptions: {
      initialEffectiveStressKPa: 10,
      Cc: 0.23,
      Cr: 0.06,
      PcKPa: 115,
      secondaryLoadingIndex: 0.003,
      secondaryUnloadingIndex: 0,
      secondaryActivation: "after t95 (U≈95%); Δe/log10(t)",
      acceleration:
        "wall time only; exact scheduled laboratory timestamps; paused at due observations",
      diameterM: specimen.diameterM,
      initialHeightM: specimen.heightM,
      Gs: specimen.Gs,
      e0: specimen.e0,
      saturation:
        "initially saturated modeled specimen; flooding is not empirical verification",
      massDisclaimer:
        "Coherent illustrative masses derived from geometry and conserved solids; not copied experimental measurements",
      readingScheduleMinutes: [...READING_MINUTES],
      ovenDryingMinutes: 960,
      ovenTemperatureC: 105,
      shortLowerProjectionM: 0.005,
      projectionDisclaimer:
        "Illustrative short lower projection, not a chapter measurement; original 76.2 mm segment retained until face cuts",
    },
  };
}
export function exportExperimentCSV(state, result, measurements) {
  const cell = (v) => {
    const t =
      v === null ||
      v === undefined ||
      (typeof v === "number" && !Number.isFinite(v))
        ? "unavailable"
        : String(v);
    return /[",\n]/.test(t) ? '"' + t.replaceAll('"', '""') + '"' : t;
  };
  const derived = measurements(state);
  const rows = [
    "# Illustrative UTA consolidation simulator; not empirical lab data",
    "# US tsf=95.7605 kPa; dial=0.0001 inch/div; signed unloading is legitimate",
    "stage,pressure_tsf,pressure_kPa,elapsed_min,dial_div,settlement_mm,height_mm,void_ratio,recorded_by",
    ...state.readings.map((r) =>
      [
        r.stageIndex + 1,
        r.pressureTsf,
        r.pressureKPa,
        r.minutes,
        r.dialDivisions,
        r.settlementMm,
        r.heightM * 1000,
        r.voidRatio,
        r.recordedBy ?? "learner",
      ]
        .map(cell)
        .join(","),
    ),
    "",
    "measurement,value,unit",
    ...Object.entries(state.measurements).map(([k, v]) =>
      [
        k,
        v,
        k.endsWith("G")
          ? "g"
          : k.endsWith("M")
            ? "m"
            : k.endsWith("Minutes")
              ? "min"
              : "dimensionless",
      ]
        .map(cell)
        .join(","),
    ),
    "",
    "derived_property,value,unit",
    ...Object.entries({
      w0: "dimensionless", wf: "dimensionless", Gs: "dimensionless",
      dryMassG: "g", initialWetMassG: "g", finalWetMassG: "g",
      areaM2: "m²", heightSolidsM: "m", e0: "dimensionless", ef: "dimensionless",
    }).flatMap(([k, unit]) => {
      const value = derived[k];
      return typeof value === "number" && Number.isFinite(value)
        ? [[k, value, unit].map(cell).join(",")] : [];
    }),
    "",
    "analysis_property,value",
  ];
  const flatten = (value, path) => {
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (!entries.length) rows.push(`${path},unavailable`);
      else for (const [k, v] of entries) flatten(v, path ? `${path}.${k}` : k);
    } else rows.push([path, value].map(cell).join(","));
  };
  flatten(result, "");
  return rows.join("\n");
}
