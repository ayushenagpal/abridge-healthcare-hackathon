# PreOp Navigator

An autonomous pre-operative agent powered by a **deterministic clinical protocol
engine**. It owns the pre-operative workflow from surgical referral until a
patient is **Ready To Schedule** — the protocol engine decides *what* is
required; the Navigator agent decides *how* to get it done; the clinician owns
every medical decision.

**Live demo:** https://ayushenagpal.github.io/abridge-healthcare-hackathon/
(auto-deploys from `main` via GitHub Pages).

Built for the Abridge "Future of Agentic AI in Healthcare" hackathon. See
[`docs/`](docs/) for the PRD, architecture, clinical rules, demo case, and the
[implementation plan](docs/implementation-plan.md).

**Demo case:** Frank Delgado, 70 M, elective open right hemicolectomy — a
dual-risk pathway exercising both the **cardiac** spine (RCRI → DASI →
NT-proBNP → cardiology → echo) and the **pulmonary** spine (**ARISCAT** score →
advisory optimization bundle). Two views of the same run: a **Graph**
(dependency DAG) and a **Timeline** (patient journey by touchpoint, split into
"what we know" at intake vs the "required workup" the analysis generates). The
final packet includes a **patient-counseling** section (advisory optimizations
+ medication holds).

## What it demonstrates

1. **The protocol engine — not the LLM — generates the readiness graph.**
   `src/core/protocol/` is a pure, deterministic implementation of a
   clinician-reviewed subset of the 2024 AHA/ACC Perioperative Guideline. Same
   patient state always produces the same output. It imports no LLM (enforced by
   a test).
2. **The readiness graph evolves as evidence arrives.** DASI → biomarker →
   cardiology review → echo → Ready To Schedule. Nodes appear, reopen, and close
   only in response to validated evidence.
3. **The agent performs operational work autonomously**, following the cost
   ladder (search existing evidence before ordering) and the critical path.
4. **It refuses to trust a conditional clearance.** A cardiology letter that says
   *"cleared pending echocardiogram"* satisfies *receipt* but keeps the node open
   and generates an echo requirement.
5. **Every order, referral, and recommendation is a draft** requiring clinician
   approval. `Ready To Schedule` is impossible without final approval.

## Architecture

- **`src/core/protocol/`** — deterministic engine (classification, RCRI,
  functional capacity, biomarker, specialist, conditional-clearance, medication
  reconciliation), citations, protocol version. No LLM.
- **`src/core/graph.ts`** — graph build, diff, and critical path.
- **`src/core/agent/`** — event-driven orchestrator, cost-ladder policy, typed
  tools, and an `LlmProvider` interface with a deterministic **mock** (default)
  and an optional **Anthropic** provider (`claude-opus-4-8`).
- **`src/safety/guard.ts`** — safety gate run before every tool.
- **`src/core/store.ts`** — the long-running case controller (observe → run
  engine → diff → agent action → wait).
- **`src/web/`** — React + React Flow SPA that visualizes the system.
- **`src/core/protocol/ariscat.ts`** — ARISCAT pulmonary-risk module. High risk
  generates an advisory optimization bundle; the agent auto-issues Tier-1
  instructions and drafts Tier-2 referrals, and these render as **Advisory**
  (non-blocking) rather than unmet blockers.
- **`data/`** — the real Abridge FHIR dataset plus clearly-marked synthetic
  augmentation (`data/synthetic/`, `src/core/synthetic.ts`). The referral and external
  events are **synthetic** (`src/core/synthetic.ts`) and clearly marked.

The whole `core/` layer is framework-free and runs in the browser, so the demo
needs no backend and, in mock mode, never depends on a live model.

## Run it

```bash
npm install
npm run dev        # open http://localhost:5173
```

Click **Start Referral**, then walk the simulation controls (or hit **▶ Auto
demo** for the ~1-minute scripted run). Each control emits exactly one event;
the graph advances on its own.

```bash
npm test           # protocol determinism, full demo flow, LLM-boundary guard
npm run build      # typecheck + production build
```

## Optional: live LLM orchestration

The demo runs the deterministic mock provider by default. To use Claude for
action selection instead, construct the `Case` with `AnthropicLlmProvider`
(`src/core/agent/llm/anthropic.ts`). Note: the LLM only *orchestrates and
drafts* — it never determines clinical logic, risk, thresholds, or readiness.
Calling Anthropic from the browser exposes the API key; use a proxy for anything
beyond local experimentation.
