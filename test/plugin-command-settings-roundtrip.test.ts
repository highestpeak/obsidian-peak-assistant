import assert from 'assert';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';

function testDefaultsRemainOff(): void {
	const normalized = normalizePluginSettings({});
	assert.deepStrictEqual(normalized.pluginCommandGateway, {
		reviews: {},
		findings: {},
	});
	console.log('PASS: plugin command settings default off');
}

function testApprovedReviewAndFindingRoundTrip(): void {
	const normalized = normalizePluginSettings({
		pluginCommandGateway: {
			reviews: {
				'calendar:open-week': {
					decision: 'allow',
					risk: 'read',
					purpose: 'navigation',
					sourceHash: 'hash-v1',
					curationHash: 'curation-v1',
					reviewedAt: 10,
				},
				'invalid:command': {
					decision: 'allow',
					risk: 'super-safe',
					purpose: 'navigation',
					sourceHash: 'invalid',
					curationHash: 'invalid',
					reviewedAt: 11,
				},
				'legacy:missing-curation-hash': {
					decision: 'allow',
					risk: 'read',
					purpose: 'navigation',
					sourceHash: 'legacy',
					reviewedAt: 12,
				},
			},
			findings: {
				'calendar:open-week': {
					commandId: 'calendar:open-week',
					sourceHash: 'hash-v1',
					recommend: true,
					risk: 'read',
					purpose: 'navigation',
					summary: 'Open the calendar week.',
					evidence: ['Command name'],
					requiresActiveEditor: false,
					interaction: 'direct',
					expectedObservation: 'workspace',
					toolDescription: 'Open the weekly calendar.',
					confirmation: 'none',
					skillName: 'Open week',
					skillDescription: 'Navigate to the calendar week.',
					skillInstructions: 'Use only when weekly calendar navigation is requested.',
					curatedAt: 9,
				},
			},
		},
	});
	assert.strictEqual(
		normalized.pluginCommandGateway.reviews['calendar:open-week']?.decision,
		'allow',
	);
	assert.strictEqual(
		normalized.pluginCommandGateway.findings['calendar:open-week']?.interaction,
		'direct',
	);
	assert.strictEqual(
		normalized.pluginCommandGateway.reviews['invalid:command'],
		undefined,
	);
	assert.strictEqual(
		normalized.pluginCommandGateway.reviews['legacy:missing-curation-hash'],
		undefined,
	);
	console.log('PASS: plugin command review and finding round trip');
}

testDefaultsRemainOff();
testApprovedReviewAndFindingRoundTrip();
