import * as THREE from "three";
import { simplexNoise } from "../shaders/noise";
import { palette } from "./palette";

// The molten core: a noise-displaced sphere shaded from burgundy valleys to gold crests.
// Normals are rebuilt in the vertex shader from neighbouring displaced points so the
// lighting follows the moving surface instead of the original sphere.

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform vec3 uPointer;      // unit direction on the sphere under the cursor, object space
  uniform float uPointerAmt;

  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying float vDisp;

  ${simplexNoise}

  float displacement(vec3 dir) {
    float t = uTime;
    float n = snoise(dir * 1.25 + vec3(0.0, t * 0.22, t * 0.08)) * 0.55;
    n += snoise(dir * 2.9 - vec3(t * 0.31, 0.0, t * 0.17)) * 0.22;
    n += snoise(dir * 6.5 + t * 0.5) * 0.05;

    float d = distance(dir, uPointer);
    float ripple = uPointerAmt * exp(-d * d * 5.0) * (0.5 + 0.5 * sin(d * 22.0 - t * 7.0)) * 0.22;

    return n * 0.19 + ripple + uPulse * 0.12;
  }

  vec3 displaced(vec3 dir) {
    return dir * (1.0 + displacement(dir));
  }

  void main() {
    vec3 dir = normalize(position);
    vec3 helper = abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(dir, helper));
    vec3 bitangent = cross(dir, tangent);

    const float e = 0.012;
    vec3 p0 = displaced(dir);
    vec3 p1 = displaced(normalize(dir + tangent * e));
    vec3 p2 = displaced(normalize(dir + bitangent * e));
    vec3 n = normalize(cross(p1 - p0, p2 - p0));
    if (dot(n, dir) < 0.0) n = -n;

    vDisp = length(p0) - 1.0;
    vec4 worldPos = modelMatrix * vec4(p0, 1.0);
    vPosW = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  uniform vec3 uFocusColor;
  uniform float uFocus;

  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying float vDisp;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float ndv = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - ndv, 2.6);

    float crest = smoothstep(-0.06, 0.26, vDisp);
    vec3 base = mix(uDeep, uMid, crest);
    base = mix(base, uHigh, smoothstep(0.2, 0.38, vDisp));

    vec3 keyDir = normalize(vec3(0.55, 0.85, 0.6));
    vec3 fillDir = normalize(vec3(-0.7, -0.2, 0.4));
    float key = max(dot(N, keyDir), 0.0);
    float fill = max(dot(N, fillDir), 0.0);
    float spec = pow(max(dot(N, normalize(keyDir + V)), 0.0), 72.0);
    float sheen = pow(max(dot(N, normalize(fillDir + V)), 0.0), 18.0);

    vec3 color = base * (0.08 + 0.62 * key + 0.16 * fill);
    color += spec * vec3(1.0, 0.86, 0.62) * 1.5;
    color += sheen * uMid * 0.35;

    // Molten seams: thin bright contour lines that crawl across the surface.
    float seam = abs(sin(vDisp * 46.0 - uTime * 1.4));
    seam = smoothstep(0.06, 0.0, seam) * smoothstep(0.02, 0.2, vDisp);
    color += uHigh * seam * 1.6 * uHeat;

    vec3 rim = mix(uMid, uHigh, fresnel);
    rim = mix(rim, uFocusColor, uFocus * 0.4);
    color += rim * fresnel * (0.9 + 0.6 * uHeat);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Core {
  readonly mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial>;
  readonly bounds = new THREE.Sphere(new THREE.Vector3(), 1.15);
  readonly uniforms = {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uPointer: { value: new THREE.Vector3(0, 0, 1) },
    uPointerAmt: { value: 0 },
    uHeat: { value: 1 },
    uDeep: { value: new THREE.Color(palette.burgundy) },
    uMid: { value: new THREE.Color(palette.amber) },
    uHigh: { value: new THREE.Color(palette.gold) },
    uFocusColor: { value: new THREE.Color(palette.gold) },
    uFocus: { value: 0 },
  };

  constructor(detail: number) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail), material);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
