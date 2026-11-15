import { excessPorePressure } from "./physics.js";
export function poreProfile(stage, model) {
  return {
    points: Array.from({ length: 17 }, (_, i) => ({
      z: i / 16,
      excessKPa: excessPorePressure(i / 16, model.Tv, stage.deltaKPa),
    })),
    heightMm: model.heightM * 1000,
    averageKPa: model.excessAverageKPa,
    effectiveKPa: model.effectiveAverageKPa,
    totalKPa: stage.pressureKPa,
    primaryPercent: model.primaryFraction * 100,
  };
}
export function renderPoreInspection(panel, stage, model) {
  if (!stage || !model) return;
  const p = poreProfile(stage, model),
    range = Math.max(1, Math.abs(stage.deltaKPa));
  const path = p.points
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${90 + (v.excessKPa / range) * 70},${15 + v.z * 90}`,
    )
    .join(" ");
  panel.innerHTML = `<div class="eyebrow">EXCESS PORE PRESSURE / MODEL</div><svg viewBox="0 0 180 125" role="img" aria-label="Excess pore pressure through specimen height"><rect x="20" y="15" width="140" height="90" fill="#ebf1e8"/><path d="M90,15 V105" stroke="#a5bdae" stroke-dasharray="3 3"/><path d="${path}" fill="none" stroke="#4a8592" stroke-width="2"/><text x="8" y="10" font-size="8" fill="#77938a">Top drained face · uₑ = 0</text><text x="8" y="119" font-size="8" fill="#77938a">Bottom drained face · uₑ = 0</text></svg><p>Average uₑ <strong>${p.averageKPa.toFixed(2)} kPa</strong><br>Effective σ′ <strong>${p.effectiveKPa.toFixed(2)} kPa</strong><br>Primary consolidation <strong>${p.primaryPercent.toFixed(1)}%</strong><br>Actual specimen H <strong>${p.heightMm.toFixed(3)} mm</strong></p><p style="font-size:8px">Signed excess pressure; hydraulic exchange reverses on unloading. Diagram is a schematic, not a geometric magnification.</p>`;
}
