import { test, expect } from "@playwright/test";
async function boot(page) {
  await page.goto("/?qa");
  await expect(page.locator("#gpu-status")).toHaveText("WebGPU · native", {
    timeout: 30000,
  });
}
async function actions(page, n) {
  for (let i = 0; i < n; i++) await page.locator("#perform-action").click();
}
test("outside displayed ring destination zone is rejected with whole payload restored", async ({
  page,
}) => {
  await boot(page);
  await actions(page, 22);
  await page.waitForFunction(() => window.__lab.inspect().animation === null && !window.__lab.inspect().handling.busy);
  const before = await page.evaluate(
    () => window.__lab.inspect().objectPositions,
  );
  const p = await page.evaluate(() => ({
    object: window.__lab.projectObject('ring'),
  }));
  await page.mouse.move(p.object.x, p.object.y);
  await page.mouse.down();
  await page.waitForFunction(()=>window.__lab.inspect().handling.phase==='carry');
  const target = await page.evaluate(() => {
    const z = window.__lab.inspect().dropMarker.zone;
    return { x: z.left - 1, y: (z.top + z.bottom) / 2 };
  });
  await page.mouse.move(target.x, target.y, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator("#task-title")).toHaveText("Place specimen ring");
  const after = await page.evaluate(
    () => window.__lab.inspect().objectPositions,
  );
  for (const id of ["ring", "specimen"]) expect(after[id]).toEqual(before[id]);
});
test("dry aliquot balance shows measured 22.5 g rather than 960 minutes", async ({
  page,
}) => {
  await boot(page);
  await actions(page, 7);
  await expect
    .poll(() => page.evaluate(() => window.__lab.inspect().balanceReadout))
    .toBe("22.50 g");
});
test("delayed real audio resume cannot apply old input after roam", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        this.suspend();
      }
    };
    const resume = Native.prototype.resume;
    window.__resumeWait = [];
    AudioContext.prototype.resume = function () {
      return resume
        .call(this)
        .then(
          () => new Promise((resolve) => window.__resumeWait.push(resolve)),
        );
    };
  });
  await boot(page);
  await page.locator("#perform-action").click();
  await page.waitForFunction(() => window.__resumeWait.length > 0);
  await page.keyboard.press("p");
  const task = await page.evaluate(() => window.__lab.inspect().task);
  await page.evaluate(() => window.__resumeWait.splice(0).forEach((r) => r()));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__lab.inspect().task)).toBe(task);
});
test("notebook stage selections and manual ordinates reset with experiment", async ({
  page,
}) => {
  await boot(page);
  await actions(page, 30);
  await page.locator("#notebook-open").click();
  await page.locator('[data-tab="time"]').click();
  await page.locator("#d100").fill("1234");
  await page.locator("#d100").dispatchEvent("change");
  await page.locator("#close-notebook").click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#restart").click();
  await page.locator("#notebook-open").click();
  await page.locator('[data-tab="time"]').click();
  await expect(page.locator("#d100")).not.toHaveValue("1234.00");
});

