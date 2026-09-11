(function () {
  "use strict";

  const canvas = document.getElementById("meshCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const releaseInput = document.getElementById("meshRelease");
  const TAU = Math.PI * 2;
  const radialRings = 7;
  const sectors = 24;
  const frameRadius = 145;
  const sheetThickness = 4;
  const frameWidth = 10;
  const camera = { azimuth: 0.72, elevation: 0.43, zoom: 1.35 };
  let dragging = false;
  let pointer = { x: 0, y: 0 };
  let animating = false;
  let animationFrame = 0;
  let animationStart = 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const n = norm(a) || 1; return mul(a, 1 / n); };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  function ringIndex(ring, sector) {
    return 1 + (ring - 1) * sectors + ((sector % sectors) + sectors) % sectors;
  }

  function geometry() {
    const release = Number(releaseInput.value) / 100;
    // A spoke is R long in the flat, maximally wound reference state.
    // Unwinding releases length L = R(1+s). For a straight generator of a
    // cone, L² = R² + h², so h follows without an elastic material law.
    const height = frameRadius * Math.sqrt(Math.max(0, (1 + release) ** 2 - 1));
    const nodes = [{ p: [0, 0, height], radial: 0, boundary: false }];
    const triangles = [];

    for (let ring = 1; ring <= radialRings; ring++) {
      const q = ring / radialRings;
      const radius = frameRadius * q;
      const z = height * (1 - q);
      for (let sector = 0; sector < sectors; sector++) {
        const angle = TAU * sector / sectors;
        nodes.push({ p: [radius * Math.cos(angle), radius * Math.sin(angle), z], radial: q, boundary: ring === radialRings });
      }
    }

    for (let sector = 0; sector < sectors; sector++) {
      triangles.push([0, ringIndex(1, sector), ringIndex(1, sector + 1)]);
    }
    for (let ring = 1; ring < radialRings; ring++) {
      for (let sector = 0; sector < sectors; sector++) {
        const a = ringIndex(ring, sector);
        const b = ringIndex(ring, sector + 1);
        const c = ringIndex(ring + 1, sector);
        const d = ringIndex(ring + 1, sector + 1);
        triangles.push([a, c, d], [a, d, b]);
      }
    }

    return {
      release, height, nodes, triangles,
      spokeLength: frameRadius * (1 + release),
      areaChange: release
    };
  }

  function world(point, offset) {
    return [point[0], point[2] + offset, point[1]];
  }

  function cameraBasis() {
    const distance = 470 / camera.zoom;
    const ce = Math.cos(camera.elevation);
    const position = [distance * ce * Math.cos(camera.azimuth), distance * Math.sin(camera.elevation), distance * ce * Math.sin(camera.azimuth)];
    const forward = unit(mul(position, -1));
    const right = unit(cross(forward, [0, 1, 0]));
    const up = unit(cross(right, forward));
    return { position, forward, right, up, focal: 780 };
  }

  function project(point, basis) {
    const rel = sub(point, basis.position);
    const depth = dot(rel, basis.forward);
    const scale = basis.focal / Math.max(depth, 1);
    return { x: canvas.width / 2 + dot(rel, basis.right) * scale, y: canvas.height / 2 - dot(rel, basis.up) * scale, depth };
  }

  function addFace(faces, points, color, basis) {
    const normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    const projected = points.map((point) => project(point, basis));
    faces.push({ points: projected, normal, color, depth: projected.reduce((sum, p) => sum + p.depth, 0) / projected.length });
  }

  function sheetFaces(model, basis) {
    const faces = [];
    const passive = [42, 103, 83];
    const active = [232, 102, 61];
    model.triangles.forEach((triangle) => {
      const activity = 1 - triangle.reduce((sum, i) => sum + model.nodes[i].radial, 0) / 3;
      const color = mix(passive, active, clamp(activity * model.release * 5, 0, 1));
      const top = triangle.map((i) => world(model.nodes[i].p, sheetThickness / 2));
      const bottom = triangle.slice().reverse().map((i) => world(model.nodes[i].p, -sheetThickness / 2));
      addFace(faces, top, color, basis);
      addFace(faces, bottom, mix(color, [7, 28, 22], .58), basis);
    });
    return faces;
  }

  function frameFaces(basis) {
    const faces = [];
    const top = sheetThickness * 1.25;
    const bottom = -sheetThickness * 1.25;
    for (let sector = 0; sector < sectors * 2; sector++) {
      const a0 = TAU * sector / (sectors * 2);
      const a1 = TAU * (sector + 1) / (sectors * 2);
      const inner0 = [frameRadius * Math.cos(a0), frameRadius * Math.sin(a0), 0];
      const inner1 = [frameRadius * Math.cos(a1), frameRadius * Math.sin(a1), 0];
      const outer0 = [(frameRadius + frameWidth) * Math.cos(a0), (frameRadius + frameWidth) * Math.sin(a0), 0];
      const outer1 = [(frameRadius + frameWidth) * Math.cos(a1), (frameRadius + frameWidth) * Math.sin(a1), 0];
      addFace(faces, [world(inner0, top), world(outer0, top), world(outer1, top), world(inner1, top)], [151, 158, 152], basis);
      addFace(faces, [world(outer0, bottom), world(outer1, bottom), world(outer1, top), world(outer0, top)], [83, 94, 89], basis);
      addFace(faces, [world(inner1, bottom), world(inner0, bottom), world(inner0, top), world(inner1, top)], [103, 113, 108], basis);
    }
    return faces;
  }

  function paintFace(face) {
    const light = unit([-0.35, 0.8, 0.45]);
    const brightness = clamp(0.34 + 0.66 * Math.abs(dot(face.normal, light)), 0.25, 1);
    const color = face.color.map((channel) => Math.round(channel * brightness));
    ctx.beginPath();
    face.points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    ctx.fill();
  }

  function strokeCable(a, b, basis, color, width) {
    const A = project(world(a, sheetThickness / 2 + .8), basis);
    const B = project(world(b, sheetThickness / 2 + .8), basis);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  function draw(model) {
    const background = ctx.createRadialGradient(canvas.width * .5, canvas.height * .42, 20, canvas.width * .5, canvas.height * .5, canvas.width * .72);
    background.addColorStop(0, "#194237");
    background.addColorStop(1, "#071914");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const basis = cameraBasis();
    [...sheetFaces(model, basis), ...frameFaces(basis)].sort((a, b) => b.depth - a.depth).forEach(paintFace);

    for (let sector = 0; sector < sectors; sector++) {
      let previous = model.nodes[0].p;
      for (let ring = 1; ring <= radialRings; ring++) {
        const current = model.nodes[ringIndex(ring, sector)].p;
        strokeCable(previous, current, basis, "rgba(255,183,146,.72)", sector % 3 === 0 ? 2.2 : 1.2);
        previous = current;
      }
    }
    for (let ring = 1; ring < radialRings; ring++) {
      for (let sector = 0; sector < sectors; sector++) {
        strokeCable(model.nodes[ringIndex(ring, sector)].p, model.nodes[ringIndex(ring, sector + 1)].p, basis, "rgba(214,239,225,.32)", 1.1);
      }
    }

    for (let sector = 0; sector < sectors; sector += 3) {
      const point = project(world(model.nodes[ringIndex(radialRings, sector)].p, sheetThickness * 1.7), basis);
      ctx.beginPath(); ctx.arc(point.x, point.y, 5, 0, TAU);
      ctx.fillStyle = "#ffe168"; ctx.fill();
    }

    ctx.font = "500 15px DM Mono, monospace";
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.fillText("RIGID FRAME · INEXTENSIBLE CABLES", 25, 34);
    ctx.fillStyle = "#ffad88";
    ctx.fillText("orange = released radial cable", 25, canvas.height - 25);
  }

  function render() {
    const model = geometry();
    document.getElementById("meshReleaseOut").textContent = Math.round(model.release * 100) + "%";
    document.getElementById("meshReferenceReadout").textContent = model.release < .0001 ? "Max wound · taut" : Math.round(model.release * 100) + "% unwound";
    document.getElementById("meshLengthReadout").textContent = model.spokeLength.toFixed(1) + " mm";
    document.getElementById("meshHeightReadout").textContent = model.height.toFixed(1) + " mm";
    document.getElementById("meshErrorReadout").textContent = "0.00%";
    canvas.setAttribute("aria-label", "Rigid-frame cable mesh at " + Math.round(model.release * 100) + " percent actuator release, extending " + model.height.toFixed(1) + " millimeters outward. Radial and hoop line lengths are imposed without elastic stretch.");
    draw(model);
  }

  releaseInput.addEventListener("input", render);
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    pointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    camera.azimuth += (event.clientX - pointer.x) * .009;
    camera.elevation = clamp(camera.elevation + (event.clientY - pointer.y) * .007, -1.2, 1.2);
    pointer = { x: event.clientX, y: event.clientY };
    render();
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * .001), .7, 2.15);
    render();
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    const step = .12;
    if (event.key === "ArrowLeft") camera.azimuth -= step;
    else if (event.key === "ArrowRight") camera.azimuth += step;
    else if (event.key === "ArrowUp") camera.elevation = clamp(camera.elevation + step, -1.2, 1.2);
    else if (event.key === "ArrowDown") camera.elevation = clamp(camera.elevation - step, -1.2, 1.2);
    else if (event.key === "+" || event.key === "=") camera.zoom = clamp(camera.zoom * 1.12, .7, 2.15);
    else if (event.key === "-" || event.key === "_") camera.zoom = clamp(camera.zoom / 1.12, .7, 2.15);
    else return;
    event.preventDefault();
    render();
  });

  document.getElementById("meshResetView").addEventListener("click", () => {
    camera.azimuth = .72;
    camera.elevation = .43;
    camera.zoom = 1.35;
    render();
  });

  function animate(timestamp) {
    if (!animating) return;
    if (!animationStart) animationStart = timestamp;
    releaseInput.value = (9 + 9 * Math.sin((timestamp - animationStart) / 1700 - Math.PI / 2)).toFixed(1);
    render();
    animationFrame = requestAnimationFrame(animate);
  }

  document.getElementById("meshAnimate").addEventListener("click", () => {
    animating = !animating;
    const button = document.getElementById("meshAnimate");
    button.setAttribute("aria-pressed", String(animating));
    button.textContent = animating ? "Pause deployment" : "Animate deployment";
    if (animating) { animationStart = 0; animationFrame = requestAnimationFrame(animate); }
    else cancelAnimationFrame(animationFrame);
  });

  render();
})();
