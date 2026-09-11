(function () {
  "use strict";

  const canvas = document.getElementById("liquidLensCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const material = document.getElementById("lensMaterial");
  const field = document.getElementById("lensField");
  const gradient = document.getElementById("lensGradient");
  const aperture = document.getElementById("lensAperture");
  const play = document.getElementById("lensPlay");

  const mu0 = 4 * Math.PI * 1e-7;
  const gamma = 0.072;
  const refractiveIndex = 1.34;
  const baselineSusceptibility = 1e-4;
  let animating = false;
  let animationFrame = 0;
  let animationStart = 0;

  function formatLength(meters) {
    if (!Number.isFinite(meters)) return "∞";
    if (meters >= 1) return meters.toFixed(2) + " m";
    return (meters * 1000).toFixed(meters < 0.1 ? 1 : 0) + " mm";
  }

  function model() {
    const response = Number(material.value);
    const B = Number(field.value);
    const energyDifference = Number(gradient.value) / 100;
    const radius = Number(aperture.value) / 1000;
    const chi = baselineSusceptibility * response;
    const pressure = chi * energyDifference * B * B / (2 * mu0);
    const sag = pressure * radius * radius / (4 * gamma);
    const curvatureRadius = pressure > 0 ? 2 * gamma / pressure : Infinity;
    const focalLength = curvatureRadius / (refractiveIndex - 1);
    const edgeSlope = pressure * radius / (2 * gamma);
    return { response, B, energyDifference, radius, pressure, sag, curvatureRadius, focalLength, edgeSlope };
  }

  function render() {
    const m = model();
    document.getElementById("lensFieldOut").textContent = m.B.toFixed(2) + " T";
    document.getElementById("lensGradientOut").textContent = Math.round(m.energyDifference * 100) + "%";
    document.getElementById("lensApertureOut").textContent = Math.round(m.radius * 1000) + " mm";
    document.getElementById("lensSagReadout").textContent = formatLength(m.sag);
    document.getElementById("lensRadiusReadout").textContent = formatLength(m.curvatureRadius);
    document.getElementById("lensFocusReadout").textContent = formatLength(m.focalLength);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a201a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = 450;
    const baseY = 300;
    const lensHalfWidth = 250;
    const sagPixels = Math.max(2, Math.min(125, m.sag / m.radius * lensHalfWidth));
    const pxPerMeter = lensHalfWidth / m.radius;
    const focalPixels = m.focalLength * pxPerMeter;

    ctx.strokeStyle = "rgba(184,237,203,.09)";
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath();
      ctx.ellipse(centerX, baseY - 20, 90 + ring * 62, 35 + ring * 22, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#d7d3c8";
    ctx.fillRect(centerX - lensHalfWidth - 35, baseY - 6, 35, 100);
    ctx.fillRect(centerX + lensHalfWidth, baseY - 6, 35, 100);
    ctx.fillStyle = "#53635d";
    ctx.fillRect(centerX - lensHalfWidth - 22, baseY + 8, 22, 68);
    ctx.fillRect(centerX + lensHalfWidth, baseY + 8, 22, 68);

    function surfaceY(x) {
      const u = (x - centerX) / lensHalfWidth;
      return baseY - sagPixels * Math.max(0, 1 - u * u);
    }

    ctx.beginPath();
    ctx.moveTo(centerX - lensHalfWidth, baseY);
    for (let i = 0; i <= 120; i++) {
      const x = centerX - lensHalfWidth + 2 * lensHalfWidth * i / 120;
      ctx.lineTo(x, surfaceY(x));
    }
    ctx.lineTo(centerX + lensHalfWidth, baseY + 82);
    ctx.lineTo(centerX - lensHalfWidth, baseY + 82);
    ctx.closePath();
    const liquid = ctx.createLinearGradient(0, baseY - 120, 0, baseY + 82);
    liquid.addColorStop(0, "rgba(74,183,198,.65)");
    liquid.addColorStop(1, "rgba(20,91,103,.86)");
    ctx.fillStyle = liquid;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const x = centerX - lensHalfWidth + 2 * lensHalfWidth * i / 120;
      const y = surfaceY(x);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#ed6a3b";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.stroke();

    const rayOffsets = [-0.72, -0.36, 0, 0.36, 0.72];
    rayOffsets.forEach((unit) => {
      const x = centerX + unit * lensHalfWidth;
      const y = surfaceY(x);
      ctx.strokeStyle = "rgba(255,225,104,.76)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x, y); ctx.stroke();

      const travel = canvas.height - 34 - y;
      const endX = focalPixels <= travel ? centerX : centerX + (x - centerX) * (1 - travel / focalPixels);
      ctx.setLineDash(focalPixels > travel ? [7, 7] : []);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, y + travel); ctx.stroke();
      ctx.setLineDash([]);
    });

    if (focalPixels <= canvas.height - baseY - 20) {
      const focusY = baseY + focalPixels;
      ctx.beginPath(); ctx.arc(centerX, focusY, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#ffe168"; ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.font = "500 15px DM Mono, monospace";
      ctx.fillText("focus", centerX + 14, focusY + 5);
    } else {
      ctx.fillStyle = "rgba(255,225,104,.76)";
      ctx.font = "500 15px DM Mono, monospace";
      ctx.fillText("focus " + formatLength(m.focalLength) + " below lens", centerX - 132, canvas.height - 14);
    }

    ctx.fillStyle = "rgba(255,255,255,.68)";
    ctx.font = "500 15px DM Mono, monospace";
    ctx.fillText("parallel light", 34, 36);
    ctx.fillText("pₘ = " + m.pressure.toFixed(2) + " Pa", 34, canvas.height - 36);
    ctx.fillText("surface height × " + Math.max(1, Math.round(sagPixels / Math.max(1, m.sag * pxPerMeter))) + " for visibility", 620, 36);

    if (m.edgeSlope > 0.35) {
      ctx.fillStyle = "#ed6a3b";
      ctx.fillText("large-slope region: use nonlinear model", 34, 64);
    }
  }

  function animate(timestamp) {
    if (!animating) return;
    if (!animationStart) animationStart = timestamp;
    const phase = (timestamp - animationStart) / 1300;
    field.value = (0.34 + 0.25 * (0.5 + 0.5 * Math.sin(phase))).toFixed(2);
    render();
    animationFrame = requestAnimationFrame(animate);
  }

  [material, field, gradient, aperture].forEach((control) => control.addEventListener("input", render));
  play.addEventListener("click", function () {
    animating = !animating;
    play.setAttribute("aria-pressed", String(animating));
    play.textContent = animating ? "Pause field" : "Animate field";
    if (animating) {
      animationStart = 0;
      animationFrame = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animationFrame);
    }
  });

  render();
})();
