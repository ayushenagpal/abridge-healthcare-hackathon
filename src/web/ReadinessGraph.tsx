import { useMemo } from "react";
import ReactFlow, {
  Background,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import type { ReadinessGraph as Graph, Requirement } from "../core/models";
import { STATUS_LABEL, STATUS_TONE } from "./status";

function StatusNode({ data }: NodeProps<{ req: Requirement; critical: boolean }>) {
  const { req, critical } = data;
  const tone = STATUS_TONE[req.status];
  return (
    <div
      className={`rf-node tone-${tone} ${critical ? "critical" : ""}`}
      title={req.guidelineReference.text}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="t">{req.title}</div>
      {req.detail && <div className="d">{req.detail}</div>}
      <div className="np">
        <span className={`pill tone-${tone}`}>{STATUS_LABEL[req.status]}</span>
        {critical && <span className="np-crit">critical path</span>}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { status: StatusNode };

/** Layer nodes by longest dependency depth for a clean left-to-right DAG. */
function layout(graph: Graph): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const depthMemo = new Map<string, number>();
  const depth = (id: string): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    const node = byId.get(id);
    if (!node || node.dependencies.length === 0) {
      depthMemo.set(id, 0);
      return 0;
    }
    const d =
      1 + Math.max(...node.dependencies.filter((x) => byId.has(x)).map(depth), -1);
    depthMemo.set(id, d);
    return d;
  };

  const byDepth = new Map<number, string[]>();
  for (const n of graph.nodes) {
    const d = depth(n.id);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n.id);
  }

  // Column & row spacing sized to the node box (172w × ~92h) with generous
  // gaps so dense cases (dual pulmonary + cardiac spines) never overlap.
  const COL = 250;
  const ROW = 150;
  const maxRows = Math.max(...[...byDepth.values()].map((c) => c.length), 1);
  const critical = new Set(graph.criticalPath);
  const nodes: Node[] = graph.nodes.map((req) => {
    const d = depth(req.id);
    const col = byDepth.get(d)!;
    const row = col.indexOf(req.id);
    // vertically center each column's stack so the layout reads as balanced
    const yOffset = ((maxRows - col.length) * ROW) / 2;
    return {
      id: req.id,
      type: "status",
      position: { x: d * COL, y: yOffset + row * ROW },
      data: { req, critical: critical.has(req.id) },
      draggable: true,
    };
  });

  const edges: Edge[] = graph.edges.map((e) => {
    const onPath = critical.has(e.from) && critical.has(e.to);
    return {
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      pathOptions: { borderRadius: 14 },
      animated: onPath,
      style: {
        stroke: onPath ? "#0f766e" : "#d7d9d3",
        strokeWidth: onPath ? 2 : 1.25,
      },
    };
  });

  return { nodes, edges };
}

export function ReadinessGraph({ graph }: { graph: Graph | null }) {
  const { nodes, edges } = useMemo(
    () => (graph ? layout(graph) : { nodes: [], edges: [] }),
    [graph],
  );

  if (!graph) {
    return (
      <div className="empty" style={{ marginTop: 120 }}>
        No case yet. Click <b>Start Referral</b> to begin.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background color="#e2e8f0" gap={20} />
    </ReactFlow>
  );
}
