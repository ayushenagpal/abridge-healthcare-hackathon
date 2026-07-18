import { useState } from "react";
import { caseStore, useCase } from "./useCase";
import { ReadinessGraph } from "./ReadinessGraph";
import {
  ApprovalQueue,
  EvidenceViewer,
  EventTimeline,
  FinalPacket,
  GraphStatusBar,
  RcriDetail,
  ReferralSummary,
  StatusLegend,
  TimelineView,
} from "./panels";

type GraphView = "graph" | "timeline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function App() {
  const snapshot = useCase();
  const [auto, setAuto] = useState(false);
  const [view, setView] = useState<GraphView>("graph");
  const ps = snapshot.patientState;
  const caseId = snapshot.caseId;
  const nodeStatus = (id: string) =>
    snapshot.graph?.nodes.find((n) => n.id === id)?.status;

  const started = snapshot.started;

  // --- Case A button conditions ---
  const pftDone = ps?.ops.pftResultReceived ?? false;
  const perfusionDone = ps?.ops.perfusionScanResultReceived ?? false;
  const cpetDone = ps?.ops.cpetResultReceived ?? false;
  const mdtDone = ps?.ops.mdtReviewApproved ?? false;
  const dasiDone = (ps?.questionnaires.length ?? 0) > 0;
  const orderApproved = ps?.ops.biomarkerOrderApproved ?? false;
  const labDone = ps?.observations.some((o) => o.text.toLowerCase().includes("natriuretic")) ?? false;
  const letterDone = ps?.evidence.some((e) => e.kind === "specialist-letter") ?? false;
  const echoDone = ps?.evidence.some((e) => e.label.toLowerCase().includes("echo")) ?? false;
  const medApproved = ps?.ops.medicationTimelineApproved ?? false;
  const finalDone = ps?.ops.finalApproved ?? false;

  const en = {
    start: !started,
    // Pulmonary spine (Case A only)
    pft: started && !pftDone && caseId === "A",
    perfusion: pftDone && !perfusionDone && caseId === "A",
    cpet: perfusionDone && !cpetDone && caseId === "A",
    mdtReview: cpetDone && !mdtDone && nodeStatus("mdt-review") === "waiting-clinician" && caseId === "A",
    // Cardiac spine (Case A only)
    dasi: started && !dasiDone && caseId === "A",
    approveOrder: nodeStatus("biomarker") === "waiting-clinician",
    lab: orderApproved && !labDone,
    letter: !!nodeStatus("cardiology-review") && !letterDone,
    echo: !!nodeStatus("echo") && !echoDone,
    med:
      (ps?.clinicianDecisions.some(
        (r) => r.subject === "medication-timeline" && r.decision === "pending",
      ) ?? false) && !medApproved,
    final: nodeStatus("ready-to-schedule") === "waiting-clinician" && !finalDone,
  };

  const onApprove = (subject: string) => {
    if (subject === "order") caseStore.approveBiomarkerOrder();
    else if (subject === "medication-timeline") caseStore.approveMedicationTimeline();
    else if (subject === "mdt-review") caseStore.approveMdtReview();
    else if (subject === "final") caseStore.finalApproval();
  };

  async function runAutoA() {
    setAuto(true);
    caseStore.reset();
    const steps: (() => void | Promise<void>)[] = [
      caseStore.start,
      caseStore.receivePftResult,
      caseStore.receivePerfusionScan,
      caseStore.receiveCpetResult,
      caseStore.submitDasi,
      caseStore.approveBiomarkerOrder,
      caseStore.receiveLabResult,
      caseStore.receiveCardiologyLetter,
      caseStore.receiveEcho,
      caseStore.approveMedicationTimeline,
      caseStore.approveMdtReview,
      caseStore.finalApproval,
    ];
    for (const step of steps) {
      await step();
      await sleep(1000);
    }
    setAuto(false);
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          PreOp Navigator
          <small>Autonomous pre-operative agent · deterministic protocol engine</small>
        </div>
        <ReferralSummary snapshot={snapshot} />
      </div>

      <div className="main">
        <div className="col">
          <div className="panel-h">Evidence &amp; Provenance</div>
          <div className="scroll">
            <RcriDetail state={ps} />
            <EvidenceViewer state={ps} />
          </div>
        </div>

        <div className="col graph-col">
          <div className="panel-h">
            {view === "graph" ? "Living Readiness Graph" : "Patient Journey — Timeline"}
            <div className="view-toggle">
              <button
                className={`vt ${view === "graph" ? "on" : ""}`}
                onClick={() => setView("graph")}
              >
                Graph
              </button>
              <button
                className={`vt ${view === "timeline" ? "on" : ""}`}
                onClick={() => setView("timeline")}
              >
                Timeline
              </button>
            </div>
          </div>
          {view === "graph" && snapshot.graph && (
            <GraphStatusBar snapshot={snapshot} />
          )}
          {view === "graph" ? (
            <div className="graph-wrap">
              <ReadinessGraph graph={snapshot.graph} />
              {snapshot.graph && <StatusLegend />}
              <FinalPacket protocol={snapshot.protocol} state={ps} />
            </div>
          ) : (
            <TimelineView
              interactions={snapshot.interactions}
              protocol={snapshot.protocol}
              state={ps}
            />
          )}
        </div>

        <div className="col">
          <div className="panel-h">Event Timeline &amp; Agent Activity</div>
          <div className="scroll" style={{ flex: 1.6 }}>
            <EventTimeline timeline={snapshot.timeline} />
          </div>
          <div className="panel-h">Clinician Approval Queue</div>
          <div className="scroll" style={{ flex: 1 }}>
            <ApprovalQueue state={ps} onApprove={onApprove} />
          </div>
        </div>
      </div>

      <div className="bottombar">
        {/* Simulation controls */}
        <div className="controls">
          <span className="lbl">Simulation</span>
          <button className="btn primary" disabled={!en.start || auto} onClick={caseStore.start}>
            Start Referral
          </button>

          {caseId === "A" && (<>
            <span className="sep">│</span>
            <span className="lbl-sm">Pulmonary</span>
            <button className="btn" disabled={!en.pft || auto} onClick={caseStore.receivePftResult}>
              Receive PFTs
            </button>
            <button className="btn" disabled={!en.perfusion || auto} onClick={caseStore.receivePerfusionScan}>
              Receive Perfusion Scan
            </button>
            <button className="btn" disabled={!en.cpet || auto} onClick={caseStore.receiveCpetResult}>
              Receive CPET
            </button>
            <span className="sep">│</span>
            <span className="lbl-sm">Cardiac</span>
            <button className="btn" disabled={!en.dasi || auto} onClick={caseStore.submitDasi}>
              Submit DASI
            </button>
            <button className="btn" disabled={!en.approveOrder || auto} onClick={caseStore.approveBiomarkerOrder}>
              Approve Biomarker Order
            </button>
            <button className="btn" disabled={!en.lab || auto} onClick={caseStore.receiveLabResult}>
              Receive NT-proBNP
            </button>
            <button className="btn" disabled={!en.letter || auto} onClick={caseStore.receiveCardiologyLetter}>
              Receive Cardiology Letter
            </button>
            <button className="btn" disabled={!en.echo || auto} onClick={caseStore.receiveEcho}>
              Receive Echo
            </button>
            <span className="sep">│</span>
            <button className="btn" disabled={!en.med || auto} onClick={caseStore.approveMedicationTimeline}>
              Approve Medication Timeline
            </button>
            <button className="btn" disabled={!en.mdtReview || auto} onClick={caseStore.approveMdtReview}>
              Approve MDT Review
            </button>
          </>)}

          <button className="btn" disabled={!en.final || auto} onClick={caseStore.finalApproval}>
            Final Approval
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={auto} onClick={runAutoA}>
            ▶ Auto demo
          </button>
          <button className="btn ghost" disabled={auto} onClick={() => caseStore.reset()}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
