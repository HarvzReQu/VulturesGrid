import * as THREE from 'three';
import { createStage } from './scene/stage.js';
import { createFog } from './scene/fog.js';
import { createNodes } from './scene/nodes.js';
import { createLinks } from './scene/links.js';
import { createPulses } from './scene/pulses.js';
import { createVultures } from './scene/vultures.js';
import { createTraceView } from './scene/trace.js';
import { createSwoop } from './scene/swoop.js';
import { createPicker } from './scene/picking.js';
import { buildTopology } from './sim/topology.js';
import { createEngine } from './sim/engine.js';
import { HUNTS, TWIN, STAGES, pickHunt } from './sim/hunts.js';
import { addToRecord } from './sim/record.js';
import { createRecordView } from './ui/recordView.js';
import { createCues } from './audio/cues.js';
import { createReplay } from './sim/replay.js';
import { buildReport } from './sim/scoring.js';
import { applyDifficulty } from './sim/difficulty.js';
import { dailyRound, saveDailyBest } from './sim/daily.js';
import { createKillChain } from './ui/killchain.js';
import { createHuntPanel } from './ui/huntPanel.js';
import { createDossier } from './ui/dossier.js';
import { createWatch } from './ui/watch.js';
import { createTransport } from './ui/transport.js';
import { createTimeline } from './ui/timeline.js';
import { createCaseFile } from './ui/caseFile.js';
import { createHelp } from './ui/help.js';
import { mountLogo } from './ui/logo.js';
import { createSoundToggle } from './ui/soundToggle.js';
import { createAmbience } from './audio/ambience.js';
import { createTutorial } from './ui/tutorial.js';
import { createBeacons } from './ui/beacons.js';
import { createGroundLabels } from './scene/labels.js';
import { STATES } from './sim/states.js';

const REPORT_DELAY_MS = 1600; // let the final state sink in before the Case File lands

