import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync('src/ui/view/quick-search/SearchModal.tsx', 'utf8');
const instructionComposer = readFileSync(
	'src/ui/component/instruction-composer/AIInstructionComposer.tsx',
	'utf8',
);
const promptInputBody = readFileSync(
	'src/ui/component/prompt-input/PromptInputBody.tsx',
	'utf8',
);
const sources = readFileSync('src/ui/view/quick-search/components/V2SourcesView.tsx', 'utf8');
const styles = readFileSync('src/styles/peak-components.css', 'utf8');
const codeMirrorStyles = readFileSync('src/styles/codemirror.css', 'utf8');

assert.match(
	modal,
	/sessionStatus === 'idle' \? \([\s\S]*?<AIInstructionComposer[\s\S]*?\) : \([\s\S]*?<AIAnalysisQueryBar/,
	'the editable composer must collapse into a compact analysis context after the run starts',
);
assert(!modal.includes('Re-analyze'), 'AI Search must not expose a duplicate re-run action beside the composer submit');
assert(!modal.includes('>Analyze</span>'), 'the composer submit must be the only landing primary action');
assert(modal.includes('attachmentIcon={<Plus />}'), 'AI Search must use the lightweight add affordance from the design');
assert(modal.includes("className={cn('pk-ai-search-web-toggle', webEnabled && 'is-active')}"));
assert(modal.includes('aria-pressed={webEnabled}'));
assert(!modal.includes('GlobeOff'), 'Web off must use a quiet state instead of a visually noisy crossed-out icon');
assert(instructionComposer.includes('{icon ?? <Paperclip />}'));
assert.match(
	modal,
	/<AIInstructionComposer[\s\S]*?compact[\s\S]*?singleLine[\s\S]*?autoFocus/,
	'AI Search must opt the shared composer into its single-line query-bar mode',
);
assert(instructionComposer.includes('singleLine={singleLine}'));
assert(promptInputBody.includes("singleLine && 'cm-editor-single-line'"));
assert(promptInputBody.includes('transaction.newDoc.lines === 1'));

assert.match(
	styles,
	/:is\(\.pktw-root, \.peak-design-root\) \.pk-ai-workspace-trigger\s*\{[\s\S]*?width:\s*auto !important;[\s\S]*?min-width:\s*0 !important;[\s\S]*?max-width:\s*none !important;[\s\S]*?flex:\s*1;/,
	'the AI workspace main tab must leave a distinct hit target for its menu trigger',
);
assert.match(
	codeMirrorStyles,
	/cm-editor-single-line \.cm-scroller\s*\{[\s\S]*?overflow-x:\s*auto !important;[\s\S]*?overflow-y:\s*hidden !important;/,
	'the AI Search query must scroll horizontally instead of exposing a second row',
);
assert.match(
	codeMirrorStyles,
	/cm-editor-single-line \.cm-line\s*\{[\s\S]*?word-wrap:\s*normal !important;[\s\S]*?white-space:\s*pre !important;/,
	'the AI Search query text must retain a real single visual line',
);
assert(modal.includes('className="pk-ai-workspace-menu-trigger"'));
assert(modal.includes('onClick={onActivate}'));
const workspaceTabStart = modal.indexOf('className="pk-ai-workspace-trigger"');
const workspaceMenuTriggerStart = modal.indexOf('className="pk-ai-workspace-menu-trigger"');
assert(workspaceTabStart >= 0 && workspaceMenuTriggerStart > workspaceTabStart);
const workspaceTabSource = modal.slice(workspaceTabStart, workspaceMenuTriggerStart);
assert(!workspaceTabSource.includes('setOpen((current) => !current)'));
assert(modal.includes('if (!active) setOpen(false)'));
assert(modal.includes("addEventListener('pointerdown', closeOutside, true)"));
assert.match(
	styles,
	/\.pk-ai-workspace-menu\s*\{[\s\S]*?right:\s*8px;[\s\S]*?width:\s*min\(264px, calc\(100vw - 32px\)\);/,
	'the AI workspace picker must be a compact arrow-anchored popover',
);
assert.match(
	styles,
	/pk-ai-search-web-toggle\) svg\s*\{[\s\S]*?width:\s*14px !important;[\s\S]*?height:\s*14px !important;/,
	'AI Search composer icons must use the compact 14px optical size',
);
assert.match(styles, /\.cm-scroller\s*\{[\s\S]*?scrollbar-width:\s*none;/);
assert.match(styles, /\.cm-scroller::\-webkit-scrollbar[\s\S]*?display:\s*none;/);

assert(!sources.includes('pktw-h-[540px]'), 'Sources list and tree must not reserve a fixed 540px canvas');
assert(sources.includes('0 Vault relationships'));
assert(sources.includes("host.findFileByPath(source.path)?.stat.mtime"));
assert(!sources.includes('displayScorePercent: Math.round(score * 100)'));

console.log('ai-search-ui-regression: passed');
