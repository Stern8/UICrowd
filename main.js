import * as THREE from 'three';

/* ───────────── Config ───────────── */
const CONFIG = {
  eyebrow: 'DYNAMIC HTML · IN CANVAS',
  title: 'UICrowd',
  sub: 'Dynamic use of HTML in canvas and audio to generate unique results.',
  video: './assets/reveal.mp4',
  videoFallback: './assets/reveal.webm',
  tilesAcross: 14,        // approx. tiles across the viewport
  holeX: 0.68,            // where the held tile sits (0..1 of viewport width)
  holeY: 0.50,            // (0..1 of viewport height)
  holeRadius: 0.30,       // hole radius as a fraction of tile size
  hoverRadius: 2.2,       // hover influence, in tiles
  fov: 35,
};

const FONT = '"Helvetica Neue", Inter, system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');
const chrome = document.getElementById('chrome');
const cta = document.getElementById('cta');
const meta = document.getElementById('meta');
const hint = document.getElementById('hint');

/* ───────────── Helpers ───────────── */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ───────────── Renderer ───────────── */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
} catch (e) {
  console.warn('WebGL unavailable', e);
  document.querySelector('.pin').style.background = '#d4d9da';
  throw e;
}
renderer.setClearColor(0xd4d9da);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.5, 20000);

/* ───────────── Video (scrubbed by scroll) ───────────── */
const video = document.createElement('video');
// Prefer MP4 (H.264) where supported, fall back to WebM (VP9). Both are all-keyframe so seeking is instant.
video.src = video.canPlayType('video/mp4; codecs="avc1.640028"') ? CONFIG.video : CONFIG.videoFallback;
video.muted = true;
video.playsInline = true;
video.preload = 'auto';
video.crossOrigin = 'anonymous';
video.setAttribute('muted', '');
// Touch the decoder once so iOS/Safari give us a first frame.
video.play().then(() => video.pause()).catch(() => {});
const videoTex = new THREE.VideoTexture(video);
videoTex.colorSpace = THREE.SRGBColorSpace;
videoTex.minFilter = videoTex.magFilter = THREE.LinearFilter;
videoTex.generateMipmaps = false;

/* ───────────── Scene state (rebuilt on resize) ───────────── */
let W = 0, H = 0, S = 0, D = 0;
let tiles = null;        // instanced mesh + physics arrays
let backdrop = null;     // plate behind tiles (has a hole)
let videoPlane = null;   // video, far behind the hole
let heroTex = null, bgTex = null;
let hole = { x: 0, y: 0, index: -1 };
let dpr = 1;
let fillDist = 0, coverDist = 0;

function paintHero(withText) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);

  // Soft studio-grey gradient, close to the reference look
  const bg = g.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#d9dee3');
  bg.addColorStop(0.5, '#d1d7d8');
  bg.addColorStop(1, '#c5cac9');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  if (withText) {
    const L = layout();
    g.fillStyle = '#5d6567';
    g.font = `500 ${Math.max(11, W * 0.0065)}px ${FONT}`;
    g.letterSpacing = '0.08em';
    g.textBaseline = 'alphabetic';
    g.fillText(CONFIG.eyebrow, L.left, L.eyebrowY);

    g.fillStyle = '#17191a';
    g.font = `700 ${L.titleSize}px ${FONT}`;
    g.letterSpacing = `${-0.045 * L.titleSize}px`;
    g.fillText(CONFIG.title, L.left - L.titleSize * 0.03, L.titleY);

    g.fillStyle = '#4b5355';
    g.font = `400 ${L.subSize}px ${FONT}`;
    g.letterSpacing = '0px';
    wrap(g, CONFIG.sub, L.left, L.subY, L.subWidth, L.subSize * 1.45);
  }
  return c;
}

function wrap(g, text, x, y, maxW, lh) {
  let line = '', row = 0;
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y + row * lh); line = word; row++;
    } else line = test;
  }
  g.fillText(line, x, y + row * lh);
}

function layout() {
  const left = Math.max(20, Math.min(56, W * 0.028));
  const titleSize = Math.min(W * 0.17, Math.max(W * 0.095, 96), 260);
  const titleY = H * 0.5 + titleSize * 0.3;
  const subSize = Math.max(15, Math.min(22, W * 0.0115));
  return {
    left, titleSize, titleY,
    eyebrowY: titleY - titleSize * 0.95,
    subSize, subY: titleY + titleSize * 0.38,
    subWidth: Math.min(W - left * 2, Math.max(300, W * 0.28)),
    ctaY: titleY + titleSize * 0.38 + subSize * 1.45 * 2 + 30,
  };
}

