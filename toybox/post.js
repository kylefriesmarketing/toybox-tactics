// ============================================================
// AGE OF TOYS — post-processing: the "photographed miniature" look.
//
// Real toys get photographed with a macro lens, so only a shallow band is in
// focus and everything nearer/farther melts. That tilt-shift falloff is the
// single strongest cue that a scene is SMALL — which is exactly the fantasy.
// On top of it: a soft bloom so lamps, sparks and cinematic beats actually
// glow, a vignette to frame the page, and a gentle storybook grade.
//
// Pure view. Never reads or touches the sim.
//
// Pipeline (all reduced-res except the scene itself, so it stays cheap):
//   scene ─→ sceneRT (HDR, MSAA)
//            ├─ bright-pass ─→ ¼ ─→ blurH ─→ blurV ──┐ bloom
//            └─ downsample  ─→ ½ ─→ blurH ─→ blurV ─┐│ defocus
//   composite(sharp, defocused, bloom) ─→ screen (tone map + sRGB here)
//
// ⚠️ three.js applies toneMapping ONLY when the target is the canvas
// (WebGLPrograms: `currentRenderTarget === null`). So the scene lands in
// sceneRT as LINEAR HDR, and the composite pass — which does draw to the
// canvas — applies the very same ACES + sRGB the game used before. That is
// what keeps the base look identical instead of double-graded.
// ============================================================

import * as THREE from 'three';

