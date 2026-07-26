import * as React from 'react';
import katex from 'katex';

/**
 * Peak Composer — KaTeX display/inline formula renderer (WP5).
 *
 * Renders LaTeX into the real DOM via `katex.render` with `mathml` output: the
 * browser lays the formula out with native MathML Core (Chromium/Electron), so
 * NO KaTeX web-fonts are requested and there is never a `fonts/*.woff2` 404 —
 * the HTML-glyph output path is the only thing that pulls those fonts, and it is
 * the one intentionally not shipped. The four-format Easy Copy payload keeps its
 * self-contained HTML+MathML string (built separately, not rendered here), so
 * copy fidelity is unchanged. Never throws — an invalid formula renders as a
 * KaTeX error node instead of blanking the block. The rendered subtree carries
 * no chrome, so Easy Copy's raster snapshot captures the formula only.
 */
export function KatexFormula({
	latex,
	display = true,
	className,
}: {
	latex: string;
	display?: boolean;
	className?: string;
}): React.ReactElement {
	const ref = React.useRef<HTMLSpanElement | null>(null);
	React.useEffect(() => {
		const el = ref.current;
		if (!el) return;
		katex.render(latex, el, {
			throwOnError: false,
			displayMode: display,
			output: 'mathml',
		});
	}, [latex, display]);
	return <span ref={ref} className={className} data-formula-render aria-label={latex} />;
}
