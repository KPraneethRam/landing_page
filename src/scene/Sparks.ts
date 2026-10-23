import * as THREE from "three";
import { palette } from "./palette";

// Two quieter layers around the core: a tilted orbit of gold sparks (converted leads) and
// a deep field of dust that gives the camera moves something to parallax against.

const vertexShader = /* glsl */ `
  attribute float aAngle;
  attribute float aRadius;
  attribute float aSize;
  attribute float aTwinkle;

  uniform float uTime;
  uniform float uOrbit;      // 1 for the orbit ring, 0 for static dust
  uniform float uPixelRatio;
  uniform float uScale;

  varying float vAlpha;

  void main() {
    vec3 p = position;
    if (uOrbit > 0.5) {
      float a = aAngle + uTime * (0.32 / aRadius);
      p = vec3(cos(a) * aRadius, position.y, sin(a) * aRadius);
    }
    vAlpha = 0.45 + 0.55 * sin(uTime * 1.7 + aTwinkle * 6.2831);

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uScale * uPixelRatio / -mvPosition.z;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeSparks(count: number, orbit: boolean, color: number, opacity: number, scale: number) {
  const position = new Float32Array(count * 3);
  const angle = new Float32Array(count);
  const radius = new Float32Array(count);
  const size = new Float32Array(count);
  const twinkle = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    twinkle[i] = Math.random();
    if (orbit) {
      angle[i] = Math.random() * Math.PI * 2;
      radius[i] = 1.75 + Math.pow(Math.random(), 2) * 1.1;
      position[i * 3 + 1] = (Math.random() - 0.5) * 0.08;
      size[i] = 0.6 + Math.random() * 1.4;
    } else {
      // Dust on a thick shell so it never crowds the core.
      const r = 12 + Math.random() * 26;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      position.set(
        [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)],
        i * 3,
      );
      size[i] = 0.6 + Math.random() * 1.6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aAngle", new THREE.BufferAttribute(angle, 1));
  geometry.setAttribute("aRadius", new THREE.BufferAttribute(radius, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkle, 1));

  const uniforms = {
    uTime: { value: 0 },
    uOrbit: { value: orbit ? 1 : 0 },
    uPixelRatio: { value: 1 },
    uScale: { value: scale },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  if (orbit) points.frustumCulled = false;
  return { points, uniforms };
}

export class Sparks {
  readonly orbit;
  readonly dust;

  constructor(orbitCount: number, dustCount: number) {
    this.orbit = makeSparks(orbitCount, true, palette.gold, 1.4, 34);
    this.orbit.points.rotation.set(0.42, 0, -0.28);
    this.dust = makeSparks(dustCount, false, palette.parchment, 0.28, 52);
  }

  setTime(t: number) {
    this.orbit.uniforms.uTime.value = t;
    this.dust.uniforms.uTime.value = t;
  }

  setPixelRatio(r: number) {
    this.orbit.uniforms.uPixelRatio.value = r;
    this.dust.uniforms.uPixelRatio.value = r;
  }

  dispose() {
    for (const s of [this.orbit, this.dust]) {
      s.points.geometry.dispose();
      s.points.material.dispose();
    }
  }
}
