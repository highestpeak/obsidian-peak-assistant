import { App } from 'obsidian';
import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';

/**
 * Custom events for view communication
 */
export enum ViewEventType {
	SELECTION_CHANGED = 'peak:selection-changed',
	CONVERSATION_UPDATED = 'peak:conversation-updated',
	PROJECT_UPDATED = 'peak:project-updated',
	DATA_REFRESHED = 'peak:data-refreshed',
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
	conversation: ParsedConversationFile;

	constructor(data: { conversation: ParsedConversationFile }) {
		super(ViewEventType.CONVERSATION_UPDATED);
		this.conversation = data.conversation;
	}
}

/**
 * Project updated event
 */
export class ProjectUpdatedEvent extends ViewEvent {
	project: ParsedProjectFile;

	constructor(data: { project: ParsedProjectFile }) {
		super(ViewEventType.PROJECT_UPDATED);
		this.project = data.project;
	}
}

/**
 * Data refreshed event
 */
export class DataRefreshedEvent extends ViewEvent {
	constructor() {
		super(ViewEventType.DATA_REFRESHED);
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

