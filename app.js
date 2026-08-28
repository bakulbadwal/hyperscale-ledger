/* Hyperscale Ledger — renderer + scenario model.
   Arithmetic is kept deliberately simple enough to audit by reading. */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let DB = null;

const fmt = {
  int:  n => n == null ? "—" : Math.round(n).toLocaleString("en-US"),
  n1:   n => n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 1 }),
  n2:   n => n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }),
  usdB: n => n == null ? "—" : "$" + (n / 1e9).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " B",
  usdM: n => n == null ? "—" : "$" + (n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " M",
  pct:  n => n == null ? "—" : (n * 100).toFixed(0) + "%"
};

const tag = c => {
  const k = (c || "").toUpperCase();
  if (k === "F") return '<span class="tag f">F</span>';
  if (k === "R") return '<span class="tag r">R</span>';
  if (k === "T") return '<span class="tag t">T</span>';
  return '<span class="tag null">—</span>';
};

/* ══════════════════ scenario model ══════════════════ */

const CONTROLS = [
  { id: "it_mw",      label: "IT load",              unit: "MW",     min: 50,   max: 600,  step: 10,    def: 250,
    note: "Matches Nscale's financed 230 MW Narvik site." },
  { id: "gpu_life",   label: "GPU useful life",      unit: "yr",     min: 2,    max: 7,    step: 0.5,   def: 5,
    note: "Epoch AI assumes 5. NVIDIA has shipped 3 generations in ~3 years." },
  { id: "rack_kw",    label: "Rack power",           unit: "kW",     min: 100,  max: 145,  step: 1,     def: 120,
    note: "~120 kW nominal; operators design to 130–132 kW." },
  { id: "util",       label: "Utilization",          unit: "",       min: 0.4,  max: 0.95, step: 0.01,  def: 0.71,
    note: "Epoch AI, May 2026.", pct: true },
  { id: "pue",        label: "PUE",                  unit: "",       min: 1.05, max: 1.5,  step: 0.01,  def: 1.14,
    note: "Epoch AI. Nordic sites run lower." },
  { id: "elec",       label: "Electricity",          unit: "$/kWh",  min: 0.02, max: 0.18, step: 0.001, def: 0.0834,
    note: "US industrial weighted average (Epoch AI).", dp: 4 },
  { id: "rack_cost",  label: "Cost per rack",        unit: "$M",     min: 2.0,  max: 4.5,  step: 0.1,   def: 3.0,
    note: "GB200 NVL72 reported at $2.8–3.4 M. Not vendor-published." }
];

const K = {
  gpus_per_rack: 72,
  server_share: 0.56,       // Epoch AI: servers = 56% of upfront capex
  epoch_capex_per_mw: 37.883e9 / 1000,
  facility_life: 14,        // Epoch AI

  // PRECISION IS HELD FIXED, per METHOD.md. The MLPerf figure below is an FP8-basis
  // measurement (see specs.json > benchmarks), so peak must also be quoted at dense FP8 —
  // 360 PFLOPS/rack, half the printed sparse 720. Comparing it against the FP4 nameplate
  // (720 dense / 1,440 sparse) would compare two different number formats and inflate the
  // apparent shortfall by exactly 2x. That is the error this whole page is about.
  peak_dense_pflops_rack: 360,
  peak_basis: "dense FP8",
  mlperf_tflops_per_gpu: 1960   // overwritten from specs.json at boot
};

let S = {};
const resetState = () => { S = {}; CONTROLS.forEach(c => S[c.id] = c.def); };

