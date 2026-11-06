// Тестовый шоурум: тёмный гараж, ряд одной машины в разных цветах. Клик по машине открывает конфигуратор без фона.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const DRACO_PATH = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/';
const STEP = 3.7;          // шаг боксов, м
const WALL_Z = -7, CEIL_Y = 6.5;
const coarse = matchMedia('(pointer: coarse)').matches;
const $ = s => document.querySelector(s);

// ---------- Текстуры на холсте ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Бесшовная сота: прямоугольник 3r × √3r повторяется без стыков.
function hexTex(line, lw, bg = null) {
  const r = 64, W = 3 * r, H = Math.round(Math.sqrt(3) * r);
  const t = canvasTex(W, H, ctx => {
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
    ctx.strokeStyle = line; ctx.lineWidth = lw;
    const hex = (cx, cy) => {
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (Math.PI / 3) * i;
        ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      ctx.stroke();
    };
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2], [W / 2, -H / 2], [W / 2, H * 1.5]]) hex(x, y);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- Сцена гаража ----------
function buildGarage(scene, renderer, count) {
  const half = (count / 2 + 3) * STEP;
  const add = (geo, mat, pos, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.x = rx;
    scene.add(m);
    return m;
  };
  // Пол: слабое зеркало под тёмным слоем с еле видными сотами.
  if (!coarse) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const mirror = new Reflector(new THREE.PlaneGeometry(half * 2, 30), { color: 0x6d7076, textureWidth: size.x * 0.6, textureHeight: size.y * 0.6 });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.set(0, -0.006, 8);
    scene.add(mirror);
  }
  add(new THREE.PlaneGeometry(half * 2, 30), new THREE.MeshStandardMaterial({ color: '#0d0e11', roughness: 0.55, metalness: 0.2, transparent: !coarse, opacity: 0.9 }), [0, -0.003, 8], -Math.PI / 2).renderOrder = 1;
  const floorHex = hexTex('rgba(255,255,255,.16)', 2);
  floorHex.repeat.set(half / 1.2, 10);
  add(new THREE.PlaneGeometry(half * 2, 30), new THREE.MeshBasicMaterial({ map: floorHex, transparent: true, depthWrite: false, toneMapped: false }), [0, -0.001, 8], -Math.PI / 2).renderOrder = 2;

  // Стена с вертикальным градиентом.
  const wall = canvasTex(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1c1d21'); g.addColorStop(0.55, '#34363c'); g.addColorStop(1, '#141518');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  add(new THREE.PlaneGeometry(half * 2, CEIL_Y), new THREE.MeshBasicMaterial({ map: wall, toneMapped: false }), [0, CEIL_Y / 2, WALL_Z]);

  // Потолок: светящиеся соты.
  const ceilHex = hexTex('#ffffff', 5, '#08080a');
  ceilHex.repeat.set(half / 1.4, 12);
  ceilHex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  add(new THREE.PlaneGeometry(half * 2, 34), new THREE.MeshBasicMaterial({ map: ceilHex, toneMapped: false, color: '#c9ccd2' }), [0, CEIL_Y, 10], Math.PI / 2);

  // Логотип на стене со свечением.
  const loader = new THREE.TextureLoader();
  const W = innerWidth < innerHeight ? 5.4 : 10, H = W * 317 / 1825;   // на телефоне логотип влезает в экран
  const logo = (file, extra, z) => {
    const t = loader.load(`../assets/stage/${file}`);
    t.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, ...extra }), [0, 4.3, z]);
  };
  logo('logo-glow.png', { blending: THREE.AdditiveBlending, opacity: 0.7 }, WALL_Z + 0.02);
  logo('logo.png', {}, WALL_Z + 0.04);

  // Свет и отражения: в кузове отражаются те же соты.
  scene.add(new THREE.HemisphereLight('#ffffff', '#30323a', 1.1));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(0, 8, 6);
  scene.add(key);
  const env = new THREE.Scene();
  env.background = new THREE.Color('#17181c');
  const hexEnv = hexTex('#ffffff', 10, '#3a3c42');
  hexEnv.repeat.set(5, 5);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: hexEnv, color: '#ffffff' }));
  top.rotation.x = Math.PI / 2;
  top.position.y = 5;
  env.add(top);
  for (const [x, z, w] of [[0, 12, 24], [0, -12, 24]]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.6), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    strip.position.set(x, 2.4, z);
    env.add(strip);
  }
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, 0.02).texture;
}

