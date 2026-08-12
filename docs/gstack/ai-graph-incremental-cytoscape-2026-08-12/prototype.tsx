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
	X,
} from 'lucide-react';
import {
	AtlasGraphCanvas,
} from '../../../src/ui/component/graph/AtlasGraphCanvas';
import type {
	ResultSubgraphOutput,
} from '../../../src/service/search/graph/resultSubgraph';

type RunMode = 'idle' | 'running' | 'paused' | 'refining' | 'review' | 'accepted';
type PatchKind = 'inspect' | 'add-node' | 'add-relation' | 'update' | 'remove-relation' | 'remove-node' | 'validate';

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
		detail: '4 evidence anchors resolved against the frozen v12 source set.',
		object: 'GraphRAG notes · source hash locked',
	},
	{
		id: 'add-provenance',
		kind: 'add-node',
		title: 'Added Claim provenance',
		detail: 'A new evidence-bearing concept arrived in the working overlay.',
		object: '+ node · suggested',
	},
	{
		id: 'connect-provenance',
		kind: 'add-relation',
		title: 'Connected provenance to evidence chain',
		detail: 'Two directed relations were drawn after endpoint validation.',
		object: '+ 2 relations · evidence linked',
	},
	{
		id: 'add-review-loop',
		kind: 'add-node',
		title: 'Added Human review loop',
		detail: 'The Agent found a missing control-plane concept and its supporting claim.',
		object: '+ node · confidence 0.86',
	},
	{
		id: 'update-relation',
		kind: 'update',
		title: 'Refined a relation',
		detail: '“supports” became “grounds” after comparing the source quotation.',
		object: '~ relation · predicate changed',
	},
	{
		id: 'remove-stale-path',
		kind: 'remove-relation',
		title: 'Detached a stale path',
		detail: 'The old keyword-only branch is kept visible as a removal candidate.',
		object: '− 2 relations · reversible',
	},
	{
		id: 'remove-stale-node',
		kind: 'remove-node',
		title: 'Proposed node removal',
		detail: 'Keyword-only clustering is now a tombstone, not an immediate delete.',
		object: '− node · pending review',
	},
	{
		id: 'validate-diff',
		kind: 'validate',
		title: 'Validated working graph',
		detail: 'All relations resolve, evidence exists, and the base revision is still v12.',
		object: 'diff ready · 10 changes',
	},
];

const CURSOR_POINTS = [
	{ left: '24%', top: '32%' },
	{ left: '69%', top: '29%' },
	{ left: '62%', top: '42%' },
	{ left: '72%', top: '71%' },
	{ left: '50%', top: '54%' },
	{ left: '51%', top: '48%' },
	{ left: '51%', top: '48%' },
	{ left: '82%', top: '19%' },
];

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
			outgoingLinks: 2,
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
	],
	hubAnchors: [],
	edges: [
		...BASE_EDGES.filter((edge) => edge.from !== 'keyword' && edge.to !== 'keyword').map((edge) => ({ ...edge })),
		{ from: 'evidence', to: 'provenance', kind: 'reference', directionality: 'directed' },
		{ from: 'provenance', to: 'citations', kind: 'reference', directionality: 'directed' },
		{ from: 'provenance', to: 'human-review', kind: 'reference', directionality: 'directed' },
		{ from: 'human-review', to: 'graphrag', kind: 'reference', directionality: 'directed' },
	],
	isolatedDocIds: [],
	overflowCount: 0,
};

interface WorkingOverlayProps {
	hidden: boolean;
	step: number;
}

function WorkingOverlay({ hidden, step }: WorkingOverlayProps): React.ReactElement {
	const showProvenance = step >= 2;
	const showProvenanceRelations = step >= 3;
	const showReviewLoop = step >= 4;
	const showRelationUpdate = step >= 5;
	const showDetachedPath = step >= 6;
	const showTombstone = step >= 7;

	return (
		<div className={`aig-working-overlay${hidden ? ' is-refined-away' : ''}`} aria-hidden="true">
			<svg className="aig-overlay-edges" viewBox="0 0 1000 620" preserveAspectRatio="none">
				<defs>
					<marker id="aig-arrow-added" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
						<path d="M0,0 L7,3.5 L0,7 Z" />
					</marker>
				</defs>
				{showProvenanceRelations && (
					<>
						<path className="aig-overlay-edge is-added" d="M555 332 C585 286 602 246 635 208" />
						<path className="aig-overlay-edge is-added is-delay" d="M745 208 C790 248 785 298 730 332" />
					</>
				)}
				{showReviewLoop && (
					<>
						<path className="aig-overlay-edge is-added" d="M705 208 C735 272 744 356 720 423" />
						<path className="aig-overlay-edge is-added is-delay" d="M645 440 C500 535 230 520 86 306" />
					</>
				)}
				{showDetachedPath && (
					<>
						<path className="aig-overlay-edge is-removing" d="M360 318 C400 316 430 306 460 300" />
						<path className="aig-overlay-edge is-removing is-delay" d="M555 299 C595 298 630 291 655 286" />
					</>
				)}
			</svg>

			{showProvenance && (
				<div className="aig-overlay-node aig-overlay-node--provenance">
					<span>PROPOSED NODE</span>
					<strong>Claim provenance</strong>
					<small>Evidence · confidence 0.92</small>
				</div>
			)}
			{showReviewLoop && (
				<div className="aig-overlay-node aig-overlay-node--review">
					<span>PROPOSED NODE</span>
					<strong>Human review loop</strong>
					<small>Control · confidence 0.86</small>
				</div>
			)}
			{showRelationUpdate && (
				<div className="aig-relation-update"><GitBranch aria-hidden /><span>supports</span><b>grounds</b></div>
			)}
			{showDetachedPath && !showTombstone && (
				<div className="aig-detach-badge"><Trash2 aria-hidden /><span>2 relations detaching</span></div>
			)}
			{showTombstone && (
				<div className="aig-tombstone is-node-removal">
					<Trash2 aria-hidden />
					<span><strong>Keyword-only clustering</strong><small>Removal proposed · original position retained</small></span>
				</div>
			)}
		</div>
	);
}

