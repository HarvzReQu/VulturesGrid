import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PALETTE } from './palette.js';
import { glowTexture } from './textures.js';

// Renderer, camera, controls, lighting, ground and grid.
export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.void);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 54, 66);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 8;
  controls.maxDistance = 130;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.target.set(0, 0, 0);

  // Lighting: faint sky fill plus a dim, cold moon overhead.
  scene.add(new THREE.HemisphereLight(0x8c93a3, PALETTE.void, 1.0));

  const moonLight = new THREE.DirectionalLight(PALETTE.moon, 2.4);
  moonLight.position.set(-24, 60, -18);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const s = moonLight.shadow.camera;
  s.left = s.bottom = -42;
  s.right = s.top = 42;
  s.near = 1;
  s.far = 160;
  moonLight.shadow.bias = -0.0004;
  scene.add(moonLight);

  // Visible moon disc far off in the sky.
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(4, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xdedbd2, fog: false }),
  );
  moon.position.set(-90, 75, -140);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xcfd6e6,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      fog: false,
    }),
  );
  halo.scale.set(34, 34, 1);
  moon.add(halo);
  scene.add(moon);

  // Ground and faint bone-white grid.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(180, 90, PALETTE.bone, PALETTE.bone);
  grid.material.transparent = true;
  grid.material.opacity = 0.06;
  grid.material.depthWrite = false;
  grid.position.y = 0.01;
  scene.add(grid);

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    controls,
    render: () => renderer.render(scene, camera),
  };
}