// Разметка бокса: линии, номер, мягкая тень под машиной.
function buildBay(scene, i, x) {
  const line = new THREE.MeshBasicMaterial({ color: '#d8dade', toneMapped: false });
  const strip = (w, d, px, pz) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), line);
    m.rotation.x = -Math.PI / 2;
    m.position.set(px, 0.002, pz);
    scene.add(m);
  };
  strip(0.05, 6.6, x - STEP / 2, 0.2);
  strip(0.05, 6.6, x + STEP / 2, 0.2);
  const num = canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d8dade';
    ctx.font = '700 92px Manrope, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), w / 2, h / 2);
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: num, transparent: true, depthWrite: false, toneMapped: false }));
  label.rotation.x = -Math.PI / 2;
  label.position.set(x, 0.003, 3.3);
  label.renderOrder = 4;
  scene.add(label);
  const shadow = canvasTex(128, 256, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2); ctx.scale(1, 2);
    const g = ctx.createRadialGradient(0, 0, 8, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(0.7, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill();
  });
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(3, 6.2), new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.set(x, 0.0025, 0);
  sh.renderOrder = 3;
  scene.add(sh);
  return sh;
}

// ---------- Машины ----------
function dressCar(car, paintOpt, model, shared) {
  car.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.name === 'Car paint') o.material = paintOpt.material;
    if (o.material.transparent) o.renderOrder = 5;     // стёкла поверх слоёв пола
  });
  for (const [group, opt] of Object.entries(shared)) {
    for (const name of model.targets[group].nodes) {
      car.getObjectByName(name)?.traverse(o => { if (o.isMesh) o.material = opt; });
    }
  }
}

function tinted(base, o) {
  const m = base.clone();
  m.color.set(o.color);
  if (o.metalness != null) m.metalness = o.metalness;
  if (o.roughness != null) m.roughness = o.roughness;
  return m;
}

function firstMaterial(root, test) {
  let found = null;
  root.traverse(o => { if (!found && o.isMesh && test(o)) found = o.material; });
  return found;
}

// ---------- Запуск ----------
const data = await fetch('../data/zeekr-8x.json').then(r => r.json());
const step = id => data.steps.find(s => s.id === id);
const paints = data.showroom.cars.map(c => (c.color ? c : step('paint').options.find(o => o.id === c.id)));
const edition = step('edition').options[0];
const fmt = new Intl.NumberFormat(data.locale, { maximumFractionDigits: 0 });

if (coarse) $('#hero p').textContent = 'Нажми на машину и попадёшь в конфигуратор. Ряд листается пальцем.';
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#050506');
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 80);
buildGarage(scene, renderer, paints.length);

const gltfLoader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO_PATH));
const gltf = await gltfLoader.loadAsync('../assets/models/zeekr-8x-lite.glb', e => {
  if (!e.total) return;
  const p = Math.round((e.loaded / e.total) * 100);
  $('#bar').style.width = `${p}%`;
  $('#pct').textContent = `${p}%`;
});

