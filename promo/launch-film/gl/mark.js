// The Satgas mark as a physical object: a glossy slab, one node, two arms that grow out of it, and two more nodes.
// render(state) sets every transform from the state it is given; nothing here keeps time.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const DIST = 100;
const FOV = 30;
// Pixels per world unit at the plane the mark sits on.
const UNIT = 1080 / (2 * DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
const TILE = 32;

export function createMark(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(FOV, canvas.width / canvas.height, 1, 600);
  camera.position.set(0, 0, DIST);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-40, 60, 90);
  const rim = new THREE.DirectionalLight(0xffc56a, 1.6);
  rim.position.set(70, -20, -30);
  const sweep = new THREE.PointLight(0xfff2d6, 0, 0, 1.6);
  const ember = new THREE.PointLight(0xffa41c, 0, 0, 1.8);
  scene.add(key, rim, sweep, ember);

  const group = new THREE.Group();
  scene.add(group);
  const at = (x, y, z) => new THREE.Vector3(x - 12, 12 - y, z);

  // The slab is a rounded square extruded with a small bevel, so its edge catches the light all the way round.
  const half = TILE / 2;
  const corner = 7;
  const outline = new THREE.Shape();
  outline.moveTo(-half + corner, -half);
  outline.lineTo(half - corner, -half);
  outline.quadraticCurveTo(half, -half, half, -half + corner);
  outline.lineTo(half, half - corner);
  outline.quadraticCurveTo(half, half, half - corner, half);
  outline.lineTo(-half + corner, half);
  outline.quadraticCurveTo(-half, half, -half, half - corner);
  outline.lineTo(-half, -half + corner);
  outline.quadraticCurveTo(-half, -half, -half + corner, -half);
  const slabGeometry = new THREE.ExtrudeGeometry(outline, {
    depth: 3.6,
    bevelEnabled: true,
    bevelThickness: 0.7,
    bevelSize: 0.7,
    bevelSegments: 6,
    curveSegments: 24,
  });
  slabGeometry.translate(0, 0, -1.8);
  const slab = new THREE.Mesh(
    slabGeometry,
    new THREE.MeshPhysicalMaterial({ color: 0x0f0f11, metalness: 0.75, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.32 }),
  );
  slab.position.z = -2.5;
  group.add(slab);

  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0xf1f1f4,
    metalness: 0.05,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const gold = new THREE.MeshPhysicalMaterial({
    color: 0xffb21a,
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    emissive: 0xff9500,
    emissiveIntensity: 0,
  });
  const ball = (x, y, material) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.5, 48, 32), material);
    mesh.position.copy(at(x, y, 1.5));
    group.add(mesh);
    return mesh;
  };
  const a = ball(6, 12, ceramic);
  const b = ball(18, 6, gold);
  const c = ball(18, 18, ceramic);
  ember.position.copy(at(18, 6, 9));
  group.add(ember);

  const SEG = 56;
  const RAD = 12;
  const arm = (y) => {
    const curve = new THREE.CubicBezierCurve3(at(8.5, 12, 0.9), at(12, 12, 0.9), at(12, y, 0.9), at(15.5, y, 0.9));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, 0.875, RAD, false), ceramic);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.875, 20, 14), ceramic);
    group.add(mesh, tip);
    return { curve, mesh, tip };
  };
  const arms = [arm(6), arm(18)];

  // A soft halo behind the slab, so the amber node reads as a light source and not just a colour.
  const haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 256;
  const ctx = haloCanvas.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,178,40,1)");
  grad.addColorStop(0.35, "rgba(255,150,20,.35)");
  grad.addColorStop(1, "rgba(255,140,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(haloCanvas),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    }),
  );
  halo.position.copy(at(18, 6, 2));
  halo.scale.setScalar(22);
  group.add(halo);

  let blank = false;
  return {
    render(s) {
      canvas.style.opacity = s.vis;
      if (s.vis <= 0.001) {
        if (!blank) renderer.clear();
        blank = true;
        return;
      }
      blank = false;
      group.position.set(s.x / UNIT, -s.y / UNIT, 0);
      group.scale.setScalar(s.size / (TILE * UNIT));
      group.rotation.set(s.rx, s.ry, s.rz);
      slab.scale.setScalar(Math.max(0.0001, s.slab));
      a.scale.setScalar(Math.max(0.0001, s.a));
      b.scale.setScalar(Math.max(0.0001, s.b));
      c.scale.setScalar(Math.max(0.0001, s.c));
      for (const { curve, mesh, tip } of arms) {
        const steps = Math.round(SEG * Math.min(1, Math.max(0, s.draw)));
        mesh.geometry.setDrawRange(0, steps * RAD * 6);
        mesh.visible = steps > 0;
        tip.visible = steps > 0 && steps < SEG;
        tip.position.copy(curve.getPoint(steps / SEG));
      }
      gold.emissiveIntensity = s.glow * 1.6;
      ember.intensity = s.glow * 900 * s.b;
      halo.material.opacity = Math.min(1, s.glow * 0.9) * s.b;
      halo.scale.setScalar(18 + s.glow * 14);
      sweep.intensity = s.sweepOn * 5200;
      sweep.position.set(s.sweep * 60 + s.x / UNIT, 14 - s.y / UNIT, 34);
      renderer.render(scene, camera);
    },
  };
}
