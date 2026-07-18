/**
 * Event-driven orchestrator (single agent, not multi-agent). One tick performs
 * at most one operational action:
 *   observe -> load state -> run protocol (already done by caller) ->
 *   compute valid candidates -> LLM chooses one -> safety gate -> execute ->
 *   persist. The caller loops ticks until no action remains, then waits.
 */
import type {
  AgentDecision,
  PatientState,
  ProtocolResult,
  ToolExecution,
} from "../models";
import { NOW } from "../synthetic";
import { checkSafety } from "../../safety/guard";
import { computeCandidates } from "./policy";
import { runTool } from "./tools";
import type { LlmProvider } from "./types";

export interface TickOutput {
  agentDecision: AgentDecision;
  toolExecution: ToolExecution;
  emittedEventType?: string;
  patientMessage?: string;
  blocked?: { reason: string };
}

let seq = 0;
function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}`;
}

export async function agentTick(params: {
  state: PatientState;
  protocol: ProtocolResult;
  provider: LlmProvider;
  searched: Set<string>;
  observedEvent: string;
}): Promise<TickOutput | null> {
  const { state, protocol, provider, searched, observedEvent } = params;

  const candidates = computeCandidates(state, protocol, searched);
  if (candidates.length === 0) return null;

  const choice = await provider.chooseAction({ candidates, state, protocol });
  if (!choice.tool) return null;

  const candidate =
    candidates.find((c) => c.tool === choice.tool) ?? candidates[0];

  const agentDecision: AgentDecision = {
    id: nextId("decision"),
    at: NOW,
    observedEvent,
    reasoning: choice.reasoning,
    chosenTool: candidate.tool,
    source: choice.source,
  };

  const guard = checkSafety(candidate, state, protocol);
  if (!guard.allowed) {
    const toolExecution: ToolExecution = {
      id: nextId("tool"),
      tool: candidate.tool,
      input: candidate.args,
      output: guard.reason,
      status: "blocked",
      audit: {
        decidedBy: "agent",
        at: NOW,
        idempotencyKey: `${candidate.tool}:${candidate.requirementId}`,
        reason: guard.reason,
      },
    };
    return { agentDecision, toolExecution, blocked: { reason: guard.reason } };
  }

  const result = runTool(state, candidate);
  const toolExecution: ToolExecution = {
    id: nextId("tool"),
    tool: candidate.tool,
    input: candidate.args,
    output: result.output,
    status: result.status,
    audit: {
      decidedBy: "agent",
      at: NOW,
      idempotencyKey: `${candidate.tool}:${candidate.requirementId}`,
      reason: guard.reason,
    },
  };

  return {
    agentDecision,
    toolExecution,
    emittedEventType: result.emittedEventType,
    patientMessage: result.patientMessage,
  };
}
