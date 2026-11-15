import "./style.css";
import "./inspection.css";
import { renderPoreInspection } from "./inspection.js";
import { createExperiment, PREPARATION } from "./procedure.js";
import { SPECIMEN, READING_MINUTES, analysisMeasurements } from "./physics.js";
import { createLabScene } from "./scene.js";
import { createAudio, synthEffect } from "./audio.js";
import { appliedLoad } from "./measurements.js";
import { createNotebook } from "./notebook.js";
import {measurementRows,latestMeasurement,liveMeasurements} from './measurement-ui.js';
import {createLoadingAutomation} from './loading-automation.js';
const app = document.querySelector("#app");
app.innerHTML = `<header><div class="brand"><span class="brand-icon" aria-hidden="true">≋</span><div><div class="eyebrow">GEOTECHNICAL / VIRTUAL LABORATORY</div><h1>Consolidation</h1></div></div><div class="header-right"><span id="gpu-status" class="gpu">Initializing WebGPU</span><button id="notebook-open" class="small">Experiment notebook ↗</button></div></header><main class="workspace"><section class="stage" aria-label="Laboratory apparatus"><div id="scene"></div><div class="scene-top"><span class="stage-number" id="scene-step">EXPERIMENT 12 / ONE-DIMENSIONAL CONSOLIDATION</span><h2>A little pressure. A lasting change.</h2><p>Light-grey clay · Incremental loading · Double drainage</p></div><div class="scene-tools"><button id="replay-handling" disabled>Replay handling</button><button id="closeup">Cell close-up</button><button id="cutaway" aria-pressed="false">Inspect layers</button><button id="mute" aria-pressed="false" aria-label="Mute generated sound effects">Sound on</button><button id="roam-button">P · Free roam</button></div><div id="cutaway-caption" class="cutaway-caption" hidden>Inspection cutaway: upper layers separated horizontally. Settlement remains true-scale.</div><svg id="layer-leaders" class="layer-leaders" aria-hidden="true" hidden></svg><div id="layer-labels" class="layer-labels" hidden><strong>Layer key · bottom → top</strong><ol><li>Bottom porous stone</li><li>Bottom filter paper</li><li>Soil specimen</li><li>Top filter paper</li><li>Top porous stone</li></ol><small>Schematic key; actual settlement is true-scale.</small></div><div id="pore-panel" class="pore-panel" hidden></div><div id="roam-hint" hidden>FREE ROAM · Drag to look · WASD move · Q/E vertical · P returns to bench</div><div id="handling-caption" class="handling-caption" aria-live="polite" hidden></div><div id="hover-label" aria-live="polite"></div><div class="scene-bottom"><div class="instrument"><div class="eyebrow">CONSOLIDATION DIAL</div><div class="value mono"><span id="dial-value">0.00</span> <span style="font-size:12px;letter-spacing:0">div</span></div><div class="unit">0.0001 in / division · positive = settlement</div><div class="instrument-row"><div>SETTLEMENT<strong><span id="settlement">0.0000</span> mm</strong></div><div>APPLIED STRESS<strong><span id="stress">0.00</span> kPa</strong></div></div></div><div class="scene-key" id="scene-key">Drag highlighted apparatus · <kbd>P</kbd> inspect freely</div></div><div class="fatal" id="fatal" hidden><div class="eyebrow">NATIVE WEBGPU REQUIRED</div><h2>This browser cannot render the lab.</h2><p id="fatal-message"></p></div></section><aside class="sidebar"><div><div class="progress-header"><span>Experiment progress</span><span id="progress-count">01 / 03</span></div><div class="progress-track"><span id="progress-prep" class="active"></span><span id="progress-load"></span><span id="progress-final"></span></div></div><section class="task"><div class="section-badge" id="section-badge">Specimen preparation</div><h2 id="task-title">Weigh the empty ring</h2><p class="instruction" id="instruction"></p><div class="drag-card" id="drag-card"><span class="drag-symbol" aria-hidden="true">⇢</span><div><strong id="drag-from">Consolidation ring → balance</strong><span id="drag-hint">Drag in the scene, or use the action below</span></div></div><button id="return-assembly" hidden>Return assembly to bench</button><button id="perform-action" class="primary">Record tare mass</button><p class="alt-note" id="action-note">Accessible alternative to apparatus handling</p></section><section class="timer" id="timer" hidden><div class="load-chip" id="load-chip">INCREMENT 1 / 11</div><div class="time mono"><span id="elapsed">0.00</span> <span style="font-size:11px;letter-spacing:0">lab min</span></div><div class="reading-next" id="reading-next">Next observation at 0 min</div><div class="reading-dots" id="reading-dots"></div><div class="speed-control"><label for="speed">Time acceleration</label><select id="speed"><option value="1">1× · real time</option><option value="60">60× · 1 min/sec</option><option value="3600">3,600× · 1 h/sec</option><option value="86400" selected>86,400× · 1 day/sec</option></select></div><button id="record-reading" class="primary">Record dial reading</button><button id="next-increment">Apply next pressure</button><p class="small" style="color:#859182;line-height:1.7">Clock pauses at each due observation. Every pressure step lasts 24 laboratory hours.</p></section><div class="feedback" id="feedback" role="status">Prepare a clean, wrapped glass plate and ring before weighing.</div><div class="lab-note"><div class="eyebrow">METHOD / ASTM D2435 REFERENCE</div><p>Follow the reference procedure in sequence. Simulated specimen and laboratory time; no experimental data is claimed.</p><p><a href="https://uta.pressbooks.pub/soilmechanics/chapter/consolidation-test/" target="_blank" rel="noopener">Read the original experiment ↗</a></p><button id="restart" class="secondary small">Restart experiment</button></div></aside></main><dialog id="notebook" aria-label="Experiment notebook"></dialog>`;
const $ = (id) => document.getElementById(id),
  experiment = createExperiment();
