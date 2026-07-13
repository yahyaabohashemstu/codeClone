import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Cpu, Maximize2, MousePointerClick, ZoomIn, ZoomOut } from "lucide-react";

type GraphTone = "primary" | "accent";

// Two-tone coding: primary side = ink navy (the one accent), suspect side =
// terracotta. Both fully token-based (--primary / --accent-suspect) so they
// track light/dark. Replaces the old hardcoded indigo/cyan neon.
function getGraphToneColor(color: GraphTone) {
  return color === "primary" ? "hsl(var(--primary))" : "hsl(var(--accent-suspect))";
}

function getGraphEdgePalette(color: GraphTone) {
  return color === "primary"
    ? { base: "hsl(var(--primary) / 0.38)", highlighted: "hsl(var(--primary))" }
    : { base: "hsl(var(--accent-suspect) / 0.38)", highlighted: "hsl(var(--accent-suspect))" };
}

type RawPoint = [number, number] | null | undefined;

type RawNodeEntry = {
  data?: {
    id?: string | number;
    label?: string;
    type?: string;
    start?: RawPoint;
    end?: RawPoint;
  };
};

type RawEdgeEntry = {
  data?: {
    id?: string | number;
    source?: string | number;
    target?: string | number;
  };
};

type NormalizedGraph = {
  nodes: RawNodeEntry[];
  edges: RawEdgeEntry[];
};

type AstFlowNodeData = {
  id: string;
  label: string;
  title: string;
  tone: GraphTone;
  isRoot: boolean;
  isPathNode: boolean;
  isPathTerminal: boolean;
  lineRange: string;
  childCount: number;
  parentCount: number;
  depth: number;
};

// @xyflow/react v12 parameterizes NodeProps/NodeTypes on the full Node type
// (not just the data payload), so wrap the data shape in Node<…>.
type AstFlowNode = Node<AstFlowNodeData, "astNode">;

type LayoutNode = {
  id: string;
  label: string;
  title: string;
  isRoot: boolean;
  lineRange: string;
  childCount: number;
  parentCount: number;
  depth: number;
  width: number;
  height: number;
  x: number;
  y: number;
};

type AstNodeDetail = {
  id: string;
  label: string;
  title: string;
  tone: GraphTone;
  isRoot: boolean;
  lineRange: string;
  childCount: number;
  parentCount: number;
  depth: number;
};

type FlowGraph = {
  nodes: Node<AstFlowNodeData>[];
  edges: Edge[];
  nodeDetails: Record<string, AstNodeDetail>;
  parentIdsByNode: Record<string, string[]>;
  incomingEdgeIdsByNode: Record<string, string[]>;
  summary: {
    nodeCount: number;
    edgeCount: number;
    rootCount: number;
    truncated: boolean;
    totalNodeCount: number;
  };
};

// Very large ASTs (thousands of nodes) freeze the tab when every node/edge is
// laid out and mounted. Mirroring DiffViewer's line cap, render only the first
// MAX_GRAPH_NODES nodes (and edges whose endpoints both survive) and surface a
// notice so the truncation is visible rather than silent.
const MAX_GRAPH_NODES = 600;

interface AstGraphPanelProps {
  title: string;
  color: GraphTone;
  elements: unknown;
}

interface GraphExplorerProps {
  color: GraphTone;
  flowGraph: FlowGraph;
  graphNodes: Node<AstFlowNodeData>[];
  graphEdges: Edge[];
  selectedNode: AstNodeDetail | null;
  onSelectNodeId: (nodeId: string | null) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onOpenFullscreen?: () => void;
  surfaceStyle?: CSSProperties;
  containerClassName?: string;
  fitPadding?: number;
  minZoom?: number;
}

function isEdgeEntry(entry: unknown): entry is RawEdgeEntry {
  if (!entry || typeof entry !== "object") return false;
  const data = (entry as { data?: RawEdgeEntry["data"] }).data;
  return !!data && data.source !== undefined && data.target !== undefined;
}

