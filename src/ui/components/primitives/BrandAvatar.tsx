import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';
import type { ProviderId } from './types';

export interface BrandAvatarProps
	extends React.HTMLAttributes<HTMLSpanElement> {
	provider?: ProviderId;
	/** Override the letter shown when no children are provided. */
	letter?: string;
	size?: 'sm' | 'default';
}

/**
 * Default letter fallback per provider. Some letters disambiguate where the
 * obvious initial collides:
 *   openrouter → R (not O, taken by openai)
 *   ollama     → L (not O, taken by openai)
 */
const PROVIDER_LETTER: Record<ProviderId, string> = {
	openai: 'O',
	anthropic: 'A',
	google: 'G',
	openrouter: 'R',
	perplexity: 'P',
	ollama: 'L',
};

/** Circular provider avatar — applies `.pk-brand-av` + `[data-provider]`. */
export const BrandAvatar = React.forwardRef<HTMLSpanElement, BrandAvatarProps>(
	(
		{ className, provider, letter, size = 'default', children, ...props },
		ref
	) => {
		const resolvedLetter =
			letter ?? (provider ? PROVIDER_LETTER[provider] : '?');
		return (
			<span
				ref={ref}
				className={cn(
					'pk-brand-av',
					size === 'sm' && 'pk-brand-av--sm',
					className
				)}
				data-provider={provider}
				{...props}
			>
				{children ?? resolvedLetter}
			</span>
		);
	}
);
BrandAvatar.displayName = 'BrandAvatar';
