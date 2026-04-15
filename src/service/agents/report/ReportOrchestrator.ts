import { streamText } from 'ai';
import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import type { V2Section } from '@/ui/view/quick-search/store/searchSessionStore';
import { pLimit, streamWithRepetitionGuard, detectRepetition } from './stream-utils';
import { parallelStream } from '@/core/providers/helpers/stream-helper';
import type { LLMStreamEvent } from '@/core/providers/types';

/**
 * Multi-agent report orchestrator.
 *
 * Per section (parallel):
 *   1. Content Agent — streamText → section markdown
 *   2. Visual Blueprint Agent — streamText → JSON viz spec (validated by Zod, stored on section.vizData)
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

    private async readEvidence(paths: string[], sectionBrief?: string): Promise<string> {
        const vault = AppContext.getInstance().app.vault;
        const PER_FILE_LIMIT = 6000;
        const chunks: string[] = [];

        for (const p of paths) {
            const file = vault.getAbstractFileByPath(p);
            if (!file || !('extension' in file)) continue;
            try {
                const content = await vault.cachedRead(file as any);
                const noteName = p.replace(/\.md$/, '');

                if (content.length <= PER_FILE_LIMIT) {
                    chunks.push(`### [[${noteName}]]\n${content}`);
                    continue;
                }

                // For long files: try to find the most relevant section
                if (sectionBrief) {
                    const relevant = this.extractRelevantSection(content, sectionBrief, PER_FILE_LIMIT);
                    if (relevant) {
                        chunks.push(`### [[${noteName}]] (excerpt)\n${relevant}`);
                        continue;
                    }
                }

                // Fallback: first + last portion
                const half = Math.floor(PER_FILE_LIMIT / 2);
                const excerpt = content.slice(0, half) + '\n\n...(truncated)...\n\n' + content.slice(-half);
                chunks.push(`### [[${noteName}]] (excerpt)\n${excerpt}`);
            } catch { /* skip unreadable */ }
        }
        return chunks.join('\n\n---\n\n');
    }

    private extractRelevantSection(content: string, brief: string, maxLen: number): string | null {
        const keywords = brief
            .toLowerCase()
            .split(/[\s,;.!?，。；！？]+/)
            .filter((w) => w.length > 1);
        if (keywords.length === 0) return null;

        const paragraphs = content.split(/\n{2,}/);
        if (paragraphs.length <= 3) return null;

        const scores = paragraphs.map((p) => {
            const lower = p.toLowerCase();
            return keywords.filter((kw) => lower.includes(kw)).length;
        });

        const maxScore = Math.max(...scores);
        if (maxScore < 2) return null;

        const bestIdx = scores.indexOf(maxScore);
        let result = paragraphs[bestIdx];
        let lo = bestIdx - 1;
        let hi = bestIdx + 1;

        while (result.length < maxLen) {
            const addLo = lo >= 0 ? paragraphs[lo] : null;
            const addHi = hi < paragraphs.length ? paragraphs[hi] : null;
            if (!addLo && !addHi) break;

            if (addLo && (!addHi || (scores[lo] >= scores[hi]))) {
                if (result.length + addLo.length > maxLen) break;
                result = addLo + '\n\n' + result;
                lo--;
            } else if (addHi) {
                if (result.length + addHi.length > maxLen) break;
                result = result + '\n\n' + addHi;
                hi++;
            }
        }

        return result;
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
            const evidenceContent = await this.readEvidence(sec.evidencePaths, sec.brief);
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
                maxTokens: 4096,
                abortSignal: controller.signal,
            });
            console.log(`[Section:${sec.id.slice(0, 8)}] streamText fired`);
            return { sec, result, controller };
        });

        // Now consume all streams in parallel — each with its own independent consumer
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

        await Promise.all(contentPromises);

        // Now run summary with actual section content available
        await this.runSummaryAgent(sections, allEvidencePaths, overview, userQuery);

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
            const evidenceContent = await this.readEvidence(section.evidencePaths, section.brief);
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
                maxTokens: 4096,
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
            const evidenceContent = await this.readEvidence(section.evidencePaths, section.brief);
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
        const currentContent = this.store.getState().v2PlanSections.find((s) => s.id === section.id)?.content ?? '';
        if (!currentContent) return;

        try {
            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisReportVizJsonSystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisReportVizJson, {
                    sectionTitle: section.title,
                    sectionContent: currentContent.slice(0, 3000),
                    contentType: section.contentType,
                    missionRole: section.missionRole ?? 'synthesis',
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportVizJson);
            const result = streamText({
                model,
                system: systemPrompt,
                prompt: userMessage,
                maxTokens: 1500,
            });

            let text = '';
            for await (const chunk of result.textStream) {
                text += chunk;
            }

            // Extract JSON from response (LLM may wrap in code fence)
            const jsonStr = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);

            // Check for skip signal
            if (parsed.skip) return;

            // Validate with Zod
            const { vizSpecSchema } = await import('@/core/schemas/report-viz-schemas');
            const validation = vizSpecSchema.safeParse(parsed);
            if (!validation.success) {
                console.warn(`[Visual:${section.id.slice(0, 8)}] Schema validation failed:`, validation.error.message);
                return;
            }

            // Store validated viz data on the section
            this.store.getState().updatePlanSection(section.id, (s) => ({
                ...s,
                vizData: validation.data,
            }));
        } catch (err) {
            // Visual generation is optional — log and continue
            console.warn(`[Visual:${section.id.slice(0, 8)}] Failed:`, err);
        }
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
            const currentSections = this.store.getState().v2PlanSections;
            const evidenceList = allEvidencePaths
                .map((p) => `- [[${p.replace(/\.md$/, '')}]]`)
                .join('\n');

            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummarySystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummary, {
                    userQuery,
                    reportPlan: overview,
                    sections: currentSections.map((s) => ({ title: s.title, content: s.content })),
                    evidenceList,
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSummary);
            const controller = new AbortController();
            const result = streamText({
                model,
                system: systemPrompt,
                prompt: userMessage,
                maxTokens: 2048,
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
