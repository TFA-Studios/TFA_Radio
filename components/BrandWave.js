'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Calm, on-brand ambient background for the homepage hero — adapted from a
// particle-wave concept the client supplied, but toned down: a shallow/slow
// wave and a tight depth range so nothing drifts toward the viewer. Renders
// behind the hero copy on the dark brand ground (#1D1D1D) with small,
// low-opacity gold (#E6C858) points instead of the original's dense white
// particle field on black. The grid itself is sized off the section's own
// measured width/height (not a fixed count) so it fills the whole dark
// section edge to edge on any screen, and the mouse-driven parallax below
// is deliberately more pronounced than a bare hint — both the camera
// position AND its look-target shift with the pointer.
//
// Mounted as an absolutely-positioned canvas inside a `position: relative`
// hero section (not the whole page) — see app/page.js.
export default function BrandWave() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth;
    let height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = null; // let the section's own #1D1D1D show through
    scene.fog = new THREE.Fog(0x1d1d1d, 1100, 3600);

    const camera = new THREE.PerspectiveCamera(55, width / height, 1, 4000);
    camera.position.set(0, 300, 1150);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // The grid used to be a fixed size tuned for one assumed hero width,
    // which is why it only ever filled a band in the middle of the dark
    // section instead of the section's full width/height — on anything
    // wider than that assumption there was simply nothing left to render
    // past the edges. Sizing it off the mount's own measured dimensions
    // means it always comfortably overflows the visible frustum, on any
    // screen, so the field reads as filling the whole dark half edge to
    // edge instead of floating in the center of it.
    const SEPARATION = 46;
    const AMOUNTX = Math.max(60, Math.ceil((width / SEPARATION) * 2.4));
    const AMOUNTY = Math.max(40, Math.ceil((height / SEPARATION) * 3.6));
    const count = AMOUNTX * AMOUNTY;

    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    let i = 0;
    let j = 0;
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions[i] = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2;
        positions[i + 1] = 0;
        positions[i + 2] = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;
        scales[j] = 1;
        i += 3;
        j++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

    const material = new THREE.PointsMaterial({
      color: 0xe6c858,
      size: 5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let count2 = 0;
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    const lookTarget = new THREE.Vector3(0, 0, 0);

    function onPointerMove(e) {
      const rect = mount.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    }

    function onResize() {
      width = mount.clientWidth;
      height = mount.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    // The mount div itself has pointer-events: none (so it never blocks
    // clicks on the hero content above it), so the move listener has to
    // live on window rather than the div.
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('resize', onResize);

    let rafId;
    function animate() {
      rafId = requestAnimationFrame(animate);

      // More pronounced mouse-reactive parallax than before — both a
      // camera-position shift AND a look-target shift (the two read very
      // differently: moving the camera alone just slides the whole field
      // sideways, adding a look-target shift also turns/tilts the view
      // toward the pointer, which is what makes it feel alive rather than
      // just drifting).
      targetX = mouseX * 110;
      targetY = mouseY * 60;
      camera.position.x += (targetX - camera.position.x) * 0.045;
      camera.position.y += (300 - targetY - camera.position.y) * 0.045;
      lookTarget.x += (mouseX * 70 - lookTarget.x) * 0.045;
      lookTarget.y += (-mouseY * 40 - lookTarget.y) * 0.045;
      camera.lookAt(lookTarget);

      const pos = geometry.attributes.position;
      let idx = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          // Shallow, slow swell — a fraction of the original amplitude/speed.
          pos.array[idx + 1] =
            Math.sin((ix + count2) * 0.28) * 14 + Math.sin((iy + count2) * 0.42) * 14;
          idx += 3;
        }
      }
      pos.needsUpdate = true;

      renderer.render(scene, camera);
      count2 += 0.035;
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    />
  );
}