function normalizeElements(elements: unknown): NormalizedGraph {
  if (Array.isArray(elements)) {
    return {
      nodes: elements.filter((item) => !isEdgeEntry(item)) as RawNodeEntry[],
      edges: elements.filter(isEdgeEntry),
    };
  }

  if (elements && typeof elements === "object") {
    const candidate = elements as { nodes?: unknown[]; edges?: unknown[]; elements?: { nodes?: unknown[]; edges?: unknown[] } };
    const nested = candidate.elements;
    return {
      nodes: Array.isArray(candidate.nodes)
        ? (candidate.nodes as RawNodeEntry[])
        : Array.isArray(nested?.nodes)
          ? (nested.nodes as RawNodeEntry[])
          : [],
      edges: Array.isArray(candidate.edges)
        ? (candidate.edges as RawEdgeEntry[])
        : Array.isArray(nested?.edges)
          ? (nested.edges as RawEdgeEntry[])
          : [],
    };
  }

  return { nodes: [], edges: [] };
}

function formatNodeLabel(node: RawNodeEntry, index: number) {
  const value = node.data?.type || node.data?.label || `Node ${index + 1}`;
  return String(value).replace(/_/g, " ");
}

function formatLineRange(start: RawPoint, end: RawPoint, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (!Array.isArray(start) || typeof start[0] !== "number") return "";
  const startLine = start[0] + 1;
  const endLine = Array.isArray(end) && typeof end[0] === "number" ? end[0] + 1 : startLine;
  if (endLine === startLine) {
    return t("results.astGraph.lineLabel", { line: startLine });
  }
  return t("results.astGraph.linesLabel", { start: startLine, end: endLine });
}

function estimateNodeBox(label: string) {
  const normalized = label.trim() || "node";
  const width = Math.min(170, Math.max(84, normalized.length * 6.4 + 28));
  const charsPerLine = Math.max(10, Math.floor((width - 20) / 6.15));
  const lineCount = Math.min(2, Math.max(1, Math.ceil(normalized.length / charsPerLine)));
  const labelHeight = lineCount === 1 ? 28 : 42;
  const height = 18 + 8 + labelHeight;

  return { width, height };
}

const TREE_LEVEL_GAP = 118;
const TREE_SIBLING_GAP = 16;
const TREE_LEVEL_TOP_PADDING = 18;
const TREE_CANVAS_LEFT_PADDING = 24;

