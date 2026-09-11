(function () {
  "use strict";

  const canvas = document.getElementById("meshCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const patternInput = $("meshPattern");
  const contractionInput = $("meshContraction");
  const stiffnessInput = $("meshStiffness");
  const bendingInput = $("meshBending");
  const TAU = Math.PI * 2;
  const cols = 11;
  const rows = 8;
  const sheetWidth = 300;
  const sheetHeight = 190;
  const thickness = 5;
  const camera = { azimuth: 0.68, elevation: 0.48, zoom: 1 };
  let dragging = false;
  let pointer = { x: 0, y: 0 };
  let animating = false;
  let animationFrame = 0;
  let phase = 0;
  let lastFrame = 0;
  let nodes = [];
  let edges = [];
  let triangles = [];
  let lastMetrics = {};

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const n = norm(a) || 1; return mul(a, 1 / n); };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const index = (x, y) => y * cols + x;

  function isFixed(x, y) {
    return (x === 0 || x === cols - 1) && (y === 0 || y === rows - 1);
  }

  function seedHeight(xn, yn, pattern, amount) {
    if (amount <= 0) return 0;
    const envelope = Math.max(0, (1 - xn * xn) * (1 - yn * yn));
    const amplitude = 72 * amount;
    if (pattern === "left") return amplitude * envelope * (1 - xn) * 0.45;
    if (pattern === "diagonal") return amplitude * envelope * (xn - yn) * 0.8;
    if (pattern === "wave") return amplitude * envelope * Math.sin(TAU * (0.5 * xn - phase));
    return amplitude * envelope * Math.exp(-0.75 * (xn * xn + yn * yn));
  }

  function buildMesh(amount) {
    const pattern = patternInput.value;
    nodes = [];
    edges = [];
    triangles = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const xn = 2 * x / (cols - 1) - 1;
        const yn = 2 * y / (rows - 1) - 1;
        nodes.push({
          p: [xn * sheetWidth / 2, yn * sheetHeight / 2, seedHeight(xn, yn, pattern, amount)],
          base: [xn * sheetWidth / 2, yn * sheetHeight / 2, 0],
          gx: x,
          gy: y,
          fixed: isFixed(x, y),
          activation: 0
        });
      }
    }

    function addEdge(a, b, type) {
      const A = nodes[a].base;
      const B = nodes[b].base;
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      edges.push({ a, b, type, base: Math.hypot(dx, dy), dx, dy, activation: 0, rest: 0 });
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (x < cols - 1) addEdge(index(x, y), index(x + 1, y), "structural");
        if (y < rows - 1) addEdge(index(x, y), index(x, y + 1), "structural");
        if (x < cols - 1 && y < rows - 1) {
          addEdge(index(x, y), index(x + 1, y + 1), "shear");
          addEdge(index(x + 1, y), index(x, y + 1), "shear");
          triangles.push([index(x, y), index(x + 1, y), index(x + 1, y + 1)]);
          triangles.push([index(x, y), index(x + 1, y + 1), index(x, y + 1)]);
        }
        if (x < cols - 2) addEdge(index(x, y), index(x + 2, y), "bend");
        if (y < rows - 2) addEdge(index(x, y), index(x, y + 2), "bend");
      }
    }
  }

  function edgeActivation(edge) {
    if (edge.type === "bend") return 0;
    const A = nodes[edge.a];
    const B = nodes[edge.b];
    const x = (A.base[0] + B.base[0]) / sheetWidth;
    const y = (A.base[1] + B.base[1]) / sheetHeight;
    const direction = unit([edge.dx / sheetWidth, edge.dy / sheetHeight, 0]);
    const pattern = patternInput.value;

    if (pattern === "left") {
      const spatial = Math.exp(-5.2 * (x + 0.28) * (x + 0.28)) * Math.max(0, 1 - 1.3 * Math.abs(y));
      return spatial * (0.25 + 0.75 * Math.abs(direction[1]));
    }
    if (pattern === "diagonal") {
      const diagonal = Math.abs(dot(direction, unit([1, 1, 0])));
      const band = Math.exp(-9 * (x - y) * (x - y));
      return band * Math.pow(diagonal, 2.2);
    }
    if (pattern === "wave") {
      const center = 0.33 * Math.sin(phase);
      const band = Math.exp(-24 * (x - center) * (x - center));
      return band * (0.25 + 0.75 * Math.abs(direction[1]));
    }

    const radius = Math.hypot(x * 1.4, y * 1.4);
    const tangent = radius > 1e-6 ? unit([-y, x, 0]) : [1, 0, 0];
    const circumferential = Math.abs(dot(direction, tangent));
    const ring = Math.exp(-2.8 * radius * radius);
    return ring * (0.18 + 0.82 * circumferential * circumferential);
  }

  function configureConstraints(amount) {
    nodes.forEach((node) => { node.activation = 0; });
    edges.forEach((edge) => {
      edge.activation = edgeActivation(edge);
      const participation = edge.type === "shear" ? 0.72 : 1;
      edge.rest = edge.base * (1 - amount * edge.activation * participation);
      nodes[edge.a].activation = Math.max(nodes[edge.a].activation, edge.activation);
      nodes[edge.b].activation = Math.max(nodes[edge.b].activation, edge.activation);
    });
  }

  function satisfy(edge, passive, bending) {
    const A = nodes[edge.a];
    const B = nodes[edge.b];
    const delta = sub(B.p, A.p);
    const length = Math.max(1e-8, norm(delta));
    const difference = length - edge.rest;
    const wa = A.fixed ? 0 : 1;
    const wb = B.fixed ? 0 : 1;
    const sum = wa + wb;
    if (!sum) return;
    let stiffness;
    if (edge.type === "bend") stiffness = 0.018 + 0.055 * bending;
    else if (edge.type === "shear") stiffness = 0.2 + 0.17 * passive;
    else stiffness = 0.46 + 0.22 * passive + 0.18 * edge.activation;
    const correction = mul(delta, stiffness * difference / (length * sum));
    if (wa) A.p = add(A.p, mul(correction, wa));
    if (wb) B.p = sub(B.p, mul(correction, wb));
  }

  function solve(pulse) {
    const amount = Number(contractionInput.value) / 100 * pulse;
    const passive = Number(stiffnessInput.value);
    const bending = Number(bendingInput.value);
    buildMesh(amount);
    configureConstraints(amount);
    for (let iteration = 0; iteration < 190; iteration++) {
      for (let i = 0; i < edges.length; i++) satisfy(edges[i], passive, bending);
      // A very small planar bias removes numerical drift while allowing an
      // incompatible active metric to hold a buckled equilibrium branch.
      nodes.forEach((node) => {
        if (node.fixed) node.p = node.base.slice();
        else node.p[2] *= 0.9996;
      });
    }
    measure();
  }

  function triangleArea(a, b, c) {
    return norm(cross(sub(b, a), sub(c, a))) / 2;
  }

  function measure() {
    let strainSquared = 0;
    let membraneCount = 0;
    let activeCount = 0;
    edges.forEach((edge) => {
      if (edge.type === "bend") return;
      const length = norm(sub(nodes[edge.b].p, nodes[edge.a].p));
      const strain = (length - edge.rest) / edge.rest;
      strainSquared += strain * strain;
      membraneCount++;
      if (edge.activation > 0.22) activeCount++;
    });
    let area = 0;
    triangles.forEach((tri) => { area += triangleArea(nodes[tri[0]].p, nodes[tri[1]].p, nodes[tri[2]].p); });
    const baseArea = sheetWidth * sheetHeight;
    const zValues = nodes.map((node) => node.p[2]);
    const areaChange = area / baseArea - 1;
    lastMetrics = {
      activeCount,
      rmsStrain: Math.sqrt(strainSquared / Math.max(1, membraneCount)),
      areaChange: Math.abs(areaChange) < 1e-8 ? 0 : areaChange,
      relief: Math.max(...zValues) - Math.min(...zValues)
    };
  }

  function world(point, offset) {
    return [point[0], point[2] + offset, point[1]];
  }

  function cameraBasis() {
    const distance = 500 / camera.zoom;
    const ce = Math.cos(camera.elevation);
    const position = [distance * ce * Math.cos(camera.azimuth), distance * Math.sin(camera.elevation), distance * ce * Math.sin(camera.azimuth)];
    const forward = unit(mul(position, -1));
    const right = unit(cross(forward, [0, 1, 0]));
    const up = unit(cross(right, forward));
    return { position, forward, right, up, focal: 770 };
  }

  function project(point, basis) {
    const rel = sub(point, basis.position);
    const depth = dot(rel, basis.forward);
    const scale = basis.focal / Math.max(depth, 1);
    return { x: canvas.width / 2 + dot(rel, basis.right) * scale, y: canvas.height / 2 - dot(rel, basis.up) * scale, depth };
  }

  function face(points, color, basis, faces) {
    const normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    const projected = points.map((point) => project(point, basis));
    faces.push({ points: projected, normal, color, depth: projected.reduce((s, p) => s + p.depth, 0) / projected.length });
  }

  function surfaceFaces(basis) {
    const faces = [];
    const passiveColor = [44, 102, 84];
    const activeColor = [232, 102, 61];
    triangles.forEach((tri) => {
      const activity = tri.reduce((sum, i) => sum + nodes[i].activation, 0) / 3;
      const topColor = mix(passiveColor, activeColor, clamp(activity, 0, 1));
      const top = tri.map((i) => world(nodes[i].p, thickness / 2));
      const bottom = tri.slice().reverse().map((i) => world(nodes[i].p, -thickness / 2));
      face(top, topColor, basis, faces);
      face(bottom, mix(topColor, [8, 29, 23], 0.58), basis, faces);
    });

    const boundary = [];
    for (let x = 0; x < cols; x++) boundary.push(index(x, 0));
    for (let y = 1; y < rows; y++) boundary.push(index(cols - 1, y));
    for (let x = cols - 2; x >= 0; x--) boundary.push(index(x, rows - 1));
    for (let y = rows - 2; y > 0; y--) boundary.push(index(0, y));
    for (let i = 0; i < boundary.length; i++) {
      const a = nodes[boundary[i]].p;
      const b = nodes[boundary[(i + 1) % boundary.length]].p;
      face([world(a, thickness / 2), world(b, thickness / 2), world(b, -thickness / 2), world(a, -thickness / 2)], [24, 66, 55], basis, faces);
    }
    return faces;
  }

  function drawFace(item) {
    const light = unit([-0.35, 0.8, 0.45]);
    const brightness = clamp(0.36 + 0.64 * Math.abs(dot(item.normal, light)), 0.28, 1);
    const color = item.color.map((channel) => Math.round(channel * brightness));
    ctx.beginPath();
    item.points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    ctx.fill();
  }

  function draw() {
    const background = ctx.createRadialGradient(canvas.width * 0.48, canvas.height * 0.42, 20, canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.72);
    background.addColorStop(0, "#194237");
    background.addColorStop(1, "#071914");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const basis = cameraBasis();
    surfaceFaces(basis).sort((a, b) => b.depth - a.depth).forEach(drawFace);

    ctx.lineWidth = 1.1;
    edges.filter((edge) => edge.type === "structural").forEach((edge) => {
      const a = project(world(nodes[edge.a].p, thickness / 2 + 0.5), basis);
      const b = project(world(nodes[edge.b].p, thickness / 2 + 0.5), basis);
      ctx.strokeStyle = edge.activation > 0.2 ? `rgba(255,200,172,${0.28 + 0.46 * edge.activation})` : "rgba(224,244,234,.24)";
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });

    nodes.filter((node) => node.fixed).forEach((node) => {
      const p = project(world(node.p, thickness / 2 + 1), basis);
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU);
      ctx.fillStyle = "#ffe168"; ctx.fill();
      ctx.strokeStyle = "rgba(7,25,20,.8)"; ctx.lineWidth = 2; ctx.stroke();
    });

    ctx.font = "500 15px DM Mono, monospace";
    ctx.fillStyle = "rgba(255,255,255,.68)";
    ctx.fillText("FILLED TRIANGULATED SHELL · drag to orbit", 25, 34);
    ctx.fillStyle = "#ffad88";
    ctx.fillText("orange = larger active rest-length change", 25, canvas.height - 25);
  }

  function updateReadouts() {
    $("meshContractionOut").textContent = contractionInput.value + "%";
    $("meshStiffnessOut").textContent = Number(stiffnessInput.value).toFixed(1) + "×";
    $("meshBendingOut").textContent = Number(bendingInput.value).toFixed(1) + "×";
    $("activeEdgesReadout").textContent = lastMetrics.activeCount.toString();
    $("meshEnergyReadout").textContent = (100 * lastMetrics.rmsStrain).toFixed(2) + "%";
    $("meshAreaReadout").textContent = (100 * lastMetrics.areaChange).toFixed(1) + "%";
    $("meshHeightReadout").textContent = lastMetrics.relief.toFixed(1) + " mm";
  }

  function render(pulse) {
    solve(pulse == null ? 1 : pulse);
    draw();
    updateReadouts();
  }

  [patternInput, contractionInput, stiffnessInput, bendingInput].forEach((control) => control.addEventListener("input", () => render(1)));
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    pointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    camera.azimuth += (event.clientX - pointer.x) * 0.009;
    camera.elevation = clamp(camera.elevation + (event.clientY - pointer.y) * 0.007, -1.2, 1.2);
    pointer = { x: event.clientX, y: event.clientY };
    draw();
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.001), 0.7, 2.15);
    draw();
  }, { passive: false });

  $("meshResetView").addEventListener("click", () => {
    camera.azimuth = 0.68;
    camera.elevation = 0.48;
    camera.zoom = 1;
    draw();
  });

  function animate(timestamp) {
    if (!animating) return;
    if (timestamp - lastFrame > 70) {
      phase = timestamp / 1700;
      const pulse = 0.72 + 0.28 * Math.sin(timestamp / 850);
      render(pulse);
      lastFrame = timestamp;
    }
    animationFrame = requestAnimationFrame(animate);
  }

  $("meshAnimate").addEventListener("click", () => {
    animating = !animating;
    $("meshAnimate").setAttribute("aria-pressed", String(animating));
    $("meshAnimate").textContent = animating ? "Pause field" : "Animate field";
    if (animating) animationFrame = requestAnimationFrame(animate);
    else { cancelAnimationFrame(animationFrame); render(1); }
  });

  render(1);
})();
