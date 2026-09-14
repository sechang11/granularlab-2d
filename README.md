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
- **Hide readouts** dismisses the overlay when it covers something you want to
  see. Remembered.
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

## The readouts are an overlay, and why the balls were flickering

A build in between moved the readouts out of the canvas overlay into a column of
their own, so the view and the numbers would not sit on top of each other. It
made the balls flicker so hard the client described it as a seizure. It has been
reverted; this is what it was.

The column was sized `width: max-content`, which was meant to stop a fixed width
cutting the shear column off the wall table. But `max-content` means *as wide as
the widest line* — and the widest line is a readout that changes every frame.
Measured directly, on nothing but ordinary value churn:

| readouts show | `#hud` width | `#simwrap` width |
|---|---|---|
| `0.00e+0 J`, `0.000% d`, `0.00 N` | 315 px | 780.4 px |
| `1.23e-3 J`, `0.123% d`, `13282.21 N` | 336 px | 758.5 px |
| `8.69e-8 J`, `1.657% d`, `4.19 N` | 315 px | 780.4 px |

A `ResizeObserver` watches `#simwrap`, so each of those 21px swings called
`resize()`, which assigns `cv.width` — **which clears the canvas** — and then
`fitView()`, which re-derives the scale and origin. Several times a second. The
packing was being wiped and re-framed continuously.

Two fixes, because either alone would have left the trap set:

1. The readouts went back to being an overlay inside `#simwrap`, so nothing whose
   size depends on live text shares a flex row with the canvas.
2. `resize()` returns early when the device-pixel dimensions have not actually
   changed. A `ResizeObserver` fires on any nudge at all — a scrollbar appearing,
   a webfont landing, a sibling reflowing — and every one of those was a canvas
   wipe. Verified: 50 consecutive `resize()` calls with no layout change leave
   `cv.width`, `cv.height`, `sc`, `ox` and `oy` untouched and a sentinel pixel
   alive on the canvas, while a real size change still reframes. Over a full
   800-grain fill and settle, `resize()` did real work **zero** times.

The lesson is narrower than "don't use max-content": **never let a canvas's
layout depend on the content of anything that updates per frame.** The coupling
was two elements and one observer away from the thing that broke, which is why it
looked like a rendering bug rather than a CSS one.

`--labH`, the height the view and the panel share, is still measured rather than
predicted. `calc(100vh - 64px)` was right until the header wrapped, which it does
at narrow widths and at the larger text sizes; `sizeLab()` reads where `#main`
actually starts and subtracts that.

## Workspace tabs

Three tabs — **A, B, C** — as a segmented control **inside the existing header**.
A strip of its own costs ~30px of the view on every screen, for a control you
touch rarely. Each remembers its own settings in `localStorage`,
so a loose configuration and a dense one can be set up side by side and switched
between without writing either down, and both survive closing the page. **Reset**
still restores the shipped defaults, to whichever tab you are on.

Each workspace owns **its own packing** as well as its own settings, so tab B
never shows you the bed you poured in tab A. Switching stows the current
particles, walls, contact springs and wall averages under the tab you are
leaving and brings back whatever the tab you are entering had — an empty box if
it has never been filled. A restored bed arrives **paused**, so it cannot evolve
while you are still reading it; an empty one simply runs.

Settings live in `localStorage` and survive closing the page. **Packings do
not** — they are held in memory for this session only. Three beds of eight
hundred disks would store, but a restored bed without its contact springs is not
the bed you left (the friction history is what holds a lateral load), and quietly
handing back something subtly different is worse than handing back nothing.

Where the incoming tab's walls differ from where the walls physically are, they
become the **target**, not the position. Landing them instantly on a packed bed
would put hundreds of disks outside their container in a single frame, and on the
next step the escape backstop would drag every one of those centres inward
together. Setting the target hands the job to `advanceWalls`, which sweeps at
`WALL_VMAX` when you press Run. Measured across a switch from a 70 cm box to an
82 cm one holding 500 grains: peak particle speed **1.17 m/s** on resume.

### One array, three workspaces

The first version of this stowed `S.P` by reference. `clearAll()` empties `S.P`,
`S.contacts` and `S.hist` **in place** — so clearing the box for the incoming
workspace emptied the array the outgoing one was holding, and the next Fill
filled both. A→B→A came back with B's 150 grains sitting in A's 60 cm box.

