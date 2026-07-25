/**
 * Peak Composer — shared WP2 test fakes.
 *
 * An in-memory vault that implements BOTH the source and write ports, so the
 * transaction engine/hub can be exercised end-to-end (commit → persist →
 * reparse → History → Undo) without Obsidian. `external()` simulates an
 * out-of-band edit that bypasses the hub, so revision-conflict paths are
 * testable.
 */

import {
	ComposerDocumentSession,
	ComposerTransactionEngine,
	ComposerTransactionHub,
	type ComposerSourcePort,
	type ComposerWritePort,
} from '@/service/composer';
import { ComposerConflictError, type ComposerTransactionConfig } from '@/core/composer';

export class FakeVault implements ComposerSourcePort, ComposerWritePort {
	readonly files = new Map<string, string>();
	/** How many writes actually hit "disk" (to assert nothing-persisted paths). */
	writeCount = 0;

	set(path: string, text: string): void {
		this.files.set(path, text);
	}

	/** Simulate an external edit that did NOT go through the hub. */
	external(path: string, text: string): void {
		this.files.set(path, text);
	}

	read(path: string): string {
		return this.files.get(path) ?? '';
	}

	async readSource(filePath: string): Promise<string> {
		const content = this.files.get(filePath);
		if (content === undefined) throw new Error(`missing: ${filePath}`);
		return content;
	}

	async writeSource(filePath: string, nextText: string, expectedBaseText: string): Promise<void> {
		const current = this.files.get(filePath) ?? '';
		if (current !== expectedBaseText) {
			throw new ComposerConflictError('revision-mismatch', `write conflict on ${filePath}`);
		}
		this.files.set(filePath, nextText);
		this.writeCount += 1;
	}
}

/** Seed the vault and open a session over `text`. */
export function openSession(vault: FakeVault, path: string, text: string): ComposerDocumentSession {
	vault.set(path, text);
	return ComposerDocumentSession.fromSource(path, text);
}

/** Build a hub whose engine writes through `vault`. */
export function makeHub(
	vault: FakeVault,
	session: ComposerDocumentSession,
	config?: ComposerTransactionConfig,
): ComposerTransactionHub {
	const engine = new ComposerTransactionEngine(vault, vault);
	return new ComposerTransactionHub(session, { engine, config });
}

/** Minimal check harness shared by the WP2 tests. */
export function makeChecker() {
	let count = 0;
	let failures = 0;
	function check(name: string, cond: boolean, detail = ''): void {
		count += 1;
		if (cond) return;
		failures += 1;
		console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
	}
	function done(label: string): void {
		console.log(`${label}: ${count - failures}/${count} checks passed`);
		if (failures > 0) throw new Error(`${failures} check(s) failed`);
	}
	return { check, done };
}

/** Find the first block of a given kind in a session's snapshot. */
export function blockOfKind(session: ComposerDocumentSession, kind: string) {
	const block = session.snapshot.blocks.find((b) => b.kind === kind);
	if (!block) throw new Error(`no ${kind} block in fixture`);
	return block;
}
