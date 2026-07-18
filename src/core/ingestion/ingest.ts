/**
 * Data ingestion: builds a normalized PatientState for each demo case.
 *
 * Case A (Eleanor Marsh): conditions, medications, observations are loaded from
 * patients.json. The pulmonary pathway uses PFT observations already present
 * in that file. The medication discrepancy (apixaban) is injected as synthetic
 * evidence derived from the transcript.
 *
 * Case B (David Chen): clean, healthy patient — no conditions, no medications,
 * excellent functional capacity confirmed from chart. Engine short-circuits to
 * ready-to-schedule.
 *
 * Both paths are deterministic and import no LLM modules.
 */
import patients from "../../../data/synthetic/patients.json";
import {
  EMPTY_OPS,
  type ChartCondition,
  type ChartMedication,
  type ChartObservation,
  type Evidence,
  type PatientState,
  type Provenance,
} from "../models";
import { NOW, buildReferral, SYNTHETIC, syntheticProvenance } from "../synthetic";

function chartProvenance(reference: string): Provenance {
  return {
    source: "fhir",
    reference,
    extractedBy: "fhir-normalizer",
    verified: true,
    recordedAt: NOW,
  };
}

function syntheticObsProvenance(reference: string): Provenance {
  return {
    source: "synthetic",
    reference,
    extractedBy: "fhir-normalizer",
    verified: true,
    recordedAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// Case A — Eleanor Marsh, right upper lobectomy.
// ---------------------------------------------------------------------------
function buildCaseAState(): PatientState {
  const pt = (patients as { patients: typeof patients.patients }).patients.find(
    (p) => p.id === "case-a-eleanor-marsh",
  )!;

  const conditions: ChartCondition[] = pt.conditions.map((c, i) => ({
    code: c.code,
    system: "http://snomed.info/sct",
    text: c.text,
    clinicalStatus: c.clinicalStatus === "active" ? "active" : "resolved",
    provenance: chartProvenance(`Condition/eleanor-${i}`),
  }));

  // Active medications from FHIR (excludes the discontinued apixaban — it shows
  // as DISCONTINUED in FHIR, creating the discrepancy the transcript reveals).
  const medications: ChartMedication[] = pt.medications.fhirMedications
    .filter((m) => m.status === "active")
    .map((m, i) => ({
      text: m.text,
      status: "active",
      provenance: chartProvenance(`MedicationRequest/eleanor-med-${i}`),
    }));

  // Observations from patients.json — includes FEV1, DLCO, creatinine, Hgb, BP, etc.
  // NT-proBNP is excluded from the initial chart — it arrives as a new lab
  // result during the demo (sim button "Receive NT-proBNP").
  const observations: ChartObservation[] = pt.observations
    .filter((o) => !["natriuretic", "probnp", "nt-probnp"].some((k) => o.text.toLowerCase().includes(k)))
    .map((o, i) => ({
      code: o.code,
      system: o.system,
      text: o.text,
      value: typeof o.value === "number" ? o.value : null,
      unit: typeof o.unit === "string" ? o.unit : undefined,
      effectiveAt: o.effectiveAt,
      provenance: chartProvenance(`Observation/eleanor-obs-${i}`),
    }));

  // Transcript-derived medication discrepancy (marked synthetic).
  const medDiscrepancy: Evidence = {
    id: "ev-med-discrepancy",
    requirementId: "medication-review",
    kind: "transcript",
    label: "Transcript: patient mentions active apixaban for atrial fibrillation",
    content: SYNTHETIC.medicationDiscrepancy,
    provenance: syntheticProvenance("transcript/apixaban-mention"),
    validation: {
      status: "accepted-review",
      checkedAt: NOW,
      reasons: [
        "Patient states taking apixaban daily for heart rhythm — FHIR shows DISCONTINUED 8 months ago. Requires clinician reconciliation.",
      ],
    },
  };

  const referral = buildReferral(pt.demographics.mrn, "A");

  return {
    version: 1,
    patientId: pt.demographics.mrn,
    demographics: {
      name: pt.demographics.name,
      birthDate: pt.demographics.dateOfBirth,
      gender: pt.demographics.sex,
      ageYears: pt.demographics.ageYears,
    },
    referral,
    conditions,
    medications,
    observations,
    functionalCapacity: { status: "unknown" },
    questionnaires: [],
    evidence: [medDiscrepancy],
    clinicianDecisions: [],
    derived: {},
    ops: { ...EMPTY_OPS },
  };
}

// ---------------------------------------------------------------------------
// Case B — David Chen, arthroscopic meniscus repair.
// ---------------------------------------------------------------------------
function buildCaseBState(): PatientState {
  const pt = (patients as { patients: typeof patients.patients }).patients.find(
    (p) => p.id === "case-b-david-chen",
  )!;

  const observations: ChartObservation[] = pt.observations.map((o, i) => ({
    code: o.code,
    system: o.system,
    text: o.text,
    value: typeof o.value === "number" ? o.value : null,
    unit: typeof o.unit === "string" ? o.unit : undefined,
    effectiveAt: o.effectiveAt,
    provenance: syntheticObsProvenance(`Observation/david-obs-${i}`),
  }));

  const referral = buildReferral(pt.demographics.mrn, "B");

  return {
    version: 1,
    patientId: pt.demographics.mrn,
    demographics: {
      name: pt.demographics.name,
      birthDate: pt.demographics.dateOfBirth,
      gender: pt.demographics.sex,
      ageYears: pt.demographics.ageYears,
    },
    referral,
    conditions: [],
    medications: [],
    observations,
    // Chart clearly documents ≥ 10 METs — no DASI needed.
    functionalCapacity: {
      status: "at-or-above",
      metsEstimate: 10,
      provenance: syntheticObsProvenance("chart/exercise-history"),
    },
    questionnaires: [],
    evidence: [],
    clinicianDecisions: [],
    derived: {},
    ops: { ...EMPTY_OPS },
  };
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------
export function buildInitialState(caseId: "A" | "B" = "A"): PatientState {
  return caseId === "B" ? buildCaseBState() : buildCaseAState();
}
