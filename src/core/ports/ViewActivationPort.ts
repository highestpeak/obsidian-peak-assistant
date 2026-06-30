// T11P (Track C): Neutral port that publishes the subset of view-activation
// affordances UI consumes. Replaces the type-only `@/app/ui-host/views/ViewManager`
// import previously held by `ServiceContext` and the chat-navigation module.
//
// The concrete `ViewManager` class (in `src/app/ui-host/views/`) satisfies this
// interface structurally; UI and the chat-navigation factory depend on the
// shape only, so they no longer reach into the app layer for a type.

/** Subset of `ViewSwitchConsistentHandler` UI relies on. */
export interface ViewSwitchActivator {
	activateChatView(): Promise<void>;
}

export interface ViewActivationPort {
	getViewSwitchConsistentHandler(): ViewSwitchActivator;
}
