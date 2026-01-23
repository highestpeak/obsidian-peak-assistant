import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * UI Event Store - For fast-changing data transmission within UI thread only
 *
 * Unlike src/core/eventBus.ts which uses Obsidian's workspace events and may occupy
 * the main Obsidian channel, this store is designed for rapid UI state updates
 * that happen within the same UI thread and don't need to cross component boundaries
 * via Obsidian's event system.
 *
 * Use this store when you need:
 * - Fast, frequent UI state updates
 * - Streaming data display
 * - Real-time component synchronization
 * - High-frequency event publishing
 *
 * Do NOT use this store for:
 * - Cross-view communication (use eventBus.ts instead)
 * - Persistent state (use dedicated stores)
 * - Plugin-wide events (use eventBus.ts instead)
 */
export interface UIEvent {
	type: string;
	payload: any;
	timestamp: number;
}

interface UIEventStore {
	/**
	 * Last published event
	 */
	lastEvent: UIEvent | null;

	/**
	 * Event history for debugging (limited to prevent memory leaks)
	 */
	eventHistory: UIEvent[];

	/**
	 * Publish an event to subscribers
	 * @param type Event type identifier
	 * @param payload Event data payload
	 */
	publish: (type: string, payload: any) => void;

	/**
	 * Clear the last event
	 */
	clearLastEvent: () => void;

	/**
	 * Clear event history
	 */
	clearHistory: () => void;
}

const MAX_HISTORY_SIZE = 100; // Prevent memory leaks

export const useUIEventStore = create<UIEventStore>((set, get) => ({
	lastEvent: null,
	eventHistory: [],

	publish: (type: string, payload: any) => {
		const event: UIEvent = {
			type,
			payload,
			timestamp: Date.now()
		};

		set((state) => {
			const newHistory = [...state.eventHistory, event];
			// Keep history limited to prevent memory leaks
			if (newHistory.length > MAX_HISTORY_SIZE) {
				newHistory.shift();
			}

			return {
				lastEvent: event,
				eventHistory: newHistory
			};
		});
	},

	clearLastEvent: () => set({ lastEvent: null }),

	clearHistory: () => set({ eventHistory: [] }),
}));

/**
 * Hook to subscribe to UI events for streaming data display
 *
 * This hook provides a convenient way to subscribe to events published through
 * the UI Event Store. It's designed for fast, frequent UI updates within the UI thread.
 *
 * @param eventType - The event type(s) to subscribe to. Can be:
 *   - null: Subscribe to all events
 *   - string: Subscribe to a specific event type
 *   - Set<string>: Subscribe to multiple specific event types
 * @param callback - Callback function that receives the event payload
 */
export const useSubscribeUIEvent = (
	eventType: string | Set<string> | null,
	callback: (eventType: string, payload: any) => void
) => {
	useEffect(() => {
		const unsub = useUIEventStore.subscribe((state) => {
			const event = state.lastEvent;
			// no event, do nothing
			if (!event) {
				return;
			}

			// subscribe to all events
			if (!eventType) {
				callback(event.type, event.payload);
				return;
			}
			// subscribe to specific event
			else if (typeof eventType === 'string' && event.type === eventType) {
				callback(event.type, event.payload);
				return;
			}
			// subscribe to specific events
			else if (eventType instanceof Set && eventType.has(event.type)) {
				callback(event.type, event.payload);
				return;
			}
		});

		return () => unsub();
	});
};