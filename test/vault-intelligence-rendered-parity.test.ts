import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VaultIntelligenceWorkspace } from '@/ui/view/vault-intelligence/VaultIntelligenceWorkspace';
import {
	buildVaultIntelligenceGraph,
	createEmptyVaultScanRun,
	type VaultIntelligenceSnapshot,
	type VaultIntelligenceWorkspaceRuntime,
} from '@/ui/view/vault-intelligence/VaultIntelligenceModel';
import { applyVaultIntelligencePresentationFixture } from '@/ui/view/vault-intelligence/VaultIntelligencePresentationFixtures';
import type { VaultDigest } from '@/service/copilot/vault/VaultDigestService';
import type { VaultMaintenanceTask, VaultMaintenanceTaskKind } from '@/core/types/vault-intelligence';

const now = Date.now();
const snapshot: VaultIntelligenceSnapshot = {
	loading: false,
	error: null,
	digest: null,
	fileTypes: [{ extension: 'md', count: 12, share: 1 }],
	availablePaths: [],
	changedPaths: [],
	activityDays: [],
	changedSinceScan: 3,
	changedCursorAt: now - 1_000,
	indexReadiness: {
		discovered: 12,
		searchReady: 12,
		pendingOrExcluded: 0,
		builtAt: now,
		isReady: true,
	},
	objects: [
		{ id: 'files', label: 'Files', count: 12, detail: 'Vault files' },
		{ id: 'chats', label: 'Chats', count: 2, detail: 'Peak chats' },
		{ id: 'projects', label: 'Projects', count: 1, detail: 'Peak projects' },
		{ id: 'composer', label: 'Composer docs', count: 4, detail: 'Composer documents' },
	],
	operationRoutes: {},
	tasks: [],
	run: createEmptyVaultScanRun(),
	lastCompletedRun: null,
	recentActivity: [],
	sourceActivity: [],
	proposals: [],
	mapTextEntries: [],
	activitySessions: [],
	activityThemes: [],
	communityMembers: {},
	events: [],
};

const runtime: VaultIntelligenceWorkspaceRuntime = {
	getSnapshot: () => snapshot,
	subscribe: () => () => undefined,
	refresh: async () => undefined,
	selectOperationRoute: async () => undefined,
	startScan: async () => undefined,
	resumeScan: async () => undefined,
	startNewScan: async () => undefined,
	requestStop: () => undefined,
	requestPause: () => undefined,
	skipOperation: () => undefined,
	choose: async () => undefined,
	refreshTaskSuggestions: async () => undefined,
	applyTask: async () => undefined,
	prepareProposal: async () => undefined,
	applyProposal: async () => undefined,
	rejectProposal: async () => undefined,
	setProposalChangeSelected: async () => undefined,
	verifyTask: async () => undefined,
	saveMapText: async () => undefined,
	publishMapText: async () => undefined,
	keepMapText: async () => undefined,
	analyzeActivityThemes: async () => undefined,
	expandCommunity: async () => undefined,
	openFile: async () => true,
	openOwnerSurface: async () => true,
};

