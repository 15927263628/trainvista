import { useMemo } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, type NodeProps, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Check, Box, Database, FlaskConical, GitBranch, ShieldCheck } from 'lucide-react';
import { StatusIcon } from './components';
import type { Run, Stage } from './types';

type StageNode = Node<{ stage: Stage }, 'stage'>;
function StageCard({ data, selected }: NodeProps<StageNode>) {
  const stage = data.stage;
  const Icon = stage.id === 'train' ? Box : stage.id === 'evaluate' ? FlaskConical :
    stage.id === 'approve' || stage.id === 'gate' ? ShieldCheck : stage.id === 'baseline' ? GitBranch : Database;
  return <div className={`stage-node ${stage.status} ${selected ? 'selected' : ''}`} data-testid={`stage-${stage.id}`}>
    <Handle type="target" position={Position.Left} />
    <div className="stage-node-top"><span className="node-icon"><Icon size={15} /></span><span>{stage.tool}</span><StatusIcon status={stage.status} /></div>
    <strong>{stage.name}</strong>
    <div className="stage-node-bottom"><span>{stage.reused ? '复用版本' : stage.value ?? '—'} <small>{stage.value ? stage.unit : ''}</small></span>{stage.status === 'succeeded' && <Check size={12} />}</div>
    <Handle type="source" position={Position.Right} />
  </div>;
}
const nodeTypes = { stage: StageCard };
const positions: Record<string, { x: number; y: number }> = {
  snapshot: { x: 0, y: 75 }, prepare: { x: 205, y: 75 }, check: { x: 410, y: 75 },
  train: { x: 615, y: 0 }, baseline: { x: 615, y: 158 }, evaluate: { x: 820, y: 75 },
  gate: { x: 1025, y: 75 }, approve: { x: 1230, y: 75 }, publish: { x: 1435, y: 75 },
};

export function RunGraph({ run, selected, onSelect }: { run: Run; selected?: string; onSelect: (id: string) => void }) {
  const nodes = useMemo(() => run.stages.map(stage => ({
    id: stage.id, type: 'stage' as const, data: { stage }, position: positions[stage.id],
    selected: selected === stage.id, ariaLabel: stage.name,
  })), [run, selected]);
  const edges = useMemo(() => run.stages.flatMap(stage => stage.dependencies.map(source => ({
    id: `${source}-${stage.id}`, source, target: stage.id, type: 'smoothstep',
    animated: stage.status === 'running',
    style: { stroke: stage.status === 'pending' ? '#dce2df' : '#79aa99', strokeWidth: 1.4 },
  }))), [run]);
  return <div className="run-graph"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
    onNodeClick={(_event, node) => onSelect(node.id)} fitView fitViewOptions={{ padding: .16 }}
    minZoom={.25} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null}
    proOptions={{ hideAttribution: true }}>
    <Background color="#d7ded9" gap={18} size={1} /><Controls showInteractive={false} />
  </ReactFlow></div>;
}
