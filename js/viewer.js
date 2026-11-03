// 3D-сцена: загрузка модели, свет, камера, перекраска частей.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildStage } from './stage.js';
import { buildLoft, loftEnvironment } from './loft.js';

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

    if (modelConfig.stage) {
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

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.applyView('exterior', true);
    renderer.setAnimationLoop(t => this.tick(t));
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
      c.minDistance = inside ? 0.01 : 3.2;
      c.maxDistance = inside ? 0.1 : (this.stage ? 14 : 16);
      c.minPolarAngle = inside ? 0.3 : (this.cfg.stage?.minPolar ?? 0.2);
      c.maxPolarAngle = inside ? Math.PI - 0.3 : Math.PI / 2 - 0.04;
    };
    c.minDistance = 0; c.maxDistance = Infinity;
    c.minPolarAngle = 0; c.maxPolarAngle = Math.PI;
    if (this.ground) this.ground.visible = !inside;
    const fromFov = this.camera.fov, toFov = inside ? (this.panoDir ? 85 : 70) : 36;

    const toCam = new THREE.Vector3(...v.camera);
    const toTgt = new THREE.Vector3(...v.target);
    if (!inside) {
      // На узком экране отодвигаем камеру, чтобы машина целиком влезала по ширине.
      const k = THREE.MathUtils.clamp(1.7 / this.camera.aspect, 1, 2.4);
      toCam.sub(toTgt).multiplyScalar(k);
      if (this.stage) toCam.clampLength(0, 14);   // не выходить за купол стенда
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

  tween(ms, fn) {
    this.tweens.push({ start: performance.now(), ms, fn });
  }

  tick(now) {
    this.tweens = this.tweens.filter(t => {
      const k = Math.min(1, (now - t.start) / t.ms);
      t.fn(k);
      return k < 1;
    });
    this.controls.update();
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
