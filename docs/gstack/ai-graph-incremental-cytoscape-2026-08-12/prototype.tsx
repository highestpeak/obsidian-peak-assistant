import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
	Check,
	ChevronDown,
	CirclePause,
	CirclePlay,
	Clock3,
	GitBranch,
	History,
	LocateFixed,
	Pause,
	Play,
	Plus,
	RotateCcw,
	Search,
	ShieldCheck,
	Sparkles,
	Square,
	Trash2,
	Undo2,
	Workflow,
	X,
} from 'lucide-react';
import {
	AtlasGraphCanvas,
} from '../../../src/ui/component/graph/AtlasGraphCanvas';
import type {
	ResultSubgraphOutput,
} from '../../../src/service/search/graph/resultSubgraph';

type RunMode = 'idle' | 'running' | 'paused' | 'layouting' | 'review' | 'accepted';
type PatchKind = 'inspect' | 'add-node' | 'focus' | 'add-relation' | 'update' | 'remove-relation' | 'remove-node' | 'validate' | 'auto-layout';

interface PatchEvent {
	id: string;
	kind: PatchKind;
	title: string;
	detail: string;
	object: string;
}

const PATCHES: PatchEvent[] = [
	{
		id: 'inspect-sources',
		kind: 'inspect',
		title: 'Inspected changed sources',
		detail: '11 evidence anchors resolved against the frozen v12 source set.',
		object: '11 sources · hashes locked',
	},
	{
		id: 'add-provenance',
		kind: 'add-node',
		title: 'Added Claim provenance',
		detail: 'Placed in the nearest open upper-right slot without creating a relation.',
		object: '+ node · unlinked',
	},
	{
		id: 'add-benchmark',
		kind: 'add-node',
		title: 'Added Evaluation benchmark',
		detail: 'Reserved a separate upper slot; the Agent is still collecting concepts.',
		object: '+ node · unlinked',
	},
	{
		id: 'add-contradiction',
		kind: 'add-node',
		title: 'Added Contradiction check',
		detail: 'Placed left of the current topology, outside every occupied node box.',
		object: '+ node · unlinked',
	},
	{
		id: 'add-control-pair',
		kind: 'add-node',
		title: 'Placed two control nodes',
		detail: 'Source lineage and Human review loop occupy two clear lower slots.',
		object: '+ 2 nodes · still unlinked',
	},
	{
		id: 'add-orphan-hypothesis',
		kind: 'add-node',
		title: 'Added Orphan hypothesis',
		detail: 'The Agent deliberately keeps this candidate disconnected while checking evidence.',
		object: '+ node · no relation by design',
	},
	{
		id: 'add-observability',
		kind: 'add-node',
		title: 'Added Agent observability',
		detail: 'The next collision-free slot lies beyond the current right viewport.',
		object: '+ node · outside viewport',
	},
	{
		id: 'focus-observability',
		kind: 'focus',
		title: 'Focused the off-canvas node',
		detail: 'The camera pans without changing node coordinates or running layout.',
		object: 'focus · Agent observability',
	},
	{
		id: 'connect-evidence',
		kind: 'add-relation',
		title: 'Connected the evidence cluster',
		detail: 'Only now does the Agent draw provenance relations to validated endpoints.',
		object: '+ 2 relations',
	},
	{
		id: 'connect-evaluation',
		kind: 'add-relation',
		title: 'Connected the evaluation cluster',
		detail: 'Benchmark and contradiction nodes gain three directed relations.',
		object: '+ 3 relations',
	},
	{
		id: 'connect-controls',
		kind: 'add-relation',
		title: 'Connected control and observability',
		detail: 'Five relations connect lineage, review, provenance, observability, and GraphRAG.',
		object: '+ 5 relations',
	},
	{
		id: 'update-relation',
		kind: 'update',
		title: 'Refined a relation predicate',
		detail: '“supports” became “grounds” after comparing the source quotation.',
		object: '~ relation · predicate changed',
	},
	{
		id: 'remove-orphan',
		kind: 'remove-node',
		title: 'Removed the ungrounded hypothesis',
		detail: 'The disconnected candidate never entered the semantic diff.',
		object: '− transient node · reversible',
	},
	{
		id: 'remove-stale-path',
		kind: 'remove-relation',
		title: 'Detached the stale keyword path',
		detail: 'Two legacy relations and their node become a reviewable tombstone.',
		object: '− node · − 2 relations',
	},
	{
		id: 'validate-diff',
		kind: 'validate',
		title: 'Validated the working graph',
		detail: 'All final endpoints resolve; transient nodes are excluded from the diff.',
		object: 'diff ready · 20 changes',
	},
	{
		id: 'auto-layout',
		kind: 'auto-layout',
		title: 'Agent chose Auto layout',
		detail: 'All graph mutations are complete, so one intentional full refinement is safe.',
		object: 'auto layout · 12 nodes',
	},
];

