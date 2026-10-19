import * as THREE from 'three';

const DURATION = 1.9;
const END_DISTANCE = 13;
const END_POLAR = 0.95; // radians from straight down
const SPIRAL = 0.9; // extra radians of circling during the descent

const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// Eased camera flight that spirals down onto a point, like a vulture descending.
export function createSwoop({ camera, controls }) {
  let flight = null;
  const offset = new THREE.Vector3();
  const sph = new THREE.Spherical();

  function flyTo(point) {
    const fromTarget = controls.target.clone();
    const start = new THREE.Spherical().setFromVector3(offset.copy(camera.position).sub(fromTarget));
    flight = {
      k: 0,
      fromTarget,
      toTarget: point.clone(),
      start,
      end: new THREE.Spherical(END_DISTANCE, END_POLAR, start.theta + SPIRAL),
    };
    controls.enabled = false;
  }

  function update(dt) {
    if (!flight) return;
    flight.k = Math.min(1, flight.k + dt / DURATION);
    const e = easeInOutCubic(flight.k);
    const { start, end } = flight;
    sph.set(
      THREE.MathUtils.lerp(start.radius, end.radius, e),
      THREE.MathUtils.lerp(start.phi, end.phi, e),
      THREE.MathUtils.lerp(start.theta, end.theta, e),
    );
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
    camera.position.copy(controls.target).add(offset.setFromSpherical(sph));
    camera.lookAt(controls.target);
    if (flight.k >= 1) {
      flight = null;
      controls.enabled = true;
    }
  }

  return { flyTo, update };
}
