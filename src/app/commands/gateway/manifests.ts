// B1 Command Gateway wire-in — CapabilityManifest fixtures for the
// palette commands exposed through Obsidian's Cmd+P.
//
// These are `surface-open` capabilities: user picks the command, the
// runtime opens a UI leaf/modal. They do not stream tokens or produce
// long-lived artifacts, but going through CommandGateway gives us
// uniform observability (RunSession start/finish, invocation trace) and
// a single point to enforce future permission / budget checks.
//
// Every manifest lists `provider-direct` as its preferred backend with
// `hermes-harness` as its fallback. In practice these
// commands dispatch to an echo strategy at wire-in time (see
// `composeCommandGatewayBindings`); once B3 lands and the registry has
// live backend strategies, palette commands still resolve first to the
// registered provider — no manifest churn.

import type { CapabilityManifest } from '@/core/types/capability';

const SURFACE_OPEN_INPUT: CapabilityManifest['inputContract'] = {
	kind: 'object',
	description: 'No structured input; palette commands are user-triggered surface opens.',
};

const SURFACE_OPEN_OUTPUT: CapabilityManifest['outputContract'] = {
	kind: 'object',
	description: 'Void — invocation is observed via RunSession start/finish events.',
};

const DEFAULT_BACKEND: CapabilityManifest['backendPolicy'] = {
	preferred: 'provider-direct',
	fallback: ['hermes-harness'],
};

export const SETTINGS_MODAL_MANIFEST: CapabilityManifest = {
	id: 'ui.open.settings',
	title: 'Open Settings',
	description: 'Open the Peak settings modal.',
	inputContract: SURFACE_OPEN_INPUT,
	outputContract: SURFACE_OPEN_OUTPUT,
	permissionKind: 'read',
	costTier: 'fast',
	backendPolicy: DEFAULT_BACKEND,
	skillRef: 'ui.surface-open.v1',
	surfaceBinding: ['chat'],
};

export const HARNESS_WIZARD_MANIFEST: CapabilityManifest = {
	id: 'ui.open.harness-setup-wizard',
	title: 'Open Setup Wizard',
	description: 'Launch the 9-step Curator onboarding wizard.',
	inputContract: SURFACE_OPEN_INPUT,
	outputContract: SURFACE_OPEN_OUTPUT,
	permissionKind: 'read',
	costTier: 'fast',
	backendPolicy: DEFAULT_BACKEND,
	skillRef: 'ui.surface-open.v1',
	surfaceBinding: ['chat'],
};

export const QUICK_SEARCH_MANIFEST: CapabilityManifest = {
	id: 'ui.open.quick-search',
	title: 'Open Quick Search',
	description: 'Focus the Quick Search side panel so the user can search vault / chat context.',
	inputContract: SURFACE_OPEN_INPUT,
	outputContract: SURFACE_OPEN_OUTPUT,
	permissionKind: 'read',
	costTier: 'fast',
	backendPolicy: DEFAULT_BACKEND,
	skillRef: 'ui.surface-open.v1',
	surfaceBinding: ['vault-search'],
};

export const FILE_ATLAS_MANIFEST: CapabilityManifest = {
	id: 'ui.open.file-atlas',
	title: 'Open File Atlas',
	description: 'Open the block-level Tree / Graph map for the active document.',
	inputContract: SURFACE_OPEN_INPUT,
	outputContract: SURFACE_OPEN_OUTPUT,
	permissionKind: 'read',
	costTier: 'fast',
	backendPolicy: DEFAULT_BACKEND,
	skillRef: 'ui.surface-open.v1',
	surfaceBinding: ['copilot'],
};

export const USAGE_DASHBOARD_MANIFEST: CapabilityManifest = {
	id: 'ui.open.usage-dashboard',
	title: 'Open Usage Dashboard',
	description: 'Focus the Usage Dashboard leaf (spend / budget / optimization).',
	inputContract: SURFACE_OPEN_INPUT,
	outputContract: SURFACE_OPEN_OUTPUT,
	permissionKind: 'read',
	costTier: 'fast',
	backendPolicy: DEFAULT_BACKEND,
	skillRef: 'ui.surface-open.v1',
	surfaceBinding: ['chat'],
};

export const CHAT_STUDIO_MANIFEST: CapabilityManifest = {
	id: 'ui.open.chat-studio',
	title: 'Open Chat Studio',
	description: 'Focus the Chat Studio leaf.',
	inputContract: SURFACE_OPEN_INPUT,
	outputContract: SURFACE_OPEN_OUTPUT,
	permissionKind: 'read',
	costTier: 'fast',
	backendPolicy: DEFAULT_BACKEND,
	skillRef: 'ui.surface-open.v1',
	surfaceBinding: ['chat'],
};

export const DOCUMENT_COMPOSER_MANIFEST: CapabilityManifest = {
	id: 'ui.open.document-composer',
	title: 'Open document in Peak Composer',
	description: 'Open the active Markdown document in the Peak Composer editing view.',
	inputContract: SURFACE_OPEN_INPUT,
	outputContract: SURFACE_OPEN_OUTPUT,
	permissionKind: 'read',
	costTier: 'fast',
	backendPolicy: DEFAULT_BACKEND,
	skillRef: 'ui.surface-open.v1',
	surfaceBinding: ['copilot'],
};

/**
 * All palette-command manifests keyed by their Obsidian command id.
 * Used by `composeCommandGatewayBindings` to build a GatewayBinding
 * per command and by `test/command-gateway-wire-in.test.ts` to verify
 * every registered command has a matching manifest.
 */
export const PALETTE_COMMAND_MANIFESTS: Readonly<Record<string, CapabilityManifest>> = Object.freeze({
	'peak-open-settings': SETTINGS_MODAL_MANIFEST,
	'peak-harness-setup-wizard': HARNESS_WIZARD_MANIFEST,
	'peak-quick-search': QUICK_SEARCH_MANIFEST,
	'peak-file-atlas-open': FILE_ATLAS_MANIFEST,
	'peak-usage-dashboard': USAGE_DASHBOARD_MANIFEST,
	'peak-open-chat-studio': CHAT_STUDIO_MANIFEST,
	'peak-open-document-composer': DOCUMENT_COMPOSER_MANIFEST,
});
