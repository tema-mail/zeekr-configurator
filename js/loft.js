// Лофт-салон Evolution Car: бетонный пол (текстура с фото салона), кирпичные стены, чёрные фермы,
// антресоль с перилами, ресепшн из зелёных стеклоблоков, живая зелень, споты, светящийся логотип.
// Машина стоит на подиуме в центре. Комната повёрнута так, что задняя стена – за машиной в стартовом ракурсе.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const HX = 15, HZ = 16, HY = 10;     // полуширина, полуглубина, высота зала, м
const FLOOR_Y = -0.045;
const STEEL = new THREE.MeshStandardMaterial({ color: '#1c1d20', roughness: 0.55, metalness: 0.6 });

export function buildLoft(renderer, opts, onReady) {
  const base = opts.dir ?? 'assets/stage';
  const manager = new THREE.LoadingManager(() => onReady?.(room));
  const loader = new THREE.TextureLoader(manager);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (file, rx = 1, ry = 1, srgb = true, mirror = false) => {
    const t = loader.load(`${base}/${file}`);
    t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const room = new THREE.Group();
  room.name = 'loft';
  const add = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    room.add(m);
    return m;
  };
  const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

  // ---------- Пол: полированный бетон поверх слабого зеркала ----------
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const mirror = new Reflector(new THREE.PlaneGeometry(HX * 2, HZ * 2), {
    color: 0x9a9da2, textureWidth: Math.max(512, size.x * 0.5), textureHeight: Math.max(512, size.y * 0.5),
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = FLOOR_Y;
  mirror.name = 'mirror';
  room.add(mirror);
  const concrete = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2),
    new THREE.MeshStandardMaterial({ map: tex('concrete.jpg', 4, 4.3, true, true), color: '#8f9296', roughness: 0.5, transparent: true, opacity: 0.94 }));
  concrete.rotation.x = -Math.PI / 2;
  concrete.position.y = FLOOR_Y + 0.002;
  concrete.receiveShadow = true;
  room.add(concrete);

  // ---------- Стены из кирпича и потолок из сэндвич-панелей ----------
  const brick = (w, h) => new THREE.MeshStandardMaterial({ map: tex('brick.jpg', w / 2.4, h / 2.4), roughness: 0.92 });
  add(new THREE.PlaneGeometry(HX * 2, HY), brick(HX * 2, HY), 0, HY / 2 + FLOOR_Y, HZ, Math.PI);      // задняя
  add(new THREE.PlaneGeometry(HX * 2, HY), brick(HX * 2, HY), 0, HY / 2 + FLOOR_Y, -HZ, 0);           // передняя
  add(new THREE.PlaneGeometry(HZ * 2, HY), brick(HZ * 2, HY), -HX, HY / 2 + FLOOR_Y, 0, Math.PI / 2); // левая
  add(new THREE.PlaneGeometry(HZ * 2, HY), brick(HZ * 2, HY), HX, HY / 2 + FLOOR_Y, 0, -Math.PI / 2); // правая
  const ceil = add(new THREE.PlaneGeometry(HX * 2, HZ * 2),
    new THREE.MeshStandardMaterial({ map: tex('ceiling.jpg', 6, 1), roughness: 0.8 }), 0, HY + FLOOR_Y, 0);
  ceil.rotation.x = Math.PI / 2;

  // Фермы под потолком: верхний и нижний пояс, стойки и раскосы.
  for (let z = -HZ + 2.5; z < HZ; z += 5) {
    box(HX * 2, 0.22, 0.18, STEEL, 0, HY - 0.25, z);
    box(HX * 2, 0.16, 0.14, STEEL, 0, HY - 1.6, z);
    for (let x = -HX; x < HX; x += 2.5) {
      box(0.1, 1.35, 0.1, STEEL, x, HY - 0.93, z);
      const diag = box(0.08, 2.85, 0.08, STEEL, x + 1.25, HY - 0.93, z);
      diag.rotation.z = (Math.floor((x + HX) / 2.5) % 2 ? 1 : -1) * Math.atan2(2.5, 1.35);
    }
  }
  for (const x of [-HX + 4, 0, HX - 4]) box(0.14, 0.14, HZ * 2, STEEL, x, HY - 0.3, 0);   // прогоны

  // Окна-полосы высоко на стенах (светятся дневным светом).
  const glass = new THREE.MeshBasicMaterial({ color: '#eef3f8', toneMapped: false });
  const frame = (w, h, x, y, z, ry) => {
    add(new THREE.PlaneGeometry(w, h), glass, x, y, z, ry);
    const f = add(new THREE.PlaneGeometry(w + 0.16, h + 0.16), STEEL, x, y, z, ry);
    f.position.add(new THREE.Vector3(0, 0, -0.01).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry));
  };
  for (const x of [-9, -3, 3, 9]) frame(3.2, 0.9, x, 7.9, HZ - 0.02, Math.PI);
  for (const z of [-10, -3.5, 3]) { frame(3.2, 0.9, -HX + 0.02, 7.6, z, Math.PI / 2); frame(3.2, 0.9, HX - 0.02, 7.6, z, -Math.PI / 2); }

  // Споты на стенах и под фермами.
  const spot = new THREE.MeshBasicMaterial({ color: '#fff6e6', toneMapped: false });
  const spotGeo = new THREE.CircleGeometry(0.09, 20);
  for (let x = -12; x <= 12; x += 4) {
    add(spotGeo, spot, x, 6.4, HZ - 0.03, Math.PI);
    add(spotGeo, spot, x, 6.4, -HZ + 0.03, 0);
  }
  for (let z = -12; z <= 12; z += 4) {
    add(spotGeo, spot, -HX + 0.03, 6.4, z, Math.PI / 2);
    add(spotGeo, spot, HX - 0.03, 6.4, z, -Math.PI / 2);
  }
  for (let z = -HZ + 2.5; z < HZ; z += 5) for (let x = -10; x <= 10; x += 5) {
    const s = add(new THREE.CircleGeometry(0.14, 20), spot, x, HY - 1.72, z);
    s.rotation.x = Math.PI / 2;
  }

  // ---------- Антресоль у задней стены: балка, колонны, перила с крестами ----------
  const MZ = HZ - 5, MY = 4;
  const deck = box(HX * 2, 0.3, 5, STEEL, 0, MY, MZ + 2.5);
  deck.material = new THREE.MeshStandardMaterial({ color: '#23252a', roughness: 0.7 });
  box(HX * 2, 0.45, 0.25, STEEL, 0, MY - 0.05, MZ);
  for (const x of [-11, -4, 4, 11]) box(0.28, MY, 0.28, STEEL, x, MY / 2 + FLOOR_Y, MZ);
  box(HX * 2, 0.06, 0.06, STEEL, 0, MY + 1.1, MZ);
  for (let x = -HX; x < HX; x += 1.6) {
    box(0.05, 0.95, 0.05, STEEL, x, MY + 0.62, MZ);
    for (const sgn of [1, -1]) {
      const d = box(0.035, 1.85, 0.035, STEEL, x + 0.8, MY + 0.62, MZ);
      d.rotation.z = sgn * Math.atan2(1.6, 0.95);
    }
  }
  // Стена под антресолью – тёмная оливковая, как в салоне.
  add(new THREE.PlaneGeometry(HX * 2, MY), new THREE.MeshStandardMaterial({ color: '#3c4237', roughness: 0.9 }), 0, MY / 2 + FLOOR_Y, HZ - 0.02, Math.PI);
  // Световая линия под антресолью.
  const lineGeo = new THREE.PlaneGeometry(4, 0.05);
  for (const x of [-9, 9]) { const l = add(lineGeo, spot, x, MY - 0.2, MZ + 1.5); l.rotation.x = Math.PI / 2; }

  // ---------- Ресепшн из зелёных стеклоблоков ----------
  const gb = tex('glassblock.jpg', 2.2, 0.75);
  const desk = new THREE.MeshStandardMaterial({ map: gb, emissiveMap: gb, emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.15, metalness: 0.1 });
  box(3.4, 1.15, 0.9, desk, 0, 0.55, MZ + 2.4);
  box(3.5, 0.05, 1.0, STEEL, 0, 1.15, MZ + 2.4);
  box(0.9, MY, 0.9, desk, -6, MY / 2 + FLOOR_Y, HZ - 0.5);   // колонна из стеклоблоков

  // ---------- Зелень ----------
  const leafMat = (file) => new THREE.MeshStandardMaterial({ map: tex(file), color: '#c9d4c2', alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  const wallGreen = add(new THREE.PlaneGeometry(7, 6), leafMat('green-wall.webp'), -HX + 0.08, 5.6, -2, Math.PI / 2);
  wallGreen.material.transparent = false;
  add(new THREE.PlaneGeometry(4, 3.5), leafMat('green-wall.webp'), 6, MY - 1.5, MZ - 0.05, Math.PI);   // свисает с антресоли
  const bushMat = leafMat('bush.webp');
  const plant = (x, z, h = 1.6) => {
    const pot = new THREE.MeshStandardMaterial({ color: '#2b2c2f', roughness: 0.6 });
    add(new THREE.CylinderGeometry(0.32, 0.25, 0.6, 24), pot, x, 0.3 + FLOOR_Y, z);
    for (let i = 0; i < 3; i++) add(new THREE.PlaneGeometry(h, h), bushMat, x, 0.55 + h / 2, z, (i * Math.PI) / 3);
  };
  plant(2.4, MZ + 2.2); plant(-2.5, MZ + 2.0, 1.3); plant(-HX + 1.2, -6.5, 1.9); plant(-HX + 1.2, 2.5, 1.5);
  plant(HX - 1.2, MZ - 1, 1.8); plant(HX - 1.3, -HZ + 1.5, 1.6);

  // Тёмный проём в правой стене (вход в сервисную зону).
  add(new THREE.PlaneGeometry(5, 4.2), new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.9 }), HX - 0.03, 2.1 + FLOOR_Y, -6, -Math.PI / 2);

  // ---------- Подиум ----------
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.65, 0.045, 128),
    new THREE.MeshStandardMaterial({ color: '#26282c', roughness: 0.3, metalness: 0.4 }));
  disc.position.y = -0.0225;
  room.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.63, 0.012, 12, 256),
    new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  room.add(ring);

  // ---------- Светящийся логотип над антресолью ----------
  if (opts.logo) {
    const w = opts.logoWidth ?? 8, h = w * (opts.logoAspect ?? 317 / 1825);
    const plane = (file, extra) => new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex(file.split('/').pop()), transparent: true, depthWrite: false, toneMapped: false, ...extra }));
    const glow = plane(opts.glow, { blending: THREE.AdditiveBlending, opacity: 0.6 });
    const core = plane(opts.logo, {});
    glow.position.set(0, 2.75, HZ - 0.06); glow.rotation.y = Math.PI;
    core.position.set(0, 2.75, HZ - 0.08); core.rotation.y = Math.PI;
    room.add(glow, core);
  }

  // Свет зала: тёплый общий сверху + мягкий от пола.
  room.add(new THREE.HemisphereLight('#fff3e6', '#77736d', 1.4));
  for (const [x, z] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) {
    const l = new THREE.PointLight('#fff1dd', 60, 22, 1.6);
    l.position.set(x, HY - 2, z);
    room.add(l);
  }

  room.rotation.y = opts.rotation ?? -0.806;   // задняя стена – напротив стартового ракурса
  return room;
}

// Отражения для машины из самого зала: снимаем окружение, когда загрузились текстуры.
export function loftEnvironment(renderer, room, env0) {
  const tmp = new THREE.Scene();
  const parent = room.parent, mirror = room.getObjectByName('mirror');
  const y = room.position.y;
  room.position.y = y - 1.3;            // снимаем с высоты глаз над подиумом, а не из пола
  if (mirror) mirror.visible = false;
  tmp.add(room);
  tmp.environment = env0;
  const env = new THREE.PMREMGenerator(renderer).fromScene(tmp, 0.015, 0.1, 60).texture;
  room.position.y = y;
  if (mirror) mirror.visible = true;
  parent?.add(room);
  return env;
}