function patchIcon(kind: PatchKind): React.ReactNode {
	if (kind === 'add-node' || kind === 'add-relation') return <Plus aria-hidden />;
	if (kind === 'remove-node' || kind === 'remove-relation') return <Trash2 aria-hidden />;
	if (kind === 'validate') return <ShieldCheck aria-hidden />;
	if (kind === 'update') return <GitBranch aria-hidden />;
	return <Search aria-hidden />;
}

function modeLabel(mode: RunMode): string {
	if (mode === 'running') return 'Agent update in progress';
	if (mode === 'paused') return 'Update paused';
	if (mode === 'refining') return 'Refining complete graph';
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

	const accepted = mode === 'accepted';
	const refined = mode === 'refining' || mode === 'review' || accepted;
	const visibleStep = refined ? PATCHES.length : patchIndex + 1;
	const activePatch = patchIndex >= 0 ? PATCHES[Math.min(patchIndex, PATCHES.length - 1)] : null;
	const cursor = CURSOR_POINTS[Math.max(0, Math.min(patchIndex, CURSOR_POINTS.length - 1))] ?? CURSOR_POINTS[0];
	const visibleNodeCount = BASE_NODES.length + (visibleStep >= 2 ? 1 : 0) + (visibleStep >= 4 ? 1 : 0) - (accepted ? 1 : 0);
	const visibleRelationCount = BASE_EDGES.length + (visibleStep >= 3 ? 2 : 0) + (visibleStep >= 4 ? 2 : 0) - (visibleStep >= 6 ? 2 : 0);

	const startRun = (): void => {
		setMode('running');
		setPatchIndex(-1);
		setActivityTab('live');
		setSelectedNode(null);
	};

	useEffect(() => {
		if (startedOnce.current) return;
		startedOnce.current = true;
		const timer = window.setTimeout(startRun, 650);
		return () => window.clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (mode !== 'running') return;
		if (patchIndex >= PATCHES.length - 1) {
			const refineTimer = window.setTimeout(() => setMode('refining'), 700);
			return () => window.clearTimeout(refineTimer);
		}
		const timer = window.setTimeout(() => setPatchIndex((current) => current + 1), patchIndex < 0 ? 650 : 1350);
		return () => window.clearTimeout(timer);
	}, [mode, patchIndex]);

	useEffect(() => {
		if (mode !== 'refining') return;
		const reviewTimer = window.setTimeout(() => {
			setMode('review');
			setActivityTab('review');
		}, 1500);
		return () => window.clearTimeout(reviewTimer);
	}, [mode]);

	const togglePause = (): void => {
		setMode((current) => current === 'paused' ? 'running' : 'paused');
	};

	const skipToReview = (): void => {
		setPatchIndex(PATCHES.length - 1);
		setMode('refining');
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
					<button className="aig-btn aig-btn--primary" type="button" onClick={startRun} disabled={mode === 'running' || mode === 'refining'}>
						<RotateCcw aria-hidden /> Replay run
					</button>
				</div>
			</header>

			<section className="aig-instruction">
				<div className="aig-instruction__icon"><Sparkles aria-hidden /></div>
				<div className="aig-instruction__copy">
					<span className="aig-instruction__label">Update instruction</span>
					<span>Add claim provenance and a human review loop. Remove the obsolete keyword-only branch when evidence no longer supports it.</span>
				</div>
				<div className="aig-context-chip">v12 frozen base</div>
				<div className="aig-context-chip">4 sources</div>
			</section>

			<main className="aig-workspace">
				<section className="aig-canvas-card">
					<div className="aig-canvas-head">
						<div>
							<span className="aig-section-title">Working graph</span>
							<span className="aig-section-subtitle">{refined ? 'Complete proposed graph · one intentional reflow' : 'Canonical v12 + reversible Agent overlay'}</span>
						</div>
						<div className="aig-legend">
							<span className="aig-spatial-lock">{refined ? <><Sparkles aria-hidden /> Refined once</> : <><ShieldCheck aria-hidden /> Spatial lock</>}</span>
							<span><i className="is-existing" /> Existing</span>
							<span><i className="is-added" /> Added</span>
							<span><i className="is-removed" /> Removal</span>
						</div>
					</div>
					<div className={`aig-canvas aig-canvas--${mode}`}>
						<div className={`aig-graph-layer aig-graph-layer--working${refined ? ' is-refined-away' : ''}`}>
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
						<WorkingOverlay hidden={refined} step={visibleStep} />
						{(mode === 'running' || mode === 'paused') && activePatch && (
							<div
								className={`aig-agent-cursor aig-agent-cursor--${activePatch.kind}`}
								style={cursor}
							>
								<span>{patchIcon(activePatch.kind)}</span>
								<b>{activePatch.object}</b>
							</div>
						)}
						{mode === 'review' && (
							<div className="aig-review-watermark"><ShieldCheck aria-hidden /><span>Working diff ready</span></div>
						)}
						{mode === 'refining' && (
							<div className="aig-refine-stage"><Sparkles aria-hidden /><span><strong>Refining complete graph</strong><small>One intentional reflow after all 8 operations</small></span></div>
						)}
						{mode === 'accepted' && (
							<div className="aig-accepted-watermark"><Check aria-hidden /><span>v13 is now the canonical head</span></div>
						)}
					</div>
					<footer className="aig-canvas-footer">
						<div className="aig-base-lock"><ShieldCheck aria-hidden /><span><b>{accepted ? 'v13 canonical' : refined ? 'Refined working graph · v12 unchanged' : 'v12 unchanged · positions locked'}</b>{accepted ? ' · immutable version created' : refined ? ' · ready for semantic diff review' : ' · Agent changes are not saved yet'}</span></div>
						{selectedNode && <span className="aig-selection">Selected: {selectedNode}</span>}
					</footer>
				</section>

				<aside className="aig-rail">
					<div className="aig-rail-tabs">
						<button className={activityTab === 'live' ? 'is-active' : ''} type="button" onClick={() => setActivityTab('live')}>Live activity</button>
						<button className={activityTab === 'review' ? 'is-active' : ''} type="button" onClick={() => setActivityTab('review')}>Review <span>10</span></button>
					</div>

					{activityTab === 'live' ? (
						<div className="aig-feed">
							<div className="aig-feed-summary">
								<div className="aig-agent-avatar"><Sparkles aria-hidden /></div>
								<div><strong>Graph Update Agent</strong><span>{mode === 'idle' ? 'Ready to replay' : mode === 'accepted' ? 'Run accepted' : mode === 'refining' ? '8 operations complete · refining layout' : `${Math.max(0, patchIndex + 1)} of ${PATCHES.length} operations`}</span></div>
							</div>
							<div className="aig-progress"><span style={{ width: `${accepted ? 100 : Math.max(3, ((patchIndex + 1) / PATCHES.length) * 100)}%` }} /></div>
							<div className="aig-feed-list">
								{PATCHES.map((patch, index) => {
									const completed = accepted || index <= patchIndex;
									const current = !accepted && index === patchIndex && (mode === 'running' || mode === 'paused');
									return (
										<div key={patch.id} className={`aig-feed-item${completed ? ' is-complete' : ''}${current ? ' is-current' : ''}`}>
											<div className={`aig-feed-item__icon is-${patch.kind}`}>{completed ? patchIcon(patch.kind) : <Clock3 aria-hidden />}</div>
											<div><strong>{patch.title}</strong><span>{patch.detail}</span><small>{patch.object}</small></div>
										</div>
									);
								})}
							</div>
						</div>
					) : (
						<div className="aig-review">
							<div className="aig-review-head"><span>Semantic diff</span><strong>10 changes</strong></div>
							<div className="aig-review-group is-add">
								<div><Plus aria-hidden /><strong>Added</strong><span>6</span></div>
								<button type="button">Claim provenance <small>node</small></button>
								<button type="button">Human review loop <small>node</small></button>
								<button type="button">Evidence relations <small>2 relations</small></button>
								<button type="button">Review-loop relations <small>2 relations</small></button>
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
							<div className="aig-evidence-note"><ShieldCheck aria-hidden /><span><strong>Validation passed</strong>All endpoints resolve · 6 evidence anchors · base head is still v12</span></div>
						</div>
					)}
				</aside>
			</main>

			<footer className="aig-runbar">
				<div className="aig-runbar__state">
					{mode === 'running' && <CirclePlay aria-hidden />}
					{mode === 'paused' && <CirclePause aria-hidden />}
					{mode === 'refining' && <Sparkles aria-hidden />}
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