const automation=createLoadingAutomation(experiment);
document.querySelector('.timer').insertAdjacentHTML('beforebegin','<section class="loading-summary"><div class="eyebrow">GUIDED TWO-LOAD LESSON</div><p>Record the first two 24 h increments (0.5 and 1 tsf), then simulate the remaining nine.</p><p id="automation-status" role="status"></p><p id="loading-provenance"></p><small>All readings are virtual model data, not empirical observations.</small></section>');
document.querySelector('.feedback').insertAdjacentHTML('afterend','<section class="measurement-panel" aria-label="Measurements"><div class="eyebrow">LATEST COMPLETED MEASUREMENT</div><p id="latest-measurement" aria-live="polite"></p><div id="live-measurements"></div><details open><summary>Persistent measured properties</summary><dl id="measurement-rows"></dl></details><small>Virtual model data · derived values labelled</small></section>');
experiment.setSpeed(86400);
const audio = createAudio();
let scene,
  roam = false,
  muted = false,
  lastTaskKey = "",
  lastTime = performance.now(),
  lastUI = 0;
const notebook = createNotebook($("notebook"), {
  getState: () => experiment.state,
  specimen: SPECIMEN,
  measurements: analysisMeasurements,
});
const names = {
  ring: "Consolidation ring",
  caliper: "Digital caliper",
  shelby: "Shelby tube",
  "can-initial": "Initial moisture can",
  pycnometer: "Water pycnometer",
  cutter: "Horizontal cutting tool",
  straightedge: "Metal straightedge",
  glass: "Wrapped glass plate",
  film: "Saran wrap",
  "stone-bottom": "Lower porous stone",
  "filter-bottom": "Lower filter paper",
  specimen: "Soil specimen",
  "filter-top": "Upper filter paper",
  "stone-top": "Upper porous stone",
  assembly: "Specimen assembly",
  water: "Water beaker",
  cap: "Loading plate",
  adjuster: "Load adjustment",
  dial: "Dial gauge",
  towel: "Paper towel",
  "can-final": "Final moisture can",
  oven: "Drying oven",
  balance: "Precision balance",
  trim: "Trimming station",
  reservoir: "Water reservoir",
  bench: "Bench",
};
function notify(message, ok = true) {
  $("feedback").textContent = message;
  $("feedback").classList.toggle("error", !ok);
}
let lastHandling = null;
function handling(task) {
  lastHandling = task;
  $("replay-handling").disabled = false;
  $("handling-caption").hidden = false;
  $("handling-caption").textContent =
    task.id==='aliquot-dry'
      ? `${task.title} · compressed supporting 16 h drying; oven placement, covered return and actual balance seating. Cooling is illustrative, not thermally modelled.`
      : /dry-oven|weigh-dry/.test(task.id)
      ? `${task.title} · covered cooling; illustrative handling, thermal cooling not modelled.`
      : task.id === "pare-horizontal"
        ? `${task.title} · red procedural witness marks show ring + sample turning together; illustrative handling only.`
        : `${task.title} · illustrative handling only; no claim of microscopic disturbance or verified saturation.`;
}
$("replay-handling").onclick = () => {
  if (!roam && !automation.state.active && !scene?.actionBlocked() && lastHandling) {
    scene?.animateAction(lastHandling.id);
    handling(lastHandling);
  }
};
let feedbackGeneration = 0;
function sound(type) {
  const generation = ++feedbackGeneration;
  try {
    Promise.resolve(audio.unlock())
      .then(() => {
        if (generation === feedbackGeneration && !roam) audio.play(type);
      })
      .catch(() => {});
  } catch {
    /* Optional native audio never blocks the procedure. */
  }
}
function effect(id) {
  if (/cut|pare/.test(id)) return "cut";
  if (/flood|soak/.test(id)) return "water";
  if (/load|contact|zero/.test(id)) return "load";
  if (/oven|dry/.test(id)) return "oven";
  if (/weigh|measure/.test(id)) return "read";
  return "place";
}
let actionGeneration = 0;
function perform(placement = null) {
  if (roam || scene?.actionBlocked()) return;
  const task = experiment.currentTask();
  if (!task) return;
  const generation=actionGeneration;
  const valid=()=>generation===actionGeneration && !roam && experiment.currentTask()?.id===task.id;
  const commit=(settledPlacement=null)=>{
    if(!valid()) return;
    const provenance=settledPlacement || (placement && !placement.intentOnly ? {objectId:task.objectId,targetId:task.targetId,center:placement.center,target:placement.target} : null);
    const result = experiment.act(task.id, provenance);
    notify(result.message, result.ok);
    if (!result.ok) scene?.abortAction();
    if (result.ok) {
      $("hover-label").textContent = "";
      sound(effect(task.id));
      if(!scene?.isPortable(task)) scene?.animateAction?.(task.id);
      scene?.completeAction(task);
      handling(task);
      refresh();
      notebook.refresh();
    }
  };
  if(scene?.hasParked()) {
    scene.returnParked(()=>{if(valid()) perform(placement);});
    refresh();return;
  }
  const fail=()=>{if(valid()){scene?.abortAction();notify('Handling could not complete. Return to the indicated source and retry.',false);refresh();}};
  const seat=(visualTask,position,done)=>{if(!scene.seat(visualTask,position,done))fail();};
  scene?.prepareAction(task,()=>{
    if(!valid())return;
    if(task.id==='aliquot-dry'){
      handling(task);
      seat(task,placement,(ovenPlacement)=>{
        if(!valid())return;
        // Retain genuine completed oven contact for the core supporting-drying guard.
        // The typed mass is committed only after a separate, genuine pan seating.
        if(!scene.returnParked(()=>{
          if(!valid())return;
          const weighing={...task,id:'aliquot-weigh',targetId:'balance'};
          scene.prepareAction(weighing,()=>{if(valid())seat(weighing,null,()=>commit(ovenPlacement));});
        }))fail();
      });
    }else if(scene?.isPortable(task))seat(task,placement,commit);
    else commit();
    refresh();
  });
  refresh();
}
$("return-assembly").onclick = () => {
  if(roam || scene?.actionBlocked() || !scene?.hasParked()) return;
  const generation=actionGeneration;
  scene.returnParked(()=>{
    if(generation!==actionGeneration || roam) return;
    $("hover-label").textContent = "";
    notify("Assembly returned to bench. Continue with the indicated drag or action.");
    scene?.prepareTaskView();
    refresh();
  });
  refresh();
};
$("perform-action").onclick = () => perform();
$("record-reading").onclick = () => {
  if (roam || automation.state.active || experiment.state.stageIndex>1) return;
  const result = experiment.recordReading();
  notify(result.message, result.ok);
  if (result.ok) {
    sound("read");
    refresh();
  }
};
$("next-increment").onclick = () => {
  if (roam || automation.state.active) return;
  const result = experiment.state.stageIndex===1 ? automation.start() : experiment.nextIncrement();
  notify(result.message, result.ok);
  if (result.ok) {
    sound("load");
    refresh();
  }
};
$("speed").onchange = (e) => {if(!automation.state.active)experiment.setSpeed(+e.target.value);};
$("notebook-open").onclick = () => notebook.open();
$("restart").onclick = () => {
  if (confirm("Discard this experiment’s observations and start again?")) {
    feedbackGeneration++;
    actionGeneration++;
    scene?.resetCamera();
    scene?.cancelHandling(true);
    lastHandling = null;
    $("replay-handling").disabled = true;
    $("handling-caption").hidden = true;
    automation.reset();
    experiment.reset();
    if(roam)scene?.setRoam(false);
    scene?.toggleCutaway();
    $("cutaway").setAttribute("aria-pressed", "false");
    $("cutaway").textContent = "Inspect layers";
    for (const id of [
      "cutaway-caption",
      "layer-labels",
      "layer-leaders",
      "pore-panel",
    ])
      $(id).toggleAttribute("hidden", true);
    notebook.reset();
    lastTaskKey = "";
    experiment.setSpeed(+$("speed").value);
    notify(
      "Experiment reset. Begin with empty ring + wrapped glass plate tare.",
    );
    refresh();
  }
};
$("mute").onclick = () => {
  muted = !muted;
  audio.setMuted(muted);
  $("mute").textContent = muted ? "Sound off" : "Sound on";
  $("mute").setAttribute("aria-pressed", String(muted));
};
$("roam-button").onclick = () => scene?.setRoam(!roam);
$("closeup").onclick = () => {
  const v = scene?.toggleCloseup?.();
  $("closeup").textContent = v ? "Whole bench" : "Cell close-up";
  document.querySelector(".stage").dataset.closeup = String(!!v);
};
$("cutaway").onclick = () => {
  const value = scene?.toggleCutaway();
  $("cutaway").setAttribute("aria-pressed", String(!!value));
  $("cutaway").textContent = value ? "Close inspection" : "Inspect layers";
  $("cutaway-caption").hidden = !value;
  $("layer-labels").hidden = !value;
  $("layer-leaders").toggleAttribute("hidden", !value);
  $("pore-panel").hidden = !value || !experiment.state.model;
};
function refresh() {
  const s = experiment.state,
    t = experiment.currentTask(),
    loading = s.phase === "loading",
    oven = s.phase === "final" && t?.id === "dry-oven";
  const automaticOnly=loading && s.stageIndex>1;
  const learnerCount=s.readings.filter(r=>(r.recordedBy||'learner')==='learner').length;
  const automaticCount=s.readings.filter(r=>r.recordedBy==='automatic').length;
  $('loading-provenance').textContent=`${learnerCount} learner-recorded · ${automaticCount} automatic readings · ${s.readings.length} total`;
  $('automation-status').textContent=s.phase==='complete' ? 'All 11 increments and recovery complete. Open the notebook to analyze and export your virtual model data.' : automation.state.active ? `${automation.state.paused ? 'Paused' : 'Automatically calculating'} · increment ${s.stageIndex+1} / 11 · ${automation.state.completedIncrements} / 9 automatic increments complete` : automation.state.complete ? 'Nine automatic increments complete. Release the final load and finish recovery yourself.' : 'First two increments: learner captures every scheduled reading.';
  $('speed').disabled=automation.state.active;
  const latest=latestMeasurement(s),live=liveMeasurements(s),format=(v,d=2)=>Number.isFinite(v) ? v.toFixed(d) : '—';
  document.querySelector('.stage').dataset.phase=s.phase;
  $('closeup').textContent=scene?.isWholeBench() ? 'Action close-up' : 'Whole bench';
  $('latest-measurement').textContent=latest ? `${latest.name} · ${format(latest.value)} ${latest.unit}` : 'No completed measurement';
  $('measurement-rows').innerHTML=measurementRows(s).map(r=>`<div data-measurement="${r.field}"><dt>${r.name}${r.derived ? ' <em>derived</em>' : ''}</dt><dd><span class="measurement-value mono">${format(r.value,r.field==='Gs'?3:2)}</span> ${r.unit}</dd></div>`).join('');
  $('live-measurements').hidden=!s.model;
  $('live-measurements').innerHTML=`<strong>${live.status}</strong><dl><div><dt>Applied pressure</dt><dd>${format(live.pressureTsf)} tsf / ${format(live.pressureKPa)} kPa</dd></div><div><dt>Dial</dt><dd>${format(live.dial)} div</dd></div><div><dt>Settlement</dt><dd>${format(live.settlement,4)} mm</dd></div><div><dt>Laboratory time</dt><dd>${format(live.minutes)} min</dd></div></dl>`;
  if (!$("pore-panel").hidden && s.model) {
    if (appliedLoad(s).released)
      $("pore-panel").innerHTML = '<div class="eyebrow">RELEASED / LAST LOADED READING FROZEN</div><p>Applied stress is zero; post-release pressure evolution not modelled. Retained settlement is the last recorded reading, not a new equilibrium.</p>';
    else renderPoreInspection($("pore-panel"), s.stages[s.stageIndex], s.model);
  }
  const key = s.phase + ":" + s.taskIndex + ":" + s.stageIndex;
  if (key !== lastTaskKey) {
    lastTaskKey = key;
    // Pointer zones and pickups must see the same pose as this task, even before the next rAF.
    scene?.update(s);
    scene?.setTask(t);
  }
  $("section-badge").textContent =
    s.phase === "preparation"
      ? "Specimen preparation"
      : loading
        ? "Incremental loading"
        : s.phase === "final"
          ? "Final moisture & recovery"
          : "Experiment complete";
  $("task-title").textContent =
    t?.title ||
    (s.phase === "complete" ? "Experiment complete" : "Record consolidation");
  const parked=!!scene?.hasParked();
  $("instruction").textContent = s.phase==='complete' ? 'Open the notebook to analyze measured masses and recorded stage readings, construct plots and export your virtual model data. No further physical action is required.' : parked ? "Assembly is parked on its support. Return assembly to bench before dragging, or use the next action button to return and continue." :
    t?.instruction ||
    "Use the notebook to construct time–settlement plots, determine consolidation parameters and export your observations.";
  $("drag-card").hidden = !t?.objectId || !t?.targetId || loading;
  $("drag-from").textContent =
    parked ? "Drag disabled while parked · Return assembly to bench" : `${names[t?.objectId] || t?.objectId || ""} → ${names[t?.targetId] || t?.targetId || ""}`;
  $("drag-hint").textContent = parked ? "Use the return control, or the next action to return and continue" : "Drag in the scene, or use the action below";
  $("scene-key").innerHTML = s.phase==='complete' ? `Experiment complete · ${parked ? 'Return to bench is optional · ' : ''}<kbd>P</kbd> inspect freely` : parked ? "Assembly parked · Return to bench before dragging" : "Drag highlighted apparatus · <kbd>P</kbd> inspect freely";
  $("return-assembly").textContent = s.phase==='complete' ? 'Return to bench (optional)' : 'Return assembly to bench';
  $("return-assembly").hidden = !parked;
  $("return-assembly").disabled = roam || scene?.actionBlocked();
  $("perform-action").textContent = t?.buttonLabel || "Perform action";
  $("perform-action").hidden = loading || s.phase === "complete";
  $("replay-handling").disabled = roam || automation.state.active || scene?.actionBlocked() || !lastHandling;
  $("perform-action").disabled = roam || scene?.actionBlocked() || (oven && (s.ovenMinutes ?? 0) < 960);
  $("action-note").hidden = loading || s.phase === "complete";
  $("timer").hidden = !(loading || oven);
  $("record-reading").hidden = !loading;
  $("next-increment").hidden = !loading;
  $("load-chip").textContent = loading
    ? `INCREMENT ${s.stageIndex + 1} / 11 · ${s.stages[s.stageIndex]?.pressureTsf ?? 0} tsf ${s.stageIndex > 5 ? "↓ UNLOADING" : "↑ LOADING"}`
    : "OVEN DRYING · 105°C · 16 HOURS";
  const rows = s.readings.filter((r) => r.stageIndex === s.stageIndex),
    next = READING_MINUTES[rows.length];
  $("elapsed").textContent = (
    oven ? s.ovenMinutes || 0 : s.elapsedMinutes || 0
  ).toFixed(2);
  $("reading-next").textContent = oven
    ? `${Math.max(0, 960 - (s.ovenMinutes || 0)).toFixed(1)} laboratory minutes remaining`
    : next === undefined
      ? "All observations recorded · 24 h complete"
      : `Next observation at ${next} min${s.elapsedMinutes >= next ? " · ready" : ""}`;
  $("reading-dots").innerHTML = READING_MINUTES.map(
    (_, i) => `<i class="${i < rows.length ? "done" : ""}"></i>`,
  ).join("");
  $("reading-dots").hidden = oven;
  $("record-reading").disabled =
    roam || automaticOnly || !loading || next === undefined || (s.elapsedMinutes || 0) < next;
  $("next-increment").disabled =
    roam || automaticOnly || !loading || rows.length < READING_MINUTES.length || (s.elapsedMinutes || 0)<1440;
  $("next-increment").textContent =
    s.stageIndex === 1 ? 'Simulate remaining 9 increments' : automaticOnly ? 'Automatic loading in progress' : 'Apply next pressure';
  $("progress-count").textContent =
    s.phase === "preparation"
      ? `${String(s.taskIndex + 1).padStart(2, "0")} / ${PREPARATION.length}`
      : loading
        ? `${String(s.stageIndex + 1).padStart(2, "0")} / 11`
        : s.phase === "complete"
          ? "COMPLETE"
          : `${String(s.taskIndex + 1).padStart(2, "0")} / 09`;
  for (const [id, index] of [
    ["progress-prep", 0],
    ["progress-load", 1],
    ["progress-final", 2],
  ]) {
    const phase =
      s.phase === "preparation" ? 0 : loading ? 1 : s.phase === "final" ? 2 : 3;
    $(id).className = index < phase ? "done" : index === phase ? "active" : "";
  }
  $("dial-value").textContent = (s.model?.dialDivisions || 0).toFixed(2);
  $("settlement").textContent = (s.model?.settlementMm || 0).toFixed(4);
  $("stress").textContent = appliedLoad(s).pressureKPa?.toFixed(2) || "0.00";
}
try {
  scene = await createLabScene($("scene"), {
    onDrop: (object, target, placement) => {
      const t = experiment.currentTask();
      if (t?.objectId === object && t?.targetId === target) perform(placement);
    },
    onHover: (id) => {
      $("hover-label").textContent = id ? names[id] || id : "";
    },
    onCancel: () => {
      feedbackGeneration++;
      actionGeneration++;
      refresh();
    },
    onRoam: (value) => {
      roam = value;
      automation.setPaused(value);
      $("roam-hint").hidden = !value;
      $("roam-button").textContent = value
        ? "P · Return to bench"
        : "P · Free roam";
      refresh();
    },
    onError: (err) => {
      console.error(err);
      $("fatal").hidden = false;
      $("fatal-message").textContent = err.message;
    },
  });
  $("gpu-status").textContent = "WebGPU · native";
  if (location.search.includes("qa"))
    window.__lab = {
      inspect: () => ({
        ...scene.inspect(),
        phase: experiment.state.phase,
        task: experiment.currentTask()?.id,
        readings: experiment.state.readings.length,
        automation: {...automation.state},
      }),
      analysis: () => structuredClone(notebook.analysis()),
      handlingFrame: (fraction) => scene.handlingFrame(fraction),
      projectObject: scene.projectObject,
      projectTarget: scene.projectTarget,
      debugPick: scene.debugPick,
      renderAudio: async (type, muted) => {
        const c = new OfflineAudioContext(1, 48000, 48000),
          g = c.createGain();
        g.gain.value = muted ? 0 : 0.5;
        g.connect(c.destination);
        synthEffect(c, g, type, 0);
        const b = await c.startRendering(),
          a = b.getChannelData(0);
        let peak = 0,
          sum = 0,
          finite = true;
        for (const v of a) {
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
          finite &&= Number.isFinite(v);
        }
        return { peak, rms: Math.sqrt(sum / a.length), finite };
      },
      state: () => structuredClone(experiment.state),
    };
} catch (err) {
  $("gpu-status").textContent = "WebGPU unavailable";
  $("fatal").hidden = false;
  $("fatal-message").textContent = err.message;
}
refresh();
function renderLayerLeaders() {
  if (!scene || $("layer-labels").hidden) return;
  const bounds = document.querySelector(".stage").getBoundingClientRect(),
    points = scene.layerPoints(),
    items = [...$("layer-labels").querySelectorAll("li")];
  $("layer-leaders").setAttribute(
    "viewBox",
    `0 0 ${bounds.width} ${bounds.height}`,
  );
  $("layer-leaders").innerHTML = points
    .map((p, i) => {
      const r = items[i].getBoundingClientRect(),
        x = p.x - bounds.left,
        y = p.y - bounds.top;
      return `<line x1="${x}" y1="${y}" x2="${r.right - bounds.left + 5}" y2="${r.top - bounds.top + r.height / 2}" stroke="#476859" stroke-opacity=".65" stroke-width="1"/><circle cx="${x}" cy="${y}" r="2.5" fill="#476859"/>`;
    })
    .join("");
}
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if(automation.state.active){
    const count=experiment.state.readings.length;
    const result=automation.tick(dt);
    if(!result.ok)notify(result.message,false);
    if(experiment.state.readings.length!==count)notebook.refresh();
  }else experiment.tick(dt);
  if (now - lastUI > 75) {
    refresh();
    lastUI = now;
  }
  scene?.update(experiment.state);
  scene?.render(now);
  renderLayerLeaders();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
