import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function source(path: string): string {
	return readFileSync(join(ROOT, path), 'utf8');
}

function run(): void {
	const messages = source('src/ui/view/chat-view/view-Messages.tsx');
	const project = source('src/ui/view/chat-view/view-ProjectOverview.tsx');
	const studio = source('src/ui/view/chat-studio-view/ChatStudioView.tsx');
	const outline = source('src/ui/view/chat-view/components/conversation-index/OutlineTab.tsx');
	const resources = source('src/ui/view/chat-view/components/conversation-index/ResourcesTab.tsx');
	const styles = source('src/styles/peak-components.css');

	assert.match(messages, /const EmptyThreadHero[\s\S]*?<Composer \/>/,
		'empty conversation state must retain the reference Composer entry geometry');
	assert.match(messages, /const EmptyThreadHero[\s\S]*?pkchat-header/,
		'empty conversation state must retain the reference header geometry');
	assert.ok(!project.includes('No project selected.'),
		'project route must not collapse to a bare missing-selection sentence');
	assert.ok(!project.includes('Project not found.'),
		'project route must not collapse to a bare missing-project sentence');
	assert.match(project, /if \(!projectId \|\| !project\) return <ProjectOverviewUnavailable \/>;/,
		'missing project data must use the reference-compatible presentation subtree');
	assert.match(project, /<ProjectStatsRow conversations=\{0\} messages=\{0\} starred=\{0\} resources=\{0\} \/>/,
		'empty project data keeps zero metrics instead of hiding the metrics row');
	assert.match(project, /counts=\{zeroCounts\} disabled \/>/,
		'project tabs remain visible but must not pretend to be actionable without project data');
	assert.match(styles, /\.pkchat-project-unavailable\s*\{[\s\S]*?var\(--pk-chat-reading-width\)/,
		'missing project state must stay on the same reading rail as the reference content');
	assert.match(studio, /viewMode !== ViewMode\.PROJECT_OVERVIEW[\s\S]*?viewMode !== ViewMode\.PROJECT_CONVERSATIONS_LIST/,
		'new and empty conversation states must retain the reference right-index slot');
	assert.match(styles, /\.pkchat-idx-row__action\s*\{[\s\S]*?width:\s*28px !important;[\s\S]*?height:\s*28px !important;/,
		'right-index open action must defend its compact hit geometry against host button styles');
	assert.match(styles, /\.pkchat-idx-row--artifact\s*\{[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/,
		'generated-resource rows must remain neutral until the user selects one');
	assert.match(outline, /isActive=\{item\.id === `msg:\$\{activeMessageId\}`\}/,
		'a message-scoped scroll spy must not select every artifact emitted by the same message');
	assert.match(resources, /row\.target \? <ExternalLink[\s\S]*?<LocateFixed/,
		'every resource row keeps an explicit direct-open or locate-producing-message action');
	assert.match(resources, /pkchat-idx-row__action[\s\S]*?pkchat-idx-row__time/,
		'time must remain the final resource-row column after the action slot');

	console.log('chat-studio-reference-state-parity: all guards passed');
}

run();
