import React from 'react';
import { Server, Settings2 } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { ProfileKind } from '@/core/profiles/types';

// Brand SVG icons — same as settings ProviderIcon but for inline use

const AnthropicIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
		<path d="M13.827 3.375h-3.32L4 20.625h3.564l1.414-3.9h6.044l1.414 3.9H20L13.827 3.375zm-3.627 10.2 2.135-5.888 2.135 5.888H10.2z" />
	</svg>
);

const OpenAIIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
		<path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
	</svg>
);

const GoogleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
		<path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
	</svg>
);

const PerplexityIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
		<path d="M4 5h16v2H4zm2 4h12v2H6zm-2 4h16v2H4zm2 4h12v2H6z" />
	</svg>
);

const OllamaIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
		<circle cx="12" cy="12" r="9" fillOpacity="0.3" />
		<circle cx="12" cy="12" r="5" />
	</svg>
);

const OpenRouterIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
		<circle cx="12" cy="12" r="2" />
		<path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M19.07 4.93l-2.83 2.83M7.76 16.24l-2.83 2.83" strokeWidth="2" stroke="currentColor" fill="none" />
		<circle cx="12" cy="12" r="7" strokeWidth="1.5" stroke="currentColor" fill="none" strokeDasharray="3 2" />
	</svg>
);

const LiteLLMIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
		<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H13L13 2z" />
	</svg>
);

const CustomIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<Settings2 {...(props as React.ComponentProps<typeof Settings2>)} />
);

export const PROVIDER_BRAND_SVGS: Record<ProfileKind, React.FC<React.SVGProps<SVGSVGElement>>> = {
	anthropic: AnthropicIcon,
	openai: OpenAIIcon,
	google: GoogleIcon,
	perplexity: PerplexityIcon,
	ollama: OllamaIcon,
	openrouter: OpenRouterIcon,
	litellm: LiteLLMIcon,
	custom: CustomIcon,
};

export const PROVIDER_BRAND_COLORS: Record<ProfileKind, string> = {
	anthropic: '#d4a574',
	openai: '#10a37f',
	google: '#4285f4',
	perplexity: '#20b2aa',
	ollama: '#888888',
	openrouter: '#6366f1',
	litellm: '#059669',
	custom: '#888888',
};

export interface ProviderBrandIconProps {
	provider: string;
	size?: number;
	className?: string;
}

export function ProviderBrandIcon({ provider, size = 16, className }: ProviderBrandIconProps) {
	const SvgIcon = PROVIDER_BRAND_SVGS[provider as ProfileKind];
	const color = PROVIDER_BRAND_COLORS[provider as ProfileKind];

	if (SvgIcon) {
		return (
			<SvgIcon
				width={size}
				height={size}
				style={{ color, width: size, height: size, flexShrink: 0 }}
				className={className}
			/>
		);
	}

	return <Server size={size} className={cn('pktw-text-muted-foreground', className)} style={{ width: size, height: size, flexShrink: 0 }} />;
}