const html = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime }));
const source = readFileSync('src/ui/view/vault-intelligence/VaultIntelligenceWorkspace.tsx', 'utf8');
const runtimeSource = readFileSync('src/app/vault-intelligence/VaultIntelligenceRuntime.ts', 'utf8');
assert.match(
	html,
	/class="[^"]*pk-vi-inventory-item[^"]*"/,
	'production object inventory must render the reference-compatible hover-card structure',
);
assert.equal((html.match(/pk-vi-inventory-item/g) ?? []).length, 4);
assert.match(html, /M4 7\.5 12 3l8 4\.5v9L12 21l-8-4\.5z/, 'Header uses the Mock Vault mark instead of a generic brain icon');
assert.match(html, /M4 5h16v11H8l-4 4z/, 'Chat inventory uses the Mock object icon path');
assert.match(html, /M18\.375 2\.625a1 1 0 0 1 3 3/, 'Composer inventory uses the Mock composer icon path');
assert.doesNotMatch(html, /pk-vi-inventory-item is-projects/, 'Projects must not remain a standalone inventory card');
assert.match(source, /Projects are organized within Chats/, 'Projects must appear as a Chats grouping, not a separate product object');
assert.match(html, /Sessions not implemented/, 'the approved planned Sessions slot must remain explicit instead of being replaced by Projects');
assert.match(html, />Chats</);
assert.match(html, />Projects</);
assert.match(html, /Recorded workspace events/);
assert.match(source, /inventoryTypeGroups/, 'the inventory must derive owner-facing groups from the capability configuration');
assert.match(source, /Other formats/, 'unsupported extensions must be grouped honestly instead of becoming product file types');
assert.match(source, /: 'No'.*current connections/, 'a zero connection count must not render as a misleading signed number');
assert.match(runtimeSource, /activityTextPreview/, 'Activity must receive a readable chat preview instead of a raw conversation identifier');
assert.doesNotMatch(html, /pk-vi-continue-summary/, 'an absent last scan must not invent a Continue work summary');
assert.match(source, /Prepare a safe Vault scan/, 'Scan setup keeps the reference-safe title');
assert.match(source, /Generated knowledge · current document/, 'Build Index must expose the Mock generated-knowledge preview in Production');
assert.match(source, /<span>Summary<\/span><span>AI Tags<\/span>/, 'document inspection must keep Summary and AI Tags as independent status columns');
assert.match(source, /generatedKnowledge\?\.summary/, 'the preview must render provider-produced Summary content instead of placeholder samples');
assert.match(source, /generatedKnowledge\?\.tags/, 'the preview must render provider-produced AI Tags instead of placeholder samples');
assert.match(source, /liveActivity\.length > 0/, 'provider lifecycle activity must appear only when real events exist');
assert.match(source, />Activity</, 'the current document must expose observable provider lifecycle activity without an explanatory panel');
assert.doesNotMatch(source, /<small>Model<\/small>/, 'the generated-knowledge result view must not repeat model routing already shown by Scan setup and lanes');
assert.doesNotMatch(source, /Observable provider lifecycle/, 'the generated-knowledge result view must not expose implementation commentary');
assert.match(source, /Output unavailable/, 'legacy completion receipts without retained output must not render as Ready');
assert.match(html, /pk-vi-overview-activity-body/);
assert.match(html, /pk-vi-index-overview-body/);
assert.doesNotMatch(html, /pk-vi-overview-secondary/);
assert.doesNotMatch(html, /Vault map preview/);
assert.doesNotMatch(html, /pktw-bg-primary/);
assert.match(source, /main\.scrollTop = 0;/, 'route changes must not preserve a stale page scroll anchor');
assert.match(source, /<main ref=\{mainRef\} className="pk-vi-main">/);
assert.match(source, /function MapTextWorkspace/, 'Map text must be a real route, not a dead label');
assert.match(source, /function ProposalReview/, 'source-file changes must be reviewed as a diff before Apply');
assert.match(source, /function ProposalWorkspace/, 'a prepared diff must have its own route instead of being nested in the task dialog');
assert.match(source, /Prepare guarded diff/, 'proposal preparation must remain an explicit owner action');
assert.match(source, /Knowledge Index plan/, 'the setup must disclose configurable Index outputs');
assert.match(source, /pk-vi-index-output-toggle/, 'optional Index outputs must retain the Mock toggle subtree');
assert.match(source, /pk-vi-scan-operation-toggle/, 'AI operation enablement must retain the Mock switch subtree');
assert.match(source, /Configure (an embedding-capable model|a compatible chat model) in Peak Settings/, 'an unavailable route must explain its configuration boundary instead of hiding selection controls');
assert.match(source, /routeOverrides/, 'model selection must remain an operation-local Scan override instead of changing a shared default route');
assert.match(source, /pk-vi-model-picker/, 'each operation must use the compact, searchable Scan model picker');
assert.match(source, /operationEstimateLabel/, 'each operation must disclose an honest estimate or configuration boundary');
assert.match(source, /operation\.id === id \? \{ \.\.\.operation, enabled \}/, 'an operation switch must change only its own operation state');
assert.match(source, /pk-vi-index-core/, 'Index setup must retain the dedicated Core Search configuration rows');
assert.match(source, /pk-vi-index-output-grid/, 'generated Index outputs must retain the unified configuration list');
assert.match(source, /Version history/, 'map text must expose draft and publication history');
assert.match(source, /AI work themes/, 'activity themes must remain an explicit generated layer');
assert.match(source, /Expand members/, 'the graph must expose Community expansion instead of a fixed thumbnail');
assert.match(source, /Add a file or folder/, 'Scan setup must accept file and folder scope selectors beyond an exact file');
assert.match(source, /\['all', 'All'\], \['files', 'Files'\], \['folders', 'Folders'\]/, 'Scope browsing must separate file and folder filters instead of merging them');
assert.match(source, /category: 'folders'/, 'folder candidates must be scoped to the Folders filter');
assert.match(source, /segments\.slice\(0, depth\)\.join\('\/'\)/, 'folder scope candidates must include every path-prefix ancestor, not only direct parent folders');
assert.doesNotMatch(source, /\['communities', 'Communities'\]|\['work', 'Saved work'\]/, 'scan scope must not present Communities or Saved work as selectable scope types');
assert.match(source, /scopeObjectCount \? `\$\{scopeObjectCount\} objects included` : 'No scope selected yet'/, 'an empty custom scope must not claim a successful selection');
assert.match(source, /pk-vi-selected-scope-chip/, 'selected scope chips must expose a stable layout hook for their path, count, and remove action');
assert.doesNotMatch(source, /Period summary/, 'Activity must not retain the old standalone period-summary card');
assert.doesNotMatch(source, /pk-vi-activity-aside/, 'Activity details must live inside the reference explorer workspace');
assert.doesNotMatch(source, /pk-vi-check-group-card/, 'Scan Setup must not expand all detector rows by default');
assert.doesNotMatch(source, /pk-vi-operation-groups/, 'Scan Setup must not expand all AI operation rows by default');
assert.match(source, /Find an analyzed theme/, 'Activity keeps the Reference searchable theme picker');
assert.match(source, /Compared with previous equal period/, 'Activity keeps the selected-period comparison region');
assert.match(source, /pk-vi-activity-event-kinds/, 'Activity work-session evidence keeps the Reference tag grouping');
assert.match(source, /scopeMode === 'selected' \? ' is-custom-scope' : ''/, 'custom scope details must follow the Reference state boundary');
assert.ok(source.indexOf('<strong>Run details</strong>') < source.indexOf('<strong>Completed automatically</strong>'), 'Completed keeps the Mock reading order: detailed run receipt before automatic effects');
assert.match(source, /Actual tokens/, 'Completed Run details keeps the Mock AI receipt metrics');
assert.match(source, /Provider receipts/, 'Completed Run details must distinguish actual provider receipts from planned routes');
assert.match(source, /Machine receipts complete/, 'Completed Run details retains the machine completion slot without claiming an AI call');
assert.match(source, /pk-vi-stage-inspector/, 'Run Progress must keep the compact Mock stage inspector rather than always-visible generic cards');
assert.match(source, /stageMenuOpen/, 'the stage inspector must use an explicit dismissible open state');
assert.match(source, /setStageMenuOpen\(false\)/, 'selecting a stage must dismiss the inspector menu');
assert.match(source, /document\.addEventListener\('pointerdown', closeOutside\)/, 'the inspector must dismiss on outside interaction');
assert.match(source, /role="tablist" aria-label="Scan stages"/, 'Run Progress stages must be a selectable tab set');
assert.match(source, /pk-vi-run-stage-workspace/, 'Run Progress must render exactly one selected-stage workspace');
assert.match(source, /pk-vi-run-events/, 'Run Progress must retain the Reference runtime event stream');
assert.match(source, /inspectedStageId/, 'Run Progress must keep user inspection separate from the live stage');
assert.match(source, /liveStageId/, 'Run Progress must derive and expose the real live stage');
assert.match(source, /Follow live/, 'a user inspecting historical work must be able to return to the live stage');
assert.doesNotMatch(source, /window\.setTimeout\(onCompleted, 450\)/, 'a completed run must not use a fake React timer to transition');
assert.match(source, /View completed work/, 'a completed run exposes an explicit owner transition into Completed');
assert.doesNotMatch(source, /stage\.status === 'running' \? 0\.15/, 'unknown totals must not fabricate fifteen percent progress');
assert.match(source, /runtime\.requestPause\(\)/, 'Run Progress must retain the durable checkpoint pause action');
assert.match(source, /runtime\.requestStop\(\)/, 'Run Progress must keep immediate stop separate from checkpoint pause');
assert.match(source, /Stop scan/, 'Run Progress must expose the Mock stop boundary');
assert.match(source, /Start new scan/, 'an unfinished or failed run must expose a path to discard its checkpoint and prepare a new Scan');
assert.match(source, /runtime\.startNewScan\(\)/, 'the new-Scan action must clear the unfinished runtime checkpoint before returning to setup');
assert.match(source, /pk-vi-run-overview/, 'Run title and progress band must share the reference card container');
assert.match(source, /globalThis\.setInterval\(\(\) => setClockNow\(Date\.now\(\)\), 1_000\)/, 'a live Scan must keep elapsed time moving between durable runtime events');
assert.match(source, /pk-vi-run-liveness/, 'slow local-model startup must expose an explicit live activity row instead of appearing frozen');
assert.match(source, /Waiting for the next response from/, 'the live activity row must explain first-response latency');
assert.match(source, /liveStageIds/, 'parallel Index and AI stages must both remain visibly live');
assert.match(source, /pk-vi-build-parity/, 'Build Index must use the focused Mock three-lane production subtree');
assert.match(source, /onToggle=\{\(event\) => setInspectOpen\(event\.currentTarget\.open\)\}/, 'the all-document table must stay unmounted while collapsed');
assert.match(source, /Not supported/, 'unsupported file types must remain visible without pretending an AI receipt completed');
assert.match(source, /run\.pathEligibility/, 'Build Index presentation must consume the production eligibility contract');
assert.match(source, /pk-vi-discovery-parity/, 'Vault-wide Discovery must use the focused Mock session and findings subtree');
assert.match(source, /pk-vi-review-parity/, 'Prepare review must use the focused Mock work-plan and receipt subtree');
assert.match(source, /refreshTaskSuggestions/, 'Work queue suggestion updates must call the receipt-backed production runtime');
assert.doesNotMatch(source, /Suggestion refresh is unavailable for these/, 'Work queue must not leave the former disabled placeholder in production');
assert.doesNotMatch(source, /Suggestion recalculation is not available in the current runtime/, 'the old fake queue suggestion submission must be removed');
assert.doesNotMatch(source, /<TaskSpecificWorkspace task=\{task\} \/>/, 'a task dialog must not stack a second result summary above the canonical decision workspace');
assert.doesNotMatch(source, /pk-vi-stage-list/, 'Run Progress must not retain the old generic expanded-card subtree');
assert.match(source, /Manage map text/, 'Vault contents keeps the Mock header action instead of inserting an unrelated map-text card');
assert.match(source, /Scan selected type/, 'Vault contents keeps the Reference scan entry action');
assert.match(source, /kind: 'file-type'/, 'Scan selected type carries a typed file-type selector into the production setup adapter');
assert.match(source, /initialSelector: VaultScanScopeSelector \| null/, 'Scan setup preserves that selected-type scope instead of discarding it on navigation');
assert.match(source, /pk-vi-community-summary/, 'Vault contents keeps the Community summary inside the graph workspace');
assert.doesNotMatch(source, /pk-vi-map-text-entry/, 'Vault contents must not retain the old standalone map-text card subtree');
assert.doesNotMatch(source, /pk-vi-content-summary/, 'Vault contents must not repeat index readiness counters above the map');
assert.doesNotMatch(source, /pk-vi-file-type-pie/, 'Vault contents must not restore the removed file-type pie');
assert.doesNotMatch(source, /function FileTypeDistribution/, 'Vault contents must not retain the removed actual-type component subtree');
assert.doesNotMatch(source, /Files by actual type/, 'Vault contents must not restore the removed actual-type section copy');
assert.doesNotMatch(source, /label: 'Data'/, 'file groups must not use an undefined Data bucket');
assert.doesNotMatch(source, /pk-vi-pie-readout/, 'inventory pie cards must not repeat hover or grouping copy below the chart');

