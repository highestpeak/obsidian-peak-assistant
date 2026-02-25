/**
 * One-time migration: extract template strings from .ts files and write to .md under templates/prompts|agents|tools.
 * Run from repo root: node scripts/migrate-templates-to-md.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const PATHS = [
	// prompts (path -> source .ts relative to src)
	...[
		'conversation-system', 'conversation-summary-short', 'conversation-summary-full',
		'project-summary-short', 'project-summary-full', 'search-rerank-rank-gpt',
		'sources-update-agent-system', 'topics-update-agent-system', 'graph-update-agent-system',
		'application-generate-title', 'memory-extract-candidates-json', 'memory-update-bullet-list',
		'user-profile-update-json', 'instruction-update', 'prompt-quality-eval-json',
		'prompt-rewrite-with-library', 'doc-summary', 'ai-analysis-session-summary',
		'image-description', 'image-summary', 'folder-project-summary', 'ai-analysis-followup',
		'ai-analysis-followup-system', 'ai-analysis-dashboard-title', 'ai-analysis-doc-simple-scope',
		'ai-analysis-doc-simple-system', 'ai-analysis-suggest-follow-up-questions-system',
		'ai-analysis-suggest-follow-up-questions', 'ai-analysis-agent-raw-search-system',
		'ai-analysis-agent-thought-system', 'ai-analysis-dashboard-result-summary-system',
		'ai-analysis-dashboard-result-summary', 'ai-analysis-diagnosis-json',
		'ai-analysis-dashboard-overview-mermaid-system', 'ai-analysis-dashboard-overview-mermaid',
		'ai-analysis-dashboard-update-sources-system', 'ai-analysis-dashboard-update-sources',
		'ai-analysis-dashboard-update-topics-system', 'ai-analysis-dashboard-update-topics',
		'ai-analysis-dashboard-update-graph-system', 'ai-analysis-dashboard-update-graph',
		'ai-analysis-dashboard-update-blocks-system', 'ai-analysis-dashboard-update-blocks',
		'ai-analysis-review-blocks-system', 'ai-analysis-review-blocks',
		'ai-analysis-dashboard-update-plan-system', 'ai-analysis-dashboard-update-plan',
		'ai-analysis-mindflow-agent-system', 'ai-analysis-mindflow-agent',
		'ai-analysis-completion-judge-system', 'ai-analysis-completion-judge',
		'ai-analysis-final-refine-system', 'ai-analysis-final-refine',
		'ai-analysis-final-refine-sources-system', 'ai-analysis-final-refine-sources',
		'ai-analysis-final-refine-source-scores-system', 'ai-analysis-final-refine-source-scores',
		'ai-analysis-final-refine-graph-system', 'ai-analysis-final-refine-graph',
		'ai-analysis-save-filename', 'ai-analysis-save-folder', 'doc-type-classify-json',
		'doc-tag-generate-json', 'context-memory', 'user-profile-context', 'profile-from-vault-json',
		'user-profile-organize-markdown', 'message-resources',
	].map(stem => ({ out: `templates/prompts/${stem}.md`, src: `src/service/prompt/templates/${stem}.ts` })),
	// tools
	...['local-search', 'search-by-dimensions', 'recent-changes', 'graph-path-finding', 'inspect-note-context', 'explore-folder', 'orphan-notes', 'find-key-nodes', 'graph-traversal']
		.map(stem => ({ out: `templates/tools/${stem}.md`, src: `src/service/tools/templates/${stem}.ts` })),
	// agents
	...['result-snapshot', 'evidence-hint', 'mindflow-context']
		.map(stem => ({ out: `templates/agents/${stem}.md`, src: `src/service/agents/search-agent-helper/templates/${stem}.ts` })),
];

function extractTemplateLiteral(content) {
	const marker = 'export const template = `';
	const idx = content.indexOf(marker);
	if (idx === -1) return null;
	let start = idx + marker.length;
	let end = start;
	let escaped = false;
	for (let i = start; i < content.length; i++) {
		const c = content[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (c === '\\') {
			escaped = true;
			continue;
		}
		if (c === '`') {
			end = i;
			break;
		}
	}
	return content.slice(start, end);
}

function main() {
	for (const { out, src } of PATHS) {
		const srcPath = path.join(root, src);
		const outPath = path.join(root, out);
		if (!fs.existsSync(srcPath)) {
			console.warn(`Skip (missing): ${src}`);
			continue;
		}
		const content = fs.readFileSync(srcPath, 'utf-8');
		const template = extractTemplateLiteral(content);
		if (template == null) {
			console.warn(`Skip (no template export): ${src}`);
			continue;
		}
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		fs.writeFileSync(outPath, template, 'utf-8');
		console.log(`Wrote ${out}`);
	}
}

main();
