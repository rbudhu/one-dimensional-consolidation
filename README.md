# Consolidation — WebGPU virtual soil laboratory

Interactive one-dimensional consolidation experiment based on [UTA's Consolidation Test chapter](https://uta.pressbooks.pub/soilmechanics/chapter/consolidation-test/).

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/pages.yml` tests, builds and deploys pushes to `main`. In repository **Settings → Pages**, select **GitHub Actions** as the source. Vite uses relative asset URLs so the site works under the repository subdirectory.

Public site: https://rbudhu.github.io/one-dimensional-consolidation/

Native WebGPU and hardware acceleration are required. No backend or API keys are needed.

## Local development

Requirements: Node.js 22.12+ and a browser with native WebGPU plus hardware acceleration. Use localhost or HTTPS; `file://` is not supported.

```sh
npm ci
npm run dev -- --port 4173 --strictPort
```

Open http://127.0.0.1:4173/.

Production:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
```

Open http://127.0.0.1:4174/. The renderer deliberately refuses WebGL fallback. A missing adapter/device produces a visible error.

## Controls

- Follow the current instruction in the right-hand panel. A native gold outline/glow identifies the item to pick up before dragging; annotations never alter its physical bounds or picking.
- Drag the highlighted apparatus into the glowing destination zone. Acceptance uses the cursor, not the carried object centre: the whole balance is usable, with a forgiving margin and larger zones for small layers. Amber gently pulses; steady green and “Release here” mean the drop is inside the accepted zone. Reduced-motion mode uses a steady highlight. The zone stays the same size throughout the pulse and disappears after release/cancellation.
- Physical placement remains precise: portable payloads lift clear of equipment, then safely align/lower onto the actual support within the existing 2 mm tolerance before recording. Outside-zone/wrong-target drops restore the payload. Illustrative tool/control drops use the same ideal-handling path as the keyboard-accessible action button, without claiming a physical measured centre.
- The wrapped plate/specimen travel rigidly with the ring when required; assembly transfers carry the stone–filter–soil–filter–stone stack. Weighing records only after seating on the real pan. The assembly stays on the scale: **Return assembly to bench** performs a return-only motion, or the next action automatically returns it before continuing. P/restart can cancel unsettled handling without recording a measurement.
- **P** toggles free roam. Drag to look; **WASD** moves, **Q/E** moves vertically; **P** restores the inspection view.
- Automatic action close-ups frame the relevant station: scale and readable LCD, cutting blade/sample, drainage assembly, dial, recovery and oven. The camera stays fixed while the mouse is held, focuses before the operation, and holds the result before preparing the next step. **Whole bench / Action close-up** provides a view override. **Inspect layers** opens a labeled five-layer educational cutaway; **Replay handling** replays the last illustrative manipulation without altering recorded data.
- **Sound on/off** controls generated effects. Audio unlocks only after a user gesture.
- Capture every due reading for the first two 24-hour increments, **0.5 and 1 tsf**. After the second finishes, choose **Simulate remaining 9 increments**. The simulator calculates/records the other original pressure steps using the same guarded physical model, without further capture/pressure clicks. Manual record/next/speed controls disable during automation; P pauses/resumes it. Final release and recovery remain interactive.
- The sidebar keeps the latest completed measurement, persistent named/unit-valued properties, and live pressure/dial/settlement/time. Pending values stay blank and derived values are labelled. Weighing LCD and sidebar values agree after actual pan seating.
- **Experiment notebook** contains measurements, semilog-time graphs, interactive Casagrande constructions, the e–log-pressure curve, procedure trace, model assumptions and complete selected-result/provenance CSV export.
- Restart asks before discarding readings.

## Scope and physical assumptions

The complete sequence includes ring/plate tare, dimensions, Shelby-tube extrusion, supporting moisture/Gs measurements, horizontal paring, gentle insertion, two inversions and separate flush cuts, prepared mass, plate/film removal, soaked drainage stones and filter papers, centered submerged assembly, loading contact, dial zeroing, all loading/unloading increments, prompt final recovery/blotting, wet weighing, can tare, soil transfer and 16-hour final oven drying.

Loading follows 0.5, 1, 2, 4, 8, 16 tsf, then unloading to 8, 4, 2, 1, 0.5 tsf. US short-ton-force/ft² is used: 1 tsf = 95.76051798033584 kPa. Dial divisions are 0.0001 inch = 0.00254 mm.

The simulator's explicitly chosen observation schedule is 0, 0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 240, 480, 1440 minutes per increment: **15 observations × 11 increments = 165 readings**. The reference chapter does not supply its data sheet. Each increment spans 24 laboratory hours. The guided UI records **30 learner readings** in the first two increments and **135 automatic readings** in the remaining nine; all **165** retain their original physical timestamps and ordered stress history. Notebook and CSV explicitly distinguish `learner` versus `automatic` origin. All readings are virtual model data, not empirical observations. Acceleration changes waiting time, not physical timestamps. Supporting aliquot drying is a labeled compressed supporting measurement; final drying uses a guarded 960-minute timer.

All geometry is generated in code. Materials use generated Canvas textures; no texture, model or audio files are requested by the app. Sound uses oscillators, seeded noise, filters and gain envelopes. The physical solution is code-generated, not a prerecorded dataset.

The clay specimen is coherent rather than a mixture of conflicting source arithmetic: diameter 63.5 mm, height 25.4 mm, Gs 2.72, initial e 0.816, initially saturated. Dry/wet masses follow those dimensions. Initial saturated moisture is 30%, not the chapter's inconsistent 28.9% example. The notebook distinguishes prescribed illustrative material constants from parameters inferred from recorded observations.

Primary consolidation uses Terzaghi's double-drainage solution with pressure-dependent cv. A stress-history e–log-pressure constitutive relation supports virgin compression, recompression and rebound; a small prescribed secondary compression contributes late-time creep. Lateral ring confinement and dry-solids conservation are maintained. The ring and bottom drainage layer do not shrink or move with settlement. Actual millimetric deformation is never amplified; camera close-up and a labeled layer-separation inspection aid visibility.

The initial effective-stress reference is 10 kPa, not log(0). Saturation, uniform clay, water density, no leakage/disturbance and rapid final handling are explicit model assumptions. Final full release does not invent a further zero-stress log-pressure stage; prompt handling retains the last measured geometry/wet mass. The pore-pressure field's capped Fourier series is intended for practical experiment times, not arbitrarily tiny near-boundary time/depth scales.

## Analysis

- Water content, Gs, solids height and void ratio derive from recorded gravimetric/dimensional measurements.
- D0 is estimated from early readings at t and 4t. D100 comes from selected primary/secondary log-time tangents. Both can be adjusted independently; D50 and t50 update, giving cv = 0.197 Hdr²/t50.
- The simulator uses increment-start H/2 for drainage length and states that approximation.
- After final dry weighing, the pressure curve uses graphical end-of-primary D100 and measured solids height, not blindly the 24-hour creep-deformed ordinate.
- Select virgin-loading and recompression/unloading ranges to fit Cc/Cr. Construct Pc from maximum curvature, tangent, horizontal, bisector and virgin-line intersection using equal coordinate scale.
- Fitted values depend on graphical choices, coarse loading spacing and prior creep. They are not automatically replaced with the model's prescribed constants.

This is an educational virtual laboratory, not certified ASTM apparatus, empirical site data or a substitute for field-design tests.

## Tests

```sh
npm test
npx playwright install chromium
npm run build
# Start production preview in another terminal, then:
LAB_URL=http://127.0.0.1:4174 npm run test:browser
```

The verified primary target is Chromium with native WebGPU. WebKit renders natively and substantial headed tests pass, but repeated headed runs intermittently omit a native click despite correctly delivered pointerdown/up; stable WebKit interaction is not certified. Browser tests request native Metal GPU on macOS. They exercise actual rendering, real pointer movement, P/free-roam restoration, a complete UI-only run and CSV export, short-desktop geometry and native OfflineAudioContext sound/mute output. Test-only telemetry is available at `?qa`; the independent accuracy critic must use the public URL without it.

Independent core review and implementation evidence are in `reports/`. A separate blinded accuracy critic uses only the reference and public browser UI; its report and screenshots are separate from code review.

## Project structure

- `src/physics.js`: constants, constitutive law, analytical consolidation and mass/analysis functions.
- `src/procedure.js`: guarded experiment state machine and measurement acquisition.
- `src/scene.js`: native WebGPU procedural bench, apparatus, kinematic handling and pointer picking.
- `src/main.js`: accessible UI and simulation-clock integration.
- `src/notebook.js`: measurement tables and graphical construction controls.
- `src/analysis.js`: reset-safe per-stage selections, shared validated results and complete CSV export.
- `src/placement.js`: action-specific final-centering contracts.
- `src/carry.js`: conservative swept-volume clearance and lift–transfer–lower routes.
- `src/drop-feedback.js`: shared client-pixel drop-zone predicate and graphics-time amber/green cue style.
- `src/action-camera.js`: cancellable contextual camera/readiness/result-dwell coordination.
- `src/measurement-ui.js`: explicit typed measurement rows, latest result, caliper and live readouts.
- `src/loading-automation.js`: opt-in guarded nine-increment recording, clock budgets, pause/reset and speed restoration; the bare scientific controller retains its full-manual API.
- `src/measurements.js`: typed balance values and shared release-aware applied load.
- `src/inspection.js`: signed pore-pressure schematic driven by the physical solution.
- `src/audio.js`: generated apparatus effects.
- `tests/`: Node and real Chromium tests.

No external CDN or paid API is needed at runtime. Three.js and Vite dependencies are pinned in the lockfile.
