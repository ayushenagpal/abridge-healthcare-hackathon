# PreOp Navigator — Implementation Plan

> Status: **planning only**. No application code has been written. This document is
> the Phase 0 deliverable required by `docs/tasks.md`. It must be approved before any
> application code is created.

This plan reflects the four project documents (`prd.md`, `architecture.md`,
`clinical-rules.md`, `demo-case.md`, `tasks.md`) and a direct inspection of the
Abridge dataset. It is written to build **the smallest complete end-to-end demo**,
not a generalized platform.

---

## 1. Repository Assessment

### What exists today

```
.
├── README.md                      # one line, effectively empty
├── docs/
│   ├── prd.md                     # product vision, 6-stage pipeline, safety
│   ├── architecture.md            # 2-layer architecture, data model, tools, events
│   ├── clinical-rules.md          # deterministic protocol engine spec
│   ├── demo-case.md               # 3-min + 1-min demo scripts, visual design
│   └── tasks.md                   # phased build plan + Definition of Done
└── data/abridge/raw/
    ├── synthetic-ambient-fhir-25.json   # 25 encounters (JSON array, 2.7 MB)
    ├── schema.json                      # JSON Schema for one record
    ├── summary.json                     # index of all 25 encounters
    ├── index.html                       # standalone browser viewer (2 MB)
    └── README.md                        # dataset documentation
```

### Findings

- **Greenfield repository.** There is no application code, no `package.json`, no
  build tooling, no framework, and no package manager selected yet. Nothing to reuse
  except the docs and the dataset.
- **Git:** single commit (`Initial commit`) on `main`. `docs/` and `.DS_Store` are
  currently untracked.
- **Framework / package manager:** none chosen. We are free to pick. The docs
  strongly imply TypeScript (`ProtocolResult`, `Requirement` shown as `ts`
  interfaces; `tasks.md` Phase 2 says "Use Zod for validation").
- **The dataset is JSON, not JSONL, on disk.** The README references
  `synthetic-ambient-fhir-25.jsonl`, but only the `.json` array file is present. Our
  loader must read the `.json` array. (Both share the same record schema.)
- **No colectomy / surgical-referral encounter exists.** The 25 encounters are
  ambient primary-care / admission visits (annual physicals, prenatal, SNF, hospice).
  The demo's "elective colectomy referral" does not exist as source data and must be
  **synthetically augmented** on top of a real patient chart (see §14–15).

### Dataset shape (confirmed by inspection)

Each of the 25 records has exactly these fields:

- `id` — `"<patient_id>::<encounter_id>"`
- `metadata` — date, `visit_title`, `visit_type`, status, `related_resource_counts`
- `patient_context` — FHIR `Patient` resource + `longitudinal_summary`
  (`resource_counts`, `condition_labels[]`, `medication_labels[]`)
- `encounter_fhir` — the FHIR `Encounter` + `related_resources` grouped by resource
  type (`Condition`, `Observation`, `Procedure`, `DiagnosticReport`,
  `MedicationRequest`, `Immunization`, …)
- `transcript` — speaker-labeled ambient conversation (`DR:`, `PT:`, `NURSE:`, …)
- `note` — SOAP-style clinical note (markdown)
- `after_visit_summary` + `after_visit_summary_provenance`

FHIR resources are US-Core-profiled R4. Observations carry LOINC codes +
`valueQuantity`; Conditions carry SNOMED codes + `clinicalStatus`/`verificationStatus`;
references use `urn:uuid:` form. This is enough to drive RCRI, functional-capacity,
biomarker, and medication branches with real provenance.

---

## 2. Existing Architecture

There is no existing code architecture. The **intended** architecture, taken from
`docs/architecture.md`, is a two-layer, event-driven system:

1. **Clinical Protocol Engine (deterministic, no LLM)** — decides *what* must
   happen. Consumes normalized patient state + validated evidence; emits a
   `ProtocolResult` (pathway status, requirements, determinations, readiness graph,
   graph diff, applied rules, citations).
2. **Navigator Agent (LLM-orchestrated)** — decides *how* to make it happen. Consumes
   patient state + graph + diff + open requirements; selects **one** operational tool
   per event; never decides medicine.

Control flow is strictly event-driven:

```
Event → Load State → Run Protocol Engine → Diff Graph → Prioritize Blockers
      → Agent Chooses Tool → Execute (with Safety Gate) → Persist → Wait
```

The **graph is the source of truth**, not the LLM. Every event triggers exactly one
protocol evaluation. Same patient state must always produce the same protocol output.

This plan adopts that architecture verbatim and makes it concrete.

---

## 3. Recommended Project Structure

