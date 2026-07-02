// T11Y-9e: app-owned devtools registration.
//
// All `window.*` debug hooks that AppContext historically registered
// when `settings.enableDevTools` was true. Extracted out of
// `AppContext.handleDevToolsSettingChange` so the context file stays
// focused on lifecycle / runtime wiring and the debug surface lives
// next to its peers in `src/app/context/`.
//
// `registerDevtools(ctx)` installs the hooks; `unregisterDevtools()`
// removes them. Both are no-ops when `window` is undefined (worker /
// node-test contexts).

import type { AppContext } from '@/app/context/AppContext';
import { GraphInspectorTestTools, AISearchAgentTestTools } from '@/app/context/test-tools';
import { GraphCleanupService } from '@/service/search/index/maintenance/GraphCleanupService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { defaultIndexDocumentOptions } from '@/service/search/index/indexService';
import { AppContext as AppCtx } from '@/app/context/AppContext';
import { getVaultPersona } from '@/app/context/system-info';

const REGISTERED_GLOBALS = [
	'testGraphTools',
	'testAISearchTools',
	'indexDocument',
	'indexDocumentFull',
	'runPendingLlmIndexEnrichment',
	'runPendingVectorIndexEnrichment',
	'getVaultPersona',
	'cleanupGraphTable',
	'dumpV2State',
	'captureV2Debug',
	'testBackboneMap',
	'testKnowledgeIntuition',
] as const;

export function registerDevtools(ctx: AppContext): void {
	if (typeof window === 'undefined') return;

	const w = window as any;
	w.testGraphTools = new GraphInspectorTestTools();
	w.testAISearchTools = new AISearchAgentTestTools();
	w.indexDocument = (docPath: string) =>
		AppCtx.getIndexService().indexDocument(
			docPath,
			ctx.settings.search,
			defaultIndexDocumentOptions('listener_fast'),
		);
	w.indexDocumentFull = (docPath: string) =>
		AppCtx.getIndexService().indexDocument(
			docPath,
			ctx.settings.search,
			defaultIndexDocumentOptions('manual_full'),
		);
	w.runPendingLlmIndexEnrichment = () =>
		AppCtx.getIndexService().runPendingLlmIndexEnrichment(ctx.settings.search);
	w.runPendingVectorIndexEnrichment = () =>
		AppCtx.getIndexService().runPendingVectorIndexEnrichment(ctx.settings.search);
	w.getVaultPersona = () => getVaultPersona();
	w.cleanupGraphTable = () => {
		const graphCleanupService = new GraphCleanupService(
			sqliteStoreManager.getIndexContext('vault'),
			sqliteStoreManager.getMobiusNodeRepo(),
			sqliteStoreManager.getIndexedDocumentRepo(),
		);
		return graphCleanupService.run();
	};

	// V2 search debug — screenshot + DOM + state, saved to /tmp.
	w.dumpV2State = () => {
		try {
			const { useSearchSessionStore } = require('@/ui/view/quick-search/store/searchSessionStore');
			const s = useSearchSessionStore.getState();
			const dump = {
				status: s.status,
				query: s.query,
				v2Steps: s.v2Steps.map((st: any) => ({
					id: st.id,
					toolName: st.toolName,
					displayName: st.displayName,
					status: st.status,
					summary: st.summary,
					durationMs: st.endedAt && st.startedAt ? st.endedAt - st.startedAt : null,
				})),
				v2ReportLength: s.v2ReportChunks.join('').length,
				v2ReportChunkCount: s.v2ReportChunks.length,
				v2ReportComplete: s.v2ReportComplete,
				v1Steps: s.steps.map((st: any) => ({ type: st.type, status: st.status })),
				usage: s.usage,
				duration: s.duration,
				error: s.error,
				debugLogCount: s.agentDebugLog.length,
			};
			console.log('[V2 State Dump]', JSON.stringify(dump, null, 2));
			return dump;
		} catch (e) {
			console.error('dumpV2State failed', e);
		}
	};
	w.captureV2Debug = async () => {
		const fs = require('fs');
		const path = require('path');
		const outDir = '/tmp/peak-v2-debug';
		try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
		const ts = Date.now();

		// 1. State dump
		const state = w.dumpV2State?.();
		if (state) {
			fs.writeFileSync(path.join(outDir, `state-${ts}.json`), JSON.stringify(state, null, 2));
		}

		// 2. DOM snapshot of the search result area
		const modalEl = document.querySelector('.modal-container');
		if (modalEl) {
			const html = modalEl.innerHTML;
			fs.writeFileSync(path.join(outDir, `dom-${ts}.html`), html);
		}

		// 3. Screenshot via Electron
		try {
			const electron = require('electron');
			const win = (electron.remote ?? electron).getCurrentWindow?.()
				?? electron.BrowserWindow?.getFocusedWindow?.();
			if (win) {
				const image = await win.webContents.capturePage();
				fs.writeFileSync(path.join(outDir, `screenshot-${ts}.png`), image.toPNG());
				console.log(`[captureV2Debug] screenshot saved: ${outDir}/screenshot-${ts}.png`);
			}
		} catch (e) {
			console.warn('[captureV2Debug] screenshot failed (expected in some Electron configs):', (e as Error).message);
		}

		console.log(`[captureV2Debug] saved to ${outDir}/ (state + dom + screenshot)`);
		return outDir;
	};

	w.testBackboneMap = (opts?: Record<string, unknown>) =>
		w.testAISearchTools.testBackboneMap(opts);
	w.testKnowledgeIntuition = (opts?: Record<string, unknown>) =>
		w.testAISearchTools.testKnowledgeIntuition(opts);

	console.debug('Dev Tools initialized.');
	console.debug('Available hooks:');
	console.debug('  window.testGraphTools.inspectNote("path/to/note.md")');
	console.debug('  window.testAISearchTools (search agent harness)');
	console.debug('  window.indexDocument(path) / window.indexDocumentFull(path)');
	console.debug('  window.runPendingLlmIndexEnrichment() / window.runPendingVectorIndexEnrichment()');
	console.debug('  window.getVaultPersona() / window.cleanupGraphTable()');
	console.debug('  window.testBackboneMap(opts) / window.testKnowledgeIntuition(opts)');
	console.debug('  window.dumpV2State() / window.captureV2Debug()');
}

export function unregisterDevtools(): void {
	if (typeof window === 'undefined') return;
	const w = window as any;
	for (const g of REGISTERED_GLOBALS) {
		if (w[g]) delete w[g];
	}
}