`putPack` now hands the live state *fresh containers* rather than truncating the
stowed ones, and a restored packing is deleted from `PACKS` so the live state is
its only owner. Verified across A→B→C→A→B→A: 300 grains in a 60 cm box, 150 in an
82 cm box, and an empty C, each returning to itself every time.

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

## Legibility of the panel numbers

The values you type and read in the control panel were `--accent` (`#3987e5`) on
`--surface2` (`#222220`). Measured on the live element that is **4.38:1** — below
the 4.5:1 minimum, at 11.5px, for the text in the app you look at most.

They now use a separate `--value` token, `#9ec5ff`, which measures **9.02:1**
against the same background and is still unmistakably the "this is a value you
can edit" blue. `--accent` is left alone: the canvas accent, the active workspace
tab and half the theme lean on it, and dragging it lighter to fix one control
would have repainted everything.

## Wall positions to 0.01 cm

The four wall boxes read to two decimals, and their step is 0.01 cm.

The catch was that `snapWall` put every wall value on a **1 mm grid** — which is
0.1 cm, so a second decimal could only ever have been a zero. Grid and nudge were
the same constant and are now two:

- `WALL_GRID = 0.0001` m (0.1 mm) — what every path snaps to, whether the value
  arrived by typing, dragging the slider, dragging the wall in the view, or an
  arrow key. It has to be finer than the readout or the last digit is decoration.
- `WALL_STEP = 0.001` m (1 mm) — one arrow-key press, 10 mm with Shift, as
  documented in the glossary.

Verified end to end: typing 55.37 cm lands on 55.37, 40.008 snaps to 40.01, and
an arrow-key nudge still moves 0.1 cm.

The wall sliders had also been carrying two `input` listeners doing the same
work — an ad-hoc one and the generic `CTL` binding. The `CTL` one also clamps to
the box's min/max and marks the readouts for an immediate re-measure, so it is
the one that survived.

## Pause made the buttons silently dead

`depositTick`, `growTick` and `step` all sit inside `if(S.running)`. So a paused
page answered **Fill** with a phase of "filling", a queue of 800 particles, and
not one disk — forever — and answered a wall drag by moving the target and never
the wall. Nothing said so. Since a workspace switch now leaves you paused, this
was reachable without ever touching the Pause button.

Two different fixes, because they are two different situations:

- **Fill, Tap and Unload resume the run themselves.** A command that means "make
  something happen" cannot sit waiting for a Run the person pressing it does not
  know is needed.
- **A wall says it is waiting.** Walls move by sweeping, which is physics, so a
  wall cannot move on a frozen page. Moving one while paused now says
  *"Paused — press ▶ Run to move the walls there"* instead of looking broken.

### The chart kept scrolling while paused

The φ / side-load trace under the wall forces was sampled outside the
`if(S.running)` gate, so a paused page went on appending the same frozen pair ten
times a second and scrolling the real history off the left of the chart. A pause
was quietly destroying the record it was meant to be holding still. The trace is
a history of the run, not of the wall clock, so it now stops with the run.

### `#phase` is a readout, not a message log

The first version of that hint went into `#phase` and was invisible.
`paintReadouts` rebuilds `#phase` from `S` **every frame** — and while paused it
hard-writes *"PAUSED — physics and readouts frozen"* — so anything left there
survives exactly one frame. It looked right in a unit check of the DOM property
and was gone before a person could read it, which is the same shape of mistake as
the text-size selector that set a style nothing inherited from.

Transient messages now go to the **toast** in the corner of the view, which
nothing repaints: the wall hint, the workspace switch, resume-because-you-pressed-
Fill, the export-with-nothing-to-export warning, and the record acknowledgement.
`#phase` keeps its one job. The only thing still written there is Fill's instant
*"Fill pressed…"*, which is meant to be replaced by *"depositing…"* on the very
next frame.

## Fill never refuses, and the walls can be balanced

**A box too small for N is no longer refused.** The box is the thing with a free
parameter, so the box gives way: Fill enlarges it to the size that holds N at the
target fill and says so in the corner. A box that already holds N is left exactly
where you put it. The 12 m ceiling is a guard against nonsense, not a capacity
limit — the largest N and largest grain the UI offers need 9.8 m.

