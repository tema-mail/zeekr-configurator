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
const hitboxes = [];
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
paints.forEach((o, i) => {
  o.material = tinted(paintBase, o);
  const car = gltf.scene.clone(true);
  dressCar(car, o, data.model, shared);
  car.rotation.y = Math.PI;          // перед машины к зрителю
  car.position.x = cx(i);
  scene.add(car);
  buildBay(scene, i, cx(i));
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 5.4), hitMat);
  box.position.set(cx(i), 0.95, 0);
  box.userData.index = i;
  scene.add(box);
  hitboxes.push(box);
});

// ---------- Камера и управление ----------
const maxPan = cx(paints.length - 1);
let pan = 0, panTo = 0, mx = 0, active = -1, leaving = null;
const placeCamera = () => {
  const portrait = camera.aspect < 1;
  const dist = portrait ? 12 : 14;
  camera.position.set(pan + mx * 0.9, portrait ? 2.2 : 2.4, dist);
  camera.lookAt(pan + mx * 0.3, 1.5, 0);
};

function showCar(i) {
  if (i === active) return;
  active = i;
  $('#hero').hidden = i >= 0;
  $('#card').hidden = i < 0;
  renderer.domElement.style.cursor = i >= 0 ? 'pointer' : '';
  if (i < 0) return;
  const o = paints[i];
  $('#bay').textContent = `Бокс ${String(i + 1).padStart(2, '0')}`;
  $('#car-name').textContent = data.title;
  $('#car-color').textContent = o.name;
  const price = (edition.price + (o.price || 0)) * (1 + data.vat);
  $('#specs').innerHTML = `<div><dt>${fmt.format(Math.round(price))} ${data.currency}</dt><dd>цена от</dd></div>` +
    edition.specs.slice(0, 2).map(s => `<div><dt>${s.value}</dt><dd>${s.label.split(' (')[0]}</dd></div>`).join('');
}

function openCar(i) {
  if (leaving != null) return;
  leaving = performance.now();
  $('#fade').classList.add('on');
  panTo = cx(i);
  setTimeout(() => { location.href = `../?plain=1&back=showroom&paint=${encodeURIComponent(paints[i].id)}`; }, 480);
}
$('#open').onclick = () => { if (active >= 0) openCar(active); };

const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
const pick = e => {
  pt.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pt, camera);
  return ray.intersectObjects(hitboxes)[0]?.object.userData.index ?? -1;
};
const clampPan = v => THREE.MathUtils.clamp(v, -maxPan, maxPan);
let down = null;
const el = renderer.domElement;
el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, pan: panTo, moved: false }; el.setPointerCapture(e.pointerId); });
el.addEventListener('pointermove', e => {
  mx = coarse ? 0 : (e.clientX / innerWidth) * 2 - 1;
  if (down) {
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 6) down.moved = true;
    if (down.moved) panTo = clampPan(down.pan - dx * 0.025);
    return;
  }
  if (!coarse) showCar(pick(e));
});
el.addEventListener('pointerup', e => {
  const wasClick = down && !down.moved;
  down = null;
  if (!wasClick) return;
  const i = pick(e);
  if (i >= 0) openCar(i);
});
addEventListener('wheel', e => { panTo = clampPan(panTo + (e.deltaY + e.deltaX) * 0.012); }, { passive: true });
addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') panTo = clampPan(panTo + STEP);
  if (e.key === 'ArrowLeft') panTo = clampPan(panTo - STEP);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
// Возврат кнопкой «назад» из браузера: страница восстанавливается из кэша с белой шторкой.
addEventListener('pageshow', () => { leaving = null; $('#fade').classList.remove('on'); });

let shown = false;
renderer.setAnimationLoop(() => {
  pan += (panTo - pan) * 0.08;
  placeCamera();
  // На телефоне наведения нет: карточка у машины по центру, когда ряд сдвинули.
  if (coarse && Math.abs(panTo) > 0.5) showCar(Math.round(pan / STEP + (paints.length - 1) / 2));
  renderer.render(scene, camera);
  if (!shown) { shown = true; setTimeout(() => $('#loader').classList.add('done'), 300); }
});
