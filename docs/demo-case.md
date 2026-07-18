# Demo Case

## Goal

Demonstrate that PreOp Navigator owns the pre-operative workflow from referral until a patient is ready to schedule.

The audience should understand three ideas:

1. The protocol engine—not the LLM—determines clinical requirements.
2. The readiness graph evolves as new evidence arrives.
3. The Navigator autonomously performs operational work while clinicians retain medical decision-making.

The product is not a dashboard.

The product is a long-running operational agent.

---

# Demo Dataset

Use one synthetic patient from the Abridge dataset.

Procedure:

Elective colectomy.

Everything shown in the demo should be derived from:

- referral
- encounter transcript
- FHIR resources
- deterministic protocol engine
- simulated external events

Additional demo data should be explicitly marked as synthetic.

---

# Live Demo (3 minutes)

## Beat 1 — Referral Received (45 seconds)

Start with an empty case.

Show only:

```
Referral Received

↓

Processing...
```

Narration:

> A patient has just been referred for elective colectomy.
> No surgery date exists yet.
> This is where PreOp Navigator begins.

The system loads:

- referral
- encounter transcript
- FHIR bundle

Display:

```
Reading transcript...

Reading FHIR...

Normalizing patient state...

Running protocol engine...
```

Graph appears.

Current blockers:

- Functional capacity unknown
- Medication discrepancy
- Risk assessment incomplete

Narration:

> The protocol engine—not AI—has determined what this patient needs.

---

## Beat 2 — Graph Generation (45 seconds)

Show the graph.

```
Referral

├── Procedure Classification ✓

├── RCRI

├── Functional Capacity

├── Medication Review

└── Ready To Schedule
```

Now zoom into RCRI.

Show provenance.

```
History of CHF

Source

FHIR Condition

Verified
```

Next component.

```
Creatinine

Source

Lab

Current

1.8
```

Show final score.

```
RCRI = 2

Reasoning complete.
```

Narration:

> Every component is backed by evidence.
> Missing information stays missing.
> The model never invents facts.

---

## Beat 3 — Agent Begins Working (40 seconds)

Current blocker:

Functional Capacity.

Navigator chooses:

```
Action

Send DASI Questionnaire
```

No clicks.

Automatically.

Patient receives SMS.

```
Please complete this questionnaire.
```

Narration:

> Instead of defaulting to more testing,
> the agent follows the guideline's lowest-cost path.

---

## Beat 4 — Graph Mutation (45 seconds)

Patient completes DASI.

Graph regenerates.

Animate:

```
Functional Capacity ✓

↓

Biomarker Requirement Added
```

Order drafted.

Clinician approves.

Lab returns.

```
NT-proBNP

Received
```

Graph mutates again.

```
Cardiology Review

Added
```

Narration:

> The graph changes because the patient's state changed.
> These requirements did not exist before.

---

## Beat 5 — Tracking, Not Trusting (35 seconds)

Cardiology letter arrives.

Display.

```
"...cleared pending echocardiogram..."
```

Navigator:

```
Document Received ✓

Requirement Complete ✗
```

New node.

```
Echo Required
```

Narration:

> A document arriving isn't enough.
> The Navigator validates the content—not just the existence.

This should be the biggest "wow" moment.

---

## Beat 6 — Ready To Schedule (30 seconds)

Echo arrives.

Clinician approves.

Medication reconciliation complete.

Graph turns green.

Final artifact appears.

```
Ready To Schedule
```

Expand.

Show:

- RCRI

- DASI

- Clearances

- Medication Timeline

- Guideline Citations

Narration:

> The surgeon gets a schedulable patient.
> Anesthesia gets a mitigation plan.
> Every requirement has validated evidence.

End.

---

# One Minute Video

The video should tell the exact same story but much faster.

0–10 sec

Problem.

```
Surgeries get delayed because
nobody owns pre-op coordination.
```

↓

10–20 sec

Referral.

```
Referral received

↓

Graph generated
```

↓

20–35 sec

Graph mutation.

```
DASI

↓

Biomarker

↓

Cardiology Review
```

↓

35–50 sec

Conditional clearance.

```
"Cleared pending echo"

↓

Still blocked
```

↓

50–60 sec

Graph turns green.

```
Ready To Schedule

Powered by

Protocol Engine

+

Autonomous Agent
```

Done.

---

# Visual Design

The graph is the hero.

Everything else supports it.

Keep UI minimal.

White background.

Simple dependency graph.

Timeline on right.

Evidence panel on left.

Agent activity at bottom.

No dashboards.

No analytics.

---

# Key Demo Moments

The judges should remember:

✓ The protocol engine generated the graph.

✓ The graph changed as evidence arrived.

✓ The agent automatically worked the critical path.

✓ The system refused to trust a clearance letter that said:

"Cleared pending echo."

✓ Ready To Schedule was produced only after every dependency closed.

---

# Backup Demo

If the LLM fails:

Replace model calls with deterministic mocked responses.

The graph should still regenerate.

The event stream should still update.

The demo should never depend on live model creativity.

---

# Success

At the end of the demo the judges should think:

"This isn't an AI assistant."

"It's an autonomous employee that owns pre-operative operations."