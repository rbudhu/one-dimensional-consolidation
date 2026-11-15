import * as T from "three/webgpu";
import { balanceMeasurement, appliedLoad } from "./measurements.js";
import {caliperMeasurement} from './measurement-ui.js';
import {createActionCamera} from './action-camera.js';
import { validatePlacement } from "./placement.js";
import { zoneFromPoints, containsClientPoint, cueStyle } from "./drop-feedback.js";
import { planCarry, sampleRoute, sweptClear, translated, CLEARANCE_M } from "./carry.js";

export const BENCH_LAYOUT = {
  ring: [-0.22, 0.019, 0.12],
  glass: [-0.30, -0.001, 0.21],
  shelby: [-0.43, 0.05, -0.12],
  specimen: [-0.24, 0.04, 0.13],
  cutter: [-0.12, 0.007, 0.25],
  straightedge: [-0.32, 0.009, 0.3],
  caliper: [-0.46, 0.011, -0.32],
  "stone-bottom": [0.12, 0.009, 0.23],
  "stone-top": [0.2, 0.009, 0.23],
  "filter-bottom": [0.12, 0.003, 0.32],
  "filter-top": [0.2, 0.003, 0.32],
  cap: [0.3, 0.012, 0.22],
  water: [0.43, 0.055, 0.18],
  "can-initial": [-0.6, 0.017, 0.34],
  pycnometer: [-0.52, 0.03, -0.05],
  "can-final": [0.42, 0.0235, 0.32],
  towel: [0.32, 0.004, 0.34],
  oven: [0.47, 0.09, -0.23],
  balance: [-0.50, 0.035, 0.16],
  reservoir: [0, 0.01, -0.03],
  assembly: [0, 0.04, -0.03],
  film: [-0.39, 0.007, 0.23],
  dial: [0.065, 0.225, -0.03],
  adjuster: [0, 0.28, -0.03],
};
export function createRingGeometry(
  inner = 0.03175,
  outer = 0.03475,
  height = 0.0254,
) {
  const pts = [
    new T.Vector2(inner, -height / 2),
    new T.Vector2(outer, -height / 2),
    new T.Vector2(outer, height / 2),
    new T.Vector2(inner, height / 2),
    new T.Vector2(inner, -height / 2),
  ];
  return new T.LatheGeometry(pts, 96);
}
export function specimenStackPositions(h) {
  const base = -0.0025;
  return {
    bottomStone: base + 0.005,
    bottomFilter: base + 0.0102,
    soil: base + 0.0104 + h / 2,
    ring: base + 0.0104 + 0.0254 / 2,
    topFilter: base + 0.0104 + h + 0.0002,
    topStone: base + 0.0108 + h + 0.005,
    cap: base + 0.0208 + h + 0.003,
  };
}
export function preparationGeometry(index) {
  const inserted = index >= 11,
    first = index >= 13,
    second = index >= 16,
    inverted = index >= 12 && index < 15;
  // The 5 mm lower projection is illustrative, not a chapter measurement.
  const shortProjectionM = 0.005,
    oppositeExcessM = 0.0762 - 0.0254 - shortProjectionM;
  const lengthM = second
    ? 0.0254
    : first
      ? 0.0762 - shortProjectionM
      : index >= 9
        ? 0.0762
        : 0.11;
  const bottomExcessM =
    inserted && !second
      ? index < 12
        ? shortProjectionM
        : index < 15
          ? oppositeExcessM
          : 0
      : 0;
  const topExcessM =
    inserted && !second
      ? index < 12
        ? oppositeExcessM
        : index === 12
          ? shortProjectionM
          : index >= 15
            ? oppositeExcessM
            : 0
      : 0;
  return {
    lengthM,
    radiusM: index >= 10 ? 0.03175 : 0.036,
    inserted,
    inverted,
    bottomExcessM,
    topExcessM,
    centerOffsetM: inserted ? (topExcessM - bottomExcessM) / 2 : 0,
  };
}
export function paringPose(t = 1) {
  const radiusM = 0.036 + (0.03175 - 0.036) * t;
  const ring = [-0.22, 0.0187, 0.12];
  const soil = [ring[0], ring[1] + 0.0127 + 0.0381, ring[2]];
  return { ring, soil, radiusM, lengthM: 0.0762,
    yaw: t * Math.PI * 4, bladeYaw: 0,
    blade: [soil[0], soil[1], soil[2] + radiusM + 0.007] };
}
const PREPARATION_IDS = [
  "weigh-tare",
  "measure-diameter",
  "measure-height",
  "extrude",
  "aliquot-tare",
  "aliquot-wet",
  "aliquot-dry",
  "measure-gs",
  "cut-segment",
  "pare-horizontal",
  "insert-gently",
  "invert-first",
  "cut-first",
  "support-glass",
  "invert-second",
  "cut-second",
  "weigh-wet",
  "remove-glass",
  "peel-wrap",
  "soak-stones",
  "bottom-stone",
  "bottom-filter",
  "place-ring",
  "top-filter",
  "top-stone",
  "lower-assembly",
  "flood",
  "center-cap",
  "adjust-contact",
  "zero-dial",
];
export function sceneMilestones(state = {}) {
  const done = new Set(
    (state.history || []).map((h) =>
      typeof h === "string" ? h : h.actionId || h.id || h.action,
    ),
  );
  const completed = PREPARATION_IDS.reduce(
    (ix, id, i) => (done.has(id) ? Math.max(ix, i + 1) : ix),
    0,
  );
  const index =
    completed || (state.phase === "preparation" ? (state.taskIndex ?? 0) : 30);
  const final =
    (state.phase === "final" || state.phase === "complete") && completed === 0;
  const reached = (id, i) => done.has(id) || index > i;
  const released =
    done.has("release-load") ||
    (final && (state.taskIndex > 0 || state.phase === "complete"));
  return {
    index,
    done,
    prepared: reached("cut-second", 15),
    lowered: reached("lower-assembly", 25),
    flooded: reached("flood", 26),
    capped: reached("center-cap", 27),
    engaged: reached("adjust-contact", 28) && !released,
    released,
    disassembled:
      done.has("disassemble") ||
      (final && (state.taskIndex >= 2 || state.phase === "complete")),
    transferred:
      done.has("transfer-soil") ||
      (final && (state.taskIndex >= 6 || state.phase === "complete")),
    oven:
      done.has("oven-place") ||
      (final && (state.taskIndex >= 7 || state.phase === "complete")),
    dry:
      done.has("dry-oven") ||
      (final && (state.taskIndex >= 8 || state.phase === "complete")),
  };
}
export function dragPayload(id, state = {}) {
  const ix = sceneMilestones(state).index;
  if (id === "assembly")
    return [
      "ring",
      "specimen",
      "stone-bottom",
      "filter-bottom",
      "filter-top",
      "stone-top",
    ];
  if (id === "stone-bottom" && ix === 19) return ["stone-bottom", "stone-top"];
  if (id === "glass" && ix === 17) return ["glass", "film"];
  if (id === "ring")
    return [
      "ring",
      ...(ix >= 11 ? ["specimen"] : []),
      ...(ix < 18 || state.phase === "final" ? ["glass", "film"] : []),
    ];
  return [id];
}
export function reservoirWaterSurface(heightM, initialHeightM = 0.0254) {
  return (
    0.069 +
    (Math.PI * 0.03175 ** 2 * (initialHeightM - heightM)) /
      (Math.PI * (0.0475 ** 2 - 0.03475 ** 2))
  );
}
export function dialContactGeometry(capY, engaged) {
  const contactY = capY + 0.003;
  return {
    contactY,
    leverY: contactY + 0.005,
    gapM: 0,
    ramBottomY: capY + 0.012 + (engaged ? 0 : 0.02),
  };
}
export function finalSoilGeometry(heightM, dry) {
  const radiusM = 0.032,
    solidsVolumeM3 = (Math.PI * 0.03175 ** 2 * 0.0254) / 1.816;
  // Loose dry clay has an illustrative 0.5 packing void ratio; not a measured result.
  const bulkVolumeM3 = dry
    ? solidsVolumeM3 * 1.5
    : Math.PI * 0.03175 ** 2 * heightM;
  return {
    radiusM,
    heightM: bulkVolumeM3 / (Math.PI * radiusM ** 2),
    bulkVolumeM3,
    solidsVolumeM3,
  };
}
export function visibleBounds(roots) {
  const bounds = new T.Box3();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible((o) => {
      if (!o.isMesh || o.userData.nonPhysical) return;
      o.geometry.computeBoundingBox();
      bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
  }
  return bounds;
}
export function capturePayload(objects) {
  return objects.map((object) => ({
    object,
    local: object.position.clone(),
    world: object.getWorldPosition(new T.Vector3()),
  }));
}
export function movePayload(payload, delta) {
  for (const item of payload) {
    const world = item.world.clone().add(delta);
    item.object.position.copy(
      item.object.parent ? item.object.parent.worldToLocal(world) : world,
    );
  }
}
export function restorePayload(payload) {
  for (const item of payload) item.object.position.copy(item.local);
}
function noiseTexture(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d");
  const data = c.createImageData(256, 256);
  let seed = 17;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = (seed >>> 24) / 255;
      let v =
        kind === "wood"
          ? 198 + 3 * Math.sin(y * 2.7) + 3 * n
          : kind === "clay"
            ? 170 + 35 * n
            : kind === "stone"
              ? 155 + 65 * n
              : 220 + 18 * n;
      const i = (y * 256 + x) * 4;
      data.data[i] = v;
      data.data[i + 1] = kind === "wood" ? v * 0.96 : v;
      data.data[i + 2] = kind === "wood" ? v * 0.87 : v * 0.98;
      data.data[i + 3] = 255;
    }
  c.putImageData(data, 0, 0);
  const tex = new T.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.colorSpace = T.SRGBColorSpace;
  tex.repeat.set(kind === "wood" ? 3 : 2, kind === "wood" ? 2 : 2);
  return tex;
}
function labelTexture(
  text,
  w = 512,
  h = 128,
  color = "#293d43",
  bg = "#f1eee4",
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = color;
  g.font = `600 ${Math.floor(h * 0.37)}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2, w * 0.93);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
export async function createLabScene(
  container,
  { onDrop, onHover, onRoam, onCancel, onError } = {},
) {
  if (!navigator.gpu)
    throw new Error(
      "WebGPU is unavailable. Open this laboratory in a WebGPU-enabled browser on localhost or HTTPS.",
    );
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter)
    throw new Error(
      "No WebGPU adapter is available. Enable hardware acceleration and restart your browser.",
    );
  const renderer = new T.WebGPURenderer({ antialias: true, forceWebGL: false });
  renderer._getFallback = null;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend)
    throw new Error(
      "Native WebGPU backend required; WebGL fallback is disabled.",
    );
  let deviceLost = false;
  renderer.backend.device.lost.then((info) => {
    deviceLost = true;
    onError?.(
      new Error(
        `WebGPU device lost (${info.reason}): ${info.message || "Reload the lab after restoring hardware acceleration."}`,
      ),
    );
  });
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive consolidation laboratory bench",
  );
  container.appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color("#d6dddc");
  scene.fog = new T.Fog("#d6dddc", 2.5, 7);
  const camera = new T.PerspectiveCamera(39, 1, 0.005, 20),
    target = new T.Vector3(-0.02, 0.085, 0.02);
  const home = new T.Vector3(0.8, 0.8, 1.12);
  camera.position.copy(home);
  camera.lookAt(target);
  scene.add(new T.HemisphereLight("#edf6ff", "#736a55", 2.3));
  const key = new T.DirectionalLight("#fff4df", 3.5);
  key.position.set(-0.65, 1.4, 0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -0.9;
  key.shadow.camera.right = 0.9;
  key.shadow.camera.top = 0.8;
  key.shadow.camera.bottom = -0.8;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 3;
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.001;
  scene.add(key);
  scene.add(key.target);
  const fill = new T.DirectionalLight("#c7e5ff", 1.4);
  fill.position.set(0.8, 0.7, -0.8);
  scene.add(fill);
  const mat = {
    wood: new T.MeshStandardMaterial({
      map: noiseTexture("wood"),
      roughness: 0.64,
    }),
    metal: new T.MeshStandardMaterial({
      color: "#bfc8cb",
      metalness: 0.85,
      roughness: 0.29,
    }),
    dark: new T.MeshStandardMaterial({
      color: "#263c43",
      metalness: 0.65,
      roughness: 0.34,
    }),
    clay: new T.MeshStandardMaterial({
      color: "#9d9e95",
      map: noiseTexture("clay"),
      roughness: 0.98,
    }),
    stone: new T.MeshStandardMaterial({
      color: "#c7bbaa",
      map: noiseTexture("stone"),
      roughness: 0.95,
    }),
    paper: new T.MeshStandardMaterial({ color: "#f9f5e8", roughness: 1 }),
    glass: new T.MeshPhysicalMaterial({
      color: "#c8e6e5",
      transparent: true,
      opacity: 0.25,
      roughness: 0.08,
      metalness: 0.1,
      side: T.DoubleSide,
      depthWrite: false,
    }),
    water: new T.MeshPhysicalMaterial({
      color: "#7cb8c3",
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      metalness: 0.14,
      side: T.DoubleSide,
      depthWrite: false,
    }),
    teal: new T.MeshStandardMaterial({
      color: "#42747a",
      roughness: 0.42,
      metalness: 0.3,
    }),
    black: new T.MeshStandardMaterial({ color: "#18272c", roughness: 0.6 }),
    white: new T.MeshStandardMaterial({ color: "#eceee8", roughness: 0.56 }),
    brass: new T.MeshStandardMaterial({
      color: "#bc9b57",
      metalness: 0.8,
      roughness: 0.28,
    }),
  };
  function mesh(g, m, p = [0, 0, 0], parent = scene) {
    const o = new T.Mesh(g, m);
    o.position.set(...p);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function box(w, h, d, m, p, parent) {
    return mesh(new T.BoxGeometry(w, h, d), m, p, parent);
  }
  function cyl(r, h, m, p, parent, r2 = r) {
    return mesh(new T.CylinderGeometry(r2, r, h, 64), m, p, parent);
  }
  function text(s, w = 0.1, h = 0.018, p = [0, 0, 0], parent = scene) {
    const o = mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshBasicMaterial({ map: labelTexture(s), transparent: true }),
      p,
      parent,
    );
    o.castShadow = false;
    o.userData.nonPhysical = true;
    return o;
  }
  box(1.36, 0.065, 0.88, mat.wood, [0, -0.035, 0]);
  box(1.38, 0.018, 0.9, mat.dark, [0, -0.074, 0]);
  for (const x of [-0.58, 0.58])
    for (const z of [-0.32, 0.32])
      box(0.055, 0.74, 0.055, mat.dark, [x, -0.45, z]);
  box(
    8,
    0.04,
    8,
    new T.MeshStandardMaterial({ color: "#b8c0bc", roughness: 0.9 }),
    [0, -0.84, 0],
  );
  const wall = box(
    8,
    3,
    0.05,
    new T.MeshStandardMaterial({ color: "#e1e6e0", roughness: 0.9 }),
    [0, 0.6, -1.2],
  );
  wall.receiveShadow = false;
  const shelf = box(2.3, 0.025, 0.2, mat.white, [-0.2, 0.72, -1.05]);
  shelf.castShadow = false;
  text("SOIL MECHANICS  /  MATERIALS LAB", 0.72, 0.095, [-0.3, 0.82, -1.169]);
  for (const x of [-0.55, -0.13, 0.26]) {
    box(0.17, 0.08, 0.075, mat.teal, [x, 0.78, -1.06]);
  }
  // Fixed load frame: rigid base, two columns, crosshead and axial load ram.
  const frame = new T.Group();
  scene.add(frame);
  frame.position.set(0, 0, -0.03);
  box(0.245, 0.016, 0.19, mat.dark, [0, 0.008, 0], frame);
  for (const x of [-0.091, 0.091]) {
    cyl(0.008, 0.31, mat.metal, [x, 0.17, 0], frame);
    cyl(0.013, 0.018, mat.dark, [x, 0.034, 0], frame);
    cyl(0.014, 0.012, mat.brass, [x, 0.3, 0], frame);
  }
  box(0.23, 0.035, 0.055, mat.teal, [0, 0.323, 0], frame);
  text("OEDOMETER", 0.115, 0.014, [0, 0.324, 0.028], frame);
  cyl(0.024, 0.075, mat.teal, [0, 0.274, 0], frame);
  cyl(0.026, 0.008, mat.metal, [0, 0.24, 0], frame);
  text("PRESSURE RAM", 0.083, 0.01, [0.048, 0.289, 0.029], frame);
  const hose = mesh(
    new T.TubeGeometry(
      new T.CatmullRomCurve3([
        new T.Vector3(0, 0.286, -0.024),
        new T.Vector3(-0.055, 0.272, -0.034),
        new T.Vector3(-0.112, 0.18, -0.015),
        new T.Vector3(-0.085, 0.165, 0.032),
      ]),
      32,
      0.0023,
      8,
      false,
    ),
    mat.black,
    [0, 0, 0],
    frame,
  );
  const ram = cyl(0.007, 0.15, mat.metal, [0, 0.185, 0], frame);
  const wheel = new T.Group();
  wheel.position.set(0, 0.36, 0);
  frame.add(wheel);
  const tor = mesh(
    new T.TorusGeometry(0.031, 0.003, 12, 48),
    mat.dark,
    [0, 0, 0],
    wheel,
  );
  tor.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const sp = box(0.062, 0.004, 0.004, mat.dark, [0, 0, 0], wheel);
    sp.rotation.y = (i * Math.PI) / 3;
  }
  cyl(0.007, 0.014, mat.brass, [0, 0, 0], wheel);
  // Load calibration pressure dial.
  const pressureFace = cyl(
    0.028,
    0.008,
    mat.dark,
    [-0.085, 0.16, 0.045],
    frame,
  );
  pressureFace.rotation.x = Math.PI / 2;
  const pf = text("0.0 tsf", 0.048, 0.014, [-0.085, 0.148, 0.05], frame);
  const pressureNeedle = new T.Group();
  pressureNeedle.position.set(-0.085, 0.166, 0.05);
  frame.add(pressureNeedle);
  box(0.001, 0.018, 0.001, mat.brass, [0, 0.007, 0], pressureNeedle);
  // Procedural dial face: 100 divisions, each 0.0001 inch, 100 turns read digitally.
  const dc = document.createElement("canvas");
  dc.width = dc.height = 512;
  const d = dc.getContext("2d");
  d.fillStyle = "#f6f3e8";
  d.fillRect(0, 0, 512, 512);
  d.translate(256, 256);
  for (let i = 0; i < 100; i++) {
    const a = (i * Math.PI) / 50;
    d.save();
    d.rotate(a);
    d.strokeStyle = "#263b41";
    d.lineWidth = i % 10 === 0 ? 4 : 2;
    d.beginPath();
    d.moveTo(0, -225);
    d.lineTo(0, i % 10 === 0 ? -197 : -211);
    d.stroke();
    d.restore();
    if (i % 10 === 0) {
      d.fillStyle = "#25363d";
      d.font = "27px sans-serif";
      d.textAlign = "center";
      d.textBaseline = "middle";
      d.fillText(String(i), Math.sin(a) * 170, -Math.cos(a) * 170);
    }
  }
  d.fillStyle = "#49646a";
  d.font = "22px sans-serif";
  d.textAlign = "center";
  d.fillText("0.0001 in/div", 0, 82);
  d.fillText("CONSOLIDATION", 0, 112);
  const dt = new T.CanvasTexture(dc);
  dt.colorSpace = T.SRGBColorSpace;
  const dialG = new T.Group();
  dialG.position.set(0.057, 0.225, 0.022);
  frame.add(dialG);
  const db = cyl(0.037, 0.016, mat.metal, [0, 0, 0], dialG);
  db.rotation.x = Math.PI / 2;
  mesh(
    new T.CircleGeometry(0.0345, 96),
    new T.MeshBasicMaterial({ map: dt }),
    [0, 0, 0.0085],
    dialG,
  );
  const needle = new T.Group();
  dialG.add(needle);
  box(
    0.0014,
    0.028,
    0.0007,
    new T.MeshBasicMaterial({ color: "#963d31" }),
    [0, 0.012, 0.0095],
    needle,
  );
  const hub = cyl(0.003, 0.003, mat.brass, [0, 0, 0.01], dialG);
  hub.rotation.x = Math.PI / 2;
  const plunger = box(0.004, 0.1, 0.004, mat.metal, [0, -0.086, 0], dialG);
  const contactLever = box(
    0.044,
    0.003,
    0.004,
    mat.metal,
    [-0.022, -0.15, 0],
    dialG,
  );
  const contactTip = cyl(0.002, 0.01, mat.brass, [-0.044, -0.155, 0], dialG);
  text("CONTACT LINKAGE", 0.07, 0.009, [0.053, 0.181, 0.031], frame);
  // Reservoir wall is an open annulus, not a filled solid cylinder.
  const reservoir = new T.Group();
  reservoir.position.set(0, 0.016, -0.03);
  scene.add(reservoir);
  const reservoirBase = cyl(0.057, 0.009, mat.metal, [0, 0.0045, 0], reservoir);
  mesh(
    createRingGeometry(0.048, 0.055, 0.056),
    mat.glass,
    [0, 0.037, 0],
    reservoir,
  );
  const waterLevel = cyl(0.0475, 0.042, mat.water, [0, 0.03, 0], reservoir);
  waterLevel.visible = false;
  const objects = new Map();
  function object(id) {
    const g = new T.Group();
    g.position.set(...BENCH_LAYOUT[id]);
    g.userData.id = id;
    scene.add(g);
    objects.set(id, g);
    return g;
  }
  const ring = object("ring");
  mesh(createRingGeometry(), mat.metal, [0, 0, 0], ring);
  const soil = object("specimen");
  const soilMesh = cyl(0.036, 0.0762, mat.clay, [0, 0, 0], soil);
  // Procedural witness overlays identify rigid rotation, not scratches or measured disturbance.
  const witnessMaterial = new T.MeshBasicMaterial({color: "#963d31"});
  const ringWitness = box(0.004, 0.0004, 0.007, witnessMaterial, [0.0328, 0.0129, 0], ring);
  const soilWitness = box(0.005, 0.0004, 0.012, witnessMaterial, [0, 0.0383, 0.018], soilMesh);
  ringWitness.userData.nonPhysical = soilWitness.userData.nonPhysical = true;
  const glass = object("glass");
  box(0.115, 0.003, 0.085, mat.glass, [0, 0, 0], glass);
  const film = object("film");
  box(0.109, 0.0006, 0.079, mat.glass, [0, 0, 0], film);
  const tube = object("shelby");
  mesh(createRingGeometry(0.039, 0.041, 0.15), mat.metal, [0, 0.044, 0], tube);
  tube.rotation.z = Math.PI / 2;
  const ts = text("SHELBY", 0.065, 0.015, [0, 0, 0.042], tube);
  for (const id of ["stone-bottom", "stone-top"]) {
    const g = object(id);
    cyl(0.0316, 0.01, mat.stone, [0, 0, 0], g);
    const pts = [];
    for (let i = 0; i < 220; i++) {
      const a = i * 2.39996,
        r = 0.029 * Math.sqrt(i / 220);
      pts.push(Math.cos(a) * r, 0.0051, Math.sin(a) * r);
    }
    const geom = new T.BufferGeometry();
    geom.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
    const dots = new T.Points(
      geom,
      new T.PointsMaterial({ color: "#8d887b", size: 0.0008 }),
    );
    g.add(dots);
  }
  for (const id of ["filter-bottom", "filter-top"])
    cyl(0.0315, 0.0004, mat.paper, [0, 0, 0], object(id));
  const cap = object("cap");
  cyl(0.03, 0.006, mat.metal, [0, 0, 0], cap);
  cyl(0.009, 0.01, mat.brass, [0, 0.007, 0], cap);
  const cutter = object("cutter");
  box(0.094, 0.002, 0.014, mat.metal, [0, 0, 0], cutter);
  box(0.045, 0.006, 0.022, mat.black, [-0.062, 0, 0], cutter);
  cutter.rotation.y = -0.2;
  const straight = object("straightedge");
  box(0.145, 0.002, 0.016, mat.metal, [0, 0, 0], straight);
  for (let i = 0; i < 14; i++) {
    box(
      0.0003,
      0.0003,
      0.004,
      mat.black,
      [-0.065 + i * 0.01, 0.0012, 0.005],
      straight,
    );
  }
  straight.rotation.y = 0.2;
  const cal = object("caliper");
  box(0.14, 0.004, 0.009, mat.metal, [0, 0, 0], cal);
  box(0.024, 0.012, 0.024, mat.dark, [-0.018, 0.006, 0], cal);
  const caliperText=text("—", 0.021, 0.009, [-0.018, 0.006, 0.0122], cal);
  for (const x of [-0.058, 0.011])
    box(0.007, 0.004, 0.045, mat.metal, [x, 0, -0.018], cal);
  const canLids = new Map();
  for (const id of ["can-initial", "can-final"]) {
    const can = object(id),
      final = id === "can-final",
      r = final ? 0.034 : 0.024,
      h = final ? 0.045 : 0.031;
    mesh(createRingGeometry(r, r + 0.002, h), mat.metal, [0, 0, 0], can);
    cyl(r, 0.002, mat.metal, [0, -h / 2 + 0.001, 0], can);
    canLids.set(id, cyl(r + 0.003, 0.003, mat.metal, [r + 0.01, -h / 2 + 0.001, 0.017], can));
    text(final ? "M-02" : "M-01", 0.03, 0.012, [0, 0.002, r + 0.002], can);
  }
  const finalCanSoil = cyl(
    0.032,
    0.023,
    mat.clay,
    [0, -0.002, 0],
    objects.get("can-final"),
  );
  finalCanSoil.visible = false;
  const beaker = object("water");
  mesh(createRingGeometry(0.034, 0.036, 0.095), mat.glass, [0, 0, 0], beaker);
  cyl(0.034, 0.05, mat.water, [0, -0.02, 0], beaker);
  cyl(0.036, 0.002, mat.glass, [0, -0.048, 0], beaker);
  for (let i = 0; i < 4; i++)
    box(
      0.015,
      0.001,
      0.001,
      mat.white,
      [0.004, -0.022 + i * 0.018, 0.036],
      beaker,
    );
  const pyc = object("pycnometer");
  cyl(0.024, 0.044, mat.glass, [0, 0, 0], pyc);
  cyl(0.012, 0.018, mat.glass, [0, 0.03, 0], pyc);
  cyl(0.012, 0.009, mat.black, [0, 0.044, 0], pyc);
  cyl(0.021, 0.032, mat.water, [0, -0.003, 0], pyc);
  const towel = object("towel");
  box(0.074, 0.002, 0.055, mat.paper, [0, 0, 0], towel);
  towel.rotation.y = 0.18;
  const balance = new T.Group();
  balance.position.set(...BENCH_LAYOUT.balance);
  scene.add(balance);
  box(0.2, 0.047, 0.145, mat.white, [0, 0, 0], balance);
  const pan = box(0.175, 0.004, 0.103, mat.metal, [0, 0.025, -0.009], balance);
  box(0.068, 0.017, 0.003, mat.black, [0.02, -0.004, 0.074], balance);
  const balanceText = text(
    "0.00 g",
    0.062,
    0.014,
    [0.02, -0.003, 0.076],
    balance,
  );
  text("PRECISION BALANCE", 0.095, 0.01, [-0.035, -0.016, 0.076], balance);
  const oven = object("oven");
  for (const x of [-0.104, 0.104])
    box(0.012, 0.17, 0.17, mat.white, [x, 0, 0], oven);
  for (const y of [-0.079, 0.079])
    box(0.22, 0.012, 0.17, mat.white, [0, y, 0], oven);
  box(0.22, 0.17, 0.01, mat.white, [0, 0, -0.08], oven);
  const ovenShelf = box(0.19, 0.005, 0.13, mat.metal, [0, -0.055, 0], oven);
  const ovenDoor = new T.Group();
  ovenDoor.position.set(-0.096, -0.012, 0.088);
  oven.add(ovenDoor);
  box(0.174, 0.122, 0.005, mat.dark, [0.087, 0, 0], ovenDoor);
  box(
    0.13,
    0.085,
    0.006,
    new T.MeshStandardMaterial({
      color: "#3b474a",
      metalness: 0.4,
      roughness: 0.18,
    }),
    [0.078, 0, 0.004],
    ovenDoor,
  );
  box(0.012, 0.064, 0.012, mat.metal, [0.154, 0, 0.012], ovenDoor);
  text("DRYING / 105°C", 0.14, 0.016, [0, 0.064, 0.088], oven);
  // Camera-local native WebGPU plane: its core border is the client hit zone.
  const drop=new T.Group();
  camera.add(drop);scene.add(camera);
  const cueCanvas=document.createElement('canvas');
  const cueTexture=new T.CanvasTexture(cueCanvas);
  const cue=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:cueTexture,color:'#ffb52e',transparent:true,opacity:.85,depthTest:false,depthWrite:false,toneMapped:false}));
  cue.renderOrder=10000;cue.frustumCulled=false;drop.add(cue);drop.visible=false;
  let cueSize='';
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  // Pickup annotation lives outside apparatus roots: never picked or measured.
  const sourceGlow=new T.Group();sourceGlow.userData.nonPhysical=true;scene.add(sourceGlow);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=128;
  const glowContext=glowCanvas.getContext('2d'),gradient=glowContext.createRadialGradient(64,64,30,64,64,64);
  gradient.addColorStop(0,'rgba(255,186,65,0)');gradient.addColorStop(.45,'rgba(255,186,65,.07)');gradient.addColorStop(.72,'rgba(255,186,65,.7)');gradient.addColorStop(1,'rgba(255,186,65,0)');
  glowContext.fillStyle=gradient;glowContext.fillRect(0,0,128,128);
  const pickupHalo=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:new T.CanvasTexture(glowCanvas),transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
  pickupHalo.userData.nonPhysical=true;pickupHalo.renderOrder=9998;camera.add(pickupHalo);
  let glowObject=null,glowEdges=[];
  function renderSourceGlow(now) {
    const expected=expectedObject(),available=!!expected?.visible && !!activeTask?.targetId && !roam && !drag && !motion && !parked && !pendingDrag && !actionCamera.busy();
    sourceGlow.visible=pickupHalo.visible=available;
    if(!available) return;
    if(glowObject!==expected) {
      for(const {line} of glowEdges){line.geometry.dispose();line.material.dispose();sourceGlow.remove(line);}
      glowObject=expected;glowEdges=[];
      expected.traverseVisible(mesh=>{
        if(!mesh.isMesh || mesh.userData.nonPhysical || mesh.userData.isLabel) return;
        const line=new T.LineSegments(new T.EdgesGeometry(mesh.geometry,30),new T.LineBasicMaterial({color:'#ffcb67',transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));
        line.matrixAutoUpdate=false;line.userData.nonPhysical=true;sourceGlow.add(line);glowEdges.push({mesh,line});
      });
    }
    for(const {mesh,line} of glowEdges){mesh.updateWorldMatrix(true,false);line.matrix.copy(mesh.matrixWorld);line.visible=mesh.visible;}
    const b=visibleBounds([expected]),center=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3()),p=center.clone().project(camera),r=el.getBoundingClientRect();
    const distance=center.distanceTo(camera.position),units=2*.5*Math.tan(T.MathUtils.degToRad(camera.fov/2));
    pickupHalo.position.set(p.x*units*camera.aspect/2,p.y*units/2,-.5);
    const diameter=Math.max(size.x,size.y,size.z),pixels=Math.max(32,diameter/(2*distance*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*r.height+20);
    pickupHalo.scale.set(pixels*units/r.height,pixels*units/r.height,1);
    pickupHalo.material.opacity=reducedMotion.matches ? .8 : .73+.12*Math.sin(now*.003);
  }
  const placards = [];
  function benchLabel(name, p, w = 0.105) {
    const m = text(name, w, 0.016, [p[0], 0.002, p[2] + 0.052]);
    m.rotation.x = -Math.PI / 2;
    placards.push(m);
    return m;
  }
  benchLabel("PREPARATION", [-0.27, 0, 0.15], 0.16);
  benchLabel("POROUS STONES", [0.16, 0, 0.24], 0.16);
  benchLabel("FILTER PAPERS", [0.16, 0, 0.33], 0.14);
  benchLabel("WATER", [0.43, 0, 0.18], 0.08);
  const ray = new T.Raycaster(),
    pointer = new T.Vector2(),
    plane = new T.Plane(new T.Vector3(0, 1, 0), -0.055),
    hit = new T.Vector3();
  ray.params.Points.threshold = 0.0005;
  wheel.userData.id = "adjuster";
  dialG.userData.id = "dial";
  let activeTask = null,
    drag = null,
    roam = false,
    yaw = 0,
    pitch = 0,
    cutaway = false,
    closeup = false,
    lastPointer = null,
    pressed = new Set(),
    lastTime = performance.now(),
    hoverId = null,
    currentState = {},
    animation = null,
    cameraTransition = null,
    telemetry = {};
  const closeHome = new T.Vector3(0.22, 0.28, 0.4),
    closeTarget = new T.Vector3(0.01, 0.13, -0.03);
  const targetPositions = {
    balance: pan.getWorldPosition(new T.Vector3()),
    ring: new T.Vector3(-0.22, 0.04, 0.12),
    trim: new T.Vector3(-0.22, 0.04, 0.12),
    reservoir: new T.Vector3(0, 0.06, -0.03),
    assembly: new T.Vector3(0.05, 0.06, 0.115),
    specimen: new T.Vector3(-0.22, 0.04, 0.12),
    cap: new T.Vector3(0, 0.065, -0.03),
    bench: new T.Vector3(-0.22, 0.04, 0.12),
    "can-final": new T.Vector3(0.42, 0.04, 0.32),
    oven: new T.Vector3(0.47, 0.1, -0.23),
  };
  let motion = null, parked = null, releasePose = null, stagedStone = null, pendingDrag = null;
  // Own the accepted physical release while operation framing readies seating.
  // Without this handoff, update() restores protocol poses before seat() runs.
  let releasedPayload = null;
  let savedContext=null,wholeBench=false;
  function contextualView(view,done) {
    if(roam)return;
    const station=view.station,roots=station==='balance' ? [balance] : station==='cell' ? [reservoir,wheel,dialG] : station==='oven' ? [oven] : station==='can-final' ? [objects.get('can-final'),soil] : station==='caliper' ? [cal,ring] : station==='assembly' ? [ring,objects.get('stone-bottom'),objects.get('stone-top'),objects.get('filter-bottom'),objects.get('filter-top')] : [ring,soil];
    if(view.mode==='prepare' && expectedObject()?.visible)roots.push(expectedObject());
    const b=visibleBounds(roots.filter(o=>o?.visible));
    // Framing the source/station alone loses distant landing patches (notably recovery).
    // Use the same actual destination as seating/pointer projection, including bare bench targets.
    const destination=isPortable(view.task) ? seatPolicy(view.task).destination : targetPositions[view.task?.targetId];
    if(destination){const margin=new T.Vector3(.05,.05,.05);b.expandByPoint(destination.clone().sub(margin));b.expandByPoint(destination.clone().add(margin));}
    if(station==='balance')b.max.y=Math.max(b.max.y,.18); // real raised payload remains visible above pan
    if(station==='trim')b.expandByScalar(.035);
    const aim=b.getCenter(new T.Vector3()),direction=new T.Vector3(.38,.64,1).normalize();
    const test=new T.PerspectiveCamera(camera.fov,camera.aspect,.001,20);test.position.copy(aim).add(direction);test.lookAt(aim);
    const inverse=test.quaternion.clone().invert(),half=Math.tan(T.MathUtils.degToRad(camera.fov/2));
    let distance=.28;
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
      const p=new T.Vector3(x,y,z).sub(aim).applyQuaternion(inverse);
      distance=Math.max(distance,p.z+Math.abs(p.x)/(half*camera.aspect*.75),p.z+Math.abs(p.y)/(half*.62));
    }
    const to=aim.clone().addScaledVector(direction,distance);
    wholeBench=false;closeup=true;
    cameraTransition={start:lastTime,from:camera.position.clone(),quaternion:camera.quaternion.clone(),to,aim,done};
    if(reducedMotion.matches){camera.position.copy(to);camera.lookAt(aim);cameraTransition=null;done();}
  }
  const actionCamera=createActionCamera({move:contextualView,cancelMove:()=>{cameraTransition=null;}});
  function clearUpperStone(done) {
    if(stagedStone || sceneMilestones(currentState).index!==20) {done();return true;}
    // Finish the illustrative soak before planning from the actual submerged pose.
    clearAnimation();
    const o=objects.get('stone-top'), payload=capturePayload([o]), start=payload[0].world.toArray(), bounds=boxData(visibleBounds([o]));
    const route=planCarry(bounds,start,BENCH_LAYOUT['stone-top'],-.0025,obstaclesFor(payload,[reservoir]));
    return startMotion(payload,route,()=>{stagedStone=capturePayload([o]);done();},{kind:'clear-stone'});
  }
  const boxData = b => ({min:b.min.toArray(),max:b.max.toArray()});
  const panSurfaceY = () => visibleBounds([pan]).max.y;
  const payloadObjects = task => dragPayload(task.objectId,currentState).map(id=>objects.get(id)).filter(o=>o?.visible);
  const PORTABLE = new Set(['remove-glass','bottom-stone','bottom-filter','place-ring','top-filter','top-stone','lower-assembly','center-cap','oven-place','aliquot-dry']);
  const isPortable = task => task?.targetId === 'balance' || PORTABLE.has(task?.id);
  const supportTop = id => visibleBounds([objects.get(id)]).max.y;
  function seatPolicy(task) {
    let destination=targetPositions[task.targetId].clone(), support=panSurfaceY(), contacts=[];
    const target=task.targetId;
    if(target==='balance') {destination.copy(pan.getWorldPosition(new T.Vector3()));return {destination,support,contacts};}
    const tops={'bottom-filter':'stone-bottom','place-ring':'filter-bottom','top-filter':'specimen','top-stone':'filter-top','center-cap':'stone-top','support-glass':'ring'};
    if(tops[task.id]) {
      const o=objects.get(tops[task.id]); destination.copy(o.getWorldPosition(new T.Vector3()));support=supportTop(tops[task.id]);
      if(task.id==='center-cap' && sceneMilestones(currentState).lowered) contacts=[reservoir];
    } else if(task.id==='bottom-stone') support=-.0025;
    else if(task.id==='lower-assembly') {support=visibleBounds([reservoirBase]).max.y;contacts=[reservoir];}
    else if(task.id==='remove-glass') {destination.set(...BENCH_LAYOUT.glass);support=-.0025;}
    else if(target==='bench') support=-.0025;
    else if(target==='oven') {destination.copy(objects.get('oven').getWorldPosition(new T.Vector3()));support=visibleBounds([ovenShelf]).max.y;contacts=[objects.get('oven')];}
    return {destination,support,contacts};
  }
  function supportFootprint(task) {
    const policy=seatPolicy(task);
    if(task.objectId==='assembly' && task.targetId==='bench') {
      // Assembly is a protocol alias, not an objects-map entry. Use every real
      // held layer, relative to its ring root, at the designated bench support.
      const roots=payloadObjects(task),bounds=visibleBounds(roots);
      if(bounds.isEmpty())return null;
      const origin=objects.get('ring').getWorldPosition(new T.Vector3());
      return {footprint:{shape:'rectangle',min:[bounds.min.x-origin.x,bounds.min.z-origin.z],max:[bounds.max.x-origin.x,bounds.max.z-origin.z]},
        matrix:new T.Matrix4().makeTranslation(policy.destination.x,policy.support,policy.destination.z),support:policy.support};
    }
    const tops={'bottom-filter':'stone-bottom','place-ring':'filter-bottom','top-filter':'specimen','top-stone':'filter-top','center-cap':'stone-top'};
    const root=objects.get(tops[task.id] || task.objectId);
    let surface=task.targetId==='balance' ? pan : task.targetId==='oven' ? ovenShelf : task.id==='lower-assembly' ? reservoirBase : null;
    if(!surface && root) root.traverseVisible(o=>{if(!surface && o.isMesh && !o.userData.nonPhysical) surface=o;});
    if(!surface) return null;
    surface.updateWorldMatrix(true,false);
    const geometry=surface.geometry;
    geometry.computeBoundingBox();
    const b=geometry.boundingBox, params=geometry.parameters;
    const footprint=geometry.type==='CylinderGeometry' ? {shape:'circle',center:[0,0],radius:params.radiusTop} :
      {shape:'rectangle',min:[b.min.x,b.min.z],max:[b.max.x,b.max.z]};
    const matrix=surface.matrixWorld.clone();
    // Bare-bench tasks have a designated landing patch sized from their real payload.
    if(!tops[task.id] && !['balance','oven'].includes(task.targetId) && task.id!=='lower-assembly')
      matrix.setPosition(policy.destination.x,policy.support,policy.destination.z);
    return {footprint,matrix,support:policy.support};
  }
  function updateDropMarker(task) {
    dropZone=destinationZone(task);
  }
  function renderDropCue(now) {
    dropZone=drag ? destinationZone(drag.task) : null;
    drop.visible=!!drag && !!dropZone && !roam;
    if(!drop.visible) {if(drag) onHover?.(null);return;}
    const z=dropZone,r=el.getBoundingClientRect(),pad=8,w=z.width+pad*2,h=z.height+pad*2;
    const key=`${w.toFixed(2)}:${h.toFixed(2)}`;
    if(key!==cueSize) {
      cueSize=key;cueCanvas.width=Math.ceil(w*2);cueCanvas.height=Math.ceil(h*2);
      const ctx=cueCanvas.getContext('2d');ctx.scale(cueCanvas.width/w,cueCanvas.height/h);
      ctx.strokeStyle='white';ctx.lineWidth=3.5;ctx.shadowColor='white';ctx.shadowBlur=9;
      ctx.strokeRect(pad+1.75,pad+1.75,z.width-3.5,z.height-3.5);
      ctx.shadowBlur=0;ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(pad+3.5,pad+3.5,z.width-7,z.height-7);
      cueTexture.needsUpdate=true;
    }
    const units=2*.5*Math.tan(T.MathUtils.degToRad(camera.fov/2))/r.height;
    drop.position.set(((z.left+z.right)/2-r.left-r.width/2)*units,-((z.top+z.bottom)/2-r.top-r.height/2)*units,-.5);
    cue.scale.set(w*units,h*units,1);
    const inside=containsClientPoint(z,drag.client),style=cueStyle({inside,reducedMotion:reducedMotion.matches,now});
    cue.material.color.set(style.color);cue.material.opacity=style.opacity;
    if(inside) onHover?.('Release here');
    else if(drag.blocked) onHover?.('Blocked by equipment: move around it.');
    else onHover?.('Drag into the amber destination zone');
  }
  let dropZone=null,lastDropIntent=null;
  function destinationZone(task) {
    if(!task?.targetId) return null;
    const tops={'bottom-filter':'stone-bottom','place-ring':'filter-bottom','top-filter':'specimen','top-stone':'filter-top','center-cap':'stone-top','support-glass':'ring'};
    const root=task.targetId==='balance' ? balance : task.targetId==='oven' ? oven : task.targetId==='reservoir' ? reservoir : objects.get(tops[task.id] || task.targetId);
    const r=renderer.domElement.getBoundingClientRect(),points=[];
    const project=p=>{p.project(camera);points.push({x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,z:p.z});};
    camera.updateMatrixWorld();
    if(root && !drag?.payload.some(p=>p.object===root)) {
      root.updateWorldMatrix(true,true);
      root.traverseVisible(o=>{
        if(!o.isMesh || o.userData.nonPhysical || drag?.payload.some(p=>p.object===o)) return;
        const a=o.geometry.getAttribute('position');
        for(let i=0;i<a.count;i++)project(new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld));
      });
    } else {
      // Designated bare-bench/trim patch derives its size from the physical payload.
      const support=supportFootprint(task);
      if(support) {
        const f=support.footprint;
        const vertices=f.shape==='circle' ? Array.from({length:64},(_,i)=>[f.radius*Math.cos(i*Math.PI/32),f.radius*Math.sin(i*Math.PI/32)]) : [[f.min[0],f.min[1]],[f.max[0],f.min[1]],[f.max[0],f.max[1]],[f.min[0],f.max[1]]];
        for(const [x,z] of vertices){const p=new T.Vector3(x,0,z).applyMatrix4(support.matrix);p.y=support.support;project(p);}
      }
    }
    return zoneFromPoints(points,r);
  }
  function sourceContacts(task) {
    if(['bottom-stone','top-stone'].includes(task.id)) return [reservoir];
    return [];
  }
  function obstaclesFor(payload, excluded = []) {
    const list=[];
    for(const root of [...objects.values(),balance,frame,reservoir]) {
      if(payload.some(p=>p.object===root) || excluded.includes(root)) continue;
      root.updateWorldMatrix(true,true);
      root.traverseVisible(o=> {
        if(!o.isMesh || o.userData.nonPhysical || o===waterLevel) return;
        const boxes=[];
        if(o===hose) {
          const vertices=o.geometry.getAttribute('position');
          for(let segment=0;segment<32;segment++) {
            const b=new T.Box3();
            for(let i=segment*9;i<(segment+2)*9;i++) b.expandByPoint(new T.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(o.matrixWorld));
            boxes.push(b);
          }
        } else boxes.push(visibleBounds([o]));
        for(const b of boxes) if(!b.isEmpty()) list.push({...boxData(b),owner:root.userData.id || (root===balance?'balance':root===frame?'frame':'reservoir')});
      });
    }
    return list;
  }
  function startMotion(payload, route, done, {kind='seat',origin=payload}={}) {
    if(!route.ok) { onHover?.(route.message); return false; }
    motion={payload,route,done,origin,kind,start:lastTime,duration:900,phase:kind+'-lift'};
    return true;
  }
  function seat(task, placement, done) {
    if(motion || drag) return false;
    if(!isPortable(task)) return false;
    if(task.id==='bottom-stone' && !stagedStone) return clearUpperStone(()=>seat(task,placement,done));
    clearAnimation();
    const payload=capturePayload(payloadObjects(task)), lead=payload[0];
    releasedPayload=null;
    if(!lead) return false;
    const start=lead.world.toArray(), bounds=boxData(visibleBounds(payload.map(p=>p.object)));
    releasePose=start.slice();
    const origin=placement?.originPayload || payload;
    const policy=seatPolicy(task);
    const obstacle=obstaclesFor(payload,sourceContacts(task));
    let route;
    if(task.id==='remove-glass' && !placement) {
      const side=[-.33,start[1],start[2]],delta=side.map((v,i)=>v-start[i]),relative=translated(bounds,start.map(v=>-v));
      route=planCarry(translated(bounds,delta),side,policy.destination.toArray(),policy.support,obstacle);
      if(route.ok && sweptClear(relative,start,side,obstacle)) route.points.unshift(start);
      else route={ok:false,message:'Support plate extraction blocked.'};
    } else if(task.targetId==='oven') {
      const portal=[policy.destination.x,start[1],.07];
      route=planCarry(bounds,start,portal,policy.support,obstacle,{ceilingY:.205});
      if(route.ok) {
        const end=[policy.destination.x,policy.support+start[1]-bounds.min[1],policy.destination.z];
        const relative=translated(bounds,start.map(v=>-v));
        if(sweptClear(relative,route.points.at(-1),end,obstacle)) route.points.push(end);
        else route={ok:false,message:'Oven opening blocked; keep the door open.'};
      }
    } else route=planCarry(bounds,start,policy.destination.toArray(),policy.support,obstacle,{seatObstacles:obstaclesFor(payload,[...sourceContacts(task),...policy.contacts]),ceilingY:.205});
    if(!route.ok) restorePayload(origin);
    return startMotion(payload,route,()=>{
      if(task.targetId==='balance' || task.id==='aliquot-dry') parked={payload:capturePayload(payload.map(p=>p.object)),origin,supportY:policy.support,container:task.targetId==='oven'};
      const world=lead.object.getWorldPosition(new T.Vector3());
      const finalPlacement={objectId:task.objectId,targetId:task.targetId,center:{x:world.x,z:world.z},target:{x:policy.destination.x,z:policy.destination.z}};
      if(!validatePlacement(task,finalPlacement).ok) {restorePayload(origin);return;}
      if(placement?.intent) finalPlacement.intent={...placement.intent};
      if(placement?.clientIntent) finalPlacement.clientIntent=placement.clientIntent;
      if(placement?.releasedPose) finalPlacement.releasedPose=placement.releasedPose;
      if(task.id==='top-stone') stagedStone=null;
      done(finalPlacement);
    },{origin});
  }
  function returnParked(done) {
    if(!parked || motion) return false;
    const saved=parked, payload=capturePayload(saved.payload.map(p=>p.object)), start=payload[0].world.toArray();
    const bounds=boxData(visibleBounds(payload.map(p=>p.object))), end=saved.origin[0].world.toArray();
    const originalBounds=translated(bounds,end.map((v,i)=>v-start[i]));
    let route;
    if(saved.container) {
      const portal=[start[0],start[1],.07], delta=portal.map((v,i)=>v-start[i]),relative=translated(bounds,start.map(v=>-v));
      route=planCarry(translated(bounds,delta),portal,end,originalBounds.min[1],obstaclesFor(payload));
      if(route.ok && sweptClear(relative,start,portal,obstaclesFor(payload))) route.points.unshift(start);
      else route={ok:false,message:'Return blocked at oven opening.'};
    } else route=planCarry(bounds,start,end,originalBounds.min[1],obstaclesFor(payload));
    return startMotion(payload,route,()=>{parked=null; done();},{kind:'return',origin:saved.payload});
  }
  function cancelHandling(reset=false,roamValue=null) {
    cancelDrag();
    if(releasedPayload) restorePayload(releasedPayload.origin);
    releasedPayload=null;
    if(motion) restorePayload(motion.origin);
    motion=null;
    if(reset) {parked=null;stagedStone=null;releasePose=null;lastDropIntent=null;clearAnimation();}
    // Cancel physical work and readiness together; no discarded seating callback
    // may strand the coordinator or later commit through Main's generation.
    if(roamValue!==null)actionCamera.setRoam(roamValue);
    else if(reset)actionCamera.reset();
    else actionCamera.abort();
    onCancel?.();
  }
  function translateDrag() {
    const requested=drag.requested.clone(); requested.y=drag.carryY;
    const delta=requested.clone().sub(drag.start);
    if(sweptClear(drag.bounds,drag.delta.toArray(),delta.toArray(),drag.obstacles)) {
      drag.delta.copy(delta); drag.blocked=false;
    } else {drag.blocked=true;onHover?.('Blocked by equipment: move around it.');}
    movePayload(drag.payload,drag.delta);
  }
  function advanceHandling(now) {
    if(drag?.portable) {
      const t=Math.min(1,(now-drag.liftStart)/180);
      const lift=new T.Vector3(...sampleRoute(drag.pickup,t));
      movePayload(drag.payload,lift);
      if(t===1) {
        drag.phase='carry';
        translateDrag();
      }
    }
    if(!motion) return;
    const m=motion, t=Math.min(1,Math.max(0,(now-m.start)/m.duration));
    const p=sampleRoute(m.route,t);
    m.phase=m.kind+'-'+(t<1/(m.route.points.length-1)?'lift':t>=(m.route.points.length-2)/(m.route.points.length-1)?'lower':'transfer');
    movePayload(m.payload,new T.Vector3(...p).sub(m.payload[0].world));
    if(t===1) {motion=null;m.done();}
  }
  function scaleLayout() {
    const b=boxData(visibleBounds([balance]));
    const footprintOverlaps=[...objects].filter(([,o])=>o.visible && !protectedObject(o)).filter(([,o])=>{
      const a=boxData(visibleBounds([o]));
      return [0,2].every(i=>a.min[i]<b.max[i] && a.max[i]>b.min[i]);
    }).map(([id])=>id);
    const occluded=p=>{
      const direction=p.clone().sub(camera.position),distance=direction.length();
      const test=new T.Raycaster(camera.position,direction.normalize());
      return test.intersectObject(tube,true).some(h=>h.distance<distance-1e-5);
    };
    return {position:balance.position.toArray(),bounds:b,panTubeOccluded:occluded(pan.getWorldPosition(new T.Vector3())),displayTubeOccluded:occluded(balanceText.getWorldPosition(new T.Vector3())),footprintOverlaps};
  }
  function ndc(e) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
  }
  function pick(e) {
    ndc(e);
    const hits = ray.intersectObjects(
      [...objects.values(), wheel, dialG],
      true,
    );
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.id) o = o.parent;
      if (
        o &&
        o.visible &&
        !(
          activeTask?.objectId?.startsWith("stone-") &&
          o.userData.id === "reservoir"
        )
      )
        return o;
    }
    return null;
  }
  function expectedObject() {
    return activeTask?.objectId === "assembly"
      ? objects.get("ring")
      : activeTask?.objectId === "adjuster"
        ? wheel
        : activeTask?.objectId === "dial"
          ? dialG
          : objects.get(activeTask?.objectId);
  }
  const el = renderer.domElement;
  function beginDrag(e) {
    if (roam) {
      lastPointer = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      return;
    }
    if(motion || actionCamera.busy()) {onHover?.('Handling in progress: wait before dragging.');return;}
    if(parked) {onHover?.('Drag disabled while parked: use Return assembly to bench.');return;}
    if(activeTask?.id==='bottom-stone' && !stagedStone) {
      pendingDrag={down:e,last:e};
      clearUpperStone(()=>{const pending=pendingDrag;pendingDrag=null;if(pending){beginDrag(pending.down);moveDrag(pending.last);}});return;
    }
    const o = pick(e),
      expected = expectedObject();
    if (!o || o !== expected || !activeTask?.targetId) return;
    actionCamera.freeze();
    clearAnimation();
    const payload = capturePayload(
      dragPayload(activeTask.objectId, currentState)
        .map((id) =>
          id === "adjuster" ? wheel : id === "dial" ? dialG : objects.get(id),
        )
        .filter(Boolean),
    );
    drag = {
      object: o,
      start: o.getWorldPosition(new T.Vector3()),
      payload,
      pointerId: e.pointerId,
      task: activeTask,
      client:{x:e.clientX,y:e.clientY},
    };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
    plane.constant = -(isPortable(activeTask) ? seatPolicy(activeTask).support : Math.max(drag.start.y, 0.055));
    ndc(e);
    ray.ray.intersectPlane(plane, hit);
    drag.offset = drag.start.clone().sub(hit);
    drag.portable=isPortable(activeTask);
    if(drag.portable) {
      const grabbed=ray.intersectObject(o,true).find(h=>h.object.visible)?.point;
      if(grabbed) {drag.offset.x=drag.start.x-grabbed.x;drag.offset.z=drag.start.z-grabbed.z;}
      drag.bounds=boxData(visibleBounds(payload.map(p=>p.object)));
      drag.obstacles=obstaclesFor(payload,sourceContacts(activeTask));
      // Carry below overhead frame, but above portable bench equipment and scale.
      const lowEquipment=drag.obstacles.filter(o=>!['frame','oven'].includes(o.owner) && o.max[1]<.15);
      const bottom=Math.max(seatPolicy(activeTask).support,...lowEquipment.map(o=>o.max[1]))+CLEARANCE_M;
      drag.carryY=bottom+drag.start.y-drag.bounds.min[1];
      const lift=[0,drag.carryY-drag.start.y,0];
      const side=activeTask.id==='remove-glass' ? [-.33-drag.start.x,0,0] : [0,0,0];
      const high=[side[0],lift[1],side[2]];
      drag.pickup={ok:true,points:[[0,0,0],side,high]};
      if(!sweptClear(drag.bounds,[0,0,0],side,drag.obstacles) || !sweptClear(drag.bounds,side,high,drag.obstacles)) {
        cancelDrag(); onHover?.('Blocked pickup: clear the equipment first.'); return;
      }
      drag.liftStart=lastTime;drag.phase='lift';drag.requested=drag.start.clone();
      drag.delta=new T.Vector3(...high);
    }
    dropZone=destinationZone(activeTask);
    drop.visible = !!dropZone;
  }
  el.addEventListener("pointerdown", beginDrag);
  function moveDrag(e) {
    if(pendingDrag) {pendingDrag.last=e;return;}
    if (roam && lastPointer) {
      yaw -= (e.clientX - lastPointer.x) * 0.004;
      pitch = Math.max(
        -1.3,
        Math.min(1.3, pitch - (e.clientY - lastPointer.y) * 0.004),
      );
      lastPointer = { x: e.clientX, y: e.clientY };
      return;
    }
    if (drag) {
      drag.client={x:e.clientX,y:e.clientY};
      ndc(e);
      if (ray.ray.intersectPlane(plane, hit)) {
        if(drag.portable) {drag.requested.copy(hit).add(drag.offset);if(drag.phase==='carry') translateDrag();}
        else if(!['adjuster','dial'].includes(drag.task.objectId)) movePayload(drag.payload, hit.clone().add(drag.offset).sub(drag.start));
      }
      return;
    }
    const o = pick(e);
    hoverId = o?.userData.id ?? null;
    onHover?.(hoverId);
    el.style.cursor =
      !parked && !motion && o === expectedObject() && activeTask?.targetId ? "grab" : "default";
  }
  el.addEventListener("pointermove", moveDrag);
  el.addEventListener("pointerup", (e) => {
    pendingDrag=null;
    if (roam) {
      lastPointer = null;
      return;
    }
    if (!drag) return;
    moveDrag(e);
    const task = drag.task,
      p = isPortable(task) ? seatPolicy(task).destination : targetPositions[task?.targetId],
      world = ['adjuster','dial'].includes(task.objectId) ? hit.clone().add(drag.offset) : drag.object.getWorldPosition(new T.Vector3());
    const placement = {
      objectId: task.objectId,
      targetId: task.targetId,
      center: { x: world.x, z: world.z },
      target: p ? { x: p.x, z: p.z } : null,
    };
    // Cursor intent is independent of root/grip offset or a blocked direct sweep.
    const result={ok:containsClientPoint(dropZone=destinationZone(task),{x:e.clientX,y:e.clientY}),message:'Drop inside the highlighted destination zone; placement restored.'};
    const saved=drag;
    const actualRelease=saved.object.getWorldPosition(new T.Vector3()).toArray();
    if(!result.ok || !saved.portable) restorePayload(saved.payload);
    if(saved.portable) placement.intent={x:hit.x,z:hit.z};
    placement.clientIntent={x:e.clientX,y:e.clientY,zone:{...dropZone}};
    placement.releasedPose=actualRelease;
    if(!saved.portable) {
      placement.intentOnly=true;
      delete placement.center;
    }
    lastDropIntent={objectId:task.objectId,targetId:task.targetId,accepted:result.ok,intentOnly:!saved.portable,clientIntent:placement.clientIntent,releasedPose:actualRelease};
    placement.originPayload=saved.payload;
    if(result.ok && saved.portable) releasedPayload={payload:saved.payload,origin:saved.payload};
    drag = null;
    el.style.cursor = "default";
    drop.visible = false;
    if (result.ok) {onHover?.(null);onDrop?.(task.objectId, task.targetId, placement);}
    else onHover?.(result.message);
  });
  function cancelDrag() {
    pendingDrag=null;
    if (drag) {restorePayload(drag.payload);onHover?.(null);}
    drag = null;
    lastPointer = null;
    drop.visible = false;
  }
  el.addEventListener("pointercancel", () => cancelHandling());
  function setRoam(value) {
    if(value && !roam)savedContext={position:camera.position.clone(),quaternion:camera.quaternion.clone()};
    roam = value;
    // Restore selected context first. The coordinator then retains a committed
    // dwell or prepares the actual pending task from that restored pose.
    if(!roam && savedContext){camera.position.copy(savedContext.position);camera.quaternion.copy(savedContext.quaternion);}
    cancelHandling(false,value);
    lastPointer = null;
    pressed.clear();
    if (roam) {
      const euler = new T.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      yaw = euler.y;
      pitch = euler.x;
    }
    onRoam?.(roam);
  }
  function toggleCloseup() {
    if(drag || pendingDrag || actionCamera.busy())return closeup;
    wholeBench=!wholeBench;closeup=!wholeBench;
    if (!roam && wholeBench) {
      actionCamera.freeze();
      cameraTransition = {
        start: lastTime,
        from: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        to: home.clone(),aim:target.clone(),
      };
    } else if(!roam) {actionCamera.reset();actionCamera.request(activeTask);}
    return closeup;
  }
  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input,select,textarea")) return;
    if (e.code === "KeyP") {
      e.preventDefault();
      setRoam(!roam);
    }
    if (
      roam &&
      ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(e.code)
    ) {
      e.preventDefault();
      pressed.add(e.code);
    }
  });
  window.addEventListener("keyup", (e) => pressed.delete(e.code));
  window.addEventListener("blur", () => {
    pressed.clear();
    lastPointer = null;
  });
  function setTask(t) {
    activeTask = t;
    actionCamera.request(t);
    const p = isPortable(t) ? seatPolicy(t).destination : targetPositions[t?.targetId];
    if (p) {
      updateDropMarker(t);
      drop.visible = !!drag;
    }
    const expected = expectedObject();
    for (const o of [...objects.values(), wheel, dialG])
      o.traverse((m) => {
        if (m.isMesh && m.material?.emissive) {
          if (!m.userData.highlightMaterial) {
            m.material = m.material.clone();
            m.userData.highlightMaterial = true;
          }
          m.material.emissive.setHex(0);
        }
      });
    if (expected)
      expected.traverse((m) => {
        if (m.isMesh && m.material?.emissive)
          m.material.emissive.setHex(0x152722);
      });
  }
  function protectedObject(o) {
    return drag?.payload.some((item) => item.object === o) || releasedPayload?.payload.some(item=>item.object===o) || motion?.payload.some(item=>item.object===o) || parked?.payload.some(item=>item.object===o) || stagedStone?.some(item=>item.object===o);
  }
  function pose(id, p) {
    const o = objects.get(id);
    if (!protectedObject(o)) o.position.set(...p);
  }
  function displayText(o, value) {
    if (o.userData.value !== value) {
      o.material.map.dispose();
      o.material.map = labelTexture(value);
      o.material.needsUpdate = true;
      o.userData.value = value;
    }
  }
  function update(state) {
    currentState = state;
    clearAnimationPose();
    const m = sceneMilestones(state),
      ix = m.index,
      prep = preparationGeometry(ix),
      height = state.model?.heightM ?? 0.0254;
    const stack = m.lowered && !m.disassembled,
      positions = specimenStackPositions(height);
    // The tare plate remains physically underneath the ring. Both wrapped surfaces travel together.
    pose(
      "glass",
      ix < 18 || m.disassembled ? [-0.22, 0.003, 0.12] : BENCH_LAYOUT.glass,
    );
    pose(
      "film",
      ix < 18 || m.disassembled ? [-0.22, 0.0048, 0.12] : [-0.30, 0.0008, 0.21],
    );
    glass.visible = true;
    film.visible = ix < 19 || m.disassembled;
    film.rotation.z = 0;
    film.rotation.x = 0;
    const base =
      prep.inserted && !m.prepared ? 0.006 + prep.bottomExcessM : 0.006;
    if (ix === 14) {
      pose("glass", [-0.22, base + 0.0254 + 0.0015, 0.12]);
      pose("film", [-0.22, base + 0.0254 - 0.0003, 0.12]);
    }
    pose("ring", [-0.22, base + 0.0127, 0.12]);
    pose("specimen", [
      prep.inserted ? -0.22 : -0.31,
      prep.inserted
        ? base + 0.0127 + prep.centerOffsetM
        : 0.006 + prep.lengthM / 2,
      0.12,
    ]);
    if (ix === 9 || ix === 10) {
      const pared = paringPose(ix === 9 ? 0 : 1);
      pose("ring", pared.ring);
      pose("specimen", pared.soil);
    }
    ring.rotation.y = soil.rotation.y = 0;
    ring.rotation.z = prep.inverted ? Math.PI : 0;
    soil.rotation.z = prep.inverted ? Math.PI : 0;
    soilMesh.scale.set(
      prep.radiusM / 0.036,
      prep.lengthM / 0.0762,
      prep.radiusM / 0.036,
    );
    soil.visible = ix >= 4 && !m.transferred;
    for (const id of [
      "stone-bottom",
      "stone-top",
      "filter-bottom",
      "filter-top",
      "cap",
      "can-final",
    ])
      pose(id, BENCH_LAYOUT[id]);
    // Both soaked stones stay submerged until their respective assembly steps.
    if (ix >= 20 && !m.lowered) {
      if (ix <= 20) pose("stone-bottom", [0, 0.033, -0.03]);
      if (ix <= 24) pose("stone-top", [0, 0.046, -0.03]);
    }
    for (const [threshold, id, k] of [
      [20, "stone-bottom", "bottomStone"],
      [21, "filter-bottom", "bottomFilter"],
      [22, "ring", "ring"],
      [22, "specimen", "soil"],
      [23, "filter-top", "topFilter"],
      [24, "stone-top", "topStone"],
    ]) {
      if (!m.lowered && ix > threshold) pose(id, [0.05, positions[k], 0.115]);
    }
    if (stack) {
      for (const [id, k] of [
        ["ring", "ring"],
        ["specimen", "soil"],
        ["stone-bottom", "bottomStone"],
        ["filter-bottom", "bottomFilter"],
        ["filter-top", "topFilter"],
        ["stone-top", "topStone"],
      ])
        pose(id, [0, positions[k] + 0.0275, -0.03]);
      if (m.capped) pose("cap", [0, positions.cap + 0.0275, -0.03]);
      soilMesh.scale.set(0.03175 / 0.036, height / 0.0762, 0.03175 / 0.036);
      ring.rotation.z = soil.rotation.z = 0;
    }
    if (m.disassembled) {
      pose("ring", [-0.22, 0.006 + 0.0127, 0.12]);
      pose("specimen", [-0.22, 0.006 + height / 2, 0.12]);
      soilMesh.scale.set(0.03175 / 0.036, height / 0.0762, 0.03175 / 0.036);
      ring.rotation.z = soil.rotation.z = 0;
    }
    // Open can contains all final solids, goes inside the opening oven, then returns for weighing.
    const canSoil = finalSoilGeometry(height, m.dry);
    finalCanSoil.visible = m.transferred;
    finalCanSoil.scale.y = canSoil.heightM / 0.023;
    finalCanSoil.position.y = -0.0205 + canSoil.heightM / 2;
    if (m.oven && !m.dry) pose("can-final", [0.47, 0.061, -0.23]);
    if (m.dry) pose("can-final", BENCH_LAYOUT["can-final"]);
    canLids.get("can-final").position.set(...(m.dry ? [0, 0.045 / 2 + 0.003 / 2, 0] : [0.044, -0.045 / 2 + 0.001, 0.017]));
    ovenDoor.rotation.y = m.oven && !m.dry ? 0 : -Math.PI * 0.62;
    const surface = reservoirWaterSurface(height),
      soaking = ix >= 20 && !m.lowered;
    waterLevel.visible = (stack && m.flooded) || soaking;
    const waterTop = soaking ? 0.054 : surface,
      waterBottom = 0.025;
    waterLevel.scale.y = (waterTop - waterBottom) / 0.042;
    waterLevel.position.y = (waterTop + waterBottom) / 2 - 0.016;
    ring.visible = !(cutaway && stack);
    if (cutaway && stack) {
      for (const id of ["stone-top", "filter-top", "cap"])
        if (!protectedObject(objects.get(id)))
          objects.get(id).position.x = 0.16;
      waterLevel.visible = false;
    }
    // True-scale axial contact: a sliding dial plunger bears on the cap through a labelled linkage.
    const linked = stack && m.capped,
      contact = dialContactGeometry(cap.position.y, m.engaged);
    plunger.visible =
      contactLever.visible =
      contactTip.visible =
        linked && !cutaway;
    if (linked) {
      const leverLocal =
        contact.leverY - dialG.getWorldPosition(new T.Vector3()).y;
      contactLever.position.y = leverLocal;
      contactTip.position.y = leverLocal;
      const upper = -0.035,
        length = Math.max(0.01, upper - leverLocal);
      plunger.scale.y = length / 0.1;
      plunger.position.y = (upper + leverLocal) / 2;
    }
    const ramBottom = linked && m.engaged ? contact.ramBottomY : 0.215,
      ramTop = 0.242;
    ram.scale.y = Math.max(0.01, ramTop - ramBottom) / 0.15;
    ram.position.y = (ramTop + ramBottom) / 2;
    ram.visible = !cutaway;
    const pressureTsf = appliedLoad(state).pressureTsf;
    pressureNeedle.rotation.z =
      Math.PI * 0.7 - (pressureTsf / 16) * Math.PI * 1.4;
    displayText(pf, `${pressureTsf.toFixed(1)} tsf`);
    needle.rotation.z =
      ((-(state.model?.dialDivisions ?? 0) % 100) * Math.PI) / 50;
    targetPositions.assembly.set(
      m.lowered ? 0 : 0.05,
      m.lowered ? positions.ring + 0.0275 : positions.ring,
      m.lowered ? -0.03 : 0.115,
    );
    targetPositions.ring.copy(ring.position);
    targetPositions.specimen.copy(soil.position);
    targetPositions.cap.copy(cap.position);
    const p = isPortable(activeTask) ? seatPolicy(activeTask).destination : targetPositions[activeTask?.targetId];
    if (p) updateDropMarker(activeTask);
    const mass = balanceMeasurement(state);
    displayText(balanceText, mass ? `${mass.value.toFixed(2)} g` : "— g");
    const caliper=caliperMeasurement(state);
    displayText(caliperText,caliper ? caliper.value.toFixed(2) : '—');
    telemetry = {
      caliperReadout:caliper ? `${caliper.value.toFixed(2)} mm` : '— mm',
      balanceReadout: balanceText.userData.value,
      balanceMeasurement: mass,
      ringY: ring.position.y,
      topStoneY: objects.get("stone-top").position.y,
      capY: cap.position.y,
      waterSurfaceY: waterTop,
      waterVisible: waterLevel.visible,
      dialContactGapM: linked ? contact.gapM : null,
      ramBottomY: ramBottom,
      loadEngaged: m.engaged,
      pressureTsf,
      preparation: prep,
      assembled: ix >= 25,
      stack,
      finalCanContainsSoil: m.transferred,
      objectPositions: Object.fromEntries(
        [...objects].map(([id, o]) => [id, o.position.toArray()]),
      ),
      dragPayload: drag?.payload.map((item) => item.object.userData.id) || [],
    };
  }
  // Every pose is based on the last update, never accumulated per render; seeks and replacement are safe.
  function clearAnimationPose() {
    if (animation?.poses) {
      for (const p of animation.poses) {
        p.object.position.copy(p.position);
        p.object.quaternion.copy(p.quaternion);
        p.object.visible = p.visible;
        p.object.scale.copy(p.scale);
      }
      animation.poses = null;
    }
  }
  function clearAnimation() {
    clearAnimationPose();
    animation = null;
  }
  function animateAction(id) {
    if(/weigh/.test(id)) {
      if(!parked && !motion) seat({id,objectId:id==='weigh-can'||id==='weigh-dry'?'can-final':'ring',targetId:'balance'},null,()=>{});
      return id;
    }
    clearAnimation();
    animation = { id, start: lastTime, poses: null, fraction: null };
    return id;
  }
  function actionPose(o) {
    if (!o || protectedObject(o)) return false;
    if (!animation.poses.some((p) => p.object === o))
      animation.poses.push({
        object: o,
        position: o.position.clone(),
        quaternion: o.quaternion.clone(),
        visible: o.visible,
        scale: o.scale.clone(),
      });
    return true;
  }
  function heightForBlot() {
    return currentState.model?.heightM ?? 0.0254;
  }
  function applyAnimation(now) {
    clearAnimationPose();
    if (!animation || drag) return;
    const duration = animation.id === "pare-horizontal" ? 2400 : animation.id === "blot" ? 3200 : animation.id === "weigh-dry" ? 1800 : 650;
    const t = animation.fraction ?? (now - animation.start) / duration;
    if (t < 0 || t >= 1) {
      animation = null;
      return;
    }
    animation.poses = [];
    const a = Math.sin(Math.PI * t),
      id = animation.id,
      prep = preparationGeometry(sceneMilestones(currentState).index);
    if (id === "pare-horizontal") {
      const p = paringPose(t);
      for (const [o, position] of [[ring, p.ring], [soil, p.soil], [cutter, p.blade]])
        if (actionPose(o)) o.position.set(...position);
      ring.rotation.y = soil.rotation.y = p.yaw;
      cutter.rotation.set(0, p.bladeYaw, 0);
      soilMesh.scale.set(p.radiusM / 0.036, p.lengthM / 0.0762, p.radiusM / 0.036);
    } else if (/cut/.test(id)) {
      const tool =
        id === "cut-first" || id === "cut-second" ? straight : cutter;
      if (actionPose(tool)) {
        tool.position.copy(soil.position);
        tool.position.y += prep.lengthM / 2;
        tool.position.z += 0.045 * (2 * t - 1);
        tool.rotation.y = 0;
      }

    } else if (/invert/.test(id)) {
      const pivot = ring.position.clone(),
        angle = (1 - t) * Math.PI,
        lift = 0.08 * a + (id === "invert-second" ? 0.0254 * (1 - t) : 0);
      for (const o of [
        ring,
        soil,
        ...(id === "invert-second" ? [glass, film] : []),
      ])
        if (actionPose(o)) {
          o.position
            .sub(pivot)
            .applyAxisAngle(new T.Vector3(0, 0, 1), angle)
            .add(pivot);
          o.position.y += lift;
          o.rotation.z += angle;
        }
    } else if (id === "blot") {
      const towel = objects.get("towel"),
        angle = t < 0.35 ? 0 : t < 0.55 ? Math.PI * (t - 0.35) / 0.2 : t < 0.85 ? Math.PI : Math.PI * (1 - t) / 0.15,
        pivot = soil.position.clone(),
        lift = 0.065 * Math.min(1, t / 0.1, (1 - t) / 0.1);
      for (const o of [ring, soil]) if (actionPose(o)) {
        o.position.sub(pivot).applyAxisAngle(new T.Vector3(0,0,1),angle).add(pivot);
        o.position.y += lift;
        o.rotation.z = angle;
      }
      if (actionPose(towel)) {
        const contact = t < 0.35 || (t >= 0.55 && t < 0.85);
        towel.rotation.set(0,0,0);
        towel.scale.set(0.52,1,0.7);
        towel.position.copy(soil.position);
        towel.position.y += heightForBlot() / 2 + 0.001 + (contact ? 0 : 0.045);
      }
    } else if (id === "support-glass") {
      if (actionPose(glass))
        glass.position.lerpVectors(
          new T.Vector3(...BENCH_LAYOUT.glass),
          glass.position.clone(),
          t,
        );
    } else if (id === "lower-assembly") {
      const destination = ring.position.clone(),
        source = new T.Vector3(0.05, destination.y - 0.016, 0.115),
        delta = source.sub(destination).multiplyScalar(1 - t);
      for (const id of dragPayload("assembly", currentState)) {
        const o = objects.get(id);
        if (actionPose(o)) o.position.add(delta);
      }
    } else if (id === "insert-gently") {
      if (actionPose(soil)) soil.position.y += 0.025 * (1 - t);
    } else if (id === "peel-wrap") {
      if (actionPose(film)) {
        film.visible = true;
        film.position.y += 0.045 * a;
        film.rotation.z = a * 0.7;
      }
    } else if (id === "flood") {
      if (actionPose(beaker)) {
        beaker.position.set(0.065, 0.11, -0.03);
        beaker.rotation.z = -0.65 * a;
      }
      if (actionPose(waterLevel)) {
        waterLevel.position.y -= 0.015 * (1 - t);
      }
    } else if (/contact|release-load|zero-dial/.test(id)) {
      if (actionPose(wheel)) wheel.rotation.y = a * 0.7;
    } else if (id === "center-cap") {
      if (actionPose(cap)) cap.position.y += 0.025 * (1 - t);
    } else if (id === "extrude") {
      if (actionPose(tube)) tube.position.x -= 0.025 * a;
    } else if (id === "transfer-soil") {
      if (actionPose(soil)) {
        soil.visible = true;
        soil.position.lerp(objects.get("can-final").position, t);
      }
    } else if (id === "oven-place") {
      if (actionPose(ovenDoor)) ovenDoor.rotation.y = -Math.PI * 0.62 * (1 - t);
      const can = objects.get("can-final");
      if (actionPose(can))
        can.position.lerpVectors(
          new T.Vector3(...BENCH_LAYOUT["can-final"]),
          can.position.clone(),
          t,
        );
    } else if (id === "soak-stones") {
      for (const id of ["stone-bottom", "stone-top"]) {
        const o = objects.get(id);
        if (actionPose(o))
          o.position.lerpVectors(
            new T.Vector3(...BENCH_LAYOUT[id]),
            o.position.clone(),
            t,
          );
      }
    }
  }

  function resize() {
    const r = container.getBoundingClientRect();
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  function render(now) {
    const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.05));
    lastTime = now;
    if (roam) {
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      const f = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const r = new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const v = 0.38 * dt;
      if (pressed.has("KeyW")) camera.position.addScaledVector(f, v);
      if (pressed.has("KeyS")) camera.position.addScaledVector(f, -v);
      if (pressed.has("KeyD")) camera.position.addScaledVector(r, v);
      if (pressed.has("KeyA")) camera.position.addScaledVector(r, -v);
      if (pressed.has("KeyQ")) camera.position.y -= v;
      if (pressed.has("KeyE")) camera.position.y += v;
      camera.position.y = Math.max(0.015, camera.position.y);
    }
    if (cameraTransition && !roam) {
      const p = Math.max(0, Math.min(1, (now - cameraTransition.start) / 550)),
        e = p * p * (3 - 2 * p);
      camera.position.copy(cameraTransition.to);
      camera.lookAt(cameraTransition.aim || target);
      const q = camera.quaternion.clone();
      camera.position.lerpVectors(
        cameraTransition.from,
        cameraTransition.to,
        e,
      );
      camera.quaternion.slerpQuaternions(cameraTransition.quaternion, q, e);
      if (p === 1) {const done=cameraTransition.done;cameraTransition = null;done?.();}
    }
    applyAnimation(now);
    advanceHandling(now);
    actionCamera.tick(now);
    renderDropCue(now);
    renderSourceGlow(now);
    if (deviceLost) return;
    try {
      renderer.render(scene, camera);
    } catch (err) {
      onError?.(err);
    }
  }
  let projectedGrab = null;
  const screen = (p) => {
    p = p.clone().project(camera);
    const r = el.getBoundingClientRect();
    return {
      x: r.left + ((p.x + 1) * r.width) / 2,
      y: r.top + ((1 - p.y) * r.height) / 2,
    };
  };
  const projectObject = (id) => {
    const o =
      id === "assembly"
        ? ring
        : objects.get(id) ||
          (id === "dial" ? dialG : id === "adjuster" ? wheel : null);
    if (!o) return null;
    const candidates = [];
    if (o === ring) candidates.push(o.localToWorld(new T.Vector3(0.034, 0, 0)));
    else candidates.push(o.getWorldPosition(new T.Vector3()));
    o.traverse((mesh) => {
      if (mesh.isMesh && mesh.visible) {
        const a = mesh.geometry.getAttribute("position");
        for (
          let i = 0;
          i < a.count;
          i += Math.max(1, Math.floor(a.count / 160))
        )
          candidates.push(
            mesh.localToWorld(new T.Vector3().fromBufferAttribute(a, i)),
          );
      }
    });
    for (const p of candidates) {
      const xy = screen(p);
      if (pick({ clientX: xy.x, clientY: xy.y }) === o) {
        projectedGrab = { object: o, local: o.worldToLocal(p.clone()) };
        return xy;
      }
    }
    return null;
  };
  const projectTarget = (
    id,
    { offsetXM = 0, offsetZM = 0, forDrag = true } = {},
  ) => {
    const p = (isPortable(activeTask) && activeTask.targetId===id ? seatPolicy(activeTask).destination : targetPositions[id])?.clone();
    if (!p) return null;
    p.x += offsetXM;
    p.z += offsetZM;
    if(!forDrag && isPortable(activeTask) && activeTask.targetId===id) p.y=seatPolicy(activeTask).support;
    if (forDrag && drag) {
      p.y = -plane.constant;
      p.x -= drag.offset.x; p.z -= drag.offset.z;
    } else if (forDrag) {
      const o = expectedObject();
      if (o) {
        const start = o.getWorldPosition(new T.Vector3()),
          grab =
            projectedGrab?.object === o
              ? o.localToWorld(projectedGrab.local.clone())
              : o.userData.id === "ring"
                ? o.localToWorld(new T.Vector3(0.034, 0, 0))
                : start.clone();
        const dragPlane = new T.Plane(
          new T.Vector3(0, 1, 0),
          -(isPortable(activeTask) ? seatPolicy(activeTask).support : Math.max(start.y, 0.055)),
        );
        const grabRay = new T.Ray(
            camera.position.clone(),
            grab.clone().sub(camera.position).normalize(),
          ),
          h = new T.Vector3();
        if(isPortable(activeTask)) {
          p.y=seatPolicy(activeTask).support;
          p.x-=start.x-grab.x;p.z-=start.z-grab.z;
        } else if (grabRay.intersectPlane(dragPlane, h)) {
          p.y = start.y;
          p.sub(start.clone().sub(h));
        }
      }
    }
    p.project(camera);
    const r = el.getBoundingClientRect();
    return {
      x: r.left + ((p.x + 1) * r.width) / 2,
      y: r.top + ((1 - p.y) * r.height) / 2,
    };
  };
  return {
    renderer,
    scene,
    camera,
    render,
    update,
    setTask,
    setRoam,
    animateAction,
    isPortable,
    seat,
    returnParked,
    cancelHandling,
    handlingBusy: () => !!motion || actionCamera.busy(),
    actionBlocked: () => roam || !!drag || !!pendingDrag || !!motion || actionCamera.busy(),
    prepareAction: (task,done)=>{if(roam || drag || pendingDrag || motion)return false;actionCamera.begin(task,done);return true;},
    abortAction: ()=>cancelHandling(),
    completeAction: (task)=>actionCamera.complete(lastTime,isPortable(task)?0:task.id==='pare-horizontal'?2400:task.id==='blot'?3200:650),
    resetCamera: ()=>actionCamera.reset(),
    isWholeBench: ()=>wholeBench,
    prepareTaskView: ()=>{actionCamera.reset();actionCamera.request(activeTask);},
    hasParked: () => !!parked,
    handlingFrame(fraction) {
      if (animation) animation.fraction = Math.max(0, Math.min(1, fraction));
      update(currentState);
      render(lastTime);
      return this.inspect();
    },
    toggleCloseup,
    debugPick(x, y) {
      ndc({ clientX: x, clientY: y });
      return {
        rect: el.getBoundingClientRect().toJSON(),
        ray: {
          origin: ray.ray.origin.toArray(),
          direction: ray.ray.direction.toArray(),
        },
        hits: ray
          .intersectObjects([...objects.values(), wheel, dialG], true)
          .slice(0, 6)
          .map((h) => ({
            id: h.object.parent.userData.id,
            point: h.point.toArray(),
            distance: h.distance,
          })),
        ring: objects.get("ring").position.toArray(),
      };
    },
    toggleCutaway() {
      cutaway = sceneMilestones(currentState).index >= 25 ? !cutaway : false;
      return cutaway;
    },
    projectObject,
    projectTarget,
    layerPoints() {
      return [
        "stone-bottom",
        "filter-bottom",
        "specimen",
        "filter-top",
        "stone-top",
      ].map((id) => ({
        id,
        ...screen(objects.get(id).getWorldPosition(new T.Vector3())),
      }));
    },
    inspect() {
      return {
        ...telemetry,
        actionCamera:{phase:actionCamera.state.phase,station:actionCamera.state.view?.station,mode:actionCamera.state.view?.mode,moving:!!cameraTransition,pose:[...camera.position.toArray(),...camera.quaternion.toArray()],wholeBench},
        sourceGlow: {visible:sourceGlow.visible && pickupHalo.visible,objectId:glowObject?.userData.id,physical:false,native:true},
        panSurfaceY: panSurfaceY(),
        dropMarker: {visible:drop.visible,zone:dropZone ? {...dropZone} : null,style:{color:'#'+cue.material.color.getHexString(),opacity:cue.material.opacity},native:true,textureSize:[cueCanvas.width,cueCanvas.height]},
        dropIntent:lastDropIntent,
        solidBounds: obstaclesFor([]),
        mountedControls: {adjuster:wheel.getWorldPosition(new T.Vector3()).toArray(),dial:dialG.getWorldPosition(new T.Vector3()).toArray()},
        scaleLayout: scaleLayout(),
        worldBounds: Object.fromEntries([...objects].map(([id,o])=>[id,boxData(visibleBounds([o]))])),
        handling: {busy:!!motion || actionCamera.busy(),phase:motion?.phase || drag?.phase || (parked?'parked':'idle'),blocked:drag?.blocked||false,requested:drag?.requested?.toArray(),delta:drag?.delta?.toArray(),parked:parked?.payload.map(p=>p.object.userData.id)||[],releasePose,route:motion?.route.points||null},
        backend: deviceLost
          ? "lost"
          : renderer.backend.isWebGPUBackend
            ? "WebGPU"
            : "invalid",
        deviceLost,
        adapter: adapter.info?.description || adapter.info?.architecture,
        roam,
        cutaway,
        closeup,
        animation: animation?.id ?? null,
        rotationWitness: {
          ring: ringWitness.getWorldPosition(new T.Vector3()).toArray(),
          soil: soilWitness.getWorldPosition(new T.Vector3()).toArray(),
        },
        finalCanLid: {
          localCenter: canLids.get("can-final").position.toArray(),
          worldCenter: canLids.get("can-final").getWorldPosition(new T.Vector3()).toArray(),
          covered: canLids.get("can-final").position.x === 0,
        },
        soilRadiusM: 0.036 * soilMesh.scale.x,
        soilHeightM: 0.0762 * soilMesh.scale.y,
        objectRotations: Object.fromEntries([...objects].map(([id,o]) => [id,[o.rotation.x,o.rotation.y,o.rotation.z]])),
        objects: objects.size,
        calls: renderer.info.render.calls,
        dialContactGapM: contactTip.visible
          ? contactTip.getWorldPosition(new T.Vector3()).y -
            0.005 -
            (cap.position.y + 0.003)
          : null,
        objectPositions: Object.fromEntries(
          [...objects].map(([id, o]) => [id, o.position.toArray()]),
        ),
        dragPayload: drag?.payload.map((item) => item.object.userData.id) || [],
      };
    },
  };
}
