import { App } from 'obsidian';
import { ChatConversation, ChatProject } from '@/service/chat/types';

/**
 * Custom events for view communication
 */
export enum ViewEventType {
	SELECTION_CHANGED = 'peak:selection-changed',
	CONVERSATION_UPDATED = 'peak:conversation-updated',
	PROJECT_UPDATED = 'peak:project-updated',
	SCROLL_TO_MESSAGE = 'peak:scroll-to-message',
	OPEN_LINK = 'peak:open-link',
	SHOW_TOAST = 'peak:show-toast',
	SETTINGS_UPDATED = 'peak:settings-updated',
	MESSAGE_SENT = 'peak:message-sent',
	CONVERSATION_CREATED = 'peak:conversation-created',
}

/**
 * Base class for all view events
 */
export abstract class ViewEvent {
	readonly type: ViewEventType;
	readonly timestamp: number;

	constructor(type: ViewEventType) {
		this.type = type;
		this.timestamp = Date.now();
	}
}

/**
 * Selection changed event
 */
export class SelectionChangedEvent extends ViewEvent {
	conversationId?: string | null;
	projectId?: string | null;

	constructor(data: { conversationId?: string | null; projectId?: string | null }) {
		super(ViewEventType.SELECTION_CHANGED);
		this.conversationId = data.conversationId;
		this.projectId = data.projectId;
	}
}

/**
 * Conversation updated event
 */
export class ConversationUpdatedEvent extends ViewEvent {
	conversation: ChatConversation;

	constructor(data: { conversation: ChatConversation }) {
		super(ViewEventType.CONVERSATION_UPDATED);
		this.conversation = data.conversation;
	}
}

/**
 * Project updated event
 */
export class ProjectUpdatedEvent extends ViewEvent {
	project: ChatProject;

	constructor(data: { project: ChatProject }) {
		super(ViewEventType.PROJECT_UPDATED);
		this.project = data.project;
	}
}

/**
 * Scroll to message event
 */
export class ScrollToMessageEvent extends ViewEvent {
	messageId: string;

	constructor(data: { messageId: string }) {
		super(ViewEventType.SCROLL_TO_MESSAGE);
		this.messageId = data.messageId;
	}
}

/**
 * Open link event
 */
export class OpenLinkEvent extends ViewEvent {
	path: string;

	constructor(data: { path: string }) {
		super(ViewEventType.OPEN_LINK);
		this.path = data.path;
	}
}

/**
 * Settings updated event
 */
export class SettingsUpdatedEvent extends ViewEvent {
	constructor() {
		super(ViewEventType.SETTINGS_UPDATED);
	}
}

/**
 * Message sent event
 */
export class MessageSentEvent extends ViewEvent {
	conversationId: string;
	projectId?: string | null;

	constructor(data: { conversationId: string; projectId?: string | null }) {
		super(ViewEventType.MESSAGE_SENT);
		this.conversationId = data.conversationId;
		this.projectId = data.projectId;
	}
}

/**
 * Conversation created event
 */
export class ConversationCreatedEvent extends ViewEvent {
	conversationId: string;
	projectId?: string | null;

	constructor(data: { conversationId: string; projectId?: string | null }) {
		super(ViewEventType.CONVERSATION_CREATED);
		this.conversationId = data.conversationId;
		this.projectId = data.projectId;
	}
}

/**
 * Toast event for cross-instance toast display
 */
export class ShowToastEvent extends ViewEvent {
	message: string | React.ReactNode;
	toastType: 'default' | 'success' | 'error' | 'warning' | 'info';
	description?: string | React.ReactNode;
	duration?: number;
	action?: {
		label: string;
		onClick: () => void;
	};

	constructor(data: {
		message: string | React.ReactNode;
		type?: 'default' | 'success' | 'error' | 'warning' | 'info';
		description?: string | React.ReactNode;
		duration?: number;
		action?: {
			label: string;
			onClick: () => void;
		};
	}) {
		super(ViewEventType.SHOW_TOAST);
		this.message = data.message;
		this.toastType = data.type || 'default';
		this.description = data.description;
		this.duration = data.duration;
		this.action = data.action;
	}
}

type EventListener<T extends ViewEvent = ViewEvent> = (event: T) => void;

/**
 * Simple event bus using Obsidian's workspace events
 */
export class EventBus {
	private static instance: EventBus | null = null;
	private app: App;

	private constructor(app: App) {
		this.app = app;
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(app: App): EventBus {
		if (!EventBus.instance) {
			EventBus.instance = new EventBus(app);
		}
		return EventBus.instance;
	}

	/**
	 * Dispatch an event
	 */
	dispatch<T extends ViewEvent>(event: T): void {
		this.app.workspace.trigger(event.type as any, event);
	}

	/**
	 * Subscribe to an event (custom view events or workspace events)
	 * @returns Unsubscribe function
	 */
	on<T extends ViewEvent>(eventType: ViewEventType, callback: EventListener<T>): () => void;
	on(eventType: string, callback: (...args: any[]) => void): () => void;
	on(eventType: ViewEventType | string, callback: any): () => void {
		const ref = this.app.workspace.on(eventType as any, callback);
		return () => this.app.workspace.offref(ref);
	}
}

