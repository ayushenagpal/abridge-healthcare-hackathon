/**
 * Data ingestion: dataset encounter + synthetic referral -> normalized
 * PatientState with provenance on every field. This path is deterministic and
 * uses no LLM. (Transcript fact extraction is LLM-assisted in a real build;
 * for the demo the one transcript-derived fact — a medication discrepancy — is
 * supplied as marked-synthetic evidence.)
 */
import demoEncounter from "../../data/demo-encounter.json";
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

interface RawObservation {
  code?: { text?: string; coding?: { code?: string; system?: string }[] };
  valueQuantity?: { value?: number; unit?: string };
  effectiveDateTime?: string;
  id?: string;
}

// Social/administrative condition labels that are not clinically relevant here.
const CONDITION_BLOCKLIST = [
  "received higher education",
  "not in labor force",
  "limited social contact",
  "social isolation",
  "stress (finding)",
  "medication review due",
  "part-time",
];

function chartProvenance(reference: string): Provenance {
  return {
    source: "fhir",
    reference,
    extractedBy: "fhir-normalizer",
    verified: true,
    recordedAt: NOW,
  };
}

function ageYears(birthDate: string, nowIso: string): number {
  const b = new Date(birthDate);
  const n = new Date(nowIso);
  let age = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--;
  return age;
}

export function buildInitialState(): PatientState {
  const enc = demoEncounter as unknown as {
    metadata: { patient_id: string };
    patient: {
      name: { given?: string[]; family?: string; prefix?: string[] }[];
      birthDate: string;
      gender: string;
    };
    longitudinal_summary: {
      condition_labels: string[];
      medication_labels: string[];
    };
    related_resources: { Observation: RawObservation[] };
  };

  const patientId = enc.metadata.patient_id;
  const nm = enc.patient.name[0];
  const name = [nm?.prefix?.join(" "), nm?.given?.join(" "), nm?.family]
    .filter(Boolean)
    .join(" ");

  const referral = buildReferral(patientId);

  const conditions: ChartCondition[] = enc.longitudinal_summary.condition_labels
    .filter((t) => !CONDITION_BLOCKLIST.some((b) => t.toLowerCase().includes(b)))
    .map((text, i) => ({
      code: "chart",
      system: "http://snomed.info/sct",
      text,
      clinicalStatus: "active",
      provenance: chartProvenance(`Condition/chart-${i}`),
    }));

  const medications: ChartMedication[] =
    enc.longitudinal_summary.medication_labels.map((text, i) => ({
      text,
      status: "active",
      provenance: chartProvenance(`MedicationRequest/chart-${i}`),
    }));

  const observations: ChartObservation[] = (enc.related_resources.Observation ?? [])
    .filter((o) => o.valueQuantity?.value != null && o.code?.text)
    .map((o) => ({
      code: o.code?.coding?.[0]?.code ?? "unknown",
      system: o.code?.coding?.[0]?.system ?? "http://loinc.org",
      text: o.code!.text!,
      value: o.valueQuantity!.value!,
      unit: o.valueQuantity?.unit,
      effectiveAt: o.effectiveDateTime,
      provenance: chartProvenance(`Observation/${o.id ?? "chart"}`),
    }));

  // Synthetic transcript-derived medication discrepancy (marked synthetic).
  const medDiscrepancy: Evidence = {
    id: "ev-med-discrepancy",
    requirementId: "medication-review",
    kind: "transcript",
    label: "Transcript: patient-reported medication",
    content: SYNTHETIC.medicationDiscrepancy,
    provenance: syntheticProvenance("transcript/medication-addendum"),
    validation: {
      status: "accepted-review",
      checkedAt: NOW,
      reasons: ["Patient statement — requires clinician confirmation"],
    },
  };

  return {
    version: 1,
    patientId,
    demographics: {
      name,
      birthDate: enc.patient.birthDate,
      gender: enc.patient.gender,
      ageYears: ageYears(enc.patient.birthDate, NOW),
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
