# Demo Case — Frank Delgado
## Elective Open Right Hemicolectomy

---

## Why This Case

Frank is a 70-year-old man with an ascending colon adenocarcinoma referred for elective open right hemicolectomy — one of the most common cancer surgeries performed in the United States.

He is the right patient for this demo for three reasons:

**1. Two protocol tracks that are clinically independent but operationally convergent.**
The cardiac spine and the pulmonary spine run in parallel on the same readiness graph. Neither knows about the other. The engine composes them. Both converge on one final anesthesia note. No coordination tool on the market does this.

**2. Each track demonstrates a different agentic behavior.**
- **Cardiac:** risk-stratify → escalate → wait for clearance (blocking)
- **Pulmonary:** risk-stratify → optimize proactively with a bundle (non-blocking)

These are not the same loop. Showing both in one case proves the agent adapts its behavior to what the guideline actually requires — it doesn't just fire one template for everything.

**3. Every beat is a straight line, not a decision tree.**
Frank doesn't have LVAD, mechanical valve, or ACHD. He doesn't have decompensated heart failure. The active cardiac gate clears immediately. There are no branch points that would confuse a 4-minute demo. The complexity is in the depth of two parallel tracks, not in exception handling.

---

## Patient Parameters

| Parameter | Value | Clinical Significance |
|-----------|-------|----------------------|
| Age | 70M | RCRI: age-appropriate risk |
| Procedure | Elective open right hemicolectomy | Intraperitoneal + upper abdominal incision — drives both tracks |
| Expected duration | >3h | ARISCAT: +23 pts |
| Anesthesia | General | Full perioperative evaluation required |
| Bleeding risk | High | Aspirin management critical (LAD stent) |
| **Hypertension** | Active | Lisinopril: hold morning of surgery |
| **T2DM, insulin-dependent** | Active, HbA1c 8.2% | RCRI +1; empagliflozin discrepancy; insulin protocol needed |
| **Prior MI, mid-LAD DES >12mo** | Stable IHD | RCRI +1; active cardiac gate CLEAR (not active ACS); aspirin: continue |
| **COPD GOLD 2** | FEV1 65% predicted | Pulmonary comorbidity → ARISCAT fires |
| **Recent bronchitis** | Within last month | ARISCAT: +17 pts — the highest single component |
| **Current smoker** | ~30 pack-years | ARISCAT optimization: smoking cessation referral |
| SpO₂ | 93% | ARISCAT: 91-95% = +8 pts |
| Hemoglobin | 12.1 g/dL | ARISCAT anemia threshold is ≤10 — this does NOT fire |
| Creatinine | 1.0 mg/dL | RCRI creatinine threshold is >2.0 — this does NOT fire |

**RCRI = 3** (high-risk surgery + IHD + insulin-treated DM)
**ARISCAT = 66** (HIGH risk ≥45 — optimization bundle fires)

---

## Medication Discrepancy

Frank mentions in the encounter transcript: *"I also take Jardiance — my endocrinologist added it a few months ago for my kidneys and heart. I take it every morning."*

Empagliflozin (Jardiance, SGLT2i) is **absent from the structured FHIR medication list**. This is the medication reconciliation catch. Clinical significance: SGLT2i agents require a 3-4 day perioperative hold due to risk of euglycemic diabetic ketoacidosis (DKA). The Navigator surfaces this discrepancy and drafts a reconciliation for clinician review — it does not generate the hold instruction autonomously.

---

## The Two Agentic Behaviors

### Cardiac Track — Escalate and Wait

The cardiac track is a blocking sequence. Every step gates the next.

```
REFERRAL → RCRI = 3 (elevated)
         → Functional Capacity: unknown → DASI sent (cost ladder: lowest first)
         → DASI 26 = 3 METs (poor)
         → NT-proBNP ordered (elevated-risk surgery + poor FC per AHA/ACC 2024)
         → NT-proBNP 480 pg/mL ≥300 → ELEVATED
         → Cardiology E-Consult node ADDED (graph mutation)
         → Agent searches existing records, finds none, drafts referral
         → Letter: "cleared pending echocardiogram" → TRUST-BUT-VERIFY
         → Echo node ADDED (second graph mutation)
         → Echo: EF 55%, normal → Cardiology clearance CLOSED
```

