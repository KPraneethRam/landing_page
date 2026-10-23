import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { simplexNoise } from "../shaders/noise";
import { palette } from "./palette";

// The centrepiece: a molten-gold speech bubble with three "typing…" dots on its face, the agent
// always mid-reply. The bubble is an extruded, bevelled outline. The molten surface (flowing
// burgundy-to-gold metal, crawling seams, pointer ripples) is shaded per pixel with a
// noise height field and derivative bump mapping, so the flat front face carries detail too.

function bubbleShape() {
  const w = 2.5;
  const h = 1.72;
  const r = 0.62;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + 0.95, y0);
  s.lineTo(x0 + w - r, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + 0.5);
  // Tail: sweeps down and out from the lower-left corner, then curls back into the bottom edge.
  s.quadraticCurveTo(x0 + 0.02, y0 - 0.22, x0 - 0.26, y0 - 0.52);
  s.quadraticCurveTo(x0 + 0.42, y0 - 0.42, x0 + 0.95, y0);
  return s;
}

function bubbleGeometry(curveSegments: number, bevelSegments: number) {
  let geometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(bubbleShape(), {
    depth: 0.5,
    bevelEnabled: true,
    bevelThickness: 0.34,
    bevelSize: 0.3,
    bevelSegments,
    curveSegments,
  });
  // Weld the cap, bevel and side vertices so normals are smooth across the bevel.
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  geometry = BufferGeometryUtils.mergeVertices(geometry, 1e-4);
  geometry.computeVertexNormals();
  geometry.center();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const vertexShader = /* glsl */ `
  uniform float uPulse;

  varying vec3 vObj;
  varying vec3 vPosW;
  varying vec3 vNormalW;

  void main() {
    vec3 p = position * (1.0 + uPulse * 0.07);
    vObj = position;
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    vPosW = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  uniform float uPulse;
  uniform vec3 uPointer;      // object-space point under the cursor
  uniform float uPointerAmt;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  uniform vec3 uFocusColor;
  uniform float uFocus;

  varying vec3 vObj;
  varying vec3 vPosW;
  varying vec3 vNormalW;

  ${simplexNoise}

  float molten(vec3 p) {
    float t = uTime;
    float h = snoise(p * 0.95 + vec3(t * 0.12, t * 0.2, t * 0.05)) * 0.6;
    h += snoise(p * 2.3 - vec3(0.0, t * 0.32, t * 0.14)) * 0.28;
    h += snoise(p * 5.5 + t * 0.4) * 0.035;
    float d = distance(p, uPointer);
    h += uPointerAmt * exp(-d * d * 3.5) * sin(d * 16.0 - t * 7.0) * 0.35;
    return h;
  }

  // Bump-mapped normal from a scalar height field (three.js perturbNormalArb).
  vec3 bumpNormal(vec3 n, float h, float strength) {
    vec3 dpdx = dFdx(vPosW);
    vec3 dpdy = dFdy(vPosW);
    float dhdx = dFdx(h);
    float dhdy = dFdy(h);
    vec3 r1 = cross(dpdy, n);
    vec3 r2 = cross(n, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
    return normalize(abs(det) * n - grad * strength);
  }

  void main() {
    float h = molten(vObj);
    vec3 N0 = normalize(vNormalW);
    vec3 N = bumpNormal(N0, h, 0.09);
    vec3 V = normalize(cameraPosition - vPosW);
    float fresnel = pow(1.0 - max(dot(N0, V), 0.0), 2.4);

    vec3 base = mix(uDeep, uMid, smoothstep(-0.25, 0.4, h));
    base = mix(base, uHigh, smoothstep(0.42, 0.8, h));

    vec3 keyDir = normalize(vec3(0.45, 0.9, 0.35));
    vec3 fillDir = normalize(vec3(-0.7, -0.25, 0.45));
    float key = max(dot(N, keyDir), 0.0);
    float fill = max(dot(N, fillDir), 0.0);
    float spec = pow(max(dot(N, normalize(keyDir + V)), 0.0), 64.0);
    float sheen = pow(max(dot(N, normalize(fillDir + V)), 0.0), 16.0);

    vec3 color = base * (0.08 + 0.58 * key + 0.16 * fill);
    color += spec * vec3(1.0, 0.87, 0.64) * 1.4;
    color += sheen * uMid * 0.3;

    // Molten seams crawling across the crests.
    float seam = abs(sin(h * 18.0 - uTime * 1.2));
    seam = smoothstep(0.07, 0.0, seam) * smoothstep(0.05, 0.4, h);
    color += uHigh * seam * 1.3 * uHeat;

    vec3 rim = mix(uMid, uHigh, fresnel);
    rim = mix(rim, uFocusColor, uFocus * 0.45);
    color += rim * fresnel * (0.9 + 0.6 * uHeat);
    color += uHigh * uPulse * 0.35;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Bubble {
  readonly object = new THREE.Group();
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly bounds: THREE.Box3;
  readonly uniforms = {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uPointer: { value: new THREE.Vector3(0, 0, 10) },
    uPointerAmt: { value: 0 },
    uHeat: { value: 1 },
    uDeep: { value: new THREE.Color(palette.burgundy) },
    uMid: { value: new THREE.Color(palette.amber) },
    uHigh: { value: new THREE.Color(palette.gold) },
    uFocusColor: { value: new THREE.Color(palette.gold) },
    uFocus: { value: 0 },
  };

  private dots: THREE.Mesh[] = [];
  private dotGeometry = new THREE.SphereGeometry(0.125, 24, 16);
  private dotMaterial = new THREE.MeshBasicMaterial();
  private dotColor = new THREE.Color(palette.parchment);

  constructor(curveSegments: number, bevelSegments: number) {
    const geometry = bubbleGeometry(curveSegments, bevelSegments);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader }),
    );
    this.bounds = geometry.boundingBox!.clone().expandByScalar(0.05);
    this.object.add(this.mesh);
    this.object.scale.setScalar(0.74);

    // Typing dots, half sunk into the front face. Over-bright so bloom gives them a glow.
    const frontZ = this.bounds.max.z - 0.07;
    for (let i = 0; i < 3; i++) {
      const dot = new THREE.Mesh(this.dotGeometry, this.dotMaterial);
      dot.position.set((i - 1) * 0.5, 0.06, frontZ);
      this.dots.push(dot);
      this.object.add(dot);
    }
  }

  /** Advances the typing wave; `speed` rises while a channel is in focus. */
  update(time: number, heat: number, speed: number) {
    this.dots.forEach((dot, i) => {
      const wave = Math.max(0, Math.sin(time * 5.2 * speed - i * 0.75));
      dot.position.y = 0.06 + wave * 0.13;
      dot.scale.setScalar(0.85 + wave * 0.3);
    });
    this.dotMaterial.color.copy(this.dotColor).multiplyScalar(1.05 + heat * 0.35);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.dotGeometry.dispose();
    this.dotMaterial.dispose();
  }
}
