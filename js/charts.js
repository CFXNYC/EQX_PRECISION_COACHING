/* ═══════════════════════════════════════════════════════════
   CHART LIBRARY — hand-rolled vanilla SVG, no dependencies
   ---------------------------------------------------------
   Every function returns an HTML string (or SVG string) meant
   to be assigned via innerHTML. Pure presentation — takes plain
   numbers/labels in, no knowledge of the data layer.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const MONO_SCALE = ["#f0f0f0", "#d8d8d8", "#b0b0b0", "#808080", "#4a4a4a", "#1a1a1a"];

  function scoreColor(score) {
    if (score >= 85) return "#1a5c38";
    if (score >= 75) return "#1f4e72";
    if (score >= 60) return "#7a5a1f";
    return "#7a2d1f";
  }

  /* ── Score ring ──────────────────────────────────────────── */
  function ring({ score, size = 90, stroke = 7, color, numSize, showLabel = true }) {
    const c = color || scoreColor(score);
    const r = (size - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - Math.min(Math.max(score, 0), 100) / 100);
    const fs = numSize || Math.round(size * 0.28);
    return `
      <div class="ring" style="width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--light-gray)" stroke-width="${stroke}"/>
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${c}" stroke-width="${stroke}"
            stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" stroke-linecap="round"/>
        </svg>
        ${showLabel ? `<div class="ring-num" style="font-size:${fs}px">${Math.round(score)}</div>` : ""}
      </div>`;
  }

  /* ── Line / area trend chart (supports multiple series) ──── */
  function lineChart({ series, xLabels, width = 600, height = 220, yMin, yMax, unit = "" }) {
    const padL = 34, padR = 12, padT = 14, padB = 26;
    const plotW = width - padL - padR, plotH = height - padT - padB;

    let allVals = [];
    series.forEach(s => { allVals = allVals.concat(s.values); });
    const dataMin = yMin !== undefined ? yMin : Math.min(0, ...allVals);
    const dataMax = yMax !== undefined ? yMax : Math.max(...allVals) * 1.15 || 10;
    const range = (dataMax - dataMin) || 1;

    const n = xLabels.length;
    const xStep = n > 1 ? plotW / (n - 1) : 0;
    const xAt = i => padL + xStep * i;
    const yAt = v => padT + plotH - ((v - dataMin) / range) * plotH;

    const gridLines = 4;
    let gridsSvg = "";
    for (let g = 0; g <= gridLines; g++) {
      const v = dataMin + (range * g) / gridLines;
      const y = yAt(v);
      gridsSvg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#e8e8e8" stroke-width="1"/>`;
      gridsSvg += `<text x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" font-family="DM Mono, monospace" fill="#999">${Math.round(v)}${unit}</text>`;
    }

    let labelSvg = "";
    const labelEvery = n > 9 ? Math.ceil(n / 7) : 1;
    xLabels.forEach((lbl, i) => {
      if (i % labelEvery !== 0 && i !== n - 1) return;
      labelSvg += `<text x="${xAt(i).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9" font-family="DM Mono, monospace" fill="#999">${lbl}</text>`;
    });

    let seriesSvg = "";
    series.forEach(s => {
      const pts = s.values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
      if (s.area) {
        const areaPts = `${padL},${(padT + plotH).toFixed(1)} ${pts} ${xAt(n - 1).toFixed(1)},${(padT + plotH).toFixed(1)}`;
        seriesSvg += `<polygon points="${areaPts}" fill="${s.color}" opacity="0.08"/>`;
      }
      seriesSvg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      s.values.forEach((v, i) => {
        seriesSvg += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="2.6" fill="${s.color}"/>`;
      });
    });

    return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;display:block">
      ${gridsSvg}${seriesSvg}${labelSvg}
    </svg>`;
  }

  /* ── Radar chart (3-axis pillar comparison across N series) ── */
  function radar({ axes, series, size = 260 }) {
    const cx = size / 2, cy = size / 2, r = size * 0.36;
    const n = axes.length;
    const angleFor = i => (Math.PI * 2 * i) / n - Math.PI / 2;
    const pointFor = (i, val) => {
      const rr = (val / 100) * r;
      return [cx + rr * Math.cos(angleFor(i)), cy + rr * Math.sin(angleFor(i))];
    };

    let rings = "";
    [0.25, 0.5, 0.75, 1].forEach(f => {
      const pts = axes.map((_, i) => {
        const [x, y] = pointFor(i, f * 100);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      rings += `<polygon points="${pts}" fill="none" stroke="#e5e5e5" stroke-width="1"/>`;
    });

    let spokes = "", labels = "";
    axes.forEach((axis, i) => {
      const [x, y] = pointFor(i, 100);
      spokes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e5e5" stroke-width="1"/>`;
      const [lx, ly] = pointFor(i, 118);
      labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-family="DM Mono, monospace" fill="#4a4a4a" text-transform="uppercase">${axis}</text>`;
    });

    let seriesSvg = "";
    series.forEach(s => {
      const pts = s.values.map((v, i) => {
        const [x, y] = pointFor(i, v);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      seriesSvg += `<polygon points="${pts}" fill="${s.color}" fill-opacity="${s.fillOpacity !== undefined ? s.fillOpacity : 0.10}" stroke="${s.color}" stroke-width="2"/>`;
      s.values.forEach((v, i) => {
        const [x, y] = pointFor(i, v);
        seriesSvg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.8" fill="${s.color}"/>`;
      });
    });

    return `<svg viewBox="0 0 ${size} ${size + 20}" style="width:100%;height:auto;display:block">
      ${rings}${spokes}${seriesSvg}${labels}
    </svg>`;
  }

  /* ── Heat map grid (behaviors × assessments, or coaches × pillars) ── */
  function heatmap({ rowLabels, colLabels, matrix, min = 1, max = 5 }) {
    const cols = colLabels.length;
    let html = `<div class="heatmap" style="grid-template-columns:130px repeat(${cols},1fr)">`;
    html += `<div></div>`;
    colLabels.forEach(c => { html += `<div class="heatmap-col-label">${c}</div>`; });
    rowLabels.forEach((row, ri) => {
      html += `<div class="heatmap-row-label">${row}</div>`;
      matrix[ri].forEach(val => {
        const frac = (val - min) / (max - min || 1);
        const idx = Math.min(MONO_SCALE.length - 1, Math.floor(frac * MONO_SCALE.length));
        const bg = MONO_SCALE[idx];
        const textColor = idx >= 4 ? "#fff" : "#1a1a1a";
        html += `<div class="heatmap-cell" style="background:${bg};color:${textColor}">${val}</div>`;
      });
    });
    html += `</div>`;
    return html;
  }

  /* ── Funnel diagram ─────────────────────────────────────── */
  function funnel({ stages, colors }) {
    const maxVal = Math.max(...stages.map(s => s.value), 1);
    const defaultColors = ["#1a1a1a", "#333333", "#4a4a4a", "#616161", "#777777", "#8f8f8f"];
    let html = `<div class="funnel-wrap">`;
    stages.forEach((stage, i) => {
      const pct = Math.max(6, Math.round((stage.value / maxVal) * 100));
      const color = (colors && colors[i]) || defaultColors[i % defaultColors.length];
      html += `
        <div class="funnel-row">
          <div class="funnel-label-col">
            <div class="funnel-stage-name">${stage.label}</div>
            <div class="funnel-stage-val">${stage.value.toLocaleString()}</div>
          </div>
          <div class="funnel-bar-track">
            <div class="funnel-bar" style="width:${pct}%;background:${color}">${pct >= 18 ? stage.value.toLocaleString() : ""}</div>
          </div>
          <div class="funnel-conv-col">${stage.conversion !== undefined ? `<span class="funnel-conv-pct">${stage.conversion}% conv.</span>` : ""}</div>
        </div>`;
      if (i < stages.length - 1) html += `<div class="funnel-conv-arrow">↓</div>`;
    });
    html += `</div>`;
    return html;
  }

  /* ── Sparkline (small inline trend) ─────────────────────── */
  function sparkline({ values, width = 90, height = 28, color = "#1a1a1a" }) {
    if (!values.length) return "";
    const min = Math.min(...values), max = Math.max(...values);
    const range = (max - min) || 1;
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(" ");
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  window.CHARTS = { ring, lineChart, radar, heatmap, funnel, sparkline, scoreColor, MONO_SCALE };
})();