const QUAD_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// 4-tap box downsample, with an optional bright-pass for the bloom chain
const BRIGHT_FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2 texel;      // 1 / source size
  uniform float threshold; // < 0 → plain copy
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv + texel * vec2(-0.5, -0.5)).rgb;
    c += texture2D(tDiffuse, vUv + texel * vec2( 0.5, -0.5)).rgb;
    c += texture2D(tDiffuse, vUv + texel * vec2(-0.5,  0.5)).rgb;
    c += texture2D(tDiffuse, vUv + texel * vec2( 0.5,  0.5)).rgb;
    c *= 0.25;
    if (threshold >= 0.0) {
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // soft knee: fade in over the threshold instead of a hard clip
      c *= smoothstep(threshold, threshold + 0.55, l);
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

// separable gaussian, 5 taps using linear-filtered offsets (≈9-tap quality)
const BLUR_FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2 dir;        // texel-space step, already scaled
  varying vec2 vUv;
  void main() {
    vec3 c  = texture2D(tDiffuse, vUv).rgb * 0.2270270;
    c += (texture2D(tDiffuse, vUv + dir * 1.3846154).rgb
        + texture2D(tDiffuse, vUv - dir * 1.3846154).rgb) * 0.3162162;
    c += (texture2D(tDiffuse, vUv + dir * 3.2307692).rgb
        + texture2D(tDiffuse, vUv - dir * 3.2307692).rgb) * 0.0702702;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const COMPOSITE_FRAG = `
  uniform sampler2D tScene;
  uniform sampler2D tBlur;
  uniform sampler2D tBloom;
  uniform float bloomStrength;
  uniform float focusY;     // screen-space centre of the sharp band
  uniform float bandHalf;   // half-height of the fully sharp band
  uniform float bandSoft;   // how far past the band until max defocus
  uniform float blurMax;
  uniform float vignette;
  uniform float saturation;
  uniform float aspect;
  uniform vec3 tint;        // per-map colour identity (multiply, 1,1,1 = neutral)
  uniform float lift;       // tiny exposure trim per map
  varying vec2 vUv;

  void main() {
    vec3 sharp = texture2D(tScene, vUv).rgb;
    vec3 soft  = texture2D(tBlur,  vUv).rgb;

    // tilt-shift: a horizontal band stays crisp, everything above (far) and
    // below (near) softens — the macro-lens falloff that reads as "tiny".
    float d = abs(vUv.y - focusY);
    float coc = smoothstep(bandHalf, bandHalf + bandSoft, d) * blurMax;
    vec3 c = mix(sharp, soft, coc);

    c += texture2D(tBloom, vUv).rgb * bloomStrength;

    // storybook grade: a touch more colour, nothing clever
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, saturation);

    // per-map identity: every room gets its own light. Applied BEFORE the tone
    // map so it behaves like a lamp colour rather than a filter slapped on top.
    c *= tint * lift;

    // vignette (aspect-corrected so it stays circular, not squashed)
    vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
    c *= 1.0 - clamp(dot(q, q) * vignette, 0.0, 1.0);

    gl_FragColor = vec4(max(c, 0.0), 1.0);

    // the ONLY tone map / encode in the chain — matches the pre-post look
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Art direction. Deliberately restrained: this should read as a nicer
// photograph of the same game, not a different game. Tuned against captures —
// see the threshold note, which was found the hard way.
export const POST_PRESET = {
  // ⚠️ bloomThreshold is in LINEAR light, and this is a BRIGHT toy world: the
  // playmat road and other pale surfaces sit just under 1.0. Thresholds below
  // ~0.9 make the floor itself glow and the whole frame hazes over (0.18 was a
  // white-out). Keeping it at 1.0 uses the HDR headroom as the gate, so only
  // genuinely emissive things — lamps, additive sparks, cinematic pillars —
  // bloom, exactly as they should.
  bloomThreshold: 1.0,
  bloomStrength: 1.2,
  focusY: 0.56,     // the action usually sits at/just below centre
  bandHalf: 0.18,   // the sharp band — kept wide, this is an RTS not a photo
  bandSoft: 0.38,
  blurMax: 0.9,     // < 1 on purpose: units at the screen edge stay readable
  vignette: 0.26,
  saturation: 1.10,
  blurRadius: 1.7,  // texel steps for the defocus blur
};

// Per-map colour identity. Every map already has its own ground art and props,
// but from RTS height they all read as "green and tan" — these give each room
// its own light so you know where you are at a glance. Kept SUBTLE on purpose
// (a few percent): this is a lamp changing, not a photo filter. `lift` trims
// exposure so darker rooms don't just get muddier.
export const MAP_GRADES = {
  playmat:    { tint: [1.00, 1.00, 1.00], lift: 1.00 }, // the neutral flagship
  canyon:     { tint: [0.99, 0.99, 1.04], lift: 0.98 }, // pillow shade, slightly cool
  sandbox:    { tint: [1.07, 1.01, 0.90], lift: 1.03 }, // sun-warmed sand
  garden:     { tint: [0.97, 1.05, 0.95], lift: 1.01 }, // green and growing
  oldoak:     { tint: [1.08, 0.99, 0.88], lift: 0.99 }, // amber dusk under the tree
  playground: { tint: [1.02, 1.02, 0.98], lift: 1.04 }, // bright open daylight
  kitchen:    { tint: [1.06, 1.01, 0.92], lift: 1.02 }, // tungsten over the counter
  livingroom: { tint: [1.07, 1.00, 0.93], lift: 1.00 }, // cosy lamp and tree lights
  bookshelf:  { tint: [1.05, 1.01, 0.94], lift: 1.00 }, // warm paper and varnish
  underbed:   { tint: [0.92, 0.95, 1.10], lift: 0.94 }, // cold, blue, further from the lamp
  attic:      { tint: [1.06, 1.00, 0.90], lift: 0.96 }, // dust and old sepia light
  bathtub:    { tint: [0.94, 1.02, 1.07], lift: 1.02 }, // porcelain and cool water
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.available = renderer.capabilities.isWebGL2 === true;
    this.p = { ...POST_PRESET };

    // full-screen triangle — one draw, no seam down the middle like two tris
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.quadGeo = geo;
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mk = (frag, uniforms, toneMapped = false) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT, fragmentShader: frag, uniforms,
        depthTest: false, depthWrite: false,
      });
      m.toneMapped = toneMapped; // only the composite writes final pixels
      return m;
    };

    this.brightMat = mk(BRIGHT_FRAG, {
      tDiffuse: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: -1 },
    });
    this.blurMat = mk(BLUR_FRAG, {
      tDiffuse: { value: null }, dir: { value: new THREE.Vector2() },
    });
    this.compMat = mk(COMPOSITE_FRAG, {
      tScene: { value: null }, tBlur: { value: null }, tBloom: { value: null },
      bloomStrength: { value: this.p.bloomStrength },
      focusY: { value: this.p.focusY },
      bandHalf: { value: this.p.bandHalf },
      bandSoft: { value: this.p.bandSoft },
      blurMax: { value: this.p.blurMax },
      vignette: { value: this.p.vignette },
      saturation: { value: this.p.saturation },
      aspect: { value: 1 },
      tint: { value: new THREE.Vector3(1, 1, 1) },
      lift: { value: 1 },
    }, true); // ← tone mapping + sRGB happen here

    this.quad = new THREE.Mesh(geo, this.brightMat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);

    this.targets = null;
    this.setSize();
  }

  // give the room its own light (call once per match, from startGame)
  setMapGrade(mapKey) {
    const gr = MAP_GRADES[mapKey] || MAP_GRADES.playmat;
    this.compMat.uniforms.tint.value.set(gr.tint[0], gr.tint[1], gr.tint[2]);
    this.compMat.uniforms.lift.value = gr.lift;
  }

  makeRT(w, h, samples = 0) {
    const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: THREE.HalfFloatType,          // keep >1 values so bloom has something to find
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: samples > 0,           // only the scene pass needs depth
    });
    if (samples) rt.samples = samples;    // keep the MSAA the canvas used to give us
    return rt;
  }

  setSize() {
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const w = Math.max(2, size.x | 0), h = Math.max(2, size.y | 0);
    if (this.targets && this.targets.w === w && this.targets.h === h) return;
    this.dispose();
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    this.targets = {
      w, h, hw, hh, qw, qh,
      scene: this.makeRT(w, h, 4),  // MSAA here, so post doesn't cost us antialiasing
      halfA: this.makeRT(hw, hh),
      halfB: this.makeRT(hw, hh),
      quartA: this.makeRT(qw, qh),
      quartB: this.makeRT(qw, qh),
    };
    this.compMat.uniforms.aspect.value = w / h;
  }

  dispose() {
    if (!this.targets) return;
    for (const k of ['scene', 'halfA', 'halfB', 'quartA', 'quartB']) this.targets[k].dispose();
    this.targets = null;
  }

  // draw the full-screen quad with `mat` into `target` (null = canvas)
  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  blur(src, dst, tmp, w, h, radius) {
    this.blurMat.uniforms.tDiffuse.value = src.texture;
    this.blurMat.uniforms.dir.value.set(radius / w, 0);
    this.pass(this.blurMat, tmp);
    this.blurMat.uniforms.tDiffuse.value = tmp.texture;
    this.blurMat.uniforms.dir.value.set(0, radius / h);
    this.pass(this.blurMat, dst);
  }

  render() {
    if (!this.enabled || !this.available) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.setSize();
    const t = this.targets;
    const r = this.renderer;

    // 1 — the scene, linear HDR, still antialiased
    r.setRenderTarget(t.scene);
    r.clear();
    r.render(this.scene, this.camera);

    // 2 — bloom: bright-pass to ¼ res, then blur it wide
    this.brightMat.uniforms.tDiffuse.value = t.scene.texture;
    this.brightMat.uniforms.texel.value.set(1 / t.w, 1 / t.h);
    this.brightMat.uniforms.threshold.value = this.p.bloomThreshold;
    this.pass(this.brightMat, t.quartA);
    this.blur(t.quartA, t.quartA, t.quartB, t.qw, t.qh, 2.2);
    this.blur(t.quartA, t.quartA, t.quartB, t.qw, t.qh, 3.6); // second, wider pass

    // 3 — defocus source: plain ½-res copy, blurred
    this.brightMat.uniforms.tDiffuse.value = t.scene.texture;
    this.brightMat.uniforms.texel.value.set(1 / t.w, 1 / t.h);
    this.brightMat.uniforms.threshold.value = -1; // copy, no threshold
    this.pass(this.brightMat, t.halfA);
    this.blur(t.halfA, t.halfA, t.halfB, t.hw, t.hh, this.p.blurRadius);

    // 4 — composite to the canvas (tone map + sRGB happen in this shader)
    const u = this.compMat.uniforms;
    u.tScene.value = t.scene.texture;
    u.tBlur.value = t.halfA.texture;
    u.tBloom.value = t.quartA.texture;
    u.bloomStrength.value = this.p.bloomStrength;
    u.focusY.value = this.p.focusY;
    u.bandHalf.value = this.p.bandHalf;
    u.bandSoft.value = this.p.bandSoft;
    u.blurMax.value = this.p.blurMax;
    u.vignette.value = this.p.vignette;
    u.saturation.value = this.p.saturation;
    this.pass(this.compMat, null);
  }
}
