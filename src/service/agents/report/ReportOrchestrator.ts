import type { AppHandle } from '@/core/ports/AppHandle';
import { PromptId } from '@/core/types/prompt';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { V2Section } from '@/core/search/v2SessionTypes';
import type { ReportSessionPort } from '@/core/ports/ReportSessionPort';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import {
	assertSuccessfulRun,
	runHarnessText,
	streamHarnessModel,
} from '@/service/agents/harness/HarnessModelRunner';
import { streamWithRepetitionGuard, detectRepetition } from './stream-utils';
import type { DebugRunHandle, DebugTracePort } from '@/core/debug-trace';
import {
	type AnalysisSectionToolUse,
	recordAnalysisArtifact,
	recordAnalysisPlan,
	recordAnalysisSectionGeneration,
	recordAnalysisSkip,
} from './debugTraceAdapter';

/**
 * Multi-agent report orchestrator.
 *
 * T11I (2026-06-26): no longer reads `useSearchSessionStore` directly.
 * Section/summary state goes through `ReportSessionPort`, supplied by
 * the caller (the UI hook constructs `SearchSessionReportAdapter`).
 *
 * Per section (parallel):
 *   1. Content Agent — Peak Harness → section markdown
 *
 * After all sections:
 *   2. Summary Agent — Peak Harness → executive summary
 *
 * On demand:
 *   - Mermaid Fix Agent — Peak Harness → fix broken mermaid syntax
 *   - Section Regeneration — re-run content agent with optional user prompt
 */
export class ReportOrchestrator {
    private readonly mgr: AIServiceManager;
    private readonly session: ReportSessionPort;
    private readonly app: AppHandle;
    private readonly pluginId: string;

    private readonly debugTrace: DebugTracePort | null;
    private activeDebugRun: DebugRunHandle | null = null;

    constructor(
        aiServiceManager: AIServiceManager,
        session: ReportSessionPort,
        /** T11J B1: explicit app + pluginId so orchestrator no longer reaches AppContext. */
        app: AppHandle,
        pluginId: string,
        debugTrace: DebugTracePort | null = null,
    ) {
        this.mgr = aiServiceManager;
        this.session = session;
        this.app = app;
        this.pluginId = pluginId;
        this.debugTrace = debugTrace;
    }

    /**
     * Returns the debug run handle for the most recent generateReport call
     * whose flow (generation + vault save) has not been fully sealed. Callers
     * on the vault-write side use this to append artifact.write spans before
     * finishing the run.
     */
    getActiveDebugRun(): DebugRunHandle | null {
        return this.activeDebugRun;
    }

    /**
     * Seal the currently-open analyze debug run, optionally recording the
     * machine-record path produced by milestone persistence first.
     */
    sealActiveDebugRun(
        status: 'completed' | 'failed' | 'cancelled' = 'completed',
        artifactPath?: string,
    ): void {
        if (!this.activeDebugRun) return;
        try {
            if (artifactPath) {
                recordAnalysisArtifact(this.activeDebugRun, {
                    path: artifactPath,
                    kind: 'analysis-record',
                });
            }
            this.activeDebugRun.finish(status);
        } finally {
            this.activeDebugRun = null;
        }
    }

    /** Resolve the complete Research binding. Throws if none configured. */
    private requireResearchBinding(): { profile: Profile; modelId: string } {
        const binding = ProfileRegistry.getInstance().resolveSlot('research');
        if (!binding) {
            throw new Error('No Research profile configured. Please set up Research in Settings → AI Setup.');
        }
        return binding;
    }

    private async *harnessTextStream(
        binding: { profile: Profile; modelId: string },
        prompt: string,
        systemPrompt: string,
        signal: AbortSignal,
        loopId: string,
    ): AsyncGenerator<string> {
        const stream = streamHarnessModel({
            loopId,
            profile: binding.profile,
            modelId: binding.modelId,
            prompt,
            systemPrompt,
            maxSteps: 1,
            signal,
			debugTrace: this.debugTrace,
			debugSurface: 'analyze',
			debugCapabilityId: 'report.section',
        });
        while (true) {
            const step = await stream.next();
            if (step.done) {
                assertSuccessfulRun(step.value);
                return;
            }
            if (step.value.type === 'text-delta') yield step.value.text;
        }
    }

