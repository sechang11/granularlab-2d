# granularlab-2d

A 2D discrete-element granular packing lab that runs entirely in the browser.
Cundall–Strack soft-disk DEM: pour disks into a box, control friction and
stiffness, and measure the packing.

**Live:** deployed on Railway. **Local:** `npm start`, then open http://localhost:3000

No build step, no bundler, no dependencies. `public/index.html` is the whole
application — physics, rendering and UI in one file.

---

## What it does

Fill a rectangular box with N polydisperse disks and measure the resulting
packing. Four filling methods span loose to dense, every contact parameter is an
input, and the wall forces are reported live.

**Inputs:** N · mean diameter d · dispersity ±x% · grain friction μ · wall
friction μ_w · rolling resistance μ_r · density ρ · normal stiffness k_n ·
tangential ratio k_t/k_n · contact damping ζ · velocity damping b · gravity g ·
the four wall positions.

**Measurements:** packing fraction φ (Monte-Carlo sampled, so overlap can never
inflate it) · coordination number Z and Z\* · rattler fraction · bed height ·
per-wall normal and shear force · effective earth-pressure coefficient K ·
force-balance residual · max contact overlap.

## Contact law

```
normal       f_n = max(0, k_n·δ + γ_n·v_n)          γ_n = 2ζ√(m_eff·k_n)
tangential   ξ  += v_t·dt
             f_t = −k_t·ξ − γ_t·v_t ,  |f_t| ≤ μ·f_n     (ξ rescaled on slip)
torque       τ   = r·f_t                            (both partners, same sense)
rolling      τ_r = −μ_r·f_n·r_eff·regSign(Δω)
```

Disks are unit-thickness: `m = ρπr²`, `I = ½mr²`. Semi-implicit Euler, with the
timestep sized on whichever contact mode is stiffer — rotational or
translational. Contact detection uses Verlet neighbour lists over a flat
counting-sort grid.

## Units

SI internally (m, kg, N). Only the display converts: grain diameter in **mm**,
box in **cm**, forces in **N/kN**. The disks are unit-thickness, so a force here
is really force per metre of depth (N/m); the ratios that carry the physics
(`bottom/W`, `K`) are dimensionless either way.

## Filling methods — measured

N = 250, d = 30 mm, ±15%, μ = 0.30, settled then averaged at equilibrium.

| method | φ | Z |
|---|---|---|
| Lattice release | 0.820 | 3.57 |
| Pluviation, friction on | 0.828 | 3.76 |
| Grow in place | 0.836 | 4.14 |
| Pluviation, frictionless | 0.845 | 4.27 |
| Lattice release @ ±0% | **0.869** | 3.96 |

The last row crystallises toward the hexagonal limit of 0.9069.

## Validation

Every number measured in-browser, not asserted.

**Friction controls density and coordination, monotonically:**

| μ | φ | Z |
|---|---|---|
| 0.05 | 0.844 | 4.07 |
| 0.30 | 0.828 | 3.76 |
| 0.80 | 0.822 | 3.56 |

The 2D isostatic limits are Z = 4 (frictionless) and Z = 3 (fully frictional).

**Static equilibrium** — the floor carries the whole weight: `bottom/W = 0.981`
at N = 800, and 0.97–1.03 across every method tested.

**Lateral earth pressure** — measured `K = 0.74` at μ = 0.30 against Jaky's
`K₀ = 1 − sin(atan μ) = 0.71`.

**Force balance closes to 0.00%** in x and y in every configuration tested,
including asymmetric compression against frictional walls.

## Wall forces, and why X1 need not equal X2

Horizontal equilibrium of the packing is

```
X1 − X2 + shear(floor) − shear(lid) = 0
```

A frictional wall holds shear up to `μ_w·N`, so the two side walls are free to
differ by that much and still be perfectly static — nothing drives them together,
and compressing widens the gap because it raises N on the floor.

**Set `μ_w = 0`** (the default) for frictionless walls with frictional grains —
the standard setup for a clean stress measurement — and the side walls read
exactly equal, settled and compressed.

The **Σ force residual** row is the real equilibrium test, not `X1 = X2`.

## Performance

| N | µs / step / particle | × real time |
|---|---|---|
| 250 | 0.071 | 5.06 |
| 500 | 0.071 | 2.53 |
| 2000 | 0.090 | 0.497 |
| 8000 | 0.068 | 0.164 |

Per-particle cost is flat across that range — the solver is cleanly O(N).
Comfortable interactive ceiling is ~1000; beyond that it runs, just slower.

**k_n must grow with bed depth.** Basal contact force rises with the weight above
it and overlap is `force/k_n`, so a setting giving 1% overlap at N = 800 gives 7%
at N = 8000. Watch the *max overlap* readout: green under 1%, red over 5%.

