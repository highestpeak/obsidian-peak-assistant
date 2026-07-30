/**
 * Task B1 (plan §5.2 R1) — ToolAvailability resolver contract.
 *
 * Locks the pure availability record shape the Composer, Agent, and error UI
 * all consume. Also anchors the B1 web rule (§5.2 R2): catalog `webSearch:
 * true` no longer suppresses fallback injection; only the presence/absence
 * of a real native adapter and/or a configured Web Search profile decides.
 *
 * MCP behaviour is covered here at the availability layer only; the tool-
 * def wiring is exercised in `mcp-chat-integration.test.ts`.
 */

import assert from 'assert';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import type { VaultRetrievalPort } from '@/core/ports/VaultRetrievalPort';
import type { MCPClientManager } from '@/service/mcp/MCPClientManager';
import type { MCPConnectionInfo } from '@/core/types/mcp';
import {
    availableToolIds,
    resolveToolAvailability,
    type ToolAvailability,
} from '@/service/chat/tools/toolAvailability';
import type { WebSearchProvider } from '@/service/chat/tools/webSearchProvider';
import { NULL_WEB_SEARCH_PROVIDER } from '@/service/chat/tools/webSearchProvider';

function makeProfile(id: string): Profile {
    return {
        id,
        name: id,
        kind: 'openai',
        enabled: true,
        createdAt: 0,
        baseUrl: 'https://example.com',
        apiKey: null,
        primaryModel: 'm-primary',
        fastModel: 'm-fast',
        customHeaders: {},
        embeddingEndpoint: null,
        embeddingApiKey: null,
        embeddingModel: null,
        icon: null,
        description: null,
    };
}

const VAULT_STUB: VaultRetrievalPort = {
    async search() { return []; },
};

function makeMcpManager(opts: {
    infos: MCPConnectionInfo[];
    tools: Array<{ serverId: string; serverName: string; tools: Array<{ name: string }> }>;
}): MCPClientManager {
    return {
        getAllConnectionInfo: () => opts.infos,
        getAllDiscoveredTools: () =>
            opts.tools.map((t) => ({
                serverId: t.serverId,
                serverName: t.serverName,
                tools: t.tools.map((x) => ({ name: x.name })),
            })),
        // resolver only reaches these two accessors.
        callTool: async () => { throw new Error('not needed for availability test'); },
        connect: async () => { throw new Error('not needed'); },
        disconnect: async () => { throw new Error('not needed'); },
        dispose: async () => { throw new Error('not needed'); },
        getConnectionInfo: () => undefined,
        getDiscoveredTools: () => [],
    } as unknown as MCPClientManager;
}

// ─── availability slice ─────────────────────────────────────────────────────

function testVaultSearchAvailableWhenPortWiredAndToggleOn(): void {
    ProfileRegistry.resetInstance();
    const records = resolveToolAvailability({
        enableVaultSearch: true,
        enableWebSearch: false,
        vaultRetrieval: VAULT_STUB,
    });
    const vault = records.find((r) => r.toolId === 'vault_search');
    assert.ok(vault, 'vault_search record present');
    assert.strictEqual(vault!.state, 'available');
    console.log('PASS: vault_search available when port wired + toggle on');
}

function testVaultSearchUnconfiguredWhenToggleOff(): void {
    ProfileRegistry.resetInstance();
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: false,
        vaultRetrieval: VAULT_STUB,
    });
    const vault = records.find((r) => r.toolId === 'vault_search')!;
    assert.strictEqual(vault.state, 'unconfigured');
    console.log('PASS: vault_search unconfigured when toggle off');
}

function testVaultSearchUnsupportedWhenPortMissing(): void {
    ProfileRegistry.resetInstance();
    const records = resolveToolAvailability({
        enableVaultSearch: true,
        enableWebSearch: false,
        vaultRetrieval: null,
    });
    const vault = records.find((r) => r.toolId === 'vault_search')!;
    assert.strictEqual(vault.state, 'unsupported');
    console.log('PASS: vault_search unsupported when retrieval port missing');
}

function testWebSearchAvailableWithProfile(): void {
    ProfileRegistry.resetInstance();
    const registry = ProfileRegistry.getInstance();
    registry.load(
        {
            profiles: [makeProfile('p-web')],
            activeAgentConfig: null,
            activeAgentFastConfig: null,
            activeChatConfig: null,
            activeCopilotConfig: null,
            activeEmbeddingConfig: null,
            activeWebSearchConfig: { profileId: 'p-web', modelId: 'm-primary' },
        },
        () => { /* no persistence in tests */ },
    );
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: true,
        profileRegistry: registry,
    });
    const web = records.find((r) => r.toolId === 'web_search')!;
    assert.strictEqual(web.state, 'available');
    ProfileRegistry.resetInstance();
    console.log('PASS: web_search available with active Web Search profile');
}

function testWebSearchIgnoresCatalogSuppression(): void {
    // B1 §5.2 R2 rule: catalog `webSearch: true` must not suppress fallback
    // when the null-provider says no native adapter is present.
    ProfileRegistry.resetInstance();
    const registry = ProfileRegistry.getInstance();
    registry.load(
        {
            profiles: [makeProfile('p-web')],
            activeAgentConfig: null,
            activeAgentFastConfig: null,
            activeChatConfig: null,
            activeCopilotConfig: null,
            activeEmbeddingConfig: null,
            activeWebSearchConfig: { profileId: 'p-web', modelId: 'm-primary' },
        },
        () => { /* no persistence in tests */ },
    );
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: true,
        profileRegistry: registry,
        modelCapabilities: { vision: false, pdfInput: false, tools: true, webSearch: true },
    });
    const web = records.find((r) => r.toolId === 'web_search')!;
    assert.strictEqual(
        web.state,
        'available',
        'catalog webSearch flag must NOT suppress fallback when no native adapter',
    );
    ProfileRegistry.resetInstance();
    console.log('PASS: web_search ignores catalog suppression (B1 R2)');
}

