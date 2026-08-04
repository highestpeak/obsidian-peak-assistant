import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync('src/ui/view/quick-search/SearchModal.tsx', 'utf8');
const sources = readFileSync('src/ui/view/quick-search/components/V2SourcesView.tsx', 'utf8');
const styles = readFileSync('src/styles/peak-components.css', 'utf8');

assert.match(
	modal,
	/sessionStatus === 'idle' \? \([\s\S]*?<AIInstructionComposer[\s\S]*?\) : \([\s\S]*?<AIAnalysisQueryBar/,
	'the editable composer must collapse into a compact analysis context after the run starts',
);
assert(!modal.includes('Re-analyze'), 'AI Search must not expose a duplicate re-run action beside the composer submit');
assert(!modal.includes('>Analyze</span>'), 'the composer submit must be the only landing primary action');

assert.match(
	styles,
	/:is\(\.pktw-root, \.peak-design-root\) \.pk-ai-workspace-trigger\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?min-width:\s*0 !important;[\s\S]*?max-width:\s*none !important;/,
	'the AI workspace half-tab must defend its full width against the Obsidian button reset',
);
assert.match(
	styles,
	/\.pk-ai-instruction\[data-instruction-surface="ai-search"\][\s\S]*?\.cm-editor\s*\{[\s\S]*?height:\s*34px;[\s\S]*?max-height:\s*34px;/,
	'the AI Search landing composer must remain a compact single-row control',
);

assert(!sources.includes('pktw-h-[540px]'), 'Sources list and tree must not reserve a fixed 540px canvas');
assert(sources.includes('0 Vault relationships'));
assert(sources.includes("host.findFileByPath(source.path)?.stat.mtime"));
assert(!sources.includes('displayScorePercent: Math.round(score * 100)'));

console.log('ai-search-ui-regression: passed');