function model(s = S) {
  const racks = (s.it_mw * 1000) / s.rack_kw;
  const gpus = racks * K.gpus_per_rack;
  const computeCapex = racks * s.rack_cost * 1e6;
  const capexBottomUp = computeCapex / K.server_share;
  const capexTopDown = K.epoch_capex_per_mw * s.it_mw;
  const facilityCapex = Math.max(capexBottomUp - computeCapex, 0);

  const facilityMW = s.it_mw * s.pue;
  const twh = (facilityMW * 8760 * s.util) / 1e6;
  const energy = twh * 1e9 * s.elec;

  const computeDep = computeCapex / s.gpu_life;
  const facilityDep = facilityCapex / K.facility_life;
  const annual = computeDep + facilityDep + energy;

  const peakEF = (racks * K.peak_dense_pflops_rack) / 1000;
  const sustEF = (gpus * K.mlperf_tflops_per_gpu) / 1e6;
  const costPerEffPflopYr = annual / (sustEF * 1000);

  return { racks, gpus, computeCapex, capexBottomUp, capexTopDown, facilityCapex,
           facilityMW, twh, energy, computeDep, facilityDep, annual,
           peakEF, sustEF, costPerEffPflopYr };
}

/* ---------- controls ---------- */
function renderControls() {
  $("#controls").innerHTML = CONTROLS.map(c => {
    const v = S[c.id];
    return `<div class="ctl">
      <div class="ctl-head">
        <label for="c-${c.id}">${c.label}</label>
        <span class="val" id="v-${c.id}">${ctlDisplay(c, v)}</span>
      </div>
      <input type="range" id="c-${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}">
      <div class="note">${c.note}</div>
    </div>`;
  }).join("");

  CONTROLS.forEach(c => {
    $(`#c-${c.id}`).addEventListener("input", e => {
      S[c.id] = parseFloat(e.target.value);
      $(`#v-${c.id}`).textContent = ctlDisplay(c, S[c.id]);
      renderScenario();
    });
  });
}
const ctlDisplay = (c, v) =>
  c.pct ? fmt.pct(v) : `${c.dp ? v.toFixed(c.dp) : fmt.n2(v)}${c.unit ? " " + c.unit : ""}`;

/* ---------- scenario view ---------- */
function renderScenario() {
  const m = model();

  $("#tiles").innerHTML = [
    ["Racks",            fmt.int(m.racks),                      `${K.gpus_per_rack} GPUs each`],
    ["GPUs",             fmt.int(m.gpus),                       "GB200 NVL72 proxy"],
    ["Facility power",   fmt.n1(m.facilityMW) + " MW",          `PUE ${fmt.n2(S.pue)}`],
    ["Annual energy",    fmt.n2(m.twh) + " TWh",                fmt.usdM(m.energy) + "/yr"],
    ["Compute capex",    fmt.usdB(m.computeCapex),              `at $${fmt.n1(S.rack_cost)}M/rack`],
    ["Total capex",      fmt.usdB(m.capexBottomUp),             "bottom-up route"],
    ["Annual cost",      fmt.usdB(m.annual),                    "depreciation + energy"],
    ["$ / effective PFLOP·yr", fmt.int(m.costPerEffPflopYr),    "on MLPerf-sustained"]
  ].map(([k, v, d], i) =>
    `<div class="tile${i === 7 ? " accent" : ""}"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`
  ).join("");

  renderTornado();

  const spread = Math.abs(m.capexBottomUp - m.capexTopDown) / Math.min(m.capexBottomUp, m.capexTopDown);
  $("#capex-routes").innerHTML = `
    <table>
      <tr><td><strong>Bottom-up</strong><div class="sub">racks × cost ÷ 56% server share</div></td><td class="n">${fmt.usdB(m.capexBottomUp)}</td></tr>
      <tr><td><strong>Top-down</strong><div class="sub">Epoch AI $37.9 B per GW</div></td><td class="n">${fmt.usdB(m.capexTopDown)}</td></tr>
      <tr><td><strong>Reported range</strong></td><td class="n">${fmt.usdB(Math.min(m.capexBottomUp, m.capexTopDown))} – ${fmt.usdB(Math.max(m.capexBottomUp, m.capexTopDown))}</td></tr>
      <tr><td><strong>Disagreement</strong></td><td class="n">${fmt.pct(spread)}</td></tr>
      <tr><td><strong>Capital intensity</strong></td><td class="n">$${fmt.int(Math.min(m.capexBottomUp, m.capexTopDown) / S.it_mw / 1e6)}–${fmt.int(Math.max(m.capexBottomUp, m.capexTopDown) / S.it_mw / 1e6)} M / MW</td></tr>
    </table>
    <p class="sub" style="margin-top:12px;margin-bottom:0">Two independent derivations of the same quantity. The range is reported rather than the midpoint — averaging destroys the information that they disagree.</p>`;

  const ratio = m.peakEF / m.sustEF;
  $("#throughput").innerHTML = `
    <table>
      <tr><td><strong>Peak, ${K.peak_basis}</strong><div class="sub">${K.peak_dense_pflops_rack} PFLOPS/rack</div></td><td class="n">${fmt.int(m.peakEF)} EFLOPS</td></tr>
      <tr><td><strong>MLPerf-sustained</strong><div class="sub">Llama 3.1 405B, ${fmt.int(K.mlperf_tflops_per_gpu)} TFLOPS/GPU — FP8 basis</div></td><td class="n">${fmt.int(m.sustEF)} EFLOPS</td></tr>
      <tr><td><strong>Delivered fraction</strong></td><td class="n">${fmt.pct(m.sustEF / m.peakEF)}</td></tr>
      <tr><td><strong>Same figure vs. FP4 nameplate</strong><div class="sub">the comparison to avoid</div></td><td class="n">${fmt.pct(m.sustEF / (m.peakEF * 2))}</td></tr>
    </table>
    <p class="sub" style="margin-top:12px;margin-bottom:0">Like-for-like, nameplate overstates delivered capacity by <strong style="color:var(--ink)">${fmt.n1(ratio)}×</strong>. Quote the same measurement against the <em>FP4</em> nameplate and it becomes ${fmt.n1(ratio * 2)}× — but half that gap is one precision halving, not lost utilisation.</p>`;
}

