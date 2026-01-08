import React from 'react';

/**
 * Markdown icon component using Wikipedia's Markdown logo
 */
export function MarkdownIcon({
	size = 16,
	className,
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 208 128"
			className={className}
			style={{ flexShrink: 0 }}
		>
			<rect
				width="198"
				height="118"
				x="5"
				y="5"
				ry="10"
				stroke="currentColor"
				strokeWidth="10"
				fill="none"
			/>
			<path
				d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z"
				fill="currentColor"
			/>
		</svg>
	);
}