const zeroSnapshot = applyVaultIntelligencePresentationFixture('zero-data', snapshot);
const zeroRuntime: VaultIntelligenceWorkspaceRuntime = { ...runtime, getSnapshot: () => zeroSnapshot };
const zeroOverviewHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'overview' }));
assert.equal((zeroOverviewHtml.match(/pk-vi-inventory-item/g) ?? []).length, 4, 'zero data keeps all four object cards');
assert.doesNotMatch(zeroOverviewHtml, /pk-vi-continue-summary/, 'zero data without a last scan hides Continue work completely');
assert.match(zeroOverviewHtml, /pk-vi-overview-activity-body/, 'zero data keeps the activity chart section');
assert.match(zeroOverviewHtml, /pk-vi-index-overview-body/, 'zero data keeps Knowledge Index geometry');

const lastScanSnapshot: VaultIntelligenceSnapshot = {
	...snapshot,
	lastCompletedRun: {
		runId: 'last-scan',
		startedAt: now - 2_000,
		completedAt: now - 1_000,
		scopeMode: 'entire',
		objectCount: 12,
		searchableCount: 12,
		usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
		receipts: [],
		maintenanceTaskIds: [],
		warnings: [],
	},
};
const lastScanHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: { ...runtime, getSnapshot: () => lastScanSnapshot } }));
assert.match(lastScanHtml, /pk-vi-continue-summary/, 'a completed scan keeps the Since last scan summary');
assert.doesNotMatch(lastScanHtml, />Continue work</, 'a completed scan without tasks must not show the Continue work heading');

