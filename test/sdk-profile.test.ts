import assert from 'assert';
import { toAgentSdkEnv, DEFAULT_SDK_PROFILE, readProfileFromSettings, type SdkProfile } from '@/service/agents/vault-sdk/sdkProfile';

async function run(): Promise<void> {
	const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
		{
			name: 'toAgentSdkEnv: anthropic direct with api key',
			fn: () => {
				const profile: SdkProfile = {
					kind: 'anthropic-direct',
					baseUrl: 'https://api.anthropic.com',
					apiKey: 'sk-ant-test',
					authToken: null,
					primaryModel: 'claude-opus-4-6',
					fastModel: 'claude-haiku-4-5',
				};
				const env = toAgentSdkEnv(profile);
				assert.strictEqual(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
				assert.strictEqual(env.ANTHROPIC_API_KEY, 'sk-ant-test');
				assert.strictEqual(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-4-6');
				assert.strictEqual(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-4-5');
				assert.strictEqual(env.ANTHROPIC_AUTH_TOKEN, undefined);
			},
		},
		{
			name: 'toAgentSdkEnv: openrouter requires empty api key and bearer token',
			fn: () => {
				const profile: SdkProfile = {
					kind: 'openrouter',
					baseUrl: 'https://openrouter.ai/api',
					apiKey: null,
					authToken: 'sk-or-test',
					primaryModel: 'anthropic/claude-opus-4-6',
					fastModel: 'deepseek/deepseek-v3',
				};
				const env = toAgentSdkEnv(profile);
				assert.strictEqual(env.ANTHROPIC_BASE_URL, 'https://openrouter.ai/api');
				assert.strictEqual(env.ANTHROPIC_API_KEY, '');
				assert.strictEqual(env.ANTHROPIC_AUTH_TOKEN, 'sk-or-test');
				assert.strictEqual(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'anthropic/claude-opus-4-6');
				assert.strictEqual(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'deepseek/deepseek-v3');
			},
		},
		{
			name: 'toAgentSdkEnv: default profile has sane anthropic-direct values',
			fn: () => {
				const profile: SdkProfile = { ...DEFAULT_SDK_PROFILE, apiKey: 'sk-ant-test' };
				const env = toAgentSdkEnv(profile);
				assert.strictEqual(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
				assert.strictEqual(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-4-6');
			},
		},
		{
			name: 'toAgentSdkEnv: throws on missing credentials',
			fn: () => {
				const broken: SdkProfile = {
					kind: 'anthropic-direct',
					baseUrl: 'https://api.anthropic.com',
					apiKey: null,
					authToken: null,
					primaryModel: 'claude-opus-4-6',
					fastModel: 'claude-haiku-4-5',
				};
				assert.throws(() => toAgentSdkEnv(broken), /credentials/i);
			},
		},
		{
			name: 'readProfileFromSettings: merges partial user settings with default',
			fn: () => {
				const mockSettings = {
					vaultSearch: {
						sdkProfile: {
							kind: 'openrouter' as const,
							baseUrl: 'https://openrouter.ai/api',
							authToken: 'sk-or-key',
							primaryModel: 'openai/gpt-5',
						},
					},
				};
				const profile = readProfileFromSettings(mockSettings);
				assert.strictEqual(profile.kind, 'openrouter');
				assert.strictEqual(profile.authToken, 'sk-or-key');
				assert.strictEqual(profile.primaryModel, 'openai/gpt-5');
				// Default fastModel carries through since user didn't override
				assert.strictEqual(profile.fastModel, 'claude-haiku-4-5');
			},
		},
		{
			name: 'readProfileFromSettings: undefined settings returns default profile',
			fn: () => {
				const profile = readProfileFromSettings(undefined);
				assert.strictEqual(profile.kind, 'anthropic-direct');
				assert.strictEqual(profile.baseUrl, 'https://api.anthropic.com');
			},
		},
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			await test.fn();
			console.log(`✅ PASS: ${test.name}`);
			passed += 1;
		} catch (error) {
			failed += 1;
			console.error(`❌ FAIL: ${test.name}`);
			console.error(error);
		}
	}

	console.log(`\nSdkProfile tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) {
		process.exit(1);
	}
}

void run();
