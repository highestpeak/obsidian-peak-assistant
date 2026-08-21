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

	console.log('chat-studio-reference-state-parity: all guards passed');
}

run();
