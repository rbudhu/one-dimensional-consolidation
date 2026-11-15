import { test, expect } from "@playwright/test";
import { READING_MINUTES, PRESSURES_TSF } from "../src/physics.js";
import { PREPARATION } from "../src/procedure.js";
test("native WebGPU laboratory boots cleanly and P restores bench view", async ({
  page,
}) => {
  const contexts = [],
    requests = [];
  page.on("request", (r) =>
    requests.push({ url: r.url(), type: r.resourceType() }),
  );
  await page.addInitScript(() => {
    window.__contextKinds = [];
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      window.__contextKinds.push(kind);
      return get.call(this, kind, ...args);
    };
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?qa");
  await expect(page.locator("#gpu-status")).toHaveText("WebGPU · native", {
    timeout: 30000,
  });
  expect(await page.evaluate(() => window.__lab.inspect().backend)).toBe(
    "WebGPU",
  );
  // Backend initialization precedes the first real canvas draw.
  await page.waitForFunction(() => window.__contextKinds.includes("webgpu"));
  const kinds = await page.evaluate(() => window.__contextKinds);
  expect(kinds).toContain("webgpu");
  expect(kinds.some((v) => /webgl/.test(v))).toBe(false);
  expect(
    requests.some((r) => ["image", "media", "font"].includes(r.type)),
  ).toBe(false);
  expect(requests.every((r) => r.url.startsWith("http://127.0.0.1:"))).toBe(
    true,
  );
  await page.keyboard.press("p");
  await expect(page.locator("#roam-hint")).toBeVisible();
  await page.keyboard.press("p");
  await expect(page.locator("#roam-hint")).toBeHidden();
  expect(errors).toEqual([]);
});
test("real pointer drag records empty-ring tare and advances protocol", async ({
  page,
}) => {
  await page.goto("/?qa");
  await expect(page.locator("#gpu-status")).toHaveText("WebGPU · native", {
    timeout: 30000,
  });
  const { object, target } = await page.evaluate(() => ({
    object: window.__lab.projectObject("ring"),
    target: window.__lab.projectTarget("balance"),
  }));
  await page.mouse.move(object.x, object.y);
  await page.mouse.down();
  await page.waitForFunction(()=>window.__lab.inspect().handling.phase==='carry');
  await page.mouse.move(target.x, target.y, { steps: 25 });
  await page.mouse.up();
  await expect(page.locator("#task-title")).toContainText("diameter");
});
test("complete experiment captures all stages, oven drying and coherent notebook percentages", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__inputTrace = [];
    for (const type of ["pointerdown", "pointerup", "click"])
      document.addEventListener(
        type,
        (e) => {
          window.__inputTrace.push({
            type,
            target: e.target.id,
            x: e.clientX,
            y: e.clientY,
            task: document.querySelector("#task-title")?.textContent,
          });
          if (window.__inputTrace.length > 15) window.__inputTrace.shift();
        },
        true,
      );
  });
  await page.goto("/?qa");
  await expect(page.locator("#gpu-status")).toHaveText("WebGPU · native", {
    timeout: 30000,
  });
  for (let i = 0; i < PREPARATION.length; i++) {
    await expect(page.locator("#task-title")).toHaveText(PREPARATION[i].title);
    await page.locator("#perform-action").click();
    await expect(page.locator("#task-title"))
      .not.toHaveText(PREPARATION[i].title)
      .catch(async (error) => {
        console.log(
          "INPUT_DIAGNOSTIC",
          JSON.stringify(
            await page.evaluate(() => ({
              trace: window.__inputTrace,
              bounds: document
                .querySelector("#perform-action")
                .getBoundingClientRect()
                .toJSON(),
              state: window.__lab.inspect(),
            })),
          ),
        );
        throw error;
      });
  }
  await page.locator("#notebook-open").click();
  await page.locator('[data-tab="time"]').click();
  await page.locator('[data-tab="pressure"]').click();
  await page.locator("#close-notebook").click();
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < READING_MINUTES.length; j++) {
      await expect(page.locator("#record-reading")).toBeEnabled();
      await page.locator("#record-reading").click();
    }
    if (i === 0) {
      await page.screenshot({ path: "reports/screenshots/loaded.png" });
      await page.locator("#cutaway").click();
      await expect(page.locator("#layer-leaders line")).toHaveCount(5);
      await expect(page.locator("#layer-leaders")).toBeVisible();
      await expect(page.locator("#pore-panel")).toContainText("Average");
      await page.screenshot({ path: "reports/screenshots/cutaway.png" });
      await page.locator("#cutaway").click();
    }
    await expect(page.locator("#next-increment")).toBeEnabled();
    await page.locator("#next-increment").click();
  }
  await expect(page.locator("#stress")).toHaveText("47.88");
  expect(await page.evaluate(() => window.__lab.inspect().pressureTsf)).toBe(
    0.5,
  );
  for (let i = 0; i < 9; i++) {
    await expect(page.locator("#perform-action")).toBeEnabled();
    await page.locator("#perform-action").click();
    if (i === 0) {
      await expect(page.locator("#stress")).toHaveText("0.00");
      await expect
        .poll(() => page.evaluate(() => window.__lab.inspect().pressureTsf))
        .toBe(0);
    }
  }
  await expect(page.locator("#task-title")).toHaveText("Experiment complete");
  expect(await page.evaluate(() => window.__lab.inspect().readings)).toBe(
    READING_MINUTES.length * PRESSURES_TSF.length,
  );
  await page.locator("#notebook-open").click();
  await page.locator('[data-tab="measurements"]').click();
  await expect(page.locator(".metric").first()).toContainText("30.000");
  await page.screenshot({ path: "reports/screenshots/notebook.png" });
  await page.locator('[data-tab="pressure"]').click();
  await expect(
    page.locator("td").filter({ hasText: "pending dry mass" }),
  ).toHaveCount(0);
  await expect(page.locator(".plot")).toBeVisible();
  await page.locator('[data-tab="time"]').click();
  await expect(page.locator(".plot")).toBeVisible();
  await page.locator("#primary-start").selectOption("2");
  await page.locator("#early-time").selectOption("0.5");
  await page.locator("#primary-end").selectOption("30");
  await page.locator("#secondary-start").selectOption("480");
  await page.locator("#d0").fill("0");
  await page.locator("#d0").dispatchEvent("change");
  await page.locator("#secondary-a").selectOption("13");
  await page.locator("#nb-stage").selectOption("1");
  await page.locator("#primary-start").selectOption("8");
  await page.locator("#nb-stage").selectOption("0");
  await expect(page.locator("#primary-start")).toHaveValue("2");
  await expect(page.locator("#secondary-a")).toHaveValue("13");
  await expect(page.locator("#early-time")).toHaveValue("0.5");
  await expect(page.locator("#primary-end")).toHaveValue("30");
  await expect(page.locator("#secondary-start")).toHaveValue("480");
  await expect(page.locator("#secondary-end")).toHaveValue("1440");
  await expect(page.locator("#secondary-b")).toHaveValue("14");
  await expect(page.locator("#d0")).toHaveValue("0.00");
  await expect(page.locator(".plot")).toContainText("D₀");
  await expect(page.locator(".plot")).toContainText("t₅₀");
  await page.screenshot({ path: "reports/screenshots/time-labelled.png" });
  await page.locator('[data-tab="pressure"]').click();
  await page.locator("#virgin-a").selectOption("2");
  await page.locator("#reload-branch").selectOption("loading");
  await page.locator("#tangent").fill("-.08");
  await page.locator("#tangent").dispatchEvent("change");
  await expect(page.locator(".plot")).toContainText("Pc");
  const overlap = await page.evaluate(() => {
    const a = document
        .querySelector('[data-marker="Curvature"]')
        .getBoundingClientRect(),
      b = document.querySelector('[data-marker="Pc"]').getBoundingClientRect();
    return (
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom
    );
  });
  expect(overlap).toBe(false);
  await page.screenshot({ path: "reports/screenshots/pressure-labelled.png" });
  const download = page.waitForEvent("download");
  await page.locator("#export-csv").click();
  const file = await download;
  await file.saveAs("reports/consolidation-lab-readings.csv");
  const text = await (
    await import("node:fs/promises")
  ).readFile(await file.path(), "utf8");
  const shared = await page.evaluate(() => window.__lab.analysis());
  expect(text).toContain(
    "pressure.virgin.index," + shared.pressure.virgin.index,
  );
  expect(text).toContain(
    "pressure.reload.index," + shared.pressure.reload.index,
  );
  expect(text).toContain("pressure.pc," + shared.pressure.pc);
  expect(text).toContain("stages.0.controls.primaryStart,2");
  expect(text).toContain("stages.0.controls.secondaryA,13");
  expect(text).toContain("stages.0.alpha," + shared.stages[0].alpha);
  expect(errors).toEqual([]);
});
test("native procedural audio is audible, finite and exactly silent when muted", async ({
  page,
}) => {
  await page.goto("/?qa");
  await expect(page.locator("#gpu-status")).toHaveText("WebGPU · native", {
    timeout: 30000,
  });
  for (const type of ["place", "cut", "water", "load", "read", "oven"]) {
    const a = await page.evaluate(
      (type) => window.__lab.renderAudio(type, false),
      type,
    );
    expect(a.finite).toBe(true);
    expect(a.peak).toBeGreaterThan(0.005);
    expect(a.peak).toBeLessThanOrEqual(1);
    expect(a.rms).toBeGreaterThan(0.0001);
    const muted = await page.evaluate(
      (type) => window.__lab.renderAudio(type, true),
      type,
    );
    expect(muted.peak).toBe(0);
  }
});
test("short desktop layout keeps scene and controls within page bounds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto("/?qa");
  await expect(page.locator("#gpu-status")).toHaveText("WebGPU · native", {
    timeout: 30000,
  });
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scene: document.querySelector("#scene").getBoundingClientRect().toJSON(),
    action: document
      .querySelector("#perform-action")
      .getBoundingClientRect()
      .toJSON(),
  }));
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
  expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.height);
  expect(bounds.scene.bottom).toBeLessThanOrEqual(bounds.height + 1);
  expect(bounds.action.bottom).toBeLessThanOrEqual(bounds.height + 1);
});
