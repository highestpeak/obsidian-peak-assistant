import * as React from 'react';

export function ComposerDocumentTitle({ filePath }: { filePath: string }): React.ReactElement {
	return (
		<span className="pk-composer-document-title" role="heading" aria-level={1}>
			{composerDocumentTitle(filePath)}
		</span>
	);
}

/** Match Obsidian's inline-title identity: the file basename without `.md`. */
export function composerDocumentTitle(filePath: string): string {
	const normalized = filePath.split('\\').join('/');
	const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
	if (!basename.toLocaleLowerCase().endsWith('.md')) return basename;
	return basename.slice(0, -3) || basename;
}
