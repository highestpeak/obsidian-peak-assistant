import { streamText } from 'ai';
import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import type { V2Section } from '@/ui/view/quick-search/store/searchSessionStore';
import { pLimit, streamWithRepetitionGuard, detectRepetition } from './stream-utils';
import { validateMermaidCode } from '@/core/utils/analysis-data-validator';
import { parallelStream } from '@/core/providers/helpers/stream-helper';
import type { LLMStreamEvent } from '@/core/providers/types';

/**
 * Multi-agent report orchestrator.
 *
 * Per section (parallel):
 *   1. Content Agent — streamText → section markdown
 *   2. Visual Blueprint Agent — streamText → mermaid diagram (if visual_type != 'none' and content lacks mermaid)
 *
 * After all sections:
 *   3. Summary Agent — streamText → executive summary
 *
 * On demand:
 *   - Mermaid Fix Agent — streamText → fix broken mermaid syntax
 *   - Section Regeneration — re-run content agent with optional user prompt
 */
export class ReportOrchestrator {
    private readonly mgr: AIServiceManager;

    constructor(aiServiceManager: AIServiceManager) {
        this.mgr = aiServiceManager;
    }

    private get store() {
        return useSearchSessionStore;
    }

    // -----------------------------------------------------------------------
    // Evidence reader
    // -----------------------------------------------------------------------