## Rendering robustness

`fit()` used a flat 26 px padding, so any canvas smaller than 52 px in either
direction produced a **negative** scale. Every disk radius is `r*sc`, so the
first `arc()` threw *"radius provided is negative"* — and because that throw
happened inside `draw()`, the `drawChart()` and `paintReadouts()` calls after it
never ran. The HUD froze on stale values while the physics carried on
invisibly: the page looked online but the balls never appeared to fill.

The trigger was layout, not physics. `#panel` was a fixed 330 px beside a
`flex:1` canvas, so any window under about 400 px left the canvas less room than
the padding. Every phone in portrait was in that range.

Three fixes: padding now scales with the viewport and `sc` is clamped positive;
painting is wrapped so a render error can never stop the readouts (logged once,
not per frame); and below 820 px the layout stacks — canvas on top, controls
beneath, both full width. A `ResizeObserver` keeps the canvas in step with its
container, since the panel can wrap without a window resize event.

Verified at 1440, 1024, 820, 400 and 320 px wide: scale positive, no throw, and
a 400-ball fill renders with the HUD live.

## Panel layout

The controls panel scrolls independently of the page and is ~2800 px tall. At a
700 px window the panel shows 636 px, so **Fill sat 1162 px down — 526 px below
the fold**, reachable only by scrolling inside the panel, which is easy to miss
entirely. Every explanatory hint added to the Particles and Contact Model
sections pushed it further down.

Fill / Tap / Unload / Clear / Pause / Step are now in a **sticky bar pinned to
the top of the panel**. Verified: they sit 12 px from the panel top whether it is
scrolled to the top or all the way to the bottom (scrollTop 2204).

## The Fill button had no handler

`id="bFill"` was on **two** elements: the Fill button and the target-fill slider.
`getElementById` returns the first in document order, so
`$('bFill').addEventListener('click', startFill)` attached the Fill handler to
the *slider*. The button was never wired at all.

Every symptom follows from that. A real click on Fill did nothing. A
programmatic `document.getElementById('bFill').click()` worked, because it
resolved to the slider, which owned the handler — which is why it looked fine
under test and broken in use. Occasionally touching the slider started a fill,
producing a stray "settling" with no obvious cause. Adding the sticky action bar
put the button first in the DOM, which moved the collision rather than removing
it: Fill started working and the target-fill slider went dead.

The slider is now `fTarget`. Worth a lint rule; a duplicate id fails silently
and misdirects for a long time.

## The view no longer follows the box

`fit()` recomputed the scale from the box every frame, so the view tracked the
box: drag Y2 down, the box gets shorter, the scale grows to compensate, and the
**X walls visibly slide apart though x1 and x2 never moved**.

The mapping is now fixed until the canvas resizes or **Fit view** is pressed.
Measured on a 30 cm Y2 drag: box 0.82×0.82 → 0.82×0.22, X1 stayed at 26 px, X2
stayed at 874 px, scale unchanged at 1034.15.

**Reset** restores every control, the box and the view to the values captured at
page load.

## Exporting data

A measurement lab that cannot hand you its measurements is a toy, and this one
had no export at all. Two buttons now:

- **Summary CSV** — one row, 46 columns: every setting beside every measurement
  (φ, Z, Z\*, rattlers, bed height, overlap, all eight wall normal and shear
  forces, weight, bottom/W, side/W, K, both force-balance residuals, dt,
  substeps, sim time). Repeated runs append into a table you can plot directly.
- **Particles CSV** — one row per disk: position, radius, velocity, spin,
  contacts, normal load. For analysing a packing offline.

Both lead with the build and an ISO timestamp: a number you cannot trace back to
a version is a number you cannot defend later.

## Accessibility and polish

- **22 control labels are bound** to their inputs with `for=`. None were before,
  so screen readers could not associate them and clicking a label did nothing.
  Verified: clicking a label focuses its control.
- Three readouts that were marked up as `<label>` (box W×H, box area, selected
  wall) are now spans — they label nothing.
- **Favicon** (inline SVG: three disks in a box) and a meta description.
- **A startup duplicate-id check** logs an error if any id appears twice. The
  `bFill` collision cost a long debugging session precisely because
  `getElementById` fails silently and every test that also uses it agrees with
  the wrong element.

## Auto-size is method-aware

Sizing the box so the bed exactly reaches the lid conflicts with pluviation,
which needs somewhere to rain grains from — deposition jammed a few grains short
every time. **Auto-size** now leaves headroom (φ_box ≤ 0.62) when a pluviation
method is selected and uses the full-box target for grow and lattice, which place
particles throughout the box and do not care.

Measured at N = 200, all four methods: **0 jams, all 200 placed**. Pluviation
gets a 48 cm box, grow and lattice 41 cm.

## Controls: typed values, applied live

