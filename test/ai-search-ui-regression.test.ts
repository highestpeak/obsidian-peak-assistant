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
const vaultIntelligence = readFileSync(
	'src/ui/view/vault-intelligence/VaultIntelligenceWorkspace.tsx',
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
	/<AIInstructionComposer[\s\S]*?compact[\s\S]*?autoFocus/,
	'AI Search must use the compact adaptive composer',
);
assert(!modal.includes('singleLine'), 'AI Search must not disable wrapping or new lines');
assert(!instructionComposer.includes('singleLine={singleLine}'));
assert(!promptInputBody.includes('transaction.newDoc.lines === 1'));
assert(promptInputBody.includes('EditorView.lineWrapping'));
assert(!modal.includes('pk-ai-graph-type-field'), 'Graph Type belongs to the explicit Create Graph flow');
assert(!modal.includes('aria-label="Graph type"'));

assert.match(
	styles,
	/:is\(\.pktw-root, \.peak-design-root\) \.pk-ai-workspace-trigger\s*\{[\s\S]*?width:\s*auto !important;[\s\S]*?min-width:\s*0 !important;[\s\S]*?max-width:\s*none !important;[\s\S]*?flex:\s*1;/,
	'the AI workspace main tab must leave a distinct hit target for its menu trigger',
);
assert.match(
	codeMirrorStyles,
	/pk-ai-instruction-editor[\s\S]*?\.cm-content\s*\{[\s\S]*?min-height:\s*28px !important;[\s\S]*?max-height:\s*72px !important;[\s\S]*?padding:\s*4px 0 !important;/,
	'the adaptive query editor must vertically center one line and grow to three lines',
);
assert(!codeMirrorStyles.includes('cm-editor-single-line'));
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
assert.match(
	styles,
	/pk-ai-instruction-submit:not\(:disabled\)\s*\{[\s\S]*?color:\s*var\(--pk-accent-fg\);/,
	'the submit arrow must use the high-contrast accent foreground token',
);
assert.match(
	styles,
	/pk-ai-instruction-submit:not\(:disabled\) svg\s*\{[\s\S]*?width:\s*16px !important;[\s\S]*?stroke-width:\s*2\.2;/,
	'the submit glyph must remain legible inside the accent circle',
);
assert.match(
	styles,
	/pk-ai-workspace-option\[aria-selected="true"\]\s*\{[\s\S]*?background:\s*var\(--pk-state-selected\) !important;/,
	'the selected AI workspace must use a quiet tint instead of a saturated block',
);
assert.match(styles, /\.cm-scroller\s*\{[\s\S]*?scrollbar-width:\s*none;/);
assert.match(styles, /\.cm-scroller::\-webkit-scrollbar[\s\S]*?display:\s*none;/);

assert(vaultIntelligence.includes('pk-vi-object-grid'));
assert(vaultIntelligence.includes('pk-vi-work-surface'));
assert(vaultIntelligence.includes('pk-vi-graph-canvas'));
assert(vaultIntelligence.includes('pk-vi-activity-grid'));
assert(vaultIntelligence.includes('pk-vi-maintenance'));
assert(!vaultIntelligence.includes("['runs', 'Runs']"));
assert(!vaultIntelligence.includes('@xyflow/react'));

assert(!sources.includes('pktw-h-[540px]'), 'Sources list and tree must not reserve a fixed 540px canvas');
assert(sources.includes('0 Vault relationships'));
assert(sources.includes("host.findFileByPath(source.path)?.stat.mtime"));
assert(!sources.includes('displayScorePercent: Math.round(score * 100)'));

console.log('ai-search-ui-regression: passed');
