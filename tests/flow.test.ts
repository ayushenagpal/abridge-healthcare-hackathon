import { describe, it, expect } from "vitest";
import { Case } from "../src/core/store";

function status(c: Case, id: string) {
  return c.getSnapshot().graph?.nodes.find((n) => n.id === id)?.status;
}
function has(c: Case, id: string) {
  return c.getSnapshot().graph?.nodes.some((n) => n.id === id) ?? false;
}

describe("end-to-end demo flow — Frank Delgado, open colectomy", () => {
  it("drives referral to ready-to-schedule through cardiac escalation + pulmonary optimization", async () => {
    const c = new Case();

    // Beat 1: referral received.
    // RCRI=3, ARISCAT HIGH → optimization bundle fires, DASI sent automatically.
    await c.start();
    expect(status(c, "rcri")).toBe("satisfied");          // RCRI = 3
    expect(status(c, "functional-capacity")).toBe("waiting-patient"); // DASI sent
    expect(has(c, "ariscat-risk")).toBe(true);            // ARISCAT scored
    expect(status(c, "ariscat-risk")).toBe("satisfied");  // non-blocking assessment
    expect(has(c, "pulm-opt-incentive-spirometry")).toBe(true); // bundle fires
    expect(has(c, "pulm-opt-smoking-cessation")).toBe(true);
    expect(has(c, "biomarker")).toBe(false);              // gated on DASI

    // Beat 2: DASI 26 (3 METs, below threshold) → biomarker node appears.
    await c.submitDasi();
    expect(status(c, "functional-capacity")).toBe("satisfied");
    expect(has(c, "biomarker")).toBe(true);
    expect(status(c, "biomarker")).toBe("waiting-clinician"); // agent drafted order
    // Prove cost ladder: searched before ordering.
    expect(c.getSnapshot().toolLog.some((t) => t.tool === "searchExistingEvidence")).toBe(true);
    expect(c.getSnapshot().toolLog.some((t) => t.tool === "draftOrder")).toBe(true);

    await c.approveBiomarkerOrder();
    expect(status(c, "biomarker")).toBe("waiting-external");

    // Beat 3: NT-proBNP 480 pg/mL (≥300, elevated) → cardiology e-consult appears.
    await c.receiveLabResult();
    expect(status(c, "biomarker")).toBe("satisfied");
    expect(has(c, "cardiology-review")).toBe(true);

    // Beat 4: trust-but-verify — conditional clearance does NOT close node.
    await c.receiveCardiologyLetter();
    expect(status(c, "cardiology-review")).toBe("waiting-external");
    expect(has(c, "echo")).toBe(true);
    expect(status(c, "echo")).not.toBe("satisfied");

    // Beat 5: echo closes the cardiac loop.
    await c.receiveEcho();
    expect(status(c, "echo")).toBe("satisfied");
    expect(status(c, "cardiology-review")).toBe("satisfied");

    // Beat 6: medication timeline — empagliflozin discrepancy resolved.
    await c.approveMedicationTimeline();
    expect(status(c, "medication-review")).toBe("satisfied");

    // All blocking nodes satisfied; pulmonary optimization nodes remain non-blocking.
    expect(c.getSnapshot().graph?.pathwayStatus).not.toBe("ready-to-schedule");

    // Beat 7: final approval → ready to schedule.
    await c.finalApproval();
    expect(c.getSnapshot().graph?.pathwayStatus).toBe("ready-to-schedule");
    expect(status(c, "ready-to-schedule")).toBe("satisfied");
    expect(c.getSnapshot().toolLog.some((t) => t.tool === "markReadyToSchedule")).toBe(true);
  });

  it("optimization bundle is non-blocking: all pulm-opt nodes have blocksScheduling=false", async () => {
    const c = new Case();
    await c.start();
    const graph = c.getSnapshot().graph!;
    const bundleNodes = graph.nodes.filter((n) => n.id.startsWith("pulm-opt-"));
    expect(bundleNodes.length).toBeGreaterThan(0);
    expect(bundleNodes.every((n) => n.blocksScheduling === false)).toBe(true);
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
    expect(c.getSnapshot().toolLog.some((t) => t.tool === "markReadyToSchedule")).toBe(false);
  });
});