Every node blocks scheduling until resolved. The agent escalates and then waits — it cannot advance the cardiac track without clinical input.

### Pulmonary Track — Optimize Proactively

The pulmonary track fires on referral receipt and does not block scheduling. It represents a different clinical imperative: not "determine if surgery is safe" but "make the patient as ready as possible."

```
REFERRAL → ARISCAT scored from chart:
           Age 70 (3) + SpO2 93% (8) + recent bronchitis (17)
           + upper abdominal incision (15) + duration >3h (23) = 66 pts → HIGH

         → Optimization Bundle fires IMMEDIATELY:
           [Tier 1 — auto]  Incentive spirometry education
           [Tier 1 — auto]  Inhaler optimization check (LAMA + LABA/ICS + technique)
           [Tier 1 — auto]  Chest physiotherapy & breathing exercises
           [Tier 2 — draft] Smoking cessation referral → clinician approval
           [Tier 2 — draft] Prehabilitation referral (high risk ≥45) → clinician approval
```

None of these block scheduling. The agent initiates them in parallel while the cardiac spine awaits clearance. This is the second agentic behavior: the system knows when to optimize rather than test.

---

## Beat-by-Beat Script (4 minutes)

### Beat 1 — Referral Received (0:00–0:45)

Click **Start Referral**. Empty case fills.

```
Reading transcript...  Reading FHIR...  Normalizing state...  Running protocol engine...
```

Graph appears. Narrate while it builds:

```
Procedure Classification ✓  (intraperitoneal, elevated-risk, upper abdominal, elective)
Active Cardiac Screen ✓      (prior MI is stable — NOT active ACS → clear)
RCRI = 3 ✓                   (high-risk surgery + IHD + insulin DM)
Functional Capacity           MISSING → DASI questionnaire sent automatically
ARISCAT = 66 HIGH ✓           Optimization bundle: Incentive Spirometry,
                              Inhaler Check, Chest PT, Smoking Cessation Referral,
                              Prehabilitation Referral
Medication Discrepancy        Empagliflozin in transcript, not in FHIR
                              → Medication Reconciliation Required
```

**Narration:** *"The protocol engine just ran. Two tracks opened. The cardiac spine is escalating — RCRI 3 is elevated, and we need functional capacity before we can decide what to do. The pulmonary spine already knows what to do: ARISCAT 66 is high risk, so the optimization bundle fired immediately without waiting for labs or referrals. These two behaviors are different on purpose."*

---

### Beat 2 — DASI Returns Poor, Biomarker Ordered (0:45–1:30)

Click **Submit DASI** (score 26, ≈3 METs).

```
Functional Capacity ✓  (DASI 26 ≈ 3 METs — below 4-MET threshold)
↓
NT-proBNP Biomarker node ADDED  ← graph mutation 1
```

Show the event timeline: *"Agent → searchExistingEvidence (NT-proBNP) — not found. Agent → draftOrder (NT-proBNP) — clinician approval required."*

Click **Approve Biomarker Order**.

**Narration:** *"DASI 3 METs — poor functional capacity. Per AHA/ACC 2024, NT-proBNP is indicated when functional capacity is poor and surgery is elevated-risk. The agent searched existing labs first — found nothing — then drafted the order. Cost ladder enforced in code, not in a prompt."*

---

### Beat 3 — NT-proBNP Elevated, Cardiology E-Consult Appears (1:30–2:10)

Click **Receive NT-proBNP** (480 pg/mL).

```
NT-proBNP 480 pg/mL ≥ 300 → ELEVATED
↓
Cardiology E-Consult node ADDED  ← graph mutation 2
```

**Narration:** *"480 pg/mL — above the 300 pg/mL threshold in the 2024 guideline. The graph just mutated: a cardiology e-consult node appeared. This requirement did not exist before. The agent is already searching for an existing cardiology evaluation."*

