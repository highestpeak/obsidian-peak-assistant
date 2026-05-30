import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface NumberedPagerProps {
	/** 1-indexed current page. */
	page: number;
	/** Total page count. */
	pageCount: number;
	onChange: (next: number) => void;
	/** Window of numbered buttons rendered around the current page. */
	siblingCount?: number;
	className?: string;
	'aria-label'?: string;
}

type PageToken = number | 'gap';

function buildTokens(
	page: number,
	pageCount: number,
	siblingCount: number
): PageToken[] {
	if (pageCount <= 1) return [1];
	const first = 1;
	const last = pageCount;
	const start = Math.max(first + 1, page - siblingCount);
	const end = Math.min(last - 1, page + siblingCount);
	const tokens: PageToken[] = [first];
	if (start > first + 1) tokens.push('gap');
	for (let i = start; i <= end; i++) tokens.push(i);
	if (end < last - 1) tokens.push('gap');
	if (last !== first) tokens.push(last);
	return tokens;
}

/**
 * Numbered pager — applies `.pk-pager` (scoped to
 * `.peak-design-root.usage-dashboard`). Used on History to page through
 * call rows. Keeps prev/next chevrons + a windowed number strip with
 * ellipses; renders disabled state at the ends.
 */
export function NumberedPager({
	page,
	pageCount,
	onChange,
	siblingCount = 1,
	className,
	'aria-label': ariaLabel,
}: NumberedPagerProps) {
	const tokens = buildTokens(page, pageCount, siblingCount);
	const canPrev = page > 1;
	const canNext = page < pageCount;
	return (
		<nav
			className={cn('pk-pager', className)}
			aria-label={ariaLabel ?? 'Pagination'}
		>
			<button
				type="button"
				className="pk-pager__btn"
				onClick={() => canPrev && onChange(page - 1)}
				disabled={!canPrev}
				aria-label="Previous page"
			>
				‹
			</button>
			{tokens.map((tok, index) =>
				tok === 'gap' ? (
					<span key={`gap-${index}`} className="pk-pager__ellipsis">
						…
					</span>
				) : (
					<button
						key={tok}
						type="button"
						className="pk-pager__btn"
						aria-current={tok === page ? 'page' : undefined}
						onClick={() => onChange(tok)}
					>
						{tok}
					</button>
				)
			)}
			<button
				type="button"
				className="pk-pager__btn"
				onClick={() => canNext && onChange(page + 1)}
				disabled={!canNext}
				aria-label="Next page"
			>
				›
			</button>
		</nav>
	);
}
