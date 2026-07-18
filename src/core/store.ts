/**
 * Case store — the long-running operational controller.
 *
 * Every simulation control emits exactly one WorkflowEvent. Processing an event
 * updates clinical/operational state, then repeatedly: runs the deterministic
 * protocol engine, diffs the graph, and lets the agent take one action — until
 * no operational work remains, then waits. Nothing advances the graph manually.
 */
import {
  type AgentDecision,
  type ChartObservation,
  type PatientState,
  type ProtocolResult,
  type ReadinessGraph,
  type RequirementStatus,
  type ToolExecution,
  type WorkflowEvent,
} from "./models";
import { runProtocol } from "./protocol/engine";
import { buildInitialState } from "./ingestion/ingest";
import { validateEvidence } from "./evidence";
import { NOW, SYNTHETIC, syntheticProvenance } from "./synthetic";
import { agentTick } from "./agent/orchestrator";
import { MockLlmProvider } from "./agent/llm/mock";
import type { LlmProvider } from "./agent/types";

export type ActivityKind =
  | "event"
  | "protocol"
  | "graph"
  | "agent"
  | "tool"
  | "patient"
  | "wait"
  | "blocked";

export interface ActivityEntry {
  id: number;
  kind: ActivityKind;
  title: string;
  detail?: string;
}

/** A single healthcare touchpoint in time — the unit of the vertical
 * timeline view. Captured once per settled event. */
export interface InteractionNode {
  id: string;
  title: string;
  status: RequirementStatus;
}
export interface Interaction {
  id: string;
  seq: number;
  title: string;
  detail?: string;
  day: number; // days since referral (point 0)
  nodes: InteractionNode[]; // full graph state at this point
  added: string[]; // node ids that first appeared here
  changed: string[]; // node ids whose status changed here
}

export interface Snapshot {
  started: boolean;
  caseId: "A" | "B";
  patientState: PatientState | null;
  protocol: ProtocolResult | null;
  graph: ReadinessGraph | null;
  graphHistory: ReadinessGraph[];
  interactions: Interaction[];
  timeline: ActivityEntry[];
  toolLog: ToolExecution[];
  agentLog: AgentDecision[];
  providerName: string;
  processing: boolean;
}

/** Synthetic elapsed-days added per touchpoint so the timeline reads as a real
 * journey (the demo's clock is otherwise fixed). */
const DAY_DELTA: Record<string, number> = {
  REFERRAL_RECEIVED: 0,
  QUESTIONNAIRE_RECEIVED: 3,
  ORDER_APPROVED: 1,
  LAB_RESULT_RECEIVED: 4,
  DOCUMENT_RECEIVED: 6,
  CLINICIAN_DECISION: 2,
  READY_TO_SCHEDULE: 0,
};

const EVENT_TITLES: Record<string, string> = {
  REFERRAL_RECEIVED: "Referral received",
  QUESTIONNAIRE_RECEIVED: "DASI questionnaire submitted",
  ORDER_APPROVED: "Biomarker order approved",
  LAB_RESULT_RECEIVED: "Lab result received (NT-proBNP)",
  DOCUMENT_RECEIVED: "Document received",
  CLINICIAN_DECISION: "Clinician decision recorded",
  READY_TO_SCHEDULE: "Ready To Schedule",
  PATIENT_MESSAGE: "Message sent to patient",
  FOLLOW_UP_TIMEOUT: "Follow-up timeout",
  PATIENT_UPDATED: "Patient state updated",
  FHIR_IMPORTED: "FHIR imported",
  TRANSCRIPT_IMPORTED: "Transcript imported",
};

export class Case {
  private state: PatientState | null = null;
  private protocol: ProtocolResult | null = null;
  private graphHistory: ReadinessGraph[] = [];
  private interactions: Interaction[] = [];
  private dayCursor = 0;
  private events: WorkflowEvent[] = [];
  private timeline: ActivityEntry[] = [];
  private toolLog: ToolExecution[] = [];
  private agentLog: AgentDecision[] = [];
  private searched = new Set<string>();
  private processing = false;
  private activitySeq = 0;
  private eventSeq = 0;
  private listeners = new Set<() => void>();
  private provider: LlmProvider;
  private caseId: "A" | "B" = "A";