**⚖ Consolidate to σ₃** is a biaxial cell. The floor and the left wall are the
frame and never move; the **lid** and the **right wall** are the platens, and each
is driven inward until the normal *stress* on it reaches σ₃:

    σ_t = F_t / L_t     L_t = the box width,  the lid's length
    σ_r = F_r / L_r     L_r = the box height, the right wall's length

In 2D the disks are unit thickness, so a wall of length L metres presents L m² of
face and F/L is a genuine pressure. σ₃ is set in kPa, default 18.

**Two platens are enough for four walls**, because statics fixes the rest:

- Σ horizontal = 0 gives F_x1 = F_x2, and the side walls are the same length, so
  **σ_x1 = σ_x2** as well. The left wall follows the right one exactly, at no cost
  — which is why driving the right one drives both.
- Σ vertical = 0 gives F_y1 = F_y2 + W. Floor and lid are also the same length, so
  **σ_y1 = σ_t + W/L_t**: the floor reads higher than the lid by the weight of the
  grains spread over the box width. It is the one wall that cannot be driven to
  σ₃, and the reason is gravity, not the controller.

The wall table gains a live **σ kPa** column, with σ₃ shown on the weight row so
the column reads as a comparison. A recorded row already contains everything
needed to recover any of these: the lid's length is x₂ − x₁ and the right wall's
is y₂ − y₁.

Measured, 400 grains, σ₃ = 18 kPa, converging in about 120 frames:
**σ_t = 17.88, σ_r = 17.41, σ_l = 17.41** kPa — and the floor at **26.04**
against a prediction of σ_t + W/L = **26.04**. Box 80.3 × 39.8 cm, overlap 3.39%.

### Five things the servo got wrong first

Each of these was found by measuring, not by reasoning about it.

1. **The grid ate every step.** Wall positions snap to `WALL_GRID`, 0.1 mm, and
   the servo's steps can be an order of magnitude smaller, so `snapWall` rounded
   every one to zero and the box never moved at all. The residual the grid
   swallows is now carried to the next tick.
2. **The plant model was 250× too stiff.** It counted the contacts along a wall as
   springs in parallel, `k_n·L/d`. Measured from the trace, 0.67 cm of closure
   bought 1467 N — a real response of 2.2e5 N/m against the model's 5.5e7. A wall
   is not pressing on a row of springs; it is straining a packing that
   rearranges, and what answers is the bulk modulus of the bed.
3. **One rattler held the run hostage.** `isQuiet()` is a max-over-every-grain
   test — right for "has deposition finished", far too strict here. A single grain
   spinning in a pore ran at 1.4× that bar while the packing's entire kinetic
   energy was 5.5e-6 J under a 6.5 kN load. Convergence now asks whether the
   packing is quasi-static *relative to its load*.
4. **The creep rate applied everywhere.** A wall with far to travel crawled: a box
   five times too big needs nearly 40 cm of closure, 1270 frames at creep pace
   before the servo was even in range. How fast a platen may move is now scheduled
   on how much load it already carries, with the square of the shortfall ramping
   between travel and creep.
5. **Filtering the controller overshot by 2.5×.** σ on a short wall scatters ±17%
   frame to frame — fewer force chains land on it, and σ_x1 and σ_x2 are
   anti-correlated within a frame because F_x1 = F_x2 holds on average, not
   instantaneously — so the convergence test needs a ~0.25 s average. Feeding that
   average to the *controller* as well was a disaster: it lags sixteen frames, the
   rate schedule reads it to decide whether a wall is still unloaded, and a wall
   at approach speed covers seven centimetres in that time. A target of 18 kPa
   consolidated to **46** and tripped the overlap guard. The controller reads the
   raw stress; only the test is filtered.

A dead-band was needed as well, or the servo chased force noise the bed itself
generates and never went still. It stops itself if contact overlap passes 5% of a
grain diameter, where the soft-disk law stops describing anything real.

**The box will not come out square**, and should not: equal stress on walls of
different lengths means unequal force, and the shape the servos find depends on
the packing.

### Make equal: force, or stress

