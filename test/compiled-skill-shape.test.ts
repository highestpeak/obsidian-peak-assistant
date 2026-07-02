// T6 Skill v2 — CompiledSkill shape guard.
//
// Locks two invariants:
//   1. `CompiledSkill` in src/core/types/compiled-skill.ts declares all
//      four required fields as readonly.
//   2. The type file lives in core/ and MUST NOT import from service/*,
//      app/*, ui/*, or Obsidian — layering direction.
//
// Also exercises `SkillRegistry.compile()` end-to-end:
//   - unknown id returns null
//   - whitelisted skill compiles to `strict` quarantine
//   - skill without a whitelist compiles to `permissive`
//   - allowedTools flattens builtin + mcp in that order

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { SkillRegistry } from '@/service/skills/SkillRegistry';
import type { SkillDefinition } from '@/service/skills/types';
import type { CompiledSkill } from '@/core/types/compiled-skill';

const TYPE_PATH = path.resolve(
	process.cwd(),
	'src/core/types/compiled-skill.ts',
);
const typeSource = fs.readFileSync(TYPE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Rule 1 — every declared field is readonly and present.
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['skillId', 'allowedTools', 'systemPrompt', 'quarantine'] as const;

function testTypeHasAllFields(): void {
	for (const field of REQUIRED_FIELDS) {
		const re = new RegExp(`readonly\\s+${field}\\b`);
		assert.ok(
			re.test(typeSource),
			`CompiledSkill field '${field}' missing / not readonly in src/core/types/compiled-skill.ts`,
		);
	}
	console.log(`PASS: typeHasAllFields (${REQUIRED_FIELDS.length} fields)`);
}

// ---------------------------------------------------------------------------
// Rule 2 — layering: no service/app/ui/obsidian imports.
// ---------------------------------------------------------------------------

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	return out;
}

function testTypeSourceLayering(): void {
	const forbidden: Array<{ pattern: RegExp; reason: string }> = [
		{ pattern: /^obsidian(\/.*)?$/, reason: 'core/types must not import Obsidian' },
		{ pattern: /^@\/service\//, reason: 'core/types must not depend on service/*' },
		{ pattern: /^@\/app\//, reason: 'core/types must not depend on app/*' },
		{ pattern: /^@\/ui\//, reason: 'core/types must not depend on ui/*' },
	];
	const specifiers = extractImportSpecifiers(typeSource);
	for (const spec of specifiers) {
		for (const { pattern, reason } of forbidden) {
			if (pattern.test(spec)) {
				assert.fail(`forbidden import '${spec}' in compiled-skill.ts: ${reason}`);
			}
		}
	}
	console.log(`PASS: typeSourceLayering (${specifiers.length} import(s) checked)`);
}

// ---------------------------------------------------------------------------
// Runtime — SkillRegistry.compile end-to-end.
// ---------------------------------------------------------------------------

function seedRegistry(defs: SkillDefinition[]): SkillRegistry {
	const registry = new SkillRegistry();
	// The registry only exposes internal state through selectors; we
	// use the parser output shape by writing directly into the private
	// map via a permissive cast. This mirrors how tests for the sibling
	// `capability-registry` and `harness-tool-registry` seed their state.
	const anyRegistry = registry as unknown as { skills: Map<string, SkillDefinition> };
	for (const def of defs) anyRegistry.skills.set(def.id, def);
	return registry;
}

function makeDef(overrides: Partial<SkillDefinition>): SkillDefinition {
	return {
		id: 'test-skill',
		name: 'Test Skill',
		version: '0.0.1',
		author: 'test',
		description: 'test',
		tags: [],
		license: 'free',
		type: 'simple',
		systemPrompt: 'Do the thing.',
		source: 'builtin',
		...overrides,
	};
}

function testUnknownIdReturnsNull(): void {
	const registry = seedRegistry([]);
	assert.strictEqual(registry.compile('missing'), null);
	console.log('PASS: unknownIdReturnsNull');
}

function testWhitelistedCompilesToStrict(): void {
	const registry = seedRegistry([
		makeDef({
			id: 'strict-skill',
			tools: { builtin: ['search', 'grep'], mcp: ['mcp_octo_get_issue'] },
		}),
	]);
	const compiled = registry.compile('strict-skill') as CompiledSkill;
	assert.ok(compiled !== null, 'expected non-null');
	assert.strictEqual(compiled.skillId, 'strict-skill');
	assert.strictEqual(compiled.quarantine, 'strict');
	assert.deepStrictEqual(
		[...compiled.allowedTools],
		['search', 'grep', 'mcp_octo_get_issue'],
		'allowedTools must flatten builtin then mcp in order',
	);
	console.log('PASS: whitelistedCompilesToStrict');
}

function testWithoutWhitelistCompilesToPermissive(): void {
	const registry = seedRegistry([
		makeDef({ id: 'open-skill' }),
	]);
	const compiled = registry.compile('open-skill') as CompiledSkill;
	assert.ok(compiled !== null);
	assert.strictEqual(compiled.quarantine, 'permissive');
	assert.strictEqual(compiled.allowedTools.length, 0);
	console.log('PASS: withoutWhitelistCompilesToPermissive');
}

function testEmptyToolsObjectStillPermissive(): void {
	// `tools: {}` (no builtin, no mcp) — treat as no whitelist.
	const registry = seedRegistry([
		makeDef({ id: 'empty-tools', tools: {} }),
	]);
	const compiled = registry.compile('empty-tools') as CompiledSkill;
	assert.strictEqual(compiled.quarantine, 'permissive');
	console.log('PASS: emptyToolsObjectStillPermissive');
}

function testCompiledObjectIsFrozenIsh(): void {
	// allowedTools is frozen so consumers can pass the array around
	// without defensive copies. The interface says `readonly`; Object.freeze
	// enforces at runtime.
	const registry = seedRegistry([
		makeDef({ id: 'freeze-me', tools: { builtin: ['a'] } }),
	]);
	const compiled = registry.compile('freeze-me') as CompiledSkill;
	assert.ok(Object.isFrozen(compiled.allowedTools), 'allowedTools must be frozen');
	console.log('PASS: compiledObjectIsFrozenIsh');
}

// ---------------------------------------------------------------------------

testTypeHasAllFields();
testTypeSourceLayering();
testUnknownIdReturnsNull();
testWhitelistedCompilesToStrict();
testWithoutWhitelistCompilesToPermissive();
testEmptyToolsObjectStillPermissive();
testCompiledObjectIsFrozenIsh();

console.log('compiled-skill-shape: all guards passed');
