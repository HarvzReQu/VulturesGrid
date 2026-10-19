import * as THREE from 'three';
import { PALETTE } from './palette.js';

const DRAW_DELAY = 0.3; // seconds between legs, so the trail draws from the origin outward
const FADE_IN = 0.35;
const HOLD = 7;
const FADE_OUT = 2;

// Crimson tubes laid over the links the rot travelled to reach a node.
export function createTraceView(scene, links) {
  const group = new THREE.Group();
  scene.add(group);
  let items = [];

  function clear() {
    for (const { mesh } of items) {
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    items = [];
  }

  function show(paths) {
    clear();
    let order = 0;
    for (const path of paths) {
      for (const { curve } of links.segmentsFor(path) ?? []) {
        const mesh = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 32, 0.1, 6, false),
          new THREE.MeshBasicMaterial({
            color: PALETTE.blood,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        group.add(mesh);
        items.push({ mesh, age: -order * DRAW_DELAY });
        order++;
      }
    }
  }

  function update(dt) {
    if (!items.length) return;
    for (const item of items) {
      item.age += dt;
      const a = item.age;
      let o = 0;
      if (a > 0 && a < FADE_IN) o = a / FADE_IN;
      else if (a >= FADE_IN && a < HOLD) o = 1;
      else if (a >= HOLD) o = Math.max(0, 1 - (a - HOLD) / FADE_OUT);
      item.mesh.material.opacity = o * (0.75 + 0.25 * Math.sin(a * 6));
    }
    if (items.every((i) => i.age > HOLD + FADE_OUT)) clear();
  }

  return { show, clear, update };
}
