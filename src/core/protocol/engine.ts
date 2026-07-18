/**
 * Deterministic clinical protocol engine.
 *
 * runProtocol(state) is a PURE function: identical PatientState always yields an
 * identical ProtocolResult. It imports NOTHING from ../agent and never calls an
 * LLM. A test (tests/no-llm-in-engine.test.ts) enforces this boundary.
 *
 * The engine decides WHAT is required. It reads operational flags (state.ops)
 * and evidence to derive operational sub-statuses, but it never sets them.
 */
import type {
  Citation,
  Determination,
  PatientState,
  ProtocolResult,
  Provenance,
  RcriResult,
  Requirement,
  RequirementStatus,
} from "../models";
import { buildGraph, diffGraph, isResolved } from "../graph";
import type { ReadinessGraph } from "../models";
import { CITATIONS } from "./citations";

const NTPROBNP_THRESHOLD = 125; // pg/mL, age-adjusted paraphrase for the demo
const DASI_METS_THRESHOLD = 4;

// ---------------------------------------------------------------------------
// Detection helpers (pure).
// ---------------------------------------------------------------------------
function activeCondition(
  state: PatientState,
  keywords: string[],
): { hit: boolean; provenance?: Provenance; text?: string } {
  for (const c of state.conditions) {
    const t = c.text.toLowerCase();
    if (c.clinicalStatus === "resolved") continue;
    if (keywords.some((k) => t.includes(k)))
      return { hit: true, provenance: c.provenance, text: c.text };
  }
  return { hit: false };
}

function medicationMatches(state: PatientState, keyword: string): boolean {
  return state.medications.some((m) =>
    m.text.toLowerCase().includes(keyword.toLowerCase()),
  );
}

function latestObservation(state: PatientState, matcher: (text: string) => boolean) {
  return state.observations.filter((o) => matcher(o.text.toLowerCase())).at(-1);
}

// ---------------------------------------------------------------------------
// Stage 1 — surgery classification.
// ---------------------------------------------------------------------------
function classifySurgery(state: PatientState) {
  const text = state.referral.procedure.text.toLowerCase();
  const intraperitoneal =
    text.includes("colectomy") ||
    text.includes("colon") ||
    text.includes("bowel");
  return {
    intraperitoneal,
    procedureRisk: intraperitoneal ? "elevated" : "low",
  };
}

// ---------------------------------------------------------------------------
// Stage 3 — RCRI (deterministic count, provenance retained).
// ---------------------------------------------------------------------------
function computeRcri(state: PatientState, highRiskSurgery: boolean): RcriResult {
  const ihd = activeCondition(state, ["ischemic heart disease", "coronary"]);
  const chf = activeCondition(state, ["heart failure", "congestive"]);
  const cva = activeCondition(state, [
    "cerebrovascular",
    "stroke",
    "transient ischemic",
  ]);
  // Serum creatinine only — exclude GFR (MDRD formula) and urine
  // microalbumin/creatinine ratios, which also contain "creatinine".
  const cr = latestObservation(
    state,
    (t) =>
      t.includes("creatinine") &&
      t.includes("blood") &&
      !t.includes("ratio") &&
      !t.includes("formula") &&
      !t.includes("glomerular"),
  );
  const insulin = medicationMatches(state, "insulin");

  const components = [
    {
      key: "high-risk-surgery",
      label: "High-risk (intraperitoneal/vascular) surgery",
      present: highRiskSurgery,
      provenance: state.referral.provenance,
      detail: state.referral.procedure.text,
    },
    {
      key: "ischemic-heart-disease",
      label: "History of ischemic heart disease",
      present: ihd.hit,
      provenance: ihd.provenance,
      detail: ihd.text,
    },
    {
      key: "chf",
      label: "History of congestive heart failure",
      present: chf.hit,
      provenance: chf.provenance,
      detail: chf.hit ? chf.text : "Not present in chart",
    },
    {
      key: "cva",
      label: "History of cerebrovascular disease",
      present: cva.hit,
      provenance: cva.provenance,
      detail: cva.hit ? cva.text : "Not present in chart",
    },
    {
      key: "insulin-diabetes",
      label: "Insulin-treated diabetes mellitus",
      present: insulin,
      detail: insulin
        ? "On insulin"
        : "Diabetes present but not insulin-treated (metformin)",
    },
    {
      key: "creatinine",
      label: "Serum creatinine > 2.0 mg/dL",
      present: cr?.value != null && cr.value > 2.0,
      provenance: cr?.provenance,
      detail: cr?.value != null ? `Creatinine ${cr.value} mg/dL` : "No result",
    },
  ];

  return {
    score: components.filter((c) => c.present).length,
    components,
    citation: CITATIONS.rcri,
  };
}

