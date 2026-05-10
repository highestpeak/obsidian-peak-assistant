/**
 * IFTTT-style workflow types for the workflow agent mode.
 */

/** A single step in a workflow execution pipeline. */
export interface WorkflowStep {
	/** Unique step identifier */
	id: string;
	/** Human-readable description of what this step does */
	description: string;
	/** The action to perform: search, summarize, filter, create-note, aggregate */
	action: WorkflowAction;
	/** Parameters for the action */
	params: Record<string, unknown>;
	/** Optional condition — step is skipped if condition evaluates to false */
	condition?: string;
}

/** Supported workflow actions */
export type WorkflowAction =
	| 'search'       // Search vault for notes matching criteria
	| 'read'         // Read full content of a note
	| 'summarize'    // Summarize text content using LLM
	| 'filter'       // Filter results by criteria
	| 'aggregate'    // Combine multiple results into a report
	| 'create-note'; // Create a new note with content

/** Result of a single step execution */
export interface StepResult {
	stepId: string;
	status: 'success' | 'skipped' | 'error';
	/** Output data passed to the next step */
	output: unknown;
	/** Error message if status is 'error' */
	error?: string;
	/** Execution duration in ms */
	durationMs: number;
}

/** Overall workflow execution result */
export interface WorkflowResult {
	steps: StepResult[];
	/** Final aggregated output */
	finalOutput: string;
	totalDurationMs: number;
}

/** Workflow definition — a named sequence of steps */
export interface WorkflowDefinition {
	id: string;
	name: string;
	description: string;
	steps: WorkflowStep[];
}
