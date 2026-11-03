import * as THREE from 'three';

let studio: THREE.Texture | null = null;

/**
 * A soft "photo studio" to reflect in glossy and metallic dice: bright above,
 * dark below, with two softbox lights. It is a plain painted image (three.js
 * prefilters it per renderer), so the table and the style preview, which have
 * separate WebGL contexts, can both use it. Matte dice don't reflect it.
 */
export function studioEnvironment(): THREE.Texture {
  if (studio) return studio;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.45, '#b9bec5');
  sky.addColorStop(0.55, '#5c6168');
  sky.addColorStop(1, '#1b1d20');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgb(255 255 255 / 85%)';
  ctx.filter = 'blur(4px)';
  ctx.fillRect(40, 18, 46, 26);
  ctx.fillRect(160, 24, 34, 20);
  studio = new THREE.CanvasTexture(canvas);
  studio.mapping = THREE.EquirectangularReflectionMapping;
  studio.colorSpace = THREE.SRGBColorSpace;
  return studio;
}
