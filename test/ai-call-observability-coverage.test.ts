import assert from 'assert';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function productionSources(dir = path.join(ROOT, 'src')): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const absolute = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...productionSources(absolute));
		if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(absolute);
	}
	return files;
}

function assertDirectCallersCarryDebug(
	boundary: RegExp,
	implementationFiles: readonly string[],
): void {
	const uncovered: string[] = [];
	for (const absolute of productionSources()) {
		const relative = path.relative(ROOT, absolute);
		if (implementationFiles.includes(relative)) continue;
		const source = fs.readFileSync(absolute, 'utf8');
		if (!boundary.test(source)) continue;
		if (/debugTrace/.test(source)) continue;
		uncovered.push(relative);
	}
	assert.deepStrictEqual(uncovered, [], `AI call boundary bypasses diagnostics:\n${uncovered.join('\n')}`);
}

console.log('ai-call-observability: provider boundary');
{
	const loop = read('src/service/agents/harness/loop/AgentLoop.ts');
	assert.match(loop, /withDebugLanguageModel\(/, 'Harness model execution must use the shared middleware');
	assert.match(loop, /debugCapabilityId/, 'Harness calls must retain a stable capability id');

	const direct = read('src/core/providers/vercel/index.ts');
	assert.match(direct, /withDebugLanguageModel\(/, 'direct Vercel calls must use the shared middleware');
	assert.match(direct, /debug\?: DebugLanguageModelContext/, 'direct calls must accept explicit app-owned diagnostics');

	assertDirectCallersCarryDebug(
		/\b(?:runHarnessModel|runHarnessText|streamHarnessModel)\s*\(/,
		['src/service/agents/harness/HarnessModelRunner.ts'],
	);
	assertDirectCallersCarryDebug(
		/\brunAgentLoop\s*\(/,
		['src/service/agents/harness/loop/AgentLoop.ts'],
	);
	assertDirectCallersCarryDebug(
		/\b(?:vercelGenerateText|vercelStreamChat)\s*\(/,
		['src/core/providers/vercel/index.ts'],
	);
}

console.log('ai-call-observability: non-chat providers');
{
	const embeddings = read('src/service/search/embeddings/embedClient.ts');
	assert.match(embeddings, /startModelCall\(/, 'embedding requests need request/response lifecycle records');
	assert.match(embeddings, /operation: 'embedding\.generate'/);

	const generation = read('src/service/media/MediaGenerationService.ts');
	assert.match(generation, /startModelCall\(/, 'media generation needs lifecycle records');
	assert.match(generation, /debugCall\?\.fail\(err\)/, 'media failures must be recorded');
	assert.match(generation, /throw err/, 'media failures must preserve fail-loud behavior');

	const understanding = read('src/service/media/MediaUnderstandingRuntime.ts');
	assert.match(understanding, /startModelCall\(/, 'transcription needs lifecycle records');
}

console.log('ai-call-observability: AI enrichment and owned child runs');
{
	const manager = read('src/service/chat/service-manager.ts');
	assert.match(manager, /query\.structured:/, 'Summary/Tag structured calls must be identifiable');
	assert.match(manager, /debugOperation: 'object\.generate'/);
	assert.match(manager, /getDebugTracePort\(\)/, 'owned child runs need explicit access to the injected port');

	const conversation = read('src/service/chat/service-conversation.ts');
	assert.match(conversation, /debugTrace: self\.debugTracePort/, 'Chat and Chat tools must receive the same port');

	const subagent = read('src/service/agents/harness/subagent/SubAgentDispatcher.ts');
	assert.match(subagent, /debugTrace: this\.ctx\.debugTrace/, 'subagents must not bypass diagnostics');
}

console.log('ai-call-observability: user-facing inspector + safe default');
{
	const settings = read('src/core/config/settingsTypes.ts');
	assert.match(settings, /DEFAULT_DEBUG_TRACE_SETTINGS[\s\S]*?mode: 'redacted'/, 'new installs must retain safe lifecycle evidence by default');

	const advanced = read('src/ui/view/settings/tabs/AdvancedSettingsTab.tsx');
	assert.match(advanced, /<AiCallDiagnostics port=\{debugTracePort\}/);
	assert.match(advanced, /debugTracePort\?\.setMode\(mode\)/, 'mode changes must apply without plugin reload');

	const inspector = read('src/ui/view/settings/components/AiCallDiagnostics.tsx');
	for (const label of ['Request', 'Response', 'Provider reasoning', 'Copy record']) {
		assert.ok(inspector.includes(label), `inspector must expose ${label}`);
	}
}

console.log('ai-call-observability: OK');
