import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { crackTexture } from './textures.js';
import { shapeFor } from './shapes.js';

// Height at which links attach to each node type.
const PORT_HEIGHT = { server: 1.1, workstation: 0.6, router: 1.3, firewall: 0.9 };

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
// Status lights (screens, LEDs, rings): dim when healthy, loud when not, dark when caged.
const LIGHT = {
  alive: new THREE.Color(0x8d897d),
  scented: new THREE.Color(0xf0a630),
  rotting: new THREE.Color(0xff2a1f),
  picked: new THREE.Color(0x1c1c1c),
  revived: new THREE.Color(0xffffff),
};

const ringGeometry = new THREE.RingGeometry(1, 1.09, 48);

export function createNodes(scene, nodeData) {
  const group = new THREE.Group();
  scene.add(group);

  const byId = new Map();
  const pickables = [];
  let selected = null;
  let now = 0;
  let contrast = false; // high-contrast mode: stronger outlines and rings

  for (const data of nodeData) {
    const shape = shapeFor(data.role);
    const { body: geo, edges, cage: cageGeo } = shape;
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

    const glow = new THREE.Mesh(shape.glow, new THREE.MeshBasicMaterial({ color: LIGHT.alive, toneMapped: false }));
    mesh.add(glow);

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
    const ringBase = shape.footprint + 0.15;
    ring.scale.setScalar(ringBase);

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
      ringBase,
      glow,
      top: shape.top, // height of the shape, for markers that float above it
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
    // Status lights follow the state; rotting ones stutter.
    const light = entry.glow.material.color.copy(LIGHT[state]);
    if (state === 'scented') light.multiplyScalar(0.55 + 0.45 * Math.sin(t * 5 + entry.phase));
    if (state === 'rotting' && Math.random() < 0.08) light.multiplyScalar(0.25);
    if (state === 'alive' && entry.rot > 0.02) light.lerp(LIGHT.rotting, entry.rot);

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
    entry.outline.material.opacity = isSelected ? 0.95 : contrast ? 0.85 : state === 'alive' ? 0.3 : 0.55;

    const { ringBase } = entry;
    entry.ring.material.color.copy(entry.restoring ? STATE_COLOR.revived : state === 'rotting' ? RED_GLOW : tone);
    if (isSelected) {
      entry.ring.material.opacity = 0.75;
      entry.ring.scale.setScalar(ringBase * (1 + Math.sin(t * 3) * 0.06));
    } else {
      entry.ring.material.opacity = state === 'alive' ? (contrast ? 0.25 : 0.08) : contrast ? 0.7 : 0.35;
      entry.ring.scale.setScalar(ringBase);
    }

    if (entry.data.role === 'core') mesh.rotation.y += dt * (state === 'rotting' ? 0.9 : 0.2);
  }

  function update(dt, t) {
    now = t;
    for (const entry of byId.values()) animate(entry, dt, t);
  }

  return {
    byId,
    pickables,
    select,
    setState,
    setRestoring,
    update,
    setContrast: (on) => (contrast = on),
  };
}
