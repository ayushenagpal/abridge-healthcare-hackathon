/**
 * Domain models for PreOp Navigator.
 *
 * Zod schemas are the single source of truth for the models that cross runtime
 * boundaries (ingested data, evidence, events, tool I/O). Internal engine
 * outputs (graph, protocol result) are plain TS interfaces derived from them.
 *
 * Nothing in this file makes clinical decisions — it only describes shapes.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Provenance — attached to every extracted or derived fact.
// ---------------------------------------------------------------------------
export const EvidenceSource = z.enum([
  "transcript",
  "fhir",
  "pdf",
  "specialist-letter",
  "lab",
  "questionnaire",
  "clinician-decision",
  "synthetic",
]);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const Provenance = z.object({
  source: EvidenceSource,
  reference: z.string(), // e.g. "Condition/123", a transcript span, a file id
  extractedBy: z.enum([
    "fhir-normalizer",
    "llm-extractor",
    "manual",
    "protocol-engine",
  ]),
  verified: z.boolean(),
  recordedAt: z.string(), // ISO
});
export type Provenance = z.infer<typeof Provenance>;

// ---------------------------------------------------------------------------
// Citations — every protocol determination is explainable by one.
// ---------------------------------------------------------------------------
export const Citation = z.object({
  guideline: z.string(),
  version: z.string(),
  section: z.string(),
  classOfRecommendation: z.string().optional(),
  levelOfEvidence: z.string().optional(),
  text: z.string(),
});
export type Citation = z.infer<typeof Citation>;

// ---------------------------------------------------------------------------
// Referral.
// ---------------------------------------------------------------------------
export const Urgency = z.enum([
  "elective",
  "time-sensitive",
  "urgent",
  "emergency",
]);
export type Urgency = z.infer<typeof Urgency>;

export const Referral = z.object({
  id: z.string(),
  patientId: z.string(),
  procedure: z.object({
    text: z.string(),
    snomedCode: z.string().optional(),
  }),
  urgency: Urgency,
  indication: z.string(),
  referringProvider: z.string(),
  receivedAt: z.string(),
  provenance: Provenance,
});
export type Referral = z.infer<typeof Referral>;

// ---------------------------------------------------------------------------
// Normalized chart facts.
// ---------------------------------------------------------------------------
export const ChartCondition = z.object({
  code: z.string(),
  system: z.string(),
  text: z.string(),
  clinicalStatus: z.string(),
  provenance: Provenance,
});
export type ChartCondition = z.infer<typeof ChartCondition>;

export const ChartMedication = z.object({
  text: z.string(),
  rxnormCode: z.string().optional(),
  status: z.string(),
  provenance: Provenance,
});
export type ChartMedication = z.infer<typeof ChartMedication>;

export const ChartObservation = z.object({
  code: z.string(),
  system: z.string(),
  text: z.string(),
  value: z.number().nullable(),
  unit: z.string().optional(),
  effectiveAt: z.string().optional(),
  provenance: Provenance,
});
export type ChartObservation = z.infer<typeof ChartObservation>;

// ---------------------------------------------------------------------------
// Functional capacity + questionnaires.
// ---------------------------------------------------------------------------
export const FunctionalCapacityStatus = z.enum([
  "unknown",
  "below",
  "at-or-above",
]);
export type FunctionalCapacityStatus = z.infer<typeof FunctionalCapacityStatus>;

export const DasiQuestionnaire = z.object({
  type: z.literal("DASI"),
  score: z.number().optional(),
  metsEstimate: z.number().optional(),
  submittedAt: z.string().optional(),
  provenance: Provenance.optional(),
});
export type DasiQuestionnaire = z.infer<typeof DasiQuestionnaire>;

// ---------------------------------------------------------------------------
// Clinician review (approval queue item).
// ---------------------------------------------------------------------------
export const ClinicianReview = z.object({
  id: z.string(),
  subject: z.enum([
    "order",
    "referral",
    "medication-timeline",
    "abnormal-finding",
    "final",
  ]),
  requirementId: z.string().optional(),
  title: z.string(),
  draft: z.unknown(),
  decision: z.enum(["pending", "approved", "rejected", "edited"]),
  decidedBy: z.string().optional(),
  decidedAt: z.string().optional(),
});
export type ClinicianReview = z.infer<typeof ClinicianReview>;

// ---------------------------------------------------------------------------
// RCRI (engine-computed, kept for display + provenance).
// ---------------------------------------------------------------------------
export interface RcriComponent {
  key: string;
  label: string;
  present: boolean;
  provenance?: Provenance;
  detail?: string;
}
export interface RcriResult {
  score: number;
  components: RcriComponent[];
  citation: Citation;
}

// ---------------------------------------------------------------------------
// Evidence — every incoming fact before it is trusted.
// ---------------------------------------------------------------------------
export const EvidenceValidationStatus = z.enum([
  "pending",
  "accepted",
  "accepted-review",
  "rejected",
  "conflicting",
  "unsupported",
  "stale",
  "incomplete",
]);
export type EvidenceValidationStatus = z.infer<typeof EvidenceValidationStatus>;

export const Evidence = z.object({
  id: z.string(),
  requirementId: z.string().optional(),
  kind: EvidenceSource,
  label: z.string(),
  content: z.unknown(),
  provenance: Provenance,
  validation: z.object({
    status: EvidenceValidationStatus,
    checkedAt: z.string().optional(),
    reasons: z.array(z.string()),
  }),
});
export type Evidence = z.infer<typeof Evidence>;

// ---------------------------------------------------------------------------
// Requirement — a readiness-graph node.
// ---------------------------------------------------------------------------
export const RequirementStatus = z.enum([
  "missing",
  "searching",
  "waiting-patient",
  "waiting-external",
  "waiting-clinician",
  "satisfied",
  "abnormal-review-required",
  "unsupported",
  "blocked",
  "not-indicated",
]);
export type RequirementStatus = z.infer<typeof RequirementStatus>;

export const RequirementOwner = z.enum([
  "system",
  "patient",
  "clinician",
  "external",
]);
export type RequirementOwner = z.infer<typeof RequirementOwner>;

export interface Requirement {
  id: string;
  title: string;
  detail?: string;
  status: RequirementStatus;
  dependencies: string[];
  owner: RequirementOwner;
  acceptableEvidence: string[];
  attachedEvidence: string[];
  guidelineReference: Citation;
  requiresClinicianApproval: boolean;
  blocksScheduling: boolean;
  generatedByRule: string;
}

// ---------------------------------------------------------------------------
// Readiness graph + diff.
// ---------------------------------------------------------------------------
export type PathwayStatus =
  | "in-progress"
  | "human-review"
  | "unsupported"
  | "ready-to-schedule";

export interface GraphEdge {
  from: string;
  to: string;
}

export interface ReadinessGraph {
  version: number;
  nodes: Requirement[];
  edges: GraphEdge[];
  criticalPath: string[];
  blockers: string[];
  pathwayStatus: PathwayStatus;
}

export interface GraphDiff {
  added: string[];
  removed: string[];
  reopened: string[];
  closed: string[];
  statusChanged: { id: string; from: RequirementStatus; to: RequirementStatus }[];
}

// ---------------------------------------------------------------------------
// Protocol result — the pure output of the deterministic engine.
// ---------------------------------------------------------------------------
export interface Determination {
  ruleId: string;
  statement: string;
  citation: Citation;
  inputsUsed: Provenance[];
}

export interface ProtocolResult {
  pathwayStatus: PathwayStatus;
  requirements: Requirement[];
  determinations: Determination[];
  graph: ReadinessGraph;
  graphDiff: GraphDiff;
  appliedRules: string[];
  citations: Citation[];
}

// ---------------------------------------------------------------------------
// Patient state — normalized, versioned projection of the event log.
// ---------------------------------------------------------------------------
export interface PatientState {
  version: number;
  patientId: string;
  demographics: {
    name: string;
    birthDate: string;
    gender: string;
    ageYears: number;
  };
  referral: Referral;
  conditions: ChartCondition[];
  medications: ChartMedication[];
  observations: ChartObservation[];
  functionalCapacity: {
    status: FunctionalCapacityStatus;
    metsEstimate?: number;
    provenance?: Provenance;
  };
  questionnaires: DasiQuestionnaire[];
  evidence: Evidence[];
  clinicianDecisions: ClinicianReview[];
  derived: { rcri?: RcriResult };
  /**
   * Operational progress flags, set by tools and clinician decisions. The
   * engine reads these to derive operational sub-statuses (searching /
   * waiting-*) deterministically — it never sets them itself.
   */
  ops: {
    dasiSent: boolean;
    biomarkerOrderDrafted: boolean;
    biomarkerOrderApproved: boolean;
    cardiologyReferralDrafted: boolean;
    cardiologyReferralApproved: boolean;
    medicationTimelineApproved: boolean;
    finalApproved: boolean;
    readyMarked: boolean;
  };
}

