/**
 * ARISCAT (Assess Respiratory Risk in Surgical Patients in Catalonia) score.
 *
 * For NON-resection elevated-risk surgery. This module fires in parallel with
 * the cardiac spine when a patient has pulmonary comorbidity and the procedure
 * is not a lung resection. The resection pathway (ppo/perfusion/CPET) remains
 * separate and is kept for future lobectomy cases.
 *
 * When risk is intermediate or high, this module emits an OPTIMIZATION BUNDLE
 * — not more diagnostic testing. The key demonstration is that the pulmonary
 * agentic behavior is: stratify → optimize proactively (non-blocking). This
 * contrasts with the cardiac track, which is: stratify → escalate → clearance
 * (blocking).
 *
 * Source: Canet J et al. "Prediction of Postoperative Pulmonary Complications
 * in a Population-based Surgical Cohort." Anesthesiology. 2010;113(6):1338-1350.
 * (ARISCAT validation study.) This implementation is representative of published
 * pulmonary risk stratification strategies and is labeled non-authoritative —
 * no single score should replace clinical judgment.
 *
 * NO imports from ../agent or any LLM SDK. This module is deterministic.
 */
import type { Citation, Requirement } from "../models";

// ---------------------------------------------------------------------------
// Citation (non-authoritative, representative of published strategy).
// ---------------------------------------------------------------------------
export const ARISCAT_CITATION: Citation = {
  guideline:
    "Canet J et al. — ARISCAT Pulmonary Risk Score (Anesthesiology 2010) [non-authoritative, representative]",
  version: "ariscat-demo-v1",
  section: "Postoperative Pulmonary Complication Risk Stratification",
  classOfRecommendation: undefined,
  levelOfEvidence: undefined,
  text:
    "The ARISCAT score stratifies postoperative pulmonary complication risk from seven additive components. Intermediate (26-44) or high (≥45) risk triggers a preoperative optimization bundle: incentive spirometry, inhaler optimization, smoking cessation, chest physiotherapy/breathing exercises, and prehabilitation where time permits. This is a single-source, non-guideline-endorsed tool used here for illustrative purposes.",
};

const OPTIMIZATION_CITATION: Citation = {
  guideline:
    "Canet J et al. — ARISCAT Pulmonary Risk Score (Anesthesiology 2010) [non-authoritative, representative]",
  version: "ariscat-demo-v1",
  section: "Preoperative Pulmonary Optimization Bundle",
  text:
    "For intermediate/high ARISCAT risk, the recommended intervention is NOT more diagnostic testing but proactive optimization: incentive spirometry education, maximal inhaler therapy with technique check, smoking cessation referral, chest physiotherapy/breathing exercise instruction, and prehabilitation where the timeline allows. Tier 1 actions (education, technique check, exercise instruction) may be initiated without clinician approval. Tier 2 actions (formal referrals) require clinician sign-off.",
};

// ---------------------------------------------------------------------------
// Score components and weights (Canet et al. Table 3).
// ---------------------------------------------------------------------------

export interface AriscatInputs {
  ageYears: number;
  spo2Percent: number | undefined; // latest preoperative SpO₂
  recentRespiratoryInfection: boolean; // within last month
  hemoglobin_g_dl: number | undefined; // for anemia check (≤10 g/dL)
  upperAbdominalOrIntrathoracicIncision: boolean;
  surgeryDurationBucket: "<2h" | "2-3h" | ">3h" | undefined;
  isEmergency: boolean;
}

export interface AriscatResult {
  score: number;
  risk: "low" | "intermediate" | "high";
  components: {
    key: string;
    label: string;
    points: number;
    present: boolean;
    value?: string;
  }[];
  requirements: Requirement[];
  citation: Citation;
}

function agePoints(years: number): { points: number; label: string } {
  if (years > 80) return { points: 16, label: "Age > 80 (16 pts)" };
  if (years >= 51) return { points: 3, label: "Age 51–80 (3 pts)" };
  return { points: 0, label: "Age < 50 (0 pts)" };
}

function spo2Points(spo2: number | undefined): { points: number; label: string } {
  if (spo2 == null) return { points: 0, label: "SpO₂ unknown (0 pts assumed)" };
  if (spo2 <= 90) return { points: 24, label: `SpO₂ ≤ 90% (24 pts)` };
  if (spo2 <= 95) return { points: 8, label: `SpO₂ 91–95% (8 pts)` };
  return { points: 0, label: `SpO₂ ≥ 96% (0 pts)` };
}

function durationPoints(bucket: "<2h" | "2-3h" | ">3h" | undefined): { points: number; label: string } {
  if (bucket === ">3h") return { points: 23, label: "Duration > 3h (23 pts)" };
  if (bucket === "2-3h") return { points: 16, label: "Duration 2–3h (16 pts)" };
  return { points: 0, label: "Duration < 2h or unknown (0 pts)" };
}

