/**
 * eventDispatcher — pure event-routing function extracted from useEventRouter.
 *
 * ZERO React / Zustand imports. Everything is received via parameters so this
 * can be called from both a React hook (foreground) and a BackgroundSessionManager.
 */

import type { LLMStreamEvent, LLMUsage } from '@/core/providers/types';
import { StreamTriggerName, UISignalChannel } from '@/core/providers/types';
import { getDeltaEventDeltaText } from '@/core/providers/helpers/stream-helper';
import { v2ToolDisplay, extractV2Summary, unwrapToolOutput } from '../types/search-steps';
import type { V2ToolStep, V2Source } from '../types/search-steps';
import type { V2Section } from '../store/searchSessionStore';
import type { UIStepRecord } from '../store/aiAnalysisStore';
import type { SearchAgentResult } from '@/service/agents/shared-types';
import type { VaultHitlPauseEvent } from '@/service/agents/vault/types';
import type { PlanSnapshot } from '@/service/agents/vault/types';

import { AppContext } from '@/app/context/AppContext';
import { useUIEventStore } from '@/ui/store/uiEventStore';

import { flushUiStep } from './search-session-types';
import type { UiStepAccum } from './search-session-types';

// ---------------------------------------------------------------------------
// Interfaces — abstract store mutations for foreground & background targets
// ---------------------------------------------------------------------------

export interface EventDispatchTarget {
	// Reads
	getV2Active(): boolean;
	getV2ProposedOutline(): string | null;
	getStartedAt(): number | null;
	getV2StepsLength(): number;
	getV2Sources(): V2Source[];

	// Writes
	setV2Active(active: boolean): void;
	addPhaseUsage(usage: { phase: string; modelId: string; inputTokens: number; outputTokens: number }): void;
	pushV2TimelineText(id: string, chunk: string): void;
	resolveV2ToolName(id: string): string;
	updateV2Step(id: string, updater: (step: V2ToolStep) => V2ToolStep): void;
	updateV2TimelineTool(id: string, updater: (step: V2ToolStep) => V2ToolStep): void;
	appendAgentDebugLog(entry: { type: string; taskIndex?: number; data: Record<string, unknown> }): void;
	setDashboardUpdatedLine(line: string): void;
	setTitle(title: string | null): void;
	setHasAnalyzed(v: boolean): void;
	setUsage(usage: LLMUsage): void;
	setDuration(duration: number): void;
	markCompleted(): void;
	markV2ReportComplete(): void;
	recordError(error: string): void;
	setHitlPause(state: { pauseId: string; phase: string; snapshot: PlanSnapshot }): void;
	pushV2Step(step: V2ToolStep): void;
	pushV2TimelineTool(step: V2ToolStep): void;
	registerV2ToolCall(id: string, toolName: string): void;
	addV2Source(source: V2Source): void;
	setPlanSections(sections: V2Section[]): void;
	setProposedOutline(outline: string): void;
	setFollowUpQuestions(questions: string[]): void;
	setV2Sources(sources: V2Source[]): void;
}

export interface LegacyBridgeTarget {
	// Summary
	isSummaryStreaming(): boolean;
	startSummaryStreaming(): void;
	setSummary(summary: string): void;

	// Result
	setSources(sources: any): void;
	setEvidenceIndex(index: any): void;
	setDashboardBlocks(blocks: any): void;
	setTopics(topics: any): void;
	pushOverviewMermaidVersion(code: string, opts: { makeActive: boolean; dedupe: boolean }): void;

	// Runtime
	setTitle(title: string | null): void;
	setHasAnalyzed(v: boolean): void;
	setDashboardUpdatedLine(line: string): void;
	setUsage(usage: LLMUsage): void;
	setDuration(duration: number): void;
	recordError(error: string): void;
	setHitlPause(state: { pauseId: string; phase: string; snapshot: PlanSnapshot }): void;

	// Interactions
	setSuggestedFollowUpQuestions(questions: string[]): void;

	// Steps
	appendCompletedUiStep(step: UIStepRecord): void;

	// Orchestration
	markCompleted(): void;
}

export interface SummaryBuffer {
	appendDelta(delta: string): void;
	flush(): void;
}

export interface UiStepAccumRef {
	get(): UiStepAccum | UIStepRecord | null;
	set(val: UiStepAccum | UIStepRecord | null): void;
}

// ---------------------------------------------------------------------------
// applySearchResult — bridge to legacy stores + update target
// ---------------------------------------------------------------------------

