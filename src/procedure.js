import {
  SPECIMEN,
  READING_MINUTES,
  PRESSURES_TSF,
  createStage,
  evaluateStage,
} from "./physics.js";
import { validatePlacement } from "./placement.js";
const NAMES = {
  ring: "specimen ring",
  caliper: "caliper",
  shelby: "Shelby tube",
  "can-initial": "initial moisture can",
  pycnometer: "water pycnometer",
  cutter: "cutting tool",
  straightedge: "straightedge",
  glass: "wrapped glass plate",
  film: "plastic wrap",
  "stone-bottom": "bottom porous stone",
  "filter-bottom": "bottom filter paper",
  specimen: "soil specimen",
  "filter-top": "top filter paper",
  "stone-top": "top porous stone",
  assembly: "cell assembly",
  water: "water",
  cap: "loading cap",
  adjuster: "load adjuster",
  dial: "dial gauge",
  towel: "blotting towel",
  "can-final": "final moisture can",
  oven: "oven",
  balance: "balance",
  trim: "trimming station",
  reservoir: "reservoir",
  bench: "bench",
};
function task(
  id,
  title,
  instruction,
  objectId = null,
  targetId = null,
  section = "Preparation",
  buttonLabel = title,
) {
  return Object.freeze({
    id,
    title,
    instruction:
      objectId && targetId
        ? `Drag ${NAMES[objectId]} to ${NAMES[targetId]}. ${instruction} Or use “${buttonLabel}”.`
        : `${instruction} Use “${buttonLabel}”.`,
    objectId,
    targetId,
    buttonLabel,
    section,
  });
}
export const PREPARATION = Object.freeze([
  task(
    "weigh-tare",
    "Weigh ring + plate tare",
    "Record the empty ring with its wrapped plate.",
    "ring",
    "balance",
  ),
  task(
    "measure-diameter",
    "Measure inside diameter",
    "Measure 63.5 mm inside the ring.",
    "caliper",
    "ring",
  ),
  task(
    "measure-height",
    "Measure ring height",
    "Measure 25.4 mm height.",
    "caliper",
    "ring",
  ),
  task(
    "extrude",
    "Extrude tube sample",
    "Extrude gently, retaining an undisturbed clay segment.",
    "shelby",
    "trim",
  ),
  task(
    "aliquot-tare",
    "Weigh initial moisture can",
    "Record can + lid tare for a separate representative aliquot.",
    "can-initial",
    "balance",
  ),
  task(
    "aliquot-wet",
    "Weigh wet aliquot",
    "Record can + wet representative aliquot.",
    "can-initial",
    "balance",
  ),
  task(
    "aliquot-dry",
    "Weigh dry aliquot",
    "Supporting moisture measurement: a compressed 16 h oven-drying step; record can + dry aliquot.",
    "can-initial",
    "oven",
  ),
  task(
    "measure-gs",
    "Measure solids specific gravity",
    "Supporting water-pycnometer measurement: record dry solids, bottle + water, and bottle + solids + water masses at the same temperature.",
    "pycnometer",
    "balance",
  ),
  task(
    "cut-segment",
    "Cut sample segment",
    "Cut approximately 76.2 mm of extruded sample.",
    "cutter",
    "specimen",
  ),
  task(
    "pare-horizontal",
    "Pare sides horizontally",
    "Hold the cutting tool horizontally and rotate the ring to pare the sides.",
    "cutter",
    "ring",
  ),
  task(
    "insert-gently",
    "Insert specimen gently",
    "Avoid annular gaps; leave soil projecting below the ring.",
    "specimen",
    "ring",
  ),
  task(
    "invert-first",
    "Invert ring and sample",
    "Invert before trimming the first face.",
  ),
  task(
    "cut-first",
    "Trim first face flush",
    "Cut the first face flush with the ring.",
    "straightedge",
    "ring",
  ),
  task(
    "support-glass",
    "Support on wrapped plate",
    "Place the trimmed face on the previously weighed wrapped plate.",
    "glass",
    "ring",
  ),
  task(
    "invert-second",
    "Invert onto supported plate",
    "Invert a second time while keeping the plate supporting the specimen.",
  ),
  task(
    "cut-second",
    "Trim second face flush",
    "Cut the second face flush.",
    "straightedge",
    "ring",
  ),
  task(
    "weigh-wet",
    "Weigh prepared specimen",
    "Record specimen + ring + wrapped plate.",
    "ring",
    "balance",
  ),
  task(
    "remove-glass",
    "Remove support plate",
    "Remove the plate carefully; retain it for final weighing.",
    "glass",
    "bench",
  ),
  task(
    "peel-wrap",
    "Peel plastic wrap",
    "Remove the wrap without disturbing the specimen.",
    "film",
    "bench",
  ),
  task(
    "soak-stones",
    "Soak porous stones",
    "Immerse both porous stones before assembly.",
    "stone-bottom",
    "reservoir",
  ),
  task(
    "bottom-stone",
    "Place bottom porous stone",
    "Place the soaked bottom porous stone first.",
    "stone-bottom",
    "assembly",
  ),
  task(
    "bottom-filter",
    "Place bottom filter paper",
    "Lay filter paper on the bottom stone.",
    "filter-bottom",
    "assembly",
  ),
  task(
    "place-ring",
    "Place specimen ring",
    "Center the ring on the bottom filter paper.",
    "ring",
    "assembly",
  ),
  task(
    "top-filter",
    "Place top filter paper",
    "Lay filter paper on the specimen.",
    "filter-top",
    "assembly",
  ),
  task(
    "top-stone",
    "Place top porous stone",
    "Place the soaked top stone on the filter.",
    "stone-top",
    "assembly",
  ),
  task(
    "lower-assembly",
    "Lower assembly into reservoir",
    "Keep the five-layer stack centered.",
    "assembly",
    "reservoir",
  ),
  task(
    "flood",
    "Flood reservoir",
    "Cover the specimen with water. Saturation is a modeled assumption, not a real-world verification.",
    "water",
    "reservoir",
  ),
  task(
    "center-cap",
    "Center loading cap",
    "Center the cap on the top porous stone.",
    "cap",
    "assembly",
  ),
  task(
    "adjust-contact",
    "Establish load contact",
    "Adjust the device gently until contact is established.",
    "adjuster",
    "cap",
  ),
  task(
    "zero-dial",
    "Zero dial and apply first increment",
    "Zero the displacement reference at the assumed initial effective stress of 10 kPa; apply 0.5 tsf.",
    "dial",
    "cap",
  ),
]);
const FINAL = Object.freeze([
  task(
    "release-load",
    "Release applied load",
    "Release the load after the final observation. Prompt final handling is modeled without an additional rebound interval.",
    "adjuster",
    "cap",
    "Final",
  ),
  task(
    "disassemble",
    "Disassemble cell",
    "Remove the cap, stones and filters; retain specimen in its ring.",
    "assembly",
    "bench",
    "Final",
  ),
  task(
    "blot",
    "Blot specimen",
    "Blot free surface water gently without removing pore water.",
    "towel",
    "specimen",
    "Final",
  ),
  task(
    "weigh-final-wet",
    "Weigh final wet specimen",
    "Reweigh specimen + ring on the same wrapped glass plate used for the tare.",
    "ring",
    "balance",
    "Final",
  ),
  task(
    "weigh-can",
    "Weigh final can + lid",
    "Record empty final moisture can + lid.",
    "can-final",
    "balance",
    "Final",
  ),
  task(
    "transfer-soil",
    "Transfer all soil",
    "Transfer every soil solid to the final can; no solids are lost.",
    "specimen",
    "can-final",
    "Final",
  ),
  task(
    "oven-place",
    "Place final can in oven",
    "Place the soil can in the oven; the 16 h drying timer starts for the next task.",
    "can-final",
    "oven",
    "Final",
  ),
  task(
    "dry-oven",
    "Complete 16 h oven drying",
    "Wait for 960 modeled minutes (16 h); accelerated clock is allowed. Complete drying only when the timer reaches 960. ",
    null,
    null,
    "Final",
  ),
  task(
    "weigh-dry",
    "Weigh dry specimen + can",
    "After drying, cool the covered can before weighing; record can + lid + all dry solids.",
    "can-final",
    "balance",
    "Final",
  ),
]);
const reply = (ok, message) => ({ ok, message });
export function createExperiment() {
  const state = {
    phase: "preparation",
    taskIndex: 0,
    stageIndex: -1,
    elapsedMinutes: 0,
    speed: 1,
    stages: [],
    readings: [],
    measurements: {},
    history: [],
    model: null,
    ovenMinutes: 0,
  };
  function readingIndex() {
    return state.readings.filter((r) => r.stageIndex === state.stageIndex)
      .length;
  }
  function currentTask() {
    if (state.phase === "preparation") return PREPARATION[state.taskIndex];
    if (state.phase === "loading") {
      const index = readingIndex(),
        stage = state.stages[state.stageIndex];
      if (index < READING_MINUTES.length)
        return task(
          "record-reading",
          `Observe at ${READING_MINUTES[index]} min`,
          `Applied load ${stage.pressureTsf} tsf (${stage.pressureKPa.toFixed(2)} kPa). Wait until ${READING_MINUTES[index]} minutes, then capture the dial. Accelerated time pauses at each due observation.`,
          null,
          null,
          "Loading",
          "Record reading",
        );
      return task(
        "next-increment",
        state.stageIndex === 10
          ? "Finish load schedule"
          : "Apply next increment",
        "All scheduled observations and the 1440-minute increment must be complete.",
        null,
        null,
        "Loading",
      );
    }
    if (state.phase === "final") return FINAL[state.taskIndex];
    return task(
      "complete",
      "Experiment complete",
      "Open the notebook to analyze measured masses and recorded stage readings.",
      null,
      null,
      "Analysis",
      "Open notebook",
    );
  }
  function log(actionId, details = {}) {
    state.history.push({
      actionId,
      phase: state.phase,
      taskIndex: state.taskIndex,
      stageIndex: state.stageIndex,
      elapsedMinutes: state.elapsedMinutes,
      ovenMinutes: state.ovenMinutes,
      ...details,
    });
  }
  function beginStage(index) {
    const stage = createStage(index, index ? state.model : undefined);
    state.stages.push(stage);
    state.stageIndex = index;
    state.elapsedMinutes = 0;
    state.model = evaluateStage(stage, 0);
  }
  function measure(id) {
    const m = state.measurements,
      s = SPECIMEN;
    const values = {
      "weigh-tare": { ringGlassTareG: s.ringMassG + s.glassMassG },
      "measure-diameter": { diameterM: s.diameterM },
      "measure-height": { initialHeightM: s.heightM },
      "aliquot-tare": { aliquotTareG: s.aliquotCanMassG },
      "aliquot-wet": {
        aliquotWetCanG:
          s.aliquotCanMassG + s.aliquotDryMassG * (1 + s.e0 / s.Gs),
      },
      "aliquot-dry": {
        aliquotDryCanG: s.aliquotCanMassG + s.aliquotDryMassG,
        aliquotDryingMinutes: 960,
      },
      "measure-gs": {
        pycnometerDrySoilG: 20,
        pycnometerWaterG: 180,
        pycnometerSoilWaterG: 180 + 20 - 20 / s.Gs,
      },
      "weigh-wet": {
        initialWetAssemblyG: s.ringMassG + s.glassMassG + s.initialWetMassG,
      },
      "weigh-final-wet": {
        finalWetAssemblyG:
          (state.model?.wetMassG ?? 0) + s.ringMassG + s.glassMassG,
        finalHeightM: state.model?.heightM,
      },
      "weigh-can": { finalCanTareG: s.canMassG },
      "weigh-dry": { finalDryCanG: s.canMassG + s.dryMassG },
    }[id];
    if (values) Object.assign(m, values);
    return values ?? {};
  }
  function act(actionId, placement = null) {
    if (state.phase === "loading") {
      if (actionId === "record-reading") return recordReading();
      if (actionId === "next-increment") return nextIncrement();
      return reply(
        false,
        "Capture the current observation before advancing the load.",
      );
    }
    if (state.phase === "complete")
      return reply(false, "Experiment already complete.");
    const expected = currentTask();
    if (!expected || actionId !== expected.id)
      return reply(
        false,
        `Complete ${expected?.title ?? "the current loading task"} first.`,
      );
    if (actionId === "dry-oven" && state.ovenMinutes < 960)
      return reply(
        false,
        `Dry for 16 h: ${state.ovenMinutes.toFixed(1)} / 960 minutes elapsed.`,
      );
    if (placement) {
      const check = validatePlacement(expected, placement);
      if (!check.ok) return reply(false, check.message);
    }
    const measurements = measure(actionId);
    log(actionId, { measurements, ...(placement ? { placement } : {}) });
    state.taskIndex++;
    if (
      state.phase === "preparation" &&
      state.taskIndex === PREPARATION.length
    ) {
      state.phase = "loading";
      state.taskIndex = 0;
      beginStage(0);
    } else if (state.phase === "final" && state.taskIndex === FINAL.length)
      state.phase = "complete";
    return reply(true, expected.title);
  }
  function recordReading({ recordedBy = "learner" } = {}) {
    if (!["learner", "automatic"].includes(recordedBy))
      return reply(false, "Reading origin must be learner or automatic.");
    if (state.phase !== "loading")
      return reply(false, "Readings are available only during loading.");
    const next = READING_MINUTES[readingIndex()];
    if (next === undefined)
      return reply(false, "All readings for this increment are recorded.");
    if (state.elapsedMinutes < next)
      return reply(
        false,
        `Wait until ${next} minutes; future observations cannot be recorded.`,
      );
    const model = evaluateStage(state.stages[state.stageIndex], next);
    const {
      pressureTsf,
      pressureKPa,
      dialDivisions,
      settlementMm,
      heightM,
      voidRatio,
    } = model;
    const reading = {
      recordedBy,
      stageIndex: state.stageIndex,
      pressureTsf,
      pressureKPa,
      minutes: next,
      dialDivisions,
      settlementMm,
      heightM,
      voidRatio,
    };
    state.readings.push(reading);
    log("record-reading", { reading: { ...reading } });
    return reply(true, `Recorded ${next}-minute observation.`);
  }
  function nextIncrement() {
    if (
      state.phase !== "loading" ||
      state.elapsedMinutes < 1440 ||
      readingIndex() !== READING_MINUTES.length
    )
      return reply(
        false,
        `Record all ${READING_MINUTES.length} observations and reach 1440 minutes first.`,
      );
    log("next-increment");
    if (state.stageIndex === PRESSURES_TSF.length - 1) {
      state.phase = "final";
      state.taskIndex = 0;
    } else beginStage(state.stageIndex + 1);
    return reply(true, "Increment complete.");
  }
  function setSpeed(multiplier) {
    if (![1, 60, 3600, 86400].includes(multiplier))
      return reply(false, "Allowed speeds: 1, 60, 3600, 86400.");
    state.speed = multiplier;
    log("set-speed", { multiplier });
    return reply(true, `Time speed: ${multiplier}×.`);
  }
  function tick(realSeconds) {
    if (!Number.isFinite(realSeconds) || realSeconds < 0)
      return reply(false, "Real seconds must be finite and nonnegative.");
    if (state.phase === "loading") {
      const due = READING_MINUTES[readingIndex()] ?? 1440;
      state.elapsedMinutes = Math.min(
        due,
        state.elapsedMinutes + (realSeconds * state.speed) / 60,
      );
      state.model = evaluateStage(
        state.stages[state.stageIndex],
        state.elapsedMinutes,
      );
    } else if (state.phase === "final" && currentTask().id === "dry-oven") {
      state.ovenMinutes = Math.min(
        960,
        state.ovenMinutes + (realSeconds * state.speed) / 60,
      );
    }
    return reply(true, "Clock updated.");
  }
  function reset() {
    const fresh = createExperiment().state;
    Object.assign(state, fresh);
    return reply(true, "Experiment reset.");
  }
  return {
    state,
    currentTask,
    act,
    recordReading,
    nextIncrement,
    tick,
    setSpeed,
    reset,
  };
}
