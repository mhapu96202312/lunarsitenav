/* LunarSiteNav UI. Code written with SI assistance (Claude, Anthropic) and reviewed by the team. */
(function () {
  "use strict";
  const D = window.LN, S = D.sites;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const N = S[0].sun_el.length;
  const T0 = Date.parse(S[0].t0.replace(/^(\d{4})-(\w{3})-(\d{2})/, "$2 $3 $1") + " UTC");
  const P = new URLSearchParams(location.search);
  const st = { i: +(P.get("i") || 0), focus: P.get("site") || "shackleton", cmp: new Set((P.get("cmp") || "shackleton,malapert,im1").split(",")) };

  // per-site visibility arrays
  S.forEach(s => {
    const hz = a => s.horizon[Math.round(a) % 360];
    s.sun = s.sun_el.map((e, k) => e > hz(s.sun_az[k]));
    s.earth = s.earth_el.map((e, k) => e > hz(s.earth_az[k]));
    const run = arr => { let best = 0, cur = 0; arr.forEach(v => { cur = v ? cur + 1 : 0; best = Math.max(best, cur); }); return best; };
    s.stats = { sun: avg(s.sun), earth: avg(s.earth), both: avg(s.sun.map((v, k) => v && s.earth[k])),
      longestDark: run(s.sun.map(v => !v)), longestNoLink: run(s.earth.map(v => !v)) };
  });
  function avg(a) { return a.reduce((x, v) => x + (v ? 1 : 0), 0) / a.length; }
  const fmtT = i => new Date(T0 + i * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const fmtH = h => h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h} h`;
  function until(arr, i, val) { for (let k = i; k < N; k++) if (arr[k] === val) return k - i; return null; }

  // ---------- header / time ----------
  $("#t").max = N - 1;
  $("#t").addEventListener("input", e => { st.i = +e.target.value; render(); });
  document.querySelector(".slip").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; st.i = Math.max(0, Math.min(N - 1, st.i + 24 * +b.dataset.d)); render(); });

  // ---------- sites ----------
  function renderSites() {
    $("#sites").innerHTML = S.map(s => { const now = s.sun[st.i], e = s.earth[st.i];
      return `<div class="site ${s.key === st.focus ? "on" : ""}" data-k="${s.key}">
        <div class="sh"><b>${esc(s.name)}</b><label><input type="checkbox" data-c="${s.key}" ${st.cmp.has(s.key) ? "checked" : ""}> compare</label></div>
        <div class="muted small">${esc(s.program)} | ${Math.abs(s.lat).toFixed(2)}&deg;${s.lat < 0 ? "S" : "N"}, ${((s.lon + 360) % 360).toFixed(2)}&deg;E${s.approx ? " (approx.)" : ""}</div>
        <div class="chips"><span class="${now ? "y" : "n"}">${now ? "Sunlit" : "Shadow"}</span><span class="${e ? "b" : "n"}">${e ? "Earth in view" : "No Earth link"}</span></div></div>`; }).join("");
  }
  $("#sites").addEventListener("click", e => {
    const c = e.target.closest("input[data-c]");
    if (c) { if (c.checked) { if (st.cmp.size >= 3) { c.checked = false; return; } st.cmp.add(c.dataset.c); } else st.cmp.delete(c.dataset.c); render(); return; }
    const d = e.target.closest(".site"); if (d) { st.focus = d.dataset.k; render(); }
  });

  // ---------- panorama ----------
  function renderPan() {
    const s = S.find(x => x.key === st.focus), i = st.i;
    const W = 1200, H = 380, L = 50, R = 20, T = 20, B = 40;
    const maxEl = Math.max(4, ...s.sun_el.slice(i, i + 336), ...s.earth_el.slice(i, i + 336), ...s.horizon) + 1;
    const minEl = Math.min(-2, ...s.horizon) - 0.5;
    // stretch: sqrt-like scale above 0 so low angles get room
    const f = e => (e >= 0 ? Math.sqrt(e / maxEl) : -Math.sqrt(-e / maxEl) * 0.6);
    const X = a => L + ((a % 360) + 360) % 360 / 360 * (W - L - R);
    const Y = e => { e = Math.max(minEl, Math.min(maxEl, e)); return T + (1 - (f(e) - f(minEl)) / (f(maxEl) - f(minEl))) * (H - T - B); };
    let g = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070f"/><stop offset="1" stop-color="#121a33"/></linearGradient></defs>
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="url(#sky)"/>`;
    [-2, -1, 0, 1, 2, 5, 10, 20, 45, 90].filter(e => e <= maxEl && e >= minEl).forEach(e => { g += `<line x1="${L}" x2="${W - R}" y1="${Y(e)}" y2="${Y(e)}" stroke="#1f2a48" ${e === 0 ? 'stroke-dasharray="6 5" stroke="#3a4a78"' : ""}/><text x="${L - 6}" y="${Y(e) + 4}" fill="#8a96b8" font-size="12" text-anchor="end">${e}&deg;</text>`; });
    [["N", 0], ["E", 90], ["S", 180], ["W", 270], ["N", 359.9]].forEach(([n, a]) => { g += `<text x="${X(a)}" y="${H - 16}" fill="#c8d1ea" font-size="14" font-weight="700" text-anchor="middle">${n}</text>`; });
    const path = (az, el, k0, k1, col) => { let d = "", prev = null; for (let k = k0; k < k1; k += 3) { const x = X(az[k]), y = Y(el[k]); d += (prev !== null && Math.abs(x - prev) < 300 ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); prev = x; } return `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" stroke-dasharray="2 5" opacity=".8"/>`; };
    g += path(s.sun_az, s.sun_el, i, Math.min(N, i + 336), "#ffd25a") + path(s.earth_az, s.earth_el, i, Math.min(N, i + 336), "#5aa9ff");
    let hp = `M${L} ${H - B}`; for (let a = 0; a <= 360; a++) hp += ` L${X(a === 360 ? 359.99 : a)} ${Y(s.horizon[a % 360])}`; hp += ` L${W - R} ${H - B} Z`;
    g += `<path d="${hp}" fill="#4b5470" stroke="#9aa5c4" stroke-width="1.2"/>`;
    const sun = [s.sun_az[i], s.sun_el[i]], ea = [s.earth_az[i], s.earth_el[i]];
    g += `<circle cx="${X(sun[0])}" cy="${Y(sun[1])}" r="13" fill="#ffd25a" stroke="#fff3c4" stroke-width="2" opacity="${s.sun[i] ? 1 : .45}"/><text x="${X(sun[0])}" y="${Y(sun[1]) - 20}" fill="#ffd25a" font-size="14" font-weight="700" text-anchor="middle">Sun ${sun[1].toFixed(1)}&deg;</text>`;
    g += `<circle cx="${X(ea[0])}" cy="${Y(ea[1])}" r="11" fill="#5aa9ff" stroke="#d6e9ff" stroke-width="2" opacity="${s.earth[i] ? 1 : .45}"/><text x="${X(ea[0])}" y="${Y(ea[1]) - 18}" fill="#8cc4ff" font-size="14" font-weight="700" text-anchor="middle">Earth ${ea[1].toFixed(1)}&deg;</text>`;
    $("#pan").innerHTML = g;
    $("#panTitle").textContent = `${s.name} at ${fmtT(i)} UTC`;
    const ns = s.sun[i] ? until(s.sun, i, false) : until(s.sun, i, true), ne = s.earth[i] ? until(s.earth, i, false) : until(s.earth, i, true);
    $("#status").innerHTML = `<span class="${s.sun[i] ? "y" : "n"}">${s.sun[i] ? "Sunlit" : "In shadow"}: ${ns == null ? "no change in 92 days" : (s.sun[i] ? "sunset in " : "sunrise in ") + fmtH(ns)}</span>
      <span class="${s.earth[i] ? "b" : "n"}">${s.earth[i] ? "Earth in view" : "Earth hidden"}: ${ne == null ? "no change in 92 days" : (s.earth[i] ? "Earthset in " : "Earthrise in ") + fmtH(ne)}</span>`;
  }

  // ---------- strips ----------
  function renderStrips() {
    const sel = S.filter(s => st.cmp.has(s.key) || s.key === st.focus);
    const W = 1100, Hh = 34;
    $("#strips").innerHTML = sel.map(s => {
      let r = ""; const step = 6; // 6 h blocks
      for (let k = 0; k < N; k += step) {
        let sun = 0, ea = 0; for (let j = k; j < Math.min(N, k + step); j++) { sun += s.sun[j]; ea += s.earth[j]; }
        const su = sun / step > .5, eu = ea / step > .5;
        r += `<rect x="${(k / N * W).toFixed(2)}" y="0" width="${(step / N * W + .6).toFixed(2)}" height="${Hh}" fill="${su && eu ? "#3ccf8e" : su ? "#ffd25a" : eu ? "#4c8dff" : "#1a2238"}"/>`;
      }
      const days = [0, 15, 30, 45, 60, 75, 90].map(d => `<text x="${d * 24 / N * W}" y="${Hh + 14}" fill="#8a96b8" font-size="11">${new Date(T0 + d * 864e5).toISOString().slice(5, 10)}</text>`).join("");
      return `<div class="strip"><div class="sn">${esc(s.name)}</div><svg viewBox="0 0 ${W} ${Hh + 18}">${r}<line x1="${st.i / N * W}" x2="${st.i / N * W}" y1="-2" y2="${Hh + 2}" stroke="#fff" stroke-width="2.5"/>${days}</svg></div>`;
    }).join("");
  }

  // ---------- table ----------
  function renderTable() {
    const sel = S.filter(s => st.cmp.has(s.key) || s.key === st.focus);
    const row = (lbl, f) => `<tr><th>${lbl}</th>${sel.map(s => `<td>${f(s)}</td>`).join("")}</tr>`;
    const pct = v => `${(v * 100).toFixed(0)}%`;
    const bestStart = s => { let best = 0, bi = null, cur = 0, ci = 0; for (let k = st.i; k < N; k++) { if (s.sun[k] && s.earth[k]) { if (!cur) ci = k; cur++; if (cur > best) { best = cur; bi = ci; } } else cur = 0; } return bi == null ? "none in window" : `${fmtT(bi).slice(0, 10)} (${fmtH(best)})`; };
    $("#table").innerHTML = `<table><tr><th></th>${sel.map(s => `<th>${esc(s.name)}</th>`).join("")}</tr>
      ${row("Sunlit (92 days)", s => pct(s.stats.sun))}${row("Earth in view (direct-to-Earth)", s => pct(s.stats.earth))}${row("Both at once", s => pct(s.stats.both))}
      ${row("Longest darkness", s => fmtH(s.stats.longestDark))}${row("Longest Earth blackout", s => fmtH(s.stats.longestNoLink))}
      ${row("Sun elevation now", s => `${s.sun_el[st.i].toFixed(1)}&deg; (terrain ${s.horizon[Math.round(s.sun_az[st.i]) % 360].toFixed(1)}&deg;)`)}
      ${row("Earth elevation now", s => `${s.earth_el[st.i].toFixed(1)}&deg;`)}
      ${row("Longest Sun+Earth window from chosen date", bestStart)}
      ${row("Site elevation (LOLA)", s => `${s.elev_m.toLocaleString()} m`)}</table>
      <p class="muted small">Percentages are for ${esc(D.meta.period[0])} to ${esc(D.meta.period[1])}, hourly. "Sunlit" means the Sun's centre is above the terrain horizon; panels on a mast see slightly more.</p>`;
  }

  function render() {
    $("#t").value = st.i; $("#tLbl").textContent = fmtT(st.i) + " UTC";
    renderSites(); renderPan(); renderStrips(); renderTable();
    history.replaceState(null, "", "?" + new URLSearchParams({ site: st.focus, i: st.i, cmp: [...st.cmp].join(",") }));
  }
  render();
})();
