import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { type LessonRun, lessonSnapshot } from "./simulation";

export type LessonPhase = "intro" | "arrival" | "choice" | "running" | "result";
interface SceneProps { phase: LessonPhase; run: LessonRun; time: number; paused: boolean; reduced: boolean }

export default function LessonScene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setFallback(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0xf5f6f8, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-7, 7, 3.6, -3.6, 0.1, 80);
    camera.position.set(8.5, 12, 15);
    camera.lookAt(0, 0, 0);
    const ambient = new THREE.HemisphereLight(0xffffff, 0x9dacc2, 2.5);
    scene.add(ambient);
    const light = new THREE.DirectionalLight(0xffffff, 2.8);
    light.position.set(-4, 10, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -9; light.shadow.camera.right = 9;
    light.shadow.camera.top = 7; light.shadow.camera.bottom = -7;
    light.shadow.normalBias = 0.035;
    scene.add(light);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];

    function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, parent: THREE.Object3D = scene, radius = 0.08) {
      const geometry = new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, h / 2));
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.07 });
      geometries.push(geometry); materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh); return mesh;
    }
    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.1 });
    geometries.push(floorGeometry); materials.push(floorMaterial);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.17; floor.receiveShadow = true; scene.add(floor);

    // One physical exhibit: a send pad, waiting lanes, and a four-place compute bed.
    const pads = Array.from({ length: 4 }, () => new THREE.Group());
    scene.add(...pads);
    box(2.1, 0.2, 2.2, 0xffffff, -4.4, 0, 0.3, pads[0]);
    box(1.75, 0.05, 1.7, 0xe8ebf1, -4.4, 0.14, 0.3, pads[0]);
    box(2.4, 0.16, 3.65, 0xdbe0e8, -1.65, 0, 0, pads[1]);
    for (let i = 0; i < 4; i++) box(2.1, 0.04, 0.76, 0xf8f9fc, -1.65, 0.11, (i - 1.5) * 0.85, pads[1]);
    box(3.1, 0.22, 3.8, 0xc9d2e2, 1.8, 0.02, 0, pads[2]);
    box(2.87, 0.16, 3.56, 0xf9fbff, 1.8, 0.2, 0, pads[2]);
    const computeBed = box(2.5, 0.055, 3.22, 0xd1ddf7, 1.8, 0.31, 0, pads[2]);
    for (let i = 0; i < 7; i++) box(0.07, 0.035, 0.27, 0xb4bdcc, 0.98 + i * 0.27, 0.01, 2.05, pads[2]);
    box(1.75, 0.12, 3.4, 0xd7e9df, 4.6, -0.04, 0, pads[3]);
    const connectors = new THREE.Group(); scene.add(connectors);
    for (const x of [-3.12, -2.87, -0.19, 0.06, 3.48, 3.74]) box(0.12, 0.025, 0.07, 0xb8c1cf, x, 0.035, 0, connectors);

    const tickets = "ABCD".split("").map((id, i) => {
      const group = new THREE.Group(); scene.add(group);
      const body = box(1.52, 0.15, 0.62, i === 0 ? 0x3861e9 : 0xf0c55c, 0, 0, 0, group);
      const canvas = document.createElement("canvas"); canvas.width = 384; canvas.height = 152;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = i === 0 ? "#ffffff" : "#493d20";
      ctx.font = "600 64px system-ui"; ctx.fillText(i === 0 ? "A" : id, 28, 99);
      ctx.globalAlpha = 0.72;
      ctx.fillRect(130, 49, 168, 9); ctx.fillRect(130, 79, 108, 9);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }); materials.push(material);
      const geometry = new THREE.PlaneGeometry(1.5, 0.595); geometries.push(geometry);
      const label = new THREE.Mesh(geometry, material); label.rotation.x = -Math.PI / 2; label.position.y = 0.078; group.add(label);
      group.position.set(-4.4, 0.32, 0.3); group.visible = i === 0;
      return { id, group, body, target: new THREE.Vector3() };
    });

    let inView = true;
    let dirty = true;
    let narrow = false;
    const observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; dirty = true; });
    observer.observe(element);
    const resize = () => {
      const w = element.clientWidth; const h = element.clientHeight;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      narrow = w < 600;
      pads[0].position.set(narrow ? 1.9 : 0, 0, narrow ? -2.6 : 0);
      pads[1].position.set(narrow ? 3.45 : 0, 0, narrow ? -2.3 : 0);
      pads[2].position.set(0, 0, narrow ? 2.4 : 0);
      pads[3].position.set(narrow ? -7.1 : 0, 0, narrow ? 2.4 : 0);
      connectors.visible = !narrow;
      camera.position.set(narrow ? 0 : 4, 14, 18);
      camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
      const corners = (bounds: THREE.Box3) => [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.y, bounds.max.y].flatMap(y => [bounds.min.z, bounds.max.z].map(z => new THREE.Vector3(x, y, z))));
      const padBounds = pads.map(pad => new THREE.Box3().setFromObject(pad));
      const frameBounds = new THREE.Box3().setFromPoints(padBounds.flatMap(corners).map(point => point.applyMatrix4(camera.matrixWorldInverse)));
      const size = frameBounds.getSize(new THREE.Vector3());
      const center = frameBounds.getCenter(new THREE.Vector3());
      const width = Math.max(size.x + 0.7, (size.y + 1.0) * aspect);
      camera.left = center.x - width / 2; camera.right = center.x + width / 2;
      camera.top = center.y + width / aspect / 2; camera.bottom = center.y - width / aspect / 2;
      camera.updateProjectionMatrix();
      padBounds.forEach((bounds, index) => {
        const points = corners(bounds).map(point => point.project(camera));
        const x = (Math.min(...points.map(point => point.x)) + Math.max(...points.map(point => point.x))) / 2;
        const y = Math.min(...points.map(point => point.y));
        const label = labels.current?.children[index] as HTMLElement | undefined;
        if (label) label.style.transform = `translate(${(x + 1) * w / 2}px, ${(1 - y) * h / 2 + 4}px) translateX(-50%)`;
      });
      dirty = true;
    };
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element); resize();
    let frame = 0;
    let previousSignature = "";
    let lastNow = performance.now();
    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      const dt = Math.min((now - lastNow) / 1000, 0.05); lastNow = now;
      if (!inView || document.hidden) return;
      const p = latest.current;
      const signature = `${p.phase}/${p.time}/${p.run.strategy}/${p.run.experiment}/${p.run.traffic}`;
      if (signature !== previousSignature) dirty = true;
      previousSignature = signature;
      const snapshot = lessonSnapshot(p.run, p.time);
      let moving = false;
      tickets.forEach((ticket, i) => {
        const request = snapshot.requests.find(item => item.id === ticket.id)!;
        const beforeRun = p.phase === "intro" || p.phase === "arrival" || p.phase === "choice";
        const state = beforeRun ? (p.phase === "intro" ? "pending" : "queued") : request.state;
        ticket.group.visible = beforeRun ? i === 0 || p.phase === "choice" && (p.run.experiment === "size" || p.run.traffic === "simultaneous") : state !== "pending";
        const z = (i - 1.5) * 0.85;
        let x = state === "computing" ? 1.8 : state === "done" ? 4.6 : -1.65;
        let y = state === "computing" ? 0.46 : 0.29;
        let targetZ = z;
        if (narrow) {
          x = state === "computing" ? 1.8 : state === "done" ? -2.5 : 1.8;
          targetZ = z + (state === "computing" || state === "done" ? 2.4 : -2.3);
        }
        if (p.phase === "intro") { x = narrow ? -2.5 : -4.4; targetZ = narrow ? -2.3 : 0.3; y = 0.32; }
        if (p.phase === "arrival") {
          const t = p.reduced ? 1 : Math.min(1, p.time / 1000); const ease = 1 - Math.pow(1 - t, 3);
          x = narrow ? -2.5 + 4.3 * ease : -4.4 + 2.75 * ease;
          targetZ = narrow ? -2.3 + z * ease : 0.3 + (z - 0.3) * ease;
          y += Math.sin(t * Math.PI) * 0.7;
        }
        if (state === "computing" && !p.reduced) y += Math.sin(p.time / 180) * 0.018;
        ticket.target.set(x, y, targetZ);
        if (ticket.group.position.distanceTo(ticket.target) > 0.002) {
          if (p.reduced || p.paused) ticket.group.position.copy(ticket.target);
          else ticket.group.position.lerp(ticket.target, 1 - Math.exp(-dt * 10));
          moving = true;
        }
        const targetColor = new THREE.Color(state === "done" ? (i === 0 ? 0x237b62 : 0xa9cbbc) : i === 0 ? 0x3861e9 : 0xf0c55c);
        ticket.body.material.color.copy(targetColor);
      });
      const active = p.phase === "running" && snapshot.computing.length > 0;
      computeBed.material.color.set(active ? 0xaac0f2 : 0xd1ddf7);
      element.dataset.computing = String(active);
      if (dirty || moving) { renderer.render(scene, camera); dirty = false; }
    }
    frame = requestAnimationFrame(draw);
    const contextLost = (event: Event) => { event.preventDefault(); setFallback(true); };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); resizeObserver.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  const snapshot = lessonSnapshot(props.run, props.time);
  const running = props.phase === "running" || props.phase === "result";
  return <div className="lesson-model" data-lesson-model>
    <div ref={host} className="lesson-canvas" role="img" aria-label="Request A moves from the sender into a queue, joins other independent requests in a batch, then enters computation." hidden={fallback} />
    {fallback && <div className="lesson-flat" data-lesson-fallback>
      {(["queued", "computing", "done"] as const).map(state => <div key={state}><strong>{{ queued: "Waiting", computing: "Computing", done: "Done" }[state]}</strong>
        <div>{"ABCD".split("").filter(id => running ? snapshot.requests.some(request => request.id === id && request.state === state) : (id === "A" || props.phase === "choice" && (props.run.experiment === "size" || props.run.traffic === "simultaneous")) && state === "queued").map(id => <span key={id} data-mine={id === "A"}>{id}</span>)}</div>
      </div>)}
    </div>}
    {!fallback && <div ref={labels} className="lesson-zone-labels" aria-hidden="true"><span>Send</span><span>Queue</span><span data-active={running && snapshot.computing.length > 0}>Compute</span><span>Results</span></div>}
  </div>;
}