  constructor(provider: LlmProvider = new MockLlmProvider()) {
    this.provider = provider;
    this.snapshot = this.buildSnapshot();
  }

  // --- React integration ---
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private emit() {
    this.listeners.forEach((l) => l());
  }

  getSnapshot = (): Snapshot => this.snapshot;
  private snapshot!: Snapshot;

  private buildSnapshot(): Snapshot {
    return {
      started: this.state != null,
      caseId: this.caseId,
      patientState: this.state,
      protocol: this.protocol,
      graph: this.graphHistory.at(-1) ?? null,
      graphHistory: this.graphHistory,
      interactions: this.interactions,
      timeline: this.timeline,
      toolLog: this.toolLog,
      agentLog: this.agentLog,
      providerName: this.provider.name,
      processing: this.processing,
    };
  }
  private commit() {
    this.snapshot = this.buildSnapshot();
    this.emit();
  }

  private log(kind: ActivityKind, title: string, detail?: string) {
    this.activitySeq += 1;
    this.timeline = [
      ...this.timeline,
      { id: this.activitySeq, kind, title, detail },
    ];
  }

  private makeEvent(type: WorkflowEvent["type"], payload: unknown): WorkflowEvent {
    this.eventSeq += 1;
    return { id: `evt-${this.eventSeq}`, type, payload, occurredAt: NOW };
  }

  // --- Public simulation controls ---
  reset() {
    this.state = null;
    this.protocol = null;
    this.graphHistory = [];
    this.interactions = [];
    this.dayCursor = 0;
    this.events = [];
    this.timeline = [];
    this.toolLog = [];
    this.agentLog = [];
    this.searched = new Set();
    this.activitySeq = 0;
    this.eventSeq = 0;
    this.commit();
  }

  selectCase = (id: "A" | "B") => {
    this.caseId = id;
    this.reset();
  };

  start = () => this.dispatch(this.makeEvent("REFERRAL_RECEIVED", {}));
  submitDasi = () =>
    this.dispatch(this.makeEvent("QUESTIONNAIRE_RECEIVED", SYNTHETIC.dasi));
  approveBiomarkerOrder = () =>
    this.dispatch(this.makeEvent("ORDER_APPROVED", { order: "NT-proBNP" }));
  receiveLabResult = () =>
    this.dispatch(this.makeEvent("LAB_RESULT_RECEIVED", SYNTHETIC.ntProBnp));
  receiveCardiologyLetter = () =>
    this.dispatch(
      this.makeEvent("DOCUMENT_RECEIVED", {
        docType: "cardiology-letter",
        ...SYNTHETIC.cardiologyLetter,
      }),
    );
  receiveEcho = () =>
    this.dispatch(
      this.makeEvent("DOCUMENT_RECEIVED", { docType: "echo", ...SYNTHETIC.echo }),
    );
  approveMedicationTimeline = () =>
    this.dispatch(
      this.makeEvent("CLINICIAN_DECISION", { kind: "medication-timeline" }),
    );
  finalApproval = () =>
    this.dispatch(this.makeEvent("CLINICIAN_DECISION", { kind: "final" }));

  // Pulmonary pathway controls (Case A)
  receivePftResult = () =>
    this.dispatch(this.makeEvent("LAB_RESULT_RECEIVED", { docType: "pft", ...SYNTHETIC.pft }));
  receivePerfusionScan = () =>
    this.dispatch(this.makeEvent("LAB_RESULT_RECEIVED", { docType: "perfusion-scan", ...SYNTHETIC.perfusionScan }));
  receiveCpetResult = () =>
    this.dispatch(this.makeEvent("LAB_RESULT_RECEIVED", { docType: "cpet", ...SYNTHETIC.cpet }));
  approveMdtReview = () =>
    this.dispatch(this.makeEvent("CLINICIAN_DECISION", { kind: "mdt-review" }));

  // --- Core processing ---
  private async dispatch(event: WorkflowEvent) {
    this.events.push(event);
    this.log("event", EVENT_TITLES[event.type] ?? event.type, this.eventDetail(event));
    this.applyDataEffect(event);
    this.processing = true;
    this.commit();
    await this.runLoop(event.type);
    this.captureInteraction(event);
    this.processing = false;
    this.commit();
  }

