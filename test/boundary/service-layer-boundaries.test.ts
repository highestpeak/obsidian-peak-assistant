/**
 * Wave 1.A — T0 Boundary Baseline
 *
 * Repo-wide service-layer boundary guard. Scans every `.ts` / `.tsx` file
 * under `src/service/**` for three architectural violations and compares the
 * result against the locked baseline in `service-layer-baseline.json`.
 *
 * Rules enforced:
 *   A) No `import ... from 'obsidian'` or `from 'obsidian/*'` in src/service/
 *      (type-only imports included).
 *   B) No live `AppContext.getInstance()` call in src/service/ (comments and
 *      string literals are stripped before the check to reduce false positives).
 *   C) No `from '@/ui/...'` or `from '@/app/...'` import in src/service/
 *      (layering direction check — service must not import from app or ui).
 *
 * Failure modes:
 *   - NEW violation (file in current scan but not in baseline) → test fails.
 *   - FIXED violation (file in baseline but not in current scan) → print a
 *     "consider tightening baseline" note, do NOT fail. Remove it in a
 *     follow-up PR after confirming the fix is intentional.
 *
 * Escape hatch:
 *   If a violation is genuinely intentional, add a line to the violating file:
 *     // boundary-allow: <rule-id> <reason>
 *   and update the baseline JSON to include the file path. This makes the
 *   allowance explicit and reviewable. See test/boundary/README.md.
 *
 * Does NOT replace the existing feature-specific source guards
 * (ambient-source-guard.test.ts, copilot-action-runtime-source-guard.test.ts,
 * etc.). Those stay; this is a complement at repo-wide scope.
 */

import fs from 'fs';
import path from 'path';

// ── paths ────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const SERVICE_ROOT = path.join(ROOT, 'src', 'service');
const BASELINE_FILE = path.join(ROOT, 'test', 'boundary', 'service-layer-baseline.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function walkTypeScriptFiles(dir: string): string[] {
	const out: string[] = [];
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walkTypeScriptFiles(full));
		} else if (
			entry.isFile() &&
			(full.endsWith('.ts') || full.endsWith('.tsx'))
		) {
			out.push(full);
		}
	}
	return out;
}

/** Strip block and line comments. */
function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
}

/**
 * Strip string literals from already-comment-stripped code.
 * This prevents false positives when `AppContext.getInstance()` appears inside
 * a string value (e.g., documentation data objects in VaultLintContract.ts).
 */
