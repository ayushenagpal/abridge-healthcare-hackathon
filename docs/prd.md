# PreOp Navigator

## Autonomous Pre-Operative Agent, Powered by a Clinical Protocol Engine

---

# One Sentence

PreOp Navigator is a long-running AI agent that owns the pre-operative process from surgical referral until a patient is ready to schedule.

Using a deterministic clinical protocol engine built from the 2024 AHA/ACC Perioperative Guideline, it determines patient-specific readiness requirements, coordinates testing and specialty workups, validates evidence as it arrives, and continuously replans until every operational requirement has been resolved.

Instead of tracking tasks, PreOp Navigator closes operational loops.

---

# Vision

Today's pre-operative process is fragmented.

Surgical coordinators, nurses, surgeons, PCPs, specialists, patients, laboratories, imaging centers, and insurance teams all own small pieces of the workflow—but nobody owns the workflow itself.

As a result:

- surgeries are delayed because required work was never completed
- patients receive unnecessary testing
- coordinators spend hours manually chasing records, referrals, results, and patient responses
- blocked steps remain idle until someone notices

PreOp Navigator acts as an autonomous operations agent that continuously drives every referral toward a single terminal state:

> **Ready to Schedule**

Clinicians continue making medical decisions.

The agent owns everything operational.

---

# Why Now

Large language models can now reliably:

- reason across structured and unstructured healthcare data
- maintain long-running workflow state
- use tools
- coordinate across multiple stakeholders
- adapt plans as new evidence arrives

Combined with deterministic guideline logic, this enables an entirely new category of software:

**Autonomous healthcare operations.**

---

# The Problem

Healthcare has excellent clinical guidelines.

It has poor operational execution.

The 2024 AHA/ACC Perioperative Guideline defines exactly how perioperative cardiovascular evaluation should occur.

However, applying that guideline today requires humans to repeatedly:

- review charts
- interpret patient history
- determine missing evidence
- request outside records
- order testing
- coordinate specialists
- communicate with patients
- validate results
- update the plan whenever something changes

Every blocked dependency delays surgery.

---

# End User

Primary

- Surgical Coordinator
- Pre-Operative Nurse

Secondary

- Referring Surgeon
- Anesthesiologist
- Primary Care Physician
- Specialists
- Scheduler
- Patient

Success means:

- fewer preventable surgery delays
- less unnecessary testing
- shorter referral-to-surgery time
- dramatically less coordinator effort

---

# Product Philosophy

Three systems work together.

## 1. Clinical Protocol Engine

Determines what should happen.

Encodes clinician-reviewed guideline logic into deterministic rules.

Never uses an LLM.

Produces:

- readiness requirements
- protocol determinations
- risk calculations
- evidence requirements
- guideline citations

---

## 2. Navigator Agent

Determines how to accomplish the work.

The agent:

- searches the chart
- identifies missing evidence
- drafts orders
- drafts referrals
- contacts patients
- requests outside records
- validates incoming documents
- reprioritizes work
- follows up automatically
- escalates when required

The agent never decides medical care.

It executes operational work.

---

## 3. Clinician

Owns medicine.

Every meaningful clinical decision remains with licensed clinicians.

---

# The Six-Stage Pipeline

## Stage 1 — Classify the Surgery

Determine:

- urgency
- procedure category
- procedural risk
- anesthesia considerations
- downstream protocol modules

Output:

The initial pathway.

---

## Stage 2 — Evaluate the Patient

Extract patient-specific risk.

Examples include:

- active cardiac conditions
- validated RCRI inputs
- functional capacity
- existing biomarkers
- major comorbidities
- medication reconciliation

Output:

Patient-specific readiness graph.

---

## Stage 3 — Determine Required Work

The protocol engine determines:

- what testing is required
- what testing is not required
- specialty evaluations
- patient workstreams
- clinician review requirements

This produces a dependency graph rather than a checklist.

---

## Stage 4 — Execute the Critical Path

The Navigator:

- drafts orders
- drafts referrals
- schedules work
- requests records
- follows up
- validates incoming evidence

The system continuously works the highest-value unresolved dependency.

---

## Stage 5 — Patient Workstream

Patients receive a dynamic checklist.

Examples:

- DASI questionnaire
- medication reminders
- fasting instructions
- appointment reminders
- transportation
- required confirmations

Every completed task must be backed by validated evidence.

---

## Stage 6 — Final Readiness Packet

Once every requirement has validated evidence, PreOp Navigator generates:

- readiness summary
- completed work
- clinician decisions
- medication timeline
- anesthesia considerations
- guideline citations
- outstanding issues
- final scheduling recommendation

Terminal state:

> Ready to Schedule

---

# Dynamic Readiness Graph

The readiness graph is the heart of the system.

Unlike traditional workflow software, requirements change as evidence changes.

Examples:

A DASI questionnaire may create a biomarker requirement.

An abnormal biomarker may create a cardiology review.

A specialist note may eliminate future testing.

An existing CT scan may remove an unnecessary workup.

The graph is regenerated after every meaningful event.

---

# Core Principles

## Nothing is complete without evidence.

Patient statements are not evidence.

Documents are not evidence until validated.

Results are not complete until interpreted by the deterministic protocol engine.

---

## Existing evidence is preferred over new work.

The Navigator always follows the cost ladder.

1. Existing chart
2. Existing documents
3. Patient questionnaire
4. Outside records
5. New testing
6. Specialist evaluation

Avoiding unnecessary work is as valuable as completing required work.

---

## Long-running workflow

The Navigator does not operate like a chatbot.

It continuously:

Observe

↓

Reason

↓

Plan

↓

Execute

↓

Validate

↓

Replan

↓

Wait

The workflow may run for days or weeks.

---

# Safety

The Navigator never:

- diagnoses
- determines surgical clearance
- interprets abnormal findings for patients
- independently changes medications
- independently orders high-risk testing
- replaces clinician judgment

Every consequential clinical action requires clinician approval.

The protocol engine defines the pathway.

The Navigator performs the work.

---

# What This Is Not

### Not RAG

The guideline is encoded into deterministic logic.

The LLM never decides clinical recommendations.

---

### Not a Dashboard

The graph visualizes the system.

The product is the autonomous work.

---

### Not a Chatbot

Messages are tools.

The product is the long-running operational agent.

---

# Demo

Patient referred for elective colectomy.

PreOp Navigator:

1. Classifies the surgery.
2. Calculates patient-specific risk.
3. Builds the readiness graph.
4. Detects missing functional capacity.
5. Sends the DASI questionnaire.
6. Regenerates the graph.
7. Drafts a biomarker order.
8. Validates incoming evidence.
9. Drafts a cardiology referral.
10. Tracks every dependency.
11. Produces the final readiness packet.

Throughout the demo, the event stream and graph continuously evolve.

Nothing is manually advanced.

The agent performs the work.

---

# Long-Term Vision

Every completed case generates structured operational knowledge:

- requirements generated
- evidence collected
- clinician decisions
- graph mutations
- avoided testing
- operational delays
- surgical outcomes

At health-system scale, this becomes a proprietary perioperative operations dataset capable of improving guideline adherence, reducing unnecessary testing, benchmarking performance, and eventually informing future perioperative risk models.

---

# Success Criteria

Judges should leave believing:

- This agent owns an entire operational workflow.
- The clinical protocol is deterministic and auditable.
- The agent reasons across multiple healthcare data sources.
- The readiness graph evolves as evidence arrives.
- The system actively performs work rather than recommending it.
- It becomes more valuable as reasoning models improve while preserving clinician oversight.