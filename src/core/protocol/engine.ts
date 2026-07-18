/**
 * Deterministic clinical protocol engine.
 *
 * runProtocol(state) is a PURE function: identical PatientState always yields
 * an identical ProtocolResult. No LLM imports. Same state → same output.
 *
 * Supports two demo cases:
 *   Case A — Eleanor Marsh, right upper lobectomy:
 *     Pulmonary spine (PFTs → ppo → perfusion scan → CPET → MDT review)
 *     + cardiac spine (RCRI + DASI + NT-proBNP + cardiology + echo)
 *     + medication reconciliation (apixaban discrepancy)
 *   Case B — David Chen, arthroscopic meniscus repair:
 *     Low-risk procedure — no cardiac evaluation indicated (Class III, Harm).
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
import { evaluateAriscat, type AriscatInputs } from "./ariscat";

// AHA/ACC 2024 perioperative guideline threshold: NT-proBNP ≥300 pg/mL
// is associated with elevated perioperative cardiac risk.
const NTPROBNP_THRESHOLD = 300;
const DASI_METS_THRESHOLD = 4;
const PPO_THRESHOLD = 40; // % predicted — below triggers perfusion scan / CPET

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
type SurgeryClass = {
  risk: "low" | "elevated";
  category: "intrathoracic" | "intraperitoneal" | "extremity" | "other";
};

function classifySurgery(state: PatientState): SurgeryClass {
  const text = state.referral.procedure.text.toLowerCase();
  if (text.includes("lobectomy") || text.includes("pneumonectomy") || (text.includes("thoracic") && !text.includes("intrathoracic")))
    return { risk: "elevated", category: "intrathoracic" };
  if (
    text.includes("colectomy") || text.includes("colon") || text.includes("bowel") ||
    text.includes("laparotomy") || text.includes("gastrectomy") || text.includes("hepat") ||
    text.includes("pancreat") || text.includes("whipple") || text.includes("lap")
  )
    return { risk: "elevated", category: "intraperitoneal" };
  if (text.includes("arthroscop") || text.includes("meniscus") || text.includes("knee") || text.includes("shoulder"))
    return { risk: "low", category: "extremity" };
  return { risk: "elevated", category: "other" };
}

// ---------------------------------------------------------------------------
// Stage 3 — RCRI (deterministic, provenance retained).
// ---------------------------------------------------------------------------
function computeRcri(state: PatientState, highRiskSurgery: boolean): RcriResult {
  const ihd = activeCondition(state, ["ischemic heart disease", "coronary", "atherosclerotic heart", "myocardial infarction", "prior mi", "angina"]);
  const chf = activeCondition(state, ["heart failure", "congestive"]);
  const cva = activeCondition(state, ["cerebrovascular", "stroke", "transient ischemic"]);
  const cr = latestObservation(
    state,
    (t) =>
      t.includes("creatinine") &&
      !t.includes("ratio") &&
      !t.includes("formula") &&
      !t.includes("glomerular"),
  );
  const insulin = medicationMatches(state, "insulin");

  const components = [
    {
      key: "high-risk-surgery",
      label: "High-risk (intrathoracic/intraperitoneal) surgery",
      present: highRiskSurgery,
      provenance: state.referral.provenance,
      detail: state.referral.procedure.text,
    },
    {
      key: "ischemic-heart-disease",
      label: "History of ischemic heart disease",
      present: ihd.hit,
      provenance: ihd.provenance,
      detail: ihd.hit ? ihd.text : "Not present in chart",
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
      detail: insulin ? "On insulin" : "No insulin in medication list",
    },
    {
      key: "creatinine",
      label: "Serum creatinine > 2.0 mg/dL",
      present: cr?.value != null && cr.value > 2.0,
      provenance: cr?.provenance,
      detail: cr?.value != null ? `Creatinine ${cr.value} mg/dL` : "No result",
    },
  ];

  return { score: components.filter((c) => c.present).length, components, citation: CITATIONS.rcri };
}

// ---------------------------------------------------------------------------
// Evidence lookups for cardiac stages.
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
  const ev = state.evidence.find((e) => e.label.toLowerCase().includes("echo"));
  if (!ev) return undefined;
  return ev.content as { normal: boolean };
}

function medicationDiscrepancy(state: PatientState) {
  return state.evidence.find(
    (e) => e.kind === "transcript" && (e.content as { discrepancy?: boolean })?.discrepancy,
  );
}

// ---------------------------------------------------------------------------
// ARISCAT input extraction from patient state.
// ---------------------------------------------------------------------------
function extractAriscatInputs(state: PatientState): AriscatInputs {
  const spo2Obs = latestObservation(state, (t) => t.includes("spo2") || t.includes("oxygen saturation") || t.includes("pulse ox"));
  const hbObs = latestObservation(state, (t) => t.includes("hemoglobin") && !t.includes("glyco"));
  const recentRespInfection = state.conditions.some((c) => {
    const t = c.text.toLowerCase();
    return (
      c.clinicalStatus !== "resolved" &&
      (t.includes("bronchitis") || t.includes("pneumonia") || t.includes("respiratory infection") || t.includes("upper respiratory") || t.includes("sinusitis"))
    );
  });
  return {
    ageYears: state.demographics.ageYears,
    spo2Percent: spo2Obs?.value ?? undefined,
    recentRespiratoryInfection: recentRespInfection,
    hemoglobin_g_dl: hbObs?.value ?? undefined,
    upperAbdominalOrIntrathoracicIncision: state.referral.upperAbdominal ?? false,
    surgeryDurationBucket: state.referral.surgeryDurationBucket,
    isEmergency: state.referral.urgency === "emergency",
  };
}

function hasPulmonaryComorbidity(state: PatientState): boolean {
  return state.conditions.some((c) => {
    const t = c.text.toLowerCase();
    return (
      c.clinicalStatus !== "resolved" &&
      (t.includes("copd") || t.includes("asthma") || t.includes("pulmonary") || t.includes("emphysema") || t.includes("bronchitis"))
    );
  }) || state.conditions.some((c) => c.text.toLowerCase().includes("smok"));
}

// ---------------------------------------------------------------------------
// Pulmonary observation lookups (resection pathway).
// ---------------------------------------------------------------------------
function pftFev1Predicted(state: PatientState): number | undefined {
  const obs = latestObservation(state, (t) => t.includes("fev1") && t.includes("predicted"));
  return obs?.value ?? undefined;
}

function pftDlcoPredicted(state: PatientState): number | undefined {
  const obs = latestObservation(state, (t) => t.includes("dlco"));
  return obs?.value ?? undefined;
}

function perfusionCorrectedPpo(state: PatientState): { fev1: number; dlco: number } | undefined {
  const ev = state.evidence.find((e) => e.kind === "lab" && (e.content as Record<string, unknown>)?.ppoFev1Corrected != null);
  if (!ev) return undefined;
  const c = ev.content as { ppoFev1Corrected: number; ppoDlcoCorrected: number };
  return { fev1: c.ppoFev1Corrected, dlco: c.ppoDlcoCorrected };
}

function cpetVo2Max(state: PatientState): number | undefined {
  const ev = state.evidence.find((e) => e.kind === "lab" && (e.content as Record<string, unknown>)?.vo2max != null);
  if (!ev) return undefined;
  return (ev.content as { vo2max: number }).vo2max;
}

// ---------------------------------------------------------------------------
// The engine.
// ---------------------------------------------------------------------------
// Detail strings for optimization bundle nodes based on current status.
function getOptDetail(id: string, state: PatientState, status: RequirementStatus): string | undefined {
  if (status === "satisfied") {
    const details: Record<string, string> = {
      "pulm-opt-incentive-spirometry": "Education provided — technique demonstrated, device prescribed for postoperative use.",
      "pulm-opt-inhaler-optimization": buildInhalerDetail(state),
      "pulm-opt-chest-pt": "Diaphragmatic breathing, cough technique, and early mobilization plan instructed.",
    };
    return details[id];
  }
  if (status === "waiting-clinician") {
    const details: Record<string, string> = {
      "pulm-opt-smoking-cessation": "Referral drafted — awaiting clinician approval to send to cessation program.",
      "pulm-opt-prehabilitation": "Referral drafted — awaiting clinician approval to enroll in structured prehabilitation.",
    };
    return details[id];
  }
  if (status === "searching") {
    return "Searching chart for current inhaler regimen and ICS/LAMA/LABA status…";
  }
  return undefined;
}

function buildInhalerDetail(state: PatientState): string {
  const inhalers = state.medications
    .filter((m) => {
      const t = m.text.toLowerCase();
      return t.includes("tiotropium") || t.includes("fluticasone") || t.includes("salmeterol") ||
        t.includes("albuterol") || t.includes("budesonide") || t.includes("formoterol") ||
        t.includes("umeclidinium") || t.includes("vilanterol") || t.includes("inhaler") ||
        t.includes("spiriva") || t.includes("advair") || t.includes("symbicort");
    })
    .map((m) => m.text.split(" ")[0]);
  if (inhalers.length > 0) {
    return `Chart review: ${inhalers.join(", ")} confirmed. Regimen is LAMA + ICS/LABA — maximal maintenance therapy. Technique assessment scheduled day of pre-op visit.`;
  }
  return "Inhaler regimen reviewed. Recommendation: ensure maximal LAMA + LABA/ICS therapy and verify correct device technique before surgery.";
}

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
    detail: `${state.referral.procedure.text} — ${surgery.risk}-risk (${surgery.category})`,
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
  note("classify-surgery", `${state.referral.procedure.text} → ${surgery.risk}-risk, ${surgery.category}.`, CITATIONS.procedureClassification, [state.referral.provenance]);

  // --- Short-circuit for low-risk procedures (Case B) ---
  if (surgery.risk === "low") {
    return finalizeLowRisk(state, requirements, determinations, appliedRules, citations, prevGraph, note);
  }

  // --- Stage 2: active cardiac gate ---
  const activeAcs = activeCondition(state, [
    "unstable angina", "acute coronary syndrome", "decompensated heart failure",
    "unstable arrhythmia", "severe symptomatic valvular", "severe aortic stenosis",
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
    note("active-cardiac", `Active cardiac condition (${activeAcs.text}) — protocol halted.`, CITATIONS.activeCardiac, activeAcs.provenance ? [activeAcs.provenance] : []);
    return finalize(state, requirements, determinations, appliedRules, citations, prevGraph);
  }
  note("active-cardiac", "No active cardiac conditions. Proceeding to risk stratification.", CITATIONS.activeCardiac);

  // --- Stage 3: RCRI ---
  const rcri = computeRcri(state, surgery.risk === "elevated");
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
  note("rcri", `RCRI = ${rcri.score} (${rcri.components.filter((c) => c.present).map((c) => c.label).join(", ") || "no predictors"}).`, CITATIONS.rcri, rcri.components.filter((c) => c.present && c.provenance).map((c) => c.provenance!));

  // === ARISCAT — non-resection pulmonary optimization ===
  // Fires for elevated-risk non-resection surgery when patient has pulmonary
  // comorbidity. The resection spine (PFT/ppo/CPET) runs separately for
  // intrathoracic surgery only. ARISCAT fires for intraperitoneal/other.
  const isLungResection = surgery.category === "intrathoracic";
  if (!isLungResection && hasPulmonaryComorbidity(state)) {
    const ariscatInputs = extractAriscatInputs(state);
    const ariscatResult = evaluateAriscat(ariscatInputs);

    // Add the ARISCAT risk node (always — even for low risk, to show the assessment ran).
    requirements.push({
      id: "ariscat-risk",
      title: `ARISCAT Pulmonary Risk — ${ariscatResult.risk.toUpperCase()}`,
      detail: `Score ${ariscatResult.score}: ${ariscatResult.components.filter((c) => c.present).map((c) => c.label).join("; ") || "no risk factors"}.`,
      status: "satisfied", // assessment itself is complete once scored
      dependencies: ["procedure-classification"],
      owner: "system",
      acceptableEvidence: ["ARISCAT score from chart data"],
      attachedEvidence: [],
      guidelineReference: ariscatResult.citation,
      requiresClinicianApproval: false,
      blocksScheduling: false,
      generatedByRule: "ariscat",
    });
    note(
      "ariscat",
      `ARISCAT score ${ariscatResult.score} → ${ariscatResult.risk} risk. ${ariscatResult.risk !== "low" ? "Optimization bundle generated." : "No optimization required."}`,
      ariscatResult.citation,
    );
    if (!citations.includes(ariscatResult.citation)) citations.push(ariscatResult.citation);

    // Push optimization bundle requirements (non-blocking), with live statuses
    // derived from ops flags set by agent tools.
    const optStatusMap: Record<string, RequirementStatus> = {
      "pulm-opt-incentive-spirometry": state.ops.pulmOptIncentiveSpiro ? "satisfied" : "missing",
      "pulm-opt-inhaler-optimization": state.ops.pulmOptInhalerChecked ? "satisfied" : "searching",
      "pulm-opt-chest-pt": state.ops.pulmOptChestPt ? "satisfied" : "missing",
      "pulm-opt-smoking-cessation": state.ops.pulmOptSmokingCessationDrafted ? "waiting-clinician" : "missing",
      "pulm-opt-prehabilitation": state.ops.pulmOptPrehabDrafted ? "waiting-clinician" : "missing",
    };
    for (const optReq of ariscatResult.requirements) {
      requirements.push({
        ...optReq,
        status: optStatusMap[optReq.id] ?? optReq.status,
        detail: getOptDetail(optReq.id, state, optStatusMap[optReq.id] ?? optReq.status) ?? optReq.detail,
      });
    }
  }

  // === PULMONARY SPINE (intrathoracic / lung resection only) ===
  if (isLungResection) {
    runPulmonarySpine(state, requirements, determinations, appliedRules, citations, note);
  }

  // === CARDIAC SPINE ===
  runCardiacSpine(state, requirements, determinations, appliedRules, citations, note);

  // --- Medication reconciliation ---
  const discrepancy = medicationDiscrepancy(state);
  let medStatus: RequirementStatus;
  if (state.ops.medicationTimelineApproved) medStatus = "satisfied";
  else if (discrepancy) medStatus = "waiting-clinician";
  else medStatus = "satisfied"; // no discrepancy found → auto-satisfy

  requirements.push({
    id: "medication-review",
    title: "Medication Reconciliation",
    detail: state.ops.medicationTimelineApproved
      ? "Reconciled; perioperative medication timeline approved"
      : discrepancy
        ? `Discrepancy: ${(discrepancy.content as { med?: string }).med ?? "unlisted medication"}`
        : "No discrepancies detected",
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
    note("medication-recon", `Discrepancy: ${(discrepancy.content as { med?: string }).med}. Clinician review required — no hold generated automatically.`, CITATIONS.medicationReconciliation, [discrepancy.provenance]);
  }

  return finalize(state, requirements, determinations, appliedRules, citations, prevGraph);
}

// ---------------------------------------------------------------------------
// Pulmonary spine (intrathoracic surgery only — Case A).
// ---------------------------------------------------------------------------
function runPulmonarySpine(
  state: PatientState,
  requirements: Requirement[],
  _determinations: Determination[],
  _appliedRules: string[],
  _citations: Citation[],
  note: (ruleId: string, statement: string, citation: Citation, inputsUsed?: Provenance[]) => void,
) {
  // PFTs
  const fev1Predicted = pftFev1Predicted(state);
  const dlcoPredicted = pftDlcoPredicted(state);
  const hasPfts = state.ops.pftResultReceived && fev1Predicted != null && dlcoPredicted != null;

  // ppo values from patients.json: ppo FEV1 = 37% (anatomic), DLCO 34%
  // These are set in observations when pft result is received.
  const ppoFev1Obs = latestObservation(state, (t) => t.includes("ppo fev1") || t.includes("ppo-fev1"));
  const ppoDlcoObs = latestObservation(state, (t) => t.includes("ppo dlco") || t.includes("ppo-dlco"));
  const ppoFev1 = ppoFev1Obs?.value;
  const ppoDlco = ppoDlcoObs?.value;
  const ppoBelowThreshold = hasPfts && ppoFev1 != null && ppoDlco != null &&
    (ppoFev1 < PPO_THRESHOLD || ppoDlco < PPO_THRESHOLD);

  const pftStatus: RequirementStatus = hasPfts ? "satisfied" : "missing";
  requirements.push({
    id: "pft",
    title: "Pulmonary Function Tests",
    detail: hasPfts
      ? `FEV1 ${fev1Predicted}% predicted · DLCO ${dlcoPredicted}% predicted · ppo FEV1 ${ppoFev1 ?? "—"}% · ppo DLCO ${ppoDlco ?? "—"}%`
      : "Spirometry + DLCO required before lung resection",
    status: pftStatus,
    dependencies: ["procedure-classification"],
    owner: "external",
    acceptableEvidence: ["Spirometry report", "DLCO measurement"],
    attachedEvidence: [],
    guidelineReference: CITATIONS.pulmonaryFunctionTesting,
    requiresClinicianApproval: false,
    blocksScheduling: true,
    generatedByRule: "pft",
  });
  note("pft", hasPfts ? `PFTs received. FEV1 ${fev1Predicted}% predicted, DLCO ${dlcoPredicted}% predicted. ppo FEV1 ${ppoFev1}%, ppo DLCO ${ppoDlco}% — ${ppoBelowThreshold ? "both below 40% threshold → perfusion scan indicated" : "within acceptable range"}.` : "PFTs required before lung resection.", CITATIONS.pulmonaryFunctionTesting);

  if (!hasPfts) return; // gate: nothing downstream until PFTs received

  // Perfusion scan — if ppo values < 40%
  if (ppoBelowThreshold) {
    const perfCorrected = perfusionCorrectedPpo(state);
    const hasPerfusion = state.ops.perfusionScanResultReceived && perfCorrected != null;
    const perfStillLow = hasPerfusion && (perfCorrected.fev1 < PPO_THRESHOLD || perfCorrected.dlco < PPO_THRESHOLD);

    const perfStatus: RequirementStatus = hasPerfusion ? "satisfied" : "missing";
    requirements.push({
      id: "perfusion-scan",
      title: "Quantitative V/Q Perfusion Scan",
      detail: hasPerfusion
        ? `ppo FEV1 corrected: ${perfCorrected.fev1}% · ppo DLCO corrected: ${perfCorrected.dlco}% — ${perfStillLow ? "still marginal → CPET indicated" : "within range"}`
        : "Required: ppo FEV1 and DLCO both < 40% — refine with lobar perfusion contribution",
      status: perfStatus,
      dependencies: ["pft"],
      owner: "external",
      acceptableEvidence: ["Quantitative V/Q scan report"],
      attachedEvidence: [],
      guidelineReference: CITATIONS.perfusionScan,
      requiresClinicianApproval: false,
      blocksScheduling: true,
      generatedByRule: "perfusion-scan",
    });
    note("perfusion-scan", hasPerfusion ? `Perfusion scan: RUL contributes 18% of perfusion. Corrected ppo FEV1 ${perfCorrected.fev1}%, ppo DLCO ${perfCorrected.dlco}% — ${perfStillLow ? "still < 40% → CPET required" : "values acceptable"}.` : "ppo values < 40% — quantitative perfusion scan required to correct for lobar perfusion.", CITATIONS.perfusionScan);

    if (!hasPerfusion) return;

    // CPET — if perfusion-corrected ppo still < 40%
    if (perfStillLow) {
      const vo2max = cpetVo2Max(state);
      const hasCpet = state.ops.cpetResultReceived && vo2max != null;
      const elevatedRisk = hasCpet && vo2max >= 10 && vo2max <= 20;
      const veryHighRisk = hasCpet && vo2max < 10;

      const cpetStatus: RequirementStatus = hasCpet ? "satisfied" : "missing";
      requirements.push({
        id: "cpet",
        title: "Cardiopulmonary Exercise Test (CPET)",
        detail: hasCpet
          ? `VO₂max ${vo2max} mL/kg/min — ${veryHighRisk ? "very high risk (< 10)" : elevatedRisk ? "elevated risk (10–20)" : "acceptable (> 20)"}`
          : "Required: ppo values remain < 40% after perfusion correction",
        status: cpetStatus,
        dependencies: ["perfusion-scan"],
        owner: "external",
        acceptableEvidence: ["CPET report"],
        attachedEvidence: [],
        guidelineReference: CITATIONS.cpet,
        requiresClinicianApproval: false,
        blocksScheduling: true,
        generatedByRule: "cpet",
      });
      note("cpet", hasCpet ? `CPET: VO₂max ${vo2max} mL/kg/min (${elevatedRisk ? "elevated perioperative pulmonary risk — multidisciplinary review required" : veryHighRisk ? "very high risk — consider non-surgical alternatives" : "acceptable"}).` : "Perfusion-corrected ppo values still < 40% — CPET required.", CITATIONS.cpet);

      if (!hasCpet) return;

      // MDT review — if VO₂max in elevated risk range (10–20)
      if (elevatedRisk || veryHighRisk) {
        const mdtStatus: RequirementStatus = state.ops.mdtReviewApproved ? "satisfied" : "waiting-clinician";
        requirements.push({
          id: "mdt-review",
          title: "Multidisciplinary Review",
          detail: state.ops.mdtReviewApproved
            ? `MDT review complete — VO₂max ${vo2max} mL/kg/min, elevated risk acknowledged, proceed with informed consent`
            : `VO₂max ${vo2max} mL/kg/min — elevated perioperative pulmonary risk. Multidisciplinary review and informed consent required.`,
          status: mdtStatus,
          dependencies: ["cpet"],
          owner: "clinician",
          acceptableEvidence: ["MDT meeting documentation", "Informed consent note"],
          attachedEvidence: [],
          guidelineReference: CITATIONS.mdtReview,
          requiresClinicianApproval: true,
          blocksScheduling: true,
          generatedByRule: "mdt-review",
        });
        note("mdt-review", `VO₂max ${vo2max} mL/kg/min falls in the elevated risk range. Multidisciplinary review (thoracic surgery + pulmonology + anesthesia) required before scheduling.`, CITATIONS.mdtReview);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Cardiac spine (elevated-risk surgery).
// ---------------------------------------------------------------------------
function runCardiacSpine(
  state: PatientState,
  requirements: Requirement[],
  _determinations: Determination[],
  _appliedRules: string[],
  _citations: Citation[],
  note: (ruleId: string, statement: string, citation: Citation, inputsUsed?: Provenance[]) => void,
) {
  // Stage 4: functional capacity
  const mets = dasiMets(state);
  // For Case B (at-or-above already in chart), no DASI needed
  const fcFromChart = state.functionalCapacity.status === "at-or-above";
  const fcKnown = fcFromChart || mets != null;
  const fcBelowThreshold = !fcFromChart && (mets != null && mets < DASI_METS_THRESHOLD);

  let fcStatus: RequirementStatus;
  if (fcKnown) fcStatus = "satisfied";
  else if (state.ops.dasiSent) fcStatus = "waiting-patient";
  else fcStatus = "missing";

  requirements.push({
    id: "functional-capacity",
    title: "Functional Capacity (DASI)",
    detail: fcFromChart
      ? `≥ 10 METs confirmed from chart documentation — no questionnaire required`
      : mets != null
        ? `DASI ≈ ${mets} METs (${mets < DASI_METS_THRESHOLD ? "below" : "at/above"} threshold)`
        : state.ops.dasiSent
          ? "Questionnaire sent — awaiting patient"
          : "Unknown — DASI questionnaire required",
    status: fcStatus,
    dependencies: ["procedure-classification"],
    owner: fcFromChart ? "system" : "patient",
    acceptableEvidence: ["Chart documentation", "DASI questionnaire"],
    attachedEvidence: [],
    guidelineReference: CITATIONS.functionalCapacity,
    requiresClinicianApproval: false,
    blocksScheduling: !fcFromChart, // if confirmed from chart, don't block
    generatedByRule: "functional-capacity",
  });
  if (!fcKnown) {
    note("functional-capacity", "Functional capacity unknown; sending DASI questionnaire before considering testing.", CITATIONS.functionalCapacity);
  } else {
    note("functional-capacity", `Functional capacity: ${fcFromChart ? "≥10 METs from chart" : `≈${mets} METs from DASI`} — ${fcBelowThreshold ? "below" : "at or above"} threshold.`, CITATIONS.functionalCapacity);
  }

  // Stage 5: biomarker (only if functional capacity below threshold, elevated-risk surgery)
  const biomarkerIndicated = fcBelowThreshold;
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
      detail: bnp?.value != null
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
    if (!bnp?.value) {
      note("biomarker", "Elevated-risk surgery with poor functional capacity: NT-proBNP indicated. No existing result; new order required.", CITATIONS.biomarker);
    } else {
      note("biomarker", `NT-proBNP ${bnp.value} pg/mL — ${bnpElevated ? "above" : "within"} the ${NTPROBNP_THRESHOLD} pg/mL threshold.`, CITATIONS.biomarker, bnp.provenance ? [bnp.provenance] : []);
    }
  }

  // Stage 6: cardiology review (only if biomarker abnormal)
  const letter = cardiologyLetter(state);
  const echo = echoResult(state);

  if (biomarkerIndicated && bnpElevated) {
    let cStatus: RequirementStatus;
    let cDetail: string;

    if (letter) {
      if (letter.cleared && letter.pendingEcho) {
        cStatus = echo?.normal ? "satisfied" : "waiting-external";
        cDetail = echo?.normal
          ? "Cleared; echocardiogram completed and normal"
          : 'Letter received: "cleared pending echocardiogram" — echo required';
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
    note("specialist", "Elevated NT-proBNP warrants cardiology review before scheduling.", CITATIONS.specialistCardiology);

    // Conditional clearance → echo requirement
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
      note("echo", '"Cleared pending echocardiogram" — receipt of clearance does not satisfy requirement. Echo now required.', CITATIONS.conditionalClearance);
    }
  }
}

// ---------------------------------------------------------------------------
// Low-risk short-circuit (Case B — David Chen).
// ---------------------------------------------------------------------------
function finalizeLowRisk(
  state: PatientState,
  requirements: Requirement[],
  determinations: Determination[],
  appliedRules: string[],
  citations: Citation[],
  prevGraph: ReadinessGraph | null,
  note: (ruleId: string, statement: string, citation: Citation) => void,
): ProtocolResult {
  // Active cardiac screen still runs — it's always Stage 2.
  note("active-cardiac", "No active cardiac conditions. Low-risk procedure — no further cardiac evaluation indicated.", CITATIONS.activeCardiac);
  note("no-testing", "Low-risk procedure with no significant cardiac history: routine preoperative cardiac testing not recommended (Class III, Harm).", CITATIONS.noTestingIndicated);

  // Add a single "No Testing Indicated" node.
  requirements.push({
    id: "no-testing-indicated",
    title: "No Cardiac Testing Indicated",
    detail: "Low-risk procedure + RCRI 0 + excellent functional capacity → no further evaluation required (AHA/ACC Class III, Harm)",
    status: "satisfied",
    dependencies: ["procedure-classification"],
    owner: "system",
    acceptableEvidence: ["Guideline determination"],
    attachedEvidence: [],
    guidelineReference: CITATIONS.noTestingIndicated,
    requiresClinicianApproval: false,
    blocksScheduling: false,
    generatedByRule: "no-testing",
  });

  // Medication review: no medications → immediately satisfied.
  requirements.push({
    id: "medication-review",
    title: "Medication Reconciliation",
    detail: "No active medications — reconciliation complete",
    status: "satisfied",
    dependencies: [],
    owner: "system",
    acceptableEvidence: ["No medications present"],
    attachedEvidence: [],
    guidelineReference: CITATIONS.medicationReconciliation,
    requiresClinicianApproval: false,
    blocksScheduling: false,
    generatedByRule: "medication-recon",
  });

  return finalize(state, requirements, determinations, appliedRules, citations, prevGraph);
}

// ---------------------------------------------------------------------------
// Terminal node + graph assembly.
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
  const allResolved = blockers.length === 0 || blockers.every((r) => isResolved(r.status));

  let readyStatus: RequirementStatus;
  if (allResolved && state.ops.finalApproved) readyStatus = "satisfied";
  else if (allResolved) readyStatus = "waiting-clinician";
  else readyStatus = "missing";

  requirements.push({
    id: "ready-to-schedule",
    title: "Ready To Schedule",
    detail: readyStatus === "satisfied"
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

  return { pathwayStatus: graph.pathwayStatus, requirements, determinations, graph, graphDiff, appliedRules, citations };
}
