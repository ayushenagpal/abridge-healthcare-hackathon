/**
 * Synthetic augmentation for the Frank Delgado demo case.
 *
 * Frank: 70M, elective open right hemicolectomy. Dual tracks:
 *   CARDIAC: RCRI 3, DASI 26 (3 METs) → NT-proBNP 480 (≥300, elevated)
 *            → cardiology e-consult → conditional clearance → echo.
 *   PULMONARY: ARISCAT 59 (HIGH) → optimization bundle fires on referral
 *              (non-blocking: incentive spirometry, inhaler check,
 *               smoking cessation, chest PT, prehabilitation).
 *   MEDICATION: Empagliflozin (SGLT2i) mentioned in transcript, absent
 *               from FHIR → reconciliation required, 3-day hold planned.
 *
 * Every item is marked source:"synthetic". Synthetic artifacts supply external
 * events only — the engine makes every clinical determination.
 */
import type { Provenance, Referral } from "./models";

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
    id: "referral-frank-001",
    patientId,
    procedure: {
      text: "Elective open colectomy (right hemicolectomy)",
      snomedCode: "17791002",
    },
    urgency: "elective",
    indication:
      "Ascending colon adenocarcinoma, 3.1 cm, T2N0M0. Surgical resection recommended by colorectal oncology.",
    referringProvider: "Dr. L. Park, Colorectal Surgery",
    receivedAt: NOW,
    provenance: syntheticProvenance("referral/open-colectomy"),
    upperAbdominal: true,
    surgeryDurationBucket: ">3h",
  };
}

// ---------------------------------------------------------------------------
// External event payloads (delivered via simulation controls).
// ---------------------------------------------------------------------------
export const SYNTHETIC = {
  // DASI: score 26 → ≈3 METs — below the 4-MET threshold.
  // Frank is limited by exertional dyspnea and angina-equivalent discomfort.
  dasi: {
    score: 26,
    metsEstimate: 3.0,
  },

  // NT-proBNP: 480 pg/mL.
  // AHA/ACC 2024 perioperative threshold: ≥300 pg/mL = elevated risk.
  ntProBnp: {
    code: "33762-6",
    text: "Natriuretic peptide.B prohormone N-Terminal [Mass/volume]",
    value: 480,
    unit: "pg/mL",
  },

  // The trust-but-verify beat: conditional cardiology clearance.
  cardiologyLetter: {
    text: "Mr. Delgado evaluated. Stable ischemic heart disease, mid-LAD DES >12 months, no active ACS or decompensated HF. Cleared for proposed right hemicolectomy pending echocardiogram to evaluate LV function given NT-proBNP 480 pg/mL.",
    cleared: true,
    pendingEcho: true,
  },

  // Normal echo: closes the cardiology clearance loop.
  echo: {
    text: "Transthoracic echocardiogram: LVEF 55%, mild diastolic dysfunction (Grade 1), no regional wall motion abnormalities, no significant valvular disease. No structural contraindication to elective surgery.",
    normal: true,
  },

  // Transcript-derived medication discrepancy:
  // Empagliflozin (SGLT2i) active per patient — not in FHIR medication list.
  // Clinically significant: 3-4 day perioperative hold required (euglycemic DKA risk).
  medicationDiscrepancy: {
    med: "Empagliflozin (Jardiance) 10 mg PO daily — patient-reported in transcript; absent from structured medication list. SGLT2i: 3-4 day perioperative hold required.",
    discrepancy: true,
  },
};
