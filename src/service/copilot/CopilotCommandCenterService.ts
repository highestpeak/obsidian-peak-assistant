// Copilot Command Center — meta-agent that drafts a capability sequence based on
// the user's plain-language goal, then dispatches steps via CommandGateway.
// See docs/superpowers/specs/2026-05-14-copilot-command-center-user-centered-redesign.md

import { PromptId } from '@/core/types/prompt';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { CommandGateway, GatewayBinding } from '@/service/capabilities/CommandGateway';
import {
	capabilityPlanSchema,
	type CapabilityPlan,
	type CapabilityPlanStep,
} from '@/core/schemas/agents/copilotCommandCenter';

export interface CopilotCommandCenterDeps {
	aiServiceManager: AIServiceManager;
	commandGateway: CommandGateway;
	/** Returns a short (< 800 char) excerpt of the active file body, or empty string. */
	readActiveFileExcerpt: () => Promise<{ path: string | null; excerpt: string }>;
}

export interface CopilotCommandCenterRunOptions {
	userGoal: string;
}

export interface CopilotCommandCenterStepOutcome {
	step: CapabilityPlanStep;
	status: 'succeeded' | 'failed' | 'skipped';
	error?: string;
}

export interface CopilotCommandCenterRunResult {
	plan: CapabilityPlan;
	stepOutcomes: CopilotCommandCenterStepOutcome[];
}

const MAX_EXCERPT_CHARS = 800;

export class CopilotCommandCenterService {
	constructor(private readonly deps: CopilotCommandCenterDeps) {}

	async planOnly(options: CopilotCommandCenterRunOptions): Promise<CapabilityPlan> {
		const active = await this.deps.readActiveFileExcerpt();
		const bindings = this.deps.commandGateway.all();
		const availableCommands = bindings.map((b: GatewayBinding) => ({
			commandId: b.commandId,
			commandLabel: b.commandLabel,
			description: (b.manifest as any)?.description ?? '',
		}));
		const raw = await this.deps.aiServiceManager.queryStructured<CapabilityPlan>(
			PromptId.CopilotCommandCenterPlan,
			{
				userGoal: options.userGoal,
				activeFilePath: active.path ?? '',
				activeFileExcerpt: active.excerpt.slice(0, MAX_EXCERPT_CHARS),
				availableCommands,
			},
			undefined,
			{
				usageFeature: 'copilot',
				usageAction: 'copilot-command-center-plan',
			},
		);
		return capabilityPlanSchema.parse(raw);
	}

	async executePlan(plan: CapabilityPlan): Promise<CopilotCommandCenterRunResult> {
		const outcomes: CopilotCommandCenterStepOutcome[] = [];
		for (const step of plan.steps) {
			try {
				const binding = this.deps.commandGateway.get(step.commandId);
				if (!binding) {
					outcomes.push({ step, status: 'skipped', error: `unregistered commandId: ${step.commandId}` });
					continue;
				}
				await this.deps.commandGateway.dispatch(step.commandId);
				outcomes.push({ step, status: 'succeeded' });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				outcomes.push({ step, status: 'failed', error: msg });
				// Halt on write-step failure so partial mutations don't cascade.
				if (!step.readOnly) break;
			}
		}
		return { plan, stepOutcomes: outcomes };
	}
}