// ---------------------------------------------------------------------------
// Core scoring function (pure, deterministic).
// ---------------------------------------------------------------------------
export function evaluateAriscat(inputs: AriscatInputs): AriscatResult {
  const age = agePoints(inputs.ageYears);
  const spo2 = spo2Points(inputs.spo2Percent);
  const respInfection = inputs.recentRespiratoryInfection;
  const anemia =
    inputs.hemoglobin_g_dl != null && inputs.hemoglobin_g_dl <= 10;
  const incision = inputs.upperAbdominalOrIntrathoracicIncision;
  const duration = durationPoints(inputs.surgeryDurationBucket);
  const emergency = inputs.isEmergency;

  const components = [
    {
      key: "age",
      label: age.label,
      points: age.points,
      present: age.points > 0,
      value: `${inputs.ageYears} years`,
    },
    {
      key: "spo2",
      label: spo2.label,
      points: spo2.points,
      present: spo2.points > 0,
      value: inputs.spo2Percent != null ? `${inputs.spo2Percent}%` : "unknown",
    },
    {
      key: "respiratory-infection",
      label: respInfection
        ? "Respiratory infection last month (17 pts)"
        : "No recent respiratory infection (0 pts)",
      points: respInfection ? 17 : 0,
      present: respInfection,
    },
    {
      key: "anemia",
      label: anemia
        ? `Preoperative anemia Hb ≤ 10 g/dL (11 pts)`
        : `Hb > 10 g/dL — no anemia (0 pts)`,
      points: anemia ? 11 : 0,
      present: anemia,
      value:
        inputs.hemoglobin_g_dl != null
          ? `${inputs.hemoglobin_g_dl} g/dL`
          : "unknown",
    },
    {
      key: "incision",
      label: incision
        ? "Upper abdominal or intrathoracic incision (15 pts)"
        : "Peripheral incision (0 pts)",
      points: incision ? 15 : 0,
      present: incision,
    },
    {
      key: "duration",
      label: duration.label,
      points: duration.points,
      present: duration.points > 0,
    },
    {
      key: "emergency",
      label: emergency
        ? "Emergency procedure (8 pts)"
        : "Elective procedure (0 pts)",
      points: emergency ? 8 : 0,
      present: emergency,
    },
  ];

  const score = components.reduce((sum, c) => sum + c.points, 0);
  const risk: "low" | "intermediate" | "high" =
    score >= 45 ? "high" : score >= 26 ? "intermediate" : "low";

  const requirements = buildRequirements(score, risk);

  return { score, risk, components, requirements, citation: ARISCAT_CITATION };
}

// ---------------------------------------------------------------------------
// Optimization bundle requirements.
//
// These are NON-BLOCKING: they don't gate the "Ready To Schedule" node.
// They represent proactive work the Navigator performs in parallel while the
// cardiac spine awaits clearance — demonstrating the two distinct agentic
// behaviors: cardiac = escalate-and-wait; pulmonary = optimize-proactively.
// ---------------------------------------------------------------------------
function req(
  id: string,
  title: string,
  detail: string,
  tier: 1 | 2,
): Requirement {
  return {
    id,
    title,
    detail,
    status: "missing",
    dependencies: ["ariscat-risk"],
    owner: tier === 1 ? "system" : "clinician",
    acceptableEvidence: tier === 1
      ? ["Education documented", "Action confirmed"]
      : ["Referral confirmed", "Clinician approval"],
    attachedEvidence: [],
    guidelineReference: OPTIMIZATION_CITATION,
    requiresClinicianApproval: tier === 2,
    blocksScheduling: false, // optimization bundle never blocks scheduling
    generatedByRule: "ariscat-optimization",
  };
}

function buildRequirements(score: number, risk: "low" | "intermediate" | "high"): Requirement[] {
  if (risk === "low") return [];

  return [
    req(
      "pulm-opt-incentive-spirometry",
      "Incentive Spirometry",
      "Teach preoperative technique; prescribe for postoperative use. Document instruction given.",
      1,
    ),
    req(
      "pulm-opt-inhaler-optimization",
      "Inhaler Optimization",
      "Confirm LAMA + LABA/ICS regimen is maximal and patient technique is correct. Address any gaps.",
      1,
    ),
    req(
      "pulm-opt-smoking-cessation",
      "Smoking Cessation Referral",
      "Refer to cessation program. Even brief preoperative cessation reduces pulmonary complications. Clinician approval required.",
      2,
    ),
    req(
      "pulm-opt-chest-pt",
      "Chest Physiotherapy & Breathing Exercises",
      "Instruct in diaphragmatic breathing, cough technique, and early mobility plan. Document education.",
      1,
    ),
    ...(risk === "high"
      ? [
          req(
            "pulm-opt-prehabilitation",
            "Prehabilitation Referral",
            `ARISCAT score ${score} (high risk ≥45). Where surgical timeline permits, refer for structured prehabilitation to improve functional reserve. Clinician approval required.`,
            2,
          ),
        ]
      : []),
  ];
}
