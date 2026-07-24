/**
 * File Atlas — left rail of open documents.
 *
 * Lists every currently-open markdown tab so you can switch which document's
 * Atlas you inspect without reopening files. Title-only rows (full path in the
 * tooltip), an unsaved dot, and a hover close button. No open-count badge and no
 * "new file" footer — per the 2026-07-08 mock v4.
 */

import React from 'react';
import { FileText, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { OpenDocMeta } from '../FileAtlasHostPort';

interface FileRailProps {
	title: string;
	docs: OpenDocMeta[];
	activePath: string | null;
	onSelect: (path: string) => void;
	onClose: (path: string) => void;
}

export const FileRail: React.FC<FileRailProps> = ({ title, docs, activePath, onSelect, onClose }) => {
	return (
		<div className="pkfa-rail">
			<div className="pkfa-rail-head">
				<span className="pkfa-rail-title">
					<FileText />
					{title}
				</span>
			</div>
			<div className="pkfa-rail-list">
				{docs.map((doc) => (
					<div
						key={doc.path}
						role="button"
						tabIndex={0}
						className={`pkfa-rail-item${doc.path === activePath ? ' is-active' : ''}`}
						data-unsaved={doc.unsaved ? 'true' : undefined}
						title={doc.path}
						onClick={() => onSelect(doc.path)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onSelect(doc.path);
							}
						}}
					>
						<span className="pkfa-rail-icon">
							<FileText />
						</span>
						<span className="pkfa-rail-name">{doc.title}</span>
						<span className="pkfa-rail-dot" aria-hidden="true" />
						<Button
							variant="unstyled"
							type="button"
							className="pkfa-rail-close"
							aria-label={`Close ${doc.title}`}
							title="Close"
							onClick={(e) => {
								e.stopPropagation();
								onClose(doc.path);
							}}
						>
							<X />
						</Button>
					</div>
				))}
			</div>
		</div>
	);
};
