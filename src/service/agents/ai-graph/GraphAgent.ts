/** Knowledge-graph agent executed entirely by Peak Harness. */

import type { AppHandle } from '@/core/ports/AppHandle';
import { PromptId } from '@/core/types/prompt';
import { TemplateManager } from '@/core/template/TemplateManager';
import type { GraphOutput } from './graph-output-types';
import { buildGraphTools } from './graphTools';
import { buildGraphSystemPrompt } from './graph-system-prompt';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import {
	assertSuccessfulRun,
	runHarnessModel,
} from '@/service/agents/harness/HarnessModelRunner';

export interface GraphAgentInput {
    searchQuery: string;
    sources: Array<{ path: string; title?: string; score?: number }>;
}

export type GraphAgentStepCallback = (event: {
    type: 'step-start' | 'step-done' | 'thinking';
    id: string;
    label: string;
    detail?: string;
}) => void;

export class GraphAgent {

    constructor(
        private readonly app: AppHandle,
        private readonly pluginId: string,
    ) {}

    async warmup(): Promise<void> {
        // Harness providers are created lazily for the selected profile.
    }

    async generateGraph(input: GraphAgentInput, signal?: AbortSignal, onStep?: GraphAgentStepCallback): Promise<GraphOutput | null> {
        const binding = ProfileRegistry.getInstance().getActiveAgentConfig();
        if (!binding) {
            throw new Error('No active profile configured. Please set up a profile in Settings → Profiles.');
        }

        const sourcesMeta = input.sources.map(s => {
            const file = this.app.vault.getFileByPath(s.path);
            const folder = s.path.includes('/') ? s.path.split('/').slice(0, -1).join('/') : '/';
            const filename = s.path.split('/').pop() ?? s.path;
            return {
                path: s.path,
                folder,
                filename,
                createdAt: file?.stat?.ctime,
                modifiedAt: file?.stat?.mtime,
                relevanceScore: s.score,
            };
        });

        const systemPrompt = await buildGraphSystemPrompt(input.searchQuery, sourcesMeta);

        let graphResult: GraphOutput | null = null;
        let graphSubmitted = false;

        const graphTools = buildGraphTools({
            app: this.app,
            onSubmitGraph: async (graph) => {
                graphResult = graph;
                graphSubmitted = true;
            },
        });

        try {
            const tm = TemplateManager.getInstance();
            if (!tm) throw new Error('TemplateManager not bound — cannot render graph agent user prompt.');
            const userPrompt = await tm.render(PromptId.GraphAgentUser, {
                sourceCount: input.sources.length,
                searchQuery: input.searchQuery,
            });
            const result = await runHarnessModel({
                loopId: `graph-agent-${this.pluginId}-${Date.now()}`,
                profile: binding.profile,
                modelId: binding.modelId,
                prompt: userPrompt,
                systemPrompt,
                tools: graphTools,
                maxSteps: 10,
                maxToolCalls: 12,
                signal,
                stopWhen: () => graphSubmitted,
                treatBareTextAsFinal: false,
                bareTextContinuationNudge: 'Continue the analysis and call mcp__graph__submit_graph with the completed graph.',
                onStreamEvent: (event) => {
                    if (event.type === 'tool_call') {
                        if (event.toolName === 'mcp__graph__read_sources') {
                            onStep?.({ type: 'step-start', id: 'read', label: `Reading ${input.sources.length} source files...` });
                            onStep?.({ type: 'step-start', id: 'analyze', label: 'Analyzing document relations, clusters, and evolution chains...' });
                        }
                        if (event.toolName === 'mcp__graph__submit_graph') {
                            onStep?.({ type: 'step-done', id: 'read', label: 'Source files loaded' });
                            onStep?.({ type: 'step-done', id: 'analyze', label: 'Document analysis complete' });
                            onStep?.({ type: 'step-start', id: 'submit', label: 'Building graph structure...' });
                        }
                    }
                    if (event.type === 'text_delta' && event.stepIndex > 0) {
                        const detail = event.delta.length > 100
                            ? `${event.delta.slice(0, 100)}...`
                            : event.delta;
                        if (detail) {
                            onStep?.({ type: 'thinking', id: 'analyze', label: 'Analyzing document relations, clusters, and evolution chains...', detail });
                        }
                    }
                },
            });
            assertSuccessfulRun(result);
        } catch (err) {
            console.error('[GraphAgent] Harness run failed', err);
            return null;
        }

        return graphResult;
    }
}
