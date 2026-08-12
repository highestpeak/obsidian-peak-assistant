import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, NodeSingular, SingularElementReturnValue, StylesheetJson } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import {
	ArrowDown,
	ArrowRight,
	Check,
	CircleDotDashed,
	CirclePause,
	CirclePlay,
	Clock3,
	GitBranch,
	History,
	LayoutGrid,
	LocateFixed,
	Network,
	Pause,
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
type LayoutId = 'constellation' | 'flow-lr' | 'flow-tb' | 'timeline' | 'diagnostic';
type StepKind = 'inspect' | 'add-node' | 'add-relation' | 'update' | 'remove-node' | 'validate';

interface AgentNode {
	id: string;
	label: string;
	x: number;
	y: number;
	classes?: string;
	parent?: string;
	order?: number;
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

const node = (
	id: string,
	label: string,
	x: number,
	y: number,
	classes = '',
	parent?: string,
	order?: number,
): AgentNode => ({ id, label, x, y, classes, parent, order });

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
	description: 'Bridge candidates are promoted only after they connect two previously separate components.',
	defaultLayout: 'flow-lr',
	layouts: ['flow-lr', 'constellation'],
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
	question: 'How did this GraphRAG design evolve over time?',
	description: 'Dated evidence is discovered out of order and inserted into one real temporal graph.',
	defaultLayout: 'timeline',
	layouts: ['timeline'],
	finalLayout: 'timeline',
	initialNodes: [],
	initialEdges: [],
	steps: [
		{ id: 'time-baseline', kind: 'add-node', tool: 'graph.addGroup + graph.addNode', title: 'Placed the earliest confirmed milestone', detail: 'The first evidence anchor is dated; no future months or empty named nodes are shown.', object: 'Jan 12 · foundation', addNodes: [node('time-foundation', 'Foundation · Jan–Mar', 0, 0, 'group timeline-foundation'), node('time-jan', 'Jan 12\nBaseline ingestion', 100, 340, 'milestone', 'time-foundation', 1)], reflow: 'timeline' },
		{ id: 'time-march', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Added a later community milestone', detail: 'At this point the graph only knows January and March.', object: 'Mar 18 · + milestone', addNodes: [node('time-mar', 'Mar 18\nCommunity summaries', 300, 340, 'milestone', 'time-foundation', 3)], addEdges: [edge('time-jan-mar', 'time-jan', 'time-mar', 'next')], reflow: 'timeline' },
		{ id: 'time-february', kind: 'update', tool: 'graph.insertBetween', title: 'Inserted newly discovered February evidence', detail: 'The Agent replaces one adjacency with two; existing nodes slide instead of rebuilding the canvas.', object: 'Feb 03 · inserted out of order', addNodes: [node('time-feb', 'Feb 03\nEntity extraction', 200, 340, 'milestone', 'time-foundation', 2)], removeEdgeIds: ['time-jan-mar'], addEdges: [edge('time-jan-feb', 'time-jan', 'time-feb', 'next'), edge('time-feb-mar', 'time-feb', 'time-mar', 'next')], reflow: 'timeline' },
		{ id: 'time-may', kind: 'add-relation', tool: 'graph.addGroup + graph.addNode + graph.addEdge', title: 'Opened the grounding phase', detail: 'A compound phase wrapper is created with its first real child and follows that child automatically.', object: 'May 06 · new phase', addNodes: [node('time-grounding', 'Grounding · May–Jul', 0, 0, 'group timeline-grounding'), node('time-may', 'May 06\nLocal + global search', 480, 340, 'milestone', 'time-grounding', 4)], addEdges: [edge('time-mar-may', 'time-mar', 'time-may', 'next')], reflow: 'timeline' },
		{ id: 'time-july', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Added citation auditing', detail: 'July is appended from a dated source record.', object: 'Jul 21 · + milestone', addNodes: [node('time-jul', 'Jul 21\nCitation audit', 680, 340, 'milestone', 'time-grounding', 6)], addEdges: [edge('time-may-jul', 'time-may', 'time-jul', 'next')], reflow: 'timeline' },
		{ id: 'time-june', kind: 'update', tool: 'graph.insertBetween', title: 'Inserted provenance into the chronology', detail: 'June evidence arrives late and is placed between May and July with one atomic edge replacement.', object: 'Jun 09 · inserted out of order', addNodes: [node('time-jun', 'Jun 09\nClaim provenance', 580, 340, 'milestone', 'time-grounding', 5)], removeEdgeIds: ['time-may-jul'], addEdges: [edge('time-may-jun', 'time-may', 'time-jun', 'next'), edge('time-jun-jul', 'time-jun', 'time-jul', 'next')], reflow: 'timeline' },
		{ id: 'time-october', kind: 'add-relation', tool: 'graph.addGroup + graph.addNode + graph.addEdge', title: 'Opened the governance phase', detail: 'The final phase begins only when an October evaluation record is found.', object: 'Oct 02 · new phase', addNodes: [node('time-governance', 'Governance · Sep–Nov', 0, 0, 'group timeline-governance'), node('time-oct', 'Oct 02\nEvaluation gate', 900, 340, 'milestone', 'time-governance', 8)], addEdges: [edge('time-jul-oct', 'time-jul', 'time-oct', 'next')], reflow: 'timeline' },
		{ id: 'time-september', kind: 'update', tool: 'graph.insertBetween', title: 'Inserted the human-review policy', detail: 'September is inserted before the already visible October gate.', object: 'Sep 14 · inserted out of order', addNodes: [node('time-sep', 'Sep 14\nHuman review policy', 790, 340, 'milestone', 'time-governance', 7)], removeEdgeIds: ['time-jul-oct'], addEdges: [edge('time-jul-sep', 'time-jul', 'time-sep', 'next'), edge('time-sep-oct', 'time-sep', 'time-oct', 'next')], reflow: 'timeline' },
		{ id: 'time-november', kind: 'add-relation', tool: 'graph.addNode + graph.addEdge', title: 'Appended run observability', detail: 'The chronology ends at the latest known dated event; nothing beyond it is pre-rendered.', object: 'Nov 11 · latest milestone', addNodes: [node('time-nov', 'Nov 11\nRun observability', 1030, 340, 'milestone', 'time-governance', 9)], addEdges: [edge('time-oct-nov', 'time-oct', 'time-nov', 'next')], reflow: 'timeline' },
		{ id: 'time-validate', kind: 'validate', tool: 'graph.validateTimeline', title: 'Validated temporal ordering', detail: 'Every adjacency follows event time and every phase wrapper derives from its child milestones.', object: '9 milestones · 3 derived phases' },
	],
};

const GAP_SCRIPT: LensScript = {
	id: 'gap-analysis',
	label: 'Gaps',
	question: 'Where does this real graph lack a required path?',
	description: 'Gaps are diagnostic overlays on an existing graph, never fake semantic nodes.',
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
	'flow-tb': { label: 'Flow ↓', detail: 'Top to bottom' },
	timeline: { label: 'Timeline →', detail: 'Chronological compound phases' },
	diagnostic: { label: 'Diagnostic map', detail: 'Existing graph with gap overlays' },
};

const NODE_CHANGE_MARKER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#7255e7" stroke="#fff" stroke-width="2"/><path d="M11 7v8M7 11h8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>')}`;

const CY_STYLES: StylesheetJson = [
	{ selector: 'node', style: { 'background-color': '#ece7ff', 'border-color': '#8c72e8', 'border-width': 1.5, color: '#332452', label: 'data(label)', 'font-size': 11, 'font-weight': 650, 'text-wrap': 'wrap', 'text-max-width': 138, 'text-valign': 'center', 'text-halign': 'center', shape: 'round-rectangle', width: 'label', height: 'label', padding: '10px', 'min-zoomed-font-size': 7, 'overlay-opacity': 0, 'transition-property': 'opacity, background-color, border-color, border-width', 'transition-duration': 320 } },
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
	{ selector: 'node.milestone', style: { 'background-color': '#eee8ff', 'border-color': '#8062df', 'font-size': 10, 'text-max-width': 120, padding: '9px' } },
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
	{ selector: 'edge.missing', style: { 'line-color': '#d16f31' } },
	{ selector: 'edge.patch-target', style: { width: 3.2, 'line-color': '#7452df', 'target-arrow-color': '#7452df' } },
	{ selector: 'edge.entering', style: { opacity: 0 } },
	{ selector: 'edge.retiring', style: { opacity: 0, 'line-color': '#c45f73' } },
];

function toNodeDefinition(item: AgentNode): ElementDefinition {
	return {
		group: 'nodes',
		data: { id: item.id, label: item.label, parent: item.parent, order: item.order },
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

function runTimelineLayout(cy: Core, animate: boolean): void {
	const milestones = cy.nodes('.milestone').sort((left, right) => Number(left.data('order')) - Number(right.data('order')));
	milestones.forEach((item, index) => {
		const target = { x: 115 + (index * 175), y: 355 };
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
		runTimelineLayout(cy, true);
		return;
	}
	if (script.id === 'thinking-tree') {
		cy.elements().layout({ name: 'dagre', rankDir: 'LR', nodeSep: 45, rankSep: 82, fit: false, animate: true, animationDuration: 650 } as never).run();
	}
}

function runFinalLayout(cy: Core, script: LensScript, layout: LayoutId): void {
	if (layout === 'timeline') {
		runTimelineLayout(cy, true);
		window.setTimeout(() => fitGraph(cy, 720), 380);
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

interface AgentGraphCanvasProps {
	script: LensScript;
	active: boolean;
	stepIndex: number;
	runNonce: number;
	refineNonce: number;
	layout: LayoutId;
	onSelect: (label: string) => void;
	onStats: (lensId: LensId, stats: GraphStats) => void;
}

function AgentGraphCanvas({ script, active, stepIndex, runNonce, refineNonce, layout, onSelect, onStats }: AgentGraphCanvasProps): React.ReactElement {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const cyRef = useRef<Core | null>(null);
	const appliedStepRef = useRef(-1);
	const runNonceRef = useRef(-1);
	const refineNonceRef = useRef(-1);
	const layoutRef = useRef(layout);
	const activeRef = useRef(active);
	const initializedRef = useRef(false);
	const pendingFocusRef = useRef<string | null>(null);
	const hostSizeRef = useRef({ width: 0, height: 0 });
	const resizeTimerRef = useRef<number | null>(null);
	activeRef.current = active;

	const reportStats = (cy: Core): void => {
		const ordinaryNodes = cy.nodes().filter((item) => !item.hasClass('group')).length;
		const diagnostics = cy.edges('.diagnostic').length;
		const edges = cy.edges().filter((item) => !item.hasClass('overlay')).length;
		onStats(script.id, { nodes: ordinaryNodes, edges, diagnostics });
	};

	const resetGraph = (cy: Core): void => {
		cy.elements().remove();
		cy.add([
			...script.initialNodes.map(toNodeDefinition),
			...script.initialEdges.map(toEdgeDefinition),
		]);
		if (script.id === 'timeline') runTimelineLayout(cy, false);
		appliedStepRef.current = -1;
		refineNonceRef.current = -1;
		reportStats(cy);
		window.setTimeout(() => fitGraph(cy, 0), 0);
	};

	const applyStep = (cy: Core, step: AgentStep, animate: boolean): void => {
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
		cy.on('tap', 'node', (event) => {
			const item = event.target as NodeSingular;
			if (item.hasClass('group')) return;
			onSelect(String(item.data('label')));
		});
		const observer = new ResizeObserver((entries) => {
			const nextSize = entries[0]?.contentRect;
			const previousSize = hostSizeRef.current;
			hostSizeRef.current = { width: nextSize?.width ?? host.clientWidth, height: nextSize?.height ?? host.clientHeight };
			cy.resize();
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
			if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current);
			cy.destroy();
			cyRef.current = null;
		};
	}, [script.id]);

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
		runFinalLayout(cy, script, layout);
	}, [refineNonce, script.id]);

	useEffect(() => {
		const cy = cyRef.current;
		if (!cy || layoutRef.current === layout) return;
		layoutRef.current = layout;
		if (active) runFinalLayout(cy, script, layout);
	}, [active, layout, script.id]);

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

	return <div className={`aig-agent-graph${active ? ' is-active' : ''}`} aria-hidden={!active}><div ref={hostRef} className="aig-cytoscape-host" /></div>;
}

function LensGlyph({ id }: { id: LensId }): React.ReactElement {
	if (id === 'thinking-tree') return <GitBranch aria-hidden />;
	if (id === 'bridge') return <Waypoints aria-hidden />;
	if (id === 'timeline') return <Clock3 aria-hidden />;
	if (id === 'gap-analysis') return <CircleDotDashed aria-hidden />;
	return <Network aria-hidden />;
}

function LayoutGlyph({ id }: { id: LayoutId }): React.ReactElement {
	if (id === 'flow-tb') return <ArrowDown aria-hidden />;
	if (id === 'flow-lr' || id === 'timeline') return <ArrowRight aria-hidden />;
	if (id === 'diagnostic') return <CircleDotDashed aria-hidden />;
	return <LayoutGrid aria-hidden />;
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
	const [activityOpen, setActivityOpen] = useState(false);
	const [activeLensId, setActiveLensId] = useState<LensId>('topology');
	const [layoutByLens, setLayoutByLens] = useState<Record<LensId, LayoutId>>(() => Object.fromEntries(SCRIPTS.map((script) => [script.id, script.defaultLayout])) as Record<LensId, LayoutId>);
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [statsByLens, setStatsByLens] = useState<Record<LensId, GraphStats>>(() => Object.fromEntries(SCRIPTS.map((script) => [script.id, { nodes: script.initialNodes.filter((item) => !item.classes?.split(' ').includes('group')).length, edges: script.initialEdges.length, diagnostics: 0 }])) as Record<LensId, GraphStats>);
	const startedRef = useRef(false);
	const currentActivityRef = useRef<HTMLDivElement | null>(null);

	const accepted = mode === 'accepted';
	const refined = mode === 'refining' || mode === 'review' || accepted;
	const liveRun = mode === 'running' || mode === 'paused';
	const activeScript = SCRIPT_BY_ID[activeLensId];
	const activeStepIndex = visibleStepIndex(activeScript, globalStep, refined);
	const activeStep = activeStepIndex >= 0 ? activeScript.steps[activeStepIndex] : null;
	const readyCount = SCRIPTS.filter((script) => refined || globalStep >= script.steps.length - 1).length;
	const activeLayout = layoutByLens[activeLensId];
	const activeStats = statsByLens[activeLensId];

	const startRun = (): void => {
		setRunNonce((current) => current + 1);
		setRefineNonce(0);
		setGlobalStep(-1);
		setMode('running');
		setSelectedNode(null);
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
	}, [activityOpen, activeLensId, activeStepIndex]);

	const updateStats = (lensId: LensId, stats: GraphStats): void => {
		setStatsByLens((current) => {
			const existing = current[lensId];
			if (existing.nodes === stats.nodes && existing.edges === stats.edges && existing.diagnostics === stats.diagnostics) return current;
			return { ...current, [lensId]: stats };
		});
	};

	const discard = (): void => {
		setRunNonce((current) => current + 1);
		setGlobalStep(-1);
		setRefineNonce(0);
		setMode('idle');
		setActivityOpen(false);
		setSelectedNode(null);
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
					<span className="aig-version">{accepted ? 'v13' : 'v12'}</span>
				</div>
				<div className={`aig-status aig-status--${mode}`}><span className="aig-status__dot" />{modeLabel(mode, readyCount)}</div>
				<div className="aig-actions">
					<button className="aig-btn aig-btn--ghost" type="button"><History aria-hidden /> History</button>
					<button className={`aig-btn aig-btn--ghost${activityOpen ? ' is-active' : ''}`} type="button" onClick={() => setActivityOpen((current) => !current)}><Workflow aria-hidden /> Activity</button>
					<button className="aig-btn aig-btn--primary" type="button" onClick={startRun} disabled={mode === 'running' || mode === 'refining'}><RotateCcw aria-hidden /> Replay run</button>
				</div>
			</header>

			<section className="aig-instruction">
				<div className="aig-instruction__icon"><Sparkles aria-hidden /></div>
				<div className="aig-instruction__copy"><span className="aig-instruction__label">Update instruction</span><span>Build five evidence-grounded graph views. Apply observable graph operations one step at a time; do not reveal nodes before they are discovered.</span></div>
				<div className="aig-context"><span>v12 frozen base</span><span>11 sources</span><span>typed graph patches</span></div>
			</section>

			<main className={`aig-workspace${activityOpen ? ' is-activity-open' : ''}`}>
				<section className="aig-canvas-card">
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
							{activeScript.layouts.length > 1 ? (
								<div className="aig-layout-switcher" role="tablist" aria-label={`${activeScript.label} layouts`}>
									{activeScript.layouts.map((layoutId) => <button key={layoutId} className={activeLayout === layoutId ? 'is-active' : ''} type="button" role="tab" aria-selected={activeLayout === layoutId} onClick={() => setLayoutByLens((current) => ({ ...current, [activeLensId]: layoutId }))}><LayoutGlyph id={layoutId} />{LAYOUT_OPTIONS[layoutId].label}</button>)}
								</div>
							) : <div className="aig-layout-fixed"><LayoutGlyph id={activeLayout} />{LAYOUT_OPTIONS[activeLayout].label}</div>}
						</div>
					</div>

					<div className="aig-canvas">
						<div className="aig-agent-canvas-stack">
							{SCRIPTS.map((script) => <AgentGraphCanvas key={script.id} script={script} active={activeLensId === script.id} stepIndex={visibleStepIndex(script, globalStep, refined)} runNonce={runNonce} refineNonce={refineNonce} layout={layoutByLens[script.id]} onSelect={setSelectedNode} onStats={updateStats} />)}
						</div>
						<div className="aig-canvas-context">
							<LensGlyph id={activeLensId} />
							<span><strong>{activeScript.label}</strong><small>{activeScript.description}</small></span>
						</div>
						{liveRun && activeStep && <div className="aig-current-operation"><span>{stepIcon(activeStep.kind)}</span><div><b>{activeStep.tool}</b><strong>{activeStep.title}</strong><small>{activeStep.object}</small></div></div>}
						{mode === 'refining' && <div className="aig-refine-stage"><Workflow aria-hidden /><span><strong>Refining all five graph drafts</strong><small>One intentional final layout; graph state stays unchanged.</small></span></div>}
						{mode === 'review' && <div className="aig-review-chip"><ShieldCheck aria-hidden /> Five graph drafts ready</div>}
						{mode === 'accepted' && <div className="aig-review-chip is-accepted"><Check aria-hidden /> v13 canonical</div>}
					</div>

					<footer className="aig-canvas-footer">
						<span><ShieldCheck aria-hidden /><b>{activeStats.nodes} nodes · {activeStats.edges} relations{activeStats.diagnostics > 0 ? ` · ${activeStats.diagnostics} diagnostics` : ''}</b> · one Cytoscape geometry model from first patch through review</span>
						{selectedNode && <span className="aig-selection">Selected · {selectedNode}</span>}
					</footer>
				</section>

				{activityOpen && (
					<aside className="aig-activity-drawer">
						<div className="aig-activity-head"><div><strong>{activeScript.label} activity</strong><span>{Math.max(0, activeStepIndex + 1)} of {activeScript.steps.length} committed steps</span></div><button type="button" aria-label="Close activity" onClick={() => setActivityOpen(false)}><X aria-hidden /></button></div>
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
							</div>
						</div>
					</aside>
				)}
			</main>

			<footer className="aig-runbar">
				<div className="aig-run-state">
					{mode === 'running' && <CirclePlay aria-hidden />}{mode === 'paused' && <CirclePause aria-hidden />}{mode === 'refining' && <Workflow aria-hidden />}{mode === 'review' && <ShieldCheck aria-hidden />}{mode === 'accepted' && <Check aria-hidden />}{mode === 'idle' && <Sparkles aria-hidden />}
					<span><strong>{modeLabel(mode, readyCount)}</strong><small>One run · five independent patch streams · one reversible acceptance boundary</small></span>
				</div>
				<div className="aig-run-actions">
					{liveRun && <><button className="aig-btn aig-btn--ghost" type="button" onClick={discard}><Square aria-hidden /> Stop</button><button className="aig-btn aig-btn--ghost" type="button" onClick={() => setMode((current) => current === 'paused' ? 'running' : 'paused')}>{mode === 'paused' ? <Play aria-hidden /> : <Pause aria-hidden />}{mode === 'paused' ? 'Continue' : 'Pause'}</button><button className="aig-btn aig-btn--soft" type="button" onClick={skipToFinal}>Skip to review</button></>}
					{mode === 'review' && <><button className="aig-btn aig-btn--ghost" type="button" onClick={discard}><X aria-hidden /> Discard</button><button className="aig-btn aig-btn--primary" type="button" onClick={() => setMode('accepted')}><Check aria-hidden /> Accept new version</button></>}
					{accepted && <button className="aig-btn aig-btn--soft" type="button" onClick={startRun}><RotateCcw aria-hidden /> Replay incremental run</button>}
				</div>
			</footer>
		</div>
	);
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Prototype />);
