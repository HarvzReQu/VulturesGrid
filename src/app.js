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
import { HUNTS, STAGES, pickHunt } from './sim/hunts.js';
import { createReplay } from './sim/replay.js';
import { buildReport } from './sim/scoring.js';
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
  const replay = createReplay(topology.nodes.map((n) => n.id));

  const logo = mountLogo();
  const ambience = createAmbience();
  createSoundToggle(ambience);
  const help = createHelp({ onTutorial: () => tutorial.start() });
  const killChain = createKillChain(document.getElementById('killchain'), STAGES);
  const transport = createTransport();
  const huntPanel = createHuntPanel({
    hunts: HUNTS,
    onBegin: (id) => engine.start(pickHunt(id)),
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
    for (const s of replay.streamsAt(replay.playhead)) pulses.startStream(s.id, s.path, s.rate);
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

  engine.on((e) => {
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
        watch.clear();
        for (const id of nodes.byId.keys()) nodes.setRestoring(id, false);
        if (dossier.nodeId) dossier.render();
        break;
      case 'end': {
        replay.finish(engine.time);
        timeline.show(replay.duration);
        const report = buildReport(engine.summary(), topology);
        const note = tutorial.active
        ? 'Training complete. You are ready: pick a Hunt at the top right and press Begin.'
        : null;
      reportTimer = setTimeout(() => caseFile.show(report, note), REPORT_DELAY_MS);
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
    },
    onFinish(completed) {
      beginBtn.classList.add('is-nudging');
      if (!completed) select(null);
    },
  });
  document.getElementById('tutorial-open').addEventListener('click', () => tutorial.start());

  createPicker(stage, nodes, select, (id) => {
    select(id);
    swoop.flyTo(nodes.byId.get(id).port);
  });

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
    engine.start(pickHunt(params.get('hunt')));
    for (let s = Number(params.get('skip')) || 0; s > 0; s -= 0.05) tick(0.05, 1);
  }
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
    tutorial.update();
    if (stage.controls.enabled) stage.controls.update();
    stage.render();
  });

  return {
    showHelpIfFirstVisit: () => help.showIfFirstVisit(),
    startTutorial: () => tutorial.start(),
  };
}