export function applySearchResult(
	result: SearchAgentResult,
	target: EventDispatchTarget,
	legacy: LegacyBridgeTarget | null,
): void {
	if (result.summary) {
		legacy?.setSummary(result.summary);
	}
	if (result.sources) {
		legacy?.setSources(result.sources);
	}
	if (result.evidenceIndex !== undefined) {
		legacy?.setEvidenceIndex(result.evidenceIndex ?? {});
	}
	if (result.dashboardBlocks) {
		legacy?.setDashboardBlocks(result.dashboardBlocks);
	}
	if (result.topics) {
		legacy?.setTopics(result.topics);
	}
	if (result.evidenceMermaidOverviewAgent != null) {
		legacy?.pushOverviewMermaidVersion(
			result.evidenceMermaidOverviewAgent,
			{ makeActive: true, dedupe: true },
		);
	}
	if (result.title !== undefined) {
		target.setTitle(result.title ?? null);
		legacy?.setTitle(result.title ?? null);
	}
	if (result.suggestedFollowUpQuestions !== undefined) {
		legacy?.setSuggestedFollowUpQuestions(result.suggestedFollowUpQuestions ?? []);
	}
	target.setHasAnalyzed(true);
	legacy?.setHasAnalyzed(true);
}

// ---------------------------------------------------------------------------
// dispatchEvent — the entire switch from useEventRouter, as a pure function
// ---------------------------------------------------------------------------

