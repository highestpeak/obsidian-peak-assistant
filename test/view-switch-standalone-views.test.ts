import { ViewSwitchConsistentHandler } from '@/app/view/ViewSwitchConsistentHandler';
import {
	CHAT_VIEW_TYPE,
	GAP_ANALYSIS_VIEW_TYPE,
	KNOWLEDGE_CENTER_VIEW_TYPE,
	PROJECT_LIST_VIEW_TYPE,
	STANDALONE_PEAK_VIEW_TYPES,
} from '@/app/view/types';

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

function mockLeaf(viewType: string) {
	return {
		view: {
			getViewType: () => viewType,
		},
	} as any;
}

function mockWorkspaceLeaf(viewType: string) {
	const stateCalls: any[] = [];
	return {
		view: {
			getViewType: () => viewType,
		},
		setViewState: async (state: any) => {
			stateCalls.push(state);
		},
		getStateCalls: () => stateCalls,
	} as any;
}

function createHandler() {
	const handler = new ViewSwitchConsistentHandler({} as any);
	let chatActivations = 0;
	let documentActivations = 0;

	(handler as any).activateChatView = async () => {
		chatActivations++;
	};
	(handler as any).activeDocumentView = async () => {
		documentActivations++;
	};

	return {
		handler,
		getChatActivations: () => chatActivations,
		getDocumentActivations: () => documentActivations,
	};
}

{
	assert(
		STANDALONE_PEAK_VIEW_TYPES.has(GAP_ANALYSIS_VIEW_TYPE),
		'Gap Analysis must be treated as a standalone Peak view',
	);

	const harness = createHandler();
	harness.handler.handleActiveLeafChange(mockLeaf(GAP_ANALYSIS_VIEW_TYPE));
	assert(harness.getChatActivations() === 0, 'Gap Analysis should not activate chat layout');
	assert(harness.getDocumentActivations() === 0, 'Gap Analysis should not restore document layout');
}

{
	const harness = createHandler();
	harness.handler.handleActiveLeafChange(mockLeaf(CHAT_VIEW_TYPE));
	assert(harness.getChatActivations() === 1, 'Chat view should activate chat layout');
	assert(harness.getDocumentActivations() === 0, 'Chat view should not restore document layout');
}

{
	const harness = createHandler();
	harness.handler.handleActiveLeafChange(mockLeaf('markdown'));
	assert(harness.getChatActivations() === 0, 'Markdown view should not activate chat layout');
	assert(harness.getDocumentActivations() === 1, 'Markdown view should restore document layout');
}

async function testActivateChatViewRevealsChatFromStandaloneView(): Promise<void> {
	const activeStandaloneLeaf = mockWorkspaceLeaf(KNOWLEDGE_CENTER_VIEW_TYPE);
	const chatLeaf = mockWorkspaceLeaf(CHAT_VIEW_TYPE);
	const projectLeaf = mockWorkspaceLeaf(PROJECT_LIST_VIEW_TYPE);
	let revealedLeaf: any = null;
	const handler = new ViewSwitchConsistentHandler({
		workspace: {
			activeLeaf: activeStandaloneLeaf,
			getLeavesOfType: (type: string) => {
				if (type === CHAT_VIEW_TYPE) return [chatLeaf];
				if (type === PROJECT_LIST_VIEW_TYPE) return [projectLeaf];
				return [];
			},
			getLeaf: () => chatLeaf,
			getLeftLeaf: () => projectLeaf,
			revealLeaf: (leaf: any) => {
				revealedLeaf = leaf;
			},
		},
	} as any);
	(handler as any).isChatLayoutActive = true;

	await handler.activateChatView();

	assert(chatLeaf.getStateCalls().length === 1, 'Chat leaf should be re-activated from standalone views');
	assert(revealedLeaf === chatLeaf, 'Chat leaf should be revealed after selecting chat navigation');
}

void testActivateChatViewRevealsChatFromStandaloneView().then(() => {
	console.log('view-switch-standalone-views tests passed');
}).catch((error) => {
	console.error(error);
	process.exit(1);
});
