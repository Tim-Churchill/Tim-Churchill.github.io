(function () {
  "use strict";

  const canvas = document.getElementById("tsa3dCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const TAU = Math.PI * 2;
  const $ = (id) => document.getElementById(id);
  const controls = {
    turns: $("tsaTurns"), length: $("tsaLength"), diameter: $("tsaDiameter"),
    load: $("tsaLoad"), modulus: $("tsaModulus"), poisson: $("tsaPoisson")
  };
  const camera = { azimuth: 0.82, elevation: 0.32, zoom: 1 };
  let radialDetail = true;
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

  function closestOpposingHelixDistance(helixRadius, axialRisePerRadian) {
    if (axialRisePerRadian >= helixRadius) return { distance: 2 * helixRadius, delta: 0 };
    let lo = 1e-9;
    let hi = Math.PI;
    for (let i = 0; i < 70; i++) {
      const mid = (lo + hi) / 2;
      const derivative = axialRisePerRadian ** 2 * mid - helixRadius ** 2 * Math.sin(mid);
      if (derivative > 0) hi = mid; else lo = mid;
    }
    const delta = (lo + hi) / 2;
    const distance = Math.sqrt(2 * helixRadius ** 2 * (1 + Math.cos(delta)) + (axialRisePerRadian * delta) ** 2);
    return { distance, delta };
  }

  function contactCompatibleRadius(x, theta, tubeRadius) {
    if (Math.abs(theta) < 1e-9) return { radius: tubeRadius, valid: true, contactDelta: 0 };
    const rise = x / Math.abs(theta);
    const diameter = 2 * tubeRadius;
    const base = closestOpposingHelixDistance(tubeRadius, rise);
    if (base.distance >= diameter * (1 - 1e-9)) return { radius: tubeRadius, valid: true, contactDelta: base.delta };
    if (Math.PI * rise <= diameter) return { radius: tubeRadius, valid: false, contactDelta: Math.PI };
    let lo = tubeRadius;
    let hi = tubeRadius * 2;
    while (closestOpposingHelixDistance(hi, rise).distance < diameter && hi < tubeRadius * 4096) hi *= 2;
    if (hi >= tubeRadius * 4096) return { radius: hi, valid: false, contactDelta: Math.PI };
    for (let i = 0; i < 70; i++) {
      const mid = (lo + hi) / 2;
      if (closestOpposingHelixDistance(mid, rise).distance < diameter) lo = mid; else hi = mid;
    }
    const radius = (lo + hi) / 2;
    const contact = closestOpposingHelixDistance(radius, rise);
    return { radius, valid: true, contactDelta: contact.delta };
  }

  function equilibrium() {
    const turns = Number(controls.turns.value);
    const theta = TAU * turns;
    const L0 = Number(controls.length.value) / 1000;
    const d0 = Number(controls.diameter.value) / 1000;
    const F = Number(controls.load.value);
    const E = Number(controls.modulus.value) * 1e9;
    const nu = Number(controls.poisson.value);
    const A0 = Math.PI * d0 * d0 / 4;
    const EA = E * A0;

    function stateAt(x) {
      let strain = Math.max(0, (x - L0) / L0);
      let tubeRadius = d0 * Math.max(0.5, 1 - nu * strain) / 2;
      let helixRadius = tubeRadius;
      let length = x;
      let contactValid = true;
      let contactDelta = 0;
      for (let i = 0; i < 24; i++) {
        tubeRadius = d0 * Math.max(0.5, 1 - nu * strain) / 2;
        const contact = contactCompatibleRadius(x, theta, tubeRadius);
        helixRadius = contact.radius;
        contactValid = contact.valid;
        contactDelta = contact.contactDelta;
        length = Math.hypot(x, helixRadius * theta);
        strain = (length - L0) / L0;
      }
      const tension = Math.max(0, EA * strain);
      const cosAlpha = x / Math.max(length, 1e-12);
      return { x, length, strain, tubeRadius, helixRadius, tension, contactValid, contactDelta, residual: contactValid ? 2 * tension * cosAlpha - F : -F };
    }

    let lo = 1e-7;
    let hi = L0 * (1 + F / Math.max(EA, 1) + 1) + Math.abs(theta * d0);
    let hiState = stateAt(hi);
    while ((!hiState.contactValid || hiState.residual < 0) && hi < L0 * 128) {
      hi *= 1.5;
      hiState = stateAt(hi);
    }

    // Phase-I contact geometry has a lower axial-length limit. Locate that
    // boundary first so a discontinuity cannot be mistaken for a force root.
    let lowerState = stateAt(lo);
    if (!lowerState.contactValid) {
      let invalid = lo;
      let valid = hi;
      for (let i = 0; i < 90; i++) {
        const mid = (invalid + valid) / 2;
        if (stateAt(mid).contactValid) valid = mid; else invalid = mid;
      }
      lo = valid * (1 + 1e-9);
      lowerState = stateAt(lo);
    }

    let equilibriumValid = hiState.contactValid && hiState.residual >= 0 && lowerState.residual <= 0;
    let s;
    if (equilibriumValid) {
      for (let i = 0; i < 90; i++) {
        const mid = (lo + hi) / 2;
        const midState = stateAt(mid);
        if (!midState.contactValid || midState.residual < 0) lo = mid; else hi = mid;
      }
      s = stateAt((lo + hi) / 2);
      equilibriumValid = Math.abs(s.residual) <= Math.max(1e-6, F * 1e-7);
    } else {
      // Keep rendering the last uniform double-helix geometry, but do not
      // present its non-equilibrium force values as a physical prediction.
      s = lowerState;
    }
    const alpha = Math.atan2(s.helixRadius * theta, s.x);
    const loadedStraight = L0 * (1 + F / (2 * EA));
    const contraction = Math.max(0, loadedStraight - s.x);
    const pitch = turns > 1e-8 ? s.x / turns : Infinity;
    const diameter = 2 * s.tubeRadius;
    const halfTurnClearance = pitch === Infinity ? Infinity : pitch / 2 - diameter;
    const torque = F * s.helixRadius * Math.tan(alpha);
    const stress = s.tension / A0;
    const q = theta / Math.max(s.x, 1e-12);
    const curvature = s.helixRadius * q * q / (1 + (s.helixRadius * q) ** 2);
    const torsion = q / (1 + (s.helixRadius * q) ** 2);
    const requiredAxialForce = 2 * s.tension * Math.cos(alpha);
    return { turns, theta, L0, d0, F, E, nu, A0, EA, ...s, equilibriumValid, alpha, loadedStraight, contraction, pitch, diameter, halfTurnClearance, torque, stress, curvature, torsion, requiredAxialForce };
  }

  function cameraBasis(model) {
    const lengthMm = model.x * 1000;
    const distance = (lengthMm * 1.45 + 100) / camera.zoom;
    const ce = Math.cos(camera.elevation);
    const position = [distance * ce * Math.cos(camera.azimuth), distance * Math.sin(camera.elevation), distance * ce * Math.sin(camera.azimuth)];
    const forward = unit(mul(position, -1));
    const right = unit(cross(forward, [0, 1, 0]));
    const up = unit(cross(right, forward));
    return { position, forward, right, up, focal: 820 };
  }

  function project(point, basis) {
    const rel = sub(point, basis.position);
    const depth = dot(rel, basis.forward);
    const scale = basis.focal / Math.max(depth, 1);
    return { x: canvas.width / 2 + dot(rel, basis.right) * scale, y: canvas.height / 2 - dot(rel, basis.up) * scale, depth };
  }

  function addTubeFaces(faces, model, phase, color, basis, radialScale) {
    const segments = Math.max(260, Math.ceil(model.turns * 18));
    const sides = 10;
    const centerRadius = model.helixRadius * 1000 * radialScale;
    const tubeRadius = model.tubeRadius * 1000 * radialScale;
    const axial = model.x * 1000;
    const rings = [];

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const phi = model.theta * u + phase;
      const center = [centerRadius * Math.cos(phi), centerRadius * Math.sin(phi), axial * (u - 0.5)];
      const tangent = unit([-centerRadius * model.theta * Math.sin(phi), centerRadius * model.theta * Math.cos(phi), axial]);
      const radial = [Math.cos(phi), Math.sin(phi), 0];
      const binormal = unit(cross(tangent, radial));
      const ring = [];
      for (let j = 0; j < sides; j++) {
        const psi = TAU * j / sides;
        const normal = unit(add(mul(radial, Math.cos(psi)), mul(binormal, Math.sin(psi))));
        const world = add(center, mul(normal, tubeRadius));
        ring.push({ world, screen: project(world, basis), normal });
      }
      rings.push(ring);
    }

    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < sides; j++) {
        const next = (j + 1) % sides;
        const vertices = [rings[i][j], rings[i][next], rings[i + 1][next], rings[i + 1][j]];
        const faceNormal = unit(add(add(vertices[0].normal, vertices[1].normal), add(vertices[2].normal, vertices[3].normal)));
        faces.push({
          points: vertices.map((v) => v.screen),
          depth: vertices.reduce((sum, v) => sum + v.screen.depth, 0) / 4,
          normal: faceNormal,
          color
        });
      }
    }
  }

  function addCylinderFaces(faces, z, radius, thickness, basis, color) {
    const sides = 28;
    const rings = [-thickness / 2, thickness / 2].map((dz) => {
      const ring = [];
      for (let i = 0; i < sides; i++) {
        const a = TAU * i / sides;
        const world = [radius * Math.cos(a), radius * Math.sin(a), z + dz];
        ring.push({ world, screen: project(world, basis), normal: [Math.cos(a), Math.sin(a), 0] });
      }
      return ring;
    });
    for (let i = 0; i < sides; i++) {
      const n = (i + 1) % sides;
      const vertices = [rings[0][i], rings[0][n], rings[1][n], rings[1][i]];
      faces.push({ points: vertices.map(v => v.screen), depth: vertices.reduce((s, v) => s + v.screen.depth, 0) / 4, normal: vertices[0].normal, color });
    }
    [0, 1].forEach((ringIndex) => {
      const centerWorld = [0, 0, z + (ringIndex ? 1 : -1) * thickness / 2];
      const center = { world: centerWorld, screen: project(centerWorld, basis), normal: [0, 0, ringIndex ? 1 : -1] };
      for (let i = 0; i < sides; i++) {
        const n = (i + 1) % sides;
        const vertices = [center, rings[ringIndex][i], rings[ringIndex][n]];
        faces.push({ points: vertices.map(v => v.screen), depth: vertices.reduce((s, v) => s + v.screen.depth, 0) / 3, normal: center.normal, color });
      }
    });
  }

  function paintFace(face) {
    const light = unit([0.3, -0.65, 0.7]);
    const intensity = clamp(0.32 + 0.68 * Math.abs(dot(face.normal, light)), 0.2, 1);
    const rgb = face.color.map((channel) => Math.round(channel * intensity));
    ctx.beginPath();
    face.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fill();
  }

  function draw(model) {
    const basis = cameraBasis(model);
    const radialScale = radialDetail ? 4 : 1;
    const background = ctx.createRadialGradient(canvas.width * .52, canvas.height * .42, 20, canvas.width * .52, canvas.height * .42, canvas.width * .7);
    background.addColorStop(0, "#163d33");
    background.addColorStop(1, "#071914");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const axisStart = project([0, 0, -model.x * 540], basis);
    const axisEnd = project([0, 0, model.x * 540], basis);
    ctx.setLineDash([8, 9]);
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(axisStart.x, axisStart.y); ctx.lineTo(axisEnd.x, axisEnd.y); ctx.stroke();
    ctx.setLineDash([]);

    const faces = [];
    const fixtureRadius = Math.max(7, model.diameter * 1000 * radialScale * 3.2);
    const fixtureThickness = Math.max(5, model.diameter * 1000 * radialScale * 1.6);
    addCylinderFaces(faces, -model.x * 500, fixtureRadius, fixtureThickness, basis, [116, 126, 121]);
    addCylinderFaces(faces, model.x * 500, fixtureRadius, fixtureThickness, basis, [151, 157, 150]);
    addTubeFaces(faces, model, 0, [237, 106, 59], basis, radialScale);
    addTubeFaces(faces, model, Math.PI, [184, 237, 203], basis, radialScale);
    faces.sort((a, b) => b.depth - a.depth).forEach(paintFace);

    const loadStart = project([0, 0, model.x * 500 + fixtureThickness], basis);
    const loadEnd = project([0, 0, model.x * 500 + fixtureThickness + 30], basis);
    ctx.strokeStyle = "#ffe168"; ctx.fillStyle = "#ffe168"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(loadStart.x, loadStart.y); ctx.lineTo(loadEnd.x, loadEnd.y); ctx.stroke();
    const angle = Math.atan2(loadEnd.y - loadStart.y, loadEnd.x - loadStart.x);
    ctx.beginPath(); ctx.moveTo(loadEnd.x, loadEnd.y); ctx.lineTo(loadEnd.x - 12 * Math.cos(angle - .5), loadEnd.y - 12 * Math.sin(angle - .5)); ctx.lineTo(loadEnd.x - 12 * Math.cos(angle + .5), loadEnd.y - 12 * Math.sin(angle + .5)); ctx.closePath(); ctx.fill();

    ctx.font = "500 16px DM Mono, monospace";
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.fillText("fixed motor end", 30, 40);
    ctx.fillStyle = "#ffe168";
    ctx.fillText("F = " + model.F.toFixed(0) + " N", clamp(loadEnd.x + 10, 20, canvas.width - 120), clamp(loadEnd.y + 5, 24, canvas.height - 24));
    ctx.fillStyle = radialDetail ? "#ffb08f" : "rgba(255,255,255,.55)";
    ctx.fillText(radialDetail ? "RADIAL DIMENSIONS ×4 · axial scale exact" : "TRUE GEOMETRIC SCALE", 30, canvas.height - 28);
  }

  function formatStress(pa) {
    return pa >= 1e9 ? (pa / 1e9).toFixed(2) + " GPa" : (pa / 1e6).toFixed(0) + " MPa";
  }

  function render() {
    const m = equilibrium();
    $("tsaTurnsOut").textContent = m.turns.toFixed(1);
    $("tsaLengthOut").textContent = (m.L0 * 1000).toFixed(0) + " mm";
    $("tsaDiameterOut").textContent = (m.d0 * 1000).toFixed(2) + " mm";
    $("tsaLoadOut").textContent = m.F.toFixed(0) + " N";
    $("tsaModulusOut").textContent = (m.E / 1e9).toFixed(1) + " GPa";
    $("tsaPoissonOut").textContent = m.nu.toFixed(2);
    if (m.equilibriumValid) {
      $("tsaLengthReadout").textContent = (m.x * 1000).toFixed(1) + " mm";
      $("tsaContractionReadout").textContent = (m.contraction * 1000).toFixed(1) + " mm · " + (100 * m.contraction / m.loadedStraight).toFixed(1) + "%";
      $("tsaAngleReadout").textContent = (m.alpha * 180 / Math.PI).toFixed(1) + "°";
      $("tsaTensionReadout").textContent = m.tension.toFixed(1) + " N · " + formatStress(m.stress);
      $("tsaTorqueReadout").textContent = (m.torque * 1000).toFixed(2) + " N·mm";
      $("tsaPitchReadout").textContent = Number.isFinite(m.pitch) ? (m.pitch * 1000).toFixed(2) + " mm" : "∞";
    } else {
      $("tsaLengthReadout").textContent = "No phase-I solution";
      $("tsaContractionReadout").textContent = "overtwist required";
      $("tsaAngleReadout").textContent = "—";
      $("tsaTensionReadout").textContent = "—";
      $("tsaTorqueReadout").textContent = "—";
      $("tsaPitchReadout").textContent = (m.pitch * 1000).toFixed(2) + " mm limit";
    }

    const status = $("tsaStatus");
    const clearanceMm = m.halfTurnClearance * 1000;
    const excessiveStrain = m.strain > .04;
    const interference = clearanceMm <= 0;
    status.classList.toggle("warning", !m.equilibriumValid || !m.contactValid || interference || excessiveStrain);
    if (!m.equilibriumValid) status.textContent = "No uniform phase-I equilibrium exists at this twist and load. The contact-limit geometry would require " + m.requiredAxialForce.toFixed(0) + " N axially, so the real actuator must enter overtwist, buckle, flatten, or rearrange its strands.";
    else if (!m.contactValid || interference) status.textContent = "Pitch is too tight for a non-penetrating uniform double helix. Phase-I geometry has ended; overtwist and local contact mechanics are required.";
    else if (excessiveStrain) status.textContent = "Axial strain is " + (100 * m.strain).toFixed(1) + "%. Linear elasticity may no longer be reliable for this material setting.";
    else status.textContent = "Stable phase-I double helix · solved helix radius " + (m.helixRadius * 1000).toFixed(3) + " mm · tube radius " + (m.tubeRadius * 1000).toFixed(3) + " mm · hard contact satisfied.";
    draw(m);
  }

  Object.values(controls).forEach((control) => control.addEventListener("input", render));
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true; pointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    camera.azimuth += (event.clientX - pointer.x) * .009;
    camera.elevation = clamp(camera.elevation + (event.clientY - pointer.y) * .007, -1.25, 1.25);
    pointer = { x: event.clientX, y: event.clientY }; render();
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault(); camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * .001), .65, 2.3); render();
  }, { passive: false });

  $("tsaResetView").addEventListener("click", () => { camera.azimuth = .82; camera.elevation = .32; camera.zoom = 1; render(); });
  $("tsaScale").addEventListener("click", () => {
    radialDetail = !radialDetail;
    $("tsaScale").setAttribute("aria-pressed", String(radialDetail));
    $("tsaScale").textContent = radialDetail ? "Radial detail ×4" : "True scale";
    render();
  });

  function animate(timestamp) {
    if (!animating) return;
    if (!animationStart) animationStart = timestamp;
    controls.turns.value = (27.5 + 27.5 * Math.sin((timestamp - animationStart) / 2600 - Math.PI / 2)).toFixed(1);
    render();
    animationFrame = requestAnimationFrame(animate);
  }

  $("tsaAnimate").addEventListener("click", () => {
    animating = !animating;
    $("tsaAnimate").setAttribute("aria-pressed", String(animating));
    $("tsaAnimate").textContent = animating ? "Pause twist" : "Animate twist";
    if (animating) { animationStart = 0; animationFrame = requestAnimationFrame(animate); }
    else cancelAnimationFrame(animationFrame);
  });

  render();
})();
