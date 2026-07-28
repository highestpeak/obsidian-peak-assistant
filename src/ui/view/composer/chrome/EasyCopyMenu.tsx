import * as React from 'react';
import { Check, Copy, FileCode, FileText, Image as ImageIcon, X, type LucideIcon } from 'lucide-react';
import { Button, IconButton } from '@/ui/components/primitives';
import { EASY_COPY_ORDER, buildEasyCopyText, type EasyCopyKind } from '@/service/composer';
import type { ComposerBlockKind } from '@/core/composer';
import { useComposerChrome } from './ComposerChromeContext';
import { rasterizeElementToPngBlob } from './rasterize';

/**
 * Easy Copy panel (WP4, §7.6): four outputs in the fixed owner-approved order
 * (纯文本 → 图片 → Markdown → HTML), copy-on-click with an in-place transient
 * check — never a preview or confirmation step. The image output is a 1:1
 * raster of the block's real DOM with chrome excluded; when the clipboard
 * refuses binary writes the PNG downloads instead (已下载 PNG).
 */
export interface EasyCopyMenuProps {
	markdown: string;
	blockKind?: ComposerBlockKind;
	/** Element to raster for the image output (the block body). */
	rasterTargetRef: React.RefObject<HTMLElement | null>;
	onClose: () => void;
}

const KIND_ICON: Record<EasyCopyKind, LucideIcon> = {
	plain: FileText,
	image: ImageIcon,
	markdown: Copy,
	html: FileCode,
};

export function EasyCopyMenu({ markdown, blockKind, rasterTargetRef, onClose }: EasyCopyMenuProps): React.ReactElement {
	const { config } = useComposerChrome();
	const c = config.chrome.copy;
	const [done, setDone] = React.useState<{ kind: EasyCopyKind; label: string } | null>(null);
	const labels: Record<EasyCopyKind, string> = {
		plain: c.plain,
		image: c.image,
		markdown: c.markdown,
		html: c.html,
	};

	const copyKind = async (kind: EasyCopyKind, ev: React.MouseEvent) => {
		const ownerWin = (ev.currentTarget as HTMLElement).ownerDocument.defaultView ?? window;
		const payloads = buildEasyCopyText({ markdown, blockKind });
		let successLabel = c.success;
		if (kind === 'image') {
			successLabel = await copyImage(ownerWin, rasterTargetRef.current, c);
			if (!successLabel) return;
		} else {
			await ownerWin.navigator.clipboard.writeText(payloads[kind]);
		}
		setDone({ kind, label: successLabel });
		ownerWin.setTimeout(() => {
			setDone(null);
			onClose();
		}, 1200);
	};

	return (
		<div className="pk-easy-copy pk-composer-panel" role="menu" data-chrome="true">
			{EASY_COPY_ORDER.map((kind) => {
				const Icon = KIND_ICON[kind];
				const isDone = done?.kind === kind;
				return (
					<Button
						key={kind}
						type="button"
						variant="unstyled"
						role="menuitem"
						className="pk-action-capsule pk-easy-copy__tile"
						data-copy-kind={kind}
						data-copy-state={isDone ? 'success' : undefined}
						onClick={(ev) => void copyKind(kind, ev)}
					>
						{isDone ? <Check size={14} /> : <Icon size={14} />}
						<span>{isDone ? done.label : labels[kind]}</span>
					</Button>
				);
			})}
			<IconButton label={c.close} className="pk-easy-copy__close" data-copy-close="true" onClick={onClose}>
				<X size={13} />
			</IconButton>
		</div>
	);
}

/** Returns the success label, or '' when rastering failed entirely. */
async function copyImage(
	win: Window & typeof globalThis,
	target: HTMLElement | null,
	c: { success: string; imageSuccess: string },
): Promise<string> {
	if (!target) return '';
	const blob = await rasterizeElementToPngBlob(target);
	if (!blob) return '';
	const ClipboardItemCtor = (win as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
	if (ClipboardItemCtor && win.navigator.clipboard?.write) {
		try {
			await win.navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
			return c.success;
		} catch {
			// fall through to download
		}
	}
	const url = win.URL.createObjectURL(blob);
	const a = win.document.createElement('a');
	a.href = url;
	a.download = 'composer-block.png';
	a.click();
	win.setTimeout(() => win.URL.revokeObjectURL(url), 4000);
	return c.imageSuccess;
}
