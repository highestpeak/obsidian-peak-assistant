// T6R / T8: App-owned runtime registry.
//
// T6 introduced a module-level `currentRuntime` binding inside
// `src/service/lint/VaultLintRuntime.ts`. T6R relocated it to this
// app-level registry; T7 added detector-context wiring; T8 adds the
// second capability (Ambient Push / Morning Briefing) to the same
// pattern. Each capability gets the same fail-loud / double-bind /
// clear semantics.
//
// This registry is owned by `AppContext` (one instance per plugin load).
// It is unit-testable because it does not pull any Obsidian / sqlite /
// AIServiceManager dependencies. Tests construct `new AppRuntimeRegistry()`
// directly and exercise fail-loud / double-bind / clear behavior.
//
// Per-capability accessors are added here rather than on `AppContext`
// itself so the registry stays the single point where binding semantics
// live; `AppContext` only exposes thin static delegators.

import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import type { QuickSearchBackgroundRuntime } from '@/service/search/background/QuickSearchBackgroundRuntime';
import type { CopilotActionRuntime } from '@/service/copilot/actions/CopilotActionRuntime';
import type { IndexService } from '@/service/search/index/indexService';
import type { MCPClientManager } from '@/service/mcp/MCPClientManager';
import type { SkillRegistry } from '@/service/skills/SkillRegistry';
import type { CapabilityRegistry } from '@/service/capabilities/CapabilityRegistry';
import type { CommandGateway } from '@/service/capabilities/CommandGateway';
import type { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import type { UsageOutcomeService } from '@/service/usage/UsageOutcomeService';
import type { UsageOptimizationService } from '@/service/usage/optimization/UsageOptimizationService';
import type { HubGenerationRuntime } from '@/service/hub/HubGenerationRuntime';
import type { HubCurationScheduler } from '@/service/hub/HubCurationScheduler';
import type { DebugTracePort } from '@/core/debug-trace';
import type { DocumentComposerRuntime } from '@/app/composer/DocumentComposerRuntime';
import type { AIGraphArtifactRuntime } from '@/service/ai-graph';
import type { CommandCenterRuntime } from '@/app/command-center';
import { createDefaultGeneratedOutputRegistry } from '@/core/storage/generated-output';
import type { GeneratedOutputRegistry } from '@/core/storage/generated-output';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import type { PluginCommandGatewayRuntime } from '@/service/command-gateway/PluginCommandGatewayRuntime';
import type { PeakKeyboardNavigationPort } from '@/ui/keyboard/KeyboardNavigationPort';

/**
 * Bundle of the three usage-telemetry services. They boot and dispose
 * together (all bound to the same chat-tenant Kysely handle), so the
 * registry treats them as one slot to keep boot/unload symmetric.
 */
export interface UsageServices {
	tracking: UsageTrackingService;
	outcome: UsageOutcomeService;
	optimization: UsageOptimizationService;
}

export class AppRuntimeRegistry {
	private readonly generatedOutputRegistry: GeneratedOutputRegistry;
	private generatedOutputPersistenceRuntime: GeneratedOutputPersistenceRuntime | null = null;
	private vaultLintRuntime: VaultLintRuntime | null = null;
	private ambientRuntime: AmbientRuntime | null = null;
	private vaultReviewRuntime: VaultReviewRuntime | null = null;
	private quickSearchBackgroundRuntime: QuickSearchBackgroundRuntime | null = null;
	private copilotActionRuntime: CopilotActionRuntime | null = null;
	private indexService: IndexService | null = null;
	private mcpClientManager: MCPClientManager | null = null;
	private skillRegistry: SkillRegistry | null = null;
	private capabilityRegistry: CapabilityRegistry | null = null;
	private commandGateway: CommandGateway | null = null;
	private pluginCommandGatewayRuntime: PluginCommandGatewayRuntime | null = null;
	private usageServices: UsageServices | null = null;
	private hubGenerationRuntime: HubGenerationRuntime | null = null;
	private hubCurationScheduler: HubCurationScheduler | null = null;
	private debugTracePort: DebugTracePort | null = null;
	private documentComposerRuntime: DocumentComposerRuntime | null = null;
	private aiGraphArtifactRuntime: AIGraphArtifactRuntime | null = null;
	private commandCenterRuntime: CommandCenterRuntime | null = null;
	private keyboardNavigationRuntime: PeakKeyboardNavigationPort | null = null;

	constructor(generatedOutputRegistry: GeneratedOutputRegistry = createDefaultGeneratedOutputRegistry()) {
		this.generatedOutputRegistry = generatedOutputRegistry;
	}

	/**
	 * Immutable policy catalog for every persistent generated output. It is
	 * constructed once with the app runtime, never through a service singleton.
	 */
	getGeneratedOutputRegistry(): GeneratedOutputRegistry {
		return this.generatedOutputRegistry;
	}

	setGeneratedOutputPersistenceRuntime(runtime: GeneratedOutputPersistenceRuntime): void {
		if (this.generatedOutputPersistenceRuntime !== null) {
			throw new Error('AppRuntimeRegistry.setGeneratedOutputPersistenceRuntime: a runtime is already bound.');
		}
		this.generatedOutputPersistenceRuntime = runtime;
	}

	getGeneratedOutputPersistenceRuntime(): GeneratedOutputPersistenceRuntime {
		if (this.generatedOutputPersistenceRuntime === null) {
			throw new Error('AppRuntimeRegistry.getGeneratedOutputPersistenceRuntime: no runtime is bound.');
		}
		return this.generatedOutputPersistenceRuntime;
	}

	tryGetGeneratedOutputPersistenceRuntime(): GeneratedOutputPersistenceRuntime | null {
		return this.generatedOutputPersistenceRuntime;
	}

	clearGeneratedOutputPersistenceRuntime(): void {
		this.generatedOutputPersistenceRuntime = null;
	}

	/**
	 * Bind the Vault Lint runtime. Called exactly once at plugin boot
	 * from `composeVaultLintRuntime`. A second bind without an
	 * intervening `clearVaultLintRuntime` is a programmer error and
	 * throws — that situation almost always indicates a duplicate
	 * onload path or a stale hot-reload binding.
	 */
	setVaultLintRuntime(runtime: VaultLintRuntime): void {
		if (this.vaultLintRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setVaultLintRuntime: a runtime is already bound. Call clearVaultLintRuntime first if this is intentional.',
			);
		}
		this.vaultLintRuntime = runtime;
	}

	/**
	 * Read the active Vault Lint runtime. Fail-loud if no runtime is
	 * bound — that is a boot-order bug, not a graceful-degradation
	 * case. Service callers (e.g. `VaultReviewSession`) use this form
	 * because they should only run after the runtime is up.
	 */
	getVaultLintRuntime(): VaultLintRuntime {
		if (this.vaultLintRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getVaultLintRuntime: no runtime is bound. Plugin boot must call setVaultLintRuntime() before consumers reach the runtime.',
			);
		}
		return this.vaultLintRuntime;
	}

	/**
	 * Soft accessor that returns `null` when the runtime is not yet
	 * bound. Used by UI providers that may mount during early boot
	 * (e.g. user opening the Vault X-Ray view before sqlite init
	 * resolves). The consumer is expected to handle the null case.
	 */
	tryGetVaultLintRuntime(): VaultLintRuntime | null {
		return this.vaultLintRuntime;
	}

	/**
	 * Tear down the active runtime. Used by `main.onunload` so a
	 * hot-reloaded plugin bundle does not hold references to the
	 * closed sqlite repo or unloaded `AppContext`. Idempotent.
	 */
	clearVaultLintRuntime(): void {
		this.vaultLintRuntime = null;
	}

	/**
	 * Bind the Ambient runtime. Called exactly once at plugin boot
	 * from `composeAmbientRuntime`. A second bind without an
	 * intervening `clearAmbientRuntime` throws — typically a hot-reload
	 * artifact or duplicate onload path.
	 */
	setAmbientRuntime(runtime: AmbientRuntime): void {
		if (this.ambientRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setAmbientRuntime: a runtime is already bound. Call clearAmbientRuntime first if this is intentional.',
			);
		}
		this.ambientRuntime = runtime;
	}

	/**
	 * Read the active Ambient runtime. Fail-loud if no runtime is
	 * bound — that is a boot-order bug.
	 */
	getAmbientRuntime(): AmbientRuntime {
		if (this.ambientRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getAmbientRuntime: no runtime is bound. Plugin boot must call setAmbientRuntime() before consumers reach the runtime.',
			);
		}
		return this.ambientRuntime;
	}

	/**
	 * Soft accessor returning `null` when the runtime is not yet
	 * bound. Used by UI providers (the Related Notes panel + the
	 * serendipity gutter widget) that may mount during early boot,
	 * before the Ambient bootstrap path runs.
	 */
	tryGetAmbientRuntime(): AmbientRuntime | null {
		return this.ambientRuntime;
	}

	/**
	 * Dispose + drop the Ambient runtime. Used by `main.onunload` so
	 * a hot-reloaded plugin bundle does not hold an open editor event
	 * subscription. Idempotent.
	 */
	clearAmbientRuntime(): void {
		const runtime = this.ambientRuntime;
		this.ambientRuntime = null;
		runtime?.dispose();
	}

	/**
	 * T9: Bind the Vault Review runtime. Called exactly once at plugin
	 * boot from `composeVaultReviewRuntime`. A second bind without an
	 * intervening `clearVaultReviewRuntime` throws — typically a
	 * hot-reload artifact or duplicate onload path.
	 */
	setVaultReviewRuntime(runtime: VaultReviewRuntime): void {
		if (this.vaultReviewRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setVaultReviewRuntime: a runtime is already bound. Call clearVaultReviewRuntime first if this is intentional.',
			);
		}
		this.vaultReviewRuntime = runtime;
	}

	/**
	 * Read the active Vault Review runtime. Fail-loud if no runtime
	 * is bound — that is a boot-order bug.
	 */
	getVaultReviewRuntime(): VaultReviewRuntime {
		if (this.vaultReviewRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getVaultReviewRuntime: no runtime is bound. Plugin boot must call setVaultReviewRuntime() before consumers reach the runtime.',
			);
		}
		return this.vaultReviewRuntime;
	}

	/**
	 * Soft accessor returning `null` when the runtime is not yet
	 * bound. Used by UI components (the Copilot picker, the auto-run
	 * modal, the history modal) that can mount before vault review
	 * boot resolves.
	 */
	tryGetVaultReviewRuntime(): VaultReviewRuntime | null {
		return this.vaultReviewRuntime;
	}

	/**
	 * Dispose + drop the Vault Review runtime. Used by `main.onunload`
	 * so a hot-reloaded plugin bundle does not retain references to
	 * closed sqlite repos or stale fingerprint caches. Idempotent.
	 */
	clearVaultReviewRuntime(): void {
		const runtime = this.vaultReviewRuntime;
		this.vaultReviewRuntime = null;
		runtime?.dispose?.();
	}

	/**
	 * T10: Bind the Quick Search background-session runtime. Called
	 * exactly once at plugin boot from
	 * `composeQuickSearchBackgroundRuntime`. Double-bind without an
	 * intervening clear throws — typically a hot-reload artifact.
	 */
	setQuickSearchBackgroundRuntime(runtime: QuickSearchBackgroundRuntime): void {
		if (this.quickSearchBackgroundRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setQuickSearchBackgroundRuntime: a runtime is already bound. Call clearQuickSearchBackgroundRuntime first if this is intentional.',
			);
		}
		this.quickSearchBackgroundRuntime = runtime;
	}

	/**
	 * Read the active Quick Search background runtime. Fail-loud if no
	 * runtime is bound — that is a boot-order bug.
	 */
	getQuickSearchBackgroundRuntime(): QuickSearchBackgroundRuntime {
		if (this.quickSearchBackgroundRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getQuickSearchBackgroundRuntime: no runtime is bound. Plugin boot must call setQuickSearchBackgroundRuntime() before consumers reach the runtime.',
			);
		}
		return this.quickSearchBackgroundRuntime;
	}

	/**
	 * Soft accessor returning `null` when the runtime is not yet bound.
	 * Used by UI components (Quick Search modal, Active Sessions list,
	 * Recent AI Analysis card) that can mount before boot resolves.
	 */
	tryGetQuickSearchBackgroundRuntime(): QuickSearchBackgroundRuntime | null {
		return this.quickSearchBackgroundRuntime;
	}

	/**
	 * Dispose + drop the runtime. Aborts every in-flight session so a
	 * hot-reloaded plugin bundle doesn't hold agent / abort-controller
	 * references. Idempotent.
	 */
	clearQuickSearchBackgroundRuntime(): void {
		const runtime = this.quickSearchBackgroundRuntime;
		this.quickSearchBackgroundRuntime = null;
		runtime?.dispose();
	}

	/**
	 * T11B: Bind the Copilot manual-action runtime. Called exactly once
	 * at plugin boot from `composeCopilotActionRuntime`. Double-bind
	 * without an intervening clear throws — typically a hot-reload
	 * artifact or duplicate onload path.
	 */
	setCopilotActionRuntime(runtime: CopilotActionRuntime): void {
		if (this.copilotActionRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setCopilotActionRuntime: a runtime is already bound. Call clearCopilotActionRuntime first if this is intentional.',
			);
		}
		this.copilotActionRuntime = runtime;
	}

	/**
	 * Read the active Copilot action runtime. Fail-loud if no runtime
	 * is bound — that is a boot-order bug.
	 */
	getCopilotActionRuntime(): CopilotActionRuntime {
		if (this.copilotActionRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getCopilotActionRuntime: no runtime is bound. Plugin boot must call setCopilotActionRuntime() before consumers reach the runtime.',
			);
		}
		return this.copilotActionRuntime;
	}

	/**
	 * Soft accessor returning `null` when the runtime is not yet bound.
	 * Used by the Copilot picker, the result modal, and the auto-planner
	 * — they can mount before boot finishes loading custom prompts.
	 */
	tryGetCopilotActionRuntime(): CopilotActionRuntime | null {
		return this.copilotActionRuntime;
	}

	/**
	 * Dispose + drop the runtime. Used by `main.onunload` so the
	 * hot-reloaded bundle does not retain references to closed sqlite
	 * repos or the AI service manager. Idempotent.
	 */
	clearCopilotActionRuntime(): void {
		const runtime = this.copilotActionRuntime;
		this.copilotActionRuntime = null;
		runtime?.dispose?.();
	}

	// ─── App-owned keyboard navigation runtime ──────────────────────────

	setKeyboardNavigationRuntime(runtime: PeakKeyboardNavigationPort): void {
		if (this.keyboardNavigationRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setKeyboardNavigationRuntime: a runtime is already bound. Call clearKeyboardNavigationRuntime first if this is intentional.',
			);
		}
		this.keyboardNavigationRuntime = runtime;
	}

	getKeyboardNavigationRuntime(): PeakKeyboardNavigationPort {
		if (this.keyboardNavigationRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getKeyboardNavigationRuntime: no runtime is bound. Plugin boot must bind the keyboard runtime before rendering Peak surfaces.',
			);
		}
		return this.keyboardNavigationRuntime;
	}

	tryGetKeyboardNavigationRuntime(): PeakKeyboardNavigationPort | null {
		return this.keyboardNavigationRuntime;
	}

	clearKeyboardNavigationRuntime(): void {
		const runtime = this.keyboardNavigationRuntime;
		this.keyboardNavigationRuntime = null;
		runtime?.dispose();
	}

	// ─── T13: IndexService ────────────────────────────────────────────────

	setIndexService(service: IndexService): void {
		if (this.indexService !== null) {
			throw new Error(
				'AppRuntimeRegistry.setIndexService: a service is already bound. Call clearIndexService first if this is intentional.',
			);
		}
		this.indexService = service;
	}

	getIndexService(): IndexService {
		if (this.indexService === null) {
			throw new Error(
				'AppRuntimeRegistry.getIndexService: no service is bound. Plugin boot must call setIndexService() before consumers reach it.',
			);
		}
		return this.indexService;
	}

	tryGetIndexService(): IndexService | null {
		return this.indexService;
	}

	clearIndexService(): void {
		const service = this.indexService;
		this.indexService = null;
		service?.disposeTenantHelper();
	}

	// ─── T13: MCPClientManager ────────────────────────────────────────────

	setMcpClientManager(manager: MCPClientManager): void {
		if (this.mcpClientManager !== null) {
			throw new Error(
				'AppRuntimeRegistry.setMcpClientManager: a manager is already bound. Call clearMcpClientManager first if this is intentional.',
			);
		}
		this.mcpClientManager = manager;
	}

	getMcpClientManager(): MCPClientManager {
		if (this.mcpClientManager === null) {
			throw new Error(
				'AppRuntimeRegistry.getMcpClientManager: no manager is bound. Plugin boot must call setMcpClientManager() before consumers reach it.',
			);
		}
		return this.mcpClientManager;
	}

	tryGetMcpClientManager(): MCPClientManager | null {
		return this.mcpClientManager;
	}

	clearMcpClientManager(): void {
		const manager = this.mcpClientManager;
		this.mcpClientManager = null;
		// stdio child processes must be reaped so a hot-reload does not leak them.
		void manager?.dispose().catch(() => { /* ignore close errors */ });
	}

	// ─── T13: SkillRegistry ───────────────────────────────────────────────

	setSkillRegistry(registry: SkillRegistry): void {
		if (this.skillRegistry !== null) {
			throw new Error(
				'AppRuntimeRegistry.setSkillRegistry: a registry is already bound. Call clearSkillRegistry first if this is intentional.',
			);
		}
		this.skillRegistry = registry;
	}

	getSkillRegistry(): SkillRegistry {
		if (this.skillRegistry === null) {
			throw new Error(
				'AppRuntimeRegistry.getSkillRegistry: no registry is bound. Plugin boot must call setSkillRegistry() before consumers reach it.',
			);
		}
		return this.skillRegistry;
	}

	tryGetSkillRegistry(): SkillRegistry | null {
		return this.skillRegistry;
	}

	clearSkillRegistry(): void {
		const registry = this.skillRegistry;
		this.skillRegistry = null;
		registry?.destroy();
	}

	// ─── T13: CapabilityRegistry ──────────────────────────────────────────

	setCapabilityRegistry(registry: CapabilityRegistry): void {
		if (this.capabilityRegistry !== null) {
			throw new Error(
				'AppRuntimeRegistry.setCapabilityRegistry: a registry is already bound. Call clearCapabilityRegistry first if this is intentional.',
			);
		}
		this.capabilityRegistry = registry;
	}

	getCapabilityRegistry(): CapabilityRegistry {
		if (this.capabilityRegistry === null) {
			throw new Error(
				'AppRuntimeRegistry.getCapabilityRegistry: no registry is bound. Plugin boot must call setCapabilityRegistry() before consumers reach it.',
			);
		}
		return this.capabilityRegistry;
	}

	tryGetCapabilityRegistry(): CapabilityRegistry | null {
		return this.capabilityRegistry;
	}

	clearCapabilityRegistry(): void {
		this.capabilityRegistry = null;
	}

	// ─── B1: CommandGateway ───────────────────────────────────────────────

	setCommandGateway(gateway: CommandGateway): void {
		if (this.commandGateway !== null) {
			throw new Error(
				'AppRuntimeRegistry.setCommandGateway: a gateway is already bound. Call clearCommandGateway first if this is intentional.',
			);
		}
		this.commandGateway = gateway;
	}

	getCommandGateway(): CommandGateway {
		if (this.commandGateway === null) {
			throw new Error(
				'AppRuntimeRegistry.getCommandGateway: no gateway is bound. Plugin boot must call setCommandGateway() before consumers reach it.',
			);
		}
		return this.commandGateway;
	}

	tryGetCommandGateway(): CommandGateway | null {
		return this.commandGateway;
	}

	clearCommandGateway(): void {
		this.commandGateway = null;
	}

	// ─── Peak Command Center ──────────────────────────────────────────────

	setCommandCenterRuntime(runtime: CommandCenterRuntime): void {
		if (this.commandCenterRuntime !== null) {
			throw new Error('AppRuntimeRegistry.setCommandCenterRuntime: a runtime is already bound.');
		}
		this.commandCenterRuntime = runtime;
	}

	getCommandCenterRuntime(): CommandCenterRuntime {
		if (this.commandCenterRuntime === null) {
			throw new Error('AppRuntimeRegistry.getCommandCenterRuntime: no runtime is bound.');
		}
		return this.commandCenterRuntime;
	}

	tryGetCommandCenterRuntime(): CommandCenterRuntime | null {
		return this.commandCenterRuntime;
	}

	clearCommandCenterRuntime(): void {
		this.commandCenterRuntime = null;
	}

	// ─── External Obsidian plugin command gateway ─────────────────────────

	setPluginCommandGatewayRuntime(runtime: PluginCommandGatewayRuntime): void {
		if (this.pluginCommandGatewayRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setPluginCommandGatewayRuntime: a runtime is already bound. Call clearPluginCommandGatewayRuntime first if this is intentional.',
			);
		}
		this.pluginCommandGatewayRuntime = runtime;
	}

	getPluginCommandGatewayRuntime(): PluginCommandGatewayRuntime {
		if (this.pluginCommandGatewayRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getPluginCommandGatewayRuntime: no runtime is bound. Plugin boot must compose it before consumers reach it.',
			);
		}
		return this.pluginCommandGatewayRuntime;
	}

	tryGetPluginCommandGatewayRuntime(): PluginCommandGatewayRuntime | null {
		return this.pluginCommandGatewayRuntime;
	}

	clearPluginCommandGatewayRuntime(): void {
		const runtime = this.pluginCommandGatewayRuntime;
		this.pluginCommandGatewayRuntime = null;
		void runtime?.dispose().catch((error) => {
			console.warn('[PluginCommandGateway] audit drain failed during unload:', error);
		});
	}

	// ─── T13: UsageServices bundle (tracking + outcome + optimization) ────

	setUsageServices(services: UsageServices): void {
		if (this.usageServices !== null) {
			throw new Error(
				'AppRuntimeRegistry.setUsageServices: services are already bound. Call clearUsageServices first if this is intentional.',
			);
		}
		this.usageServices = services;
	}

	getUsageServices(): UsageServices {
		if (this.usageServices === null) {
			throw new Error(
				'AppRuntimeRegistry.getUsageServices: no services are bound. Plugin boot must call setUsageServices() before consumers reach them.',
			);
		}
		return this.usageServices;
	}

	tryGetUsageServices(): UsageServices | null {
		return this.usageServices;
	}

	clearUsageServices(): void {
		const services = this.usageServices;
		this.usageServices = null;
		// Destroy in reverse boot order — optimization depends on nothing,
		// outcome on nothing, tracking has the EventBus listener that MUST
		// detach before a hot reload double-registers it.
		services?.optimization.destroy();
		services?.outcome.destroy();
		services?.tracking.destroy();
	}

	// ── Hub Generation runtime (Curator + Materializer + Executor + Scheduler) ──

	setHubGenerationRuntime(runtime: HubGenerationRuntime, scheduler: HubCurationScheduler): void {
		if (this.hubGenerationRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setHubGenerationRuntime: a runtime is already bound. Call clearHubGenerationRuntime first if this is intentional.',
			);
		}
		this.hubGenerationRuntime = runtime;
		this.hubCurationScheduler = scheduler;
	}

	getHubGenerationRuntime(): HubGenerationRuntime {
		if (this.hubGenerationRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getHubGenerationRuntime: no runtime is bound. Plugin boot must call setHubGenerationRuntime() before consumers reach the runtime.',
			);
		}
		return this.hubGenerationRuntime;
	}

	tryGetHubGenerationRuntime(): HubGenerationRuntime | null {
		return this.hubGenerationRuntime;
	}

	tryGetHubCurationScheduler(): HubCurationScheduler | null {
		return this.hubCurationScheduler;
	}

	clearHubGenerationRuntime(): void {
		const scheduler = this.hubCurationScheduler;
		this.hubGenerationRuntime = null;
		this.hubCurationScheduler = null;
		scheduler?.dispose();
	}

	// ── Debug Trace port ─────────────────────────────────────────────────

	setDebugTracePort(port: DebugTracePort): void {
		if (this.debugTracePort !== null) {
			throw new Error(
				'AppRuntimeRegistry.setDebugTracePort: a port is already bound. Call clearDebugTracePort first if this is intentional.',
			);
		}
		this.debugTracePort = port;
	}

	getDebugTracePort(): DebugTracePort {
		if (this.debugTracePort === null) {
			throw new Error(
				'AppRuntimeRegistry.getDebugTracePort: no port is bound. Plugin boot must call setDebugTracePort() before consumers reach it.',
			);
		}
		return this.debugTracePort;
	}

	tryGetDebugTracePort(): DebugTracePort | null {
		return this.debugTracePort;
	}

	clearDebugTracePort(): void {
		this.debugTracePort = null;
	}

	// ── Peak Composer runtime (WP1: host + source model) ─────────────────────

	/**
	 * Bind the app-owned Document Composer runtime. Composed once at plugin
	 * boot from `composeDocumentComposerRuntime`. Double-bind without an
	 * intervening clear throws — typically a hot-reload artifact.
	 */
	setDocumentComposerRuntime(runtime: DocumentComposerRuntime): void {
		if (this.documentComposerRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setDocumentComposerRuntime: a runtime is already bound. Call clearDocumentComposerRuntime first if this is intentional.',
			);
		}
		this.documentComposerRuntime = runtime;
	}

	getDocumentComposerRuntime(): DocumentComposerRuntime {
		if (this.documentComposerRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getDocumentComposerRuntime: no runtime is bound. Plugin boot must call setDocumentComposerRuntime() before consumers reach the runtime.',
			);
		}
		return this.documentComposerRuntime;
	}

	/**
	 * Soft accessor returning `null` when the runtime is not yet bound. The
	 * DocumentComposerView may be restored on startup before boot binds the
	 * runtime; it handles the null case by showing an empty host.
	 */
	tryGetDocumentComposerRuntime(): DocumentComposerRuntime | null {
		return this.documentComposerRuntime;
	}

	/** Dispose + drop the runtime (detaches the shared vault listeners). Idempotent. */
	clearDocumentComposerRuntime(): void {
		const runtime = this.documentComposerRuntime;
		this.documentComposerRuntime = null;
		runtime?.dispose();
	}

	// ── AI Graph artifact runtime ──────────────────────────────────────────

	setAIGraphArtifactRuntime(runtime: AIGraphArtifactRuntime): void {
		if (this.aiGraphArtifactRuntime !== null) {
			throw new Error('AppRuntimeRegistry.setAIGraphArtifactRuntime: a runtime is already bound.');
		}
		this.aiGraphArtifactRuntime = runtime;
	}

	getAIGraphArtifactRuntime(): AIGraphArtifactRuntime {
		if (this.aiGraphArtifactRuntime === null) {
			throw new Error('AppRuntimeRegistry.getAIGraphArtifactRuntime: no runtime is bound.');
		}
		return this.aiGraphArtifactRuntime;
	}

	tryGetAIGraphArtifactRuntime(): AIGraphArtifactRuntime | null {
		return this.aiGraphArtifactRuntime;
	}

	clearAIGraphArtifactRuntime(): void {
		this.aiGraphArtifactRuntime = null;
	}

}
