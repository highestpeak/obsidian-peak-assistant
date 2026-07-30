import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const bundle = readFileSync(path.join(root, 'main.js'), 'utf8');
const config = JSON.parse(
	readFileSync(path.join(root, 'tools/ai-search-simulator/config.json'), 'utf8'),
);
const forbiddenValues = [
	...Object.values(config.errors),
	config.workflow.recoveryMissingNotePath,
	config.fixedResponses.escalationReason,
	config.copy.en.sections[0][0],
];
const leaked = forbiddenValues.filter((value) => bundle.includes(value));
if (leaked.length > 0) {
	console.error('[simulator-boundary] Sidecar runtime leaked into main.js:');
	for (const value of leaked) console.error(`- ${value}`);
	process.exit(1);
}

console.log('[simulator-boundary] sidecar scenario runtime is absent from main.js');
