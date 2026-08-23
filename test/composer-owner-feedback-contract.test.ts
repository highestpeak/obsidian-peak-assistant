import assert from 'assert';
import { readFileSync } from 'fs';

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const displaySwitch = readFileSync('src/ui/view/composer/chrome/DisplayStateSwitch.tsx', 'utf8');
const segmented = readFileSync('src/ui/components/primitives/Segmented.tsx', 'utf8');
const frontmatter = readFileSync('src/ui/view/composer/blocks/frontmatter/FrontmatterBlockView.tsx', 'utf8');
const copilot = readFileSync('src/ui/view/composer/sidecar/CopilotView.tsx', 'utf8');
const related = readFileSync('src/ui/view/composer/sidecar/RelatedMaterialsModal.tsx', 'utf8');
const comment = readFileSync('src/ui/view/composer/chrome/CommentPanel.tsx', 'utf8');
const undoRedo = readFileSync('src/ui/view/composer/chrome/UndoRedoBar.tsx', 'utf8');
const capabilityRuntime = readFileSync('src/service/composer/capabilities/documentRuntime.ts', 'utf8');
const aiService = readFileSync('src/service/chat/service-manager.ts', 'utf8');
const composerCss = readFileSync('src/styles/composer.css', 'utf8');
const primitivesCss = readFileSync('src/styles/peak-components.css', 'utf8');

