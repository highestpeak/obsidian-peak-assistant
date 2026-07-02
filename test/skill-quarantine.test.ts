// T6 Skill v2 — quarantine helper guard.

import assert from 'assert';
import { checkSkillQuarantine, type QuarantineVerdict } from '@/service/skills/quarantine';
import type { CompiledSkill } from '@/core/types/compiled-skill';

function strict(allowedTools: string[]): CompiledSkill {
	return {
		skillId: 'test',
		allowedTools: Object.freeze([...allowedTools]),
		systemPrompt: 'x',
		quarantine: 'strict',
	};
}

function permissive(): CompiledSkill {
	return {
		skillId: 'test',
		allowedTools: Object.freeze([]),
		systemPrompt: 'x',
		quarantine: 'permissive',
	};
}

function assertAllow(v: QuarantineVerdict): void {
	assert.strictEqual(v, 'allow', `expected 'allow', got ${JSON.stringify(v)}`);
}

function assertDeny(v: QuarantineVerdict, kind: string): void {
	assert.notStrictEqual(v, 'allow');
	if (typeof v === 'object') assert.strictEqual(v.deny, kind);
}

function testStrictAllowsWhitelisted(): void {
	assertAllow(checkSkillQuarantine(strict(['search', 'grep']), 'search'));
	assertAllow(checkSkillQuarantine(strict(['search', 'grep']), 'grep'));
	console.log('PASS: strictAllowsWhitelisted');
}

function testStrictDeniesUnknown(): void {
	assertDeny(checkSkillQuarantine(strict(['search']), 'delete-file'), 'not-in-whitelist');
	console.log('PASS: strictDeniesUnknown');
}

function testPermissiveAllowsAny(): void {
	assertAllow(checkSkillQuarantine(permissive(), 'anything'));
	assertAllow(checkSkillQuarantine(permissive(), 'mcp_octo_get_issue'));
	console.log('PASS: permissiveAllowsAny');
}

function testInvalidInput(): void {
	assertDeny(checkSkillQuarantine(strict(['x']), ''), 'invalid-input');
	assertDeny(checkSkillQuarantine(permissive(), '   '), 'invalid-input');
	console.log('PASS: invalidInput');
}

function testDenyMessageMentionsSkillAndTool(): void {
	const verdict = checkSkillQuarantine(strict(['a']), 'b') as { deny: string; reason: string };
	assert.match(verdict.reason, /'b'/);
	assert.match(verdict.reason, /'test'/);
	console.log('PASS: denyMessageMentionsSkillAndTool');
}

testStrictAllowsWhitelisted();
testStrictDeniesUnknown();
testPermissiveAllowsAny();
testInvalidInput();
testDenyMessageMentionsSkillAndTool();
console.log('skill-quarantine: all guards passed');