function testWebSearchUnconfiguredWithoutProfile(): void {
    ProfileRegistry.resetInstance();
    const registry = ProfileRegistry.getInstance();
    registry.load(
        {
            profiles: [],
            activeAgentConfig: null,
            activeAgentFastConfig: null,
            activeChatConfig: null,
            activeCopilotConfig: null,
            activeEmbeddingConfig: null,
            activeWebSearchConfig: null,
        },
        () => { /* no persistence in tests */ },
    );
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: true,
        profileRegistry: registry,
    });
    const web = records.find((r) => r.toolId === 'web_search')!;
    assert.strictEqual(web.state, 'unconfigured');
    assert.strictEqual(web.configureAction, 'profiles');
    ProfileRegistry.resetInstance();
    console.log('PASS: web_search unconfigured when no active Web Search profile');
}

function testWebSearchNativeAdapterOverride(): void {
    // If (future) a real native adapter registers, availability MUST flip to
    // available without needing a Web Search profile.
    ProfileRegistry.resetInstance();
    const trueNative: WebSearchProvider = {
        isNativeAvailable() { return true; },
    };
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: true,
        profileRegistry: null,
        webSearchProvider: trueNative,
    });
    const web = records.find((r) => r.toolId === 'web_search')!;
    assert.strictEqual(web.state, 'available');
    console.log('PASS: native adapter override flips web_search to available');
}

function testNullNativeAdapterIsDefault(): void {
    // Sanity: the exported default provider says "no native".
    assert.strictEqual(
        NULL_WEB_SEARCH_PROVIDER.isNativeAvailable({
            profile: null,
            modelId: null,
            capabilityFlag: true,
        }),
        false,
    );
    console.log('PASS: default WebSearchProvider is null (no native adapter today)');
}

// ─── MCP slice ──────────────────────────────────────────────────────────────

function testMcpDiscoveredOnlyForConnected(): void {
    ProfileRegistry.resetInstance();
    const mcp = makeMcpManager({
        infos: [
            { serverId: 's1', status: 'connected', toolCount: 2 },
            { serverId: 's2', status: 'error', toolCount: 0, error: 'boom' },
        ],
        tools: [
            { serverId: 's1', serverName: 'FS', tools: [{ name: 'read_file' }, { name: 'write_file' }] },
        ],
    });
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: false,
        mcpClientManager: mcp,
    });
    const mcpRecs = records.filter((r) => r.toolId.startsWith('mcp_') || r.toolId.startsWith('mcp_server:'));
    // s1 → two available tools; s2 → one disconnected server record.
    assert.strictEqual(mcpRecs.length, 3, 'two tools + one disconnected server');
    const ids = mcpRecs.map((r) => `${r.toolId}:${r.state}`).sort();
    assert.deepStrictEqual(ids, [
        'mcp_FS_read_file:available',
        'mcp_FS_write_file:available',
        'mcp_server:s2:disconnected',
    ]);
    // Disconnected record carries a configureAction so the UI can route to Settings.
    const dc = mcpRecs.find((r) => r.state === 'disconnected')!;
    assert.strictEqual(dc.configureAction, 'mcp');
    assert.match(dc.reason ?? '', /boom/);
    console.log('PASS: MCP tools surface only for connected servers; disconnected land as server records');
}

function testMcpAbsentEntirelyWhenManagerNull(): void {
    ProfileRegistry.resetInstance();
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: false,
        mcpClientManager: null,
    });
    const mcpRecs = records.filter((r) => r.toolId.startsWith('mcp_'));
    assert.strictEqual(mcpRecs.length, 0);
    console.log('PASS: MCP absent entirely (no records) when manager is null');
}

function testAvailableToolIdsFilter(): void {
    const records: ToolAvailability[] = [
        { toolId: 'a', state: 'available' },
        { toolId: 'b', state: 'disconnected' },
        { toolId: 'c', state: 'unconfigured' },
        { toolId: 'd', state: 'available' },
    ];
    const ids = availableToolIds(records);
    assert.deepStrictEqual([...ids].sort(), ['a', 'd']);
    console.log('PASS: availableToolIds keeps only available records');
}

// ─── runner ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const tests: Array<[string, () => void | Promise<void>]> = [
        ['vault_search available when port wired + toggle on', testVaultSearchAvailableWhenPortWiredAndToggleOn],
        ['vault_search unconfigured when toggle off', testVaultSearchUnconfiguredWhenToggleOff],
        ['vault_search unsupported when port missing', testVaultSearchUnsupportedWhenPortMissing],
        ['web_search available with profile', testWebSearchAvailableWithProfile],
        ['web_search ignores catalog suppression (B1)', testWebSearchIgnoresCatalogSuppression],
        ['web_search unconfigured without profile', testWebSearchUnconfiguredWithoutProfile],
        ['web_search native adapter override', testWebSearchNativeAdapterOverride],
        ['default WebSearchProvider is null', testNullNativeAdapterIsDefault],
        ['MCP tools only for connected', testMcpDiscoveredOnlyForConnected],
        ['MCP absent when manager null', testMcpAbsentEntirelyWhenManagerNull],
        ['availableToolIds filter', testAvailableToolIdsFilter],
    ];
    for (const [name, fn] of tests) {
        try {
            await fn();
        } catch (err) {
            console.error(`FAIL: ${name}`);
            throw err;
        }
    }
    console.log(`\ntool-availability: all ${tests.length} guards passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