assert.ok(
	root.includes("const showInlineCandidate = displayState === 'edit' && hasInlineCandidate"),
	'pending candidates are visible at their origin anchor in 编辑视图',
);
assert.ok(root.includes('{editing && !showInlineCandidate && ('), 'action row only yields after a candidate card is actually visible');
assert.ok(root.includes('setInvokeErrors'), 'synchronous AI invocation errors stay visible instead of being swallowed');
assert.equal(displaySwitch.includes("value: 'all'"), false, '全部改动 is not a persistent top-level display state');
assert.equal(displaySwitch.includes("value: 'work'"), false, 'legacy 工作视图 is retired');
assert.ok(displaySwitch.includes("value: 'edit'"), 'the explicit 编辑视图 state is available');
assert.ok(undoRedo.includes('<ComposerReviewNavigation'), 'pending candidates expose task-level review navigation');
assert.ok(displaySwitch.includes('variant="animated-pill"'), 'display modes use the animated pill segmented variant');
assert.ok(displaySwitch.includes('size="sm"'), 'display modes match the compact document toolbar density');
assert.ok(displaySwitch.includes('thumbLayoutId="composer-display-state-thumb"'), 'display modes own a stable thumb animation');
assert.ok(segmented.includes('<motion.span'), 'the shared segmented primitive renders one moving thumb');
assert.ok(
	primitivesCss.includes('.pk-segmented[data-variant="animated-pill"]'),
	'the animated segmented variant shares the pill visual grammar',
);
assert.match(
	primitivesCss,
	/data-size="sm"[\s\S]*?height:\s*26px !important;[\s\S]*?min-height:\s*26px !important;[\s\S]*?padding:\s*3px var\(--pk-space-2\) !important;/,
	'the compact animated segmented size defeats the Obsidian button reset',
);
assert.ok(composerCss.includes("[data-display-state='clean'] .pk-fm-origin"), '纯净阅读 hides property origin tags');
assert.ok(composerCss.includes("[data-display-state='clean'] .pk-block-findings"), '纯净阅读 hides body AI findings');
assert.ok(root.includes('const commentSurfaceVisible = commentRailOpen;'), '纯净阅读 keeps existing comment threads visible');
assert.ok(
	root.includes("if (next === 'clean') setCommentSurfaceOpen(false);"),
	'entering 纯净阅读 starts with the on-demand comment layer closed',
);
assert.ok(
	composerCss.includes("[data-display-state='clean'] .pk-comment-anchor-marker"),
	'纯净阅读 hides per-block comment count markers',
);
assert.equal(
	composerCss.includes("[data-display-state='clean'] .pk-comment-highlights"),
	false,
	'纯净阅读 keeps comment range highlights visible',
);
assert.ok(frontmatter.includes('MetadataSuggestionPanel'), 'AI property flow has a concrete suggestion-selection stage');
assert.ok(frontmatter.includes('setCandidateReviewOpen(true)'), 'a field candidate appears only after choosing 添加');
assert.ok(frontmatter.includes("candidate={candidateReviewOpen ? candidatePayload : null}"), 'suggestions do not project into YAML before selection');
assert.ok(copilot.includes('<CopilotModelSelector'), 'Copilot keeps a model selector in the shared instruction composer');
assert.ok(
	copilot.includes('buildProfileModelItems(profiles)'),
	'Copilot model choices reuse the shared profile-qualified model catalog without importing protected Chat UI',
);
assert.equal(
	copilot.includes("@/ui/view/chat-view/components/composer/ComposerModelSelector"),
	false,
	'Copilot does not cross the protected Chat Composer boundary',
);
assert.ok(copilot.includes("modelSelection.mode === 'fixed'"), 'Copilot resolves the shared fixed selection to a model override');
assert.ok(copilot.includes('? { profileId: selectedProfileId, modelId: selectedModelId }'), 'the exact selected profile and model route is passed into capability invocation');
assert.ok(capabilityRuntime.includes('profileId?: string'), 'capability runtime retains the selected profile');
assert.ok(capabilityRuntime.includes('modelId?: string'), 'capability runtime retains the selected model');
assert.ok(
	aiService.includes("throw new Error('A model override requires its configured profileId. Runtime model fallback is disabled.');"),
	'the shared Harness AI service rejects partial route overrides',
);
assert.ok(copilot.includes('<CapabilityIcon name={item.lucideIcon} />'), 'capability rows use their declared Lucide icons');
assert.ok(related.includes('GraphWorkspaceControl'), 'related-material browser preserves List / Tree / Graph controls through the shared workspace');
assert.ok(related.includes('ResultBrowserDensityToggle'), 'related-material Compact / Detailed control remains intact');
assert.ok(related.includes('ResultBrowserSearchInput'), 'related-material filtering shares the Quick Search input implementation');
assert.ok(related.includes('<InspectorSidePanel'), 'related-material details use the same on-demand inspector grammar as Search');
assert.ok(related.includes('snippetText={snapshot.reasonBySourceId[item.id] || undefined}'), 'why-related content is rendered in the row snippet');
assert.ok(related.includes('pk-related-modal-copy'), 'related-material title and subtitle share the reference header');
assert.ok(related.includes('<Modal open'), 'related-material full view uses the shared Radix modal foundation');
assert.ok(related.includes('usePortalContainer()'), 'related-material full view targets the correct Obsidian window');
assert.ok(
	related.includes('container={portalContainer}') && related.includes('overlayClassName="pk-related-modal-overlay"'),
	'related-material full view escapes the Intelligence drawer layout context through the owner-window portal',
);
assert.ok(related.includes('openOnSelect={false}'), 'related-material rows select for preview before opening a source');
assert.ok(comment.includes("data-open={open ? 'true' : 'false'}"), 'comment rail remains mounted for close animation');
assert.equal(comment.includes('if (!open) {\\n\\t\\treturn null;'), false, 'comment rail does not disappear abruptly');
assert.ok(
	comment.includes('pk-comment-card__collaboration-actions') && comment.includes('pk-comment-card__thread-actions'),
	'comment actions separate collaboration from thread management',
);
assert.match(
	composerCss,
	/\.pk-comment-card__actions\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/,
	'comment actions stay on one structured row instead of wrapping delete onto a second line',
);
assert.match(
	comment,
	/<IconButton[\s\S]*?pk-comment-action--reply[\s\S]*?label=\{c\.reply\}[\s\S]*?<Reply size=\{12\} \/>/,
	'reply uses a labelled icon-only action',
);
assert.match(
	comment,
	/<IconButton[\s\S]*?pk-comment-action--copilot[\s\S]*?label=\{c\.askCopilot\}[\s\S]*?<Sparkles size=\{12\} \/>/,
	'Copilot handoff uses a labelled icon-only action',
);
assert.equal(comment.includes('<Reply size={12} /> {c.reply}'), false, 'reply label is not visibly repeated');
assert.equal(comment.includes('<Sparkles size={12} /> {c.askCopilot}'), false, 'Copilot label is not visibly repeated');
assert.ok(composerCss.includes('.pk-comment-action--remove:hover'), 'delete stays quiet until destructive intent is explicit');
assert.ok(
	undoRedo.includes("variant={commentOpen ? 'primary' : 'ghost'}"),
	'open comments use the same solid accent selection grammar as the display switch',
);
assert.ok(
	undoRedo.includes("variant={intelligenceOpen ? 'primary' : 'ghost'}"),
	'open Intelligence uses the same solid accent selection grammar as the display switch',
);
assert.ok(composerCss.includes(".pk-composer-comment-toggle[aria-pressed='true']"), 'active comment count remains legible on accent');

console.log('composer-owner-feedback-contract: passed');
