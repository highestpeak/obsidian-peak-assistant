import assert from 'assert';
import {
	buildCopilotReviewModel,
	nextInsightLayoutMode,
	type InsightLayoutMode,
} from '../src/ui/view/copilot/review/CopilotReviewModel';
import type { CopilotRunArtifacts } from '../src/service/copilot/CopilotRunArtifacts';

const empty: CopilotRunArtifacts = {
	changes: [],
	insights: [],
	sources: [],
	trace: [],
	allProvenance: [],
};

const emptyModel = buildCopilotReviewModel(empty);
assert.equal(emptyModel.activeTab, 'insights');
assert.equal(emptyModel.canApply, false);
assert.equal(emptyModel.tabs.find(tab => tab.id === 'insights')?.count, 0);

const withChange: CopilotRunArtifacts = {
	...empty,
	changes: [{
		id: 'change',
		type: 'change',
		title: 'Change',
		provenance: [{ capabilityId: 'polish', label: 'Polish' }],
		blocks: [{
			id: 'block',
			before: 'Before',
			after: 'After',
			provenance: [{ capabilityId: 'polish', label: 'Polish' }],
			selected: true,
		}],
	}],
	insights: [{
		id: 'insight',
		type: 'insight',
		title: 'Insight',
		body: 'Useful detail',
		provenance: [{ capabilityId: 'review', label: 'Review' }],
	}],
};

const changeModel = buildCopilotReviewModel(withChange);
assert.equal(changeModel.activeTab, 'changes');
assert.equal(changeModel.canApply, true);
assert.equal(changeModel.totalChangeBlocks, 1);
assert.equal(changeModel.tabs.find(tab => tab.id === 'changes')?.count, 1);
assert.equal(changeModel.tabs.find(tab => tab.id === 'chat')?.count, 0);

const modes: InsightLayoutMode[] = ['rail', 'split', 'full'];
assert.deepStrictEqual(modes.map(nextInsightLayoutMode), ['split', 'full', 'rail']);
