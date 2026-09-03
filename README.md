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

## Feedback

A full-width section at the bottom of the page collects **anonymous, timestamped**
notes into SQLite. No name, no account, no IP is stored — the only optional extra
is a snapshot of the simulation settings, which is the whole reason to collect
this in the page rather than by email: "the wall force looks wrong" is
unactionable, the same sentence with N, mu, k_n and the box dimensions attached
is reproducible in thirty seconds.

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
