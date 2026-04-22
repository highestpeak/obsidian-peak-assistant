import { AppContext } from '@/app/context/AppContext';

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

const SYSTEM_PROMPT = `You analyze document relationships and infer a thinking tree structure.
Given a set of documents with their titles and first few lines, determine:
1. Which document is the root (the starting point / index / overview)
2. Parent-child relationships (which doc elaborates on which)
3. The depth level of each document (0 = root)
4. Each document's role: root, hub (connects many children), bridge (connects different topics), leaf (endpoint)

Output JSON only, no explanation.`;

const USER_PROMPT_TEMPLATE = `Analyze these documents and infer their hierarchical thinking tree:

{{FILES}}

Output format:
{
  "nodes": [
    { "path": "...", "label": "short title", "parentPath": null, "level": 0, "role": "root", "summary": "one line summary" }
  ]
}`;

/**
 * Call the default LLM provider to infer a thinking-tree hierarchy from document metadata.
 */
export async function inferThinkingTree(input: TreeInferenceInput): Promise<TreeInferenceResult> {
	const filesText = input.files
		.map((f) => `### ${f.path}\nTitle: ${f.title}\n${f.firstLines}`)
		.join('\n\n');

	const prompt = USER_PROMPT_TEMPLATE.replace('{{FILES}}', filesText);

	const manager = AppContext.getInstance().manager;

	const text = await manager.queryText(prompt, undefined, {
		systemPrompt: SYSTEM_PROMPT,
	});

	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return { nodes: [] };

	try {
		return JSON.parse(jsonMatch[0]) as TreeInferenceResult;
	} catch {
		return { nodes: [] };
	}
}
