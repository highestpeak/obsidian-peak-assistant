// T12 Command Gateway — Obsidian command → Capability dispatch.
//
// The Obsidian plugin registers a handful of *commands* (`Cmd+P → Peak:
// …`) at boot. Each command today invokes ad-hoc service code. T12
// promotes commands to first-class citizens of the capability graph:
// every user-invoked command has a matching CapabilityManifest, and the
// gateway is the single entry-point that turns a command id into a
// full RunEnvelope-tracked `runCapability` invocation.
//
// Why a gateway and not "just register the capability"?
//
//   - The Obsidian side needs a *command id* (short string) and a
//     callback with no arguments. Capabilities need input + backend
//     policy + compiled skill. The gateway is the adapter between the
//     two vocabularies.
//   - Registering a command in Obsidian is a side effect that must
//     happen inside the app-shell (`main.ts`). But *deciding what a
//     command does* — capability id, input factory, trigger tag — is a
//     service-layer concern. The gateway keeps the mapping in service/
//     so tests can exercise it without a live Obsidian instance.
//   - Same gateway can be re-used by other trigger sources (URI schemes,
//     MCP `propose_*` calls) without duplicating the command→capability
//     mapping table.
//
// Boundary discipline:
//   - No `@/app/*`, `@/ui/*`, `obsidian` imports here. The gateway is a
//     pure service-layer dispatcher.
//   - The `register(...)` API accepts a plain object (`GatewayBinding`)
//     so the composition site can populate it from any source
//     (hard-coded table, settings file, marketplace catalog).

import type { CapabilityManifest } from '@/core/types/capability';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import type { RunTrigger } from '@/service/run-envelope';
import type {
	CapabilityExecutionOutput,
	CapabilityRunContext,
	CapabilityRunResult,
} from './CapabilityRunner';
import { runCapability } from './CapabilityRunner';

/**
 * One command → capability mapping. Composition site provides
 * `manifest`, `compiledSkill`, and `execute`; gateway wires them into
 * `runCapability` when the command fires.
 */
export interface GatewayBinding<TInput = unknown, TResult = unknown> {
	/** Stable Obsidian command id (e.g. `'peak.vault-lint'`). */
	readonly commandId: string;
	/** Human-readable label — passed straight through to Obsidian. */
	readonly commandLabel: string;
	readonly manifest: CapabilityManifest;
	readonly compiledSkill: CompiledSkill;
	/**
	 * Backend dispatcher for this command. Typically synthesized via
	 * `composeExecuteFromPolicy(manifest, backendRegistry)`.
	 */
	readonly execute: (input: TInput, ctx: CapabilityRunContext) => Promise<CapabilityExecutionOutput<TResult>>;
	/**
	 * Produces the input value at command-fire time. Optional — commands
	 * that take no input can omit this and the gateway passes `undefined`.
	 */
	readonly buildInput?: () => TInput | Promise<TInput>;
	/** Defaults to `'manual'` (user-initiated). */
	readonly trigger?: RunTrigger;
}

/**
 * Dispatch outcome. Wraps the underlying `CapabilityRunResult` so
 * callers can attribute failures to the command (not just the run).
 */
export interface CommandDispatchResult<TResult = unknown> {
	readonly commandId: string;
	readonly result: CapabilityRunResult<TResult>;
}

/**
 * Gateway. Additive seam. Composition site instantiates once and
 * populates via `register()`; command handlers call `dispatch()`.
 */
export class CommandGateway {
	private readonly bindings = new Map<string, GatewayBinding>();

	register(binding: GatewayBinding): void {
		if (this.bindings.has(binding.commandId)) {
			throw new Error(
				`CommandGateway: command id '${binding.commandId}' is already registered. Duplicate registration is a bug — either unregister first or reuse the existing binding.`,
			);
		}
		this.bindings.set(binding.commandId, binding);
	}

	unregister(commandId: string): void {
		this.bindings.delete(commandId);
	}

	has(commandId: string): boolean {
		return this.bindings.has(commandId);
	}

	get(commandId: string): GatewayBinding | undefined {
		return this.bindings.get(commandId);
	}

	all(): GatewayBinding[] {
		return Array.from(this.bindings.values());
	}

	/**
	 * Fire a command. Returns the CapabilityRunResult wrapped with the
	 * command id. Throws when the command is not registered — silent
	 * no-op would mask a config bug.
	 */
	async dispatch<TResult = unknown>(commandId: string): Promise<CommandDispatchResult<TResult>> {
		const binding = this.bindings.get(commandId);
		if (binding === undefined) {
			throw new Error(`CommandGateway: no binding for command '${commandId}'.`);
		}
		const input = binding.buildInput ? await binding.buildInput() : undefined;
		const result = await runCapability<unknown, TResult>({
			manifest: binding.manifest,
			compiledSkill: binding.compiledSkill,
			execute: binding.execute as (i: unknown, c: CapabilityRunContext) => Promise<CapabilityExecutionOutput<TResult>>,
			input,
			trigger: binding.trigger ?? 'manual',
		});
		return { commandId, result };
	}
}
