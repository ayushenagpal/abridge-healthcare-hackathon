# Implementation Tasks

## Goal

Build the smallest complete, deterministic, replayable demonstration of:

```text
Surgical Referral
        ↓
Protocol Engine
        ↓
Readiness Graph
        ↓
Navigator Agent
        ↓
Graph Mutation
        ↓
Ready To Schedule
```

Prioritize an end-to-end working demo over production infrastructure.

---

# Phase 0 — Repository Assessment

Before writing any code:

- Inspect the existing repository.
- Identify the framework and package manager.
- Reuse existing code wherever possible.
- Inspect the Abridge dataset.
- Understand the FHIR schema.
- Read every document in `/docs`.
- Produce `docs/implementation-plan.md`.

Do **not** modify application code yet.

---

# Phase 1 — Data Layer

Create a data ingestion pipeline.

Tasks:

- Load one encounter from the Abridge dataset.
- Parse transcript.
- Parse FHIR resources.
- Normalize patient state.
- Preserve provenance for every field.

Deliverable:

One normalized patient object.

---

# Phase 2 — Domain Models

Implement typed models for:

- Referral
- PatientState
- Evidence
- Requirement
- ReadinessGraph
- WorkflowEvent
- AgentDecision
- ProtocolResult
- ToolExecution
- ClinicianReview

Use Zod for validation.

---

# Phase 3 — Clinical Protocol Engine

Build the deterministic protocol engine.

Implement:

- Procedure classification
- Urgency classification
- RCRI calculation
- Functional-capacity branch
- DASI scoring
- Biomarker branch
- Requirement generation
- Graph generation
- Graph mutation
- Rule provenance

The protocol engine must contain **no LLM calls**.

---

# Phase 4 — Readiness Graph

Build the dependency graph.

Support:

- dependencies
- blockers
- graph mutation
- graph diff
- critical path
- parallel work

Every protocol run regenerates the graph.

---

# Phase 5 — Evidence Pipeline

Implement:

- transcript extraction
- FHIR normalization
- document ingestion
- evidence validation
- provenance tracking
- conflict detection
- stale evidence detection

The protocol engine evaluates evidence—not the extractor.

---

# Phase 6 — Agent Tools

Implement mock-first tools:

- searchChart()
- searchExistingEvidence()
- sendPatientQuestionnaire()
- sendPatientMessage()
- requestOutsideRecords()
- draftOrder()
- draftReferral()
- validateEvidence()
- requestClinicianApproval()
- recordClinicianDecision()
- scheduleFollowUp()
- markReadyToSchedule()

Every tool should be:

- typed
- idempotent
- logged
- auditable

---

# Phase 7 — Navigator Agent

Implement the event-driven orchestrator.

For every event:

1. Load patient state.
2. Run protocol engine.
3. Compare graph diff.
4. Identify blockers.
5. Calculate critical path.
6. Select one operational action.
7. Execute tool.
8. Persist state.
9. Wait for next event.

The agent never loops endlessly.

It wakes only when events occur.

---

# Phase 8 — Demo Flow

Implement the exact demo sequence.

### Beat 1

Referral received.

↓

Run protocol.

↓

Generate graph.

↓

Send DASI.

---

### Beat 2

Patient submits DASI.

↓

Graph regenerates.

↓

Draft biomarker order.

↓

Clinician approves.

↓

Receive result.

↓

Graph mutates.

---

### Beat 3

Receive conditional cardiology letter.

↓

Keep node open.

↓

Generate echo dependency.

↓

Receive echo.

↓

Close node.

---

### Beat 4

Medication reconciliation complete.

↓

Final readiness packet.

↓

Ready To Schedule.

---

# Phase 9 — User Interface

Single-page application.

Panels:

- Referral Summary
- Readiness Graph
- Evidence Viewer
- Event Timeline
- Clinician Approval Queue
- Simulation Controls

The graph should be the focal point.

---

# Phase 10 — Simulation Controls

Buttons:

- Start Referral
- Submit DASI
- Approve Biomarker Order
- Receive Lab Result
- Receive Cardiology Letter
- Receive Echo
- Approve Medication Timeline
- Final Approval
- Reset Demo

Each button emits one event.

---

# Phase 11 — Safety

Block:

- autonomous medical clearance
- autonomous medication changes
- autonomous interpretation
- unsupported pathways
- duplicate actions
- invalid evidence
- terminal state without clinician approval

---

# Phase 12 — Testing

Protocol tests:

- deterministic RCRI
- deterministic graph generation
- graph mutation
- abnormal results
- stale evidence
- unsupported pathways

Agent tests:

- searches chart before ordering
- uses questionnaire before testing
- follows cost ladder
- validates documents
- refuses conditional clearance
- waits for clinician approval

---

# Phase 13 — Polish

- Loading states
- Error handling
- Reset demo
- README
- Environment variables
- Deployment
- 1-minute demo mode
- 3-minute live demo mode

---

# Definition of Done

The demo must show:

✓ Referral received

✓ Protocol engine generates graph

✓ Agent performs work autonomously

✓ Graph mutates with new evidence

✓ Conditional clearance does not close a node

✓ Evidence is validated

✓ Final anesthesia packet generated

✓ Ready To Schedule