const fileActivitySnapshot: VaultIntelligenceSnapshot = {
	...snapshot,
	activityDays: [{
		date: new Date(now).toISOString().slice(0, 10),
		count: 1,
		files: [{ path: 'Activity evidence.md', modifiedAt: now }],
	}],
	recentActivity: [],
	sourceActivity: [],
};
const fileActivityHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, {
	runtime: { ...runtime, getSnapshot: () => fileActivitySnapshot },
}));
assert.match(fileActivityHtml, /Vault file modification/, 'file-only activity evidence must render the Lucide File component, not the DOM File constructor');

const zeroActivityHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'activity' }));
assert.match(zeroActivityHtml, /pk-vi-activity-complete-workspace/, 'zero Activity keeps the complete two-pane workspace');
assert.equal((zeroActivityHtml.match(/pk-vi-activity-lane-row/g) ?? []).length, 5, 'zero Activity keeps every recorded source lane');
assert.match(zeroActivityHtml, /pk-vi-activity-period-pane/, 'zero Activity keeps selected-period details');
assert.match(zeroActivityHtml, /pk-vi-activity-range-window/, 'zero Activity keeps the range navigator');
assert.match(zeroActivityHtml, /No work sessions yet/, 'zero Activity uses a stable empty session treatment');

const zeroMapHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'map' }));
assert.doesNotMatch(zeroMapHtml, /pk-vi-file-type-pie/, 'zero Vault contents must not recreate the removed file-type pie');
assert.doesNotMatch(zeroMapHtml, /Files by actual type/, 'zero Vault contents must not recreate the removed actual-type section');
assert.doesNotMatch(zeroMapHtml, /Readable by policy/, 'zero Vault contents must not recreate removed readiness metrics');
assert.match(zeroMapHtml, /pk-vi-community-summary/, 'zero Vault contents keeps the graph-integrated Community region');
assert.match(zeroMapHtml, /No Communities available until the Knowledge Index is built/, 'zero Vault contents uses the reference-compatible Community empty treatment');

const zeroQueueHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'work-queue' }));
assert.match(zeroQueueHtml, /pk-vi-work-surface/, 'zero Work queue retains its toolbar and list tree');
assert.match(zeroQueueHtml, /No unresolved maintenance work/, 'zero Work queue has an explicit stable list empty state');

const zeroRunHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'run-progress' }));
assert.match(zeroRunHtml, /pk-vi-stage-inspector/, 'zero Run Progress keeps all stage controls behind the compact inspector');
assert.match(zeroRunHtml, /pk-vi-run-stage-workspace/, 'zero Run Progress keeps the selected-stage workspace');
assert.match(zeroRunHtml, /No run events recorded yet/, 'zero Run Progress keeps the event-stream geometry');

const resultKinds: VaultMaintenanceTaskKind[] = [
	'file-properties', 'broken-links', 'community-membership', 'knowledge-connections', 'related-notes', 'note-split',
	'community-structure', 'community-hubs', 'content-lifecycle', 'unusual-notes', 'unreadable-files',
];
for (const kind of resultKinds) {
	const task: VaultMaintenanceTask = {
		id: `maintenance:${kind}`, kind, sourceRunId: 'render-run', category: kind === 'unreadable-files' ? 'recovery' : 'decision', state: kind === 'unreadable-files' ? 'recovery' : 'needs-choice',
		title: `Rendered ${kind}`, typeLabel: kind, affectedLabel: '1 item', contextLabel: '1 file', impact: 'medium',
		atomicItems: [{ id: `${kind}:item`, sourceType: kind === 'unreadable-files' ? 'index-error' : 'lint', provenance: ['Notes/source.md'], sourceFindingId: 'finding', signalId: 'signal', filePath: 'Notes/source.md', title: `Evidence for ${kind}`, evidence: 'Cited production evidence.', projectionKey: kind, projectionLabel: 'Primary group', suggestedChoiceId: null, suggestedValue: null, proposalPatch: null, ownerChoice: null }],
		defaultChoice: null, createdAt: now, updatedAt: now,
	};
	const taskSnapshot = { ...snapshot, tasks: [task] };
	const taskHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: { ...runtime, getSnapshot: () => taskSnapshot }, initialTaskId: task.id }));
	assert.match(taskHtml, new RegExp(`pk-vi-task-overlay is-${kind}`), `${kind} must retain its domain-specific modal contract`);
	if (kind === 'file-properties') assert.match(taskHtml, /pk-vi-property-review/, 'property findings use the Mock batch and per-file accept/reject workspace');
	else if (kind === 'note-split') assert.match(taskHtml, /pk-vi-note-split-collection/, 'note splits use the Mock source-proposal collection workspace');
	else assert.match(taskHtml, new RegExp(`pk-vi-review-table is-${kind}`), `${kind} must retain its domain-specific canonical decision workspace`);
	assert.doesNotMatch(taskHtml, /pk-vi-result-workspace/, `${kind} must not duplicate the canonical decision workspace with a second summary subtree`);
}
assert.doesNotMatch(source, /function TaskWorkspaceCallout/, 'the eleven Result Items must not collapse back into one generic callout component');