export const EMPTY_OPS: PatientState["ops"] = {
  dasiSent: false,
  biomarkerOrderDrafted: false,
  biomarkerOrderApproved: false,
  cardiologyReferralDrafted: false,
  cardiologyReferralApproved: false,
  medicationTimelineApproved: false,
  finalApproved: false,
  readyMarked: false,
};

// ---------------------------------------------------------------------------
// Workflow events.
// ---------------------------------------------------------------------------
export const EventType = z.enum([
  "REFERRAL_RECEIVED",
  "FHIR_IMPORTED",
  "TRANSCRIPT_IMPORTED",
  "PATIENT_UPDATED",
  "QUESTIONNAIRE_RECEIVED",
  "ORDER_APPROVED",
  "LAB_RESULT_RECEIVED",
  "DOCUMENT_RECEIVED",
  "CLINICIAN_DECISION",
  "PATIENT_MESSAGE",
  "FOLLOW_UP_TIMEOUT",
  "READY_TO_SCHEDULE",
]);
export type EventType = z.infer<typeof EventType>;

export const WorkflowEvent = z.object({
  id: z.string(),
  type: EventType,
  payload: z.unknown(),
  occurredAt: z.string(),
  causedBy: z.string().optional(),
  note: z.string().optional(),
});
export type WorkflowEvent = z.infer<typeof WorkflowEvent>;

// ---------------------------------------------------------------------------
// Tool execution + agent decision (audit).
// ---------------------------------------------------------------------------
export const ToolExecution = z.object({
  id: z.string(),
  tool: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  status: z.enum(["ok", "blocked", "error"]),
  audit: z.object({
    decidedBy: z.literal("agent"),
    approvedBy: z.string().optional(),
    at: z.string(),
    idempotencyKey: z.string(),
    reason: z.string().optional(),
  }),
});
export type ToolExecution = z.infer<typeof ToolExecution>;

export interface AgentDecision {
  id: string;
  at: string;
  observedEvent: string;
  reasoning: string;
  chosenTool: string | null;
  source: "policy" | "llm" | "mock";
}
