import { describe, it, expect } from "vitest";
import { buildInitialState } from "../src/core/ingestion/ingest";
import { runProtocol } from "../src/core/protocol/engine";
import type { Requirement } from "../src/core/models";

function node(reqs: Requirement[], id: string): Requirement | undefined {
  return reqs.find((r) => r.id === id);
}

describe("protocol engine", () => {
  it("is deterministic: identical state -> identical output", () => {
    const a = runProtocol(buildInitialState("A"), null);
    const b = runProtocol(buildInitialState("A"), null);
    expect(JSON.stringify(a.requirements)).toEqual(JSON.stringify(b.requirements));
    expect(a.pathwayStatus).toEqual(b.pathwayStatus);
  });

  it("Case A — computes RCRI = 1 (intrathoracic surgery only, no IHD)", () => {
    // Eleanor has COPD, AFib, HTN — but no ischemic heart disease.
    // RCRI components: high-risk surgery (lobectomy) = 1. All others absent.
    const r = runProtocol(buildInitialState("A"), null);
    const rcri = node(r.requirements, "rcri");
    expect(rcri?.detail).toBe("RCRI = 1");
  });

  it("Case A — missing data stays missing (insulin and creatinine absent)", () => {
    const state = buildInitialState("A");
    runProtocol(state, null);
    const rcri = state.derived.rcri!;
    const insulin = rcri.components.find((c) => c.key === "insulin-diabetes");
    const cr = rcri.components.find((c) => c.key === "creatinine");
    expect(insulin?.present).toBe(false);
    expect(cr?.present).toBe(false);
    // Only the high-risk surgery (intrathoracic) fires — RCRI = 1.
    expect(rcri.score).toBe(1);
  });

  it("Case A — generates initial blockers (PFT, functional-capacity, medication-review)", () => {
    const r = runProtocol(buildInitialState("A"), null);
    // Pulmonary spine
    expect(node(r.requirements, "pft")?.status).toBe("missing");
    // Cardiac spine
    expect(node(r.requirements, "functional-capacity")?.status).toBe("missing");
    // Medication discrepancy (apixaban) → waiting-clinician immediately
    expect(node(r.requirements, "medication-review")?.status).toBe("waiting-clinician");
    // No biomarker or cardiology yet
    expect(node(r.requirements, "biomarker")).toBeUndefined();
    expect(node(r.requirements, "cardiology-review")).toBeUndefined();
    expect(r.pathwayStatus).toBe("in-progress");
  });

  it("Case A — adds biomarker node only after DASI is below threshold", () => {
    const state = buildInitialState("A");
    state.questionnaires = [{ type: "DASI", metsEstimate: 3.0 }];
    const r = runProtocol(state, null);
    expect(node(r.requirements, "functional-capacity")?.status).toBe("satisfied");
    expect(node(r.requirements, "biomarker")).toBeDefined();
  });

  it("Case A — pulmonary spine: perfusion-scan added when ppo < 40%", () => {
    const state = buildInitialState("A");
    // Simulate PFT receipt: add ppo observations and set ops flag
    state.ops.pftResultReceived = true;
    state.observations = [
      ...state.observations,
      { code: "ppo-fev1", system: "local", text: "ppo FEV1 % predicted (anatomic)", value: 37, unit: "%predicted", effectiveAt: "2026-07-18", provenance: { source: "synthetic", reference: "lab/pft", extractedBy: "manual", verified: true, recordedAt: "2026-07-18" } },
      { code: "ppo-dlco", system: "local", text: "ppo DLCO % predicted (anatomic)", value: 34, unit: "%predicted", effectiveAt: "2026-07-18", provenance: { source: "synthetic", reference: "lab/pft", extractedBy: "manual", verified: true, recordedAt: "2026-07-18" } },
      { code: "20150-9", system: "http://loinc.org", text: "FEV1 % predicted", value: 45, unit: "%predicted", effectiveAt: "2026-07-18", provenance: { source: "synthetic", reference: "lab/pft", extractedBy: "manual", verified: true, recordedAt: "2026-07-18" } },
      { code: "19911-7", system: "http://loinc.org", text: "DLCO % predicted", value: 41, unit: "%predicted", effectiveAt: "2026-07-18", provenance: { source: "synthetic", reference: "lab/pft", extractedBy: "manual", verified: true, recordedAt: "2026-07-18" } },
    ];
    const r = runProtocol(state, null);
    expect(node(r.requirements, "pft")?.status).toBe("satisfied");
    expect(node(r.requirements, "perfusion-scan")).toBeDefined();
    expect(node(r.requirements, "perfusion-scan")?.status).toBe("missing");
  });

  it("Case B — low-risk procedure resolves immediately with no-testing-indicated", () => {
    const r = runProtocol(buildInitialState("B"), null);
    expect(node(r.requirements, "no-testing-indicated")?.status).toBe("satisfied");
    expect(node(r.requirements, "biomarker")).toBeUndefined();
    expect(node(r.requirements, "cardiology-review")).toBeUndefined();
    expect(node(r.requirements, "functional-capacity")).toBeUndefined();
    // Case B has no medications → medication-review satisfied immediately
    expect(node(r.requirements, "medication-review")?.status).toBe("satisfied");
    // Only Final Approval needed
    expect(node(r.requirements, "ready-to-schedule")?.status).toBe("waiting-clinician");
  });
});
