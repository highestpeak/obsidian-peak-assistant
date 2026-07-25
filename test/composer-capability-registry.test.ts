/**
 * Peak Composer — capability registry (WP3, CMP-AI-02 registry half).
 *
 * Registration/validation contract per spec §12 / §15.1:
 *   - packs register; duplicate id refused;
 *   - broken definitions (missing schema / adapter / prompt / surface binding)
 *     are refused at registration, never half-projected;
 *   - list order is stable and independent of registration order;
 *   - materializer/writeback bindings are validated as a set;
 *   - config completeness: templates/config/composer.json `capabilities`
 *     covers every registered capability and mirrors both compiled fallbacks
 *     (service actions/strings + UI candidate strings) — the drift guard.
 */

import fs from 'fs';
import path from 'path';
import {
	ComposerCapabilityRegistry,
	ComposerWritebackAdapterRegistry,
	createDefaultResultMaterializers,
	createDefaultWritebackAdapters,
	createPolishDefinition,
	createProseCapabilityPack,
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
	POLISH_CAPABILITY_ID,
	POLISH_COPILOT_ACTION_ID,
} from '@/service/composer';
import type { ComposerCapabilityDefinition } from '@/core/composer';
import { DEFAULT_CANDIDATE_UI_STRINGS } from '@/ui/view/composer/candidates/candidateUiConfig';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();
const config = () => DEFAULT_COMPOSER_CAPABILITIES_CONFIG;

function freshRegistry(): ComposerCapabilityRegistry {
	const registry = new ComposerCapabilityRegistry(config);
	registry.registerPack(createProseCapabilityPack(config));
	return registry;
}

function expectThrow(name: string, fn: () => void, needle?: string): void {
	try {
		fn();
		check(name, false, 'expected a throw');
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		check(name, needle === undefined || message.includes(needle), message);
	}
}

function testRegistration(): void {
	const registry = freshRegistry();
	check('prose pack registers polish', registry.size() === 1);
	check('getById resolves the stable id', registry.getById(POLISH_CAPABILITY_ID) !== null);
	check('require resolves the stable id', registry.require(POLISH_CAPABILITY_ID).version === '1');
	check(
		'definition carries the copilot parity alias',
		registry.require(POLISH_CAPABILITY_ID).copilotActionId === POLISH_COPILOT_ACTION_ID,
	);
	expectThrow('duplicate id refused', () => registry.registerPack(createProseCapabilityPack(config)), 'already registered');
	expectThrow('unknown id fails loud', () => registry.require('composer.prose.nope'), 'unknown composer capability');
}

function testDefinitionValidation(): void {
	const base = createPolishDefinition(config);
	const cases: Array<[string, Partial<ComposerCapabilityDefinition>, string]> = [
		['mutation without writeback adapter refused', { writebackAdapterId: undefined }, 'writebackAdapterId'],
		['model capability without promptId refused', { promptId: undefined }, 'promptId'],
		[
			'model capability without variable builder refused',
			{ buildPromptVariables: undefined },
			'buildPromptVariables',
		],
		[
			'composer missing from surface binding refused',
			{ manifest: { ...base.manifest, surfaceBinding: ['copilot'] } },
			"surfaceBinding must include 'composer'",
		],
		['missing input schema refused', { inputSchema: undefined as never }, 'inputSchema'],
		['missing result schema refused', { resultSchema: undefined as never }, 'resultSchema'],
		['empty target kinds refused', { targetKinds: [] }, 'target kind'],
		['empty surfaces refused', { surfaces: [] }, 'surface'],
		['missing renderer id refused', { rendererId: '' }, 'rendererId'],
	];
	for (const [name, patch, needle] of cases) {
		const registry = new ComposerCapabilityRegistry(config);
		expectThrow(name, () => registry.register({ ...base, ...patch } as ComposerCapabilityDefinition), needle);
	}
}

function testStableOrdering(): void {
	const base = createPolishDefinition(config);
	const second: ComposerCapabilityDefinition = {
		...base,
		manifest: { ...base.manifest, id: 'composer.prose.aa-second', skillRef: 'composer.prose.aa-second' },
		configKey: 'composer.prose.aa-second',
		presentationFallback: { ...base.presentationFallback, order: 20 },
	};
	const forward = new ComposerCapabilityRegistry(config);
	forward.register(base);
	forward.register(second);
	const reverse = new ComposerCapabilityRegistry(config);
	reverse.register(second);
	reverse.register(base);
	const forwardIds = forward.list().map((d) => d.manifest.id).join(',');
	const reverseIds = reverse.list().map((d) => d.manifest.id).join(',');
	check('ordering independent of registration order', forwardIds === reverseIds, `${forwardIds} vs ${reverseIds}`);
	check('order key ranks before id', forward.list()[0]?.manifest.id === POLISH_CAPABILITY_ID, forwardIds);
}

function testBindingValidation(): void {
	const registry = freshRegistry();
	registry.validateBindings(createDefaultResultMaterializers(), createDefaultWritebackAdapters());
	check('default bindings validate', true);
	expectThrow(
		'missing writeback adapter caught by binding gate',
		() => registry.validateBindings(createDefaultResultMaterializers(), new ComposerWritebackAdapterRegistry()),
		'not registered',
	);
}

interface CapabilitiesJson {
	capabilities?: {
		context?: Record<string, unknown>;
		actions?: Record<string, Record<string, unknown>>;
		strings?: Record<string, unknown>;
		candidateUi?: Record<string, unknown>;
	};
}

function testConfigCompleteness(): void {
	const raw = fs.readFileSync(path.resolve(process.cwd(), 'templates/config/composer.json'), 'utf8');
	const parsed = JSON.parse(raw) as CapabilitiesJson;
	const section = parsed.capabilities;
	check('composer.json has a capabilities section', !!section);
	if (!section) return;

	const registry = freshRegistry();
	for (const def of registry.list()) {
		const jsonEntry = section.actions?.[def.configKey];
		check(`JSON actions cover '${def.configKey}'`, !!jsonEntry, def.configKey);
		const fallbackEntry = DEFAULT_COMPOSER_CAPABILITIES_CONFIG.actions[def.configKey];
		check(`compiled fallback covers '${def.configKey}'`, !!fallbackEntry, def.configKey);
		if (!jsonEntry) continue;
		for (const key of ['title', 'description', 'lucideIcon', 'historyLabel', 'order']) {
			check(`JSON action '${def.configKey}' has '${key}'`, key in jsonEntry, key);
		}
	}

	// Strings drift guard: JSON keys ⊇ compiled fallback keys (both directions
	// for the closed sets we ship).
	for (const key of Object.keys(DEFAULT_COMPOSER_CAPABILITIES_CONFIG.strings)) {
		check(`JSON capability strings has '${key}'`, !!section.strings && key in section.strings, key);
	}
	for (const key of Object.keys(DEFAULT_CANDIDATE_UI_STRINGS)) {
		check(`JSON candidateUi has '${key}'`, !!section.candidateUi && key in section.candidateUi, key);
	}
	check(
		'JSON context declares nearbyChars',
		typeof section.context?.nearbyChars === 'number',
		String(section.context?.nearbyChars),
	);
}

testRegistration();
testDefinitionValidation();
testStableOrdering();
testBindingValidation();
testConfigCompleteness();
done('composer-capability-registry');