function stripStringLiterals(code: string): string {
	// Template literals (simplified — no nested expression handling needed
	// for the identifier-level pattern matching we do below)
	code = code.replace(/`[^`]*`/g, '""');
	// Double-quoted strings (handles common escape sequences)
	code = code.replace(/"(?:[^"\\]|\\.)*"/g, '""');
	// Single-quoted strings (handles common escape sequences)
	code = code.replace(/'(?:[^'\\]|\\.)*'/g, "''");
	return code;
}

/**
 * Extract all static import specifiers from comment-stripped source.
 * Covers: `import X from 'y'`, `import type X from 'y'`, `import 'y'`.
 */
function extractImportSpecifiers(code: string): string[] {
	const out: string[] = [];
	// Standard imports: import ... from 'specifier'
	const staticRe = /\bimport\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = staticRe.exec(code)) !== null) out.push(m[1]!);
	// Side-effect imports: import 'specifier'
	const sideRe = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
	while ((m = sideRe.exec(code)) !== null) out.push(m[1]!);
	return out;
}

/**
 * True if the file contains a `// boundary-allow: <ruleId>` line.
 * Allows a legitimate exception to be documented in-source.
 */
function hasInlineAllow(source: string, ruleId: 'ruleA' | 'ruleB' | 'ruleC'): boolean {
	const re = new RegExp(`//\\s*boundary-allow:\\s*${ruleId}\\b`);
	return re.test(source);
}

// ── rule scanners ────────────────────────────────────────────────────────────

interface ScanResult {
	ruleA: string[];
	ruleB: string[];
	ruleC: string[];
}

function scanServiceLayer(): ScanResult {
	const files = walkTypeScriptFiles(SERVICE_ROOT).sort();
	const ruleA: string[] = [];
	const ruleB: string[] = [];
	const ruleC: string[] = [];

	for (const absPath of files) {
		const source = fs.readFileSync(absPath, 'utf8');
		const relPath = path.relative(ROOT, absPath).replace(/\\/g, '/');

		// ── prepare code variants ──────────────────────────────────────────
		const codeNoComments = stripComments(source);
		const codeNoCommentsNoStrings = stripStringLiterals(codeNoComments);
		const specifiers = extractImportSpecifiers(codeNoComments);

		// ── Rule A: no obsidian imports ────────────────────────────────────
		if (!hasInlineAllow(source, 'ruleA')) {
			for (const spec of specifiers) {
				if (spec === 'obsidian' || spec.startsWith('obsidian/')) {
					ruleA.push(relPath);
					break;
				}
			}
		}

		// ── Rule B: no AppContext.getInstance() in live code ───────────────
		if (!hasInlineAllow(source, 'ruleB')) {
			if (/AppContext\s*\.\s*getInstance\s*\(/.test(codeNoCommentsNoStrings)) {
				ruleB.push(relPath);
			}
		}

		// ── Rule C: no @/app/ or @/ui/ imports ────────────────────────────
		if (!hasInlineAllow(source, 'ruleC')) {
			for (const spec of specifiers) {
				if (spec.startsWith('@/app/') || spec.startsWith('@/ui/')) {
					ruleC.push(relPath);
					break;
				}
			}
		}
	}

	return {
		ruleA: ruleA.sort(),
		ruleB: ruleB.sort(),
		ruleC: ruleC.sort(),
	};
}

// ── baseline loading / validation ────────────────────────────────────────────

interface Baseline {
	_comment?: string;
	ruleA: string[];
	ruleB: string[];
	ruleC: string[];
}

function loadBaseline(): Baseline {
	const raw = fs.readFileSync(BASELINE_FILE, 'utf8');
	const parsed = JSON.parse(raw) as Baseline;
	return {
		ruleA: (parsed.ruleA ?? []).sort(),
		ruleB: (parsed.ruleB ?? []).sort(),
		ruleC: (parsed.ruleC ?? []).sort(),
	};
}

// ── tests ────────────────────────────────────────────────────────────────────

function testServiceDirectoryIsNonEmpty(): void {
	const files = walkTypeScriptFiles(SERVICE_ROOT);
	if (files.length < 20) {
		throw new Error(
			`Expected src/service/ to contain at least 20 .ts/.tsx files, found ${files.length}. ` +
			`Check SERVICE_ROOT path: ${SERVICE_ROOT}`,
		);
	}
	console.log(`PASS: serviceDirectoryIsNonEmpty (${files.length} files scanned)`);
}

function testBaselineFileExists(): void {
	if (!fs.existsSync(BASELINE_FILE)) {
		throw new Error(
			`Baseline file missing: ${BASELINE_FILE}\n` +
			`Run the scanner once with --update-baseline to generate it.`,
		);
	}
	const baseline = loadBaseline();
	console.log(
		`PASS: baselineFileExists ` +
		`(A:${baseline.ruleA.length} B:${baseline.ruleB.length} C:${baseline.ruleC.length})`,
	);
}

/**
 * Core comparison test: for each rule, current must be a subset of baseline.
 * Any file that appears in current but not in baseline is a NEW violation → fail.
 * Any file in baseline but not in current is a FIXED violation → note, don't fail.
 */
function testNoNewViolationsVsBaseline(): void {
	const baseline = loadBaseline();
	const current = scanServiceLayer();

	const rules: Array<{ id: 'ruleA' | 'ruleB' | 'ruleC'; label: string; description: string }> = [
		{
			id: 'ruleA',
			label: 'Rule A',
			description: "no `import ... from 'obsidian'` or `from 'obsidian/*'` in src/service/",
		},
		{
			id: 'ruleB',
			label: 'Rule B',
			description: 'no live `AppContext.getInstance()` call in src/service/',
		},
		{
			id: 'ruleC',
			label: 'Rule C',
			description: "no `from '@/app/...'` or `from '@/ui/...'` import in src/service/",
		},
	];

	const newViolations: string[] = [];
	const fixedViolations: string[] = [];

	for (const rule of rules) {
		const baselineSet = new Set(baseline[rule.id]);
		const currentSet = new Set(current[rule.id]);

		// New violations: in current scan but not in baseline
		const newInCurrent = current[rule.id].filter((f) => !baselineSet.has(f));
		for (const f of newInCurrent) {
			newViolations.push(
				`  [${rule.label}] NEW violation: ${f}\n` +
				`    Rule: ${rule.description}\n` +
				`    Fix: remove the import, or add \`// boundary-allow: ${rule.id} <reason>\`\n` +
				`    to the file and update test/boundary/service-layer-baseline.json.`,
			);
		}

		// Fixed violations: in baseline but not in current
		const fixedFromBaseline = baseline[rule.id].filter((f) => !currentSet.has(f));
		for (const f of fixedFromBaseline) {
			fixedViolations.push(
				`  [${rule.label}] FIXED: ${f} — remove from baseline JSON to tighten the lock.`,
			);
		}
	}

	if (fixedViolations.length > 0) {
		console.log('\nNOTE — Consider tightening the baseline (violations that were fixed):');
		for (const note of fixedViolations) console.log(note);
		console.log(
			'  → Update test/boundary/service-layer-baseline.json to shrink these entries.\n',
		);
	}

	if (newViolations.length > 0) {
		throw new Error(
			`New boundary violations detected (not in baseline):\n${newViolations.join('\n')}\n\n` +
			`See test/boundary/README.md for how to handle violations.`,
		);
	}

	const totalCurrent = current.ruleA.length + current.ruleB.length + current.ruleC.length;
	const totalBaseline =
		baseline.ruleA.length + baseline.ruleB.length + baseline.ruleC.length;
	console.log(
		`PASS: noNewViolationsVsBaseline ` +
		`(A:${current.ruleA.length}/${baseline.ruleA.length} ` +
		`B:${current.ruleB.length}/${baseline.ruleB.length} ` +
		`C:${current.ruleC.length}/${baseline.ruleC.length} ` +
		`total current:${totalCurrent} baseline:${totalBaseline})`,
	);
}

// ── main ─────────────────────────────────────────────────────────────────────

function main(): void {
	testServiceDirectoryIsNonEmpty();
	testBaselineFileExists();
	testNoNewViolationsVsBaseline();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
}
