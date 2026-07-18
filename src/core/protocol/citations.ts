import type { Citation } from "../models";
import { GUIDELINE, PROTOCOL_VERSION } from "./version";

/**
 * A clinician-reviewed citation table. Every determination the engine makes
 * points at exactly one of these. The text is a paraphrase for the demo, not a
 * verbatim quote of the guideline.
 */
function c(
  section: string,
  text: string,
  classOfRecommendation?: string,
  levelOfEvidence?: string,
): Citation {
  return {
    guideline: GUIDELINE,
    version: PROTOCOL_VERSION,
    section,
    classOfRecommendation,
    levelOfEvidence,
    text,
  };
}

export const CITATIONS = {
  procedureClassification: c(
    "Procedure Risk Classification",
    "Colectomy is an intraperitoneal procedure and is classified as elevated-risk noncardiac surgery.",
  ),
  activeCardiac: c(
    "Active Cardiac Conditions",
    "Screen for acute coronary syndrome, decompensated heart failure, unstable arrhythmia, and severe symptomatic valvular disease before risk scoring. If present, defer and obtain cardiology evaluation.",
    "1",
    "B",
  ),
  rcri: c(
    "Perioperative Cardiac Risk — RCRI",
    "The Revised Cardiac Risk Index estimates perioperative major cardiac risk from six validated predictors.",
    "2a",
    "B",
  ),
  functionalCapacity: c(
    "Functional Capacity Assessment",
    "For elevated-risk surgery, assess functional capacity. When unknown, a validated tool such as DASI may be used before considering further testing.",
    "2a",
    "B",
  ),
  biomarker: c(
    "Preoperative Biomarkers (NT-proBNP/BNP)",
    "For patients ≥65, or with elevated RCRI, undergoing elevated-risk surgery with poor or unknown functional capacity, measuring NT-proBNP/BNP is reasonable to refine risk.",
    "2a",
    "B",
  ),
  specialistCardiology: c(
    "Specialist Consultation",
    "An abnormal preoperative biomarker warrants cardiology review to determine whether further evaluation is required.",
    "2a",
    "C",
  ),
  conditionalClearance: c(
    "Interpretation of Consultation Findings",
    "A consultation that recommends further testing does not satisfy the requirement; the recommended test becomes a new requirement.",
  ),
  echo: c(
    "Preoperative Echocardiography",
    "Resting echocardiography is reasonable when recommended by cardiology to evaluate ventricular function or valvular disease before elevated-risk surgery.",
    "2a",
    "B",
  ),
  medicationReconciliation: c(
    "Perioperative Medication Reconciliation",
    "Reconcile the medication list against the chart. Discrepancies require clinician review; do not generate hold instructions without clinician approval.",
    "1",
    "C",
  ),
  readyToSchedule: c(
    "Operational Readiness",
    "Operational requirements are complete when every blocking requirement has validated evidence and required approvals are recorded.",
  ),
} satisfies Record<string, Citation>;
