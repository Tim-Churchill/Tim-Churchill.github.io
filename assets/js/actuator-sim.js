(function () {
  "use strict";

  const canvases = [document.getElementById("homeMeshPreview")].filter(Boolean);
  if (!canvases.length) return;
  const TAU = Math.PI * 2;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let phase = .45;

  function draw(canvas) {
    const ctx = canvas.getContext("2d");
    const cx = canvas.width * .5;
    const cy = canvas.height * .55;
    const radius = canvas.width * .31;
    const verticalScale = .44;
    const height = canvas.height * .30;
    const sectors = 20;
    const points = [];

    ctx.fillStyle = "#0a201a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const glow = ctx.createRadialGradient(cx, cy - height * .4, 10, cx, cy, radius * 1.35);
    glow.addColorStop(0, "rgba(45,118,94,.5)");
    glow.addColorStop(1, "rgba(7,25,20,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < sectors; i++) {
      const angle = TAU * i / sectors + phase;
      points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * verticalScale * Math.sin(angle), depth: Math.sin(angle) });
    }
    const apex = { x: cx, y: cy - height };

    const faces = points.map((point, i) => {
      const next = points[(i + 1) % sectors];
      return { point, next, depth: (point.depth + next.depth) / 2 };
    }).sort((a, b) => a.depth - b.depth);
    faces.forEach((face) => {
      const warm = Math.max(0, (face.depth + 1) / 2);
      ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(face.point.x, face.point.y); ctx.lineTo(face.next.x, face.next.y); ctx.closePath();
      ctx.fillStyle = `rgba(${Math.round(39 + 96 * warm)},${Math.round(92 + 28 * warm)},${Math.round(76 - 12 * warm)},.78)`;
      ctx.fill();
    });

    ctx.strokeStyle = "rgba(255,176,137,.68)";
    ctx.lineWidth = 2;
    for (let i = 0; i < sectors; i += 2) {
      ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(points[i].x, points[i].y); ctx.stroke();
    }

    ctx.beginPath();
    for (let i = 0; i <= sectors; i++) {
      const point = points[i % sectors];
      if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = "#aab1ac";
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.strokeStyle = "rgba(238,248,241,.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath(); ctx.arc(apex.x, apex.y, 7, 0, TAU);
    ctx.fillStyle = "#ed6a3b"; ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.font = "500 15px DM Mono, monospace";
    ctx.fillText("RIGID FRAME / RELEASED CABLES", 22, 30);
    ctx.fillStyle = "rgba(255,183,146,.78)";
    ctx.fillText("outward deployment", 22, canvas.height - 24);
  }

  function animate() {
    canvases.forEach(draw);
    if (!reducedMotion) {
      phase += .0025;
      requestAnimationFrame(animate);
    }
  }

  animate();
})();