  /** Snapshot the settled graph state as a timeline touchpoint. */
  private captureInteraction(event: WorkflowEvent) {
    const graph = this.graphHistory.at(-1);
    if (!graph) return;
    this.dayCursor += DAY_DELTA[event.type] ?? 2;

    const prev = this.interactions.at(-1);
    const prevById = new Map(prev?.nodes.map((n) => [n.id, n.status]) ?? []);
    const added: string[] = [];
    const changed: string[] = [];
    for (const n of graph.nodes) {
      if (!prevById.has(n.id)) added.push(n.id);
      else if (prevById.get(n.id) !== n.status) changed.push(n.id);
    }

    this.interactions = [
      ...this.interactions,
      {
        id: `it-${this.interactions.length}`,
        seq: this.interactions.length,
        title: EVENT_TITLES[event.type] ?? event.type,
        detail: this.eventDetail(event),
        day: this.dayCursor,
        nodes: graph.nodes.map((n) => ({
          id: n.id,
          title: n.title,
          status: n.status,
        })),
        added,
        changed,
      },
    ];
  }

  private eventDetail(event: WorkflowEvent): string | undefined {
    const p = event.payload as Record<string, unknown>;
    switch (event.type) {
      case "LAB_RESULT_RECEIVED":
        if (p.docType === "pft") return `FEV1 ${p.fev1_percentPredicted}% · DLCO ${p.dlco_percentPredicted}% · ppo FEV1 ${p.ppoFev1_percentPredicted}% · ppo DLCO ${p.ppoDlco_percentPredicted}%`;
        if (p.docType === "perfusion-scan") return `ppo FEV1 corrected: ${p.ppoFev1_percentPredicted}% · ppo DLCO: ${p.ppoDlco_percentPredicted}%`;
        if (p.docType === "cpet") return `VO₂max ${p.vo2max_mL_kg_min} mL/kg/min`;
        return `NT-proBNP ${p.value} ${p.unit}`;
      case "DOCUMENT_RECEIVED":
        return p.docType === "cardiology-letter"
          ? '"…cleared pending echocardiogram…"'
          : "Echocardiogram report";
      case "QUESTIONNAIRE_RECEIVED":
        return `DASI ≈ ${p.metsEstimate} METs`;
      default:
        return undefined;
    }
  }

  private approvePendingReview(subject: string) {
    const review = [...this.state!.clinicianDecisions]
      .reverse()
      .find((r) => r.subject === subject && r.decision === "pending");
    if (review) {
      review.decision = "approved";
      review.decidedBy = "Dr. Chen (attending)";
      review.decidedAt = NOW;
    }
  }

