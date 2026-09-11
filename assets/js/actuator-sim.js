(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const byId = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function drawActuator() {
    const canvas = byId("actuatorCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const turnsInput = byId("turns");
    const lengthInput = byId("lineLength");
    const radiusInput = byId("radius");

    function render() {
      const s = Number(lengthInput.value);
      const r = Number(radiusInput.value);
      const safeMaximumTurns = Math.min(18, 0.65 * s / (TAU * r));
      turnsInput.max = Math.floor(safeMaximumTurns * 10) / 10;
      if (Number(turnsInput.value) > Number(turnsInput.max)) turnsInput.value = turnsInput.max;
      const turns = Number(turnsInput.value);
      const theta = TAU * turns;
      const circumferential = r * theta;
      const x = Math.sqrt(Math.max(0, s * s - circumferential * circumferential));
      const delta = s - x;
      const beta = Math.atan2(circumferential, Math.max(x, 0.0001)) * 180 / Math.PI;

      byId("turnsOut").textContent = turns.toFixed(1);
      byId("lineLengthOut").textContent = s.toFixed(0) + " mm";
      byId("radiusOut").textContent = r.toFixed(1) + " mm";
      byId("lengthReadout").textContent = x.toFixed(1) + " mm";
      byId("contractionReadout").textContent = delta.toFixed(1) + " mm · " + (100 * delta / s).toFixed(1) + "%";
      byId("angleReadout").textContent = beta.toFixed(1) + "°";

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const left = 92;
      const right = 808;
      const centerY = 215;
      const available = right - left;
      const drawnLength = available * (x / s);
      const endX = left + drawnLength;
      const amp = 38;

      ctx.fillStyle = "#0a201a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(184,237,203,.16)";
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(left, centerY); ctx.lineTo(right, centerY); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#e8eee9";
      ctx.fillRect(left - 18, centerY - 70, 18, 140);
      ctx.fillRect(endX, centerY - 70, 18, 140);

      const samples = 280;
      [0, Math.PI].forEach((phase, strand) => {
        ctx.beginPath();
        for (let i = 0; i <= samples; i++) {
          const u = i / samples;
          const px = left + drawnLength * u;
          const py = centerY + Math.sin(theta * u + phase) * amp;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = strand ? "#b8edcb" : "#ed6a3b";
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.stroke();
      });

      ctx.fillStyle = "rgba(255,255,255,.66)";
      ctx.font = "500 18px DM Mono, monospace";
      ctx.fillText("fixed", 38, 315);
      ctx.fillText("load", Math.min(endX - 8, 790), 315);
      ctx.fillStyle = "#b8edcb";
      ctx.fillText("x = " + x.toFixed(1) + " mm", left + Math.max(30, drawnLength / 2 - 80), 382);

      ctx.strokeStyle = "#b8edcb";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(left, 350); ctx.lineTo(endX, 350); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, 340); ctx.lineTo(left, 360); ctx.moveTo(endX, 340); ctx.lineTo(endX, 360); ctx.stroke();
    }

    [turnsInput, lengthInput, radiusInput].forEach((el) => el.addEventListener("input", render));
    render();
  }

  function meshSystem(canvas, interactive) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cols = 9;
    const rows = 6;
    const marginX = 82;
    const marginY = 70;
    const width = canvas.width - marginX * 2;
    const height = canvas.height - marginY * 2;
    let nodes = [];
    let edges = [];
    let baseBoundaryArea = 1;
    let lastEnergy = 0;
    let previewPhase = 0;

    const patternInput = interactive ? byId("meshPattern") : null;
    const contractionInput = interactive ? byId("meshContraction") : null;
    const stiffnessInput = interactive ? byId("meshStiffness") : null;

    function index(x, y) { return y * cols + x; }

    function isFixed(x, y) {
      return (x === 0 || x === cols - 1) && (y === 0 || y === rows - 1);
    }

    function reset() {
      nodes = [];
      edges = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          nodes.push({
            x: marginX + x * width / (cols - 1),
            y: marginY + y * height / (rows - 1),
            vx: 0, vy: 0, gx: x, gy: y,
            fixed: isFixed(x, y)
          });
        }
      }
      function add(a, b, diagonal) {
        const A = nodes[a], B = nodes[b];
        edges.push({ a, b, base: Math.hypot(B.x - A.x, B.y - A.y), diagonal, active: 0, rest: 0 });
      }
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (x < cols - 1) add(index(x, y), index(x + 1, y), false);
        if (y < rows - 1) add(index(x, y), index(x, y + 1), false);
        if (x < cols - 1 && y < rows - 1) {
          add(index(x, y), index(x + 1, y + 1), true);
          add(index(x + 1, y), index(x, y + 1), true);
        }
      }
      baseBoundaryArea = boundaryArea();
      updateRestLengths();
    }

    function activation(edge, pattern, phase) {
      const A = nodes[edge.a], B = nodes[edge.b];
      const x = (A.gx + B.gx) / (2 * (cols - 1));
      const y = (A.gy + B.gy) / (2 * (rows - 1));
      if (edge.diagonal) return 0;
      if (pattern === "left") return clamp(1 - x * 2.1, 0, 1);
      if (pattern === "diagonal") return clamp(1 - Math.abs(x - y) * 5, 0, 1);
      if (pattern === "wave") {
        const center = interactive ? 0.5 : 0.5 + 0.28 * Math.sin(phase);
        return clamp(1 - Math.abs(x - center) * 5.5, 0, 1);
      }
      const d = Math.hypot(x - .5, y - .5);
      return clamp(1 - d * 3, 0, 1);
    }

    function updateRestLengths() {
      const pattern = patternInput ? patternInput.value : "wave";
      const contraction = contractionInput ? Number(contractionInput.value) / 100 : .15;
      edges.forEach((edge) => {
        edge.active = activation(edge, pattern, previewPhase);
        edge.rest = edge.base * (1 - contraction * edge.active);
      });
    }

    function step(iterations) {
      const passiveScale = stiffnessInput ? Number(stiffnessInput.value) : 1;
      lastEnergy = 0;
      for (let iter = 0; iter < iterations; iter++) {
        const forces = nodes.map(() => ({ x: 0, y: 0 }));
        lastEnergy = 0;
        edges.forEach((edge) => {
          const A = nodes[edge.a], B = nodes[edge.b];
          const dx = B.x - A.x, dy = B.y - A.y;
          const length = Math.max(.001, Math.hypot(dx, dy));
          const stiffness = edge.diagonal ? .32 * passiveScale : (edge.active > .02 ? 1.35 : passiveScale);
          const extension = length - edge.rest;
          const force = stiffness * extension;
          const fx = force * dx / length, fy = force * dy / length;
          forces[edge.a].x += fx; forces[edge.a].y += fy;
          forces[edge.b].x -= fx; forces[edge.b].y -= fy;
          lastEnergy += .5 * stiffness * extension * extension;
        });
        nodes.forEach((node, i) => {
          if (node.fixed) { node.vx = 0; node.vy = 0; return; }
          node.vx = (node.vx + forces[i].x * .018) * .78;
          node.vy = (node.vy + forces[i].y * .018) * .78;
          node.x += node.vx;
          node.y += node.vy;
        });
      }
    }

    function boundary() {
      const order = [];
      for (let x = 0; x < cols; x++) order.push(nodes[index(x, 0)]);
      for (let y = 1; y < rows; y++) order.push(nodes[index(cols - 1, y)]);
      for (let x = cols - 2; x >= 0; x--) order.push(nodes[index(x, rows - 1)]);
      for (let y = rows - 2; y > 0; y--) order.push(nodes[index(0, y)]);
      return order;
    }

    function boundaryArea() {
      const ring = boundary();
      let area = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        area += a.x * b.y - b.x * a.y;
      }
      return Math.abs(area) / 2;
    }

    function draw() {
      ctx.fillStyle = "#0a201a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const ring = boundary();
      ctx.beginPath();
      ring.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = "rgba(184,237,203,.035)";
      ctx.fill();

      edges.filter((e) => e.diagonal).forEach((edge) => line(edge, "rgba(184,237,203,.10)", 1));
      edges.filter((e) => !e.diagonal && e.active < .03).forEach((edge) => line(edge, "rgba(215,232,221,.42)", 2));
      edges.filter((e) => !e.diagonal && e.active >= .03).forEach((edge) => line(edge, `rgba(237,106,59,${.35 + .65 * edge.active})`, 2 + 3 * edge.active));

      nodes.forEach((node) => {
        ctx.beginPath(); ctx.arc(node.x, node.y, node.fixed ? 6 : 3, 0, TAU);
        ctx.fillStyle = node.fixed ? "#b8edcb" : "rgba(238,248,241,.75)";
        ctx.fill();
      });

      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.font = "500 15px DM Mono, monospace";
      ctx.fillText("orange = active rest-length change", 24, canvas.height - 22);
    }

    function line(edge, color, widthPx) {
      const A = nodes[edge.a], B = nodes[edge.b];
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
      ctx.strokeStyle = color; ctx.lineWidth = widthPx; ctx.lineCap = "round"; ctx.stroke();
    }

    function updateReadouts() {
      if (!interactive) return;
      byId("meshContractionOut").textContent = contractionInput.value + "%";
      byId("meshStiffnessOut").textContent = Number(stiffnessInput.value).toFixed(1) + "×";
      byId("activeEdgesReadout").textContent = edges.filter((e) => e.active > .18).length.toString();
      byId("meshEnergyReadout").textContent = (lastEnergy / Math.max(1, edges.length)).toFixed(2);
      byId("meshAreaReadout").textContent = ((boundaryArea() / baseBoundaryArea - 1) * 100).toFixed(1) + "%";
    }

    function settle() {
      updateRestLengths();
      step(240);
      draw();
      updateReadouts();
    }

    reset();
    if (interactive) {
      [patternInput, contractionInput, stiffnessInput].forEach((el) => el.addEventListener("input", settle));
      settle();
    } else {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      function animate() {
        previewPhase += .018;
        updateRestLengths(); step(5); draw();
        if (!reduced) requestAnimationFrame(animate);
      }
      animate();
    }
  }

  drawActuator();
  meshSystem(byId("meshCanvas"), true);
  meshSystem(byId("meshPreview"), false);
})();
