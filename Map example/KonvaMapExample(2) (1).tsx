import React from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { mapGraph, nodeById, type GraphNode } from './tilesSurviveGraph';

type Props = {
  width: number;
  height: number;
  /** Secondary Season 5 resource values are hidden by default; labels stay the visual priority. */
  showValues?: boolean;
};

const COLORS = {
  background: '#f7f7f5',
  edge: '#303030',
  lairStroke: '#4f4f4f',
  workbenchStroke: '#171717',
  nodeFill: '#ffffff',
  label: '#111111',
  value: '#666666',
} as const;

const LAIR_RADIUS = 27;
const WORKBENCH_SIZE = 54;

function TerritoryNode({ node, showValues }: { node: GraphNode; showValues: boolean }) {
  if (node.group === 'base') {
    return (
      <Circle
        x={node.x}
        y={node.y}
        radius={29}
        fill={node.baseColor ?? '#888888'}
        stroke="#222222"
        strokeWidth={2}
      />
    );
  }

  const isLair = node.group === 'lair';

  return (
    <Group
      x={node.x}
      y={node.y}
      onClick={() => console.log('territory', node)}
      onTap={() => console.log('territory', node)}
    >
      {isLair ? (
        // Season 5 planner convention: lairs are circles.
        <Circle
          radius={LAIR_RADIUS}
          fill={COLORS.nodeFill}
          stroke={COLORS.lairStroke}
          strokeWidth={2}
        />
      ) : (
        // Workbenches are squares, matching the alliance Excel planner convention.
        <Rect
          x={-WORKBENCH_SIZE / 2}
          y={-WORKBENCH_SIZE / 2}
          width={WORKBENCH_SIZE}
          height={WORKBENCH_SIZE}
          cornerRadius={4}
          fill={COLORS.nodeFill}
          stroke={COLORS.workbenchStroke}
          strokeWidth={2}
        />
      )}

      <Text
        x={-40}
        y={showValues ? -13 : -9}
        width={80}
        align="center"
        text={node.label}
        fontSize={16}
        fontStyle="bold"
        fill={COLORS.label}
        stroke="#ffffff"
        strokeWidth={3}
        fillAfterStrokeEnabled
        listening={false}
      />

      {showValues && node.value != null && (
        <Text
          x={-34}
          y={7}
          width={68}
          align="center"
          text={String(node.value)}
          fontSize={9}
          fontStyle="normal"
          fill={COLORS.value}
          listening={false}
        />
      )}
    </Group>
  );
}

export function StrategicMap({ width, height, showValues = false }: Props) {
  const scale = Math.min(width / mapGraph.width, height / mapGraph.height);
  const offsetX = (width - mapGraph.width * scale) / 2;
  const offsetY = (height - mapGraph.height * scale) / 2;

  return (
    <Stage width={width} height={height} style={{ background: COLORS.background }}>
      <Layer x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
        {mapGraph.edges.map((edge) => {
          const a = nodeById.get(edge.source);
          const b = nodeById.get(edge.target);

          // The graph file validates this already; guard here keeps rendering resilient during editing.
          if (!a || !b) return null;

          return (
            <Line
              key={edge.id}
              points={[a.x, a.y, b.x, b.y]}
              stroke={COLORS.edge}
              strokeWidth={2}
              lineCap="round"
              listening={false}
            />
          );
        })}

        {mapGraph.nodes.map((node) => (
          <TerritoryNode key={node.id} node={node} showValues={showValues} />
        ))}
      </Layer>
    </Stage>
  );
}
