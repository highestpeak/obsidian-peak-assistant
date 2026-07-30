import assert from 'assert';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const FORBIDDEN = [
	['@anthropic-ai', 'claude-agent-sdk'].join('/'),
	['queryWith', 'Profile'].join(''),
	['createSdk', 'McpServer'].join(''),
	['sdkAgent', 'Pool'].join(''),
	['sdkMessage', 'Adapter'].join(''),
	['ClaudeAgent', 'SDKBridge'].join(''),
	['claude', 'sdk'].join('-'),
	['Claude Code', 'returned'].join(' '),
	['Agent', 'SDK'].join(' '),
];

function run(): void {
	const productionFiles = [
		...collectFiles(path.join(ROOT, 'src')),
		...collectFiles(path.join(ROOT, 'scripts')),
		...collectFiles(path.join(ROOT, 'templates')),
		path.join(ROOT, 'main.ts'),
		path.join(ROOT, 'package.json'),
		path.join(ROOT, 'esbuild.config.mjs'),
		path.join(ROOT, '.gitignore'),
	].filter((file) => /\.(?:ts|tsx|js|mjs|json|md)$/.test(file) || file.endsWith('.gitignore'));

	for (const file of productionFiles) {
		const source = fs.readFileSync(file, 'utf8');
		for (const forbidden of FORBIDDEN) {
			assert(
				!source.includes(forbidden),
				`${path.relative(ROOT, file)} reintroduced retired agent runtime marker: ${forbidden}`,
			);
		}
	}

	assert(!fs.existsSync(path.join(ROOT, 'sdk')), 'bundled SDK sidecar directory must stay retired');
	assert(
		!fs.existsSync(path.join(ROOT, 'src/service/agents/vault-sdk')),
		'legacy vault-sdk directory must stay retired',
	);

	const harnessConsumers: Record<string, string> = {
		'src/service/agents/report/ReportOrchestrator.ts': 'HarnessModelRunner',
		'src/service/chat/service-manager.ts': 'HarnessModelRunner',
		'src/service/copilot/CopilotMetaAgentStream.ts': 'HarnessModelRunner',
		'src/service/copilot/vault/VaultMetaAgentStream.ts': 'HarnessModelRunner',
		'src/service/copilot/actions/agent-actions.ts': 'HarnessModelRunner',
		'src/service/agents/ai-graph/GraphAgent.ts': 'HarnessModelRunner',
		'src/service/agents/intuition-helper/intuition.recon.ts': 'HarnessModelRunner',
		'src/app/ambient/LlmAmbientExplanationAdapter.ts': 'HarnessModelRunner',
	};
	for (const [relativePath, marker] of Object.entries(harnessConsumers)) {
		assert(
			fs.readFileSync(path.join(ROOT, relativePath), 'utf8').includes(marker),
			`${relativePath} must execute through Peak Harness`,
		);
	}

	console.log('Agent SDK retirement boundary: PASS');
}

function collectFiles(directory: string): string[] {
	if (!fs.existsSync(directory)) return [];
	const files: string[] = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectFiles(fullPath));
			continue;
		}
		files.push(fullPath);
	}
	return files;
}

run();