    private async readEvidence(paths: string[]): Promise<string> {
        const vault = AppContext.getInstance().app.vault;
        const chunks: string[] = [];
        for (const p of paths) {
            const file = vault.getAbstractFileByPath(p);
            if (!file || !('extension' in file)) continue;
            try {
                const content = await vault.cachedRead(file as any);
                chunks.push(`### [[${p.replace(/\.md$/, '')}]]\n${content.slice(0, 3000)}`);
            } catch { /* skip unreadable */ }
        }
        return chunks.join('\n\n---\n\n');
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    async generateReport(
        sections: V2Section[],
        allEvidencePaths: string[],
        overview: string,
        userQuery: string,
    ): Promise<void> {
        // Pass 0: assign user insights to sections (if any)
        const insights = this.store.getState().v2UserInsights;
        if (insights.length > 0) {
            await this.assignInsightsToSections(insights, sections, userQuery);
            // Re-read sections (may have new ones added)
            sections = this.store.getState().v2PlanSections;
        }

        // Mark all sections as generating
        for (const sec of sections) {
            this.store.getState().updatePlanSection(sec.id, (s) => ({ ...s, status: 'generating' }));
        }

        // Pre-prepare ALL section params (evidence + prompts) BEFORE firing any streamText.
        // This ensures all streamText() calls happen in the same microtask window → fetch fires simultaneously.
        const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSection);
        const sectionParams = await Promise.all(sections.map(async (sec) => {
            const evidenceContent = await this.readEvidence(sec.evidencePaths);
            const otherSections = sections
                .filter((s) => s.id !== sec.id)
                .map((s) => `- ${s.title} (${s.contentType})`)
                .join('\n');
            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisReportSectionSystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisReportSection, {
                    userQuery,
                    reportOverview: overview,
                    sectionTitle: sec.title,
                    contentType: sec.contentType,
                    visualType: sec.visualType,
                    sectionBrief: sec.brief,
                    otherSections,
                    evidenceContent,
                    userPrompt: '',
                    missionRole: sec.missionRole ?? 'synthesis',
                    userNotes: this.store.getState().v2UserInsights.join('\n') || '',
                }),
            ]);
            return { sec, systemPrompt, userMessage };
        }));

        // Fire ALL streamText calls at once — fetch starts immediately in constructor
        const streams = sectionParams.map(({ sec, systemPrompt, userMessage }) => {
            const controller = new AbortController();
            const result = streamText({
                model,
                system: systemPrompt,
                prompt: userMessage,
                maxTokens: 800,
                abortSignal: controller.signal,
            });
            console.log(`[Section:${sec.id.slice(0, 8)}] streamText fired`);
            return { sec, result, controller };
        });

        // Now consume all streams in parallel — each with its own independent consumer
        const summaryPromise = this.runSummaryAgent(sections, allEvidencePaths, overview, userQuery);

        const contentPromises = streams.map(async ({ sec, result, controller }) => {
            try {
                let fullText = '';
                let lastCheckLen = 0;
                for await (const chunk of result.fullStream) {
                    if (chunk.type === 'text-delta') {
                        fullText += chunk.text;
                        this.store.getState().appendSectionChunk(sec.id, chunk.text);
                        if (fullText.length - lastCheckLen > 200) {
                            lastCheckLen = fullText.length;
                            const truncAt = detectRepetition(fullText);
                            if (truncAt > 0) {
                                controller.abort();
                                break;
                            }
                        }
                    }
                }
                if (fullText) {
                    this.store.getState().completeSectionContent(sec.id, fullText);
                } else {
                    this.store.getState().failSection(sec.id, 'No content generated');
                }
            } catch (err: any) {
                this.store.getState().failSection(sec.id, err?.message ?? 'Content generation failed');
            }
        });

        await Promise.all([summaryPromise, ...contentPromises]);

        // Pass 2: visuals run after all content is done
        const limit = pLimit(3);
        await Promise.all(sections.map((sec) => limit(async () => {
            await this.runVisualAgent(sec);
        })));
    }

    async regenerateSection(
        sectionId: string,
        allSections: V2Section[],
        overview: string,
        userQuery: string,
        userPrompt?: string,
    ): Promise<void> {
        this.store.getState().startSectionRegenerate(sectionId);
        const section = this.store.getState().v2PlanSections.find((s) => s.id === sectionId);
        if (!section) return;
        await this.runContentAgent(section, allSections, overview, userQuery, userPrompt);
        await this.runVisualAgent(section);
    }

    async fixMermaid(sectionId: string, brokenMermaid: string, errorMessage: string): Promise<string | null> {
        return this.runMermaidFixAgent(brokenMermaid, errorMessage);
    }

    // -----------------------------------------------------------------------
    // Agent 0: Assign user insights to sections
    // -----------------------------------------------------------------------

    private async assignInsightsToSections(
        insights: string[],
        sections: V2Section[],
        userQuery: string,
    ): Promise<void> {
        const sectionList = sections.map((s) => `- ${s.id}: ${s.title} (${s.missionRole})`).join('\n');
        const insightList = insights.map((ins, i) => `${i + 1}. ${ins}`).join('\n');

        const prompt = `You are assigning user insights to report sections.

## Sections
${sectionList}

## User Insights
${insightList}

## Query
${userQuery}

For each insight, decide:
1. Which section id it belongs to (append to that section's brief)
2. Or if it needs a NEW section (output "NEW" with a title and mission_role)

Output JSON array: [{ "insight_index": 0, "section_id": "s1" | "NEW", "new_title?": "...", "new_mission_role?": "synthesis" }]
Output ONLY the JSON array, no other text.`;

        try {
            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSection);
            const result = streamText({ model, prompt, maxTokens: 1000 });

            let text = '';
            for await (const chunk of result.textStream) {
                text += chunk;
            }

            // Parse JSON from response
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return;

            const assignments = JSON.parse(jsonMatch[0]) as Array<{
                insight_index: number;
                section_id: string;
                new_title?: string;
                new_mission_role?: string;
            }>;

            for (const a of assignments) {
                const insightText = insights[a.insight_index];
                if (!insightText) continue;

                if (a.section_id === 'NEW' && a.new_title) {
                    // Create new section
                    const newId = `s_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                    const currentSections = this.store.getState().v2PlanSections;
                    this.store.getState().setPlanSections([
                        ...currentSections,
                        {
                            id: newId,
                            title: a.new_title,
                            contentType: 'analysis',
                            visualType: 'none',
                            evidencePaths: [],
                            brief: insightText,
                            weight: 5,
                            missionRole: a.new_mission_role ?? 'synthesis',
                            status: 'pending',
                            content: '',
                            streamingChunks: [],
                            generations: [],
                        },
                    ]);
                } else {
                    // Append insight to existing section's brief
                    this.store.getState().updatePlanSection(a.section_id, (s) => ({
                        ...s,
                        brief: s.brief + '\n\nUser insight: ' + insightText,
                    }));
                }
            }
        } catch {
            // Insight assignment failure is non-fatal — insights are still passed via userNotes
        }
    }

    // -----------------------------------------------------------------------
    // Agent 1: Content (streaming generator for parallelStream)
    // -----------------------------------------------------------------------

    private async *streamSectionContent(
        section: V2Section,
        allSections: V2Section[],
        overview: string,
        userQuery: string,
    ): AsyncGenerator<LLMStreamEvent> {
        const t0 = Date.now();
        const tag = `[Section:${section.id.slice(0, 8)}]`;
        console.log(`${tag} generator started at +0ms`);
        try {
            const evidenceContent = await this.readEvidence(section.evidencePaths);
            console.log(`${tag} evidence read at +${Date.now() - t0}ms`);

            const otherSections = allSections
                .filter((s) => s.id !== section.id)
                .map((s) => `- ${s.title} (${s.contentType})`)
                .join('\n');

            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisReportSectionSystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisReportSection, {
                    userQuery,
                    reportOverview: overview,
                    sectionTitle: section.title,
                    contentType: section.contentType,
                    visualType: section.visualType,
                    sectionBrief: section.brief,
                    otherSections,
                    evidenceContent,
                    userPrompt: '',
                    missionRole: section.missionRole ?? 'synthesis',
                    userNotes: this.store.getState().v2UserInsights.join('\n') || '',
                }),
            ]);
            console.log(`${tag} prompts rendered at +${Date.now() - t0}ms`);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSection);
            console.log(`${tag} calling streamText at +${Date.now() - t0}ms`);
            const controller = new AbortController();
            const result = streamText({
                model,
                system: systemPrompt,
                prompt: userMessage,
                maxTokens: 800,
                abortSignal: controller.signal,
            });

            let fullText = '';
            let lastCheckLen = 0;
            let firstChunk = true;
            // Use fullStream (not textStream) — fullStream is eager (HTTP fires immediately),
            // textStream may be lazy and delay HTTP request start, causing serial behavior.
            for await (const chunk of result.fullStream) {
                if (chunk.type === 'text-delta') {
                    if (firstChunk) {
                        console.log(`${tag} FIRST TOKEN at +${Date.now() - t0}ms`);
                        firstChunk = false;
                    }
                    fullText += chunk.text;
                    yield { type: 'text-delta', text: chunk.text, extra: { sectionId: section.id } } as LLMStreamEvent;
                    if (fullText.length - lastCheckLen > 200) {
                        lastCheckLen = fullText.length;
                        const truncAt = detectRepetition(fullText);
                        if (truncAt > 0) {
                            controller.abort();
                            break;
                        }
                    }
                }
            }
            console.log(`${tag} STREAM COMPLETE at +${Date.now() - t0}ms`);
        } catch (err: any) {
            console.error(`${tag} ERROR at +${Date.now() - t0}ms:`, err?.message);
            this.store.getState().failSection(section.id, err?.message ?? 'Content generation failed');
        }
    }

    // -----------------------------------------------------------------------
    // Agent 1b: Content (single section, for regeneration)
    // -----------------------------------------------------------------------

    private async runContentAgent(
        section: V2Section,
        allSections: V2Section[],
        overview: string,
        userQuery: string,
        userPrompt?: string,
    ): Promise<void> {
        try {
            const evidenceContent = await this.readEvidence(section.evidencePaths);
            const otherSections = allSections
                .filter((s) => s.id !== section.id)
                .map((s) => `- ${s.title} (${s.contentType})`)
                .join('\n');

            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisReportSectionSystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisReportSection, {
                    userQuery,
                    reportOverview: overview,
                    sectionTitle: section.title,
                    contentType: section.contentType,
                    visualType: section.visualType,
                    sectionBrief: section.brief,
                    otherSections,
                    evidenceContent,
                    userPrompt: userPrompt ?? '',
                    missionRole: section.missionRole ?? 'synthesis',
                    userNotes: this.store.getState().v2UserInsights.join('\n') || '',
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSection);
            const controller = new AbortController();
            const result = streamText({
                model,
                system: systemPrompt,
                prompt: userMessage,
                maxTokens: 2000,
                abortSignal: controller.signal,
            });

            const { fullText } = await streamWithRepetitionGuard(
                result.textStream,
                controller,
                (chunk) => this.store.getState().appendSectionChunk(section.id, chunk),
            );

            this.store.getState().completeSectionContent(section.id, fullText);
        } catch (err: any) {
            this.store.getState().failSection(section.id, err?.message ?? 'Content generation failed');
        }
    }

    // -----------------------------------------------------------------------
    // Agent 2: Visual Blueprint
    // -----------------------------------------------------------------------

    private async runVisualAgent(section: V2Section): Promise<void> {
        if (section.visualType === 'none') return;
        const currentContent = this.store.getState().v2PlanSections.find((s) => s.id === section.id)?.content ?? '';

        try {
            let mermaidBlock = await this.generateMermaidBlock(section, currentContent);
            if (!mermaidBlock || !mermaidBlock.includes('```mermaid')) return;

            // Validate → fix → retry loop (max 2 retries)
            for (let attempt = 0; attempt < 2; attempt++) {
                const inner = this.extractMermaidInner(mermaidBlock);
                if (!inner) { mermaidBlock = ''; break; }
                const validation = await validateMermaidCode(inner);
                if (validation.valid) break;
                const fixed = await this.runMermaidFixAgent(inner, validation.error);
                if (!fixed || !fixed.includes('```mermaid')) { mermaidBlock = ''; break; }
                mermaidBlock = fixed;
            }

            if (mermaidBlock && mermaidBlock.includes('```mermaid')) {
                const updatedContent = currentContent + '\n\n' + mermaidBlock.trim();
                this.store.getState().updatePlanSection(section.id, (s) => ({
                    ...s,
                    content: updatedContent,
                }));
            }
        } catch {
            // Visual generation is optional — don't fail the section
        }
    }

    private async generateMermaidBlock(section: V2Section, sectionContent: string): Promise<string> {
        const [systemPrompt, userMessage] = await Promise.all([
            this.mgr.renderPrompt(PromptId.AiAnalysisReportVisualSystem, {}),
            this.mgr.renderPrompt(PromptId.AiAnalysisReportVisual, {
                sectionTitle: section.title,
                visualType: section.visualType,
                sectionContent: sectionContent.slice(0, 2000),
            }),
        ]);

        const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportVisual);
        const controller = new AbortController();
        const result = streamText({
            model,
            system: systemPrompt,
            prompt: userMessage,
            maxTokens: 1000,
            abortSignal: controller.signal,
        });

        const { fullText } = await streamWithRepetitionGuard(
            result.textStream,
            controller,
            () => {},
        );

        return fullText;
    }

    private extractMermaidInner(block: string): string {
        const match = block.match(/```mermaid\s*\n([\s\S]*?)```/);
        return match ? match[1].trim() : '';
    }

    // -----------------------------------------------------------------------
    // Agent 3: Summary
    // -----------------------------------------------------------------------

    private async runSummaryAgent(
        sections: V2Section[],
        allEvidencePaths: string[],
        overview: string,
        userQuery: string,
    ): Promise<void> {
        this.store.getState().setSummaryStreaming(true);

        try {
            // Use section briefs (not content — summary runs alongside sections, content not yet available)
            const currentSections = this.store.getState().v2PlanSections;
            const blocksSummary = currentSections
                .map((sec) => `### ${sec.title}\n${sec.brief}`)
                .join('\n\n');
            const evidenceList = allEvidencePaths
                .map((p) => `- [[${p.replace(/\.md$/, '')}]]`)
                .join('\n');

            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummarySystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummary, {
                    userQuery,
                    reportPlan: overview,
                    blocksSummary,
                    evidenceList,
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSummary);
            const controller = new AbortController();
            const result = streamText({
                model,
                system: systemPrompt,
                prompt: userMessage,
                maxTokens: 600,
                abortSignal: controller.signal,
            });

            let accumulated = '';
            const { fullText } = await streamWithRepetitionGuard(
                result.textStream,
                controller,
                (chunk) => {
                    accumulated += chunk;
                    this.store.getState().setSummary(accumulated);
                },
            );
            this.store.getState().setSummary(fullText);
        } catch {
            // Summary failure is non-fatal
        }

        this.store.getState().setSummaryStreaming(false);
    }

    // -----------------------------------------------------------------------
    // Agent 4: Mermaid Fix (on-demand)
    // -----------------------------------------------------------------------

    private async runMermaidFixAgent(brokenMermaid: string, errorMessage: string): Promise<string | null> {
        try {
            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisMermaidFixSystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisMermaidFix, {
                    brokenMermaid,
                    errorMessage,
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisMermaidFix);
            const result = streamText({ model, system: systemPrompt, prompt: userMessage, maxTokens: 800 });

            let fixed = '';
            for await (const chunk of result.textStream) {
                fixed += chunk;
            }
            return fixed.includes('```mermaid') ? fixed.trim() : null;
        } catch {
            return null;
        }
    }
}
