import { describe, it, expect } from "vitest";
import { buildInitialState } from "../src/core/ingestion/ingest";
import { runProtocol } from "../src/core/protocol/engine";
import type { Requirement } from "../src/core/models";

function node(reqs: Requirement[], id: string): Requirement | undefined {
  return reqs.find((r) => r.id === id);
}

describe("protocol engine", () => {
  it("is deterministic: identical state -> identical output", () => {
    const a = runProtocol(buildInitialState(), null);
    const b = runProtocol(buildInitialState(), null);
    expect(JSON.stringify(a.requirements)).toEqual(JSON.stringify(b.requirements));
    expect(a.pathwayStatus).toEqual(b.pathwayStatus);
  });

  it("computes RCRI = 2 (intraperitoneal surgery + ischemic heart disease)", () => {
    const r = runProtocol(buildInitialState(), null);
    const rcri = node(r.requirements, "rcri");
    expect(rcri?.detail).toBe("RCRI = 2");
  });

  it("does not assume insulin diabetes or elevated creatinine (missing stays missing)", () => {
    const state = buildInitialState();
    runProtocol(state, null);
    const rcri = state.derived.rcri!;
    const insulin = rcri.components.find((c) => c.key === "insulin-diabetes");
    const cr = rcri.components.find((c) => c.key === "creatinine");
    expect(insulin?.present).toBe(false);
    expect(cr?.present).toBe(false);
    expect(rcri.score).toBe(2);
  });

  it("generates the initial blockers and no premature biomarker/cardiology nodes", () => {
    const r = runProtocol(buildInitialState(), null);
    expect(node(r.requirements, "functional-capacity")?.status).toBe("missing");
    expect(node(r.requirements, "medication-review")?.status).toBe(
      "waiting-clinician",
    );
    expect(node(r.requirements, "biomarker")).toBeUndefined();
    expect(node(r.requirements, "cardiology-review")).toBeUndefined();
    expect(r.pathwayStatus).toBe("in-progress");
  });

  it("adds the biomarker node only after DASI is below threshold", () => {
    const state = buildInitialState();
    state.questionnaires = [{ type: "DASI", metsEstimate: 3.4 }];
    const r = runProtocol(state, null);
    expect(node(r.requirements, "functional-capacity")?.status).toBe("satisfied");
    expect(node(r.requirements, "biomarker")).toBeDefined();
  });
});
