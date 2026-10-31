import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { type LessonRun, lessonSnapshot } from "./simulation";

export type LessonPhase = "intro" | "arrival" | "choice" | "running" | "result";
interface SceneProps { phase: LessonPhase; run: LessonRun; time: number; paused: boolean; reduced: boolean }

// A ticket rests on each station: its centre sits half a thickness above that surface.
const TICKET_H = 0.15;
const REST = { send: 0.08 + TICKET_H / 2, queue: 0.03 + TICKET_H / 2, compute: 0.315 + TICKET_H / 2, done: -0.01 + TICKET_H / 2 };
const STATION_X = { send: -4.4, queue: -1.65, compute: 1.8, done: 4.6 };
const row = (i: number) => (i - 1.5) * 0.85;
const FONT = "'Avenir Next', 'Segoe UI', system-ui, sans-serif";
const TICKET_COLORS = { mine: 0x3861e9, other: 0xf0c55c, mineDone: 0x237b62, otherDone: 0xa9cbbc };

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
    renderer.toneMappingExposure = 1.08;
    // Shadows are redrawn only when something actually moves between stations.
    renderer.shadowMap.autoUpdate = false;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-7, 7, 3.6, -3.6, 0.1, 80);
    camera.position.set(8.5, 12, 15);
    camera.lookAt(0, 0, 0);

    // Soft studio light: sky and ground fill, one warm key for shadows, one cool side fill.
    // Only the processor's metal parts reflect a room environment, which keeps the scene light enough for software rendering.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xaeb9cb, 1.6));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.2);
    key.position.set(-5, 11, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -10; key.shadow.camera.right = 10;
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
    key.shadow.normalBias = 0.03;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe6eeff, 0.5);
    fill.position.set(9, 5, 10);
    scene.add(fill);

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const track = <T extends THREE.Material>(material: T) => { materials.push(material); return material; };
    const ceramic = (color: number, roughness = 0.5) => track(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
    const white = ceramic(0xfdfdfe);
    const paper = ceramic(0xe7ebf2, 0.75);
    const rim = ceramic(0xf6f7f9);

    function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, radius = 0.06) {
      const geometry = new RoundedBoxGeometry(w, h, d, Math.min(w, d) > 1 ? 3 : 2, Math.min(radius, h / 2, w / 2, d / 2));
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh); return mesh;
    }
    function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      paint(canvas.getContext("2d")!);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      textures.push(texture); return texture;
    }
    function decal(w: number, d: number, texture: THREE.Texture, x: number, y: number, z: number, parent: THREE.Object3D, opacity = 1) {
      const geometry = new THREE.PlaneGeometry(w, d); geometries.push(geometry);
      const material = track(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity }));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    }
    // A shallow tray: base slab, a tinted floor and four low walls, so tickets sit inside it.
    function tray(w: number, d: number, x: number, z: number, baseTop: number, floorMaterial: THREE.Material, parent: THREE.Object3D, wall = 0.09) {
      const baseH = baseTop + 0.17;
      box(w, baseH, d, white, x, -0.17 + baseH / 2, z, parent, 0.07);
      box(w - 0.2, 0.02, d - 0.2, floorMaterial, x, baseTop + 0.01, z, parent, 0.01);
      const wallY = baseTop + wall / 2;
      box(w, wall, 0.1, rim, x, wallY, z - d / 2 + 0.05, parent, 0.035);
      box(w, wall, 0.1, rim, x, wallY, z + d / 2 - 0.05, parent, 0.035);
      box(0.1, wall, d - 0.2, rim, x - w / 2 + 0.05, wallY, z, parent, 0.035);
      box(0.1, wall, d - 0.2, rim, x + w / 2 - 0.05, wallY, z, parent, 0.035);
    }

    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = track(new THREE.ShadowMaterial({ opacity: 0.2 }));
    geometries.push(floorGeometry);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.17; floor.receiveShadow = true; scene.add(floor);

    // One physical exhibit: a send pad, a four-lane queue, a processor, and a results tray.
    const pads = Array.from({ length: 4 }, () => new THREE.Group());
    scene.add(...pads);

    // Send: a raised pad with an arrow pointing toward the queue.
    box(2.1, 0.22, 2.2, white, STATION_X.send, -0.06, 0.3, pads[0], 0.08);
    box(1.86, 0.03, 1.94, paper, STATION_X.send, 0.065, 0.3, pads[0], 0.012);
    const arrowTexture = canvasTexture(512, 512, ctx => {
      ctx.strokeStyle = "#a9b3c3"; ctx.lineWidth = 26; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(130, 256); ctx.lineTo(380, 256); ctx.moveTo(300, 176); ctx.lineTo(380, 256); ctx.lineTo(300, 336); ctx.stroke();
    });
    decal(0.9, 0.9, arrowTexture, STATION_X.send, 0.082, 0.3, pads[0]);

    // Queue: four numbered lanes, one per arrival.
    tray(2.5, 3.75, STATION_X.queue, 0, 0.01, paper, pads[1], 0.1);
    for (const z of [-0.85, 0, 0.85]) box(2.3, 0.05, 0.04, rim, STATION_X.queue, 0.055, z, pads[1], 0.018);
    "1234".split("").forEach((digit, i) => {
      const texture = canvasTexture(128, 128, ctx => {
        ctx.fillStyle = "#8492a6"; ctx.font = `650 84px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(digit, 64, 68);
      });
      decal(0.27, 0.27, texture, STATION_X.queue - 1.03, 0.032, row(i), pads[1]);
    });
    // The waiting window: a gate across the queue exit with an amber timer on top.
    // It stays closed while the server holds the batch open, then drops when the batch starts.
    const gate = new THREE.Group(); pads[1].add(gate);
    box(0.065, 0.2, 3.45, ceramic(0x8d99ad, 0.45), 0, 0, 0, gate, 0.028);
    const timerMaterial = track(new THREE.MeshStandardMaterial({ color: 0xe9a532, emissive: new THREE.Color(0xe9a532), emissiveIntensity: 0.5, roughness: 0.4 }));
    const timerGeometry = new THREE.BoxGeometry(0.09, 0.032, 1); geometries.push(timerGeometry);
    const timer = new THREE.Mesh(timerGeometry, timerMaterial); timer.position.y = 0.112; gate.add(timer);
    const GATE_CLOSED = 0.03 + 0.1, GATE_OPEN = GATE_CLOSED - 0.21;
    let gateY = GATE_OPEN;

    // Compute: a processor package. Graphite substrate, gold contacts on all four sides,
    // an aluminium lid with one bay per request, and a progress strip on its front face.
    const graphite = track(new THREE.MeshStandardMaterial({ color: 0x283246, roughness: 0.42, metalness: 0.15, envMap: environment, envMapIntensity: 0.5 }));
    const aluminium = track(new THREE.MeshStandardMaterial({ color: 0xe6eaf0, roughness: 0.3, metalness: 0.55, envMap: environment, envMapIntensity: 0.85 }));
    const gold = track(new THREE.MeshStandardMaterial({ color: 0xd2ab55, roughness: 0.3, metalness: 1, envMap: environment, envMapIntensity: 1 }));
    box(3.2, 0.12, 3.95, graphite, STATION_X.compute, -0.11, 0, pads[2], 0.04);
    const contacts: [number, number, number, number, number][] = [];
    for (let x = 0.55; x <= 3.06; x += 0.21) { contacts.push([x, 1.9, 0.08, 0.15, 0]); contacts.push([x, -1.9, 0.08, 0.15, 0]); }
    for (let z = -1.6; z <= 1.61; z += 0.21) { contacts.push([0.31, z, 0.15, 0.08, 0]); contacts.push([3.29, z, 0.15, 0.08, 0]); }
    const contactGeometry = new THREE.BoxGeometry(1, 0.018, 1); geometries.push(contactGeometry);
    const contactMesh = new THREE.InstancedMesh(contactGeometry, gold, contacts.length);
    const matrix = new THREE.Matrix4();
    contacts.forEach(([x, z, sx, sz], index) => { matrix.compose(new THREE.Vector3(x, -0.04, z), new THREE.Quaternion(), new THREE.Vector3(sx, 1, sz)); contactMesh.setMatrixAt(index, matrix); });
    contactMesh.receiveShadow = true; pads[2].add(contactMesh);
    box(2.8, 0.34, 3.55, aluminium, STATION_X.compute, 0.12, 0, pads[2], 0.07);
    const bays = Array.from({ length: 4 }, (_, i) => {
      const material = track(new THREE.MeshStandardMaterial({ color: 0xdfe5ef, roughness: 0.55, metalness: 0.15, emissive: new THREE.Color(0x4f78f0), emissiveIntensity: 0 }));
      return box(1.8, 0.025, 0.74, material, STATION_X.compute, 0.3025, row(i), pads[2], 0.012);
    });
    const stripTrackMaterial = track(new THREE.MeshStandardMaterial({ color: 0xc5cdda, roughness: 0.6 }));
    box(2.4, 0.1, 0.02, stripTrackMaterial, STATION_X.compute, 0.12, 1.776, pads[2], 0.012);
    const glow = track(new THREE.MeshStandardMaterial({ color: 0x4f78f0, emissive: new THREE.Color(0x4f78f0), emissiveIntensity: 2.2, roughness: 0.4 }));
    const stripGeometry = new THREE.BoxGeometry(1, 0.1, 0.024); geometries.push(stripGeometry);
    const strip = new THREE.Mesh(stripGeometry, glow);
    strip.position.set(STATION_X.compute, 0.12, 1.778); strip.visible = false; pads[2].add(strip);
    // While a round runs, a lit frame surrounds the bays on the lid.
    const activeFrame = new THREE.Group(); activeFrame.visible = false; pads[2].add(activeFrame);
    const frameGeometry = new THREE.BoxGeometry(1, 0.012, 1); geometries.push(frameGeometry);
    for (const [x, z, sx, sz] of [[STATION_X.compute, -1.71, 1.98, 0.04], [STATION_X.compute, 1.71, 1.98, 0.04], [STATION_X.compute - 0.97, 0, 0.04, 3.38], [STATION_X.compute + 0.97, 0, 0.04, 3.38]]) {
      const edge = new THREE.Mesh(frameGeometry, glow); edge.position.set(x, 0.296, z); edge.scale.set(sx, 1, sz); activeFrame.add(edge);
    }

    // Results: a tray tinted green, where finished requests land.
    tray(1.8, 3.6, STATION_X.done, 0, -0.03, ceramic(0xd8ede1, 0.72), pads[3], 0.08);

    // Chevrons on the floor between stations show the direction of travel.
    const connectors = new THREE.Group(); scene.add(connectors);
    const chevronTexture = canvasTexture(256, 256, ctx => {
      ctx.strokeStyle = "#97a2b4"; ctx.lineWidth = 22; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const offset of [0, 64]) { ctx.beginPath(); ctx.moveTo(70 + offset, 70); ctx.lineTo(130 + offset, 128); ctx.lineTo(70 + offset, 186); ctx.stroke(); }
    });
    for (const [x, z] of [[-3.125, 0.15], [-0.1, 0], [3.55, 0]]) decal(0.34, 0.34, chevronTexture, x, -0.165, z, connectors, 0.95);

    // Tickets: one per request. Request A is yours.
    function paintTicket(ctx: CanvasRenderingContext2D, letter: string, ink: string, done: boolean) {
      ctx.clearRect(0, 0, 1024, 408);
      ctx.fillStyle = ink; ctx.strokeStyle = ink;
      ctx.font = `650 196px ${FONT}`; ctx.textBaseline = "middle"; ctx.fillText(letter, 78, 214);
      if (done) {
        ctx.lineWidth = 40; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(560, 214); ctx.lineTo(650, 300); ctx.lineTo(830, 120); ctx.stroke();
      } else {
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.roundRect(340, 146, 480, 30, 15); ctx.roundRect(340, 236, 300, 30, 15); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    const tickets = "ABCD".split("").map((id, i) => {
      const group = new THREE.Group(); scene.add(group);
      const mine = i === 0;
      const bodyMaterial = ceramic(mine ? TICKET_COLORS.mine : TICKET_COLORS.other, 0.42);
      const body = box(1.52, TICKET_H, 0.62, bodyMaterial, 0, 0, 0, group, 0.07);
      const waitingTexture = canvasTexture(1024, 408, ctx => paintTicket(ctx, id, mine ? "#ffffff" : "#4a3d1d", false));
      const doneTexture = canvasTexture(1024, 408, ctx => paintTicket(ctx, id, mine ? "#ffffff" : "#1f4f40", true));
      const label = decal(1.5, 0.598, waitingTexture, 0, TICKET_H / 2 + 0.003, 0, group);
      group.position.set(STATION_X.send, REST.send, 0.3); group.visible = mine;
      return { id, group, body, bodyMaterial, label, waitingTexture, doneTexture, done: false, target: new THREE.Vector3() };
    });

    let inView = true;
    let dirty = true;
    let narrow = false;
    let shadowsDirty = true;
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
      // The gate lies across the queue exit, or along its front edge when the queue sits above computation.
      gate.rotation.y = narrow ? Math.PI / 2 : 0;
      gate.scale.set(1, 1, narrow ? 2.3 / 3.45 : 1);
      gate.position.set(narrow ? STATION_X.queue : STATION_X.queue + 0.93, gateY, narrow ? 1.7 : 0);
      const padBounds = pads.map(pad => new THREE.Box3().setFromObject(pad, true));
      const frameBounds = new THREE.Box3().setFromPoints(padBounds.flatMap(corners).map(point => point.applyMatrix4(camera.matrixWorldInverse)));
      const size = frameBounds.getSize(new THREE.Vector3());
      const center = frameBounds.getCenter(new THREE.Vector3());
      const width = Math.max(size.x + 0.7, (size.y + 0.8) * aspect);
      camera.left = center.x - width / 2; camera.right = center.x + width / 2;
      camera.top = center.y + width / aspect / 2; camera.bottom = center.y - width / aspect / 2;
      camera.updateProjectionMatrix();
      padBounds.forEach((bounds, index) => {
        const points = corners(bounds).map(point => point.project(camera));
        const x = (Math.min(...points.map(point => point.x)) + Math.max(...points.map(point => point.x))) / 2;
        const y = Math.min(...points.map(point => point.y));
        const label = labels.current?.children[index] as HTMLElement | undefined;
        if (label) {
          // The narrow queue sits above computation; keep its label out of that transfer gap.
          if (narrow && index === 1) {
            const left = Math.min(...points.map(point => point.x));
            const middle = (y + Math.max(...points.map(point => point.y))) / 2;
            label.style.transform = `translate(${(left + 1) * w / 2 - 8}px, ${(1 - middle) * h / 2}px) translate(-100%, -50%)`;
          } else label.style.transform = `translate(${(x + 1) * w / 2}px, ${(1 - y) * h / 2 + 4}px) translateX(-50%)`;
        }
      });
      dirty = true; shadowsDirty = true;
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
      const beforeRun = p.phase === "intro" || p.phase === "arrival" || p.phase === "choice";
      let moving = false;
      tickets.forEach((ticket, i) => {
        const request = snapshot.requests.find(item => item.id === ticket.id)!;
        const state = beforeRun ? (p.phase === "intro" ? "pending" : "queued") : request.state;
        const visible = beforeRun ? i === 0 || p.phase === "choice" && (p.run.experiment === "size" || p.run.traffic === "simultaneous") : state !== "pending";
        if (visible !== ticket.group.visible) { ticket.group.visible = visible; shadowsDirty = true; }
        const z = row(i);
        let x = state === "computing" ? STATION_X.compute : state === "done" ? STATION_X.done : STATION_X.queue;
        let y = state === "computing" ? REST.compute : state === "done" ? REST.done : REST.queue;
        let targetZ = z;
        if (narrow) {
          x = state === "computing" ? 1.8 : state === "done" ? -2.5 : 1.8;
          targetZ = z + (state === "computing" || state === "done" ? 2.4 : -2.3);
        }
        if (p.phase === "intro") { x = narrow ? -2.5 : STATION_X.send; targetZ = narrow ? -2.3 : 0.3; y = REST.send; }
        if (p.phase === "arrival") {
          const t = p.reduced ? 1 : Math.min(1, p.time / 1000); const ease = 1 - Math.pow(1 - t, 3);
          x = narrow ? -2.5 + 4.3 * ease : STATION_X.send + (STATION_X.queue - STATION_X.send) * ease;
          targetZ = narrow ? -2.3 + z * ease : 0.3 + (z - 0.3) * ease;
          y = REST.send + (REST.queue - REST.send) * ease + Math.sin(t * Math.PI) * 0.7;
        }
        if (state === "computing" && !p.reduced) y += Math.sin(p.time / 180) * 0.015;
        ticket.target.set(x, y, targetZ);
        if (ticket.group.position.distanceTo(ticket.target) > 0.002) {
          if (p.reduced || p.paused || p.phase === "arrival") ticket.group.position.copy(ticket.target);
          else {
            // Hop between stations: lift while far from the target, settle as it arrives.
            const across = Math.hypot(ticket.target.x - ticket.group.position.x, ticket.target.z - ticket.group.position.z);
            const lifted = ticket.target.clone(); lifted.y += Math.min(0.6, across * 0.32);
            ticket.group.position.lerp(lifted, 1 - Math.exp(-dt * 9));
          }
          moving = true;
          if (ticket.group.position.distanceTo(ticket.target) > 0.03) shadowsDirty = true;
        }
        const done = state === "done";
        ticket.bodyMaterial.color.set(done ? (i === 0 ? TICKET_COLORS.mineDone : TICKET_COLORS.otherDone) : i === 0 ? TICKET_COLORS.mine : TICKET_COLORS.other);
        if (done !== ticket.done) {
          ticket.done = done;
          const material = ticket.label.material as THREE.MeshBasicMaterial;
          material.map = done ? ticket.doneTexture : ticket.waitingTexture; material.needsUpdate = true;
        }
        const bay = bays[i].material as THREE.MeshStandardMaterial;
        bay.emissiveIntensity = state === "computing" ? 0.55 : 0;
      });

      // Progress of the current round of work, on the processor's front strip.
      const batch = !beforeRun ? snapshot.activeBatch : undefined;
      const progress = batch ? Math.min(1, (p.time - batch.start) / (batch.end - batch.start)) : 0;
      strip.visible = progress > 0.002;
      activeFrame.visible = Boolean(batch);
      if (strip.visible) { strip.scale.x = 2.4 * progress; strip.position.x = STATION_X.compute - 1.2 + 1.2 * progress; }

      // The waiting window: shown when this strategy holds the batch open; the timer burns down while it waits.
      const holdsBatch = !beforeRun && p.run.delay > 0;
      let remaining = 0;
      if (holdsBatch && !batch) {
        const upcoming = p.run.batches.find(item => item.start > p.time);
        const first = upcoming && p.run.requests.find(item => item.id === upcoming.requestIds[0]);
        if (upcoming && first && p.time >= first.arrival) remaining = 1 - Math.min(1, (p.time - first.arrival) / p.run.delay);
      }
      const closed = remaining > 0;
      gate.visible = holdsBatch || gateY > GATE_OPEN + 0.005;
      const gateTarget = closed ? GATE_CLOSED : GATE_OPEN;
      if (Math.abs(gateY - gateTarget) > 0.001) {
        gateY = p.reduced ? gateTarget : gateY + (gateTarget - gateY) * (1 - Math.exp(-dt * 14));
        gate.position.y = gateY; moving = true; shadowsDirty = true;
      }
      timer.visible = closed;
      if (closed) { timer.scale.z = 3.4 * remaining; timer.position.z = 1.7 - 1.7 * remaining; }
      element.dataset.waiting = String(closed);

      const active = p.phase === "running" && snapshot.computing.length > 0;
      element.dataset.computing = String(active);
      if (dirty || moving) {
        if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
        renderer.render(scene, camera); dirty = false;
      }
    }
    frame = requestAnimationFrame(draw);
    const contextLost = (event: Event) => { event.preventDefault(); setFallback(true); };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); resizeObserver.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
      environment.dispose(); pmrem.dispose();
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
