// T5 ToolDef Envelope — obsidian-command source adapter.
//
// Third member of the T5 origin discriminator triplet:
//   - 'local'            — in-tree agent tool (existing wrapper).
//   - 'mcp'              — `mcpToolToToolDef` (already landed).
//   - 'obsidian-command' — this file.
//
// The gap this closes: the Command Gateway (T12) exposes Obsidian
// commands as capabilities. Some flows want to invoke them from the
// *inside* of an agent loop as tools (Skills library MCP-style, where
// "run vault:open-file" is a tool call, not a capability). This adapter
// gives the harness a uniform `ToolDef` for that path without importing
// `obsidian` in service code.
//
// Boundary discipline:
//   - No `obsidian` import here. The Obsidian side is decoupled via a
//     `CommandInvoker` interface — the app-shell (`main.ts`) supplies a
//     `{ executeCommandById(id) => app.commands.executeCommandById(id) }`
//     adapter that this module never sees.
//   - No mutation of the Obsidian command surface. Adapter is pure
//     wrap-in / call-out.

import { z } from 'zod';
import type { ToolDef, ToolExecCtx } from '@/core/types/tool';
import { fail, ok } from '@/core/types/tool';

/**
 * Structural mirror of the fields we care about on `obsidian.Command`.
 * Kept local so we don't import Obsidian types in service code.
 */
export interface ObsidianCommandLike {
	readonly id: string;
	readonly name?: string;
	readonly icon?: string;
	readonly hotkeys?: unknown;
}

/**
 * Invoker abstraction — app-shell hands one of these to the adapter at
 * composition time so this module has zero coupling to Obsidian.
 */
export interface CommandInvoker {
	/** True when the command was found and invoked. */
	executeCommandById(id: string): boolean | Promise<boolean>;
}

/**
 * Options for a single adapter conversion. All optional.
 */
export interface ObsidianCommandToolOptions {
	/** Prefix for the ToolDef `name`. Default `'obsidian_'`. */
	readonly toolNamePrefix?: string;
	/** Override tool description; default is the command's Obsidian name. */
	readonly description?: string;
	/**
	 * Permission classification for the harness PermissionGuard.
	 * Default `'edit'` because Obsidian commands frequently mutate vault
	 * state (rename, open, insert, run linter…). Callers that know a
	 * specific command is read-only can pin to `'read'`.
	 */
	readonly kind?: ToolDef['kind'];
}

/** Sanitize a command id into a valid tool name (allowed chars only). */
function sanitize(id: string): string {
	return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * Wrap a single Obsidian command as a `ToolDef` with
 * `source: 'obsidian-command'`. Input schema is empty (`z.object({})`);
 * Obsidian commands don't take arguments — they trigger by id.
 */
export function obsidianCommandToToolDef(
	cmd: ObsidianCommandLike,
	invoker: CommandInvoker,
	opts?: ObsidianCommandToolOptions,
): ToolDef<Record<string, never>, { invoked: boolean; commandId: string }> {
	const prefix = opts?.toolNamePrefix ?? 'obsidian_';
	const toolName = `${prefix}${sanitize(cmd.id)}`;
	const description = opts?.description ?? cmd.name ?? `Obsidian command ${cmd.id}`;
	const kind = opts?.kind ?? 'edit';

	return {
		name: toolName,
		description,
		inputSchema: z.object({}),
		source: 'obsidian-command',
		kind,
		async execute(_args: Record<string, never>, _ctx: ToolExecCtx) {
			try {
				const invoked = await invoker.executeCommandById(cmd.id);
				if (invoked === false) {
					return fail(`${toolName}: Obsidian command '${cmd.id}' not found or refused to run`, true);
				}
				return ok({ invoked: true, commandId: cmd.id });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return fail(`${toolName}: ${msg}`, true);
			}
		},
	};
}

/**
 * Convert a list of Obsidian commands. Convenience mirror of
 * `getAllMcpToolDefs` — same shape, same behavior.
 */
export function obsidianCommandsToToolDefs(
	commands: readonly ObsidianCommandLike[],
	invoker: CommandInvoker,
	opts?: ObsidianCommandToolOptions,
): ToolDef[] {
	return commands.map((c) => obsidianCommandToToolDef(c, invoker, opts) as ToolDef);
}
