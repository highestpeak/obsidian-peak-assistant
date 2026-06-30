/**
 * T11Y-6 audit: catch regressions where someone inlines a fresh LLM prompt as a
 * string literal in src/ instead of registering a template under
 * templates/prompts/.
 *
 * The scan is intentionally conservative — it looks at file content for a
 * small, very prompt-shaped set of phrases that almost never appear in
 * non-prompt code. False positives are handled by an explicit ALLOWLIST below;
 * keep the list short and documented.
 *
 * Run via: npm run test -- test/no-inline-llm-prompts.test.ts
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = process.cwd();
const SRC_DIR = path.join(REPO_ROOT, 'src');

/** Files we never scan — these *are* the prompt registry, so prompt-shaped
 *  strings in them are by design (jsonConstraint metadata, doc comments, etc.). */
const SCAN_SKIP_FILES = new Set<string>([
	'src/core/types/prompt.ts',
	'src/core/template/TemplateRegistry.ts',
]);

/** Known-good occurrences. Each entry is a {file, snippet} pair; the snippet
 *  is a verbatim substring of the file content and must remain unique to
 *  qualify as an allowlist match. */
interface AllowEntry {
	file: string;
	snippet: string;
	reason: string;
}

const ALLOWLIST: AllowEntry[] = [
	// Currently empty — every "You are ..." / "Return only ..." style string in
	// src/ now lives in templates/prompts/. If you find a legitimate non-prompt
	// match in the future (e.g. a UI status line that happens to start with
	// "You are over budget"), add it here with a one-line reason.
];

/** Patterns we treat as prompt-shaped. Each is a regex tested against the file
 *  content; we record matches together with the file path. */
const PROMPT_SHAPED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
	// Quoted string starting with "You are " — classic system prompt opener.
	{ pattern: /(['"`])You are [A-Z]/g, label: 'string starting with "You are <Capitalized>"' },
	// "Your task is " inside a quoted string.
	{ pattern: /(['"`])Your task is /g, label: 'string starting with "Your task is "' },
	// "Return only " — common LLM output-contract phrase.
	{ pattern: /(['"`])Return only /g, label: 'string starting with "Return only "' },
	// "You must respond" — output-contract phrase.
	{ pattern: /(['"`])You must respond/g, label: 'string starting with "You must respond"' },
];

/** Recursively walk SRC_DIR and yield .ts / .tsx file paths. */
function* walkSrc(dir: string): Generator<string> {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walkSrc(full);
			continue;
		}
		if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
			yield full;
		}
	}
}

function relFromRepo(abs: string): string {
	return path.relative(REPO_ROOT, abs).replace(/\\/g, '/');
}

function isAllowlisted(file: string, snippet: string): boolean {
	return ALLOWLIST.some(entry => entry.file === file && snippet.includes(entry.snippet));
}

interface Violation {
	file: string;
	label: string;
	matchedText: string;
}

const violations: Violation[] = [];

for (const abs of walkSrc(SRC_DIR)) {
	const rel = relFromRepo(abs);
	if (SCAN_SKIP_FILES.has(rel)) continue;
	const content = fs.readFileSync(abs, 'utf8');
	for (const { pattern, label } of PROMPT_SHAPED_PATTERNS) {
		// Reset lastIndex because the regex is /g
		pattern.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = pattern.exec(content)) !== null) {
			// Pull a small surrounding window so the allowlist can match a
			// readable snippet, not just the regex group.
			const start = Math.max(0, m.index);
			const end = Math.min(content.length, m.index + 80);
			const matchedText = content.slice(start, end);
			if (isAllowlisted(rel, matchedText)) continue;
			violations.push({ file: rel, label, matchedText });
		}
	}
}

if (violations.length > 0) {
	const formatted = violations
		.map(v => `  - [${v.label}] ${v.file}\n      "${v.matchedText.replace(/\n/g, '\\n')}"`)
		.join('\n');
	assert.fail(
		`Found ${violations.length} inline LLM prompt(s) in src/. Move each prompt body to templates/prompts/<slug>.md and route through TemplateManager.render(PromptId.X, vars). If a match is intentionally not a prompt, add it to the ALLOWLIST in this test with a one-line reason.\n${formatted}`,
	);
}

console.log(
	`PASS: scanned src/ for inline LLM prompts (${ALLOWLIST.length} allowlisted exception(s)); no new occurrences.`,
);