---

### Beat 4 — Trust, But Verify (2:10–2:45)

Click **Receive Cardiology Letter**. Display the letter text:

> *"…cleared for the proposed right hemicolectomy, pending echocardiogram to evaluate LV function given NT-proBNP of 480 pg/mL."*

```
Document Received ✓
Cardiology Clearance ✗   ← "pending echocardiogram" detected
Echo node ADDED          ← graph mutation 3
```

**Narration:** *"The letter arrived. The node did not close. The Navigator validated the content — the clearance was conditional. 'Cleared pending echocardiogram' means we need an echo. That's not the letter failing — that's the system doing exactly what a careful coordinator would do, every time, without forgetting."*

---

### Beat 5 — Echo Normal, Cardiac Loop Closes (2:45–3:10)

Click **Receive Echo** (EF 55%, normal).

```
Echocardiogram ✓    (EF 55%, no structural disease)
Cardiology Clearance ✓   ← all cardiac blocking nodes CLOSED
```

---

### Beat 6 — Medication Timeline, Final Approval (3:10–3:45)

Click **Approve Medication Timeline**.

```
Medication Reconciliation ✓
  Empagliflozin confirmed — 3-day perioperative hold documented
  Metoprolol: continue; Aspirin: continue (stent); Lisinopril: hold day-of
```

Click **Final Approval**. Graph turns green.

**Final Readiness Packet expands:**

```
READY TO SCHEDULE
─────────────────────────────────────
CARDIAC
  RCRI 3 — elevated risk
  DASI 26 ≈ 3 METs (poor)
  NT-proBNP 480 pg/mL (elevated) → echo EF 55%, normal
  Cardiology: cleared
  Medication timeline: reconciled; empagliflozin hold ×3d

PULMONARY (optimization, non-blocking)
  ARISCAT 66 — HIGH risk
  Incentive spirometry: instructed
  Inhaler optimization: verified
  Chest PT: instructed
  Smoking cessation: referred
  Prehabilitation: referred

Operational requirements complete.
─────────────────────────────────────
```

**Narration:** *"One patient, two protocol tracks, one readiness packet. The cardiac spine escalated through a risk hierarchy and waited for clearance. The pulmonary spine stratified once and immediately optimized. The surgeon gets a schedulable patient. Anesthesia gets the complete picture."*

---

## 4-Minute Run Order

| Time | Button | Event | Key Moment |
|------|--------|-------|------------|
| 0:00 | **Start Referral** | REFERRAL_RECEIVED | Two tracks open, optimization bundle fires |
| 0:45 | **Submit DASI** | QUESTIONNAIRE_RECEIVED | Biomarker node added (graph mutation 1) |
| 1:10 | **Approve Biomarker Order** | ORDER_APPROVED | |
| 1:30 | **Receive NT-proBNP** | LAB_RESULT_RECEIVED | Cardiology e-consult appears (graph mutation 2) |
| 2:10 | **Receive Cardiology Letter** | DOCUMENT_RECEIVED | Echo node added (graph mutation 3) — trust-but-verify |
| 2:45 | **Receive Echo** | DOCUMENT_RECEIVED | Cardiac loop closes |
| 3:10 | **Approve Medication Timeline** | CLINICIAN_DECISION | Empagliflozin hold documented |
| 3:30 | **Final Approval** | CLINICIAN_DECISION | Ready To Schedule |

---

## What the Judges Should Remember

- The protocol engine — not the LLM — generated both tracks on referral.
- The graph mutated three times as evidence arrived.
- The cardiac agent escalated and waited. The pulmonary agent optimized immediately. Same patient, different behaviors, correct for each guideline.
- The system caught the SGLT2i that wasn't in the chart.
- The system refused to close the cardiology node on a conditional letter.
- "Operational requirements complete" — not "safe for surgery."

---

## Backup Demo

`LLM_MODE=mock` produces identical event sequences and graph mutations using deterministic scripted responses. The demo never depends on live model creativity.

Run: `npm run dev` — available at http://localhost:5173.
