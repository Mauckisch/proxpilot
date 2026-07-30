import dagre from 'dagre';

import type {
  NetworkFlowEdge,
  NetworkFlowNode,
} from './NetworkTypes';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 125;

export function layoutNetworkGraph(
  nodes: NetworkFlowNode[],
  edges: NetworkFlowEdge[],
): {
  nodes: NetworkFlowNode[];
  edges: NetworkFlowEdge[];
} {
  const graph = new dagre.graphlib.Graph();

  graph.setDefaultEdgeLabel(() => ({}));

  graph.setGraph({
    rankdir: 'TB',
    ranksep: 90,
    nodesep: 45,
    edgesep: 25,
    marginx: 30,
    marginy: 30,
  });

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const position = graph.node(node.id);

    return {
      ...node,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
}
