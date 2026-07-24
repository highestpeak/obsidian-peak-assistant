/**
 * File Atlas — stateful host container.
 *
 * Owns which open document is active and feeds its content to the presentational
 * {@link FileAtlasPanel}. Subscribes to workspace changes through the injected
 * port so the left rail stays in sync as tabs open / close / rename. Reads the
 * active document's content fresh on every switch (the initial doc is seeded to
 * avoid a first-paint flash).
 */

import React, { useEffect, useState } from 'react';
import { FileAtlasPanel } from './FileAtlasPanel';
import type { FileAtlasHostPort, OpenDocMeta } from './FileAtlasHostPort';

interface FileAtlasHostProps {
	host: FileAtlasHostPort;
	initialPath: string | null;
	initialContent: string;
}

export const FileAtlasHost: React.FC<FileAtlasHostProps> = ({ host, initialPath, initialContent }) => {
	const [docs, setDocs] = useState<OpenDocMeta[]>(() => host.listOpenDocs());
	const [activePath, setActivePath] = useState<string | null>(initialPath);
	const [content, setContent] = useState<string | null>(
		initialPath ? initialContent : null
	);

	// Keep the rail synced with the workspace.
	useEffect(() => host.subscribeOpenDocs(() => setDocs(host.listOpenDocs())), [host]);

	// If the active document disappears (closed elsewhere), fall back to the first.
	useEffect(() => {
		if (activePath && docs.some((d) => d.path === activePath)) return;
		setActivePath(docs[0]?.path ?? null);
	}, [docs, activePath]);

	// Load the active document's content (fresh) whenever it changes.
	useEffect(() => {
		if (!activePath) {
			setContent(null);
			return;
		}
		if (activePath === initialPath && content === initialContent) return;
		let alive = true;
		host.readDoc(activePath).then((c) => {
			if (alive) setContent(c);
		});
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activePath, host]);

	const onCloseDoc = (path: string): void => {
		host.closeDoc(path);
		setDocs(host.listOpenDocs());
	};

	if (!activePath) {
		return (
			<div className="pkfa-empty-state">Open a note to use File Atlas.</div>
		);
	}
	if (content === null) {
		return <div className="pkfa-empty-state">Loading…</div>;
	}

	return (
		<FileAtlasPanel
			docs={docs}
			activePath={activePath}
			displayPath={activePath}
			content={content}
			host={host}
			onSelectDoc={setActivePath}
			onCloseDoc={onCloseDoc}
		/>
	);
};