/* ---------- tornado ---------- */
function renderTornado() {
  const base = model().annual;
  const rows = CONTROLS.map(c => {
    const lo = model({ ...S, [c.id]: c.min }).annual;
    const hi = model({ ...S, [c.id]: c.max }).annual;
    return { label: c.label, swing: Math.abs(hi - lo), lo: Math.min(lo, hi), hi: Math.max(lo, hi),
             loLab: ctlDisplay(c, c.min), hiLab: ctlDisplay(c, c.max) };
  }).sort((a, b) => b.swing - a.swing);

  const max = rows[0].swing || 1;
  $("#tornado").innerHTML = `<table>${rows.map(r => `
    <tr>
      <td style="width:130px"><strong>${r.label}</strong><div class="sub">${r.loLab} → ${r.hiLab}</div></td>
      <td style="width:auto">
        <div style="background:var(--surface-3);border-radius:3px;height:9px;position:relative;min-width:80px">
          <div style="position:absolute;left:0;top:0;height:9px;border-radius:3px;width:${(r.swing / max * 100).toFixed(1)}%;background:${r.swing === max ? "var(--primary)" : "var(--hairline-tertiary)"}"></div>
        </div>
      </td>
      <td class="n" style="width:110px">${fmt.usdM(r.swing)}/yr</td>
    </tr>`).join("")}</table>`;

  const m = model();
  const dep35 = model({ ...S, gpu_life: 3 }).computeDep - model({ ...S, gpu_life: 5 }).computeDep;
  $("#dominance").innerHTML = `
    <p><strong>Depreciation dominates energy.</strong> Holding everything else at its sourced default, moving GPU useful life from
    <strong>5 years to 3</strong> raises annual compute depreciation by <strong style="color:var(--primary-hover)">${fmt.usdM(dep35)}</strong> —
    about <strong style="color:var(--primary-hover)">${fmt.n1(dep35 / m.energy)}×</strong> the entire annual electricity bill of ${fmt.usdM(m.energy)}.</p>
    <p style="margin-bottom:0">The AI-capex debate is conducted almost wholly in the language of electricity. Electricity is the second-order term.
    The first-order term is obsolescence — and obsolescence is set by the supplier's release cadence, not by the operator.</p>`;
}

