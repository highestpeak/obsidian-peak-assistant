import { IconName, ItemView, TFolder, WorkspaceLeaf } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { ChatProject } from '@/service/chat/types';
import { EventBus, SelectionChangedEvent, ViewEventType } from '@/core/eventBus';
import { useChatViewStore } from './chat-view/store/chatViewStore';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { ChatViewComponent } from './chat-view/ChatViewComponent';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';

export const CHAT_VIEW_TYPE = 'peak-chat-view';

export class ChatView extends ItemView {
	// Views
	private reactRenderer: ReactRenderer | null = null;
	private eventBus: EventBus;
	private unsubscribeHandlers: (() => void)[] = [];

	constructor(leaf: WorkspaceLeaf, private readonly aiServiceManager: AIServiceManager) {
		super(leaf);
		this.eventBus = EventBus.getInstance(this.app);
		// Note: messagesViewWrapperRef will be set when React component mounts
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Peak Chat';
	}

	getIcon(): IconName {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-chat-view');

		// Create React renderer
		this.reactRenderer = new ReactRenderer(this.containerEl);

		// Subscribe to selection changed events
		this.unsubscribeHandlers.push(
			this.eventBus.on<SelectionChangedEvent>(ViewEventType.SELECTION_CHANGED, async (event) => {
				if (event.conversationId) {
					// Load conversation and project from IDs
					let project: ChatProject | null = null;
					if (event.projectId) {
						const projects = await this.aiServiceManager.listProjects();
						project = projects.find(p => p.meta.id === event.projectId) ?? null;
					}
					const conversations = await this.aiServiceManager.listConversations(project?.meta);
					const conversation = conversations.find(c => c.meta.id === event.conversationId);
					if (conversation) {
						useChatViewStore.getState().setConversation(conversation);
					}
				}
			})
		);

		// Subscribe to viewMode changes - when it changes, re-render
		const unsubscribeStore = useChatViewStore.subscribe((state) => {
			// When viewMode changes, read all needed data from store and render
			this.render();
		});
		this.unsubscribeHandlers.push(unsubscribeStore);

		// Initial render
		this.render();
	}

	async onClose(): Promise<void> {
		// Unsubscribe from events
		this.unsubscribeHandlers.forEach(unsubscribe => unsubscribe());
		this.unsubscribeHandlers = [];

		// Clean up React renderer
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}

		this.containerEl.empty();
	}

	private render(): void {
		if (!this.reactRenderer) return;

		const state = useChatViewStore.getState();
		const { viewMode } = state;

		if (!viewMode) return;

		// Use unified React component for all views with service context
		this.reactRenderer.render(
			createReactElementWithServices(
				ChatViewComponent,
				{ viewMode },
				this.app,
				this.aiServiceManager
			)
		);
	}


}