async function drag(page, id, target, options = {}) {
  await page.waitForFunction(() => window.__lab.inspect().animation === null && !window.__lab.inspect().handling.busy);
  const p = await page.evaluate(
    ({ id, target, options }) => ({
      object: window.__lab.projectObject(id),
      target: window.__lab.projectTarget(target, {forDrag:false,...options}),
    }),
    { id, target, options },
  );
  expect(p.object).not.toBeNull();
  await page.mouse.move(p.object.x, p.object.y);
  await page.mouse.down();
  await page.waitForFunction(()=>window.__lab.inspect().handling.phase==='carry');
  expect(
    await page.evaluate(() => window.__lab.inspect().dragPayload.length),
  ).toBeGreaterThan(0);
  await page.mouse.move(p.target.x, p.target.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForFunction(()=>!window.__lab.inspect().handling.busy);
}
test("centered stone/filter/ring/assembled-stack/cap drags succeed; outside-zone and wrong-target drags restore payload", async ({
  page,
}) => {
  await boot(page);
  await actions(page, 20);
  await drag(page, "stone-bottom", "assembly");
  await expect(page.locator("#task-title")).toHaveText(
    "Place bottom filter paper",
  );
  await drag(page, "filter-bottom", "assembly");
  await expect(page.locator("#task-title")).toHaveText("Place specimen ring");
  const initial = await page.evaluate(
    () => window.__lab.inspect().objectPositions,
  );
  // Acquisition is intentionally forgiving; reject outside the displayed zone,
  // not a world-space eccentricity that guided placement will correct.
  const pickup = await page.evaluate(() => window.__lab.projectObject("ring"));
  await page.mouse.move(pickup.x, pickup.y);
  await page.mouse.down();
  await page.waitForFunction(() => window.__lab.inspect().handling.phase === "carry");
  const outside = await page.evaluate(() => {
    const z = window.__lab.inspect().dropMarker.zone;
    return { x: z.left - 1, y: (z.top + z.bottom) / 2 };
  });
  await page.mouse.move(outside.x, outside.y, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator("#task-title")).toHaveText("Place specimen ring");
  await expect(page.locator("#hover-label")).toContainText("destination zone");
  for (const id of ["ring", "specimen"])
    expect(
      (await page.evaluate(() => window.__lab.inspect().objectPositions))[id],
    ).toEqual(initial[id]);
  await drag(page, "ring", "balance");
  await expect(page.locator("#task-title")).toHaveText("Place specimen ring");
  const p = await page.evaluate(() => ({
    object: window.__lab.projectObject("ring"),
    target: window.__lab.projectTarget("assembly"),
  }));
  await page.mouse.move(p.object.x, p.object.y);
  await page.mouse.down();
  await page.mouse.move(p.target.x, p.target.y);
  await page.keyboard.press("p");
  await page.mouse.up();
  for (const id of ["ring", "specimen"])
    expect(
      (await page.evaluate(() => window.__lab.inspect().objectPositions))[id],
    ).toEqual(initial[id]);
  await page.keyboard.press("p");
  await drag(page, "ring", "assembly", {offsetXM:.0025});
  await drag(page, "filter-top", "assembly");
  await drag(page, "stone-top", "assembly");
  await drag(page, "assembly", "reservoir");
  await expect(page.locator('#task-title')).toHaveText('Flood reservoir');
  await actions(page, 1);
  await drag(page, "cap", "assembly");
  await expect(page.locator("#task-title")).toHaveText(
    "Establish load contact",
  );
  await actions(page, 2);
  await page.locator("#cutaway").click();
  await expect(page.locator("#layer-leaders line")).toHaveCount(5);
  await expect(page.locator("#layer-leaders")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = document
            .querySelector("#layer-labels")
            .getBoundingClientRect(),
          b = document.querySelector("#pore-panel").getBoundingClientRect();
        return (
          a.left < b.right &&
          b.left < a.right &&
          a.top < b.bottom &&
          b.top < a.bottom
        );
      }),
    )
    .toBe(false);
  for (const label of [
    "Bottom porous stone",
    "Bottom filter paper",
    "Soil specimen",
    "Top filter paper",
    "Top porous stone",
  ])
    await expect(page.locator("#layer-labels")).toContainText(label);
});
for (const mode of ["roam", "restart"])
  for (const reverse of [false, true])
    test(`delayed native audio feedback is invalidated by ${mode}, reverse=${reverse}`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const Native = AudioContext;
        window.__resumeWait = [];
        window.__audioStarts = 0;
        window.AudioContext = class extends Native {
          constructor(...args) {
            super(...args);
            window.__audioContext = this;
            this.suspend();
          }
          resume() {
            return super
              .resume()
              .then(
                () =>
                  new Promise((resolve) => window.__resumeWait.push(resolve)),
              );
          }
        };
        const start = OscillatorNode.prototype.start;
        OscillatorNode.prototype.start = function (...args) {
          window.__audioStarts++;
          return start.apply(this, args);
        };
      });
      await boot(page);
      await page.locator("#perform-action").click();
      await page.waitForFunction(() => window.__resumeWait.length === 1);
      await page.evaluate(() => window.__audioContext.suspend());
      await page.locator("#perform-action").click();
      await page.waitForFunction(() => window.__resumeWait.length === 2);
      if (mode === "roam") await page.keyboard.press("p");
      else {
        page.once("dialog", (d) => d.accept());
        await page.locator("#restart").click();
      }
      const task = await page.evaluate(() => window.__lab.inspect().task);
      await page.evaluate((reverse) => {
        const a = window.__resumeWait.splice(0);
        if (reverse) a.reverse();
        a.forEach((r) => r());
      }, reverse);
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => window.__lab.inspect().task)).toBe(task);
      expect(await page.evaluate(() => window.__audioStarts)).toBe(0);
      if (mode === "roam") await page.keyboard.press("p");
      await page.locator("#perform-action").click();
      await expect
        .poll(() => page.evaluate(() => window.__audioStarts))
        .toBeGreaterThan(0);
    });
test("native audio rejection and missing AudioContext cannot block procedure", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.AudioContext = class extends AudioContext {
      constructor() {
        super();
        this.suspend();
      }
      resume() {
        return super
          .resume()
          .then(() => Promise.reject(new Error("native resume unavailable")));
      }
    };
  });
  await boot(page);
  await actions(page, 3);
  await expect(page.locator("#task-title")).toHaveText("Extrude tube sample");
  await page.evaluate(() => {
    window.AudioContext = undefined;
  });
  await actions(page, 1);
  await expect(page.locator("#task-title")).toHaveText(
    "Weigh initial moisture can",
  );
});

test("Replay handling visibly replays paring without changing measurements/history", async ({
  page,
}) => {
  await boot(page);
  await actions(page, 10);
  await page.waitForFunction(() => window.__lab.inspect().animation === null && !window.__lab.inspect().handling.busy);
  const before = await page.evaluate(() => window.__lab.state());
  await page.locator("#replay-handling").click();
  await expect(page.locator("#handling-caption")).toContainText(
    "Pare sides horizontally",
  );
  await expect
    .poll(() => page.evaluate(() => window.__lab.inspect().animation))
    .toBe("pare-horizontal");
  expect(await page.evaluate(() => window.__lab.state())).toEqual(before);
  await page.screenshot({ path: "reports/screenshots/replay-paring.png" });
});
