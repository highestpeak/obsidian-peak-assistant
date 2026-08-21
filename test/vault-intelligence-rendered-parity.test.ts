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

const now = Date.now();
const snapshot: VaultIntelligenceSnapshot = {
	loading: false,
	error: null,
	digest: null,
	fileTypes: [{ extension: 'md', count: 12, share: 1 }],
	availablePaths: [],
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
	requestStop: () => undefined,
	skipOperation: () => undefined,
	choose: async () => undefined,
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
assert.match(html, /M22 13a18\.15 18\.15 0 0 1-20 0/, 'Project inventory uses the Mock briefcase icon path');
assert.match(html, /M18\.375 2\.625a1 1 0 0 1 3 3/, 'Composer inventory uses the Mock composer icon path');
assert.equal((html.match(/pk-vi-inventory-unavailable/g) ?? []).length, 0, 'a published object total must render as actual data, not an unavailable placeholder');
assert.match(html, /Recorded conversations/);
assert.match(html, /Current projects/);
assert.match(html, /Recorded workspace events/);
assert.match(source, /supportedInventoryTypes/, 'only explicitly supported file formats can retain individual inventory rows');
assert.match(source, /Other formats/, 'unsupported extensions must be grouped honestly instead of becoming product file types');
assert.match(source, /: 'No'.*current connections/, 'a zero connection count must not render as a misleading signed number');
assert.match(runtimeSource, /activityTextPreview/, 'Activity must receive a readable chat preview instead of a raw conversation identifier');
assert.match(html, /pk-vi-continue-summary/, 'zero history must retain the reference summary geometry');
assert.match(html, /Not indexed yet/, 'zero history must explain the empty scan baseline');
assert.match(html, /Prepare Vault/);
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
assert.match(source, /Configure a model in Peak settings/, 'an unavailable route must explain its configuration boundary instead of hiding selection controls');
assert.match(source, /onSelectOperationRoute/, 'model selection must dispatch through the production runtime adapter');
assert.match(source, /pk-vi-index-core/, 'Index setup must retain the dedicated two-column Core Search subtree');
assert.match(source, /pk-vi-index-output-grid/, 'generated Index outputs must retain the reference four-card grid');
assert.match(source, /Version history/, 'map text must expose draft and publication history');
assert.match(source, /AI work themes/, 'activity themes must remain an explicit generated layer');
assert.match(source, /Expand members/, 'the graph must expose Community expansion instead of a fixed thumbnail');
assert.match(source, /Add a saved scope/, 'Scan setup must accept selector-backed scopes beyond an exact file');
assert.doesNotMatch(source, /Period summary/, 'Activity must not retain the old standalone period-summary card');
assert.doesNotMatch(source, /pk-vi-activity-aside/, 'Activity details must live inside the reference explorer workspace');
assert.doesNotMatch(source, /pk-vi-check-group-card/, 'Scan Setup must not expand all detector rows by default');
assert.doesNotMatch(source, /pk-vi-operation-groups/, 'Scan Setup must not expand all AI operation rows by default');
assert.match(source, /Find an analyzed theme/, 'Activity keeps the Reference searchable theme picker');
assert.match(source, /Compared with previous equal period/, 'Activity keeps the selected-period comparison region');
assert.match(source, /pk-vi-activity-event-kinds/, 'Activity work-session evidence keeps the Reference tag grouping');
assert.match(source, /scopeMode === 'selected' \? ' is-custom-scope' : ''/, 'custom scope details must follow the Reference state boundary');
assert.ok(source.indexOf('<strong>Run details</strong>') < source.indexOf('<strong>Completed automatically</strong>'), 'Completed keeps the Mock disclosure order: run receipt before automatic effects');
assert.match(source, /Actual tokens/, 'Completed Run details keeps the Mock AI receipt metrics');
assert.match(source, /Models used/, 'Completed Run details retains the model-count slot when runtime receipts lack model metadata');
assert.match(source, /AI operations completed/, 'Completed Run details retains the operation completion slot');
assert.match(source, /pk-vi-run-stage-tabs/, 'Run Progress must keep the Mock stage-tab subtree rather than generic independent cards');
assert.match(source, /role="tablist" aria-label="Scan stages"/, 'Run Progress stages must be a selectable tab set');
assert.match(source, /pk-vi-run-stage-workspace/, 'Run Progress must render exactly one selected-stage workspace');
assert.match(source, /pk-vi-run-events/, 'Run Progress must retain the Reference runtime event stream');
assert.doesNotMatch(source, /pk-vi-stage-list/, 'Run Progress must not retain the old generic expanded-card subtree');
assert.match(source, /Manage map text/, 'Vault contents keeps the Mock header action instead of inserting an unrelated map-text card');
assert.match(source, /Scan selected type/, 'Vault contents keeps the Reference scan entry action');
assert.match(source, /kind: 'file-type'/, 'Scan selected type carries a typed file-type selector into the production setup adapter');
assert.match(source, /initialSelector: VaultScanScopeSelector \| null/, 'Scan setup preserves that selected-type scope instead of discarding it on navigation');
assert.match(source, /pk-vi-community-summary/, 'Vault contents keeps the Community summary inside the graph workspace');
assert.doesNotMatch(source, /pk-vi-map-text-entry/, 'Vault contents must not retain the old standalone map-text card subtree');

const zeroSnapshot = applyVaultIntelligencePresentationFixture('zero-data', snapshot);
const zeroRuntime: VaultIntelligenceWorkspaceRuntime = { ...runtime, getSnapshot: () => zeroSnapshot };
const zeroOverviewHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'overview' }));
assert.equal((zeroOverviewHtml.match(/pk-vi-inventory-item/g) ?? []).length, 4, 'zero data keeps all four object cards');
assert.match(zeroOverviewHtml, /pk-vi-continue-summary/, 'zero data keeps Continue work summary geometry');
assert.match(zeroOverviewHtml, /pk-vi-overview-activity-body/, 'zero data keeps the activity chart section');
assert.match(zeroOverviewHtml, /pk-vi-index-overview-body/, 'zero data keeps Knowledge Index geometry');
assert.match(zeroOverviewHtml, /No unresolved maintenance work/, 'zero data uses an explicit empty treatment');

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
assert.match(zeroMapHtml, /pk-vi-content-summary/, 'zero Vault contents keeps the five-stat summary');
assert.match(zeroMapHtml, /pk-vi-file-types/, 'zero Vault contents keeps the file-distribution workspace');
assert.match(zeroMapHtml, /pk-vi-community-summary/, 'zero Vault contents keeps the graph-integrated Community region');
assert.match(zeroMapHtml, /No Communities available until the Knowledge Index is built/, 'zero Vault contents uses the reference-compatible Community empty treatment');

const zeroQueueHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'work-queue' }));
assert.match(zeroQueueHtml, /pk-vi-work-surface/, 'zero Work queue retains its toolbar and list tree');
assert.match(zeroQueueHtml, /No unresolved maintenance work/, 'zero Work queue has an explicit stable list empty state');

const zeroRunHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'run-progress' }));
assert.match(zeroRunHtml, /pk-vi-run-stage-tabs/, 'zero Run Progress keeps all stage controls');
assert.match(zeroRunHtml, /pk-vi-run-stage-workspace/, 'zero Run Progress keeps the selected-stage workspace');
assert.match(zeroRunHtml, /No run events recorded yet/, 'zero Run Progress keeps the event-stream geometry');

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
	assert.equal((setupHtml.match(/pk-vi-scan-ai-group-row/g) ?? []).length, 5, 'Setup keeps five collapsed AI group rows');
	assert.doesNotMatch(setupHtml, /pk-vi-scan-operation-list/, 'AI operation details stay collapsed by default');
	assert.match(setupHtml, /pk-vi-scan-estimate-block/, 'Setup keeps the estimate block');
	assert.match(setupHtml, /pk-vi-scan-setup-footer/, 'Setup keeps the boundary and primary action footer');
	assert.match(setupHtml, /pk-vi-scope-selected-row/, 'Setup keeps custom-scope geometry mounted for the selected state');
}
assert.match(zeroSetupHtml, /Not indexed yet/, 'zero Setup preserves scope cards with an explicit empty baseline');

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
assert.match(overflowHtml, /49 actual file types/);
assert.match(overflowHtml, /Other formats/);
assert.match(overflowHtml, />100%<\/span>/, 'readiness visuals must cap inconsistent projection counts at 100%');
assert.match(overflowHtml, /528 search records exceed 100 discovered objects/);

const css = readFileSync('src/styles/peak-components.css', 'utf8');
const inventoryConfig = readFileSync('templates/config/vault-intelligence.json', 'utf8');
assert.match(inventoryConfig, /"html"/, 'the inventory capability list must include the audit-confirmed HTML format');
assert.match(inventoryConfig, /"htm"/, 'the inventory capability list must include the audit-confirmed HTM variant');
const baseIndex = css.indexOf('Vault Intelligence\n   Standalone, evidence-first maintenance workspace');
const legacyIndex = css.indexOf('Vault Intelligence production parity defense');
const correctionIndex = css.indexOf('Vault Intelligence visual parity correction');
assert.ok(baseIndex >= 0 && legacyIndex >= 0 && correctionIndex >= 0);
assert.ok(correctionIndex > baseIndex, 'the final correction must follow the original workspace rules');
assert.ok(correctionIndex > legacyIndex, 'the final correction must follow the obsolete parity defense');

const correction = css.slice(correctionIndex);
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
assert.match(exactPort, /\.pk-vi-overview-range-popover\s*\{[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translateX\(-50%\);/, 'the date menu must be centered under its trigger rather than right-aligned');
assert.match(css, /\.pk-vi-overview-evidence\s*\{[\s\S]*?min-height:\s*160px;/, 'activity evidence preserves the Mock empty/short-data geometry');
assert.match(exactPort, /\.pk-vi-index-overview-body\s*\{[\s\S]*?grid-template-columns:\s*154px minmax\(0, 1fr\) 300px;/);
assert.match(exactPort, /\.pk-vi-continue-summary\s*\{[\s\S]*?grid-template-columns:\s*136px repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?min-height:\s*41px;/);
assert.match(exactPort, /\.pk-vi-readiness-ring\s*\{[\s\S]*?width:\s*92px;[\s\S]*?height:\s*92px;/);

console.log('vault-intelligence-rendered-parity: passed');
