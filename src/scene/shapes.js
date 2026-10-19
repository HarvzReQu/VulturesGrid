import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Low-poly silhouettes for each node role. Every builder returns:
//   body  the lit, crackable shape (also what gets clicked)
//   glow  thin emissive details (screens, LEDs, rings) tinted by the node's state
// Front is +z: nodes are rotated to face their parent router.

// mergeGeometries needs all-indexed or all-non-indexed input; normalize to non-indexed.
const merge = (parts) => mergeGeometries(parts.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g)));

function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cylinder(rTop, rBottom, h, segments, y, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open);
  g.translate(0, y, 0);
  return g;
}

function jaggedWall(width = 2.8, spikes = 8) {
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
  // Web server: rack with vent lights and a dish on a mast.
  web: () => ({
    body: merge([
      box(1.1, 3.0, 1.1, 0, 1.5, 0),
      box(0.08, 0.5, 0.08, 0, 3.25, 0),
      cylinder(0.5, 0.18, 0.16, 8, 3.55),
    ]),
    glow: merge([0.7, 1.2, 1.7, 2.2].map((y) => box(0.78, 0.05, 0.02, 0, y, 0.56))),
  }),

  // Database: the classic stacked-disk cylinder, with glowing bands between disks.
  db: () => ({
    body: merge([0.4, 1.22, 2.04].map((y) => cylinder(0.66, 0.66, 0.7, 16, y))),
    glow: merge([0.81, 1.63].map((y) => cylinder(0.68, 0.68, 0.08, 16, y, true))),
  }),

  // Domain controller: a tall monolith crowned with a pyramid, a keyhole slit of light.
  dc: () => {
    const crown = new THREE.ConeGeometry(0.78, 0.8, 4);
    crown.rotateY(Math.PI / 4);
    crown.translate(0, 3.6, 0);
    return {
      body: merge([box(1.05, 3.2, 1.05, 0, 1.6, 0), crown]),
      glow: merge([box(0.09, 2.0, 0.02, 0, 1.7, 0.535), box(0.3, 0.09, 0.02, 0, 2.55, 0.535)]),
    };
  },

  // File server: a wide cabinet of drawers with glowing handles.
  files: () => ({
    body: merge([box(1.6, 2.5, 1.0, 0, 1.25, 0)]),
    glow: merge([0.45, 1.05, 1.65, 2.2].map((y) => box(0.4, 0.07, 0.02, 0, y, 0.51))),
  }),

  // Core router: a large octahedron inside a glowing halo ring.
  core: () => {
    const body = new THREE.OctahedronGeometry(1.05, 0);
    body.translate(0, 1.6, 0);
    const halo = new THREE.TorusGeometry(1.45, 0.05, 6, 40);
    halo.rotateX(Math.PI / 2);
    halo.translate(0, 1.6, 0);
    return { body, glow: halo };
  },

  // Branch router: octahedron with two antennas tipped in light.
  router: () => {
    const body = new THREE.OctahedronGeometry(0.85, 0);
    body.translate(0, 1.3, 0);
    return {
      body: merge([body, box(0.06, 0.8, 0.06, -0.32, 2.15, 0), box(0.06, 0.8, 0.06, 0.32, 2.15, 0)]),
      glow: merge([box(0.13, 0.13, 0.13, -0.32, 2.58, 0), box(0.13, 0.13, 0.13, 0.32, 2.58, 0)]),
    };
  },

  // Firewall: jagged bone wall braced by buttresses, a scan line across its face.
  firewall: () => ({
    body: merge([jaggedWall(), box(0.34, 2.1, 0.6, -1.5, 1.05, 0), box(0.34, 2.1, 0.6, 1.5, 1.05, 0)]),
    glow: merge([box(2.6, 0.05, 0.02, 0, 0.7, 0.185), box(2.6, 0.05, 0.02, 0, 0.7, -0.185)]),
  }),

  // Workstation: monitor with a glowing screen, stand, foot and keyboard.
  workstation: () => {
    const tilt = (g) => {
      g.rotateX(-0.18);
      g.translate(0, 0.95, 0);
      return g;
    };
    return {
      body: merge([
        tilt(new THREE.BoxGeometry(1.7, 1.05, 0.1)),
        box(0.14, 0.45, 0.14, 0, 0.22, 0),
        box(0.7, 0.05, 0.4, 0, 0.025, 0),
        box(1.0, 0.05, 0.32, 0, 0.025, 0.55),
      ]),
      // Slightly thicker than the panel so the screen shows from both sides.
      glow: tilt(new THREE.BoxGeometry(1.5, 0.85, 0.12)),
    };
  },
};

const cache = new Map();

// Shape set for a role, built once and shared: body, glow, outline edges, cage, top height.
export function shapeFor(role) {
  if (cache.has(role)) return cache.get(role);
  const { body, glow } = BUILDERS[role]();
  body.computeBoundingBox();
  const bb = body.boundingBox;
  const radius = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 0.3;
  const height = bb.max.y + 0.35;
  const cage = new THREE.CylinderGeometry(radius, radius, height, 8, 1, true);
  cage.translate(0, height / 2, 0);
  const shape = {
    body,
    glow,
    edges: new THREE.EdgesGeometry(body, 25),
    cage: new THREE.EdgesGeometry(cage),
    top: bb.max.y,
    footprint: radius,
  };
  cache.set(role, shape);
  return shape;
}
