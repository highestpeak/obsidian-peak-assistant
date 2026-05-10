/**
 * WorkflowRunner: executes workflow steps sequentially, passing output of each to next.
 */

import type { WorkflowStep, StepResult, WorkflowResult } from './types';
import { AppContext } from '@/app/context/AppContext';
import type { SearchResultItem } from '@/service/search/types';

export class WorkflowRunner {
	private abortController: AbortController;

	constructor() {
		this.abortController = new AbortController();
	}

	/** Cancel the running workflow */
	cancel(): void {
		this.abortController.abort();
	}

	/** Execute all steps in sequence, piping output forward */
	async execute(steps: WorkflowStep[]): Promise<WorkflowResult> {
		const startTime = Date.now();
		const results: StepResult[] = [];
		let previousOutput: unknown = null;

		for (const step of steps) {
			if (this.abortController.signal.aborted) {
				results.push({
					stepId: step.id,
					status: 'skipped',
					output: null,
					error: 'Workflow cancelled',
					durationMs: 0,
				});
				continue;
			}

			// Evaluate condition if present
			if (step.condition && !this.evaluateCondition(step.condition, previousOutput)) {
				results.push({
					stepId: step.id,
					status: 'skipped',
					output: previousOutput,
					durationMs: 0,
				});
				continue;
			}

			const stepStart = Date.now();
			try {
				const output = await this.executeStep(step, previousOutput);
				results.push({
					stepId: step.id,
					status: 'success',
					output,
					durationMs: Date.now() - stepStart,
				});
				previousOutput = output;
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				results.push({
					stepId: step.id,
					status: 'error',
					output: null,
					error: errorMsg,
					durationMs: Date.now() - stepStart,
				});
				// Continue with null output on error (don't break the chain)
				previousOutput = null;
			}
		}

		const finalOutput = typeof previousOutput === 'string'
			? previousOutput
			: JSON.stringify(previousOutput, null, 2);

		return {
			steps: results,
			finalOutput,
			totalDurationMs: Date.now() - startTime,
		};
	}

	private async executeStep(step: WorkflowStep, input: unknown): Promise<unknown> {
		switch (step.action) {
			case 'search':
				return this.actionSearch(step.params);
			case 'read':
				return this.actionRead(step.params, input);
			case 'summarize':
				return this.actionSummarize(step.params, input);
			case 'filter':
				return this.actionFilter(step.params, input);
			case 'aggregate':
				return this.actionAggregate(step.params, input);
			case 'create-note':
				return this.actionCreateNote(step.params, input);
			default:
				throw new Error(`Unknown action: ${step.action}`);
		}
	}

	private async actionSearch(params: Record<string, unknown>): Promise<SearchResultItem[]> {
		const query = String(params.query ?? '');
		const limit = Number(params.limit ?? 10);
		if (!query) throw new Error('Search action requires a "query" param');

		const ctx = AppContext.getInstance();
		const result = await ctx.searchClient.search({
			text: query,
			scopeMode: 'vault',
			topK: limit,
		});
		return result.items;
	}

	private async actionRead(params: Record<string, unknown>, input: unknown): Promise<string[]> {
		const app = AppContext.getInstance().app;
		const paths: string[] = [];

		// If input is search results, extract paths
		if (Array.isArray(input)) {
			for (const item of input) {
				if (typeof item === 'object' && item !== null && 'path' in item) {
					paths.push(String((item as { path: string }).path));
				}
			}
		}

		// Override with explicit paths param
		if (params.paths && Array.isArray(params.paths)) {
			paths.length = 0;
			for (const p of params.paths) paths.push(String(p));
		}

		const maxNotes = Number(params.limit ?? 5);
		const results: string[] = [];

		for (const path of paths.slice(0, maxNotes)) {
			try {
				const file = app.vault.getAbstractFileByPath(path);
				if (file && 'extension' in file) {
					const content = await app.vault.cachedRead(file as any);
					results.push(`# ${path}\n\n${content}`);
				}
			} catch {
				results.push(`# ${path}\n\n(Failed to read)`);
			}
		}
		return results;
	}

	private async actionSummarize(params: Record<string, unknown>, input: unknown): Promise<string[]> {
		const mgr = AppContext.getInstance().manager;
		const texts: string[] = Array.isArray(input) ? input.map(String) : [String(input)];
		const instruction = String(params.instruction ?? 'Summarize this content concisely.');
		const results: string[] = [];

		for (const text of texts) {
			if (this.abortController.signal.aborted) break;
			const trimmedText = text.slice(0, 8000); // Limit context per item
			let summary = '';
			for await (const chunk of mgr.queryTextStream(
				null as any, // Will use default prompt
				{},
				{ signal: this.abortController.signal, rawPrompt: `${instruction}\n\n---\n\n${trimmedText}` },
			)) {
				if (chunk.type === 'delta') summary += chunk.text;
			}
			results.push(summary);
		}
		return results;
	}

	private actionFilter(params: Record<string, unknown>, input: unknown): unknown {
		if (!Array.isArray(input)) return input;

		const contains = params.contains ? String(params.contains).toLowerCase() : null;
		const minScore = params.minScore != null ? Number(params.minScore) : null;

		return input.filter((item: unknown) => {
			if (contains) {
				const text = JSON.stringify(item).toLowerCase();
				if (!text.includes(contains)) return false;
			}
			if (minScore != null && typeof item === 'object' && item !== null) {
				const score = (item as any).score ?? (item as any).finalScore ?? 0;
				if (score < minScore) return false;
			}
			return true;
		});
	}

	private actionAggregate(params: Record<string, unknown>, input: unknown): string {
		const format = String(params.format ?? 'markdown');
		const title = String(params.title ?? 'Workflow Report');

		if (!Array.isArray(input)) return String(input);

		const items = input.map((item, idx) => {
			if (typeof item === 'string') return item;
			if (typeof item === 'object' && item !== null && 'path' in item) {
				return `- **${(item as any).title ?? (item as any).path}** (score: ${(item as any).score ?? 'N/A'})`;
			}
			return `- Item ${idx + 1}: ${JSON.stringify(item).slice(0, 200)}`;
		});

		if (format === 'markdown') {
			return `# ${title}\n\n${items.join('\n\n')}`;
		}
		return items.join('\n');
	}

	private async actionCreateNote(params: Record<string, unknown>, input: unknown): Promise<string> {
		const app = AppContext.getInstance().app;
		const folder = String(params.folder ?? 'Workflow-Output');
		const filename = String(params.filename ?? `workflow-${Date.now()}`);
		const path = `${folder}/${filename}.md`;
		const content = typeof input === 'string' ? input : JSON.stringify(input, null, 2);

		// Ensure folder exists
		const folderRef = app.vault.getAbstractFileByPath(folder);
		if (!folderRef) {
			await app.vault.createFolder(folder);
		}

		await app.vault.create(path, content);
		return path;
	}

	private evaluateCondition(condition: string, input: unknown): boolean {
		// Simple condition evaluator
		if (condition === 'hasResults') {
			return Array.isArray(input) && input.length > 0;
		}
		if (condition === 'notEmpty') {
			if (input == null) return false;
			if (typeof input === 'string') return input.trim().length > 0;
			if (Array.isArray(input)) return input.length > 0;
			return true;
		}
		// Default: condition is truthy
		return true;
	}
}
