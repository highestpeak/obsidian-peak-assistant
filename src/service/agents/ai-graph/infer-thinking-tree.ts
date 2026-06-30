import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';
import { PromptId } from '@/core/prompt/PromptId';
import { TemplateManager } from '@/core/template/TemplateManager';

interface TreeInferenceInput {
	files: Array<{ path: string; title: string; firstLines: string }>;
}

interface TreeInferenceResult {
	nodes: Array<{
		path: string;
		label: string;
		parentPath: string | null;
		level: number;
		role: 'root' | 'hub' | 'bridge' | 'leaf';
		summary: string;
	}>;
}

/**
 * Call the default LLM provider to infer a thinking-tree hierarchy from document metadata.
 *
 * T11J B1: caller injects `prompter` so the agent no longer reaches
 * `AppContext.getInstance().manager`.
 *
 * T11Y-6: system + user prompts moved to templates/prompts/graph-infer-thinking-tree-{system,user}.md
 * (PromptId.GraphInferThinkingTree{System,User}).
 */
export async function inferThinkingTree(input: TreeInferenceInput, prompter: IAgentPrompter): Promise<TreeInferenceResult> {
	const filesText = input.files
		.map((f) => `### ${f.path}\nTitle: ${f.title}\n${f.firstLines}`)
		.join('\n\n');

	const tm = TemplateManager.getInstance();
	if (!tm) throw new Error('TemplateManager not bound — cannot render thinking-tree prompts.');
	const prompt = await tm.render(PromptId.GraphInferThinkingTreeUser, { filesText });
	const systemPrompt = await tm.render(PromptId.GraphInferThinkingTreeSystem, {});

	const text = await prompter.queryText(prompt, undefined, {
		systemPrompt,
	});

	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return { nodes: [] };

	try {
		return JSON.parse(jsonMatch[0]) as TreeInferenceResult;
	} catch {
		return { nodes: [] };
	}
}
