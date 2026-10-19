import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from './palette.js';
import { crackTexture } from './textures.js';

// Height at which links attach to each node type.
const PORT_HEIGHT = { server: 1.1, workstation: 0.6, router: 1.3, firewall: 0.9 };
const RING_SCALE = { server: 1, workstation: 1, router: 1, firewall: 1.5 };
// Quarantine cage dimensions: [radius, height].
const CAGE_SIZE = { server: [1.15, 3.7], workstation: [1.25, 1.9], router: [1.15, 2.5], firewall: [1.85, 2.6] };

const STATE_COLOR = {
  alive: new THREE.Color(PALETTE.bone),
  scented: new THREE.Color(PALETTE.amber),
  rotting: new THREE.Color(PALETTE.crimson),
  picked: new THREE.Color(PALETTE.ash),
  revived: new THREE.Color(PALETTE.flash),
};
const BONE = STATE_COLOR.alive;
const BLACK = new THREE.Color(0x000000);
const RED_GLOW = new THREE.Color(PALETTE.blood);

function jaggedWallGeometry() {
  const width = 2.8;
  const spikes = 8;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  for (let i = spikes; i >= 0; i--) {
    const x = -width / 2 + (i / spikes) * width;
    const h = i % 2 === 0 ? 1.25 + ((i * 37) % 5) * 0.1 : 1.85 + ((i * 53) % 4) * 0.16;
    shape.lineTo(x, h);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
  geo.translate(0, 0, -0.175);
  return geo;
}

const BUILDERS = {
  server: () => {
    const g = new THREE.BoxGeometry(1.1, 3.2, 1.1);
    g.translate(0, 1.6, 0);
    return g;
  },
  workstation: () => {
    const panel = new THREE.BoxGeometry(1.7, 1.05, 0.1);
    panel.rotateX(-0.18);
    panel.translate(0, 0.95, 0);
    const stand = new THREE.BoxGeometry(0.14, 0.45, 0.14);
    stand.translate(0, 0.22, 0);
    const foot = new THREE.BoxGeometry(0.7, 0.05, 0.4);
    foot.translate(0, 0.025, 0);
    return mergeGeometries([panel, stand, foot]);
  },
  router: () => {
    const g = new THREE.OctahedronGeometry(0.85, 0);
    g.translate(0, 1.3, 0);
    return g;
  },
  firewall: jaggedWallGeometry,
};

const geometryCache = new Map();
function geometryFor(type) {
  if (!geometryCache.has(type)) {
    const geo = BUILDERS[type]();
    const [r, h] = CAGE_SIZE[type];
    const cage = new THREE.CylinderGeometry(r, r, h, 8, 1, true);
    cage.translate(0, h / 2, 0);
    geometryCache.set(type, {
      geo,
      edges: new THREE.EdgesGeometry(geo, 25),
      cage: new THREE.EdgesGeometry(cage),
    });
  }
  return geometryCache.get(type);
}

const ringGeometry = new THREE.RingGeometry(1.3, 1.42, 48);

export function createNodes(scene, nodeData) {
  const group = new THREE.Group();
  scene.add(group);

  const byId = new Map();
  const pickables = [];
  let selected = null;
  let now = 0;

  for (const data of nodeData) {
    const { geo, edges, cage: cageGeo } = geometryFor(data.type);
    const root = new THREE.Group();
    root.position.set(...data.position);
    root.rotation.y = data.facing;

    const material = new THREE.MeshStandardMaterial({
      color: PALETTE.bone,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.nodeId = data.id;

    const outline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: PALETTE.bone, transparent: true, opacity: 0.3 }),
    );
    mesh.add(outline);

    // Decay overlay: same geometry, crack texture drawn on top of the surface.
    const cracks = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: crackTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    cracks.visible = false;
    mesh.add(cracks);

    const cage = new THREE.LineSegments(
      cageGeo,
      new THREE.LineBasicMaterial({ color: 0xb8b2a4, transparent: true, opacity: 0.75 }),
    );
    cage.visible = false;

    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color: PALETTE.bone,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;

    root.add(mesh, ring, cage);
    group.add(root);
    pickables.push(mesh);

    byId.set(data.id, {
      data,
      root,
      mesh,
      material,
      outline,
      cracks,
      cage,
      ring,
      state: 'alive',
      stateAt: 0,
      rot: 0,
      phase: Math.random() * 10,
      port: new THREE.Vector3(data.position[0], PORT_HEIGHT[data.type], data.position[2]),
    });
  }

  function setState(id, state) {
    const entry = byId.get(id);
    if (!entry) return;
    entry.state = state;
    entry.stateAt = now;
    entry.cage.visible = state === 'picked';
  }

  function setRestoring(id, on) {
    const entry = byId.get(id);
    if (entry) entry.restoring = on;
  }

  function select(id) {
    selected = id ? (byId.get(id) ?? null) : null;
    return selected;
  }

  function animate(entry, dt, t) {
    const { material, mesh, state } = entry;
    const age = t - entry.stateAt;
    const isSelected = entry === selected;

    // Rot creeps in slowly and recedes quickly.
    const rotTarget = state === 'rotting' ? 1 : 0;
    entry.rot += (rotTarget - entry.rot) * Math.min(1, dt * (rotTarget ? 0.7 : 3));

    let scale = 1;
    mesh.position.x = 0;

    switch (state) {
      case 'scented': {
        const k = 0.5 + 0.5 * Math.sin(t * 5 + entry.phase);
        material.color.copy(BONE).lerp(STATE_COLOR.scented, 0.55 + 0.45 * k);
        material.emissive.copy(STATE_COLOR.scented).multiplyScalar(0.12 + 0.45 * k);
        break;
      }
      case 'rotting': {
        material.color.copy(BONE).lerp(STATE_COLOR.rotting, entry.rot);
        const spike = Math.random() < 0.06;
        const flicker = spike ? 0.5 + Math.random() * 0.9 : 0.22 + 0.08 * Math.sin(t * 13 + entry.phase);
        material.emissive.copy(RED_GLOW).multiplyScalar(flicker * entry.rot * 0.6);
        if (Math.random() < 0.025) mesh.position.x = (Math.random() - 0.5) * 0.18; // glitch jolt
        break;
      }
      case 'picked':
        material.color.copy(STATE_COLOR.picked);
        material.emissive.copy(BLACK);
        break;
      case 'revived': {
        const flash = Math.max(0, 1 - age / 1.0);
        material.color.copy(BONE);
        material.emissive.copy(STATE_COLOR.revived).multiplyScalar(flash * 1.6);
        scale = 1 + 0.12 * flash;
        break;
      }
      default:
        if (entry.rot > 0.01) material.color.copy(BONE).lerp(STATE_COLOR.rotting, entry.rot);
        else material.color.copy(BONE);
        material.emissive.copy(BLACK);
    }
    // Restore in progress: a cold white shimmer over whatever state it is in.
    if (entry.restoring) {
      const shimmer = 0.35 + 0.3 * Math.sin(t * 9 + entry.phase);
      material.emissive.lerp(STATE_COLOR.revived, 0.5).multiplyScalar(0.4 + shimmer);
    }
    mesh.scale.setScalar(scale);

    entry.cracks.visible = entry.rot > 0.02;
    entry.cracks.material.opacity = entry.rot * 0.95;

    const tone = state === 'alive' ? BONE : STATE_COLOR[state];
    entry.outline.material.color.copy(state === 'rotting' ? RED_GLOW : tone);
    entry.outline.material.opacity = isSelected ? 0.95 : state === 'alive' ? 0.3 : 0.55;

    const ringBase = RING_SCALE[entry.data.type];
    entry.ring.material.color.copy(entry.restoring ? STATE_COLOR.revived : state === 'rotting' ? RED_GLOW : tone);
    if (isSelected) {
      entry.ring.material.opacity = 0.75;
      entry.ring.scale.setScalar(ringBase * (1 + Math.sin(t * 3) * 0.06));
    } else {
      entry.ring.material.opacity = state === 'alive' ? 0.08 : 0.35;
      entry.ring.scale.setScalar(ringBase);
    }

    if (entry.data.type === 'router') mesh.rotation.y += dt * (state === 'rotting' ? 1.2 : 0.35);
  }

  function update(dt, t) {
    now = t;
    for (const entry of byId.values()) animate(entry, dt, t);
  }

  return { byId, pickables, select, setState, setRestoring, update };
}
