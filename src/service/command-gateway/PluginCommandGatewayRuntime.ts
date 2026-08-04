import { z } from 'zod';
import type { PluginCommandGatewayPort } from '@/core/ports/PluginCommandGatewayPort';
import type { PluginCommandGatewayAuditPort } from '@/core/ports/PluginCommandGatewayAuditPort';
import type { PluginCommandPort } from '@/core/ports/PluginCommandPort';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { ToolDef, ToolExecCtx } from '@/core/types/tool';
import { fail, ok } from '@/core/types/tool';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { PromptId } from '@/core/types/prompt';
import { hashSHA256 } from '@/core/utils/hash-utils';
import {
	DEFAULT_PLUGIN_COMMAND_GATEWAY_SETTINGS,
	OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME,
	type CompiledCommandSkill,
	type PluginCommandCurationFinding,
	type PluginCommandDescriptor,
	type PluginCommandGatewayAuditReceipt,
	type PluginCommandGatewayConfig,
	type PluginCommandGatewayScanProgress,
	type PluginCommandGatewayScanResult,
	type PluginCommandGatewaySettings,
	type PluginCommandGatewaySnapshot,
	type PluginCommandInteraction,
	type PluginCommandPurpose,
	type PluginCommandReviewInput,
	type PluginCommandReviewItem,
	type PluginCommandRisk,
} from '@/core/types/plugin-command-gateway';
import {
	pluginCommandCurationResponseSchema,
	type PluginCommandCurationResponse,
} from '@/core/schemas/agents/pluginCommandGateway';
import { DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG } from './PluginCommandGatewayDefaults';
import { runCapability } from '@/service/capabilities/CapabilityRunner';
import {
	InMemoryRunRecorder,
	defaultClock,
	defaultIdFactory,
} from '@/service/run-envelope';
import { guardToolExecution } from '@/service/skills/withQuarantineGuard';

interface PluginCommandGatewayRuntimeDeps {
	readonly commandPort: PluginCommandPort;
	readonly auditPort: PluginCommandGatewayAuditPort;
	readonly aiServiceManager: AIServiceManager;
	readonly templateManager: TemplateManager;
	readonly getSettings: () => MyPluginSettings;
	readonly persistSettings: (settings: PluginCommandGatewaySettings) => Promise<void>;
	readonly now?: () => number;
}

interface DeterministicClassification {
	readonly risk: PluginCommandRisk;
	readonly purpose: PluginCommandPurpose;
	readonly interaction: PluginCommandInteraction;
}

interface ExecuteToolOutput {
	readonly commandId: string;
	readonly runId: string;
	readonly observation: PluginCommandGatewayAuditReceipt['observation'];
	readonly auditWarning?: string;
}

export class PluginCommandGatewayRuntime implements PluginCommandGatewayPort {
	private descriptors: readonly PluginCommandDescriptor[] = [];
	private configPromise: Promise<PluginCommandGatewayConfig> | null = null;
	private lastScannedAt = 0;

	constructor(private readonly deps: PluginCommandGatewayRuntimeDeps) {}

	async getSnapshot(): Promise<PluginCommandGatewaySnapshot> {
		if (this.lastScannedAt === 0) return this.refresh();
		return this.buildSnapshot();
	}

	async scan(
		onProgress: (progress: PluginCommandGatewayScanProgress) => void = () => {},
	): Promise<PluginCommandGatewayScanResult> {
		onProgress({
			phase: 'discovering',
			processedCommands: 0,
			totalCommands: 0,
			pluginCount: 0,
		});
		const discovered = await this.refresh();
		const totalCommands = discovered.commands.length;
		const pluginCount = countPlugins(discovered.commands);
		onProgress({
			phase: 'checking',
			processedCommands: 0,
			totalCommands,
			pluginCount,
		});
		try {
			const snapshot = await this.curateDiscovered((processedCommands) => {
				onProgress({
					phase: 'explaining',
					processedCommands,
					totalCommands,
					pluginCount,
				});
			});
			onProgress({
				phase: 'complete',
				processedCommands: totalCommands,
				totalCommands,
				pluginCount,
			});
			return { snapshot, explanationStatus: 'ready' };
		} catch (error) {
			const snapshot = await this.buildSnapshot();
			onProgress({
				phase: 'complete',
				processedCommands: totalCommands,
				totalCommands,
				pluginCount,
			});
			return {
				snapshot,
				explanationStatus: 'fallback',
				warning: `curation-unavailable:${toErrorMessage(error)}`,
			};
		}
	}

