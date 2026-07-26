import * as React from 'react';
import katex from 'katex';

/**
 * Peak Composer — KaTeX display/inline formula renderer (WP5).
 *
 * Renders LaTeX into the real DOM via `katex.render` with `htmlAndMathml`
 * output, so the formula shows even where KaTeX web-fonts are unavailable (the
 * embedded MathML is the fallback). Never throws — an invalid formula renders as
 * a KaTeX error node instead of blanking the block. The rendered subtree carries
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
			output: 'htmlAndMathml',
		});
	}, [latex, display]);
	return <span ref={ref} className={className} data-formula-render aria-label={latex} />;
}