  private applyDataEffect(event: WorkflowEvent) {
    if (event.type === "REFERRAL_RECEIVED") {
      this.state = buildInitialState(this.caseId);
      this.log("protocol", "Reading transcript, FHIR, and referral");
      return;
    }
    if (!this.state) return;
    const p = event.payload as Record<string, unknown>;

    switch (event.type) {
      case "QUESTIONNAIRE_RECEIVED": {
        const mets = p.metsEstimate as number;
        this.state.questionnaires = [
          {
            type: "DASI",
            score: p.score as number,
            metsEstimate: mets,
            submittedAt: NOW,
            provenance: syntheticProvenance("questionnaire/dasi"),
          },
        ];
        this.state.functionalCapacity = {
          status: mets < 4 ? "below" : "at-or-above",
          metsEstimate: mets,
          provenance: syntheticProvenance("questionnaire/dasi"),
        };
        break;
      }
      case "ORDER_APPROVED": {
        this.state.ops.biomarkerOrderApproved = true;
        this.approvePendingReview("order");
        break;
      }
      case "LAB_RESULT_RECEIVED": {
        const docType = p.docType as string | undefined;

        if (docType === "pft") {
          // PFT results: add FEV1, DLCO, and computed ppo observations.
          this.state.ops.pftResultReceived = true;
          const pftObs: ChartObservation[] = [
            { code: "20150-9", system: "http://loinc.org", text: "FEV1 % predicted", value: p.fev1_percentPredicted as number, unit: "%predicted", effectiveAt: NOW, provenance: syntheticProvenance("lab/pft") },
            { code: "19911-7", system: "http://loinc.org", text: "DLCO % predicted", value: p.dlco_percentPredicted as number, unit: "%predicted", effectiveAt: NOW, provenance: syntheticProvenance("lab/pft") },
            { code: "ppo-fev1", system: "local", text: "ppo FEV1 % predicted (anatomic)", value: p.ppoFev1_percentPredicted as number, unit: "%predicted", effectiveAt: NOW, provenance: syntheticProvenance("lab/pft-ppo") },
            { code: "ppo-dlco", system: "local", text: "ppo DLCO % predicted (anatomic)", value: p.ppoDlco_percentPredicted as number, unit: "%predicted", effectiveAt: NOW, provenance: syntheticProvenance("lab/pft-ppo") },
          ];
          this.state.observations = [...this.state.observations, ...pftObs];
          this.log("tool", `PFTs received — FEV1 ${p.fev1_percentPredicted}% predicted, DLCO ${p.dlco_percentPredicted}% predicted. ppo FEV1 ${p.ppoFev1_percentPredicted}%, ppo DLCO ${p.ppoDlco_percentPredicted}% — both < 40%.`);
        } else if (docType === "perfusion-scan") {
          // Perfusion-corrected ppo values.
          this.state.ops.perfusionScanResultReceived = true;
          this.state.evidence = [
            ...this.state.evidence,
            validateEvidence({
              id: `ev-perfusion-${this.eventSeq}`,
              requirementId: "perfusion-scan",
              kind: "lab",
              label: "Quantitative V/Q perfusion scan",
              content: {
                ppoFev1Corrected: p.ppoFev1_percentPredicted,
                ppoDlcoCorrected: p.ppoDlco_percentPredicted,
                rightUpperLobeFraction: p.rightUpperLobeFraction,
              },
              provenance: syntheticProvenance("lab/perfusion-scan"),
              validation: { status: "pending", reasons: [] },
            }),
          ];
          this.log("tool", `Perfusion scan: RUL contributes ${Math.round((p.rightUpperLobeFraction as number) * 100)}% of total perfusion. Corrected ppo FEV1 ${p.ppoFev1_percentPredicted}%, ppo DLCO ${p.ppoDlco_percentPredicted}% — still < 40%.`);
        } else if (docType === "cpet") {
          // CPET result.
          this.state.ops.cpetResultReceived = true;
          this.state.evidence = [
            ...this.state.evidence,
            validateEvidence({
              id: `ev-cpet-${this.eventSeq}`,
              requirementId: "cpet",
              kind: "lab",
              label: "CPET report",
              content: { vo2max: p.vo2max_mL_kg_min, peakWorkload_W: p.peakWorkload_W, ve_vco2_slope: p.ve_vco2_slope },
              provenance: syntheticProvenance("lab/cpet"),
              validation: { status: "pending", reasons: [] },
            }),
          ];
          this.log("tool", `CPET: VO₂max ${p.vo2max_mL_kg_min} mL/kg/min — elevated perioperative pulmonary risk (10–20 range).`);
        } else {
          // NT-proBNP (cardiac spine).
          const obs: ChartObservation = {
            code: p.code as string,
            system: "http://loinc.org",
            text: p.text as string,
            value: p.value as number,
            unit: p.unit as string,
            effectiveAt: NOW,
            provenance: syntheticProvenance("lab/nt-probnp"),
          };
          this.state.observations = [...this.state.observations, obs];
          this.state.evidence = [
            ...this.state.evidence,
            validateEvidence({
              id: `ev-lab-${this.eventSeq}`,
              requirementId: "biomarker",
              kind: "lab",
              label: "NT-proBNP result",
              content: { value: p.value },
              provenance: syntheticProvenance("lab/nt-probnp"),
              validation: { status: "pending", reasons: [] },
            }),
          ];
        }
        break;
      }
      case "DOCUMENT_RECEIVED": {
        if (p.docType === "cardiology-letter") {
          this.state.ops.cardiologyReferralApproved = true;
          this.approvePendingReview("referral");
          this.state.evidence = [
            ...this.state.evidence,
            validateEvidence({
              id: `ev-cards-${this.eventSeq}`,
              requirementId: "cardiology-review",
              kind: "specialist-letter",
              label: "Cardiology consultation letter",
              content: {
                cleared: p.cleared,
                pendingEcho: p.pendingEcho,
                text: p.text,
              },
              provenance: syntheticProvenance("document/cardiology-letter"),
              validation: { status: "pending", reasons: [] },
            }),
          ];
        } else if (p.docType === "echo") {
          this.state.evidence = [
            ...this.state.evidence,
            validateEvidence({
              id: `ev-echo-${this.eventSeq}`,
              requirementId: "echo",
              kind: "pdf",
              label: "Echocardiogram report",
              content: { normal: p.normal, text: p.text },
              provenance: syntheticProvenance("document/echo"),
              validation: { status: "pending", reasons: [] },
            }),
          ];
        }
        break;
      }
      case "CLINICIAN_DECISION": {
        if (p.kind === "medication-timeline") {
          this.state.ops.medicationTimelineApproved = true;
          this.approvePendingReview("medication-timeline");
        } else if (p.kind === "mdt-review") {
          this.state.ops.mdtReviewApproved = true;
          this.approvePendingReview("mdt-review");
        } else if (p.kind === "final") {
          this.state.ops.finalApproved = true;
          this.approvePendingReview("final");
        }
        break;
      }
      default:
        break;
    }
  }