	async refresh(): Promise<PluginCommandGatewaySnapshot> {
		const config = await this.getConfig();
		const discovered = await this.deps.commandPort.discover();
		this.descriptors = discovered.slice(0, config.discovery.maxCommands);
		this.lastScannedAt = this.now();
		return this.buildSnapshot();
	}

	async curate(): Promise<PluginCommandGatewaySnapshot> {
		await this.refresh();
		return this.curateDiscovered();
	}

	private async curateDiscovered(
		onBatch?: (processedCommands: number) => void,
	): Promise<PluginCommandGatewaySnapshot> {
		const config = await this.getConfig();
		const findings: Record<string, PluginCommandCurationFinding> = {
			...this.gatewaySettings().findings,
		};
		onBatch?.(0);
		for (let index = 0; index < this.descriptors.length; index += config.curation.batchSize) {
			const batch = this.descriptors.slice(index, index + config.curation.batchSize);
			const raw = await this.deps.aiServiceManager.queryStructured<PluginCommandCurationResponse>(
				PromptId.PluginCommandGatewayCurate,
				{
					commands: batch.map((descriptor) => {
						const deterministic = classifyCommand(descriptor, config);
						return {
							commandId: descriptor.commandId,
							commandName: descriptor.commandName,
							pluginId: descriptor.pluginId,
							pluginName: descriptor.pluginName,
							pluginVersion: descriptor.pluginVersion,
							availability: descriptor.availability,
							deterministicRisk: deterministic.risk,
							deterministicPurpose: deterministic.purpose,
							deterministicInteraction: deterministic.interaction,
						};
					}),
				},
				undefined,
				{
					usageFeature: 'copilot',
					usageAction: 'plugin-command-gateway-curate',
				},
			);
			const parsed = pluginCommandCurationResponseSchema.parse(raw);
			const batchById = new Map(batch.map((descriptor) => [descriptor.commandId, descriptor]));
			for (const proposal of parsed.findings) {
				const descriptor = batchById.get(proposal.commandId);
				if (!descriptor) continue;
				findings[proposal.commandId] = {
					...proposal,
					sourceHash: descriptor.sourceHash,
					curatedAt: this.now(),
				};
			}
			onBatch?.(Math.min(index + batch.length, this.descriptors.length));
		}
		await this.deps.persistSettings({
			reviews: { ...this.gatewaySettings().reviews },
			findings,
		});
		return this.buildSnapshot();
	}

	async review(
		commandId: string,
		input: PluginCommandReviewInput,
	): Promise<PluginCommandGatewaySnapshot> {
		await this.refresh();
		const descriptor = this.descriptors.find((entry) => entry.commandId === commandId);
		if (!descriptor) throw new Error(`command-not-found:${commandId}`);
		const finding = currentFinding(this.gatewaySettings(), descriptor);
		const config = await this.getConfig();
		const interaction = effectiveInteraction(
			descriptor,
			finding,
			classifyCommand(descriptor, config),
		);
		if (input.decision === 'allow') {
			if (descriptor.availability !== 'available') {
				throw new Error(`command-not-available:${commandId}`);
			}
			if (input.risk === 'destructive' || input.risk === 'unknown') {
				throw new Error(`command-risk-blocked:${commandId}:${input.risk}`);
			}
			if (interaction === 'modal') {
				throw new Error(`command-modal-only:${commandId}`);
			}
		}
		await this.deps.persistSettings({
			findings: { ...this.gatewaySettings().findings },
			reviews: {
				...this.gatewaySettings().reviews,
				[commandId]: {
					...input,
					sourceHash: descriptor.sourceHash,
					curationHash: buildCurationHash(descriptor, finding),
					reviewedAt: this.now(),
				},
			},
		});
		return this.buildSnapshot();
	}

