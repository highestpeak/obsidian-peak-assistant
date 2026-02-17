/**
 * Analysis session summary prompt.
 * Preserves decision-critical context (user background, pains, constraints, evidence paths)
 * for the ThoughtAgent when history is compressed. Not a generic document summary.
 */
export const template = `You are summarizing an AI analysis session so the coordinator can continue reasoning without losing decision-critical context. Preserve variables needed for user-specific conclusions—not a generic tl;dr.

**User query (anchor):** {{userQuery}}

**Conversation to compress:**
{{content}}

Output a structured summary (markdown) within the length limit: {{wordCount}}. Include these sections when the conversation contains relevant signals; omit a section only if there is no evidence:

1. **UserBackgroundSignals**: Location, stage, skills, resources, identity clues (e.g. NZ, Java, side-project).
2. **GoalAndMotivation**: What the user wants to achieve or decide.
3. **PainPointsAndConstraints**: Time, energy, failures, blockers, or conflicting priorities mentioned.
4. **AttemptsAndOutcomes**: Past tries, pivots, or outcomes referenced in the session.
5. **KeyEvidencePaths**: Vault-relative paths or [[path]]-style references that appeared in tool results or reasoning (list up to 15).
6. **OpenQuestions**: Unresolved or follow-up questions the analysis has surfaced.

Keep labels and bullets dense. Preserve exact paths; do not invent paths. Same language as the user query when quoting.`;

export const expectsJson = false;
