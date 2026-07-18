# PreOp Navigator Architecture

## Design Philosophy

PreOp Navigator is **not** an AI chatbot.

It is an **event-driven operational system** composed of two distinct layers:

1. **Clinical Protocol Engine**
2. **Navigator Agent**

The protocol engine determines **what** should happen.

The Navigator determines **how** to make it happen.

These responsibilities must remain completely separate.

The LLM must never determine clinical recommendations.

---

# High-Level Architecture

```
                    Surgical Referral
                           │
                           ▼
                  Data Ingestion Layer
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
 Structured Clinical Data             Unstructured Data
 (FHIR Resources)                  (Transcript / Notes / PDFs)
        │                                     │
        └──────────────────┬──────────────────┘
                           ▼
                Patient State Builder
                           │
                           ▼
              Deterministic Protocol Engine
                           │
             Generates Readiness Graph
                           │
                           ▼
                  Graph Diff Engine
                           │
                           ▼
                Navigator Agent (LLM)
                           │
                     Selects Tool
                           │
                           ▼
                    Tool Execution
                           │
                           ▼
                  Event + State Update
                           │
                           ▼
                 Wait For Next Event
```

Every incoming event causes the graph to regenerate.

The graph—not the LLM—is the source of truth.

---

# Layer 1 — Clinical Protocol Engine

The protocol engine is deterministic.

It contains clinician-reviewed implementations of the perioperative guideline.

Responsibilities:

- classify procedures
- calculate supported risk scores
- determine applicable protocol branches
- generate requirements
- classify evidence
- determine whether requirements are satisfied
- generate guideline-backed determinations
- generate graph mutations

It must never call an LLM.

---

## Inputs

Patient state

Procedure

Urgency

FHIR resources

Validated evidence

Protocol version

---

## Outputs

```ts
ProtocolResult

{
    pathwayStatus

    requirements

    determinations

    graph

    graphDiff

    appliedRules

    citations
}
```

---

# Layer 2 — Navigator Agent

The Navigator Agent performs operational work.

It receives:

- patient state
- readiness graph
- graph diff
- outstanding requirements
- communication history
- available tools
- previous actions

Its job is **not** to decide medicine.

Its job is to decide:

> "What is the highest-value operational action right now?"

---

# Core Agent Loop

```
Observe Event

↓

Load Current State

↓

Run Protocol Engine

↓

Graph Changes?

↓

Prioritize Blockers

↓

Choose Tool

↓

Execute

↓

Update State

↓

Sleep
```

The agent never loops continuously.

It only wakes on events.

---

# Core Data Model

## Patient State

Normalized, versioned representation of everything currently known.

Includes:

- demographics
- procedure
- urgency
- medications
- conditions
- validated observations
- questionnaire results
- specialist conclusions
- clinician decisions

Every field stores provenance.

---

## Readiness Graph

The graph is the primary application state.

Each node contains:

```ts
Requirement

id

title

status

dependencies

owner

acceptableEvidence

attachedEvidence

guidelineReference

requiresClinicianApproval

blocksScheduling
```

Possible states:

- missing
- searching
- waiting-patient
- waiting-external
- waiting-clinician
- satisfied
- abnormal-review-required
- unsupported
- blocked
- not-indicated

---

## Evidence

Every incoming fact becomes Evidence.

Sources:

- transcript
- FHIR
- PDF
- specialist letter
- lab
- questionnaire
- clinician decision

Evidence is never immediately trusted.

It must first be validated.

---

# Evidence Pipeline

```
Incoming Document

↓

Extract Candidate Facts

↓

Normalize

↓

Attach Provenance

↓

Validate

↓

Update Patient State

↓

Run Protocol Engine

↓

Graph Mutates
```

The protocol engine—not the extractor—determines whether the evidence satisfies a requirement.

---

# Graph Mutation

Unlike traditional workflow software, the graph changes over time.

Example:

```
DASI Missing

↓

Patient completes DASI

↓

Graph Regenerated

↓

Biomarker Node Appears

↓

Lab Returns Elevated

↓

Cardiology Review Appears

↓

Cardiology Letter Received

↓

Echo Node Appears

↓

Echo Complete

↓

Ready To Schedule
```

Nodes can:

- appear
- disappear
- reopen
- become blocked
- become satisfied

---

# Critical Path Engine

Every graph regeneration recalculates:

- scheduling blockers
- dependency chains
- parallel workstreams
- highest-value unresolved node

The Navigator always prioritizes actions that shorten the critical path.

---

# Cost Ladder

The Navigator always prefers lower-cost evidence.

1. Existing chart
2. Existing documents
3. Patient questionnaire
4. Outside records
5. Lab order
6. Referral

The system should never recommend a higher-cost action if a lower-cost action can satisfy the requirement.

---

# Tool Layer

Initial tools:

```
searchChart()

searchExistingEvidence()

sendPatientQuestionnaire()

sendPatientMessage()

requestOutsideRecords()

draftOrder()

draftReferral()

extractDocument()

validateEvidence()

requestClinicianApproval()

recordClinicianDecision()

scheduleFollowUp()

markReadyToSchedule()
```

Every tool:

- typed inputs
- typed outputs
- audit log
- idempotent
- failure handling

---

# Event Types

```
REFERRAL_RECEIVED

FHIR_IMPORTED

TRANSCRIPT_IMPORTED

PATIENT_UPDATED

QUESTIONNAIRE_RECEIVED

ORDER_APPROVED

LAB_RESULT_RECEIVED

DOCUMENT_RECEIVED

CLINICIAN_DECISION

PATIENT_MESSAGE

FOLLOW_UP_TIMEOUT

READY_TO_SCHEDULE
```

Each event causes exactly one protocol evaluation.

---

# Safety Layer

Before any tool executes:

Verify:

- protocol supports action
- required evidence exists
- clinician approval exists
- patient communication is approved
- duplicate action hasn't already occurred

If blocked:

Create Human Review event.

---

# User Interface

The UI is not the product.

It visualizes the system.

Main panels:

## Referral Summary

Patient

Procedure

Urgency

Protocol Version

Current Status

---

## Living Readiness Graph

Displays:

- dependency graph
- graph mutations
- critical path
- blockers
- satisfied nodes

---

## Evidence Viewer

Shows:

- transcript facts

- FHIR facts

- documents

- provenance

- conflicts

---

## Event Timeline

Every event

↓

Protocol Run

↓

Graph Mutation

↓

Agent Decision

↓

Tool Execution

↓

Waiting State

---

## Clinician Approval Queue

Displays:

- drafted orders

- drafted referrals

- medication review

- abnormal findings

Approve

Reject

Edit

---

# Persistence

Persist:

PatientState

Evidence

Requirements

Graph Versions

Events

Agent Decisions

Tool Executions

Clinician Decisions

Communications

---

# LLM Responsibilities

The LLM may:

- extract facts

- detect conflicts

- summarize

- choose operational actions

- draft communication

- draft referrals

- prioritize work

The LLM may never:

- determine guideline logic

- calculate risk scores

- determine thresholds

- determine readiness

- interpret abnormal results

- determine medication holds

- determine surgical clearance

---

# Success

The architecture succeeds if:

- identical patient state always produces identical protocol output
- every graph mutation is explainable
- every requirement has evidence
- every action is auditable
- every clinical decision remains deterministic
- the agent only performs operational reasoning