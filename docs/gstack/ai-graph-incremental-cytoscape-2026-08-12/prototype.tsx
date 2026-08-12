import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, NodeSingular, SingularElementReturnValue, StylesheetJson } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { motion, useReducedMotion } from 'framer-motion';
import {
	BookOpenText,
	Check,
	ChevronDown,
	CircleDotDashed,
	CirclePause,
	CirclePlay,
	Clock3,
	ExternalLink,
	GitBranch,
	History,
	LocateFixed,
	Network,
	Pause,
	Pin,
	Play,
	Plus,
	RotateCcw,
	Search,
	ShieldCheck,
	Sparkles,
	Square,
	Trash2,
	Waypoints,
	Workflow,
	X,
} from 'lucide-react';

cytoscape.use(dagre as never);

type RunMode = 'idle' | 'running' | 'paused' | 'refining' | 'review' | 'accepted';
type LensId = 'topology' | 'thinking-tree' | 'bridge' | 'timeline' | 'gap-analysis';
type LayoutId = 'constellation' | 'flow-lr' | 'flow-tb' | 'timeline-lr' | 'timeline-tb' | 'diagnostic';
type StepKind = 'inspect' | 'add-node' | 'add-relation' | 'update' | 'remove-node' | 'validate';

interface AgentNode {
	id: string;
	label: string;
	x: number;
	y: number;
	classes?: string;
	parent?: string;
	order?: number;
	lane?: number;
}

interface AgentEdge {
	id: string;
	source: string;
	target: string;
	label?: string;
	classes?: string;
}

interface AgentNodeUpdate {
	id: string;
	label?: string;
	addClasses?: string;
	removeClasses?: string;
}

interface AgentEdgeUpdate {
	id: string;
	label?: string;
	addClasses?: string;
	removeClasses?: string;
}

interface AgentStep {
	id: string;
	kind: StepKind;
	tool: string;
	title: string;
	detail: string;
	object: string;
	addNodes?: AgentNode[];
	addEdges?: AgentEdge[];
	updateNodes?: AgentNodeUpdate[];
	updateEdges?: AgentEdgeUpdate[];
	removeNodeIds?: string[];
	removeEdgeIds?: string[];
	focusNodeId?: string;
	reflow?: 'local' | 'timeline';
}

interface LensScript {
	id: LensId;
	label: string;
	question: string;
	description: string;
	meaning: string;
	interpretation: {
		headline: string;
		body: string;
	};
	defaultLayout: LayoutId;
	layouts: LayoutId[];
	initialNodes: AgentNode[];
	initialEdges: AgentEdge[];
	steps: AgentStep[];
	finalLayout: 'cose' | 'dagre' | 'timeline' | 'preset';
}

interface GraphStats {
	nodes: number;
	edges: number;
	diagnostics: number;
}

type NodeCardAction = 'explain' | 'expand' | 'evidence' | null;
type ExpansionPhase = 'inspecting' | 'placing' | 'connecting' | 'validating' | 'complete';

interface ExpansionActivity {
	id: string;
	lensId: LensId;
	kind: StepKind;
	tool: string;
	title: string;
	detail: string;
	object: string;
	state: 'running' | 'complete';
	sourceLabel: string;
}

interface ExpansionRun {
	id: string;
	sourceNodeId: string;
	sourceLabel: string;
	targetNodeId: string;
	targetLabel: string;
	phase: ExpansionPhase;
}

interface NodeInspection {
	id: string;
	label: string;
	role: string;
	summary: string;
	incoming: number;
	outgoing: number;
	left: number;
	top: number;
	side: 'left' | 'right';
}

const node = (
	id: string,
	label: string,
	x: number,
	y: number,
	classes = '',
	parent?: string,
	order?: number,
	lane?: number,
): AgentNode => ({ id, label, x, y, classes, parent, order, lane });

const edge = (
	id: string,
	source: string,
	target: string,
	label = '',
	classes = '',
): AgentEdge => ({ id, source, target, label, classes });

const TOPOLOGY_SCRIPT: LensScript = {
	id: 'topology',
	label: 'Topology',
	question: 'How is this knowledge connected?',
	description: 'The Agent expands a stable graph with reversible node and relation patches.',
	meaning: 'Shows the complete relationship structure: what connects to what.',
	interpretation: {
		headline: 'Evidence and control now form one reviewable loop.',
		body: 'The v13 draft keeps GraphRAG as the hub, adds provenance and source lineage between retrieval and evidence, routes claims into evaluation and human review, and returns run observability to the root. The keyword-only branch and the ungrounded hypothesis were removed.',
	},
	defaultLayout: 'constellation',
	layouts: ['constellation', 'flow-lr', 'flow-tb'],
	finalLayout: 'cose',
	initialNodes: [
		node('graph-rag', 'GraphRAG', 130, 340, 'root'),
		node('retrieval', 'Retrieval-augmented generation', 350, 245, 'core'),
		node('community', 'Community summarization', 350, 435, 'core'),
		node('evidence', 'Evidence-linked graph', 585, 205, 'evidence'),
		node('global-search', 'Global search', 585, 430, 'method'),
		node('keyword', 'Keyword-only clustering', 570, 575, 'stale'),
	],
	initialEdges: [
		edge('t-graph-retrieval', 'graph-rag', 'retrieval'),
		edge('t-graph-community', 'graph-rag', 'community'),
		edge('t-retrieval-evidence', 'retrieval', 'evidence'),
		edge('t-community-global', 'community', 'global-search'),
		edge('t-retrieval-keyword', 'retrieval', 'keyword', 'legacy', 'semantic weak'),
	],
	steps: [
		{ id: 'top-inspect', kind: 'inspect', tool: 'graph.inspect', title: 'Inspected the current graph', detail: 'Read 6 nodes, 5 relations, occupied regions, and the frozen v12 revision.', object: 'revision v12 · no mutation' },
		{ id: 'top-add-provenance', kind: 'add-node', tool: 'graph.addNode', title: 'Placed Claim provenance', detail: 'Added one evidence concept in a collision-free position without inventing a relation.', object: '+ 1 node · unlinked', addNodes: [node('provenance', 'Claim provenance', 790, 155, 'evidence')] },
		{ id: 'top-add-evaluation', kind: 'add-node', tool: 'graph.addNode', title: 'Placed an evaluation pair', detail: 'The Agent can stage several nodes before it has enough evidence to connect them.', object: '+ 2 nodes · unlinked', addNodes: [node('benchmark', 'Evaluation benchmark', 815, 340, 'evaluation'), node('contradiction', 'Contradiction check', 1010, 340, 'evaluation')] },
		{ id: 'top-connect-evidence', kind: 'add-relation', tool: 'graph.addEdge', title: 'Grounded the evidence path', detail: 'The relation step is atomic: both endpoints already exist before either edge appears.', object: '+ 3 relations', addEdges: [edge('t-evidence-provenance', 'evidence', 'provenance', 'grounds'), edge('t-provenance-retrieval', 'provenance', 'retrieval', 'supports'), edge('t-global-benchmark', 'global-search', 'benchmark', 'evaluated by')] },
		{ id: 'top-add-control', kind: 'add-node', tool: 'graph.addNode', title: 'Added review and observability', detail: 'New control nodes extend the model beyond the current right boundary.', object: '+ 3 nodes · focus newest', addNodes: [node('source-lineage', 'Source lineage', 775, 545, 'evidence'), node('human-review', 'Human review loop', 1010, 515, 'control'), node('observability', 'Agent observability', 1215, 430, 'control')], focusNodeId: 'observability' },
		{ id: 'top-connect-control', kind: 'add-relation', tool: 'graph.addEdge', title: 'Connected the control loop', detail: 'Five validated relations join evidence, review, observability, and the root model.', object: '+ 5 relations', addEdges: [edge('t-evidence-lineage', 'evidence', 'source-lineage'), edge('t-lineage-provenance', 'source-lineage', 'provenance'), edge('t-provenance-review', 'provenance', 'human-review'), edge('t-review-observability', 'human-review', 'observability'), edge('t-observability-root', 'observability', 'graph-rag')] },
		{ id: 'top-test-orphan', kind: 'add-node', tool: 'graph.addNode', title: 'Tested an ungrounded hypothesis', detail: 'A candidate may remain disconnected while the Agent checks the evidence.', object: '+ transient node', addNodes: [node('orphan', 'Orphan hypothesis', 560, 720, 'candidate')] },
		{ id: 'top-refine', kind: 'update', tool: 'graph.updateEdge', title: 'Refined a relation predicate', detail: 'The evidence supports “grounds”, not the broader “supports” predicate.', object: '~ 1 relation', updateEdges: [{ id: 't-evidence-provenance', label: 'grounds', addClasses: 'patch-target' }] },
		{ id: 'top-clean', kind: 'remove-node', tool: 'graph.removeNode', title: 'Removed rejected structure', detail: 'The orphan and stale keyword branch remain recoverable until the run is accepted.', object: '− 2 nodes · − legacy relations', removeNodeIds: ['orphan', 'keyword'] },
		{ id: 'top-validate', kind: 'validate', tool: 'graph.validate', title: 'Validated the topology draft', detail: 'All remaining edges resolve to existing nodes and evidence-backed predicates.', object: '11 nodes · valid draft' },
	],
};

