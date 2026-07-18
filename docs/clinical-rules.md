# Clinical Rules

## Purpose

This document defines the deterministic clinical protocol engine used by PreOp Navigator.

It specifies:

- what rules are encoded
- how those rules are represented
- how evidence is evaluated
- when new requirements are generated
- when automation stops

This is **not** a copy of the 2024 AHA/ACC Perioperative Guideline.

The protocol engine implements a clinician-reviewed subset of the guideline required for the hackathon demo.

The LLM must never apply or invent clinical rules.

---

# Guiding Principles

The protocol engine is:

- deterministic
- auditable
- versioned
- clinician-reviewable
- testable

Every output must be explainable by a guideline rule.

The same patient state must always produce the same output.

---

# Guideline Version

Launch Module

```
2024 AHA/ACC Guideline for Perioperative Cardiovascular
Management for Noncardiac Surgery

Protocol Version:

aha-acc-perioperative-demo-v1
```

Future modules:

- Pulmonary evaluation
- Anticoagulation
- Diabetes medications
- Valvular disease
- Device management
- Frailty
- OSA
- Additional society guidelines

Each module should be versioned independently.

---

# Rule Format

Every encoded rule should follow this schema.

```ts
ClinicalRule {

id

title

module

version

description

requiredInputs

trigger

generatedRequirements

acceptableEvidence

normalHandling

abnormalHandling

missingDataHandling

unsupportedHandling

guidelineCitation

classOfRecommendation

levelOfEvidence

requiresClinicianApproval

}
```

Claude should implement rules as deterministic code.

Never prompt an LLM:

> "What does the guideline recommend?"

---

# Rule Categories

## Stage 1 — Surgery Classification

Determine:

- urgency
- procedure category
- procedure risk
- anesthesia considerations
- procedural bleeding risk

Outputs:

- urgency
- procedureRisk
- activatedModules

Potential outcomes:

- elective
- time-sensitive
- urgent
- emergency

Emergency cases exit the standard workflow immediately.

---

## Stage 2 — Active Cardiac Conditions

Before any scoring.

Detect:

- acute coronary syndrome
- decompensated heart failure
- unstable arrhythmia
- severe symptomatic valvular disease

If any are present:

```
Stop protocol

↓

Generate Human Review

↓

Cardiology Required
```

No further scoring should occur.

---

## Stage 3 — Risk Calculation

Inputs:

Validated patient state only.

Never infer absent disease.

Implement:

- RCRI

(Optional)

- NSQIP MICA

Every RCRI component must retain provenance.

Example:

```
History of CHF

Source:

FHIR Condition

Verified:

true

Evidence:

Condition/12345
```

Missing information remains missing.

It is never assumed negative.

---

## Stage 4 — Functional Capacity

Preferred order:

1. Existing chart documentation

2. Existing DASI

3. Patient questionnaire

Possible outputs:

- ≥ threshold

- below threshold

- unknown

Unknown generates:

Patient Questionnaire Requirement.

---

## Stage 5 — Biomarkers

Before creating a new order:

Search:

- existing labs
- outside records

If acceptable evidence exists:

Do not generate another order.

Possible evidence states:

- missing

- stale

- normal

- abnormal

- conflicting

- indeterminate

The protocol determines:

- proceed

- review

- further evaluation

The LLM does not.

---

## Stage 6 — Specialist Evaluation

Generate specialist review only when required.

Possible specialties:

- Cardiology

- Pulmonology

Future:

- Hematology

- Endocrinology

- etc.

Every referral includes:

- reason

- required evidence

- clinical summary

- guideline citation

The LLM drafts.

Clinician approves.

---

# Comorbidity Modules

Modules may activate independently.

Examples:

- Heart Failure

- Pulmonary Hypertension

- HCM

- CIED

- CAD

- Diabetes

- CKD

- Anticoagulation

- Frailty

Each module can:

Generate:

Requirements

↓

Evidence

↓

Review

↓

Additional Requirements

Modules should not know about each other.

The engine composes them.

---

# Dynamic Graph Rules

The graph is regenerated after every validated state change.

Graph mutations include:

Add Node

Remove Node

Reopen Node

Close Node

Change Dependency

Recalculate Critical Path

Example:

```
DASI Missing

↓

Patient Completes Questionnaire

↓

Biomarker Required

↓

Result Elevated

↓

Cardiology Review Added
```

---

# Evidence Rules

A requirement is not complete because:

- patient says so

- document exists

- lab returned

Requirements are complete only when acceptable evidence exists.

Every evidence item is evaluated for:

Identity

↓

Recency

↓

Completeness

↓

Authority

↓

Relevance

↓

Consistency

↓

Guideline Match

Possible outcomes:

```
Accepted

Accepted + Review

Rejected

Conflicting

Unsupported

Stale

Incomplete
```

---

# Clearance Rules

Receiving a clearance letter is not sufficient.

Example:

```
"Cleared pending echo"
```

Produces:

```
Document Received ✓

Clearance Complete ✗

Echo Required ✓
```

Graph mutates.

---

# Medication Rules

Medication reconciliation is separate from medication management.

Transcript:

"I started Ozempic."

FHIR:

No GLP-1.

Generate:

Medication Reconciliation

↓

Clinician Review

↓

Medication Module

Do not generate hold instructions unless:

- protocol supports them

- clinician approves

---

# Cost Ladder

Always attempt:

1 Existing chart

↓

2 Existing document

↓

3 Patient questionnaire

↓

4 Outside records

↓

5 Lab

↓

6 Referral

Never skip lower-cost evidence.

---

# Autonomy Ladder

## Tier 1

Standing-order actions.

Examples:

- DASI

- ECG

- Basic labs

- Patient reminders

May execute automatically if enabled.

---

## Tier 2

Draft only.

Examples:

- Specialist referral

- Echo

- PFT

- Medication timeline

Requires clinician approval.

---

## Tier 3

Never automated.

Examples:

- Stress test decision

- Anticoagulation bridge

- Medical clearance

- Surgical decision

Always human.

---

# Unsupported Pathways

Immediately stop automation.

Examples:

- LVAD

- Mechanical valve

- ACHD

- Severe pulmonary hypertension

- Missing critical inputs

Generate:

Human Review Package.

---

# Final Readiness Rule

Terminal state:

READY TO SCHEDULE

Requirements:

✓ Every blocking node resolved

✓ Required evidence validated

✓ Required approvals complete

✓ Outstanding unsupported pathways = none

✓ Final readiness packet generated

The protocol engine does NOT produce:

"Safe for surgery."

It produces:

"Operational requirements complete."

---

# Testing Requirements

Every rule requires deterministic tests.

Test:

- happy path

- missing input

- conflicting evidence

- stale evidence

- unsupported pathway

- graph mutation

- clinician approval

Every graph mutation should be reproducible from test fixtures.

No protocol behavior should depend on LLM output.