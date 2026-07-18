import { describe, it, expect } from "vitest";
import { Case } from "../src/core/store";

function status(c: Case, id: string) {
  return c.getSnapshot().graph?.nodes.find((n) => n.id === id)?.status;
}
function has(c: Case, id: string) {
  return c.getSnapshot().graph?.nodes.some((n) => n.id === id) ?? false;
}

describe("end-to-end demo flow (mock provider)", () => {
  it("Case A: Eleanor lobectomy — drives referral -> ready to schedule through dual pathway", async () => {
    const c = new Case();
    c.selectCase("A");

    // Beat 1: referral received — pulmonary + cardiac spines appear.
    await c.start();
    expect(status(c, "rcri")).toBe("satisfied"); // RCRI = 1
    expect(status(c, "pft")).toBe("missing"); // pulmonary spine: PFTs required
    expect(status(c, "functional-capacity")).toBe("waiting-patient"); // agent sent DASI
    expect(has(c, "biomarker")).toBe(false);

    // Pulmonary spine Beat 1: PFTs arrive — ppo < 40% → perfusion scan appears.
    await c.receivePftResult();
    expect(status(c, "pft")).toBe("satisfied");
    expect(has(c, "perfusion-scan")).toBe(true);
    expect(status(c, "perfusion-scan")).toBe("missing");

    // Pulmonary spine Beat 2: perfusion scan — ppo still < 40% → CPET appears.
    await c.receivePerfusionScan();
    expect(status(c, "perfusion-scan")).toBe("satisfied");
    expect(has(c, "cpet")).toBe(true);
    expect(status(c, "cpet")).toBe("missing");

    // Pulmonary spine Beat 3: CPET — VO₂max 13 → MDT review appears.
    await c.receiveCpetResult();
    expect(status(c, "cpet")).toBe("satisfied");
    expect(has(c, "mdt-review")).toBe(true);
    expect(status(c, "mdt-review")).toBe("waiting-clinician");

    // Cardiac spine Beat 1: DASI below threshold → biomarker node appears.
    await c.submitDasi();
    expect(status(c, "functional-capacity")).toBe("satisfied");
    expect(has(c, "biomarker")).toBe(true);
    expect(status(c, "biomarker")).toBe("waiting-clinician"); // drafted
    // Prove cost ladder: agent searched before ordering.
    expect(c.getSnapshot().toolLog.some((t) => t.tool === "searchExistingEvidence")).toBe(true);
    expect(c.getSnapshot().toolLog.some((t) => t.tool === "draftOrder")).toBe(true);

    await c.approveBiomarkerOrder();
    expect(status(c, "biomarker")).toBe("waiting-external");

    // Elevated NT-proBNP → cardiology review node appears.
    await c.receiveLabResult();
    expect(status(c, "biomarker")).toBe("satisfied");
    expect(has(c, "cardiology-review")).toBe(true);

    // Trust-but-verify beat: conditional clearance does NOT close cardiology node.
    await c.receiveCardiologyLetter();
    expect(status(c, "cardiology-review")).toBe("waiting-external"); // not satisfied
    expect(has(c, "echo")).toBe(true);
    expect(status(c, "echo")).not.toBe("satisfied");

    // Echo closes the cardiac loop.
    await c.receiveEcho();
    expect(status(c, "echo")).toBe("satisfied");
    expect(status(c, "cardiology-review")).toBe("satisfied");

    // Medication reconciliation (apixaban discrepancy).
    await c.approveMedicationTimeline();
    expect(status(c, "medication-review")).toBe("satisfied");

    // MDT review closes the pulmonary loop.
    await c.approveMdtReview();
    expect(status(c, "mdt-review")).toBe("satisfied");

    // All blockers satisfied — awaiting final approval.
    expect(c.getSnapshot().graph?.pathwayStatus).not.toBe("ready-to-schedule");

    // Final approval → ready to schedule.
    await c.finalApproval();
    expect(c.getSnapshot().graph?.pathwayStatus).toBe("ready-to-schedule");
    expect(status(c, "ready-to-schedule")).toBe("satisfied");
    expect(c.getSnapshot().toolLog.some((t) => t.tool === "markReadyToSchedule")).toBe(true);
  });

  it("Case B: David low-risk — resolves after start + final approval only", async () => {
    const c = new Case();
    c.selectCase("B");

    await c.start();
    // No testing indicated immediately.
    expect(has(c, "no-testing-indicated")).toBe(true);
    expect(status(c, "no-testing-indicated")).toBe("satisfied");
    expect(has(c, "biomarker")).toBe(false);
    expect(has(c, "cardiology-review")).toBe(false);
    expect(has(c, "pft")).toBe(false);
    // Ready to schedule is waiting-clinician (all blockers resolved, just needs final approval).
    expect(status(c, "ready-to-schedule")).toBe("waiting-clinician");

    await c.finalApproval();
    expect(c.getSnapshot().graph?.pathwayStatus).toBe("ready-to-schedule");
  });

  it("never marks ready to schedule without final clinician approval", async () => {
    const c = new Case();
    c.selectCase("A");
    await c.start();
    await c.receivePftResult();
    await c.receivePerfusionScan();
    await c.receiveCpetResult();
    await c.submitDasi();
    await c.approveBiomarkerOrder();
    await c.receiveLabResult();
    await c.receiveCardiologyLetter();
    await c.receiveEcho();
    await c.approveMedicationTimeline();
    await c.approveMdtReview();
    // Deliberately skip finalApproval.
    expect(c.getSnapshot().graph?.pathwayStatus).toBe("in-progress");
    expect(c.getSnapshot().toolLog.some((t) => t.tool === "markReadyToSchedule")).toBe(false);
  });
});
