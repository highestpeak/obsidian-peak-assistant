/**
 * Event-bus raw-string drift guard.
 *
 * Ensures callers use ViewEventType enum values instead of inline
 * 'peak:...' string literals for workspace.on / workspace.trigger /
 * EventBus.on / EventBus.trigger calls.
 *
 * The EventBus class itself (src/core/eventBus.ts) is excluded from
 * this check — it is the canonical definition of the enum values.
 *
 * If this test fails, find the offending file, import ViewEventType from
 * '@/core/eventBus', and replace the raw string with the enum member.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

// The canonical definition file — raw strings here are expected.
const EVENT_BUS_DEF = join(SRC, 'core', 'eventBus.ts');

const SCAN_EXTS = new Set(['.ts', '.tsx']);

function walk(dir: string, acc: string[] = []): string[] {
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		if (ent.name.startsWith('.')) continue;
		const full = join(dir, ent.name);
		if (ent.isDirectory()) {
			walk(full, acc);
		} else if (ent.isFile()) {
			const ext = full.slice(full.lastIndexOf('.'));
			if (SCAN_EXTS.has(ext)) acc.push(full);
		}
	}
	return acc;
}

/**
 * Patterns that indicate a raw 'peak:...' string being passed to an
 * event-bus call (workspace or EventBus). We match:
 *   workspace.on('peak:
 *   workspace.trigger('peak:
 *   EventBus.on('peak:          (static call, unlikely but guard anyway)
 *   eventBus.on('peak:          (instance call)
 *   eventBus.trigger('peak:     (instance call via dispatch takes objects; guard anyway)
 *
 * Single or double quote variants are both matched via a character class.
 */
const RAW_PEAK_PATTERNS = [
	/workspace\.on\(['"]peak:/,
	/workspace\.trigger\(['"]peak:/,
	/[Ee]vent[Bb]us\.on\(['"]peak:/,
	/[Ee]vent[Bb]us\.trigger\(['"]peak:/,
];

interface Violation {
	file: string;
	line: number;
	text: string;
	pattern: string;
}

function scanFile(filePath: string): Violation[] {
	const text = readFileSync(filePath, 'utf8');
	const lines = text.split('\n');
	const violations: Violation[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Skip comment-only lines so documentation examples don't trip the guard.
		const trimmed = line.trimStart();
		if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

		for (const pattern of RAW_PEAK_PATTERNS) {
			if (pattern.test(line)) {
				violations.push({
					file: filePath,
					line: i + 1,
					text: line.trim(),
					pattern: pattern.source,
				});
			}
		}
	}

	return violations;
}

const allFiles = walk(SRC).filter((f) => f !== EVENT_BUS_DEF);
const allViolations: Violation[] = [];

for (const file of allFiles) {
	allViolations.push(...scanFile(file));
}

if (allViolations.length > 0) {
	const report = allViolations
		.map((v) => `  ${v.file}:${v.line}\n    > ${v.text}\n    pattern: ${v.pattern}`)
		.join('\n\n');
	throw new Error(
		`[event-bus-no-raw-string] Found ${allViolations.length} raw 'peak:' event string(s) in callers.\n` +
		`Import ViewEventType from '@/core/eventBus' and use the enum member instead.\n\n` +
		report,
	);
}

console.log(`[event-bus-no-raw-string] ✓ No raw 'peak:' event strings in ${allFiles.length} scanned files.`);
