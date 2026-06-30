/**
 * Built-in skill definitions.
 *
 * T11Y-6: skill bodies (frontmatter + markdown) moved to
 * templates/prompts/skill-{weekly-report,literature-review,vault-health-check}.md
 * — see PromptId.Skill* entries. Loaded via TemplateManager.getTemplate() (NOT
 * .render(), because the skill content itself contains `{{period}}` /
 * `{{topic}}` etc. that must stay literal — the skill runtime substitutes those
 * later when the user invokes the skill).
 */

import { PromptId } from '@/core/types/prompt';
import { TemplateManager } from '@/core/template/TemplateManager';

export interface BuiltinSkillEntry {
	content: string;
}

const BUILTIN_SKILL_PROMPT_IDS = [
	PromptId.SkillWeeklyReport,
	PromptId.SkillLiteratureReview,
	PromptId.SkillVaultHealthCheck,
];

/**
 * Load all built-in skill markdown bodies. Returns an empty array if the
 * TemplateManager singleton is not bound yet (caller should retry after boot).
 */
export async function loadBuiltinSkills(): Promise<BuiltinSkillEntry[]> {
	const tm = TemplateManager.getInstance();
	if (!tm) return [];
	const entries: BuiltinSkillEntry[] = [];
	for (const id of BUILTIN_SKILL_PROMPT_IDS) {
		const content = await tm.getTemplate(id);
		entries.push({ content });
	}
	return entries;
}
