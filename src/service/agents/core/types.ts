/**
 * Core types for agent feedback and HITL pausing.
 */

/** A user message injected mid-loop (HITL). */
export interface UserFeedback {
	type: 'approve' | 'redirect' | 'add_paths' | 'remove_paths' | 'adjust_outline' | 'continue' | 'focus_path' | 'add_constraint' | 'enough' | 'stop';
	message?: string;
	/** Paths to add or remove (for 'add_paths' / 'remove_paths'). */
	paths?: string[];
	/** New outline text (for 'adjust_outline'). */
	outline?: string;
	/** Path to focus on (for 'focus_path'). */
	focusPath?: string;
}

/** Encapsulates the HITL pause point: the agent yields this, waits for user input. */
export interface HitlPausePoint<TSnapshot> {
	/** What the agent found so far. */
	snapshot: TSnapshot;
	/** Agent's suggested next action. */
	suggestedNextAction: string;
	/** Confidence level. */
	confidence: 'high' | 'medium' | 'low';
}
