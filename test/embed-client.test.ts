/**
 * Tests for embedClient.ts
 *
 * Uses a mock ProfileRegistry + mock fetch to verify:
 * - Correct endpoint URL construction
 * - Authorization header format
 * - Request body shape
 * - Response parsing (data.data[].embedding)
 * - Error handling for non-OK responses
 * - Fallback from embedding profile to agent profile
 */
import assert from 'assert';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { embedTexts, embedText } from '@/core/embeddings/embedClient';
import type { Profile } from '@/core/profiles/types';

// ---- helpers ----------------------------------------------------------------

const BASE_PROFILE: Profile = {
  id: 'test-profile',
  name: 'Test Profile',
  kind: 'custom',
  enabled: true,
  createdAt: 0,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key',
  authToken: null,
  primaryModel: 'gpt-4o',
  fastModel: 'gpt-4o-mini',
  embeddingEndpoint: 'https://api.openai.com/v1',
  embeddingApiKey: 'sk-embed-key',
  embeddingModel: 'text-embedding-3-small',
  customHeaders: {},
  icon: null,
  description: null,
};

/** Capture the last fetch call */
interface CapturedFetch {
  url: string;
  init: RequestInit;
}

function makeMockFetch(
  response: object,
  status = 200,
): { mockFetch: typeof fetch; captured: CapturedFetch[] } {
  const captured: CapturedFetch[] = [];
  const mockFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    captured.push({ url: String(url), init: init ?? {} });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
      text: async () => JSON.stringify(response),
    } as Response;
  };
  return { mockFetch: mockFetch as typeof fetch, captured };
}

function makeErrorFetch(status: number, body: string): typeof fetch {
  return async (): Promise<Response> => ({
    ok: false,
    status,
    json: async () => { throw new Error('not json'); },
    text: async () => body,
  } as Response);
}

/** Build a minimal embedding API response */
function embeddingResponse(vectors: number[][]): object {
  return {
    object: 'list',
    data: vectors.map((embedding, index) => ({ object: 'embedding', index, embedding })),
    model: 'text-embedding-3-small',
  };
}

// ---- test runner ------------------------------------------------------------

