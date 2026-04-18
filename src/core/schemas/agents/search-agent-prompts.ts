/**
 * System prompt template strings for the search-agent pipeline.
 * Extracted from search-agent-schemas.ts to separate concerns.
 */
import type { ReportPlanPhaseId } from './search-agent-schemas';

/**
 * Detailed requirements per phase for submit_phase_and_get_next_to_plan tool return.
 * Single source of truth; ReportPlanAgent reads this only.
 */
export const REPORT_PLAN_PHASE_REQUIREMENTS: Record<ReportPlanPhaseId, string> = {
	intent_insight: `**Intent insight (tone-setting)** — Plan this section first. Each phase is a chapter and can have multiple pages; submit one page per tool call, use status "draft" to add more pages for this phase, "final" when done.
- Output: one paragraph that will set the tone for the whole report.
- Analyze the user question's subtext (motives, constraints, success criteria).
- State assumed context and confidence level.
- This feeds into summary "answer" and key recommendations; keep it concise.`,

	summary_spec: `**Summary spec** — Plan what the Executive Summary must contain (summary is generated last, after blocks).
- **Length**: 1–2 pages, ~1000 words / ~7000 characters; 1.5 screens on 16" MacBook, 1 screen on 27" display.
- **Structure**: (1) First paragraph MUST answer the user question (from intent insight) and give **key recommendations** in totalizing language; (2) 3–5 bullets of **supporting rationale** (each 2–4 sentences); (3) **"So what"** high-level impact; (4) Only the most critical numbers/facts to make recommendations credible; (5) **References to later sections** — every key point must link to a block (click to jump). **Must stand alone**: an executive reading only this understands what to do and why. Summary is the "map"; dashboard blocks are the "microscope". No duplicate fact-listing; narrative only. Total-over-part structure throughout.`,

	overview_mermaid: `**Overview Mermaid** — Plan the diagram that appears right after the summary.
- **Constraint**: Keep only the **Top 10 core nodes** that support the Top-level Recommendation; avoid graph explosion.
- Specify: diagram type, node naming rules, and how nodes cite evidence (Fact # / path).`,

	topics: `**Topics (Pillars)** — Plan the topic blocks that act as MECE pillars.
- 3–6 pillars; each pillar = one conclusion + why it matters + 1–3 block refs (which body blocks support it).
- Topics are anchors for the body; avoid scattered or overlapping themes.`,

	body_intent_insight: `**Body block: Intent insight** — Plan one page for this chapter (block id report_body_intent_insight). Can have multiple pages; use "draft" for more, "final" when done. Short paragraph that restates the intent insight (user subtext, success criteria) as the opening of the body. Evidence binding: which Fact # or paths.`,

	body_scqa: `**Body block: Situation & objectives (SCQA)** — Plan one page (block id report_body_scqa). Use "draft"/"final" for multi-page.
- **Content**: SCQA-style context: (S)ituation / client context & scope; (C)omplication, key question, constraints; consensus and conflict, controversy and risk; (Q) key question; (A)nswer, goals, success metrics.
- Specify: short intro paragraph, then structure (bullets/table if needed). Evidence: Fact #, [[path]]. Chart/table shape if any.`,

	body_methodology: `**Body block: Approach & methodology** — Plan one page (block id report_body_methodology). Use "draft"/"final" for multi-page.
- **Content**: Analytical approach (frameworks, models, interviews, benchmarks); data sources and quality (scope); key assumptions and limitations.
- Specify: paragraph skeleton, optional flowchart or table. Evidence binding. Word target ~300–500.`,

	body_insight_pillar: `**Body block(s): Insight sections (per pillar)** — This phase usually has multiple pages (one per pillar). Submit one page per call with block id report_body_pillar_1, report_body_pillar_2, …; use "draft" until last pillar, then "final".
- **Each page must include**: (1) **Insight headline** — one full-sentence conclusion; (2) **Why it matters** — 2–3 sentences on strategic implication; (3) **Evidence** — 1–3 charts/tables with labelled takeaways, short bullet list of key data points, source notes under charts; (4) **What to do** — clear action or policy implication; (5) **Risks/uncertainties** for this insight.
- Specify for each page: blockId, title, paragraph skeleton, chart/table type, evidence binding, risks hint. Keep narrative on insights, not process. Each block is a supporting argument for the summary.`,

	body_recommendations_roadmap: `**Body block: Recommendations & roadmap** — Plan one page (block id report_body_recommendations_roadmap). Use "draft"/"final" for multi-page.
- **Content**: Prioritized recommendation list (3–7 items), each with benefit, complexity, owner; timelines; phased roadmap; high-level financial case and KPIs to track.
- Specify: table or list shape, optional Gantt/timeline Mermaid. Evidence binding.`,

	body_risks_dependencies: `**Body block: Risks & dependencies** — Plan one page (block id report_body_risks_dependencies). Use "draft"/"final" for multi-page.
- **Content**: (1) Blind spots — what the evidence does not cover; (2) Logic links — cross-domain connections that support the argument; (3) Forward-looking — trends from evidence; (4) Missing dimensions — empty evidence in some dimensions; prompt user to fill gaps.
- Specify: premortem/risk-audit structure, optional flowchart for failure paths. Evidence binding.`,

	body_next_actions: `**Body block: Next actions (TODO)** — Plan one page (block id report_body_next_actions). Use "draft"/"final" for multi-page.
- **Content**: Actionable items list derived from Evidence's implicitly suggested next actions. Concrete TODOs the user can execute.
- Specify: list shape, evidence binding (which facts suggest which action).`,

	body_followup_questions: `**Body block: Follow-up questions** — Plan one page (block id report_body_followup_questions). Use "draft"/"final" for multi-page.
- **Content**: High-value follow-up questions (gaps, blind spots, alternatives, missing dimensions). Not filler; questions that extend the analysis.
- Specify: how many, tone (Socratic / guiding).`,

	appendices: `**Appendices** — This phase can have multiple pages (one per appendix block). Submit one page per call; use "draft" for more, "final" when done. Block ids report_appendices or report_appendices_1, report_appendices_2, …
- **Content**: Full data tables; modelling assumptions; sensitivity analyses; edge cases not in core story but needed for scrutiny; detailed analyses per insight (extra cuts, alternative scenarios); methodology deep dives; glossary, references, interview guides, survey instruments.
- **Surprise markers**: Mark high-surprise findings with a lightning icon or [SURPRISE_HIGH] in Markdown so the core report stays concise but remains rigorous and audit-able.`,

	actions_todo_list: `**Actions: TODO list spec** — Plan how to generate the actionable items list.
- Base on Evidence's \`implicitly suggested next actions\`. Specify: format (bullets, numbered), grouping, and binding to Fact # / block refs.`,

	actions_followup_questions: `**Actions: Follow-up questions spec** — Plan how to generate follow-up questions.
- Rules for high-value questions: fill gaps, blind spots, alternatives, missing dimensions. Socratic tone where appropriate.`,
};
