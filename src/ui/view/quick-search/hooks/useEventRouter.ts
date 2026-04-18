/**
 * useEventRouter — routes LLM stream events to the appropriate stores.
 *
 * Extracted from useSearchSession to isolate event-dispatch logic.
 */

import { useCallback, useRef } from 'react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import {
	useAIAnalysisRuntimeStore,
	useAIAnalysisStepsStore,
	useAIAnalysisSummaryStore,
	useAIAnalysisResultStore,
	useAIAnalysisInteractionsStore,
	markAIAnalysisCompleted,
} from '../store/aiAnalysisStore';
import type { UIStepRecord } from '../store/aiAnalysisStore';
import { useUIEventStore } from '@/ui/store/uiEventStore';

import { AppContext } from '@/app/context/AppContext';
import type { SearchAgentResult } from '@/service/agents/shared-types';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName, UISignalChannel } from '@/core/providers/types';
import { getDeltaEventDeltaText } from '@/core/providers/helpers/stream-helper';
import { createStep, v2ToolDisplay, extractV2Summary, unwrapToolOutput } from '../types/search-steps';
import type { V2ToolStep } from '../types/search-steps';
import type { V2Section } from '../store/searchSessionStore';

import type { VaultHitlPauseEvent, VaultPhaseTransitionEvent } from '@/service/agents/vault/types';