	async allowMany(commandIds: readonly string[]): Promise<PluginCommandGatewaySnapshot> {
		if (commandIds.length === 0) return this.getSnapshot();
		await this.refresh();
		const settings = this.gatewaySettings();
		const items = new Map(
			(await this.reviewItems()).map((item) => [item.descriptor.commandId, item]),
		);
		const descriptors = new Map(
			this.descriptors.map((descriptor) => [descriptor.commandId, descriptor]),
		);
		const reviews = { ...settings.reviews };
		for (const commandId of new Set(commandIds)) {
			const item = items.get(commandId);
			const descriptor = descriptors.get(commandId);
			if (!item || !descriptor) throw new Error(`command-not-found:${commandId}`);
			if (descriptor.availability !== 'available') {
				throw new Error(`command-not-available:${commandId}`);
			}
			if (item.effectiveRisk === 'destructive' || item.effectiveRisk === 'unknown') {
				throw new Error(`command-risk-blocked:${commandId}:${item.effectiveRisk}`);
			}
			if (item.descriptor.interaction === 'modal') {
				throw new Error(`command-modal-only:${commandId}`);
			}
			const finding = currentFinding(settings, descriptor);
			reviews[commandId] = {
				decision: 'allow',
				risk: item.effectiveRisk,
				purpose: item.effectivePurpose,
				sourceHash: descriptor.sourceHash,
				curationHash: buildCurationHash(descriptor, finding),
				reviewedAt: this.now(),
			};
		}
		await this.deps.persistSettings({
			findings: { ...settings.findings },
			reviews,
		});
		return this.buildSnapshot();
	}

	async clearReview(commandId: string): Promise<PluginCommandGatewaySnapshot> {
		const reviews = { ...this.gatewaySettings().reviews };
		delete reviews[commandId];
		await this.deps.persistSettings({
			reviews,
			findings: { ...this.gatewaySettings().findings },
		});
		return this.buildSnapshot();
	}

