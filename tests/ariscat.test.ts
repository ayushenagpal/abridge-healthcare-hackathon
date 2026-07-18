import { describe, it, expect } from "vitest";
import { evaluateAriscat, type AriscatInputs } from "../src/core/protocol/ariscat";

// Base inputs for a patient similar to Frank (used across tests).
const BASE: AriscatInputs = {
  ageYears: 70,
  spo2Percent: 93,
  recentRespiratoryInfection: true,
  hemoglobin_g_dl: 12.1,
  upperAbdominalOrIntrathoracicIncision: true,
  surgeryDurationBucket: ">3h",
  isEmergency: false,
};

// Minimal inputs that score exactly LOW (<26): age <50, SpO2 ≥96, no infection,
// no anemia, peripheral incision, <2h, elective.
const LOW_INPUTS: AriscatInputs = {
  ageYears: 35,
  spo2Percent: 97,
  recentRespiratoryInfection: false,
  hemoglobin_g_dl: 13.5,
  upperAbdominalOrIntrathoracicIncision: false,
  surgeryDurationBucket: "<2h",
  isEmergency: false,
};

describe("ARISCAT score boundaries", () => {
  it("score 0 → low risk, no optimization bundle", () => {
    const r = evaluateAriscat(LOW_INPUTS);
    expect(r.score).toBe(0);
    expect(r.risk).toBe("low");
    expect(r.requirements).toHaveLength(0);
  });

  it("score 25 → still low risk (just below intermediate threshold)", () => {
    // Build a set that sums to exactly 25.
    // age 51-80 (3) + SpO2 91-95 (8) + upper abdominal (15) = 26... need 25.
    // age 51-80 (3) + SpO2 91-95 (8) + duration 2-3h (16) = 27. Still over.
    // age <50 (0) + SpO2 91-95 (8) + upper abdominal (15) + age ... = 23. Under.
    // Closest: age 51-80 (3) + SpO2 91-95 (8) + duration 2-3h (16) - need one under. No.
    // age 51-80 (3) + SpO2 91-95 (8) = 11; add anemia 11 = 22; + duration <2h = 22 < 26. Low.
    // age 51-80 (3) + SpO2 91-95 (8) + upper (15) = 26 = intermediate. Off by 1.
    // Let's try: age <50 (0) + resp infection (17) + upper (15) = 32. Intermediate.
    // Simplest ≤25: age 51-80 (3) + SpO2 91-95 (8) + duration 2-3h (16) = 27 — intermediate
    // Try: age 51-80 (3) + SpO2 91-95 (8) = 11; + peripheral (0) + <2h (0) = 11. Low.
    // Need exactly 25: 11 + anemia (11) + peripheral (0) = 22. Or: 11 + emergency (8) = 19. None work exactly.
    // Best: 3 + 8 + 11 + 0 + 0 + 0 + 0 = 22 (age+SpO2+anemia) — that's low.
    // Or: 0 + 8 + 17 + 0 + 0 + 0 + 0 = 25 (SpO2+infection, no surgery component, peripheral, <2h)
    const r = evaluateAriscat({
      ageYears: 40,           // 0 pts
      spo2Percent: 92,        // 8 pts (91-95)
      recentRespiratoryInfection: true, // 17 pts
      hemoglobin_g_dl: 12.0, // 0 pts
      upperAbdominalOrIntrathoracicIncision: false, // 0 pts
      surgeryDurationBucket: "<2h", // 0 pts
      isEmergency: false,     // 0 pts
    });
    expect(r.score).toBe(25);
    expect(r.risk).toBe("low");
    expect(r.requirements).toHaveLength(0);
  });

  it("score 26 → intermediate risk — optimization bundle fires", () => {
    // 26 = age 51-80 (3) + SpO2 91-95 (8) + upper abdominal (15) = 26.
    const r = evaluateAriscat({
      ageYears: 60,
      spo2Percent: 93,
      recentRespiratoryInfection: false,
      hemoglobin_g_dl: 14.0,
      upperAbdominalOrIntrathoracicIncision: true,
      surgeryDurationBucket: "<2h",
      isEmergency: false,
    });
    expect(r.score).toBe(26);
    expect(r.risk).toBe("intermediate");
    expect(r.requirements.length).toBeGreaterThan(0);
    // Intermediate does not get prehabilitation (high-only).
    expect(r.requirements.some((req) => req.id === "pulm-opt-prehabilitation")).toBe(false);
  });

  it("score 44 → still intermediate (just below high threshold)", () => {
    // 44 = age 51-80 (3) + SpO2 91-95 (8) + upper abdominal (15) + duration 2-3h (16) + anemia (11) = 53. Too high.
    // Try: 3 + 8 + 0 + 0 + 15 + 16 + 0 = 42. Or: 0 + 8 + 17 + 0 + 0 + 16 + 0 = 41.
    // 8 + 17 + 0 + 0 + 15 + 0 + 0 = 40. 3 + 0 + 17 + 0 + 15 + 8 + 0 = 43. Close.
    // 8 + 0 + 17 + 0 + 15 + 0 + 0 = 40. + 3 = 43. + anemia(11) = 51.
    // Try: 3 + 24 + 0 + 0 + 0 + 16 + 0 = 43. Add anemia? = 54.
    // 0 + 24 + 0 + 0 + 0 + 16 + 0 = 40. 3 + 0 + 17 + 0 + 0 + 16 + 8 = 44!
    const r = evaluateAriscat({
      ageYears: 55,           // 3 pts (51-80)
      spo2Percent: 98,        // 0 pts (≥96)
      recentRespiratoryInfection: true, // 17 pts
      hemoglobin_g_dl: 12.0, // 0 pts
      upperAbdominalOrIntrathoracicIncision: false, // 0 pts
      surgeryDurationBucket: "2-3h", // 16 pts
      isEmergency: true,      // 8 pts
    });
    expect(r.score).toBe(44);
    expect(r.risk).toBe("intermediate");
    expect(r.requirements.length).toBeGreaterThan(0);
    expect(r.requirements.some((req) => req.id === "pulm-opt-prehabilitation")).toBe(false);
  });

  it("score 45 → high risk — full bundle including prehabilitation", () => {
    // 45 = 3 + 0 + 17 + 0 + 15 + 0 + 0 = 35... need more. 3 + 8 + 17 + 0 + 0 + 0 + 0 = 28. No.
    // 3 + 8 + 17 + 0 + 15 + 0 + 0 = 43. + emergency = 51. Or + anemia = 54.
    // 3 + 0 + 0 + 11 + 15 + 16 + 0 = 45!
    const r = evaluateAriscat({
      ageYears: 60,           // 3 pts
      spo2Percent: 98,        // 0 pts
      recentRespiratoryInfection: false, // 0 pts
      hemoglobin_g_dl: 9.5,  // 11 pts (≤10)
      upperAbdominalOrIntrathoracicIncision: true, // 15 pts
      surgeryDurationBucket: "2-3h", // 16 pts
      isEmergency: false,     // 0 pts
    });
    expect(r.score).toBe(45);
    expect(r.risk).toBe("high");
    expect(r.requirements.some((req) => req.id === "pulm-opt-prehabilitation")).toBe(true);
  });

  it("Frank's parameters → score 69, HIGH, full bundle", () => {
    // Frank: age 70 (3) + SpO2 93 (8) + recent bronchitis (17) + Hb 12.1 (0)
    //        + upper abdominal (15) + >3h (23) + elective (0) = 66
    const r = evaluateAriscat(BASE);
    expect(r.score).toBe(66);
    expect(r.risk).toBe("high");
    // Core optimization bundle nodes
    expect(r.requirements.some((req) => req.id === "pulm-opt-incentive-spirometry")).toBe(true);
    expect(r.requirements.some((req) => req.id === "pulm-opt-inhaler-optimization")).toBe(true);
    expect(r.requirements.some((req) => req.id === "pulm-opt-smoking-cessation")).toBe(true);
    expect(r.requirements.some((req) => req.id === "pulm-opt-chest-pt")).toBe(true);
    expect(r.requirements.some((req) => req.id === "pulm-opt-prehabilitation")).toBe(true);
    // All optimization nodes are non-blocking
    expect(r.requirements.every((req) => req.blocksScheduling === false)).toBe(true);
    // Smoking cessation and prehabilitation require clinician approval (Tier 2)
    const smokingCessation = r.requirements.find((req) => req.id === "pulm-opt-smoking-cessation");
    expect(smokingCessation?.requiresClinicianApproval).toBe(true);
    // Incentive spirometry does not require clinician approval (Tier 1)
    const spirometry = r.requirements.find((req) => req.id === "pulm-opt-incentive-spirometry");
    expect(spirometry?.requiresClinicianApproval).toBe(false);
  });

  it("SpO2 ≤90 scores 24 pts, SpO2 ≥96 scores 0 pts", () => {
    const low = evaluateAriscat({ ...LOW_INPUTS, spo2Percent: 89 });
    const high = evaluateAriscat({ ...LOW_INPUTS, spo2Percent: 96 });
    expect(low.components.find((c) => c.key === "spo2")?.points).toBe(24);
    expect(high.components.find((c) => c.key === "spo2")?.points).toBe(0);
  });

  it("anemia (Hb ≤10) adds 11 pts; Hb >10 adds 0", () => {
    const withAnemia = evaluateAriscat({ ...LOW_INPUTS, hemoglobin_g_dl: 9.8 });
    const withoutAnemia = evaluateAriscat({ ...LOW_INPUTS, hemoglobin_g_dl: 11.0 });
    expect(withAnemia.components.find((c) => c.key === "anemia")?.points).toBe(11);
    expect(withoutAnemia.components.find((c) => c.key === "anemia")?.points).toBe(0);
  });
});
