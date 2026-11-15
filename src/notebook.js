import { READING_MINUTES } from "./physics.js";
import {
  createAnalysisState,
  analyzeExperiment,
  exportExperimentCSV,
  finiteInput,
} from "./analysis.js";
export {
  fitCompression,
  interpolateTime,
  casagrandeIntersection,
  secondarySlope,
  endPrimaryVoidRatio,
  casagrandeTimeConstruction,
} from "./analysis.js";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (n, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : "—");
function chart(
  points,
  {
    xKey = "minutes",
    yKey = "dialDivisions",
    xLabel = "Elapsed time (min) · logarithmic",
    yLabel = "Dial reading (div)",
    lines = [],
    legend = [],
    markers = [],
    ordinates = [],
    projection = null,
  } = {},
) {
  if (points.length < 2)
    return "<p>Capture at least two positive-time readings to construct a plot.</p>";
  const p = points.filter((p) => p[xKey] > 0 && Number.isFinite(p[yKey]));
  if (p.length < 2) return "<p>Insufficient positive-axis data.</p>";
  const xs = p.map((p) => Math.log10(p[xKey])),
    ys = p.map((p) => p[yKey]);
  let xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  if (xmax === xmin) xmax = xmin + 1;
  const yr = Math.max(ymax - ymin, 0.01);
  ymin -= yr * 0.12;
  ymax += yr * 0.12;
  if (xKey === "pressureKPa") {
    const xc = (xmin + xmax) / 2,
      yc = (ymin + ymax) / 2,
      xspan = Math.max(xmax - xmin, ((ymax - ymin) * 650) / 205);
    xmin = xc - xspan / 2;
    xmax = xc + xspan / 2;
    ymin = yc - (xspan * 205) / 650 / 2;
    ymax = yc + (xspan * 205) / 650 / 2;
  }
  const X = (x) => 65 + ((Math.log10(x) - xmin) / (xmax - xmin)) * 650,
    Y = (y) => 255 - ((y - ymin) / (ymax - ymin)) * 205;
  let grid = "";
  for (let i = 0; i <= 5; i++) {
    const y = ymin + ((ymax - ymin) * i) / 5;
    grid += `<line x1="65" y1="${Y(y)}" x2="715" y2="${Y(y)}" stroke="#dce4d7"/><text x="54" y="${Y(y) + 4}" text-anchor="end">${number(y, yKey === "voidRatio" ? 3 : 0)}</text>`;
  }
  for (let i = Math.ceil(xmin); i <= Math.floor(xmax); i++)
    grid += `<line x1="${X(10 ** i)}" y1="50" x2="${X(10 ** i)}" y2="255" stroke="#dce4d7"/><text x="${X(10 ** i)}" y="275" text-anchor="middle">${number(10 ** i, 10 ** i < 1 ? 1 : 0)}</text>`;
  const path = p
    .map((p, i) => `${i ? "L" : "M"}${X(p[xKey])},${Y(p[yKey])}`)
    .join(" ");
  const palette = ["#946b33", "#706599", "#357d85", "#9b5459", "#4e7358"];
  const extra = lines
    .filter((l) => l.every((p) => p[0] > 0 && Number.isFinite(p[1])))
    .map(
      (l, i) =>
        `<path class="construction" style="stroke:${palette[i % palette.length]};stroke-dasharray:${i % 2 ? "3 4" : "7 4"}" d="${l.map((p, i) => `${i ? "L" : "M"}${X(p[0])},${Y(p[1])}`).join(" ")}"/>`,
    )
    .join("");
  const annotations =
    ordinates
      .filter((o) => Number.isFinite(o.value))
      .map(
        (o) =>
          `<path d="M65,${Y(o.value)} H715" stroke="#8d703e" stroke-dasharray="2 5"/><text x="70" y="${Y(o.value) - 4}" style="font-weight:700">${esc(o.label)} = ${number(o.value, 2)}</text>`,
      )
      .join("") +
    markers
      .filter((m) => m.x > 0 && Number.isFinite(m.y))
      .map(
        (m) =>
          `<circle cx="${X(m.x)}" cy="${Y(m.y)}" r="5" fill="#8d703e"/><text data-marker="${esc(m.label)}" x="${X(m.x) + (m.dx ?? 7)}" y="${Y(m.y) + (m.dy ?? -7)}" text-anchor="${m.anchor ?? "start"}">${esc(m.label)}</text>`,
      )
      .join("") +
    (projection?.x > 0 && Number.isFinite(projection.y)
      ? `<path d="M${X(projection.x)},${Y(projection.y)} V255" stroke="#8d703e" stroke-dasharray="3 4"/><text x="${X(projection.x) + 5}" y="247">${esc(projection.label)} = ${number(projection.x, 3)}</text>`
      : "");
  const key = legend
    .map(
      (label, i) =>
        `<text style="fill:${palette[i % palette.length]}" x="${65 + (i % 3) * 220}" y="${342 + Math.floor(i / 3) * 18}">${esc(label)}</text>`,
    )
    .join("");
  return `<svg class="plot" viewBox="0 0 760 385" role="img" aria-label="${esc(yLabel)} versus ${esc(xLabel)}">${grid}<defs><clipPath id="plotclip"><rect x="65" y="50" width="650" height="205"/></clipPath></defs><g clip-path="url(#plotclip)"><path class="line" d="${path}"/>${p.map((p) => `<circle cx="${X(p[xKey])}" cy="${Y(p[yKey])}" r="3.5"/>`).join("")}${extra}${annotations}</g>${key}<text x="390" y="312" text-anchor="middle">${esc(xLabel)}</text><text x="17" y="150" transform="rotate(-90 17 150)" text-anchor="middle">${esc(yLabel)}</text></svg>`;
}
export function createNotebook(dialog, { getState, specimen, measurements }) {
  let tab = "measurements",
    selectedStage = 0;
  const selections = createAnalysisState();
  const results = () =>
    analyzeExperiment(getState(), selections, specimen, measurements);
  dialog.innerHTML = `<div class="notebook-header"><div><div class="eyebrow">LAB RECORD / CONSOLIDATION</div><h2>Experiment notebook</h2></div><div><button id="export-csv" class="small">Export CSV ↓</button> <button id="close-notebook" aria-label="Close notebook">✕</button></div></div><div class="notebook-body"><nav class="notebook-tabs" aria-label="Notebook sections">${[
    ["measurements", "Measurements"],
    ["time", "Time–settlement"],
    ["pressure", "e–log pressure"],
    ["history", "Procedure log"],
    ["model", "Model & reference"],
  ]
    .map(([id, label]) => `<button data-tab="${id}">${label}</button>`)
    .join(
      "",
    )}</nav><section class="notebook-panel" id="notebook-panel"></section></div>`;
  dialog.querySelector('.notebook-header').insertAdjacentHTML('afterend','<p id="notebook-provenance" class="model-note"></p>');
  dialog.querySelector("#close-notebook").onclick = () => dialog.close();
  dialog.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        render();
      }),
  );
  function rowsForStage(i) {
    return getState().readings.filter((r) => r.stageIndex === i);
  }
  function stageEnds() {
    return results().ends;
  }
  function render() {
    const state = getState(),
      analysis = results(),
      picks = selections.pressure;
    const panel = dialog.querySelector("#notebook-panel");
    const learner=state.readings.filter(r=>(r.recordedBy||'learner')==='learner').length;
    const automatic=state.readings.filter(r=>r.recordedBy==='automatic').length;
    dialog.querySelector('#notebook-provenance').textContent=`${learner} learner-recorded · ${automatic} automatic readings · ${state.readings.length} total. All are virtual model data; automatic stages are calculated, not learner-observed or empirical measurements.`;
    dialog
      .querySelectorAll("[data-tab]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "measurements") {
      const m = measurements(state);
      const values = Object.entries(state.measurements || {}).filter(
        ([, v]) => typeof v === "number",
      );
      panel.innerHTML = `<h3>Measured specimen properties</h3><p>Readings are taken from your handling and measurement actions. Engineering units are explicitly typed: metres, grams, minutes and kPa; conversions are centralized at physics boundaries. Derived quantities appear once their required measurements are available.</p><div class="metrics">${[
        [
          "Initial moisture",
          m.initialWaterContentPct ??
            m.w0Pct ??
            (Number.isFinite(m.w0) ? m.w0 * 100 : null),
          "%",
        ],
        [
          "Final moisture",
          m.finalWaterContentPct ??
            m.wfPct ??
            (Number.isFinite(m.wf) ? m.wf * 100 : null),
          "%",
        ],
        ["Initial void ratio", m.initialVoidRatio ?? m.e0, ""],
        ["Final void ratio", m.finalVoidRatio ?? m.ef, ""],
      ]
        .map(
          ([s, v, u]) =>
            `<div class="metric"><span>${s}</span><strong>${number(v)} <small>${u}</small></strong></div>`,
        )
        .join(
          "",
        )}</div><div class="table-wrap"><table><thead><tr><th>Measurement</th><th>Value</th><th>Unit</th></tr></thead><tbody>${values.map(([k, v]) => `<tr><td>${esc(k.replace(/([A-Z])/g, " $1").replaceAll("_", " "))}</td><td class="mono">${number(k.endsWith("M") ? v * 1000 : v, 4)}</td><td>${k.endsWith("G") ? "g" : k.endsWith("M") ? "mm" : k.endsWith("Minutes") ? "min" : "—"}</td></tr>`).join("")}</tbody></table></div><p>Ring inner diameter: ${number(specimen.diameterM * 1000, 2)} mm; height: ${number(specimen.heightM * 1000, 2)} mm. A = πd²/4. Hₛ = Mₛ/(A Gₛ ρw). e = H/Hₛ − 1. Water content = (wet − dry)/dry × 100%, with all container tares subtracted.</p><p class="model-note">Specimen masses are internally consistent simulator measurements, not copied experimental evidence. See Model & reference for differences from the chapter’s sample arithmetic.</p>`;
    } else if (tab === "time") {
      const rows = rowsForStage(selectedStage),
        stage = state.stages[selectedStage],
        record = selections.stage(selectedStage),
        result = analysis.stages[selectedStage] || {
          ...record,
          automatic: {
            issues: ["Capture stage readings to construct results."],
          },
          D0: null,
          D100: null,
          D50: null,
          t50: null,
          cv: null,
          alpha: null,
        };
      const construction = result.automatic,
        picks = { ...record, D0: result.D0, D100: result.D100 };
      const constructionLines = [];
      if (rows.length > 1) {
        const x1 = rows[1].minutes,
          x2 = rows.at(-1).minutes;
        for (const line of [construction.primary, construction.secondary])
          if (line)
            constructionLines.push([
              [x1, line.intercept + line.slope * Math.log10(x1)],
              [x2, line.intercept + line.slope * Math.log10(x2)],
            ]);
        if (Number.isFinite(picks.D0) && Number.isFinite(picks.D100))
          constructionLines.push([
            [x1, (picks.D0 + picks.D100) / 2],
            [x2, (picks.D0 + picks.D100) / 2],
          ]);
      }
      const constructionSelect = (id, label, value) =>
        `<label>${label}<select id="${id}">${[
          ...new Set([
            value,
            ...[0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 240, 480, 1440],
          ]),
        ]
          .filter((minutes) => minutes > 0)
          .sort((a, b) => a - b)
          .map((minutes) => ({ minutes }))
          .map(
            (r) =>
              `<option value="${r.minutes}" ${r.minutes === value ? "selected" : ""}>${r.minutes} min</option>`,
          )
          .join("")}</select></label>`;
      const { D50, t50, cv, alpha } = result;
      panel.innerHTML = `<h3>Casagrande logarithm-of-time construction</h3><p>Choose a pressure increment. Determine D₀ from the early-time construction, locate D₁₀₀ at the intersection of primary and secondary tangents, then set D₅₀ = (D₀ + D₁₀₀)/2. The chart uses cumulative dial divisions; each stage resets time, not displacement.</p><div class="analysis-controls"><label>Pressure increment<select id="nb-stage">${state.stages.map((s, i) => `<option value="${i}" ${i === selectedStage ? "selected" : ""}>${i + 1}. ${s.pressureTsf} tsf ${i > 5 ? "↓" : "↑"}</option>`).join("")}</select></label><label>D₀ (div)<input id="d0" type="number" step="0.1" value="${Number.isFinite(picks.D0) ? number(picks.D0, 2) : ""}"></label><label>D₁₀₀ (div)<input id="d100" type="number" step="0.1" value="${Number.isFinite(picks.D100) ? number(picks.D100, 2) : ""}"></label></div>${chart(
        rows,
        {
          lines: constructionLines,
          legend: [
            "Primary tangent",
            "Secondary tangent",
            "D₀ / D₅₀ / D₁₀₀ (div)",
            "t₅₀ log-time projection",
          ],
          ordinates: [
            { label: "D₀", value: picks.D0 },
            { label: "D₅₀", value: D50 },
            { label: "D₁₀₀", value: picks.D100 },
          ],
          markers: [{ x: t50, y: D50, label: "50% primary" }],
          projection: { x: t50, y: D50, label: "t₅₀ (min)" },
        },
      )}<div class="analysis-controls">${constructionSelect("early-time", "Early t₁ (t₂ = 4t₁)", picks.earlyTime)}${constructionSelect("primary-start", "Primary tangent start", picks.primaryStart)}${constructionSelect("primary-end", "Primary tangent end", picks.primaryEnd)}${constructionSelect("secondary-start", "Secondary tangent start", picks.secondaryStart)}${constructionSelect("secondary-end", "Secondary tangent end", picks.secondaryEnd)}</div><p class="model-note">Initial D₀ and D₁₀₀ are graphical estimates from the selected recorded points, not first/last dial values or model truth. D₀ = 2D(t₁) − D(4t₁). D₁₀₀ is the ordinate at the tangent intersection (${number(construction.intersectionMinutes, 2)} min). Adjust tangent selections or enter independently drawn ordinates above.</p><div class="results-box">D₅₀ = <strong>${number(D50, 2)} div</strong> · t₅₀ = <strong>${number(t50, 3)} min</strong> · cᵥ = <strong>${number(cv, 3)} m²/year</strong><br>cᵥ = 0.197 Hdr²/t₅₀; Hdr = Hstart/2 = ${number(stage?.HdrM * 1000, 3)} mm (double drainage).</div><div class="analysis-controls"><label>Secondary start reading<select id="secondary-a">${rows.map((r, i) => `<option value="${i}" ${i === picks.secondaryA ? "selected" : ""}>${r.minutes} min</option>`).join("")}</select></label><label>Secondary end reading<select id="secondary-b">${rows.map((r, i) => `<option value="${i}" ${i === picks.secondaryB ? "selected" : ""}>${r.minutes} min</option>`).join("")}</select></label></div><p>Measured Cα = Δe/Δlog₁₀t = <strong>${number(alpha, 5)}</strong>. Choose two late-time observations beyond primary consolidation; a poor selection is not a valid fitted material property.</p><details><summary class="small">Recorded readings (${rows.length}/${READING_MINUTES.length})</summary><div class="table-wrap"><table><tr><th>t (min)</th><th>Dial (div)</th><th>Settlement (mm)</th><th>e</th></tr>${rows.map((r) => `<tr><td>${r.minutes}</td><td>${number(r.dialDivisions, 2)}</td><td>${number(r.settlementMm, 5)}</td><td>${number(r.voidRatio, 5)}</td></tr>`).join("")}</table></div></details>`;
      panel.insertAdjacentHTML('afterbegin',`<p class="model-note">${rows.length===0 ? 'No readings yet for this increment.' : rows.every(r=>r.recordedBy==='automatic') ? 'Automatically calculated virtual readings; not observed by the learner.' : 'Learner-recorded virtual readings.'}</p>`);
      const readingTable=panel.querySelector('details table');
      if(readingTable){readingTable.rows[0].insertAdjacentHTML('beforeend','<th>Recorded by</th>');rows.forEach((r,i)=>readingTable.rows[i+1].insertAdjacentHTML('beforeend',`<td>${esc(r.recordedBy||'learner')}</td>`));}
      panel.querySelector("#nb-stage").onchange = (e) => {
        selectedStage = Number(e.target.value);
        selections.selectedStage = selectedStage;
        render();
      };
      for (const [id, key] of [
        ["d0", "D0"],
        ["d100", "D100"],
      ])
        panel.querySelector("#" + id).onchange = (e) => {
          record[key] = finiteInput(e.target.value);
          record["manual" + key] = record[key] !== null;
          render();
        };
      for (const [id, key] of [
        ["secondary-a", "secondaryA"],
        ["secondary-b", "secondaryB"],
        ["early-time", "earlyTime"],
        ["primary-start", "primaryStart"],
        ["primary-end", "primaryEnd"],
        ["secondary-start", "secondaryStart"],
        ["secondary-end", "secondaryEnd"],
      ])
        panel.querySelector("#" + id).onchange = (e) => {
          record[key] = finiteInput(e.target.value);
          render();
        };
      panel.insertAdjacentHTML(
        "beforeend",
        `<p class="model-note">D₀: ${record.manualD0 ? "manual override" : "automatic"}; D₁₀₀: ${record.manualD100 ? "manual override" : "automatic"}. Blank clears a manual override and restores the automatic estimate. Invalid or unavailable constructions are shown as —, never zero. ${result.issues?.join(" ") || ""}</p>`,
      );
    } else if (tab === "pressure") {
      const ends = analysis.ends,
        { load, recompression, virgin, reload, cur, tangent, pc } =
          analysis.pressure;
      let lines = [];
      if (virgin && load.length > 1) {
        const x1 = load[0].pressureKPa,
          x2 = load.at(-1).pressureKPa;
        lines.push([
          [x1, virgin.intercept + virgin.slope * Math.log10(x1)],
          [x2, virgin.intercept + virgin.slope * Math.log10(x2)],
        ]);
        if (cur && Number.isFinite(tangent)) {
          lines.push([
            [x1, cur.voidRatio],
            [x2, cur.voidRatio],
          ]);
          const tangentIntercept =
            cur.voidRatio - tangent * Math.log10(cur.pressureKPa);
          lines.push([
            [x1, tangentIntercept + tangent * Math.log10(x1)],
            [x2, tangentIntercept + tangent * Math.log10(x2)],
          ]);
          const bis = Math.tan(Math.atan(tangent) / 2),
            b = cur.voidRatio - bis * Math.log10(cur.pressureKPa);
          lines.push([
            [x1, b + bis * Math.log10(x1)],
            [x2, b + bis * Math.log10(x2)],
          ]);
        }
      }
      const selection = (id, label, value, data = load) =>
        `<label>${label}<select id="${id}">${data.map((r, i) => `<option value="${i}" ${i === value ? "selected" : ""}>${r.pressureTsf} tsf</option>`).join("")}</select></label>`;
      panel.innerHTML = `<h3>Compression, recompression & past pressure</h3><p>After final dry weighing, e is calculated at the graphical end of primary consolidation from each D₁₀₀ and measured solids height, not from the 24-hour secondary-compressed height. Before that, the plot is a clearly provisional 24-hour curve with no primary compression fit. Select the low-stress and virgin-loading ranges to fit Cr and Cc. For Casagrande Pc, select the point of maximum curvature and its tangent; the horizontal/tangent bisector intersects the extended virgin line.</p>${chart(
        ends,
        {
          xKey: "pressureKPa",
          yKey: "voidRatio",
          xLabel: "Applied pressure (kPa) · logarithmic",
          yLabel: "Void ratio e",
          lines,
          legend: [
            "Virgin fit (Cc)",
            "Horizontal at curvature",
            "Curvature tangent",
            "Angle bisector",
            "Pc virgin intersection",
          ],
          markers: [
            { x: cur?.pressureKPa, y: cur?.voidRatio, label: "Curvature" },
            {
              x: pc,
              y:
                virgin && pc
                  ? virgin.intercept + virgin.slope * Math.log10(pc)
                  : null,
              label: "Pc",
              dx: 8,
              dy: 18,
            },
          ],
          projection: {
            x: pc,
            y:
              virgin && pc
                ? virgin.intercept + virgin.slope * Math.log10(pc)
                : null,
            label: "Pc (kPa)",
          },
        },
      )}<div class="analysis-controls">${selection("virgin-a", "Virgin start", picks.firstVirgin)}${selection("virgin-b", "Virgin end", picks.lastVirgin)}<label>Recompression branch<select id="reload-branch"><option value="unloading" ${picks.reloadBranch === "unloading" ? "selected" : ""}>Unloading rebound</option><option value="loading" ${picks.reloadBranch === "loading" ? "selected" : ""}>Initial low-stress reload</option></select></label>${selection("reload-a", "Recompression start", picks.firstReload, recompression)}${selection("reload-b", "Recompression end", picks.lastReload, recompression)}${selection("curvature", "Maximum curvature", picks.curvature)}<label>Tangent slope (e / log₁₀kPa)<input id="tangent" type="number" step=".01" value="${Number.isFinite(tangent) ? tangent : ""}"></label></div><div class="results-box">Selected fit: Cc = <strong>${number(virgin?.index, 4)}</strong> · Cr = <strong>${number(reload?.index, 4)}</strong> · Casagrande Pc = <strong>${number(pc, 1)} kPa</strong>.<br>These are graphical estimates from your selected observations and construction, not the constitutive model inputs. The chart uses equal coordinate scale (one e unit and one log-pressure unit occupy equal pixel lengths) so the shown bisector agrees with the calculated construction angle. Early incomplete stages are excluded. Creep accumulated during earlier increments and graphical choices can make a fitted virgin slope differ from the prescribed Cc; unloading offers a cleaner Cr estimate.</div><div class="table-wrap"><table><tr><th>Increment</th><th>Pressure (tsf)</th><th>Pressure (kPa)</th><th>Final dial (div)</th><th>H₂₄ₕ (mm)</th><th>e (EOP estimate)</th><th>e₂₄ₕ</th></tr>${ends.map((p) => `<tr><td>${p.index + 1} ${p.loading ? "↑" : "↓"}</td><td>${p.pressureTsf}</td><td>${number(p.pressureKPa, 2)}</td><td>${number(p.dialDivisions, 2)}</td><td>${number(p.heightM * 1000, 4)}</td><td>${p.isPrimary ? number(p.voidRatio, 5) : "EOP unavailable: dry mass or construction"}</td><td>${number(p.finalVoidRatio, 5)}</td></tr>`).join("")}</table></div>`;
      for (const [id, key] of [
        ["virgin-a", "firstVirgin"],
        ["virgin-b", "lastVirgin"],
        ["reload-a", "firstReload"],
        ["reload-b", "lastReload"],
        ["curvature", "curvature"],
        ["tangent", "tangent"],
      ])
        panel.querySelector("#" + id).onchange = (e) => {
          picks[key] = finiteInput(e.target.value);
          if (key === "curvature") picks.tangent = null;
          render();
        };
      panel.querySelector("#reload-branch").onchange = (e) => {
        picks.reloadBranch = e.target.value;
        picks.firstReload = 0;
        picks.lastReload = e.target.value === "unloading" ? 4 : 1;
        render();
      };
    } else if (tab === "history") {
      panel.innerHTML = `<h3>Procedure trace</h3><p>Actions are recorded only after the required prerequisite is satisfied. Loading observations must be captured at each scheduled elapsed time.</p><ol class="history-list">${state.history.map((h) => `<li>${esc(typeof h === "string" ? h : JSON.stringify(h))}</li>`).join("")}</ol>`;
    } else {
      panel.innerHTML = `<h3>A transparent physical model</h3><p><a href="https://uta.pressbooks.pub/soilmechanics/chapter/consolidation-test/" target="_blank" rel="noopener">Reference: UTA Soil Mechanics — Consolidation Test</a>. The procedure follows the chapter’s 0.5 → 16 → 0.5 tsf sequence. Its sample results use a different kPa loading schedule and inconsistent Gs/mass/height values, so they are not combined into one specimen here.</p><p><strong>Illustrative light-grey clay:</strong> d = 63.5 mm, H₀ = 25.4 mm, Gs = 2.72, e₀ = 0.816, initially saturated. Dry solids mass = ${number(specimen.dryMassG, 3)} g; initial wet mass = ${number(specimen.initialWetMassG, 3)} g. Saturated w₀ = e₀/Gs = ${number((specimen.e0 / specimen.Gs) * 100, 3)}%. This differs from the chapter’s 28.9% example and is intentional.</p><p><strong>Constitutive assumptions:</strong> Cc = 0.23, Cr = 0.06, historical maximum stress Pc = 115 kPa. Initial effective stress = 10 kPa, not an impossible log(0) state. The dial is zeroed at the initial geometry; load stress is total applied stress. Piecewise e–log-pressure behavior includes stress history and unloading rebound.</p><p><strong>Drainage:</strong> one-dimensional Terzaghi consolidation with both faces drained, lateral confinement, Hdr = Hstart/2 and pressure-dependent cv in the reference range 4.2–7.25 m²/year. The water initially carries the increment and transfers it to the soil skeleton as excess pore pressure dissipates. The prescribed secondary coefficient is 0.003 Δe/log10(t) after t95 (U≈95%) on loading, and 0 on unloading. Measured Cα from selected readings is a separate fitted result. No finite-element or grain-scale realism is claimed.</p><p><strong>Timing:</strong> simulator data-sheet schedule is 0, 0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 240, 480 and 1440 minutes at each increment. Clock pauses at each due observation so accelerated time cannot discard readings. Each increment lasts 24 laboratory hours. Final oven drying is 16 hours at 105°C; acceleration changes only how long you wait, never the data timestamps.</p><p><strong>Calibration:</strong> the actuator gauge is calibrated directly in applied specimen stress. F = σA, using the measured ring area; its displayed tsf is not an uncalibrated hydraulic line pressure. No hidden lever ratio is assumed.</p><p><strong>Units:</strong> 1 tsf = 95.7605 kPa (US short ton-force/ft²). Dial resolution = 0.0001 inch/division = 0.00254 mm/division. Dial motion reflects true specimen settlement and can unwind during unloading. The ring and lower stone remain fixed.</p><p><strong>Supporting tests:</strong> initial water content uses a separate aliquot, not the test specimen. Gs uses the water-pycnometer relation Gs = Ms/(Ms + Mpyc+water − Mpyc+soil+water); the displayed measurements follow that convention. Saturation is a model assumption supported by submerged soaked-stone assembly, not a simulated real-world laboratory certification.</p><p><strong>Limits:</strong> this is an educational virtual laboratory, not certification of ASTM D2435 compliance, a substitute for handling real clay, or a source of site-design parameters. Full settlement occurs at physical scale; cutaway separates upper drainage layers horizontally for inspection and is clearly nonphysical.</p>`;
    }
  }
  dialog.querySelector("#export-csv").onclick = () => {
    const s = getState(),
      csv = exportExperimentCSV(s, results(), measurements);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "consolidation-lab-readings.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return {
    reset() {
      selections.reset();
      selectedStage = 0;
      tab = "measurements";
      if (dialog.open) render();
    },
    analysis: results,
    open() {
      render();
      dialog.showModal();
    },
    refresh() {
      if (dialog.open) render();
    },
    render,
  };
}
