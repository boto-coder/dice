import * as THREE from 'three';
import type { DieDefinition } from '../core/dice';
import { polyhedronFor } from '../physics/polyhedra';
import { createDieMesh, disposeDieMesh } from './dieMesh';
import { LIGHTING, prefersReducedMotion } from './table';

/** A small 3D view of one die, turning slowly, for the style editors. */
export interface DiePreview {
  /** Shows this die (with its `style`). */
  show(die: DieDefinition): void;
  dispose(): void;
}

/** Degrees per second; slow enough to read the faces as they pass. */
const TURN_SPEED = 25;

/** Creates the preview inside `container`. Throws if WebGL is unavailable. */
export function createDiePreview(
  container: HTMLElement,
  { reducedMotion = prefersReducedMotion }: { reducedMotion?: () => boolean } = {},
): DiePreview {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = 'preview__canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bec6, LIGHTING.sky));
  const sun = new THREE.DirectionalLight(0xffffff, LIGHTING.sun);
  sun.position.set(-3, 5, 4);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.2, 4.2);
  camera.lookAt(0, 0, 0);

  let mesh: THREE.Group | null = null;
  let last = 0;

  function resize(): void {
    const size = Math.max(1, Math.min(container.clientWidth, container.clientHeight));
    renderer.setSize(size, size, false);
  }

  function render(): void {
    renderer.render(scene, camera);
  }

  function frame(time: number): void {
    const dt = last === 0 ? 0 : Math.min((time - last) / 1000, 0.1);
    last = time;
    if (mesh) mesh.rotation.y += THREE.MathUtils.degToRad(TURN_SPEED) * dt;
    render();
  }

  const observer = new ResizeObserver(() => {
    resize();
    render();
  });
  observer.observe(container);
  resize();

  return {
    show(die) {
      if (mesh) {
        scene.remove(mesh);
        disposeDieMesh(mesh);
      }
      mesh = createDieMesh(die, polyhedronFor(die.shape));
      // Fit every shape (the d100 ball is larger) and tilt it towards the viewer.
      const box = new THREE.Box3().setFromObject(mesh);
      const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      mesh.scale.setScalar(1 / radius);
      mesh.rotation.set(0.5, 0.6, 0.1);
      scene.add(mesh);
      if (reducedMotion()) {
        renderer.setAnimationLoop(null);
        render();
      } else {
        last = 0;
        renderer.setAnimationLoop(frame);
      }
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      if (mesh) disposeDieMesh(mesh);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
