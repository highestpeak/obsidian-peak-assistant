// T1 Contract Seeds — shape guard.
//
// Locks two invariants:
//   1. `CapabilityManifest` in src/core/types/capability.ts declares every
//      field named in the design (spec §Wave 1.B). Losing a field
//      silently is a design regression.
//   2. The type file lives in core/ and MUST NOT import from
//      @/service/*, @/app/*, @/ui/*, or `obsidian`. Layering direction
//      is the whole point of putting the contract here.
//
// Also validates the pilot fixture (doc.review.current) still populates
// every required field.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const TYPE_PATH = path.resolve(
	process.cwd(),
	'src/core/types/capability.ts',
);
const FIXTURE_PATH = path.resolve(
	process.cwd(),
	'test/fixtures/capabilities/doc-review-current.fixture.ts',
);

const typeSource = fs.readFileSync(TYPE_PATH, 'utf8');
const fixtureSource = fs.readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Rule 1 — every declared field is present in the type source.
// ---------------------------------------------------------------------------

const REQUIRED_MANIFEST_FIELDS = [
	'id',
	'title',
	'description',
	'inputContract',
	'outputContract',
	'permissionKind',
	'costTier',
	'backendPolicy',
	'skillRef',
	'surfaceBinding',
] as const;

function testTypeHasAllManifestFields(): void {
	for (const field of REQUIRED_MANIFEST_FIELDS) {
		const re = new RegExp(`readonly\\s+${field}\\b`);
		assert.ok(
			re.test(typeSource),
			`CapabilityManifest field '${field}' missing from src/core/types/capability.ts`,
		);
	}
	console.log(
		`PASS: typeHasAllManifestFields (${REQUIRED_MANIFEST_FIELDS.length} required fields)`,
	);
}

// ---------------------------------------------------------------------------
// Rule 2 — the fixture populates every field.
// ---------------------------------------------------------------------------

function testFixturePopulatesAllFields(): void {
	for (const field of REQUIRED_MANIFEST_FIELDS) {
		const re = new RegExp(`\\b${field}:\\s`);
		assert.ok(
			re.test(fixtureSource),
			`Fixture doc-review-current.fixture.ts missing field '${field}'`,
		);
	}
	console.log(
		`PASS: fixturePopulatesAllFields (${REQUIRED_MANIFEST_FIELDS.length} required fields)`,
	);
}

// ---------------------------------------------------------------------------
// Rule 3 — layering: core/types/capability.ts must not import from
// service/app/ui or obsidian. Pure-type module.
// ---------------------------------------------------------------------------

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	const sideRe = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
	while ((m = sideRe.exec(source)) !== null) out.push(m[1]!);
	return out;
}

const FORBIDDEN_IMPORT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /^obsidian(\/.*)?$/, reason: 'core/types must not import Obsidian' },
	{ pattern: /^@\/service\//, reason: 'core/types must not depend on service/*' },
	{ pattern: /^@\/app\//, reason: 'core/types must not depend on app/*' },
	{ pattern: /^@\/ui\//, reason: 'core/types must not depend on ui/*' },
	{ pattern: /^zustand(\/.*)?$/, reason: 'core/types must not depend on zustand' },
	{ pattern: /^react(\/.*)?$/, reason: 'core/types must not depend on React' },
	{ pattern: /^better-sqlite3$/, reason: 'core/types must not depend on the SQLite driver' },
];

function testTypeSourceLayering(): void {
	const specifiers = extractImportSpecifiers(typeSource);
	for (const spec of specifiers) {
		for (const { pattern, reason } of FORBIDDEN_IMPORT_PATTERNS) {
			if (pattern.test(spec)) {
				assert.fail(
					`forbidden import '${spec}' in src/core/types/capability.ts: ${reason}`,
				);
			}
		}
	}
	console.log(
		`PASS: typeSourceLayering (${specifiers.length} import(s) checked)`,
	);
}

// ---------------------------------------------------------------------------
// Rule 4 — pure type module: no class, no function, no top-level runtime
// value. Mirrors the stance taken by run-envelope-core.test.ts.
// ---------------------------------------------------------------------------

function testTypeSourceIsPureTypes(): void {
	const stripped = typeSource
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	assert.ok(
		!/\bclass\s+\w+/.test(stripped),
		'capability.ts must not declare a class',
	);
	assert.ok(
		!/\bfunction\s+\w+/.test(stripped),
		'capability.ts must not declare a function',
	);
	assert.ok(
		!/^\s*(?:const|let|var)\s+\w+/m.test(stripped),
		'capability.ts must not declare a top-level const/let/var',
	);
	console.log('PASS: typeSourceIsPureTypes');
}

// ---------------------------------------------------------------------------
// Rule 5 — Surface id closed set stays in sync between core and service.
// Both files must list the same 5 ids. If a new surface is added, both
// files change in the same PR.
// ---------------------------------------------------------------------------

const SURFACE_CAPABILITY_PATH = path.resolve(
	process.cwd(),
	'src/service/capabilities/SurfaceCapability.ts',
);

function testSurfaceIdSetsAgree(): void {
	const serviceSource = fs.readFileSync(SURFACE_CAPABILITY_PATH, 'utf8');
	const expected = ['chat', 'vault-search', 'ai-analysis', 'copilot', 'web-chat'];
	for (const id of expected) {
		assert.ok(
			new RegExp(`'${id}'`).test(typeSource),
			`CapabilitySurfaceId in core/types/capability.ts missing '${id}'`,
		);
		assert.ok(
			new RegExp(`'${id}'`).test(serviceSource),
			`SurfaceId in service/capabilities/SurfaceCapability.ts missing '${id}'`,
		);
	}
	console.log(`PASS: surfaceIdSetsAgree (${expected.length} ids)`);
}

// ---------------------------------------------------------------------------

testTypeHasAllManifestFields();
testFixturePopulatesAllFields();
testTypeSourceLayering();
testTypeSourceIsPureTypes();
testSurfaceIdSetsAgree();

console.log('capability-manifest-shape: all guards passed');
