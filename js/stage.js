// Стенд-шоурум: светлый купол, отражающий пол, подиум со светящимся кольцом и светящийся логотип на стене.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const R = 18;          // радиус купола, м
const FLOOR_Y = -0.045;

export function buildStage(renderer, opts = {}) {
  const stage = new THREE.Group();
  stage.name = 'stage';

  // Купол: сверху светлее, к полу чуть темнее.
  const dome = new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2);
  const top = new THREE.Color('#d3d5d9'), bottom = new THREE.Color('#7d8187');
  const pos = dome.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) {
    const c = bottom.clone().lerp(top, Math.min(1, Math.pow(pos.getY(i) / R, 0.75)));
    cols.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  stage.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false })));

  // Пол: зеркало под полупрозрачным матовым слоем – мягкое отражение машины и логотипа.
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const mirror = new Reflector(new THREE.CircleGeometry(R, 96), {
    color: 0x8a8d92, textureWidth: Math.max(512, size.x * 0.6), textureHeight: Math.max(512, size.y * 0.6),
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = FLOOR_Y;
  stage.add(mirror);
  const matte = new THREE.Mesh(new THREE.CircleGeometry(R, 96),
    new THREE.MeshStandardMaterial({ color: '#a9acb1', roughness: 0.95, transparent: true, opacity: 0.86 }));
  matte.rotation.x = -Math.PI / 2;
  matte.position.y = FLOOR_Y + 0.002;
  matte.receiveShadow = true;
  stage.add(matte);

  // Подиум, верх на уровне колёс (y = 0), по краю светится кольцо.
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.65, 0.045, 128),
    new THREE.MeshStandardMaterial({ color: '#c4c7cc', roughness: 0.4, metalness: 0.15 }));
  disc.position.y = -0.0225;
  stage.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.63, 0.012, 12, 256),
    new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  stage.add(ring);

  // Светящийся логотип на стене позади машины (напротив стартового ракурса камеры).
  if (opts.logo) {
    const loader = new THREE.TextureLoader();
    const logo = new THREE.Group();
    const w = opts.logoWidth ?? 7.5, h = w * (opts.logoAspect ?? 317 / 1825);
    const plane = (url, extra) => {
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, ...extra }));
    };
    const glow = plane(opts.glow, { blending: THREE.AdditiveBlending, opacity: 0.55 });
    const core = plane(opts.logo, {});
    core.position.z = 0.01;
    logo.add(glow, core);
    const dir = new THREE.Vector3(...(opts.logoDir ?? [-0.72, 0, 0.69])).normalize();
    const y = opts.logoHeight ?? 4.2;
    logo.position.copy(dir.multiplyScalar(Math.sqrt(R * R - y * y) - 1.2)).setY(y);
    logo.lookAt(0, y * 0.85, 0);
    stage.add(logo);
  }
  return stage;
}
