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
    "Intrathoracic and intraperitoneal procedures are elevated-risk; extremity/low-risk procedures do not require routine cardiac evaluation.",
  ),
  noTestingIndicated: c(
    "Routine Preoperative Testing — Class III (Harm)",
    "Routine preoperative cardiac testing is not recommended for patients undergoing low-risk surgery.",
    "3 (Harm)",
    "B-NR",
  ),
  pulmonaryFunctionTesting: c(
    "Pulmonary Function Testing Before Lung Resection",
    "Spirometry (FEV1, FVC) and DLCO measurement are required before lung resection to calculate predicted postoperative (ppo) values.",
  ),
  ppoCalculation: c(
    "Predicted Postoperative Lung Function",
    "ppo FEV1 and ppo DLCO are calculated from preoperative values and the fraction of lung function to be removed. Values < 40% predicted indicate elevated risk.",
  ),
  perfusionScan: c(
    "Quantitative V/Q Perfusion Scan",
    "When ppo FEV1 or ppo DLCO < 40% by anatomic calculation, quantitative perfusion scanning refines the estimate using actual lobar perfusion contribution.",
  ),
  cpet: c(
    "Cardiopulmonary Exercise Testing (CPET)",
    "CPET is indicated when ppo values remain < 40% after perfusion-corrected calculation. VO₂max 10–20 mL/kg/min = elevated perioperative pulmonary risk.",
  ),
  mdtReview: c(
    "Multidisciplinary Review for Elevated Pulmonary Risk",
    "VO₂max 10–20 mL/kg/min does not mandate cancellation but requires multidisciplinary review (thoracic surgery, pulmonology, anesthesia) and documented informed consent regarding perioperative risk.",
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
  ariscat: c(
    "ARISCAT Pulmonary Risk Score [non-authoritative, representative]",
    "The ARISCAT score (Canet et al., Anesthesiology 2010) stratifies postoperative pulmonary complication risk. Intermediate (26–44) or high (≥45) risk triggers a preoperative optimization bundle rather than additional diagnostic testing.",
  ),
} satisfies Record<string, Citation>;