What was wanted was **the same force on the left wall, the right wall and the lid**.
What the servo above did was equalise **stress** — force divided by wall length —
and since the box it settled into was about twice as wide as it was tall, the lid
carried about twice the force of the side walls: 14.35 kN on the lid against
6.93 kN on each side in that run.

Force is stress times wall length, so the two agree only when the lid and the side
walls are the same length — a square box — and with gravity on, the servo's box
generally is not square: the side walls carry part of the bed's own weight through
the lateral stress ratio, and the lid carries none of it. They are genuinely
different experiments, so both are kept, behind a **make equal** selector under
σ₃:

- **force** (default) — the lid is held at σ₃ by the client's formula,
  σ_t = F_t / L_t, and the right wall is driven to the lid's force. The left wall
  matches the right by statics, so all three carry one force; the floor carries it
  plus the weight of the grains.
- **stress** — σ_t = σ_r = σ₃ exactly, as specified; the forces then differ by
  the ratio of the wall lengths.

Both are one servo with different target forces: F_t* = σ₃·W in both modes, and
F_r* = σ₃·W (force) or σ₃·H (stress). The averages the convergence test reads
are forces now, and the plant gains are the same bulk-modulus model expressed per
newton rather than per pascal.

Measured, 400 grains, σ₃ = 18 kPa:

| | left | right | lid | floor | lid σ | side σ | overlap |
|---|---|---|---|---|---|---|---|
| **force** | 14.51 kN | 14.54 kN | 14.38 kN | 20.98 kN (= lid + W) | 18.28 kPa | 35.9 kPa | 4.71% |
| **stress** | 7.23 kN | 7.14 kN | 15.30 kN | 21.89 kN (= lid + W) | 19.06 kPa | 17.89 kPa | 3.09% |

The stress run started from the force run's end state, so it exercised the servo in
reverse — platens backing off rather than closing in.

One caveat on force mode worth knowing before relying on it: equal force on side
walls half the length of the lid needs **double the stress** on them, 35.9 kPa
against the lid's 18.3, and that compression costs overlap — 4.71% here, just
under the 5% guard. A wider, flatter bed or a higher σ₃ will trip the guard. Raising
k_n buys the margin back; so does a squarer box.

### Why the lid did not match the side walls, and the fix

After the force option shipped, the lid still finished a few percent off the sides
(live: left 14.05, right 14.04, lid 13.43 kN). Three causes, each measured:

1. **Two walls landing in one band.** Each platen was allowed to settle anywhere
   within 3% of the same target force, so the two could finish on opposite edges
   of it, up to about 6% apart, and nothing moved them afterwards.
2. **Consolidated meant stopped.** The bed keeps relaxing after the walls come to
   rest, and with the servo switched off the gap drifted.
3. **The overlap guard halted it mid-way.** Equal force on side walls half the
   lid's length needs twice the pressure on them. At σ₃ = 18 kPa and kₙ = 2 MN/m
   that crosses 5% contact overlap, and the old guard simply stopped: one run
   finished with the lid at 14.7 kN and the sides at 12.6, a 17% gap that no
   tolerance could close because nothing was moving any more.

Force noise was not the problem. On a held bed the lid's force moves 0.3% frame to
frame and the mean of the two side walls 0.25%. Left and right individually wobble
±1.2%, but in opposite directions (correlation −0.93), because the bed sloshes
sideways.

So now:

- **The side walls follow the lid itself, not a number.** Once the lid is loaded,
  the right wall servos the mean of the left and right forces onto the lid's
  measured force, within **0.5%**. A wall that follows the other's force can only
  finish where that force is.
- **Consolidated is a hold.** The servo keeps making tenth-of-a-millimetre
  corrections so the forces stay equal while you read and record them. Moving a
  wall by hand releases it, as do Fill, Tap, Unload and Clear; switching workspace
  drops it.
- **Overlap trades magnitude, never equality.** Past 4.5% overlap the load backs
  off until the contacts are valid again; the forces are still made equal, and the
  note says what the lid actually reached. Raise kₙ to reach the full σ₃.
- **The wall table, records and exports show a half-second running average** of
  each force, so two walls carrying the same load read the same. The physics and
  the servo still read the raw frame.

Measured, 400 grains, σ₃ = 18 kPa:

