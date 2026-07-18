/**
 * Synthetic augmentation. No surgical referral exists in the Abridge dataset,
 * so the elective-colectomy referral and the external events (DASI response,
 * NT-proBNP result, cardiology letter, echo report, medication discrepancy)
 * are synthesized here. Every item is marked source:"synthetic" and shown as
 * SYNTHETIC in the UI. Synthetic artifacts only supply events — the engine,
 * not these files, makes every clinical determination.
 */
import type { Provenance, Referral } from "./models";

// Fixed "now" so age, timestamps, and the whole run are deterministic.
export const NOW = "2026-07-18T09:00:00-07:00";

export function syntheticProvenance(reference: string): Provenance {
  return {
    source: "synthetic",
    reference,
    extractedBy: "manual",
    verified: true,
    recordedAt: NOW,
  };
}

export function buildReferral(patientId: string): Referral {
  return {
    id: "referral-1",
    patientId,
    procedure: {
      text: "Elective laparoscopic colectomy",
      snomedCode: "26390003",
    },
    urgency: "elective",
    indication:
      "Colonic mass identified on surveillance colonoscopy; resection planned.",
    referringProvider: "Dr. A. Reyes, Colorectal Surgery",
    receivedAt: NOW,
    provenance: syntheticProvenance("referral/elective-colectomy"),
  };
}

// --- External event payloads (delivered via simulation controls) ---

export const SYNTHETIC = {
  // DASI answers that deterministically score below the 4-MET threshold.
  dasi: {
    score: 18.7,
    metsEstimate: 3.4,
  },
  // Elevated NT-proBNP result.
  ntProBnp: {
    code: "33762-5",
    text: "Natriuretic peptide.B prohormone N-Terminal [Mass/volume]",
    value: 512,
    unit: "pg/mL",
  },
  // The pivotal beat: a clearance letter that is conditional.
  cardiologyLetter: {
    text: "Patient evaluated. Stable ischemic heart disease. Cleared for surgery pending a resting transthoracic echocardiogram to document LV function.",
    cleared: true,
    pendingEcho: true,
  },
  // Normal echo that closes the loop.
  echo: {
    text: "Transthoracic echocardiogram: LVEF 58%, no significant valvular disease, normal wall motion.",
    normal: true,
  },
  // Transcript addendum not reflected in FHIR — drives reconciliation.
  medicationDiscrepancy: {
    med: "Semaglutide (GLP-1) — patient-reported, not in chart",
    discrepancy: true,
  },
};
