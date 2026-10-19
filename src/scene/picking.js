import * as THREE from 'three';

const CLICK_TOLERANCE = 6; // px; anything more is treated as an orbit drag

// Click-to-select on node meshes, ignoring clicks that were really drags.
// Double-click calls onSwoop with the node under the pointer.
export function createPicker({ camera, renderer }, nodes, onPick, onSwoop) {
  const el = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;

  function hitTest(event) {
    const rect = el.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObjects(nodes.pickables, false);
    return hit ? hit.object.userData.nodeId : null;
  }

  el.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });

  el.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > CLICK_TOLERANCE) return;
    onPick(hitTest(e));
  });

  el.addEventListener('dblclick', (e) => {
    const id = hitTest(e);
    if (id) onSwoop(id);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    el.style.cursor = hitTest(e) ? 'pointer' : '';
  });
}
