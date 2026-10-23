import * as THREE from "three";
import { channels, palette } from "./palette";

// Incoming messages: one spiralling stream of particles per channel, all animated on the GPU.
// Each particle loops along its path from the channel's emitter into the core, shifting from
// the channel colour to gold as it is "converted".

const vertexShader = /* glsl */ `
  attribute vec3 aEmitter;
  attribute vec3 aSeed;
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aChannel;

  uniform float uTime;
  uniform float uFlow;
  uniform float uFocus;
  uniform float uFocusChannel;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform vec3 uGold;

  varying vec3 vColor;
  varying float vAlpha;

  vec3 rotateAround(vec3 v, vec3 k, float a) {
    return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a));
  }

  void main() {
    float t = fract(aPhase + uTime * aSpeed);
    float e = pow(t, 1.65);

    vec3 dir = normalize(aEmitter + aSeed * 0.07);
    dir = rotateAround(dir, normalize(vec3(0.15, 0.25, 1.0)), e * 2.3);
    float radius = mix(8.0 + aSeed.x * 1.6, 1.06, e);
    vec3 p = dir * radius + aSeed * (1.0 - e) * (0.12 + 0.3 * (1.0 - e));

    float isFocus = 1.0 - step(0.5, abs(aChannel - uFocusChannel));
    float emphasis = mix(1.0, mix(0.18, 2.2, isFocus), uFocus);

    vColor = mix(aColor, uGold, smoothstep(0.5, 0.96, e));
    vAlpha = smoothstep(0.0, 0.07, t) * smoothstep(1.0, 0.9, t) * uFlow * emphasis;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uScale * uPixelRatio * (1.0 + isFocus * uFocus * 0.7) / -mvPosition.z;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vColor * 1.5, a * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Streams {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly uniforms = {
    uTime: { value: 0 },
    uFlow: { value: 1 },
    uFocus: { value: 0 },
    uFocusChannel: { value: -1 },
    uPixelRatio: { value: 1 },
    uScale: { value: 46 },
    uGold: { value: new THREE.Color(palette.gold) },
  };

  constructor(perChannel: number) {
    const count = perChannel * channels.length;
    const emitter = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const speed = new Float32Array(count);
    const size = new Float32Array(count);
    const channel = new Float32Array(count);

    const c = new THREE.Color();
    const dir = new THREE.Vector3();

    channels.forEach((ch, ci) => {
      // Emitters sit on a tilted ring around the core, with some depth so streams cross.
      const a = (ci / channels.length) * Math.PI * 2 + 0.35;
      dir.set(Math.cos(a), Math.sin(a) * 0.78, -0.35 + Math.sin(a * 2) * 0.45).normalize();
      c.setHex(ch.color);

      for (let k = 0; k < perChannel; k++) {
        const i = ci * perChannel + k;
        emitter.set([dir.x, dir.y, dir.z], i * 3);
        // Gaussian-ish spread keeps each stream a tight braid with a soft halo.
        const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        seed.set([g(), g(), g()], i * 3);
        color.set([c.r, c.g, c.b], i * 3);
        phase[i] = Math.random();
        speed[i] = 0.05 + Math.random() * 0.05;
        size[i] = 0.45 + Math.pow(Math.random(), 4) * 1.6;
        channel[i] = ci;
      }
    });

    const geometry = new THREE.BufferGeometry();
    // Positions are computed in the shader; the attribute only sets the draw count.
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("aEmitter", new THREE.BufferAttribute(emitter, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geometry.setAttribute("aChannel", new THREE.BufferAttribute(channel, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    // The real positions live in the shader, so the zeroed bounding sphere would cull wrongly.
    this.points.frustumCulled = false;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