	async compileApprovedSkill(): Promise<CompiledCommandSkill> {
		await this.refresh();
		const approvedCommands: Record<string, {
			sourceHash: string;
			curationHash: string;
			risk: 'read' | 'edit';
			purpose: PluginCommandPurpose;
			confirmation: 'none' | 'per-run' | 'always';
		}> = {};
		const instructions: string[] = [];
		const settings = this.gatewaySettings();
		const config = await this.getConfig();
		for (const descriptor of this.descriptors) {
			const review = settings.reviews[descriptor.commandId];
			if (!review || review.decision !== 'allow') continue;
			if (review.sourceHash !== descriptor.sourceHash) continue;
			if (descriptor.availability !== 'available') continue;
			if (review.risk !== 'read' && review.risk !== 'edit') continue;
			const finding = currentFinding(settings, descriptor);
			const interaction = effectiveInteraction(
				descriptor,
				finding,
				classifyCommand(descriptor, config),
			);
			if (interaction === 'modal') continue;
			const curationHash = buildCurationHash(descriptor, finding);
			if (review.curationHash !== curationHash) continue;
			approvedCommands[descriptor.commandId] = {
				sourceHash: descriptor.sourceHash,
				curationHash,
				risk: review.risk,
				purpose: review.purpose,
				confirmation: effectiveConfirmation(review.risk, finding),
			};
			if (finding?.skillInstructions) {
				instructions.push(`${descriptor.commandName}: ${finding.skillInstructions}`);
			}
		}
		const fingerprint = hashSHA256(
			Object.entries(approvedCommands)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([commandId, approval]) => `${commandId}:${JSON.stringify(approval)}`)
				.join('\n'),
		).slice(0, 16);
		return Object.freeze({
			skillId: `plugin-command-gateway.${fingerprint}`,
			systemPrompt: instructions.join('\n'),
			quarantine: 'strict',
			allowedTools: Object.freeze([OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME] as const),
			approvedCommands: Object.freeze({ ...approvedCommands }),
		});
	}

	async getToolDefinitions(): Promise<readonly ToolDef[]> {
		const compiled = await this.compileApprovedSkill();
		const commandIds = Object.keys(compiled.approvedCommands).sort();
		if (commandIds.length === 0) return [];
		const items = await this.reviewItems();
		const approvedItems = items.filter((item) => commandIds.includes(item.descriptor.commandId));
		const requiresPermission = Object.values(compiled.approvedCommands).some(
			(approval) =>
				approval.risk === 'edit' ||
				approval.confirmation === 'per-run' ||
				approval.confirmation === 'always',
		);
		const catalog = approvedItems
			.map((item) => {
				const description = item.finding?.toolDescription ?? item.descriptor.commandName;
				const guidance = item.finding?.skillInstructions?.trim();
				return guidance
					? `- ${item.descriptor.commandId}: ${description} Guidance: ${guidance}`
					: `- ${item.descriptor.commandId}: ${description}`;
			})
			.join('\n');
		const allowedIds = new Set(commandIds);
		const inputSchema = z.object({
			commandId: z.string().refine(
				(value) => allowedIds.has(value),
				'Command is not in the current human-approved allowlist',
			),
		});
		const rawTool: ToolDef<{ commandId: string }, ExecuteToolOutput> = {
			name: OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME,
			source: 'obsidian-command',
			kind: requiresPermission ? 'edit' : 'read',
			description:
				'Execute one human-approved command from an enabled external Obsidian plugin. ' +
				'Use only when the command directly advances the user request.\n' +
				catalog,
			inputSchema,
			execute: (args, ctx) => this.executeApproved(args.commandId, compiled, ctx),
		};
		const tool: ToolDef<{ commandId: string }, ExecuteToolOutput> = {
			...rawTool,
			execute: (args, ctx) =>
				guardToolExecution({
					compiled,
					tool: rawTool,
					input: args,
					ctx,
				}),
		};
		return [tool];
	}

	async dispose(): Promise<void> {
		await this.deps.auditPort.drain();
	}

	private async executeApproved(
		commandId: string,
		compiled: CompiledCommandSkill,
		_ctx: ToolExecCtx,
	): Promise<ReturnType<typeof ok<ExecuteToolOutput>> | ReturnType<typeof fail>> {
		await this.refresh();
		const compiledApproval = compiled.approvedCommands[commandId];
		if (compiledApproval === undefined) {
			return fail(`plugin-command-policy:not-in-compiled-skill:${commandId}`, false);
		}
		const descriptor = this.descriptors.find((entry) => entry.commandId === commandId);
		const review = this.gatewaySettings().reviews[commandId];
		if (!descriptor || !review || review.decision !== 'allow') {
			return fail(`plugin-command-policy:not-approved:${commandId}`, false);
		}
		if (
			review.sourceHash !== descriptor.sourceHash ||
			compiledApproval.sourceHash !== descriptor.sourceHash
		) {
			return fail(`plugin-command-policy:source-changed:${commandId}`, false);
		}
		const finding = currentFinding(this.gatewaySettings(), descriptor);
		const curationHash = buildCurationHash(descriptor, finding);
		if (
			review.curationHash !== curationHash ||
			compiledApproval.curationHash !== curationHash
		) {
			return fail(`plugin-command-policy:draft-changed:${commandId}`, false);
		}
		const interaction = effectiveInteraction(
			descriptor,
			finding,
			classifyCommand(descriptor, await this.getConfig()),
		);
		if (interaction === 'modal') {
			return fail(`plugin-command-policy:modal-only:${commandId}`, false);
		}
		if (review.risk !== 'read' && review.risk !== 'edit') {
			return fail(`plugin-command-policy:risk-blocked:${commandId}:${review.risk}`, false);
		}
		if (
			compiledApproval.risk !== review.risk ||
			compiledApproval.purpose !== review.purpose ||
			compiledApproval.confirmation !== effectiveConfirmation(review.risk, finding)
		) {
			return fail(`plugin-command-policy:review-changed:${commandId}`, false);
		}
		const preflight = await this.deps.commandPort.preflight(commandId);
		if (preflight.availability !== 'available') {
			return fail(
				`plugin-command-preflight:${commandId}:${preflight.reason ?? preflight.availability}`,
				true,
			);
		}

		const config = await this.getConfig();
		const recorder = new InMemoryRunRecorder({
			clock: defaultClock(),
			idFactory: defaultIdFactory(`plugin-command-${descriptor.pluginId}`),
		});
		const startedAt = this.now();
		try {
			const result = await runCapability({
				manifest: {
					id: `obsidian.command.${descriptor.pluginId}`,
					title: descriptor.commandName,
					description: `Execute approved command ${descriptor.commandId}.`,
					inputContract: {
						kind: 'object',
						description: 'One approved external Obsidian command ID.',
						fields: { commandId: 'Current human-approved command ID.' },
					},
					outputContract: {
						kind: 'object',
						description: 'Command invocation and observed workspace/vault side effects.',
					},
					permissionKind: review.risk === 'read' ? 'read' : 'acceptEdits',
					costTier: 'fast',
					backendPolicy: {
						preferred: 'hermes-harness',
						fallback: [],
					},
					skillRef: compiled.skillId,
					surfaceBinding: ['copilot', 'chat'],
				},
				compiledSkill: compiled,
				input: { commandId },
				trigger: 'agent',
				recorder,
				execute: async (_input, runContext) => {
					runContext.recorder.recordLog(
						'info',
						`policy-approved command=${commandId} risk=${review.risk} sourceHash=${descriptor.sourceHash}`,
					);
					runContext.recorder.recordProgress({
						phase: 'preflight',
						label: 'command-available',
						processed: 1,
						total: 1,
					});
					const observation = await this.deps.commandPort.execute(commandId, {
						settleDelayMs: config.observation.settleDelayMs,
						maxChangedPaths: config.observation.maxChangedPaths,
					});
					runContext.recorder.recordLog('info', `observation ${observation.summary}`);
					return {
						result: observation,
						artifactTitle: `${descriptor.commandName} observation`,
						artifactContentType: 'application/vnd.peak.obsidian-command-observation+json',
					};
				},
			});
			const receipt: PluginCommandGatewayAuditReceipt = {
				schemaVersion: 1,
				runId: result.session.runId,
				commandId,
				commandName: descriptor.commandName,
				pluginId: descriptor.pluginId,
				pluginName: descriptor.pluginName,
				sourceHash: descriptor.sourceHash,
				curationHash,
				compiledSkillId: compiled.skillId,
				risk: review.risk,
				purpose: review.purpose,
				confirmation: compiledApproval.confirmation,
				status: 'completed',
				startedAt: result.session.startedAt,
				endedAt: result.session.endedAt ?? this.now(),
				observation: result.result,
				events: serializeEvents(result.events),
			};
			let auditWarning: string | undefined;
			try {
				await this.deps.auditPort.append(receipt);
			} catch (error) {
				auditWarning = `audit-write-failed:${toErrorMessage(error)}`;
			}
			return ok({
				commandId,
				runId: result.session.runId,
				observation: result.result,
				...(auditWarning ? { auditWarning } : {}),
			});
		} catch (error) {
			const session = recorder.getSession();
			const receipt: PluginCommandGatewayAuditReceipt = {
				schemaVersion: 1,
				runId: session.runId,
				commandId,
				commandName: descriptor.commandName,
				pluginId: descriptor.pluginId,
				pluginName: descriptor.pluginName,
				sourceHash: descriptor.sourceHash,
				curationHash,
				compiledSkillId: compiled.skillId,
				risk: review.risk,
				purpose: review.purpose,
				confirmation: compiledApproval.confirmation,
				status: 'failed',
				startedAt: session.startedAt ?? startedAt,
				endedAt: session.endedAt ?? this.now(),
				error: toErrorMessage(error),
				events: serializeEvents(recorder.getEvents()),
			};
			try {
				await this.deps.auditPort.append(receipt);
			} catch {
				// The original command failure remains the primary error.
			}
			return fail(`plugin-command-execution:${commandId}:${toErrorMessage(error)}`, true);
		}
	}

	private async buildSnapshot(): Promise<PluginCommandGatewaySnapshot> {
		const commands = await this.reviewItems();
		const config = await this.getConfig();
		return {
			commands,
			approvedCount: commands.filter((item) => item.approved).length,
			blockedCount: commands.filter(
				(item) => item.systemBlocked || item.review?.decision === 'deny',
			).length,
			staleCount: commands.filter((item) => item.stale).length,
			lastScannedAt: this.lastScannedAt,
			recentRuns: await this.deps.auditPort.listRecent(config.audit.recentLimit),
		};
	}

	private async reviewItems(): Promise<PluginCommandReviewItem[]> {
		const config = await this.getConfig();
		const settings = this.gatewaySettings();
		return this.descriptors.map((descriptor) => {
			const review = settings.reviews[descriptor.commandId];
			const finding = currentFinding(settings, descriptor);
			const deterministic = classifyCommand(descriptor, config);
			const curationHash = buildCurationHash(descriptor, finding);
			const stale = Boolean(
				review &&
					(
						review.sourceHash !== descriptor.sourceHash ||
						review.curationHash !== curationHash
					),
			);
			const effectiveRisk = !stale && review
				? review.risk
				: finding?.risk ?? deterministic.risk;
			const effectivePurpose = !stale && review
				? review.purpose
				: finding?.purpose ?? deterministic.purpose;
			const interaction = effectiveInteraction(descriptor, finding, deterministic);
			const systemBlocked =
				effectiveRisk === 'destructive' ||
				effectiveRisk === 'unknown' ||
				interaction === 'modal';
			const approved =
				review?.decision === 'allow' &&
				!stale &&
				!systemBlocked &&
				descriptor.availability === 'available';
			return {
				descriptor: {
					...descriptor,
					interaction,
				},
				...(finding ? { finding } : {}),
				...(review ? { review } : {}),
				effectiveRisk,
				effectivePurpose,
				approved,
				stale,
				systemBlocked,
			};
		});
	}

	private gatewaySettings(): PluginCommandGatewaySettings {
		return this.deps.getSettings().pluginCommandGateway ??
			DEFAULT_PLUGIN_COMMAND_GATEWAY_SETTINGS;
	}

	private getConfig(): Promise<PluginCommandGatewayConfig> {
		if (!this.configPromise) {
			this.configPromise = this.deps.templateManager
				.loadJson<PluginCommandGatewayConfig>(ConfigTemplateId.PluginCommandGateway)
				.then(normalizeConfig)
				.catch(() => DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG);
		}
		return this.configPromise;
	}

	private now(): number {
		return this.deps.now?.() ?? Date.now();
	}
}