function buildTreeLayout(
  baseNodes: LayoutNode[],
  childrenByParent: Map<string, string[]>,
  orderedRootIds: string[],
) {
  const nodesById = new Map(baseNodes.map((node) => [node.id, node]));
  const parentIdsByNode = new Map<string, string[]>();
  const nodeOrderIndex = new Map(baseNodes.map((node, index) => [node.id, index]));
  const depthByNodeId = new Map<string, number>();
  const queue = [...orderedRootIds];

  for (const rootId of orderedRootIds) {
    depthByNodeId.set(rootId, 0);
  }

  for (const [parentId, childIds] of childrenByParent.entries()) {
    for (const childId of childIds) {
      const parents = parentIdsByNode.get(childId) ?? [];
      parents.push(parentId);
      parentIdsByNode.set(childId, parents);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const currentDepth = depthByNodeId.get(currentId) ?? 0;
    for (const childId of childrenByParent.get(currentId) ?? []) {
      const nextDepth = currentDepth + 1;
      const knownDepth = depthByNodeId.get(childId);
      if (knownDepth === undefined || nextDepth < knownDepth) {
        depthByNodeId.set(childId, nextDepth);
      }
      queue.push(childId);
    }
  }

  let fallbackDepth = Math.max(0, ...depthByNodeId.values());
  for (const node of baseNodes) {
    if (!depthByNodeId.has(node.id)) {
      fallbackDepth += 1;
      depthByNodeId.set(node.id, fallbackDepth);
    }
  }

  const levels = new Map<number, LayoutNode[]>();
  for (const node of baseNodes) {
    const depth = depthByNodeId.get(node.id) ?? 0;
    node.depth = depth;
    const levelNodes = levels.get(depth) ?? [];
    levelNodes.push(node);
    levels.set(depth, levelNodes);
  }

  const depthKeys = [...levels.keys()].sort((left, right) => left - right);
  const orderByNodeId = new Map<string, number>();

  for (const depth of depthKeys) {
    const levelNodes = levels.get(depth) ?? [];
    levelNodes.sort((leftNode, rightNode) => {
      const leftParents = parentIdsByNode.get(leftNode.id) ?? [];
      const rightParents = parentIdsByNode.get(rightNode.id) ?? [];
      const leftAnchor = leftParents.length
        ? leftParents.reduce((total, parentId) => total + (orderByNodeId.get(parentId) ?? 0), 0) / leftParents.length
        : orderByNodeId.get(leftNode.id) ?? nodeOrderIndex.get(leftNode.id) ?? 0;
      const rightAnchor = rightParents.length
        ? rightParents.reduce((total, parentId) => total + (orderByNodeId.get(parentId) ?? 0), 0) / rightParents.length
        : orderByNodeId.get(rightNode.id) ?? nodeOrderIndex.get(rightNode.id) ?? 0;

      if (leftAnchor !== rightAnchor) {
        return leftAnchor - rightAnchor;
      }

      return (nodeOrderIndex.get(leftNode.id) ?? 0) - (nodeOrderIndex.get(rightNode.id) ?? 0);
    });

    levelNodes.forEach((node, index) => {
      orderByNodeId.set(node.id, index);
    });
  }

  const widestLevelWidth = Math.max(
    ...depthKeys.map((depth) => {
      const levelNodes = levels.get(depth) ?? [];
      return levelNodes.reduce((total, node, index) => total + node.width + (index > 0 ? TREE_SIBLING_GAP : 0), 0);
    }),
    0,
  );

  for (const depth of depthKeys) {
    const levelNodes = levels.get(depth) ?? [];
    const levelWidth = levelNodes.reduce((total, node, index) => total + node.width + (index > 0 ? TREE_SIBLING_GAP : 0), 0);
    let currentLeft = TREE_CANVAS_LEFT_PADDING + (widestLevelWidth - levelWidth) / 2;

    for (const node of levelNodes) {
      node.x = currentLeft + node.width / 2;
      node.y = TREE_LEVEL_TOP_PADDING + depth * TREE_LEVEL_GAP + node.height / 2;
      currentLeft += node.width + TREE_SIBLING_GAP;
    }
  }

  return baseNodes;
}

const AstNode = memo(({ data, selected }: NodeProps<AstFlowNode>) => {
  // The .ast-flow-* CSS now paints a flat token surface (no neon, no glow).
  // We still set node tone (navy / suspect) and the selection/path border
  // inline so a node's emphasis tracks the live theme tokens directly, in
  // both light and dark.
  const toneColor = getGraphToneColor(data.tone);
  const isEmphasized = selected || data.isPathTerminal;
  const cardStyle: CSSProperties = {
    background: "hsl(var(--card))",
    borderColor: isEmphasized
      ? toneColor
      : data.isPathNode
        ? "hsl(var(--foreground) / 0.35)"
        : "hsl(var(--border))",
    boxShadow: "none",
  };
  const labelStyle: CSSProperties = { color: "hsl(var(--foreground))", textShadow: "none" };
  const dotStyle: CSSProperties = {
    background: toneColor,
    borderColor: "hsl(var(--border))",
    boxShadow: "none",
  };

  return (
    <div
      className={cn(
        "ast-flow-compact-node",
        data.tone === "primary" ? "ast-flow-node-primary" : "ast-flow-node-accent",
        data.isRoot && "ast-flow-node-root",
        data.isPathNode && "ast-flow-node-in-path",
        data.isPathTerminal && "ast-flow-node-terminal-path",
        selected && "ast-flow-node-selected",
      )}
      title={data.title || data.label}
    >
      <Handle type="target" position={Position.Top} className="ast-flow-handle ast-flow-handle-target" />
      <div className="ast-flow-compact-dot" style={dotStyle} />
      <div className="ast-flow-label-card" style={cardStyle}>
        <div className="ast-flow-compact-label" style={labelStyle}>{data.label}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="ast-flow-handle ast-flow-handle-source" />
    </div>
  );
});
AstNode.displayName = "AstNode";

const nodeTypes: NodeTypes = {
  astNode: AstNode as NodeTypes[string],
};

function GraphExplorer({
  color,
  flowGraph,
  graphNodes,
  graphEdges,
  selectedNode,
  onSelectNodeId,
  t,
  onOpenFullscreen,
  surfaceStyle,
  containerClassName,
  fitPadding = 0.1,
  minZoom = 0.08,
}: GraphExplorerProps) {
  const flowRef = useRef<ReactFlowInstance<Node<AstFlowNodeData>, Edge> | null>(null);

  const fitGraph = () => {
    flowRef.current?.fitView({ padding: fitPadding, duration: 280, minZoom, maxZoom: 1.25 });
  };

  const zoomIn = () => {
    flowRef.current?.zoomIn({ duration: 180 });
  };

  const zoomOut = () => {
    flowRef.current?.zoomOut({ duration: 180 });
  };

  return (
    <div className={cn("flex flex-col overflow-hidden", containerClassName)}>
      <div className="border-b border-border/40 bg-muted/10 px-5 py-4">
        {selectedNode ? (
          <div className="ast-node-detail-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn("ast-node-detail-dot", selectedNode.tone === "primary" ? "is-primary" : "is-accent")}
                    style={{ background: getGraphToneColor(selectedNode.tone), boxShadow: "none" }}
                  />
                  <span className="text-sm font-semibold text-foreground">{selectedNode.label}</span>
                  <span className="badge-info">
                    {selectedNode.isRoot ? t("results.astGraph.rootNode") : t("results.astGraph.nestedNode")}
                  </span>
                </div>
                <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  {selectedNode.isRoot
                    ? t("results.astGraph.rootNodeDescription")
                    : t("results.astGraph.nestedNodeDescription")}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 border-border/60 text-xs" onClick={() => onSelectNodeId(null)}>
                {t("results.astGraph.clearSelection")}
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="ast-node-detail-card">
                <div className="ast-node-detail-label">{t("results.astGraph.nodeId")}</div>
                <div className="ast-node-detail-value font-mono">{selectedNode.id}</div>
              </div>
              <div className="ast-node-detail-card">
                <div className="ast-node-detail-label">{t("results.astGraph.lineRange")}</div>
                <div className="ast-node-detail-value">{selectedNode.lineRange || t("results.astGraph.noLineMetadata")}</div>
              </div>
              <div className="ast-node-detail-card">
                <div className="ast-node-detail-label">{t("results.astGraph.depthLevel")}</div>
                <div className="ast-node-detail-value">{selectedNode.depth}</div>
              </div>
              <div className="ast-node-detail-card">
                <div className="ast-node-detail-label">{t("results.astGraph.connections")}</div>
                <div className="ast-node-detail-value">{t("results.astGraph.incomingOutgoing", { incoming: selectedNode.parentCount, outgoing: selectedNode.childCount })}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="ast-node-detail-empty">
            <div className="ast-node-detail-empty-icon">
              <MousePointerClick className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t("results.astGraph.clickNodeTitle")}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("results.astGraph.clickNodeDescription")}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border/40 bg-background/70 px-5 py-3">
        {onOpenFullscreen && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border/60 text-xs" onClick={onOpenFullscreen}>
            <Maximize2 className="h-3.5 w-3.5" />
            {t("results.astGraph.fullScreen")}
          </Button>
        )}
        <Button variant="outline" size="icon" className="h-8 w-8 border-border/60" onClick={zoomOut} aria-label={t("results.astGraph.zoomOut")} title={t("results.astGraph.zoomOut")}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-8 border-border/60 px-3 text-xs" onClick={fitGraph} aria-label={t("results.astGraph.fitView")} title={t("results.astGraph.fitView")}>
          {t("results.astGraph.fitView")}
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 border-border/60" onClick={zoomIn} aria-label={t("results.astGraph.zoomIn")} title={t("results.astGraph.zoomIn")}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="ast-graph-surface ast-flow-canvas" style={surfaceStyle}>
        <ReactFlow
          nodes={graphNodes}
          edges={graphEdges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flowRef.current = instance;
            requestAnimationFrame(() => {
              instance.fitView({ padding: fitPadding, duration: 280, minZoom, maxZoom: 1.25 });
            });
          }}
          onNodeClick={(_, node) => {
            onSelectNodeId(node.id);
          }}
          onPaneClick={() => {
            onSelectNodeId(null);
          }}
          fitView
          fitViewOptions={{ padding: 0.14, maxZoom: 1.25 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          zoomOnPinch
          panOnDrag
          panOnScroll
          minZoom={minZoom}
          maxZoom={2}
          defaultEdgeOptions={{ type: "straight" }}
        />
      </div>
    </div>
  );
}

function buildFlowGraph(elements: unknown, color: GraphTone, t: (key: string, opts?: Record<string, unknown>) => string): FlowGraph {
  const normalized = normalizeElements(elements);

  const totalNodeCount = normalized.nodes.length;
  const truncated = totalNodeCount > MAX_GRAPH_NODES;
  const cappedNodes = truncated ? normalized.nodes.slice(0, MAX_GRAPH_NODES) : normalized.nodes;

  // When truncating, keep only edges whose both endpoints survived the cap so
  // no edge dangles to a dropped node.
  const survivingNodeIds = truncated
    ? new Set(cappedNodes.map((node, index) => String(node.data?.id ?? `node-${index}`)))
    : null;

  const parsedEdges = normalized.edges
    .map((edge, index) => {
      const source = edge.data?.source;
      const target = edge.data?.target;
      if (source === undefined || target === undefined) {
        return null;
      }

      return {
        id: String(edge.data?.id ?? `edge-${source}-${target}-${index}`),
        source: String(source),
        target: String(target),
      };
    })
    .filter((edge): edge is { id: string; source: string; target: string } => Boolean(edge))
    .filter((edge) => !survivingNodeIds || (survivingNodeIds.has(edge.source) && survivingNodeIds.has(edge.target)));

  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();
  const childrenByParent = new Map<string, string[]>();
  const parentIdsByNode = new Map<string, string[]>();
  const incomingEdgeIdsByNode = new Map<string, string[]>();

  for (const edge of parsedEdges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
    const children = childrenByParent.get(edge.source) ?? [];
    children.push(edge.target);
    childrenByParent.set(edge.source, children);
    const parents = parentIdsByNode.get(edge.target) ?? [];
    parents.push(edge.source);
    parentIdsByNode.set(edge.target, parents);
    const incomingEdgeIds = incomingEdgeIdsByNode.get(edge.target) ?? [];
    incomingEdgeIds.push(edge.id);
    incomingEdgeIdsByNode.set(edge.target, incomingEdgeIds);
  }

  const baseNodes = cappedNodes.map((node, index) => {
    const id = String(node.data?.id ?? `node-${index}`);
    const label = formatNodeLabel(node, index);
    const range = formatLineRange(node.data?.start, node.data?.end, t);
    const isRoot = (incomingCount.get(id) ?? 0) === 0;
    const { width, height } = estimateNodeBox(label);

    return {
      id,
      label,
      title: range ? `${label} \u2022 ${range}` : label,
      isRoot,
      lineRange: range,
      childCount: outgoingCount.get(id) ?? 0,
      parentCount: incomingCount.get(id) ?? 0,
      depth: 0,
      width,
      height,
      x: 0,
      y: 0,
    } satisfies LayoutNode;
  });

  const nodesById = new Map(baseNodes.map((node) => [node.id, node]));
  const rootIds = baseNodes.filter((node) => node.isRoot).map((node) => node.id);
  const orderedRootIds = rootIds.length ? [...rootIds] : baseNodes.slice(0, 1).map((node) => node.id);
  const queue = orderedRootIds.map((id) => ({ id, depth: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;

    visited.add(current.id);
    const currentNode = nodesById.get(current.id);
    if (currentNode) {
      currentNode.depth = current.depth;
    }

    for (const childId of childrenByParent.get(current.id) ?? []) {
      if (!visited.has(childId)) {
        queue.push({ id: childId, depth: current.depth + 1 });
      }
    }
  }
  const resolvedNodes = buildTreeLayout(baseNodes, childrenByParent, orderedRootIds);

  const nodes: Node<AstFlowNodeData>[] = resolvedNodes.map((node) => ({
    id: node.id,
    type: "astNode",
    position: {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
    },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      id: node.id,
      label: node.label,
      title: node.title,
      tone: color,
      isRoot: node.isRoot,
      isPathNode: false,
      isPathTerminal: false,
      lineRange: node.lineRange,
      childCount: node.childCount,
      parentCount: node.parentCount,
      depth: node.depth,
    },
    draggable: false,
    selectable: true,
    connectable: false,
    style: {
      width: node.width,
      height: node.height,
      padding: 0,
      border: "none",
      borderRadius: 0,
      background: "transparent",
      boxShadow: "none",
    },
    className: "ast-flow-node-shell",
  }));

  const edgePalette = getGraphEdgePalette(color);

  const edges: Edge[] = parsedEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "straight",
    animated: false,
    style: {
      stroke: edgePalette.base,
      strokeWidth: 1,
      opacity: 0.88,
    },
  }));

  return {
    nodes,
    edges,
    nodeDetails: Object.fromEntries(
      resolvedNodes.map((node) => [
        node.id,
        {
          id: node.id,
          label: node.label,
          title: node.title,
          tone: color,
          isRoot: node.isRoot,
          lineRange: node.lineRange,
          childCount: node.childCount,
          parentCount: node.parentCount,
          depth: node.depth,
        } satisfies AstNodeDetail,
      ]),
    ),
    parentIdsByNode: Object.fromEntries(parentIdsByNode),
    incomingEdgeIdsByNode: Object.fromEntries(incomingEdgeIdsByNode),
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      rootCount: baseNodes.filter((node) => node.isRoot).length,
      truncated,
      totalNodeCount,
    },
  };
}

