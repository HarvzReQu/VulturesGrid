import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { glowTexture } from './textures.js';

const PARTICLE_COLOR = new THREE.Color(0xf3ead2);
const TAINTED_COLOR = new THREE.Color(PALETTE.blood);
const AMBIENT_COUNT = { lan: () => 1 + Math.round(Math.random()), wan: () => 3, ext: () => 0 };

// Curved bone-colored lines between nodes, with glowing particles drifting along them.
export function createLinks(scene, topology, nodeIndex) {
  const group = new THREE.Group();
  scene.add(group);

  const outside = new THREE.Vector3(...topology.outside.position);
  const portOf = (id) => (id === topology.outside.id ? outside : nodeIndex.get(id).port);
  const isRotting = (id) => nodeIndex.get(id)?.state === 'rotting';
  const isPicked = (id) => nodeIndex.get(id)?.state === 'picked';
  const LINE_OPACITY = { lan: 0.22, wan: 0.14, ext: 0.08 };
  const CUT_OPACITY = 0.04; // a link touching an isolated node goes dark

  const links = [];
  const byId = new Map();
  const particles = [];

  for (const data of topology.links) {
    const a = portOf(data.from);
    const b = portOf(data.to);
    const length = a.distanceTo(b);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += Math.min(length * 0.18, 4.5);
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(data.kind === 'lan' ? 16 : 48)),
      new THREE.LineBasicMaterial({ color: PALETTE.bone, transparent: true, opacity: LINE_OPACITY[data.kind] }),
    );
    group.add(line);

    const link = { ...data, curve, length: curve.getLength(), line };
    links.push(link);
    byId.set(link.id, link);

    const count = AMBIENT_COUNT[data.kind]();
    for (let i = 0; i < count; i++) {
      particles.push({
        link,
        t: Math.random(),
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: 3 + Math.random() * 3,
      });
    }
  }

  // Curves (with travel direction) for walking a path of node ids.
  function segmentsFor(path) {
    const segments = [];
    for (let i = 0; i < path.length - 1; i++) {
      const forward = byId.get(`${path[i]}~${path[i + 1]}`);
      const link = forward ?? byId.get(`${path[i + 1]}~${path[i]}`);
      if (!link) return null;
      segments.push({ curve: link.curve, reversed: !forward });
    }
    return segments;
  }

  const positions = new Float32Array(particles.length * 3);
  const colors = new Float32Array(particles.length * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.55,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  group.add(points);

  const tmp = new THREE.Vector3();

  function update(dt) {
    for (const link of links) {
      link.cut = isPicked(link.from) || isPicked(link.to);
      link.line.material.opacity = link.cut ? CUT_OPACITY : LINE_OPACITY[link.kind];
    }
    particles.forEach((p, i) => {
      p.t += (p.dir * p.speed * dt) / p.link.length;
      if (p.t > 1) p.t -= 1;
      else if (p.t < 0) p.t += 1;
      p.link.curve.getPoint(p.t, tmp);
      positions[i * 3] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
      // Fade in and out at the ends so wrapping is invisible (additive: dark = transparent).
      // Traffic touching a Rotting node turns red; isolated links carry nothing.
      const fade = p.link.cut ? 0 : Math.sin(Math.PI * p.t);
      const c = isRotting(p.link.from) || isRotting(p.link.to) ? TAINTED_COLOR : PARTICLE_COLOR;
      colors[i * 3] = c.r * fade;
      colors[i * 3 + 1] = c.g * fade;
      colors[i * 3 + 2] = c.b * fade;
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return { links, byId, segmentsFor, update };
}