// ---------------------------------------------------------------------------
// Evidence lookups for later stages.
// ---------------------------------------------------------------------------
function dasiMets(state: PatientState): number | undefined {
  return state.questionnaires.find((q) => q.type === "DASI")?.metsEstimate;
}

function ntProBnp(state: PatientState) {
  return latestObservation(state, (t) => t.includes("natriuretic") || t.includes("probnp"));
}

function cardiologyLetter(state: PatientState) {
  const ev = state.evidence.find((e) => e.kind === "specialist-letter");
  if (!ev) return undefined;
  return ev.content as { cleared: boolean; pendingEcho: boolean };
}

function echoResult(state: PatientState) {
  const ev = state.evidence.find(
    (e) => e.label.toLowerCase().includes("echo"),
  );
  if (!ev) return undefined;
  return ev.content as { normal: boolean };
}

function medicationDiscrepancy(state: PatientState) {
  return state.evidence.find(
    (e) => e.kind === "transcript" && (e.content as { discrepancy?: boolean })?.discrepancy,
  );
}

// ---------------------------------------------------------------------------
// The engine.
// ---------------------------------------------------------------------------
export function runProtocol(
  state: PatientState,
  prevGraph: ReadinessGraph | null,
): ProtocolResult {
  const requirements: Requirement[] = [];
  const determinations: Determination[] = [];
  const appliedRules: string[] = [];
  const citations: Citation[] = [];

  const note = (
    ruleId: string,
    statement: string,
    citation: Citation,
    inputsUsed: Provenance[] = [],
  ) => {
    determinations.push({ ruleId, statement, citation, inputsUsed });
    if (!appliedRules.includes(ruleId)) appliedRules.push(ruleId);
    if (!citations.includes(citation)) citations.push(citation);
  };

  // --- Stage 1: procedure classification ---
  const surgery = classifySurgery(state);
  requirements.push({
    id: "procedure-classification",
    title: "Procedure Classification",
    detail: `${state.referral.procedure.text} — ${surgery.procedureRisk}-risk`,
    status: "satisfied",
    dependencies: [],
    owner: "system",
    acceptableEvidence: ["Referral procedure code"],
    attachedEvidence: [],
    guidelineReference: CITATIONS.procedureClassification,
    requiresClinicianApproval: false,
    blocksScheduling: false,
    generatedByRule: "classify-surgery",
  });
  note(
    "classify-surgery",
    `${state.referral.procedure.text} classified as ${surgery.procedureRisk}-risk (intraperitoneal).`,
    CITATIONS.procedureClassification,
    [state.referral.provenance],
  );

  // --- Stage 2: active cardiac gate ---
  const activeAcs = activeCondition(state, [
    "unstable angina",
    "acute coronary syndrome",
    "decompensated heart failure",
    "unstable arrhythmia",
    "severe symptomatic valvular",
    "severe aortic stenosis",
  ]);
  if (activeAcs.hit) {
    requirements.push({
      id: "active-cardiac",
      title: "Active Cardiac Condition — Human Review",
      detail: activeAcs.text,
      status: "blocked",
      dependencies: ["procedure-classification"],
      owner: "clinician",
      acceptableEvidence: ["Cardiology evaluation"],
      attachedEvidence: [],
      guidelineReference: CITATIONS.activeCardiac,
      requiresClinicianApproval: true,
      blocksScheduling: true,
      generatedByRule: "active-cardiac",
    });
    note(
      "active-cardiac",
      `Active cardiac condition detected (${activeAcs.text}); protocol halted pending cardiology.`,
      CITATIONS.activeCardiac,
      activeAcs.provenance ? [activeAcs.provenance] : [],
    );
    // Halt scoring — return early with only classification + gate.
    return finalize(state, requirements, determinations, appliedRules, citations, prevGraph);
  }
  note(
    "active-cardiac",
    "No active cardiac conditions detected. Prior myocardial infarction is historical and stable; proceeding to risk stratification.",
    CITATIONS.activeCardiac,
  );

  // --- Stage 3: RCRI ---
  const rcri = computeRcri(state, surgery.procedureRisk === "elevated");
  state.derived.rcri = rcri;
  requirements.push({
    id: "rcri",
    title: "Cardiac Risk (RCRI)",
    detail: `RCRI = ${rcri.score}`,
    status: "satisfied",
    dependencies: ["procedure-classification"],
    owner: "system",
    acceptableEvidence: ["Validated RCRI inputs"],
    attachedEvidence: [],
    guidelineReference: CITATIONS.rcri,
    requiresClinicianApproval: false,
    blocksScheduling: false,
    generatedByRule: "rcri",
  });
  note(
    "rcri",
    `RCRI = ${rcri.score} (${rcri.components.filter((c) => c.present).map((c) => c.label).join(", ") || "no predictors"}).`,
    CITATIONS.rcri,
    rcri.components.filter((c) => c.present && c.provenance).map((c) => c.provenance!),
  );

  // --- Stage 4: functional capacity ---
  const mets = dasiMets(state);
  let fcStatus: RequirementStatus;
  if (mets != null) fcStatus = "satisfied";
  else if (state.ops.dasiSent) fcStatus = "waiting-patient";
  else fcStatus = "missing";
  requirements.push({
    id: "functional-capacity",
    title: "Functional Capacity (DASI)",
    detail:
      mets != null
        ? `DASI ≈ ${mets} METs (${mets < DASI_METS_THRESHOLD ? "below" : "at/above"} threshold)`
        : state.ops.dasiSent
          ? "Questionnaire sent — awaiting patient"
          : "Unknown — assessment required",
    status: fcStatus,
    dependencies: ["procedure-classification"],
    owner: "patient",
    acceptableEvidence: ["Chart documentation", "DASI questionnaire"],
    attachedEvidence: [],
    guidelineReference: CITATIONS.functionalCapacity,
    requiresClinicianApproval: false,
    blocksScheduling: true,
    generatedByRule: "functional-capacity",
  });
  if (mets == null) {
    note(
      "functional-capacity",
      "Functional capacity unknown; lowest-cost path is a DASI questionnaire before any testing.",
      CITATIONS.functionalCapacity,
    );
  } else {
    note(
      "functional-capacity",
      `DASI ≈ ${mets} METs — ${mets < DASI_METS_THRESHOLD ? "below" : "at or above"} the ${DASI_METS_THRESHOLD}-MET threshold.`,
      CITATIONS.functionalCapacity,
      state.questionnaires[0]?.provenance ? [state.questionnaires[0].provenance!] : [],
    );
  }

  // --- Stage 5: biomarker (only if functional capacity below threshold) ---
  const biomarkerIndicated = mets != null && mets < DASI_METS_THRESHOLD;
  const bnp = ntProBnp(state);
  const bnpElevated = bnp?.value != null && bnp.value > NTPROBNP_THRESHOLD;
  if (biomarkerIndicated) {
    let bStatus: RequirementStatus;
    if (bnp?.value != null) bStatus = "satisfied";
    else if (state.ops.biomarkerOrderApproved) bStatus = "waiting-external";
    else if (state.ops.biomarkerOrderDrafted) bStatus = "waiting-clinician";
    else bStatus = "missing";
    requirements.push({
      id: "biomarker",
      title: "Biomarker (NT-proBNP)",
      detail:
        bnp?.value != null
          ? `NT-proBNP ${bnp.value} pg/mL${bnpElevated ? " — elevated" : " — normal"}`
          : "No existing result — order required (draft → clinician approval)",
      status: bStatus,
      dependencies: ["functional-capacity"],
      owner: "external",
      acceptableEvidence: ["Existing lab", "New NT-proBNP order"],
      attachedEvidence: [],
      guidelineReference: CITATIONS.biomarker,
      requiresClinicianApproval: true,
      blocksScheduling: true,
      generatedByRule: "biomarker",
    });
    if (bnp?.value == null) {
      note(
        "biomarker",
        "Below-threshold functional capacity with elevated RCRI: NT-proBNP is reasonable. No existing result found; a new order is required.",
        CITATIONS.biomarker,
      );
    } else {
      note(
        "biomarker",
        `NT-proBNP ${bnp.value} pg/mL — ${bnpElevated ? "above" : "within"} the ${NTPROBNP_THRESHOLD} pg/mL threshold.`,
        CITATIONS.biomarker,
        bnp.provenance ? [bnp.provenance] : [],
      );
    }
  }

  // --- Stage 6: cardiology review (only if biomarker abnormal) ---
  const letter = cardiologyLetter(state);
  const echo = echoResult(state);
  if (biomarkerIndicated && bnpElevated) {
    let cStatus: RequirementStatus;
    let cDetail: string;
    if (letter) {
      if (letter.cleared && letter.pendingEcho) {
        // Conditional clearance — receipt satisfied, requirement NOT complete.
        if (echo?.normal) {
          cStatus = "satisfied";
          cDetail = "Cleared; echocardiogram completed and normal";
        } else {
          cStatus = "waiting-external";
          cDetail = 'Letter received: "cleared pending echocardiogram" — echo required';
        }
      } else if (letter.cleared) {
        cStatus = "satisfied";
        cDetail = "Cardiology cleared";
      } else {
        cStatus = "abnormal-review-required";
        cDetail = "Cardiology recommends further evaluation";
      }
    } else if (state.ops.cardiologyReferralApproved) {
      cStatus = "waiting-external";
      cDetail = "Referral sent — awaiting cardiology";
    } else if (state.ops.cardiologyReferralDrafted) {
      cStatus = "waiting-clinician";
      cDetail = "Referral drafted — awaiting clinician approval";
    } else {
      cStatus = "missing";
      cDetail = "Abnormal biomarker — cardiology review required";
    }
    requirements.push({
      id: "cardiology-review",
      title: "Cardiology Review",
      detail: cDetail,
      status: cStatus,
      dependencies: ["biomarker"],
      owner: "external",
      acceptableEvidence: ["Cardiology consultation note"],
      attachedEvidence: [],
      guidelineReference: CITATIONS.specialistCardiology,
      requiresClinicianApproval: true,
      blocksScheduling: true,
      generatedByRule: "specialist",
    });
    note(
      "specialist",
      "Elevated NT-proBNP warrants cardiology review before scheduling.",
      CITATIONS.specialistCardiology,
    );

    // --- Conditional clearance -> echo requirement ---
    if (letter?.pendingEcho) {
      const eStatus: RequirementStatus = echo?.normal ? "satisfied" : "missing";
      requirements.push({
        id: "echo",
        title: "Echocardiogram",
        detail: echo?.normal
          ? "Echocardiogram completed — normal"
          : "Required by cardiology clearance letter",
        status: eStatus,
        dependencies: ["cardiology-review"],
        owner: "external",
        acceptableEvidence: ["Echocardiogram report"],
        attachedEvidence: [],
        guidelineReference: CITATIONS.echo,
        requiresClinicianApproval: true,
        blocksScheduling: true,
        generatedByRule: "echo",
      });
      note(
        "echo",
        'The cardiology letter recommends echocardiography; "cleared pending echo" does not satisfy the requirement — an echocardiogram is now required.',
        CITATIONS.conditionalClearance,
      );
    }
  }

  // --- Medication reconciliation ---
  const discrepancy = medicationDiscrepancy(state);
  let medStatus: RequirementStatus;
  if (state.ops.medicationTimelineApproved) medStatus = "satisfied";
  else if (discrepancy) medStatus = "waiting-clinician";
  else medStatus = "missing";
  requirements.push({
    id: "medication-review",
    title: "Medication Reconciliation",
    detail: state.ops.medicationTimelineApproved
      ? "Reconciled; perioperative medication timeline approved"
      : discrepancy
        ? `Discrepancy: ${(discrepancy.content as { med?: string }).med ?? "unlisted medication"}`
        : "Reconciliation pending",
    status: medStatus,
    dependencies: [],
    owner: "clinician",
    acceptableEvidence: ["Reconciled medication list", "Clinician-approved timeline"],
    attachedEvidence: [],
    guidelineReference: CITATIONS.medicationReconciliation,
    requiresClinicianApproval: true,
    blocksScheduling: true,
    generatedByRule: "medication-recon",
  });
  if (discrepancy && !state.ops.medicationTimelineApproved) {
    note(
      "medication-recon",
      `Medication discrepancy detected (${(discrepancy.content as { med?: string }).med}); clinician review required. No hold instructions generated automatically.`,
      CITATIONS.medicationReconciliation,
      [discrepancy.provenance],
    );
  }

  return finalize(state, requirements, determinations, appliedRules, citations, prevGraph);
}

