import assert from 'assert';
import { actionResultToArtifacts } from '../src/service/copilot/CopilotArtifactAdapter';
import type { ActionResult, CopilotAction } from '../src/service/copilot/CopilotActionRegistry';

function action(id: string, label = id): Pick<CopilotAction, 'id' | 'label'> {
	return { id, label };
}

const streamResult: ActionResult = { type: 'stream', text: 'Useful summary' };
const streamArtifacts = actionResultToArtifacts({ action: action('summarize', 'Summarize'), result: streamResult });
assert.equal(streamArtifacts[0].type, 'insight');
assert.equal(streamArtifacts[0].title, 'Summarize');

const structuredResult: ActionResult = {
	type: 'structured',
	data: {
		suggestions: [
			{ target: 'Product Positioning.md', reason: 'Related product strategy note', confidence: 0.82 },
		],
	},
};
const linkArtifacts = actionResultToArtifacts({ action: action('suggest-links', 'Connect links'), result: structuredResult });
assert.equal(linkArtifacts.some(item => item.type === 'change'), true);
assert.equal(linkArtifacts.some(item => item.type === 'source'), true);

const errorResult: ActionResult = { type: 'error', message: 'Provider failed' };
const errorArtifacts = actionResultToArtifacts({ action: action('review', 'Review article'), result: errorResult });
assert.equal(errorArtifacts[0].type, 'trace');
assert.equal(errorArtifacts[0].status, 'error');

const correctContentResult: ActionResult = {
	type: 'structured',
	data: {
		summary: 'Found one risky claim.',
		corrections: [{
			original: 'Old factual claim',
			corrected: 'Corrected factual claim',
			type: 'factual',
			explanation: 'The source disagrees.',
			severity: 'major',
		}],
	},
};
const correctionArtifacts = actionResultToArtifacts({ action: action('correct-content', 'Correct content'), result: correctContentResult });
assert.equal(correctionArtifacts.some(item => item.type === 'change'), true);
assert.equal(correctionArtifacts.some(item => item.type === 'insight'), true);

const vaultHealthResult: ActionResult = {
	type: 'structured',
	data: {
		orphans: [{ path: 'A.md', title: 'A' }],
		duplicates: [],
		stale: [],
		inconsistentTags: [],
	},
};
const vaultArtifacts = actionResultToArtifacts({ action: action('vault-health', 'Vault Health'), result: vaultHealthResult });
assert.equal(vaultArtifacts[0].type, 'insight');
assert.equal(vaultArtifacts[0].actions?.some(item => item.kind === 'ask-follow-up'), true);