const paintBase = firstMaterial(gltf.scene, o => o.material.name === 'Car paint');
const nodeMat = group => {
  const node = gltf.scene.getObjectByName(data.model.targets[group].nodes[0]);
  return firstMaterial(node, () => true);
};
// Диски и салон – как в конфигураторе по умолчанию.
const shared = {
  rims: tinted(nodeMat('rims'), step('rims').options[0]),
  interior: tinted(nodeMat('interior'), step('interior').options[0]),
};
const cx = i => (i - (paints.length - 1) / 2) * STEP;
const cars = [];
const hitboxes = [];
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
paints.forEach((o, i) => {
  o.material = tinted(paintBase, o);
  const car = gltf.scene.clone(true);
  dressCar(car, o, data.model, shared);
  // Свои материалы у каждой машины: остальные растворяются, пока выбрана одна.
  const mats = new Map();
  car.traverse(n => {
    if (!n.isMesh) return;
    if (!mats.has(n.material)) {
      const m = n.material.clone();
      mats.set(n.material, { m, op: m.opacity, tr: m.transparent });
    }
    n.material = mats.get(n.material).m;
  });
  car.rotation.y = Math.PI;          // перед машины к зрителю
  car.position.x = cx(i);
  scene.add(car);
  const shadow = buildBay(scene, i, cx(i));
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 5.4), hitMat);
  box.position.set(cx(i), 0.95, 0);
  box.userData.index = i;
  scene.add(box);
  hitboxes.push(box);
  cars.push({ root: car, shadow, box, x: cx(i), mats: [...mats.values()], f: 1, fTo: 1, yaw: 0, yawTo: 0, wheels: null });
});

function setFade(c, f) {
  c.f = f;
  c.root.visible = f > 0.01;
  c.shadow.material.opacity = f;
  for (const e of c.mats) {
    const t = e.tr || f < 0.999;
    if (e.m.transparent !== t) { e.m.transparent = t; e.m.needsUpdate = true; }
    e.m.opacity = e.op * f;
  }
}

// Колёса: собираем диск, шину и эмблему каждого угла в группу с центром на оси, чтобы они крутились.
function prepWheels(c) {
  if (c.wheels) return;
  c.root.updateMatrixWorld(true);
  c.wheels = [];
  for (const k of ['Frnt_Rght', 'Frnt_Lft', 'Bck_Rght', 'Bck_Lft']) {
    const tire = c.root.getObjectByName(`Tire_${k}`);
    if (!tire) continue;
    const center = new THREE.Box3().setFromObject(tire).getCenter(new THREE.Vector3());
    const g = new THREE.Group();
    c.root.add(g);
    g.position.copy(c.root.worldToLocal(center));
    g.updateMatrixWorld(true);
    for (const pre of ['Tire_', 'Wheel_', 'Wheel_WHT_', 'Wheel_Logo_']) {
      const n = c.root.getObjectByName(pre + k);
      if (n) g.attach(n);
    }
    c.wheels.push(g);
  }
}

// ---------- Камера и управление ----------
const maxPan = cx(paints.length - 1);
const WHEEL_R = 0.39;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let pan = 0, panTo = 0, mx = 0, focus = -1, driving = null;
let enterTimer = null, exitTimer = null, pendingCar = -1;
const camPos = new THREE.Vector3(0, 2.4, 14), camLook = new THREE.Vector3(0, 1.5, 0);
const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();

function aimCamera() {
  const portrait = camera.aspect < 1;
  if (focus >= 0) {
    // Выбранная машина чуть крупнее ряда (в 1,3 раза): по центру, рядом с карточкой, на телефоне над ней.
    const x = cars[focus].x, off = 0;
    wantPos.set(x + off + mx * 0.25, portrait ? 2.6 : 1.9, portrait ? 14 : 10.8);
    wantLook.set(x + off, portrait ? -0.2 : 1.1, 0);
  } else {
    wantPos.set(pan + mx * 0.9, portrait ? 2.2 : 2.4, portrait ? 12 : 14);
    wantLook.set(pan + mx * 0.3, 1.5, 0);
  }
}

function fillCard(i) {
  const o = paints[i];
  $('#bay').textContent = `Бокс ${String(i + 1).padStart(2, '0')}`;
  $('#car-name').textContent = data.title;
  $('#car-color').textContent = o.name;
  const price = (edition.price + (o.price || 0)) * (1 + data.vat);
  $('#specs').innerHTML = `<div><dt>${fmt.format(Math.round(price))} ${data.currency}</dt><dd>цена от</dd></div>` +
    edition.specs.slice(0, 2).map(s => `<div><dt>${s.value}</dt><dd>${s.label.split(' (')[0]}</dd></div>`).join('');
}

