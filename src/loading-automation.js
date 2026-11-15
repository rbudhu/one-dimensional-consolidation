import { READING_MINUTES } from "./physics.js";

const reply = (ok, message) => ({ ok, message });

export function createLoadingAutomation(experiment) {
  const state = {
    active: false,
    paused: false,
    complete: false,
    completedIncrements: 0,
    recordedCount: 0,
  };
  let savedSpeed = null;
  let runStages = null;

  function start() {
    const current = experiment.state;
    if (
      state.active || state.complete ||
      current.phase !== "loading" || current.stageIndex !== 1 ||
      current.elapsedMinutes < 1440 ||
      current.readings.filter((r) => r.stageIndex === 1).length !== READING_MINUTES.length
    ) return reply(false, "Complete all observations and 1440 minutes of the second increment first.");
    savedSpeed = current.speed;
    const speed = experiment.setSpeed(86400);
    if (!speed.ok) return speed;
    const next = experiment.nextIncrement();
    if (!next.ok) {
      experiment.setSpeed(savedSpeed);
      savedSpeed = null;
      return next;
    }
    state.active = true;
    runStages = current.stages;
    return reply(true, "Simulating the remaining nine increments.");
  }

  function setPaused(paused) {
    state.paused = Boolean(paused);
    return reply(true, state.paused ? "Automatic loading paused." : "Automatic loading resumed.");
  }

  function tick(realSeconds) {
    if (!Number.isFinite(realSeconds) || realSeconds < 0)
      return reply(false, "Real seconds must be finite and nonnegative.");
    if (state.active && experiment.state.stages !== runStages) reset();
    if (!state.active || state.paused) return reply(true, "Automatic loading idle.");
    // Absolute laboratory deadline avoids cumulative subtraction drift at 24 h boundaries.
    const initial = experiment.state;
    const deadline = initial.stageIndex * 1440 + initial.elapsedMinutes + (realSeconds * initial.speed) / 60;
    while (state.active) {
      const current = experiment.state;
      const count = current.readings.filter((r) => r.stageIndex === current.stageIndex).length;
      const due = READING_MINUTES[count] ?? 1440;
      if (current.elapsedMinutes < due) {
        const position = current.stageIndex * 1440 + current.elapsedMinutes;
        const available = deadline - position;
        if (available <= 0) break;
        const minutes = Math.min(available, due - current.elapsedMinutes);
        // One-ulp conversion allowance reaches the guarded clamp rather than falling short.
        const seconds = ((minutes * 60) / current.speed) * (1 + Number.EPSILON);
        const result = experiment.tick(seconds);
        if (!result.ok) return result;
        if (current.elapsedMinutes < due) break;
      }
      if (count < READING_MINUTES.length) {
        const result = experiment.recordReading({ recordedBy: "automatic" });
        if (!result.ok) return result;
        state.recordedCount++;
      } else {
        const result = experiment.nextIncrement();
        if (!result.ok) return result;
        state.completedIncrements++;
        if (state.completedIncrements === 9) {
          state.active = false;
          state.complete = true;
          restoreSpeed();
        }
      }
    }
    return reply(true, "Automatic clock updated.");
  }

  function restoreSpeed() {
    if (savedSpeed !== null && experiment.state.stages === runStages)
      experiment.setSpeed(savedSpeed);
    savedSpeed = null;
    runStages = null;
  }

  function reset() {
    restoreSpeed();
    Object.assign(state, {
      active: false,
      paused: false,
      complete: false,
      completedIncrements: 0,
      recordedCount: 0,
    });
    return reply(true, "Automatic loading reset.");
  }

  return { state, start, tick, setPaused, reset };
}