    // -----------------------------------------------------------------------
    // Evidence reader
    // -----------------------------------------------------------------------

    private async readEvidence(paths: string[], sectionBrief?: string): Promise<string> {
        const vault = this.app.vault;
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
            .split(/[\s,;.!?,。;!?]+/)
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
        // Debug: one run per generateReport call. Recorded even on early-exit
        // paths (empty sections, insight assignment failure) so a "why did I
        // get an empty report?" question always has a receipt. The run stays
        // open (activeDebugRun) after this method returns so the vault-write
        // site can attach an artifact.write span before sealing the run.
        const debugRun = this.debugTrace?.isEnabled()
            ? this.debugTrace.startRun({
                  surface: 'analyze',
                  capabilityId: 'analysis.report.generate',
              })
            : null;
        this.activeDebugRun = debugRun;

        // Pass 0: assign user insights to sections (if any)
        const insights = this.session.getUserInsights();
        if (insights.length > 0) {
            await this.assignInsightsToSections(insights, sections, userQuery);
            // Re-read sections (may have new ones added)
            sections = this.session.getPlanSections();
        }

        if (debugRun) {
            recordAnalysisPlan(debugRun, {
                userQuery,
                sections: sections.map((s) => ({ id: s.id, title: s.title })),
                evidencePathCount: allEvidencePaths.length,
            });
        }

        // Mark all sections as generating
        for (const sec of sections) {
            this.session.updatePlanSection(sec.id, (s) => ({ ...s, status: 'generating' }));
        }

        // Pre-prepare ALL section params (evidence + prompts) BEFORE firing any queries.
        const binding = this.requireResearchBinding();
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
                    userNotes: this.session.getUserInsights().join('\n') || '',
                }),
            ]);
            return { sec, systemPrompt, userMessage };
        }));

        // Fire ALL queries at once and consume streams in parallel
        const contentPromises = sectionParams.map(async ({ sec, systemPrompt, userMessage }) => {
            const controller = new AbortController();
            console.log(`[Section:${sec.id.slice(0, 8)}] Peak Harness run fired`);
            const startedAt = Date.now();
            const toolUses: AnalysisSectionToolUse[] = [];
            try {
                let fullText = '';
                let lastCheckLen = 0;
                for await (const chunk of this.harnessTextStream(
                    binding,
                    userMessage,
                    systemPrompt,
                    controller.signal,
                    `report-section-${sec.id}`,
                )) {
                    fullText += chunk;
                    this.session.appendSectionChunk(sec.id, chunk);
                    if (fullText.length - lastCheckLen > 200) {
                        lastCheckLen = fullText.length;
                        const truncAt = detectRepetition(fullText);
                        if (truncAt > 0) {
                            controller.abort();
                            break;
                        }
                    }
                }
                if (fullText) {
                    this.session.completeSectionContent(sec.id, fullText);
                    if (debugRun) {
                        recordAnalysisSectionGeneration(debugRun, {
                            sectionId: sec.id,
                            sectionTitle: sec.title,
                            provider: binding.profile.kind,
                            model: binding.modelId,
                            promptExcerpt: userMessage,
                            responseExcerpt: fullText,
                            durationMs: Date.now() - startedAt,
                            toolUses,
                        });
                    }
                } else {
                    this.session.failSection(sec.id, 'No content generated');
                    if (debugRun) {
                        recordAnalysisSkip(debugRun, {
                            sectionId: sec.id,
                            reason: 'fallback',
                            detail: 'no content',
                        });
                    }
                }
            } catch (err: any) {
                this.session.failSection(sec.id, err?.message ?? 'Content generation failed');
                if (debugRun) {
                    recordAnalysisSkip(debugRun, {
                        sectionId: sec.id,
                        reason: 'error',
                        detail: err?.message ?? String(err),
                    });
                }
            }
        });

        await Promise.all(contentPromises);
        if (debugRun) {
            debugRun.mergeSummary({
                totalSections: sections.length,
                userQueryLength: userQuery.length,
            });
            // Do NOT finish the run here; the vault save site records
            // artifact.write then calls sealActiveDebugRun('completed').
            // Fallback safety: if the caller never seals, the run leaks
            // in memory but is bounded by the recorder's retention.
        }

        // Now run summary with actual section content available
        await this.runSummaryAgent(sections, allEvidencePaths, overview, userQuery);
    }

    async regenerateSection(
        sectionId: string,
        allSections: V2Section[],
        overview: string,
        userQuery: string,
        userPrompt?: string,
    ): Promise<void> {
        this.session.startSectionRegenerate(sectionId);
        const section = this.session.getPlanSections().find((s) => s.id === sectionId);
        if (!section) return;
        await this.runContentAgent(section, allSections, overview, userQuery, userPrompt);
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

        // T11Y-6: insight assignment prompt body lives at
        // templates/prompts/report-assign-insights.md (PromptId.ReportAssignInsights).
        const prompt = await this.mgr.renderPrompt(PromptId.ReportAssignInsights, {
            sectionList,
            insightList,
            userQuery,
        });

        try {
            const binding = this.requireResearchBinding();
            const { text } = await runHarnessText({
                loopId: `report-insights-${crypto.randomUUID()}`,
                profile: binding.profile,
                modelId: binding.modelId,
                prompt,
                systemPrompt: '',
                maxSteps: 1,
				debugTrace: this.debugTrace,
				debugSurface: 'analyze',
				debugCapabilityId: 'report.assign-insights',
				debugOperation: 'object.generate',
            });

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
                    const currentSections = this.session.getPlanSections();
                    this.session.setPlanSections([
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
                            streamingText: '',
                            generations: [],
                        },
                    ]);
                } else {
                    // Append insight to existing section's brief
                    this.session.updatePlanSection(a.section_id, (s) => ({
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
                    userNotes: this.session.getUserInsights().join('\n') || '',
                }),
            ]);

            const binding = this.requireResearchBinding();
            const controller = new AbortController();

            const { fullText } = await streamWithRepetitionGuard(
                this.harnessTextStream(
                    binding,
                    userMessage,
                    systemPrompt,
                    controller.signal,
                    `report-regenerate-${section.id}`,
                ),
                controller,
                (chunk) => this.session.appendSectionChunk(section.id, chunk),
            );

            this.session.completeSectionContent(section.id, fullText);
        } catch (err: any) {
            this.session.failSection(section.id, err?.message ?? 'Content generation failed');
        }
    }

    // -----------------------------------------------------------------------
    // Agent 2: Summary
    // -----------------------------------------------------------------------

    private async runSummaryAgent(
        sections: V2Section[],
        allEvidencePaths: string[],
        overview: string,
        userQuery: string,
    ): Promise<void> {
        this.session.setSummaryStreaming(true);

        try {
            const currentSections = this.session.getPlanSections();
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

            const binding = this.requireResearchBinding();
            const controller = new AbortController();

            let accumulated = '';
            let summaryRaf: number | null = null;
            const sessionRef = this.session;
            const { fullText } = await streamWithRepetitionGuard(
                this.harnessTextStream(
                    binding,
                    userMessage,
                    systemPrompt,
                    controller.signal,
                    `report-summary-${crypto.randomUUID()}`,
                ),
                controller,
                (chunk) => {
                    accumulated += chunk;
                    if (summaryRaf === null) {
                        summaryRaf = requestAnimationFrame(() => {
                            summaryRaf = null;
                            sessionRef.setSummary(accumulated);
                        });
                    }
                },
            );
            if (summaryRaf !== null) cancelAnimationFrame(summaryRaf);
            this.session.setSummary(fullText);
        } catch {
            // Summary failure is non-fatal
        }

        this.session.setSummaryStreaming(false);
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

            const binding = this.requireResearchBinding();
            const { text: fixed } = await runHarnessText({
                loopId: `report-mermaid-fix-${crypto.randomUUID()}`,
                profile: binding.profile,
                modelId: binding.modelId,
                prompt: userMessage,
                systemPrompt,
                maxSteps: 1,
				debugTrace: this.debugTrace,
				debugSurface: 'analyze',
				debugCapabilityId: 'report.mermaid-fix',
            });

            return fixed.includes('```mermaid') ? fixed.trim() : null;
        } catch {
            return null;
        }
    }
}