// Builds the scene, simulation and UI and starts the frame loop.
// params: URL search params (deep links). Returns hooks the entry point needs.
export function startApp(params) {
  const stage = createStage(document.getElementById('app'));
  const topology = buildTopology();
  const fog = createFog(stage.scene, { dust: stage.lowPower ? 450 : 900 });
  const nodes = createNodes(stage.scene, topology.nodes);
  const links = createLinks(stage.scene, topology, nodes.byId);
  const pulses = createPulses(stage.scene, links);
  const vultures = createVultures(stage.scene, nodes);
  const traceView = createTraceView(stage.scene, links);
  const swoop = createSwoop(stage);
  const engine = createEngine(topology);
  createGroundLabels(stage.scene, topology);
  const replay = createReplay(topology.nodes.map((n) => n.id));

  const logo = mountLogo();
  const ambience = createAmbience();
  createSoundToggle(ambience);
  const help = createHelp({ onTutorial: () => tutorial.start() });
  const killChain = createKillChain(document.getElementById('killchain'), STAGES);
  const transport = createTransport();
  // A playable round for a dropdown choice. The Daily Hunt ignores the difficulty choice.
  const roundFor = (id, difficulty) =>
    id === 'daily' ? applyDifficulty(dailyRound()) : applyDifficulty(pickHunt(id), difficulty);

  const huntPanel = createHuntPanel({
    hunts: [...HUNTS, TWIN],
    onBegin: (id, difficulty) => engine.start(roundFor(id, difficulty)),
    onReset: () => engine.reset(),
  });

  // ---- Scene reactions (shared by live play and replay) ------------------------

  function showState(id, state) {
    const prev = nodes.byId.get(id).state;
    if (prev === state) return;
    nodes.setState(id, state);
    if (state === 'rotting') vultures.gather(id);
    else if (prev === 'rotting') vultures.release(id);
  }

  function playVisual(e) {
    beacons.onVisual(e);
    if (e.type === 'state') showState(e.id, e.state);
    else if (e.type === 'spread') pulses.send(e.path, e.hop);
    else if (e.type === 'stream-start') pulses.startStream(e.id, e.path, e.rate);
    else if (e.type === 'stream-stop') pulses.stopStream(e.id);
  }

  // ---- Replay ------------------------------------------------------------------

  function seek(t) {
    replay.active = true;
    replay.playhead = Math.min(Math.max(0, t), replay.duration);
    pulses.clear();
    traceView.clear();
    for (const [id, state] of replay.statesAt(replay.playhead)) showState(id, state);
    beacons.clear();
    for (const s of replay.streamsAt(replay.playhead)) {
      pulses.startStream(s.id, s.path, s.rate);
      beacons.onVisual(s);
    }
    watch.setCutoff(replay.playhead);
    dossier.render();
  }

  function exitReplay() {
    if (!replay.active) return;
    replay.active = replay.playing = false;
    pulses.clear();
    for (const id of nodes.byId.keys()) showState(id, engine.stateOf(id));
    watch.setCutoff(null);
    dossier.render();
  }

  function stepReplay(simDt) {
    if (!replay.active || !replay.playing) return;
    const from = replay.playhead;
    replay.playhead = Math.min(replay.duration, from + simDt);
    replay.between(from, replay.playhead).forEach(playVisual);
    watch.setCutoff(replay.playhead);
    if (replay.playhead >= replay.duration) replay.playing = false;
  }

  const timeline = createTimeline({
    onSeek: (t) => {
      replay.playing = false;
      seek(t);
    },
    onToggle: () => {
      if (!replay.active || replay.playhead >= replay.duration) seek(0);
      replay.playing = !replay.playing || replay.playhead === 0;
    },
    onExit: exitReplay,
  });

  const caseFile = createCaseFile({
    onReplay: () => {
      seek(0);
      replay.playing = true;
    },
    onNewHunt: () => engine.reset(),
  });

  // ---- Selection, dossier, The Watch ------------------------------------------

  function select(id) {
    const entry = nodes.select(id);
    if (!entry) return dossier.close();
    console.log(`[VulturesGrid] ${entry.data.label} (${entry.data.hostname})`);
    dossier.open(id);
  }

  const dossier = createDossier({
    engine,
    topology,
    viewState: (id) => nodes.byId.get(id).state,
    isLocked: () => replay.active,
    isAllowed: (action) => tutorial.allows(action),
    onClose: () => select(null),
    onAction: (action, id) => {
      if (action === 'isolate') engine.isolate(id);
      else if (action === 'block') engine.block();
      else if (action === 'restore') engine.restore(id);
      else if (action === 'trace') {
        const paths = engine.trace(id);
        if (paths) traceView.show(paths);
      }
      dossier.render();
    },
  });

  const watch = createWatch({
    onSelectNode: (id) => {
      select(id);
      swoop.flyTo(nodes.byId.get(id).port);
    },
  });

  // ---- Engine events -----------------------------------------------------------

  let reportTimer = null;

  // ---- Alert cues and the player's record --------------------------------------------

  const cues = createCues(() => ambience.cueOutput);
  const recordView = createRecordView({ hunts: [...HUNTS, TWIN] });
  const panVec = new THREE.Vector3();
  // Pan a cue toward where its node is on screen.
  const panFor = (id) => {
    const entry = nodes.byId.get(id);
    if (!entry) return 0;
    panVec.copy(entry.port).project(stage.camera);
    return panVec.z > 1 ? 0 : panVec.x;
  };
  const STATE_CUE = { scented: 'scent', rotting: 'rot', revived: 'revive' };

  engine.on((e) => {
    if (!replay.active) {
      if (e.type === 'state' && !e.quiet && STATE_CUE[e.state]) cues.play(STATE_CUE[e.state], panFor(e.id));
      if (e.type === 'action') cues.play(e.action === 'block' ? 'block' : 'act', e.id ? panFor(e.id) : 0);
    }
    if (replay.records(e.type)) {
      if (engine.hunt) replay.record(e, engine.time);
      if (!replay.active) playVisual(e);
    }
    switch (e.type) {
      case 'restore-start':
      case 'restore-end':
        nodes.setRestoring(e.id, e.type === 'restore-start');
        break;
      case 'log':
        watch.add(e.entry);
        if (e.entry.nodeId && e.entry.nodeId === dossier.nodeId) dossier.render();
        break;
      case 'start':
        document.getElementById('hunt-begin').classList.remove('is-nudging');
        break;
      case 'reset':
        exitReplay();
        replay.clear();
        timeline.hide();
        caseFile.close();
        clearTimeout(reportTimer);
        pulses.clear();
        traceView.clear();
        beacons.clear();
        watch.clear();
        for (const id of nodes.byId.keys()) nodes.setRestoring(id, false);
        if (dossier.nodeId) dossier.render();
        break;
      case 'end': {
        replay.finish(engine.time);
        timeline.show(replay.duration);
        const report = buildReport(engine.summary(), topology);
        if (report.daily) {
          saveDailyBest(report.daily.key, { grade: report.grade, score: report.score });
          huntPanel.refresh();
        }
        let note = null;
        if (tutorial.active) {
          note = 'Training complete. You are ready: pick a Hunt at the top right and press Begin.';
        } else {
          const { newBest, previous } = addToRecord(report);
          if (newBest && previous) note = `New personal best on ${report.huntName} (${report.difficulty}): ${report.grade}, up from ${previous.grade}.`;
          recordView.refresh();
        }
        reportTimer = setTimeout(() => {
          caseFile.show(report, note);
          setTimeout(() => cues.play(report.outcome === 'CONTAINED' ? 'stamp' : 'consumed'), 300); // as the stamp lands
        }, REPORT_DELAY_MS);
        break;
      }
    }
  });

  // ---- Tutorial -----------------------------------------------------------------

  const beginBtn = document.getElementById('hunt-begin');
  const tutorial = createTutorial({
    engine,
    nodes,
    stage,
    transport,
    dossier,
    select,
    flyTo: (id) => swoop.flyTo(nodes.byId.get(id).port),
    caseFileOpen: () => document.getElementById('casefile').open,
    setTraining(on) {
      document.body.classList.toggle('is-training', on);
      for (const id of ['hunt-begin', 'hunt-reset', 'hunt-select']) document.getElementById(id).disabled = on;
      huntPanel.refresh(); // difficulty buttons follow the lock
    },
    onFinish(completed) {
      beginBtn.classList.add('is-nudging');
      if (!completed) select(null);
    },
  });
  document.getElementById('tutorial-open').addEventListener('click', () => tutorial.start());

  // ---- Pinpoints and hover tooltip -------------------------------------------------

  const flyToNode = (id) => {
    select(id);
    swoop.flyTo(nodes.byId.get(id).port);
  };
  const beacons = createBeacons({
    stage,
    nodes,
    topology,
    outsideId: topology.outside.id,
    now: () => simTime,
    onPick: flyToNode,
  });

  const tip = document.getElementById('hover-tip');
  function hover(id, x, y) {
    if (!id) {
      tip.hidden = true;
      return;
    }
    const node = topology.byId.get(id);
    const state = nodes.byId.get(id).state;
    tip.innerHTML = `<b>${node.label}</b><span>${node.hostname} · ${node.ip}</span><em data-state="${state}"><i></i>${STATES[state].name} · ${STATES[state].plain}</em>`;
    tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
    tip.hidden = false;
  }

  createPicker(stage, nodes, select, flyToNode, hover);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') select(null);
  });

  // ---- Main loop -----------------------------------------------------------------

  const clock = new THREE.Clock();
  let time = 0; // real time, for ambient animation
  let simTime = 0; // scaled by speed; frozen while paused

  // Advance everything by dt real seconds; the simulation itself runs at the chosen speed.
  function tick(dt, scale = transport.scale) {
    const simDt = dt * scale;
    time += dt;
    simTime += simDt;
    engine.update(simDt);
    stepReplay(simDt);
    pulses.update(simDt);
    vultures.update(simDt, simTime);
    traceView.update(simDt);
    fog.update(dt, time);
    links.update(dt);
    nodes.update(dt, time);
    swoop.update(dt);
  }

  function rotCount() {
    let n = 0;
    for (const entry of nodes.byId.values()) if (entry.state === 'rotting') n++;
    return n;
  }

  // Deep link: ?hunt=lure starts that Hunt immediately (&skip=10 fast-forwards,
  // &focus=hq-db frames a node; handy for screenshots).
  if (params.has('hunt')) {
    huntPanel.setValue(params.get('hunt'));
    engine.start(roundFor(params.get('hunt'), params.get('level') ?? undefined));
    for (let s = Number(params.get('skip')) || 0; s > 0; s -= 0.05) tick(0.05, 1);
  }
  if (params.has('daily')) huntPanel.setValue('daily');
  const focus = nodes.byId.get(params.get('focus'));
  if (focus) {
    stage.controls.target.copy(focus.port);
    stage.camera.position.copy(focus.port).add(new THREE.Vector3(7, 9, 11));
    select(focus.data.id);
  }

  stage.renderer.setAnimationLoop(() => {
    tick(Math.min(clock.getDelta(), 0.1));
    killChain.update(replay.active ? replay.chainView : engine);
    huntPanel.update(engine, replay.active ? replay.playhead : null);
    timeline.update(replay.playhead, replay.playing, replay.active);
    const rotting = rotCount();
    logo.setThreat(rotting > 0);
    ambience.setThreat(rotting);
    dossier.tick();
    beacons.update();
    tutorial.update();
    if (stage.controls.enabled) stage.controls.update();
    stage.render();
  });

  return {
    showHelpIfFirstVisit: () => help.showIfFirstVisit(),
    startTutorial: () => tutorial.start(),
  };
}
