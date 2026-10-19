import * as THREE from 'three';
import { STATES } from '../sim/states.js';

// Pinpoints over the nodes that matter right now:
//   incoming  crosshair on a node the rot is heading for (a pulse in flight, a flood aimed at it)
//   leak      a node streaming data off the map
//   rotting   crimson "!"      scented  amber "?"
// Pins for nodes off-screen stick to the screen edge with an arrow pointing toward them.
// Clicking a pin calls onPick(nodeId). now() returns the current sim time.

const KINDS = {
  incoming: { icon: '◎', label: 'Incoming', rank: 4 },
  leak: { icon: '⇪', label: 'Leaking data', rank: 3 },
  rotting: { icon: '!', label: STATES.rotting.name, rank: 2 },
  scented: { icon: '?', label: STATES.scented.name, rank: 1 }, // shape differs from Rotting, not just color
};
const EDGE_PAD = 26;

export function createBeacons({ stage, nodes, topology, outsideId, now, onPick }) {
  const layer = document.getElementById('beacons');
  const pins = new Map(); // node id -> element
  const incoming = new Map(); // node id -> sim time the threat arrives (Infinity while a stream runs)
  const streamTargets = new Map(); // stream id -> { node, kind }
  const v = new THREE.Vector3();

  layer.addEventListener('click', (e) => {
    const pin = e.target.closest('[data-node]');
    if (pin) onPick(pin.dataset.node);
  });

  // ---- Fed from the same visual events as the scene (live play and replay) ----

  function onVisual(e) {
    if (e.type === 'spread') {
      const target = e.path.at(-1);
      // A bounced pulse ends where it started: nothing is actually incoming.
      if (target !== e.path[0] && target !== outsideId) incoming.set(target, now() + e.hop * (e.path.length - 1));
    } else if (e.type === 'stream-start') {
      const [first, last] = [e.path[0], e.path.at(-1)];
      streamTargets.delete(e.id);
      if (first === last) return; // bounced off the blocklist or an isolated node
      if (last === outsideId) streamTargets.set(e.id, { node: first, kind: 'leak' });
      else streamTargets.set(e.id, { node: last, kind: 'incoming' });
    } else if (e.type === 'stream-stop') {
      streamTargets.delete(e.id);
    }
  }

  function clear() {
    incoming.clear();
    streamTargets.clear();
  }

  // ---- Per frame ---------------------------------------------------------------

  function wanted(simTime) {
    const want = new Map();
    const put = (id, kind) => {
      const cur = want.get(id);
      if (!cur || KINDS[kind].rank > KINDS[cur].rank) want.set(id, kind);
    };
    for (const [id, entry] of nodes.byId) {
      if (entry.state === 'rotting' || entry.state === 'scented') put(id, entry.state);
    }
    for (const [id, until] of incoming) {
      const state = nodes.byId.get(id)?.state;
      if (until < simTime || state === 'rotting' || state === 'picked') incoming.delete(id);
      else put(id, 'incoming');
    }
    for (const { node, kind } of streamTargets.values()) put(node, kind);
    return want;
  }

  // Screen area pins may use: clear of the side panels and the bottom controls.
  function safeRect() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rect = { left: EDGE_PAD, top: 110, right: w - EDGE_PAD, bottom: h - 70 };
    const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
    if (sidebar && sidebar.width) {
      if (sidebar.left > w / 2) rect.right = Math.min(rect.right, sidebar.left - EDGE_PAD);
      else if (sidebar.top > h / 3) rect.bottom = Math.min(rect.bottom, sidebar.top - EDGE_PAD);
    }
    const dossier = document.getElementById('dossier');
    if (dossier && !dossier.hidden) {
      const d = dossier.getBoundingClientRect();
      if (d.right < w / 2) rect.left = Math.max(rect.left, d.right + EDGE_PAD);
      else if (d.top > h / 3) rect.bottom = Math.min(rect.bottom, d.top - EDGE_PAD);
    }
    return rect;
  }

  function pinFor(id) {
    let pin = pins.get(id);
    if (!pin) {
      pin = document.createElement('button');
      pin.className = 'beacon';
      pin.dataset.node = id;
      pin.innerHTML =
        '<span class="beacon-arrow"></span><span class="beacon-icon"><span class="beacon-glyph"></span></span><span class="beacon-label"></span>';
      layer.appendChild(pin);
      pins.set(id, pin);
    }
    return pin;
  }

  // Where a node's pin goes: on screen above the node, or clamped to the safe edge.
  function place(id, frame) {
    const entry = nodes.byId.get(id);
    v.copy(entry.port).setY(entry.top + 1.1).project(stage.camera);
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * window.innerWidth;
    let y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    if (behind) {
      x = 2 * frame.cx - x;
      y = 2 * frame.cy - y;
    }
    const dx = x - frame.cx;
    const dy = y - frame.cy;
    const overflow = Math.max(Math.abs(dx) / frame.halfW, Math.abs(dy) / frame.halfH);
    const edge = behind || overflow > 1;
    if (edge) {
      const k = 1 / Math.max(overflow, 1e-6);
      x = frame.cx + dx * k;
      y = frame.cy + dy * k;
    }
    return { x, y, edge, angle: Math.atan2(dy, dx) };
  }

  function update() {
    const want = wanted(now());
    const rect = safeRect();
    const frame = {
      cx: (rect.left + rect.right) / 2,
      cy: (rect.top + rect.bottom) / 2,
      halfW: (rect.right - rect.left) / 2,
      halfH: (rect.bottom - rect.top) / 2,
    };

    // Off-screen pins pointing at the same branch collapse into one, led by the most urgent.
    const shown = [];
    const edgeGroups = new Map();
    for (const [id, kind] of want) {
      const p = { id, kind, ...place(id, frame) };
      if (!p.edge) {
        shown.push(p);
        continue;
      }
      const cluster = topology.byId.get(id).cluster;
      const group = edgeGroups.get(cluster);
      if (!group) edgeGroups.set(cluster, { lead: p, count: 1 });
      else {
        group.count++;
        if (KINDS[kind].rank > KINDS[group.lead.kind].rank) group.lead = p;
      }
    }
    for (const { lead, count } of edgeGroups.values()) shown.push({ ...lead, count });

    const visible = new Set(shown.map((p) => p.id));
    for (const [id, pin] of pins) {
      if (!visible.has(id)) {
        pin.remove();
        pins.delete(id);
      }
    }

    for (const p of shown) {
      const node = topology.byId.get(p.id);
      const pin = pinFor(p.id);
      const label =
        p.count > 1
          ? `${KINDS[p.kind].label} ×${p.count} · ${node.site}`
          : `${KINDS[p.kind].label} · ${node.hostname}`;
      if (pin.dataset.label !== label) {
        pin.dataset.label = label;
        pin.dataset.kind = p.kind;
        pin.querySelector('.beacon-glyph').textContent = KINDS[p.kind].icon;
        pin.querySelector('.beacon-label').textContent = label;
        pin.setAttribute('aria-label', p.count > 1 ? label : `${KINDS[p.kind].label}: ${node.label}`);
      }
      if (p.edge) pin.querySelector('.beacon-arrow').style.transform = `rotate(${p.angle}rad)`;
      // On the right half, the label goes to the left of the pin so it stays on screen.
      const right = p.x > frame.cx;
      pin.classList.toggle('is-edge', p.edge);
      pin.classList.toggle('is-right', right);
      pin.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)${right ? ' translateX(calc(-100% + 26px))' : ''}`;
    }
  }

  // Everything currently pinned, most urgent first (used by keyboard navigation).
  const PRIORITY = { rotting: 0, leak: 1, incoming: 2, scented: 3 };
  function threats() {
    return [...wanted(now())]
      .map(([id, kind]) => ({ id, kind }))
      .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.id.localeCompare(b.id));
  }

  return { onVisual, clear, update, threats };
}