const TREE_SCRIPT: LensScript = {
	id: 'thinking-tree',
	label: 'Thinking Tree',
	question: 'How did the explicit decision structure grow?',
	description: 'An inspectable decision tree grows one branch at a time; future node names are never previewed.',
	meaning: 'Shows why a decision branched and which outcome each branch produced.',
	interpretation: {
		headline: 'The answer path is controlled by evidence sufficiency and source agreement.',
		body: 'Local evidence can produce a cited synthesis when independent sources agree, while contradictions escalate to human review. Insufficient coverage broadens the search. The keyword-only shortcut was tested and pruned because it could not support a reviewable answer.',
	},
	defaultLayout: 'flow-lr',
	layouts: ['flow-lr'],
	finalLayout: 'dagre',
	initialNodes: [],
	initialEdges: [],
	steps: [
		{ id: 'tree-root', kind: 'add-node', tool: 'graph.addNode', title: 'Established the decision root', detail: 'The run begins with the user-visible question, not a precomputed tree outline.', object: '+ root node', addNodes: [node('tree-root', 'How should Peak answer a cross-document question?', 120, 360, 'root decision')] },
		{ id: 'tree-evidence', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Added the first decision', detail: 'The Agent asks whether enough grounded evidence exists before choosing a response path.', object: '+ child · + parent edge', addNodes: [node('tree-evidence', 'Enough grounded evidence?', 350, 360, 'decision')], addEdges: [edge('tree-root-evidence', 'tree-root', 'tree-evidence', 'evaluate')] },
		{ id: 'tree-retrieval-branches', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Expanded two retrieval branches', detail: 'Only the newly chosen branch grows; no future descendants are placed as ghosts.', object: '+ 2 children · + 2 edges', addNodes: [node('tree-local', 'Inspect local neighborhood', 585, 225, 'action'), node('tree-global', 'Search relevant communities', 585, 495, 'action')], addEdges: [edge('tree-evidence-local', 'tree-evidence', 'tree-local', 'local'), edge('tree-evidence-global', 'tree-evidence', 'tree-global', 'broad')] },
		{ id: 'tree-agreement', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Introduced an evidence check', detail: 'The local branch discovers a decision that was not known when the root was created.', object: '+ decision · + edge', addNodes: [node('tree-agreement', 'Do independent sources agree?', 815, 225, 'decision')], addEdges: [edge('tree-local-agreement', 'tree-local', 'tree-agreement', 'compare')] },
		{ id: 'tree-outcomes', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Added supported and conflict outcomes', detail: 'The Agent adds both externally reviewable outcomes as one coherent graph step.', object: '+ 2 outcomes · + 2 edges', addNodes: [node('tree-answer', 'Synthesize with citations', 1045, 125, 'outcome'), node('tree-conflict', 'Flag contradiction', 1045, 315, 'warning')], addEdges: [edge('tree-agreement-answer', 'tree-agreement', 'tree-answer', 'agree'), edge('tree-agreement-conflict', 'tree-agreement', 'tree-conflict', 'conflict')] },
		{ id: 'tree-broaden', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Expanded the coverage branch', detail: 'The broad-search result becomes a concrete action rather than an empty reserved slot.', object: '+ action · + edge', addNodes: [node('tree-broaden', 'Broaden query and collect evidence', 815, 510, 'action')], addEdges: [edge('tree-global-broaden', 'tree-global', 'tree-broaden', 'insufficient coverage')] },
		{ id: 'tree-human', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Escalated the conflict branch', detail: 'Human review is attached only after a contradiction is actually found.', object: '+ review outcome · + edge', addNodes: [node('tree-review', 'Request human review', 1265, 315, 'control')], addEdges: [edge('tree-conflict-review', 'tree-conflict', 'tree-review', 'escalate')] },
		{ id: 'tree-candidate', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Tested a shortcut branch', detail: 'A keyword-only shortcut is explicitly provisional and can be removed on the next step.', object: '+ provisional branch', addNodes: [node('tree-shortcut', 'Use keyword overlap only', 815, 675, 'candidate')], addEdges: [edge('tree-global-shortcut', 'tree-global', 'tree-shortcut', 'candidate', 'weak')] },
		{ id: 'tree-prune', kind: 'remove-node', tool: 'graph.removeNode', title: 'Pruned the unsupported shortcut', detail: 'The branch disappears with its incident edge; the rest of the tree does not re-run.', object: '− branch · local reflow', removeNodeIds: ['tree-shortcut'], reflow: 'local' },
		{ id: 'tree-validate', kind: 'validate', tool: 'graph.validate', title: 'Validated the decision tree', detail: 'Every non-root node has one parent and every visible outcome is externally reviewable.', object: '9 nodes · one-parent invariant' },
	],
};

const BRIDGE_SCRIPT: LensScript = {
	id: 'bridge',
	label: 'Bridges',
	question: 'Which concepts create real paths between disconnected domains?',
	description: 'A bridge is a validated concept that joins two knowledge domains which otherwise have no path.',
	meaning: 'Useful for finding the few concepts that let evidence travel between separate domains.',
	interpretation: {
		headline: 'Two concepts connect three previously separate domains.',
		body: 'Claim provenance carries retrieval evidence into evaluation, while Agent observability connects evaluation to the human-control domain. Keyword overlap touched only one component, so it was rejected rather than presented as a bridge.',
	},
	defaultLayout: 'flow-lr',
	layouts: ['constellation', 'flow-lr'],
	finalLayout: 'preset',
	initialNodes: [
		node('bridge-group-retrieval', 'Retrieval domain', 0, 0, 'group retrieval-group'),
		node('bridge-community', 'Community summaries', 150, 215, 'method', 'bridge-group-retrieval'),
		node('bridge-global', 'Global search', 330, 215, 'method', 'bridge-group-retrieval'),
		node('bridge-group-evaluation', 'Evaluation domain', 0, 0, 'group evaluation-group'),
		node('bridge-benchmark', 'Evaluation benchmark', 760, 190, 'evaluation', 'bridge-group-evaluation'),
		node('bridge-contradiction', 'Contradiction checks', 960, 190, 'evaluation', 'bridge-group-evaluation'),
		node('bridge-group-control', 'Control domain', 0, 0, 'group control-group'),
		node('bridge-human', 'Human review', 760, 505, 'control', 'bridge-group-control'),
		node('bridge-receipt', 'Run receipts', 960, 505, 'control', 'bridge-group-control'),
	],
	initialEdges: [
		edge('bridge-community-global', 'bridge-community', 'bridge-global'),
		edge('bridge-benchmark-contradiction', 'bridge-benchmark', 'bridge-contradiction'),
		edge('bridge-human-receipt', 'bridge-human', 'bridge-receipt'),
	],
	steps: [
		{ id: 'bridge-components', kind: 'inspect', tool: 'graph.inspectComponents', title: 'Found three disconnected domains', detail: 'The Agent reads actual connected components before proposing any bridge.', object: '3 components · no mutation' },
		{ id: 'bridge-provenance-candidate', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Staged Claim provenance', detail: 'The concept reaches the retrieval side, but it is still only a one-sided candidate.', object: '+ candidate · first side', addNodes: [node('bridge-provenance', 'Claim provenance', 540, 210, 'candidate')], addEdges: [edge('bridge-global-provenance', 'bridge-global', 'bridge-provenance', 'produces')] },
		{ id: 'bridge-provenance-check', kind: 'inspect', tool: 'graph.inspectPath', title: 'Checked the candidate path', detail: 'No route to the Evaluation domain exists yet, so the node is not called a bridge.', object: 'path incomplete · candidate retained', updateNodes: [{ id: 'bridge-provenance', label: 'Claim provenance · checking', addClasses: 'patch-target' }] },
		{ id: 'bridge-provenance-promote', kind: 'add-relation', tool: 'graph.addEdge + graph.updateNode', title: 'Promoted the first bridge', detail: 'The second validated edge joins two formerly disconnected components.', object: '+ second side · bridge confirmed', addEdges: [edge('bridge-provenance-benchmark', 'bridge-provenance', 'bridge-benchmark', 'evaluated by')], updateNodes: [{ id: 'bridge-provenance', label: 'Claim provenance', addClasses: 'bridge', removeClasses: 'candidate' }] },
		{ id: 'bridge-observability-candidate', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Staged Agent observability', detail: 'A second candidate is attached to evaluation while control remains disconnected.', object: '+ candidate · first side', addNodes: [node('bridge-observability', 'Agent observability', 700, 365, 'candidate')], addEdges: [edge('bridge-contradiction-observability', 'bridge-contradiction', 'bridge-observability', 'emits')] },
		{ id: 'bridge-observability-promote', kind: 'add-relation', tool: 'graph.addEdge + graph.updateNode', title: 'Connected evaluation to control', detail: 'The candidate becomes a bridge only when Human review is reached.', object: '+ second side · bridge confirmed', addEdges: [edge('bridge-observability-human', 'bridge-observability', 'bridge-human', 'reviewed by')], updateNodes: [{ id: 'bridge-observability', addClasses: 'bridge', removeClasses: 'candidate' }] },
		{ id: 'bridge-shortcut', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Tested a low-evidence shortcut', detail: 'Keyword overlap touches only one component and does not satisfy bridge semantics.', object: '+ rejected candidate', addNodes: [node('bridge-keyword', 'Keyword overlap', 400, 555, 'candidate')], addEdges: [edge('bridge-community-keyword', 'bridge-community', 'bridge-keyword', 'similar', 'weak')] },
		{ id: 'bridge-reject', kind: 'remove-node', tool: 'graph.removeNode', title: 'Rejected the false bridge', detail: 'The one-sided candidate is removed without disturbing either validated path.', object: '− candidate · local mutation', removeNodeIds: ['bridge-keyword'] },
		{ id: 'bridge-validate', kind: 'validate', tool: 'graph.validatePaths', title: 'Validated two bridge paths', detail: 'Each highlighted concept now connects nodes from two named components.', object: '2 bridges · 3 components connected' },
	],
};

const TIMELINE_SCRIPT: LensScript = {
	id: 'timeline',
	label: 'Timeline',
	question: 'What happened when, and which parallel work depended on which?',
	description: 'A temporal DAG can branch, run tasks in parallel, merge at gates, and carry cross-stage dependencies.',
	meaning: 'Time controls the main direction; dependency edges explain parallel work and later convergence.',
	interpretation: {
		headline: 'The work advances through three phases with parallel branches and explicit joins.',
		body: 'Entity and query work begin in parallel, converge at claim provenance, split again for citation and evaluation, and rejoin at the quality gate. Governance then runs review policy and observability together; retrieval telemetry supplies one cross-stage dependency before the v13 release candidate is created.',
	},
	defaultLayout: 'timeline-lr',
	layouts: ['timeline-lr', 'timeline-tb'],
	finalLayout: 'timeline',
	initialNodes: [],
	initialEdges: [],
	steps: [
		{ id: 'time-contract', kind: 'add-node', tool: 'graph.addGroup + graph.addNode', title: 'Placed the first dated decision', detail: 'The temporal graph begins with one confirmed contract; no later task is pre-rendered.', object: 'Jan 12 · graph contract', addNodes: [node('time-foundation', 'Foundation · Jan–Apr', 0, 0, 'group timeline-foundation'), node('time-contract', 'Jan 12\nGraph contract', 120, 355, 'milestone gate', 'time-foundation', 1, 0)], reflow: 'timeline' },
		{ id: 'time-parallel-plan', kind: 'add-relation', tool: 'graph.addNodes + graph.addEdges', title: 'Opened two parallel workstreams', detail: 'Entity modeling and query design can begin from the same contract without waiting for each other.', object: '+ 2 parallel tasks · + 2 dependencies', addNodes: [node('time-entities', 'Feb 03\nEntity extraction', 300, 220, 'milestone parallel', 'time-foundation', 2, -1), node('time-query', 'Feb 05\nQuery contract', 300, 490, 'milestone parallel', 'time-foundation', 2, 1)], addEdges: [edge('time-contract-entities', 'time-contract', 'time-entities', 'starts', 'timeline-dependency'), edge('time-contract-query', 'time-contract', 'time-query', 'starts', 'timeline-dependency')], reflow: 'timeline' },
		{ id: 'time-parallel-results', kind: 'add-relation', tool: 'graph.addNodes + graph.addEdges', title: 'Advanced both branches independently', detail: 'Community summaries follow entity work while retrieval planning follows the query contract.', object: '+ 2 branch results', addNodes: [node('time-community', 'Mar 18\nCommunity summaries', 480, 220, 'milestone', 'time-foundation', 3, -1), node('time-retrieval', 'Mar 25\nLocal + global retrieval', 480, 490, 'milestone', 'time-foundation', 3, 1)], addEdges: [edge('time-entities-community', 'time-entities', 'time-community', 'produces', 'timeline-dependency'), edge('time-query-retrieval', 'time-query', 'time-retrieval', 'produces', 'timeline-dependency')], reflow: 'timeline' },
		{ id: 'time-schema-insert', kind: 'update', tool: 'graph.insertBetween', title: 'Inserted a late-discovered schema milestone', detail: 'A February schema decision is inserted into only the upper branch; the parallel query branch remains untouched.', object: 'Feb 21 · branch-local insertion', addNodes: [node('time-schema', 'Feb 21\nEntity schema', 390, 220, 'milestone inserted', 'time-foundation', 2.5, -1)], removeEdgeIds: ['time-entities-community'], addEdges: [edge('time-entities-schema', 'time-entities', 'time-schema', 'refines', 'timeline-dependency'), edge('time-schema-community', 'time-schema', 'time-community', 'enables', 'timeline-dependency')], reflow: 'timeline' },
		{ id: 'time-merge-provenance', kind: 'add-relation', tool: 'graph.addGroup + graph.addNode + graph.addEdges', title: 'Merged both branches at provenance', detail: 'Claim provenance is a convergence task: it requires both structured communities and retrieval behavior.', object: 'May 06 · 2 branches → 1 gate', addNodes: [node('time-grounding', 'Evidence · May–Jul', 0, 0, 'group timeline-grounding'), node('time-provenance', 'May 06\nClaim provenance', 670, 355, 'milestone gate', 'time-grounding', 4, 0)], addEdges: [edge('time-community-provenance', 'time-community', 'time-provenance', 'content', 'timeline-dependency'), edge('time-retrieval-provenance', 'time-retrieval', 'time-provenance', 'retrieval', 'timeline-dependency')], reflow: 'timeline' },
		{ id: 'time-evaluation-parallel', kind: 'add-relation', tool: 'graph.addNodes + graph.addEdges', title: 'Started two evaluation tasks in parallel', detail: 'Citation auditing and benchmark construction proceed independently from the same grounded claims.', object: '+ citation lane · + benchmark lane', addNodes: [node('time-citation', 'Jun 09\nCitation audit', 850, 220, 'milestone parallel', 'time-grounding', 5, -1), node('time-benchmark', 'Jun 14\nEvaluation dataset', 850, 490, 'milestone parallel', 'time-grounding', 5, 1)], addEdges: [edge('time-provenance-citation', 'time-provenance', 'time-citation', 'audit', 'timeline-dependency'), edge('time-provenance-benchmark', 'time-provenance', 'time-benchmark', 'sample', 'timeline-dependency')], reflow: 'timeline' },
		{ id: 'time-quality-merge', kind: 'add-relation', tool: 'graph.addNode + graph.addEdges', title: 'Merged evidence at the quality gate', detail: 'The quality gate cannot complete until both citation and evaluation branches arrive.', object: 'Jul 21 · parallel join', addNodes: [node('time-quality', 'Jul 21\nQuality gate', 1030, 355, 'milestone gate', 'time-grounding', 6, 0)], addEdges: [edge('time-citation-quality', 'time-citation', 'time-quality', 'citations pass', 'timeline-dependency'), edge('time-benchmark-quality', 'time-benchmark', 'time-quality', 'metrics pass', 'timeline-dependency')], reflow: 'timeline' },
		{ id: 'time-governance-parallel', kind: 'add-relation', tool: 'graph.addGroup + graph.addNodes + graph.addEdges', title: 'Opened parallel governance work', detail: 'Human policy and run observability are separate tasks that both follow the quality gate.', object: 'Sep · 2 governance lanes', addNodes: [node('time-governance', 'Governance · Sep–Nov', 0, 0, 'group timeline-governance'), node('time-review', 'Sep 14\nHuman review policy', 1210, 220, 'milestone parallel', 'time-governance', 7, -1), node('time-observability', 'Sep 18\nRun observability', 1210, 490, 'milestone parallel', 'time-governance', 7, 1)], addEdges: [edge('time-quality-review', 'time-quality', 'time-review', 'govern', 'timeline-dependency'), edge('time-quality-observability', 'time-quality', 'time-observability', 'instrument', 'timeline-dependency')], reflow: 'timeline' },
		{ id: 'time-cross-dependency', kind: 'add-relation', tool: 'graph.addEdge', title: 'Added a cross-stage dependency', detail: 'Observability also depends on retrieval telemetry discovered months earlier; chronology is not the same thing as one chain.', object: '+ cross-stage dependency', addEdges: [edge('time-retrieval-observability', 'time-retrieval', 'time-observability', 'telemetry contract', 'timeline-cross')], reflow: 'timeline' },
		{ id: 'time-release-merge', kind: 'add-relation', tool: 'graph.addNode + graph.addEdges', title: 'Joined governance at the release gate', detail: 'Release requires both an approved review policy and observable runs.', object: 'Oct 02 · parallel join', addNodes: [node('time-release', 'Oct 02\nRelease gate', 1390, 355, 'milestone gate', 'time-governance', 8, 0)], addEdges: [edge('time-review-release', 'time-review', 'time-release', 'policy ready', 'timeline-dependency'), edge('time-observability-release', 'time-observability', 'time-release', 'telemetry ready', 'timeline-dependency')], reflow: 'timeline' },
		{ id: 'time-candidate', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Created the version candidate', detail: 'The final milestone appears only after its release dependency exists.', object: 'Nov 11 · v13 candidate', addNodes: [node('time-candidate', 'Nov 11\nv13 candidate', 1570, 355, 'milestone outcome', 'time-governance', 9, 0)], addEdges: [edge('time-release-candidate', 'time-release', 'time-candidate', 'creates', 'timeline-dependency')], reflow: 'timeline' },
		{ id: 'time-validate', kind: 'validate', tool: 'graph.validateTimelineDag', title: 'Validated the temporal DAG', detail: 'Dates remain monotonic while parallel branches, joins, and one cross-stage dependency stay acyclic.', object: '14 milestones · 17 dependencies · 3 phases' },
	],
};

const GAP_SCRIPT: LensScript = {
	id: 'gap-analysis',
	label: 'Gaps',
	question: 'Where does this real graph lack a required path?',
	description: 'A gap is a required path that is absent or too weak in the existing graph; it is not empty canvas space.',
	meaning: 'Useful for finding where an answer, workflow, or evidence chain cannot safely continue.',
	interpretation: {
		headline: 'Two actionable breaks remain in the evidence-to-review path.',
		body: 'Citation audit has no validated handoff to the Evaluation gate, and the path from Contradiction check to Human review is supported by only one source. Community search already reaches Claim provenance through Answer synthesis, so that candidate was rejected as a false-positive gap.',
	},
	defaultLayout: 'diagnostic',
	layouts: ['diagnostic'],
	finalLayout: 'preset',
	initialNodes: [
		node('gap-query', 'Query understanding', 100, 240, 'core'),
		node('gap-community', 'Community search', 300, 180, 'method'),
		node('gap-answer', 'Answer synthesis', 500, 180, 'core'),
		node('gap-claim', 'Claim provenance', 500, 390, 'evidence'),
		node('gap-citation', 'Citation audit', 710, 390, 'evidence'),
		node('gap-eval', 'Evaluation gate', 920, 185, 'evaluation'),
		node('gap-contradiction', 'Contradiction check', 1110, 185, 'evaluation'),
		node('gap-human', 'Human review', 920, 500, 'control'),
		node('gap-observability', 'Run observability', 1120, 500, 'control'),
	],
	initialEdges: [
		edge('gap-query-community', 'gap-query', 'gap-community'),
		edge('gap-community-answer', 'gap-community', 'gap-answer'),
		edge('gap-answer-claim', 'gap-answer', 'gap-claim'),
		edge('gap-claim-citation', 'gap-claim', 'gap-citation'),
		edge('gap-eval-contradiction', 'gap-eval', 'gap-contradiction'),
		edge('gap-contradiction-human', 'gap-contradiction', 'gap-human', '', 'semantic'),
		edge('gap-human-observability', 'gap-human', 'gap-observability'),
	],
	steps: [
		{ id: 'gap-components', kind: 'inspect', tool: 'graph.inspectComponents', title: 'Mapped the existing graph', detail: 'The Agent starts from nine real concepts and two connected components.', object: '9 nodes · 2 components' },
		{ id: 'gap-path', kind: 'inspect', tool: 'graph.inspectPath', title: 'Found a missing validation handoff', detail: 'Citation audit cannot reach Evaluation gate even though both are required by the task contract.', object: 'no path · endpoints highlighted', updateNodes: [{ id: 'gap-citation', addClasses: 'gap-endpoint' }, { id: 'gap-eval', addClasses: 'gap-endpoint' }], focusNodeId: 'gap-citation' },
		{ id: 'gap-diagnostic', kind: 'add-relation', tool: 'graph.addDiagnostic', title: 'Recorded a missing-path diagnostic', detail: 'The dashed relation is an overlay finding, not a claim that the semantic edge already exists.', object: '+ missing-path finding · score 0.86', addEdges: [edge('gap-missing-validation', 'gap-citation', 'gap-eval', 'MISSING · validation handoff · 0.86', 'diagnostic missing overlay')] },
		{ id: 'gap-weak', kind: 'update', tool: 'graph.inspectEdge', title: 'Found a fragile review handoff', detail: 'Contradiction check reaches Human review through one unsupported relation.', object: '~ weak edge · one source', updateNodes: [{ id: 'gap-contradiction', addClasses: 'gap-endpoint' }, { id: 'gap-human', addClasses: 'gap-endpoint' }], updateEdges: [{ id: 'gap-contradiction-human', label: 'WEAK · one source · 0.61', addClasses: 'diagnostic weak' }] },
		{ id: 'gap-false-positive', kind: 'inspect', tool: 'graph.inspectPath', title: 'Rejected a false-positive gap', detail: 'Community search already reaches Claim provenance through Answer synthesis.', object: 'existing path length 2 · no finding', updateNodes: [{ id: 'gap-community', addClasses: 'patch-target' }, { id: 'gap-claim', addClasses: 'patch-target' }] },
		{ id: 'gap-validate', kind: 'validate', tool: 'graph.validateDiagnostics', title: 'Validated two structural findings', detail: 'The result contains one missing path and one weak path, both tied to real endpoints.', object: '2 findings · 1 candidate rejected' },
	],
};

const SCRIPTS: LensScript[] = [TOPOLOGY_SCRIPT, TREE_SCRIPT, BRIDGE_SCRIPT, TIMELINE_SCRIPT, GAP_SCRIPT];
const SCRIPT_BY_ID = Object.fromEntries(SCRIPTS.map((script) => [script.id, script])) as Record<LensId, LensScript>;
const MAX_STEP_COUNT = Math.max(...SCRIPTS.map((script) => script.steps.length));

function assertValidScripts(scripts: LensScript[]): void {
	for (const script of scripts) {
		const nodeIds = new Set<string>();
		const edges = new Map<string, { source: string; target: string }>();
		const addNode = (item: AgentNode): void => {
			if (nodeIds.has(item.id)) throw new Error(`${script.id}: duplicate node ${item.id}`);
			if (item.parent && !nodeIds.has(item.parent)) throw new Error(`${script.id}: missing parent ${item.parent}`);
			nodeIds.add(item.id);
		};
		const addEdge = (item: AgentEdge): void => {
			if (edges.has(item.id)) throw new Error(`${script.id}: duplicate edge ${item.id}`);
			if (!nodeIds.has(item.source) || !nodeIds.has(item.target)) throw new Error(`${script.id}: unresolved edge ${item.id}`);
			edges.set(item.id, { source: item.source, target: item.target });
		};
		for (const item of script.initialNodes) addNode(item);
		for (const item of script.initialEdges) addEdge(item);
		for (const step of script.steps) {
			for (const edgeId of step.removeEdgeIds ?? []) {
				if (!edges.delete(edgeId)) throw new Error(`${script.id}/${step.id}: cannot remove edge ${edgeId}`);
			}
			for (const nodeId of step.removeNodeIds ?? []) {
				if (!nodeIds.delete(nodeId)) throw new Error(`${script.id}/${step.id}: cannot remove node ${nodeId}`);
				for (const [edgeId, item] of edges) {
					if (item.source === nodeId || item.target === nodeId) edges.delete(edgeId);
				}
			}
			const parentNodes = (step.addNodes ?? []).filter((item) => item.classes?.split(' ').includes('group'));
			const childNodes = (step.addNodes ?? []).filter((item) => !item.classes?.split(' ').includes('group'));
			for (const item of [...parentNodes, ...childNodes]) addNode(item);
			for (const item of step.addEdges ?? []) addEdge(item);
			for (const item of step.updateNodes ?? []) {
				if (!nodeIds.has(item.id)) throw new Error(`${script.id}/${step.id}: cannot update node ${item.id}`);
			}
			for (const item of step.updateEdges ?? []) {
				if (!edges.has(item.id)) throw new Error(`${script.id}/${step.id}: cannot update edge ${item.id}`);
			}
		}
	}
}

assertValidScripts(SCRIPTS);

const LAYOUT_OPTIONS: Record<LayoutId, { label: string; detail: string }> = {
	constellation: { label: 'Constellation', detail: 'Stable spatial graph' },
	'flow-lr': { label: 'Flow →', detail: 'Left to right' },
	'flow-tb': { label: '↓', detail: 'Flow top to bottom' },
	'timeline-lr': { label: 'Timeline →', detail: 'Horizontal temporal DAG' },
	'timeline-tb': { label: '↓', detail: 'Timeline top to bottom' },
	diagnostic: { label: 'Diagnostic', detail: 'Existing graph with gap overlays' },
};

const NODE_CHANGE_MARKER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#7255e7" stroke="#fff" stroke-width="2"/><path d="M11 7v8M7 11h8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>')}`;

const CY_STYLES: StylesheetJson = [
	{ selector: 'node', style: { 'background-color': '#ece7ff', 'border-color': '#8c72e8', 'border-width': 1.5, color: '#332452', label: 'data(label)', 'font-size': 11, 'font-weight': 650, 'text-wrap': 'wrap', 'text-max-width': '138px', 'text-valign': 'center', 'text-halign': 'center', shape: 'round-rectangle', width: 'label', height: 'label', padding: '10px', 'min-zoomed-font-size': 7, 'overlay-opacity': 0, 'transition-property': 'opacity, background-color, border-color, border-width', 'transition-duration': 320 } },
	{ selector: 'node.root', style: { 'background-color': '#c9bcff', 'border-color': '#6d28d9', 'border-width': 3, 'font-size': 12, 'font-weight': 760 } },
	{ selector: 'node.decision', style: { 'background-color': '#f1edff', 'border-width': 2 } },
	{ selector: 'node.action', style: { 'background-color': '#eef3ff', 'border-color': '#7291cf' } },
	{ selector: 'node.outcome', style: { 'background-color': '#e8f6f1', 'border-color': '#4c9a83' } },
	{ selector: 'node.warning', style: { 'background-color': '#fff1f3', 'border-color': '#c96d7f' } },
	{ selector: 'node.evidence', style: { 'background-color': '#eaf2ff', 'border-color': '#698cca' } },
	{ selector: 'node.evaluation', style: { 'background-color': '#fff5e7', 'border-color': '#c58d43' } },
	{ selector: 'node.control', style: { 'background-color': '#eaf7f2', 'border-color': '#4b9b84' } },
	{ selector: 'node.method', style: { 'background-color': '#f1edff', 'border-color': '#8a72d8' } },
	{ selector: 'node.candidate', style: { 'background-color': '#fff9ef', 'border-color': '#c88c3f', 'border-style': 'dashed', 'border-width': 2 } },
	{ selector: 'node.bridge', style: { 'background-color': '#d8cbff', 'border-color': '#6d28d9', 'border-width': 4, 'font-weight': 760 } },
	{ selector: 'node.stale', style: { 'background-color': '#fff5f6', 'border-color': '#cf8492', 'border-style': 'dashed' } },
	{ selector: 'node.milestone', style: { 'background-color': '#eee8ff', 'border-color': '#8062df', 'font-size': 10, 'text-max-width': '120px', padding: '9px' } },
	{ selector: 'node.milestone.parallel', style: { 'background-color': '#f4f1ff', 'border-width': 1.7 } },
	{ selector: 'node.milestone.gate', style: { 'background-color': '#ddd2ff', 'border-color': '#6d43dc', 'border-width': 2.7, 'font-weight': 760 } },
	{ selector: 'node.milestone.inserted', style: { 'background-color': '#fff5e8', 'border-color': '#c78b3b' } },
	{ selector: 'node.milestone.outcome', style: { 'background-color': '#e7f6f0', 'border-color': '#3e9279', 'border-width': 2.7, 'font-weight': 760 } },
	{ selector: 'node.group', style: { 'background-color': '#faf9fd', 'background-opacity': .72, 'border-color': '#dcd5e7', 'border-width': 1.2, 'border-style': 'dashed', color: '#766d80', 'font-size': 9, 'font-weight': 720, 'text-valign': 'top', 'text-halign': 'left', 'text-margin-x': 10, 'text-margin-y': 8, padding: '25px', shape: 'round-rectangle', 'z-compound-depth': 'bottom' } },
	{ selector: 'node.timeline-foundation', style: { 'background-color': '#f7f4ff', 'border-color': '#a891ec' } },
	{ selector: 'node.timeline-grounding', style: { 'background-color': '#f3f7fe', 'border-color': '#8aa5d6' } },
	{ selector: 'node.timeline-governance', style: { 'background-color': '#f1f9f6', 'border-color': '#74ad9d' } },
	{ selector: 'node.gap-endpoint', style: { 'border-color': '#cc7836', 'border-width': 4, 'background-color': '#fff7ec' } },
	{ selector: 'node.patch-target', style: { 'border-width': 4, 'border-color': '#7654e8', 'background-image': NODE_CHANGE_MARKER, 'background-fit': 'none', 'background-width': '18px', 'background-height': '18px', 'background-repeat': 'no-repeat', 'background-position-x': '100%', 'background-position-y': '100%', 'background-offset-x': -3, 'background-offset-y': -3 } as never },
	{ selector: 'node.group.patch-target', style: { 'background-image': 'none' } as never },
	{ selector: 'node.entering', style: { opacity: 0 } },
	{ selector: 'node.retiring', style: { opacity: 0, 'border-color': '#c45f73', 'background-color': '#fff1f3' } },
	{ selector: 'edge', style: { width: 1.6, 'line-color': '#566273', 'target-arrow-color': '#566273', 'target-arrow-shape': 'triangle', 'arrow-scale': .8, 'curve-style': 'bezier', label: 'data(label)', color: '#6d6575', 'font-size': 8, 'text-background-color': '#fbfbfc', 'text-background-opacity': .92, 'text-background-padding': '3px', 'text-rotation': 'autorotate', 'min-zoomed-font-size': 7, 'overlay-opacity': 0, 'transition-property': 'opacity, line-color, width', 'transition-duration': 820 } },
	{ selector: 'edge.semantic', style: { 'line-style': 'dashed', 'line-color': '#9ca7b8', 'target-arrow-shape': 'none' } },
	{ selector: 'edge.weak', style: { 'line-style': 'dashed', 'line-color': '#c49a54', 'target-arrow-color': '#c49a54' } },
	{ selector: 'edge.diagnostic', style: { width: 2.3, 'line-style': 'dashed', 'line-color': '#ce7a38', 'target-arrow-shape': 'none', color: '#9a5c2c', 'font-weight': 720, 'text-background-color': '#fff9f1', 'text-background-opacity': 1, 'text-background-padding': '5px' } },
	{ selector: 'edge.timeline-dependency', style: { width: 1.8, 'line-color': '#615a6d', 'target-arrow-color': '#615a6d', 'curve-style': 'bezier' } },
	{ selector: 'edge.timeline-cross', style: { width: 2, 'line-style': 'dashed', 'line-color': '#5484bc', 'target-arrow-color': '#5484bc', color: '#426d9e', 'curve-style': 'unbundled-bezier', 'control-point-distances': 90, 'control-point-weights': .55 } },
	{ selector: 'edge.missing', style: { 'line-color': '#d16f31' } },
	{ selector: 'edge.patch-target', style: { width: 3.2, 'line-color': '#7452df', 'target-arrow-color': '#7452df' } },
	{ selector: 'edge.entering', style: { opacity: 0 } },
	{ selector: 'edge.retiring', style: { opacity: 0, 'line-color': '#c45f73' } },
];

function toNodeDefinition(item: AgentNode): ElementDefinition {
	return {
		group: 'nodes',
		data: { id: item.id, label: item.label, parent: item.parent, order: item.order, lane: item.lane ?? 0 },
		position: { x: item.x, y: item.y },
		classes: item.classes ?? '',
	};
}

function toEdgeDefinition(item: AgentEdge): ElementDefinition {
	return {
		group: 'edges',
		data: { id: item.id, source: item.source, target: item.target, label: item.label ?? '' },
		classes: item.classes ?? '',
	};
}

function clearPatchTargets(cy: Core): void {
	cy.elements().removeClass('patch-target');
}

function runTimelineLayout(cy: Core, animate: boolean, layout: LayoutId = 'timeline-lr'): void {
	const horizontal = layout !== 'timeline-tb';
	const milestones = cy.nodes('.milestone').sort((left, right) => Number(left.data('order')) - Number(right.data('order')));
	milestones.forEach((item) => {
		const rank = Number(item.data('order'));
		const lane = Number(item.data('lane'));
		const target = horizontal
			? { x: 120 + ((rank - 1) * 180), y: 355 + (lane * 170) }
			: { x: 560 + (lane * 260), y: 120 + ((rank - 1) * 132) };
		if (!animate) {
			item.position(target);
			return;
		}
		item.animate({ position: target, duration: 620, easing: 'ease-out-cubic' });
	});
}

function fitGraph(cy: Core, duration = 360): void {
	if (cy.nodes().length === 0) return;
	cy.stop();
	cy.animate({ fit: { eles: cy.elements(), padding: 72 }, duration, easing: 'ease-out-cubic' });
}

function runLocalReflow(cy: Core, script: LensScript): void {
	if (script.id === 'timeline') {
		runTimelineLayout(cy, true, 'timeline-lr');
		return;
	}
	if (script.id === 'thinking-tree') {
		cy.elements().layout({ name: 'dagre', rankDir: 'LR', nodeSep: 45, rankSep: 82, fit: false, animate: true, animationDuration: 650 } as never).run();
	}
}

function runFinalLayout(cy: Core, script: LensScript, layout: LayoutId): void {
	if (layout === 'timeline-lr' || layout === 'timeline-tb') {
		runTimelineLayout(cy, true, layout);
		window.setTimeout(() => fitGraph(cy, 720), 680);
		return;
	}
	if (layout === 'flow-lr' || layout === 'flow-tb') {
		cy.elements().layout({ name: 'dagre', rankDir: layout === 'flow-tb' ? 'TB' : 'LR', nodeSep: 48, rankSep: 92, fit: true, padding: 74, animate: true, animationDuration: 980 } as never).run();
		return;
	}
	if (layout === 'constellation') {
		cy.elements().layout({ name: 'cose', fit: true, padding: 76, animate: true, animationDuration: 980, randomize: false, nodeRepulsion: 7200, idealEdgeLength: 120 } as never).run();
		return;
	}
	fitGraph(cy, 820);
}

function applyClassDelta(element: SingularElementReturnValue, addClasses?: string, removeClasses?: string): void {
	if (removeClasses) element.removeClass(removeClasses);
	if (addClasses) element.addClass(addClasses);
	element.addClass('patch-target');
}

function focusNewestIfOutside(cy: Core, nodeIds: string[]): void {
	if (nodeIds.length === 0) return;
	const target = cy.getElementById(nodeIds[nodeIds.length - 1]);
	if (target.empty()) return;
	const host = cy.container();
	if (!host) return;
	const box = target.renderedBoundingBox();
	const margin = 64;
	const visible = box.x1 >= margin && box.y1 >= margin && box.x2 <= host.clientWidth - margin && box.y2 <= host.clientHeight - margin;
	if (visible) return;
	cy.animate({ center: { eles: target }, duration: 560, easing: 'ease-out-cubic' });
}

function inspectionRole(item: NodeSingular): string {
	if (item.hasClass('bridge')) return 'Validated bridge';
	if (item.hasClass('gap-endpoint')) return 'Gap endpoint';
	if (item.hasClass('milestone')) return 'Temporal milestone';
	if (item.hasClass('decision')) return 'Decision point';
	if (item.hasClass('outcome')) return 'Reviewable outcome';
	if (item.hasClass('candidate')) return 'Provisional concept';
	if (item.hasClass('evidence')) return 'Evidence concept';
	if (item.hasClass('evaluation')) return 'Evaluation concept';
	if (item.hasClass('control')) return 'Control concept';
	if (item.hasClass('root')) return 'Root concept';
	return 'Graph concept';
}

function inspectionSummary(item: NodeSingular, script: LensScript): string {
	if (script.id === 'bridge' && item.hasClass('bridge')) return 'This concept creates a validated path between two domains that were previously disconnected.';
	if (script.id === 'gap-analysis' && item.hasClass('gap-endpoint')) return 'This endpoint participates in a missing or weak path required by the current graph contract.';
	if (script.id === 'timeline') return 'This dated milestone participates in the temporal dependency graph; its position expresses time while edges express prerequisites.';
	if (script.id === 'thinking-tree') return 'This node records one externally reviewable decision, action, or outcome in the reasoning structure.';
	return 'This concept belongs to the current evidence-grounded topology and retains its relation provenance in this graph version.';
}

function buildNodeInspection(item: NodeSingular, script: LensScript, host: HTMLDivElement): NodeInspection {
	const point = item.renderedPosition();
	const cardWidth = 336;
	const cardHeight = 344;
	const offset = 24;
	const placeRight = point.x + offset + cardWidth <= host.clientWidth - 12;
	const left = placeRight
		? point.x + offset
		: Math.max(12, point.x - cardWidth - offset);
	const top = Math.max(12, Math.min(point.y - 72, host.clientHeight - cardHeight - 12));
	let incoming = 0;
	let outgoing = 0;
	item.connectedEdges().forEach((relation) => {
		if (relation.target().id() === item.id()) incoming += 1;
		if (relation.source().id() === item.id()) outgoing += 1;
	});
	return {
		id: item.id(),
		label: String(item.data('label')).replace(/\n/g, ' · '),
		role: inspectionRole(item),
		summary: inspectionSummary(item, script),
		incoming,
		outgoing,
		left,
		top,
		side: placeRight ? 'right' : 'left',
	};
}

const EXPANSION_COPY: Record<LensId, { label: string; relation: string; classes: string }> = {
	topology: { label: 'Query decomposition', relation: 'expands to', classes: 'evidence' },
	'thinking-tree': { label: 'Inspect conflicting evidence', relation: 'next check', classes: 'action' },
	bridge: { label: 'Cross-domain evidence alignment', relation: 'tests path', classes: 'method' },
	timeline: { label: 'Post-run evidence audit', relation: 'then', classes: 'milestone' },
	'gap-analysis': { label: 'Verification handoff', relation: 'requires', classes: 'evaluation' },
};

function findExpansionPosition(cy: Core, anchor: NodeSingular, attempt: number): { x: number; y: number } {
	const origin = anchor.position();
	const offsets = [
		{ x: 230, y: 0 },
		{ x: 205, y: -145 },
		{ x: 205, y: 145 },
		{ x: 0, y: 165 },
		{ x: 0, y: -165 },
		{ x: -210, y: 145 },
		{ x: -210, y: -145 },
	];
	const occupied = cy.nodes().filter((item) => !item.hasClass('group'));
	for (let index = 0; index < offsets.length; index += 1) {
		const offset = offsets[(index + attempt) % offsets.length];
		const candidate = { x: origin.x + offset.x, y: origin.y + offset.y };
		let collision = false;
		occupied.forEach((item) => {
			const point = item.position();
			if (Math.abs(point.x - candidate.x) < 170 && Math.abs(point.y - candidate.y) < 82) collision = true;
		});
		if (!collision) return candidate;
	}
	return { x: origin.x + 240, y: origin.y + 180 + (attempt * 38) };
}

interface AgentGraphCanvasProps {
	script: LensScript;
	active: boolean;
	stepIndex: number;
	runNonce: number;
	refineNonce: number;
	expansionCommitNonce: number;
	expansionRollbackNonce: number;
	layout: LayoutId;
	layoutEnabled: boolean;
	revisionLabel: string;
	onSelect: (label: string) => void;
	onStats: (lensId: LensId, stats: GraphStats) => void;
	onExpansionActivity: (event: ExpansionActivity) => void;
}

function AgentGraphCanvas({ script, active, stepIndex, runNonce, refineNonce, expansionCommitNonce, expansionRollbackNonce, layout, layoutEnabled, revisionLabel, onSelect, onStats, onExpansionActivity }: AgentGraphCanvasProps): React.ReactElement {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const cyRef = useRef<Core | null>(null);
	const [inspectedNode, setInspectedNode] = useState<NodeInspection | null>(null);
	const [inspectPinned, setInspectPinned] = useState(false);
	const [cardAction, setCardAction] = useState<NodeCardAction>(null);
	const [expansionRun, setExpansionRun] = useState<ExpansionRun | null>(null);
	const appliedStepRef = useRef(-1);
	const runNonceRef = useRef(-1);
	const refineNonceRef = useRef(-1);
	const expansionCommitNonceRef = useRef(0);
	const expansionRollbackNonceRef = useRef(0);
	const layoutRef = useRef(layout);
	const activeRef = useRef(active);
	const initializedRef = useRef(false);
	const pendingFocusRef = useRef<string | null>(null);
	const hostSizeRef = useRef({ width: 0, height: 0 });
	const resizeTimerRef = useRef<number | null>(null);
	const inspectedNodeRef = useRef<NodeInspection | null>(null);
	const inspectPinnedRef = useRef(false);
	const hoveredNodeIdRef = useRef<string | null>(null);
	const inspectOpenTimerRef = useRef<number | null>(null);
	const inspectCloseTimerRef = useRef<number | null>(null);
	const expansionTimersRef = useRef<number[]>([]);
	const expansionCounterRef = useRef(0);
	activeRef.current = active;
	inspectedNodeRef.current = inspectedNode;
	inspectPinnedRef.current = inspectPinned;

	const clearInspectTimers = (): void => {
		if (inspectOpenTimerRef.current !== null) window.clearTimeout(inspectOpenTimerRef.current);
		if (inspectCloseTimerRef.current !== null) window.clearTimeout(inspectCloseTimerRef.current);
		inspectOpenTimerRef.current = null;
		inspectCloseTimerRef.current = null;
	};

	const clearExpansionTimers = (): void => {
		for (const timer of expansionTimersRef.current) window.clearTimeout(timer);
		expansionTimersRef.current = [];
	};

	const closeInspection = (): void => {
		clearInspectTimers();
		setInspectedNode(null);
		setInspectPinned(false);
		setCardAction(null);
		hoveredNodeIdRef.current = null;
	};

	const showInspection = (item: NodeSingular, pinned: boolean): void => {
		const host = hostRef.current;
		if (!host || item.empty() || item.hasClass('group')) return;
		setInspectedNode(buildNodeInspection(item, script, host));
		setInspectPinned(pinned);
		setCardAction(null);
	};

	const scheduleInspectionClose = (): void => {
		if (inspectPinnedRef.current) return;
		if (inspectCloseTimerRef.current !== null) window.clearTimeout(inspectCloseTimerRef.current);
		inspectCloseTimerRef.current = window.setTimeout(() => {
			if (hoveredNodeIdRef.current || inspectPinnedRef.current) return;
			setInspectedNode(null);
			setCardAction(null);
		}, 220);
	};

	const reportStats = (cy: Core): void => {
		const ordinaryNodes = cy.nodes().filter((item) => !item.hasClass('group')).length;
		const diagnostics = cy.edges('.diagnostic').length;
		const edges = cy.edges().filter((item) => !item.hasClass('overlay')).length;
		onStats(script.id, { nodes: ordinaryNodes, edges, diagnostics });
	};

	const resetGraph = (cy: Core): void => {
		clearExpansionTimers();
		setExpansionRun(null);
		closeInspection();
		cy.elements().remove();
		cy.add([
			...script.initialNodes.map(toNodeDefinition),
			...script.initialEdges.map(toEdgeDefinition),
		]);
		if (script.id === 'timeline') runTimelineLayout(cy, false, 'timeline-lr');
		appliedStepRef.current = -1;
		refineNonceRef.current = -1;
		reportStats(cy);
		window.setTimeout(() => fitGraph(cy, 0), 0);
	};

	const applyStep = (cy: Core, step: AgentStep, animate: boolean): void => {
		if (step.removeNodeIds?.includes(inspectedNodeRef.current?.id ?? '')) closeInspection();
		clearPatchTargets(cy);
		const enteringIds: string[] = [];
		const retiring = cy.collection();
		cy.batch(() => {
			for (const edgeId of step.removeEdgeIds ?? []) {
				const item = cy.getElementById(edgeId);
				if (!item.empty()) item.remove();
			}
			for (const nodeId of step.removeNodeIds ?? []) {
				const item = cy.getElementById(nodeId);
				if (item.empty()) continue;
				if (!animate) {
					item.remove();
					continue;
				}
				retiring.merge(item).merge(item.connectedEdges());
			}
			const parents = (step.addNodes ?? []).filter((item) => item.classes?.split(' ').includes('group'));
			const children = (step.addNodes ?? []).filter((item) => !item.classes?.split(' ').includes('group'));
			for (const item of [...parents, ...children]) {
				const definition = toNodeDefinition(item);
				definition.classes = `${definition.classes ?? ''}${animate ? ' entering' : ''} patch-target`.trim();
				cy.add(definition);
				enteringIds.push(item.id);
			}
			for (const item of step.addEdges ?? []) {
				const definition = toEdgeDefinition(item);
				definition.classes = `${definition.classes ?? ''}${animate ? ' entering' : ''} patch-target`.trim();
				cy.add(definition);
				enteringIds.push(item.id);
			}
			for (const update of step.updateNodes ?? []) {
				const item = cy.getElementById(update.id);
				if (item.empty()) continue;
				if (update.label !== undefined) item.data('label', update.label);
				applyClassDelta(item, update.addClasses, update.removeClasses);
			}
			for (const update of step.updateEdges ?? []) {
				const item = cy.getElementById(update.id);
				if (item.empty()) continue;
				if (update.label !== undefined) item.data('label', update.label);
				applyClassDelta(item, update.addClasses, update.removeClasses);
			}
		});
		if (!retiring.empty()) {
			retiring.addClass('retiring');
			window.setTimeout(() => {
				retiring.remove();
				if (step.reflow) runLocalReflow(cy, script);
				reportStats(cy);
			}, 420);
		}
		if (animate && enteringIds.length > 0) {
			window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
				for (const id of enteringIds) cy.getElementById(id).removeClass('entering');
			}));
		}
		if (step.reflow && retiring.empty()) runLocalReflow(cy, script);
		if (step.focusNodeId && activeRef.current) {
			const target = cy.getElementById(step.focusNodeId);
			if (!target.empty()) window.setTimeout(() => cy.animate({ center: { eles: target }, zoom: Math.max(.72, cy.zoom()), duration: 560 }), 160);
		} else if (activeRef.current && step.addNodes?.length) {
			const addedNodeIds = step.addNodes.filter((item) => !item.classes?.split(' ').includes('group')).map((item) => item.id);
			window.setTimeout(() => focusNewestIfOutside(cy, addedNodeIds), step.reflow ? 680 : 140);
		} else if (!activeRef.current) {
			const addedNodeIds = step.addNodes?.filter((item) => !item.classes?.split(' ').includes('group')).map((item) => item.id) ?? [];
			const newestNodeId = step.focusNodeId ?? addedNodeIds[addedNodeIds.length - 1];
			if (newestNodeId) pendingFocusRef.current = newestNodeId;
		}
		reportStats(cy);
	};

	useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const cy = cytoscape({
			container: host,
			elements: [],
			style: CY_STYLES,
			layout: { name: 'preset' },
			minZoom: .2,
			maxZoom: 2.2,
			wheelSensitivity: .18,
		});
		cyRef.current = cy;
		const refreshInspectionPosition = (): void => {
			const current = inspectedNodeRef.current;
			if (!current) return;
			const item = cy.getElementById(current.id);
			if (item.empty()) {
				closeInspection();
				return;
			}
			setInspectedNode(buildNodeInspection(item as NodeSingular, script, host));
		};
		cy.on('mouseover', 'node', (event) => {
			const item = event.target as NodeSingular;
			if (item.hasClass('group')) return;
			hoveredNodeIdRef.current = item.id();
			if (inspectCloseTimerRef.current !== null) window.clearTimeout(inspectCloseTimerRef.current);
			if (inspectOpenTimerRef.current !== null) window.clearTimeout(inspectOpenTimerRef.current);
			inspectOpenTimerRef.current = window.setTimeout(() => showInspection(item, false), 180);
		});
		cy.on('mouseout', 'node', () => {
			hoveredNodeIdRef.current = null;
			if (inspectOpenTimerRef.current !== null) window.clearTimeout(inspectOpenTimerRef.current);
			scheduleInspectionClose();
		});
		cy.on('tap', 'node', (event) => {
			const item = event.target as NodeSingular;
			if (item.hasClass('group')) return;
			onSelect(String(item.data('label')));
			hoveredNodeIdRef.current = item.id();
			showInspection(item, true);
		});
		cy.on('pan zoom resize', refreshInspectionPosition);
		const observer = new ResizeObserver((entries) => {
			const nextSize = entries[0]?.contentRect;
			const previousSize = hostSizeRef.current;
			hostSizeRef.current = { width: nextSize?.width ?? host.clientWidth, height: nextSize?.height ?? host.clientHeight };
			cy.resize();
			refreshInspectionPosition();
			if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current);
			resizeTimerRef.current = window.setTimeout(() => {
				if (!initializedRef.current) {
					initializedRef.current = true;
					fitGraph(cy, 0);
					return;
				}
				cy.panBy({
					x: (hostSizeRef.current.width - previousSize.width) / 2,
					y: (hostSizeRef.current.height - previousSize.height) / 2,
				});
			}, 90);
		});
		observer.observe(host);
		resetGraph(cy);
		return () => {
			observer.disconnect();
			clearInspectTimers();
			clearExpansionTimers();
			if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current);
			cy.destroy();
			cyRef.current = null;
		};
	}, [script.id]);

	useEffect(() => {
		if (!active) {
			closeInspection();
			return;
		}
		const handleKeyDown = (event: KeyboardEvent): void => {
			if (event.key === 'Escape' && inspectedNodeRef.current) {
				event.preventDefault();
				closeInspection();
				return;
			}
			if (event.key.toLowerCase() !== 'i' || !inspectedNodeRef.current) return;
			event.preventDefault();
			setInspectPinned((current) => !current);
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [active]);

	useEffect(() => {
		const cy = cyRef.current;
		if (!cy) return;
		if (runNonceRef.current !== runNonce || stepIndex < appliedStepRef.current) {
			runNonceRef.current = runNonce;
			resetGraph(cy);
		}
		for (let index = appliedStepRef.current + 1; index <= stepIndex; index += 1) {
			const step = script.steps[index];
			if (!step) break;
			applyStep(cy, step, index === stepIndex);
			appliedStepRef.current = index;
		}
	}, [runNonce, stepIndex, script.id]);

	useEffect(() => {
		const cy = cyRef.current;
		if (!cy || refineNonce <= 0 || refineNonceRef.current === refineNonce) return;
		refineNonceRef.current = refineNonce;
		layoutRef.current = layout;
		runFinalLayout(cy, script, layout);
	}, [refineNonce, script.id]);

	useEffect(() => {
		const cy = cyRef.current;
		if (!cy || expansionCommitNonce <= 0 || expansionCommitNonceRef.current === expansionCommitNonce) return;
		expansionCommitNonceRef.current = expansionCommitNonce;
		cy.elements('.expansion').removeClass('expansion patch-target');
		setExpansionRun(null);
	}, [expansionCommitNonce, script.id]);

	useEffect(() => {
		const cy = cyRef.current;
		if (!cy || expansionRollbackNonce <= 0 || expansionRollbackNonceRef.current === expansionRollbackNonce) return;
		expansionRollbackNonceRef.current = expansionRollbackNonce;
		clearExpansionTimers();
		const draftElements = cy.elements('.expansion');
		if (!draftElements.empty()) draftElements.remove();
		clearPatchTargets(cy);
		setExpansionRun(null);
		closeInspection();
		reportStats(cy);
	}, [expansionRollbackNonce, script.id]);

	useEffect(() => {
		const cy = cyRef.current;
		if (!cy || !active || !layoutEnabled || layoutRef.current === layout) return;
		layoutRef.current = layout;
		runFinalLayout(cy, script, layout);
	}, [active, layout, layoutEnabled, script.id]);

	useEffect(() => {
		const cy = cyRef.current;
		if (!cy || !active) return;
		window.setTimeout(() => {
			cy.resize();
			const host = cy.container();
			if (!host || cy.nodes().length === 0) return;
			const graphBox = cy.elements().renderedBoundingBox();
			const entirelyOutside = graphBox.x2 < 0 || graphBox.y2 < 0 || graphBox.x1 > host.clientWidth || graphBox.y1 > host.clientHeight;
			if (entirelyOutside) {
				fitGraph(cy, 300);
				pendingFocusRef.current = null;
				return;
			}
			if (!pendingFocusRef.current) return;
			focusNewestIfOutside(cy, [pendingFocusRef.current]);
			pendingFocusRef.current = null;
		}, 30);
	}, [active]);

	const actionDetail = !inspectedNode || !cardAction ? null
		: cardAction === 'explain'
			? `${inspectedNode.summary} The ${inspectedNode.incoming + inspectedNode.outgoing} visible relations are grounded in the current ${script.label} draft.`
			: cardAction === 'expand'
				? expansionRun?.sourceNodeId !== inspectedNode.id
					? 'Start a revision-guarded Graph Agent expansion from this node. The accepted graph stays unchanged until review.'
					: expansionRun.phase === 'inspecting'
						? 'Inspecting the selected node, adjacent relations, evidence anchors, and nearby free space.'
						: expansionRun.phase === 'placing'
							? `Placed “${expansionRun.targetLabel}” as an unlinked draft node. Existing nodes did not move.`
							: expansionRun.phase === 'connecting'
								? `Drawing the validated relation from “${expansionRun.sourceLabel}” to “${expansionRun.targetLabel}”.`
								: expansionRun.phase === 'validating'
									? 'Validating endpoint existence, evidence references, and the expected draft revision.'
									: `Expansion complete: “${expansionRun.targetLabel}” and its relation are now part of the reviewable draft.`
				: `Evidence bundle ready: ${inspectedNode.incoming} incoming and ${inspectedNode.outgoing} outgoing relation anchors are attached to this node.`;

	const focusInspectedNode = (): void => {
		const cy = cyRef.current;
		if (!cy || !inspectedNode) return;
		const item = cy.getElementById(inspectedNode.id);
		if (item.empty()) return;
		cy.animate({ center: { eles: item }, zoom: Math.max(.9, cy.zoom()), duration: 520, easing: 'ease-out-cubic' });
	};

	const emitExpansionActivity = (event: Omit<ExpansionActivity, 'lensId'>): void => {
		onExpansionActivity({ ...event, lensId: script.id });
	};

	const startExpansion = (): void => {
		const cy = cyRef.current;
		const host = hostRef.current;
		if (!cy || !host || !inspectedNode || !layoutEnabled) return;
		if (expansionRun && expansionRun.phase !== 'complete') return;
		const anchor = cy.getElementById(inspectedNode.id) as NodeSingular;
		if (anchor.empty()) return;
		clearExpansionTimers();
		expansionCounterRef.current += 1;
		const sequence = expansionCounterRef.current;
		const runId = `expand-${script.id}-${sequence}`;
		const targetNodeId = `${runId}-node`;
		const targetLabel = sequence === 1 ? EXPANSION_COPY[script.id].label : `${EXPANSION_COPY[script.id].label} ${sequence}`;
		const sourceLabel = inspectedNode.label;
		const position = findExpansionPosition(cy, anchor, sequence - 1);
		const parent = anchor.parent();
		const parentId = parent.empty() ? undefined : parent.first().id();
		const timelineOrder = script.id === 'timeline'
			? Math.max(0, ...cy.nodes('.milestone').map((item) => Number(item.data('order')) || 0)) + 1
			: undefined;
		const timelineLane = script.id === 'timeline' ? Number(anchor.data('lane')) || 0 : undefined;
		const nextRun: ExpansionRun = {
			id: runId,
			sourceNodeId: inspectedNode.id,
			sourceLabel,
			targetNodeId,
			targetLabel,
			phase: 'inspecting',
		};
		setExpansionRun(nextRun);
		closeInspection();
		emitExpansionActivity({ id: `${runId}-inspect`, kind: 'inspect', tool: 'graph.inspectNeighborhood', title: `Inspecting ${sourceLabel}`, detail: 'Read adjacent evidence, relation directions, occupied regions, and the current draft revision.', object: 'read only · revision guarded', state: 'running', sourceLabel });

		const placeTimer = window.setTimeout(() => {
			emitExpansionActivity({ id: `${runId}-inspect`, kind: 'inspect', tool: 'graph.inspectNeighborhood', title: `Inspected ${sourceLabel}`, detail: 'Adjacent evidence and a collision-free placement slot are available.', object: 'neighborhood ready', state: 'complete', sourceLabel });
			emitExpansionActivity({ id: `${runId}-node`, kind: 'add-node', tool: 'graph.addNode', title: `Placing ${targetLabel}`, detail: 'The new concept is staged without a relation so the mutation remains observable.', object: '+ 1 node · unlinked', state: 'running', sourceLabel });
			setExpansionRun((current) => current?.id === runId ? { ...current, phase: 'placing' } : current);
			applyStep(cy, {
				id: `${runId}-node`, kind: 'add-node', tool: 'graph.addNode', title: `Placed ${targetLabel}`, detail: 'Placed beside the selected node without moving existing coordinates.', object: '+ 1 node · unlinked',
				addNodes: [node(targetNodeId, targetLabel, position.x, position.y, 'candidate expansion', parentId, timelineOrder, timelineLane)],
			}, true);
		}, 760);
		expansionTimersRef.current.push(placeTimer);

		const connectTimer = window.setTimeout(() => {
			emitExpansionActivity({ id: `${runId}-node`, kind: 'add-node', tool: 'graph.addNode', title: `Placed ${targetLabel}`, detail: 'The draft node occupies a collision-free slot; no existing node moved.', object: '+ 1 node · unlinked', state: 'complete', sourceLabel });
			emitExpansionActivity({ id: `${runId}-edge`, kind: 'add-relation', tool: 'graph.addEdge', title: 'Connecting the expansion', detail: 'Both endpoints exist before the relation animation begins.', object: '+ 1 relation · drawing', state: 'running', sourceLabel });
			setExpansionRun((current) => current?.id === runId ? { ...current, phase: 'connecting' } : current);
			applyStep(cy, {
				id: `${runId}-edge`, kind: 'add-relation', tool: 'graph.addEdge', title: 'Connected the expansion', detail: 'The relation uses Cytoscape endpoint geometry from its first visible frame.', object: '+ 1 relation',
				addEdges: [edge(`${runId}-edge`, inspectedNode.id, targetNodeId, EXPANSION_COPY[script.id].relation, 'expansion')],
				updateNodes: [{ id: targetNodeId, addClasses: EXPANSION_COPY[script.id].classes, removeClasses: 'candidate' }],
			}, true);
			const currentAnchor = cy.getElementById(inspectedNode.id) as NodeSingular;
			if (!currentAnchor.empty()) setInspectedNode(buildNodeInspection(currentAnchor, script, host));
		}, 1740);
		expansionTimersRef.current.push(connectTimer);

		const validateTimer = window.setTimeout(() => {
			emitExpansionActivity({ id: `${runId}-edge`, kind: 'add-relation', tool: 'graph.addEdge', title: 'Connected the expansion', detail: 'The relation is attached to the selected source and the newly staged target.', object: '+ 1 relation', state: 'complete', sourceLabel });
			emitExpansionActivity({ id: `${runId}-validate`, kind: 'validate', tool: 'graph.validate', title: 'Validating the expansion draft', detail: 'Checking endpoint integrity, evidence references, and expected revision.', object: 'draft validation', state: 'running', sourceLabel });
			setExpansionRun((current) => current?.id === runId ? { ...current, phase: 'validating' } : current);
		}, 2840);
		expansionTimersRef.current.push(validateTimer);

		const completeTimer = window.setTimeout(() => {
			emitExpansionActivity({ id: `${runId}-validate`, kind: 'validate', tool: 'graph.validate', title: 'Validated the expansion draft', detail: 'The new node and relation are ready for review; the accepted graph version remains unchanged.', object: '1 node · 1 relation · valid draft', state: 'complete', sourceLabel });
			setExpansionRun((current) => current?.id === runId ? { ...current, phase: 'complete' } : current);
		}, 3620);
		expansionTimersRef.current.push(completeTimer);
	};

	return (
		<div className={`aig-agent-graph${active ? ' is-active' : ''}`} aria-hidden={!active}>
			<div ref={hostRef} className="aig-cytoscape-host" />
			{active && <div className="aig-inspect-hint"><span>Hover</span> inspect <i>·</i><span>I</span> pin <i>·</i><span>Esc</span> close</div>}
			{active && inspectedNode && (
				<div
					className="aig-node-inspect-card"
					data-card-side={inspectedNode.side}
					data-pinned={inspectPinned ? 'true' : 'false'}
					style={{ left: inspectedNode.left, top: inspectedNode.top }}
					tabIndex={-1}
					onMouseEnter={() => {
						hoveredNodeIdRef.current = '__card__';
						if (inspectCloseTimerRef.current !== null) window.clearTimeout(inspectCloseTimerRef.current);
					}}
					onMouseLeave={() => {
						hoveredNodeIdRef.current = null;
						scheduleInspectionClose();
					}}
				>
					<header>
						<div><span>{inspectedNode.role}</span><small>Evidence current · {script.label}</small></div>
						<nav>
							<button className={inspectPinned ? 'is-active' : ''} type="button" aria-label={inspectPinned ? 'Unpin node card' : 'Pin node card'} title={inspectPinned ? 'Unpin · I' : 'Pin · I'} onClick={() => setInspectPinned((current) => !current)}><Pin aria-hidden /></button>
							<button type="button" aria-label="Close node card" title="Close · Esc" onClick={closeInspection}><X aria-hidden /></button>
						</nav>
					</header>
					<strong>{inspectedNode.label}</strong>
					<span className="aig-node-inspect-card__summary">{inspectedNode.summary}</span>
					<div className="aig-node-inspect-card__metrics"><span><b>{inspectedNode.incoming}</b> incoming</span><span><b>{inspectedNode.outgoing}</b> outgoing</span><span><b>{inspectedNode.incoming + inspectedNode.outgoing}</b> total</span></div>
					{actionDetail && <div className={`aig-node-inspect-card__result is-${cardAction}`} aria-live="polite"><Sparkles aria-hidden /><span>{actionDetail}</span></div>}
					<div className="aig-node-inspect-card__actions" aria-label="Node actions">
						<button type="button" className={cardAction === 'explain' ? 'is-active' : ''} onClick={() => setCardAction('explain')}><Sparkles aria-hidden /> Explain</button>
						<button type="button" className={`${cardAction === 'expand' ? 'is-active' : ''}${expansionRun && expansionRun.phase !== 'complete' ? ' is-running' : ''}`} disabled={!layoutEnabled || Boolean(expansionRun && expansionRun.phase !== 'complete')} aria-busy={Boolean(expansionRun && expansionRun.phase !== 'complete')} title={layoutEnabled ? 'Run a revision-guarded graph expansion from this node' : 'Available after the current Agent run finishes'} onClick={startExpansion}><Network aria-hidden /> Expand</button>
						<button type="button" onClick={focusInspectedNode}><LocateFixed aria-hidden /> Focus</button>
						<button type="button" className={cardAction === 'evidence' ? 'is-active' : ''} onClick={() => setCardAction('evidence')}><ExternalLink aria-hidden /> Evidence</button>
					</div>
					<footer><span>{inspectPinned ? 'Pinned · actions stay interactive' : 'Move into card · click node or I to pin'}</span><b>{revisionLabel}</b></footer>
				</div>
			)}
		</div>
	);
}

function LensGlyph({ id }: { id: LensId }): React.ReactElement {
	if (id === 'thinking-tree') return <GitBranch aria-hidden />;
	if (id === 'bridge') return <Waypoints aria-hidden />;
	if (id === 'timeline') return <Clock3 aria-hidden />;
	if (id === 'gap-analysis') return <CircleDotDashed aria-hidden />;
	return <Network aria-hidden />;
}

interface LayoutSwitcherProps {
	lensId: LensId;
	layouts: LayoutId[];
	value: LayoutId;
	enabled: boolean;
	onChange: (layout: LayoutId) => void;
}

function LayoutSwitcher({ lensId, layouts, value, enabled, onChange }: LayoutSwitcherProps): React.ReactElement {
	const reduceMotion = useReducedMotion();
	return (
		<div className={`aig-layout-switcher${enabled ? '' : ' is-locked'}`} role="tablist" aria-label={`${SCRIPT_BY_ID[lensId].label} layouts`} title={enabled ? 'Change display layout' : 'Available after the Agent finishes and Refine runs'}>
			{layouts.map((layoutId) => {
				const active = value === layoutId;
				return (
					<button key={layoutId} className={active ? 'is-active' : ''} type="button" role="tab" aria-selected={active} disabled={!enabled} title={LAYOUT_OPTIONS[layoutId].detail} onClick={() => onChange(layoutId)}>
						{active && <motion.span className="aig-layout-thumb" layoutId={`${lensId}-layout-thumb`} transition={reduceMotion ? { duration: 0 } : { duration: .125, ease: [.2, .8, .2, 1] }} />}
						<span>{LAYOUT_OPTIONS[layoutId].label}</span>
					</button>
				);
			})}
		</div>
	);
}

function stepIcon(kind: StepKind): React.ReactNode {
	if (kind === 'add-node' || kind === 'add-relation') return <Plus aria-hidden />;
	if (kind === 'remove-node') return <Trash2 aria-hidden />;
	if (kind === 'validate') return <ShieldCheck aria-hidden />;
	if (kind === 'update') return <GitBranch aria-hidden />;
	return <Search aria-hidden />;
}

function visibleStepIndex(script: LensScript, globalStep: number, refined: boolean): number {
	if (refined) return script.steps.length - 1;
	return Math.min(globalStep, script.steps.length - 1);
}

function stepProgress(script: LensScript, stepIndex: number, refined: boolean): number {
	if (refined) return 100;
	if (stepIndex < 0) return 0;
	return Math.round(((stepIndex + 1) / script.steps.length) * 100);
}

function modeLabel(mode: RunMode, readyCount: number): string {
	if (mode === 'running') return `${readyCount}/5 graph views ready · running`;
	if (mode === 'paused') return `${readyCount}/5 graph views ready · paused`;
	if (mode === 'refining') return 'Refining five graph drafts';
	if (mode === 'review') return '5 graph views ready for review';
	if (mode === 'accepted') return 'Version v13 created';
	return 'Version v12 · ready to run';
}

function Prototype(): React.ReactElement {
	const [mode, setMode] = useState<RunMode>('idle');
	const [globalStep, setGlobalStep] = useState(-1);
	const [runNonce, setRunNonce] = useState(0);
	const [refineNonce, setRefineNonce] = useState(0);
	const [expansionCommitNonce, setExpansionCommitNonce] = useState(0);
	const [expansionRollbackNonce, setExpansionRollbackNonce] = useState(0);
	const [canonicalVersion, setCanonicalVersion] = useState(12);
	const [followUpDraft, setFollowUpDraft] = useState(false);
	const [activityOpen, setActivityOpen] = useState(false);
	const [explanationOpen, setExplanationOpen] = useState(false);
	const [activeLensId, setActiveLensId] = useState<LensId>('topology');
	const [layoutByLens, setLayoutByLens] = useState<Record<LensId, LayoutId>>(() => Object.fromEntries(SCRIPTS.map((script) => [script.id, script.defaultLayout])) as Record<LensId, LayoutId>);
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [expansionEvents, setExpansionEvents] = useState<ExpansionActivity[]>([]);
	const [activeExpansion, setActiveExpansion] = useState<ExpansionActivity | null>(null);
	const [statsByLens, setStatsByLens] = useState<Record<LensId, GraphStats>>(() => Object.fromEntries(SCRIPTS.map((script) => [script.id, { nodes: script.initialNodes.filter((item) => !item.classes?.split(' ').includes('group')).length, edges: script.initialEdges.length, diagnostics: 0 }])) as Record<LensId, GraphStats>);
	const startedRef = useRef(false);
	const currentActivityRef = useRef<HTMLDivElement | null>(null);

	const accepted = mode === 'accepted';
	const refined = mode === 'refining' || mode === 'review' || accepted;
	const liveRun = mode === 'running' || mode === 'paused';
	const activeScript = SCRIPT_BY_ID[activeLensId];
	const activeStepIndex = visibleStepIndex(activeScript, globalStep, refined);
	const activeStep = activeStepIndex >= 0 ? activeScript.steps[activeStepIndex] : null;
	const activeExpansionEvents = expansionEvents.filter((event) => event.lensId === activeLensId);
	const currentExpansionEvent = activeExpansion?.lensId === activeLensId ? activeExpansion : null;
	const readyCount = SCRIPTS.filter((script) => refined || globalStep >= script.steps.length - 1).length;
	const activeLayout = layoutByLens[activeLensId];
	const activeStats = statsByLens[activeLensId];
	const layoutEnabled = !liveRun && mode !== 'refining' && !activeExpansion;
	const activeViewReady = mode === 'review' || accepted;
	const explanationVisible = activeViewReady && explanationOpen;
	const targetVersion = canonicalVersion + 1;
	const revisionLabel = followUpDraft ? `v${targetVersion} draft` : accepted ? `v${canonicalVersion} canonical` : refined ? `v${targetVersion} draft` : liveRun ? 'working draft' : `v${canonicalVersion} current`;
	const visibleStatus = activeExpansion
		? `Expanding ${activeExpansion.sourceLabel}`
		: followUpDraft
			? `Version v${targetVersion} expansion ready for review`
			: accepted
				? `Version v${canonicalVersion} created`
				: modeLabel(mode, readyCount);

	const startRun = (): void => {
		setRunNonce((current) => current + 1);
		setRefineNonce(0);
		setGlobalStep(-1);
		setMode('running');
		setExpansionEvents([]);
		setActiveExpansion(null);
		setFollowUpDraft(false);
		setSelectedNode(null);
		setExplanationOpen(false);
	};

	useEffect(() => {
		if (startedRef.current) return;
		startedRef.current = true;
		const timer = window.setTimeout(startRun, 650);
		return () => window.clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (mode !== 'running') return;
		if (globalStep >= MAX_STEP_COUNT - 1) {
			const timer = window.setTimeout(() => {
				setRefineNonce((current) => current + 1);
				setMode('refining');
			}, 850);
			return () => window.clearTimeout(timer);
		}
		const currentSteps = SCRIPTS.map((script) => script.steps[Math.min(globalStep, script.steps.length - 1)]).filter(Boolean);
		const relationHeavy = currentSteps.some((step) => step.kind === 'add-relation');
		const timer = window.setTimeout(() => setGlobalStep((current) => current + 1), globalStep < 0 ? 700 : relationHeavy ? 2100 : 1500);
		return () => window.clearTimeout(timer);
	}, [mode, globalStep]);

	useEffect(() => {
		if (mode !== 'refining') return;
		const timer = window.setTimeout(() => setMode('review'), 1400);
		return () => window.clearTimeout(timer);
	}, [mode]);

	useEffect(() => {
		currentActivityRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}, [activityOpen, activeLensId, activeStepIndex, activeExpansionEvents.length, activeExpansion?.id]);

	useEffect(() => {
		setExplanationOpen(activeViewReady);
	}, [activeLensId, activeViewReady]);

	const updateStats = (lensId: LensId, stats: GraphStats): void => {
		setStatsByLens((current) => {
			const existing = current[lensId];
			if (existing.nodes === stats.nodes && existing.edges === stats.edges && existing.diagnostics === stats.diagnostics) return current;
			return { ...current, [lensId]: stats };
		});
	};

	const recordExpansionActivity = (event: ExpansionActivity): void => {
		setExpansionEvents((current) => {
			const index = current.findIndex((item) => item.id === event.id);
			if (index < 0) return [...current, event];
			const next = [...current];
			next[index] = event;
			return next;
		});
		if (event.state === 'running') {
			if (mode === 'accepted') setFollowUpDraft(true);
			setActiveExpansion(event);
			return;
		}
		if (event.tool === 'graph.validate') setActiveExpansion(null);
	};

	const discard = (): void => {
		setRunNonce((current) => current + 1);
		setGlobalStep(-1);
		setRefineNonce(0);
		setMode('idle');
		setExpansionEvents([]);
		setActiveExpansion(null);
		setFollowUpDraft(false);
		setActivityOpen(false);
		setExplanationOpen(false);
		setSelectedNode(null);
	};

	const acceptCurrentDraft = (): void => {
		setExpansionCommitNonce((current) => current + 1);
		setCanonicalVersion((current) => current + 1);
		setFollowUpDraft(false);
		setExpansionEvents([]);
		setMode('accepted');
	};

	const discardFollowUpExpansion = (): void => {
		setExpansionRollbackNonce((current) => current + 1);
		setExpansionEvents([]);
		setActiveExpansion(null);
		setFollowUpDraft(false);
	};

	const skipToFinal = (): void => {
		setGlobalStep(MAX_STEP_COUNT - 1);
		window.setTimeout(() => {
			setRefineNonce((current) => current + 1);
			setMode('refining');
		}, 40);
	};

	return (
		<div className="aig-mock peak-design-root">
			<header className="aig-topbar">
				<div className="aig-brand">
					<div className="aig-brandmark"><Sparkles aria-hidden /></div>
					<div><span className="aig-eyebrow">PEAK AI GRAPH</span><span className="aig-title">Evidence-grounded GraphRAG</span></div>
					<span className="aig-version">v{canonicalVersion}</span>
				</div>
				<div className={`aig-status aig-status--${activeExpansion ? 'running' : mode}`}><span className="aig-status__dot" />{visibleStatus}</div>
				<div className="aig-actions">
					<button className="aig-btn aig-btn--ghost" type="button"><History aria-hidden /> History</button>
					<button className={`aig-btn aig-btn--ghost${activityOpen ? ' is-active' : ''}`} type="button" onClick={() => setActivityOpen((current) => !current)}><Workflow aria-hidden /> Activity</button>
					<button className="aig-btn aig-btn--primary" type="button" onClick={startRun} disabled={mode === 'running' || mode === 'refining' || Boolean(activeExpansion) || followUpDraft}><RotateCcw aria-hidden /> Replay run</button>
				</div>
			</header>

			<section className="aig-instruction">
				<div className="aig-instruction__icon"><Sparkles aria-hidden /></div>
				<div className="aig-instruction__copy"><span className="aig-instruction__label">Update instruction</span><span>Build five evidence-grounded graph views. Apply observable graph operations one step at a time; do not reveal nodes before they are discovered.</span></div>
				<div className="aig-context"><span>v12 frozen base</span><span>11 sources</span><span>typed graph patches</span></div>
			</section>

			<main className={`aig-workspace${activityOpen ? ' is-activity-open' : ''}`}>
				<section className={`aig-canvas-card${explanationVisible ? ' has-explanation' : ''}`}>
					<div className="aig-canvas-toolbar">
						<div className="aig-lens-tabs" role="tablist" aria-label="Generated graph views">
							{SCRIPTS.map((script) => {
								const scriptStep = visibleStepIndex(script, globalStep, refined);
								const progress = stepProgress(script, scriptStep, refined);
								return (
									<button key={script.id} className={`aig-lens-tab${activeLensId === script.id ? ' is-active' : ''}`} type="button" role="tab" aria-selected={activeLensId === script.id} title={script.question} onClick={() => { setActiveLensId(script.id); setSelectedNode(null); }}>
										<LensGlyph id={script.id} /><span>{script.label}</span>
										{mode !== 'idle' && <b className={progress >= 100 ? 'is-ready' : ''}>{progress >= 100 ? <Check aria-hidden /> : `${scriptStep + 1}/${script.steps.length}`}</b>}
									</button>
								);
							})}
						</div>
						<div className="aig-toolbar-end">
							<div className="aig-runtime-badge"><Workflow aria-hidden /><span>{activeStep ? activeStep.tool : 'graph.inspect'}</span></div>
							{!layoutEnabled && <div className="aig-layout-stage" title="Generation keeps stable incremental coordinates. The selected display layout is applied by Refine."><LocateFixed aria-hidden />Layout after Refine</div>}
							{activeScript.layouts.length > 1 ? (
								<LayoutSwitcher lensId={activeLensId} layouts={activeScript.layouts} value={activeLayout} enabled={layoutEnabled} onChange={(layoutId) => setLayoutByLens((current) => ({ ...current, [activeLensId]: layoutId }))} />
							) : <div className="aig-layout-fixed">{LAYOUT_OPTIONS[activeLayout].label}</div>}
						</div>
					</div>

					<div className="aig-canvas">
						<div className="aig-agent-canvas-stack">
							{SCRIPTS.map((script) => <AgentGraphCanvas key={script.id} script={script} active={activeLensId === script.id} stepIndex={visibleStepIndex(script, globalStep, refined)} runNonce={runNonce} refineNonce={refineNonce} expansionCommitNonce={expansionCommitNonce} expansionRollbackNonce={expansionRollbackNonce} layout={layoutByLens[script.id]} layoutEnabled={layoutEnabled} revisionLabel={revisionLabel} onSelect={setSelectedNode} onStats={updateStats} onExpansionActivity={recordExpansionActivity} />)}
						</div>
						<div className="aig-canvas-context">
							<LensGlyph id={activeLensId} />
							<span><strong>{activeScript.label}</strong><em>{activeScript.meaning}</em><small>{activeScript.description}</small></span>
						</div>
						{liveRun && activeStep && <div className="aig-current-operation"><span>{stepIcon(activeStep.kind)}</span><div><b>{activeStep.tool}</b><strong>{activeStep.title}</strong><small>{activeStep.object}</small></div></div>}
						{currentExpansionEvent && <div className="aig-current-operation is-expansion"><span>{stepIcon(currentExpansionEvent.kind)}</span><div><b>{currentExpansionEvent.tool}</b><strong>{currentExpansionEvent.title}</strong><small>{currentExpansionEvent.object}</small></div></div>}
						{mode === 'refining' && <div className="aig-refine-stage"><Workflow aria-hidden /><span><strong>Refining all five graph drafts</strong><small>One intentional final layout; graph state stays unchanged.</small></span></div>}
						{!currentExpansionEvent && mode === 'review' && <div className="aig-review-chip"><ShieldCheck aria-hidden /> Five graph drafts ready</div>}
						{!currentExpansionEvent && accepted && followUpDraft && <div className="aig-review-chip"><ShieldCheck aria-hidden /> v{targetVersion} expansion draft</div>}
						{!currentExpansionEvent && accepted && !followUpDraft && <div className="aig-review-chip is-accepted"><Check aria-hidden /> v{canonicalVersion} canonical</div>}
					</div>

					{explanationVisible && (
						<section className="aig-view-explanation" aria-label={`${activeScript.label} generated explanation`} aria-live="polite">
							<div className="aig-view-explanation__icon"><BookOpenText aria-hidden /></div>
							<div className="aig-view-explanation__copy">
								<div><span>Generated view explanation</span><small>{revisionLabel} · {activeStats.nodes} nodes · {activeStats.edges} relations</small></div>
								<strong>{activeScript.interpretation.headline}</strong>
								<span>{activeScript.interpretation.body}</span>
							</div>
							<button type="button" aria-label="Collapse view explanation" title="Collapse explanation" onClick={() => setExplanationOpen(false)}><ChevronDown aria-hidden /></button>
						</section>
					)}

					<footer className="aig-canvas-footer">
						<span><ShieldCheck aria-hidden /><b>{activeStats.nodes} nodes · {activeStats.edges} relations{activeStats.diagnostics > 0 ? ` · ${activeStats.diagnostics} diagnostics` : ''}</b> · one Cytoscape geometry model from first patch through review</span>
						<div className="aig-canvas-footer__end">
							{selectedNode && <span className="aig-selection">Selected · {selectedNode}</span>}
							{activeViewReady && !explanationOpen && <button type="button" onClick={() => setExplanationOpen(true)}><BookOpenText aria-hidden /> Explain this view</button>}
						</div>
					</footer>
				</section>

				{activityOpen && (
					<aside className="aig-activity-drawer">
						<div className="aig-activity-head"><div><strong>{activeScript.label} activity</strong><span>{Math.max(0, activeStepIndex + 1) + activeExpansionEvents.filter((event) => event.state === 'complete').length} committed graph steps</span></div><button type="button" aria-label="Close activity" onClick={() => setActivityOpen(false)}><X aria-hidden /></button></div>
						<div className="aig-activity-body">
							<div className="aig-agent-summary"><div><Sparkles aria-hidden /></div><span><strong>Graph Agent</strong><small>Each entry is one validated patch transaction, not token streaming.</small></span></div>
							<div className="aig-progress"><span style={{ width: `${stepProgress(activeScript, activeStepIndex, refined)}%` }} /></div>
							<div className="aig-agent-tools"><span>inspect</span><span>add</span><span>connect</span><span>update</span><span>remove</span><span>validate</span></div>
							<div className="aig-feed-list">
								{activeScript.steps.map((step, index) => {
									const complete = refined || index <= activeStepIndex;
									const current = liveRun && index === activeStepIndex;
									return <div key={step.id} ref={current ? currentActivityRef : undefined} className={`aig-feed-item${complete ? ' is-complete' : ''}${current ? ' is-current' : ''}`}><div className={`aig-feed-icon is-${step.kind}`}>{complete ? stepIcon(step.kind) : <Clock3 aria-hidden />}</div><div><b>{step.tool}</b><strong>{step.title}</strong><span>{step.detail}</span><small>{step.object}</small></div></div>;
								})}
								{activeExpansionEvents.length > 0 && <div className="aig-feed-divider"><Network aria-hidden /> Follow-up expansion</div>}
								{activeExpansionEvents.map((event) => {
									const current = event.state === 'running';
									return <div key={event.id} ref={current ? currentActivityRef : undefined} className={`aig-feed-item is-expansion${event.state === 'complete' ? ' is-complete' : ''}${current ? ' is-current' : ''}`}><div className={`aig-feed-icon is-${event.kind}`}>{event.state === 'complete' ? stepIcon(event.kind) : <Clock3 aria-hidden />}</div><div><b>{event.tool}</b><strong>{event.title}</strong><span>{event.detail}</span><small>{event.object}</small></div></div>;
								})}
							</div>
						</div>
					</aside>
				)}
			</main>

			<footer className="aig-runbar">
				<div className="aig-run-state">
					{activeExpansion ? <CirclePlay aria-hidden /> : <>{mode === 'running' && <CirclePlay aria-hidden />}{mode === 'paused' && <CirclePause aria-hidden />}{mode === 'refining' && <Workflow aria-hidden />}{mode === 'review' && <ShieldCheck aria-hidden />}{mode === 'accepted' && <Check aria-hidden />}{mode === 'idle' && <Sparkles aria-hidden />}</>}
					<span><strong>{visibleStatus}</strong><small>{activeExpansion ? 'Follow-up Graph Agent run · accepted version remains unchanged' : 'One run · five independent patch streams · one reversible acceptance boundary'}</small></span>
				</div>
				<div className="aig-run-actions">
					{liveRun && <><button className="aig-btn aig-btn--ghost" type="button" onClick={discard}><Square aria-hidden /> Stop</button><button className="aig-btn aig-btn--ghost" type="button" onClick={() => setMode((current) => current === 'paused' ? 'running' : 'paused')}>{mode === 'paused' ? <Play aria-hidden /> : <Pause aria-hidden />}{mode === 'paused' ? 'Continue' : 'Pause'}</button><button className="aig-btn aig-btn--soft" type="button" onClick={skipToFinal}>Skip to review</button></>}
					{mode === 'review' && <><button className="aig-btn aig-btn--ghost" type="button" onClick={discard}><X aria-hidden /> Discard</button><button className="aig-btn aig-btn--primary" type="button" disabled={Boolean(activeExpansion)} onClick={acceptCurrentDraft}><Check aria-hidden /> Accept v{targetVersion}</button></>}
					{accepted && followUpDraft && <><button className="aig-btn aig-btn--ghost" type="button" disabled={Boolean(activeExpansion)} onClick={discardFollowUpExpansion}><X aria-hidden /> Discard expansion</button><button className="aig-btn aig-btn--primary" type="button" disabled={Boolean(activeExpansion)} onClick={acceptCurrentDraft}><Check aria-hidden /> Accept v{targetVersion}</button></>}
					{accepted && !followUpDraft && <button className="aig-btn aig-btn--soft" type="button" disabled={Boolean(activeExpansion)} onClick={startRun}><RotateCcw aria-hidden /> Replay incremental run</button>}
				</div>
			</footer>
		</div>
	);
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Prototype />);
