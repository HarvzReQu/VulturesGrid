import * as THREE from 'three';

const PER_NODE = 3;
const MAX_VULTURES = 72;
const ARRIVE_SPEED = 14;
const LEAVE_TIME = 8;
const FADE_TIME = 2.5;

// Right wing in the XZ plane (forward = +z), with ragged "finger" feathers at the tip.
function wingGeometry() {
  const shape = new THREE.Shape();
  const pts = [
    [0.12, 0.22], [0.6, 0.3], [1.1, 0.2], [1.45, 0.02], [1.32, -0.08], [1.42, -0.18],
    [1.22, -0.17], [1.28, -0.3], [1.08, -0.26], [1.08, -0.38], [0.88, -0.32], [0.5, -0.36], [0.12, -0.24],
  ];
  shape.moveTo(...pts[0]);
  pts.slice(1).forEach((p) => shape.lineTo(...p));
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2); // shape y -> world z (forward)
  return geo;
}

function bodyGeometry() {
  const body = new THREE.OctahedronGeometry(0.5, 0);
  body.scale(0.32, 0.22, 1.25);
  const tail = new THREE.Shape();
  tail.moveTo(-0.12, -0.4);
  tail.lineTo(0.12, -0.4);
  tail.lineTo(0.26, -0.85);
  tail.lineTo(-0.26, -0.85);
  tail.closePath();
  const tailGeo = new THREE.ShapeGeometry(tail);
  tailGeo.rotateX(Math.PI / 2);
  return { body, tail: tailGeo };
}

const WING = wingGeometry();
const { body: BODY, tail: TAIL } = bodyGeometry();

function makeVulture() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x3b342e,
    emissive: 0x1c0605, // faint underglow from the rot below
    roughness: 1,
    flatShading: true,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const group = new THREE.Group();
  const body = new THREE.Mesh(BODY, material);
  const tail = new THREE.Mesh(TAIL, material);
  const wingR = new THREE.Mesh(WING, material);
  const wingL = new THREE.Mesh(WING, material);
  wingL.scale.x = -1;
  for (const m of [body, tail, wingR, wingL]) {
    m.castShadow = true;
    group.add(m);
  }
  group.scale.setScalar(1.4);
  return { group, wingR, wingL, material };
}

// Flocks of low-poly vultures circling Rotting nodes; they scatter when the node recovers.
export function createVultures(scene, nodes) {
  let vultures = [];
  const target = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const look = new THREE.Vector3();

  function gather(nodeId) {
    const entry = nodes.byId.get(nodeId);
    if (!entry) return;
    const circling = vultures.filter((v) => v.mode !== 'leaving').length;
    const count = Math.min(PER_NODE, MAX_VULTURES - circling);
    for (let i = 0; i < count; i++) {
      const v = makeVulture();
      const from = Math.random() * Math.PI * 2;
      v.group.position.set(
        entry.port.x + Math.cos(from) * 55,
        24 + Math.random() * 10,
        entry.port.z + Math.sin(from) * 55,
      );
      Object.assign(v, {
        nodeId,
        center: entry.port.clone(),
        radius: 2.4 + i * 1.1 + Math.random() * 0.5,
        height: 6.5 + i * 1.3 + Math.random(),
        angle: Math.random() * Math.PI * 2,
        speed: 3 + Math.random() * 1.2,
        phase: Math.random() * 10,
        mode: 'arriving',
        age: 0,
        velocity: new THREE.Vector3(),
      });
      scene.add(v.group);
      vultures.push(v);
    }
  }

  function release(nodeId) {
    for (const v of vultures) {
      if (v.nodeId !== nodeId || v.mode === 'leaving') continue;
      const tangent = new THREE.Vector3(-Math.sin(v.angle), 0, Math.cos(v.angle));
      const outward = v.group.position.clone().sub(v.center).setY(0).normalize();
      v.velocity.copy(tangent.multiplyScalar(v.speed * 1.5)).addScaledVector(outward, 3).setY(2.5);
      v.mode = 'leaving';
      v.age = 0;
    }
  }

  function clear() {
    vultures.forEach((v) => scene.remove(v.group));
    vultures = [];
  }

  function update(dt, t) {
    vultures = vultures.filter((v) => {
      const pos = v.group.position;
      prev.copy(pos);
      let flapAmp;
      let flapFreq;

      if (v.mode === 'leaving') {
        v.age += dt;
        v.velocity.multiplyScalar(1 + dt * 0.5);
        v.velocity.y += dt * 1.5;
        pos.addScaledVector(v.velocity, dt);
        v.material.opacity = Math.min(1, Math.max(0, (LEAVE_TIME - v.age) / FADE_TIME));
        flapAmp = 0.55;
        flapFreq = 9;
        if (v.age > LEAVE_TIME) {
          scene.remove(v.group);
          v.material.dispose();
          return false;
        }
      } else {
        v.angle += (v.speed / v.radius) * dt;
        target.set(
          v.center.x + Math.cos(v.angle) * v.radius,
          v.center.y + v.height + Math.sin(t * 0.7 + v.phase) * 0.4,
          v.center.z + Math.sin(v.angle) * v.radius,
        );
        if (v.mode === 'arriving') {
          const dist = pos.distanceTo(target);
          if (dist < 0.5) v.mode = 'circling';
          else pos.add(look.copy(target).sub(pos).multiplyScalar(Math.min(1, (ARRIVE_SPEED * dt) / dist)));
        } else {
          pos.lerp(target, 1 - Math.exp(-dt * 6));
        }
        // Mostly gliding, with an occasional burst of wingbeats.
        flapAmp = 0.05 + 0.4 * Math.pow(Math.max(0, Math.sin(t * 0.45 + v.phase)), 8);
        flapFreq = v.mode === 'arriving' ? 6 : 4;
      }

      const moved = look.copy(pos).sub(prev);
      if (moved.lengthSq() > 1e-8) {
        v.group.lookAt(look.add(pos));
        if (v.mode !== 'leaving') v.group.rotateZ(0.35); // bank into the circle
      }

      const flap = 0.14 + flapAmp * Math.sin(t * flapFreq + v.phase);
      v.wingR.rotation.z = flap;
      v.wingL.rotation.z = -flap;
      return true;
    });
  }

  return { gather, release, clear, update };
}
