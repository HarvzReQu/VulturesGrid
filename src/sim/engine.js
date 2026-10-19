import { OUTSIDE_ID } from './topology.js';
import { STAGES } from './hunts.js';

const DEFAULT_HOP = 1.0; // seconds per link for a spread pulse
const DEFAULT_DWELL = 1.5; // seconds a node stays Scented before Rotting
const REVIVE_TIME = 1.4; // seconds a node shows Revived before returning to Alive
export const RESTORE_TIME = 5;
export const COOLDOWNS = { isolate: 6, block: 20, restore: 10, trace: 4 };

const STATE_LOG = {
  scented: ['WARN', (h) => `${h} scented: suspicious activity`],
  rotting: ['CRIT', (h) => `${h} rotting: compromised`],
  picked: ['INFO', (h) => `${h} picked clean: isolated by analyst`],
  revived: ['INFO', (h) => `${h} revived: restored`],
};

// Plays back a Hunt timeline and owns every node's state and the analyst actions.
// Purely logical: the scene listens to emitted events and animates them.
// Advance it with update(dt) in sim time.
export function createEngine(topology) {
  const adjacency = new Map();
  const connect = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push(b);
  };
  for (const link of topology.links) {
    connect(link.from, link.to);
    connect(link.to, link.from);
  }

  const state = new Map(topology.nodes.map((n) => [n.id, 'alive']));
  const listeners = new Set();
  const streams = new Map();
  const cause = new Map(); // node id -> path the rot took to reach it
  const isolatedFrom = new Map(); // node id -> state it had when isolated
  const restoring = new Map(); // node id -> clock time the restore completes
  let readyAt = {};
  let timers = [];
  let clock = 0;
  let log = [];

  let hunt = null;
  let stageStarts = [];
  let time = 0;
  let cursor = 0;
  let running = false;
  let finished = false;
  let stageIndex = -1;
  let dataLostMB = 0;
  let blocked = false;
  let outsideIp = '';

  // Round stats for the Case File.
  let firstAlertAt = null;
  let firstActionAt = null;
  let clearedAt = null; // when the last Rotting node stopped rotting (null while any still rot)
  let actions = [];
  const everRotted = new Set();

  const emit = (event) => listeners.forEach((fn) => fn(event));
  const schedule = (delay, fn) => timers.push({ at: clock + delay, fn });
  const host = (id) => (id === OUTSIDE_ID ? outsideIp : topology.byId.get(id).hostname);

  function record(level, message, nodeId = null) {
    if (hunt && level !== 'INFO' && firstAlertAt === null) firstAlertAt = time;
    const entry = { time, level, message, nodeId };
    log.push(entry);
    emit({ type: 'log', entry });
  }

  function setState(id, next, { quiet = false } = {}) {
    const prev = state.get(id);
    if (prev === next) return;
    state.set(id, next);
    if (hunt) trackContainment(id, next);
    emit({ type: 'state', id, state: next, prev });
    if (!quiet && STATE_LOG[next]) {
      const [level, text] = STATE_LOG[next];
      record(level, text(host(id)), id);
    }
    if (next === 'revived') {
      schedule(REVIVE_TIME, () => state.get(id) === 'revived' && setState(id, 'alive', { quiet: true }));
    }
  }

  function trackContainment(id, next) {
    if (next === 'rotting') everRotted.add(id);
    if (countState('rotting') > 0) clearedAt = null;
    else if (everRotted.size && clearedAt === null) clearedAt = time;
  }

  function findPath(from, to) {
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const id = queue.shift();
      if (id === to) break;
      for (const next of adjacency.get(id) ?? []) {
        if (!prev.has(next)) {
          prev.set(next, id);
          queue.push(next);
        }
      }
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let id = to; id !== null; id = prev.get(id)) path.unshift(id);
    return path;
  }

  // Where particles on `path` actually go: cut short at an isolated node or at the
  // blocklist, then bounced back the way they came.
  function travel(path) {
    let cut = path.length;
    let at = null;
    const k = path.findIndex((id, i) => i > 0 && state.get(id) === 'picked');
    if (k !== -1) {
      cut = k;
      at = path[k];
    }
    if (blocked) {
      const o = path[0] === OUTSIDE_ID ? 2 : path.indexOf(OUTSIDE_ID);
      if (o > 0 && o < cut) {
        cut = o;
        at = OUTSIDE_ID;
      }
    }
    if (cut === path.length) return { path, stopped: false };
    const prefix = path.slice(0, cut);
    return { path: prefix.concat(prefix.slice(0, -1).reverse()), stopped: true, at };
  }

  const stoppedBy = (at) => (at === OUTSIDE_ID ? 'the blocklist' : `${host(at)} (isolated)`);

  function emitStream(stream) {
    const route = travel(stream.path);
    stream.effective = !route.stopped;
    emit({ type: 'stream-start', id: stream.id, path: route.path, rate: stream.rate });
  }

  function stopStream(id) {
    if (!streams.delete(id)) return;
    emit({ type: 'stream-stop', id });
  }

  // Re-route every stream after an isolation or block changes what can get through.
  function rerouteStreams() {
    for (const stream of streams.values()) {
      const wasEffective = stream.effective;
      emitStream(stream);
      if (wasEffective && !stream.effective) {
        record('INFO', `Stream ${stream.id} stopped at ${stoppedBy(travel(stream.path).at)}`, stream.path.at(-1));
      }
    }
  }

  function spread(step) {
    if (step.from !== OUTSIDE_ID && state.get(step.from) !== 'rotting') return;
    const path = findPath(step.from, step.to);
    if (!path) return;
    const hop = step.hop ?? DEFAULT_HOP;
    const dwell = step.dwell ?? DEFAULT_DWELL;
    const route = travel(path);
    emit({ type: 'spread', path: route.path, hop });
    if (route.stopped) {
      record('INFO', `Movement toward ${host(step.to)} stopped at ${stoppedBy(route.at)}`, step.to);
      return;
    }
    record('WARN', `Movement ${host(step.from)} → ${host(step.to)} (${path.length - 1} hop${path.length > 2 ? 's' : ''})`, step.to);
    const arrival = hop * (path.length - 1);
    schedule(arrival, () => {
      // Something isolated or blocked mid-flight still stops it.
      if (travel(path).stopped || state.get(step.to) !== 'alive') return;
      cause.set(step.to, path);
      setState(step.to, 'scented');
    });
    schedule(arrival + dwell, () => {
      if (state.get(step.to) === 'scented') setState(step.to, 'rotting');
    });
  }

  function runStep(step) {
    if (step.stage !== undefined) {
      stageIndex = step.stage;
      emit({ type: 'stage', index: stageIndex, name: STAGES[stageIndex] });
      record('INFO', `Kill chain advanced: ${STAGES[stageIndex]}`);
    }
    const via = step.requires && streams.get(step.requires);
    if (step.requires && !via?.effective) return;

    switch (step.do) {
      case 'scent':
        if (state.get(step.node) === 'alive') setState(step.node, 'scented');
        break;
      case 'rot':
        if (state.get(step.node) === 'picked') break;
        if (via) cause.set(step.node, via.path);
        setState(step.node, 'rotting');
        break;
      case 'spread':
        spread(step);
        break;
      case 'stream': {
        const existing = streams.get(step.id);
        if (step.update && !existing) break;
        const stream = { id: step.id, path: step.path, rate: step.rate, leak: step.leak ?? 0 };
        streams.set(step.id, stream);
        emitStream(stream);
        if (!existing) {
          const [first, last] = [step.path[0], step.path.at(-1)];
          if (first === OUTSIDE_ID) record('WARN', `Inbound flood from ${outsideIp} toward ${host(last)}`, last);
          else record('CRIT', `Outbound stream ${host(first)} → ${outsideIp}`, first);
        }
        break;
      }
      case 'stream-stop':
        stopStream(step.id);
        break;
    }
  }

  function update(dt) {
    clock += dt;
    if (timers.length) {
      const due = timers.filter((t) => t.at <= clock);
      if (due.length) {
        timers = timers.filter((t) => t.at > clock);
        due.forEach((t) => t.fn());
      }
    }

    if (!running) return;
    time += dt;
    const steps = hunt.steps;
    while (cursor < steps.length && steps[cursor].at <= time) runStep(steps[cursor++]);

    for (const stream of streams.values()) {
      const source = stream.path[0];
      // A stream sourced from a node dries up once that node is no longer Rotting.
      if (source !== OUTSIDE_ID && state.get(source) !== 'rotting') {
        stopStream(stream.id);
        record('INFO', `Stream from ${host(source)} dried up`, source);
        continue;
      }
      if (stream.effective) dataLostMB += stream.leak * dt;
    }

    // The Hunt ends at its duration, but lets any Restore already underway finish first.
    if (cursor >= steps.length && time >= hunt.duration && restoring.size === 0) {
      running = false;
      finished = true;
      [...streams.keys()].forEach(stopStream);
      const rotting = countState('rotting');
      record(rotting ? 'CRIT' : 'INFO', rotting ? `Hunt over: ${rotting} node(s) still rotting` : 'Hunt over: all rot contained');
      emit({ type: 'end', hunt, rotting });
    }
  }

  // ---- Analyst actions -------------------------------------------------------

  const cooldown = (action) => Math.max(0, (readyAt[action] ?? 0) - clock);

  function act(action, id = null) {
    if (hunt && firstActionAt === null) firstActionAt = time;
    actions.push({ time, action, id });
    emit({ type: 'action', action, id });
  }

  function spend(action) {
    if (cooldown(action) > 0) return false;
    readyAt[action] = clock + COOLDOWNS[action];
    return true;
  }

  const wasRotting = (id) => state.get(id) === 'rotting' || (state.get(id) === 'picked' && isolatedFrom.get(id) === 'rotting');

  function isolate(id) {
    if (state.get(id) === 'picked') {
      // Release: back to Rotting if it was isolated while Rotting, otherwise healthy.
      const before = isolatedFrom.get(id);
      isolatedFrom.delete(id);
      setState(id, before === 'rotting' ? 'rotting' : 'revived', { quiet: true });
      record(before === 'rotting' ? 'WARN' : 'INFO', `${host(id)} released from quarantine`, id);
      rerouteStreams();
      act('release', id);
      return true;
    }
    if (!spend('isolate')) return false;
    isolatedFrom.set(id, state.get(id));
    setState(id, 'picked');
    rerouteStreams();
    act('isolate', id);
    return true;
  }

  function block() {
    if (blocked || !hunt || !spend('block')) return false;
    blocked = true;
    record('INFO', `${outsideIp} added to the firewall blocklist`);
    rerouteStreams();
    act('block');
    return true;
  }

  function restore(id) {
    if (!wasRotting(id) || restoring.has(id) || !spend('restore')) return false;
    restoring.set(id, clock + RESTORE_TIME);
    record('INFO', `Restore started on ${host(id)} (${RESTORE_TIME}s)`, id);
    emit({ type: 'restore-start', id });
    act('restore', id);
    schedule(RESTORE_TIME, () => {
      restoring.delete(id);
      emit({ type: 'restore-end', id });
      if (!wasRotting(id)) return;
      isolatedFrom.delete(id);
      setState(id, 'revived');
      rerouteStreams();
    });
    return true;
  }

  // Walks back through each node's infection path to the origin.
  function tracePaths(id) {
    const paths = [];
    const seen = new Set();
    for (let cur = id; cause.has(cur) && !seen.has(cur); cur = cause.get(cur)[0]) {
      seen.add(cur);
      paths.unshift(cause.get(cur));
    }
    return paths;
  }

  function trace(id) {
    const paths = tracePaths(id);
    if (!paths.length || !spend('trace')) return null;
    const origin = paths[0][0];
    record('INFO', `Trace on ${host(id)}: ${paths.length} leg(s) back to ${host(origin)}`, id);
    act('trace', id);
    return paths;
  }

  // ---- Lifecycle -------------------------------------------------------------

  function reset() {
    timers = [];
    [...streams.keys()].forEach(stopStream);
    restoring.clear();
    isolatedFrom.clear();
    cause.clear();
    for (const [id, s] of state) if (s !== 'alive') setState(id, 'revived', { quiet: true });
    hunt = null;
    running = false;
    finished = false;
    stageIndex = -1;
    time = 0;
    cursor = 0;
    dataLostMB = 0;
    blocked = false;
    readyAt = {};
    log = [];
    firstAlertAt = null;
    firstActionAt = null;
    clearedAt = null;
    actions = [];
    everRotted.clear();
    emit({ type: 'reset' });
  }

  function start(def) {
    reset();
    hunt = def;
    stageStarts = STAGES.map((_, i) => def.steps.find((s) => s.stage === i)?.at ?? def.duration);
    outsideIp = `203.0.113.${20 + Math.floor(Math.random() * 200)}`; // documentation range, never routable
    running = true;
    emit({ type: 'start', hunt });
    record('INFO', `Hunt begins: ${def.name}`);
  }

  function stageProgress(i) {
    if (!hunt || i > stageIndex) return 0;
    if (i < stageIndex || finished) return 1;
    const end = stageStarts[i + 1] ?? hunt.duration;
    return Math.min(1, Math.max(0, (time - stageStarts[i]) / Math.max(0.001, end - stageStarts[i])));
  }

  // Everything the Case File needs once the Hunt is over.
  function summary() {
    return {
      hunt,
      duration: hunt?.duration ?? 0,
      outsideIp,
      firstAlertAt,
      firstResponse: firstActionAt === null ? null : Math.max(0, firstActionAt - (firstAlertAt ?? 0)),
      clearedAt: countState('rotting') === 0 && everRotted.size ? clearedAt : null,
      nodesLost: [...everRotted],
      stillRotting: countState('rotting'),
      isolated: countState('picked'),
      dataLostMB,
      actions: [...actions],
      log: [...log],
    };
  }

  function countState(s) {
    let n = 0;
    for (const v of state.values()) if (v === s) n++;
    return n;
  }

  return {
    on: (fn) => listeners.add(fn),
    start,
    reset,
    update,
    stageProgress,
    countState,
    summary,
    isolate,
    block,
    restore,
    trace,
    cooldown,
    stateOf: (id) => state.get(id),
    canRestore: (id) => wasRotting(id) && !restoring.has(id),
    canTrace: (id) => cause.has(id),
    restoreProgress: (id) => (restoring.has(id) ? 1 - (restoring.get(id) - clock) / RESTORE_TIME : null),
    get hunt() {
      return hunt;
    },
    get time() {
      return time;
    },
    get running() {
      return running;
    },
    get finished() {
      return finished;
    },
    get stageIndex() {
      return stageIndex;
    },
    get dataLostMB() {
      return dataLostMB;
    },
    get blocked() {
      return blocked;
    },
    get outsideIp() {
      return outsideIp;
    },
    get log() {
      return log;
    },
  };
}
