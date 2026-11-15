export const SOUND_TYPES = ["place", "cut", "water", "load", "read", "oven"];
export function seededNoise(length, seed = 17) {
  const a = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    a[i] = seed / 2147483648 - 1;
  }
  return a;
}
export function synthEffect(ctx, out, type, t = ctx.currentTime) {
  const duration =
    type === "water"
      ? 0.65
      : type === "cut"
        ? 0.26
        : type === "oven"
          ? 0.3
          : 0.12;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(type === "water" ? 0.035 : 0.07, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  gain.gain.setValueAtTime(0, t + duration + 0.01);
  gain.connect(out);
  if (["water", "cut", "place"].includes(type)) {
    const b = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * duration),
      ctx.sampleRate,
    );
    b.copyToChannel(seededNoise(b.length), 0);
    const s = ctx.createBufferSource();
    s.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = type === "water" ? "lowpass" : "bandpass";
    f.frequency.value = type === "cut" ? 1900 : type === "place" ? 900 : 600;
    f.Q.value = 0.8;
    s.connect(f).connect(gain);
    s.start(t);
    s.stop(t + duration);
  }
  const o = ctx.createOscillator();
  o.type = type === "load" ? "triangle" : "sine";
  o.frequency.setValueAtTime(
    type === "read" ? 1200 : type === "oven" ? 700 : 380,
    t,
  );
  o.frequency.exponentialRampToValueAtTime(
    type === "read" ? 900 : 140,
    t + duration,
  );
  o.connect(gain);
  o.start(t);
  o.stop(t + duration);
  return t + duration + 0.01;
}
export function createAudio() {
  let ctx,
    master,
    muted = false;
  async function unlock() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      const limiter = ctx.createDynamicsCompressor();
      master.connect(limiter).connect(ctx.destination);
    }
    if (ctx.state === "suspended") await ctx.resume();
  }
  return {
    unlock,
    play(type) {
      if (ctx?.state === "running" && !muted) synthEffect(ctx, master, type);
    },
    setMuted(v) {
      muted = v;
      if (master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(v ? 0 : 0.5, t + 0.05);
      }
      return muted;
    },
  };
}
