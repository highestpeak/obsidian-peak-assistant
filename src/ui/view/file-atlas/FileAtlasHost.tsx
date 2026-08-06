/**
 * File Atlas — stateful host container.
 *
 * Owns the Open + Recent rail, active document, persisted sort/width preference,
 * and content fed to {@link FileAtlasPanel}. Workspace changes arrive through
 * the injected port; runtime APIs remain app-owned.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileAtlasPanel } from './FileAtlasPanel';
import type { FileAtlasHostPort, OpenDocMeta } from './FileAtlasHostPort';
import {
	DEFAULT_FILE_ATLAS_CONFIG,
	loadFileAtlasConfig,
	type FileAtlasConfig,
} from './config/fileAtlasConfig';
import { buildFileRailSections, type FileRailSortMode } from './fileRailModel';
import {
	defaultFileRailPreference,
	readFileRailPreference,
	writeFileRailPreference,
	type FileRailPreference,
} from './fileRailPreference';
import {
	applyFileAtlasPresetOverrides,
	readFileAtlasPresetOverrides,
	writeFileAtlasPresetOverrides,
	type FileAtlasPresetOverrides,
} from './fileAtlasPresetPreference';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import type { ComposerCapabilityId } from '@/core/composer';
import type { RawBlockKind } from '@/core/document/atlas/types';
import type { FileAtlasSessionPort } from './FileAtlasSessionPort';

interface FileAtlasHostProps {
	host: FileAtlasHostPort;
	session: FileAtlasSessionPort;
	initialPath: string | null;
	initialContent: string;
	ownerDocument?: Document | null;
	onOpenBlock: (path: string, location: DocumentSourceLocation) => void;
	onRunQuickAction?: (
		path: string,
		location: DocumentSourceLocation,
		capabilityId: ComposerCapabilityId,
	) => void;
}

export const FileAtlasHost: React.FC<FileAtlasHostProps> = ({
	host,
	session,
	initialPath,
	initialContent,
	ownerDocument,
	onOpenBlock,
	onRunQuickAction,
}) => {
	const [baseConfig, setBaseConfig] = useState<FileAtlasConfig>(DEFAULT_FILE_ATLAS_CONFIG);
	const [presetOverrides, setPresetOverrides] = useState<FileAtlasPresetOverrides>({});
	const config = useMemo(
		() => applyFileAtlasPresetOverrides(baseConfig, presetOverrides),
		[baseConfig, presetOverrides],
	);
	const [preference, setPreference] = useState<FileRailPreference>(
		() => defaultFileRailPreference(DEFAULT_FILE_ATLAS_CONFIG.rail),
	);
	const [openDocs, setOpenDocs] = useState<OpenDocMeta[]>(() => host.listOpenDocs());
	const [historyDocs, setHistoryDocs] = useState<OpenDocMeta[]>([]);
	const [activePath, setActivePath] = useState<string | null>(initialPath);
	const [loadedDocument, setLoadedDocument] = useState<{ path: string; content: string } | null>(
		initialPath ? { path: initialPath, content: initialContent } : null,
	);

	useEffect(() => {
		let alive = true;
		void loadFileAtlasConfig().then((next) => {
			if (!alive) return;
			setBaseConfig(next);
			setPresetOverrides(readFileAtlasPresetOverrides(next, ownerDocument));
			setPreference(readFileRailPreference(next.rail, ownerDocument));
		});
		return () => {
			alive = false;
		};
	}, [ownerDocument]);

	useEffect(() => {
		let alive = true;
		let requestId = 0;
		const refresh = async (): Promise<void> => {
			const currentRequest = ++requestId;
			setOpenDocs(host.listOpenDocs());
			const history = await host.listHistoryDocs(config.rail.capacity);
			if (!alive || currentRequest !== requestId) return;
			setHistoryDocs(history);
		};
		void refresh();
		const unsubscribe = host.subscribeOpenDocs(() => {
			void refresh();
		});
		return () => {
			alive = false;
			unsubscribe();
		};
	}, [host, config.rail.capacity]);

	const frequentOrderRef = useRef(new Map<string, number>());
	const rawSections = useMemo(
		() => buildFileRailSections({
			openDocs,
			historyDocs,
			capacity: config.rail.capacity,
			sortMode: preference.sortMode,
			now: Date.now(),
			frequencyHalfLifeDays: config.rail.frequencyHalfLifeDays,
		}),
		[openDocs, historyDocs, config.rail, preference.sortMode],
	);
	const sections = useMemo(() => {
		if (preference.sortMode !== 'frequent') return rawSections;
		const rank = frequentOrderRef.current;
		for (const doc of [...rawSections.open, ...rawSections.recent]) {
			if (!rank.has(doc.path)) rank.set(doc.path, rank.size);
		}
		const stable = (docs: OpenDocMeta[]): OpenDocMeta[] =>
			[...docs].sort((a, b) =>
				(rank.get(a.path) ?? Number.MAX_SAFE_INTEGER) -
				(rank.get(b.path) ?? Number.MAX_SAFE_INTEGER)
				|| a.path.localeCompare(b.path)
			);
		return {
			open: stable(rawSections.open),
			recent: stable(rawSections.recent),
		};
	}, [rawSections, preference.sortMode]);

	const docs = useMemo(
		() => [...sections.open, ...sections.recent],
		[sections],
	);

	// If the active document disappears (closed elsewhere), fall back to the first.
	useEffect(() => {
		if (activePath && docs.some((d) => d.path === activePath)) return;
		setActivePath(docs[0]?.path ?? null);
	}, [docs, activePath]);

	useEffect(() => {
		const workspaceActivePath = openDocs.find((doc) => doc.active)?.path;
		if (!workspaceActivePath || workspaceActivePath === activePath) return;
		setActivePath(workspaceActivePath);
	}, [openDocs, activePath]);

	// Load the active document's content (fresh) whenever it changes.
	useEffect(() => {
		if (!activePath) {
			setLoadedDocument(null);
			return;
		}
		if (loadedDocument?.path === activePath) return;
		const controller = new AbortController();
		let alive = true;
		host.readDoc(activePath, controller.signal).then((c) => {
			if (alive) setLoadedDocument({ path: activePath, content: c });
		});
		return () => {
			alive = false;
			controller.abort();
		};
	}, [activePath, host, loadedDocument?.path]);

	const onSelectDoc = (path: string): void => {
		const viewedAt = Date.now();
		setActivePath(path);
		setOpenDocs((current) => current.map((doc) => ({
			...doc,
			active: doc.path === path,
			lastViewedAt: doc.path === path ? viewedAt : doc.lastViewedAt,
		})));
		setHistoryDocs((current) => current.map((doc) => (
			doc.path === path ? { ...doc, lastViewedAt: viewedAt } : doc
		)));
		void host.activateDoc(path);
	};

	const onCloseDoc = (path: string): void => {
		const closed = openDocs.find((doc) => doc.path === path);
		host.closeDoc(path);
		setOpenDocs(host.listOpenDocs());
		if (!closed) return;
		setHistoryDocs((current) => [
			{ ...closed, open: false, active: false, lastViewedAt: Date.now() },
			...current.filter((doc) => doc.path !== path),
		]);
	};

	const onSortModeChange = (sortMode: FileRailSortMode): void => {
		if (sortMode === 'frequent') frequentOrderRef.current.clear();
		const next = { ...preference, sortMode };
		setPreference(next);
		writeFileRailPreference(next, config.rail, ownerDocument);
	};

	const onRailWidthChange = (widthPx: number): void => {
		setPreference((current) => ({ ...current, widthPx }));
	};

	const onRailWidthCommit = (widthPx: number): void => {
		const next = { ...preference, widthPx };
		setPreference(next);
		writeFileRailPreference(next, config.rail, ownerDocument);
	};

	const onSavePreset = (presetId: string, kinds: RawBlockKind[]): void => {
		if (presetId === 'all') return;
		const next = { ...presetOverrides, [presetId]: [...kinds] };
		setPresetOverrides(next);
		writeFileAtlasPresetOverrides(next, baseConfig, ownerDocument);
	};

	const onResetPreset = (presetId: string): RawBlockKind[] => {
		const next = { ...presetOverrides };
		delete next[presetId];
		setPresetOverrides(next);
		writeFileAtlasPresetOverrides(next, baseConfig, ownerDocument);
		return baseConfig.presets.find((preset) => preset.id === presetId)?.kinds ?? [];
	};

	if (!activePath) {
		return (
			<div className="pkfa-empty-state">Open a note to use File Atlas.</div>
		);
	}
	if (!loadedDocument || loadedDocument.path !== activePath) {
		return <div className="pkfa-empty-state">Loading…</div>;
	}

	return (
		<FileAtlasPanel
			key={activePath}
			config={config}
			session={session}
			railSections={sections}
			railPreference={preference}
			activePath={activePath}
			displayPath={activePath}
			content={loadedDocument.content}
			host={host}
			onOpenBlock={onOpenBlock}
			onRunQuickAction={onRunQuickAction}
			presetHasOverride={(presetId) => Boolean(presetOverrides[presetId])}
			onSavePreset={onSavePreset}
			onResetPreset={onResetPreset}
			onSelectDoc={onSelectDoc}
			onCloseDoc={onCloseDoc}
			onSortModeChange={onSortModeChange}
			onRailWidthChange={onRailWidthChange}
			onRailWidthCommit={onRailWidthCommit}
		/>
	);
};