const CURSOR_POINTS = [
	{ left: '24%', top: '32%' },
	{ left: '68%', top: '20%' },
	{ left: '44%', top: '17%' },
	{ left: '23%', top: '27%' },
	{ left: '76%', top: '75%' },
	{ left: '38%', top: '77%' },
	{ left: '106%', top: '28%' },
	{ left: '88%', top: '28%' },
	{ left: '64%', top: '38%' },
	{ left: '39%', top: '34%' },
	{ left: '85%', top: '59%' },
	{ left: '48%', top: '54%' },
	{ left: '38%', top: '77%' },
	{ left: '51%', top: '48%' },
	{ left: '78%', top: '18%' },
	{ left: '50%', top: '50%' },
];

const RUN_START_DELAY_MS = 650;
const DEFAULT_PATCH_DWELL_MS = 1100;
const RELATION_PATCH_DWELL_MS = 2200;
const NODE_CORNER_PATCH_KINDS = new Set<PatchKind>(['add-node', 'remove-node', 'focus']);

const BASE_NODES: ResultSubgraphOutput['resultNodes'] = [
	{ id: 'graphrag', path: 'ai-graph://graphrag/root', title: 'GraphRAG', score: 1, communityId: null, folder: 'Concepts', preview: 'Root concept · accepted', incomingLinks: 2, outgoingLinks: 3 },
	{ id: 'retrieval', path: 'ai-graph://graphrag/retrieval', title: 'Retrieval-augmented generation', score: .9, communityId: null, folder: 'Concepts', preview: 'Foundation · accepted', incomingLinks: 1, outgoingLinks: 2 },
	{ id: 'community', path: 'ai-graph://graphrag/community', title: 'Community summarization', score: .82, communityId: null, folder: 'Methods', preview: 'Method · accepted', incomingLinks: 1, outgoingLinks: 1 },
	{ id: 'global-search', path: 'ai-graph://graphrag/global-search', title: 'Global search', score: .8, communityId: null, folder: 'Methods', preview: 'Capability · accepted', incomingLinks: 2, outgoingLinks: 1 },
	{ id: 'evidence', path: 'ai-graph://graphrag/evidence', title: 'Evidence-linked graph', score: .78, communityId: null, folder: 'Evidence', preview: 'Evidence pattern · accepted', incomingLinks: 1, outgoingLinks: 2 },
	{ id: 'citations', path: 'ai-graph://graphrag/citations', title: 'Citation-aware retrieval', score: .7, communityId: null, folder: 'Evidence', preview: 'Claim · accepted', incomingLinks: 1, outgoingLinks: 0 },
	{ id: 'keyword', path: 'ai-graph://graphrag/keyword', title: 'Keyword-only clustering', score: .34, communityId: null, folder: 'Legacy', preview: 'Legacy branch · removal candidate', incomingLinks: 1, outgoingLinks: 1 },
];

const BASE_EDGES: ResultSubgraphOutput['edges'] = [
	{ from: 'graphrag', to: 'retrieval', kind: 'reference', directionality: 'directed' },
	{ from: 'graphrag', to: 'community', kind: 'reference', directionality: 'directed' },
	{ from: 'community', to: 'global-search', kind: 'reference', directionality: 'directed' },
	{ from: 'retrieval', to: 'evidence', kind: 'reference', directionality: 'directed' },
	{ from: 'evidence', to: 'citations', kind: 'reference', directionality: 'directed' },
	{ from: 'retrieval', to: 'keyword', kind: 'semantic', directionality: 'undirected', weight: .58 },
	{ from: 'keyword', to: 'community', kind: 'semantic', directionality: 'undirected', weight: .42 },
];

