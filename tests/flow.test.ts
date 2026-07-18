import { describe, it, expect } from "vitest";
import { Case } from "../src/core/store";

function status(c: Case, id: string) {
  return c.getSnapshot().graph?.nodes.find((n) => n.id === id)?.status;
}
function has(c: Case, id: string) {
  return c.getSnapshot().graph?.nodes.some((n) => n.id === id) ?? false;
}

describe("end-to-end demo flow (mock provider)", () => {
  it("drives referral -> ready to schedule with the expected graph mutations", async () => {
    const c = new Case();

    // Beat 1-3: referral received; agent autonomously sends DASI.
    await c.start();
    expect(status(c, "rcri")).toBe("satisfied");
    expect(status(c, "functional-capacity")).toBe("waiting-patient"); // DASI sent
    expect(has(c, "biomarker")).toBe(false);

    // Beat 4: DASI below threshold -> biomarker node appears; agent searches
    // existing evidence first, then drafts the order (cost ladder).
    await c.submitDasi();
    expect(status(c, "functional-capacity")).toBe("satisfied");
    expect(has(c, "biomarker")).toBe(true);
    expect(status(c, "biomarker")).toBe("waiting-clinician"); // drafted, awaiting approval
    // proof it searched before ordering:
    expect(
      c.getSnapshot().toolLog.some((t) => t.tool === "searchExistingEvidence"),
    ).toBe(true);
    expect(
      c.getSnapshot().toolLog.some((t) => t.tool === "draftOrder"),
    ).toBe(true);

    await c.approveBiomarkerOrder();
    expect(status(c, "biomarker")).toBe("waiting-external");

    // Elevated result -> biomarker satisfied, cardiology review appears.
    await c.receiveLabResult();
    expect(status(c, "biomarker")).toBe("satisfied");
    expect(has(c, "cardiology-review")).toBe(true);

    // Beat 5 (the wow moment): conditional clearance does NOT close the node;
    // an echo requirement appears instead.
    await c.receiveCardiologyLetter();
    expect(status(c, "cardiology-review")).not.toBe("satisfied");
    expect(status(c, "cardiology-review")).toBe("waiting-external");
    expect(has(c, "echo")).toBe(true);
    expect(status(c, "echo")).not.toBe("satisfied");

    // Echo closes the loop.
    await c.receiveEcho();
    expect(status(c, "echo")).toBe("satisfied");
    expect(status(c, "cardiology-review")).toBe("satisfied");

    // Medication reconciliation.
    await c.approveMedicationTimeline();
    expect(status(c, "medication-review")).toBe("satisfied");

    // All blockers satisfied -> agent requests final approval; not yet ready.
    expect(c.getSnapshot().graph?.pathwayStatus).not.toBe("ready-to-schedule");

    // Beat 6: final approval -> ready to schedule.
    await c.finalApproval();
    expect(c.getSnapshot().graph?.pathwayStatus).toBe("ready-to-schedule");
    expect(status(c, "ready-to-schedule")).toBe("satisfied");
    expect(
      c.getSnapshot().toolLog.some((t) => t.tool === "markReadyToSchedule"),
    ).toBe(true);
  });

  it("never marks ready to schedule without final clinician approval", async () => {
    const c = new Case();
    await c.start();
    await c.submitDasi();
    await c.approveBiomarkerOrder();
    await c.receiveLabResult();
    await c.receiveCardiologyLetter();
    await c.receiveEcho();
    await c.approveMedicationTimeline();
    // Deliberately skip finalApproval.
    expect(c.getSnapshot().graph?.pathwayStatus).toBe("in-progress");
    expect(
      c.getSnapshot().toolLog.some((t) => t.tool === "markReadyToSchedule"),
    ).toBe(false);
  });
});