| kₙ | left | right | lid | lid vs sides | lid σ | overlap |
|---|---|---|---|---|---|---|
| 2 MN/m | 12.767 kN | 12.768 kN | 12.741 kN | −0.21% | 16.41 kPa, load backed off to 92% | 4.42% |
| 8 MN/m | 13.985 kN | 13.985 kN | 14.009 kN | +0.17% | 17.93 kPa, full σ₃ | 2.28% |

Floor minus lid equalled the grains' weight to the newton in both. Held for 90
frames at kₙ = 2 MN/m, the lid stayed within −0.24% to +0.32% of the sides. Stress
mode still converges: lid 17.81, side walls 18.49 and 18.50 kPa.

## Consolidation is about pressure

The force option was built on a mistaken request and has been removed.
**Consolidate now makes the pressure equal** on the left wall, the right wall and
the lid, and there is no selector.

**Pressure** is the force on a wall divided by that wall's own length. The two
side walls are as long as the box is tall, y2 − y1; the lid and the floor are as
long as it is wide, x2 − x1. With lengths in centimetres that is F / (L/100), in
pascals, shown in kPa. The disks are unit thickness, so a wall L metres long
presents L m² of face and this is a genuine pressure.

Equal force comes free only when the walls are the same length, since F = σ·L.
So Consolidate is two steps behind one button:

