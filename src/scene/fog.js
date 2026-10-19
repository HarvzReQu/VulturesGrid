import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { glowTexture } from './textures.js';

const EXTENT = 120;
const HALF = EXTENT / 2;

function wrap(v) {
  if (v > HALF) return v - EXTENT;
  if (v < -HALF) return v + EXTENT;
  return v;
}

// Drifting dust motes plus a few large, very faint mist banks near the ground.
export function createFog(scene, { dust = 900, banks = 28 } = {}) {
  scene.fog = new THREE.FogExp2(PALETTE.void, 0.0075);

  const positions = new Float32Array(dust * 3);
  const seeds = new Float32Array(dust);
  for (let i = 0; i < dust; i++) {
    positions[i * 3] = (Math.random() - 0.5) * EXTENT;
    positions[i * 3 + 1] = 0.3 + Math.random() * 16;
    positions[i * 3 + 2] = (Math.random() - 0.5) * EXTENT;
    seeds[i] = Math.random() * 100;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dustPoints = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: PALETTE.bone,
      size: 0.28,
      map: glowTexture(),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(dustPoints);

  const bankMat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: 0x9a978f,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
  });
  const bankSprites = [];
  for (let i = 0; i < banks; i++) {
    const sprite = new THREE.Sprite(bankMat);
    const size = 18 + Math.random() * 22;
    sprite.scale.set(size, size * 0.45, 1);
    sprite.position.set((Math.random() - 0.5) * EXTENT, 1 + Math.random() * 3, (Math.random() - 0.5) * EXTENT);
    sprite.userData.speed = 0.4 + Math.random() * 0.6;
    scene.add(sprite);
    bankSprites.push(sprite);
  }

  function update(dt, t) {
    for (let i = 0; i < dust; i++) {
      const k = i * 3;
      const seed = seeds[i];
      positions[k] = wrap(positions[k] + (0.5 + Math.sin(t * 0.2 + seed) * 0.35) * dt);
      positions[k + 1] += Math.sin(t * 0.6 + seed) * 0.08 * dt;
      positions[k + 2] = wrap(positions[k + 2] + Math.cos(t * 0.15 + seed * 2) * 0.25 * dt);
    }
    dustGeo.attributes.position.needsUpdate = true;

    for (const sprite of bankSprites) {
      sprite.position.x = wrap(sprite.position.x + sprite.userData.speed * dt);
    }
  }

  return { update };
}
