// B1 Command Gateway wire-in — compose GatewayBindings for the palette
// commands.
//
// Each palette command becomes a `GatewayBinding` so the Obsidian
// callback path is uniform:
//
//   Obsidian palette → callback → gateway.dispatch(id) → runCapability
//     → strategy(execute)
//
// The strategy is a thin adapter around the original UI-open handler
// (`openQuickSearch`, `openSettingsModal`, ...). Wire-in stays behavior-
// neutral: same callback runs, but now RunSession/RunEvent are recorded
// via the CapabilityRunner.
//
// Once B3 lands live backend strategies (hermes-harness /
// provider-direct), these `execute` closures can shift to real backend
// dispatch without touching the manifest or the palette registration.

import type { CompiledSkill } from '@/core/types/compiled-skill';
import type { GatewayBinding } from '@/service/capabilities/CommandGateway';
import type { CapabilityRunContext, CapabilityExecutionOutput } from '@/service/capabilities/CapabilityRunner';
import {
	AI_CONTROL_CENTER_MANIFEST,
	CHAT_STUDIO_MANIFEST,
	COMMAND_CENTER_MANIFEST,
	CREATE_PEAK_SHEET_MANIFEST,
	DOCUMENT_COMPOSER_MANIFEST,
	FILE_ATLAS_MANIFEST,
	HARNESS_WIZARD_MANIFEST,
	MY_CONTENT_MANIFEST,
	QUICK_SEARCH_MANIFEST,
	SETTINGS_MODAL_MANIFEST,
	USAGE_DASHBOARD_MANIFEST,
	VAULT_INTELLIGENCE_MANIFEST,
} from './manifests';

/**
 * Placeholder CompiledSkill used by palette commands until each surface
 * defines a real skill. Permissive quarantine — palette commands do not
 * dispatch tools, so allowedTools stays empty and the harness quarantine
 * check simply passes through.
 */
const SURFACE_OPEN_SKILL: CompiledSkill = {
	skillId: 'ui.surface-open.v1',
	systemPrompt: '',
	quarantine: 'permissive',
	allowedTools: [],
};

const PEAK_SHEET_CREATE_SKILL: CompiledSkill = {
	skillId: 'ui.peak-sheet-create.v1',
	systemPrompt: '',
	quarantine: 'permissive',
	allowedTools: [],
};

/**
 * Callbacks the palette commands need to run. Passed in from `main.ts`
 * (or the composition site) so this factory stays free of Obsidian /
 * plugin-lifecycle references.
 */
export interface PaletteCommandActions {
	readonly openCommandCenter: () => void | Promise<void>;
	readonly openAIControlCenter: () => void | Promise<void>;
	readonly openMyContent: () => void | Promise<void>;
	readonly openVaultIntelligence: () => void | Promise<void>;
	readonly createPeakSheet: () => void | Promise<void>;
	readonly openSettingsModal: () => void | Promise<void>;
	readonly openHarnessSetupWizard: () => void | Promise<void>;
	readonly openQuickSearch: () => void | Promise<void>;
	readonly openFileAtlas: () => void | Promise<void>;
	readonly openUsageDashboard: () => void | Promise<void>;
	readonly openChatStudio: () => void | Promise<void>;
	readonly openDocumentComposer: () => void | Promise<void>;
}

function surfaceOpenStrategy(
	action: () => void | Promise<void>,
): (input: unknown, ctx: CapabilityRunContext) => Promise<CapabilityExecutionOutput<void>> {
	return async (_input, _ctx) => {
		await action();
		return { result: undefined };
	};
}

/**
 * Produce one GatewayBinding per palette command. The returned list is
 * ordered so `Object.keys(PALETTE_COMMAND_MANIFESTS)` and this array
 * stay in the same sequence (asserted by wire-in test).
 */
export function composeCommandGatewayBindings(
	actions: PaletteCommandActions,
): GatewayBinding[] {
	return [
		{
			commandId: 'peak-open-command-center',
			commandLabel: 'Open Peak Command Center',
			manifest: COMMAND_CENTER_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openCommandCenter),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-ai-control-center',
			commandLabel: 'Open AI Control Center',
			manifest: AI_CONTROL_CENTER_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openAIControlCenter),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-my-content',
			commandLabel: 'Open My Content',
			manifest: MY_CONTENT_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openMyContent),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-vault-intelligence',
			commandLabel: 'Open Vault Intelligence',
			manifest: VAULT_INTELLIGENCE_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openVaultIntelligence),
			trigger: 'manual',
		},
		{
			commandId: 'peak-create-sheet',
			commandLabel: 'Create Peak Sheet',
			manifest: CREATE_PEAK_SHEET_MANIFEST,
			compiledSkill: PEAK_SHEET_CREATE_SKILL,
			execute: surfaceOpenStrategy(actions.createPeakSheet),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-settings',
			commandLabel: 'Settings',
			manifest: SETTINGS_MODAL_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openSettingsModal),
			trigger: 'manual',
		},
		{
			commandId: 'peak-harness-setup-wizard',
			commandLabel: 'Setup Wizard',
			manifest: HARNESS_WIZARD_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openHarnessSetupWizard),
			trigger: 'manual',
		},
		{
			commandId: 'peak-quick-search',
			commandLabel: 'Quick Search',
			manifest: QUICK_SEARCH_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openQuickSearch),
			trigger: 'manual',
		},
		{
			commandId: 'peak-file-atlas-open',
			commandLabel: 'Open File Atlas',
			manifest: FILE_ATLAS_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openFileAtlas),
			trigger: 'manual',
		},
		{
			commandId: 'peak-usage-dashboard',
			commandLabel: 'Usage Dashboard',
			manifest: USAGE_DASHBOARD_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openUsageDashboard),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-chat-studio',
			commandLabel: 'Open Chat Studio',
			manifest: CHAT_STUDIO_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openChatStudio),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-document-composer',
			commandLabel: 'Open document in Peak Composer',
			manifest: DOCUMENT_COMPOSER_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openDocumentComposer),
			trigger: 'manual',
		},
	];
}
