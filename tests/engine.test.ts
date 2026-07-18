import { describe, it, expect } from "vitest";
import { buildInitialState } from "../src/core/ingestion/ingest";
import { runProtocol } from "../src/core/protocol/engine";
import type { Requirement } from "../src/core/models";

function node(reqs: Requirement[], id: string): Requirement | undefined {
  return reqs.find((r) => r.id === id);
}

describe("protocol engine — Frank Delgado, open colectomy", () => {
  it("is deterministic: identical state produces identical output", () => {
    const a = runProtocol(buildInitialState(), null);
    const b = runProtocol(buildInitialState(), null);
    expect(JSON.stringify(a.requirements)).toEqual(JSON.stringify(b.requirements));
    expect(a.pathwayStatus).toEqual(b.pathwayStatus);
  });

  it("RCRI = 3 (high-risk surgery + IHD + insulin-treated DM)", () => {
    const r = runProtocol(buildInitialState(), null);
    const rcri = node(r.requirements, "rcri");
    expect(rcri?.detail).toBe("RCRI = 3");
  });

  it("missing data stays missing — CHF and CVA absent do not fire", () => {
    const state = buildInitialState();
    runProtocol(state, null);
    const rcri = state.derived.rcri!;
    const chf = rcri.components.find((c) => c.key === "chf");
    const cva = rcri.components.find((c) => c.key === "cva");
    const cr = rcri.components.find((c) => c.key === "creatinine");
    expect(chf?.present).toBe(false);
    expect(cva?.present).toBe(false);
    expect(cr?.present).toBe(false);
    // Score is 3: high-risk surgery + IHD + insulin DM
    expect(rcri.score).toBe(3);
  });

  it("initial blockers: functional-capacity missing, medication discrepancy flagged", () => {
    const r = runProtocol(buildInitialState(), null);
    expect(node(r.requirements, "functional-capacity")?.status).toBe("missing");
    expect(node(r.requirements, "medication-review")?.status).toBe("waiting-clinician");
    // No biomarker or cardiology yet — gated on functional capacity
    expect(node(r.requirements, "biomarker")).toBeUndefined();
    expect(node(r.requirements, "cardiology-review")).toBeUndefined();
    expect(r.pathwayStatus).toBe("in-progress");
  });

  it("ARISCAT fires on referral: HIGH risk (score ≥45) with optimization bundle", () => {
    const r = runProtocol(buildInitialState(), null);
    const ariscat = node(r.requirements, "ariscat-risk");
    expect(ariscat).toBeDefined();
    expect(ariscat?.status).toBe("satisfied"); // assessment ran
    expect(ariscat?.title).toContain("HIGH");
    // Optimization bundle present and non-blocking
    const bundle = r.requirements.filter((req) => req.id.startsWith("pulm-opt-"));
    expect(bundle.length).toBeGreaterThanOrEqual(4); // at minimum 4 items
    expect(bundle.every((b) => b.blocksScheduling === false)).toBe(true);
    expect(bundle.some((b) => b.id === "pulm-opt-smoking-cessation")).toBe(true);
    expect(bundle.some((b) => b.id === "pulm-opt-incentive-spirometry")).toBe(true);
  });

  it("biomarker node appears only after DASI is below threshold", () => {
    const state = buildInitialState();
    // Without DASI
    const r1 = runProtocol(state, null);
    expect(node(r1.requirements, "biomarker")).toBeUndefined();

    // With DASI ≈ 3 METs (below 4-MET threshold)
    state.questionnaires = [{ type: "DASI", score: 26, metsEstimate: 3.0 }];
    state.functionalCapacity = { status: "below", metsEstimate: 3.0 };
    const r2 = runProtocol(state, r1.graph);
    expect(node(r2.requirements, "functional-capacity")?.status).toBe("satisfied");
    expect(node(r2.requirements, "biomarker")).toBeDefined();
  });

  it("cardiology e-consult appears only after NT-proBNP is elevated (≥300 pg/mL)", () => {
    const state = buildInitialState();
    state.questionnaires = [{ type: "DASI", score: 26, metsEstimate: 3.0 }];
    state.functionalCapacity = { status: "below", metsEstimate: 3.0 };
    const r1 = runProtocol(state, null);
    // NT-proBNP below threshold: no cardiology node
    state.observations = [
      ...state.observations,
      {
        code: "33762-6",
        system: "http://loinc.org",
        text: "Natriuretic peptide.B prohormone N-Terminal",
        value: 150,
        unit: "pg/mL",
        provenance: { source: "synthetic", reference: "lab/test", extractedBy: "manual", verified: true, recordedAt: "2026-07-18" },
      },
    ];
    const r2 = runProtocol(state, r1.graph);
    expect(node(r2.requirements, "cardiology-review")).toBeUndefined();

    // NT-proBNP at/above threshold (480 pg/mL ≥ 300)
    state.observations = state.observations.filter((o) => !o.text.includes("Natriuretic"));
    state.observations = [
      ...state.observations,
      {
        code: "33762-6",
        system: "http://loinc.org",
        text: "Natriuretic peptide.B prohormone N-Terminal",
        value: 480,
        unit: "pg/mL",
        provenance: { source: "synthetic", reference: "lab/test", extractedBy: "manual", verified: true, recordedAt: "2026-07-18" },
      },
    ];
    const r3 = runProtocol(state, r2.graph);
    expect(node(r3.requirements, "cardiology-review")).toBeDefined();
    // Cardiology node title contains e-consult language
    expect(node(r3.requirements, "cardiology-review")?.title).toContain("Cardiology");
  });
});
