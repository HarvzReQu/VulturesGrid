import * as THREE from 'three';

let glow;

// Soft radial sprite used for packets, dust and the moon halo.
export function glowTexture() {
  if (glow) return glow;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

let cracks;

// Branching fracture lines on a transparent tile: dark gouges with a thin blood-red core.
export function crackTexture() {
  if (cracks) return cracks;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const strokes = [];
  function crack(x, y, angle, length, width, depth) {
    const points = [[x, y]];
    const steps = 6 + Math.floor(Math.random() * 6);
    for (let s = 0; s < steps; s++) {
      angle += (Math.random() - 0.5) * 0.9;
      x += (Math.cos(angle) * length) / steps;
      y += (Math.sin(angle) * length) / steps;
      points.push([x, y]);
      if (depth < 3 && Math.random() < 0.22) {
        crack(x, y, angle + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random()), length * 0.5, width * 0.6, depth + 1);
      }
    }
    strokes.push({ points, width });
  }
  for (let i = 0; i < 7; i++) {
    crack(Math.random() * size, Math.random() * size, Math.random() * Math.PI * 2, 90 + Math.random() * 90, 4, 0);
  }

  const draw = (style, scale) => {
    ctx.strokeStyle = style;
    for (const { points, width } of strokes) {
      ctx.lineWidth = width * scale;
      ctx.beginPath();
      points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    }
  };
  draw('rgba(10, 0, 0, 0.95)', 1);
  draw('rgba(255, 70, 50, 0.85)', 0.3);

  cracks = new THREE.CanvasTexture(canvas);
  cracks.colorSpace = THREE.SRGBColorSpace;
  cracks.wrapS = cracks.wrapT = THREE.RepeatWrapping;
  return cracks;
}
