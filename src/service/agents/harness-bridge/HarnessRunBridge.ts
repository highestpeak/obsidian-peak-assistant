/**
 * Single app-facing bridge into Peak Harness. Every dispatch runs inside a
 * RunEnvelope so timing and failures land uniformly in trace/usage pipelines.
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { AgentLoopConfig, AgentLoopResult } from '@/service/agents/harness/loop/types';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import type { HarnessSettings } from '@/core/config/settingsTypes';
import { ContextManager } from '@/service/agents/harness/context/ContextManager';
import { createDefaultCompactSummarizer } from '@/service/agents/harness/context/compactSummarizerRuntime';
import { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';
import type { PermissionRule } from '@/service/agents/harness/permission/types';

export interface BridgeRunConfig extends AgentLoopConfig {
    /** T11J B1: explicit app + pluginId so the bridge doesn't reach AppContext. */
    app: AppHandle;
    pluginId: string;
    /**
     * Current harness settings. Kept on the config even after the SDK-backend
     * retirement so future gating (permission modes, escalation caps) has a
     * single passthrough surface.
     */
    harnessSettings: HarnessSettings;
}

export class HarnessRunBridge {
    async run(cfg: BridgeRunConfig): Promise<AgentLoopResult> {
        const { runHarnessAgent } = await import('@/service/agents/harness/HarnessAgentRun');
		const loopConfig = withDefaultContextManagerAndHarnessSettings(cfg);
        const { payload } = await runHarnessAgent<AgentLoopResult>({
            trigger: 'manual',
            execute: async () => runAgentLoop(loopConfig),
        });
        return payload;
    }
}

function withDefaultContextManagerAndHarnessSettings(cfg: BridgeRunConfig): BridgeRunConfig {
	const settings = cfg.harnessSettings;
	const permission = cfg.permission ?? new PermissionGuard({
		mode: settings.defaultPermissionMode,
		rules: permissionRules(settings),
	});
	const tools = cfg.tools.filter((tool) => {
		if (tool.name.startsWith('mcp__web__')) return settings.tools.webAccess && settings.permissions.networkAccess !== 'deny';
		if (tool.source === 'mcp') return settings.tools.mcp;
		if (tool.source === 'obsidian-command') return settings.tools.obsidianCommands;
		return true;
	});
	const base = { ...cfg, tools, permission, compiledSkill: settings.tools.skills ? cfg.compiledSkill : undefined };
	if (cfg.context) return base;
    const maxTokens =
        cfg.tierController.current().capabilities.maxContextTokens ??
        cfg.budget?.maxTokens ??
        20_000;
    return {
		...base,
        context: new ContextManager({
            maxTokens,
            summarizer: createDefaultCompactSummarizer() ?? undefined,
        }),
	};
}

function permissionRules(settings: HarnessSettings): PermissionRule[] {
	const rules: PermissionRule[] = [];
	if (!settings.permissions.readVault) rules.push({ tool: /^vault_(list|read|grep|wikilink|get|search)/, effect: 'deny', reason: 'Vault reads are disabled in Settings.' });
	if (!settings.permissions.writeVault) rules.push({ tool: /^(vault_)?(write|edit|create|delete|move|apply)/, effect: 'deny', reason: 'Vault writes are disabled in Settings.' });
	if (settings.permissions.networkAccess !== 'allow') rules.push({ tool: /^mcp__web__/, effect: settings.permissions.networkAccess, reason: 'Network access follows the Agent permission setting.' });
	if (settings.permissions.localCommands !== 'allow') rules.push({ tool: /^obsidian_/, effect: settings.permissions.localCommands, reason: 'Local commands follow the Agent permission setting.' });
	return rules;
}