function classifyCommand(
	descriptor: PluginCommandDescriptor,
	config: PluginCommandGatewayConfig,
): DeterministicClassification {
	const text = [
		descriptor.commandId,
		descriptor.commandName,
		descriptor.pluginId,
		descriptor.pluginName,
	].join(' ');
	const classification = config.classification;
	const risk = matches(text, classification.destructivePatterns)
		? 'destructive'
		: matches(text, classification.editPatterns)
			? 'edit'
			: matches(text, classification.readPatterns)
				? 'read'
				: 'unknown';
	let purpose: PluginCommandPurpose = 'other';
	for (const candidate of [
		'navigation',
		'capture',
		'planning',
		'tasks',
		'query',
		'formatting',
		'system',
	] as const) {
		if (!matches(text, classification.purposePatterns[candidate] ?? [])) continue;
		purpose = candidate;
		break;
	}
	return {
		risk,
		purpose,
		interaction: matches(text, classification.modalPatterns) ? 'modal' : 'unknown',
	};
}

function countPlugins(items: readonly PluginCommandReviewItem[]): number {
	return new Set(items.map((item) => item.descriptor.pluginId)).size;
}

function effectiveInteraction(
	descriptor: PluginCommandDescriptor,
	finding: PluginCommandCurationFinding | undefined,
	deterministic: DeterministicClassification,
): PluginCommandInteraction {
	if (
		descriptor.interaction === 'modal' ||
		deterministic.interaction === 'modal' ||
		finding?.interaction === 'modal'
	) {
		return 'modal';
	}
	if (finding?.interaction) return finding.interaction;
	if (descriptor.interaction !== 'unknown') return descriptor.interaction;
	return deterministic.interaction;
}