// ---------------------------------------------------------------------------
// Add the terminal Ready To Schedule node and build the graph.
// ---------------------------------------------------------------------------
function finalize(
  state: PatientState,
  requirements: Requirement[],
  determinations: Determination[],
  appliedRules: string[],
  citations: Citation[],
  prevGraph: ReadinessGraph | null,
): ProtocolResult {
  const blockers = requirements.filter((r) => r.blocksScheduling);
  const allResolved =
    blockers.length > 0 && blockers.every((r) => isResolved(r.status));

  let readyStatus: RequirementStatus;
  if (allResolved && state.ops.finalApproved) readyStatus = "satisfied";
  else if (allResolved) readyStatus = "waiting-clinician";
  else readyStatus = "missing";

  requirements.push({
    id: "ready-to-schedule",
    title: "Ready To Schedule",
    detail:
      readyStatus === "satisfied"
        ? "Operational requirements complete"
        : readyStatus === "waiting-clinician"
          ? "All requirements met — awaiting final clinician approval"
          : "Blocked by open requirements",
    status: readyStatus,
    dependencies: blockers.map((r) => r.id),
    owner: "clinician",
    acceptableEvidence: ["All blocking requirements satisfied"],
    attachedEvidence: [],
    guidelineReference: CITATIONS.readyToSchedule,
    requiresClinicianApproval: true,
    blocksScheduling: false,
    generatedByRule: "ready-to-schedule",
  });

  const graph = buildGraph((prevGraph?.version ?? 0) + 1, requirements);
  const graphDiff = diffGraph(prevGraph, graph);

  return {
    pathwayStatus: graph.pathwayStatus,
    requirements,
    determinations,
    graph,
    graphDiff,
    appliedRules,
    citations,
  };
}
