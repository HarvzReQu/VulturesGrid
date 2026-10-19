import * as THREE from 'three';

const TEXT_COLOR = 'rgba(232, 226, 212, 1)';

// Text painted flat on the ground, like survey markings: branch names and HQ role tags.
function groundText(text, { size = 1, opacity = 0.32, letterSpacing = 0.3, font = 'Cormorant Garamond' } = {}) {
  const px = 96;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${px}px "${font}", "Times New Roman", serif`;
  const spaced = [...text].join(String.fromCharCode(8202).repeat(Math.round(letterSpacing * 10)));
  const width = Math.ceil(ctx.measureText(spaced).width) + px;
  canvas.width = width;
  canvas.height = Math.ceil(px * 1.5);
  ctx.font = `700 ${px}px "${font}", "Times New Roman", serif`;
  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spaced, width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const aspect = canvas.width / canvas.height;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size * aspect, size),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2; // lie flat, readable from the default camera
  mesh.position.y = 0.04;
  return mesh;
}

const ROLE_TAG = { firewall: 'FIREWALL', web: 'WEB', dc: 'DOMAIN', files: 'FILES', db: 'DATABASE', core: 'CORE' };

// Fonts load asynchronously; draw once they're ready so the serif is used.
export async function createGroundLabels(scene, topology) {
  await document.fonts?.ready;
  const group = new THREE.Group();
  scene.add(group);

  // Branch names, set just outside each cluster.
  const clusters = new Map();
  for (const node of topology.nodes) {
    if (node.cluster === 'hq') continue;
    const c = clusters.get(node.cluster) ?? { site: node.site, x: 0, z: 0, n: 0 };
    c.x += node.position[0];
    c.z += node.position[2];
    c.n++;
    clusters.set(node.cluster, c);
  }
  for (const c of clusters.values()) {
    const x = c.x / c.n;
    const z = c.z / c.n;
    const out = Math.hypot(x, z);
    const label = groundText(c.site.replace(' Branch', '').toUpperCase(), { size: 1.5 });
    label.position.set(x + (x / out) * 6.5, 0.04, z + (z / out) * 6.5);
    group.add(label);
  }

  // HQ role tags at the foot of each HQ node, plus the site name.
  for (const node of topology.nodes) {
    if (node.cluster !== 'hq' || !ROLE_TAG[node.role]) continue;
    const [x, , z] = node.position;
    const out = Math.hypot(x, z) || 1;
    const offset = node.role === 'core' ? 0 : 2;
    const tag = groundText(ROLE_TAG[node.role], { size: 0.5, opacity: 0.45, letterSpacing: 0.2 });
    tag.position.set(x + (x / out) * offset, 0.05, z + (z / out) * offset + (node.role === 'core' ? 2.1 : 0));
    group.add(tag);
  }
  const hq = groundText('HQ DATA CENTER', { size: 0.9, opacity: 0.28 });
  hq.position.set(0, 0.04, 10.2);
  group.add(hq);
}