function currentFinding(
	settings: PluginCommandGatewaySettings,
	descriptor: PluginCommandDescriptor,
): PluginCommandCurationFinding | undefined {
	const finding = settings.findings[descriptor.commandId];
	return finding?.sourceHash === descriptor.sourceHash ? finding : undefined;
}

function buildCurationHash(
	descriptor: PluginCommandDescriptor,
	finding: PluginCommandCurationFinding | undefined,
): string {
	return hashSHA256(JSON.stringify({
		sourceHash: descriptor.sourceHash,
		finding: finding
			? {
					recommend: finding.recommend,
					risk: finding.risk,
					purpose: finding.purpose,
					summary: finding.summary,
					evidence: finding.evidence,
					requiresActiveEditor: finding.requiresActiveEditor,
					interaction: finding.interaction,
					expectedObservation: finding.expectedObservation,
					toolDescription: finding.toolDescription,
					confirmation: finding.confirmation,
					skillName: finding.skillName,
					skillDescription: finding.skillDescription,
					skillInstructions: finding.skillInstructions,
				}
			: null,
	}));
}

function effectiveConfirmation(
	risk: 'read' | 'edit',
	finding: PluginCommandCurationFinding | undefined,
): 'none' | 'per-run' | 'always' {
	if (finding?.confirmation === 'always') return 'always';
	if (risk === 'edit') return 'per-run';
	return finding?.confirmation ?? 'none';
}

