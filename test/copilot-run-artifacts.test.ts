import assert from 'assert';
import {
	createEmptyCopilotRunArtifacts,
	getDefaultReviewTab,
	mergeCapabilityArtifact,
	type CopilotRunArtifacts,
} from '../src/service/copilot/CopilotRunArtifacts';

const empty = createEmptyCopilotRunArtifacts();
assert.equal(getDefaultReviewTab(empty), 'insights');

let artifacts: CopilotRunArtifacts = createEmptyCopilotRunArtifacts();
artifacts = mergeCapabilityArtifact(artifacts, {
	id: 'change-1',
	type: 'change',
	title: 'Improve paragraph',
	provenance: [{ capabilityId: 'polish', label: 'Improve note' }],
	blocks: [{
		id: 'block-1',
		heading: 'Current Focus',
		before: 'Old text',
		after: 'New text',
		provenance: [{ capabilityId: 'polish', label: 'Improve note' }],
	}],
});

assert.equal(artifacts.changes.length, 1);
assert.equal(getDefaultReviewTab(artifacts), 'changes');

artifacts = mergeCapabilityArtifact(artifacts, {
	id: 'insight-1',
	type: 'insight',
	title: 'Risk: weak evidence',
	severity: 'medium',
	body: 'The note makes a claim without source support.',
	provenance: [{ capabilityId: 'add-evidence', label: 'Add evidence' }],
	actions: [{ id: 'create-proposal', label: 'Create proposal', kind: 'create-proposal' }],
});

assert.equal(artifacts.insights.length, 1);
assert.equal(artifacts.allProvenance.length, 2);