export function dispatchEvent(
	event: LLMStreamEvent,
	target: EventDispatchTarget,
	legacy: LegacyBridgeTarget | null,
	summaryBuffer: SummaryBuffer,
	uiStepRef: UiStepAccumRef,
): void {
	const publish = (type: string, payload: any) => useUIEventStore.getState().publish(type, payload);

	switch (event.type) {
		// ---- Phase transitions (vault pipeline) ----
		case 'pk-debug': {
			const ev = event as any;
			if (ev.debugName === 'vault-sdk-starting') {
				target.setV2Active(true);
			}
			if (ev.debugName === 'phase-usage' && ev.extra) {
				target.addPhaseUsage({
					phase: ev.extra.phase ?? '',
					modelId: ev.extra.modelId ?? '',
					inputTokens: ev.extra.inputTokens ?? 0,
					outputTokens: ev.extra.outputTokens ?? 0,
				});
			}
			break;
		}

		case 'phase-transition': {
			publish('phase-transition', event);
			break;
		}

		// ---- Summary streaming ----
		case 'text-start': {
			if (
				event.triggerName === StreamTriggerName.SEARCH_SUMMARY ||
				event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
			) {
				if (!legacy?.isSummaryStreaming()) {
					legacy?.startSummaryStreaming();
				}
			}
			break;
		}
		case 'text-delta': {
			if (
				event.triggerName === StreamTriggerName.SEARCH_SUMMARY ||
				event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
			) {
				const delta = getDeltaEventDeltaText(event);
				summaryBuffer.appendDelta(delta);
			}
			// V2: text-delta goes to timeline; suppress post-submit_plan garbage
			else if (target.getV2Active()) {
				if (target.getV2ProposedOutline()) break;
				const delta = getDeltaEventDeltaText(event);
				if (delta) {
					target.pushV2TimelineText(`text-${Date.now()}`, delta);
				}
			}
			break;
		}
		case 'text-end': {
			if (
				event.triggerName === StreamTriggerName.SEARCH_SUMMARY ||
				event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
			) {
				summaryBuffer.flush();
			}
			break;
		}

		// ---- Tool results ----
		case 'tool-result': {
			const ev = event as any;
			const currentResult = ev.extra?.currentResult as SearchAgentResult | undefined;
			if (currentResult) applySearchResult(currentResult, target, legacy);
			const toolCallId = ev.id ?? '';
			const resolvedToolName = target.resolveV2ToolName(toolCallId);
			if (resolvedToolName.startsWith('mcp__vault__')) {
				const output = ev.output;
				const summary = extractV2Summary(resolvedToolName, output);
				const preview = unwrapToolOutput(output);
				const stepUpdate = (step: V2ToolStep) => ({
					...step,
					status: 'done' as const,
					endedAt: Date.now(),
					summary,
					resultPreview: preview?.slice(0, 2000),
				});
				target.updateV2Step(toolCallId, stepUpdate);
				target.updateV2TimelineTool(toolCallId, stepUpdate);
			}
			if (ev.toolName) {
				target.appendAgentDebugLog({
					type: 'tool-result',
					taskIndex: ev.taskIndex,
					data: { tool: ev.toolName, output: ev.output ?? null },
				});
			}
			break;
		}

		// ---- UI steps (timeline narration) ----
		case 'ui-step': {
			publish(event.type, event);
			const stepId = (event as any).stepId as string | undefined;
			const title = typeof (event as any).title === 'string' ? (event as any).title : '';
			const description = typeof (event as any).description === 'string' ? (event as any).description : '';

			if (
				event.triggerName === StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT &&
				title === 'Dashboard Updated' &&
				description
			) {
				target.setDashboardUpdatedLine(description);
				legacy?.setDashboardUpdatedLine(description);
			}

			if (stepId) {
				const prev = uiStepRef.get();
				if (prev && prev.stepId !== stepId) {
					legacy?.appendCompletedUiStep(flushUiStep(prev));
				}
				if (!prev || prev.stepId !== stepId) {
					uiStepRef.set({
						stepId,
						titleChunks: title ? [title] : [],
						descChunks: description ? [description] : [],
						startedAtMs: Date.now(),
					});
				} else if ('titleChunks' in prev) {
					prev.titleChunks = title ? [title] : prev.titleChunks;
					prev.descChunks = description !== '' ? [description] : prev.descChunks;
				}
			}
			break;
		}
		case 'ui-step-delta': {
			publish(event.type, event);
			const descDelta = typeof (event as any).descriptionDelta === 'string' ? (event as any).descriptionDelta : '';
			const titleDelta = typeof (event as any).titleDelta === 'string' ? (event as any).titleDelta : '';
			if (descDelta || titleDelta) {
				const cur = uiStepRef.get();
				if (cur && 'descChunks' in cur) {
					if (descDelta) cur.descChunks.push(descDelta);
					if (titleDelta) cur.titleChunks.push(titleDelta);
				}
			}
			break;
		}

		// ---- UI signals ----
		case 'ui-signal': {
			const ev = event as { channel?: string; payload?: { mermaid?: string; dimensions?: any; completedIndices?: any; tasks?: any; groupProgress?: any } };

			if (ev.channel === UISignalChannel.OVERVIEW_MERMAID && typeof ev.payload?.mermaid === 'string') {
				const code = ev.payload.mermaid.trim();
				legacy?.pushOverviewMermaidVersion(code, { makeActive: true, dedupe: true });
			}

			if (ev.channel === UISignalChannel.SEARCH_STAGE && ev.payload) {
				const payload = ev.payload as any;
				const stage = payload.stage as string | undefined;
				if (stage === 'report' && payload.status === 'blocks-complete' && payload.blocks) {
					legacy?.setDashboardBlocks(payload.blocks);
				}
			}

			publish(event.type, event);
			break;
		}

		// ---- Parallel stream progress ----
		case 'parallel-stream-progress': {
			publish('parallel-stream-progress', event);
			break;
		}

		// ---- Completion ----
		case 'complete': {
			const lastStep = uiStepRef.get();
			if (lastStep) {
				legacy?.appendCompletedUiStep(flushUiStep(lastStep));
				uiStepRef.set(null);
			}
			publish('complete', event);

			if (
				event.triggerName === StreamTriggerName.SEARCH_AI_AGENT ||
				event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
			) {
				const completeEvent = event as any;
				if (completeEvent.usage) {
					target.setUsage(completeEvent.usage);
					legacy?.setUsage(completeEvent.usage);
				}
				{
					const duration = completeEvent.durationMs || (target.getStartedAt() ? Date.now() - target.getStartedAt()! : 0);
					if (duration) {
						target.setDuration(duration);
						legacy?.setDuration(duration);
					}
				}

				const finalResult = completeEvent.result as SearchAgentResult | undefined;
				if (finalResult) {
					applySearchResult(finalResult, target, legacy);
				}

				target.markCompleted();
				if (target.getV2StepsLength() > 0) {
					target.markV2ReportComplete();
				}
				legacy?.markCompleted();
			}
			break;
		}

		// ---- Errors ----
		case 'error': {
			const errMsg = (event as any).error?.message ?? String((event as any).error);
			if (errMsg) {
				if (AppContext.getInstance().plugin.settings?.enableDevTools) {
					target.recordError(errMsg);
				}
				if (AppContext.getInstance().plugin.settings?.enableDevTools) {
					legacy?.recordError(errMsg);
				}
			}
			break;
		}

		// ---- HITL pause ----
		case 'hitl-pause': {
			const ev = event as unknown as VaultHitlPauseEvent;
			target.setHitlPause({
				pauseId: ev.pauseId,
				phase: ev.phase,
				snapshot: ev.snapshot,
			});
			legacy?.setHitlPause({
				pauseId: ev.pauseId,
				phase: ev.phase,
				snapshot: ev.snapshot,
			});
			break;
		}

		// ---- Agent progress / stats ----
		case 'agent-step-progress': {
			publish('agent-step-progress', event);
			break;
		}
		case 'agent-stats': {
			publish('agent-stats', event);
			break;
		}

		// Capture for debug export
		case 'reasoning-delta': {
			const ev = event as any;
			target.appendAgentDebugLog({
				type: 'reasoning',
				taskIndex: ev.taskIndex,
				data: { text: ev.text ?? ev.delta ?? '' },
			});
			break;
		}
		case 'tool-call': {
			const ev = event as any;
			target.appendAgentDebugLog({
				type: 'tool-call',
				taskIndex: ev.taskIndex,
				data: { tool: ev.toolName ?? '', args: ev.input ?? ev.args ?? {} },
			});
			const toolName = ev.toolName ?? '';
			if (toolName.startsWith('mcp__vault__')) {
				const input = ev.input ?? {};
				const { displayName, icon } = v2ToolDisplay(toolName, input);
				const step: V2ToolStep = {
					id: ev.id ?? `tc-${Date.now()}`,
					toolName,
					displayName,
					icon,
					input,
					status: 'running',
					startedAt: Date.now(),
				};
				target.pushV2Step(step);
				target.pushV2TimelineTool(step);
				target.registerV2ToolCall(step.id, toolName);
				const shortName = toolName.replace(/^mcp__vault__/, '');
				if (shortName === 'vault_read_note') {
					const path = String(input.path ?? '');
					if (path) {
						target.addV2Source({
							path,
							title: path.split('/').pop()?.replace(/\.md$/, '') || path,
							readAt: Date.now(),
						});
					}
				}
				if (shortName === 'vault_submit_plan') {
					const outline = input.proposed_outline;
					if (typeof outline === 'string' && outline.trim()) {
						target.setProposedOutline(outline);
					}
					const followUps = input.follow_up_questions;
					if (Array.isArray(followUps) && followUps.length > 0) {
						target.setFollowUpQuestions(followUps.filter((q: unknown) => typeof q === 'string' && q.length > 5));
					}
					const rationale = typeof input.rationale === 'string' ? input.rationale : '';
					if (rationale) {
						const lines = rationale.split('\n').filter((l: string) => l.trim());
						const reasoningMap = new Map<string, string>();
						for (const line of lines) {
							const match = line.match(/^[-*]?\s*(.+?\.md)\s*[:：]\s*(.+)/);
							if (match) {
								const filename = match[1].split('/').pop()?.replace(/\.md$/, '') || '';
								reasoningMap.set(filename.toLowerCase(), match[2].trim());
							}
						}
						if (reasoningMap.size > 0) {
							const currentSources = target.getV2Sources();
							const enriched = currentSources.map((src) => {
								const key = src.title.toLowerCase();
								const r = reasoningMap.get(key);
								return r ? { ...src, reasoning: r } : src;
							});
							target.setV2Sources(enriched);
						}
					}
					const planSections = input.plan_sections;
					if (Array.isArray(planSections) && planSections.length > 0) {
						const sections: V2Section[] = planSections.map((ps: any) => ({
							id: ps.id ?? `s${Math.random().toString(36).slice(2, 6)}`,
							title: ps.title ?? '',
							contentType: ps.content_type ?? 'analysis',
							visualType: ps.visual_type ?? 'none',
							evidencePaths: Array.isArray(ps.evidence_paths) ? ps.evidence_paths : [],
							brief: ps.brief ?? '',
							missionRole: ps.mission_role ?? 'synthesis',
							weight: typeof ps.weight === 'number' ? ps.weight : 5,
							status: 'pending' as const,
							content: '',
							streamingChunks: [],
							generations: [],
						}));
						target.setPlanSections(sections);
						for (const sec of sections) {
							for (const ep of sec.evidencePaths) {
								target.addV2Source({
									path: ep,
									title: ep.split('/').pop()?.replace(/\.md$/, '') || ep,
									readAt: Date.now(),
								});
							}
						}
					}
				}
			}
			break;
		}

		default:
			break;
	}
}
