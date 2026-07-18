import type {
  PatientState,
  ProtocolResult,
  RequirementStatus,
} from "../core/models";
import type { ActivityEntry, Interaction, Snapshot } from "../core/store";
import { LEGEND, STATUS_LABEL, STATUS_TONE } from "./status";
import { isAdvisory } from "./ReadinessGraph";

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
      <div className="lg-row">
        <span className="sw tone-advice" />
        Advisory (recommendation, non-blocking)
      </div>
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
  const isAnalysis = (s: string) => s === "satisfied" || s === "not-indicated";
  const advisoryIds = new Set(
    (protocol?.requirements ?? []).filter(isAdvisory).map((r) => r.id),
  );

  type Chip = { id: string; title: string; status: RequirementStatus; badge?: string };
  type Row = {
    key: string;
    day: number;
    stageTag?: string;
    title: string;
    detail?: string;
    chips: Chip[];
    empty?: string;
  };

  const rows: Row[] = [];
  const [first, ...rest] = interactions;

  // First touchpoint is split into two stages: what we already know vs the
  // workup the analysis says is needed.
  if (first) {
    const relevant = first.nodes.filter((n) => n.id !== "ready-to-schedule");
    const known = relevant.filter((n) => isAnalysis(n.status));
    const needed = relevant.filter((n) => !isAnalysis(n.status));
    rows.push({
      key: "intake",
      day: first.day,
      stageTag: "Stage 1 · Intake",
      title: "What we know",
      detail: "Deterministic assessment of the referral and existing chart data",
      chips: known.map((n) => ({ ...n, badge: "known" })),
      empty: "No prior assessments",
    });
    rows.push({
      key: "analysis",
      day: first.day,
      stageTag: "Stage 2 · Protocol analysis",
      title: "Required workup",
      detail: "Tests, referrals, and questionnaires the analysis determined are needed",
      chips: needed.map((n) => ({ ...n, badge: "needed" })),
      empty: "No further workup indicated",
    });
  }

  // Subsequent touchpoints: only what changed at each.
  for (const it of rest) {
    const shown = it.nodes.filter(
      (n) => it.added.includes(n.id) || it.changed.includes(n.id),
    );
    rows.push({
      key: it.id,
      day: it.day,
      title: it.title,
      detail: it.detail,
      chips: shown.map((n) => ({
        ...n,
        badge: it.added.includes(n.id) ? "new" : "updated",
      })),
      empty: "No change to readiness",
    });
  }

  return (
    <div className="tv scroll" style={{ flex: 1 }}>
      {rows.map((row, i) => (
        <div className="tv-row" key={row.key}>
          <div className="tv-axis">
            <div className="tv-day">
              <span className="tv-daynum">Day {row.day}</span>
              <span className="tv-t">Step {i + 1}</span>
            </div>
            <div className="tv-dot" />
            {(i < rows.length - 1 || ready) && <div className="tv-rail" />}
          </div>
          <div className="tv-content">
            {row.stageTag && <div className="tv-stage">{row.stageTag}</div>}
            <div className="tv-title">{row.title}</div>
            {row.detail && <div className="tv-detail">{row.detail}</div>}
            <div className="tv-chips">
              {row.chips.length === 0 && (
                <span className="tv-nochange">{row.empty}</span>
              )}
              {row.chips.map((n) => {
                const advisory = advisoryIds.has(n.id);
                const tone = advisory ? "advice" : STATUS_TONE[n.status];
                const badge = advisory ? "advisory" : n.badge;
                return (
                  <span
                    key={n.id}
                    className={`tv-chip tone-${tone} active`}
                    title={`${n.title} — ${advisory ? "Advisory" : STATUS_LABEL[n.status]}`}
                  >
                    {tone === "done" && "✓ "}
                    {n.title}
                    {badge && badge !== "known" && (
                      <span className="tv-new">{badge}</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ))}

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
// Patient-facing counseling for each advisory optimization.
const PT_COUNSEL: Record<string, string> = {
  "pulm-opt-incentive-spirometry":
    "Use your incentive spirometer — 10 slow deep breaths every hour while awake, before and after surgery.",
  "pulm-opt-inhaler-optimization":
    "Keep taking your inhalers exactly as prescribed and bring them to your pre-op visit so we can check your technique.",
  "pulm-opt-smoking-cessation":
    "Stop smoking as far ahead of surgery as you can — even a few days lowers your risk of lung problems. We've referred you to a cessation program.",
  "pulm-opt-chest-pt":
    "Practice slow deep breathing and gentle coughing daily; plan to sit up and walk as soon as possible after surgery.",
  "pulm-opt-prehabilitation":
    "Attend the prehabilitation program to build up your strength and breathing reserve before surgery.",
};

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
  const ntprobnp = state.observations.find((o) => o.text.toLowerCase().includes("natriuretic"))?.value;

  // ARISCAT optimization bundle nodes
  const ariscatNode = protocol.requirements.find((r) => r.id === "ariscat-risk");
  const optBundle = protocol.requirements.filter((r) => r.id.startsWith("pulm-opt-"));

  return (
    <div className={`packet${inline ? " inline" : ""}`}>
      <h3>✓ Final Readiness Packet</h3>
      <div className="cm" style={{ marginBottom: 8 }}>
        Operational requirements complete — {state.demographics.name},{" "}
        {state.referral.procedure.text}.
      </div>

      <div className="line"><span className="k" style={{ fontWeight: 700 }}>─ Cardiac</span></div>
      <div className="line">
        <span className="k">RCRI</span>
        <span>{rcri?.score ?? "—"} — elevated cardiac risk</span>
      </div>
      {dasi && (
        <div className="line">
          <span className="k">Functional capacity (DASI)</span>
          <span>score {dasi.score} ≈ {dasi.metsEstimate} METs (poor)</span>
        </div>
      )}
      {ntprobnp && (
        <div className="line">
          <span className="k">NT-proBNP</span>
          <span>{ntprobnp} pg/mL (≥300 elevated → echo obtained)</span>
        </div>
      )}
      <div className="line">
        <span className="k">Cardiology e-consult</span>
        <span>Cleared; echo EF 55%, no structural disease</span>
      </div>
      <div className="line">
        <span className="k">Medication timeline</span>
        <span>Reconciled; empagliflozin hold ×3d documented</span>
      </div>

      {ariscatNode && (
        <>
          <div className="line" style={{ marginTop: 6 }}>
            <span className="k" style={{ fontWeight: 700 }}>─ Pulmonary</span>
          </div>
          <div className="line">
            <span className="k">ARISCAT score</span>
            <span>{ariscatNode.detail?.match(/Score (\d+)/)?.[1] ?? "—"} — HIGH risk</span>
          </div>
          {optBundle.map((r) => (
            <div key={r.id} className="line">
              <span className="k">{r.title}</span>
              <span>{r.requiresClinicianApproval ? "referred" : "instructed"}</span>
            </div>
          ))}
        </>
      )}

      {(optBundle.length > 0 || state.ops.medicationTimelineApproved) && (
        <>
          <div className="line" style={{ marginTop: 6 }}>
            <span className="k" style={{ fontWeight: 700 }}>
              ─ Patient counseling
            </span>
          </div>
          <ul className="counsel">
            {optBundle.map((r) => (
              <li key={r.id}>{PT_COUNSEL[r.id] ?? r.title}</li>
            ))}
            {state.ops.medicationTimelineApproved && (
              <li>
                <b>Medication hold:</b> Stop empagliflozin (Jardiance) 3 days
                before surgery to prevent euglycemic ketoacidosis; resume once
                eating normally per the surgical team. Continue all other
                medications unless told otherwise.
              </li>
            )}
            <li>
              Follow the fasting and arrival instructions you'll receive; call
              the pre-op line with any new symptoms (fever, chest pain,
              shortness of breath) before surgery.
            </li>
          </ul>
        </>
      )}

      <div className="line" style={{ marginTop: 6 }}>
        <span className="k">Outstanding issues</span>
        <span>None</span>
      </div>
      <div className="cite" style={{ marginTop: 8 }}>
        {protocol.citations.map((c) => c.section).join("; ")}.
      </div>
    </div>
  );
}
