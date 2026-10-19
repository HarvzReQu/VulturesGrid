import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { glowTexture } from './textures.js';

const MAX_PULSES = 900;
const BLOOD = new THREE.Color(PALETTE.blood);

// Transient red particles that travel a multi-link path: single spread pulses
// and continuous streams (Siege traffic coming in, Bleed traffic going out).
export function createPulses(scene, links) {
  const positions = new Float32Array(MAX_PULSES * 3);
  const colors = new Float32Array(MAX_PULSES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setDrawRange(0, 0);
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.95,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);

  let pulses = [];
  const streams = new Map();
  const tmp = new THREE.Vector3();

  function send(path, hop, jitter = 0) {
    const segments = links.segmentsFor(path);
    if (!segments || pulses.length >= MAX_PULSES) return;
    pulses.push({
      segments,
      hop,
      age: 0,
      offset: new THREE.Vector3(
        (Math.random() - 0.5) * jitter,
        (Math.random() - 0.5) * jitter,
        (Math.random() - 0.5) * jitter,
      ),
      brightness: 0.8 + Math.random() * 0.4,
    });
  }

  function startStream(id, path, rate) {
    const existing = streams.get(id);
    streams.set(id, { path, rate, acc: existing?.acc ?? 0 });
  }

  function stopStream(id) {
    streams.delete(id);
  }

  function clear() {
    pulses = [];
    streams.clear();
  }

  function update(dt) {
    for (const stream of streams.values()) {
      stream.acc += stream.rate * dt;
      while (stream.acc >= 1) {
        stream.acc -= 1;
        send(stream.path, 0.8 + Math.random() * 0.5, 0.6);
      }
    }

    pulses = pulses.filter((p) => {
      p.age += dt;
      return p.age / p.hop < p.segments.length;
    });

    pulses.forEach((p, i) => {
      const u = p.age / p.hop;
      const index = Math.floor(u);
      const local = u - index;
      const { curve, reversed } = p.segments[index];
      curve.getPoint(reversed ? 1 - local : local, tmp).add(p.offset);
      positions[i * 3] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
      colors[i * 3] = BLOOD.r * p.brightness;
      colors[i * 3 + 1] = BLOOD.g * p.brightness;
      colors[i * 3 + 2] = BLOOD.b * p.brightness;
    });
    geo.setDrawRange(0, pulses.length);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return { send, startStream, stopStream, clear, update };
}
