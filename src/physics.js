const diameterM = 0.0635;
const heightM = 0.0254;
const areaM2 = (Math.PI * diameterM ** 2) / 4;
const Gs = 2.72;
const e0 = 0.816;
const dryMassG = ((areaM2 * heightM) / (1 + e0)) * Gs * 1e6;
export const SPECIMEN = Object.freeze({
  diameterM,
  heightM,
  areaM2,
  Gs,
  e0,
  dryMassG,
  initialWetMassG: dryMassG * (1 + e0 / Gs),
  ringMassG: 156.8,
  glassMassG: 84.2,
  canMassG: 32.6,
  aliquotCanMassG: 12.5,
  aliquotDryMassG: 10,
  initialEffectiveKPa: 10,
  Cc: 0.23,
  Cr: 0.06,
  PcKPa: 115,
});
export const PRESSURES_TSF = Object.freeze([
  0.5, 1, 2, 4, 8, 16, 8, 4, 2, 1, 0.5,
]);
export const READING_MINUTES = Object.freeze([
  0, 0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 240, 480, 1440,
]);
export const tsfToKPa = (tsf) => tsf * 95.76051798033584;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function degreeOfConsolidation(Tv) {
  if (Tv <= 0) return 0;
  // Early-time asymptote avoids cancellation and slow Fourier convergence.
  if (Tv < 0.001) return 2 * Math.sqrt(Tv / Math.PI);
  let remaining = 0;
  for (let m = 0; m < 200; m++) {
    const odd = 2 * m + 1;
    const term =
      (8 / (Math.PI ** 2 * odd ** 2)) *
      Math.exp((-(odd ** 2) * Math.PI ** 2 * Tv) / 4);
    remaining += term;
    if (term < 1e-15) break;
  }
  return clamp(1 - remaining, 0, 1);
}
export function excessPorePressure(zFraction, Tv, deltaKPa) {
  if (zFraction <= 0 || zFraction >= 1) return 0;
  if (Tv <= 0) return deltaKPa;
  let fraction = 0;
  // Depth coordinate spans full height; Tv uses half height (double drainage).
  const terms = Math.min(20000, Math.ceil(8 / Math.sqrt(Tv)));
  for (let m = 0; m < terms; m++) {
    const odd = 2 * m + 1;
    fraction +=
      (4 / (Math.PI * odd)) *
      Math.sin(odd * Math.PI * zFraction) *
      Math.exp((-(odd ** 2) * Math.PI ** 2 * Tv) / 4);
  }
  return deltaKPa * clamp(fraction, 0, 1);
}
export const SECONDS_PER_YEAR = 365.25 * 86400;
export function createStage(index, previousState) {
  if (!Number.isInteger(index) || index < 0 || index >= PRESSURES_TSF.length)
    throw new RangeError("Stage index must be 0–10");
  if (index > 0 && !previousState)
    throw new TypeError("Previous evaluated end state required");
  const pressureTsf = PRESSURES_TSF[index],
    pressureKPa = tsfToKPa(pressureTsf);
  const startE = previousState?.voidRatio ?? e0;
  const startHeightM = previousState?.heightM ?? heightM;
  const previousPressureKPa =
    previousState?.pressureKPa ?? SPECIMEN.initialEffectiveKPa;
  const historicalKPa = previousState?.maxPastPressureKPa ?? SPECIMEN.PcKPa;
  let targetE = startE;
  if (pressureKPa <= previousPressureKPa || pressureKPa <= historicalKPa) {
    targetE -= SPECIMEN.Cr * Math.log10(pressureKPa / previousPressureKPa);
  } else {
    const turningKPa = Math.max(previousPressureKPa, historicalKPa);
    targetE -=
      SPECIMEN.Cr * Math.log10(turningKPa / previousPressureKPa) +
      SPECIMEN.Cc * Math.log10(pressureKPa / turningKPa);
  }
  const cvM2Year = 7.25 - (3.05 * Math.log2(pressureTsf / 0.5)) / 5;
  const HdrM = startHeightM / 2;
  const t95Minutes = (1.129 * HdrM ** 2) / (cvM2Year / SECONDS_PER_YEAR) / 60;
  return {
    index,
    pressureTsf,
    pressureKPa,
    startHeightM,
    targetHeightM: (heightM / (1 + e0)) * (1 + targetE),
    startE,
    targetE,
    previousPressureKPa,
    deltaKPa: pressureKPa - previousPressureKPa,
    maxPastPressureKPa: Math.max(historicalKPa, pressureKPa),
    cvM2Year,
    HdrM,
    t95Minutes,
    secondaryIndex: pressureKPa > previousPressureKPa ? 0.003 : 0,
  };
}
export function evaluateStage(stage, minutes) {
  if (!Number.isFinite(minutes) || minutes < 0)
    throw new RangeError("Elapsed minutes must be finite and nonnegative");
  const Tv =
    ((stage.cvM2Year / SECONDS_PER_YEAR) * minutes * 60) / stage.HdrM ** 2;
  const primaryFraction = degreeOfConsolidation(Tv);
  const secondaryDeltaE =
    stage.secondaryIndex * Math.log10(Math.max(1, minutes / stage.t95Minutes));
  const voidRatio =
    stage.startE +
    (stage.targetE - stage.startE) * primaryFraction -
    secondaryDeltaE;
  const heightSolidsM = heightM / (1 + e0);
  const currentHeightM = heightSolidsM * (1 + voidRatio);
  const settlementMm = (heightM - currentHeightM) * 1000;
  const excessAverageKPa = stage.deltaKPa * (1 - primaryFraction);
  return {
    stageIndex: stage.index,
    pressureTsf: stage.pressureTsf,
    pressureKPa: stage.pressureKPa,
    minutes,
    Tv,
    heightM: currentHeightM,
    voidRatio,
    settlementMm,
    dialDivisions: settlementMm / 0.00254,
    primaryFraction,
    excessAverageKPa,
    effectiveAverageKPa: stage.pressureKPa - excessAverageKPa,
    wetMassG: dryMassG * (1 + voidRatio / Gs),
    dryMassG,
    secondarySettlementMm: secondaryDeltaE * heightSolidsM * 1000,
    maxPastPressureKPa: stage.maxPastPressureKPa,
  };
}
export function fitLine(points) {
  if (
    points.length < 2 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return null;
  const xMean = points.reduce((s, p) => s + p.x, 0) / points.length;
  const yMean = points.reduce((s, p) => s + p.y, 0) / points.length;
  const xx = points.reduce((s, p) => s + (p.x - xMean) ** 2, 0);
  if (!xx) return null;
  const slope =
    points.reduce((s, p) => s + (p.x - xMean) * (p.y - yMean), 0) / xx;
  const intercept = yMean - slope * xMean;
  const residual = points.reduce(
    (s, p) => s + (p.y - slope * p.x - intercept) ** 2,
    0,
  );
  const total = points.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  return {
    slope,
    intercept,
    r2: total ? 1 - residual / total : 1,
    count: points.length,
  };
}
// Return m²/year; the denominator converts input minutes to seconds.
export function casagrandeCv(HdrM, t50Minutes) {
  if (
    !Number.isFinite(HdrM) ||
    !Number.isFinite(t50Minutes) ||
    HdrM <= 0 ||
    t50Minutes <= 0
  )
    return null;
  return ((0.197 * HdrM ** 2) / (t50Minutes * 60)) * SECONDS_PER_YEAR;
}
export function analysisMeasurements(state) {
  const m = state.measurements ?? {};
  const difference = (a, b) =>
    Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
  const ratio = (a, b) =>
    Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null;
  const dry = difference(m.finalDryCanG, m.finalCanTareG);
  const wet0 = difference(m.initialWetAssemblyG, m.ringGlassTareG);
  const wetf = difference(m.finalWetAssemblyG, m.ringGlassTareG);
  const aliquotDry = difference(m.aliquotDryCanG, m.aliquotTareG);
  const w0 = ratio(difference(m.aliquotWetCanG, m.aliquotDryCanG), aliquotDry);
  const wf = ratio(difference(wetf, dry), dry);
  const GsMeasured = ratio(
    m.pycnometerDrySoilG,
    difference(
      m.pycnometerDrySoilG + m.pycnometerWaterG,
      m.pycnometerSoilWaterG,
    ),
  );
  const area = m.diameterM > 0 ? (Math.PI * m.diameterM ** 2) / 4 : null;
  const heightSolids = ratio(ratio(dry, GsMeasured), area);
  const heightSolidsM = heightSolids === null ? null : heightSolids / 1e6;
  const heightInitial = ratio(m.initialHeightM, heightSolidsM);
  const heightFinal = ratio(
    m.finalHeightM ?? state.model?.heightM,
    heightSolidsM,
  );
  const stageResults = (state.stages ?? []).map((stage) => {
    const rows = (state.readings ?? []).filter(
      (r) => r.stageIndex === stage.index,
    );
    const last = rows.at(-1);
    return {
      stageIndex: stage.index,
      pressureTsf: stage.pressureTsf,
      pressureKPa: stage.pressureKPa,
      HdrM: stage.HdrM,
      readingCount: rows.length,
      finalVoidRatio: last?.voidRatio ?? null,
      finalSettlementMm: last?.settlementMm ?? null,
    };
  });
  return {
    w0,
    wf,
    Gs: GsMeasured,
    dryMassG: dry,
    initialWetMassG: wet0,
    finalWetMassG: wetf,
    areaM2: area,
    area,
    heightSolidsM,
    heightSolids: heightSolidsM,
    e0: heightInitial === null ? null : heightInitial - 1,
    ef: heightFinal === null ? null : heightFinal - 1,
    stageResults,
    fittedCc: null,
    fittedCr: null,
    inferredPcKPa: null,
    fitNote:
      "Select observed points and construction controls; model inputs are not fitted results.",
  };
}
