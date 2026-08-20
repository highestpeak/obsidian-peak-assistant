import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VaultIntelligenceWorkspace } from '@/ui/view/vault-intelligence/VaultIntelligenceWorkspace';
import {
	createEmptyVaultScanRun,
	type VaultIntelligenceSnapshot,
	type VaultIntelligenceWorkspaceRuntime,
} from '@/ui/view/vault-intelligence/VaultIntelligenceModel';
import { applyVaultIntelligencePresentationFixture } from '@/ui/view/vault-intelligence/VaultIntelligencePresentationFixtures';

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
assert.match(
	html,
	/class="[^"]*pk-vi-inventory-item[^"]*"/,
	'production object inventory must render the reference-compatible hover-card structure',
);
assert.equal((html.match(/pk-vi-inventory-item/g) ?? []).length, 4);
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

const zeroSnapshot = applyVaultIntelligencePresentationFixture('zero-data', snapshot);
const zeroRuntime: VaultIntelligenceWorkspaceRuntime = { ...runtime, getSnapshot: () => zeroSnapshot };
const zeroOverviewHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'overview' }));
assert.equal((zeroOverviewHtml.match(/pk-vi-inventory-item/g) ?? []).length, 4, 'zero data keeps all four object cards');
assert.match(zeroOverviewHtml, /pk-vi-continue-summary/, 'zero data keeps Continue work summary geometry');
assert.match(zeroOverviewHtml, /pk-vi-overview-activity-body/, 'zero data keeps the activity chart section');
assert.match(zeroOverviewHtml, /pk-vi-index-overview-body/, 'zero data keeps Knowledge Index geometry');
assert.match(zeroOverviewHtml, /No unresolved maintenance work/, 'zero data uses an explicit empty treatment');

const zeroActivityHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'activity' }));
assert.match(zeroActivityHtml, /pk-vi-activity-complete-workspace/, 'zero Activity keeps the complete two-pane workspace');
assert.equal((zeroActivityHtml.match(/pk-vi-activity-lane-row/g) ?? []).length, 5, 'zero Activity keeps every recorded source lane');
assert.match(zeroActivityHtml, /pk-vi-activity-period-pane/, 'zero Activity keeps selected-period details');
assert.match(zeroActivityHtml, /pk-vi-activity-range-window/, 'zero Activity keeps the range navigator');
assert.match(zeroActivityHtml, /No work sessions yet/, 'zero Activity uses a stable empty session treatment');

const normalSetupHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime, initialRoute: 'scan-setup' }));
const zeroSetupHtml = renderToStaticMarkup(React.createElement(VaultIntelligenceWorkspace, { runtime: zeroRuntime, initialRoute: 'scan-setup' }));
for (const setupHtml of [normalSetupHtml, zeroSetupHtml]) {
	assert.equal((setupHtml.match(/pk-vi-scan-check-grid/g) ?? []).length, 1, 'Setup keeps one compact category summary grid');
	assert.equal((setupHtml.match(/pk-vi-scan-ai-group-row/g) ?? []).length, 5, 'Setup keeps five collapsed AI group rows');
	assert.doesNotMatch(setupHtml, /pk-vi-scan-operation-list/, 'AI operation details stay collapsed by default');
	assert.match(setupHtml, /pk-vi-scan-estimate-block/, 'Setup keeps the estimate block');
	assert.match(setupHtml, /pk-vi-scan-setup-footer/, 'Setup keeps the boundary and primary action footer');
}
assert.match(zeroSetupHtml, /Not indexed yet/, 'zero Setup preserves scope cards with an explicit empty baseline');

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
assert.equal((overflowHtml.match(/pk-vi-pie-segment/g) ?? []).length, 16, 'the hover preview must retain the Mock sixteen-row geometry');
assert.match(overflowHtml, /49 actual file types/);
assert.match(overflowHtml, /Other formats/);
assert.match(overflowHtml, />100%<\/span>/, 'readiness visuals must cap inconsistent projection counts at 100%');
assert.match(overflowHtml, /528 search records exceed 100 discovered objects/);

const css = readFileSync('src/styles/peak-components.css', 'utf8');
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
const exactPort = css.slice(css.indexOf('Vault Intelligence V2 exact reference port'));
assert.match(exactPort, /\.pk-vi-inventory-strip\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
assert.match(exactPort, /\.pk-vi-inventory-item\s*\{[\s\S]*?min-height:\s*76px;[\s\S]*?border-radius:\s*10px;/);
assert.match(exactPort, /\.pk-vi-overview-grid > \.pk-btn\s*\{[\s\S]*?width:\s*17px !important;[\s\S]*?height:\s*17px !important;/);
assert.match(exactPort, /\.pk-vi-index-overview-body\s*\{[\s\S]*?grid-template-columns:\s*154px minmax\(0, 1fr\) 300px;/);
assert.match(exactPort, /\.pk-vi-continue-summary\s*\{[\s\S]*?grid-template-columns:\s*136px repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?min-height:\s*41px;/);
assert.match(exactPort, /\.pk-vi-readiness-ring\s*\{[\s\S]*?width:\s*92px;[\s\S]*?height:\s*92px;/);

console.log('vault-intelligence-rendered-parity: passed');
