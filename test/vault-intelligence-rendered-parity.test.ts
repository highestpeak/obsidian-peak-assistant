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
	/class="[^"]*pk-btn[^"]*pk-vi-object-card[^"]*"/,
	'production object cards must render the class that owns their fixed geometry',
);
assert.equal((html.match(/pk-vi-object-card/g) ?? []).length, 4);
assert.doesNotMatch(html, /pk-vi-continue-summary/, 'first setup must not manufacture a since-last-scan delta');
assert.match(html, /Set up Vault/);
assert.match(html, /pk-vi-overview-secondary/);
assert.doesNotMatch(html, /pktw-bg-primary/);
assert.match(source, /main\.scrollTop = 0;/, 'route changes must not preserve a stale page scroll anchor');
assert.match(source, /<main ref=\{mainRef\} className="pk-vi-main">/);
assert.match(source, /function MapTextWorkspace/, 'Map text must be a real route, not a dead label');
assert.match(source, /function ProposalReview/, 'source-file changes must be reviewed as a diff before Apply');
assert.match(source, /Prepare guarded diff/, 'proposal preparation must remain an explicit owner action');
assert.match(source, /Knowledge Index plan/, 'the setup must disclose configurable Index outputs');
assert.match(source, /Version history/, 'map text must expose draft and publication history');
assert.match(source, /Evidence themes/, 'activity themes must state their evidence boundary');
assert.match(source, /Expand members/, 'the graph must expose Community expansion instead of a fixed thumbnail');
assert.match(source, /Add a saved scope/, 'Scan setup must accept selector-backed scopes beyond an exact file');

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
assert.match(correction, /\.pk-vi-activity-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.55fr\) minmax\(280px, 0\.58fr\);/);
assert.match(correction, /\.pk-vi-check-group-card\.is-active \.pk-vi-check-mark\s*\{[\s\S]*?background:\s*var\(--pk-vi-accent\);/);

console.log('vault-intelligence-rendered-parity: passed');
