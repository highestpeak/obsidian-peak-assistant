/**
 * T11R: Narrow workspace event-bus port — abstracts Obsidian's
 * `app.workspace.trigger / on / offref` so the `EventBus` runtime can live
 * in core (publishing only plain `ViewEvent` instances) while the app layer
 * composes the obsidian-backed adapter.
 *
 * The port returns an opaque token from `subscribe()`; callers either
 * invoke the returned `() => void` or pass the token back to
 * `unsubscribe()`. Keeping the surface deliberately small (`emit`,
 * `subscribe`) avoids dragging the full workspace shape into core.
 */
export type WorkspaceBusUnsubscribe = () => void;

export interface WorkspaceBusPort {
	emit(eventType: string, payload: unknown): void;
	subscribe(eventType: string, handler: (payload: unknown) => void): WorkspaceBusUnsubscribe;
}