const normalDigest: VaultDigest = {
	fingerprint: { fingerprint: 'rendered-parity-normal-fixture', fileCount: 12, totalWordCount: 2_400, lastMaxMtime: now, computedAt: now },
	counts: { notes: 12, words: 2_400, clusters: 2, hubs: 2, orphans: 0, danglingRefs: 0 },
	health: null,
	clusters: [
		{ id: 'research', label: 'Research', memberCount: 7, internalDensity: 0.6, dominantTopics: ['evidence'], topNodes: [{ path: 'Research/evidence.md', label: 'Evidence' }] },
		{ id: 'projects', label: 'Projects', memberCount: 5, internalDensity: 0.5, dominantTopics: ['planning'], topNodes: [{ path: 'Projects/roadmap.md', label: 'Roadmap' }] },
	],
	communityLinks: [{ communityAId: 'research', communityBId: 'projects', referenceCount: 3 }],
	structuralHoles: [],
	hubs: [],
	staleHubs: [],
	orphans: [],
	dangling: [],
	recentActivity: { createdLast30d: 2, modifiedLast30d: 4, dormantClusters: [] },
	tags: [],
	computedAt: now,
};
const normalDataSnapshot: VaultIntelligenceSnapshot = {
	...snapshot,
	digest: normalDigest,
	sourceActivity: [{ id: 'normal-file-edit', timestamp: now - 86_400_000, kind: 'file-change', label: 'Edited Research/evidence.md', objectPath: 'Research/evidence.md', runId: null }],
	activitySessions: [{ id: 'normal-session', startedAt: now - 2 * 86_400_000, endedAt: now - 86_400_000, recordIds: ['normal-file-edit'], objectPaths: ['Research/evidence.md'], reason: 'single-record', label: 'Research evidence session' }],
	activityThemes: [{ id: 'normal-theme', label: 'Research synthesis', recordIds: ['normal-file-edit'], sessionIds: ['normal-session'], confidence: 0.9, citations: [{ recordId: 'normal-file-edit', objectPath: 'Research/evidence.md' }], generatedAt: now, sourceRevision: normalDigest.fingerprint.fingerprint }],
	communityMembers: { research: [{ path: 'Research/evidence.md', label: 'Evidence', score: 0.8 }], projects: [{ path: 'Projects/roadmap.md', label: 'Roadmap', score: 0.7 }] },
};
const normalGraph = buildVaultIntelligenceGraph(normalDataSnapshot.digest, { communityMembers: normalDataSnapshot.communityMembers });
assert.ok(normalGraph && normalGraph.nodes.length >= 4 && normalGraph.edges.length >= 3, 'normal data must exercise the evidence-backed Map rather than only its empty state');
const normalActivityHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: { ...runtime, getSnapshot: () => normalDataSnapshot }, initialRoute: 'activity' }));
assert.match(normalActivityHtml, /Research evidence session/, 'normal Activity keeps real session evidence in the selected-period pane');

const normalSetupHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime, initialRoute: 'scan-setup' }));
const zeroSetupHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'scan-setup' }));
for (const setupHtml of [normalSetupHtml, zeroSetupHtml]) {
	assert.equal((setupHtml.match(/pk-vi-scan-check-grid/g) ?? []).length, 1, 'Setup keeps one compact category summary grid');
	assert.equal((setupHtml.match(/pk-vi-scan-ai-group-row/g) ?? []).length, 5, 'Setup keeps all five Mock AI groups, including the once-per-Scan planning call');
	assert.match(setupHtml, /Plan this scan/, 'AI Scan planning must expose its configured model route instead of masquerading as a local preflight');
	assert.match(setupHtml, /pk-vi-scan-operation-disclosure" aria-hidden="true"/, 'AI operation details stay collapsed by default while retaining the accordion animation subtree');
	assert.match(setupHtml, /pk-vi-scan-estimate-block/, 'Setup keeps the estimate block');
	assert.match(setupHtml, /Estimate updated|No AI work selected/, 'Setup calculates an estimate without a manual preparation action');
	assert.doesNotMatch(setupHtml, /Preflight required/, 'Setup must not expose a separate preflight requirement to the owner');
	assert.match(setupHtml, /pk-vi-scan-setup-footer/, 'Setup keeps the boundary and primary action footer');
}
assert.match(source, /scopeMode !== 'entire' && <div className="pk-vi-scope-selected-row">/, 'Entire Vault must not render a redundant custom-scope summary');
assert.match(normalSetupHtml, /pk-vi-scope-selected-row/, 'A changed-since-last-scan setup keeps its included-scope summary');
assert.doesNotMatch(zeroSetupHtml, /pk-vi-scope-selected-row/, 'Entire Vault must not render a redundant custom-scope summary');
assert.match(zeroSetupHtml, /Not indexed yet/, 'zero Setup preserves scope cards with an explicit empty baseline');
assert.match(source, /const estimatedTokens = selectedOps\.reduce/, 'The scan estimate must derive tokens from enabled operations and the selected scope');
assert.match(source, /estimateVaultScanText/, 'The scan estimate must use directly readable source text rather than whole-Vault fixed allowances');
assert.match(source, /scanEstimateBytesPerToken/, 'The generic provider-neutral token conversion must remain configurable');
assert.match(source, /Updates automatically when the scope, enabled operations, or model routes change/, 'The UI must explain that scan estimates update automatically');

const zeroMapTextHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'map-text' }));
assert.match(zeroMapTextHtml, /pk-vi-map-copy-summary/, 'zero Map text keeps the Mock four-stat summary');
assert.equal((zeroMapTextHtml.match(/pk-vi-map-copy-group/g) ?? []).length, 3, 'zero Map text keeps the three Reference content groups');
assert.match(zeroMapTextHtml, /No Community descriptions yet/, 'zero Map text retains the Community-description geometry');
assert.match(zeroMapTextHtml, /No Topic labels yet/, 'zero Map text retains the Topic-label geometry');
assert.match(zeroMapTextHtml, /No Hub descriptions yet/, 'zero Map text retains the Hub-description geometry');