/* ══════════════════ trend ══════════════════ */

function trendSeries() {
  // Flagship SXM parts only, dense FP16/BF16 only. Tensor-core parts only —
  // P100 predates tensor cores and is excluded from the fit, shown separately.
  const parts = DB.parts.filter(p => p.flagship && p.perf_dense &&
    (p.perf_dense.bf16 != null || p.perf_dense.fp16 != null));
  return parts.map(p => ({
    id: p.id, name: p.name, year: p.launch_year,
    v: p.perf_dense.bf16 ?? p.perf_dense.fp16,
    tensor: p.has_tensor_cores !== false,
    tdp: p.tdp_w, bw: p.memory && p.memory.bandwidth_tb_s
  })).sort((a, b) => a.year - b.year);
}

function renderTrend() {
  const all = trendSeries();
  const fit = all.filter(d => d.tensor);           // V100 onward
  const pre = all.filter(d => !d.tensor);          // P100, vector FP16

  const W = 820, H = 340, P = { t: 18, r: 20, b: 34, l: 58 };
  const years = all.map(d => d.year);
  const x0 = Math.min(...years) - 0.6, x1 = Math.max(...years) + 0.6;
  const vals = all.map(d => d.v);
  const lo = Math.min(...vals) / 2, hi = Math.max(...vals) * 2;
  const X = y => P.l + (y - x0) / (x1 - x0) * (W - P.l - P.r);
  const Y = v => P.t + (1 - (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (H - P.t - P.b);

  const ticks = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) ticks.push(10 ** e);

  const line = pts => pts.map((d, i) => `${i ? "L" : "M"}${X(d.year).toFixed(1)},${Y(d.v).toFixed(1)}`).join(" ");

  // Marketing curve: each generation's headline figure (narrowest float format, with
  // sparsity). Restricted to tensor-core parts so it spans the SAME years as the fitted
  // series — comparing two rates measured over different spans is the error this page is about.
  const head = DB.parts.filter(p => p.flagship && p.headline_marketing_tflops != null &&
      p.has_tensor_cores !== false)
    .map(p => ({ year: p.launch_year, v: p.headline_marketing_tflops, name: p.name }))
    .sort((a, b) => a.year - b.year);

  $("#trend-chart").innerHTML = `
  <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="GPU dense FP16/BF16 throughput by launch year, log scale">
    ${ticks.map(t => `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/>
      <text x="${P.l - 8}" y="${(Y(t) + 3).toFixed(1)}" text-anchor="end">${t >= 1000 ? (t / 1000) + "k" : t}</text>`).join("")}
    <line class="axis" x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}"/>
    ${all.map(d => `<text x="${X(d.year).toFixed(1)}" y="${H - P.b + 16}" text-anchor="middle">${d.year}</text>`).join("")}

    ${head.length > 1 ? `<path class="ln" d="${line(head)}" stroke="var(--ink-tertiary)" stroke-dasharray="4 3"/>` : ""}
    ${head.map(d => `<circle class="pt" cx="${X(d.year).toFixed(1)}" cy="${Y(d.v).toFixed(1)}" r="3.5" fill="var(--ink-tertiary)"/>`).join("")}

    <path class="ln" d="${line(fit)}" stroke="var(--primary)"/>
    ${fit.map(d => `<circle class="pt" cx="${X(d.year).toFixed(1)}" cy="${Y(d.v).toFixed(1)}" r="4.5" fill="var(--primary)"/>
      <text x="${X(d.year).toFixed(1)}" y="${(Y(d.v) - 12).toFixed(1)}" text-anchor="middle" fill="var(--ink-muted)">${fmt.n1(d.v)}</text>`).join("")}

    ${pre.map(d => `<circle class="pt" cx="${X(d.year).toFixed(1)}" cy="${Y(d.v).toFixed(1)}" r="4.5" fill="none" stroke="var(--ink-subtle)" stroke-width="1.5"/>
      <text x="${X(d.year).toFixed(1)}" y="${(Y(d.v) - 12).toFixed(1)}" text-anchor="middle" fill="var(--ink-subtle)">${fmt.n1(d.v)}</text>`).join("")}
  </svg>`;

  $("#trend-legend").innerHTML = `
    <span><i style="background:var(--primary)"></i>Dense FP16/BF16 tensor, flagship SXM (the honest series)</span>
    <span><i style="background:transparent;border:1.5px solid var(--ink-subtle)"></i>P100 — vector FP16, no tensor cores (not comparable)</span>
    ${head.length > 1 ? `<span><i style="background:var(--ink-tertiary)"></i>Headline marketing figure (sparse, narrowest format)</span>` : ""}`;

  // doubling time on the fitted series
  const n = fit.length;
  if (n >= 2) {
    const a = fit[0], b = fit[n - 1];
    const yrs = b.year - a.year;
    const growth = Math.log2(b.v / a.v);
    const dbl = yrs / growth;
    const cagr = Math.pow(b.v / a.v, 1 / yrs) - 1;

    let headlineRow = "";
    if (head.length > 1) {
      const h0 = head[0], h1 = head[head.length - 1];
      const hd = (h1.year - h0.year) / Math.log2(h1.v / h0.v);
      headlineRow = `<tr><td><strong>Headline marketing basis</strong><div class="sub">${h0.name} → ${h1.name}, mixed precision</div></td><td class="n">${fmt.n2(hd)} yr</td></tr>`;
    }

    $("#doubling").innerHTML = `
      <table>
        <tr><td><strong>Fixed-precision doubling time</strong><div class="sub">${a.name} (${a.year}) → ${b.name} (${b.year}), dense FP16/BF16</div></td><td class="n">${fmt.n2(dbl)} yr</td></tr>
        <tr><td><strong>Implied annual growth</strong></td><td class="n">${fmt.pct(cagr)}</td></tr>
        ${headlineRow}
        <tr><td><strong>Huang's Law as stated</strong><div class="sub">“more than double every two years”</div></td><td class="n">2.00 yr</td></tr>
        <tr><td><strong>Epoch AI, measured 2006–2021</strong><div class="sub">GPU price-performance</div></td><td class="n">~2.50 yr</td></tr>
      </table>
      ${(() => {
        if (head.length < 2) return "";
        const h0 = head[0], h1 = head[head.length - 1];
        const hd = (h1.year - h0.year) / Math.log2(h1.v / h0.v);
        return `<div class="callout" style="margin-top:16px">
          <p><strong>Huang's Law holds — and the marketing curve still overstates it.</strong>
          On a fixed-precision basis (${a.name} → ${b.name}, same span, dense BF16 throughout) this line doubles every
          <strong style="color:var(--primary-hover)">${fmt.n2(dbl)} years</strong> — comfortably inside the “more than double every two years” claim.
          On the headline basis it doubles every <strong style="color:var(--primary-hover)">${fmt.n2(hd)} years</strong>,
          a curve <strong style="color:var(--primary-hover)">${fmt.n2(dbl / hd)}× steeper</strong>.</p>
          <p style="margin-bottom:0">That gap is not silicon. It is number formats getting narrower and sparsity being counted —
          roughly ${fmt.pct(1 - hd / dbl)} of the apparent gain. The hardware progress is real and fast; the published version of it is faster still.</p>
        </div>`;
      })()}`;
  }

  $("#trend-table").innerHTML = `
    <thead><tr><th>Part</th><th>Year</th><th class="n">Dense FP16/BF16</th><th class="n">TDP</th><th class="n">Mem BW</th></tr></thead>
    <tbody>${all.map(d => `<tr>
      <td><strong>${d.name}</strong>${d.tensor ? "" : ' <span class="tag null">vector</span>'}</td>
      <td class="n">${d.year}</td>
      <td class="n">${fmt.n1(d.v)} TF</td>
      <td class="n">${d.tdp ? d.tdp + " W" : "—"}</td>
      <td class="n">${d.bw ? fmt.n2(d.bw) + " TB/s" : "—"}</td>
    </tr>`).join("")}</tbody>`;
}

/* ══════════════════ claim checker ══════════════════ */

function checkClaim() {
  const raw = $("#claim-val").value.replace(/[, ]/g, "");
  const unit = $("#claim-unit").value;
  const out = $("#claim-out");
  if (!raw) { out.innerHTML = `<p class="sub">Enter a value.</p>`; return; }
  const v = parseFloat(raw);
  if (!isFinite(v)) { out.innerHTML = `<p class="err">Not a number.</p>`; return; }

  const tol = 0.02;
  const near = (a, b) => b != null && Math.abs(a - b) / b <= tol;
  const hits = [];

  DB.parts.forEach(p => {
    const push = (basis, val, warn) => hits.push({ part: p.name, basis, val, warn });
    if (unit === "tflops" || unit === "pflops") {
      const scale = unit === "pflops" ? 1000 : 1;
      ["fp64","fp32","tf32","bf16","fp16","fp8","fp4","int8_tops"].forEach(k => {
        if (p.perf_dense && near(v * scale, p.perf_dense[k])) push(`dense ${k.toUpperCase()}`, p.perf_dense[k], null);
        if (p.perf_sparse && near(v * scale, p.perf_sparse[k]))
          push(`<strong style="color:var(--warn)">sparse</strong> ${k.toUpperCase()}`, p.perf_sparse[k],
               "with-sparsity figure — dense is half this");
      });
      if (p.perf_dense_pflops) Object.keys(p.perf_dense_pflops).forEach(k => {
        if (near(unit === "pflops" ? v : v / 1000, p.perf_dense_pflops[k])) push(`rack dense ${k.toUpperCase()}`, p.perf_dense_pflops[k], "rack-scale, not per-GPU");
      });
      if (p.perf_sparse_pflops) Object.keys(p.perf_sparse_pflops).forEach(k => {
        if (near(unit === "pflops" ? v : v / 1000, p.perf_sparse_pflops[k]))
          push(`rack <strong style="color:var(--warn)">sparse</strong> ${k.toUpperCase()}`, p.perf_sparse_pflops[k], "rack-scale AND with-sparsity — dense is half");
      });
    }
    if (unit === "watts") {
      if (near(v, p.tdp_w) || (p.tdp_range_w && v >= p.tdp_range_w[0]*0.98 && v <= p.tdp_range_w[1]*1.02)) push(p.tdp_range_w ? `TDP (published range ${p.tdp_range_w[0]}-${p.tdp_range_w[1]} W)` : "TDP", p.tdp_w, p.form_factor && /PCIe|NVL/i.test(p.form_factor) ? "PCIe/NVL variant — the SXM part of this generation differs" : null);
      if (p.rack_power_kw_nvidia && near(v, p.rack_power_kw_nvidia * 1000)) push("rack power (NVIDIA)", p.rack_power_kw_nvidia * 1000, "rack-scale");
      (p.rack_power_kw_reported || []).forEach(r => { if (near(v, r.value * 1000)) push("rack power (reported)", r.value * 1000, `secondary source: ${r.label} — not vendor-published`); });
    }
    if (unit === "tbs" && p.memory && near(v, p.memory.bandwidth_tb_s)) push("memory bandwidth", p.memory.bandwidth_tb_s, null);
  });

  if (!hits.length) {
    out.innerHTML = `<div class="callout alert"><p style="margin-bottom:0"><strong>No match in the corpus.</strong> That value doesn't correspond to any published figure here within 2%. It may be a different vendor, a derived number, a different unit, or wrong.</p></div>`;
    return;
  }

  const ambiguous = hits.length > 1;
  out.innerHTML = `
    ${ambiguous ? `<div class="callout alert" style="margin-bottom:16px"><p style="margin-bottom:0"><strong>Ambiguous — ${hits.length} distinct readings.</strong> This value alone does not identify a specification. Stated without its qualifier it could mean any of the following, and they are not equivalent.</p></div>` : ""}
    <div class="tbl-scroll"><table>
      <thead><tr><th>Part</th><th>Reading</th><th class="n">Published value</th><th>Caution</th></tr></thead>
      <tbody>${hits.map(h => `<tr>
        <td><strong>${h.part}</strong></td>
        <td>${h.basis}</td>
        <td class="n">${fmt.n1(h.val)}</td>
        <td class="sub">${h.warn || "—"}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
}

/* ══════════════════ static content ══════════════════ */

function renderFailureModes() {
  $("#failure-modes").innerHTML = (DB.failure_modes || []).map(f => `
    <div class="tile" style="background:var(--surface-1)">
      <div class="k">${f.id}</div>
      <h3 style="margin:6px 0 8px">${f.name}</h3>
      <p class="sub" style="margin-bottom:8px">${f.what}</p>
      <p class="sub" style="margin:0;color:var(--ink-tertiary)"><strong style="color:var(--ink-subtle)">Example:</strong> ${f.example}</p>
    </div>`).join("");
}

function renderCorrections() {
  $("#corrections").innerHTML = (DB.corrections || []).map(c => `
    <div class="panel">
      <p class="eyebrow">${c.source}</p>
      <h2 style="margin:8px 0 12px">${c.title}</h2>
      <div class="grid-2">
        <div>
          <p class="sub" style="margin-bottom:6px"><strong style="color:var(--ink)">The claim</strong></p>
          <p>${c.claim}</p>
        </div>
        <div>
          <p class="sub" style="margin-bottom:6px"><strong style="color:var(--ink)">What the vendor publishes</strong></p>
          <p>${c.evidence}</p>
        </div>
      </div>
      ${c.table ? `<div class="tbl-scroll" style="margin-top:8px"><table>
        <thead><tr>${c.table.head.map(h => `<th class="${h.n ? "n" : ""}">${h.t}</th>`).join("")}</tr></thead>
        <tbody>${c.table.rows.map(r => `<tr>${r.map((cell, i) => `<td class="${c.table.head[i].n ? "n" : ""}">${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>` : ""}
      <div class="callout" style="margin-top:16px">
        <p style="margin-bottom:0"><strong>What changes.</strong> ${c.impact}</p>
      </div>
      ${c.sources ? `<p class="sub" style="margin-top:12px;margin-bottom:0">Sources: ${c.sources.map(s => `<a href="${s.url}">${s.label}</a>`).join(" · ")}</p>` : ""}
    </div>`).join("");
}

function renderCorpus() {
  const P = DB.parts;
  $("#corpus-table").innerHTML = `
    <thead><tr>
      <th>Part</th><th class="n">Yr</th><th>Form</th><th class="n">TDP</th>
      <th class="n">Dense BF16/FP16</th><th class="n">Sparse BF16/FP16</th>
      <th class="n">Mem</th><th class="n">BW</th><th>Src</th>
    </tr></thead>
    <tbody>${P.map(p => {
      const d = p.perf_dense || {}, s = p.perf_sparse || {};
      const dv = d.bf16 ?? d.fp16, sv = s.bf16 ?? s.fp16;
      const rack = p.perf_dense_pflops;
      return `<tr>
        <td><strong>${p.name}</strong>${p.flagship ? "" : ' <span class="tag null">non-flagship</span>'}<div class="sub">${p.architecture}</div></td>
        <td class="n">${p.launch_year ?? "—"}</td>
        <td>${p.form_factor ?? "—"}</td>
        <td class="n">${p.tdp_w ? p.tdp_w + " W" : (p.rack_power_kw_nvidia ? p.rack_power_kw_nvidia + " kW" : "—")}</td>
        <td class="n">${rack ? fmt.n1(rack.fp16_bf16) + " PF" : fmt.n1(dv)}</td>
        <td class="n">${p.sparsity_applies === false ? '<span class="tag null">n/a</span>' : (p.perf_sparse_pflops ? fmt.n1(p.perf_sparse_pflops.fp16_bf16) + " PF" : fmt.n1(sv))}</td>
        <td class="n">${p.memory ? (p.memory.capacity_tb ? p.memory.capacity_tb + " TB" : p.memory.capacity_gb + " GB") : "—"}</td>
        <td class="n">${p.memory && p.memory.bandwidth_tb_s ? fmt.n2(p.memory.bandwidth_tb_s) : "—"}</td>
        <td>${tag(p.confidence)}</td>
      </tr>`;
    }).join("")}</tbody>`;

  const seen = new Map();
  P.forEach(p => { if (p.source_url && !seen.has(p.source_url)) seen.set(p.source_url, p); });
  $("#sources").innerHTML = `<table><tbody>${[...seen.entries()].map(([url, p]) => `
    <tr><td><a href="${url}">${url.replace(/^https?:\/\//, "").slice(0, 78)}${url.length > 85 ? "…" : ""}</a></td>
    <td class="n sub">${p.accessed}</td><td>${tag(p.confidence)}</td></tr>`).join("")}</tbody></table>`;
}

/* ══════════════════ boot ══════════════════ */

const VIEWS = ["scenario", "trend", "check", "corrections", "corpus"];

function showView(name, { scroll = true, setHash = true } = {}) {
  if (!VIEWS.includes(name)) name = "scenario";
  $$("#tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === name)));
  $$(".view").forEach(v => v.hidden = v.id !== "view-" + name);
  if (setHash && location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

function tabs() {
  // Hash routing so every view is directly linkable — /#trend, /#corrections, etc.
  $$("#tabs button").forEach(b =>
    b.addEventListener("click", () => showView(b.dataset.view)));
  window.addEventListener("hashchange", () =>
    showView(location.hash.slice(1), { scroll: false, setHash: false }));
  showView(location.hash.slice(1) || "scenario", { scroll: false });
}

async function boot() {
  try {
    const r = await fetch("specs.json");
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    DB = await r.json();
  } catch (e) {
    document.querySelector("main").innerHTML =
      `<div class="panel"><h2>Could not load <span class="mono">specs.json</span></h2>
       <p class="err">${e.message}</p>
       <p class="sub">This page fetches its data, so <span class="mono">file://</span> will fail on CORS. Serve it: <span class="mono">python3 -m http.server 8000</span></p></div>`;
    return;
  }

  const meta = `${DB.parts.length} specification records · ${DB.meta.sources_count ?? "—"} sources · corpus verified ${DB.meta.verified}`;
  $("#hero-meta").textContent = meta;
  $("#foot-meta").textContent = `${meta}. Values tagged F (vendor-published), R (credible secondary, named), T (inference). Unpublished values are left empty.`;

  const bm = DB.benchmarks && DB.benchmarks.gb200_nvl72_mlperf_v5_0;
  if (bm) K.mlperf_tflops_per_gpu = bm.value_tflops_per_gpu;

  resetState();
  renderControls();
  renderScenario();
  renderTrend();
  renderFailureModes();
  renderCorrections();
  renderCorpus();
  tabs();

  $("#reset").addEventListener("click", () => { resetState(); renderControls(); renderScenario(); });
  $("#claim-val").addEventListener("input", checkClaim);
  $("#claim-unit").addEventListener("change", checkClaim);
  checkClaim();
}

boot();
