/**
 * Temporary debug commands for visual smoke-testing UI surfaces.
 *
 * Everything here writes to in-memory stores ONLY — never to vault or SQLite.
 * Closing the leaf or reloading the plugin drops the mock state cleanly.
 *
 * Delete this file (and the registration in Register.ts) once the index panel
 * design work is signed off.
 */

import { Notice } from 'obsidian';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { ChatConversation, ChatMessage, ChatResourceRef } from '@/service/chat/types';
import type { ResourceKind } from '@/core/document/types';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { openChatStudio } from '@/app/commands/PeakCommandActions';

/**
 * Push a synthetic conversation into the chat-data store so the Conversation
 * Index panel renders every variation the design supports:
 *
 *   - Standalone messages (no topic) — user + assistant + error variants
 *   - Topic blocks with chronological message/artifact interleaving
 *   - Topic blocks with progress capsule (varying lengths)
 *   - Multi-resource topics (markdown / image / pdf style)
 *   - Inline fenced blocks (typescript / mermaid) → extracted as code/diagram
 *     artifacts via FENCE_RE in ConversationIndex
 *   - At least one topic with **only one** message (degenerate but possible)
 *
 * Use Command Palette → "[Debug] Load mock conversation for index preview"
 * and the Chat Studio leaf opens with the fake data already populated.
 */
