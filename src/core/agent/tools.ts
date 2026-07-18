/**
 * Agent tools. Every tool is typed, idempotent, logged, and auditable. Draft
 * tools NEVER execute the order/referral — they create a pending ClinicianReview
 * in the approval queue. Tools mutate operational state only (state.ops,
 * state.clinicianDecisions); they never mutate clinical facts or the graph.
 */
import type { ClinicianReview, PatientState } from "../models";
import { NOW } from "../synthetic";
import type { Candidate } from "./types";

export interface ToolResult {
  status: "ok" | "blocked" | "error";
  output: string;
  patientMessage?: string;
  emittedEventType?: string;
  review?: ClinicianReview;
}

let reviewSeq = 0;
function reviewId() {
  reviewSeq += 1;
  return `review-${reviewSeq}`;
}

export function runTool(state: PatientState, candidate: Candidate): ToolResult {
  const { tool, args } = candidate;

  switch (tool) {
    case "searchChart":
    case "searchExistingEvidence": {
      const query = String(args.query ?? "");
      return {
        status: "ok",
        output: `Searched chart and outside records for "${query}" — no acceptable existing evidence found.`,
      };
    }

    case "sendPatientQuestionnaire": {
      state.ops.dasiSent = true;
      return {
        status: "ok",
        output: "DASI questionnaire sent to patient (SMS).",
        patientMessage:
          "Please complete this short questionnaire about your daily activities so we can plan your surgery.",
        emittedEventType: "PATIENT_MESSAGE",
      };
    }

    case "draftOrder": {
      const order = String(args.order ?? "order");
      if (order === "NT-proBNP") state.ops.biomarkerOrderDrafted = true;
      const review: ClinicianReview = {
        id: reviewId(),
        subject: "order",
        requirementId: String(args.requirementId),
        title: `${order} order`,
        draft: {
          order,
          rationale:
            order === "NT-proBNP"
              ? "Elevated RCRI with below-threshold functional capacity."
              : "Recommended by cardiology.",
        },
        decision: "pending",
      };
      state.clinicianDecisions.push(review);
      return {
        status: "ok",
        output: `Drafted ${order} order → clinician approval queue.`,
        review,
      };
    }

    case "draftReferral": {
      const reqId = String(args.requirementId ?? "");
      const specialty = String(args.specialty ?? "Specialist");
      // Set the correct ops flag based on which requirement this referral targets.
      if (reqId === "cardiology-review") state.ops.cardiologyReferralDrafted = true;
      else if (reqId === "pulm-opt-smoking-cessation") state.ops.pulmOptSmokingCessationDrafted = true;
      else if (reqId === "pulm-opt-prehabilitation") state.ops.pulmOptPrehabDrafted = true;

      const referralDetails: Record<string, { reason: string; requiredEvidence: string }> = {
        "cardiology-review": {
          reason: "Elevated preoperative NT-proBNP. Please evaluate for structural or functional cardiac disease and provide perioperative clearance.",
          requiredEvidence: "Consultation note with clearance determination and any recommended further testing.",
        },
        "pulm-opt-smoking-cessation": {
          reason: `Current smoker (~30 pack-years) with ARISCAT high-risk score undergoing elective open colectomy. Preoperative smoking cessation reduces postoperative pulmonary complication risk. Referral for structured cessation support.`,
          requiredEvidence: "Enrollment confirmation or cessation plan documentation.",
        },
        "pulm-opt-prehabilitation": {
          reason: `ARISCAT high-risk score (≥45). Patient has moderate COPD and poor functional capacity (DASI ≈ 3 METs). Structured prehabilitation to improve cardiorespiratory reserve before elective open colectomy.`,
          requiredEvidence: "Prehabilitation program enrollment and baseline assessment.",
        },
      };
      const details = referralDetails[reqId] ?? {
        reason: `Preoperative specialist evaluation required.`,
        requiredEvidence: "Consultation note.",
      };

      const review: ClinicianReview = {
        id: reviewId(),
        subject: "referral",
        requirementId: reqId,
        title: `${specialty} referral`,
        draft: { specialty, ...details },
        decision: "pending",
      };
      state.clinicianDecisions.push(review);
      return {
        status: "ok",
        output: `Drafted ${specialty} referral → clinician approval queue.`,
        review,
      };
    }

    case "performOptimization": {
      const optType = String(args.optimizationType ?? "");
      const reqId = String(args.requirementId ?? "");
      let output = "";
      let patientMessage: string | undefined;

      switch (optType) {
        case "incentive-spirometry":
          state.ops.pulmOptIncentiveSpiro = true;
          output = "Incentive spirometry: patient education provided. Technique demonstrated. Device prescribed — patient to use q1h while awake postoperatively.";
          patientMessage = "Before your surgery: practice using your incentive spirometer 10 times every hour while awake. After surgery, this helps prevent lung complications. A device will be provided.";
          break;
        case "inhaler-optimization": {
          state.ops.pulmOptInhalerChecked = true;
          // Find current inhalers from chart to include in the output.
          const currentInhalers = state.medications
            .filter((m) => {
              const t = m.text.toLowerCase();
              return t.includes("tiotropium") || t.includes("fluticasone") || t.includes("salmeterol") ||
                t.includes("albuterol") || t.includes("spiriva") || t.includes("advair") ||
                t.includes("budesonide") || t.includes("formoterol") || t.includes("inhaler");
            })
            .map((m) => m.text.split(" ").slice(0, 2).join(" "));
          const regimen = currentInhalers.length > 0
            ? `Current regimen: ${currentInhalers.join("; ")}. LAMA + ICS/LABA combination confirmed — maximal maintenance therapy in place.`
            : "No inhalers found in chart. Recommend initiating LAMA + LABA/ICS therapy given GOLD 2 COPD.";
          output = `Inhaler regimen reviewed. ${regimen} Technique assessment and adherence counseling to be performed at pre-op visit.`;
          break;
        }
        case "chest-pt":
          state.ops.pulmOptChestPt = true;
          output = "Chest physiotherapy: diaphragmatic breathing technique, effective cough technique, and early mobilization plan instructed. Patient verbalized understanding.";
          patientMessage = "Before your surgery: practice taking slow, deep breaths 10 times every hour. After surgery, you'll be encouraged to sit up and walk as soon as possible — this is one of the most important things you can do to prevent lung problems.";
          break;
        default:
          output = `Optimization action performed for ${reqId}.`;
      }
      return { status: "ok", output, patientMessage };
    }

    case "draftMedicationTimeline": {
      const review: ClinicianReview = {
        id: reviewId(),
        subject: "medication-timeline",
        requirementId: String(args.requirementId),
        title: "Perioperative medication timeline",
        draft: {
          note: "Reconciliation flagged patient-reported empagliflozin (Jardiance, SGLT2i) absent from structured medication list. SGLT2i requires 3-4 day perioperative hold (euglycemic DKA risk). Timeline drafted for review — no hold instructions applied automatically.",
        },
        decision: "pending",
      };
      state.clinicianDecisions.push(review);
      return {
        status: "ok",
        output: "Drafted perioperative medication timeline → clinician approval queue.",
        review,
      };
    }

    case "requestClinicianApproval": {
      const review: ClinicianReview = {
        id: reviewId(),
        subject: "final",
        requirementId: String(args.requirementId),
        title: "Final scheduling approval",
        draft: { note: "All blocking requirements satisfied with validated evidence." },
        decision: "pending",
      };
      state.clinicianDecisions.push(review);
      return {
        status: "ok",
        output: "Requested final clinician approval → clinician approval queue.",
        review,
      };
    }

    case "markReadyToSchedule": {
      state.ops.readyMarked = true;
      return {
        status: "ok",
        output: "Operational requirements complete → READY TO SCHEDULE. Final readiness packet generated.",
        emittedEventType: "READY_TO_SCHEDULE",
      };
    }

    default:
      return { status: "error", output: `Unknown tool: ${tool}` };
  }
}

export const AUDIT_NOW = NOW;
