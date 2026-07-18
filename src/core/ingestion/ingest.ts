/**
 * Data ingestion: loads Frank Delgado's synthetic patient state from
 * patients.json. All fields carry provenance. NT-proBNP is excluded from
 * the initial chart — it arrives as a new lab result during the demo.
 *
 * Deterministic. No LLM imports.
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

export function buildInitialState(): PatientState {
  const pt = (patients as { patients: typeof patients.patients }).patients.find(
    (p) => p.id === "case-frank",
  )!;

  const conditions: ChartCondition[] = pt.conditions.map((c, i) => ({
    code: c.code,
    system: "http://snomed.info/sct",
    text: c.text,
    clinicalStatus: c.clinicalStatus === "active" ? "active" : "resolved",
    provenance: chartProvenance(`Condition/frank-${i}`),
  }));

  // Active FHIR medications only. Empagliflozin is absent here — it arrives
  // via transcript extraction as the medication discrepancy.
  const medications: ChartMedication[] = pt.medications.fhirMedications.map((m, i) => ({
    text: m.text,
    status: "active",
    provenance: chartProvenance(`MedicationRequest/frank-${i}`),
  }));

  // Observations from patients.json. Excludes NT-proBNP (arrives as lab result
  // during demo) and any post-referral-date values.
  const NT_PROBNP_TERMS = ["natriuretic", "probnp", "nt-probnp"];
  const observations: ChartObservation[] = pt.observations
    .filter((o) => !NT_PROBNP_TERMS.some((k) => o.text.toLowerCase().includes(k)))
    .map((o, i) => ({
      code: o.code,
      system: o.system,
      text: o.text,
      value: typeof o.value === "number" ? o.value : null,
      unit: typeof o.unit === "string" ? o.unit : undefined,
      effectiveAt: o.effectiveAt,
      provenance: chartProvenance(`Observation/frank-${i}`),
    }));

  // Transcript-derived medication discrepancy (empagliflozin).
  const medDiscrepancy: Evidence = {
    id: "ev-med-discrepancy",
    requirementId: "medication-review",
    kind: "transcript",
    label: "Transcript: patient mentions Jardiance (empagliflozin) — not in FHIR",
    content: SYNTHETIC.medicationDiscrepancy,
    provenance: syntheticProvenance("transcript/empagliflozin-mention"),
    validation: {
      status: "accepted-review",
      checkedAt: NOW,
      reasons: [
        "Patient states taking empagliflozin daily — absent from structured medication list. SGLT2i: 3-4 day perioperative hold required. Clinician reconciliation required.",
      ],
    },
  };

  const referral = buildReferral(pt.demographics.mrn);

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
