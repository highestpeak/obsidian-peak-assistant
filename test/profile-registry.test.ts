import assert from 'assert';
import type { Profile, ProfileSettings } from '@/core/profiles/types';
import { DEFAULT_SDK_SETTINGS } from '@/core/profiles/types';
import { createPresetProfile } from '@/core/profiles/presets';
import { toAgentSdkEnv, toEmbeddingConfig } from '@/core/profiles/materialize';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';

async function run(): Promise<void> {
  const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
    // ───────── Preset factories ─────────
    {
      name: 'createPresetProfile: anthropic has correct defaults',
      fn: () => {
        const p = createPresetProfile('anthropic');
        assert.strictEqual(p.kind, 'anthropic');
        assert.strictEqual(p.baseUrl, 'https://api.anthropic.com');
        assert.strictEqual(p.primaryModel, 'claude-sonnet-4-6');
        assert.strictEqual(p.fastModel, 'claude-haiku-4-5');
        assert.strictEqual(p.enabled, true);
        assert.ok(p.id.startsWith('profile_'));
        assert.ok(typeof p.createdAt === 'number');
      },
    },
    {
      name: 'createPresetProfile: openrouter has correct defaults',
      fn: () => {
        const p = createPresetProfile('openrouter');
        assert.strictEqual(p.kind, 'openrouter');
        assert.strictEqual(p.baseUrl, 'https://openrouter.ai/api/v1');
        assert.strictEqual(p.primaryModel, 'anthropic/claude-sonnet-4-6');
      },
    },
    {
      name: 'createPresetProfile: litellm defaults to localhost',
      fn: () => {
        const p = createPresetProfile('litellm');
        assert.strictEqual(p.kind, 'litellm');
        assert.strictEqual(p.baseUrl, 'http://localhost:4000');
      },
    },
    {
      name: 'createPresetProfile: custom starts blank',
      fn: () => {
        const p = createPresetProfile('custom');
        assert.strictEqual(p.kind, 'custom');
        assert.strictEqual(p.baseUrl, '');
        assert.strictEqual(p.primaryModel, '');
      },
    },
    {
      name: 'createPresetProfile: overrides are applied',
      fn: () => {
        const p = createPresetProfile('anthropic', {
          name: 'My Custom',
          apiKey: 'sk-test',
          primaryModel: 'claude-sonnet-4-20250514',
        });
        assert.strictEqual(p.name, 'My Custom');
        assert.strictEqual(p.apiKey, 'sk-test');
        assert.strictEqual(p.primaryModel, 'claude-sonnet-4-20250514');
        assert.strictEqual(p.kind, 'anthropic'); // kind stays from preset
      },
    },

    // ───────── toAgentSdkEnv ─────────
    {
      name: 'toAgentSdkEnv: anthropic with apiKey',
      fn: () => {
        const p = createPresetProfile('anthropic', { apiKey: 'sk-ant-test' });
        const env = toAgentSdkEnv(p, 'claude-opus-4-6', 'claude-haiku-4-5');
        assert.strictEqual(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
        assert.strictEqual(env.ANTHROPIC_API_KEY, 'sk-ant-test');
        assert.strictEqual(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-4-6');
        assert.strictEqual(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-4-5');
        assert.strictEqual(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'claude-opus-4-6');
        assert.strictEqual(env.ANTHROPIC_AUTH_TOKEN, undefined);
      },
    },
    {
      name: 'toAgentSdkEnv: openrouter sends apiKey as ANTHROPIC_AUTH_TOKEN',
      fn: () => {
        const p = createPresetProfile('openrouter', { apiKey: 'sk-or-test' });
        const env = toAgentSdkEnv(p, 'anthropic/claude-opus-4-6', 'anthropic/claude-haiku-4-5');
        assert.strictEqual(env.ANTHROPIC_API_KEY, '');
        assert.strictEqual(env.ANTHROPIC_AUTH_TOKEN, 'sk-or-test');
        assert.strictEqual(env.ANTHROPIC_BASE_URL, 'https://openrouter.ai/api/v1');
      },
    },
    {
      name: 'toAgentSdkEnv: throws on missing credentials',
      fn: () => {
        const p = createPresetProfile('anthropic');
        assert.throws(() => toAgentSdkEnv(p, 'model', 'fast'), /missing/i);
      },
    },
    {
      name: 'toAgentSdkEnv: custom headers serialized',
      fn: () => {
        const p = createPresetProfile('anthropic', {
          apiKey: 'sk-test',
          customHeaders: { 'X-Org': 'test-org' },
        });
        const env = toAgentSdkEnv(p, 'claude-opus-4-6', 'claude-haiku-4-5');
        assert.strictEqual(env.ANTHROPIC_CUSTOM_HEADERS, JSON.stringify({ 'X-Org': 'test-org' }));
      },
    },
    {
      name: 'toAgentSdkEnv: empty customHeaders not included',
      fn: () => {
        const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
        const env = toAgentSdkEnv(p, 'claude-opus-4-6', 'claude-haiku-4-5');
        assert.strictEqual(env.ANTHROPIC_CUSTOM_HEADERS, undefined);
      },
    },
    {
      name: 'toAgentSdkEnv: openrouter with empty baseUrl falls back to default',
      fn: () => {
        const p = createPresetProfile('openrouter', { apiKey: 'sk-or-test', baseUrl: '' });
        const env = toAgentSdkEnv(p, 'anthropic/claude-opus-4-6', 'anthropic/claude-haiku-4-5');
        assert.strictEqual(env.ANTHROPIC_BASE_URL, 'https://openrouter.ai/api/v1');
      },
    },

    // ───────── toEmbeddingConfig ─────────
    {
      name: 'toEmbeddingConfig: returns null when no embedding fields',
      fn: () => {
        const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
        const cfg = toEmbeddingConfig(p);
        assert.strictEqual(cfg, null);
      },
    },
    {
      name: 'toEmbeddingConfig: returns config when fields set',
      fn: () => {
        const p = createPresetProfile('anthropic', {
          apiKey: 'sk-test',
          embeddingEndpoint: 'https://embed.example.com',
          embeddingModel: 'text-embedding-3-small',
          embeddingApiKey: 'sk-embed',
        });
        const cfg = toEmbeddingConfig(p)!;
        assert.ok(cfg);
        assert.strictEqual(cfg.endpoint, 'https://embed.example.com');
        assert.strictEqual(cfg.apiKey, 'sk-embed');
        assert.strictEqual(cfg.model, 'text-embedding-3-small');
      },
    },
    {
      name: 'toEmbeddingConfig: falls back to profile apiKey when embeddingApiKey is null',
      fn: () => {
        const p = createPresetProfile('anthropic', {
          apiKey: 'sk-test',
          embeddingEndpoint: 'https://embed.example.com',
          embeddingModel: 'text-embedding-3-small',
          embeddingApiKey: null,
        });
        const cfg = toEmbeddingConfig(p)!;
        assert.ok(cfg);
        assert.strictEqual(cfg.apiKey, 'sk-test');
      },
    },
    {
      name: 'toEmbeddingConfig: returns null if only endpoint (no model)',
      fn: () => {
        const p = createPresetProfile('anthropic', {
          apiKey: 'sk-test',
          embeddingEndpoint: 'https://embed.example.com',
        });
        const cfg = toEmbeddingConfig(p);
        assert.strictEqual(cfg, null);
      },
    },

    // ───────── ProfileRegistry CRUD ─────────
    {
      name: 'ProfileRegistry: add and get profiles',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        const persisted: ProfileSettings[] = [];
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          (s) => { persisted.push(s); },
        );

        const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
        registry.addProfile(p);

        assert.strictEqual(registry.getAllProfiles().length, 1);
        assert.strictEqual(registry.getProfileById(p.id)?.apiKey, 'sk-test');
        assert.strictEqual(persisted.length, 1);
      },
    },
    {
      name: 'ProfileRegistry: duplicate add throws',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => {},
        );

        const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
        registry.addProfile(p);
        assert.throws(() => registry.addProfile(p), /already exists/);
      },
    },
    {
      name: 'ProfileRegistry: update profile',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => {},
        );

        const p = createPresetProfile('anthropic', { apiKey: 'sk-old' });
        registry.addProfile(p);
        registry.updateProfile(p.id, { apiKey: 'sk-new', name: 'Updated' });

        const updated = registry.getProfileById(p.id)!;
        assert.strictEqual(updated.apiKey, 'sk-new');
        assert.strictEqual(updated.name, 'Updated');
        assert.strictEqual(updated.id, p.id); // id unchanged
      },
    },
    {
      name: 'ProfileRegistry: update non-existent throws',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => {},
        );
        assert.throws(() => registry.updateProfile('ghost', { name: 'x' }), /not found/);
      },
    },
    {
      name: 'ProfileRegistry: delete profile clears active references',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => {},
        );

        const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
        registry.addProfile(p);
        registry.setActiveAgentProfile(p.id);
        assert.ok(registry.getActiveAgentProfile());

        registry.deleteProfile(p.id);
        assert.strictEqual(registry.getAllProfiles().length, 0);
        assert.strictEqual(registry.getActiveAgentProfile(), null);
      },
    },
    {
      name: 'ProfileRegistry: delete non-existent throws',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => {},
        );
        assert.throws(() => registry.deleteProfile('ghost'), /not found/);
      },
    },
    {
      name: 'ProfileRegistry: setActiveAgentProfile',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => {},
        );

        const p1 = createPresetProfile('anthropic', { apiKey: 'sk-1' });
        const p2 = createPresetProfile('openrouter', { apiKey: 'sk-2' });
        registry.addProfile(p1);
        registry.addProfile(p2);

        registry.setActiveAgentProfile(p1.id);
        assert.strictEqual(registry.getActiveAgentProfile()?.id, p1.id);

        registry.setActiveAgentProfile(p2.id);
        assert.strictEqual(registry.getActiveAgentProfile()?.id, p2.id);

        registry.setActiveAgentProfile(null);
        // Falls back to first profile when no active config is set
        assert.strictEqual(registry.getActiveAgentProfile()?.id, p1.id);
      },
    },
    {
      name: 'ProfileRegistry: setActiveAgentProfile with invalid id throws',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => {},
        );
        assert.throws(() => registry.setActiveAgentProfile('ghost'), /not found/);
      },
    },
    {
      name: 'ProfileRegistry: Agent Fast config CRUD',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        const persisted: ProfileSettings[] = [];
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          (s) => { persisted.push(s); },
        );

        const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
        registry.addProfile(p);

        // Initially null
        assert.strictEqual(registry.getActiveAgentFastConfig(), null);

        // Set via config
        registry.setActiveAgentFastConfig({ profileId: p.id, modelId: 'claude-haiku-4-5' });
        const cfg = registry.getActiveAgentFastConfig();
        assert.ok(cfg);
        assert.strictEqual(cfg!.profile.id, p.id);
        assert.strictEqual(cfg!.modelId, 'claude-haiku-4-5');

        // Persisted snapshot includes it
        const last = persisted[persisted.length - 1];
        assert.ok(last.activeAgentFastConfig);
        assert.strictEqual(last.activeAgentFastConfig!.modelId, 'claude-haiku-4-5');

        // Clear
        registry.setActiveAgentFastConfig(null);
        assert.strictEqual(registry.getActiveAgentFastConfig(), null);
      },
    },
    {
      name: 'ProfileRegistry: delete profile clears Agent Fast config',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => {},
        );

        const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
        registry.addProfile(p);
        registry.setActiveAgentFastConfig({ profileId: p.id, modelId: 'claude-haiku-4-5' });
        assert.ok(registry.getActiveAgentFastConfig());

        registry.deleteProfile(p.id);
        assert.strictEqual(registry.getActiveAgentFastConfig(), null);
      },
    },
    {
      name: 'ProfileRegistry: setActiveEmbeddingProfile',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => {},
        );

        const p = createPresetProfile('anthropic', {
          apiKey: 'sk-test',
          embeddingEndpoint: 'https://embed.example.com',
          embeddingModel: 'text-embedding-3-small',
        });
        registry.addProfile(p);
        registry.setActiveEmbeddingProfile(p.id);
        assert.strictEqual(registry.getActiveEmbeddingProfile()?.id, p.id);
      },
    },
    {
      name: 'ProfileRegistry: getSdkSettings returns copy',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          {
            profiles: [],
            activeAgentProfileId: null,
            activeEmbeddingProfileId: null,
            sdkSettings: { cliPathOverride: '/custom/path', subprocessPoolSize: 3, warmupOnLoad: false },
          },
          () => {},
        );

        const sdk = registry.getSdkSettings();
        assert.strictEqual(sdk.cliPathOverride, '/custom/path');
        assert.strictEqual(sdk.subprocessPoolSize, 3);
        assert.strictEqual(sdk.warmupOnLoad, false);
      },
    },
    {
      name: 'ProfileRegistry: load initializes from existing profiles',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        const existing = createPresetProfile('anthropic', { apiKey: 'sk-existing' });

        registry.load(
          {
            profiles: [existing],
            activeAgentProfileId: existing.id,
            activeEmbeddingProfileId: null,
            sdkSettings: DEFAULT_SDK_SETTINGS,
          },
          () => {},
        );

        assert.strictEqual(registry.getAllProfiles().length, 1);
        assert.strictEqual(registry.getActiveAgentProfile()?.apiKey, 'sk-existing');
      },
    },
    {
      name: 'ProfileRegistry: persist is called on every mutation',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        let callCount = 0;
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
          () => { callCount++; },
        );

        const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
        registry.addProfile(p);               // 1
        registry.updateProfile(p.id, { name: 'x' }); // 2
        registry.setActiveAgentProfile(p.id);  // 3
        registry.setActiveAgentProfile(null);  // 4
        registry.deleteProfile(p.id);          // 5

        assert.strictEqual(callCount, 5);
      },
    },
    {
      name: 'ProfileRegistry: singleton consistency',
      fn: () => {
        ProfileRegistry.resetInstance();
        const a = ProfileRegistry.getInstance();
        const b = ProfileRegistry.getInstance();
        assert.strictEqual(a, b);
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  PASS: ${test.name}`);
      passed += 1;
    } catch (error) {
      failed += 1;
      console.error(`  FAIL: ${test.name}`);
      console.error(error);
    }
  }

  console.log(`\nProfile Registry tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void run();