let prefetched = false;
function enterFocus(i) {
  clearTimeout(exitTimer); exitTimer = null;
  if (focus === i || driving) return;
  if (focus >= 0) leaveCar(cars[focus]);
  focus = i;
  panTo = cars[i].x;
  const c = cars[i];
  c.box.scale.x = 2.2;                 // с поворотом машина шире
  c.yawTo = 0.6;                       // показываем три четверти
  cars.forEach((o, n) => { o.fTo = n === i ? 1 : 0; });
  prepWheels(c);
  fillCard(i);
  $('#hero').hidden = true;
  $('#card').hidden = false;
  renderer.domElement.style.cursor = 'grab';
  // Заранее подгружаем полную модель, чтобы конфигуратор открылся быстрее.
  if (!prefetched) { prefetched = true; fetch('../assets/models/zeekr-8x.glb').catch(() => {}); }
}
function leaveCar(c) { c.box.scale.x = 1; c.yawTo = 0; }
function exitFocus() {
  clearTimeout(exitTimer); exitTimer = null;
  if (focus < 0 || driving) return;
  leaveCar(cars[focus]);
  focus = -1;
  cars.forEach(o => { o.fTo = 1; });
  $('#hero').hidden = false;
  $('#card').hidden = true;
  renderer.domElement.style.cursor = '';
}

function configuratorUrl(i) { return `../?plain=1&back=showroom&paint=${encodeURIComponent(paints[i].id)}`; }
function startDrive(i) {
  if (driving) return;
  clearTimeout(enterTimer); clearTimeout(exitTimer); exitTimer = null;
  if (reduced) {
    $('#fade').classList.add('on');
    setTimeout(() => { location.href = configuratorUrl(i); }, 480);
    return;
  }
  if (focus !== i) enterFocus(i);
  const c = cars[i];
  // Из бокса вперёд, плавный поворот, дальше вбок за край кадра.
  const z = 5.4;
  const path = new THREE.CurvePath();
  path.add(new THREE.CubicBezierCurve3(new THREE.Vector3(c.x, 0, 0), new THREE.Vector3(c.x, 0, 3.4),
    new THREE.Vector3(c.x + 0.8, 0, z), new THREE.Vector3(c.x + 5.5, 0, z)));
  path.add(new THREE.LineCurve3(new THREE.Vector3(c.x + 5.5, 0, z), new THREE.Vector3(c.x + 26, 0, z)));
  driving = { c, i, path, len: path.getLength(), t: 0, u: 0, faded: false };
  c.yawTo = 0;
  $('#card').hidden = true;
  renderer.domElement.style.cursor = '';
}
$('#open').onclick = () => { if (focus >= 0) startDrive(focus); };
$('#card').addEventListener('pointerenter', () => { clearTimeout(exitTimer); exitTimer = null; });
$('#card').addEventListener('pointerleave', () => { if (!coarse) armExit(); });
function armExit() {
  if (exitTimer || driving) return;
  exitTimer = setTimeout(() => { exitTimer = null; exitFocus(); }, 800);
}

