import { ViewEvent, ViewEventType } from '@/core/eventBus';

type EventListener<T extends ViewEvent = ViewEvent> = (event: T) => void;

/**
 * Mock EventBus for desktop development
 */
export class MockEventBus {
	private listeners: Map<string, Set<EventListener>> = new Map();

	/**
	 * Dispatch an event
	 */
	dispatch<T extends ViewEvent>(event: T): void {
		const listeners = this.listeners.get(event.type);
		if (listeners) {
			listeners.forEach((listener) => {
				try {
					listener(event as any);
				} catch (error) {
					console.error('Error in event listener:', error);
				}
			});
		}
	}

	/**
	 * Subscribe to an event
	 * @returns Unsubscribe function
	 */
	on<T extends ViewEvent>(eventType: ViewEventType, callback: EventListener<T>): () => void;
	on(eventType: string, callback: (...args: any[]) => void): () => void;
	on(eventType: ViewEventType | string, callback: any): () => void {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, new Set());
		}
		this.listeners.get(eventType)!.add(callback);

		return () => {
			const listeners = this.listeners.get(eventType);
			if (listeners) {
				listeners.delete(callback);
			}
		};
	}
}

