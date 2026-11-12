// 3D-сцена: загрузка модели, свет, камера, перекраска частей.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildStage } from '../../js/stage.js';
import { buildLoft, loftEnvironment } from '../../js/loft.js';
import { buildHall, hallEnvironment } from './hall.js';

const DRACO_PATH = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/';

export class Viewer {
  constructor(container, modelConfig) {
    this.container = container;
    this.cfg = modelConfig;
    this.targets = {};       // имя группы → массив материалов
    this.tweens = [];
    this.view = 'exterior';
    this.panoDir = null;     // папка с 6 гранями панорамы салона (f, b, l, r, u, d)
    this.panoCache = {};
    this.inside = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 8, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    sun.shadow.radius = 6;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(8, 64),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.003;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    if (modelConfig.stage?.type === 'hall') {
      this.setupHall(modelConfig.stage, sun, ground);

    } else if (modelConfig.stage) {
      const st = modelConfig.stage;
      this.stage = st.type === 'loft'
        ? buildLoft(renderer, st, room => { this.scene.environment = loftEnvironment(renderer, room, this.scene.environment); })
        : buildStage(renderer, st);
      this.scene.add(this.stage);
    }

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    this.controls = controls;

    this.setupZoom();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.applyView('exterior', true);
    renderer.setAnimationLoop(t => this.tick(t));
  }

  // Большой зал салона: 3D-коробка с фото-стенами (hall.js). Камера ходит везде, как в лофте.
  setupHall(st, sun, ground) {
    this.photo = true;            // салон в окнах затемнён (см. setMaterial)
    this.hall = { half: (st.size ?? 22) / 2, height: st.height ?? 7 };
    sun.position.set(0.6, 10, 1.2);
    sun.intensity = 1.5;
    this.renderer.toneMappingExposure = 1.1;
    ground.material.opacity = 0.38;
    this.stage = buildHall(this.renderer, st, room => {
      this.scene.environment = hallEnvironment(this.renderer, room, this.scene.environment);
    });
    this.hallCeiling = this.stage.getObjectByName('ceiling');
    this.scene.add(this.stage);
  }

  async load(onProgress) {
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const gltf = await loader.loadAsync(this.cfg.url, e => {
      if (e.total) onProgress?.(e.loaded / e.total);
    });
    const car = gltf.scene;
    car.scale.setScalar(this.cfg.scale ?? 1);
    car.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    this.scene.add(car);
    this.car = car;
    this.updatePano();
    this.collectTargets();
    if (this.cfg.openables) this.setupOpenables();
  }