export function loadMockConversationForIndexPreview(): void {
	const NOW = Date.now();
	/** `t(N)` = N minutes in the past. Used everywhere in the mock so the
	 *  array stays in strict chronological order (descending N). */
	const t = (minutesAgo: number) => NOW - minutesAgo * 60_000;
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const M = (overrides: Partial<ChatMessage>): ChatMessage => ({
		id: generateUuidWithoutHyphens(),
		role: 'user',
		content: '',
		createdAtTimestamp: NOW,
		createdAtZone: zone,
		starred: false,
		model: 'mock-model',
		provider: 'mock',
		...overrides,
	});

	// All image URLs use picsum.photos with `.jpg` suffix — picsum honors the
	// extension so `getExtensionFromSource` resolves `image/jpeg` mediaType
	// and the chat-body renderer treats them as inline <img>. Seeds keep the
	// same image across runs (useful when the visual smoke test is repeated).
	const img = (seed: string, w = 480, h = 320) =>
		`https://picsum.photos/seed/${seed}/${w}/${h}.jpg`;

	// Shorthand: every resource needs a unique id. Counter scopes to this
	// command invocation.
	let rid = 0;
	const R = (kind: ResourceKind, source: string): ChatResourceRef => ({
		id: `res-${++rid}`,
		source,
		kind,
	});

	// Messages in chronological order (older → newer). ConversationIndex's
	// `buildMixedTimeline` walks this array left-to-right, so adjacency
	// inside the same topic determines what becomes one topic block vs two.
	const mock: ChatMessage[] = [
		// ── earliest: a totally orphan exchange (no topic) ─────────────────
		M({ role: 'user', content: 'hello', createdAtTimestamp: t(360) }),

		// ── topic: API profile setup ──────────────────────────────────────
		// (5 msgs · markdown · image · csv)
		M({
			role: 'user',
			topic: 'API profile setup',
			content: 'How do I configure a model profile?',
			createdAtTimestamp: t(320),
		}),
		M({
			role: 'user',
			topic: 'API profile setup',
			content: 'See attached config',
			resources: [{
				id: 'res-provider-md',
				source: 'docs/ai/provider.md',
				kind: 'markdown',
			}],
			createdAtTimestamp: t(318),
		}),
		M({
			role: 'assistant',
			topic: 'API profile setup',
			content: 'Provider profile loaded successfully. Profiles, providers, and model settings are now wired through the AIServiceManager.',
			createdAtTimestamp: t(315),
		}),
		M({
			role: 'user',
			topic: 'API profile setup',
			content: 'Great — visualize the dependency graph and also the latest provider stats',
			resources: [
				{ id: 'res-arch-img', source: img('architecture', 520, 340), kind: 'image' },
				{ id: 'res-stats-csv', source: 'data/provider-stats-2026Q2.csv', kind: 'csv' },
			],
			createdAtTimestamp: t(310),
		}),
		M({
			role: 'assistant',
			topic: 'API profile setup',
			content:
				'Dependency graph attached, and a JSON dump of the live profile registry:\n\n' +
				'```json\n' +
				'{\n' +
				'  "profiles": [\n' +
				'    { "id": "claude-sonnet", "tier": "primary" },\n' +
				'    { "id": "gpt-4o",        "tier": "secondary" }\n' +
				'  ]\n' +
				'}\n' +
				'```',
			createdAtTimestamp: t(305),
		}),

		// ── standalone assistant msg (no topic) ────────────────────────────
		M({
			role: 'assistant',
			content: 'I found the provider config issue. Investigating now.',
			createdAtTimestamp: t(280),
		}),

		// ── topic: Model routing ──────────────────────────────────────────
		// (6 msgs · 2 fences · image · xlsx · python fence)
		M({
			role: 'user',
			topic: 'Model routing',
			content: 'Can you also add the fallback rules so we never hit a stale provider?',
			createdAtTimestamp: t(240),
		}),
		M({
			role: 'assistant',
			topic: 'Model routing',
			content:
				'Model routing now supports tier-based fallback with timeout windows.\n\n' +
				'```typescript\n' +
				'function route(model: Model): Provider {\n' +
				'  return providers[model.tier] ?? providers.default;\n' +
				'}\n' +
				'```\n\n' +
				'The chain is tier → default → error.',
			createdAtTimestamp: t(237),
		}),
		M({
			role: 'user',
			topic: 'Model routing',
			content: 'Show me the flow and the risk register sheet',
			resources: [
				{ id: 'res-flow-img', source: img('flow', 540, 320), kind: 'image' },
				{ id: 'res-risk-xlsx', source: 'reports/risk-register.xlsx', kind: 'xlsx' },
			],
			createdAtTimestamp: t(234),
		}),
		M({
			role: 'assistant',
			topic: 'Model routing',
			content:
				'Sure — here is the high-level routing path:\n\n' +
				'```mermaid\n' +
				'graph LR\n' +
				'  User --> Chat\n' +
				'  Chat --> Router\n' +
				'  Router --> Providers\n' +
				'  Providers --> Vault\n' +
				'```\n\n' +
				'I also attached the failover benchmark script:',
			createdAtTimestamp: t(231),
		}),
		M({
			role: 'assistant',
			topic: 'Model routing',
			content:
				'```python\n' +
				'def benchmark(providers, attempts=1000):\n' +
				'    fail = 0\n' +
				'    for _ in range(attempts):\n' +
				'        if not call(providers).ok:\n' +
				'            fail += 1\n' +
				'    return fail / attempts\n' +
				'```\n\n' +
				'Indexer finished. 1,284 chunks embedded, 12 hubs detected.',
			createdAtTimestamp: t(210),
		}),

		// ── standalone "hello" again (no topic) ────────────────────────────
		M({ role: 'user', content: 'hello', createdAtTimestamp: t(190) }),

		// ── topic: Profile summary ────────────────────────────────────────
		// (4 msgs · markdown · json archive)
		M({
			role: 'user',
			topic: 'Profile summary',
			content: 'What is the latest profile summary?',
			createdAtTimestamp: t(170),
		}),
		M({
			role: 'assistant',
			topic: 'Profile summary',
			content: 'Profile summary updated with three new entries: model preferences, search routing, and skill bias.',
			createdAtTimestamp: t(168),
		}),
		M({
			role: 'user',
			topic: 'Profile summary',
			content: 'Attach the implementation plan and the raw export',
			resources: [
				{ id: 'res-plan-md', source: 'plans/implementation-plan.md', kind: 'markdown' },
				{ id: 'res-archive-json', source: 'exports/conversation-archive.json', kind: 'json' },
			],
			createdAtTimestamp: t(165),
		}),
		M({
			role: 'assistant',
			topic: 'Profile summary',
			content: 'Done. The export is 2.4 MB; profile delta vs last week is +14 entries (8 added, 6 modified).',
			createdAtTimestamp: t(162),
		}),

		// ── topic: Design review (NEW) ────────────────────────────────────
		// (3 msgs · 2 images)
		M({
			role: 'user',
			topic: 'Design review',
			content: 'Compare the storyboard and the wireframe for the new home',
			resources: [
				{ id: 'res-story-img', source: img('storyboard', 480, 300), kind: 'image' },
				{ id: 'res-wire-img', source: img('wireframe', 480, 320), kind: 'image' },
			],
			createdAtTimestamp: t(130),
		}),
		M({
			role: 'assistant',
			topic: 'Design review',
			content: 'Storyboard reads as a tour, wireframe collapses to a single hero with two CTAs. The wireframe loses the third stop ("Recent activity") — flag for product review.',
			createdAtTimestamp: t(128),
		}),
		M({
			role: 'user',
			topic: 'Design review',
			content: 'Good catch. Pull the marketing screenshots from last quarter too',
			resources: [
				{ id: 'res-mkt-img', source: img('marketing', 500, 320), kind: 'image' },
			],
			createdAtTimestamp: t(125),
		}),

		// ── topic: Diagrams ───────────────────────────────────────────────
		// (3 msgs · mermaid sequence · 1 photo)
		M({
			role: 'user',
			topic: 'Diagrams',
			content: 'Draw the message lifecycle',
			createdAtTimestamp: t(100),
		}),
		M({
			role: 'assistant',
			topic: 'Diagrams',
			content:
				'Lifecycle:\n\n' +
				'```mermaid\n' +
				'sequenceDiagram\n' +
				'  User->>Composer: submit\n' +
				'  Composer->>Agent: invoke\n' +
				'  Agent->>UI: stream\n' +
				'  UI-->>User: render\n' +
				'```',
			createdAtTimestamp: t(98),
		}),
		M({
			role: 'user',
			topic: 'Diagrams',
			content: 'Add the team kickoff photo for the deck',
			resources: [
				{ id: 'res-team-img', source: img('team', 520, 340), kind: 'image' },
			],
			createdAtTimestamp: t(94),
		}),

		// ── topic: Bug triage (NEW) ───────────────────────────────────────
		// (3 msgs · screenshot image · pdf spec · typescript fix fence)
		M({
			role: 'user',
			topic: 'Bug triage',
			content: 'User reported this modal showed up randomly. Spec attached too.',
			resources: [
				{ id: 'res-bug-img', source: img('errormodal', 480, 320), kind: 'image' },
				{ id: 'res-bug-pdf', source: 'specs/2026-search-architecture.pdf', kind: 'pdf' },
			],
			createdAtTimestamp: t(70),
		}),
		M({
			role: 'assistant',
			topic: 'Bug triage',
			content:
				'Reproduced. The modal fires when `lastSync` is older than 24h but the network call hangs. Fix:\n\n' +
				'```typescript\n' +
				'export async function checkSync(timeoutMs = 5_000): Promise<SyncStatus> {\n' +
				'  return Promise.race([\n' +
				'    fetchStatus(),\n' +
				'    new Promise<SyncStatus>((_, reject) =>\n' +
				'      setTimeout(() => reject(new Error("sync-timeout")), timeoutMs),\n' +
				'    ),\n' +
				'  ]);\n' +
				'}\n' +
				'```',
			createdAtTimestamp: t(67),
		}),
		M({
			role: 'user',
			topic: 'Bug triage',
			content: 'Ship it. Tag the release with a CHANGELOG entry referencing the pdf spec.',
			createdAtTimestamp: t(64),
		}),

		// ── topic: Resource layout showcase ───────────────────────────────
		// One message per layout variant from mock-04 so the chat surface
		// renders every code path of MessageAttachmentsList. Sorted by count
		// (fewer resources first) for predictable visual scanning.
		// IMAGES — count varies
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L1 · single image (n=1)',
			resources: [R('image', img('lay1', 480, 320))],
			createdAtTimestamp: t(58.2),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L2 · two images, 50/50 grid (n=2)',
			resources: [
				R('image', img('lay2a', 400, 360)),
				R('image', img('lay2b', 400, 360)),
			],
			createdAtTimestamp: t(58.1),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L3 · three images, equal strip (n=3)',
			resources: [
				R('image', img('lay3a', 300, 300)),
				R('image', img('lay3b', 300, 300)),
				R('image', img('lay3c', 300, 300)),
			],
			createdAtTimestamp: t(58),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L4 · four images, 2×2 contact sheet (n=4)',
			resources: [
				R('image', img('lay4a', 280, 280)),
				R('image', img('lay4b', 280, 280)),
				R('image', img('lay4c', 280, 280)),
				R('image', img('lay4d', 280, 280)),
			],
			createdAtTimestamp: t(57.9),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L5 · five images → hero + thumb row (n=5)',
			resources: [
				R('image', img('lay5h', 640, 360)),
				R('image', img('lay5a', 200, 200)),
				R('image', img('lay5b', 200, 200)),
				R('image', img('lay5c', 200, 200)),
				R('image', img('lay5d', 200, 200)),
			],
			createdAtTimestamp: t(57.8),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L6 · nine images → gallery +N overlay (n=9)',
			resources: [
				R('image', img('lay9a', 280, 280)),
				R('image', img('lay9b', 280, 280)),
				R('image', img('lay9c', 280, 280)),
				R('image', img('lay9d', 280, 280)),
				R('image', img('lay9e', 280, 280)),
				R('image', img('lay9f', 280, 280)),
				R('image', img('lay9g', 280, 280)),
				R('image', img('lay9h', 280, 280)),
				R('image', img('lay9i', 280, 280)),
			],
			createdAtTimestamp: t(57.7),
		}),
		// FILES — single kind variations (showcase badge colors)
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L7 · single PDF (red badge)',
			resources: [R('pdf', 'specs/2026-search-architecture.pdf')],
			createdAtTimestamp: t(57.6),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L8 · CSV + XLSX (spreadsheet family, green)',
			resources: [
				R('csv', 'data/usage-metrics-2026Q2.csv'),
				R('xlsx', 'reports/risk-register.xlsx'),
			],
			createdAtTimestamp: t(57.5),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L9 · DOCX + PPTX (office family, blue/orange)',
			resources: [
				R('docx', 'briefs/2026-product-brief.docx'),
				R('pptx', 'decks/launch-deck-final.pptx'),
			],
			createdAtTimestamp: t(57.4),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L10 · JSON + MD (developer family, amber/violet)',
			resources: [
				R('json', 'exports/conversation-archive.json'),
				R('markdown', 'plans/implementation-plan.md'),
			],
			createdAtTimestamp: t(57.3),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L11 · 3 files different kinds (compact stack)',
			resources: [
				R('pdf', 'specs/architecture.pdf'),
				R('xlsx', 'reports/budget.xlsx'),
				R('json', 'exports/data.json'),
			],
			createdAtTimestamp: t(57.2),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L12 · 7 files → chip cluster (>4 threshold)',
			resources: [
				R('pdf', 'specs/architecture.pdf'),
				R('xlsx', 'reports/risk-register.xlsx'),
				R('csv', 'data/usage.csv'),
				R('json', 'exports/archive.json'),
				R('markdown', 'docs/provider.md'),
				R('docx', 'briefs/brief.docx'),
				R('pptx', 'decks/deck.pptx'),
			],
			createdAtTimestamp: t(57.1),
		}),
		// MIXED — image + file combos
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L13 · 1 image + 1 PDF',
			resources: [
				R('image', img('lay13', 480, 320)),
				R('pdf', 'specs/2026-search-architecture.pdf'),
			],
			createdAtTimestamp: t(57.0),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L14 · 1 image + 2 files',
			resources: [
				R('image', img('lay14', 480, 300)),
				R('xlsx', 'reports/risk-register.xlsx'),
				R('markdown', 'plans/implementation-plan.md'),
			],
			createdAtTimestamp: t(56.9),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L15 · 2 images + 1 PDF',
			resources: [
				R('image', img('lay15a', 300, 280)),
				R('image', img('lay15b', 300, 280)),
				R('pdf', 'docs/design-review.pdf'),
			],
			createdAtTimestamp: t(56.8),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L16 · 1 image + 4 files → files switch to chips',
			resources: [
				R('image', img('lay16', 480, 300)),
				R('pdf', 'spec.pdf'),
				R('xlsx', 'budget.xlsx'),
				R('markdown', 'plan.md'),
				R('json', 'config.json'),
			],
			createdAtTimestamp: t(56.7),
		}),
		// URLS
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L17 · single URL (rich preview card)',
			resources: [R('url', 'https://github.com/openai/openai-cookbook')],
			createdAtTimestamp: t(56.6),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L18 · 3 URLs (chip cluster)',
			resources: [
				R('url', 'https://github.com/openai/openai-cookbook'),
				R('url', 'https://www.anthropic.com/news/claude-3-5-sonnet'),
				R('url', 'https://vercel.com/docs/ai-sdk'),
			],
			createdAtTimestamp: t(56.5),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L19 · URL + PDF (link + local copy)',
			resources: [
				R('url', 'https://arxiv.org/abs/2005.11401'),
				R('pdf', 'papers/2005.11401-rag.pdf'),
			],
			createdAtTimestamp: t(56.4),
		}),
		// EDGE
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: '',
			resources: [R('pdf', 'specs/2026-search-architecture.pdf')],
			createdAtTimestamp: t(56.3),
		}),
		M({
			role: 'assistant',
			topic: 'Resource layout showcase',
			content: 'L20 above had no text — bubble suppression renders the attachment standalone.',
			createdAtTimestamp: t(56.2),
		}),
		M({
			role: 'user',
			topic: 'Resource layout showcase',
			content: 'L21 · heavy mix — image gallery + URL + multi-file chips',
			resources: [
				R('image', img('lay21a', 240, 240)),
				R('image', img('lay21b', 240, 240)),
				R('image', img('lay21c', 240, 240)),
				R('image', img('lay21d', 240, 240)),
				R('image', img('lay21e', 240, 240)),
				R('image', img('lay21f', 240, 240)),
				R('url', 'https://github.com/anthropics/anthropic-cookbook'),
				R('pdf', 'spec.pdf'),
				R('xlsx', 'register.xlsx'),
				R('markdown', 'plan.md'),
				R('json', 'config.json'),
			],
			createdAtTimestamp: t(56.1),
		}),

		// ── degenerate topic with only 1 message ───────────────────────────
		M({
			role: 'user',
			topic: 'Quick note',
			content: 'Remind me to revisit the retry budget tomorrow morning.',
			createdAtTimestamp: t(50),
		}),

		// ── standalone error message ───────────────────────────────────────
		M({
			role: 'assistant',
			content: 'Error: requested provider is not configured. Open Settings → AI → Providers to fix.',
			isErrorMessage: true,
			createdAtTimestamp: t(40),
		}),

		// ── standalone msg with a single attached file (no topic) ─────────
		M({
			role: 'user',
			content: 'Pulled the latest usage numbers, see attached',
			resources: [
				{ id: 'res-usage-csv', source: 'data/usage-metrics-2026Q2.csv', kind: 'csv' },
			],
			createdAtTimestamp: t(25),
		}),

		// ── most recent: a fresh standalone exchange (no topic) ────────────
		M({
			role: 'assistant',
			content: 'Hi — nice to meet you. I see you work on Java and React.',
			createdAtTimestamp: t(8),
		}),
		M({
			role: 'user',
			content: 'Expand your last response with more detail and examples.',
			createdAtTimestamp: t(5),
		}),
		M({
			role: 'user',
			content: 'Can you summarize the latest notes?',
			createdAtTimestamp: t(1),
		}),
	];

	// Build a fake ChatConversation. `file: TFile` is part of the type but
	// nothing on the rendering path of the index panel + chat body actually
	// touches it for an in-memory-only conv. We cast through `unknown` to
	// quiet TS; real persistence-aware code paths (save, export, vault sync)
	// will fail if invoked on this mock — that's expected and acceptable for
	// a debug-only command.
	const fakeConv = {
		meta: {
			id: 'mock-conv-' + Date.now(),
			title: 'Mock conversation (visual smoke test)',
			createdAtTimestamp: NOW - 5 * 60 * 60_000,
			updatedAtTimestamp: NOW,
			activeModel: 'mock-model',
			activeProvider: 'mock',
		},
		messages: mock,
		content: '',
		file: null as unknown,
	} as unknown as ChatConversation;

	// Order matters here. ProjectListView runs a one-shot `hydrateData()` on
	// mount that loads real conversations from SQLite and then nulls
	// `activeConversation` if its id is not in the resulting Map. If we push
	// the mock BEFORE the studio mounts, hydrate wipes it ~200ms later and
	// the panel flashes-then-disappears.
	//
	// Sequence:
	//   1. Open studio → ProjectListView mounts → hydrateData starts.
	//   2. Wait long enough for hydrate to settle (listConversations is
	//      SQLite-local so usually <300ms on a warm store; 700ms is a
	//      conservative debug ceiling).
	//   3. Inject the mock conv into the conversations Map via
	//      updateConversation (additive — does not clobber real convs).
	//   4. Mark it active + push messages + switch view mode.
	void openChatStudio();
	window.setTimeout(() => {
		const dataStore = useChatDataStore.getState();
		const viewStore = useChatViewStore.getState();
		dataStore.updateConversation(fakeConv);
		dataStore.setActiveConversation(fakeConv);
		dataStore.setMessages(mock);
		viewStore.setConversation(fakeConv);
		new Notice(`Loaded ${mock.length} mock messages — open the right Conversation Index panel.`);
	}, 700);
}
