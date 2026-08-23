import assert from 'assert';
import type { Profile, ProfileSettings } from '@/core/profiles/types';
import { createPresetProfile } from '@/core/profiles/presets';
import { toEmbeddingConfig } from '@/core/profiles/materialize';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';

async function run(): Promise<void> {
  const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
    // ───────── Preset factories ─────────
    {
      name: 'createPresetProfile: anthropic has correct defaults',
      fn: () => {
        const p = createPresetProfile('anthropic');
        assert.strictEqual(p.kind, 'anthropic');
        assert.strictEqual(p.baseUrl, 'https://api.anthropic.com/v1');
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
        assert.strictEqual(p.primaryModel, 'anthropic/claude-sonnet-4.6');
        assert.strictEqual(p.fastModel, 'anthropic/claude-haiku-4.5');
      },
    },
    {
      name: 'load: migrates legacy OpenRouter Claude ids without changing direct Anthropic ids',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        const openrouter = createPresetProfile('openrouter', {
          primaryModel: 'anthropic/claude-sonnet-4-6',
          fastModel: 'anthropic/claude-haiku-4-5',
        });
        const anthropic = createPresetProfile('anthropic');
        registry.load({
          profiles: [openrouter, anthropic],
          activeAgentConfig: { profileId: openrouter.id, modelId: 'anthropic/claude-sonnet-4-6' },
          activeEmbeddingConfig: null,
          activeWebSearchConfig: null,
          customEndpoints: [],
        }, () => undefined);

        const migratedOpenRouter = registry.getProfileById(openrouter.id)!;
        const migratedAnthropic = registry.getProfileById(anthropic.id)!;
        assert.strictEqual(migratedOpenRouter.primaryModel, 'anthropic/claude-sonnet-4.6');
        assert.strictEqual(migratedOpenRouter.fastModel, 'anthropic/claude-haiku-4.5');
        assert.strictEqual(registry.getActiveAgentConfig()?.modelId, 'anthropic/claude-sonnet-4.6');
        assert.strictEqual(migratedAnthropic.primaryModel, 'claude-sonnet-4-6');
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
      name: 'createPresetProfile: LM Studio uses its local OpenAI-compatible server',
      fn: () => {
        const p = createPresetProfile('lmstudio');
        assert.strictEqual(p.kind, 'lmstudio');
        assert.strictEqual(p.baseUrl, 'http://127.0.0.1:1234/v1');
        assert.strictEqual(p.apiKey, null);
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
        const p = createPresetProfile('openai', {
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
		const p = createPresetProfile('openai', {
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
      name: 'ProfileRegistry.resolveSlot: research requires its exact tier config',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        const p = createPresetProfile('anthropic', { apiKey: 'sk' });
        registry.load(
          {
            profiles: [p],
            activeAgentConfig: { profileId: p.id, modelId: 'agent-role-model' },
            activeAgentProfileId: null,
            activeEmbeddingProfileId: null,
          } as any,
          () => {},
        );
        assert.strictEqual(registry.resolveSlot('research'), null);
        // Setting the Research tier binding makes it the single source.
        registry.setTierConfigs({ fast: null, research: { profileId: p.id, modelId: 'research-tier-model' }, stronger: null });
        assert.strictEqual(registry.resolveSlot('research')?.modelId, 'research-tier-model');
      },
    },
    {
      name: 'ProfileRegistry.resolveSlot: fast requires its exact tier config',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        const p = createPresetProfile('anthropic', { apiKey: 'sk' });
        registry.load(
          {
            profiles: [p],
            activeAgentConfig: { profileId: p.id, modelId: 'agent-model' },
            activeAgentFastConfig: { profileId: p.id, modelId: 'agent-fast-model' },
            activeAgentProfileId: null,
            activeEmbeddingProfileId: null,
          } as any,
          () => {},
        );
        assert.strictEqual(registry.resolveSlot('fast'), null);
        registry.setTierConfigs({ fast: { profileId: p.id, modelId: 'fast-tier-model' }, research: null, stronger: null });
        assert.strictEqual(registry.resolveSlot('fast')?.modelId, 'fast-tier-model');
      },
    },
    {
      name: 'ProfileRegistry: duplicate add throws',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
        assert.strictEqual(registry.getActiveAgentProfile(), null);
      },
    },
    {
      name: 'ProfileRegistry: setActiveAgentProfile with invalid id throws',
      fn: () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
          { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null },
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