export function AstGraphPanel({ title, color, elements }: AstGraphPanelProps) {
  const { t } = useTranslation("results");
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const edgePalette = useMemo(() => getGraphEdgePalette(color), [color]);
  const flowGraph = useMemo(() => buildFlowGraph(elements, color, t), [color, elements, t]);
  const selectedNode = selectedNodeId ? flowGraph.nodeDetails[selectedNodeId] ?? null : null;
  const highlightedPath = useMemo(() => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    if (!selectedNodeId) {
      return { nodeIds, edgeIds };
    }

    const stack = [selectedNodeId];

    while (stack.length > 0) {
      const currentNodeId = stack.pop();
      if (!currentNodeId || nodeIds.has(currentNodeId)) {
        continue;
      }

      nodeIds.add(currentNodeId);

      const parentNodeIds = flowGraph.parentIdsByNode[currentNodeId] ?? [];
      const incomingEdgeIds = flowGraph.incomingEdgeIdsByNode[currentNodeId] ?? [];

      for (const edgeId of incomingEdgeIds) {
        edgeIds.add(edgeId);
      }

      for (const parentNodeId of parentNodeIds) {
        if (!nodeIds.has(parentNodeId)) {
          stack.push(parentNodeId);
        }
      }
    }

    return { nodeIds, edgeIds };
  }, [flowGraph.incomingEdgeIdsByNode, flowGraph.parentIdsByNode, selectedNodeId]);

  const graphNodes = useMemo(
    () =>
      flowGraph.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isPathNode: highlightedPath.nodeIds.has(node.id),
          isPathTerminal: node.id === selectedNodeId,
        },
        selected: node.id === selectedNodeId,
        className: node.className,
      })),
    [flowGraph.nodes, highlightedPath.nodeIds, selectedNodeId],
  );
  const graphEdges = useMemo(
    () =>
      flowGraph.edges.map((edge) => {
        const isHighlighted = highlightedPath.edgeIds.has(edge.id);
        // Highlight the ancestry path with warm stroke color + weight only —
        // no neon drop-shadow glow classes.
        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: isHighlighted ? 1 : edge.style?.opacity ?? 0.88,
            stroke: isHighlighted ? edgePalette.highlighted : edge.style?.stroke ?? edgePalette.base,
            strokeWidth: isHighlighted ? 3 : edge.style?.strokeWidth ?? 1,
          },
        } satisfies Edge;
      }),
    [edgePalette.base, edgePalette.highlighted, flowGraph.edges, highlightedPath.edgeIds],
  );

  useEffect(() => {
    if (selectedNodeId && !flowGraph.nodeDetails[selectedNodeId]) {
      setSelectedNodeId(null);
    }
  }, [flowGraph.nodeDetails, selectedNodeId]);

  return (
    <>
      <div className="card-premium overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Cpu className="h-4 w-4" style={{ color: getGraphToneColor(color) }} />
              {title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("results.astGraph.compactDescription")}
            </p>
            {!!flowGraph.nodes.length && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="badge-info">{flowGraph.summary.nodeCount} {t("results.astGraph.nodes")}</span>
                <span className="badge-info">{flowGraph.summary.edgeCount} {t("results.astGraph.edges")}</span>
                <span className="badge-info">{flowGraph.summary.rootCount} {t("results.astGraph.rootSignals")}</span>
              </div>
            )}
            {flowGraph.summary.truncated && (
              <p className="mt-2 text-xs leading-relaxed text-warning">
                {t("results.astGraph.truncatedNotice", {
                  shown: flowGraph.summary.nodeCount,
                  total: flowGraph.summary.totalNodeCount,
                })}
              </p>
            )}
          </div>
        </div>

        {!flowGraph.nodes.length ? (
          <div className="graph-empty-state">
            <Cpu className="mb-3 h-8 w-8 text-muted-foreground/40" />
            <h4 className="text-sm font-medium text-foreground">{t("results.astGraph.noGraphTitle")}</h4>
            <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">
              {t("results.astGraph.noGraphDescription")}
            </p>
          </div>
        ) : (
          <GraphExplorer
            color={color}
            flowGraph={flowGraph}
            graphNodes={graphNodes}
            graphEdges={graphEdges}
            selectedNode={selectedNode}
            onSelectNodeId={setSelectedNodeId}
            t={t}
            onOpenFullscreen={() => setIsFullscreenOpen(true)}
            fitPadding={0.1}
            minZoom={0.08}
          />
        )}
      </div>

      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="flex h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden border-border/60 bg-background p-0">
          <DialogHeader className="border-b border-border/50 px-6 py-4 pr-14">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4" style={{ color: getGraphToneColor(color) }} />
              {title}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed">
              {t("results.astGraph.fullScreenDescription")}
            </DialogDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="badge-info">{flowGraph.summary.nodeCount} {t("results.astGraph.nodes")}</span>
              <span className="badge-info">{flowGraph.summary.edgeCount} {t("results.astGraph.edges")}</span>
              <span className="badge-info">{flowGraph.summary.rootCount} {t("results.astGraph.rootSignals")}</span>
            </div>
            {flowGraph.summary.truncated && (
              <p className="mt-2 text-xs leading-relaxed text-warning">
                {t("results.astGraph.truncatedNotice", {
                  shown: flowGraph.summary.nodeCount,
                  total: flowGraph.summary.totalNodeCount,
                })}
              </p>
            )}
          </DialogHeader>

          <GraphExplorer
            color={color}
            flowGraph={flowGraph}
            graphNodes={graphNodes}
            graphEdges={graphEdges}
            selectedNode={selectedNode}
            onSelectNodeId={setSelectedNodeId}
            t={t}
            containerClassName="min-h-0 flex-1"
            surfaceStyle={{ height: "100%" }}
            fitPadding={0.045}
            minZoom={0.035}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
