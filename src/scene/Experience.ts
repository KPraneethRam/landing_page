import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Bubble } from "./Bubble";
import { Streams } from "./Streams";
import { Sparks } from "./Sparks";
import { channels, palette } from "./palette";

// One scene behind the whole page. Each <section data-scene="x y z scale flow heat dim"> pins a
// pose for the rig; scrolling blends between the poses of neighbouring sections. `dim` (0..1)
// pulls the whole scene back behind reading-heavy sections so the copy leads.

type Pose = { x: number; y: number; z: number; scale: number; flow: number; heat: number; dim: number };
const POSE_KEYS: (keyof Pose)[] = ["x", "y", "z", "scale", "flow", "heat", "dim"];

type Quality = { dpr: number; curve: number; bevel: number; perChannel: number; orbit: number; dust: number; samples: number };

function pickQuality(): Quality {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  if (small || weak) return { dpr: 1.5, curve: 28, bevel: 8, perChannel: 380, orbit: 500, dust: 500, samples: 0 };
  return { dpr: 2, curve: 48, bevel: 12, perChannel: 900, orbit: 1100, dust: 1400, samples: 4 };
}

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export class Experience {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  private rig = new THREE.Group();
  private core: Bubble;
  private streams: Streams;
  private sparks: Sparks;
  private timer = new THREE.Timer();

  private sections: { el: HTMLElement; pose: Pose; anchor: number }[] = [];
  private pose: Pose = { x: 0, y: 0, z: 9, scale: 1, flow: 1, heat: 1, dim: 0 };
  private appliedDim = -1;
  private intro = 0;
  private time = 0;

  private pointerNdc = new THREE.Vector2(0, 0);
  private pointerActive = false;
  private parallax = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private localRay = new THREE.Ray();
  private inverse = new THREE.Matrix4();
  private hit = new THREE.Vector3();
  private hoveringCore = false;
  private projected = new THREE.Vector3();

  /** Runs after each rendered frame, so DOM overlays stay in sync with the camera. */
  onAfterFrame: ((dt: number) => void) | null = null;

  private focusTarget = 0;
  private reducedMotion: MediaQueryList;
  private quality: Quality;

  constructor(canvas: HTMLCanvasElement) {
    this.quality = pickQuality();
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.dpr));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(palette.lacquer);

    this.core = new Bubble(this.quality.curve, this.quality.bevel);
    this.streams = new Streams(this.quality.perChannel);
    this.sparks = new Sparks(this.quality.orbit, this.quality.dust);
    this.rig.add(this.core.object, this.streams.points, this.sparks.orbit.points);
    this.scene.add(this.rig, this.sparks.dust.points);
    this.camera.position.set(0, 0, 9);

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.quality.samples });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.55, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.timer.connect(document);
    this.resize();
    this.readSections();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.setAnimationLoop(this.frame);
  }

  /** Highlight one channel's stream (by index into `channels`), or clear with null. */
  setFocus(index: number | null) {
    if (index === null) {
      this.focusTarget = 0;
      return;
    }
    this.focusTarget = 1;
    this.streams.uniforms.uFocusChannel.value = index;
    this.core.uniforms.uFocusColor.value.setHex(channels[index].color);
  }

  pulse() {
    this.core.uniforms.uPulse.value = 1;
  }

  /**
   * Projects a point along a channel's stream to CSS pixels. `e` runs from 0 (emitter) to 1 (core).
   * Returns false when the point is behind the camera.
   */
  projectStream(channel: number, e: number, out: { x: number; y: number }) {
    const p = this.streams.streamPoint(channel, e, this.projected);
    p.applyMatrix4(this.rig.matrixWorld).project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    return p.z < 1;
  }

  get isHoveringCore() {
    return this.hoveringCore;
  }

  private readSections() {
    this.sections = [...document.querySelectorAll<HTMLElement>("[data-scene]")].map((el) => {
      const v = el.dataset.scene!.trim().split(/\s+/).map(Number);
      const pose = Object.fromEntries(POSE_KEYS.map((k, i) => [k, v[i] ?? 0])) as Pose;
      return { el, pose, anchor: 0 };
    });
    this.measureSections();
    Object.assign(this.pose, this.sections[0]?.pose);
  }

  private measureSections() {
    for (const s of this.sections) {
      const rect = s.el.getBoundingClientRect();
      // A section's pose is fully reached when its top hits the upper third of the viewport.
      s.anchor = rect.top + window.scrollY - window.innerHeight * 0.33;
    }
    if (this.sections[0]) this.sections[0].anchor = 0;
  }

  private targetPose(out: Pose) {
    const y = window.scrollY;
    const s = this.sections;
    if (!s.length) return out;
    if (y <= s[0].anchor) return Object.assign(out, s[0].pose);
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i];
      const b = s[i + 1];
      if (y < b.anchor) {
        let t = (y - a.anchor) / Math.max(b.anchor - a.anchor, 1);
        t = t * t * (3 - 2 * t);
        for (const k of POSE_KEYS) out[k] = a.pose[k] + (b.pose[k] - a.pose[k]) * t;
        return out;
      }
    }
    return Object.assign(out, s[s.length - 1].pose);
  }

  private scratchPose: Pose = { x: 0, y: 0, z: 0, scale: 0, flow: 0, heat: 0, dim: 0 };

  private frame = () => {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const calm = this.reducedMotion.matches;
    this.time += dt * (calm ? 0.12 : 1);
    this.intro = Math.min(this.intro + dt / (calm ? 0.01 : 2.6), 1);
    const introEase = 1 - Math.pow(1 - this.intro, 3);

    // Pose from scroll, adapted to narrow screens: the core moves up above the copy instead of beside it.
    const t = this.targetPose(this.scratchPose);
    const aspect = this.camera.aspect;
    const wide = THREE.MathUtils.clamp((aspect - 0.7) / 0.7, 0, 1);
    const rate = calm ? 20 : 3.2;
    this.pose.x = damp(this.pose.x, t.x * wide, rate, dt);
    this.pose.y = damp(this.pose.y, t.y + (1 - wide) * 1.55, rate, dt);
    this.pose.z = damp(this.pose.z, t.z + (1 - wide) * 2.2, rate, dt);
    this.pose.scale = damp(this.pose.scale, t.scale * (0.78 + wide * 0.22), rate, dt);
    this.pose.flow = damp(this.pose.flow, t.flow, rate, dt);
    this.pose.heat = damp(this.pose.heat, t.heat, rate, dt);
    // On narrow screens the copy always sits over the core, so it never dims less than this.
    this.pose.dim = damp(this.pose.dim, Math.max(t.dim, (1 - wide) * 0.3), rate, dt);
    const dim = Math.round(this.pose.dim * 100) / 100;
    if (dim !== this.appliedDim) {
      this.appliedDim = dim;
      document.documentElement.style.setProperty("--scene-dim", String(dim));
    }

    this.rig.position.set(this.pose.x, this.pose.y, 0);
    this.rig.scale.setScalar(this.pose.scale * (0.35 + 0.65 * introEase));
    this.rig.rotation.y = Math.sin(this.time * 0.08) * 0.3 + window.scrollY * 0.00025;
    // The streams swirl with the rig, but the bubble keeps its face (and its typing dots) to camera.
    const bubble = this.core.object.rotation;
    bubble.y = -this.rig.rotation.y + Math.sin(this.time * 0.5) * 0.12 + this.parallax.x * 0.25;
    bubble.x = Math.sin(this.time * 0.63) * 0.07 - this.parallax.y * 0.2;
    bubble.z = Math.sin(this.time * 0.41) * 0.05;
    this.core.object.position.y = Math.sin(this.time * 0.9) * 0.05;

    // Cursor parallax on the camera; skipped for reduced motion.
    const px = calm || !this.pointerActive ? 0 : this.pointerNdc.x;
    const py = calm || !this.pointerActive ? 0 : this.pointerNdc.y;
    this.parallax.x = damp(this.parallax.x, px * 0.45, 2.5, dt);
    this.parallax.y = damp(this.parallax.y, py * 0.3, 2.5, dt);
    this.camera.position.set(this.parallax.x, this.parallax.y, this.pose.z);
    this.camera.lookAt(this.parallax.x * 0.3, this.parallax.y * 0.3, 0);

    this.rig.updateMatrixWorld();
    this.updatePointerHit(calm);

    const cu = this.core.uniforms;
    cu.uTime.value = this.time;
    cu.uHeat.value = this.pose.heat;
    cu.uPulse.value = damp(cu.uPulse.value, 0, 2.2, dt);
    cu.uFocus.value = damp(cu.uFocus.value, this.focusTarget, 6, dt);
    this.core.update(this.time, this.pose.heat, 1 + cu.uFocus.value * 0.6 + cu.uPulse.value * 0.8);

    const su = this.streams.uniforms;
    su.uTime.value = this.time;
    su.uFlow.value = this.pose.flow * introEase;
    su.uFocus.value = cu.uFocus.value;

    this.sparks.setTime(this.time);
    this.sparks.dust.points.rotation.y = this.time * 0.008;

    this.composer.render(dt);
    this.onAfterFrame?.(dt);
  };

  private updatePointerHit(calm: boolean) {
    const cu = this.core.uniforms;
    let target = 0;
    this.hoveringCore = false;
    if (this.pointerActive) {
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      this.inverse.copy(this.core.mesh.matrixWorld).invert();
      this.localRay.copy(this.raycaster.ray).applyMatrix4(this.inverse);
      if (this.localRay.intersectBox(this.core.bounds, this.hit)) {
        this.hoveringCore = true;
        if (!calm) {
          cu.uPointer.value.copy(this.hit);
          target = 1;
        }
      }
    }
    cu.uPointerAmt.value = damp(cu.uPointerAmt.value, target, 4, 1 / 60);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const ratio = this.renderer.getPixelRatio();
    this.streams.uniforms.uPixelRatio.value = ratio;
    this.sparks.setPixelRatio(ratio);
  }

  private onResize = () => {
    this.resize();
    this.measureSections();
  };

  /** Call when page layout changes height (fonts loaded, images, etc.). */
  remeasure() {
    this.measureSections();
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    this.pointerActive = true;
    this.pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };

  private onPointerLeave = () => {
    this.pointerActive = false;
  };

  private onPointerDown = () => {
    if (this.hoveringCore) this.pulse();
  };

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("pointerdown", this.onPointerDown);
    this.core.dispose();
    this.streams.dispose();
    this.sparks.dispose();
    this.composer.dispose();
    this.timer.dispose();
    this.renderer.dispose();
  }
}