1. **Square the bed, gently.** With the lid lifted out of the way and nothing
   loaded, the right wall moves to the width at which the grains would stand as
   tall as they are wide (their own area over the packing fraction, square-rooted)
   and they rise or slump to fill it. Nothing is being pressed, so this cannot
   compromise the pressures. **If the bed pushes back instead of rising** (the
   side pressure over the height in contact climbs past four times what the
   grains' own weight explains, or overlap passes 3.5%), squaring stops and the
   shape it has is consolidated as it is. Skipped when already within 2% of square.
2. **Consolidate to equal pressure.** The lid is lowered to the surface and held
   at σ₃. The side walls head for σ₃ too; once the lid is loaded they follow the
   lid's measured pressure, within 0.5%. Consolidated is a hold, released by moving
   a wall by hand, Fill, Tap, Unload or Clear. If σ₃ would push contact overlap
   past 4.5%, the load backs off and the pressures are still made equal.

The floor is the one wall that cannot match: statics puts the grains' weight on
it, so its pressure is the lid's plus W divided by the box width. The left wall is
never driven: with no wall friction (the default) statics makes it equal to the
right exactly; with wall friction the floor and lid can hold part of a sideways
difference, so the left wall can legitimately read lower, and the servo matches
the lid to the average of the two rather than forcing it.

Measured, 400 grains, σ₃ = 18 kPa:

| bed | squaring | box | pressure L / R / lid | floor (predicted) | forces L / R / lid |
|---|---|---|---|---|---|
| default (μ 0.3) | reached | 57.8 × 56.1 cm | 17.87 / 17.87 / 17.87 kPa | 29.34 (29.34) | 10.03 / 10.03 / 10.34 kN |
| μ 1, rolling resistance 0.2 | stopped, bed pushed back | 80.3 × 41.2 cm | 16.90 / 16.91 / 16.94 kPa | 25.15 (25.15) | 6.96 / 6.96 / 13.61 kN |

In the default run the lid carries 3.1% more force than the sides, which is
exactly its extra length (57.8 / 56.1): as close to square as the equations
allowed after loading. In the high-friction run the forces differ by the full
length ratio because the bed would not square, and the load backed off to 93% of
σ₃ to stay under the overlap limit.

### Pressure columns in the records

Each recorded row now has a third group of four columns, **p_x1, p_x2, p_y1,
p_y2 in kPa**, beside the positions and the forces, in the table and in both the
CSV and TXT exports. They are worked out from the row's own positions and forces
rather than stored, so records taken before the columns existed have them too.
Checked by hand on a recorded row: forces 10030.5 / 10030.5 / 16973 / 10343 N over
a 57.83 × 56.10 cm box give 17.88 / 17.88 / 29.35 / 17.89 kPa, which is what the
table shows.

### Two bugs found while testing this

- **Rows recorded during a hold were flagged unsettled.** The flag used the
  strict per-grain stillness test, and a consolidated bed being held is not in the
  settled phase. A bed that is holding now counts as settled.
- **A matched, motionless bed could never finish consolidating.** On the
  high-friction bed the pressures were matched and both platens frozen to a
  hundredth of a millimetre, but total kinetic energy sat at 0.0226 J against a bar
  of 0.0030 J indefinitely. 99.8% of it was load-bearing grains spinning in place
  at a few rad/s; translational energy was 5.4e-5 J. Grains turning where they sit
  move no load, so the finishing test now uses translational energy only. The same
  spin will also keep the strict settle test from ever reporting settled at very
  high rolling resistance.

## Records

A lab notebook rather than a snapshot. **● Record**, in the panel under the other
actions, appends the four wall positions and the four wall forces as they are at
that instant:

| | x₁ cm | x₂ cm | y₁ cm | y₂ cm | F_x1 N | F_x2 N | F_y1 N | F_y2 N |
|---|---|---|---|---|---|---|---|---|

The inputs sit **above** their table, not inside it, and a change of inputs
**starts a new table**. Eight numeric columns interrupted every few rows by a
fifteen-item block are hard to read down; this way every table is a run taken
under one configuration and the eight columns stay eight columns. The inputs are
written out again only when one of them has changed since the last record, and
the value that changed is highlighted with its previous value on hover.

The tables are striped **by pairs of columns** rather than by rows. The eight
readings are four pairs — the two x walls, the two y walls, then their two force
pairs — and tinting alternate pairs is what stops the eye sliding between x₂ and
y₁ halfway across. A heavier rule before column 5 separates positions from
forces.

Two things are deliberately **absent** from that settings block:

- **The walls.** They are the first four columns of every data row already.
- **The display choices** — colour scheme, rotation marks, the measurement
  region. A record should not be re-stamped because you turned a marker on.

**Knowing it worked.** The table is at the foot of the page and usually closed,
so a record that landed and a click that missed look identical from where you are
standing. The button lights and a note appears in the corner of the view —
*"● Recorded — 6 rows"*, amber if the bed was still moving. `#phase` carries the
run state and is left alone.

The two are **one acknowledgement and end together**: `toast()` takes an optional
control to light, and releases it when the note fades. The first version added a
`.flash` class and never took it off, which was invisible under normal motion —
the animation reverts on its own — but under `prefers-reduced-motion: reduce`
that branch set a static green border, so the button stayed lit permanently. The
held state is now the class rather than an animation's last frame, so both
branches behave the same, and the class is removed on the toast's timer.

`button{}` transitions `border-color` over .15s, so the lit state also sets
`transition:none` on the way in — an acknowledgement that fades in is an
acknowledgement you can miss. Dropping the class re-enables the transition, so it
fades back out.

The instructions are not in the pane; they are a **?** beside the Records
heading, which opens the glossary at that section, like every other panel
section. A row taken while the bed was still moving is marked, in the table and
in both exports. Those forces are not equilibrium forces and nothing downstream could
tell that from the numbers alone.

**Download CSV** keeps the table's own structure, with a leading `kind` column so
a spreadsheet can still filter settings lines from data lines. **Download TXT**
is the same content aligned to read as a notebook. Records are kept in this
browser (capped at 4000 entries) and survive a reload; **Clear records** asks
first, because there is no undo.

## Feedback

The notes fold into a **bar at the foot of the page**: one line, closed by
default, opened with a click and closed with another. It carries a count of the
notes on the button, so you can see there is something to read without opening
it, and the Chang Yang credit rides on the same line.

Closed, the whole page fits one viewport with **no scrollbar** — which is the
point. `sizeLab()` measures everything below `#main` and subtracts it, so the bar
and the credit are paid for out of the height budget rather than pushing the page
past the fold. `#fb` itself is deliberately excluded from that sum: when the
notes are open you have asked for them, and the page is expected to scroll;
shrinking the view to fit a form would be the wrong trade.

The bar holds **two panes** — **Notes** on the left, **Records** on the far
right, with the credit filling between them and giving way first when the bar
runs short of room. Clicking the pane already open closes it, so the bar is a
toggle and a switch at once, and which pane you left open is remembered along
with the readout toggle and the text size.

A full-width section, now behind that bar, collects **anonymous, timestamped**
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
