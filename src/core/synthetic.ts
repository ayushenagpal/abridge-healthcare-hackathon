/**
 * Synthetic augmentation for both demo cases.
 *
 * Case A — Eleanor Marsh, 71F, right upper lobectomy:
 *   Pulmonary + cardiac dual pathway, medication discrepancy (apixaban),
 *   conditional cardiology clearance, echocardiogrm.
 *
 * Case B — David Chen, 45M, arthroscopic meniscus repair:
 *   RCRI 0, excellent functional capacity, no testing indicated.
 *
 * Every item is marked source:"synthetic". Synthetic artifacts only supply
 * external events — the engine makes every clinical determination.
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

export function buildReferral(patientId: string, caseId: "A" | "B" = "A"): Referral {
  if (caseId === "B") {
    return {
      id: "referral-2",
      patientId,
      procedure: { text: "Left knee arthroscopic partial meniscectomy", snomedCode: "443435000" },
      urgency: "elective",
      indication: "Left medial meniscus tear confirmed on MRI. Conservative management failed.",
      referringProvider: "Dr. S. Kim, Orthopedic Surgery",
      receivedAt: NOW,
      provenance: syntheticProvenance("referral/arthroscopic-meniscectomy"),
    };
  }
  return {
    id: "referral-1",
    patientId,
    procedure: { text: "Right upper lobectomy", snomedCode: "173171007" },
    urgency: "elective",
    indication: "Stage IA2 NSCLC, right upper lobe. 1.8 cm adenocarcinoma on CT chest. Oncology recommends surgical resection.",
    referringProvider: "Dr. A. Osei, Thoracic Oncology",
    receivedAt: NOW,
    provenance: syntheticProvenance("referral/right-upper-lobectomy"),
  };
}

// ---------------------------------------------------------------------------
// Case A (Eleanor Marsh) — external event payloads
// ---------------------------------------------------------------------------
export const SYNTHETIC = {
  // DASI answers that score 3.0 METs — below 4-MET threshold.
  // Eleanor is severely limited by COPD exertional dyspnea.
  dasi: {
    score: 14.2,
    metsEstimate: 3.0,
  },

  // PFT results — FEV1 45% predicted, DLCO 41% predicted.
  pft: {
    fev1_L: 1.2,
    fev1_percentPredicted: 45,
    fvc_L: 2.07,
    fev1fvc_ratio: 0.58,
    dlco_percentPredicted: 41,
    // Anatomic ppo calculation (RUL = 3 of 18 segments = 16.7%)
    ppoFev1_percentPredicted: 37,
    ppoDlco_percentPredicted: 34,
    belowThreshold: true, // both < 40% → perfusion scan indicated
  },

  // Quantitative V/Q perfusion scan results.
  // RUL contributes 18% of total perfusion (vs 16.7% anatomic).
  perfusionScan: {
    rightUpperLobeFraction: 0.18,
    ppoFev1_percentPredicted: 36, // 1.2 × (1 - 0.18) / predicted = 36%
    ppoDlco_percentPredicted: 34, // 41% × (1 - 0.18) = 34%
    belowThreshold: true, // still < 40% → CPET indicated
  },

  // CPET result — VO₂max 13 mL/kg/min (elevated risk range: 10–20).
  cpet: {
    vo2max_mL_kg_min: 13,
    peakWorkload_W: 65,
    ve_vco2_slope: 38,
    riskCategory: "elevated", // 10–20 range → elevated perioperative pulmonary risk
  },

  // Elevated NT-proBNP (cardiac spine).
  ntProBnp: {
    code: "33762-6",
    text: "Natriuretic peptide.B prohormone N-Terminal [Mass/volume]",
    value: 890,
    unit: "pg/mL",
  },

  // Conditional cardiology clearance — the trust-but-verify beat.
  cardiologyLetter: {
    text: "Ms. Marsh has been evaluated. She has paroxysmal atrial fibrillation, hypertension, and an NT-proBNP of 890 pg/mL. There is no documented ischemic heart disease or decompensated heart failure. From a cardiac standpoint she is cleared for the proposed right upper lobectomy, pending echocardiogram to evaluate for structural heart disease given the elevated NT-proBNP.",
    cleared: true,
    pendingEcho: true,
  },

  // Normal echo — closes the cardiology clearance loop.
  echo: {
    text: "Transthoracic echocardiogram: LVEF 62%, no regional wall motion abnormalities, no significant valvular disease, grade 1 diastolic dysfunction.",
    normal: true,
  },

  // Transcript-derived medication discrepancy:
  // Eleanor mentions active apixaban; FHIR shows it DISCONTINUED 8 months ago.
  medicationDiscrepancy: {
    med: "Apixaban (Eliquis) 5mg BID — patient reports taking for atrial fibrillation; FHIR shows DISCONTINUED",
    discrepancy: true,
  },
};

// ---------------------------------------------------------------------------
// Case B (David Chen) — no external events needed; engine resolves immediately.
// ---------------------------------------------------------------------------
export const SYNTHETIC_B = {
  // David is healthy, no medications, low-risk procedure.
  // The engine will short-circuit to ready-to-schedule after referral.
  // No sim buttons needed beyond Start Referral + Final Approval.
  demoNote: "Case B resolves immediately — RCRI 0, excellent functional capacity, low-risk procedure.",
};
