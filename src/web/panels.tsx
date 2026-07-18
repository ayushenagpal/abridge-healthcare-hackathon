import type { PatientState, ProtocolResult } from "../core/models";
import type { ActivityEntry, Interaction, Snapshot } from "../core/store";
import { LEGEND, STATUS_LABEL, STATUS_TONE } from "./status";

// ---------------------------------------------------------------------------
// Status legend + live "what's happening now" bar — the two affordances that
// make the graph readable at a glance.
export function StatusLegend() {
  return (
    <div className="legend">
      <div className="lg-h">Node status</div>
      {LEGEND.map((l) => (
        <div key={l.tone} className="lg-row">
          <span className={`sw tone-${l.tone}`} />
          {l.label}
        </div>
      ))}
      <div className="lg-row crit">
        <span className="sw" />
        On critical path
      </div>
      <div className="lg-h" style={{ marginTop: 9 }}>
        Lines = dependencies
      </div>
      <div className="lg-row">
        <span className="lg-edge" />
        A&nbsp;→&nbsp;B: B needs A first
      </div>
      <div className="lg-row">
        <span className="lg-edge crit" />
        Teal = critical path
      </div>
    </div>
  );
}

export function GraphStatusBar({ snapshot }: { snapshot: Snapshot }) {
  const g = snapshot.graph;
  if (!g) return null;
  const open = g.blockers.length;
  const firstOpen = g.criticalPath
    .map((id) => g.nodes.find((n) => n.id === id))
    .find((n) => n && n.status !== "satisfied" && n.status !== "not-indicated");
  return (
    <div className="gbar">
      {g.pathwayStatus === "ready-to-schedule" ? (
        <span className="next">
          <b>All operational requirements complete.</b>
        </span>
      ) : firstOpen ? (
        <span className="next">
          Critical path — next: <b>{firstOpen.title}</b>
        </span>
      ) : (
        <span className="next">Evaluating…</span>
      )}
      <span className="count">
        {open} open requirement{open === 1 ? "" : "s"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TIMELINE VIEW — the readiness process as a patient journey through time.
// Point 0 = referral; every subsequent healthcare touchpoint is timestamped
// (Day N) and shows ONLY what changed at that touchpoint (new/updated
// requirements), ending with the final readiness packet once complete.
export function TimelineView({
  interactions,
  protocol,
  state,
}: {
  interactions: Interaction[];
  protocol: ProtocolResult | null;
  state: PatientState | null;
}) {
  if (interactions.length === 0)
    return (
      <div className="empty" style={{ marginTop: 80 }}>
        No touchpoints yet. Click <b>Start Referral</b> — that is point 0 in the
        patient's journey.
      </div>
    );
  const ready = protocol?.pathwayStatus === "ready-to-schedule";
  return (
    <div className="tv scroll" style={{ flex: 1 }}>
      {interactions.map((it, i) => {
        // Only show what actually changed at this touchpoint — not the whole board.
        const shown = it.nodes.filter(
          (n) => it.added.includes(n.id) || it.changed.includes(n.id),
        );
        const isLast = i === interactions.length - 1;
        return (
          <div className="tv-row" key={it.id}>
            <div className="tv-axis">
              <div className="tv-day">
                <span className="tv-daynum">Day {it.day}</span>
                <span className="tv-t">T{it.seq}</span>
              </div>
              <div className="tv-dot" />
              {(!isLast || ready) && <div className="tv-rail" />}
            </div>
            <div className="tv-content">
              <div className="tv-title">{it.title}</div>
              {it.detail && <div className="tv-detail">{it.detail}</div>}
              <div className="tv-chips">
                {shown.length === 0 && (
                  <span className="tv-nochange">No change to readiness</span>
                )}
                {shown.map((n) => {
                  const tone = STATUS_TONE[n.status];
                  const isNew = it.added.includes(n.id);
                  return (
                    <span
                      key={n.id}
                      className={`tv-chip tone-${tone} active`}
                      title={`${n.title} — ${STATUS_LABEL[n.status]}`}
                    >
                      {tone === "done" && "✓ "}
                      {n.title}
                      <span className="tv-new">{isNew ? "new" : "updated"}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {ready && (
        <div className="tv-row">
          <div className="tv-axis">
            <div className="tv-day">
              <span className="tv-daynum tone-done">✓</span>
            </div>
            <div className="tv-dot" style={{ background: "var(--done)" }} />
          </div>
          <div className="tv-content">
            <FinalPacket protocol={protocol} state={state} inline />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ReferralSummary({ snapshot }: { snapshot: Snapshot }) {
  const ps = snapshot.patientState;
  const status = snapshot.graph?.pathwayStatus ?? "awaiting-referral";
  const statusClass =
    status === "ready-to-schedule"
      ? "green"
      : status === "unsupported" || status === "human-review"
        ? "red"
        : status === "in-progress"
          ? "amber"
          : "";
  const statusLabel: Record<string, string> = {
    "ready-to-schedule": "Ready To Schedule",
    "in-progress": "In Progress",
    "human-review": "Human Review",
    unsupported: "Unsupported",
    "awaiting-referral": "Awaiting Referral",
  };
  return (
    <>
      {ps && (
        <div className="summary-grid">
          <div className="cell">
            <div className="k">Patient</div>
            <div className="v">
              {ps.demographics.name}, {ps.demographics.ageYears}
            </div>
          </div>
          <div className="cell">
            <div className="k">Procedure</div>
            <div className="v">{ps.referral.procedure.text}</div>
          </div>
          <div className="cell">
            <div className="k">Urgency</div>
            <div className="v" style={{ textTransform: "capitalize" }}>
              {ps.referral.urgency}
            </div>
          </div>
          {ps.derived.rcri && (
            <div className="cell">
              <div className="k">RCRI</div>
              <div className="v">{ps.derived.rcri.score}</div>
            </div>
          )}
        </div>
      )}
      <div className="spacer" />
      <span className="badge mono">aha-acc-perioperative-demo-v1</span>
      <span className="badge">LLM: {snapshot.providerName}</span>
      <span className={`badge ${statusClass}`}>
        {statusLabel[status] ?? status}
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
export function RcriDetail({ state }: { state: PatientState | null }) {
  const rcri = state?.derived.rcri;
  if (!rcri) return null;
  return (
    <div className="card">
      <div className="ct">
        RCRI = {rcri.score}
        <span className="tag">deterministic</span>
      </div>
      {rcri.components.map((comp) => (
        <div key={comp.key} className={`rcri-comp ${comp.present ? "on" : "off"}`}>
          <span className="chk">{comp.present ? "✓" : "·"}</span>
          <span style={{ flex: 1 }}>{comp.label}</span>
        </div>
      ))}
      <div className="cite">{rcri.citation.text}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const VAL_BADGE: Record<string, string> = {
  accepted: "green",
  "accepted-review": "amber",
  pending: "",
  rejected: "red",
  conflicting: "red",
  stale: "amber",
  incomplete: "amber",
  unsupported: "red",
};

export function EvidenceViewer({ state }: { state: PatientState | null }) {
  if (!state) return <div className="empty">No evidence yet.</div>;
  return (
    <>
      <div className="card">
        <div className="ct">
          Chart (FHIR)
          <span className="tag real">real data</span>
        </div>
        <div className="cm">
          {state.conditions.length} conditions · {state.medications.length}{" "}
          medications · {state.observations.length} observations
        </div>
        <div className="prov">source: synthea-fhir-r4 (Abridge dataset)</div>
      </div>
      {state.evidence.map((ev) => (
        <div key={ev.id} className="card">
          <div className="ct">
            {ev.label}
            <span className={`tag ${ev.kind === "synthetic" || ev.provenance.source === "synthetic" ? "syn" : ""}`}>
              {ev.provenance.source === "synthetic" ? "synthetic" : ev.kind}
            </span>
          </div>
          <div className="cm">
            <span className={`badge ${VAL_BADGE[ev.validation.status] ?? ""}`}>
              {ev.validation.status}
            </span>{" "}
            {ev.validation.reasons[0]}
          </div>
          <div className="prov">
            {ev.provenance.reference} · verified={String(ev.provenance.verified)}
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
const KIND_TAG: Record<string, string> = {
  event: "Event",
  graph: "Graph mutation",
  agent: "Agent decision",
  tool: "Tool execution",
  patient: "Patient message",
  protocol: "Protocol engine",
  wait: "Waiting",
  blocked: "Safety gate",
};

export function EventTimeline({ timeline }: { timeline: ActivityEntry[] }) {
  if (timeline.length === 0)
    return (
      <div className="empty">
        Each simulation control emits one event. The stream — event → protocol
        run → graph mutation → agent action → wait — appears here.
      </div>
    );
  const items = [...timeline].reverse();
  return (
    <div>
      {items.map((e, i) => (
        <div key={e.id} className={`tl-item k-${e.kind}`}>
          <div className="tl-rail">
            <span className="tl-marker" />
            {i < items.length - 1 && <span className="tl-line" />}
          </div>
          <div className="tl-body">
            <div className="tl-kind">{KIND_TAG[e.kind] ?? e.kind}</div>
            <div className="tt">{e.title}</div>
            {e.detail && <div className="td">{e.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ApprovalQueue({
  state,
  onApprove,
}: {
  state: PatientState | null;
  onApprove: (subject: string) => void;
}) {
  const reviews = state?.clinicianDecisions ?? [];
  if (reviews.length === 0)
    return <div className="empty">No drafts awaiting review.</div>;
  const approveable: Record<string, boolean> = {
    order: true,
    "medication-timeline": true,
    "mdt-review": true,
    final: true,
  };
  return (
    <>
      {reviews.map((r) => (
        <div key={r.id} className="card">
          <div className="ct">
            {r.title}
            <span className={`badge ${r.decision === "approved" ? "green" : "amber"}`}>
              {r.decision}
            </span>
          </div>
          <div className="cm">
            Drafted by agent · subject: {r.subject}
            {r.decidedBy ? ` · ${r.decidedBy}` : ""}
          </div>
          {r.decision === "pending" && approveable[r.subject] && (
            <div style={{ marginTop: 7, display: "flex", gap: 6 }}>
              <button className="btn approve" onClick={() => onApprove(r.subject)}>
                Approve
              </button>
              <button className="btn ghost" disabled>
                Reject
              </button>
            </div>
          )}
          {r.decision === "pending" && r.subject === "referral" && (
            <div className="cm">Awaiting cardiology consultation.</div>
          )}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
export function FinalPacket({
  protocol,
  state,
  inline,
}: {
  protocol: ProtocolResult | null;
  state: PatientState | null;
  inline?: boolean;
}) {
  if (!protocol || protocol.pathwayStatus !== "ready-to-schedule" || !state)
    return null;

  const rcri = state.derived.rcri;
  const dasi = state.questionnaires[0];
  const isLobectomy = state.referral.procedure.text.toLowerCase().includes("lobectomy");
  const isLowRisk = state.referral.procedure.text.toLowerCase().includes("arthroscop") ||
    state.referral.procedure.text.toLowerCase().includes("meniscus");

  // Pulmonary values (Case A)
  const ppoFev1Obs = state.observations.find((o) => o.text.toLowerCase().includes("ppo fev1") && o.text.includes("anatomic"));
  const perfusionEv = state.evidence.find((e) => e.kind === "lab" && (e.content as Record<string, unknown>)?.ppoFev1Corrected != null);
  const cpetEv = state.evidence.find((e) => e.kind === "lab" && (e.content as Record<string, unknown>)?.vo2max != null);
  const ppoFev1Corrected = perfusionEv ? (perfusionEv.content as Record<string, number>).ppoFev1Corrected : undefined;
  const ppoDlcoCorrected = perfusionEv ? (perfusionEv.content as Record<string, number>).ppoDlcoCorrected : undefined;
  const vo2max = cpetEv ? (cpetEv.content as Record<string, number>).vo2max : undefined;
  const ntprobnp = state.observations.find((o) => o.text.toLowerCase().includes("natriuretic"))?.value;

  if (isLowRisk) {
    return (
      <div className={`packet${inline ? " inline" : ""}`}>
        <h3>✓ Final Readiness Packet</h3>
        <div className="cm" style={{ marginBottom: 8 }}>
          Operational requirements complete — {state.demographics.name}, {state.referral.procedure.text}.
        </div>
        <div className="line">
          <span className="k">Procedure risk</span>
          <span>Low (extremity/ambulatory)</span>
        </div>
        <div className="line">
          <span className="k">RCRI</span>
          <span>0 — no elevated-risk components</span>
        </div>
        <div className="line">
          <span className="k">Functional capacity</span>
          <span>≥ 10 METs (confirmed from chart)</span>
        </div>
        <div className="line">
          <span className="k">Cardiac testing indicated</span>
          <span>No — AHA/ACC Class III (Harm)</span>
        </div>
        <div className="line">
          <span className="k">Outstanding issues</span>
          <span>None</span>
        </div>
        <div className="cite" style={{ marginTop: 8 }}>
          AHA/ACC 2024 Perioperative Guideline — Class III (Harm), LOE B-NR: Routine preoperative cardiac testing not recommended for low-risk surgery.
        </div>
      </div>
    );
  }

  return (
    <div className={`packet${inline ? " inline" : ""}`}>
      <h3>✓ Final Readiness Packet</h3>
      <div className="cm" style={{ marginBottom: 8 }}>
        Operational requirements complete — {state.demographics.name},{" "}
        {state.referral.procedure.text}.
      </div>
      {isLobectomy && (
        <>
          <div className="line"><span className="k" style={{ color: "#6366f1" }}>── Pulmonary ──</span></div>
          <div className="line">
            <span className="k">ppo FEV1 (perfusion-corrected)</span>
            <span>{ppoFev1Corrected ?? ppoFev1Obs?.value ?? "—"}% predicted</span>
          </div>
          <div className="line">
            <span className="k">ppo DLCO (perfusion-corrected)</span>
            <span>{ppoDlcoCorrected ?? "—"}% predicted</span>
          </div>
          <div className="line">
            <span className="k">VO₂max (CPET)</span>
            <span>{vo2max ?? "—"} mL/kg/min — elevated risk (10–20 range)</span>
          </div>
          <div className="line">
            <span className="k">MDT review</span>
            <span>Complete — proceed with informed consent</span>
          </div>
          <div className="line"><span className="k" style={{ color: "#6366f1" }}>── Cardiac ──</span></div>
        </>
      )}
      <div className="line">
        <span className="k">RCRI</span>
        <span>{rcri?.score}</span>
      </div>
      {dasi && (
        <div className="line">
          <span className="k">Functional capacity (DASI)</span>
          <span>≈ {dasi.metsEstimate} METs</span>
        </div>
      )}
      {ntprobnp && (
        <div className="line">
          <span className="k">NT-proBNP</span>
          <span>{ntprobnp} pg/mL — elevated; echo normal</span>
        </div>
      )}
      {ntprobnp && (
        <div className="line">
          <span className="k">Cardiology</span>
          <span>Cleared; echocardiogram normal (EF 62%)</span>
        </div>
      )}
      <div className="line">
        <span className="k">Medication timeline</span>
        <span>{state.ops.medicationTimelineApproved ? "Reconciled & approved" : "No medications"}</span>
      </div>
      <div className="line">
        <span className="k">Outstanding issues</span>
        <span>None</span>
      </div>
      <div className="cite" style={{ marginTop: 8 }}>
        Guideline citations:{" "}
        {protocol.citations.map((c) => c.section).join("; ")}.
      </div>
    </div>
  );
}