const overflowSnapshot: VaultIntelligenceSnapshot = {
	...snapshot,
	fileTypes: Array.from({ length: 49 }, (_, index) => ({
		extension: `type-${index + 1}`,
		count: 49 - index,
		share: (49 - index) / 1_225,
	})),
	objects: snapshot.objects.map((object) => object.id === 'files' ? { ...object, count: 1_225 } : object),
	indexReadiness: { ...snapshot.indexReadiness, discovered: 100, searchReady: 528 },
};
const overflowRuntime: VaultIntelligenceWorkspaceRuntime = {
	...runtime,
	getSnapshot: () => overflowSnapshot,
};
const overflowHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: overflowRuntime }));
assert.equal((overflowHtml.match(/pk-vi-pie-segment/g) ?? []).length, 4, 'unsupported extensions must collapse into one Other formats bucket while the three real object totals stay visible');
assert.doesNotMatch(overflowHtml, /49 detected extensions|49 groups/, 'pie cards must not repeat extension-count copy below the chart');
assert.match(overflowHtml, /Other formats/);
assert.match(overflowHtml, />100%<\/span>/, 'readiness visuals must cap inconsistent projection counts at 100%');
assert.match(overflowHtml, /528 search records exceed 100 discovered objects/);

const css = readFileSync('src/styles/peak-components.css', 'utf8');
const inventoryConfig = readFileSync('templates/config/vault-intelligence.json', 'utf8');
assert.match(inventoryConfig, /"html"/, 'the inventory capability list must include the audit-confirmed HTML format');
assert.match(inventoryConfig, /"htm"/, 'the inventory capability list must include the audit-confirmed HTM variant');
assert.match(inventoryConfig, /"label": "Images"/, 'image extensions must be presented as one owner-facing Images group');
const baseIndex = css.indexOf('Vault Intelligence\n   Standalone, evidence-first maintenance workspace');
const legacyIndex = css.indexOf('Vault Intelligence production parity defense');
const correctionIndex = css.indexOf('Vault Intelligence visual parity correction');
assert.ok(baseIndex >= 0 && legacyIndex >= 0 && correctionIndex >= 0);
assert.ok(correctionIndex > baseIndex, 'the final correction must follow the original workspace rules');
assert.ok(correctionIndex > legacyIndex, 'the final correction must follow the obsolete parity defense');

