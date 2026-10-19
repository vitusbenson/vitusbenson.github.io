/* Fictional EAP · Nepal flash floods. Renders the protocol from data/*.json and content.js. */
(() => {
  "use strict";
  const C = window.EAP;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = (v, d = 0) => (v == null || Number.isNaN(v)) ? "–" : Number(v).toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
  const pct = (v) => v == null ? "–" : `${Math.round(v * 100)}%`;
  const chf = (v) => `CHF ${fmt(Math.round(v / 1000) * 1000)}`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("eap-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("eap-" + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // ------------------------------------------------------------------ state
  const S = Object.assign({
    src: "gefs", lead: 2, k: 2, p: 0.8, m: 1, level: "loss", region: "hill", tier: "alert",
    corr: 7, hh: 6000, cash: 8000, delay: 3, react: 10, cap: 950000, acts: 2, years: 5,
    dref: "lake_rain", evac: "fc_obs", cof: "show", off: [], decisions: {},
  }, store.get("state-v1", {}));
  const save = () => store.set("state-v1", S);
  const LAKE_RATE = 2 / 16; // dammed lakes with >= 12 h warning in the 2011-2026 catalogue (Jure 2014, Langtang barrier lakes 2026)
  let D = {}; // data

  // ------------------------------------------------------------------ tooltip
  const tip = $("#tip");
  function showTip(ev, html) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  // ------------------------------------------------------------------ theme
  function setTheme(t) {
    document.documentElement.dataset.theme = t; store.set("theme-v", t);
    try { localStorage.setItem("eap-theme", t); } catch (e) { /* ignore */ }
    rerenderCharts();
  }
  $("#theme-btn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(dark ? "light" : "dark");
  });

  // ------------------------------------------------------------------ TOC + scrollspy
  function buildToc() {
    const toc = $("#toc");
    toc.innerHTML = $$("main > section").map((s) =>
      `<li><a href="#${s.id}" data-sec="${s.id}"><span class="n">${s.dataset.n}</span><span class="t">${s.dataset.title}</span><i class="flag" data-flag="${s.id}"></i></a></li>`).join("");
    const links = $$("a", toc);
    const obs = new IntersectionObserver((ents) => {
      ents.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.dataset.sec === e.target.id)); });
    }, { rootMargin: "-40% 0px -55% 0px" });
    $$("main > section").forEach((s) => obs.observe(s));
  }

  // ------------------------------------------------------------------ numbers into text
  function fill(keys) {
    $$("[data-k]").forEach((el) => { const v = keys[el.dataset.k]; if (v != null) el.innerHTML = v; });
  }

  // ------------------------------------------------------------------ map helpers
  const TILE_S2 = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
  const TILE_DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  function baseStyle(kind) {
    const dark = isDark();
    return {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        s2: { type: "raster", tiles: [TILE_S2], tileSize: 256, maxzoom: 15, attribution: "Sentinel-2 cloudless 2016 © EOX (CC BY 4.0)" },
        dem: { type: "raster-dem", tiles: [TILE_DEM], tileSize: 256, encoding: "terrarium", maxzoom: 13, attribution: "Terrain Tiles (Mapzen/AWS)" },
        demt: { type: "raster-dem", tiles: [TILE_DEM], tileSize: 256, encoding: "terrarium", maxzoom: 13 },
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": css("--surface-2") } },
        ...(kind === "sat" ? [{ id: "s2", type: "raster", source: "s2", paint: { "raster-saturation": -0.25, "raster-brightness-max": dark ? 0.8 : 1 } }] : []),
        { id: "hs", type: "hillshade", source: "dem", paint: {
          "hillshade-shadow-color": dark ? "#000" : "#465350", "hillshade-highlight-color": dark ? "#3b4846" : "#ffffff",
          "hillshade-accent-color": dark ? "#111" : "#5d6b68", "hillshade-exaggeration": kind === "sat" ? 0.25 : 0.55 } },
      ],
    };
  }
  const isDark = () => document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  function mapStub(id, err) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<p class="note panel-pad">This map needs WebGL, which this browser could not start. All numbers and tables on the page work without it.</p>';
    console.warn("map unavailable", id, err);
    const noop = () => stub;
    const stub = { on: noop, once: noop, off: noop, addControl: noop, addSource: noop, addLayer: noop, setTerrain: noop, fitBounds: noop, flyTo: noop, loaded: () => false, getSource: () => null };
    return stub;
  }
  function newMap(id, opts = {}) {
    try { return realMap(id, opts); } catch (e) { return mapStub(id, e); }
  }
  function realMap(id, opts) {
    const m = new maplibregl.Map({
      container: id, style: baseStyle(opts.kind || "relief"), center: opts.center || [85.3, 28.0], zoom: opts.zoom || 7,
      pitch: opts.pitch || 0, bearing: opts.bearing || 0, attributionControl: { compact: true },
      cooperativeGestures: true, maxPitch: 75,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    return m;
  }
  const lineFeature = (coords, props = {}) => ({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } });
  const pointFC = (arr, f) => ({ type: "FeatureCollection", features: arr.map((a) => ({ type: "Feature", properties: f(a), geometry: { type: "Point", coordinates: [a.x ?? a.lon, a.y ?? a.lat] } })) });

  // ------------------------------------------------------------------ §01 event replay
  const T0 = 8 * 60 + 30; // 08:30 in minutes
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

  function arrivalFn(cor) {
    // Piecewise-linear arrival time (minutes after midnight) along chainage, from observations.
    const obs = (cor.observed_2026 || []).map((o) => ({ ch: o.ch, t: toMin(o.time), place: o.place })).sort((a, b) => a.ch - b.ch);
    return { obs, at(ch) {
      if (!obs.length) return NaN;
      if (ch <= obs[0].ch) return obs[0].t;
      for (let i = 1; i < obs.length; i++) if (ch <= obs[i].ch) {
        const a = obs[i - 1], b = obs[i]; return a.t + (b.t - a.t) * (ch - a.ch) / (b.ch - a.ch);
      }
      const a = obs[obs.length - 2], b = obs[obs.length - 1];
      return b.t + (b.t - a.t) * (ch - b.ch) / (b.ch - a.ch);
    }, chAt(t) {
      if (t <= obs[0].t) return obs[0].ch;
      for (let i = 1; i < obs.length; i++) if (t <= obs[i].t) {
        const a = obs[i - 1], b = obs[i]; return a.ch + (b.ch - a.ch) * (t - a.t) / (b.t - a.t);
      }
      return obs[obs.length - 1].ch;
    } };
  }

  let evMap, evScn = "actual", evTimer = null;
  function initEvent() {
    const cor = D.corridors.find((c) => c.id === "trishuli");
    const A = arrivalFn(cor);
    const actualAlert = toMin("09:15");
    const eapAlert = () => A.obs[0].t + S.delay + 0; // detection at collapse (seismic) + chain delay
    const line = cor.line, ch = cor.profile.ch;
    const places = [...A.obs.map((o) => ({ name: o.place, ch: o.ch, kind: "obs" })),
      ...cor.assets.filter((a) => a.k === "settlement" && a.n && a.hand != null && a.hand < 60).map((a) => ({ name: a.n, ch: a.ch, kind: "settlement", x: a.x, y: a.y })),
      ...cor.assets.filter((a) => a.k === "hydropower" || a.k === "headworks").map((a) => ({ name: a.n || "Hydropower site", ch: a.ch, kind: "hydro", x: a.x, y: a.y }))];

    evMap = newMap("map-event", { kind: "sat", center: [85.2, 28.05], zoom: 8.6, pitch: 55, bearing: -20 });
    evMap.on("load", () => {
      evMap.setTerrain({ source: "demt", exaggeration: 1.3 });
      const bb = line.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(line[0], line[0]));
      evMap.fitBounds(bb, { padding: { top: 40, bottom: 60, left: 30, right: 30 }, pitch: 50, bearing: -15, duration: 0 });
      evMap.addSource("river", { type: "geojson", data: lineFeature(line) });
      evMap.addSource("front", { type: "geojson", data: lineFeature(line.slice(0, 2)) });
      evMap.addSource("obs", { type: "geojson", data: pointFC(A.obs.map((o, i) => ({ ...o, ...ptAt(o.ch) })), (o) => ({ name: o.place, t: hm(o.t) })) });
      evMap.addSource("hydro", { type: "geojson", data: pointFC(cor.assets.filter((a) => a.k === "hydropower" || a.k === "headworks"), (a) => ({ name: a.n || "hydropower" })) });
      evMap.addLayer({ id: "river", type: "line", source: "river", paint: { "line-color": "#7fb3c9", "line-width": 2, "line-opacity": 0.9 } });
      evMap.addLayer({ id: "front", type: "line", source: "front", paint: { "line-color": "#e0312f", "line-width": 6, "line-opacity": 0.95 } });
      evMap.addLayer({ id: "hydro", type: "circle", source: "hydro", paint: { "circle-radius": 4, "circle-color": "#f0efec", "circle-stroke-color": "#1a1a19", "circle-stroke-width": 1.5 } });
      evMap.addLayer({ id: "obs", type: "circle", source: "obs", paint: { "circle-radius": 6, "circle-color": "#142120", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      evMap.addLayer({ id: "obs-l", type: "symbol", source: "obs", layout: { "text-field": ["concat", ["get", "t"], "  ", ["get", "name"]], "text-font": ["Open Sans Semibold"], "text-size": 12, "text-offset": [0.9, 0], "text-anchor": "left" }, paint: { "text-color": "#ffffff", "text-halo-color": "#142120", "text-halo-width": 1.6 } });
      evMap.on("mousemove", "hydro", (e) => showTip(e.originalEvent, `<b>${esc(e.features[0].properties.name)}</b><br>Hydropower plant or headworks (OpenStreetMap)`));
      evMap.on("mouseleave", "hydro", hideTip);
      update();
    });
    function ptAt(c) { const i = Math.max(0, ch.findIndex((x) => x >= c)); const p = line[i] || line[line.length - 1]; return { x: p[0], y: p[1] }; }
    const legend = $("#legend-event");
    legend.innerHTML = `<div><span class="sw" style="background:#e0312f"></span>Flood front (interpolated)</div>
      <div><span class="sw" style="background:#142120"></span>Observed arrival</div><div><span class="sw" style="background:#f0efec"></span>Hydropower site (OSM)</div>`;

    const slider = $("#event-time");
    function update() {
      const t = T0 + Number(slider.value);
      const fch = A.chAt(t);
      const k = ch.findIndex((x) => x >= fch);
      const coords = line.slice(0, Math.max(2, k === -1 ? line.length : k + 1));
      if (evMap.getSource("front")) evMap.getSource("front").setData(lineFeature(t >= A.obs[0].t ? coords : line.slice(0, 1).concat(line.slice(0, 1))));
      const alertT = evScn === "actual" ? actualAlert : eapAlert();
      const passed = A.obs.filter((o) => o.t <= t).pop();
      const hitBefore = places.filter((p) => A.at(p.ch) < alertT);
      const hydroBefore = hitBefore.filter((p) => p.kind === "hydro").length;
      const bins = cor.pop_bins.hand_25;
      let popHit = 0, popWarned = 0;
      bins.forEach((p, i) => { const tt = A.at(i + 0.5); if (i + 0.5 < A.obs[0].ch) return; if (tt < alertT) popHit += p; else if (tt - alertT >= S.react) popWarned += p; });
      $("#event-card").innerHTML = `
        <div class="tl-card"><span class="t">${hm(t)}</span><div><b>${t < A.obs[0].t ? "Before the collapse" : `Flood front ${fmt(fch, 0)} km below the source`}</b>
        <div class="muted small">${passed ? `Last observation: ${esc(passed.place)} at ${hm(passed.t)}` : "Langtang Lirung north face, ~5,200 m"}</div></div></div>
        <div class="tl-card"><span class="t" style="color:${t >= alertT ? "var(--s-good-ink)" : "var(--muted)"}">${hm(alertT)}</span><div><b>${evScn === "actual" ? "First SMS alert (actual)" : `Alert with detection at the source (${S.delay} min)`}</b>
        <div class="muted small">${t >= alertT ? "Alert has gone out." : "No alert yet."} ${evScn === "actual" ? "Triggered by a phone call from the district administration." : "Linked system: seismic + sensor detection at the source, cell broadcast."}</div></div></div>
        <p class="small">${evScn === "actual"
          ? "Rasuwagadhi, Syabrubesi and the upper hydropower sites were hit before any alert. Downstream of Betrawati the alert arrived in time only where people knew what to do with it."
          : `With detection at the source, the alert would have reached phones ${fmt(A.at(5) - alertT, 0)} min before the front reached Rasuwagadhi and ${fmt(A.obs.find((o) => /Betrawati/.test(o.place)).t - alertT, 0)} min before Betrawati.`}</p>`;
      $("#event-stats").innerHTML = [
        [hm(alertT), evScn === "actual" ? "first alert (actual)" : "alert with detection at the source"],
        [fmt(Math.round(popHit / 100) * 100), "people (< 25 m above the river) reached by the flood before the alert"],
        [`${hydroBefore}`, "hydropower sites (mapped in OSM) hit before the alert"],
        [fmt(Math.round(popWarned / 100) * 100), `people with ≥ ${S.react} min between alert and flood`],
      ].map(([v, l]) => `<div class="stat"><span class="v">${v}</span><span class="l">${l}</span></div>`).join("");
    }
    slider.addEventListener("input", update);
    $$("[data-scn]").forEach((b) => b.addEventListener("click", () => {
      evScn = b.dataset.scn; $$("[data-scn]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); update();
    }));
    $("#event-play").addEventListener("click", (e) => {
      if (evTimer) { clearInterval(evTimer); evTimer = null; e.target.textContent = "Play"; return; }
      if (Number(slider.value) >= 480) slider.value = 0;
      e.target.textContent = "Pause";
      evTimer = setInterval(() => { slider.value = Math.min(480, Number(slider.value) + 2); update();
        if (Number(slider.value) >= 480) { clearInterval(evTimer); evTimer = null; e.target.textContent = "Play"; } }, 60);
    });
    initEvent.update = update;
    update();
    $("#event-note").textContent = "Drag the slider or press play. The 3D terrain can be rotated with right-drag or two fingers.";
    const st = D.event2026.summary_stats || [];
    const pick = (m) => st.find((s) => s.metric === m);
    const facts = [
      [fmt(pick("deaths_nepal")?.chosen), `dead in Nepal (as of ${pick("deaths_nepal")?.asof})`, "Bodies recovered; the final toll will be higher."],
      [fmt(pick("missing_nepal")?.chosen), `missing in Nepal (as of ${pick("missing_nepal")?.asof})`, "Including hundreds of hydropower tunnel workers."],
      ["38 min", "from collapse to first SMS", "679,295 phones in four districts; the routine Nepali-only template."],
    ];
    $("#event-facts").innerHTML = facts.map(([v, l, d]) => `<div class="panel panel-pad" style="display:grid;gap:4px"><span class="eyebrow">${l}</span><span style="font:800 2.2rem/1 var(--f-display);font-stretch:112%">${v}</span><span class="small muted">${d}</span></div>`).join("");
  }

  // ------------------------------------------------------------------ §02 risk
  const TYPE_COLORS = { rain: "--series-1", glof: "--series-3", mass: "--series-2", river: "--series-7" };
  function typeOf(t) {
    t = t.toLowerCase();
    if (t.includes("glof") || t.includes("lake")) return "glof";
    if (t.includes("avalanche") || t.includes("landslide") || t.includes("dam")) return "mass";
    if (t.includes("riverine")) return "river";
    return "rain";
  }
  const TYPE_LABEL = { rain: "Intense rain", glof: "Glacial lake outburst", mass: "Avalanche / landslide cascade", river: "Riverine (reference)" };
  const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\d+/); return m ? Number(m[0]) : 0; };

  function renderRisk() {
    $("#hazard-types").innerHTML = C.hazardTypes.map((h) => `<div class="panel panel-pad" style="display:grid;gap:8px;align-content:start">
      <h3>${h.name}</h3><span class="pill"><i style="background:var(--accent)"></i>${h.lead}</span><p class="small">${h.text}</p>
      <p class="small muted">${h.examples}</p></div>`).join("");
    chartHistory(); chartSeason(); chartTerrain(); tableHistory(); renderLakes(); tableCorridors(); tableImpacts();
  }

  function svgBox(id, h) {
    const svg = d3.select(id); const w = svg.node().getBoundingClientRect().width || 600;
    svg.attr("viewBox", `0 0 ${w} ${h}`).attr("height", h).selectAll("*").remove();
    return [svg, w];
  }

  function chartHistory() {
    const ev = D.events.map((e) => ({ ...e, yr: +String(e.date).slice(0, 4) + (+String(e.date).slice(5, 7) || 6) / 12, cat: typeOf(e.type), toll: num(e.deaths) + num(e.missing) }));
    const H = 280;
    const [svg, w] = svgBox("#chart-history", H);
    const m = { l: w < 600 ? 10 : 170, r: 24, t: 20, b: 26 };
    const x = d3.scaleLinear().domain([1960, 2028]).range([m.l, w - m.r]);
    const cats = ["rain", "glof", "mass", "river"];
    const y = d3.scalePoint().domain(cats).range([m.t + 30, H - m.b - 26]);
    const r = d3.scaleSqrt().domain([0, 7000]).range([3.5, Math.min(40, (H - m.t - m.b) / 6)]);
    svg.append("g").attr("class", "grid").selectAll("line").data(cats).join("line")
      .attr("x1", m.l).attr("x2", w - m.r).attr("y1", (d) => y(d)).attr("y2", (d) => y(d));
    if (m.l > 20) svg.append("g").selectAll("text").data(cats).join("text").attr("class", "lbl").attr("x", 0).attr("y", (d) => y(d) + 4).text((d) => TYPE_LABEL[d]);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(w < 500 ? 4 : 8).tickFormat(d3.format("d")).tickSizeOuter(0));
    svg.append("g").selectAll("circle").data(ev.sort((a, b) => b.toll - a.toll)).join("circle")
      .attr("cx", (d) => x(d.yr)).attr("cy", (d) => y(d.cat)).attr("r", (d) => r(d.toll))
      .attr("fill", (d) => css(TYPE_COLORS[d.cat])).attr("fill-opacity", 0.5).attr("stroke", (d) => css(TYPE_COLORS[d.cat])).attr("stroke-width", 1.5)
      .on("mousemove", (e, d) => showTip(e, `<b>${esc(d.name)}</b><br>${esc(d.date)} · ${esc(d.type)}<br>Dead: ${esc(d.deaths || "–")} · missing: ${esc(d.missing || "–")}<br><span class="muted">${esc(d.warning_lead_time)}</span>`))
      .on("mouseleave", hideTip);
    const lab = ev.filter((d) => d.toll >= 150).sort((a, b) => a.yr - b.yr);
    svg.append("g").selectAll("text").data(lab).join("text").attr("class", "lbl")
      .attr("x", (d) => x(d.yr)).attr("y", (d, i) => y(d.cat) - r(d.toll) - 6 - (i % 2) * 12)
      .attr("text-anchor", (d) => x(d.yr) > w - 90 ? "end" : "middle")
      .text((d) => `${Math.floor(d.yr)} ${d.name.split(/[(,/]/)[0].trim().slice(0, 22)}`);
    $("#legend-history").innerHTML = cats.map((c) => `<span><i style="background:var(${TYPE_COLORS[c]})"></i>${TYPE_LABEL[c]}</span>`).join("") + `<span class="muted">area = dead + missing; hover for details</span>`;
  }

  function tableHistory() {
    $("#tbl-history").innerHTML = `<thead><tr><th>Date</th><th>Event</th><th>Type</th><th>River</th><th class="num">Dead</th><th class="num">Missing</th><th>Warning</th></tr></thead><tbody>` +
      D.events.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((e) => `<tr><td class="mono">${esc(e.date)}</td><td>${esc(e.name)}</td><td>${esc(e.type)}</td><td>${esc(e.river)}</td><td class="num">${esc(e.deaths)}</td><td class="num">${esc(e.missing)}</td><td class="small">${esc(e.warning_lead_time)}</td></tr>`).join("") + "</tbody>";
  }

  function chartSeason() {
    const b = D.bipad.by_month;
    const months = "JFMAMJJASOND".split("");
    const [svg, w] = svgBox("#chart-season", 220);
    const m = { l: 40, r: 10, t: 12, b: 24 };
    const x = d3.scaleBand().domain(d3.range(12)).range([m.l, w - m.r]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(b.flood_incidents)]).nice().range([220 - m.b, m.t]);
    svg.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r))).attr("transform", `translate(${m.l},0)`).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${220 - m.b})`).call(d3.axisBottom(x).tickFormat((i) => months[i]).tickSizeOuter(0));
    svg.append("g").selectAll("rect").data(b.flood_incidents).join("rect")
      .attr("x", (d, i) => x(i)).attr("width", x.bandwidth()).attr("y", (d) => y(d)).attr("height", (d) => y(0) - y(d))
      .attr("rx", 3).attr("fill", (d, i) => i >= 5 && i <= 8 ? css("--series-1") : css("--line"))
      .on("mousemove", (e, d) => { const i = b.flood_incidents.indexOf(d); showTip(e, `<b>${"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[i]}</b><br>${fmt(d)} flood-family incidents<br>${fmt(b.flood_deaths_missing[i])} dead or missing`); })
      .on("mouseleave", hideTip);
  }

  function chartTerrain() {
    const t = D.numbers.terrain;
    if (!t) { $("#chart-terrain").remove(); return; }
    const rows = t.bands;
    const [svg, w] = svgBox("#chart-terrain", 220);
    const m = { l: Math.min(190, w * 0.38), r: 120, t: 10, b: 10 };
    const y = d3.scaleBand().domain(rows.map((r) => r.band)).range([m.t, 220 - m.b]).padding(0.3);
    const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.dead_missing)]).range([m.l, w - m.r]);
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("x", m.l).attr("y", (r) => y(r.band)).attr("height", y.bandwidth())
      .attr("width", (r) => x(r.dead_missing) - m.l).attr("rx", 3).attr("fill", (r, i) => i === 0 ? css("--line") : css("--series-2"));
    svg.append("g").selectAll("text").data(rows).join("text").attr("class", "lbl").attr("x", m.l - 8).attr("y", (r) => y(r.band) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text((r) => r.band);
    svg.append("g").selectAll("text").data(rows).join("text").attr("x", (r) => x(r.dead_missing) + 6).attr("y", (r) => y(r.band) + y.bandwidth() / 2 + 4).text((r) => `${fmt(r.dead_missing)} dead/missing`);
    $("#terrain-note").innerHTML = t.note;
  }

  function renderLakes() {
    const lakes = D.lakes;
    const rows = lakes.slice(0, 47);
    $("#tbl-lakes").innerHTML = `<thead><tr><th>#</th><th>Lake</th><th>Country · basin</th><th>Rank</th><th class="num">People &lt; 25 m</th><th class="num">Hydro</th></tr></thead><tbody>` +
      rows.map((l, i) => `<tr data-lake="${i}"><td class="mono">${i + 1}</td><td class="mono small">${esc(l.name)}</td><td class="small">${esc(l.country)} · ${esc(l.basin)}</td><td>${esc(l.rank)}</td><td class="num">${fmt(l.pop_25m_120km)}</td><td class="num">${fmt(l.hydropower)}</td></tr>`).join("") + "</tbody>";
    const m = newMap("map-lakes", { center: [85.8, 28.1], zoom: 6.4 });
    m.on("load", () => {
      m.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: lakes.map((l, i) => lineFeature(l.line, { i, pop: l.pop_25m_120km })) } });
      m.addSource("lakes", { type: "geojson", data: pointFC(lakes.map((l, i) => ({ ...l, i })), (l) => ({ i: l.i, name: l.name, pop: l.pop_25m_120km, rank: l.rank, country: l.country })) });
      m.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": css("--water"), "line-width": ["interpolate", ["linear"], ["get", "pop"], 0, 1, 50000, 5], "line-opacity": 0.8 } });
      m.addLayer({ id: "lakes", type: "circle", source: "lakes", paint: {
        "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "pop"]], 0, 4, 250, 14],
        "circle-color": ["match", ["get", "rank"], "Rank I", css("--s-crit"), "Rank II", css("--s-serious"), css("--s-warn")],
        "circle-stroke-color": css("--surface"), "circle-stroke-width": 2 } });
      m.on("mousemove", "lakes", (e) => { const p = e.features[0].properties; showTip(e.originalEvent, `<b>${esc(p.name)}</b><br>${esc(p.country)} · ${esc(p.rank)}<br>${fmt(p.pop)} people &lt; 25 m above the river, first 120 km`); });
      m.on("mouseleave", "lakes", hideTip);
    });
    $$("#tbl-lakes tr[data-lake]").forEach((tr) => tr.addEventListener("click", () => { const l = lakes[+tr.dataset.lake]; m.flyTo({ center: [l.lon, l.lat], zoom: 9 }); }));
  }

  function tableCorridors() {
    const band = $("#hand-band").value;
    $("#tbl-corridors").innerHTML = `<thead><tr><th>Corridor</th><th>Source</th><th class="num">km</th><th class="num">People</th><th class="num">Buildings</th><th class="num">Hydro sites</th><th class="num">Bridges</th><th class="num">Schools</th><th class="num">Health</th><th class="num">Lodges</th><th>Hazards</th></tr></thead><tbody>` +
      D.corridors.map((c) => `<tr><td><b>${esc(c.name)}</b><div class="dev small muted">${esc(c.nepali)}</div></td><td class="small">${esc(c.source_label)}</td><td class="num">${fmt(c.length_km)}</td>
        <td class="num">${fmt(c.totals["pop_hand_" + band])}</td><td class="num">${fmt(c.totals["bld_hand_" + band])}</td><td class="num">${fmt((c.totals.hydropower || 0) + (c.totals.headworks || 0))}</td>
        <td class="num">${fmt(c.totals.bridge || 0)}</td><td class="num">${fmt(c.totals.school || 0)}</td><td class="num">${fmt(c.totals.health || 0)}</td><td class="num">${fmt(c.totals.lodging || 0)}</td><td class="small">${c.hazards.map(esc).join("; ")}</td></tr>`).join("") +
      `</tbody><tfoot><tr><td><b>All corridors</b></td><td></td><td></td><td class="num"><b>${fmt(d3.sum(D.corridors, (c) => c.totals["pop_hand_" + band]))}</b></td><td class="num"><b>${fmt(d3.sum(D.corridors, (c) => c.totals["bld_hand_" + band]))}</b></td><td colspan="6"></td></tr></tfoot>`;
  }

  function tableImpacts() {
    const ip = D.impacts.impact_pathways || D.impacts;
    $("#tbl-impacts").innerHTML = `<thead><tr><th>Impact</th><th>Who is most exposed</th><th>Pathway</th><th>Window</th><th>Actions (§06)</th></tr></thead><tbody>` +
      ip.map((i) => `<tr><td><b>${esc(i.impact || i.name || i.id)}</b></td><td class="small">${esc([].concat(i.vulnerable_groups || []).join("; "))}</td><td class="small">${esc(i.pathway || "")}</td><td class="small">${esc(i.lead_time_window || "")}</td><td class="mono small">${[].concat(i.early_action_ids || []).map((a) => `<a href="#actions" data-goto="${a}">${a}</a>`).join(" ")}</td></tr>`).join("") + "</tbody>";
    $$("[data-goto]").forEach((a) => a.addEventListener("click", () => showAction(a.dataset.goto)));
  }

  // ------------------------------------------------------------------ §03 trigger
  function trigResult() {
    const R = D.trigger.results;
    const f = (r) => r.src === S.src && r.level === S.level && r.region === S.region && r.k === S.k && r.m === S.m &&
      (S.src === "obs" ? r.period === "2011-2019" : r.lead === S.lead && Math.abs(r.p - S.p) < 1e-6);
    return R.find(f);
  }
  function renderLadder() {
    const col = { good: "--s-good", warn: "--s-warn", serious: "--s-serious", crit: "--s-crit" };
    const ob = { nrcs: "NRCS", gov: "government" };
    $("#ladder").innerHTML = C.ladder.map((r) => `<div class="rung ${r.linked ? "linked" : ""}"><div class="lvl"><span class="pill"><i style="background:var(${col[r.status]})"></i>Rung ${r.rung}</span><b>${r.name}</b><span class="small muted">${r.when}</span>
      <span style="display:flex;gap:4px;flex-wrap:wrap">${(r.owners || []).map((o) => `<span class="owner ${o}">${ob[o]}</span>`).join("")}${r.linked ? `<span class="flag-note">linked system</span>` : ""}</span></div>
      <div style="display:grid;gap:8px"><div><span class="eyebrow">Trigger</span><p>${r.trigger}</p></div><div class="acts"><span class="eyebrow">Releases</span><p>${r.acts}</p></div></div>
      <div style="display:grid;gap:8px;align-content:start"><div><span class="eyebrow">Lead time</span><div class="lt">${r.lead}</div></div><div><span class="eyebrow">Owner</span><div class="small">${r.owner}</div></div></div></div>`).join("");
  }

  const KS = () => D.trigger.ks, PS = () => D.trigger.ps;
  const kLabel = (k) => k < 1 ? `once in ${Math.round(1 / k)} seasons` : `${k} day${k === 1 ? "" : "s"} per season`;
  // Recommended rain trigger: most disaster dead/missing caught while staying within the activation limit.
  const ALERT_PER_YEAR = 2;
  const allowance = (tier = S.tier) => tier === "alert" ? ALERT_PER_YEAR : S.acts / S.years;
  function recSetting(tier) {
    const st = D.robust?.insample?.[`${tier}_strict`]?.setting;
    if (!st) return null;
    return D.trigger.results.find((r) => r.src === "gefs" && r.lead === st.lead && r.k === st.k && Math.abs(r.p - st.p) < 1e-6 && r.m === st.m && r.level === "loss" && r.region === "hill");
  }
  function bestSetting(opts = {}) {
    if (opts.tier && !opts.lim && (opts.region ?? "hill") === "hill" && (opts.lead ?? 2) === 2) { const r = recSetting(opts.tier); if (r) return r; }
    const lim = opts.lim ?? allowance(opts.tier);
    const R = D.trigger.results.filter((r) => r.src === "gefs" && r.lead === (opts.lead ?? 2) && r.level === "loss" && r.region === (opts.region ?? "hill"));
    const ok = R.filter((r) => r.protocol_act_per_year <= lim + 1e-9);
    const pool = ok.length ? ok : R;
    pool.sort((a, b) => (b.major_toll_caught - a.major_toll_caught) || (a.protocol_act_per_year - b.protocol_act_per_year) || (b.pod - a.pod));
    return pool[0];
  }
  function syncTrigControls() {
    $("#trig-src").value = S.src; $("#trig-lead").value = S.lead; $("#trig-level").value = S.level; $("#trig-region").value = S.region;
    $("#trig-freq").value = KS().indexOf(S.k); $("#trig-prob").value = PS().indexOf(S.p);
    $("#trig-m").value = S.m;
    $("#trig-freq-o").textContent = kLabel(S.k);
    $("#trig-prob-o").textContent = `${Math.round(S.p * 5)} of 5 members`;
    $("#trig-prob").disabled = $("#trig-lead").disabled = S.src === "obs";
  }
  function trigStatement(r) {
    const thr = D.numbers.thresholds_mm?.[S.src === "obs" ? "obs" : `gefs_${S.lead}`]?.[String(S.k)];
    const mm = thr ? ` (district median ≈ ${fmt(thr)} mm/day)` : "";
    const area = (S.m > 1 ? `at least ${S.m} districts at once among ` : "a district among ") +
      (S.region === "corridor" ? "the districts of the seven priority corridors" : S.region === "hill" ? "the hill and mountain districts" : "all districts");
    if (S.src === "obs") return `When observed daily rain in ${area} exceeds its local level of ${kLabel(S.k)}${mm}. <i>Reference only: an observation is not a forecast.</i>`;
    return `When ${S.p >= 1 ? "all" : `at least ${Math.round(S.p * 100)}% of the`} ensemble members (tested: 5-member GEFS reforecast; operationally ECMWF ENS, 51 members, with thresholds re-fitted on its own climatology) issued at 00 UTC predict, for day ${S.lead}, daily rain in ${area} above its local level of ${kLabel(S.k)}${mm}, ${S.tier === "alert" ? "rung 2 (prepare) is issued" : "rung 3b (DREF) activates"} for the districts concerned. Lead time ${S.lead === 1 ? "6–24" : S.lead === 2 ? "24–48" : "48–72"} h. Monitoring: DHM Flood Forecasting Division with the NRCS duty officer, daily from 15 May to 31 October.`;
  }
  function renderTrigger() {
    syncTrigControls();
    const r = trigResult();
    if (!r) { $("#trig-stats").innerHTML = `<div class="stat"><span class="l">No backtest for this combination.</span></div>`; return; }
    const exp5 = r.protocol_act_per_year * S.years;
    const okActs = r.protocol_act_per_year <= allowance() + 1e-9;
    $$("[data-tier]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tier === S.tier)));
    $("#trig-stats").innerHTML = [
      [pct(r.pod), `of the ${fmt(r.events)} district-days with losses caught (hit rate)`, ""],
      [pct(r.far), "of district activations without reported impact (false-alarm ratio)", ""],
      [fmt(r.protocol_act_per_year, 2), "protocol activations per year (all districts, 10-day clusters)", ""],
      [`${fmt(exp5, 1)} <span class="small" style="font-family:var(--f-mono);color:${okActs ? "var(--s-good-ink)" : "var(--s-crit-ink)"}">${okActs ? "✓ within" : "✕ exceeds"} ${fmt(allowance() * S.years, 0)}</span>`, `expected activations in ${S.years} years (${S.tier === "alert" ? "rung 2, co-financed" : "rung 3b rain, DREF"} allowance)`, ""],
      [pct(r.protocol_far), "of protocol activations with no impact anywhere", ""],
      [`${r.major_caught} / ${r.major_events}`, `major disasters caught (≥ ${D.trigger.major_toll} dead or missing; ${pct(r.major_toll_caught / Math.max(r.major_toll, 1))} of their toll)`, ""],
    ].map(([v, l]) => `<div class="stat"><span class="v">${v}</span><span class="l">${l}</span></div>`).join("");
    $("#trig-statement").innerHTML = trigStatement(r);
    $$("[data-k='trig_statement']").forEach((el) => { el.innerHTML = trigStatement(r); });
    const tierStmt = (b) => b ? `${b.p >= 1 ? "all" : `≥ ${Math.round(b.p * 100)}% of`} ensemble members predict, for day ${b.lead}, rain above the local level of ${kLabel(b.k)} in ${b.m > 1 ? `at least ${b.m} hill districts` : "a hill or mountain district"} (backtest: ${fmt(b.protocol_act_per_year, 1)} activations/yr).` : "";
    const cur = S.tier === "alert" ? r : bestSetting({ tier: "alert" });
    const cash = S.tier === "cash" ? r : bestSetting({ tier: "cash" });
    $$("[data-k='trig_statement_alert']").forEach((el) => { el.innerHTML = tierStmt(cur); });
    $$("[data-k='trig_statement_cash']").forEach((el) => { el.innerHTML = tierStmt(cash); });
    const pre = D.trigger.results.find((x) => x.src === "gefs" && x.lead === 3 && x.k === S.k && x.m === S.m && Math.abs(x.p - Math.max(0.2, S.p - 0.2)) < 1e-6 && x.level === S.level && x.region === S.region);
    $$("[data-k='trig_statement_pre']").forEach((el) => { el.innerHTML = `At least ${Math.round(Math.max(0.2, S.p - 0.2) * 5)} of 5 members predict, for day 3, rain above the rung-3 level in a district of the area, or the DHM bulletin flags high flash-flood risk there.${pre ? ` Backtest: ${fmt(pre.protocol_act_per_year, 1)} pre-activations per year; each one costs only staff time.` : ""}`; });
    try { chartRoc(r); } catch (e) { console.error(e); }
    const obsBest = D.trigger.results.find((x) => x.src === "obs" && x.period === "2011-2019" && x.k === S.k && x.level === S.level && x.region === S.region);
    $("#trig-reading").innerHTML = [
      `With the current setting, the trigger catches <b>${pct(r.pod)}</b> of the ${fmt(r.events)} district-days with recorded flood losses. ${obsBest && S.src === "gefs" ? `With perfect knowledge of the rain at the same resolution it would catch ${pct(obsBest.pod)}. The difference is the forecast error. The rest is rain that grid-scale data cannot see.` : ""}`,
      `Most flash-flood deaths come from rain cells a few kilometres across. Global ensembles at 25 km cannot place them, so a rain trigger alone will miss most cascades. This is why rungs 1 and 4 exist.`,
      (() => { const rb = D.robust; if (!rb) return "";
        const al = rb.insample.alert_strict, ca = rb.insample.cash_strict, cv = rb.cv;
        return `<b>The activation limit is the binding constraint.</b> Under strict scoring the hill and mountain districts had ${al.events} major disaster clusters in 2011–2019. A prepare trigger at about ${fmt(al.acts_per_year, 1)} activations a year catches <b>${al.caught}</b> (${pct(al.toll_caught / al.toll)} of their dead and missing; ${cv.alert.caught} out of sample). A rain trigger that fits 2 DREF activations in 5 years catches <b>${ca.caught}</b>. This is why DREF cash leans on dammed lakes and why the frequent rungs are co-financed (decision D2).`; })(),
      `The DREF limit applies to <b>protocol</b> activations. Signals in several districts during the same storm count once (10-day clusters), so the protocol-level activation rate matters more than the district-level false-alarm ratio.`,
      `Report-date noise (BIPAD) and missing reports from remote wards bias the hit rate down and the false-alarm ratio up. The values are conservative.`,
    ].map((t) => `<li>${t}</li>`).join("");
    $("#stop-list").innerHTML = C.stop.map((t) => `<li>${t}</li>`).join("");
    refreshSummary();
    try { trigMap(r); } catch (e) { console.error("district map unavailable", e); }
  }

  function chartRoc(cur) {
    const R = D.trigger.results.filter((r) => r.src === S.src && r.level === S.level && r.region === S.region && r.m === S.m &&
      (S.src === "obs" ? r.period === "2011-2019" : r.lead === S.lead));
    const [svg, w] = svgBox("#chart-roc", 300);
    const m = { l: 44, r: 14, t: 12, b: 36 };
    const x = d3.scaleLinear().domain([0, 1]).range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain([0, 1]).range([300 - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")).tickSize(-(w - m.l - m.r))).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${300 - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")).tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", 300 - 4).attr("text-anchor", "end").text("false-alarm ratio →");
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 10).text("↑ hit rate");
    const ok = (r) => r.protocol_act_per_year <= allowance() + 1e-9;
    svg.append("g").selectAll("circle").data(R).join("circle")
      .attr("cx", (r) => x(r.far)).attr("cy", (r) => y(r.pod)).attr("r", (r) => r === cur ? 8 : 5)
      .attr("fill", (r) => r === cur ? css("--accent") : ok(r) ? css("--series-1") : css("--surface"))
      .attr("stroke", (r) => r === cur ? css("--surface") : css("--series-1")).attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mousemove", (e, r) => showTip(e, `Threshold: ${kLabel(r.k)}${r.p ? `, ≥ ${Math.round(r.p * 5)}/5 members` : ""}, ≥ ${r.m} district(s)<br>Major disasters caught ${r.major_caught}/${r.major_events}<br>Hit rate ${pct(r.pod)} · FAR ${pct(r.far)}<br>${fmt(r.protocol_act_per_year, 2)} protocol activations / yr`))
      .on("mouseleave", hideTip)
      .on("click", (e, r) => { S.k = r.k; if (r.p) S.p = r.p; save(); renderTrigger(); });
    $("#chart-roc").setAttribute("aria-label", "Each dot is one trigger setting. Filled dots stay within the activation limit.");
  }

  let trigMapObj;
  function trigMap(r) {
    const per = r.per_district_year || {};
    const paint = () => {
      const fc = D.districts;
      fc.features.forEach((f) => { f.properties.rate = per[f.properties.district] || 0; });
      if (trigMapObj.getSource("d")) trigMapObj.getSource("d").setData(fc);
      else {
        trigMapObj.addSource("d", { type: "geojson", data: fc });
        trigMapObj.addLayer({ id: "d", type: "fill", source: "d", paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "rate"], 0, css("--surface"), 0.1, "#cde2fb", 0.3, "#86b6ef", 0.6, "#2a78d6", 1.2, "#104281"],
          "fill-opacity": 0.85 } });
        trigMapObj.addLayer({ id: "dl", type: "line", source: "d", paint: { "line-color": css("--line"), "line-width": 0.6 } });
        trigMapObj.on("mousemove", "d", (e) => { const p = e.features[0].properties; showTip(e.originalEvent, `<b>${esc(p.district)}</b> (${p.hill ? "hill/mountain" : "Terai"})<br>${fmt(p.rate, 2)} activations / year`); });
        trigMapObj.on("mouseleave", "d", hideTip);
      }
    };
    if (!trigMapObj) { trigMapObj = newMap("map-trig", { center: [84.1, 28.3], zoom: 5.4 }); trigMapObj.on("load", paint); }
    else if (trigMapObj.loaded()) paint(); else trigMapObj.once("load", paint);
  }

  function bindTrigger() {
    $("#trig-src").addEventListener("change", (e) => { S.src = e.target.value; save(); renderTrigger(); });
    $("#trig-lead").addEventListener("change", (e) => { S.lead = +e.target.value; save(); renderTrigger(); });
    $("#trig-level").addEventListener("change", (e) => { S.level = e.target.value; save(); renderTrigger(); });
    $("#trig-region").addEventListener("change", (e) => { S.region = e.target.value; save(); renderTrigger(); });
    $("#trig-m").addEventListener("change", (e) => { S.m = +e.target.value; save(); renderTrigger(); });
    $$("[data-tier]").forEach((b) => b.addEventListener("click", () => { S.tier = b.dataset.tier; const x = bestSetting({ tier: S.tier, region: S.region });
      if (x) Object.assign(S, { src: "gefs", lead: x.lead, k: x.k, p: x.p, m: x.m }); save(); renderTrigger(); }));
    $("#trig-best").addEventListener("click", () => { const b = bestSetting({ tier: S.tier, region: S.region, lead: S.src === "gefs" ? S.lead : 2 });
      Object.assign(S, { src: "gefs", lead: b.lead, k: b.k, p: b.p, m: b.m, level: "loss" }); save(); renderTrigger(); });
    $("#trig-freq").addEventListener("input", (e) => { S.k = KS()[+e.target.value]; save(); renderTrigger(); });
    $("#trig-prob").addEventListener("input", (e) => { S.p = PS()[+e.target.value]; save(); renderTrigger(); });
  }

  // ------------------------------------------------------------------ §04 lead time
  const SPEEDS = [["observed", "26 Aug 2026 observed (Trishuli)"], ["15", "Debris flood, 15 m/s"], ["6", "Flood wave, 6 m/s"], ["3", "Slow wave, 3 m/s"]];
  let ltMap;
  function ltCorr() { return D.corridors.find((c) => c.id === $("#lt-corr").value) || D.corridors[0]; }
  function ltArrival(cor) {
    const sp = $("#lt-speed").value;
    if (sp === "observed" && cor.observed_2026?.length) { const A = arrivalFn(cor); const t0 = A.obs[0].t; return (ch) => A.at(ch) - t0; }
    const v = +sp || 6; return (ch) => ch * 1000 / v / 60;
  }
  function initLeadtime() {
    $("#lt-corr").innerHTML = D.corridors.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    const setSpeeds = () => {
      const cor = ltCorr(); const has = !!cor.observed_2026?.length;
      $("#lt-speed").innerHTML = SPEEDS.filter(([k]) => k !== "observed" || has).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
      $("#lt-sensor").max = Math.min(80, Math.floor(cor.length_km * 0.6));
      $("#lt-sensor").value = has ? Math.round(cor.observed_2026[0].ch * 2) / 2 : 0;
    };
    setSpeeds();
    $("#lt-corr").addEventListener("change", () => { setSpeeds(); renderLeadtime(true); });
    ["lt-sensor", "lt-delay", "lt-react", "lt-speed"].forEach((id) => $("#" + id).addEventListener("input", () => {
      S.delay = +$("#lt-delay").value; S.react = +$("#lt-react").value; save(); renderLeadtime(false); if (initEvent.update) initEvent.update();
    }));
    $("#lt-delay").value = S.delay; $("#lt-react").value = S.react;
    renderLeadtime(true);
  }
  function renderLeadtime(fly) {
    const cor = ltCorr(); const arr = ltArrival(cor);
    const sensor = +$("#lt-sensor").value, delay = +$("#lt-delay").value, react = +$("#lt-react").value;
    $("#lt-sensor-o").textContent = `${sensor} km`; $("#lt-delay-o").textContent = `${delay} min`; $("#lt-react-o").textContent = `${react} min`;
    const alert = arr(sensor) + delay;
    const warn = (ch) => arr(ch) - alert;
    const bins = cor.pop_bins.hand_25;
    let safe = 0, unsafe = 0;
    bins.forEach((p, i) => { if (i + 0.5 < sensor) { unsafe += p; return; } (warn(i + 0.5) >= react ? (safe += p) : (unsafe += p)); });
    const sites = cor.assets.filter((a) => ["settlement", "hydropower", "headworks", "school", "health", "bridge"].includes(a.k) && (a.hand == null || a.hand < 50));
    const hydro = sites.filter((a) => a.k === "hydropower" || a.k === "headworks");
    const hydroOk = hydro.filter((a) => a.ch > sensor && warn(a.ch) >= react).length;
    const firstSafe = (() => { for (let c = sensor; c <= cor.length_km; c += 0.5) if (warn(c) >= react) return c; return null; })();
    $("#lt-stats").innerHTML = [
      [fmt(safe), `people (< 25 m above the river) with ≥ ${react} min warning`],
      [fmt(unsafe), "people with less, or above the sensor"],
      [firstSafe == null ? "–" : `${fmt(firstSafe, 1)} km`, `first point below the source with enough warning`],
      [`${hydroOk} / ${hydro.length}`, "hydropower sites with enough time to evacuate tunnels"],
    ].map(([v, l]) => `<div class="stat"><span class="v">${v}</span><span class="l">${l}</span></div>`).join("");
    chartLeadtime(cor, arr, sensor, alert, react, sites);
    tableLeadtime(sites, warn, sensor, react);
    mapLeadtime(cor, warn, sensor, react, sites, fly);
    if (typeof renderHydro === "function" && $("#tbl-hydro")) renderHydro();
  }
  function chartLeadtime(cor, arr, sensor, alert, react, sites) {
    const [svg, w] = svgBox("#chart-lt", 300);
    const m = { l: 56, r: 14, t: 14, b: 50 };
    const L = cor.length_km;
    const x = d3.scaleLinear().domain([0, L]).range([m.l, w - m.r]);
    const ymax = Math.max(60, Math.min(arr(L), 600));
    const y = d3.scaleSqrt().domain([0, ymax]).range([300 - m.b, m.t]);
    const yt = [5, 15, 30, 60, 120, 240, 480].filter((v) => v <= ymax);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues([0, ...yt]).tickFormat((v) => v < 60 || v % 60 ? `${v} min` : `${v / 60} h`).tickSize(-(w - m.l - m.r))).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${300 - m.b})`).call(d3.axisBottom(x).ticks(8).tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", 300 - m.b + 30).attr("text-anchor", "end").text("km below the source →");
    svg.append("text").attr("x", w - m.r).attr("y", m.t + 10).attr("text-anchor", "end").text("time after the cascade starts (square-root scale) ↑");
    const xs = d3.range(0, L + 0.01, L / 200);
    // warning area: between alert line and arrival curve where arrival - alert >= react
    svg.append("path").datum(xs.filter((c) => c >= sensor)).attr("fill", css("--s-good")).attr("fill-opacity", 0.14)
      .attr("d", d3.area().x((c) => x(c)).y0(() => y(Math.min(alert + react, ymax))).y1((c) => y(Math.min(Math.max(arr(c), alert + react), ymax))));
    svg.append("path").datum(xs).attr("fill", "none").attr("stroke", css("--series-1")).attr("stroke-width", 2)
      .attr("d", d3.line().x((c) => x(c)).y((c) => y(Math.min(arr(c), ymax))));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(alert)).attr("y2", y(alert)).attr("stroke", css("--accent")).attr("stroke-width", 2);
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(alert + react)).attr("y2", y(alert + react)).attr("stroke", css("--accent")).attr("stroke-width", 1).attr("stroke-opacity", 0.5);
    svg.append("text").attr("class", "lbl").attr("x", w - m.r - 4).attr("y", y(alert) - 5).attr("text-anchor", "end").text(`alert on phones · ${fmt(alert, 0)} min`);
    svg.append("line").attr("x1", x(sensor)).attr("x2", x(sensor)).attr("y1", m.t).attr("y2", 300 - m.b).attr("stroke", css("--ink")).attr("stroke-width", 1.5);
    svg.append("text").attr("class", "lbl").attr("x", x(sensor) + 5).attr("y", m.t + 24).text("sensor");
    // observed points (Trishuli)
    if ($("#lt-speed").value === "observed") {
      const A = arrivalFn(cor);
      svg.append("g").selectAll("circle").data(A.obs).join("circle").attr("cx", (o) => x(o.ch)).attr("cy", (o) => y(Math.min(o.t - A.obs[0].t, ymax))).attr("r", 4.5)
        .attr("fill", css("--series-1")).attr("stroke", css("--surface")).attr("stroke-width", 2)
        .on("mousemove", (e, o) => showTip(e, `<b>${esc(o.place)}</b><br>${hm(o.t)} NPT · ${fmt(o.ch, 1)} km`)).on("mouseleave", hideTip);
    }
    // sites rug
    const col = (a) => a.ch <= sensor || arr(a.ch) - alert < react ? css("--s-crit") : css("--s-good");
    svg.append("g").selectAll("rect").data(sites).join("rect").attr("x", (a) => x(a.ch) - 1.5).attr("width", 3)
      .attr("y", (a) => 300 - m.b + 4).attr("height", (a) => a.k === "settlement" ? 12 : 7).attr("fill", col)
      .on("mousemove", (e, a) => showTip(e, `<b>${esc(a.n || a.k)}</b> (${a.k})<br>${fmt(a.ch, 1)} km · ${a.hand == null ? "" : fmt(a.hand) + " m above river"}<br>warning: ${a.ch <= sensor ? "none (above sensor)" : fmt(arr(a.ch) - alert, 0) + " min"}`))
      .on("mouseleave", hideTip);
    $("#legend-lt").innerHTML = `<span><i style="background:var(--series-1)"></i>Flood-front arrival</span><span><i style="background:var(--accent)"></i>Alert on phones (+ time to safety)</span><span><i style="background:var(--s-good)"></i>Enough warning</span><span><i style="background:var(--s-crit)"></i>Not enough warning</span><span class="muted">Ticks below the axis: settlements (tall) and sites (short)</span>`;
  }
  function tableLeadtime(sites, warn, sensor, react) {
    const rows = sites.filter((a) => a.k !== "bridge" && (a.n || a.k === "hydropower")).sort((a, b) => a.ch - b.ch).slice(0, 120);
    $("#tbl-lt").innerHTML = `<thead><tr><th>Place / site</th><th>Type</th><th class="num">km</th><th class="num">Warning</th></tr></thead><tbody>` +
      rows.map((a) => { const wv = a.ch <= sensor ? null : warn(a.ch); const ok = wv != null && wv >= react;
        return `<tr><td>${esc(a.n || "unnamed")}</td><td class="small">${a.k}</td><td class="num">${fmt(a.ch, 1)}</td><td class="num" style="color:${ok ? "var(--s-good-ink)" : "var(--s-crit-ink)"}">${wv == null ? "none" : fmt(wv, 0) + " min"} ${ok ? "✓" : "✕"}</td></tr>`; }).join("") + "</tbody>";
  }
  function mapLeadtime(cor, warn, sensor, react, sites, fly) {
    const data = () => ({
      line: lineFeature(cor.line),
      sites: pointFC(sites, (a) => ({ ok: a.ch > sensor && warn(a.ch) >= react ? 1 : 0, n: a.n || a.k, k: a.k, w: a.ch <= sensor ? -1 : Math.round(warn(a.ch)) })),
      sensor: pointFC([(() => { const i = cor.profile.ch.findIndex((c) => c >= sensor); const p = cor.line[Math.max(0, i)]; return { x: p[0], y: p[1] }; })()], () => ({})),
    });
    const paint = () => {
      const d = data();
      if (!ltMap.getSource("line")) {
        ltMap.addSource("line", { type: "geojson", data: d.line }); ltMap.addSource("sites", { type: "geojson", data: d.sites }); ltMap.addSource("sensor", { type: "geojson", data: d.sensor });
        ltMap.addLayer({ id: "line", type: "line", source: "line", paint: { "line-color": css("--water"), "line-width": 3 } });
        ltMap.addLayer({ id: "sites", type: "circle", source: "sites", paint: { "circle-radius": ["match", ["get", "k"], "settlement", 6, 4], "circle-color": ["case", ["==", ["get", "ok"], 1], css("--s-good"), css("--s-crit")], "circle-stroke-color": css("--surface"), "circle-stroke-width": 2 } });
        ltMap.addLayer({ id: "sensor", type: "circle", source: "sensor", paint: { "circle-radius": 8, "circle-color": css("--ink"), "circle-stroke-color": css("--accent"), "circle-stroke-width": 3 } });
        ltMap.on("mousemove", "sites", (e) => { const p = e.features[0].properties; showTip(e.originalEvent, `<b>${esc(p.n)}</b> (${p.k})<br>${p.w < 0 ? "above sensor: no warning" : p.w + " min warning"}`); });
        ltMap.on("mouseleave", "sites", hideTip);
      } else { ltMap.getSource("line").setData(d.line); ltMap.getSource("sites").setData(d.sites); ltMap.getSource("sensor").setData(d.sensor); }
      if (fly) { const b = cor.line.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(cor.line[0], cor.line[0])); ltMap.fitBounds(b, { padding: 30, duration: 600 }); }
    };
    if (!ltMap) { ltMap = newMap("map-lt", { center: [85.2, 28.0], zoom: 8 }); ltMap.on("load", paint); }
    else if (ltMap.loaded()) paint(); else ltMap.once("load", paint);
  }

  // ------------------------------------------------------------------ §05 actions
  const CATS = [["minutes", "Minutes"], ["hours", "Hours"], ["1-3 days", "1–3 days"], ["weeks", "Weeks"], ["seasonal", "Season / readiness"]];
  function renderActions() {
    const acts = D.actions.actions;
    $("#matrix").innerHTML = CATS.map(([c, l]) => `<div class="mcol"><header>${l}</header>${acts.filter((a) => a.category === c).map((a) =>
      `<button type="button" class="act" data-a="${a.id}" aria-pressed="${!S.off.includes(a.id)}"><span class="an">${esc(a.name.split("(")[0])}</span>
        <span class="am"><span>${a.id} · ${esc((a.implementer || "").split(/[,;(]/)[0])}</span><span class="ev ${a.evidence_strength}">${a.evidence_strength}</span></span>
        <span style="display:flex;gap:4px;flex-wrap:wrap">${(() => { const o = D.inst?.operational_matrix?.find((x) => x.id === a.id); return o ? ownerBadge(o.owner_type) + (o.in_dref_budget ? '<span class="owner nrcs">DREF</span>' : "") : ""; })()}${a.added ? '<span class="flag-note">new in v1.0</span>' : ""}</span></button>`).join("")}</div>`).join("");
    $$(".act").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.a; S.off = S.off.includes(id) ? S.off.filter((x) => x !== id) : [...S.off, id];
      b.setAttribute("aria-pressed", String(!S.off.includes(id))); save(); showAction(id); renderBudget();
    }));
  }
  function showAction(id) {
    const a = D.actions.actions.find((x) => x.id === id); const el = $("#action-detail"); el.hidden = false;
    const cost = a.unit_cost_chf == null ? "No Nepal cost found" : Array.isArray(a.unit_cost_chf) ? `CHF ${fmt(a.unit_cost_chf[0], 2)}–${fmt(a.unit_cost_chf[1], 2)}` : `CHF ${fmt(a.unit_cost_chf, 2)}`;
    el.innerHTML = `<div class="panel-head"><h3>${a.id} · ${esc(a.name)}</h3><span class="ev ${a.evidence_strength}">${a.evidence_strength} evidence</span></div>
      <div class="grid-2 panel-pad"><div style="display:grid;gap:10px"><div><span class="eyebrow">Implemented by</span><p class="small">${esc(a.implementer)}</p></div>
      <div><span class="eyebrow">Minimum lead time</span><p class="mono">${a.lead_time_min_hours < 1 ? fmt(a.lead_time_min_hours * 60) + " min" : fmt(a.lead_time_min_hours) + " h"}</p></div>
      <div><span class="eyebrow">Unit cost</span><p class="small">${cost} · ${esc(a.unit)}</p><p class="small muted">${esc(a.cost_basis)}</p></div></div>
      <div style="display:grid;gap:10px"><div><span class="eyebrow">Evidence</span><p class="small">${esc(a.evidence)}</p></div>
      <div><span class="eyebrow">Risks</span><p class="small">${esc(Array.isArray(a.risks) ? a.risks.join("; ") : a.risks)}</p></div>
      <div class="small">${[].concat(a.source_urls || []).slice(0, 4).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(new URL(u).hostname)}</a>`).join(" · ")}</div></div></div>`;
  }

  // ------------------------------------------------------------------ §08 budget
  const FX = 185;
  const N_COMMUNITIES = 40;
  function rates() {
    const rb = D.robust;
    const r2 = rb ? rb.insample.alert_strict.acts_per_year : 1.7;
    const r3a = rb ? rb.second_signal.evacuate_major.acts_per_year : 1.2;
    const rain = rb ? rb.insample.cash_strict.acts_per_year : 0.1;
    const dref = S.dref === "lake" ? LAKE_RATE : S.dref === "rain" ? rain : LAKE_RATE + rain;
    return { r2, r3a, rain, dref };
  }
  function budgetLines() {
    const hh = S.hh, corr = S.corr, rt = rates();
    const lines = C.budget.map((b) => {
      let q = 1, unit = b.unit;
      if (b.driver === "community") q = N_COMMUNITIES;
      if (b.driver === "corridor") q = corr;
      if (b.driver === "hh") q = hh;
      if (b.driver === "hh_half") q = hh / 2;
      if (b.driver === "cash") { unit = S.cash / FX * 1.03; q = hh; }
      if (b.driver === "rung2") q = rt.r2 * S.years;
      if (b.driver === "rung3a") q = rt.r3a * S.years;
      const on = b.link ? !S.off.includes(b.link) : true;
      return { ...b, q, unitShown: unit, total: on ? q * (unit || 0) : 0, on };
    });
    return lines;
  }
  function renderBudget() {
    $("#b-hh").value = S.hh; $("#b-cash").value = S.cash; $("#b-corr").value = S.corr; $("#b-cof").value = S.cof;
    $("#b-hh-o").textContent = fmt(S.hh); $("#b-cash-o").textContent = `NPR ${fmt(S.cash)}`; $("#b-corr-o").textContent = S.corr; $("#b-fx-o").textContent = FX;
    const L = budgetLines();
    const by = (p) => d3.sum(L.filter((l) => l.phase === p), (l) => l.total);
    const R = by("readiness"), P = by("prepos"), E = by("early"), I = by("ifrc"), CF = by("cofin");
    const T = R + P + E + I, NS = T - I;
    const people = Math.round(S.hh * 4.4);
    const phases = [["readiness", "Readiness", R, "--series-1"], ["prepos", "Pre-positioned stock", P, "--series-3"], ["early", "Early action (one activation)", E, "--series-2"], ["ifrc", "IFRC support", I, "--muted"]];
    $("#budget-bar").innerHTML = phases.map(([, l, v, c]) => `<span style="flex:${v} 0 0;background:var(${c})" title="${l}: ${chf(v)}"></span>`).join("") +
      (T < S.cap ? `<span style="flex:${S.cap - T} 0 0;background:var(--surface-2)" title="Headroom ${chf(S.cap - T)}"></span>` : "");
    $("#budget-legend").innerHTML = phases.map(([, l, v, c]) => `<span><i style="background:var(${c})"></i>${l} ${chf(v)} (${pct(v / T)})</span>`).join("") + `<span><i style="background:var(--surface-2);border:1px solid var(--line)"></i>headroom to ceiling ${chf(S.cap)}</span>`;
    const chk = (ok, txt) => `<span style="color:${ok ? "var(--s-good-ink)" : "var(--s-crit-ink)"}">${ok ? "✓" : "✕"}</span> ${txt}`;
    $("#budget-stats").innerHTML = [
      [chf(T), chk(T <= S.cap, `DREF total vs ceiling ${chf(S.cap)}`)],
      [`${pct(R / T)} · ${pct(R / NS)}`, chk(R / NS <= 0.35, "readiness: of total · of NS funds (≤ 35%)")],
      [pct((R + P) / T), chk((R + P) / T <= 0.65, "readiness + stock (≤ 65%)")],
      [pct(E / T), chk(E / T >= 0.35, "early action (≥ 35%)")],
      [fmt(people), chk(people >= (S.cap > 300000 ? 10000 : 2000), `people reached with cash per activation (≥ ${S.cap > 300000 ? "10,000" : "2,000"})`)],
      [chf(CF), "co-financed outside the DREF (rungs 2 and 3a, sirens, drills; hardware not costed)"],
    ].map(([v, l]) => `<div class="stat"><span class="v">${v}</span><span class="l">${l}</span></div>`).join("");
    const show = (l) => S.cof === "show" || l.phase !== "cofin";
    const label = { readiness: "readiness", prepos: "stock", early: "early action", ifrc: "IFRC", cofin: "<b>co-financed</b>" };
    $("#tbl-budget").innerHTML = `<thead><tr><th>Line</th><th>Phase</th><th class="num">Quantity</th><th class="num">Unit (CHF)</th><th class="num">Total (CHF)</th><th>Basis</th></tr></thead><tbody>` +
      L.filter(show).map((l) => `<tr class="${l.on ? "" : "off"}"><td><span class="mono small">${l.id}</span> ${esc(l.name)} ${l.link ? `<span class="owner">${l.link}</span>` : ""}</td><td class="small">${label[l.phase]}</td><td class="num">${fmt(l.q, l.q % 1 ? 1 : 0)}</td><td class="num">${fmt(l.unitShown, l.unitShown < 10 ? 2 : 0)}</td><td class="num">${fmt(l.total)}</td><td class="small muted">${l.est ? "<b>assumption</b> · " : ""}${esc(l.basis)}</td></tr>`).join("") +
      `</tbody><tfoot><tr><td><b>DREF total</b></td><td></td><td></td><td></td><td class="num"><b>${fmt(T)}</b></td><td></td></tr>${S.cof === "show" ? `<tr><td><b>Co-financed (outside the DREF)</b></td><td></td><td></td><td></td><td class="num"><b>${fmt(CF)}</b></td><td class="small muted">plus the linked warning system hardware</td></tr>` : ""}</tfoot>`;
    const rt = rates();
    $("#budget-note").innerHTML = `Rate: ${FX} NPR per CHF, as implied by IFRC appeal MDRNP022 (Aug 2026), not a market quote. Early action is budgeted for one activation; the second DREF allocation follows the first activation report. Expected DREF activations: ${fmt(rt.dref * S.years, 1)} in ${S.years} years (${S.dref === "lake" ? "dammed lakes" : S.dref === "rain" ? "extreme rain" : "dammed lakes + extreme rain"}). Co-financed lines use the backtest rates: rung 2 ≈ ${fmt(rt.r2, 1)}/yr, rung 3a ≈ ${fmt(rt.r3a, 1)}/yr.`;
    S._budget = T; S._people = people; refreshSummary();
  }
  function bindBudget() {
    $("#b-hh").addEventListener("input", (e) => { S.hh = +e.target.value; save(); renderBudget(); });
    $("#b-cash").addEventListener("input", (e) => { S.cash = +e.target.value; save(); renderBudget(); });
    $("#b-corr").addEventListener("input", (e) => { S.corr = +e.target.value; save(); renderBudget(); });
    $("#b-cof").addEventListener("change", (e) => { S.cof = e.target.value; save(); renderBudget(); });
  }

  // ------------------------------------------------------------------ §09
  function renderMeal() {
    $("#meal-cards").innerHTML = C.meal.map((m) => `<div class="panel panel-pad" style="display:grid;gap:8px;align-content:start"><h3>${m.h}</h3><p class="small">${m.t}</p></div>`).join("");
    const col = { High: "--s-crit", Medium: "--s-warn", Low: "--s-good" };
    $("#tbl-risks").innerHTML = `<thead><tr><th>Risk</th><th>Likelihood</th><th>Mitigation</th></tr></thead><tbody>` +
      C.risks.map((r) => `<tr><td>${r[0]}</td><td><span class="pill"><i style="background:var(${col[r[1]]})"></i>${r[1]}</span></td><td class="small">${r[2]}</td></tr>`).join("") + "</tbody>";
  }

  // ------------------------------------------------------------------ §10 decisions
  function autoSetting(kind) {
    const R = D.trigger.results.filter((r) => r.src === "gefs" && r.lead === 2 && r.level === "loss" && r.region === "hill");
    if (kind === "alert") return bestSetting({ tier: "alert" });
    if (kind === "strict") return bestSetting({ tier: "cash" });
    if (kind === "sensitive") return bestSetting({ lim: 1 });
    const caught = R.filter((r) => r.major_caught > 0).sort((a, b) => (a.protocol_act_per_year - b.protocol_act_per_year) || (b.major_toll_caught - a.major_toll_caught));
    return caught[0] || R[0];
  }
  const settingText = (r) => r ? `Backtest: ${fmt(r.protocol_act_per_year, 1)} activations/yr, ${r.major_caught} of ${r.major_events} major disasters caught (${pct(r.major_toll_caught / Math.max(r.major_toll, 1))} of their dead and missing).` : "";
  function renderDecisions() {
    $("#decision-list").innerHTML = C.decisions.map((d) => `<div class="decision" id="dec-${d.id}"><div><span class="eyebrow">${d.id}</span><h3>${d.q}</h3><p class="small muted">${d.why}</p></div>
      <div class="options">${d.options.map((o, i) => `<button type="button" class="opt" data-d="${d.id}" data-o="${i}" aria-pressed="${S.decisions[d.id] === i}">
        ${o.rec ? `<span class="rec">Recommended</span>` : ""}<b>${o.label}</b><small>${o.text}</small>${d.id === "D2" ? `<small class="mono" data-d2="${o.set.dref}"></small>` : ""}</button>`).join("")}</div></div>`).join("");
    $$(".opt").forEach((b) => b.addEventListener("click", () => {
      const d = C.decisions.find((x) => x.id === b.dataset.d); const o = d.options[+b.dataset.o];
      S.decisions[d.id] = +b.dataset.o;
      Object.assign(S, o.set);
      $$(`.opt[data-d="${d.id}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (o.set.delay != null) $("#lt-delay").value = o.set.delay;
      save(); renderTrigger(); renderBudget(); renderLeadtime(false); if (initEvent.update) initEvent.update(); renderReviewProgress();
      d2Text();
    }));
    d2Text();
  }
  function d2Text() {
    const rt = rates(); const ca = D.robust?.insample?.cash_strict;
    const v = { lake: LAKE_RATE, rain: rt.rain, lake_rain: LAKE_RATE + rt.rain };
    $$("[data-d2]").forEach((el) => { const k = el.dataset.d2; el.textContent = `≈ ${fmt(v[k] * S.years, 1)} DREF activations in ${S.years} years${k !== "lake" && ca ? `; rain part caught ${ca.caught} of ${ca.events} major events (strict)` : ""}.`; });
  }

  // ------------------------------------------------------------------ §11 review
  const VERDICTS = [["ok", "Met"], ["q", "Partly"], ["no", "Not met"], ["na", "N/A"]];
  const R = store.get("review", { items: {}, name: "" });
  function renderChecklist() {
    $("#reviewer").value = R.name || "";
    $("#checklist").innerHTML = C.checklist.map(([c, w, sec], i) => {
      const it = R.items[i] || {};
      return `<div class="check" data-i="${i}"><div class="crit"><b>${i + 1}. ${c}</b><span class="small muted">${w}</span>
        <a class="where" href="#${sec}">See §${$(`#${sec}`).dataset.n} ${$(`#${sec}`).dataset.title}</a></div>
        <div class="verdict" role="group" aria-label="Verdict for ${esc(c)}">${VERDICTS.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${it.v === v}">${l}</button>`).join("")}</div>
        <textarea id="note-${i}" placeholder="Note or condition for approval" aria-label="Note for ${esc(c)}">${esc(it.note || "")}</textarea></div>`;
    }).join("");
    $$(".check").forEach((row) => {
      const i = row.dataset.i;
      $$(".verdict button", row).forEach((b) => b.addEventListener("click", () => {
        R.items[i] = { ...(R.items[i] || {}), v: R.items[i]?.v === b.dataset.v ? null : b.dataset.v };
        $$(".verdict button", row).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === R.items[i].v)));
        store.set("review", R); renderReviewProgress();
      }));
      $("textarea", row).addEventListener("input", (e) => { R.items[i] = { ...(R.items[i] || {}), note: e.target.value }; store.set("review", R); });
    });
    $("#reviewer").addEventListener("input", (e) => { R.name = e.target.value; store.set("review", R); });
    $("#review-copy").addEventListener("click", async () => {
      const md = reviewMarkdown();
      try { await navigator.clipboard.writeText(md); $("#review-status").textContent = "Review copied as Markdown."; }
      catch (e) { $("#review-status").textContent = "Copy was blocked by the browser. Use Download instead."; }
    });
    $("#review-dl").addEventListener("click", () => {
      const blob = new Blob([reviewMarkdown()], { type: "text/markdown" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `Fictional-EAP-review-${(R.name || "reviewer").replace(/\W+/g, "-")}-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a); a.click(); a.remove();
      $("#review-status").textContent = "Review downloaded.";
    });
    $("#review-clear").addEventListener("click", (e) => {
      if (e.target.dataset.armed !== "1") { e.target.dataset.armed = "1"; e.target.textContent = "Click again to clear"; setTimeout(() => { e.target.dataset.armed = ""; e.target.textContent = "Clear"; }, 3000); return; }
      R.items = {}; store.set("review", R); renderChecklist(); renderReviewProgress(); $("#review-status").textContent = "Review cleared.";
    });
    renderReviewProgress();
  }
  function renderReviewProgress() {
    const n = C.checklist.length; const done = Object.values(R.items).filter((x) => x && x.v).length;
    $("#review-progress").textContent = `${done} / ${n}`; $("#review-count").textContent = `${done} of ${n} criteria reviewed`;
    const secV = {};
    C.checklist.forEach(([, , sec], i) => { const v = R.items[i]?.v; if (!v) return; const rank = { no: 3, q: 2, ok: 1, na: 0 }[v]; secV[sec] = Math.max(secV[sec] || 0, rank); });
    $$("[data-flag]").forEach((f) => { const r = secV[f.dataset.flag]; f.className = "flag" + (r === 3 ? " no" : r === 2 ? " q" : r === 1 ? " ok" : ""); });
  }
  function reviewMarkdown() {
    const lab = Object.fromEntries(VERDICTS);
    const dec = C.decisions.map((d) => `- **${d.id} ${d.q}** → ${S.decisions[d.id] != null ? d.options[S.decisions[d.id]].label : "_no choice_"}`).join("\n");
    const r = trigResult();
    return `# Fictional EAP review: Flash floods & cryosphere cascades, Nepal (${C.version})\n\nReviewer: ${R.name || "_unnamed_"}  \nDate: ${new Date().toISOString().slice(0, 10)}  \nPage: ${location.href.split("#")[0]}\n\n` +
      `## Verdicts\n\n| # | Criterion | Verdict | Note |\n|---|---|---|---|\n` +
      C.checklist.map(([c], i) => `| ${i + 1} | ${c} | ${lab[R.items[i]?.v] || "–"} | ${(R.items[i]?.note || "").replace(/\n/g, " ").replace(/\|/g, "/")} |`).join("\n") +
      `\n\n## Decisions\n\n${dec}\n\n## Settings at time of review\n\n- Rain trigger: ${S.src}, lead day ${S.lead}, exceeded ${S.k} d/season, ≥ ${Math.round(S.p * 5)}/5 members, impact level ${S.level}, area ${S.region}` +
      (r ? `\n- Backtest: hit rate ${pct(r.pod)}, FAR ${pct(r.far)}, ${fmt(r.protocol_act_per_year, 2)} protocol activations/yr` : "") +
      `\n- Detection corridors: ${S.corr}; alert delay ${S.delay} min; cash NPR ${fmt(S.cash)} × ${fmt(S.hh)} households\n- Budget: ${chf(S._budget || 0)} for ${fmt(S._people || 0)} people\n`;
  }

  // ------------------------------------------------------------------ §12 methods
  function renderMethods() {
    $("#methods-prose").innerHTML = C.methods.map((t) => `<p>${t}</p>`).join("");
    $("#limits").innerHTML = C.limits.map((t) => `<li>${t}</li>`).join("");
    $("#tbl-data").innerHTML = `<thead><tr><th>Dataset</th><th>Used for</th><th>Licence</th></tr></thead><tbody>` +
      D.numbers.sources.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></td><td class="small">${esc(s.use)}</td><td class="small">${esc(s.licence)}</td></tr>`).join("") + "</tbody>";
    $("#refs").innerHTML = D.refs.map((r) => `<li>${r.html}</li>`).join("");
  }

  // ------------------------------------------------------------------ summary
  function refreshSummary() {
    const r = D.trigger && trigResult();
    const keys = {
      people_target: fmt(S._people || S.hh * 4.4),
      lead_range: "minutes – weeks",
      budget_total: S._budget ? chf(S._budget) : "–",
      validity: `${S.years} years`,
      expected_activations: `≈ ${fmt(rates().dref * S.years, 1)} of ${S.acts} allowed`,
    };
    fill(keys);
  }
  function rerenderCharts() {
    if (!D.events) return;
    chartHistory(); chartSeason(); chartTerrain(); renderTrigger(); renderLeadtime(false); chartChain(); chartSkill(); chartCase();
  }

  // ------------------------------------------------------------------ v1.0 helpers
  const table = (sel, head, rows) => { const el = $(sel); if (!el) return; el.innerHTML = `<thead><tr>${head.map((h) => `<th${h.startsWith("#") ? ' class="num"' : ""}>${h.replace(/^#/, "")}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>`; };
  const vflag = (v) => v ? `<span class="verified">verify</span>` : `<span class="verified yes">read in source</span>`;
  const ownerBadge = (o) => { const t = String(o || "").toLowerCase(); const cls = t.includes("nrcs") ? "nrcs" : t.includes("gov") ? "gov" : ""; return `<span class="owner ${cls}">${esc(o || "–")}</span>`; };
  const link1 = (u) => { const x = [].concat(u || [])[0]; if (!x) return ""; try { return `<a href="${esc(x)}" target="_blank" rel="noopener">${esc(new URL(x).hostname.replace(/^www\./, ""))}</a>`; } catch (e) { return ""; } };

  // §01 alert chain swimlane
  function chartChain() {
    const lanes = ["Hazard", "Gauges / sensors", "DHM", "Public alert", "People"];
    const actual = [
      [0, "Hazard", "Collapse 08:37"], [5, "Hazard", "Rasuwagadhi hit"], [13, "Hazard", "Syabrubesi"], [43, "Hazard", "Betrawati"],
      [3, "Gauges / sensors", "Rasuwagadhi 1.6 m, then lost"], [13, "Gauges / sensors", "Syabrubesi silent"], [43, "Gauges / sensors", "Betrawati silent"],
      [23, "DHM", "Phone call from DAO"], [28, "DHM", "Confirmed"],
      [38, "Public alert", "SMS to 679,295 phones"], [33, "People", "Trishuli school evacuates (informal calls)"],
    ];
    const proposed = [
      [1, "Gauges / sensors", "Seismic signal + 2nd sensor"], [3, "Public alert", "Cell broadcast + sirens"], [3, "People", "Tunnel count-out starts"],
      [4, "DHM", "Duty officer veto window closes"],
    ];
    const H = 270; const [svg, w] = svgBox("#chart-chain", H);
    const m = { l: w < 600 ? 90 : 130, r: 20, t: 14, b: 28 };
    const x = d3.scaleLinear().domain([0, 50]).range([m.l, w - m.r]);
    const y = d3.scaleBand().domain(lanes).range([m.t, H - m.b]).padding(0.25);
    svg.append("g").selectAll("rect").data(lanes).join("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("y", (d) => y(d)).attr("height", y.bandwidth()).attr("fill", css("--surface-2"));
    svg.append("g").selectAll("text").data(lanes).join("text").attr("class", "lbl").attr("x", m.l - 8).attr("y", (d) => y(d) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text((d) => d);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(10).tickFormat((v) => `+${v} min`).tickSizeOuter(0));
    const draw = (data, color, dy, cls) => {
      const g = svg.append("g");
      g.selectAll("circle").data(data).join("circle").attr("cx", (d) => x(d[0])).attr("cy", (d) => y(d[1]) + y.bandwidth() / 2 + dy).attr("r", 5).attr("fill", color).attr("stroke", css("--surface")).attr("stroke-width", 2)
        .on("mousemove", (e, d) => showTip(e, `<b>+${d[0]} min · ${esc(d[2])}</b><br>${cls}`)).on("mouseleave", hideTip);
      if (w > 700) g.selectAll("text").data(data).join("text").attr("x", (d) => x(d[0]) + 8).attr("y", (d) => y(d[1]) + y.bandwidth() / 2 + dy + 4).attr("fill", css("--ink-2")).style("font-size", "10.5px").text((d) => d[2]);
    };
    draw(actual, css("--muted"), -7, "as it happened, 26 Aug 2026");
    draw(proposed, css("--accent"), 9, "proposed linked system (rung 4)");
    svg.append("text").attr("x", w - m.r).attr("y", m.t + 10).attr("text-anchor", "end").attr("fill", css("--ink-2")).style("font-size", "11px").text("grey = as it happened · red = proposed");
  }

  // §02 month × type
  function tableHeat() {
    const ev = D.events.map((e) => ({ m: +String(e.date).slice(5, 7) || null, cat: typeOf(e.type) })).filter((e) => e.m);
    const cats = ["rain", "glof", "mass"];
    const M = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
    const mx = d3.max(cats.flatMap((c) => d3.range(1, 13).map((m) => ev.filter((e) => e.cat === c && e.m === m).length)));
    $("#tbl-heat").innerHTML = `<thead><tr><th>Type</th>${M.map((m) => `<th>${m}</th>`).join("")}</tr></thead><tbody>` + cats.map((c) => `<tr><td style="text-align:left">${TYPE_LABEL[c]}</td>${d3.range(1, 13).map((m) => { const n = ev.filter((e) => e.cat === c && e.m === m).length; return `<td style="background:${n ? `color-mix(in srgb, var(--accent) ${Math.round(15 + 70 * n / mx)}%, transparent)` : "transparent"};color:${n / mx > 0.5 ? "var(--accent-ink)" : "var(--ink-2)"}">${n || ""}</td>`; }).join("")}</tr>`).join("") + "</tbody>";
  }

  // §03 robustness
  function renderRobust() {
    const rb = D.robust; if (!rb) return;
    const al = rb.insample.alert_strict, alg = rb.insample.alert_generous, ca = rb.insample.cash_strict, cv = rb.cv, bs = rb.bootstrap, ch = rb.chance;
    $("#robust-kpis").innerHTML = [
      [`${alg.caught} / ${alg.events}`, `prepare trigger, generous scoring (10-day clusters, any district)`],
      [`${al.caught} / ${al.events}`, `prepare trigger, strict scoring (${pct(al.toll_caught / al.toll)} of the toll; 90% interval of catch rate ${bs.alert.catch_rate_90.map(pct).join("–")})`],
      [`${cv.alert.caught} / ${cv.alert.events}`, `out of sample (leave one season out), ${fmt(cv.alert.acts_per_year, 1)} activations/yr`],
      [`${ch.alert.expected_caught}`, `expected by chance with the same number of activations (p ${ch.alert.p_value < 0.001 ? "< 0.001" : "= " + ch.alert.p_value})`],
      [`${ca.caught} / ${ca.events}`, `rain trigger within 2 DREF activations in 5 years (chance ${ch.cash.expected_caught}, p = ${ch.cash.p_value})`],
    ].map(([v, l]) => `<div><span class="v">${v}</span><span class="l">${l}</span></div>`).join("");
    table("#tbl-robust-events", ["Major event (first report)", "Last report", "#Dead + missing", "Most affected districts", "Prepare (rung 2)", "Rain cash (3b)"],
      rb.events.map((e) => `<tr><td class="mono">${e.start}</td><td class="mono">${e.end}</td><td class="num">${e.toll}</td><td class="small">${e.districts.map(esc).join(", ")}</td>
        <td>${e.alert ? `<span style="color:var(--s-good-ink)">✓ ${e.alert.lead_days} d ahead</span>` : `<span class="muted">✕ missed</span>`}</td><td>${e.cash ? `<span style="color:var(--s-good-ink)">✓ ${e.cash.lead_days} d</span>` : `<span class="muted">✕</span>`}</td></tr>`));
    $("#robust-note").innerHTML = `Strict scoring: fatal district-days are chained into an event when less than 4 days apart (${rb.n_events_strict} events with ≥ ${rb.toll} dead or missing). An event counts as caught only if an activation starts from 2 days before to the day of its first report, in an impacted district or a neighbour. The settings were chosen on these data; the cross-validated line shows how much of that is luck. The skill of the prepare trigger is well above chance, but it still misses most events.`;
    const ss = rb.second_signal;
    $("#second-kpis").innerHTML = [
      [`${fmt(ss.prepare.per_district_decade, 1)} → ${fmt(ss.evacuate.per_district_decade, 1)}`, "activations per district per decade: forecast alone → forecast + observed rain"],
      [`${pct(ss.prepare.far)} → ${pct(ss.evacuate.far)}`, "false-alarm ratio at district level"],
      [`${ss.evacuate_major.caught} / ${ss.evacuate_major.events}`, `major events still caught with the second signal (${pct(ss.evacuate_major.toll_caught / ss.evacuate_major.toll)} of the toll)`],
    ].map(([v, l]) => `<div><span class="v">${v}</span><span class="l">${l}</span></div>`).join("");
    $("#second-note").innerHTML = "ERA5-Land stands in for the real-time second signal (a DHM rain gauge, IMERG-Early or an upstream warning level). A real gauge network would be noisier but faster.";
    table("#tbl-village", ["District", "#Prepare messages", "#Evacuation requests", "#Fatal flood days", "#…of which no signal"],
      Object.entries(rb.village).map(([d, v]) => `<tr><td>${esc(d)}</td><td class="num">${fmt(v.prepare_per_decade, 1)}</td><td class="num">${fmt(v.evacuate_per_decade, 1)}</td><td class="num">${fmt(v.fatal_days_per_decade, 1)}</td><td class="num">${fmt(v.fatal_days_missed_per_decade, 1)}</td></tr>`));
    $("#village-note").innerHTML = "Per decade, from the 2011–2019 backtest at the recommended setting. In these corridor districts the rain trigger missed every fatal flood day: their deaths came from cascades and very local cells. For them the protocol rests on rungs 1, 3b (dammed lakes) and 4.";
  }

  // §04 forecasts
  function renderMenu() {
    const tested = { "ECMWF IFS ENS (open data, real time)": "skill 2024–25 + 2 case studies", "NOAA GEFS v12 (operational and reforecast)": "backtest 2011–19", "DHM daily Flood Forecast Bulletin and flash-flood risk outlook": "", "GPM IMERG Early / Late / Final": "" };
    const menu = Array.isArray(D.menu) ? D.menu : (D.menu?.products || []);
    table("#tbl-menu", ["Product", "Provider", "Type", "Lead time", "Access", "Rungs", "Known skill in Nepal", "Tested here", "Source"],
      menu.map((f) => `<tr><td><b>${esc(f.name)}</b></td><td class="small">${esc(f.provider)}</td><td class="small">${esc(f.type)}</td><td class="small">${esc(f.lead_time)}</td><td class="small">${esc(f.access)}</td><td class="mono small">${esc([].concat(f.fit_for_rung || []).join(", "))}</td><td class="small">${esc(f.known_skill_nepal)}${f.confidence === "low" ? ' <span class="verified">low confidence</span>' : ""}</td><td class="small">${tested[f.name] ? `<span style="color:var(--s-good-ink)">✓ ${tested[f.name]}</span>` : ""}</td><td class="small">${link1(f.source_urls)}</td></tr>`));
  }
  function chartSkill() {
    const S_ = D.fcases?.skill; if (!S_ || !S_.length) { $("#chart-skill").remove(); return; }
    const models = [...new Set(S_.map((r) => r.model))]; const ks = [0.33, 1, 2];
    const H = 260; const [svg, w] = svgBox("#chart-skill", H); const m = { l: 44, r: 12, t: 16, b: 34 };
    const x0 = d3.scaleBand().domain([1, 2, 3]).range([m.l, w - m.r]).padding(0.2);
    const x1 = d3.scaleBand().domain(models).range([0, x0.bandwidth()]).padding(0.1);
    const y = d3.scaleLinear().domain([0.5, 1]).range([H - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r))).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x0).tickFormat((d) => `day ${d}`).tickSizeOuter(0));
    const col = (mo) => mo.startsWith("ECMWF") ? css("--accent") : css("--series-1");
    const pts = S_.filter((r) => r.k === 1);
    svg.append("g").selectAll("rect").data(pts).join("rect").attr("x", (r) => x0(r.lead) + x1(r.model)).attr("width", x1.bandwidth()).attr("y", (r) => y(Math.max(0.5, r.auc))).attr("height", (r) => y(0.5) - y(Math.max(0.5, r.auc))).attr("rx", 3).attr("fill", (r) => col(r.model))
      .on("mousemove", (e, r) => showTip(e, `<b>${esc(r.model)}</b>, day ${r.lead}<br>${ks.map((k) => { const q = S_.find((z) => z.model === r.model && z.lead === r.lead && z.k === k); return q ? `${kLabel(k)}: ROC ${q.auc}, BSS ${q.bss} (${q.n_events} exceedances)` : ""; }).join("<br>")}`)).on("mouseleave", hideTip);
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 2).text("ROC area (0.5 = no skill)");
    $("#skill-note").innerHTML = `<span class="legend">${models.map((mo) => `<span><i style="background:${col(mo)}"></i>${esc(mo)}</span>`).join("")}</span> Bars: district rain above its local "1 day per season" level, scored against ERA5-Land. Hover for other thresholds and the Brier skill score. The two models are scored on different years, so the comparison indicates rather than proves.`;
  }
  function chartCase() {
    const cs = D.fcases?.cases; if (!cs) return;
    const sel = $("#case-sel");
    if (!sel.options.length) { sel.innerHTML = Object.entries(cs).map(([k, c]) => `<option value="${k}">${esc(c.title)}</option>`).join(""); sel.addEventListener("change", chartCase); }
    const c = cs[sel.value]; const d0 = c.districts[0];
    const runs = c.runs.filter((r) => r.target === c.targets[1] || (r.target === c.targets[0] && c.targets.length === 1));
    const byD = c.districts.map((d) => ({ d, runs: c.runs.filter((r) => r.district === d && r.target === c.targets[c.targets.length - 1]).sort((a, b) => a.init.localeCompare(b.init)) }));
    const H = 300; const [svg, w] = svgBox("#chart-case", H); const m = { l: 44, r: 12, t: 16, b: 46 };
    const groups = byD.flatMap((g) => g.runs.map((r) => ({ ...r, key: `${g.d}|${r.init}` })));
    const x = d3.scaleBand().domain(groups.map((g) => g.key)).range([m.l, w - m.r]).padding(0.25);
    const ymax = d3.max([...groups.flatMap((g) => g.members), ...Object.values(c.obs_era5).flatMap((o) => Object.values(o)).filter((v) => v != null), ...Object.values(c.thr_obs_prepare)]) * 1.1 || 100;
    const y = d3.scaleLinear().domain([0, ymax]).nice().range([H - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r))).call((g) => g.select(".domain").remove());
    groups.forEach((g) => {
      const xs = x(g.key) + x.bandwidth() / 2; const q = (p) => d3.quantile([...g.members].sort(d3.ascending), p);
      svg.append("line").attr("x1", xs).attr("x2", xs).attr("y1", y(q(0.05))).attr("y2", y(q(0.95))).attr("stroke", css("--series-1")).attr("stroke-width", 2);
      svg.append("rect").attr("x", x(g.key)).attr("width", x.bandwidth()).attr("y", y(q(0.75))).attr("height", Math.max(1, y(q(0.25)) - y(q(0.75)))).attr("rx", 2).attr("fill", css("--series-1")).attr("fill-opacity", 0.35).attr("stroke", css("--series-1"))
        .on("mousemove", (e) => showTip(e, `<b>${esc(g.district)}</b> · run ${g.init} (day ${g.lead})<br>median ${fmt(q(0.5))} mm, 90% range ${fmt(q(0.05))}–${fmt(q(0.95))} mm<br>${g.members.length} members`)).on("mouseleave", hideTip);
      svg.append("line").attr("x1", x(g.key)).attr("x2", x(g.key) + x.bandwidth()).attr("y1", y(q(0.5))).attr("y2", y(q(0.5))).attr("stroke", css("--ink")).attr("stroke-width", 2);
    });
    byD.forEach((g) => {
      if (!g.runs.length) return;
      const x0 = x(`${g.d}|${g.runs[0].init}`), x1 = x(`${g.d}|${g.runs[g.runs.length - 1].init}`) + x.bandwidth();
      const thr = c.thr_obs_prepare[g.d], ob = c.obs_era5[g.d][c.targets[c.targets.length - 1]];
      svg.append("line").attr("x1", x0).attr("x2", x1).attr("y1", y(thr)).attr("y2", y(thr)).attr("stroke", css("--accent")).attr("stroke-width", 1.5);
      if (ob != null) svg.append("circle").attr("cx", (x0 + x1) / 2).attr("cy", y(ob)).attr("r", 5).attr("fill", css("--accent")).attr("stroke", css("--surface")).attr("stroke-width", 2);
      svg.append("text").attr("class", "lbl").attr("x", (x0 + x1) / 2).attr("y", H - m.b + 16).attr("text-anchor", "middle").text(g.d);
    });
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 2).text("mm/day, district 95th percentile");
    const tgt = c.targets[c.targets.length - 1];
    $("#case-note").innerHTML = `Boxes: ECMWF ENS runs from earlier to later days (left to right) for ${tgt}, interquartile range and 90% range. Red line: the district's prepare level in ERA5-Land (exceeded 2 days per season). Red dot: ERA5-Land observed. ${sel.value === "langtang_2026" ? "On 26 Aug 2026 the cascade was not rain-driven: the forecasts show monsoon rain but no extreme, so a rain trigger could not have anticipated it. Only detection (rung 4) could." : "In September 2024 the ensemble signalled extreme rain over the Kathmandu valley districts two to three days ahead: a prepare and, with observed rain, an evacuate signal."}`;
  }

  // §05 hydropower + linked systems
  function renderHydro() {
    const cor = ltCorr(); const arr = ltArrival(cor);
    const sensor = +$("#lt-sensor").value, delay = +$("#lt-delay").value, react = +$("#lt-react").value;
    const alert = arr(sensor) + delay;
    const sites = cor.assets.filter((a) => a.k === "hydropower" || a.k === "headworks").sort((a, b) => a.ch - b.ch);
    table("#tbl-hydro", ["Site (OSM)", "Type", "#km below source", "#Height above river (m)", "#Warning (min)", "Enough for tunnel count-out?"],
      sites.length ? sites.map((a) => { const wv = a.ch <= sensor ? null : arr(a.ch) - alert; const ok = wv != null && wv >= react;
        return `<tr><td>${esc(a.n || "unnamed site")}</td><td class="small">${a.k}</td><td class="num">${fmt(a.ch, 1)}</td><td class="num">${a.hand == null ? "–" : fmt(a.hand)}</td><td class="num">${wv == null ? "none" : fmt(wv)}</td><td style="color:${ok ? "var(--s-good-ink)" : "var(--s-crit-ink)"}">${ok ? "✓ yes" : "✕ no"}</td></tr>`; })
        : ['<tr><td colspan="6" class="muted">No hydropower sites mapped in OpenStreetMap along this corridor.</td></tr>']);
  }
  function renderLinked() {
    const L = D.inst?.linked_systems || [];
    table("#tbl-linked", ["Element", "Owner", "Status in 2026", "Funding", "Fallback without it", "Source"],
      L.map((e) => `<tr><td><b>${esc(e.element)}</b></td><td class="small">${esc(e.owner)}</td><td class="small">${esc(e.status_2026)}</td><td class="small">${esc(e.funding)}</td><td class="small">${esc(e.fallback_without_it)}</td><td class="small">${link1(e.source_url)} ${vflag(e.verify)}</td></tr>`));
  }

  // §06 operational matrix (+ new actions merged in boot)
  function renderOpMatrix() {
    const M = D.inst?.operational_matrix || [];
    table("#tbl-opmatrix", ["Action", "IFRC sector", "Standards", "Owner", "In DREF budget", "PGI note"],
      M.map((r) => { const a = D.actions.actions.find((x) => x.id === r.id); return `<tr><td><span class="mono small">${r.id}</span> ${esc((a?.name || r.name || "").split("(")[0])}</td><td class="small">${esc(r.ifrc_sector)}</td><td class="small">${esc(r.standard)}</td><td>${ownerBadge(r.owner_type)}</td><td>${r.in_dref_budget ? "✓" : "—"}</td><td class="small">${esc(r.pgi_note)}</td></tr>`; }));
  }

  // §07 targeting
  function renderTargeting() {
    const P = D.palikas || [];
    const sel = $("#pal-corr");
    if (!sel.options.length) { sel.innerHTML = `<option value="">all corridors</option>` + D.corridors.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(""); sel.addEventListener("change", renderTargeting); }
    const rows = P.filter((r) => !sel.value || r.corridor === sel.value).sort((a, b) => b.pop_25m - a.pop_25m);
    const tot = d3.sum(rows, (r) => r.hh_25m);
    table("#tbl-palikas", ["Palika", "District", "Corridor", "#People < 10 m", "#People < 25 m", "#≈ households", "#Share of pre-registration"],
      rows.map((r) => `<tr><td>${esc(r.palika)}</td><td class="small">${esc(r.district)}</td><td class="small">${esc(r.corridor)}</td><td class="num">${fmt(r.pop_10m)}</td><td class="num">${fmt(r.pop_25m)}</td><td class="num">${fmt(r.hh_25m)}</td><td class="num">${fmt(S.hh * r.hh_25m / Math.max(d3.sum(P, (x) => x.hh_25m), 1))}</td></tr>`));
    const allHH = d3.sum(P, (r) => r.hh_25m);
    const rb = D.robust; const cd = new Set(D.trigger.corridor_districts || []);
    const reach = rb ? rb.events.filter((e) => e.districts.some((d) => cd.has(d))).length : null;
    $("#reach-note").innerHTML = `${fmt(allHH)} households live less than 25 m above the corridor rivers; the default caseload pre-registers ${fmt(S.hh)} of them (${pct(S.hh / allHH)}), allocated in proportion to exposure and ranked by vulnerability. ${reach != null ? `Of the ${rb.events.length} major rain-flood events of 2011–2019, ${reach} touched a corridor district, so a rain-triggered DREF activation would reach registered households in about ${pct(reach / rb.events.length)} of cases.` : ""}`;
    table("#tbl-cash", ["Topic", "Design", "Source"], (D.inst?.cash_design || []).map((c) => `<tr><td><b>${esc(c.topic)}</b></td><td class="small">${esc(c.statement || c.design || "")}</td><td class="small">${link1(c.source_url)} ${vflag(c.verify)}</td></tr>`));
  }

  // §08 operations
  function renderOps() {
    table("#tbl-orders", ["Decision", "Who has the authority", "Legal basis", "NRCS role", "Pre-agreement the EAP needs", "Check"],
      (D.inst?.who_orders || []).map((o) => `<tr><td><b>${esc(o.decision)}</b></td><td class="small">${esc(o.legal_body)}</td><td class="small">${esc(o.legal_basis)}</td><td class="small">${esc(o.nrcs_role)}</td><td class="small">${esc(o.pre_agreement)}</td><td class="small">${link1(o.source_url)} ${vflag(o.verify)}</td></tr>`));
    table("#tbl-sop", ["Rung · time", "Who", "What", "Within", "Owner"], C.sop.map((r) => `<tr><td class="mono small">${r[0]}</td><td><b>${r[1]}</b></td><td>${r[2]}</td><td class="mono">${r[3]}</td><td>${ownerBadge(r[4] === "nrcs" ? "NRCS" : "government")}</td></tr>`));
    table("#tbl-dam", ["Step", "Who", "What", "Time"], C.dam.map((r) => `<tr><td><b>${r[0]}</b></td><td class="small">${r[1]}</td><td class="small">${r[2]}</td><td class="mono small">${r[3]}</td></tr>`));
    $("#readiness-list").innerHTML = C.readiness.map((t) => `<li>${t}</li>`).join("");
    $("#prepos-list").innerHTML = C.prepositioning.map((t) => `<li>${t}</li>`).join("");
    table("#tbl-4w", ["District", "Province", "Corridor", "NRCS presence", "Key non-NS actors", "Main languages", "Rungs"],
      (D.inst?.four_w || []).map((r) => `<tr><td><b>${esc(r.district)}</b></td><td class="small">${esc(r.province)}</td><td class="small">${esc(r.corridor || "")}</td><td class="small">${esc(r.nrcs_presence)}</td><td class="small">${esc(r.key_non_ns_actors)}</td><td class="small">${esc(Array.isArray(r.main_languages) ? r.main_languages.join(", ") : r.main_languages)}</td><td class="small">${esc(r.rung_coverage)}</td></tr>`));
    const ms = D.inst?.messages; if (!ms) return;
    const txt = (v) => typeof v === "string" ? v : (v?.text || "");
    $("#msg-gallery").innerHTML = (ms.texts || []).map((t) => `<div class="msg"><b>${esc(t.rung)}</b>
      <div><span class="lang">English</span><div>${esc(t.english)}</div></div>
      <div><span class="lang">नेपाली (draft)</span><div class="dev">${esc(txt(t.nepali))}</div></div>
      ${t.chinese ? `<div><span class="lang">中文 (draft)</span><div>${esc(txt(t.chinese))}</div></div>` : ""}
      <div class="small muted">${esc(t.sender_note || "")}</div></div>`).join("");
    $("#msg-note").innerHTML = `${esc(ms.cell_broadcast_note || "")} ${ms.siren_code ? `<b>Siren code:</b> ${esc(typeof ms.siren_code === "string" ? ms.siren_code : JSON.stringify(ms.siren_code))}` : ""} Tamang, Sherpa, Gurung, Yolmo and other texts are to be written and checked by native speakers.`;
  }

  // §10 additions
  function renderMeal2() {
    table("#tbl-indicators", ["Area", "Indicator", "Target", "Source"], C.indicators.map((r) => `<tr><td><b>${r[0]}</b></td><td class="small">${r[1]}</td><td class="mono small">${r[2]}</td><td class="small">${r[3]}</td></tr>`));
    const cap = D.inst?.ns_capacity; table("#tbl-capacity", ["Topic", "Known from public sources", "To be completed by NRCS"], (cap?.items || []).map((r) => `<tr><td><b>${esc(r.topic)}</b></td><td class="small">${esc(r.known_public)}</td><td class="small">${esc(r.to_complete)}</td></tr>`));
    table("#tbl-endorse", ["#Step", "Who", "What they agree", "Timing"], (D.inst?.endorsement || []).map((r) => `<tr><td class="num">${r.step}</td><td class="small"><b>${esc(r.who)}</b></td><td class="small">${esc(r.what_they_agree)}</td><td class="small">${esc(r.timing)}</td></tr>`));
  }
  function renderChangelog() {
    $("#changelog").innerHTML = C.changelog.map((c) => `<li><b>${c[0]}:</b> ${c[1]}. <span class="muted">→</span> ${c[2]}</li>`).join("");
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    buildToc();
    const names = ["numbers", "events", "event2026", "bipad", "corridors", "lakes", "trigger", "actions", "impacts", "districts", "refs", "robust", "fcases", "menu", "inst", "palikas"];
    const files = { numbers: "numbers.json", events: "events.json", event2026: "event_2026_langtang.json", bipad: "bipad_summary.json",
      corridors: "corridors.json", lakes: "lakes.json", trigger: "trigger_backtest.json", actions: "early_actions.json",
      impacts: "impact_pathways.json", districts: "districts.geojson", refs: "references.json", robust: "trigger_robustness.json",
      fcases: "forecast_cases.json", menu: "forecast_menu.json", inst: "institutions.json", palikas: "palikas.json" };
    const res = await Promise.all(names.map((n) => fetch("data/" + files[n]).then((r) => r.ok ? r.json() : null).catch(() => null)));
    names.forEach((n, i) => { D[n] = res[i]; });
    fill({ ...D.numbers.keys, version: C.version });
    // New actions from the operational matrix (EA26+) join the action catalogue.
    (D.inst?.operational_matrix || []).filter((r) => r.name && !D.actions.actions.some((a) => a.id === r.id)).forEach((r) => D.actions.actions.push({ ...r, added: true }));
    if (!store.get("state-v1", null) && D.robust) { const st = D.robust.insample.alert_strict.setting; Object.assign(S, { k: st.k, p: st.p, m: st.m, lead: st.lead }); }
    const safe = (f) => { try { f(); } catch (e) { console.error(e); } };
    safe(renderLadder); safe(initEvent); safe(renderRisk); safe(bindTrigger); safe(renderTrigger); safe(initLeadtime);
    safe(chartChain); safe(tableHeat); safe(renderRobust); safe(renderMenu); safe(chartSkill); safe(chartCase); safe(renderHydro); safe(renderLinked);
    safe(renderActions); safe(renderOpMatrix); safe(renderTargeting); safe(renderOps); safe(bindBudget); safe(renderBudget); safe(renderMeal); safe(renderMeal2); safe(renderChangelog);
    safe(renderDecisions); safe(renderChecklist); safe(renderMethods);
    fill({ ...D.numbers.keys, version: C.version }); safe(renderTrigger); // fill spans created by the renders above
    $("#hand-band").addEventListener("change", tableCorridors);
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(rerenderCharts, 200); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rerenderCharts);
  }
  boot();
})();
