# VulturesGrid

> *We circle what is already rotten.*

**VulturesGrid** is a browser-based 3D network game from **The Vultures**. You play a Vulture: a watcher who spots decay spreading through a company network early and contains it before it consumes the whole carcass.

It is a visual game only. There is no real networking, scanning or security tooling. Every node, hostname, IP address and bit of "traffic" is made up and drawn as shapes and particles in Three.js. Everything runs in the browser, with no backend.

**Live demo:** [vulturesgrid.vercel.app](https://vulturesgrid.vercel.app)

---

## Screenshots

| | |
|---|---|
| ![The Rot spreading around the ring, vultures circling](docs/screenshots/overview.png) | ![Dossier open on a rotting database during The Bleed](docs/screenshots/dossier.png) |
| *The Rot leaping branch to branch* | *A dossier, The Watch and the Bleed stream* |
| ![Case File stamped CONTAINED](docs/screenshots/casefile.png) | ![Loading screen with the skull emblem](docs/screenshots/loading.png) |
| *The end-of-round Case File* | *The loading screen* |

## Features

- **The Carcass:** an HQ data center (core router, firewall, web, domain, file and database servers) ringed by six branch offices. Each node type has its own low-poly shape: tall monoliths for servers, flat panels for workstations, spinning octahedrons for routers and jagged bone walls for firewalls.
- **Four Hunts** (or Random), each a different spreading pattern. Every round is rebuilt when it starts: The Lure and The Rot begin at a random branch, The Lure aims at a random HQ server, The Rot circles in a random direction, and the lateral targets in The Siege and The Bleed shift between rounds.
  - **The Lure** hops node by node from a branch workstation to the HQ domain controller.
  - **The Rot** leaps from branch to branch around the ring.
  - **The Siege** sends a swarm from off-map at the web server until it gives way.
  - **The Bleed** drains a red stream from the database off the map.
- **Node states**, always shown with a plain meaning:

  | State | Meaning | Look |
  |---|---|---|
  | Alive | Healthy | bone white |
  | Scented | Suspicious | amber pulse |
  | Rotting | Compromised | crimson, cracks, flicker, vultures circling |
  | Picked Clean | Quarantined | ash gray, wireframe cage |
  | Revived | Restored | white flash, then back to bone |

- **Vultures:** low-poly birds glide in, circle and cast shadows over every rotting node. They scatter when it recovers.
- **Kill chain bar:** four bone segments (Initial Access → Execution → Lateral Movement → Impact) that darken to crimson as a Hunt advances.
- **Dossier panel and four actions**, each with a cooldown:
  - **Isolate:** quarantine a node; nothing passes through it.
  - **Block:** blocklist the outside source; its traffic bounces off the firewall.
  - **Restore:** revive a rotting node after 5 seconds.
  - **Trace:** draw the path the rot took, in crimson.
- **The Watch:** a live event log with INFO / WARN / CRIT tags, search and a severity filter. Click a row to fly to its node.
- **Pause and 0.5× / 1× / 2× speed**, and a smooth spiralling camera swoop when you double-click a node.
- **Case File:** an end-of-round report styled as a stamped investigative document (**CONTAINED** or **CONSUMED**). No two read alike. Each one includes:
  - an **analyst profile** based on how you played, such as *The Gatekeeper*, *The Surgeon*, *Scorched Earth*, *The Bystander* or *Bled Dry*
  - **marks** earned that round, such as Clean Bones, Quick Talons, Patient Zero, Crown Intact or Firebreak
  - a summary written from the round's own facts: where the rot began, the turning point and the near misses
  - a case number and an A–F grade
  - time to first response, when the red was cleared, nodes lost and data lost
  - a timeline and a list of actions taken
- **Replay:** after a round, scrub the timeline to any moment and watch it play back.
- **Share result:** post your grade straight from the Case File, using the phone share sheet or a clipboard copy.
- **Ambient sound** (off by default; speaker button or `M`): wind gusts, a low rumble, and distant wingbeats that come more often as the rot spreads. It's all generated live with the Web Audio API, with no audio files.
- **Interactive tutorial:** a guided Training Hunt that walks you through spotting a Scented node, opening its dossier, Isolate, Restore, Trace and Block, then The Watch, speed controls and your first Case File. The Hunt waits at each lesson until you've done the step. It's offered on the first visit and in the Hunt panel, and `?tutorial` opens it directly.
- **Polish:**
  - a loading screen where the skull emblem fades in and the tagline types itself out
  - a **How to Hunt** guide on first visit
  - a logo that pulses while anything rots
  - bottom-sheet panels on phones

## Tech stack

- [Vite](https://vitejs.dev/) with vanilla JavaScript (ES modules, no framework)
- [Three.js](https://threejs.org/) for rendering, `OrbitControls`, shadows and custom geometry
- Plain CSS, with Cormorant Garamond and JetBrains Mono from Google Fonts
- No backend: a static site that deploys to Vercel with zero config

## Local setup

Requires Node.js 18 or newer.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in /dist
npm run preview   # serve the /dist build locally
```

Handy deep links for development or sharing:

- `?hunt=bleed` starts a Hunt immediately. Use `lure`, `rot`, `siege`, `bleed` or `random`.
- `&skip=15` fast-forwards that many seconds.
- `&focus=hq-db` frames a node and opens its dossier.
- `?tutorial` jumps straight into the guided Training Hunt.

## Deploying to Vercel

Import the repository in Vercel. It detects Vite automatically: the build command is `npm run build` and the output directory is `dist`. No configuration file is needed.

## Project structure

```
src/
  main.js            wires everything together and runs the frame loop
  style.css
  scene/             Three.js: stage, fog, nodes, links, pulses, vultures, trace, camera swoop, picking
  sim/               game logic, no rendering
    topology.js      the map: nodes, layout, links
    hunts.js         Hunt definitions (data-only timelines)
    engine.js        plays a Hunt, owns node states, actions, cooldowns, the event log
    replay.js        records a round for the timeline scrubber
    scoring.js       grades a round and builds the Case File
    states.js        state names and meanings
  ui/                DOM panels: kill chain, Hunt panel, dossier, The Watch, timeline,
                     Case File, help modal, loading screen, logo
  assets/
    skull.svg        the vulture skull emblem
```

### Adding a Hunt

Hunts live in [`src/sim/hunts.js`](src/sim/hunts.js). Each one has a `build(rand)` function that returns a list of timed steps, such as `scent`, `rot`, `spread`, `stream` and `stream-stop`, so every round can differ. The step format is documented at the top of that file. Add an object to `HUNTS`; it appears in the dropdown automatically, and you don't need to change the engine.

Grading weights, analyst profiles and marks all live in [`src/sim/scoring.js`](src/sim/scoring.js).

---

VulturesGrid by The Vultures. Educational game, all activity simulated.
