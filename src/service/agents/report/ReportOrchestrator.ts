import { streamText } from 'ai';
import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import type { V2Section } from '@/ui/view/quick-search/store/searchSessionStore';

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
    private get mgr() {
        return AppContext.getInstance().aiServiceManager;
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
        // Mark all sections as generating
        for (const sec of sections) {
            this.store.getState().updatePlanSection(sec.id, (s) => ({ ...s, status: 'generating' }));
        }

        // Pass 1+2: content + visual per section, all in parallel
        await Promise.all(sections.map(async (sec) => {
            await this.runContentAgent(sec, sections, overview, userQuery);
            await this.runVisualAgent(sec);
        }));

        // Pass 3: executive summary (needs all sections completed first)
        await this.runSummaryAgent(sections, allEvidencePaths, overview, userQuery);
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
    // Agent 1: Content
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
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSectionSystem);
            const result = streamText({ model, system: systemPrompt, prompt: userMessage });

            let fullText = '';
            for await (const chunk of result.textStream) {
                fullText += chunk;
                this.store.getState().appendSectionChunk(section.id, chunk);
            }

            this.store.getState().completeSectionContent(section.id, fullText);
        } catch (err: any) {
            this.store.getState().failSection(section.id, err?.message ?? 'Content generation failed');
        }
    }

    // -----------------------------------------------------------------------
    // Agent 2: Visual Blueprint
    // -----------------------------------------------------------------------

    private async runVisualAgent(section: V2Section): Promise<void> {
        // Skip if no visualization needed or content already has mermaid
        if (section.visualType === 'none') return;
        const currentContent = this.store.getState().v2PlanSections.find((s) => s.id === section.id)?.content ?? '';
        if (currentContent.includes('```mermaid')) return;

        try {
            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisReportVisualSystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisReportVisual, {
                    sectionTitle: section.title,
                    visualType: section.visualType,
                    sectionContent: currentContent.slice(0, 2000),
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportVisualSystem);
            const result = streamText({ model, system: systemPrompt, prompt: userMessage });

            let mermaidBlock = '';
            for await (const chunk of result.textStream) {
                mermaidBlock += chunk;
            }

            // Append mermaid to section content
            if (mermaidBlock.includes('```mermaid')) {
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
            // Read completed section content from store (may have visual appended)
            const currentSections = this.store.getState().v2PlanSections;
            const blocksSummary = currentSections
                .map((sec) => `### ${sec.title}\n${sec.content.slice(0, 300)}`)
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

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSummarySystem);
            const result = streamText({ model, system: systemPrompt, prompt: userMessage });

            let fullText = '';
            for await (const chunk of result.textStream) {
                fullText += chunk;
                this.store.getState().setSummary(fullText);
            }
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

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisMermaidFixSystem);
            const result = streamText({ model, system: systemPrompt, prompt: userMessage });

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