const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
const pick = e => {
  pt.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pt, camera);
  const list = focus >= 0 ? [cars[focus].box] : hitboxes;
  return ray.intersectObjects(list)[0]?.object.userData.index ?? -1;
};
const clampPan = v => THREE.MathUtils.clamp(v, -maxPan, maxPan);
let down = null;
const el = renderer.domElement;
el.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY, pan: panTo, moved: false, yaw: focus >= 0 ? cars[focus].yawTo : 0, overCar: focus >= 0 && pick(e) === focus };
  el.setPointerCapture(e.pointerId);
});
el.addEventListener('pointermove', e => {
  mx = coarse ? 0 : (e.clientX / innerWidth) * 2 - 1;
  if (down) {
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 6) down.moved = true;
    if (!down.moved || driving) return;
    if (focus >= 0) {
      cars[focus].yawTo = down.yaw + dx * 0.009;   // крутим выбранную машину
      el.style.cursor = 'grabbing';
    } else {
      panTo = clampPan(down.pan - dx * 0.025);
    }
    return;
  }
  if (coarse || driving) return;
  const i = pick(e);
  if (focus >= 0) {
    if (i === focus) { clearTimeout(exitTimer); exitTimer = null; } else armExit();
    return;
  }
  if (i !== pendingCar) {
    pendingCar = i;
    clearTimeout(enterTimer);
    if (i >= 0) enterTimer = setTimeout(() => enterFocus(i), 160);
  }
});
el.addEventListener('pointerup', e => {
  const d = down;
  down = null;
  if (focus >= 0 && !driving) el.style.cursor = 'grab';
  if (!d || d.moved) return;
  const i = pick(e);
  if (focus >= 0) {
    if (i === focus) startDrive(focus);
    else if (coarse) exitFocus();
  } else if (i >= 0) {
    if (coarse) enterFocus(i); else startDrive(i);     // на телефоне первый тап выбирает, второй увозит
  }
});
addEventListener('wheel', e => {
  if (driving) return;
  exitFocus();
  panTo = clampPan(panTo + (e.deltaY + e.deltaX) * 0.012);
}, { passive: true });
addEventListener('keydown', e => {
  if (driving) return;
  if (e.key === 'Escape') exitFocus();
  if (e.key === 'ArrowRight') { exitFocus(); panTo = clampPan(panTo + STEP); }
  if (e.key === 'ArrowLeft') { exitFocus(); panTo = clampPan(panTo - STEP); }
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
// Возврат кнопкой «назад» браузера из кэша: машина уже уехала, начинаем заново.
addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

function stepDrive(dt) {
  const d = driving, c = d.c;
  d.t += dt;
  // Сначала выпрямляется в боксе, затем разгон.
  if (d.t < 0.4) return;
  const t = (d.t - 0.4) / 2.1;
  const u = Math.min(1, t * t);
  const ds = (u - d.u) * d.len;
  d.u = u;
  const p = d.path.getPointAt(u), tan = d.path.getTangentAt(u);
  c.root.position.set(p.x, 0, p.z);
  const heading = Math.atan2(-tan.x, -tan.z);
  c.root.rotation.y = heading;
  c.shadow.position.set(p.x, c.shadow.position.y, p.z);
  c.shadow.rotation.z = heading;
  for (const w of c.wheels ?? []) w.rotation.x -= ds / WHEEL_R;
  if (!d.faded && t > 0.72) { d.faded = true; $('#fade').classList.add('on'); }
  if (t >= 1 && !d.gone) { d.gone = true; location.href = configuratorUrl(d.i); }
}

// Шейдеры для растворения готовим заранее, иначе на первом наведении будет рывок.
cars.forEach(c => c.mats.forEach(e => { e.m.transparent = true; }));
renderer.compile(scene, camera);
cars.forEach(c => c.mats.forEach(e => { e.m.transparent = e.tr; }));

const clock = new THREE.Clock();
let shown = false;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta());
  pan += (panTo - pan) * Math.min(1, dt * 5);
  for (const c of cars) {
    if (c.f !== c.fTo) {
      const n = c.fTo > c.f ? Math.min(c.fTo, c.f + dt / 0.35) : Math.max(c.fTo, c.f - dt / 0.35);
      setFade(c, n);
    }
    if (!(driving && driving.c === c && driving.t >= 0.4)) {
      c.yaw += (c.yawTo - c.yaw) * Math.min(1, dt * (driving?.c === c ? 9 : 5));
      c.root.rotation.y = Math.PI + c.yaw;
    }
  }
  if (driving) stepDrive(dt);
  aimCamera();
  const k = Math.min(1, dt * 3.2);
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  renderer.render(scene, camera);
  if (!shown) { shown = true; setTimeout(() => $('#loader').classList.add('done'), 300); }
});