Every numeric control now has a **number box beside its slider**. Both drive the
same setter through one spec table, so they cannot disagree, and an exact value
can always be typed — a slider alone is far too coarse for k_n or a wall position.
k_n keeps a logarithmic slider (it spans four decades) while its box holds the
plain number.

**Everything applies to the running model immediately**, including density, which
re-derives every particle's mass and inertia in place. The three exceptions are
labelled *next fill* in the UI: N, d and ±x decide *which grains exist*, so
changing them mid-run would mean inventing or deleting grains rather than
adjusting the experiment.

**One more digit than feels necessary.** Forces read to 0.01 N, positions to
0.01 cm (0.1 mm), Z and Z\* to three decimals, residuals to 0.01%. These numbers
are read side by side and compared — X1 against X2, bottom against W — and a
difference in the second decimal is exactly the difference you are looking for.
Bed height moved from metres to centimetres to match the walls it is measured
against.

This refactor made state the single source of truth for defaults and immediately
exposed two that had drifted: `kn` was `2.0e4` in state while its slider showed
`2.0e6` (soft enough for 40%+ contact overlap), and `bv` was 0.5 against 2.0. A
startup check now warns when a slider's authored value disagrees with state.

## Why phi moved after Pause

It was not the simulation. `samplePhi` is a **Monte-Carlo estimate** — it throws
random points and counts hits — and it ran on a timer regardless of whether
anything was moving. Re-rolling an unchanged packing gives a slightly different
answer each time. Measured on a frozen packing: 0.8265–0.8327 across eight
samples, sd 0.0018 against a theoretical s.e. of 0.0024.

Re-sampling now happens only when something has actually changed. When the bed
goes quiet it takes one final pass at four times the sample count (half the
noise, and it costs nothing because it happens once), then holds. Pause states
plainly: **PAUSED — physics and readouts frozen**.

## Glossary, readout overlay, text size

- **? Glossary** in the header explains all 24 symbols — t, φ, Z, Z\*, /W, K,
  shear, residual, overlap, k_n, ζ, b, μ_w — grouped by where they appear.
  In-page rather than a separate route: it is a single-file app, and help you
  must navigate away to read is help you will not read.
- **Hide readouts** collapses the readout column and gives its width to the
  packing. Remembered.
- **Text size** S/M/L/XL in the header. Remembered.

The first attempt at text size did nothing at all. It set the root font-size,
which only moves text sized in `rem`/`em` — and the stylesheet had **45 absolute
px font-sizes and zero relative ones**, so nothing inherited from it. Every
font-size is now `calc(Npx * var(--ui))` and the selector moves that one
variable; the panel widens with it so larger type does not just wrap, and the
canvas-drawn labels take the multiplier explicitly since they are painted rather
than styled. Verified by measuring *rendered* text: panel labels 10.8 → 15.6 px
across S → XL.

The original test only asserted the style property had been set, never that any
visible text changed — the mechanism, not the outcome. Worth remembering.

## Three columns, so nothing sits on top of anything

The readouts used to float over the packing as an overlay, which meant that at
any useful particle count you were reading the numbers *through* the grains, and
the only remedy was to hide them. They now have their own column between the view
and the controls: **view | readouts | controls**, all three fully visible at once
on a normal screen.

The column is sized by `width: max-content` rather than a number. A fixed 228px —
which is what a guess produced — cut the shear column off the wall table and left
a horizontal scrollbar in a 227px box holding a 290px table. `max-content` also
follows the text-size selector for free, which a fixed width does not.

Below **1180px** there is no longer room for three columns without squeezing the
view, so the layout folds: the view takes a full-width row, and the readouts sit
beside the controls underneath it. Below **820px** everything stacks. Both rows
keep an explicit height at the middle breakpoint, because a panel with
`height:auto` and 2800px of content does not scroll — it just grows.

`--labH`, the height those columns share, is now **measured rather than
predicted**. `calc(100vh - 64px)` was right until the header wrapped, which it
does at narrow widths and at the larger text sizes; `sizeLab()` reads where
`#main` actually starts and subtracts that.

## Workspace tabs

Three tabs — **A, B, C** — each remembering its own settings in `localStorage`,
so a loose configuration and a dense one can be set up side by side and switched
between without writing either down, and both survive closing the page. **Reset**
still restores the shipped defaults, to whichever tab you are on.

Settings only, not the packing. A bed poured into one box does not belong inside
another box's walls, so switching tabs empties the box and you pour again.

Three details worth keeping:

- **One snapshot definition, not two.** `snapshot()` and `applySnapshot()` are
  shared by Reset and by the tabs. The previous code had Reset's list of settings
  written out inline; a second copy for the tabs would have drifted the first
  time a control was added.