  private nodeTitle(id: string): string {
    return this.protocol?.requirements.find((r) => r.id === id)?.title ?? id;
  }

  private describeDiff(protocol: ProtocolResult): string | undefined {
    const d = protocol.graphDiff;
    const parts: string[] = [];
    if (d.added.length)
      parts.push(`+ ${d.added.map((i) => this.nodeTitle(i)).join(", ")}`);
    if (d.closed.length)
      parts.push(`✓ ${d.closed.map((i) => this.nodeTitle(i)).join(", ")}`);
    if (d.reopened.length)
      parts.push(`↻ ${d.reopened.map((i) => this.nodeTitle(i)).join(", ")}`);
    return parts.length ? parts.join("  ·  ") : undefined;
  }

  private async runLoop(observedEvent: string) {
    if (!this.state) return;

    for (let i = 0; i < 8; i++) {
      const prevGraph = this.graphHistory.at(-1) ?? null;
      const protocol = runProtocol(this.state, prevGraph);
      this.protocol = protocol;

      const diff = protocol.graphDiff;
      const changed =
        this.graphHistory.length === 0 ||
        diff.added.length +
          diff.removed.length +
          diff.reopened.length +
          diff.closed.length +
          diff.statusChanged.length >
          0;
      if (changed) {
        this.graphHistory = [...this.graphHistory, protocol.graph];
        this.log("protocol", "Protocol engine evaluated");
        const desc = this.describeDiff(protocol);
        if (desc) this.log("graph", "Readiness graph mutated", desc);
      }
      this.commit();

      const tick = await agentTick({
        state: this.state,
        protocol,
        provider: this.provider,
        searched: this.searched,
        observedEvent,
      });

      if (!tick) {
        this.log("wait", "Waiting for next event");
        this.commit();
        break;
      }

      this.agentLog = [...this.agentLog, tick.agentDecision];
      this.toolLog = [...this.toolLog, tick.toolExecution];
      this.log(
        "agent",
        `Agent → ${tick.agentDecision.chosenTool}`,
        tick.agentDecision.reasoning,
      );
      if (tick.toolExecution.tool.startsWith("search"))
        this.searched.add(String((tick.toolExecution.input as { requirementId?: string }).requirementId));

      if (tick.blocked) {
        this.log("blocked", "Safety gate blocked action", tick.blocked.reason);
      } else {
        this.log("tool", String(tick.toolExecution.output));
      }
      if (tick.patientMessage) this.log("patient", "SMS → patient", tick.patientMessage);
      if (tick.emittedEventType === "READY_TO_SCHEDULE") {
        const ev = this.makeEvent("READY_TO_SCHEDULE", {});
        this.events.push(ev);
        this.log("event", EVENT_TITLES.READY_TO_SCHEDULE);
      }
      this.commit();
    }
  }
}
