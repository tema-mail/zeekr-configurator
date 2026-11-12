// Большой зал салона Evolution Car: настоящая 3D-коробка. Пол – бетон с фото салона с отражением (как в лофте),
// четыре стены – фото-стены (ресепшн с антресолью, вход с улицей, оливковая с воротами, кирпич с окнами),
// потолок – фермы, круглые акустические диски и споты. Машина в центре, всё остальное далеко от неё.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const STEEL = new THREE.MeshStandardMaterial({ color: '#17181b', roughness: 0.55, metalness: 0.6 });

export function buildHall(renderer, opts, onReady) {
  const HALF = (opts.size ?? 22) / 2, H = opts.height ?? 7;
  const manager = new THREE.LoadingManager(() => onReady?.(room));
  const loader = new THREE.TextureLoader(manager);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (url, rx = 1, ry = 1) => {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (rx !== 1 || ry !== 1) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;   // без зеркальной раскладки
      t.repeat.set(rx, ry);
    }
    return t;
  };
  const room = new THREE.Group();
  room.name = 'hall';
  const add = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    room.add(m);
    return m;
  };
  const box = (w, h, d, x, y, z) => add(new THREE.BoxGeometry(w, h, d), STEEL, x, y, z);

  // ---------- Пол: бетон поверх слабого зеркала ----------
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const mirror = new Reflector(new THREE.PlaneGeometry(HALF * 2, HALF * 2), {
    color: 0x9a9da2, textureWidth: Math.max(512, size.x * 0.5), textureHeight: Math.max(512, size.y * 0.5),
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = -0.004;
  mirror.name = 'mirror';
  room.add(mirror);
  const concrete = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshStandardMaterial({ map: tex(opts.floor, 3, 3), color: '#8f8a82', roughness: 0.5, transparent: true, opacity: 0.93 }));
  concrete.rotation.x = -Math.PI / 2;
  concrete.position.y = -0.002;
  concrete.receiveShadow = true;
  room.add(concrete);

  // ---------- Стены-фото ----------
  // Фото уже со своим светом, поэтому материал без освещения. Нормаль каждой стены смотрит в зал.
  const wall = (url, x, z, ry) => add(new THREE.PlaneGeometry(HALF * 2, H),
    new THREE.MeshBasicMaterial({ map: tex(url), toneMapped: false }), x, H / 2, z, ry);
  wall(opts.walls.back, 0, HALF, Math.PI);
  wall(opts.walls.front, 0, -HALF, 0);
  wall(opts.walls.left, -HALF, 0, Math.PI / 2);
  wall(opts.walls.right, HALF, 0, -Math.PI / 2);
  // Стальные колонны в углах прячут стык соседних фото.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.7, H, 0.7, x * (HALF - 0.3), H / 2, z * (HALF - 0.3));

  // ---------- Потолок ----------
  // Отдельная группа: при виде сверху просмотрщик её прячет, чтобы фермы не закрывали машину.
  const top = new THREE.Group();
  top.name = 'ceiling';
  room.add(top);
  const roomAdd = room.add.bind(room);
  room.add = o => (o.isLight ? roomAdd(o) : top.add(o));
  const ceil = add(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ color: '#3b3c3f', roughness: 0.9 }), 0, H, 0);
  ceil.rotation.x = Math.PI / 2;
  // Фермы: верхний и нижний пояс, стойки и раскосы.
  for (let z = -HALF + 2; z < HALF; z += 4) {
    box(HALF * 2, 0.2, 0.16, 0, H - 0.2, z);
    box(HALF * 2, 0.14, 0.12, 0, H - 1.3, z);
    for (let x = -HALF; x < HALF; x += 2) {
      box(0.08, 1.1, 0.08, x, H - 0.75, z);
      const d = box(0.07, 2.28, 0.07, x + 1, H - 0.75, z);
      d.rotation.z = (Math.round((x + HALF) / 2) % 2 ? 1 : -1) * Math.atan2(2, 1.1);
    }
  }
  for (const x of [-HALF + 4, 0, HALF - 4]) box(0.12, 0.12, HALF * 2, x, H - 0.25, 0);
  // Круглые акустические диски и споты – как в салоне. Над машиной дисков нет: там ходит камера при виде сверху.
  const disc = new THREE.MeshStandardMaterial({ color: '#b9b8b2', roughness: 0.95, side: THREE.DoubleSide });
  const spot = new THREE.MeshBasicMaterial({ color: '#fff3df', toneMapped: false });
  let n = 0;
  for (let x = -HALF + 2.5; x < HALF; x += 4.2) for (let z = -HALF + 2.5; z < HALF; z += 4.2) {
    n++;
    const ox = x + ((n * 37) % 10 - 5) * 0.12, oz = z + ((n * 53) % 10 - 5) * 0.12;
    if (Math.hypot(ox, oz) > 4.5) {
      const r = 0.7 + ((n * 17) % 5) * 0.12;
      const m = add(new THREE.CylinderGeometry(r, r, 0.06, 40), disc, ox, H - 1.9 - ((n * 29) % 4) * 0.12, oz);
      box(0.015, 1.6, 0.015, ox, H - 1.1, oz);
      m.castShadow = false;
    }
    const s = add(new THREE.CircleGeometry(0.11, 18), spot, x + 1.6, H - 1.42, z + 1.9);
    s.rotation.x = Math.PI / 2;
  }

  room.add = roomAdd;

  // ---------- Свет зала ----------
  room.add(new THREE.HemisphereLight('#fff3e6', '#77736d', 1.5));
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    const l = new THREE.PointLight('#fff1dd', 60, 24, 1.6);
    l.position.set(x, H - 1.6, z);
    room.add(l);
  }

  room.rotation.y = opts.rotation ?? -0.806;   // стена с ресепшном – напротив стартового ракурса
  return room;
}

// Отражения для кузова из самого зала: снимаем окружение, когда загрузились текстуры.
export function hallEnvironment(renderer, room, env0) {
  const tmp = new THREE.Scene();
  const parent = room.parent, mirror = room.getObjectByName('mirror');
  const y = room.position.y;
  room.position.y = y - 1.3;          // снимаем с высоты глаз над полом, а не из пола
  if (mirror) mirror.visible = false;
  tmp.add(room);
  tmp.environment = env0;
  const env = new THREE.PMREMGenerator(renderer).fromScene(tmp, 0.015, 0.1, 60).texture;
  room.position.y = y;
  if (mirror) mirror.visible = true;
  parent?.add(room);
  return env;
}