- **Model values, not slider positions.** Round-tripping through a slider
  re-quantises to its step — k_n came back as 1995262 rather than 2e6, because
  the logarithmic slider steps by 0.05.
- **Autosave watches the snapshot, not the inputs.** Settings change through
  sliders, number boxes, wall drags, the arrow keys and Size box; hooking all six
  paths means eventually missing one. A 1 Hz comparison of the serialised
  snapshot writes only when something actually differs, and cannot miss a path it
  does not know about.

Everything read back out of storage is checked before use — a snapshot may have
been written by an older build with controls this one has renamed, and one stray
`undefined` reaching `S` turns every subsequent force into `NaN`, a failure that
surfaces as a blank screen far from its cause.

## Section-specific help

The panel used to carry a paragraph of explanation under each section. Prose in a
control panel pushes the controls off screen — that is how Fill ended up 1162px
down, below the fold. Each section header now carries a small **?** which opens
the glossary *at that section* and flashes the heading. A glossary you still have
to search through is one more task rather than an answer.

The scroll is synchronous — a forced reflow, not `requestAnimationFrame`. The two
look identical until the page is in a background tab, where rAF never fires at
all and the modal opens at the top every time.

Clicking anywhere outside the box closes it, as does Esc; the **×** is a
fallback, not the route.

One casualty is worth recording: the sweep that pulled the prose out also removed
`#capHint`, because it wore the same `class="hint"`. `#capHint` is not
instruction — it is the live calculation of whether these N balls fit in this box,
and the thing that says *"filling will be refused"* before you press Fill and
wonder why nothing happened. Removing it also left `updateHint()` calling
`textContent` on `null`, which threw during init and stopped the whole startup
sequence — no `clearAll()`, no defaults captured, no tabs. It is back under its
own `.note` class so that stripping prose can never again take a readout with it.

## Feedback

A full-width section at the bottom of the page collects **anonymous, timestamped**
notes into SQLite. No name, no account, no IP is stored.

**The settings snapshot is mandatory, not optional.** It was a checkbox; it is
now always attached, and it carries the **build version** as well. A note whose
settings are missing cannot be reproduced, and one whose build is unknown may not
even describe the code you are looking at — this session lost a lot of time to
exactly that. Every note now answers both questions on arrival.

The build is shown as a chip on each note in the list, so "which version was this
about" needs no clicking. Press **show** above the send button to see precisely
what travels with a note; nothing is hidden.

Spam defences: a honeypot field, a 5-per-10-minutes per-IP rate limit (held in
memory, never written), and a 4000-character cap.

**Deletion is owner-only.** Set `ADMIN_TOKEN` in the Railway environment, then
enter it in the *admin token* box under the notes list to reveal delete controls.
The token is compared in constant time and is never in the repository. With
`ADMIN_TOKEN` unset, nothing can be deleted through the API at all.

### API

| method | path | auth |
|---|---|---|
| `GET` | `/api/feedback` | public |
| `POST` | `/api/feedback` | public, rate-limited |
| `POST` | `/api/admin/check` | – |
| `DELETE` | `/api/feedback/:id` | `x-admin-token` |

## Deploying

**Node is pinned to 22.x** (`engines` and `.node-version`), and that pin is load
bearing. `better-sqlite3` is a native module: it downloads a prebuilt binary for
your exact Node ABI, and falls back to compiling from source when none matches.
Version 11.10.0 publishes Linux prebuilds for ABI v108/v115/v127/v131 — Node
18/20/22/23 — and **nothing for Node 24**. Leaving the range open let Railway
pick Node 24, which found no prebuild, tried to compile, and died looking for a
Python that is not in the image. Do not widen the range without checking that a
prebuild exists for the Node version you are moving to.

Railway auto-detects Node from `package.json` and runs `npm start`.
`railway.json` pins the health check to `/healthz`. `PORT` comes from the
platform; the server binds `0.0.0.0`.

**A volume is required.** Railway rebuilds the container filesystem on every
deploy, so a SQLite file inside the image is wiped each time you ship. Mount a
volume and point the app at it:

1. Railway → your service → **Variables**
   - `DATA_DIR` = `/data`
   - `ADMIN_TOKEN` = a long random string you keep to yourself
2. Railway → your service → **Volumes** → add a volume mounted at `/data`

Without the volume the app still runs, but every deploy starts the notes empty.

## Credits

The 2D lab is original work. It follows the physics and analysis of
**Chang Yang** — the 3D Granular Mechanics Lab at
[physics-informed-ai.com](https://physics-informed-ai.com/) and the
Edwards-ensemble treatment in Chang, Chang & Chao, *Phys. Rev. E* **114**,
015410 (2026), [doi:10.1103/1fvf-342f](https://doi.org/10.1103/1fvf-342f).

No code or content from those sites is redistributed here.

## Licence

TBD — see repository owner.
