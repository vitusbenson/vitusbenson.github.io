/* Fictional EAP · Nepal flash floods. Renders the page from data/*.json and content.js. */
(() => {
  "use strict";
  const C = window.EAP;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = (v, d = 0) => (v == null || Number.isNaN(v)) ? "–" : Number(v).toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
  const pct = (v) => v == null || !isFinite(v) ? "–" : `${Math.round(v * 100)}%`;
  const chfK = (v) => v >= 1e6 ? `CHF ${fmt(v / 1e6, 2)} M` : `CHF ${fmt(Math.round(v / 1000))}k`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem("eap-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("eap-" + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // ------------------------------------------------------------------ state (per-viewer convenience only)
  const DEFAULTS = { src: "gefs", lead: 2, k: 2, p: 0.8, m: 1, level: "loss", region: "hill",
    corr: 7, hh: 6000, cash: 8000, delay: 3, react: 10, cap: 950000, acts: 2, years: 5,
    dref: "lake_rain", evac: "fc_obs", cof: true, decisions: {}, dial: null };
  const S = Object.assign({}, DEFAULTS, store.get("settings", {}));
  const save = () => store.set("settings", S);
  let D = {};
  const FX = 185, N_COMMUNITIES = 40, LAKE_RATE = 2 / 16, HH_SIZE = 4.4;

  // ------------------------------------------------------------------ tooltip and popover
  const tip = $("#tip"), pop = $("#pop");
  function showTip(ev, html) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  function showPop(el, title, body) {
    pop.innerHTML = `<b>${esc(title)}</b>${body}`; pop.hidden = false;
    const r = el.getBoundingClientRect(), p = pop.getBoundingClientRect();
    let x = Math.min(innerWidth - p.width - 10, Math.max(10, r.left + r.width / 2 - p.width / 2));
    let y = r.bottom + 8; if (y + p.height > innerHeight - 10) y = r.top - p.height - 8;
    pop.style.left = x + "px"; pop.style.top = y + "px";
  }
  const hidePop = () => { pop.hidden = true; };
  document.addEventListener("click", (e) => {
    const x = e.target.closest(".x"); const g = e.target.closest(".g");
    if (x) { const c = C.explain[x.dataset.x]; if (c) showPop(x, c[0], `<span>${esc(c[1])}</span>`); e.stopPropagation(); return; }
    if (g) { showPop(g, g.dataset.g, `<span>${esc(C.glossary[g.dataset.g])}</span>`); e.stopPropagation(); return; }
    if (!e.target.closest(".pop")) hidePop();
  });
  document.addEventListener("mouseover", (e) => { const g = e.target.closest(".g"); if (g && matchMedia("(hover: hover)").matches) showPop(g, g.dataset.g, `<span>${esc(C.glossary[g.dataset.g])}</span>`); });
  document.addEventListener("mouseout", (e) => { if (e.target.closest(".g")) hidePop(); });
  addEventListener("scroll", hidePop, { passive: true });

  // ------------------------------------------------------------------ theme
  const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  $("#btn-theme").addEventListener("click", () => {
    const t = isDark() ? "light" : "dark"; document.documentElement.dataset.theme = t;
    try { localStorage.setItem("eap-theme", t); } catch (e) { /* ignore */ }
    rerender();
  });

  // ------------------------------------------------------------------ placeholders {{key}} and data-k
  let K = {};
  const tpl = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => K[k] ?? `{{${k}}}`);
  function fill() { $$("[data-k]").forEach((el) => { const v = K[el.dataset.k]; if (v != null) el.innerHTML = v; }); }

  // ------------------------------------------------------------------ maps
  const TILE_S2 = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
  const TILE_DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  function baseStyle(kind) {
    const dark = kind === "sat" || isDark();
    return {
      version: 8, glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        s2: { type: "raster", tiles: [TILE_S2], tileSize: 256, maxzoom: 15, attribution: "Sentinel-2 cloudless 2016 © EOX (CC BY 4.0)" },
        dem: { type: "raster-dem", tiles: [TILE_DEM], tileSize: 256, encoding: "terrarium", maxzoom: 13, attribution: "Terrain Tiles (Mapzen/AWS)" },
        demt: { type: "raster-dem", tiles: [TILE_DEM], tileSize: 256, encoding: "terrarium", maxzoom: 13 },
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": kind === "sat" ? "#0e1113" : css("--surface-2") } },
        ...(kind === "sat" ? [{ id: "s2", type: "raster", source: "s2", paint: { "raster-saturation": -0.2, "raster-brightness-max": 0.85, "raster-contrast": 0.05 } }] : []),
        { id: "hs", type: "hillshade", source: "dem", paint: {
          "hillshade-shadow-color": dark ? "#000" : "#5a6066", "hillshade-highlight-color": dark ? "#3a4045" : "#ffffff",
          "hillshade-accent-color": dark ? "#111" : "#6c7277", "hillshade-exaggeration": kind === "sat" ? 0.25 : 0.55 } },
      ],
    };
  }
  function mapStub(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add("map-off"); el.innerHTML = "<p>This map needs WebGL, which this browser could not start. Every number on the page works without it.</p>"; }
    const noop = () => stub;
    const stub = { on: noop, once: noop, off: noop, addControl: noop, addSource: noop, addLayer: noop, setTerrain: noop, fitBounds: noop, flyTo: noop, easeTo: noop, resize: noop, loaded: () => false, getSource: () => null };
    return stub;
  }
  function newMap(id, opts = {}) {
    try {
      const m = new maplibregl.Map({ container: id, style: baseStyle(opts.kind || "relief"), center: opts.center || [85.3, 28.0], zoom: opts.zoom || 7,
        pitch: opts.pitch || 0, bearing: opts.bearing || 0, attributionControl: { compact: true }, cooperativeGestures: true, maxPitch: 75 });
      m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
      return m;
    } catch (e) { console.warn("map unavailable", id, e); return mapStub(id); }
  }
  const lineFeature = (coords, props = {}) => ({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } });
  const pointFC = (arr, f) => ({ type: "FeatureCollection", features: arr.map((a) => ({ type: "Feature", properties: f(a), geometry: { type: "Point", coordinates: [a.x ?? a.lon, a.y ?? a.lat] } })) });
  const MAPS = [];

  // ------------------------------------------------------------------ svg helper
  function svgBox(sel, h) {
    const svg = d3.select(sel); if (svg.empty()) return [null, 0];
    const w = svg.node().getBoundingClientRect().width || svg.node().parentNode.getBoundingClientRect().width || 600;
    svg.attr("viewBox", `0 0 ${w} ${h}`).attr("height", h).selectAll("*").remove();
    return [svg, w];
  }
  const table = (sel, head, rows) => { const el = $(sel); if (!el) return; el.innerHTML = `<thead><tr>${head.map((h) => `<th${h.startsWith("#") ? ' class="num"' : ""}>${h.replace(/^#/, "")}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>`; };
  const check = (v) => v ? ` <span class="check-flag">check</span>` : "";
  const host = (u) => { const x = [].concat(u || [])[0]; if (!x) return ""; try { return `<a href="${esc(x)}" target="_blank" rel="noopener">${esc(new URL(x).hostname.replace(/^www\./, ""))}</a>`; } catch (e) { return ""; } };

  // ------------------------------------------------------------------ derived quantities
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  function arrivalFn(cor) {
    const obs = (cor.observed_2026 || []).map((o) => ({ ch: o.ch, t: toMin(o.time), place: o.place })).sort((a, b) => a.ch - b.ch);
    return { obs,
      at(ch) { if (!obs.length) return NaN; if (ch <= obs[0].ch) return obs[0].t;
        for (let i = 1; i < obs.length; i++) if (ch <= obs[i].ch) { const a = obs[i - 1], b = obs[i]; return a.t + (b.t - a.t) * (ch - a.ch) / (b.ch - a.ch); }
        const a = obs[obs.length - 2], b = obs[obs.length - 1]; return b.t + (b.t - a.t) * (ch - b.ch) / (b.ch - a.ch); },
      chAt(t) { if (t <= obs[0].t) return obs[0].ch;
        for (let i = 1; i < obs.length; i++) if (t <= obs[i].t) { const a = obs[i - 1], b = obs[i]; return a.ch + (b.ch - a.ch) * (t - a.t) / (b.t - a.t); }
        return obs[obs.length - 1].ch; } };
  }
  const trishuli = () => D.corridors.find((c) => c.id === "trishuli");
  function rates() {
    const rb = D.robust;
    const r2 = rb ? rb.insample.alert_strict.acts_per_year : 1.7;
    const r3a = rb ? rb.second_signal.evacuate_major.acts_per_year : 1.2;
    const rain = rb ? rb.insample.cash_strict.acts_per_year : 0.1;
    const dref = S.dref === "lake" ? LAKE_RATE : S.dref === "rain" ? rain : LAKE_RATE + rain;
    return { r2, r3a, rain, dref };
  }
  function budget() {
    const rt = rates();
    const L = C.budget.map((b) => {
      let q = 1, unit = b.unit;
      if (b.driver === "community") q = N_COMMUNITIES;
      if (b.driver === "corridor") q = S.corr;
      if (b.driver === "hh") q = S.hh;
      if (b.driver === "hh_half") q = S.hh / 2;
      if (b.driver === "cash") { unit = S.cash / FX * 1.03; q = S.hh; }
      if (b.driver === "rung2") q = rt.r2 * S.years;
      if (b.driver === "rung3a") q = rt.r3a * S.years;
      return { ...b, q, unitShown: unit, total: q * (unit || 0) };
    });
    const by = (p) => d3.sum(L.filter((l) => l.phase === p), (l) => l.total);
    const R = by("readiness"), P = by("prepos"), E = by("early"), I = by("ifrc"), CF = by("cofin");
    const T = R + P + E + I;
    return { L, R, P, E, I, CF, T, NS: T - I, people: Math.round(S.hh * HH_SIZE) };
  }
  function warnAt(placeRe) {
    const cor = trishuli(); const A = arrivalFn(cor);
    const src = A.obs[0]; const o = A.obs.find((x) => placeRe.test(x.place));
    return o ? o.t - (src.t + S.delay) : null;
  }
  const kPlain = (k) => k >= 1 ? `the heaviest ${k === 1 ? "day" : k + " days"} of a typical monsoon` : `rain seen about once in ${Math.round(1 / k)} monsoons`;
  const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
  function computeKeys() {
    const rb = D.robust, b = budget(), rt = rates();
    const al = rb?.insample.alert_strict, ca = rb?.insample.cash_strict;
    const st = al?.setting, cs = ca?.setting;
    const runs = (p) => p >= 1 ? "all 5" : `at least ${Math.round(p * 5)} of 5`;
    const thrA = st && D.numbers.thresholds_mm?.[`gefs_${st.lead}`]?.[String(st.k)];
    const thrC = cs && D.numbers.thresholds_mm?.[`gefs_${cs.lead}`]?.[String(cs.k)];
    const bands = D.numbers.terrain?.bands || [];
    const tot = d3.sum(bands, (x) => x.dead_missing), hill = d3.sum(bands.slice(1), (x) => x.dead_missing);
    K = {
      ev_n: rb?.n_events_strict, prep_caught: al?.caught, dref_caught: ca?.caught, hh: fmt(S.hh),
      budget_dref: chfK(b.T), budget_cofin: chfK(b.CF), hill_share: pct(hill / tot),
      dial_headline: al ? `${al.caught} of ${al.events}` : "–",
      step2_when: st ? `${cap(runs(st.p))} forecast runs show ${kPlain(st.k)} for a hill district, two days ahead${thrA ? ` (in a typical district about ${fmt(thrA)} mm in a day)` : ""}.` : "",
      step2_often: `About ${fmt(rt.r2, 1)} times a year, across all districts`,
      step3_often: `About ${fmt(rt.dref * S.years, 1)} times in five years`,
      trig_prepare: st ? `${runs(st.p)} GEFS ensemble members (operationally ECMWF ENS, ≥ ${Math.round(st.p * 100)}% of 51) issued at 00 UTC predict, for day ${st.lead}, district rain (95th percentile of grid cells) above the level that district exceeds on ${st.k} day(s) in a typical monsoon${thrA ? `, a median of ${fmt(thrA)} mm/day across hill districts` : ""}${st.m > 1 ? `, in at least ${st.m} districts at once` : ""}. Backtest 2011–2019: ${fmt(rt.r2, 1)} activations a year.` : "",
      trig_cash: cs ? `${runs(cs.p)} ensemble members predict, for day ${cs.lead}, district rain above the level exceeded about once in ${Math.round(1 / cs.k)} monsoons${thrC ? ` (median ${fmt(thrC)} mm/day)` : ""}, in at least ${cs.m} hill districts at once. Backtest 2011–2019: ${fmt(rt.rain, 2)} activations a year.` : "",
    };
  }

  // ------------------------------------------------------------------ navigation, progress, numbers bar
  function initNav() {
    const secs = $$("main > section[data-n]");
    $("#ticks").innerHTML = secs.filter((s) => s.dataset.n !== "·").map((s) => `<a href="#${s.id}" data-sec="${s.id}"><b>${s.dataset.n}</b><span>${s.dataset.title}</span></a>`).join("");
    const links = $$("#ticks a");
    const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.dataset.sec === e.target.id)); }), { rootMargin: "-45% 0px -50% 0px" });
    secs.forEach((s) => io.observe(s));
    const nav = $("#topnav"), bar = $("#progress-bar"), nums = $("#numbers");
    const darkSecs = $$(".prologue, .chapter.dark");
    const onScroll = () => {
      const h = document.documentElement; bar.style.width = `${100 * h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)}%`;
      const y = 30; nav.classList.toggle("on-dark", darkSecs.some((s) => { const r = s.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }));
      nums.classList.toggle("show", $("#summary").getBoundingClientRect().top < 120);
    };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }
  let lastNums = {};
  function renderNumbers() {
    const b = budget(), rt = rates(); const w = warnAt(/Syabrubesi/);
    const items = [
      ["people", fmt(b.people), "people reached with cash"],
      ["dref", chfK(b.T), "from the emergency fund"],
      ["cofin", chfK(b.CF), "co-financed"],
      ["acts", fmt(rt.dref * S.years, 1), `fund activations in ${S.years} yrs`],
      ["warn", w == null ? "–" : `${fmt(w)} min`, "warning at Syabrubesi"],
    ];
    $("#numbers").innerHTML = items.map(([k, v, l]) => `<div><b data-num="${k}" class="${lastNums[k] && lastNums[k] !== v ? "flash" : ""}">${v}</b><span>${l}</span></div>`).join("");
    items.forEach(([k, v]) => { lastNums[k] = v; });
    setTimeout(() => $$("#numbers b.flash").forEach((x) => x.classList.remove("flash")), 700);
  }
  function refresh() { computeKeys(); fill(); renderNumbers(); renderSummary(); renderSteps(); }

  // ------------------------------------------------------------------ drawers
  const drawer = $("#drawer"), scrim = $("#scrim");
  let drawerNode = null, drawerHome = null;
  function openDrawer(id) {
    const node = document.getElementById(id); if (!node) return;
    closeDrawer(true);
    drawerHome = { parent: node.parentNode, next: node.nextSibling }; drawerNode = node;
    $("#drawer-title").textContent = node.querySelector("h3")?.textContent || "Detail";
    $("#drawer-body").appendChild(node);
    drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); scrim.hidden = false;
    setTimeout(() => MAPS.forEach((m) => m.resize && m.resize()), 380);
    $("#drawer-close").focus();
  }
  function closeDrawer(silent) {
    if (drawerNode && drawerHome) drawerHome.parent.insertBefore(drawerNode, drawerHome.next);
    drawerNode = null;
    if (!silent) { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); $("#review-drawer").classList.remove("open"); scrim.hidden = true; }
  }
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) openDrawer(b.dataset.open); });
  $("#drawer-close").addEventListener("click", () => closeDrawer());
  scrim.addEventListener("click", () => closeDrawer());
  addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); hidePop(); } });

  // ------------------------------------------------------------------ prologue
  function initPrologue() {
    const el = $("#count38"); if (reduced) return;
    const t0 = performance.now();
    const tick = (t) => { const p = Math.min(1, (t - t0) / 1800); el.textContent = Math.round(38 * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    $$("[data-credit]").forEach((el) => { const c = D.images?.find((x) => x.slug === el.dataset.credit); if (c) el.innerHTML = `${el.tagName === "FIGCAPTION" ? esc(c.caption) + " " : ""}Photo: ${esc(c.author)}, <a href="${esc(c.license_url || c.source)}" target="_blank" rel="noopener">${esc(c.license)}</a>, via <a href="${esc(c.source)}" target="_blank" rel="noopener">source</a>.`; });
  }

  // ------------------------------------------------------------------ summary and steps
  const STEP_COL = { good: "--good", warn: "--warn", serious: "--serious", crit: "--crit" };
  function renderSummary() {
    $("#story").innerHTML = C.story.map(([h, t]) => `<li><b>${h}</b><span>${tpl(t)}</span></li>`).join("");
    $("#glance-steps").innerHTML = C.steps.map((s) => `<div class="gstep" style="--c:var(${STEP_COL[s.color]})"><div class="gn"><b>${s.n} · ${s.name}</b><span>${s.clock}</span></div>
      <dl><dt>When</dt><dd>${tpl(s.when)}</dd><dt>Decides</dt><dd>${s.decides}</dd><dt>Pays</dt><dd>${s.pays}</dd><dt>How often</dt><dd>${tpl(s.often)}</dd></dl></div>`).join("");
    $("#cannot").innerHTML = C.cannot.map((t) => `<li>${t}</li>`).join("");
  }
  function renderSteps() {
    $("#steps").innerHTML = C.steps.map((s) => `<article class="step" style="--c:var(${STEP_COL[s.color]})">
      <div class="sn"><b>${s.n}</b><span>${s.clock}</span></div>
      <div><h3>${s.name}</h3><p><b>When:</b> ${tpl(s.when)}</p><p><b>What people see:</b> ${s.people}</p></div>
      <dl><dt>Who decides</dt><dd>${s.decides}</dd><dt>Who pays</dt><dd>${s.pays}</dd><dt>How often</dt><dd>${tpl(s.often)}</dd></dl></article>`).join("");
    $("#rules").innerHTML = C.rules.map(([h, t]) => `<div class="rule"><b>${h}</b><span>${t}</span></div>`).join("");
  }
  function chartWhen() {
    const [svg, w] = svgBox("#chart-when", 250); if (!svg) return;
    const m = { l: 120, r: 30, t: 10, b: 34 };
    const x = d3.scaleSymlog().constant(1).domain([72, 0.05]).range([m.l, w - m.r]);
    const lanes = [["rc", "Red Cross"], ["gov", "Government"], ["op", "Operators, schools"]];
    const y = d3.scaleBand().domain(lanes.map((l) => l[0])).range([m.t, 250 - m.b]).padding(0.28);
    svg.append("g").selectAll("rect").data(lanes).join("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("y", (d) => y(d[0])).attr("height", y.bandwidth()).attr("rx", 6).attr("fill", css("--surface-2"));
    svg.append("g").selectAll("text").data(lanes).join("text").attr("class", "lbl").attr("x", m.l - 10).attr("y", (d) => y(d[0]) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text((d) => d[1]);
    const ticks = [[72, "3 days"], [48, "2 days"], [24, "1 day"], [12, "12 h"], [3, "3 h"], [1, "1 h"], [0.15, "minutes"]];
    svg.append("g").selectAll("text").data(ticks).join("text").attr("x", (d) => x(d[0])).attr("y", 250 - 10).attr("text-anchor", "middle").text((d) => d[1]);
    svg.append("g").selectAll("line").data(ticks).join("line").attr("x1", (d) => x(d[0])).attr("x2", (d) => x(d[0])).attr("y1", m.t).attr("y2", 250 - m.b).attr("stroke", css("--line"));
    const col = { rc: css("--own-rc"), gov: css("--own-gov"), op: css("--own-op") };
    const items = C.timeline.map((d) => ({ ...d, cx: x(-d.t), cy: y(d.owner) + y.bandwidth() / 2 }));
    svg.append("g").selectAll("circle").data(items).join("circle").attr("cx", (d) => d.cx).attr("cy", (d) => d.cy).attr("r", 7).attr("fill", (d) => col[d.owner]).attr("stroke", css("--surface")).attr("stroke-width", 2)
      .on("mousemove", (e, d) => showTip(e, `<b>${esc(d.who)}</b><br>${esc(d.what)}<br><span class="muted">${d.t > -1 ? "minutes" : Math.round(-d.t) + " h"} before impact</span>`)).on("mouseleave", hideTip);
    if (w > 760) {
      const placed = [];
      items.forEach((d) => {
        const t = d.what.length > 30 ? d.what.slice(0, 28) + "…" : d.what; const tw = t.length * 5.6;
        const x0 = Math.min(Math.max(d.cx - tw / 2, m.l + 2), w - m.r - tw);
        const yy = [d.cy - 12, d.cy + 20].find((v) => !placed.some((q) => x0 < q.x1 + 8 && x0 + tw > q.x0 - 8 && Math.abs(v - q.y) < 11));
        if (yy == null) return; placed.push({ x0, x1: x0 + tw, y: yy });
        svg.append("text").attr("x", x0).attr("y", yy).attr("fill", css("--ink-2")).style("font-size", "10.5px").text(t);
      });
    }
  }

  // ------------------------------------------------------------------ chapter 1: the day
  const T0 = 8 * 60 + 30;
  let evMap, evScn = "actual", evTimer = null;
  function initEvent() {
    const cor = trishuli(); const A = arrivalFn(cor);
    const line = cor.line, ch = cor.profile.ch;
    const ptAt = (c) => { const i = Math.max(0, ch.findIndex((x) => x >= c)); const p = line[i] || line[line.length - 1]; return { x: p[0], y: p[1] }; };
    evMap = newMap("map-event", { kind: "sat", center: [85.2, 28.05], zoom: 8.6, pitch: 55, bearing: -20 }); MAPS.push(evMap);
    evMap.on("load", () => {
      evMap.setTerrain({ source: "demt", exaggeration: 1.35 });
      const bb = line.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(line[0], line[0]));
      evMap.fitBounds(bb, { padding: { top: 60, bottom: 60, left: 40, right: Math.min(380, innerWidth * 0.3) }, pitch: 52, bearing: -15, duration: 0 });
      evMap.addSource("river", { type: "geojson", data: lineFeature(line) });
      evMap.addSource("front", { type: "geojson", data: lineFeature(line.slice(0, 2)) });
      evMap.addSource("obs", { type: "geojson", data: pointFC(A.obs.map((o) => ({ ...o, ...ptAt(o.ch) })), (o) => ({ name: o.place.replace(/ gauge| \(peak\)/g, ""), t: hm(o.t) })) });
      evMap.addLayer({ id: "river", type: "line", source: "river", paint: { "line-color": "#9fc6d8", "line-width": 2, "line-opacity": 0.8 } });
      evMap.addLayer({ id: "front-glow", type: "line", source: "front", paint: { "line-color": "#ff4d5e", "line-width": 14, "line-opacity": 0.25, "line-blur": 6 } });
      evMap.addLayer({ id: "front", type: "line", source: "front", paint: { "line-color": "#ff4d5e", "line-width": 5 } });
      evMap.addLayer({ id: "obs", type: "circle", source: "obs", paint: { "circle-radius": 5, "circle-color": "#0e1113", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      evMap.addLayer({ id: "obs-l", type: "symbol", source: "obs", layout: { "text-field": ["concat", ["get", "t"], " ", ["get", "name"]], "text-font": ["Open Sans Semibold"], "text-size": 12, "text-offset": [0.8, 0], "text-anchor": "left" }, paint: { "text-color": "#ffffff", "text-halo-color": "#0e1113", "text-halo-width": 1.6 } });
      update();
    });
    const slider = $("#event-time");
    // scrub ticks
    const pts = [...A.obs.map((o) => [o.t, o.place.split(/ \/| gauge| \(/)[0]]), [toMin("09:15"), "First SMS"]];
    { let last = -1e9, row = 0; $("#scrub-ticks").innerHTML = pts.filter((p) => p[0] >= T0 && p[0] <= T0 + 480).sort((a, b) => a[0] - b[0]).map(([t, l]) => { const x = 100 * (t - T0) / 480; const lab = x - last >= 7; if (lab) { row = 1 - row; last = x; }
      return `<span class="${lab ? (x > 80 ? "r" : x < 10 ? "l" : "") : "nolab"}" style="left:${x}%;top:${lab ? row * 12 : 0}px" title="${hm(t)} ${esc(l)}">${lab ? `${hm(t)} ${esc(l)}` : ""}</span>`; }).join(""); }
    function update() {
      const t = T0 + Number(slider.value);
      const fch = A.chAt(t); const k = ch.findIndex((x) => x >= fch);
      if (evMap.getSource("front")) evMap.getSource("front").setData(lineFeature(t >= A.obs[0].t ? line.slice(0, Math.max(2, k === -1 ? line.length : k + 1)) : [line[0], line[0]]));
      const alertT = evScn === "actual" ? toMin("09:15") : A.obs[0].t + S.delay;
      const passed = A.obs.filter((o) => o.t <= t).pop();
      $("#ev-clock").textContent = hm(t);
      $("#ev-where").textContent = t < A.obs[0].t ? "Before the collapse" : `Flood front ${fmt(fch)} km down the river${passed ? ` · past ${passed.place.split(/ \/| gauge| \(/)[0]}` : ""}`;
      let hit = 0, warned = 0;
      cor.pop_bins.hand_25.forEach((p, i) => { if (i + 0.5 < A.obs[0].ch) return; const tt = A.at(i + 0.5); if (tt <= t) { if (tt < alertT) hit += p; else if (tt - alertT >= S.react) warned += p; } });
      $("#event-stats").innerHTML = [
        [t >= alertT ? hm(alertT) : "–", evScn === "actual" ? "first SMS (actual)" : `alert, ${S.delay} min after detection`],
        [fmt(Math.round(hit / 100) * 100), "people near the river reached by the flood before any alert"],
        [fmt(Math.round(warned / 100) * 100), `people with at least ${S.react} min of warning`],
      ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
      chartChain(t);
    }
    slider.addEventListener("input", update);
    $$("[data-scn]").forEach((b) => b.addEventListener("click", () => { evScn = b.dataset.scn; $$("[data-scn]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); update(); }));
    $("#event-play").addEventListener("click", (e) => {
      if (evTimer) { clearInterval(evTimer); evTimer = null; e.currentTarget.textContent = "▶"; return; }
      if (+slider.value >= 480) slider.value = 0;
      e.currentTarget.textContent = "❚❚"; const btn = e.currentTarget;
      evTimer = setInterval(() => { slider.value = Math.min(480, +slider.value + (+slider.value < 60 ? 0.5 : 2)); update(); if (+slider.value >= 480) { clearInterval(evTimer); evTimer = null; btn.textContent = "▶"; } }, 50);
    });
    initEvent.update = update;
    update();
    const st = D.event2026.summary_stats || []; const pick = (m) => st.find((s) => s.metric === m);
    $("#event-facts").innerHTML = [
      [fmt(pick("deaths_nepal")?.chosen), "dead in Nepal (police figure, provisional)"],
      [fmt(pick("missing_nepal")?.chosen), "missing, including hundreds of hydropower tunnel workers"],
      ["679,295", "phones reached by the routine SMS, in Nepali only"],
    ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  }
  function chartChain(tNow) {
    const lanes = ["Hazard", "Sensors", "Weather service", "Public alert", "People"];
    const actual = [[0, 0, "Collapse 08:37"], [5, 0, "Rasuwagadhi hit"], [13, 0, "Syabrubesi"], [43, 0, "Betrawati"],
      [3, 1, "Border gauge lost"], [13, 1, "Syabrubesi gauge silent"], [43, 1, "Betrawati gauge silent"],
      [23, 2, "District calls in"], [30, 2, "Confirmed"], [38, 3, "SMS to 679,295 phones"], [33, 4, "Trishuli school evacuates"]];
    const proposed = [[1, 1, "Seismic signal + second sensor"], [4, 2, "Veto window closes"], [4, 3, "Cell broadcast + sirens"], [5, 4, "Tunnel count-out"]];
    const H = 240; const [svg, w] = svgBox("#chart-chain", H); if (!svg) return;
    const m = { l: w < 600 ? 92 : 128, r: 20, t: 8, b: 26 };
    const x = d3.scaleLinear().domain([0, 48]).range([m.l, w - m.r]);
    const y = d3.scaleBand().domain(d3.range(5)).range([m.t, H - m.b]).padding(0.18);
    svg.append("g").selectAll("rect").data(lanes).join("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("y", (d, i) => y(i)).attr("height", y.bandwidth()).attr("rx", 5).attr("fill", "rgba(255,255,255,.05)");
    svg.append("g").selectAll("text").data(lanes).join("text").attr("class", "lbl").attr("x", m.l - 8).attr("y", (d, i) => y(i) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text((d) => d);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues([0, 5, 10, 15, 20, 25, 30, 35, 40, 45]).tickFormat((v) => `+${v} min`).tickSizeOuter(0));
    const draw = (data, color, dy) => {
      const lastEnd = {};
      data.slice().sort((a, b) => a[0] - b[0]).forEach(([t, lane, label]) => {
        const cx = x(t), cy = y(lane) + y.bandwidth() / 2 + dy;
        svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 4.5).attr("fill", color);
        if (w < 640) return;
        const width = label.length * 5.6; let lx = cx + 7;
        if (lastEnd[lane] != null && lx < lastEnd[lane] + 6) lx = lastEnd[lane] + 6;
        svg.append("text").attr("x", lx).attr("y", cy + 3.5).attr("fill", color).style("font-size", "10px").text(label);
        lastEnd[lane] = lx + width;
      });
    };
    draw(actual, "#9aa6b2", -6); draw(proposed, "#ff4d5e", 8);
    if (tNow != null) { const min = tNow - toMin("08:37"); if (min >= 0 && min <= 48) svg.append("line").attr("x1", x(min)).attr("x2", x(min)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "#ff4d5e").attr("stroke-width", 1.5).attr("stroke-dasharray", "0"); }
  }

  // ------------------------------------------------------------------ chapter 2: hazard
  const HZ_COL = { rain: "--rain", glof: "--glof", mass: "--mass", river: "--observed" };
  const HZ_LABEL = { rain: "Intense rain", glof: "Glacial lake outburst", mass: "Avalanche or landslide cascade", river: "River flood (reference)" };
  function typeOf(t) { t = String(t).toLowerCase(); if (t.includes("glof") || t.includes("lake")) return "glof"; if (t.includes("avalanche") || t.includes("landslide") || t.includes("dam")) return "mass"; if (t.includes("riverine")) return "river"; return "rain"; }
  const numOf = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\d+/); return m ? Number(m[0]) : 0; };
  function renderHazard() {
    $("#hazards").innerHTML = C.hazards.map((h) => `<article class="hz"><img src="img/${h.img}.webp" alt="${esc(h.name)}" loading="lazy">
      <div class="hz-b"><h3>${h.name}</h3>
      <div class="warnbar"><span>Warning: ${h.warn}</span><div class="track"><i style="width:${h.warnScale * 100}%;background:var(${HZ_COL[h.key]})"></i></div></div>
      <p>${h.text}</p><small>${h.examples} · ${h.season}</small><small data-credit="${h.img}"></small></div></article>`).join("");
    $$("#hazards [data-credit]").forEach((el) => { const c = D.images?.find((x) => x.slug === el.dataset.credit); if (c) el.innerHTML = `Photo: ${esc(c.author)}, <a href="${esc(c.license_url || c.source)}" target="_blank" rel="noopener">${esc(c.license)}</a>`; });
    chartHistory(); tableHeat(); corridorBars(); lakesTop();
  }
  function chartHistory() {
    const ev = D.events.map((e) => ({ ...e, yr: +String(e.date).slice(0, 4) + ((+String(e.date).slice(5, 7) || 6) - 0.5) / 12, cat: typeOf(e.type), toll: numOf(e.deaths) + numOf(e.missing) }));
    const H = 240; const [svg, w] = svgBox("#chart-history", H); if (!svg) return;
    const m = { l: w < 600 ? 10 : 190, r: 24, t: 24, b: 26 };
    const cats = ["rain", "glof", "mass", "river"];
    const x = d3.scaleLinear().domain([1960, 2028]).range([m.l, w - m.r]);
    const y = d3.scalePoint().domain(cats).range([m.t + 18, H - m.b - 18]);
    const r = d3.scaleSqrt().domain([0, 7000]).range([3, 34]);
    svg.append("g").selectAll("line").data(cats).join("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", (d) => y(d)).attr("y2", (d) => y(d)).attr("stroke", css("--line"));
    if (m.l > 20) svg.append("g").selectAll("text").data(cats).join("text").attr("class", "lbl").attr("x", 0).attr("y", (d) => y(d) + 4).text((d) => HZ_LABEL[d]);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(w < 500 ? 4 : 8).tickFormat(d3.format("d")).tickSizeOuter(0));
    svg.append("g").selectAll("circle").data(ev.sort((a, b) => b.toll - a.toll)).join("circle")
      .attr("cx", (d) => x(d.yr)).attr("cy", (d) => y(d.cat)).attr("r", (d) => r(d.toll)).attr("fill", (d) => css(HZ_COL[d.cat])).attr("fill-opacity", 0.45).attr("stroke", (d) => css(HZ_COL[d.cat])).attr("stroke-width", 1.5)
      .on("mousemove", (e, d) => showTip(e, `<b>${esc(d.name)}</b><br>${esc(d.date)} · ${esc(d.type)}<br>Dead ${esc(d.deaths || "–")} · missing ${esc(d.missing || "–")}`)).on("mouseleave", hideTip);
    if (w >= 600) {
      const placed = []; const lab = ev.filter((d) => d.toll >= 150).sort((a, b) => b.toll - a.toll);
      lab.forEach((d) => { const nm0 = d.name.split(/[(,/]/)[0].replace(/\b(19|20)\d\d\b/g, "").replace(/\s+/g, " ").trim(); const nm1 = nm0.length > 22 ? nm0.slice(0, 22).replace(/\s+\S*$/, "") : nm0; const t = `${Math.floor(d.yr)} ${nm1}`; const tw = t.length * 5.8; const cx = x(d.yr), rr = r(d.toll);
        const right = cx + tw / 2 > w - m.r; const x0 = right ? cx - tw : cx - tw / 2;
        for (const yy of [y(d.cat) - rr - 5, y(d.cat) + rr + 13, y(d.cat) - rr - 17]) {
          if (yy < 10 || yy > H - m.b - 2) continue;
          if (placed.some((q) => x0 < q.x1 + 6 && x0 + tw > q.x0 - 6 && Math.abs(yy - q.y) < 12)) continue;
          placed.push({ x0, x1: x0 + tw, y: yy }); svg.append("text").attr("class", "lbl").attr("x", right ? cx : cx).attr("y", yy).attr("text-anchor", right ? "end" : "middle").text(t); break; } });
    }
    $("#legend-history").innerHTML = cats.map((c) => `<span><i style="background:var(${HZ_COL[c]})"></i>${HZ_LABEL[c]}</span>`).join("");
  }
  function tableHeat() {
    const ev = D.events.map((e) => ({ m: +String(e.date).slice(5, 7) || null, cat: typeOf(e.type) })).filter((e) => e.m);
    const cats = ["rain", "glof", "mass"]; const M = "J F M A M J J A S O N D".split(" ");
    const mx = d3.max(cats.flatMap((c) => d3.range(1, 13).map((mm) => ev.filter((e) => e.cat === c && e.m === mm).length)));
    $("#tbl-heat").innerHTML = `<thead><tr><th>Events by month</th>${M.map((m) => `<th>${m}</th>`).join("")}</tr></thead><tbody>` + cats.map((c) => `<tr><td>${HZ_LABEL[c]}</td>${d3.range(1, 13).map((mm) => { const n = ev.filter((e) => e.cat === c && e.m === mm).length; return `<td style="background:${n ? `color-mix(in srgb, var(${HZ_COL[c]}) ${Math.round(18 + 70 * n / mx)}%, transparent)` : "transparent"}">${n || ""}</td>`; }).join("")}</tr>`).join("") + "</tbody>";
  }
  function corridorBars() {
    const rows = D.corridors.map((c) => ({ id: c.id, name: c.name.replace(/ – /, "–"), v: c.totals.pop_hand_25, c })).sort((a, b) => b.v - a.v);
    const mx = d3.max(rows, (r) => r.v);
    $("#corr-bars").innerHTML = rows.map((r) => `<div class="hbar" data-c="${r.id}"><span>${esc(r.name)}</span><span class="t"><i style="width:${100 * r.v / mx}%"></i></span><b>${fmt(r.v)}</b></div>`).join("") +
      `<p class="note">Total ${fmt(d3.sum(rows, (r) => r.v))} people in about ${fmt(d3.sum(rows, (r) => r.v) / HH_SIZE)} households. Hover for schools, health posts and hydropower sites.</p>`;
    $$("#corr-bars .hbar").forEach((el) => { const c = rows.find((r) => r.id === el.dataset.c).c;
      el.addEventListener("mousemove", (e) => showTip(e, `<b>${esc(c.name)}</b><br>${fmt(c.length_km)} km of river · ${fmt(c.totals.school || 0)} schools · ${fmt(c.totals.health || 0)} health sites · ${fmt((c.totals.hydropower || 0) + (c.totals.headworks || 0))} hydropower sites`));
      el.addEventListener("mouseleave", hideTip); });
  }
  function lakesTop() {
    const lakes = D.lakes; const top = lakes.slice(0, 5);
    const nm = (l) => /^GL\d/.test(l.name) ? `Unnamed lake, ${l.basin}` : l.name;
    $("#lakes-top").innerHTML = top.map((l, i) => `<div class="lake-row"><span class="mono">${i + 1}</span><span>${esc(nm(l))} <span class="muted small">· ${esc(l.country)} · ${esc(l.rank)}</span></span><b>${fmt(l.pop_25m_120km)}</b></div>`).join("") +
      `<p class="note">People living less than 25 m above the river in the first 120 km below each lake. Of ICIMOD's 47 potentially dangerous lakes, ${lakes.filter((l) => l.country.startsWith("China")).length} lie in Tibet.</p>`;
    const m = newMap("map-lakes", { center: [85.9, 28.2], zoom: 6.25 }); MAPS.push(m);
    m.on("load", () => {
      m.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: lakes.map((l) => lineFeature(l.line, { pop: l.pop_25m_120km })) } });
      m.addSource("lakes", { type: "geojson", data: pointFC(lakes, (l) => ({ name: nm(l), pop: l.pop_25m_120km, rank: l.rank })) });
      m.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": css("--glof"), "line-width": ["interpolate", ["linear"], ["get", "pop"], 0, 0.8, 40000, 4], "line-opacity": 0.75 } });
      m.addLayer({ id: "lakes", type: "circle", source: "lakes", paint: { "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "pop"]], 0, 3, 210, 11], "circle-color": css("--glof"), "circle-stroke-color": css("--surface"), "circle-stroke-width": 1.5 } });
      m.on("mousemove", "lakes", (e) => { const p = e.features[0].properties; showTip(e.originalEvent, `<b>${esc(p.name)}</b> · ${esc(p.rank)}<br>${fmt(p.pop)} people below`); });
      m.on("mouseleave", "lakes", hideTip);
    });
  }

  // ------------------------------------------------------------------ chapter 4: evidence (dial)
  function initDial() {
    const rb = D.robust; if (!rb) return;
    const dial = rb.dial; const ev = rb.events; const lim = S.acts / S.years;
    const slider = $("#dial"); slider.max = dial.length - 1;
    const idxOf = (st) => dial.findIndex((d) => d.k === st.k && Math.abs(d.p - st.p) < 1e-6 && d.m === st.m);
    const limIdx = d3.max(dial.map((d, i) => d.acts_per_year <= lim + 1e-9 ? i : -1));
    const bestUnder = (cap) => { let b = 0; dial.forEach((d, i) => { if (d.acts_per_year <= cap + 1e-9 && (d.caught > dial[b].caught || (d.caught === dial[b].caught && d.acts_per_year < dial[b].acts_per_year))) b = i; }); return b; };
    const presets = [
      ["Fits the fund limit", bestUnder(lim)],
      ["Recommended get-ready alert", idxOf(rb.insample.alert_strict.setting), true],
      ["Catch more", bestUnder(4)],
    ];
    $("#dial-presets").innerHTML = presets.map(([l, i, rec]) => `<button type="button" data-i="${i}">${rec ? '<span class="rec">● </span>' : ""}${l}</button>`).join("");
    $$("#dial-presets button").forEach((b) => b.addEventListener("click", () => { slider.value = b.dataset.i; update(); }));
    const pos = (i) => `${100 * i / (dial.length - 1)}%`;
    $("#dial-limit").style.left = `calc(${pos(limIdx)} - 1px)`; $("#dial-limit-label").style.left = pos(limIdx);
    $("#dial-limit-label").textContent = `fund limit (${S.acts} in ${S.years} yrs)`;
    slider.value = S.dial ?? idxOf(rb.insample.alert_strict.setting);
    const tollMax = d3.max(ev, (e) => e.toll);
    $("#dial-dots").innerHTML = ev.map((e, i) => `<div class="dot" data-i="${i}" style="--s:${Math.round(16 + 26 * Math.sqrt(e.toll / tollMax))}px"><i></i><span>${e.start.slice(0, 7)}<br>${e.toll} dead/missing</span></div>`).join("");
    $$("#dial-dots .dot").forEach((el) => { const e = ev[+el.dataset.i];
      el.addEventListener("mousemove", (x) => { const d = dial[+slider.value]; const h = d.hits[+el.dataset.i]; showTip(x, `<b>${e.start} to ${e.end}</b><br>${e.toll} dead or missing<br>${e.districts.join(", ")}<br>${h == null ? "Not flagged in advance" : `Flagged ${h} day(s) ahead`}`); });
      el.addEventListener("mouseleave", hideTip); });
    function update() {
      const i = +slider.value, d = dial[i]; S.dial = i; save();
      $$("#dial-presets button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.i === i)));
      $("#dial-out").innerHTML = [
        [`${d.caught} of ${ev.length}`, `major disasters flagged in advance <button class="x" data-x="caught">?</button>`],
        [pct(d.toll_caught / d3.sum(ev, (e) => e.toll)), "of their dead and missing"],
        [fmt(d.acts_per_year, 1), `alerts a year <button class="x" data-x="alerts">?</button>${d.acts_per_year <= lim + 1e-9 ? ' <span class="chip" style="border-color:var(--good);color:var(--good-ink)">within fund limit</span>' : ""}`],
        [fmt(d.chance, 1), `flagged by the same number of alerts on random days <button class="x" data-x="chance">?</button>`],
      ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
      $$("#dial-dots .dot").forEach((el) => el.classList.toggle("hit", d.hits[+el.dataset.i] != null));
      const runs = d.p >= 1 ? "all 5" : `${Math.round(d.p * 5)} of 5`;
      $("#dial-note").innerHTML = `Setting: ${runs} forecast runs predict ${kPlain(d.k)} <button class="x" data-x="threshold">?</button> two days ahead, in at least ${d.m} hill district${d.m > 1 ? "s" : ""}. Each dot is a major disaster of 2011–2019, sized by its toll; red ones were flagged up to two days before the first report, in an affected or neighbouring district.`;
    }
    slider.addEventListener("input", update); update();
  }
  function renderVillage() {
    const v = D.robust?.village; if (!v) return;
    const rows = Object.entries(v);
    $("#village").innerHTML = rows.map(([d, x]) => `<div class="hbar" style="grid-template-columns:7.5rem 1fr 7.5rem"><span>${esc(d)}</span><span class="t"><i style="width:${Math.min(100, 100 * x.fatal_days_per_decade / 12)}%;background:var(--crit)"></i></span><b class="nowrap">${fmt(x.fatal_days_per_decade, 1)} <span class="muted small">(${fmt(x.fatal_days_per_decade - x.fatal_days_missed_per_decade, 0)} flagged)</span></b></div>`).join("") +
      `<p class="note">Fatal flood days per decade, and how many the recommended alert flagged. Deaths here came from cascades and very local storms; for these districts the protocol relies on dammed lakes and the alarm.</p>`;
    const s = D.robust.second_signal;
    $("#second").innerHTML = `<div class="hbar" style="grid-template-columns:8rem 1fr 3rem"><span>Forecast alone</span><span class="t"><i style="width:${100 * s.prepare.per_district_decade / 2.5}%;background:var(--observed)"></i></span><b>${fmt(s.prepare.per_district_decade, 1)}</b></div>
      <div class="hbar" style="grid-template-columns:8rem 1fr 3rem"><span>+ observed rain</span><span class="t"><i style="width:${100 * s.evacuate.per_district_decade / 2.5}%;background:var(--accent)"></i></span><b>${fmt(s.evacuate.per_district_decade, 1)}</b></div>
      <p class="note">Evacuation requests per district per decade. Share of requests with no recorded loss: ${pct(s.prepare.far)} → ${pct(s.evacuate.far)} <button class="x" data-x="second">?</button></p>`;
  }
  function chartSkill() {
    const sk = D.fcases?.skill; if (!sk?.length) return;
    const models = [...new Set(sk.map((r) => r.model))];
    const H = 210; const [svg, w] = svgBox("#chart-skill", H); if (!svg) return;
    const m = { l: 34, r: 46, t: 10, b: 26 };
    const x0 = d3.scaleBand().domain([1, 2, 3]).range([m.l, w - m.r]).padding(0.22);
    const x1 = d3.scaleBand().domain(models).range([0, x0.bandwidth()]).padding(0.12);
    const y = d3.scaleLinear().domain([0.5, 0.9]).range([H - m.b, m.t]);
    [[0.7, "useful"], [0.8, "good"]].forEach(([v, l]) => { svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", css("--line")); svg.append("text").attr("x", w - m.r + 4).attr("y", y(v) + 4).attr("class", "lbl").text(l); });
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x0).tickFormat((d) => `${d} day${d > 1 ? "s" : ""} ahead`).tickSizeOuter(0));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));
    const col = (mo) => mo.startsWith("ECMWF") ? css("--accent") : css("--observed");
    svg.append("g").selectAll("rect").data(sk.filter((r) => r.k === 1)).join("rect").attr("x", (r) => x0(r.lead) + x1(r.model)).attr("width", x1.bandwidth()).attr("y", (r) => y(Math.max(0.5, r.auc))).attr("height", (r) => y(0.5) - y(Math.max(0.5, r.auc))).attr("rx", 3).attr("fill", (r) => col(r.model))
      .on("mousemove", (e, r) => showTip(e, `<b>${esc(r.model)}</b><br>ROC area ${r.auc} for district rain on the heaviest day of a typical monsoon`)).on("mouseleave", hideTip);
    $("#skill-note").innerHTML = `<span class="legend">${models.map((mo) => `<span><i style="background:${col(mo)}"></i>${esc(mo.split(" (")[0])}</span>`).join("")}</span> How well each forecast picks out heavy-rain days, scored against observed rain <button class="x" data-x="roc">?</button>. Different years, so indicative.`;
  }
  function chartCase() {
    const cs = D.fcases?.cases; if (!cs) return;
    const sel = $("#case-sel");
    if (!sel.options.length) { sel.innerHTML = Object.entries(cs).map(([k, c]) => `<option value="${k}">${esc(c.title)}</option>`).join(""); sel.addEventListener("change", chartCase); }
    const c = cs[sel.value]; const tgt = c.targets[c.targets.length - 1];
    const byD = c.districts.map((d) => ({ d, runs: c.runs.filter((r) => r.district === d && r.target === tgt).sort((a, b) => a.init.localeCompare(b.init)) }));
    const groups = byD.flatMap((g) => g.runs.map((r) => ({ ...r, key: `${g.d}|${r.init}` })));
    const H = 280; const [svg, w] = svgBox("#chart-case", H); if (!svg) return;
    const m = { l: 46, r: 10, t: 14, b: 40 };
    const x = d3.scaleBand().domain(groups.map((g) => g.key)).range([m.l, w - m.r]).padding(0.3);
    const ymax = (d3.max([...groups.flatMap((g) => g.members), ...Object.values(c.obs_era5).flatMap((o) => Object.values(o)).filter((v) => v != null)]) || 100) * 1.08;
    const y = d3.scaleLinear().domain([0, ymax]).nice().range([H - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r))).call((g) => g.select(".domain").remove());
    svg.append("text").attr("x", m.l).attr("y", m.t - 2).text("mm of rain in the day");
    groups.forEach((g) => {
      const xs = x(g.key) + x.bandwidth() / 2; const s = [...g.members].sort(d3.ascending); const q = (p) => d3.quantile(s, p);
      svg.append("line").attr("x1", xs).attr("x2", xs).attr("y1", y(q(0.05))).attr("y2", y(q(0.95))).attr("stroke", css("--rain")).attr("stroke-width", 2);
      svg.append("rect").attr("x", x(g.key)).attr("width", x.bandwidth()).attr("y", y(q(0.75))).attr("height", Math.max(1, y(q(0.25)) - y(q(0.75)))).attr("rx", 2).attr("fill", css("--rain")).attr("fill-opacity", 0.35).attr("stroke", css("--rain"))
        .on("mousemove", (e) => showTip(e, `<b>${esc(g.district)}</b>, forecast issued ${g.init} (${g.lead} day${g.lead > 1 ? "s" : ""} ahead)<br>middle half of runs: ${fmt(q(0.25))}–${fmt(q(0.75))} mm<br>${g.members.length} runs`)).on("mouseleave", hideTip);
      svg.append("line").attr("x1", x(g.key)).attr("x2", x(g.key) + x.bandwidth()).attr("y1", y(q(0.5))).attr("y2", y(q(0.5))).attr("stroke", css("--ink")).attr("stroke-width", 2);
    });
    byD.forEach((g) => { if (!g.runs.length) return;
      const x0 = x(`${g.d}|${g.runs[0].init}`), x1 = x(`${g.d}|${g.runs[g.runs.length - 1].init}`) + x.bandwidth();
      const thr = c.thr_obs_prepare?.[g.d], ob = c.obs_era5[g.d][tgt];
      if (thr) svg.append("line").attr("x1", x0).attr("x2", x1).attr("y1", y(thr)).attr("y2", y(thr)).attr("stroke", css("--accent")).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 3");
      if (ob != null) svg.append("circle").attr("cx", (x0 + x1) / 2).attr("cy", y(ob)).attr("r", 5).attr("fill", css("--accent")).attr("stroke", css("--surface")).attr("stroke-width", 2);
      svg.append("text").attr("class", "lbl").attr("x", (x0 + x1) / 2).attr("y", H - m.b + 16 + (w < 600 && byD.indexOf(g) % 2 ? 12 : 0)).attr("text-anchor", "middle").text(g.d.replace("Kabherepalanchok", "Kavre"));
    });
    $("#case-note").innerHTML = `Boxes: forecasts issued on successive days for ${tgt} (earliest left); the box holds the middle half of the runs. Dashed line: the district's get-ready level. Dot: rain that fell (ERA5-Land). ${sel.value === "langtang_2026" ? "<b>On 26 August 2026 there was no rain signal:</b> the cascade was not rain-driven, so no rain forecast could have anticipated it. Only the alarm (step 4) could." : "<b>In September 2024 the forecasts flagged extreme rain over the Kathmandu valley two to three days ahead</b>: a get-ready alert, and with the observed rain, an evacuation request."}`;
  }

  // ------------------------------------------------------------------ chapter 5: lead time (draggable sensor)
  const SPEEDS = [["observed", "Recorded on 26 Aug 2026"], ["15", "Debris flood, 15 m/s"], ["6", "Flood wave, 6 m/s"], ["3", "Slow wave, 3 m/s"]];
  let ltMap;
  const ltCorr = () => D.corridors.find((c) => c.id === $("#lt-corr").value) || trishuli();
  function ltArrival(cor) {
    const sp = $("#lt-speed").value;
    if (sp === "observed" && cor.observed_2026?.length) { const A = arrivalFn(cor); const t0 = A.obs[0].t; return (c) => A.at(c) - t0; }
    const v = +sp || 6; return (c) => c * 1000 / v / 60;
  }
  function initLeadtime() {
    $("#lt-corr").innerHTML = D.corridors.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    const setSpeeds = () => { const cor = ltCorr(); const has = !!cor.observed_2026?.length;
      $("#lt-speed").innerHTML = SPEEDS.filter(([k]) => k !== "observed" || has).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
      $("#lt-sensor").max = Math.floor(cor.length_km * 0.7); $("#lt-sensor").value = has ? Math.round(cor.observed_2026[0].ch * 2) / 2 : 0; };
    setSpeeds();
    const A = arrivalFn(trishuli()); const src = A.obs[0].ch; const betra = A.obs.find((o) => /Betrawati/.test(o.place)).ch;
    const presets = [["Today: a phone chain", src, 38], ["A gauge at Betrawati", betra, 3], ["Detection at the source", src, 3, true]];
    $("#lt-presets").innerHTML = presets.map(([l, s, d, rec], i) => `<button type="button" data-i="${i}">${rec ? '<span class="rec">● </span>' : ""}${l}</button>`).join("");
    $$("#lt-presets button").forEach((b) => b.addEventListener("click", () => { const [, s, d] = presets[+b.dataset.i];
      $("#lt-corr").value = "trishuli"; setSpeeds(); $("#lt-sensor").value = s; $("#lt-delay").value = d; S.delay = d; save();
      $$("#lt-presets button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderLeadtime(true); }));
    $("#lt-corr").addEventListener("change", () => { setSpeeds(); renderLeadtime(true); });
    ["lt-sensor", "lt-delay", "lt-react", "lt-speed"].forEach((id) => $("#" + id).addEventListener("input", () => { S.delay = +$("#lt-delay").value; S.react = +$("#lt-react").value; save(); renderLeadtime(false); }));
    $("#lt-delay").value = S.delay; $("#lt-react").value = S.react;
    renderLeadtime(true);
  }
  function ltSites(cor) { return cor.assets.filter((a) => ["settlement", "hydropower", "headworks", "school", "health"].includes(a.k) && (a.hand == null || a.hand < 50)); }
  function renderLeadtime(fly) {
    const cor = ltCorr(); const arr = ltArrival(cor);
    const sensor = +$("#lt-sensor").value, delay = +$("#lt-delay").value, react = +$("#lt-react").value;
    $("#lt-sensor-o").textContent = `${sensor} km`; $("#lt-delay-o").textContent = `${delay} min`; $("#lt-react-o").textContent = `${react} min`;
    const alert = arr(sensor) + delay; const warn = (c) => arr(c) - alert;
    let safe = 0, unsafe = 0;
    cor.pop_bins.hand_25.forEach((p, i) => { if (i + 0.5 < sensor || warn(i + 0.5) < react) unsafe += p; else safe += p; });
    const sites = ltSites(cor);
    const hydro = sites.filter((a) => a.k === "hydropower" || a.k === "headworks");
    const hydroOk = hydro.filter((a) => a.ch > sensor && warn(a.ch) >= react).length;
    $("#lt-big").innerHTML = `<b>${fmt(Math.round(safe / 100) * 100)}</b><span>people near the river get at least ${react} minutes <button class="x" data-x="warning">?</button></span><span class="muted small">${fmt(Math.round(unsafe / 100) * 100)} do not · ${hydroOk} of ${hydro.length} hydropower sites have time to clear tunnels</span>`;
    const short = sites.filter((a) => (a.ch <= sensor || warn(a.ch) < react) && a.n && (a.k === "settlement" || a.k === "hydropower")).sort((a, b) => a.ch - b.ch);
    const seen = new Set(); const firstShort = short.filter((a) => { const k = a.n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
    $("#lt-left").innerHTML = firstShort.length ? `<p class="small muted">Not enough warning:</p><div class="left-list">${firstShort.map((a) => `<div><span>${esc(a.n)}</span><b>${a.ch <= sensor ? "above sensor" : fmt(warn(a.ch)) + " min"}</b></div>`).join("")}</div>` : `<p class="small" style="color:var(--good-ink)">Every mapped settlement and hydropower site gets enough warning.</p>`;
    chartLeadtime(cor, arr, sensor, alert, react, sites);
    mapLeadtime(cor, warn, sensor, react, sites, fly);
    tablePlaces(sites, warn, sensor, react); tableHydro(hydro, warn, sensor, react);
    renderNumbers();
    if (initEvent.update) initEvent.update();
  }
  function chartLeadtime(cor, arr, sensor, alert, react, sites) {
    const H = 320; const [svg, w] = svgBox("#chart-lt", H); if (!svg) return;
    const m = { l: 58, r: 14, t: 18, b: 56 };
    const L = cor.length_km; const x = d3.scaleLinear().domain([0, L]).range([m.l, w - m.r]);
    const ymax = Math.max(60, Math.min(arr(L), 600)); const y = d3.scaleSqrt().domain([0, ymax]).range([H - m.b, m.t]);
    const yt = [5, 15, 30, 60, 120, 240, 480].filter((v) => v <= ymax);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues([0, ...yt]).tickFormat((v) => v < 60 || v % 60 ? `${v} min` : `${v / 60} h`).tickSize(-(w - m.l - m.r))).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8).tickFormat((v) => `${v} km`).tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", m.t - 4).attr("text-anchor", "end").text("when the flood arrives ↑ · distance down the river →");
    const xs = d3.range(0, L + 0.01, L / 240);
    svg.append("path").datum(xs.filter((c) => c >= sensor)).attr("fill", css("--good")).attr("fill-opacity", 0.13)
      .attr("d", d3.area().x((c) => x(c)).y0(() => y(Math.min(alert + react, ymax))).y1((c) => y(Math.min(Math.max(arr(c), alert + react), ymax))));
    svg.append("path").datum(xs).attr("fill", "none").attr("stroke", css("--rain")).attr("stroke-width", 2.5).attr("d", d3.line().x((c) => x(c)).y((c) => y(Math.min(arr(c), ymax))));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(alert)).attr("y2", y(alert)).attr("stroke", css("--accent")).attr("stroke-width", 1.5);
    svg.append("text").attr("class", "lbl").attr("x", w - m.r - 4).attr("y", y(alert) - 5).attr("text-anchor", "end").text(`alert reaches phones · ${fmt(alert)} min`);
    if ($("#lt-speed").value === "observed") { const A = arrivalFn(cor);
      svg.append("g").selectAll("circle").data(A.obs).join("circle").attr("cx", (o) => x(o.ch)).attr("cy", (o) => y(Math.min(o.t - A.obs[0].t, ymax))).attr("r", 4).attr("fill", css("--rain")).attr("stroke", css("--surface")).attr("stroke-width", 2)
        .on("mousemove", (e, o) => showTip(e, `<b>${esc(o.place)}</b><br>${hm(o.t)} on 26 Aug 2026 · ${fmt(o.ch, 1)} km`)).on("mouseleave", hideTip); }
    const okCol = css("--good"), badCol = css("--crit");
    svg.append("g").selectAll("rect").data(sites).join("rect").attr("x", (a) => x(a.ch) - 1.5).attr("width", 3).attr("y", H - m.b + 24).attr("height", (a) => a.k === "settlement" ? 12 : 7)
      .attr("fill", (a) => a.ch <= sensor || arr(a.ch) - alert < react ? badCol : okCol)
      .on("mousemove", (e, a) => showTip(e, `<b>${esc(a.n || a.k)}</b> (${a.k})<br>${a.ch <= sensor ? "above the sensor: no warning" : fmt(arr(a.ch) - alert) + " min of warning"}`)).on("mouseleave", hideTip);
    // draggable sensor
    const g = svg.append("g").attr("class", "sensor-handle").attr("transform", `translate(${x(sensor)},0)`);
    g.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", css("--accent")).attr("stroke-width", 2.5);
    g.append("rect").attr("x", -12).attr("y", m.t).attr("width", 24).attr("height", H - m.b - m.t).attr("fill", "transparent");
    g.append("path").attr("d", `M0,${m.t} l9,-9 h-18 z`).attr("fill", css("--accent"));
    g.append("text").attr("class", "lbl").attr("x", 8).attr("y", m.t + 14).text("sensor");
    g.call(d3.drag().on("drag", (e) => { const c = Math.max(0, Math.min(L * 0.85, x.invert(e.x))); g.attr("transform", `translate(${x(c)},0)`); $("#lt-sensor").value = Math.round(c * 2) / 2; })
      .on("end", () => { $$("#lt-presets button").forEach((b) => b.setAttribute("aria-pressed", "false")); renderLeadtime(false); }));
  }
  function mapLeadtime(cor, warn, sensor, react, sites, fly) {
    const data = () => ({ line: lineFeature(cor.line),
      sites: pointFC(sites, (a) => ({ ok: a.ch > sensor && warn(a.ch) >= react ? 1 : 0, n: a.n || a.k, k: a.k, w: a.ch <= sensor ? -1 : Math.round(warn(a.ch)) })),
      sensor: pointFC([(() => { const i = cor.profile.ch.findIndex((c) => c >= sensor); const p = cor.line[Math.max(0, i)]; return { x: p[0], y: p[1] }; })()], () => ({})) });
    const paint = () => { const d = data();
      if (!ltMap.getSource("line")) {
        ltMap.addSource("line", { type: "geojson", data: d.line }); ltMap.addSource("sites", { type: "geojson", data: d.sites }); ltMap.addSource("sensor", { type: "geojson", data: d.sensor });
        ltMap.addLayer({ id: "line", type: "line", source: "line", paint: { "line-color": css("--rain"), "line-width": 3 } });
        ltMap.addLayer({ id: "sites", type: "circle", source: "sites", paint: { "circle-radius": ["match", ["get", "k"], "settlement", 5, 3.5], "circle-color": ["case", ["==", ["get", "ok"], 1], css("--good"), css("--crit")], "circle-stroke-color": css("--surface"), "circle-stroke-width": 1.5 } });
        ltMap.addLayer({ id: "sensor", type: "circle", source: "sensor", paint: { "circle-radius": 8, "circle-color": css("--accent"), "circle-stroke-color": css("--surface"), "circle-stroke-width": 3 } });
        ltMap.on("mousemove", "sites", (e) => { const p = e.features[0].properties; showTip(e.originalEvent, `<b>${esc(p.n)}</b><br>${p.w < 0 ? "above the sensor" : p.w + " min of warning"}`); });
        ltMap.on("mouseleave", "sites", hideTip);
      } else { ltMap.getSource("line").setData(d.line); ltMap.getSource("sites").setData(d.sites); ltMap.getSource("sensor").setData(d.sensor); }
      if (fly) { const b = cor.line.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(cor.line[0], cor.line[0])); ltMap.fitBounds(b, { padding: 24, duration: 600 }); } };
    if (!ltMap) { ltMap = newMap("map-lt", { center: [85.2, 28.0], zoom: 8 }); MAPS.push(ltMap); ltMap.on("load", paint); }
    else if (ltMap.loaded()) paint(); else ltMap.once("load", paint);
  }
  function tablePlaces(sites, warn, sensor, react) {
    const groups = d3.groups(sites.filter((a) => a.n || a.k === "hydropower"), (a) => `${(a.n || a.k).trim()}|${a.k}`).map(([k, v]) => ({ n: v[0].n || v[0].k, k: v[0].k, ch: d3.min(v, (a) => a.ch), count: v.length }))
      .sort((a, b) => a.ch - b.ch);
    const byPos = d3.groups(groups, (g) => `${Math.round(g.ch)}|${g.k}`).map(([, v]) => v.length > 3 ? { n: `${v.length} ${v[0].k === "health" ? "health facilities" : v[0].k + "s"} at ${fmt(v[0].ch)} km`, k: v[0].k, ch: v[0].ch } : v).flat();
    table("#tbl-lt", ["Place or site", "Type", "#km down the river", "#Warning"], byPos.slice(0, 160).map((a) => { const w = a.ch <= sensor ? null : warn(a.ch); const ok = w != null && w >= react;
      return `<tr><td>${esc(a.n)}</td><td class="small">${a.k}</td><td class="num">${fmt(a.ch, 1)}</td><td class="num" style="color:${ok ? "var(--good-ink)" : "var(--bad-ink)"}">${w == null ? "none" : fmt(w) + " min"}</td></tr>`; }));
  }
  function tableHydro(hydro, warn, sensor, react) {
    table("#tbl-hydro", ["Site (OpenStreetMap)", "Type", "#km down the river", "#Warning", "Enough to clear tunnels?"], hydro.sort((a, b) => a.ch - b.ch).map((a) => { const w = a.ch <= sensor ? null : warn(a.ch); const ok = w != null && w >= react;
      return `<tr><td>${esc(a.n || "unnamed site")}</td><td class="small">${a.k}</td><td class="num">${fmt(a.ch, 1)}</td><td class="num">${w == null ? "none" : fmt(w) + " min"}</td><td style="color:${ok ? "var(--good-ink)" : "var(--bad-ink)"}">${ok ? "yes" : "no"}</td></tr>`; }));
  }
  function renderLinked() {
    const L = D.inst?.linked_systems || [];
    const state = (e) => { const t = `${e.status_2026} ${e.funding}`.toLowerCase(); return t.includes("unfunded") || t.includes("not ") || t.includes("none") ? ["var(--crit)", "missing or unfunded"] : t.includes("partial") || t.includes("proposal") || t.includes("planned") || t.includes("pilot") ? ["var(--warn)", "partial or planned"] : ["var(--good)", "exists"]; };
    $("#linked-status").innerHTML = `<div class="status-list">${L.map((e) => { const [c, l] = state(e); return `<div><i style="background:${c}"></i><span>${esc(e.element.split("(")[0])}<small>${esc(String(e.owner).split(/[;(]/)[0])} · ${l}</small></span></div>`; }).join("")}</div>`;
    table("#tbl-linked", ["Element", "Owner", "Status in 2026", "Funding", "Fallback without it", "Source"],
      L.map((e) => `<tr><td><b>${esc(e.element)}</b></td><td class="small">${esc(e.owner)}</td><td class="small">${esc(e.status_2026)}</td><td class="small">${esc(e.funding)}</td><td class="small">${esc(e.fallback_without_it)}</td><td class="small">${host(e.source_url)}${check(e.verify)}</td></tr>`));
  }

  // ------------------------------------------------------------------ chapter 6: people
  const OWN = (o) => { const t = String(o || "").toLowerCase(); return t.includes("nrcs") ? "rc" : t.includes("gov") ? "gov" : t.includes("operator") ? "op" : "gov"; };
  let actFilter = "rc";
  function renderPeople() {
    $("#journey").innerHTML = [
      ["Warn", "days to minutes", "Get-ready messages, then the alarm. River watchers, volunteers door to door, sirens.", ["rc", "gov"]],
      ["Move", "hours", "Priority households move to high ground or a centre on the local committee's request. Workers clear tunnels.", ["gov", "rc", "op"]],
      ["Cash", "1–2 days", "Registered households receive cash to protect what they can, by bank, wallet or agent.", ["rc"]],
      ["Return", "days–weeks", "All-clear, ward meeting, psychosocial support, family tracing; a response operation if the flood came.", ["rc", "gov"]],
    ].map(([h, w, t, o]) => `<div><span class="when">${w}</span><b>${h}</b><p>${t}</p><span class="chips">${o.map((x) => `<span class="chip ${x}">${{ rc: "Red Cross", gov: "Government", op: "Operators" }[x]}</span>`).join("")}</span></div>`).join("");
    $("#act-filter").innerHTML = [["rc", "Red Cross"], ["gov", "Government"], ["op", "Operators"], ["all", "All"]].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === actFilter}">${l}</button>`).join("");
    $$("#act-filter button").forEach((b) => b.addEventListener("click", () => { actFilter = b.dataset.f; renderPeople(); }));
    const om = D.inst?.operational_matrix || [];
    const acts = D.actions.actions.map((a) => ({ ...a, own: OWN(om.find((x) => x.id === a.id)?.owner_type) }));
    const cats = [["seasonal", "Every year"], ["weeks", "Weeks ahead"], ["1-3 days", "1–3 days ahead"], ["hours", "Hours ahead"], ["minutes", "Minutes ahead"]];
    $("#actions").innerHTML = `<div class="actlist">${cats.map(([c, l]) => { const xs = acts.filter((a) => a.category === c && (actFilter === "all" || a.own === actFilter)); if (!xs.length) return "";
      return `<div class="actgroup"><h4>${l}</h4>${xs.map((a) => `<button type="button" class="act" data-a="${a.id}"><span>${esc(C.actionNames?.[a.id] || a.name.split("(")[0])}</span><span class="chip ${a.own}">${{ rc: "Red Cross", gov: "Government", op: "Operators" }[a.own]}</span></button>`).join("")}</div>`; }).join("")}</div>`;
    $$("#actions .act").forEach((b) => b.addEventListener("click", () => { const a = acts.find((x) => x.id === b.dataset.a);
      showPop(b, a.name, `<span>${esc(a.evidence || "")}</span><br><span class="muted">Evidence: ${a.evidence_strength} · needs at least ${a.lead_time_min_hours < 1 ? fmt(a.lead_time_min_hours * 60) + " min" : fmt(a.lead_time_min_hours) + " h"}</span>`); }));
    const P = (D.palikas || []).slice().sort((a, b) => b.pop_25m - a.pop_25m).slice(0, 8); const mx = d3.max(P, (r) => r.pop_25m);
    $("#pal-bars").innerHTML = `<p class="small muted" style="margin:6px 0">Municipalities with the most people in the flood path</p>` + P.map((r) => `<div class="hbar"><span>${esc(r.palika)}</span><span class="t"><i style="width:${100 * r.pop_25m / mx}%"></i></span><b>${fmt(r.pop_25m)}</b></div>`).join("");
  }

  // ------------------------------------------------------------------ chapter 7: cost
  function renderCost() {
    $("#b-hh").value = S.hh; $("#b-cash").value = S.cash; $("#b-corr").value = S.corr;
    $("#b-hh-o").textContent = fmt(S.hh); $("#b-cash-o").textContent = `NPR ${fmt(S.cash)}`; $("#b-corr-o").textContent = S.corr;
    const b = budget();
    const segs = [["Preparation", b.R, "--rain"], ["Stored supplies", b.P, "--glof"], ["Early action (cash, centres, volunteers)", b.E, "--accent"], ["IFRC support", b.I, "--observed"]];
    const span = Math.max(S.cap, b.T + b.CF) * 1.02;
    $("#budget-bar").innerHTML = segs.map(([l, v, c]) => `<span style="flex-grow:${v};background:var(${c})" title="${l}: ${chfK(v)}"></span>`).join("") +
      `<span class="ghost-seg" style="flex-grow:${b.CF}" title="Co-financed: ${chfK(b.CF)}"></span><span style="flex-grow:${Math.max(0, span - b.T - b.CF)};background:transparent"></span>`;
    $("#ceiling").style.left = `${100 * S.cap / span}%`; $("#ceiling-label").textContent = `ceiling ${chfK(S.cap)}`;
    $("#budget-legend").innerHTML = segs.map(([l, v, c]) => `<span><i style="background:var(${c})"></i>${l} ${chfK(v)}</span>`).join("") + `<span><i style="background:var(--surface-2);border:1px solid var(--muted)"></i>Co-financed, outside the fund ${chfK(b.CF)}</span>`;
    const pip = (ok, t) => `<span><i style="background:${ok ? "var(--good)" : "var(--crit)"}">${ok ? "✓" : "✕"}</i>${t}</span>`;
    $("#budget-pips").innerHTML = [pip(b.T <= S.cap, `within the ${chfK(S.cap)} ceiling`), pip(b.R / b.NS <= 0.35, `preparation ${pct(b.R / b.NS)} of Red Cross funds (max 35%)`),
      pip((b.R + b.P) / b.T <= 0.65, `preparation + supplies ${pct((b.R + b.P) / b.T)} (max 65%)`), pip(b.E / b.T >= 0.35, `early action ${pct(b.E / b.T)} (min 35%)`),
      pip(b.people >= (S.cap > 300000 ? 10000 : 2000), `${fmt(b.people)} people per activation (min ${S.cap > 300000 ? "10,000" : "2,000"})`)].join("");
    $("#budget-note").innerHTML = `One activation is budgeted; a second is funded after the first is reported. Not included: the national alarm hardware (cell broadcast alone is estimated at CHF 1.3–2.2 M). Exchange rate ${FX} NPR per CHF.`;
    tableBudget(b);
    refresh();
  }
  function tableBudget(b) {
    const show = (l) => S.cof || l.phase !== "cofin"; const lab = { readiness: "preparation", prepos: "supplies", early: "early action", ifrc: "IFRC", cofin: "co-financed" };
    table("#tbl-budget", ["Line", "Kind", "#Quantity", "#Unit (CHF)", "#Total (CHF)", "Basis"], b.L.filter(show).map((l) => `<tr><td>${esc(l.name)}</td><td class="small">${lab[l.phase]}</td><td class="num">${fmt(l.q, l.q % 1 ? 1 : 0)}</td><td class="num">${fmt(l.unitShown, l.unitShown < 10 ? 2 : 0)}</td><td class="num">${fmt(l.total)}</td><td class="small">${l.est ? "<i>assumption</i> · " : ""}${esc(l.basis)}</td></tr>`).concat([`<tr><td><b>Emergency fund total</b></td><td></td><td></td><td></td><td class="num"><b>${fmt(b.T)}</b></td><td></td></tr>`, `<tr><td><b>Co-financed</b></td><td></td><td></td><td></td><td class="num"><b>${fmt(b.CF)}</b></td><td class="small">plus the national alarm hardware</td></tr>`]));
  }
  function bindCost() {
    $("#b-hh").addEventListener("input", (e) => { S.hh = +e.target.value; save(); renderCost(); });
    $("#b-cash").addEventListener("input", (e) => { S.cash = +e.target.value; save(); renderCost(); });
    $("#b-corr").addEventListener("input", (e) => { S.corr = +e.target.value; save(); renderCost(); });
    $("#b-cof").addEventListener("change", (e) => { S.cof = e.target.checked; save(); tableBudget(budget()); });
  }

  // ------------------------------------------------------------------ chapter 8: decisions
  let decI = 0;
  function recOf(d) { return d.options.findIndex((o) => o.rec); }
  function renderDecisions() {
    C.decisions.forEach((d) => { if (S.decisions[d.id] == null) S.decisions[d.id] = recOf(d); });
    const d = C.decisions[decI]; const chosen = S.decisions[d.id];
    const b = budget(), rt = rates(); const ev = { fc: "≈ 2.2", fc_obs: "≈ 1.2", obs: "< 1, often late" }[S.evac];
    const w = warnAt(/Syabrubesi/);
    $("#stepper").innerHTML = `<div class="dec"><div class="dec-nav">${C.decisions.map((x, i) => `<button type="button" data-j="${i}" class="${i === decI ? "cur" : ""} ${S.decisions[x.id] != null ? "done" : ""}" aria-label="Decision ${i + 1}">${i + 1}</button>`).join("")}</div>
      <h3>${d.q}</h3><p class="why">${d.why}</p>
      <div class="opts">${d.options.map((o, i) => `<button type="button" class="opt" data-o="${i}" aria-pressed="${chosen === i}">${o.rec ? '<span class="rec">Recommended</span>' : ""}<b>${o.label}</b><small>${o.text}</small></button>`).join("")}</div>
      <div class="dec-foot"><button type="button" class="btn" id="dec-prev" ${decI === 0 ? "disabled" : ""}>← Back</button>
        <span><button type="button" class="btn" id="dec-reset">Reset to recommended</button> <button type="button" class="btn" id="dec-export">Copy my protocol</button></span>
        <button type="button" class="btn primary" id="dec-next">${decI === C.decisions.length - 1 ? "Done" : "Next →"}</button></div></div>
      <aside class="conseq"><h4>Your protocol</h4>
        <div><b>${fmt(rt.dref * S.years, 1)}</b><span>emergency-fund activations expected in ${S.years} years (allowed: ${S.acts})</span></div>
        <div><b>${chfK(b.T)}</b><span>from the fund, ceiling ${chfK(S.cap)}${b.T > S.cap ? " — over the ceiling" : ""}</span></div>
        <div><b>${chfK(b.CF)}</b><span>co-financed by others</span></div>
        <div><b>${fmt(b.people)}</b><span>people reached with cash per activation</span></div>
        <div><b>${ev}</b><span>evacuation requests per district per decade</span></div>
        <div><b>${w == null ? "–" : fmt(w) + " min"}</b><span>warning at Syabrubesi in a 2026-type event</span></div></aside>`;
    $$("#stepper .dec-nav button").forEach((x) => x.addEventListener("click", () => { decI = +x.dataset.j; renderDecisions(); }));
    $$("#stepper .opt").forEach((x) => x.addEventListener("click", () => { const o = d.options[+x.dataset.o]; S.decisions[d.id] = +x.dataset.o; Object.assign(S, o.set); if (o.set.delay != null) $("#lt-delay").value = o.set.delay; save(); afterDecision(); }));
    $("#dec-prev").addEventListener("click", () => { decI = Math.max(0, decI - 1); renderDecisions(); });
    $("#dec-next").addEventListener("click", () => { decI = Math.min(C.decisions.length - 1, decI + 1); renderDecisions(); });
    $("#dec-reset").addEventListener("click", () => { C.decisions.forEach((x) => { const o = x.options[recOf(x)]; S.decisions[x.id] = recOf(x); Object.assign(S, o.set); }); Object.assign(S, { hh: DEFAULTS.hh, cash: DEFAULTS.cash }); $("#lt-delay").value = S.delay; save(); afterDecision(); });
    $("#dec-export").addEventListener("click", async (e) => { const md = protocolMarkdown(); try { await navigator.clipboard.writeText(md); e.target.textContent = "Copied"; } catch (err) { e.target.textContent = "Copy blocked"; } setTimeout(() => { e.target.textContent = "Copy my protocol"; }, 2000); });
  }
  function afterDecision() { renderCost(); renderLeadtime(false); initDialLimit(); renderDecisions(); }
  function initDialLimit() { if (!D.robust) return; const lim = S.acts / S.years; const dial = D.robust.dial; const idx = d3.max(dial.map((d, i) => d.acts_per_year <= lim + 1e-9 ? i : -1)); const pos = `${100 * idx / (dial.length - 1)}%`; $("#dial-limit").style.left = `calc(${pos} - 1px)`; $("#dial-limit-label").style.left = pos; $("#dial-limit-label").textContent = `fund limit (${S.acts} in ${S.years} yrs)`; }
  function protocolMarkdown() {
    const b = budget(), rt = rates();
    return `# Fictional EAP · Nepal flash floods: my protocol\n\n${C.decisions.map((d) => `- **${d.q}** ${d.options[S.decisions[d.id]]?.label}`).join("\n")}\n\n- Emergency fund: ${chfK(b.T)} (ceiling ${chfK(S.cap)}); co-financed ${chfK(b.CF)}\n- ${fmt(S.hh)} registered households × NPR ${fmt(S.cash)}; river watchers in ${S.corr} corridors\n- Expected fund activations: ${fmt(rt.dref * S.years, 1)} in ${S.years} years\n- Alarm: ${S.delay} min from detection to phones\n\nPage: ${location.href.split("#")[0]}\n`;
  }

  // ------------------------------------------------------------------ appendix
  function initAppendix() {
    const aps = $$("#ap-panels .ap");
    $("#ap-tabs").innerHTML = aps.map((a, i) => `<button type="button" role="tab" data-t="${i}" aria-selected="${i === 0}">${a.dataset.tab}</button>`).join("");
    const show = (i) => { aps.forEach((a, j) => { a.hidden = j !== i; }); $$("#ap-tabs button").forEach((b, j) => b.setAttribute("aria-selected", String(j === i))); setTimeout(() => MAPS.forEach((m) => m.resize && m.resize()), 50); };
    $$("#ap-tabs button").forEach((b) => b.addEventListener("click", () => show(+b.dataset.t))); show(0);
    // hazard
    table("#tbl-history", ["Date", "Event", "Type", "River", "#Dead", "#Missing", "Warning at the time"], D.events.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((e) => `<tr><td class="num">${esc(e.date)}</td><td>${esc(e.name)}</td><td class="small">${esc(e.type)}</td><td class="small">${esc(e.river)}</td><td class="num">${esc(e.deaths)}</td><td class="num">${esc(e.missing)}</td><td class="small">${esc(e.warning_lead_time)}</td></tr>`));
    table("#tbl-lakes", ["#", "Lake", "Country", "Basin", "ICIMOD rank", "#People < 25 m", "#Hydropower sites"], D.lakes.map((l, i) => `<tr><td class="num">${i + 1}</td><td class="small">${esc(l.name)}</td><td class="small">${esc(l.country)}</td><td class="small">${esc(l.basin)}</td><td>${esc(l.rank)}</td><td class="num">${fmt(l.pop_25m_120km)}</td><td class="num">${fmt(l.hydropower)}</td></tr>`));
    const band = { v: "25" };
    const corrTable = () => table("#tbl-corridors", ["Corridor", "Source", "#River km", "#People", "#Buildings", "#Hydropower", "#Bridges", "#Schools", "#Health", "#Lodges"], D.corridors.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="small">${esc(c.source_label)}</td><td class="num">${fmt(c.length_km)}</td><td class="num">${fmt(c.totals["pop_hand_" + band.v])}</td><td class="num">${fmt(c.totals["bld_hand_" + band.v])}</td><td class="num">${fmt((c.totals.hydropower || 0) + (c.totals.headworks || 0))}</td><td class="num">${fmt(c.totals.bridge || 0)}</td><td class="num">${fmt(c.totals.school || 0)}</td><td class="num">${fmt(c.totals.health || 0)}</td><td class="num">${fmt(c.totals.lodging || 0)}</td></tr>`));
    $("#hand-seg").innerHTML = ["10", "25", "50"].map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === band.v}">≤ ${v} m above the river</button>`).join("");
    $$("#hand-seg button").forEach((b) => b.addEventListener("click", () => { band.v = b.dataset.v; $$("#hand-seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); corrTable(); }));
    corrTable();
    const ip = D.impacts.impact_pathways || D.impacts;
    table("#tbl-impacts", ["Impact", "Who is most exposed", "How it happens", "Time available"], ip.map((i) => `<tr><td><b>${esc(i.impact || i.name)}</b></td><td class="small">${esc([].concat(i.vulnerable_groups || []).join("; "))}</td><td class="small">${esc(i.pathway || "")}</td><td class="small">${esc(i.lead_time_window || "")}</td></tr>`));
    chartSeason(); chartTerrain();
    // evidence
    renderRobust(); bindWorkbench(); renderWorkbench();
    $("#methods-list").innerHTML = C.methods.map(([h, t]) => `<dt>${h}</dt><dd>${t}</dd>`).join("");
    const menu = Array.isArray(D.menu) ? D.menu : (D.menu?.products || []);
    const tested = { "ECMWF IFS ENS (open data, real time)": "skill 2024–25, case studies", "NOAA GEFS v12 (operational and reforecast)": "backtest 2011–19" };
    table("#tbl-menu", ["Product", "Provider", "Lead time", "Access", "Steps", "Known skill in Nepal", "Tested here", "Source"], menu.map((f) => `<tr><td><b>${esc(f.name)}</b></td><td class="small">${esc(f.provider)}</td><td class="small">${esc(f.lead_time)}</td><td class="small">${esc(f.access)}</td><td class="small">${esc([].concat(f.fit_for_rung || []).join(", "))}</td><td class="small">${esc(f.known_skill_nepal)}</td><td class="small">${tested[f.name] ? "✓ " + tested[f.name] : ""}</td><td class="small">${host(f.source_urls)}</td></tr>`));
    // actions
    const CATS = [["minutes", "Minutes"], ["hours", "Hours"], ["1-3 days", "1–3 days"], ["weeks", "Weeks"], ["seasonal", "Every year"]];
    const om = D.inst?.operational_matrix || [];
    $("#matrix").innerHTML = CATS.map(([c, l]) => `<div class="mcol"><header>${l}</header>${D.actions.actions.filter((a) => a.category === c).map((a) => { const own = OWN(om.find((x) => x.id === a.id)?.owner_type); return `<div class="mcard"><b>${esc(C.actionNames?.[a.id] || a.name.split("(")[0])}</b><span class="chips"><span class="chip ${own}">${{ rc: "Red Cross", gov: "Government", op: "Operators" }[own]}</span><span class="chip">evidence: ${a.evidence_strength}</span></span></div>`; }).join("")}</div>`).join("");
    table("#tbl-opmatrix", ["Action", "Sector", "Standards", "Owner", "In fund budget", "Protection and inclusion"], om.map((r) => { const a = D.actions.actions.find((x) => x.id === r.id); return `<tr><td>${esc((a?.name || r.name || "").split("(")[0])}</td><td class="small">${esc(r.ifrc_sector)}</td><td class="small">${esc(r.standard)}</td><td class="small">${esc(r.owner_type)}</td><td>${r.in_dref_budget ? "yes" : "—"}</td><td class="small">${esc(r.pgi_note)}</td></tr>`; }));
    table("#tbl-cash", ["Topic", "Design", "Source"], (D.inst?.cash_design || []).map((c) => `<tr><td><b>${esc(c.topic)}</b></td><td class="small">${esc(c.statement || "")}</td><td class="small">${host(c.source_url)}${check(c.verify)}</td></tr>`));
    const selP = $("#pal-corr"); selP.innerHTML = `<option value="">All corridors</option>` + D.corridors.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    const palTable = () => table("#tbl-palikas", ["Municipality", "District", "Corridor", "#People < 10 m", "#People < 25 m", "#Households"], (D.palikas || []).filter((r) => !selP.value || r.corridor === selP.value).sort((a, b) => b.pop_25m - a.pop_25m).map((r) => `<tr><td>${esc(r.palika)}</td><td class="small">${esc(r.district)}</td><td class="small">${esc(r.corridor)}</td><td class="num">${fmt(r.pop_10m)}</td><td class="num">${fmt(r.pop_25m)}</td><td class="num">${fmt(r.hh_25m)}</td></tr>`));
    selP.addEventListener("change", palTable); palTable();
    $("#readiness-list").innerHTML = C.readiness.map((t) => `<li>${t}</li>`).join("");
    $("#prepos-list").innerHTML = C.prepositioning.map((t) => `<li>${t}</li>`).join("");
    // operations
    computeKeys();
    $("#trigger-list").innerHTML = C.triggers.map(([h, t]) => `<dt>${h}</dt><dd>${tpl(t)}</dd>`).join("");
    table("#tbl-orders", ["Decision", "Who has the authority", "Legal basis", "Red Cross role", "What must be agreed in advance"], (D.inst?.who_orders || []).map((o) => `<tr><td><b>${esc(o.decision)}</b></td><td class="small">${esc(o.legal_body)}</td><td class="small">${esc(o.legal_basis)}${check(o.verify)}</td><td class="small">${esc(o.nrcs_role)}</td><td class="small">${esc(o.pre_agreement)}</td></tr>`));
    const ownName = { rc: "Red Cross", gov: "Government", op: "Operators" };
    table("#tbl-sop", ["When", "Who", "What", "Within"], C.sop.map((r) => `<tr><td class="small">${r[0]}</td><td><span class="chip ${r[4]}">${ownName[r[4]]}</span> ${r[1]}</td><td class="small">${r[2]}</td><td class="num">${r[3]}</td></tr>`));
    table("#tbl-dam", ["Step", "Who", "What", "Time"], C.dam.map((r) => `<tr><td><b>${r[0]}</b></td><td class="small">${r[1]}</td><td class="small">${r[2]}</td><td class="num">${r[3]}</td></tr>`));
    const ms = D.inst?.messages; const txt = (v) => typeof v === "string" ? v : (v?.text || "");
    if (ms) { $("#msg-gallery").innerHTML = (ms.texts || []).map((t) => `<div class="msg"><b>${esc(t.rung.replace(/Rung 3a - prepare/i, "Step 2 · get ready").replace(/Rung/g, "Step"))}</b><div><span class="lang">English</span><div>${esc(t.english)}</div></div><div><span class="lang">नेपाली</span><div>${esc(txt(t.nepali))}</div></div>${t.chinese ? `<div><span class="lang">中文</span><div>${esc(txt(t.chinese))}</div></div>` : ""}</div>`).join("");
      $("#msg-note").textContent = "Messages must fit about 90 Latin or 40 Nepali characters per cell-broadcast screen. Tamang, Sherpa, Gurung, Yolmo and other versions are to be written by native speakers."; }
    const fw = D.inst?.four_w || [];
    table("#tbl-4w", ["District", "Province", "Corridor", "Key actors outside the Red Cross", "Main languages", "Steps"], fw.map((r) => `<tr><td><b>${esc(r.district)}</b></td><td class="small">${esc(r.province)}</td><td class="small">${esc(r.corridor || "")}</td><td class="small">${esc(r.key_non_ns_actors)}</td><td class="small">${esc(Array.isArray(r.main_languages) ? r.main_languages.join(", ") : r.main_languages)}</td><td class="small">${esc(r.rung_coverage).replace(/rung/gi, "step")}</td></tr>`));
    table("#tbl-timeline", ["Time (Nepal)", "Where", "What", "Source"], (D.event2026.timeline || []).map((t) => `<tr><td class="small">${esc(t.time_npt)}</td><td class="small">${esc(t.place)}</td><td class="small">${esc(t.what)}</td><td class="small">${host(t.source_url)}</td></tr>`));
    table("#tbl-toll", ["Figure", "Used here", "Other reported values", "Why this one"], (D.event2026.summary_stats || []).map((s) => `<tr><td>${esc(s.metric.replace(/_/g, " "))}</td><td class="small">${esc(typeof s.chosen === "object" ? JSON.stringify(s.chosen).replace(/[{}"]/g, "").replace(/,/g, ", ") : s.chosen)}${s.asof ? ` (${esc(s.asof)})` : ""}</td><td class="small">${esc(s.alternatives ? Object.entries(s.alternatives).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("; ") : "")}</td><td class="small">${esc(s.reason || "")}</td></tr>`));
    // monitoring
    $("#meal-list").innerHTML = C.meal.map(([h, t]) => `<dt>${h}</dt><dd>${t}</dd>`).join("");
    table("#tbl-indicators", ["Area", "Indicator", "Target", "Source"], C.indicators.map((r) => `<tr><td><b>${r[0]}</b></td><td class="small">${r[1]}</td><td class="small">${r[2]}</td><td class="small">${r[3]}</td></tr>`));
    table("#tbl-capacity", ["Topic", "Known from public sources", "To be completed by the National Society"], (D.inst?.ns_capacity?.items || []).map((r) => `<tr><td><b>${esc(r.topic)}</b></td><td class="small">${esc(r.known_public)}</td><td class="small">${esc(r.to_complete)}</td></tr>`));
    table("#tbl-endorse", ["#Step", "Who", "What they agree", "When"], (D.inst?.endorsement || []).map((r) => `<tr><td class="num">${r.step}</td><td class="small"><b>${esc(r.who)}</b></td><td class="small">${esc(r.what_they_agree)}</td><td class="small">${esc(String(r.timing).replace(/\s*\(Gate G\d\)/, ""))}</td></tr>`));
    table("#tbl-risks", ["Risk", "Likelihood", "Mitigation"], C.risks.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="small">${r[2]}</td></tr>`));
    // data and sources
    $("#real-invented").innerHTML = `<div><h4>Real</h4><ul class="body">${C.realInvented.real.map((t) => `<li>${t}</li>`).join("")}</ul></div><div><h4>Invented</h4><ul class="body">${C.realInvented.invented.map((t) => `<li>${t}</li>`).join("")}</ul></div>`;
    table("#tbl-data", ["Dataset", "Used for", "Licence"], D.numbers.sources.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></td><td class="small">${esc(s.use)}</td><td class="small">${esc(s.licence)}</td></tr>`));
    $("#limits").innerHTML = C.limits.map((t) => `<li>${t}</li>`).join("");
    $("#img-credits").innerHTML = (D.images || []).map((c) => `<li>${esc(c.caption)} Photo: ${esc(c.author)}, “${esc(c.title)}”, <a href="${esc(c.license_url || c.source)}" target="_blank" rel="noopener">${esc(c.license)}</a>, <a href="${esc(c.source)}" target="_blank" rel="noopener">source</a> (${esc(c.modified)}).</li>`).join("");
    $("#refs").innerHTML = D.refs.map((r) => `<li>${r.html}</li>`).join("");
    $("#glossary-list").innerHTML = Object.entries(C.glossary).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    $("#btn-glossary").addEventListener("click", () => openDrawer("ap-glossary"));
  }
  function chartSeason() {
    const b = D.bipad.by_month; const M = "J F M A M J J A S O N D".split(" ");
    const [svg, w] = svgBox("#chart-season", 200); if (!svg) return;
    const m = { l: 40, r: 8, t: 10, b: 22 };
    const x = d3.scaleBand().domain(d3.range(12)).range([m.l, w - m.r]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(b.flood_incidents)]).nice().range([200 - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r))).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${200 - m.b})`).call(d3.axisBottom(x).tickFormat((i) => M[i]).tickSizeOuter(0));
    svg.append("g").selectAll("rect").data(b.flood_incidents).join("rect").attr("x", (d, i) => x(i)).attr("width", x.bandwidth()).attr("y", (d) => y(d)).attr("height", (d) => y(0) - y(d)).attr("rx", 3).attr("fill", (d, i) => i >= 5 && i <= 8 ? css("--rain") : css("--line"));
  }
  function chartTerrain() {
    const t = D.numbers.terrain; if (!t) return;
    const [svg, w] = svgBox("#chart-terrain", 200); if (!svg) return;
    const m = { l: Math.min(170, w * 0.4), r: 110, t: 10, b: 10 };
    const y = d3.scaleBand().domain(t.bands.map((r) => r.band)).range([m.t, 200 - m.b]).padding(0.3);
    const x = d3.scaleLinear().domain([0, d3.max(t.bands, (r) => r.dead_missing)]).range([m.l, w - m.r]);
    svg.append("g").selectAll("rect").data(t.bands).join("rect").attr("x", m.l).attr("y", (r) => y(r.band)).attr("height", y.bandwidth()).attr("width", (r) => x(r.dead_missing) - m.l).attr("rx", 3).attr("fill", (r, i) => i === 0 ? css("--observed") : css("--mass"));
    svg.append("g").selectAll("text").data(t.bands).join("text").attr("class", "lbl").attr("x", m.l - 8).attr("y", (r) => y(r.band) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text((r) => r.band);
    svg.append("g").selectAll("text.v").data(t.bands).join("text").attr("x", (r) => x(r.dead_missing) + 6).attr("y", (r) => y(r.band) + y.bandwidth() / 2 + 4).text((r) => `${fmt(r.dead_missing)} dead or missing`);
    $("#terrain-note").textContent = t.note;
  }
  function renderRobust() {
    const rb = D.robust; if (!rb) return;
    const al = rb.insample.alert_strict, alg = rb.insample.alert_generous, ca = rb.insample.cash_strict, cv = rb.cv, bs = rb.bootstrap, ch = rb.chance;
    $("#robust-kpis").innerHTML = [
      [`${alg.caught} / ${alg.events}`, "get-ready alert, generous score (any alert during a 10-day cluster)"],
      [`${al.caught} / ${al.events}`, `strict score (${pct(al.toll_caught / al.toll)} of the toll; 90% range of catch rate ${bs.alert.catch_rate_90.map(pct).join("–")})`],
      [`${cv.alert.caught} / ${cv.alert.events}`, "strict, with the setting chosen without the tested year"],
      [`${ch.alert.expected_caught}`, `expected by chance (p ${ch.alert.p_value < 0.001 ? "< 0.001" : "= " + ch.alert.p_value})`],
      [`${ca.caught} / ${ca.events}`, `rain trigger within the fund limit (chance ${ch.cash.expected_caught}, p = ${ch.cash.p_value})`],
    ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
    table("#tbl-robust-events", ["First report", "Last report", "#Dead and missing", "Most affected districts", "Get-ready alert", "Rain cash trigger"], rb.events.map((e) => `<tr><td class="num">${e.start}</td><td class="num">${e.end}</td><td class="num">${e.toll}</td><td class="small">${e.districts.map(esc).join(", ")}</td><td>${e.alert ? `<span style="color:var(--good-ink)">${e.alert.lead_days} day(s) ahead</span>` : '<span class="muted">missed</span>'}</td><td>${e.cash ? `<span style="color:var(--good-ink)">${e.cash.lead_days} day(s) ahead</span>` : '<span class="muted">missed</span>'}</td></tr>`));
    $("#robust-note").textContent = "Strict scoring chains fatal district-days less than four days apart into one event and counts it only if an alert started up to two days before the first report, in an affected or neighbouring district. Settings were chosen on these years; the out-of-sample line shows how much of the result is luck.";
  }
  // workbench (generous, every setting)
  function trigResult() { return D.trigger.results.find((r) => r.src === S.src && r.level === S.level && r.region === S.region && r.k === S.k && r.m === S.m && (S.src === "obs" ? r.period === "2011-2019" : r.lead === S.lead && Math.abs(r.p - S.p) < 1e-6)); }
  function bindWorkbench() {
    const ks = D.trigger.ks, ps = D.trigger.ps;
    const sync = () => { $("#trig-src").value = S.src; $("#trig-lead").value = S.lead; $("#trig-level").value = S.level; $("#trig-region").value = S.region; $("#trig-m").value = S.m;
      $("#trig-freq").value = ks.indexOf(S.k); $("#trig-prob").value = ps.indexOf(S.p); $("#trig-freq-o").textContent = kPlain(S.k); $("#trig-prob-o").textContent = `${Math.round(S.p * 5)} of 5`; };
    bindWorkbench.sync = sync;
    [["trig-src", "src"], ["trig-level", "level"], ["trig-region", "region"]].forEach(([id, k]) => $("#" + id).addEventListener("change", (e) => { S[k] = e.target.value; save(); renderWorkbench(); }));
    [["trig-lead", "lead"], ["trig-m", "m"]].forEach(([id, k]) => $("#" + id).addEventListener("change", (e) => { S[k] = +e.target.value; save(); renderWorkbench(); }));
    $("#trig-freq").addEventListener("input", (e) => { S.k = ks[+e.target.value]; save(); renderWorkbench(); });
    $("#trig-prob").addEventListener("input", (e) => { S.p = ps[+e.target.value]; save(); renderWorkbench(); });
  }
  let trigMapObj;
  function renderWorkbench() {
    bindWorkbench.sync(); const r = trigResult();
    if (!r) { $("#trig-stats").innerHTML = "<div><span>No result for this combination.</span></div>"; return; }
    $("#trig-stats").innerHTML = [[pct(r.pod), `of ${fmt(r.events)} district loss days flagged`], [pct(r.far), "of district alerts with no recorded loss"], [fmt(r.protocol_act_per_year, 2), "protocol alerts a year"], [`${r.major_caught} / ${r.major_events}`, "major disasters, generous score"]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
    $("#trig-statement").textContent = S.src === "obs" ? `Observed rain above the level each district exceeds on ${kPlain(S.k)}.` : `${Math.round(S.p * 5)} of 5 forecast runs predict, ${S.lead} day(s) ahead, rain above ${kPlain(S.k)} in at least ${S.m} district(s).`;
    const R = D.trigger.results.filter((x) => x.src === S.src && x.level === S.level && x.region === S.region && x.m === S.m && (S.src === "obs" ? x.period === "2011-2019" : x.lead === S.lead));
    const [svg, w] = svgBox("#chart-roc", 280);
    if (svg) { const m = { l: 44, r: 10, t: 10, b: 34 }; const x = d3.scaleLinear().domain([0, 1]).range([m.l, w - m.r]); const y = d3.scaleLinear().domain([0, 0.5]).range([280 - m.b, m.t]);
      svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")).tickSize(-(w - m.l - m.r))).call((g) => g.select(".domain").remove());
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${280 - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")).tickSizeOuter(0));
      svg.append("text").attr("x", w - m.r).attr("y", 280 - 4).attr("text-anchor", "end").text("share of alerts with no recorded loss →");
      svg.append("text").attr("x", m.l + 4).attr("y", m.t + 10).text("↑ share of loss days flagged");
      svg.append("g").selectAll("circle").data(R).join("circle").attr("cx", (d) => x(d.far)).attr("cy", (d) => y(Math.min(0.5, d.pod))).attr("r", (d) => d === r ? 8 : 5).attr("fill", (d) => d === r ? css("--accent") : css("--surface")).attr("stroke", css("--rain")).attr("stroke-width", 2)
        .on("mousemove", (e, d) => showTip(e, `${kPlain(d.k)}${d.p ? `, ${Math.round(d.p * 5)}/5 runs` : ""}<br>${pct(d.pod)} flagged · ${pct(d.far)} empty · ${fmt(d.protocol_act_per_year, 2)}/yr`)).on("mouseleave", hideTip)
        .on("click", (e, d) => { S.k = d.k; if (d.p) S.p = d.p; save(); renderWorkbench(); }); }
    const per = r.per_district_year || {};
    const paint = () => { const fc = D.districts; fc.features.forEach((f) => { f.properties.rate = per[f.properties.district] || 0; });
      if (trigMapObj.getSource("d")) trigMapObj.getSource("d").setData(fc);
      else { trigMapObj.addSource("d", { type: "geojson", data: fc });
        trigMapObj.addLayer({ id: "d", type: "fill", source: "d", paint: { "fill-color": ["interpolate", ["linear"], ["get", "rate"], 0, css("--surface"), 0.1, "#cde2fb", 0.3, "#86b6ef", 0.6, "#2a78d6", 1.2, "#104281"], "fill-opacity": 0.85 } });
        trigMapObj.addLayer({ id: "dl", type: "line", source: "d", paint: { "line-color": css("--line"), "line-width": 0.6 } });
        trigMapObj.on("mousemove", "d", (e) => { const p = e.features[0].properties; showTip(e.originalEvent, `<b>${esc(p.district)}</b><br>${fmt(p.rate, 2)} alerts a year`); }); trigMapObj.on("mouseleave", "d", hideTip); } };
    if (!trigMapObj) { trigMapObj = newMap("map-trig", { center: [84.1, 28.3], zoom: 5.3 }); MAPS.push(trigMapObj); trigMapObj.on("load", paint); } else if (trigMapObj.loaded()) paint(); else trigMapObj.once("load", paint);
  }

  // ------------------------------------------------------------------ glossary annotation
  function annotateGlossary() {
    const terms = Object.keys(C.glossary).sort((a, b) => b.length - a.length);
    const rx = new RegExp(`\\b(${terms.map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`, /[a-z]/.test(terms.join("")) ? "i" : "");
    $$("main > section.chapter:not(.appendix)").forEach((sec) => {
      const used = new Set();
      $$("p, li, dd, .story span, .gstep dd, .rule span", sec).forEach((el) => {
        if (el.closest(".deeper, .tool, button, .hz small")) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((n) => {
          if (n.parentNode.closest(".g, a, button")) return;
          const m = n.nodeValue.match(rx); if (!m) return;
          const key = terms.find((t) => t.toLowerCase() === m[1].toLowerCase()); if (!key || used.has(key)) return;
          used.add(key);
          const span = document.createElement("span"); span.className = "g"; span.dataset.g = key; span.tabIndex = 0; span.textContent = m[1];
          const after = n.splitText(m.index); after.nodeValue = after.nodeValue.slice(m[1].length); n.parentNode.insertBefore(span, after);
        });
      });
    });
  }

  // ------------------------------------------------------------------ review mode
  const VERDICTS = [["ok", "Met"], ["q", "Partly"], ["no", "Not met"], ["na", "N/A"]];
  const RV = store.get("review", { items: {}, name: "" });
  function initReview() {
    const btn = $("#btn-review"), fab = $("#review-fab"), rd = $("#review-drawer");
    const set = (on) => { document.body.classList.toggle("review", on); btn.setAttribute("aria-pressed", String(on)); fab.hidden = !on; store.set("review-on", on); };
    btn.addEventListener("click", () => set(!document.body.classList.contains("review"))); set(!!store.get("review-on", false));
    const openR = (i) => { closeDrawer(true); rd.classList.add("open"); rd.setAttribute("aria-hidden", "false"); $("#scrim").hidden = false; if (i != null) $(`#crit-${i}`)?.scrollIntoView({ block: "center" }); };
    fab.addEventListener("click", () => openR()); $("#review-close").addEventListener("click", () => closeDrawer());
    // chips at chapter ends
    C.checklist.forEach(([c, , sec], i) => { const host2 = $(`#${sec} .deeper`) || $(`#${sec} .wrap`); if (!host2) return; const b = document.createElement("button"); b.type = "button"; b.className = "crit-chip"; b.textContent = `Criterion ${i + 1}: ${c}`; b.addEventListener("click", () => openR(i)); host2.appendChild(b); });
    $("#reviewer").value = RV.name || "";
    $("#checklist").innerHTML = C.checklist.map(([c, w, sec], i) => { const it = RV.items[i] || {};
      return `<div class="crit" id="crit-${i}"><b>${i + 1}. ${c}</b><small>${w} <a href="#${sec}">Go to section</a></small>
        <div class="verdict">${VERDICTS.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${it.v === v}">${l}</button>`).join("")}</div>
        <textarea placeholder="Note or condition" aria-label="Note for ${esc(c)}">${esc(it.note || "")}</textarea></div>`; }).join("");
    $$(".crit").forEach((row, i) => {
      $$(".verdict button", row).forEach((b) => b.addEventListener("click", () => { RV.items[i] = { ...(RV.items[i] || {}), v: RV.items[i]?.v === b.dataset.v ? null : b.dataset.v }; $$(".verdict button", row).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === RV.items[i].v))); store.set("review", RV); progress(); }));
      $("textarea", row).addEventListener("input", (e) => { RV.items[i] = { ...(RV.items[i] || {}), note: e.target.value }; store.set("review", RV); });
      $("a", row).addEventListener("click", () => closeDrawer());
    });
    $("#reviewer").addEventListener("input", (e) => { RV.name = e.target.value; store.set("review", RV); });
    const md = () => { const lab = Object.fromEntries(VERDICTS); return `# Review: Fictional EAP · Nepal flash floods\n\nReviewer: ${RV.name || "_unnamed_"} · ${new Date().toISOString().slice(0, 10)}\n\n| # | Criterion | Rating | Note |\n|---|---|---|---|\n${C.checklist.map(([c], i) => `| ${i + 1} | ${c} | ${lab[RV.items[i]?.v] || "–"} | ${(RV.items[i]?.note || "").replace(/\n/g, " ").replace(/\|/g, "/")} |`).join("\n")}\n\n${protocolMarkdown()}`; };
    $("#review-copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(md()); $("#review-status").textContent = "Copied as Markdown."; } catch (e) { $("#review-status").textContent = "Copy blocked; use Download."; } });
    $("#review-dl").addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md()], { type: "text/markdown" })); a.download = `EAP-review-${new Date().toISOString().slice(0, 10)}.md`; document.body.appendChild(a); a.click(); a.remove(); $("#review-status").textContent = "Downloaded."; });
    $("#review-clear").addEventListener("click", (e) => { if (e.target.dataset.armed !== "1") { e.target.dataset.armed = "1"; e.target.textContent = "Click again"; setTimeout(() => { e.target.dataset.armed = ""; e.target.textContent = "Clear"; }, 3000); return; } RV.items = {}; store.set("review", RV); initReviewList(); });
    const initReviewList = () => { $$(".crit").forEach((row, i) => { $$(".verdict button", row).forEach((b) => b.setAttribute("aria-pressed", "false")); $("textarea", row).value = ""; }); progress(); };
    const progress = () => { const n = Object.values(RV.items).filter((x) => x && x.v).length; $("#review-progress").textContent = `${n} / ${C.checklist.length}`; $("#review-fab-n").textContent = `${n}/${C.checklist.length}`; };
    progress();
  }

  // ------------------------------------------------------------------ rerender on resize/theme
  function rerender() {
    if (!D.events) return;
    const safe = (f) => { try { f(); } catch (e) { console.error(e); } };
    [chartWhen, () => chartChain(), chartHistory, chartSkill, chartCase, chartSeason, chartTerrain, () => renderLeadtime(false), renderWorkbench].forEach(safe);
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    const files = { numbers: "numbers.json", events: "events.json", event2026: "event_2026_langtang.json", bipad: "bipad_summary.json", corridors: "corridors.json", lakes: "lakes.json",
      trigger: "trigger_backtest.json", actions: "early_actions.json", impacts: "impact_pathways.json", districts: "districts.geojson", refs: "references.json", robust: "trigger_robustness.json",
      fcases: "forecast_cases.json", menu: "forecast_menu.json", inst: "institutions.json", palikas: "palikas.json", images: "images.json" };
    const keys = Object.keys(files);
    const res = await Promise.all(keys.map((k) => fetch("data/" + files[k]).then((r) => r.ok ? r.json() : null).catch(() => null)));
    keys.forEach((k, i) => { D[k] = res[i]; });
    D.lakes = (D.lakes || []).map((l) => { const o = { ...l }; ["lon", "lat", "pop_25m_120km", "pop_10m_120km", "hydropower", "bridges", "schools"].forEach((k) => { if (o[k] != null && o[k] !== "") o[k] = +o[k]; });
      if (typeof o.line === "string") { try { o.line = JSON.parse(o.line); } catch (e) { o.line = []; } } return o; }).sort((a, b) => b.pop_25m_120km - a.pop_25m_120km);
    (D.inst?.operational_matrix || []).filter((r) => r.name && !D.actions.actions.some((a) => a.id === r.id)).forEach((r) => D.actions.actions.push({ ...r }));
    const safe = (f) => { try { f(); } catch (e) { console.error(e); } };
    computeKeys();
    [initNav, initPrologue, refresh, chartWhen, initEvent, renderHazard, initDial, renderVillage, chartSkill, chartCase, initLeadtime, renderLinked, renderPeople, bindCost, renderCost, renderDecisions, initAppendix, initReview, annotateGlossary].forEach(safe);
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(rerender, 200); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rerender);
  }
  boot();
})();
