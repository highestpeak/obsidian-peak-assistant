import type { AppHandle } from '@/core/ports/AppHandle';
import type { ChatConversation } from '@/core/types/chat-vault';
import type { MyPluginSettings } from '@/core/config/settingsTypes';

/**
 * Custom events for view communication
 */
export enum ViewEventType {
	SELECTION_CHANGED = 'peak:selection-changed',
	CONVERSATION_UPDATED = 'peak:conversation-updated',
	SCROLL_TO_MESSAGE = 'peak:scroll-to-message',
	SHOW_TOAST = 'peak:show-toast',
	SETTINGS_UPDATED = 'peak:settings-updated',
	MESSAGE_SENT = 'peak:message-sent',
	CONVERSATION_CREATED = 'peak:conversation-created',
	SEARCH_QUERY = 'search-query',
	AI_ANALYSIS_COMPLETE = 'ai-analysis-complete',
	USAGE_RECORDED = 'peak:usage-recorded',
	COPILOT_ACTION_COMPLETED = 'peak:copilot-action-completed',
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

export class SelectionChangedEvent extends ViewEvent {
	conversationId?: string | null;
	projectId?: string | null;

	constructor(data: { conversationId?: string | null; projectId?: string | null }) {
		super(ViewEventType.SELECTION_CHANGED);
		this.conversationId = data.conversationId;
		this.projectId = data.projectId;
	}
}

export class ConversationUpdatedEvent extends ViewEvent {
	conversation: ChatConversation;

	constructor(data: { conversation: ChatConversation }) {
		super(ViewEventType.CONVERSATION_UPDATED);
		this.conversation = data.conversation;
	}
}

export class ScrollToMessageEvent extends ViewEvent {
	messageId: string;

	constructor(data: { messageId: string }) {
		super(ViewEventType.SCROLL_TO_MESSAGE);
		this.messageId = data.messageId;
	}
}

export class SettingsUpdatedEvent extends ViewEvent {
	constructor(public readonly settings: MyPluginSettings) {
		super(ViewEventType.SETTINGS_UPDATED);
	}
}

export class MessageSentEvent extends ViewEvent {
	conversationId: string;
	projectId?: string | null;

	constructor(data: { conversationId: string; projectId?: string | null }) {
		super(ViewEventType.MESSAGE_SENT);
		this.conversationId = data.conversationId;
		this.projectId = data.projectId;
	}
}

export class ConversationCreatedEvent extends ViewEvent {
	conversationId: string;
	projectId?: string | null;

	constructor(data: { conversationId: string; projectId?: string | null }) {
		super(ViewEventType.CONVERSATION_CREATED);
		this.conversationId = data.conversationId;
		this.projectId = data.projectId;
	}
}

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

export class SearchQueryEvent extends ViewEvent {
	query: string;

	constructor(data: { query: string }) {
		super(ViewEventType.SEARCH_QUERY);
		this.query = data.query;
	}
}

export class UsageRecordedViewEvent extends ViewEvent {
	constructor(public readonly payload: import('@/service/usage/types').UsageRecordPayload) {
		super(ViewEventType.USAGE_RECORDED);
	}
}

export class AIAnalysisCompleteEvent extends ViewEvent {
	query: string | null;
	summary: string;

	constructor(data: { query: string | null; title: string | null; sourcesCount: number }) {
		super(ViewEventType.AI_ANALYSIS_COMPLETE);
		this.query = data.query;
		this.summary = `AI analysis complete: ${data.title ?? data.query ?? 'Unknown'} (${data.sourcesCount} sources)`;
	}
}

/**
 * Emitted when a Copilot manual action finishes (terminal status:
 * completed / cancelled / error). Consumed by SessionContextService so
 * that finished reviews show up in the Recent Activity slot alongside
 * chats, searches, and AI analyses. Kept intentionally small: the
 * downstream row only needs summary + related path + outcome status.
 */
export class CopilotActionCompletedEvent extends ViewEvent {
	actionId: string;
	actionLabel: string;
	outcome: 'completed' | 'cancelled' | 'error';
	summary: string;
	path?: string;

	constructor(data: {
		actionId: string;
		actionLabel: string;
		outcome: 'completed' | 'cancelled' | 'error';
		summary?: string;
		path?: string;
	}) {
		super(ViewEventType.COPILOT_ACTION_COMPLETED);
		this.actionId = data.actionId;
		this.actionLabel = data.actionLabel;
		this.outcome = data.outcome;
		this.path = data.path;
		this.summary = data.summary
			?? (data.outcome === 'completed'
				? `${data.actionLabel}${data.path ? ` on ${data.path}` : ''}`
				: `${data.actionLabel} (${data.outcome})${data.path ? ` on ${data.path}` : ''}`);
	}
}

type EventListener<T extends ViewEvent = ViewEvent> = (event: T) => void;

/**
 * T11R Phase 2: EventBus runtime uses {@link AppHandle} (duck-typed access
 * to `app.workspace.trigger / on / offref`) instead of importing `App`
 * from `obsidian`. Behavior unchanged.
 */
export class EventBus {
	private static instance: EventBus | null = null;
	private app: AppHandle;

	private readonly subscribers: Array<() => void> = [];

	private constructor(app: AppHandle) {
		this.app = app;
	}

	static getInstance(app: AppHandle): EventBus {
		if (!EventBus.instance) {
			EventBus.instance = new EventBus(app);
		}
		return EventBus.instance;
	}

	static destroyInstance(): void {
		if (EventBus.instance) {
			EventBus.instance.offAll();
			EventBus.instance = null;
		}
	}

	private offAll(): void {
		const list = this.subscribers;
		this.subscribers.length = 0;
		for (const fn of list) {
			try {
				fn();
			} catch (e) {
				console.warn('[EventBus] offAll: unsubscribe threw', e);
			}
		}
	}

	dispatch<T extends ViewEvent>(event: T): void {
		this.app.workspace.trigger(event.type as any, event);
	}

	on<T extends ViewEvent>(eventType: ViewEventType, callback: EventListener<T>): () => void;
	on(eventType: string, callback: (...args: any[]) => void): () => void;
	on(eventType: ViewEventType | string, callback: any): () => void {
		const ref = this.app.workspace.on(eventType as any, callback);
		const unsubscribe = () => this.app.workspace.offref(ref);
		this.subscribers.push(unsubscribe);
		return () => {
			const i = this.subscribers.indexOf(unsubscribe);
			if (i !== -1) this.subscribers.splice(i, 1);
			unsubscribe();
		};
	}
}