function matches(value: string, patterns: readonly string[]): boolean {
	return patterns.some((pattern) => {
		try {
			return new RegExp(pattern, 'iu').test(value);
		} catch {
			return false;
		}
	});
}

function normalizeConfig(raw: PluginCommandGatewayConfig): PluginCommandGatewayConfig {
	const defaults = DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG;
	if (!raw || typeof raw !== 'object') return defaults;
	return {
		discovery: {
			maxCommands: positiveInteger(raw.discovery?.maxCommands, defaults.discovery.maxCommands),
		},
		curation: {
			batchSize: positiveInteger(raw.curation?.batchSize, defaults.curation.batchSize),
		},
		observation: {
			settleDelayMs: nonNegativeInteger(
				raw.observation?.settleDelayMs,
				defaults.observation.settleDelayMs,
			),
			maxChangedPaths: positiveInteger(
				raw.observation?.maxChangedPaths,
				defaults.observation.maxChangedPaths,
			),
		},
		audit: {
			rotationBytes: positiveInteger(
				raw.audit?.rotationBytes,
				defaults.audit.rotationBytes,
			),
			retentionFiles: positiveInteger(
				raw.audit?.retentionFiles,
				defaults.audit.retentionFiles,
			),
			recentLimit: positiveInteger(raw.audit?.recentLimit, defaults.audit.recentLimit),
		},
		classification: {
			destructivePatterns: stringArray(
				raw.classification?.destructivePatterns,
				defaults.classification.destructivePatterns,
			),
			editPatterns: stringArray(
				raw.classification?.editPatterns,
				defaults.classification.editPatterns,
			),
			readPatterns: stringArray(
				raw.classification?.readPatterns,
				defaults.classification.readPatterns,
			),
			modalPatterns: stringArray(
				raw.classification?.modalPatterns,
				defaults.classification.modalPatterns,
			),
			purposePatterns: {
				...defaults.classification.purposePatterns,
				...(raw.classification?.purposePatterns ?? {}),
			},
		},
	};
}

function positiveInteger(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? Math.floor(value)
		: fallback;
}

function stringArray(value: unknown, fallback: readonly string[]): readonly string[] {
	if (!Array.isArray(value)) return fallback;
	const parsed = value.filter((entry): entry is string => typeof entry === 'string');
	return parsed.length > 0 ? parsed : fallback;
}

function serializeEvents(
	events: readonly object[],
): readonly Readonly<Record<string, unknown>>[] {
	return events.map((event) => JSON.parse(JSON.stringify(event)) as Record<string, unknown>);
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
