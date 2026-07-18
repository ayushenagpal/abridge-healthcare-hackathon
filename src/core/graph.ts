import type {
  GraphDiff,
  ReadinessGraph,
  Requirement,
  RequirementStatus,
} from "./models";

const SATISFIED_STATES: RequirementStatus[] = ["satisfied", "not-indicated"];

export function isResolved(status: RequirementStatus): boolean {
  return SATISFIED_STATES.includes(status);
}

/**
 * Build the readiness graph (DAG) from the engine's requirements. Edges run
 * from a dependency to the node that depends on it. Blockers are unresolved
 * nodes that block scheduling. The critical path is the longest dependency
 * chain of unresolved blocking nodes ending at Ready To Schedule.
 */
export function buildGraph(
  version: number,
  requirements: Requirement[],
): ReadinessGraph {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const edges = requirements.flatMap((r) =>
    r.dependencies
      .filter((dep) => byId.has(dep))
      .map((dep) => ({ from: dep, to: r.id })),
  );

  const blockers = requirements
    .filter((r) => r.blocksScheduling && !isResolved(r.status))
    .map((r) => r.id);

  const pathwayStatus = derivePathwayStatus(requirements);
  const criticalPath = computeCriticalPath(requirements, byId);

  return {
    version,
    nodes: requirements,
    edges,
    criticalPath,
    blockers,
    pathwayStatus,
  };
}

function derivePathwayStatus(
  requirements: Requirement[],
): ReadinessGraph["pathwayStatus"] {
  if (requirements.some((r) => r.status === "unsupported")) return "unsupported";
  if (requirements.some((r) => r.status === "blocked")) return "human-review";

  const ready = requirements.find((r) => r.id === "ready-to-schedule");
  if (ready && isResolved(ready.status)) return "ready-to-schedule";

  return "in-progress";
}

/**
 * Longest chain (by node count) of unresolved blocking requirements, following
 * dependency edges. Deterministic: ties broken by requirement id order.
 */
function computeCriticalPath(
  requirements: Requirement[],
  byId: Map<string, Requirement>,
): string[] {
  const memo = new Map<string, string[]>();

  function longestFrom(id: string): string[] {
    if (memo.has(id)) return memo.get(id)!;
    const node = byId.get(id);
    if (!node) return [];
    // dependents = nodes that depend on this one
    const dependents = requirements
      .filter((r) => r.dependencies.includes(id))
      .map((r) => r.id)
      .sort();
    let best: string[] = [];
    for (const d of dependents) {
      const chain = longestFrom(d);
      if (chain.length > best.length) best = chain;
    }
    const result = [id, ...best];
    memo.set(id, result);
    return result;
  }

  const unresolvedBlocking = requirements
    .filter((r) => r.blocksScheduling && !isResolved(r.status))
    .map((r) => r.id)
    .sort();

  let best: string[] = [];
  for (const id of unresolvedBlocking) {
    const chain = longestFrom(id).filter((cid) => {
      const n = byId.get(cid);
      return n ? !isResolved(n.status) : false;
    });
    if (chain.length > best.length) best = chain;
  }
  return best;
}

/** Compare two graphs and produce a structural diff. */
export function diffGraph(
  prev: ReadinessGraph | null,
  next: ReadinessGraph,
): GraphDiff {
  const prevNodes = new Map((prev?.nodes ?? []).map((n) => [n.id, n]));
  const nextNodes = new Map(next.nodes.map((n) => [n.id, n]));

  const added: string[] = [];
  const removed: string[] = [];
  const reopened: string[] = [];
  const closed: string[] = [];
  const statusChanged: GraphDiff["statusChanged"] = [];

  for (const [id, node] of nextNodes) {
    const before = prevNodes.get(id);
    if (!before) {
      added.push(id);
      continue;
    }
    if (before.status !== node.status) {
      statusChanged.push({ id, from: before.status, to: node.status });
      if (!isResolved(before.status) && isResolved(node.status)) closed.push(id);
      if (isResolved(before.status) && !isResolved(node.status))
        reopened.push(id);
    }
  }
  for (const id of prevNodes.keys()) {
    if (!nextNodes.has(id)) removed.push(id);
  }

  return { added, removed, reopened, closed, statusChanged };
}