async function run(): Promise<void> {
  const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
    // --- happy-path endpoint & header ----------------------------------------
    {
      name: 'embedTexts: constructs correct endpoint URL',
      fn: async () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          {
            profiles: [BASE_PROFILE],
            activeAgentProfileId: 'test-profile',
            activeEmbeddingProfileId: 'test-profile',
            sdkSettings: {} as any,
          },
          () => {},
        );

        const { mockFetch, captured } = makeMockFetch(
          embeddingResponse([[0.1, 0.2, 0.3]]),
        );
        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          await embedTexts(['hello']);
        } finally {
          globalThis.fetch = origFetch;
        }

        assert.strictEqual(captured.length, 1);
        assert.strictEqual(
          captured[0].url,
          'https://api.openai.com/v1/embeddings',
        );
      },
    },

    {
      name: 'embedTexts: sends correct Authorization header',
      fn: async () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          {
            profiles: [BASE_PROFILE],
            activeAgentProfileId: 'test-profile',
            activeEmbeddingProfileId: 'test-profile',
            sdkSettings: {} as any,
          },
          () => {},
        );

        const { mockFetch, captured } = makeMockFetch(
          embeddingResponse([[0.1, 0.2]]),
        );
        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          await embedTexts(['hello']);
        } finally {
          globalThis.fetch = origFetch;
        }

        const headers = captured[0].init.headers as Record<string, string>;
        assert.strictEqual(headers['Authorization'], 'Bearer sk-embed-key');
      },
    },

    // --- request body ---------------------------------------------------------
    {
      name: 'embedTexts: sends correct request body with model and input',
      fn: async () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          {
            profiles: [BASE_PROFILE],
            activeAgentProfileId: 'test-profile',
            activeEmbeddingProfileId: 'test-profile',
            sdkSettings: {} as any,
          },
          () => {},
        );

        const { mockFetch, captured } = makeMockFetch(
          embeddingResponse([[1, 2, 3], [4, 5, 6]]),
        );
        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          await embedTexts(['foo', 'bar']);
        } finally {
          globalThis.fetch = origFetch;
        }

        const body = JSON.parse(captured[0].init.body as string);
        assert.strictEqual(body.model, 'text-embedding-3-small');
        assert.deepStrictEqual(body.input, ['foo', 'bar']);
      },
    },

    // --- response parsing -----------------------------------------------------
    {
      name: 'embedTexts: parses data.data[].embedding correctly',
      fn: async () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          {
            profiles: [BASE_PROFILE],
            activeAgentProfileId: 'test-profile',
            activeEmbeddingProfileId: 'test-profile',
            sdkSettings: {} as any,
          },
          () => {},
        );

        const vectors = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
        const { mockFetch } = makeMockFetch(embeddingResponse(vectors));
        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        let result: number[][] = [];
        try {
          result = await embedTexts(['a', 'b']);
        } finally {
          globalThis.fetch = origFetch;
        }

        assert.deepStrictEqual(result, vectors);
      },
    },

    // --- embedText convenience wrapper ----------------------------------------
    {
      name: 'embedText: returns single vector from embedTexts',
      fn: async () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          {
            profiles: [BASE_PROFILE],
            activeAgentProfileId: 'test-profile',
            activeEmbeddingProfileId: 'test-profile',
            sdkSettings: {} as any,
          },
          () => {},
        );

        const { mockFetch } = makeMockFetch(embeddingResponse([[9, 8, 7]]));
        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        let result: number[] = [];
        try {
          result = await embedText('single text');
        } finally {
          globalThis.fetch = origFetch;
        }

        assert.deepStrictEqual(result, [9, 8, 7]);
      },
    },

    // --- error handling -------------------------------------------------------
    {
      name: 'embedTexts: throws on non-OK response with status + body',
      fn: async () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          {
            profiles: [BASE_PROFILE],
            activeAgentProfileId: 'test-profile',
            activeEmbeddingProfileId: 'test-profile',
            sdkSettings: {} as any,
          },
          () => {},
        );

        const origFetch = globalThis.fetch;
        globalThis.fetch = makeErrorFetch(401, 'Unauthorized: invalid API key');
        try {
          await assert.rejects(
            () => embedTexts(['test']),
            (err: Error) => {
              assert.ok(err.message.includes('401'), `Expected 401 in: ${err.message}`);
              assert.ok(
                err.message.includes('Unauthorized'),
                `Expected body snippet in: ${err.message}`,
              );
              return true;
            },
          );
        } finally {
          globalThis.fetch = origFetch;
        }
      },
    },

    {
      name: 'embedTexts: throws when no profile configured',
      fn: async () => {
        ProfileRegistry.resetInstance();
        ProfileRegistry.getInstance().load(
          {
            profiles: [],
            activeAgentProfileId: null,
            activeEmbeddingProfileId: null,
            sdkSettings: {} as any,
          },
          () => {},
        );

        await assert.rejects(
          () => embedTexts(['test']),
          /No embedding profile configured/,
        );
      },
    },

    {
      name: 'embedTexts: throws when profile has no embedding endpoint',
      fn: async () => {
        ProfileRegistry.resetInstance();
        const noEmbedProfile: Profile = {
          ...BASE_PROFILE,
          embeddingEndpoint: null,
          embeddingModel: null,
          embeddingApiKey: null,
        };
        ProfileRegistry.getInstance().load(
          {
            profiles: [noEmbedProfile],
            activeAgentProfileId: 'test-profile',
            activeEmbeddingProfileId: 'test-profile',
            sdkSettings: {} as any,
          },
          () => {},
        );

        await assert.rejects(
          () => embedTexts(['test']),
          /Embedding endpoint not configured/,
        );
      },
    },

    // --- fallback: no embedding profile → use agent profile -------------------
    {
      name: 'embedTexts: falls back to agent profile when no embedding profile set',
      fn: async () => {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
          {
            profiles: [BASE_PROFILE],
            activeAgentProfileId: 'test-profile',
            activeEmbeddingProfileId: null, // no embedding profile
            sdkSettings: {} as any,
          },
          () => {},
        );

        const { mockFetch, captured } = makeMockFetch(
          embeddingResponse([[0.5, 0.6]]),
        );
        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          await embedTexts(['fallback test']);
        } finally {
          globalThis.fetch = origFetch;
        }

        // Should still succeed using agent profile's embedding config
        assert.strictEqual(captured.length, 1);
        assert.ok(captured[0].url.includes('/embeddings'));
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ PASS: ${test.name}`);
      passed++;
    } catch (err) {
      failed++;
      console.error(`❌ FAIL: ${test.name}`);
      console.error(err);
    }
  }

  console.log(`\nembedClient tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void run();