**Stack recommendation:** TypeScript end-to-end. Thin Node backend owns state, the
protocol engine, the agent, and the event log; a Vite + React SPA visualizes and
emits simulation events. This maps cleanly onto the event-driven design (backend =
long-running operational agent; frontend = "the UI is not the product, it visualizes
the system").

- **Language:** TypeScript (strict) — matches the `ts` interfaces and the Zod
  requirement in the docs.
- **Package manager:** `pnpm` (fast, good for a small workspace). npm is an
  acceptable fallback.
- **Backend:** Node + Express (or Fastify) + Server-Sent Events (SSE) for the live
  event stream. SSE over WebSockets because the stream is one-directional
  (server → UI) and SSE is trivial to implement and demo-reliable.
- **Frontend:** Vite + React + TypeScript. **React Flow** for the readiness graph
  (the hero element). Tailwind (or plain CSS modules) for the minimal white UI.
- **LLM:** Anthropic Claude via `@anthropic-ai/sdk`, behind a provider interface with
  a deterministic **mock** implementation for the backup demo. Recommended models:
  `claude-opus-4-8` for best drafting/reasoning, or `claude-sonnet-5` for lower
  latency during a live demo. (Extraction/orchestration only — never clinical logic.)
- **Validation:** Zod schemas for every domain model (single source of truth for
  types + runtime validation of tool I/O and ingested data).
- **Tests:** Vitest (fast, TS-native) for the protocol engine + agent behavior.

```
preop-navigator/
├── package.json
├── pnpm-workspace.yaml               # optional; single-package is fine for demo
├── tsconfig.json
├── docs/                             # (existing)
├── data/                             # (existing raw dataset)
│   └── synthetic/                    # NEW: marked-synthetic augmentation files (§15)
├── src/
│   ├── core/                         # PURE, framework-free, deterministic
│   │   ├── models/                   # Zod schemas + inferred types (§4)
│   │   │   ├── referral.ts
│   │   │   ├── patient-state.ts
│   │   │   ├── evidence.ts
│   │   │   ├── requirement.ts
│   │   │   ├── graph.ts
│   │   │   ├── event.ts
│   │   │   ├── protocol-result.ts
│   │   │   ├── tool.ts
│   │   │   └── clinician-review.ts
│   │   ├── ingestion/                # dataset → PatientState (§7 data model)
│   │   │   ├── load-encounter.ts
│   │   │   ├── fhir-normalize.ts
│   │   │   └── transcript-extract.ts # LLM-assisted extraction + deterministic fallback
│   │   ├── protocol/                 # THE DETERMINISTIC ENGINE — no LLM imports (§5)
│   │   │   ├── engine.ts             # runProtocol(state): ProtocolResult
│   │   │   ├── rules/                # one file per ClinicalRule
│   │   │   │   ├── classify-surgery.ts
│   │   │   │   ├── active-cardiac.ts
│   │   │   │   ├── rcri.ts
│   │   │   │   ├── functional-capacity.ts
│   │   │   │   ├── dasi.ts
│   │   │   │   ├── biomarker.ts
│   │   │   │   ├── specialist.ts
│   │   │   │   └── medication-recon.ts
│   │   │   ├── citations.ts          # guideline citation table
│   │   │   └── version.ts            # "aha-acc-perioperative-demo-v1"
│   │   ├── graph/                    # graph build + diff + critical path (§6)
│   │   │   ├── build-graph.ts
│   │   │   ├── diff-graph.ts
│   │   │   └── critical-path.ts
│   │   ├── evidence/                 # evidence validation pipeline (§7)
│   │   │   └── validate-evidence.ts  # deterministic identity/recency/authority checks
│   │   └── agent/                    # Navigator orchestrator (§8)
│   │       ├── orchestrator.ts       # event → tool selection loop
│   │       ├── policy.ts             # cost-ladder + critical-path prioritization
│   │       ├── llm/
│   │       │   ├── provider.ts       # LlmProvider interface
│   │       │   ├── anthropic.ts      # real provider
│   │       │   └── mock.ts           # deterministic scripted provider (backup demo)
│   │       └── tools/                # one file per tool (§9)
│   │           ├── registry.ts
│   │           └── *.ts
│   ├── safety/                       # safety gate applied before every tool (§10)
│   │   └── guard.ts
│   ├── store/                        # in-memory event-sourced state + persistence
│   │   ├── event-log.ts
│   │   └── case-store.ts
│   ├── server/                       # Express + SSE
│   │   ├── index.ts
│   │   └── routes.ts                 # POST /events (sim), GET /stream (SSE), GET /case
│   └── web/                          # React SPA (§11)
│       ├── main.tsx
│       ├── App.tsx
│       ├── panels/
│       │   ├── ReferralSummary.tsx
│       │   ├── ReadinessGraph.tsx    # React Flow — the hero
│       │   ├── EvidenceViewer.tsx
│       │   ├── EventTimeline.tsx
│       │   ├── ApprovalQueue.tsx
│       │   └── SimulationControls.tsx
│       └── lib/useEventStream.ts
├── fixtures/                         # deterministic test fixtures (patient states)
└── tests/                            # Vitest: engine, graph, agent, safety
```

**Simplification fallback:** if the backend proves risky under time pressure, the
entire `core/` layer is framework-free and runs unchanged in the browser. We can ship
a **client-only SPA** where sim controls drive the orchestrator in-process and the
LLM is called through a tiny serverless proxy (or run in mock mode). This is the
backup topology; the plan targets the thin-backend version.

---

## 4. Data Model

All models are Zod schemas with inferred TS types. Every clinically meaningful field
stores **provenance**.

```ts
// Provenance — attached to every extracted/derived fact
Provenance {
  source: "transcript" | "fhir" | "pdf" | "specialist-letter" | "lab"
        | "questionnaire" | "clinician-decision" | "synthetic"
  reference: string        // e.g. "Condition/…", "Observation/…", transcript span, file id
  extractedBy: "fhir-normalizer" | "llm-extractor" | "manual" | "protocol-engine"
  verified: boolean
  recordedAt: string       // ISO
}

Referral {
  id, patientId
  procedure: { text, snomedCode? }
  urgency: "elective" | "time-sensitive" | "urgent" | "emergency"
  indication: string
  referringProvider: string
  receivedAt: string
  provenance: Provenance
}

PatientState {                       // normalized, versioned snapshot
  version: number
  patientId
  demographics: { name, birthDate, gender, ageYears }
  referral: Referral
  conditions:  Array<{ code, system, text, clinicalStatus, provenance }>
  medications: Array<{ text, rxnormCode?, status, provenance }>
  observations: Array<{ code, system, text, value, unit, effectiveAt, provenance }>
  functionalCapacity: { status: "unknown"|"below"|"at-or-above", metsEstimate?, provenance? }
  questionnaires: Array<{ type: "DASI", score?, metsEstimate?, submittedAt?, provenance? }>
  clinicianDecisions: Array<ClinicianReview>
  derived: { rcri?: RcriResult }     // engine-computed, kept for display + provenance
}

Evidence {                           // every incoming fact before it is trusted
  id
  requirementId?                     // which requirement it targets (if any)
  kind: EvidenceSource
  content: unknown                   // raw payload (lab value, letter text, questionnaire)
  provenance: Provenance
  validation: {
    status: "pending" | "accepted" | "accepted-review" | "rejected"
          | "conflicting" | "unsupported" | "stale" | "incomplete"
    checkedAt?: string
    reasons: string[]                // deterministic reasons from validate-evidence
  }
}

Requirement {                        // a readiness-graph node
  id, title
  status: "missing" | "searching" | "waiting-patient" | "waiting-external"
        | "waiting-clinician" | "satisfied" | "abnormal-review-required"
        | "unsupported" | "blocked" | "not-indicated"
  dependencies: string[]             // requirement ids this depends on
  owner: "system" | "patient" | "clinician" | "external"
  acceptableEvidence: string[]       // evidence kinds/criteria that would satisfy it
  attachedEvidence: string[]         // evidence ids
  guidelineReference: Citation
  requiresClinicianApproval: boolean
  blocksScheduling: boolean
  generatedByRule: string            // ClinicalRule.id — full auditability
}

ReadinessGraph {
  version: number
  nodes: Requirement[]
  edges: Array<{ from: string, to: string }>
  criticalPath: string[]
  blockers: string[]                 // node ids that block scheduling
  pathwayStatus: "in-progress" | "human-review" | "unsupported" | "ready-to-schedule"
}

WorkflowEvent {
  id, type: EventType, payload: unknown, occurredAt, causedBy?  // event id that triggered this
}

ProtocolResult {                     // pure function output of the engine
  pathwayStatus
  requirements: Requirement[]
  determinations: Array<{ ruleId, statement, citation, inputsUsed: Provenance[] }>
  graph: ReadinessGraph
  graphDiff: GraphDiff
  appliedRules: string[]
  citations: Citation[]
}

GraphDiff {
  added: string[]; removed: string[]; reopened: string[]
  closed: string[]; statusChanged: Array<{ id, from, to }>
}

ToolExecution {
  id, tool, input, output, status: "ok"|"blocked"|"error"
  audit: { decidedBy: "agent", approvedBy?, at, idempotencyKey }
}

ClinicianReview {
  id, subject: "order"|"referral"|"medication-timeline"|"abnormal-finding"|"final"
  requirementId?, draft: unknown
  decision: "pending"|"approved"|"rejected"|"edited"
  editedDraft?, decidedBy?, decidedAt?
}

Citation { guideline, version, section, classOfRecommendation?, levelOfEvidence?, text }
```

**Event sourcing:** `PatientState` is a projection of the ordered `WorkflowEvent` log.
Reset = clear the log. Replay = re-apply events. This gives us reproducibility and the
"nothing is manually advanced" property for the demo.

---

## 5. Protocol Engine Design

**Contract:** `runProtocol(state: PatientState, prev?: ReadinessGraph): ProtocolResult`
is a **pure, deterministic function**. Same input → identical output. It imports
nothing from `agent/` or any LLM module (enforced by lint rule + a test that scans the
`protocol/` tree for forbidden imports).

### Rule representation

Each rule implements the `ClinicalRule` schema from `clinical-rules.md`:

```ts
ClinicalRule {
  id, title, module, version, description
  requiredInputs: string[]
  applies(state): boolean            // trigger
  evaluate(state): {                 // deterministic
    requirements: Requirement[]
    determinations: Determination[]
  }
  guidelineCitation, classOfRecommendation, levelOfEvidence
  requiresClinicianApproval
}
```

The engine composes rules in staged order; **modules do not know about each other**
(per `clinical-rules.md`). Composition, not cross-talk.

### Encoded rules for the demo (subset of AHA/ACC v1)

1. **Stage 1 — Surgery classification** (`classify-surgery.ts`)
   - Maps procedure → `procedureRisk` and `urgency`. Elective colectomy →
     intraperitoneal / **elevated-risk, non-emergency**. Emits `Procedure
     Classification ✓`. Emergency urgency → immediate exit to human review.
2. **Stage 2 — Active cardiac conditions gate** (`active-cardiac.ts`)
   - Detects ACS, decompensated HF, unstable arrhythmia, severe symptomatic valvular
     disease from validated conditions. If present → stop scoring, emit
     `Human Review` + `Cardiology Required`, mark pathway `human-review`.
   - For the demo patient this gate is **clear** (prior MI/IHD is stable, not active),
     so scoring proceeds — and this is an explicit, auditable determination.
3. **Stage 3 — RCRI** (`rcri.ts`)
   - Deterministic count of the 6 components, each with retained provenance:
     high-risk surgery, ischemic heart disease, history of CHF, cerebrovascular
     disease, insulin-treated diabetes, creatinine > 2.0 mg/dL.
   - **Never infers absent disease.** Missing = missing, never assumed negative.
4. **Stage 4 — Functional capacity** (`functional-capacity.ts`)
   - Cost-ladder ordered: existing chart doc → existing DASI → patient questionnaire.
   - Output `at-or-above` / `below` / `unknown`. `unknown` generates a
     **Patient DASI Questionnaire** requirement (owner: patient).
5. **DASI scoring** (`dasi.ts`)
   - Deterministic DASI → METs conversion. Below the METs threshold → generates a
     **Biomarker (NT-proBNP)** requirement.
6. **Stage 5 — Biomarker** (`biomarker.ts`)
   - **Searches existing labs/outside records first.** If acceptable evidence exists →
     no new order. Otherwise generate a draft biomarker order (clinician approval).
   - Evidence states: missing / stale / normal / abnormal / conflicting /
     indeterminate. Abnormal → `abnormal-review-required` → generates specialist
     review. The **engine** classifies the result, never the LLM.
7. **Stage 6 — Specialist evaluation** (`specialist.ts`)
   - Generates a Cardiology review requirement when triggered. A clearance document is
     validated for **content**: "cleared pending echo" satisfies *receipt* but keeps
     the node open and generates an **Echo** requirement (the clearance rule).
8. **Medication reconciliation** (`medication-recon.ts`)
   - Compares transcript-stated meds vs FHIR. Discrepancy → Medication Reconciliation
     requirement → clinician review. **Never** generates hold instructions unless the
     protocol supports them and a clinician approves.

### Final readiness rule

Pathway reaches `ready-to-schedule` only when: every blocking node resolved, required
evidence validated, required approvals complete, no open unsupported pathways, and the
final readiness packet is generated. Output phrasing is **"Operational requirements
complete,"** never "safe for surgery."

### Autonomy ladder (drives `requiresClinicianApproval`)

- **Tier 1** (auto if enabled): DASI, ECG, basic labs, patient reminders.
- **Tier 2** (draft only, clinician approves): specialist referral, echo, PFT,
  medication timeline, **biomarker order**.
- **Tier 3** (never automated): stress-test decision, anticoagulation bridge, medical
  clearance, surgical decision.

Every rule carries a `guidelineCitation`, `classOfRecommendation`, and
`levelOfEvidence` so every determination is explainable and auditable.

---

## 6. Readiness Graph Design

The graph is the **primary application state** and the demo's hero visual.

- **Build** (`build-graph.ts`): the engine's emitted `Requirement[]` + their
  `dependencies` form a DAG. `Ready To Schedule` is the terminal sink node depending
  on every `blocksScheduling` requirement.
- **Critical path** (`critical-path.ts`): recomputed on every regeneration —
  scheduling blockers, dependency chains, parallel workstreams, and the single
  highest-value unresolved node. The agent always acts to shorten this path.
- **Diff** (`diff-graph.ts`): compares the new graph to the previous version and emits
  `GraphDiff` (added / removed / reopened / closed / statusChanged). The diff is what
  the UI animates and what proves "the graph changed because the state changed."
- **Mutation semantics:** nodes can appear, disappear, reopen, become blocked, or
  become satisfied — driven **only** by validated evidence changing patient state and
  re-running the engine. There is no manual node editing.

Canonical demo mutation chain (grounded in the engine):

```
DASI unknown → patient completes DASI → Biomarker node appears
→ NT-proBNP elevated → Cardiology Review appears
→ "cleared pending echo" → Echo node appears
→ Echo normal → all blockers closed → Ready To Schedule
```

Graph versions are persisted so the timeline can scrub through mutations.

---

## 7. Event Model

**Ingestion / data model into the engine.** Two data planes feed `PatientState`:

- **FHIR normalization** (`fhir-normalize.ts`, deterministic): maps
  `related_resources` + `longitudinal_summary` into typed conditions / observations /
  medications with `Provenance{ source:"fhir", reference:"Condition/…" }`. LOINC/SNOMED
  codes drive RCRI and biomarker matching. This path uses **no LLM**.
- **Transcript extraction** (`transcript-extract.ts`, LLM-assisted): the LLM extracts
  **candidate facts** (e.g., "patient started Ozempic," functional-capacity hints)
  with span provenance. Candidates are `Evidence` with `validation.status = pending`
  until the deterministic pipeline + engine evaluate them. A deterministic mock
  extractor provides the same output for the backup demo.

**Evidence pipeline** (`validate-evidence.ts`, deterministic):
`Incoming → extract candidate facts → normalize → attach provenance → validate
(identity, recency, completeness, authority, relevance, consistency, guideline match)
→ update PatientState → run engine → graph mutates.` The **engine**, not the
extractor, decides whether evidence satisfies a requirement.

**Workflow event types** (from `architecture.md`), each causing exactly one protocol
evaluation:

```
REFERRAL_RECEIVED · FHIR_IMPORTED · TRANSCRIPT_IMPORTED · PATIENT_UPDATED
QUESTIONNAIRE_RECEIVED · ORDER_APPROVED · LAB_RESULT_RECEIVED · DOCUMENT_RECEIVED
CLINICIAN_DECISION · PATIENT_MESSAGE · FOLLOW_UP_TIMEOUT · READY_TO_SCHEDULE
```

Each event is appended to the event log, projected into `PatientState`, and triggers:
`runProtocol → diff → agent tick → tool execution (→ possibly new events)`. The agent
**never free-runs**; it wakes only on events. Simulation controls in the UI are just
event emitters (see §11).

---

## 8. Agent Architecture

**Deliberately a single event-driven orchestrator, not a multi-agent system** (per
the constraint "prefer a simple event-driven orchestrator over unnecessary
multi-agent complexity").

Per event, `orchestrator.ts` runs one deterministic tick:

1. Load `PatientState` (projection of event log).
2. Run the protocol engine → `ProtocolResult`.
3. Compute `GraphDiff` vs previous graph.
4. Identify blockers + critical path (from the engine, not the LLM).
5. **Select one operational action.** The candidate action set and the cost-ladder
   ordering are computed **deterministically** in `policy.ts`; the LLM's role is to
   (a) choose among already-valid operational candidates and (b) draft the human-facing
   content (message text, referral prose, order rationale). If no LLM is available or
   there is a single obvious candidate, `policy.ts` picks deterministically.
6. Run the chosen tool through the **safety gate** (§10).
7. Persist `ToolExecution` + append any resulting events.
8. Wait for the next event.

**Cost ladder** enforced in `policy.ts`: existing chart → existing documents → patient
questionnaire → outside records → lab order → referral. The agent must exhaust
lower-cost evidence (via `searchChart` / `searchExistingEvidence`) before proposing
higher-cost work. This is a code-enforced invariant, verified by tests — not a prompt
suggestion.

**LLM boundaries (the load-bearing constraint).** The LLM may: extract facts, detect
conflicts, summarize, draft communication/referrals/order rationale, and choose among
valid operational actions. The LLM may **never**: determine guideline logic, calculate
risk scores, set thresholds, determine readiness, interpret abnormal results, decide
medication holds, or determine surgical clearance. Those are engine-only.

**LLM provider abstraction** lets us flip `LLM_MODE=live|mock`. Mock returns scripted,
deterministic tool selections and drafts for the exact demo sequence → the demo never
depends on live model creativity (per `demo-case.md` "Backup Demo").

---

## 9. Tool Definitions

Every tool is typed (Zod in/out), idempotent (idempotency key), logged, auditable, and
returns a `ToolExecution`. Tools **emit events**; they never mutate the graph directly.

| Tool | Purpose | Autonomy tier | Emits |
|------|---------|---------------|-------|
| `searchChart()` | Query normalized FHIR/chart for existing evidence | 1 (auto) | `PATIENT_UPDATED` |
| `searchExistingEvidence()` | Look for existing labs/docs before new work | 1 (auto) | `PATIENT_UPDATED` |
| `sendPatientQuestionnaire()` | Send DASI (or similar) to patient | 1 (auto if enabled) | `PATIENT_MESSAGE` |
| `sendPatientMessage()` | Reminders / instructions | 1 | `PATIENT_MESSAGE` |
| `requestOutsideRecords()` | Request external records | 1 | `DOCUMENT_RECEIVED` (later) |
| `draftOrder()` | Draft a lab/test order (e.g., NT-proBNP) | 2 (approval) | creates `ClinicianReview` |
| `draftReferral()` | Draft a specialist referral (Cardiology) | 2 (approval) | creates `ClinicianReview` |
| `extractDocument()` | LLM-extract facts from an incoming doc | 1 | `Evidence(pending)` |
| `validateEvidence()` | Run deterministic evidence validation | 1 | `PATIENT_UPDATED` |
| `requestClinicianApproval()` | Route a draft to the approval queue | — | `ClinicianReview` |
| `recordClinicianDecision()` | Persist approve/reject/edit | — | `CLINICIAN_DECISION` |
| `scheduleFollowUp()` | Set a follow-up timeout | 1 | `FOLLOW_UP_TIMEOUT` (later) |
| `markReadyToSchedule()` | Terminal transition (guarded) | 3-gated | `READY_TO_SCHEDULE` |

Draft tools (`draftOrder`, `draftReferral`) **never** execute the order — they create a
`ClinicianReview` in the approval queue. `markReadyToSchedule()` is refused by the
safety gate unless the engine's `pathwayStatus === "ready-to-schedule"`.

---

## 10. Safety Boundaries

A single **safety gate** (`safety/guard.ts`) runs before every tool executes. It
verifies (per `architecture.md`):

- The protocol engine **supports** this action for the current state.
- Required evidence exists.
- Required clinician approval exists (for Tier-2 actions).
- Patient communication is approved / within policy.
- The action is not a **duplicate** (idempotency key already executed).

If any check fails → the tool is blocked and a **Human Review** event is created
instead. Explicit hard blocks (from `tasks.md` Phase 11):

- No autonomous medical clearance, medication changes, or interpretation of abnormal
  findings.
- No progression down an **unsupported pathway** (LVAD, mechanical valve, ACHD, severe
  pulmonary hypertension, missing critical inputs) → immediate Human Review Package.
- No duplicate actions; no acting on invalid/unvalidated evidence.
- No terminal `Ready To Schedule` without all clinician approvals complete.

**Every** order, referral, medication instruction, and clinician-facing recommendation
is a **draft** until a clinician approves it via the approval queue. The engine defines
the pathway; the agent performs operational work; the clinician owns medicine.

---

## 11. UI Architecture

Single-page React app. **The graph is the hero; the UI visualizes the system, it is
not the product.** Minimal, white background (per `demo-case.md`).

Layout:

- **Center — Living Readiness Graph** (React Flow): dependency DAG, animated
  mutations (add/remove/reopen/close), highlighted critical path, color by status
  (blocked/waiting/satisfied/review). Node click → provenance popover (e.g., RCRI
  component sources).
- **Left — Evidence Viewer:** transcript facts, FHIR facts, documents, provenance,
  conflicts, validation status.
- **Right — Event Timeline:** each event → protocol run → graph mutation → agent
  decision → tool execution → waiting state.
- **Top — Referral Summary:** patient, procedure, urgency, protocol version, current
  status.
- **Bottom-right — Clinician Approval Queue:** drafted orders/referrals/medication
  timeline/abnormal findings with Approve / Reject / Edit.
- **Bottom — Agent Activity + Simulation Controls.**

Live updates via **SSE** (`GET /stream`). The frontend holds no clinical logic; it
renders projections pushed by the backend.

**Simulation controls** (each emits exactly one event, nothing is manually advanced in
the graph):
Start Referral · Submit DASI · Approve Biomarker Order · Receive Lab Result · Receive
Cardiology Letter · Receive Echo · Approve Medication Timeline · Final Approval ·
Reset Demo.

Two demo modes: **3-minute live** (manual button beats) and **1-minute auto** (scripted
timers firing the same events) per `demo-case.md`.

---

## 12. Step-by-Step Implementation Plan

Ordered to reach a working end-to-end vertical slice fast, then deepen. Maps to
`tasks.md` phases.

1. **Scaffold** — pnpm + TS strict + Vite/React + Express + Vitest + ESLint rule
   forbidding LLM imports inside `protocol/`. (Phase 0 → project setup)
2. **Domain models** — Zod schemas for all §4 types; inferred TS types. (Phase 2)
3. **Data ingestion** — load recommended encounter from the JSON array; deterministic
   FHIR normalizer → `PatientState` with provenance. One normalized patient object.
   (Phase 1)
4. **Protocol engine skeleton** — `runProtocol` + rule interface + classify-surgery +
   active-cardiac gate + RCRI, with unit tests + fixtures. (Phase 3)
5. **Graph build + diff + critical path** — turn requirements into the DAG; snapshot
   tests. (Phase 4)
6. **Remaining rules** — functional capacity, DASI, biomarker (with existing-evidence
   search), specialist + clearance rule, medication reconciliation. Deterministic
   tests for each branch incl. abnormal/stale/conflicting. (Phase 3–4)
7. **Event log + case store** — event-sourced `PatientState` projection; reset/replay.
   (persistence)
8. **Evidence pipeline** — deterministic `validateEvidence`; conflict + stale
   detection. (Phase 5)
9. **Tools + safety gate** — implement all §9 tools mock-first; wire the §10 guard.
   (Phase 6, 11)
10. **Navigator orchestrator** — event → engine → diff → policy → tool → persist tick;
    cost-ladder + critical-path prioritization. (Phase 7)
11. **LLM provider** — Anthropic provider + deterministic mock; extraction + action
    selection + drafting. (Phase 6–7)
12. **Server + SSE** — `POST /events`, `GET /stream`, `GET /case`. (Phase 9)
13. **UI panels** — graph (React Flow) first, then timeline, evidence, approval queue,
    referral summary, sim controls. (Phase 9–10)
14. **Wire the exact demo sequence** — the six beats end-to-end; verify nothing is
    manually advanced. (Phase 8)
15. **Tests to Definition-of-Done** — protocol determinism, graph mutation, conditional
    clearance keeps node open, evidence validation, agent cost-ladder & approval-wait.
    (Phase 12)
16. **Polish** — loading states, reset, 1-min auto mode, README, env vars, backup mock
    mode verified. (Phase 13)

**Vertical-slice milestone (earliest demoable):** steps 1–5 + 9 (Referral) + a minimal
graph render — proves "referral → engine → graph." Everything after deepens the story.

---

## 13. Mocked vs Real Integrations

| Concern | Demo approach | Notes |
|---------|---------------|-------|
| FHIR / chart data | **Real** (Abridge dataset) | Real conditions/observations drive RCRI & biomarker |
| Protocol engine | **Real & deterministic** | Never mocked; it is the core IP |
| Graph / diff / critical path | **Real** | Deterministic |
| LLM (extraction, action choice, drafting) | **Real (Anthropic) with deterministic mock fallback** | `LLM_MODE=live|mock`; mock guarantees demo reliability |
| Patient SMS / questionnaire delivery | **Mocked** | `sendPatientQuestionnaire` logs + simulates delivery |
| Lab / order execution | **Mocked** | Approved order → simulated `LAB_RESULT_RECEIVED` via sim button |
| Outside records / documents | **Mocked** | Provided as marked-synthetic files (§15) |
| Cardiology letter, echo report | **Mocked (synthetic)** | Injected via sim buttons; content is validated for real |
| Clinician approval queue | **Real UI, mocked identity** | Approvals are genuine state transitions |
| Persistence | **In-memory event log** (+ optional JSON snapshot) | No database needed for the demo |
| Auth / multi-user | **Out of scope** | Single demo case |

The rule: everything **clinical and deterministic is real**; everything
**external/operational is mocked but behaves realistically** and flows through the same
event + evidence + approval machinery.

---

## 14. Recommended Encounter for the Demo

**Primary recommendation:** patient **`74919836-…` — "Annual physical — geriatric
cardiometabolic follow-up"** (Mr. Isreal Howell, 85M, DOB 1939-03-20).

Why this is the strongest base chart (all confirmed by dataset inspection):

- **Rich, real cardiac history** for a clean RCRI story: *Ischemic heart disease*,
  *Acute NSTEMI / History of MI*, *Type 2 diabetes*, *Essential hypertension*,
  *Hyperlipidemia*, *Metabolic syndrome* — all as FHIR Conditions with provenance.
- **RCRI = 2 falls out of real data + the surgery:** high-risk intraperitoneal surgery
  (colectomy) **+** ischemic heart disease = 2. History of CHF (none), cerebrovascular
  disease (none), **insulin**-treated diabetes (patient is on **metformin, not
  insulin** → component does **not** fire — a great "missing stays missing" teaching
  point), creatinine **0.6 mg/dL** (< 2.0 → does not fire). This matches the demo's
  "RCRI = 2" with honest grounding.
- **Real medications** for reconciliation & timeline: metoprolol succinate, aspirin
  81 mg, atorvastatin/simvastatin, losartan, HCTZ, nitroglycerin spray, metformin.
- **Functional-capacity ambiguity is real in the transcript:** daily neighborhood
  walks + gardening, but "a twinge with heavy yard work" → genuinely *unknown* → drives
  the DASI beat honestly.
- **No NT-proBNP in the chart** → the biomarker branch legitimately needs work after
  DASI (no shortcut), exactly as the demo requires.
- Clean of unsupported pathways (no LVAD/mechanical valve/ACHD), so the standard
  pathway runs end-to-end.

**Alternative:** patient **`693a049b-…` — "advanced colon cancer with cardiac
comorbidity"** (85M) has a *real colon indication* (Polyp of colon) **and** ischemic
heart disease + clopidogrel/metoprolol/nitroglycerin. It is tempting because the
colectomy indication is real — but its source encounter is a **hospice admission**
(end-stage), which is clinically incoherent with "elective surgery, ready to schedule."
Use it only if we explicitly reframe it as an earlier elective referral and drop the
hospice framing. The geriatric cardiometabolic patient avoids that conflict entirely,
so it is the recommended primary.

Either way, the **elective colectomy referral itself is synthetic** (no surgical
referral exists in the dataset) and must be marked as such.

---

## 15. Required Synthetic Augmentation

No encounter is a surgical referral, so a small, clearly-labeled set of synthetic
artifacts is required. All live under `data/synthetic/`, each carries
`provenance.source = "synthetic"`, and each is visibly marked "SYNTHETIC" in the UI
(per `demo-case.md`: "Additional demo data should be explicitly marked as synthetic").

1. **Surgical referral** (`referral.json`) — elective colectomy, indication (e.g.,
   colonic mass/polyp requiring resection), referring surgeon, urgency `elective`,
   received date. Drives `REFERRAL_RECEIVED`.
2. **DASI questionnaire response** (`dasi-response.json`) — a set of DASI answers that
   deterministically score **below** the METs threshold, so the engine generates the
   biomarker requirement. (The *scoring* is done by the engine, not the file.)
3. **NT-proBNP lab result** (`ntprobnp-result.json`) — an **elevated** value with
   units + effective date, so the engine classifies it abnormal → cardiology review.
   Delivered via the "Receive Lab Result" sim button.
4. **Cardiology clearance letter** (`cardiology-letter.txt/json`) — text containing
   **"…cleared pending echocardiogram…"** — the pivotal beat. The engine validates
   content: receipt satisfied, requirement **not** closed, Echo requirement generated.
5. **Echocardiogram report** (`echo-report.json`) — a **normal** result that closes the
   Echo node. Delivered via the "Receive Echo" sim button.
6. **Medication discrepancy seed** (optional but high-value) — a synthetic transcript
   addendum line ("I started Ozempic a few weeks ago") **not** present in FHIR, to
   demonstrate medication reconciliation → clinician review, without generating any
   autonomous hold instruction.

Everything else in the demo is derived from the **real** referral + transcript + FHIR +
deterministic engine. Synthetic artifacts only *supply external events*; they never
make clinical decisions — the engine does.

---

## 16. Risks and Simplifications

**Risks**

- **Live LLM latency/variance during the demo.** → Mitigated by `LLM_MODE=mock`
  deterministic provider + the fact that all clinical logic is engine-side. Demo can
  run fully offline.
- **Dataset mismatch (no colectomy patient).** → Addressed by §14–15 synthetic
  augmentation, clearly labeled.
- **Over-engineering the graph UI.** → Use React Flow; keep styling minimal; the graph
  content matters more than animation polish.
- **Scope creep into a "platform."** → Hard constraint: build only the six demo beats
  end-to-end; every module ships the minimum to serve them.
- **Accidental LLM-in-the-loop for clinical logic.** → Enforced by directory boundary +
  a test that fails if `protocol/` imports any LLM module.

**Simplifications (intentional, for the demo)**

- In-memory event log; no database. Reset = clear log.
- Single hard-coded demo case; no case management / auth / multi-tenant.
- Mocked external delivery (SMS, labs, records) surfaced via sim buttons.
- A **subset** of AHA/ACC rules (exactly those the six beats exercise), versioned as
  `aha-acc-perioperative-demo-v1`.
- Client-only fallback topology available if the backend is at risk (see §3).
- Approvals use a mocked clinician identity but perform real state transitions.

---

## 17. Exact 3-Minute Demo Walkthrough

Follows `demo-case.md` beat-for-beat. Every advance is an emitted **event**; the graph
is never hand-edited.

**Beat 1 — Referral Received (0:00–0:45).** Empty case. Click **Start Referral** →
`REFERRAL_RECEIVED` + `FHIR_IMPORTED` + `TRANSCRIPT_IMPORTED`. UI shows "Reading
transcript… Reading FHIR… Normalizing patient state… Running protocol engine…" The
engine runs; the graph appears with blockers: **Functional capacity unknown**,
**Medication discrepancy**, **Risk assessment**. Narration: *"The protocol engine — not
AI — determined what this patient needs."*

**Beat 2 — Graph Generation (0:45–1:30).** Show the graph:
`Referral → Procedure Classification ✓ · RCRI · Functional Capacity · Medication
Review · Ready To Schedule`. Zoom RCRI: **History of ischemic heart disease** (source:
FHIR Condition, verified), **Creatinine 0.6 mg/dL** (source: Lab — does not add a
point), **insulin-treated diabetes: not present** (metformin only). **RCRI = 2**
(intraperitoneal surgery + ischemic heart disease). Narration: *"Every component is
backed by evidence. Missing information stays missing. The model never invents facts."*

**Beat 3 — Agent Begins Working (1:30–2:10).** Critical-path blocker = Functional
Capacity. The Navigator autonomously chooses **Send DASI Questionnaire** (lowest-cost
rung), not more testing. Patient "receives" SMS in the activity log. No clicks.
Narration: *"Instead of defaulting to testing, the agent follows the guideline's
lowest-cost path."*

**Beat 4 — Graph Mutation (2:10–2:55).** Click **Submit DASI** →
`QUESTIONNAIRE_RECEIVED`. Engine scores DASI below threshold → **Functional Capacity ✓**
and a new **Biomarker (NT-proBNP)** node appears. Agent drafts the order → approval
queue. Click **Approve Biomarker Order** → `ORDER_APPROVED`. Click **Receive Lab
Result** → `LAB_RESULT_RECEIVED` (elevated). Engine classifies abnormal → **Cardiology
Review** node appears. Narration: *"The graph changed because the patient's state
changed. These requirements did not exist before."*

**Beat 5 — Tracking, Not Trusting (2:55–3:30, the wow moment).** Click **Receive
Cardiology Letter** → `DOCUMENT_RECEIVED` with "…cleared pending echocardiogram…" The
Navigator shows **Document Received ✓ / Requirement Complete ✗** and generates a new
**Echo Required** node. Narration: *"A document arriving isn't enough. The Navigator
validates the content — not just its existence."*

**Beat 6 — Ready To Schedule (3:30–4:00).** Click **Receive Echo** (normal) → Echo node
closes. Medication reconciliation resolved via **Approve Medication Timeline**. Click
**Final Approval** → the safety gate confirms `pathwayStatus === ready-to-schedule` and
`markReadyToSchedule` fires. Graph turns green. The **Final Readiness Packet** expands:
RCRI, DASI, clearances, medication timeline, guideline citations, outstanding issues
(none). Terminal wording: **"Operational requirements complete → Ready To Schedule."**
Narration: *"The surgeon gets a schedulable patient. Anesthesia gets a mitigation plan.
Every requirement has validated evidence."*

*(Timings total ~4:00 for the live walk; the strict 3-minute cut compresses Beats 1–2
narration and the 1-minute auto mode fires the same events on timers.)*

**Backup:** run with `LLM_MODE=mock` — identical event sequence, deterministic
drafts/selections, graph still regenerates. The demo never depends on live model
creativity.

---

*End of plan. Awaiting approval before any application code is written.*
