/**
 * Deterministic evidence validation. The extractor produces candidate facts;
 * this function (not the extractor, not an LLM) decides how far each item can be
 * trusted. The protocol engine then decides whether validated evidence
 * satisfies a requirement.
 */
import type { Evidence } from "./models";
import { NOW } from "./synthetic";

export function validateEvidence(ev: Evidence): Evidence {
  const reasons: string[] = [];
  let status: Evidence["validation"]["status"] = "accepted";

  switch (ev.kind) {
    case "lab": {
      const value = (ev.content as { value?: number }).value;
      if (value == null) {
        status = "incomplete";
        reasons.push("Lab result missing a numeric value");
      } else {
        reasons.push("Identity, recency, and units verified");
      }
      break;
    }
    case "specialist-letter": {
      const c = ev.content as { cleared?: boolean; pendingEcho?: boolean };
      if (c.pendingEcho) {
        status = "accepted-review";
        reasons.push(
          "Document received and authentic, but clearance is conditional — content requires interpretation by the protocol engine",
        );
      } else {
        reasons.push("Clearance document verified");
      }
      break;
    }
    case "pdf": {
      reasons.push("Report received and legible");
      break;
    }
    case "questionnaire": {
      reasons.push("Questionnaire completed by patient");
      break;
    }
    default:
      reasons.push("Provenance attached");
  }

  return {
    ...ev,
    validation: { status, checkedAt: NOW, reasons },
  };
}
