import { ViewSwitchConsistentHandler } from '@/app/view/ViewSwitchConsistentHandler';
import {
	CHAT_VIEW_TYPE,
	PROJECT_LIST_VIEW_TYPE,
	STANDALONE_PEAK_VIEW_TYPES,
	USAGE_DASHBOARD_VIEW_TYPE,
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
	// Minimal stub so `handleActiveLeafChange`'s internal diagnostic
	// `app.workspace.getLeavesOfType(...)` call doesn't throw. The real
	// handler depends on this for ChatStudio coexistence logic; tests
	// here only need it to not blow up.
	const handler = new ViewSwitchConsistentHandler({
		workspace: { getLeavesOfType: () => [] },
	} as any);
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

// T11Y-1 (2026-06-30): Vault X-Ray retired; assert standalone behavior
// against a still-live standalone view (Usage Dashboard). Standalone Peak
// views should never flip layout to chat or document mode just because
// focus moves onto them.
{
	assert(
		STANDALONE_PEAK_VIEW_TYPES.has(USAGE_DASHBOARD_VIEW_TYPE),
		'Usage Dashboard must be treated as a standalone Peak view',
	);

	const harness = createHandler();
	harness.handler.handleActiveLeafChange(mockLeaf(USAGE_DASHBOARD_VIEW_TYPE));
	assert(harness.getChatActivations() === 0, 'Standalone view should not activate chat layout');
	assert(harness.getDocumentActivations() === 0, 'Standalone view should not restore document layout');
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
	// Use a real standalone view type — `USAGE_DASHBOARD_VIEW_TYPE` —
	// instead of the never-exported KNOWLEDGE_CENTER_VIEW_TYPE that this
	// test imported before T11G (pre-existing broken import).
	const activeStandaloneLeaf = mockWorkspaceLeaf(USAGE_DASHBOARD_VIEW_TYPE);
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