import { SUMMARY_FLUSH_MS, flushUiStep } from './search-session-types';
import type { UiStepAccum } from './search-session-types';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEventRouter() {
	const store = useSearchSessionStore;

	// Summary delta buffer (120 ms debounce)
	const summaryBufferRef = useRef<string[]>([]);
	const summaryFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// UI step accumulator
	const currentUiStepRef = useRef<UiStepAccum | UIStepRecord | null>(null);

	// -------------------------------------------------------------------
	// Summary buffer helpers
	// -------------------------------------------------------------------

	const flushSummaryBuffer = useCallback(() => {
		if (summaryFlushTimerRef.current) {
			clearTimeout(summaryFlushTimerRef.current);
			summaryFlushTimerRef.current = null;
		}
		const chunks = summaryBufferRef.current;
		if (chunks.length === 0) return;
		const joined = chunks.join('');
		summaryBufferRef.current = [];

		// New store: append to summary step
		const s = store.getState();
		const hasSummary = s.steps.some((st) => st.type === 'summary');
		if (hasSummary) {
			store.getState().updateStep('summary', (step) => ({
				...step,
				chunks: [...step.chunks, joined],
			}));
		}

		// Bridge: old store
		useAIAnalysisSummaryStore.getState().appendSummaryDelta(joined);
	}, [store]);

	const bufferSummaryDelta = useCallback((delta: string) => {
		if (!delta) return;
		summaryBufferRef.current.push(delta);
		if (summaryFlushTimerRef.current) return;
		summaryFlushTimerRef.current = setTimeout(() => {
			summaryFlushTimerRef.current = null;
			flushSummaryBuffer();
		}, SUMMARY_FLUSH_MS);
	}, [flushSummaryBuffer]);

	// -------------------------------------------------------------------
	// applySearchResult — bridge to old stores + update new steps
	// -------------------------------------------------------------------

	const applySearchResult = useCallback((result: SearchAgentResult) => {
		const ss = store.getState();

		// Summary: prefer streamed content
		if (result.summary) {
			const summaryStep = ss.getStep('summary');
			const streamed = (summaryStep?.chunks ?? []).join('').trim();
			if (streamed.length === 0) {
				// Old store bridge
				useAIAnalysisSummaryStore.getState().setSummary(result.summary);
			}
		}

		// Sources
		if (result.sources) {
			// Ensure sources step exists
			if (!ss.steps.some((st) => st.type === 'sources')) {
				store.getState().pushStep(createStep('sources'));
			}
			store.getState().updateStep('sources', (step) => ({
				...step,
				sources: result.sources,
				evidenceIndex: result.evidenceIndex ?? step.evidenceIndex,
			}));
			// Bridge
			useAIAnalysisResultStore.getState().setSources(result.sources);
		}
		if (result.evidenceIndex !== undefined) {
			useAIAnalysisResultStore.getState().setEvidenceIndex(result.evidenceIndex ?? {});
		}

		// Dashboard blocks + summary
		if (result.dashboardBlocks || result.summary) {
			// Ensure report step exists
			if (!ss.steps.some((st) => st.type === 'report')) {
				store.getState().pushStep(createStep('report'));
			}
			store.getState().updateStep('report', (step) => ({
				...step,
				blocks: result.dashboardBlocks ?? step.blocks,
				summary: result.summary ?? step.summary,
			}));
			// Bridge
			if (result.dashboardBlocks) {
				useAIAnalysisResultStore.getState().setDashboardBlocks(result.dashboardBlocks);
			}
		}

		// Topics
		if (result.topics) {
			// Bridge
			useAIAnalysisResultStore.getState().setTopics(result.topics);
		}

		// Graph (overview mermaid)
		if (result.evidenceMermaidOverviewAgent != null) {
			if (!ss.steps.some((st) => st.type === 'graph')) {
				store.getState().pushStep(createStep('graph'));
			}
			store.getState().updateStep('graph', (step) => {
				const versions = [...step.overviewMermaidVersions];
				const code = result.evidenceMermaidOverviewAgent!;
				if (versions.length === 0 || versions[versions.length - 1] !== code) {
					versions.push(code);
				}
				return {
					...step,
					overviewMermaidVersions: versions,
					overviewMermaidActiveIndex: versions.length - 1,
				};
			});
			// Bridge
			useAIAnalysisResultStore.getState().pushOverviewMermaidVersion(
				result.evidenceMermaidOverviewAgent,
				{ makeActive: true, dedupe: true },
			);
		}

		// Title
		if (result.title !== undefined) {
			store.getState().setTitle(result.title ?? null);
			// Bridge
			useAIAnalysisRuntimeStore.getState().setTitle(result.title ?? null);
		}

		// Follow-up questions
		if (result.suggestedFollowUpQuestions !== undefined) {
			useAIAnalysisInteractionsStore.getState().setSuggestedFollowUpQuestions(
				result.suggestedFollowUpQuestions ?? [],
			);
		}

		// HasAnalyzed
		store.getState().setHasAnalyzed(true);
		// Bridge
		useAIAnalysisRuntimeStore.getState().setHasAnalyzed(true);
	}, [store]);

	// -------------------------------------------------------------------
	// routeEvent (inlined dispatcher)
	// -------------------------------------------------------------------

	const routeEvent = useCallback((event: LLMStreamEvent) => {
		console.debug('[useSearchSession] routeEvent:', event);
		const publish = (type: string, payload: any) => useUIEventStore.getState().publish(type, payload);

		switch (event.type) {
			// ---- Phase transitions (vault pipeline) ----
			case 'pk-debug': {
				const ev = event as any;
				if (ev.debugName === 'vault-sdk-starting') {
					store.getState().setV2Active(true);
				}
				if (ev.debugName === 'phase-usage' && ev.extra) {
					store.getState().addPhaseUsage({
						phase: ev.extra.phase ?? '',
						modelId: ev.extra.modelId ?? '',
						inputTokens: ev.extra.inputTokens ?? 0,
						outputTokens: ev.extra.outputTokens ?? 0,
					});
				}
				break;
			}

			case 'phase-transition': {
				const ev = event as unknown as VaultPhaseTransitionEvent;
				store.getState().pushPhaseStep(ev.to);
				publish('phase-transition', event);
				break;
			}

			// ---- Summary streaming ----
			case 'text-start': {
				if (
					event.triggerName === StreamTriggerName.SEARCH_SUMMARY ||
					event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
				) {
					// Ensure summary step exists
					const ss = store.getState();
					if (!ss.steps.some((st) => st.type === 'summary')) {
						store.getState().pushStep(createStep('summary'));
					}
					store.getState().updateStep('summary', (step) => ({
						...step,
						streaming: true,
					}));
					// Bridge
					if (!useAIAnalysisSummaryStore.getState().isSummaryStreaming) {
						useAIAnalysisSummaryStore.getState().startSummaryStreaming();
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
					bufferSummaryDelta(delta);
				}
				// V2: text-delta goes to timeline; suppress post-submit_plan garbage
				else if (store.getState().v2Active) {
					// If proposed_outline is already captured, ignore subsequent text (agent self-talk)
					if (store.getState().v2ProposedOutline) break;
					const delta = getDeltaEventDeltaText(event);
					if (delta) {
						store.getState().pushV2TimelineText(`text-${Date.now()}`, delta);
					}
				}
				break;
			}
			case 'text-end': {
				if (
					event.triggerName === StreamTriggerName.SEARCH_SUMMARY ||
					event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
				) {
					flushSummaryBuffer();
				}
				break;
			}

			// ---- Tool results ----
			case 'tool-result': {
				const ev = event as any;
				const currentResult = ev.extra?.currentResult as SearchAgentResult | undefined;
				if (currentResult) applySearchResult(currentResult);
				// V2: update step card with summary
				const toolCallId = ev.id ?? '';
				const resolvedToolName = store.getState().resolveV2ToolName(toolCallId);
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
					store.getState().updateV2Step(toolCallId, stepUpdate);
					store.getState().updateV2TimelineTool(toolCallId, stepUpdate);
				}
				// Debug capture: log tool output (output field, not result)
				if (ev.toolName) {
					store.getState().appendAgentDebugLog({
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

				// Dashboard Updated detection
				if (
					event.triggerName === StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT &&
					title === 'Dashboard Updated' &&
					description
				) {
					store.getState().setDashboardUpdatedLine(description);
					// Bridge
					useAIAnalysisRuntimeStore.getState().setDashboardUpdatedLine(description);
				}

				if (stepId) {
					const prev = currentUiStepRef.current;
					if (prev && prev.stepId !== stepId) {
						// Bridge: old steps store
						useAIAnalysisStepsStore.getState().appendCompletedUiStep(flushUiStep(prev));
					}
					if (!prev || prev.stepId !== stepId) {
						currentUiStepRef.current = {
							stepId,
							titleChunks: title ? [title] : [],
							descChunks: description ? [description] : [],
							startedAtMs: Date.now(),
						};
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
					const cur = currentUiStepRef.current;
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

				// Overview mermaid
				if (ev.channel === UISignalChannel.OVERVIEW_MERMAID && typeof ev.payload?.mermaid === 'string') {
					const code = ev.payload.mermaid.trim();
					// New store
					const ss = store.getState();
					if (!ss.steps.some((st) => st.type === 'graph')) {
						store.getState().pushStep(createStep('graph'));
					}
					store.getState().updateStep('graph', (step) => {
						const versions = [...step.overviewMermaidVersions];
						if (versions.length === 0 || versions[versions.length - 1] !== code) {
							versions.push(code);
						}
						return {
							...step,
							overviewMermaidVersions: versions,
							overviewMermaidActiveIndex: versions.length - 1,
						};
					});
					// Bridge
					useAIAnalysisResultStore.getState().pushOverviewMermaidVersion(code, { makeActive: true, dedupe: true });
				}

				// Search stage signals — route to correct step type
				if (ev.channel === UISignalChannel.SEARCH_STAGE && ev.payload) {
					const payload = ev.payload as any;
					const stage = payload.stage as string | undefined;
					const ss = store.getState();

					// Classify: populate dimensions
					if (stage === 'classify' && Array.isArray(payload.dimensions)) {
							if (ss.steps.some((st) => st.type === 'classify')) {
							store.getState().updateStep('classify', (step) => ({
								...step,
								dimensions: payload.dimensions.map((d: any) =>
									typeof d === 'object' && d !== null
										? {
											id: d.id ?? '',
											intent_description: d.intent_description,
											axis: d.axis ?? 'semantic',
											scope_constraint: d.scope_constraint ?? null,
										}
										: { id: String(d), intent_description: '', axis: 'semantic' as const, scope_constraint: null }
								),
							}));
						}
					}

					// Decompose: populate taskCount + task descriptions
					if (stage === 'decompose' && typeof payload.taskCount === 'number') {
						if (ss.steps.some((st) => st.type === 'decompose')) {
							store.getState().updateStep('decompose', (step) => ({
								...step,
								taskCount: payload.taskCount,
								dimensionCount: payload.dimensionCount ?? step.dimensionCount,
								taskDescriptions: Array.isArray(payload.tasks)
									? payload.tasks.map((t: any) => ({
										id: t.id ?? '',
										description: t.description ?? '',
										targetAreas: t.targetAreas ?? [],
										toolHints: t.toolHints ?? [],
										coveredDimensionIds: t.coveredDimensionIds ?? [],
										searchPriority: t.searchPriority ?? 0,
									}))
									: step.taskDescriptions,
							}));
						}
					}

					// Report: blocks complete (stage 1 done, summary about to stream)
				if (stage === 'report' && payload.status === 'blocks-complete') {
					if (!ss.steps.some((st) => st.type === 'report')) {
						store.getState().pushStep(createStep('report'));
					}
					store.getState().updateStep('report', (step) => ({
						...step,
						blocks: payload.blocks ?? step.blocks,
						blockOrder: payload.blockOrder ?? step.blockOrder,
					}));
				}

				// Report: stream executive summary text (stage 2)
				if (stage === 'report' && payload.status === 'progress') {
					if (!ss.steps.some((st) => st.type === 'report')) {
						store.getState().pushStep(createStep('report'));
					}
					if (typeof payload.streamingText === 'string') {
						store.getState().updateStep('report', (step) => ({
							...step,
							streamingText: payload.streamingText,
						}));
					}
				}

				// Plan: stream partial outline + sections while LLM is generating
					if (stage === 'plan' && payload.status === 'progress') {
						if (ss.steps.some((st) => st.type === 'plan')) {
							store.getState().updateStep('plan', (step) => {
								const prev = step.snapshot ?? { evidence: [], proposedOutline: '', suggestedSections: [], coverageAssessment: '', confidence: 'low' as const };
								return {
									...step,
									snapshot: {
										...prev,
										proposedOutline: payload.outlineFull ?? prev.proposedOutline,
										suggestedSections: payload.newSections
											? [...(prev.suggestedSections ?? []), ...payload.newSections]
											: prev.suggestedSections,
									},
								};
							});
						}
					}

					// Recon: populate progress data
					if (stage === 'recon' || (!stage && (payload.completedIndices || payload.total != null || payload.groupId != null))) {
						if (ss.steps.some((st) => st.type === 'recon')) {
							store.getState().updateStep('recon', (step) => {
								const updated = { ...step };
								if (Array.isArray(payload.completedIndices)) {
									updated.completedIndices = payload.completedIndices;
									// Mark individual tasks as done when their index appears in completedIndices
									const doneSet = new Set<number>(payload.completedIndices);
									updated.tasks = step.tasks.map((t) =>
										doneSet.has(t.index) && !t.done ? { ...t, done: true } : t
									);
								}
								if (typeof payload.total === 'number') updated.total = payload.total;
								if (Array.isArray(payload.dimensions)) updated.dimensions = payload.dimensions;
								// Per-group evidence progress
								if (payload.groupId != null) {
									updated.groupProgress = {
										...updated.groupProgress,
										[payload.groupId]: {
											completedTasks: payload.completedTasks ?? updated.groupProgress[payload.groupId]?.completedTasks ?? 0,
											totalTasks: payload.totalTasks ?? updated.groupProgress[payload.groupId]?.totalTasks ?? 0,
											currentPath: payload.currentPath,
										},
									};
								}
								return updated;
							});
						}
					}
				}

				publish(event.type, event);
				break;
			}

			// ---- Parallel stream progress ----
			case 'parallel-stream-progress': {
				const ev = event as any;
				const ss = store.getState();
				if (ss.steps.some((st) => st.type === 'recon')) {
					store.getState().updateStep('recon', (step) => ({
						...step,
						completedIndices: ev.completedIndices ?? step.completedIndices,
						total: ev.total ?? step.total,
					}));
				}
				publish('parallel-stream-progress', event);
				break;
			}

			// ---- Completion ----
			case 'complete': {
				// Flush last UI step
				const lastStep = currentUiStepRef.current;
				if (lastStep) {
					useAIAnalysisStepsStore.getState().appendCompletedUiStep(flushUiStep(lastStep));
					currentUiStepRef.current = null;
				}
				publish('complete', event);

				if (
					event.triggerName === StreamTriggerName.SEARCH_AI_AGENT ||
					event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
				) {
					// Set usage and duration
					const completeEvent = event as any;
					if (completeEvent.usage) {
						store.getState().setUsage(completeEvent.usage);
						// Bridge
						useAIAnalysisRuntimeStore.getState().setUsage(completeEvent.usage);
					}
					{
						const duration = completeEvent.durationMs || (store.getState().startedAt ? Date.now() - store.getState().startedAt! : 0);
						if (duration) {
							store.getState().setDuration(duration);
							// Bridge
							useAIAnalysisRuntimeStore.getState().setDuration(duration);
						}
					}

					const finalResult = completeEvent.result as SearchAgentResult | undefined;
					if (finalResult) {
						applySearchResult(finalResult);
					}

					// Notice (success): only when modal is closed and not canceled
					// Note: didCancelRef and noticeSentRef are managed by the caller
					// We emit a custom flag via return value instead

					store.getState().markCompleted();
					// V2: mark report done
					if (store.getState().v2Steps.length > 0) {
						store.getState().markV2ReportComplete();
					}
					// Bridge
					markAIAnalysisCompleted();
				}
				break;
			}

			// ---- Errors ----
			case 'error': {
				const errMsg = (event as any).error?.message ?? String((event as any).error);
				if (errMsg) {
					if (AppContext.getInstance().plugin.settings?.enableDevTools) {
						store.getState().recordError(errMsg);
					}
					// Bridge
					if (AppContext.getInstance().plugin.settings?.enableDevTools) {
						useAIAnalysisRuntimeStore.getState().recordError(errMsg);
					}
				}
				break;
			}

			// ---- HITL pause ----
			case 'hitl-pause': {
				const ev = event as unknown as VaultHitlPauseEvent;

				// Update plan step
				const ss = store.getState();
				if (ss.steps.some((st) => st.type === 'plan')) {
					store.getState().updateStep('plan', (step) => ({
						...step,
						snapshot: ev.snapshot,
						hitlPauseId: ev.pauseId,
						hitlPhase: ev.phase,
					}));
				}

				store.getState().setHitlPause({
					pauseId: ev.pauseId,
					phase: ev.phase,
					snapshot: ev.snapshot,
				});
				// Bridge
				useAIAnalysisRuntimeStore.getState().setHitlPause({
					pauseId: ev.pauseId,
					phase: ev.phase,
					snapshot: ev.snapshot,
				});
				break;
			}

			// ---- Agent progress / stats ----
			case 'agent-step-progress': {
				// Capture in recon step for displaying plan/tool details per task
				const progEv = event as any;
				const ss = store.getState();
				if (ss.steps.some((st) => st.type === 'recon' && st.status === 'running')) {
					store.getState().updateStep('recon', (step) => ({
						...step,
						progressLog: [...step.progressLog, {
							label: progEv.stepLabel ?? '',
							detail: progEv.detail ?? '',
							timestamp: Date.now(),
							taskIndex: progEv.taskIndex,
						}],
					}));
				}
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
				store.getState().appendAgentDebugLog({
					type: 'reasoning',
					taskIndex: ev.taskIndex,
					// reasoning-delta event uses 'text' field (not 'delta')
					data: { text: ev.text ?? ev.delta ?? '' },
				});
				// V2: reasoning is debug-only, not shown in timeline (low signal-to-noise for users)
				break;
			}
			case 'tool-call': {
				const ev = event as any;
				// Debug log (existing behavior)
				store.getState().appendAgentDebugLog({
					type: 'tool-call',
					taskIndex: ev.taskIndex,
					data: { tool: ev.toolName ?? '', args: ev.input ?? ev.args ?? {} },
				});
				// V2: create step card for vault tools
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
					store.getState().pushV2Step(step);
					store.getState().pushV2TimelineTool(step);
					store.getState().registerV2ToolCall(step.id, toolName);
					const shortName = toolName.replace(/^mcp__vault__/, '');
					// Source extraction for vault_read_note
					if (shortName === 'vault_read_note') {
						const path = String(input.path ?? '');
						if (path) {
							store.getState().addV2Source({
								path,
								title: path.split('/').pop()?.replace(/\.md$/, '') || path,
								readAt: Date.now(),
							});
						}
					}
					// Extract proposed_outline from vault_submit_plan as the real report
					// Don't push into timeline — report is shown in Report View only
					if (shortName === 'vault_submit_plan') {
						const outline = input.proposed_outline;
						if (typeof outline === 'string' && outline.trim()) {
							useSearchSessionStore.setState({ v2ProposedOutline: outline });
						}
						// Extract structured follow-up questions
						const followUps = input.follow_up_questions;
						if (Array.isArray(followUps) && followUps.length > 0) {
							useSearchSessionStore.setState({ v2FollowUpQuestions: followUps.filter((q: unknown) => typeof q === 'string' && q.length > 5) });
						}
						// Enrich existing sources with rationale
						const rationale = typeof input.rationale === 'string' ? input.rationale : '';
						if (rationale) {
							const lines = rationale.split('\n').filter((l: string) => l.trim());
							const reasoningMap = new Map<string, string>();
							for (const line of lines) {
								// Parse "path: reasoning" or "- path: reasoning" patterns
								const match = line.match(/^[-*]?\s*(.+?\.md)\s*[:：]\s*(.+)/);
								if (match) {
									const filename = match[1].split('/').pop()?.replace(/\.md$/, '') || '';
									reasoningMap.set(filename.toLowerCase(), match[2].trim());
								}
							}
							if (reasoningMap.size > 0) {
								const currentSources = store.getState().v2Sources;
								const enriched = currentSources.map((src) => {
									const key = src.title.toLowerCase();
									const r = reasoningMap.get(key);
									return r ? { ...src, reasoning: r } : src;
								});
								useSearchSessionStore.setState({ v2Sources: enriched });
							}
						}
						// Extract structured plan sections
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
							store.getState().setPlanSections(sections);
							// Sync all evidence paths to v2Sources so Sources tab is complete
							for (const sec of sections) {
								for (const ep of sec.evidencePaths) {
									store.getState().addV2Source({
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
	}, [store, applySearchResult, bufferSummaryDelta, flushSummaryBuffer]);

	return { routeEvent, flushSummaryBuffer, applySearchResult, currentUiStepRef, summaryBufferRef };
}