const STABLE_SUBGRAPH: ResultSubgraphOutput = {
	resultNodes: BASE_NODES.map((node) => ({ ...node })),
	hubAnchors: [],
	edges: BASE_EDGES.map((edge) => ({ ...edge })),
	isolatedDocIds: [],
	overflowCount: 0,
};

const FINAL_SUBGRAPH: ResultSubgraphOutput = {
	resultNodes: [
		...BASE_NODES.filter((node) => node.id !== 'keyword').map((node) => ({ ...node })),
		{
			id: 'provenance',
			path: 'ai-graph://graphrag/provenance',
			title: 'Claim provenance',
			score: .92,
			communityId: null,
			folder: 'Evidence',
			preview: 'Accepted evidence concept',
			incomingLinks: 1,
			outgoingLinks: 3,
		},
		{
			id: 'benchmark',
			path: 'ai-graph://graphrag/benchmark',
			title: 'Evaluation benchmark',
			score: .88,
			communityId: null,
			folder: 'Evaluation',
			preview: 'Accepted evaluation concept',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
		{
			id: 'contradiction',
			path: 'ai-graph://graphrag/contradiction',
			title: 'Contradiction check',
			score: .84,
			communityId: null,
			folder: 'Evaluation',
			preview: 'Accepted validation concept',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
		{
			id: 'source-lineage',
			path: 'ai-graph://graphrag/source-lineage',
			title: 'Source lineage',
			score: .9,
			communityId: null,
			folder: 'Evidence',
			preview: 'Accepted lineage concept',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
		{
			id: 'human-review',
			path: 'ai-graph://graphrag/human-review',
			title: 'Human review loop',
			score: .86,
			communityId: null,
			folder: 'Controls',
			preview: 'Accepted review control',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
		{
			id: 'agent-observability',
			path: 'ai-graph://graphrag/agent-observability',
			title: 'Agent observability',
			score: .82,
			communityId: null,
			folder: 'Controls',
			preview: 'Accepted observability concept',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
	],
	hubAnchors: [],
	edges: [
		...BASE_EDGES.filter((edge) => edge.from !== 'keyword' && edge.to !== 'keyword').map((edge) => ({ ...edge })),
		{ from: 'evidence', to: 'provenance', kind: 'reference', directionality: 'directed' },
		{ from: 'provenance', to: 'citations', kind: 'reference', directionality: 'directed' },
		{ from: 'global-search', to: 'benchmark', kind: 'reference', directionality: 'directed' },
		{ from: 'benchmark', to: 'contradiction', kind: 'reference', directionality: 'directed' },
		{ from: 'contradiction', to: 'retrieval', kind: 'reference', directionality: 'directed' },
		{ from: 'evidence', to: 'source-lineage', kind: 'reference', directionality: 'directed' },
		{ from: 'source-lineage', to: 'provenance', kind: 'reference', directionality: 'directed' },
		{ from: 'provenance', to: 'human-review', kind: 'reference', directionality: 'directed' },
		{ from: 'human-review', to: 'agent-observability', kind: 'reference', directionality: 'directed' },
		{ from: 'agent-observability', to: 'graphrag', kind: 'reference', directionality: 'directed' },
	],
	isolatedDocIds: [],
	overflowCount: 0,
};

interface WorkingOverlayProps {
	hidden: boolean;
	step: number;
}

type EdgeDelayClass = '' | 'is-delay' | 'is-delay-2' | 'is-delay-3' | 'is-delay-4';

interface AddedEdgeProps {
	d: string;
	delayClass?: EdgeDelayClass;
	length: number;
}

type AddedEdgeStyle = React.CSSProperties & {
	'--aig-edge-length': string;
};

function AddedEdge({ d, delayClass = '', length }: AddedEdgeProps): React.ReactElement {
	const classSuffix = delayClass ? ` ${delayClass}` : '';
	const style: AddedEdgeStyle = { '--aig-edge-length': `${length}` };

	return (
		<>
			<path className={`aig-overlay-edge is-added${classSuffix}`} d={d} style={style} />
			<path className={`aig-overlay-edge-head${classSuffix}`} d={d} style={style} />
		</>
	);
}

interface ProposalNodeProps {
	className: string;
	connected: boolean;
	meta: string;
	title: string;
	tombstone?: boolean;
}

function ProposalNode({ className, connected, meta, title, tombstone = false }: ProposalNodeProps): React.ReactElement {
	return (
		<div className={`aig-overlay-node ${className}${connected ? ' is-linked' : ' is-unlinked'}${tombstone ? ' is-tombstone' : ''}`}>
			<span>{tombstone ? 'REMOVAL PROPOSED' : connected ? 'CONNECTED NODE' : 'PLACED · UNLINKED'}</span>
			<strong>{title}</strong>
			<small>{tombstone ? 'Transient candidate · excluded from diff' : meta}</small>
		</div>
	);
}

function WorkingOverlay({ hidden, step }: WorkingOverlayProps): React.ReactElement {
	const showProvenance = step >= 2;
	const showBenchmark = step >= 3;
	const showContradiction = step >= 4;
	const showControlPair = step >= 5;
	const showOrphan = step >= 6;
	const showObservability = step >= 7;
	const showFocus = step >= 8;
	const showEvidenceRelations = step >= 9;
	const showEvaluationRelations = step >= 10;
	const showControlRelations = step >= 11;
	const showRelationUpdate = step >= 12;
	const removeOrphan = step >= 13;
	const removeKeyword = step >= 14;
	const stagedNodeCount = Math.min(7, Math.max(0, step - 1));

	return (
		<div className={`aig-working-overlay${hidden ? ' is-refined-away' : ''}`} aria-hidden="true">
			<svg className="aig-overlay-edges" viewBox="0 0 1000 620" preserveAspectRatio="none">
				<defs>
					<marker id="aig-arrow-added" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
						<path d="M0,0 L7,3.5 L0,7 Z" />
					</marker>
				</defs>
				{showEvidenceRelations && (
					<>
						<AddedEdge d="M555 332 C585 270 620 205 642 151" length={201} />
						<AddedEdge d="M756 124 C800 178 805 270 760 332" delayClass="is-delay" length={223} />
					</>
				)}
				{showEvaluationRelations && (
					<>
						<AddedEdge d="M920 305 C785 190 625 118 516 106" length={457} />
						<AddedEdge d="M364 106 C344 122 325 145 306 159" delayClass="is-delay" length={79} />
						<AddedEdge d="M232 194 C238 245 255 286 275 326" delayClass="is-delay-2" length={140} />
					</>
				)}
				{showControlRelations && (
					<>
						<AddedEdge d="M555 350 C600 396 625 440 644 465" length={146} />
						<AddedEdge d="M720 438 C720 324 710 230 700 151" delayClass="is-delay" length={288} />
						<AddedEdge d="M720 151 C800 225 850 332 875 412" delayClass="is-delay-2" length={307} />
						<AddedEdge d="M956 440 C995 345 1005 250 984 190" delayClass="is-delay-3" length={257} />
						<AddedEdge d="M984 174 C835 65 330 72 92 306" delayClass="is-delay-4" length={952} />
					</>
				)}
				{removeKeyword && (
					<>
						<path className="aig-overlay-edge is-removing" d="M360 318 C400 316 430 306 460 300" />
						<path className="aig-overlay-edge is-removing is-delay" d="M555 299 C595 298 630 291 655 286" />
					</>
				)}
			</svg>

			{showProvenance && (
				<ProposalNode className="aig-overlay-node--provenance" connected={showEvidenceRelations} title="Claim provenance" meta="Evidence · confidence 0.92" />
			)}
			{showBenchmark && (
				<ProposalNode className="aig-overlay-node--benchmark" connected={showEvaluationRelations} title="Evaluation benchmark" meta="Evaluation · confidence 0.88" />
			)}
			{showContradiction && (
				<ProposalNode className="aig-overlay-node--contradiction" connected={showEvaluationRelations} title="Contradiction check" meta="Validation · confidence 0.84" />
			)}
			{showControlPair && (
				<>
					<ProposalNode className="aig-overlay-node--lineage" connected={showControlRelations} title="Source lineage" meta="Evidence · confidence 0.90" />
					<ProposalNode className="aig-overlay-node--review" connected={showControlRelations} title="Human review loop" meta="Control · confidence 0.86" />
				</>
			)}
			{showOrphan && (
				<ProposalNode className="aig-overlay-node--orphan" connected={false} tombstone={removeOrphan} title="Orphan hypothesis" meta="Hypothesis · evidence pending" />
			)}
			{showObservability && (
				<ProposalNode className="aig-overlay-node--observability" connected={showControlRelations} title="Agent observability" meta="Control · confidence 0.82" />
			)}
			{showRelationUpdate && (
				<div className="aig-relation-update"><GitBranch aria-hidden /><span>supports</span><b>grounds</b></div>
			)}
			{showProvenance && !showEvidenceRelations && (
				<div className="aig-placement-batch"><Plus aria-hidden /><span><strong>{stagedNodeCount} staged nodes</strong><small>0 relations · placement first</small></span></div>
			)}
			{showFocus && (
				<div className="aig-focus-chip"><LocateFixed aria-hidden /><span>Focused · Agent observability</span></div>
			)}
			{removeKeyword && (
				<div className="aig-tombstone is-node-removal">
					<Trash2 aria-hidden />
					<span><strong>Keyword-only clustering</strong><small>Node + 2 relations · original position retained</small></span>
				</div>
			)}
		</div>
	);
}

function patchIcon(kind: PatchKind): React.ReactNode {
	if (kind === 'add-node' || kind === 'add-relation') return <Plus aria-hidden />;
	if (kind === 'remove-node' || kind === 'remove-relation') return <Trash2 aria-hidden />;
	if (kind === 'focus') return <LocateFixed aria-hidden />;
	if (kind === 'auto-layout') return <Workflow aria-hidden />;
	if (kind === 'validate') return <ShieldCheck aria-hidden />;
	if (kind === 'update') return <GitBranch aria-hidden />;
	return <Search aria-hidden />;
}

function modeLabel(mode: RunMode): string {
	if (mode === 'running') return 'Agent update in progress';
	if (mode === 'paused') return 'Update paused';
	if (mode === 'layouting') return 'Agent auto-layout in progress';
	if (mode === 'review') return 'Review working diff';
	if (mode === 'accepted') return 'Version v13 created';
	return 'Version v12 · ready';
}

function Prototype(): React.ReactElement {
	const [mode, setMode] = useState<RunMode>('idle');
	const [patchIndex, setPatchIndex] = useState(-1);
	const [activityTab, setActivityTab] = useState<'live' | 'review'>('live');
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const startedOnce = useRef(false);
	const currentPatchRef = useRef<HTMLDivElement | null>(null);

	const accepted = mode === 'accepted';
	const refined = mode === 'layouting' || mode === 'review' || accepted;
	const visibleStep = refined ? PATCHES.length : patchIndex + 1;
	const activePatch = patchIndex >= 0 ? PATCHES[Math.min(patchIndex, PATCHES.length - 1)] : null;
	const anchorAgentToNodeCorner = activePatch ? NODE_CORNER_PATCH_KINDS.has(activePatch.kind) : false;
	const cursor = CURSOR_POINTS[Math.max(0, Math.min(patchIndex, CURSOR_POINTS.length - 1))] ?? CURSOR_POINTS[0];
	const focusOverflow = visibleStep >= 8 && !refined;
	const visibleNodeCount = BASE_NODES.length
		+ (visibleStep >= 2 ? 1 : 0)
		+ (visibleStep >= 3 ? 1 : 0)
		+ (visibleStep >= 4 ? 1 : 0)
		+ (visibleStep >= 5 ? 2 : 0)
		+ (visibleStep >= 6 ? 1 : 0)
		+ (visibleStep >= 7 ? 1 : 0)
		- (visibleStep >= 13 ? 1 : 0)
		- (visibleStep >= 14 ? 1 : 0);
	const visibleRelationCount = BASE_EDGES.length
		+ (visibleStep >= 9 ? 2 : 0)
		+ (visibleStep >= 10 ? 3 : 0)
		+ (visibleStep >= 11 ? 5 : 0)
		- (visibleStep >= 14 ? 2 : 0);

	const startRun = (): void => {
		setMode('running');
		setPatchIndex(-1);
		setActivityTab('live');
		setSelectedNode(null);
	};

	useEffect(() => {
		if (startedOnce.current) return;
		startedOnce.current = true;
		const timer = window.setTimeout(startRun, RUN_START_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (mode !== 'running') return;
		if (patchIndex >= PATCHES.length - 1) {
			const layoutTimer = window.setTimeout(() => setMode('layouting'), 700);
			return () => window.clearTimeout(layoutTimer);
		}
		let dwellMs = DEFAULT_PATCH_DWELL_MS;
		if (patchIndex < 0) dwellMs = RUN_START_DELAY_MS;
		if (activePatch?.kind === 'add-relation') dwellMs = RELATION_PATCH_DWELL_MS;
		const timer = window.setTimeout(() => setPatchIndex((current) => current + 1), dwellMs);
		return () => window.clearTimeout(timer);
	}, [mode, patchIndex]);

	useEffect(() => {
		if (mode !== 'layouting') return;
		const reviewTimer = window.setTimeout(() => {
			setMode('review');
			setActivityTab('review');
		}, 1650);
		return () => window.clearTimeout(reviewTimer);
	}, [mode]);

	useEffect(() => {
		currentPatchRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}, [mode, patchIndex]);

	const togglePause = (): void => {
		setMode((current) => current === 'paused' ? 'running' : 'paused');
	};

	const skipToReview = (): void => {
		setPatchIndex(PATCHES.length - 1);
		setMode('layouting');
		setActivityTab('live');
	};

	const discard = (): void => {
		setMode('idle');
		setPatchIndex(-1);
		setActivityTab('live');
	};

	return (
		<div className="aig-mock peak-design-root">
			<header className="aig-topbar">
				<div className="aig-brand">
					<div className="aig-brandmark"><Sparkles aria-hidden /></div>
					<div>
						<span className="aig-eyebrow">PEAK AI GRAPH</span>
						<span className="aig-title">GraphRAG research map</span>
					</div>
					<span className="aig-version">{accepted ? 'v13' : 'v12'}</span>
				</div>
				<div className={`aig-status aig-status--${mode}`}>
					<span className="aig-status__dot" />
					{modeLabel(mode)}
				</div>
				<div className="aig-actions">
					<button className="aig-btn aig-btn--ghost" type="button"><History aria-hidden /> History</button>
					<button className="aig-btn aig-btn--ghost" type="button">Topology <ChevronDown aria-hidden /></button>
					<button className="aig-btn aig-btn--primary" type="button" onClick={startRun} disabled={mode === 'running' || mode === 'layouting'}>
						<RotateCcw aria-hidden /> Replay run
					</button>
				</div>
			</header>

			<section className="aig-instruction">
				<div className="aig-instruction__icon"><Sparkles aria-hidden /></div>
				<div className="aig-instruction__copy">
					<span className="aig-instruction__label">Update instruction</span>
					<span>Broaden the evidence, evaluation, and control model. Keep uncertain concepts disconnected until grounded; remove unsupported candidates.</span>
				</div>
				<div className="aig-context-chip">v12 frozen base</div>
				<div className="aig-context-chip">11 sources</div>
			</section>

			<main className="aig-workspace">
				<section className="aig-canvas-card">
					<div className="aig-canvas-head">
						<div>
							<span className="aig-section-title">Working graph</span>
							<span className="aig-section-subtitle">{refined ? 'Agent auto-layout · complete proposed graph' : focusOverflow ? 'Viewport follows the newest off-canvas node · coordinates remain stable' : 'Canonical v12 + collision-free Agent placement overlay'}</span>
						</div>
						<div className="aig-legend">
							<span className="aig-spatial-lock">{refined ? <><Workflow aria-hidden /> Auto-layout applied</> : focusOverflow ? <><LocateFixed aria-hidden /> Focus follows newest</> : <><ShieldCheck aria-hidden /> Spatial lock</>}</span>
							<span><i className="is-existing" /> Existing</span>
							<span><i className="is-added" /> Added</span>
							<span><i className="is-removed" /> Removal</span>
						</div>
					</div>
					<div className={`aig-canvas aig-canvas--${mode}`}>
						<div className={`aig-working-scene${focusOverflow ? ' is-focus-overflow' : ''}${refined ? ' is-refined-away' : ''}`}>
							<div className="aig-graph-layer aig-graph-layer--working">
								<AtlasGraphCanvas
									subgraph={STABLE_SUBGRAPH}
									preset="flow-lr"
									showSemantic
									summary={`${visibleNodeCount} nodes · ${visibleRelationCount} relations`}
									emptyLabel="No graph objects"
									buildingLabel="Preparing Cytoscape canvas…"
									onNodeTap={(node) => setSelectedNode(node.id)}
								/>
							</div>
							<WorkingOverlay hidden={false} step={visibleStep} />
						</div>
						{refined && (
							<div className="aig-graph-layer aig-graph-layer--refined">
								<AtlasGraphCanvas
									subgraph={FINAL_SUBGRAPH}
									preset="flow-lr"
									showSemantic
									summary={`${FINAL_SUBGRAPH.resultNodes.length} nodes · ${FINAL_SUBGRAPH.edges.length} relations`}
									emptyLabel="No graph objects"
									buildingLabel="Refining complete graph…"
									onNodeTap={(node) => setSelectedNode(node.id)}
								/>
							</div>
						)}
						{(mode === 'running' || mode === 'paused' || mode === 'layouting') && activePatch && (
							<div
								className={`aig-agent-cursor aig-agent-cursor--${activePatch.kind}${anchorAgentToNodeCorner ? ' is-node-corner' : ''}`}
								style={cursor}
							>
								<span>{patchIcon(activePatch.kind)}</span>
								<b>{activePatch.object}</b>
							</div>
						)}
						{mode === 'review' && (
							<div className="aig-review-watermark"><ShieldCheck aria-hidden /><span>Working diff ready</span></div>
						)}
						{mode === 'layouting' && (
							<div className="aig-refine-stage"><Workflow aria-hidden /><span><strong>Agent chose Auto layout</strong><small>12 nodes · 15 relations · one intentional reflow</small></span></div>
						)}
						{mode === 'accepted' && (
							<div className="aig-accepted-watermark"><Check aria-hidden /><span>v13 is now the canonical head</span></div>
						)}
					</div>
					<footer className="aig-canvas-footer">
						<div className="aig-base-lock"><ShieldCheck aria-hidden /><span><b>{accepted ? 'v13 canonical' : refined ? 'Auto-layout complete · v12 unchanged' : focusOverflow ? 'Focused newest node · graph positions unchanged' : 'v12 unchanged · occupied slots protected'}</b>{accepted ? ' · immutable version created' : refined ? ' · ready for semantic diff review' : ' · Agent changes are not saved yet'}</span></div>
						{selectedNode && <span className="aig-selection">Selected: {selectedNode}</span>}
					</footer>
				</section>

				<aside className="aig-rail">
					<div className="aig-rail-tabs">
						<button className={activityTab === 'live' ? 'is-active' : ''} type="button" onClick={() => setActivityTab('live')}>Live activity</button>
						<button className={activityTab === 'review' ? 'is-active' : ''} type="button" onClick={() => setActivityTab('review')}>Review <span>20</span></button>
					</div>

					{activityTab === 'live' ? (
						<div className="aig-feed">
							<div className="aig-feed-summary">
								<div className="aig-agent-avatar"><Sparkles aria-hidden /></div>
								<div><strong>Graph Update Agent</strong><span>{mode === 'idle' ? 'Ready to replay' : mode === 'accepted' ? 'Run accepted' : mode === 'layouting' ? '16 operations complete · auto-layout running' : `${Math.max(0, patchIndex + 1)} of ${PATCHES.length} operations`}</span></div>
							</div>
							<div className="aig-progress"><span style={{ width: `${refined ? 100 : Math.max(3, ((patchIndex + 1) / PATCHES.length) * 100)}%` }} /></div>
							<div className="aig-feed-list">
								{PATCHES.map((patch, index) => {
									const completed = accepted || index <= patchIndex;
									const current = !accepted && index === patchIndex && (mode === 'running' || mode === 'paused' || mode === 'layouting');
									return (
										<div ref={current ? currentPatchRef : undefined} key={patch.id} className={`aig-feed-item${completed ? ' is-complete' : ''}${current ? ' is-current' : ''}`}>
											<div className={`aig-feed-item__icon is-${patch.kind}`}>{completed ? patchIcon(patch.kind) : <Clock3 aria-hidden />}</div>
											<div><strong>{patch.title}</strong><span>{patch.detail}</span><small>{patch.object}</small></div>
										</div>
									);
								})}
							</div>
						</div>
					) : (
						<div className="aig-review">
							<div className="aig-review-head"><span>Semantic diff</span><strong>20 changes</strong></div>
							<div className="aig-review-group is-add">
								<div><Plus aria-hidden /><strong>Added</strong><span>16</span></div>
								<button type="button">Evidence expansion <small>2 nodes · 4 relations</small></button>
								<button type="button">Evaluation checks <small>2 nodes · 3 relations</small></button>
								<button type="button">Control + observability <small>2 nodes · 3 relations</small></button>
							</div>
							<div className="aig-review-group is-change">
								<div><GitBranch aria-hidden /><strong>Changed</strong><span>1</span></div>
								<button type="button">supports → grounds <small>relation</small></button>
							</div>
							<div className="aig-review-group is-remove">
								<div><Trash2 aria-hidden /><strong>Removed</strong><span>3</span></div>
								<button type="button">Keyword-only clustering <small>node</small></button>
								<button type="button">Legacy semantic path <small>2 relations</small></button>
							</div>
							<div className="aig-evidence-note"><ShieldCheck aria-hidden /><span><strong>Validation passed</strong>All endpoints resolve · 11 evidence anchors · transient orphan excluded · base head is still v12</span></div>
						</div>
					)}
				</aside>
			</main>

			<footer className="aig-runbar">
				<div className="aig-runbar__state">
					{mode === 'running' && <CirclePlay aria-hidden />}
					{mode === 'paused' && <CirclePause aria-hidden />}
					{mode === 'layouting' && <Workflow aria-hidden />}
					{mode === 'review' && <ShieldCheck aria-hidden />}
					{mode === 'accepted' && <Check aria-hidden />}
					{mode === 'idle' && <Sparkles aria-hidden />}
					<span><strong>{modeLabel(mode)}</strong><small>{mode === 'accepted' ? 'v12 remains available in History' : 'All mutations remain reversible until acceptance'}</small></span>
				</div>
				<div className="aig-runbar__actions">
					{(mode === 'running' || mode === 'paused') && (
						<>
							<button className="aig-btn aig-btn--ghost" type="button" onClick={discard}><Square aria-hidden /> Stop</button>
							<button className="aig-btn aig-btn--ghost" type="button" onClick={togglePause}>{mode === 'paused' ? <Play aria-hidden /> : <Pause aria-hidden />}{mode === 'paused' ? 'Continue' : 'Pause'}</button>
							<button className="aig-btn aig-btn--soft" type="button" onClick={skipToReview}>Skip to review</button>
						</>
					)}
					{mode === 'review' && (
						<>
							<button className="aig-btn aig-btn--ghost" type="button" onClick={discard}><X aria-hidden /> Discard</button>
							<button className="aig-btn aig-btn--ghost" type="button"><Undo2 aria-hidden /> Exclude selected</button>
							<button className="aig-btn aig-btn--primary" type="button" onClick={() => setMode('accepted')}><Check aria-hidden /> Accept new version</button>
						</>
					)}
					{(mode === 'idle' || mode === 'accepted') && (
						<button className="aig-btn aig-btn--primary" type="button" onClick={startRun}><RotateCcw aria-hidden /> Replay incremental run</button>
					)}
				</div>
			</footer>
		</div>
	);
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Prototype />);
