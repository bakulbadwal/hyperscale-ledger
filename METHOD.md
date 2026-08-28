# Method

How every number in `specs.json` got there, and what its confidence tag means.

## Why this exists

Published AI-hardware figures are unusually easy to get wrong, and the errors are not random — they cluster in four places, all of which are *qualifier loss*. A number is correct on a vendor page, carries a qualifier, and then the qualifier is dropped somewhere downstream. The number survives; its meaning does not.

The four failure modes this ledger is built to resist:

| # | Failure mode | What it looks like |
|---|---|---|
| 1 | **Sparsity asterisk dropped** | NVIDIA's tensor-core headline figures are footnoted "With sparsity" and are exactly **2×** the dense value. Quoted without the asterisk, throughput doubles. |
| 2 | **Sparse/dense inversion** | Where a page prints `1,440 \| 720`, the reader has to know which side the asterisk governs. Guessing inverts the number. |
| 3 | **Variant substitution** | SXM and PCIe parts of the same generation have different TDPs, bandwidth, and sometimes clocks. Mixing them across a series fabricates a trend. |
| 4 | **Denominator splicing** | A share-of-total from one basis (annualized TCO) fused onto a different basis (upfront capex). Arithmetically self-refuting, but reads fluently. |

## Confidence tags

Every field carries one. This convention is carried over from [ai-stack-field-atlas](https://github.com/bakulbadwal/ai-stack-field-atlas).

- **`F` — fact.** Transcribed from the vendor's own published page or datasheet. `source_url` is the exact page fetched; `accessed` is the date. If the value is derived arithmetically from a published one (dense = half of a with-sparsity figure), the derivation is stated in `notes` and the tag stays `F`.
- **`R` — reported.** From a credible secondary source — an operator reference architecture, an independent analysis, a benchmark body. Named and linked. Never presented as vendor-published.
- **`T` — thesis.** My own inference, model output, or estimate. Always visibly separated from the two above.
- **`null`** — not published. Left empty on purpose. A gap is recorded as a gap; it is never filled from memory or from a plausible-looking secondary number.

## How the corpus was assembled

1. **Parallel transcription.** One agent per GPU generation, each fetching the vendor's own product page and filling a fixed JSON schema. Transcription only — no analysis, no rounding, no gap-filling. Where a page was unreachable, an explicitly-flagged vendor-hosted mirror of the official datasheet was permitted, recorded as such.
2. **Independent cross-check.** The A100 and H100 records — the two parts the rest of the analysis leans on hardest — were transcribed a second time by an agent given no knowledge of the first result, and the two were diffed.
3. **Sparse/dense separation at ingest.** `perf_sparse` and `perf_dense` are distinct objects in the schema. There is no single "performance" field, because there is no single performance number. Parts predating structured sparsity (Pascal, Volta) carry `sparsity_applies: false` and a null `perf_sparse` — not a fabricated one.
4. **Verification pass.** Every numeric field re-checked against its own cited `source_url` before publication, and the arithmetic of the scenario model recomputed independently.

## The comparison rule

**Precision is held fixed across generations.**

This is the single most consequential methodological choice here. Comparing Blackwell's FP4 throughput to Pascal's FP16 throughput measures the arrival of narrower number formats as much as it measures silicon, and it is the main reason published "GPU performance over time" curves look steeper than like-for-like hardware progress.

So the trend view uses **dense FP16/BF16 only**, on **flagship SXM parts only** — the one basis every generation from Pascal to Blackwell actually publishes. Where a generation's headline marketing number uses a narrower format, that is shown separately and labelled, never blended into the same series.

## Scenario model

Arithmetic is in `app.js` and is deliberately simple enough to audit by reading. Inputs are the sliders; every default carries its source in the UI. Where two independent derivations of the same quantity disagree, the model reports the **range**, not the midpoint — the disagreement is information, and averaging destroys it.

## Known limitations

- Rack-level power for GB200 NVL72 is **not published by NVIDIA** on its product page. Figures in circulation (~120 kW nominal, 130–132 kW design) come from operators and reference architectures, and are tagged `R` accordingly.
- Street pricing for rack-scale systems is **not vendor-published** at all. Any price here is `R` or `T`, never `F`.
- Next-generation parts that are announced but not fully specified are recorded with nulls and `published_status: "announced only"`. Absence of a spec is itself a finding.
- MLPerf-derived sustained throughput reflects one benchmark on one model at one scale. It is a far better guide to delivered performance than nameplate FLOPS, and still not a promise about any other workload.

## Reproducing

No build step, no dependencies. Clone and serve:

```
python3 -m http.server 8000
```

`app.js` fetches `specs.json`, so opening `index.html` over `file://` will fail on CORS — serve it.
