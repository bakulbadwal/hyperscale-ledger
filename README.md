# Hyperscale Ledger

**An audited specification corpus for NVIDIA datacenter GPUs, and a 2027 hyperscale data-center scenario model built on top of it.**

Built for GBUS 8255 (Business of AI Reading Seminar), UVA Darden — Session 3, *The Thinking Machine* (Stephen Witt), on GPUs and data centers.

**Live:** https://bakulbadwal.github.io/hyperscale-ledger/

---

## The problem it addresses

Almost every published figure about AI hardware is correct on the vendor's page and wrong by the time it reaches a spreadsheet. Not because anyone is lying — because the numbers carry **qualifiers that compress away in prose**.

NVIDIA's headline tensor-core throughput figures are footnoted "With sparsity" and are exactly **twice** the dense value. The H100's *sparse TF32* and its *dense BF16* are **both 989 TFLOPS**, so the two are conflated constantly. SXM and PCIe variants of the same part have different TDPs. Rack power has a nominal figure and an observed one, 10% apart.

Get one of those wrong and a data-center model is off by a factor of two while looking entirely plausible.

This repo does two things about that:

1. **`specs.json`** — a specification corpus where sparse and dense are separate fields, variants are separate records, every value carries a source URL and an access date, and unpublished values are `null` rather than guessed.
2. **A scenario model** that sits on the corpus and makes the load-bearing assumptions manipulable, so they can be argued with instead of taken on faith.

## The four views

| View | What it does |
|---|---|
| **Scenario** | A 250 MW AI campus modelled on GB200 NVL72. Flex GPU useful life, rack power, utilization, power price and rack cost; watch capex, TCO and $/effective-PFLOP move. |
| **Trend** | Huang's Law re-derived on **dense FP16/BF16, flagship SXM parts only** — precision held fixed across generations — set against the marketing curve and against Epoch AI's measured ~2.5-year doubling. |
| **Claim checker** | Paste a FLOPS or TDP number; it reports which part, precision and variant it is consistent with, and flags where it is ambiguous. The failure modes, made executable. |
| **Corrections** | Published claims that do not survive checking — including the GPU power table in Ch. 19 of the assigned book. |

## Findings

- **Depreciation dominates energy.** On a 250 MW campus, moving GPU useful life from 5 years to 3 swings annual cost by roughly **$830 M** — about **5.6× the entire annual electricity bill** at US industrial rates. The AI-capex debate is conducted almost entirely in the language of power; power is the second-order term.
- **Nameplate FLOPS overstate delivered throughput by roughly 5×.** Peak dense FP4 across the campus is ~1,500 EFLOPS; MLPerf-sustained throughput is ~294 EFLOPS.
- **Holding precision fixed flattens the curve.** Much of the apparent acceleration in "GPU performance over time" is the arrival of narrower number formats, not silicon.
- **The assigned book's power table mixes product lines.** Witt's Ch. 19 ladder pairs PCIe-variant TDPs with flagship parts; like-for-like the rise is 2.5×, not the 4× implied. Details in the Corrections view.

## Provenance

Every number is tagged **`F`** (vendor-published fact), **`R`** (credible secondary, named and linked), or **`T`** (my inference) — a convention carried over from [ai-stack-field-atlas](https://github.com/bakulbadwal/ai-stack-field-atlas). Unpublished values are `null` on purpose.

Full methodology, including the sparse/dense handling and the fixed-precision comparison rule, is in **[METHOD.md](METHOD.md)**.

## Architecture

No framework, no build step, no dependencies — plain HTML/CSS/JS, so it runs anywhere with nothing to install.

| File | Role |
|---|---|
| `specs.json` | The corpus. Every fact, with provenance. The only file that needs changing when hardware ships. |
| `index.html` | Page shell. No factual content. |
| `app.js` | Fetches `specs.json`, renders the four views, runs the model arithmetic. |
| `styles.css` | Design language, adapted from the Linear DESIGN.md in [awesome-design-md](https://github.com/VoltAgent/awesome-design-md). |

`app.js` fetches `specs.json`, so `file://` will fail on CORS. Serve it:

```
python3 -m http.server 8000
```

## Honest limits

The corpus covers NVIDIA datacenter parts only — no AMD Instinct, no TPU, no Trainium. Rack pricing is secondary-sourced everywhere and marked as such. MLPerf figures reflect one benchmark on one model at one scale. The scenario model is deliberately simple enough to audit by reading, which also means it is not a substitute for an operator's actual pro forma.

Built with Claude Code. Specification transcription was done by parallel subagents against a fixed schema, with the two most load-bearing records independently transcribed twice and diffed; see [METHOD.md](METHOD.md).

## License

MIT — see [LICENSE](LICENSE).
