import * as React from 'react';
import { KatexFormula } from '../blocks/math';

/** A non-editable visual atom for a source `$…$` interval. */
export function InlineMathAtom({
	latex,
	sourceFrom,
	sourceTo,
}: {
	latex: string;
	sourceFrom: number;
	sourceTo: number;
}): React.ReactElement {
	return (
		<span
			className="pk-composer-inline-math"
			contentEditable={false}
			data-inline-math-atom
			data-source-from={sourceFrom}
			data-source-to={sourceTo}
			role="math"
			aria-label={latex}
		>
			<KatexFormula latex={latex} display={false} />
		</span>
	);
}