function build() {
  // dispose old
  if (tiles) { scene.remove(tiles.mesh); tiles.mesh.geometry.dispose(); tiles.mesh.material.dispose(); }
  if (backdrop) { scene.remove(backdrop); backdrop.geometry.dispose(); backdrop.material.dispose(); }
  if (videoPlane) { scene.remove(videoPlane); videoPlane.geometry.dispose(); videoPlane.material.dispose(); }
  heroTex?.dispose(); bgTex?.dispose();

  W = innerWidth; H = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);

  // World units are CSS pixels. At z = 0 one unit == one screen pixel when camera is at z = D.
  D = (H / 2) / Math.tan(THREE.MathUtils.degToRad(CONFIG.fov / 2));
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  S = Math.max(70, Math.min(170, Math.round(W / CONFIG.tilesAcross)));

  // Position DOM chrome from the same layout the canvas text uses
  const L = layout();
  cta.style.top = `${L.ctaY}px`;
  meta.style.top = `${L.ctaY + 20}px`;
  meta.style.left = `calc(var(--margin) + ${cta.offsetWidth + 18}px)`;

  heroTex = new THREE.CanvasTexture(paintHero(true));
  bgTex = new THREE.CanvasTexture(paintHero(false));
  for (const t of [heroTex, bgTex]) { t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; }

  // ── tiles ──
  const cols = Math.ceil(W / S) + 2;
  const rows = Math.ceil(H / S) + 2;
  const n = cols * rows;
  const ox = -(cols * S) / 2 + S / 2 + ((W % S) ? 0 : 0);
  const oy = -(rows * S) / 2 + S / 2;

  // pick the grid cell nearest the requested hole spot
  const wantX = (CONFIG.holeX - 0.5) * W, wantY = (0.5 - CONFIG.holeY) * H;
  let best = 0, bestD = 1e9;
  const cx = new Float32Array(n), cy = new Float32Array(n);
  const rect = new Float32Array(n * 4);
  const holeAttr = new Float32Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    cx[i] = ox + c * S; cy[i] = oy + r * S;
    const d = Math.hypot(cx[i] - wantX, cy[i] - wantY);
    if (d < bestD) { bestD = d; best = i; }
    rect[i * 4 + 0] = (cx[i] - S / 2 + W / 2) / W;
    rect[i * 4 + 1] = (cy[i] - S / 2 + H / 2) / H;
    rect[i * 4 + 2] = S / W;
    rect[i * 4 + 3] = S / H;
  }
  holeAttr[best] = 1;
  hole = { x: cx[best], y: cy[best], index: best };

  const geo = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));
  geo.setAttribute('aHole', new THREE.InstancedBufferAttribute(holeAttr, 1));
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTex: { value: heroTex }, uHole: { value: CONFIG.holeRadius } },
    vertexShader: /* glsl */`
      attribute vec4 aRect; attribute float aHole;
      varying vec2 vUv; varying vec2 vTex; varying float vHole; varying float vShade;
      void main() {
        vUv = uv; vHole = aHole;
        vTex = aRect.xy + uv * aRect.zw;
        vec3 n = normalize(mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
        vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
        vShade = 1.0 + (dot(n, L) - L.z) * 0.55;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uHole;
      varying vec2 vUv; varying vec2 vTex; varying float vHole; varying float vShade;
      void main() {
        if (!gl_FrontFacing) { gl_FragColor = vec4(vec3(0.075, 0.08, 0.085), 1.0); return; }
        vec3 col = texture2D(uTex, vTex).rgb;
        if (vHole > 0.5) {
          float d = length(vUv - 0.5);
          if (d < uHole) discard;
          col = mix(col, vec3(0.97), 0.55);                       // paper-white tile
          col *= mix(0.62, 1.0, smoothstep(uHole, uHole + 0.045, d)); // inner rim shading
        }
        gl_FragColor = vec4(col * vShade, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  scene.add(mesh);

  tiles = {
    mesh, n, cols, rows, cx, cy,
    // spring state per tile: offset xyz + rotation xyz, and velocities
    pos: new Float32Array(n * 3), vel: new Float32Array(n * 3),
    rot: new Float32Array(n * 3), rvel: new Float32Array(n * 3),
  };

  // ── backdrop plate: sits one tile behind, same gradient, with a (bigger) hole ──
  const bz = -0.05 * S;
  const bScale = (D - bz) / D;
  const bgeo = new THREE.PlaneGeometry(W * bScale * 1.6, H * bScale * 1.6);
  const bmat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: bgTex },
      uC: { value: new THREE.Vector2(hole.x, hole.y) },
      uR: { value: S * (CONFIG.holeRadius + 0.07) },
      uScale: { value: new THREE.Vector4(W * bScale, H * bScale, 0, 0) },
    },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform vec2 uC; uniform float uR; uniform vec4 uScale;
      varying vec2 vP;
      void main() {
        // vP is plate-local; the plate is scaled so screen space matches the hero at rest
        vec2 world = vP / (uScale.xy / vec2(${W.toFixed(1)}, ${H.toFixed(1)}));
        if (length(world - uC) < uR) discard;
        vec2 uv = world / vec2(${W.toFixed(1)}, ${H.toFixed(1)}) + 0.5;
        gl_FragColor = texture2D(uTex, clamp(uv, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
  });
  backdrop = new THREE.Mesh(bgeo, bmat);
  backdrop.position.z = bz;
  scene.add(backdrop);

  // ── video plane: sits just behind the hole, then recedes during the dive ──
  const half = Math.tan(THREE.MathUtils.degToRad(CONFIG.fov / 2));
  const asp = W / H;
  const holeR = CONFIG.holeRadius * S;
  // Camera distance at which the hole circle just circumscribes the screen (the "hole fills the view" moment)
  fillDist = (holeR / (half * Math.sqrt(1 + asp * asp))) * 0.94;
  const planeH = holeR * 2 * 1.1;
  const planeW = planeH * (16 / 9);
  // Distance from camera at which this plane exactly covers the viewport
  coverDist = planeH / (2 * half * Math.max(1, asp * 9 / 16));
  videoPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(planeW, planeH),
    new THREE.MeshBasicMaterial({ map: videoTex, toneMapped: false })
  );
  videoPlane.position.set(hole.x, hole.y, -0.1 * S);
  scene.add(videoPlane);
}

/* ───────────── Input ───────────── */
const mouse = { x: 1e5, y: 1e5, vx: 0, vy: 0, active: false };
addEventListener('pointermove', (e) => {
  const x = e.clientX - W / 2, y = -(e.clientY - H / 2);
  if (mouse.active) { mouse.vx += (x - mouse.x); mouse.vy += (y - mouse.y); }
  mouse.x = x; mouse.y = y; mouse.active = true;
}, { passive: true });
addEventListener('pointerleave', () => { mouse.active = false; mouse.x = mouse.y = 1e5; });
document.addEventListener('mouseleave', () => { mouse.active = false; mouse.x = mouse.y = 1e5; });

let targetP = 0, p = 0;
function readScroll() {
  const max = stage.offsetHeight - innerHeight;
  const top = -stage.getBoundingClientRect().top;
  targetP = clamp(top / max);
}
addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', () => { build(); readScroll(); });

/* ───────────── Frame loop ───────────── */
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e4 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
let last = performance.now();
let seekT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!tiles) return;

  p += (targetP - p) * (1 - Math.pow(0.0015, dt));   // smoothed scroll progress
  if (Math.abs(targetP - p) < 1e-4) p = targetP;
  const scatter = smooth(0.0, 0.5, p);
  const t = now / 1000;

  // pointer velocity decays → drives spin impulses
  const mvx = mouse.vx, mvy = mouse.vy;
  mouse.vx *= 0.0; mouse.vy *= 0.0;
  const speed = clamp(Math.hypot(mvx, mvy) / 40);
  const R = S * CONFIG.hoverRadius;
  const hoverGain = reduceMotion ? 0.35 : 1;
  const hoverOn = mouse.active ? 1 - smooth(0.02, 0.2, p) : 0;

  const { pos, vel, rot, rvel, cx, cy, n } = tiles;
  const K = 70, C = 10;

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const isHole = i === hole.index;
    const h1 = hash(i), h2 = hash(i + 91.7), h3 = hash(i + 17.3);

    let tx = 0, ty = 0, tz = 0, trx = 0, try_ = 0, trz = 0;

    // hover: tiles near the pointer lift, tilt and drift apart
    const dx = cx[i] - mouse.x, dy = cy[i] - mouse.y;
    const dist = Math.hypot(dx, dy) + 0.001;
    const f = Math.exp(-(dist * dist) / (R * R)) * hoverOn * hoverGain;
    if (f > 0.002 && !isHole) {
      tz += f * S * (0.35 + 0.5 * h1);
      tx += (dx / dist) * f * S * 0.22;
      ty += (dy / dist) * f * S * 0.22;
      trx += f * ((dy / R) * 1.1 + (h2 - 0.5) * 0.9);
      try_ += f * (-(dx / R) * 1.1 + (h3 - 0.5) * 0.9) * (1 + speed * 1.4);
      trz += f * (h1 - 0.5) * (0.7 + speed * 1.2);
    }

    // scroll: tiles peel outward from the hole and tumble away
    if (!isHole && scatter > 0) {
      const ex = cx[i] - hole.x, ey = cy[i] - hole.y;
      const el = Math.hypot(ex, ey) + 0.001;
      const k = scatter * scatter * (0.7 + h1) * S * 9;
      tx += (ex / el) * k; ty += (ey / el) * k;
      tz += scatter * S * (h2 * 5 - 1.2);
      trx += scatter * (h1 - 0.5) * 6; try_ += scatter * (h2 - 0.5) * 6; trz += scatter * (h3 - 0.5) * 5;
    }

    // the held tile: a gentle, hand-held sway that settles as we dive in
    if (isHole) {
      const sway = 1 - smooth(0.25, 0.7, p);
      trx += Math.sin(t * 1.1) * 0.035 * sway;
      try_ += Math.cos(t * 0.9) * 0.045 * sway;
      trz += Math.sin(t * 0.7 + 1.3) * 0.03 * sway;
    }

    // semi-implicit springs
    for (let a = 0; a < 3; a++) {
      const tp = a === 0 ? tx : a === 1 ? ty : tz;
      const tr = a === 0 ? trx : a === 1 ? try_ : trz;
      vel[i3 + a] += (K * (tp - pos[i3 + a]) - C * vel[i3 + a]) * dt;
      pos[i3 + a] += vel[i3 + a] * dt;
      rvel[i3 + a] += (K * 0.8 * (tr - rot[i3 + a]) - C * 0.9 * rvel[i3 + a]) * dt;
      rot[i3 + a] += rvel[i3 + a] * dt;
    }

    v3.set(cx[i] + pos[i3], cy[i] + pos[i3 + 1], pos[i3 + 2]);
    e4.set(rot[i3], rot[i3 + 1], rot[i3 + 2], 'XYZ');
    q.setFromEuler(e4);
    s3.set(S, S, 1);
    m4.compose(v3, q, s3);
    tiles.mesh.setMatrixAt(i, m4);
  }
  tiles.mesh.instanceMatrix.needsUpdate = true;

  /* Camera: exponential dolly until the hole fills the view, then the video recedes
     (as if flying on through the hole into the room beyond). */
  const SPLIT = 0.6;
  let cz, k;
  if (p < SPLIT) {
    const t1 = p / SPLIT;
    cz = D * Math.pow(fillDist / D, easeInOut(t1) * 0.5 + t1 * 0.5);
    k = smooth(0.0, 0.85, t1);
    videoPlane.position.z = -0.1 * S;
  } else {
    const t2 = easeInOut((p - SPLIT) / (1 - SPLIT));
    cz = fillDist;
    k = 1;
    videoPlane.position.z = THREE.MathUtils.lerp(-0.1 * S, fillDist - coverDist, t2);
  }
  camera.position.set(hole.x * k, hole.y * k, cz);
  camera.lookAt(hole.x * k, hole.y * k, -1e4);

  /* Video scrub: the paper is lowered as we get close, revealing the person. */
  if (video.readyState >= 1 && video.duration) {
    const vt = video.duration * smooth(0.12, 0.95, p) * 0.999;
    seekT += (vt - seekT) * (1 - Math.pow(0.001, dt));
    if (!video.seeking && Math.abs(video.currentTime - seekT) > 1 / 40) video.currentTime = seekT;
  }

  /* Chrome fades as the dive begins */
  const fade = 1 - smooth(0.0, 0.14, p);
  chrome.style.opacity = fade.toFixed(3);
  chrome.style.visibility = fade <= 0.001 ? 'hidden' : 'visible';
  hint.style.opacity = (1 - smooth(0.0, 0.04, p)).toFixed(3);

  renderer.render(scene, camera);
}

build();
readScroll();
p = targetP;
// Re-paint once webfonts settle so the hero type is sized/shaped correctly.
document.fonts?.ready.then(() => { build(); });
requestAnimationFrame(frame);

// Debug / test hook
window.__uicrowd = { get p() { return p; }, setProgress(v) { targetP = clamp(v); p = targetP; }, video };