const correction = css.slice(correctionIndex);
assert.match(css, /\.pk-vi-selected-scope-chip\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content 18px;/, 'scope chips must reserve independent path, count, and removal lanes');
assert.match(css, /\.pk-vi-selected-scope-chip\s*\{[\s\S]*?height:\s*32px;[\s\S]*?min-height:\s*32px;[\s\S]*?max-height:\s*32px;/, 'scope chips must use a fixed vertical centreline instead of content-driven padding');
assert.match(css, /\.pk-vi-selected-paths > span:not\(\.pk-vi-selected-scope-chip\)/, 'legacy scope-token positioning must not override selected scope chips');
assert.match(correction, /\.pk-vi-object-card\.pk-btn\s*\{[\s\S]*?display:\s*grid !important;[\s\S]*?height:\s*78px !important;[\s\S]*?min-height:\s*78px !important;[\s\S]*?max-height:\s*78px !important;/);
assert.match(correction, /\.pk-vi-work-row\.pk-btn\s*\{[\s\S]*?display:\s*grid !important;[\s\S]*?height:\s*66px !important;[\s\S]*?min-height:\s*66px !important;[\s\S]*?max-height:\s*66px !important;/);
assert.match(correction, /\.pk-vi-task-overlay\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?place-items:\s*center;/);
assert.match(css, /\.pk-vi-activity-complete-workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 355px;/);
assert.match(css, /\.pk-vi-scan-check-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
assert.match(css, /\.pk-vi-scan-check-grid > \.pk-btn\.is-active \.pk-vi-check-mark\s*\{[\s\S]*?background:\s*var\(--pk-vi-accent\);/);
assert.match(css, /\.pk-vi-index-output-toggle\s*\{[\s\S]*?width:\s*30px;[\s\S]*?height:\s*18px;/, 'optional output toggles preserve the Mock 30 × 18 geometry');
assert.match(css, /\.pk-vi-scan-operation-toggle\.pk-btn\s*\{[\s\S]*?width:\s*30px !important;[\s\S]*?height:\s*18px !important;/, 'AI operation switches defend their fixed Mock geometry from host button resets');
assert.match(css, /\.pk-vi-index-output-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/, 'generated Index output groups keep the Mock four-column geometry');
assert.match(css, /\.pk-vi-index-core\s*\{[\s\S]*?grid-template-columns:\s*1fr 1fr;/, 'Core Search keeps its own two-column geometry');
assert.match(css, /\.pk-vi-index-core-row input\s*\{[\s\S]*?position:\s*absolute;/, 'Core Search native inputs cannot participate in the reference grid');
assert.match(css, /\.pk-vi-scan-operation-list > div\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 255px 104px 34px;/, 'AI operation rows keep the Mock label/model/estimate/switch columns');
const exactPort = css.slice(css.indexOf('Vault Intelligence V2 exact reference port'));
assert.match(exactPort, /\.pk-vi-inventory-strip\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
assert.match(exactPort, /\.pk-vi-inventory-item\s*\{[\s\S]*?min-height:\s*76px;[\s\S]*?border-radius:\s*10px;/);
assert.match(exactPort, /\.pk-vi-inventory-legend\s*\{[\s\S]*?display:\s*block;/, 'object legends retain the Mock single-column subtree');
assert.match(exactPort, /\.pk-vi-inventory-distribution\.is-large \.pk-vi-inventory-legend\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/, 'only the file distribution uses two legend columns');
assert.match(exactPort, /\.pk-vi-inventory-distribution\.is-unavailable \.pk-vi-inventory-legend\s*\{[\s\S]*?min-height:\s*130px;/, 'unavailable distribution data must not collapse hover geometry');
assert.match(exactPort, /\.pk-vi-overview-grid > \.pk-btn\s*\{[\s\S]*?width:\s*17px !important;[\s\S]*?height:\s*17px !important;/);
assert.match(exactPort, /\.pk-vi-overview-range-popover\s*\{[\s\S]*?right:\s*0;[\s\S]*?left:\s*auto;[\s\S]*?transform:\s*none;/, 'the date menu must stay aligned to the left edge of its option content, without a centered popover offset');
assert.match(exactPort, /\.pk-vi-overview-range-popover > \.pk-btn\s*\{[\s\S]*?justify-content:\s*space-between !important;[\s\S]*?text-align:\s*left;/, 'range options must keep their labels left aligned');
assert.match(exactPort, /\.pk-vi-overview-activity-title\s*\{[\s\S]*?flex-direction:\s*row;[\s\S]*?align-items:\s*center;/, 'the activity total must sit horizontally beside and vertically centered with the title');
assert.match(exactPort, /\.pk-vi-overview-evidence > div > article:last-of-type\s*\{[\s\S]*?border-bottom:\s*0 !important;/, 'the final activity row must not duplicate the card border');
assert.match(exactPort, /\.pk-vi-overview-heatmap-footer\s*\{[\s\S]*?border-top:\s*0;/, 'the activity legend must not create a redundant bottom divider after the final record');
assert.match(exactPort, /\.pk-vi-nav > \.pk-btn\.is-active\s*\{[\s\S]*?background:\s*#f0edff !important;/, 'the selected production navigation item keeps its visible pill fill after the final host reset');
assert.match(source, /function DescriptionTooltip\(/, 'inventory and index descriptions must be available through a compact tooltip trigger');
assert.doesNotMatch(html, /pk-vi-card-caption[^>]*>Search and machine knowledge maintained by Vault scans/, 'the Knowledge Index explanation must not consume header space');
assert.match(html, /pk-vi-description-tooltip/, 'the Knowledge Index explanation must remain available via its tooltip trigger');
assert.match(exactPort, /\.pk-vi-description-tooltip\s*\{[\s\S]*?cursor:\s*help;/, 'description tooltip triggers need a visible affordance');
assert.match(css, /\.pk-vi-overview-evidence\s*\{[\s\S]*?min-height:\s*160px;/, 'activity evidence preserves the Mock empty/short-data geometry');
assert.match(exactPort, /\.pk-vi-index-overview-body\s*\{[\s\S]*?grid-template-columns:\s*154px minmax\(0, 1fr\) 300px;/);
assert.match(exactPort, /\.pk-vi-continue-summary\s*\{[\s\S]*?grid-template-columns:\s*136px repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?min-height:\s*41px;/);
assert.match(exactPort, /\.pk-vi-readiness-ring\s*\{[\s\S]*?width:\s*92px;[\s\S]*?height:\s*92px;/);

console.log('vault-intelligence-rendered-parity: passed');
