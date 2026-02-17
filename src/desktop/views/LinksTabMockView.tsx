/**
 * Links tab mock view: paste JSON and preview using the real LinksTab (LinksSection).
 * No duplicate UI; data is passed via initialPayload.
 */

import React, { useCallback, useState } from 'react';
import type { InspectorLinksPayload } from '@/service/search/inspectorService';
import { LinksTab } from '@/ui/view/quick-search/components/inspector/LinksSection';
import { Copy } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

/** Template JSON for copy - user pastes their own data in this format */
export const LINKS_TAB_MOCK_TEMPLATE: InspectorLinksPayload = {
	physical: [
		{ path: 'kb2-learn-prd/foo.md', label: 'Foo', kind: 'physical', alsoSemantic: true, similarity: '66.1%', backlinks: 4, mtime: Date.now() - 3600000, summary: 'Short summary.', tags: ['project', 'learn'] },
		{ path: 'kb3-tech-articles/rag.md', label: 'RAG', kind: 'physical', backlinks: 2, mtime: Date.now() - 86400000, tags: ['ai'] },
	],
	semantic: [
		{ path: 'AI-peakAssistant-PDF-Image-Documents-Knowledge.md', label: 'PDF Image Docs', kind: 'semantic', similarity: '65.3%', backlinks: 1, mtime: Date.now() - 540000, tags: [] },
	],
};

const TEMPLATE_JSON = JSON.stringify(LINKS_TAB_MOCK_TEMPLATE, null, 2);

export const LinksTabMockView: React.FC = () => {
	const [jsonInput, setJsonInput] = useState(TEMPLATE_JSON);
	const [data, setData] = useState<InspectorLinksPayload | null>(() => LINKS_TAB_MOCK_TEMPLATE);
	const [parseError, setParseError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const handleCopyTemplate = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(TEMPLATE_JSON);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch (e) {
			console.error('Copy failed', e);
		}
	}, []);

	const handleLoad = useCallback(() => {
		setParseError(null);
		try {
			const parsed = JSON.parse(jsonInput) as InspectorLinksPayload;
			if (!parsed || typeof parsed !== 'object') {
				setParseError('Invalid JSON: expected object');
				return;
			}
			const phys = parsed.physical;
			const sem = parsed.semantic;
			if (!Array.isArray(phys) || !Array.isArray(sem)) {
				setParseError('Expected physical and semantic arrays');
				return;
			}
			const normalized: InspectorLinksPayload = {
				physical: phys.map((p) => ({
					path: String(p.path ?? ''),
					label: String(p.label ?? p.path ?? ''),
					kind: 'physical',
					similarity: p.similarity,
					alsoSemantic: !!p.alsoSemantic,
					backlinks: p.backlinks ?? 0,
					mtime: p.mtime ?? null,
					summary: p.summary ?? null,
					tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
				})),
				semantic: sem.map((s) => ({
					path: String(s.path ?? ''),
					label: String(s.label ?? s.path ?? ''),
					kind: 'semantic',
					similarity: s.similarity,
					alsoSemantic: false,
					backlinks: s.backlinks ?? 0,
					mtime: s.mtime ?? null,
					summary: s.summary ?? null,
					tags: Array.isArray(s.tags) ? s.tags.map(String) : [],
				})),
			};
			setData(normalized);
		} catch (e: unknown) {
			setParseError(e instanceof Error ? e.message : 'Parse failed');
		}
	}, [jsonInput]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden">
			{/* Toolbar: copy template + paste area */}
			<div className="pktw-flex-shrink-0 pktw-flex pktw-flex-col pktw-gap-2 pktw-p-4 pktw-bg-[#f8f9fa] pktw-border-b pktw-border-[#e5e7eb]">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<button
						onClick={handleCopyTemplate}
						className={cn(
							'pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-text-sm pktw-font-medium pktw-rounded-md',
							'pktw-bg-white pktw-border pktw-border-[#e5e7eb] hover:pktw-bg-[#f3f4f6]'
						)}
					>
						<Copy className="pktw-w-4 pktw-h-4" />
						{copied ? 'Copied' : 'Copy template'}
					</button>
					<span className="pktw-text-xs pktw-text-[#6b7280]">
						Paste your data below and click Load.
					</span>
				</div>
				<div className="pktw-flex pktw-gap-2">
					<textarea
						value={jsonInput}
						onChange={(e) => setJsonInput(e.target.value)}
						placeholder='{"physical":[...],"semantic":[...]}'
						className="pktw-flex-1 pktw-min-h-[100px] pktw-font-mono pktw-text-xs pktw-p-2 pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-resize-y"
						spellCheck={false}
					/>
					<button
						onClick={handleLoad}
						className="pktw-px-4 pktw-py-2 pktw-text-sm pktw-font-medium pktw-rounded-md pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] pktw-self-start"
					>
						Load
					</button>
				</div>
				{parseError && (
					<div className="pktw-text-xs pktw-text-red-600">{parseError}</div>
				)}
			</div>
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-p-4">
				<LinksTab
					currentPath={null}
					linksIncludeSemantic={true}
					initialPayload={data ?? undefined}
				/>
			</div>
		</div>
	);
};