  // Двери, капот, багажник: узлы-петли из модели крутятся вокруг своей оси (model.openables в JSON).
  setupOpenables() {
    this.openables = [];
    for (const o of this.cfg.openables) {
      const pivot = this.car.getObjectByName(o.key);
      if (!pivot) { console.warn(`[viewer] нет узла ${o.key}`); continue; }
      const axis = new THREE.Vector3(o.axis === 'x' ? 1 : 0, o.axis === 'y' ? 1 : 0, o.axis === 'z' ? 1 : 0);
      const item = { ...o, pivot, base: pivot.quaternion.clone(), axis, t: 0, to: 0 };
      pivot.traverse(m => {
        if (!m.isMesh) return;
        m.userData.openGroup = o.group;
        m.material.side = THREE.DoubleSide;   // изнутри открытой двери не должно быть «дыры»
      });
      this.openables.push(item);
    }
    const bar = document.createElement('div');
    bar.className = 'open-bar';
    const sync = () => { for (const b of bar.children) b.classList.toggle('on', this.isOpen(b.dataset.key)); };
    for (const [key, label] of [['doors', 'Двери'], ['Trunk', 'Багажник'], ['Hood', 'Капот']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.key = key;
      b.onclick = () => { this.toggleOpen(key); sync(); };
      bar.appendChild(b);
    }
    this.container.appendChild(bar);
    this.openBar = bar;
    const ray = new THREE.Raycaster(), pt = new THREE.Vector2(), el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || this.inside) return;
      const r = el.getBoundingClientRect();
      pt.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pt, this.camera);
      const hit = ray.intersectObject(this.car, true).find(h => h.object.visible);
      const g = hit?.object.userData.openGroup;
      if (!g) return;
      // Клик по двери открывает только её, по капоту/багажнику – их.
      let node = hit.object;
      while (node && !this.openables.some(o => o.pivot === node)) node = node.parent;
      const item = this.openables.find(o => o.pivot === node);
      if (item) item.to = item.to ? 0 : 1;
      sync();
    });
  }

  toggleOpen(group) {
    const items = this.openables.filter(o => o.group === group);
    const open = !items.some(o => o.to === 1);
    for (const o of items) o.to = open ? 1 : 0;
  }

  isOpen(group) { return this.openables.some(o => o.group === group && o.to === 1); }

  updateOpenables(dt) {
    for (const o of this.openables ?? []) {
      if (o.t === o.to) continue;
      o.t = o.to > o.t ? Math.min(o.to, o.t + dt / 1.1) : Math.max(o.to, o.t - dt / 1.1);
      const e = o.t < 0.5 ? 2 * o.t * o.t : 1 - Math.pow(-2 * o.t + 2, 2) / 2;
      o.pivot.quaternion.copy(o.base).multiply(new THREE.Quaternion().setFromAxisAngle(o.axis, THREE.MathUtils.degToRad(o.angle) * e));
    }
  }

  // Находит материалы для каждой группы из конфига: по имени узла (вместе с детьми) или по имени материала.
  // Материалы клонируются, чтобы перекраска одной группы не задевала другие части с тем же материалом.
  collectTargets() {
    for (const [group, rule] of Object.entries(this.cfg.targets)) {
      const meshes = new Set();
      for (const name of rule.nodes ?? []) {
        this.car.traverse(o => {
          if (o.name === name) o.traverse(c => c.isMesh && meshes.add(c));
        });
      }
      if (rule.materials?.length) {
        this.car.traverse(o => {
          if (o.isMesh && rule.materials.includes(o.material.name)) meshes.add(o);
        });
      }
      const mat = meshes.size ? [...meshes][0].material.clone() : null;
      meshes.forEach(m => { m.material = mat; });
      this.targets[group] = mat;
      if (!mat) console.warn(`[viewer] группа «${group}» не найдена в модели`);
    }
  }

  // Плавно перекрашивает группу. props: { color, metalness, roughness }
  setMaterial(group, props) {
    // Салон в модели упрощённый: в окнах показываем его тёмным с лёгким оттенком цвета,
    // а сам цвет видно в «Салоне 360°». Иначе в окнах видны оранжевые плоскости.
    if (this.photo && group === 'interior' && props?.color) {
      props = { ...props, color: '#' + new THREE.Color(props.color).lerp(new THREE.Color('#141416'), 0.82).getHexString() };
    }
    const mat = this.targets[group];
    if (!mat) return;
    const from = { color: mat.color.clone(), metalness: mat.metalness, roughness: mat.roughness };
    const to = {
      color: props.color ? new THREE.Color(props.color) : from.color,
      metalness: props.metalness ?? from.metalness,
      roughness: props.roughness ?? from.roughness,
    };
    this.tween(450, k => {
      mat.color.copy(from.color).lerp(to.color, k);
      mat.metalness = from.metalness + (to.metalness - from.metalness) * k;
      mat.roughness = from.roughness + (to.roughness - from.roughness) * k;
    });
  }

  // exterior — облёт вокруг машины, interior — обзор 360° с места водителя.
  applyView(name, instant = false) {
    const v = this.cfg.views[name];
    if (!v) return;
    this.view = name;
    const c = this.controls;
    const inside = v.inside ?? name === 'interior';
    this.inside = inside;
    this.updatePano();
    c.autoRotate = false;
    c.enableZoom = !inside;
    c.rotateSpeed = inside ? -0.35 : 0.8;   // изнутри тянем «картинку», а не камеру
    // Ограничения ставим после перелёта, иначе они «зажмут» камеру по дороге.
    const setLimits = () => {
      if (this.hall && !inside) {
        c.minDistance = 3.2; c.maxDistance = this.hall.half - 2;     // не подходить к стенам
        c.minPolarAngle = 0.05; c.maxPolarAngle = Math.PI / 2 - 0.04;
        return;
      }
      c.minDistance = inside ? 0.01 : 3.2;
      c.maxDistance = inside ? 0.1 : (this.stage ? 14 : 16);
      c.minPolarAngle = inside ? 0.3 : (this.cfg.stage?.minPolar ?? 0.2);
      c.maxPolarAngle = inside ? Math.PI - 0.3 : Math.PI / 2 - 0.04;
    };
    c.minDistance = 0; c.maxDistance = Infinity;
    c.minPolarAngle = 0; c.maxPolarAngle = Math.PI;
    if (this.ground) this.ground.visible = !inside;
    if (this.openBar) this.openBar.hidden = inside;
    const fromFov = this.camera.fov, toFov = inside ? (this.panoDir ? 85 : 70) : 36;

    const toCam = new THREE.Vector3(...v.camera);
    const toTgt = new THREE.Vector3(...v.target);
    if (!inside) {
      // На узком экране отодвигаем камеру, чтобы машина целиком влезала по ширине.
      const k = THREE.MathUtils.clamp(1.7 / this.camera.aspect, 1, 2.4);
      toCam.sub(toTgt).multiplyScalar(k);
      if (this.stage) toCam.clampLength(0, this.hall ? this.hall.half - 2 : 14);   // не выходить за стены
      toCam.add(toTgt);
    }
    if (inside) {
      // OrbitControls вращает камеру вокруг цели; ставим камеру на сиденье, цель — чуть впереди.
      toTgt.copy(toCam).add(new THREE.Vector3(...v.target).sub(toCam).setLength(0.05));
    }
    if (instant) {
      this.camera.position.copy(toCam);
      this.camera.fov = toFov;
      this.camera.updateProjectionMatrix();
      c.target.copy(toTgt);
      setLimits();
      c.update();
      return;
    }
    const fromCam = this.camera.position.clone();
    const fromTgt = c.target.clone();
    this.tween(900, k => {
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(fromCam, toCam, e);
      c.target.lerpVectors(fromTgt, toTgt, e);
      this.camera.fov = fromFov + (toFov - fromFov) * e;
      this.camera.updateProjectionMatrix();
      if (k === 1) setLimits();
    });
  }

  // Салон показываем фотопанорамой: фон-куб вместо 3D-модели.
  setPano(dir) {
    this.panoDir = dir || null;
    this.updatePano();
  }

  updatePano() {
    const on = !!(this.inside && this.panoDir);
    if (this.car) this.car.visible = !on;
    if (this.stage) this.stage.visible = !on;
    if (this.panoBox) this.panoBox.visible = on;
    if (!on) return;
    let group = this.panoCache[this.panoDir];
    if (!group) {
      // Шесть плоскостей вокруг камеры, каждая повёрнута лицом внутрь (раскладка граней krpano).
      const ROT = { f: [0, 0, 0], b: [0, Math.PI, 0], r: [0, -Math.PI / 2, 0], l: [0, Math.PI / 2, 0], u: [Math.PI / 2, 0, 0], d: [-Math.PI / 2, 0, 0] };
      const POS = { f: [0, 0, -1], b: [0, 0, 1], r: [1, 0, 0], l: [-1, 0, 0], u: [0, 1, 0], d: [0, -1, 0] };
      const loader = new THREE.TextureLoader();
      group = new THREE.Group();
      for (const f of Object.keys(ROT)) {
        const t = loader.load(`${this.panoDir}/${f}.jpg`);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
          new THREE.MeshBasicMaterial({ map: t, depthWrite: false, toneMapped: false }));
        m.position.set(...POS[f]);
        m.rotation.set(...ROT[f]);
        group.add(m);
      }
      group.scale.setScalar(10);
      group.renderOrder = -1;
      this.panoCache[this.panoDir] = group;
    }
    if (this.panoBox !== group) {
      if (this.panoBox) this.scene.remove(this.panoBox);
      this.panoBox = group;
      this.scene.add(group);
    }
    group.visible = true;
  }

  // Боковая панель «+ / −»: снаружи камера ближе/дальше к машине, в салоне – уже/шире угол обзора.
  setupZoom() {
    const bar = document.createElement('div');
    bar.className = 'zoom-bar';
    let timer = null;
    const stop = () => { clearInterval(timer); timer = null; };
    for (const [label, dir, title] of [['+', -1, 'Приблизить'], ['−', 1, 'Отдалить']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.zoomStep(dir);
        stop();
        timer = setInterval(() => this.zoomStep(dir, 0.35, true), 30);   // зажать – непрерывный зум
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
      bar.appendChild(b);
    }
    this.container.appendChild(bar);
  }

  zoomStep(dir, k = 1, instant = false) {
    const c = this.controls;
    c.autoRotate = false;
    if (this.inside) {
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + dir * 6 * k, 35, 100);
      this.camera.updateProjectionMatrix();
      return;
    }
    const off = this.camera.position.clone().sub(c.target);
    const d = THREE.MathUtils.clamp(off.length() * (1 + dir * 0.14 * k), c.minDistance, c.maxDistance);
    if (instant) { this.camera.position.copy(c.target).add(off.setLength(d)); return; }
    this.tween(160, t => {
      const cur = this.camera.position.clone().sub(c.target);
      this.camera.position.copy(c.target).add(cur.setLength(cur.length() + (d - cur.length()) * t));
    });
  }

  tween(ms, fn) {
    this.tweens.push({ start: performance.now(), ms, fn });
  }

  tick(now) {
    const dt = Math.min(0.3, (now - (this.lastT ?? now)) / 1000);
    this.lastT = now;
    this.updateOpenables(dt);
    this.tweens = this.tweens.filter(t => {
      const k = Math.min(1, (now - t.start) / t.ms);
      t.fn(k);
      return k < 1;
    });
    this.controls.update();
    // Вид сверху: прячем потолок с фермами, чтобы он не закрывал машину.
    if (this.hallCeiling) this.hallCeiling.visible = this.camera.position.y < this.hall.height - 1.9;
    if (this.panoBox?.visible) this.panoBox.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
