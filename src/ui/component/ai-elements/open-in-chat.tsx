import React, { createContext, useContext } from 'react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/ui/component/shared-ui/dropdown-menu';
import { ExternalLink, ChevronDown } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';

const OpenInContext = createContext<{ query: string } | null>(null);

const useOpenInContext = () => {
	const context = useContext(OpenInContext);
	if (!context) {
		throw new Error('OpenIn components must be used within OpenIn');
	}
	return context;
};

export interface OpenInProps {
	query: string;
	children: React.ReactNode;
}

export const OpenIn: React.FC<OpenInProps> = ({ query, children }) => {
	return (
		<OpenInContext.Provider value={{ query }}>
			<DropdownMenu>
				{children}
			</DropdownMenu>
		</OpenInContext.Provider>
	);
};

export interface OpenInTriggerProps {
	children?: React.ReactNode;
}

export const OpenInTrigger: React.FC<OpenInTriggerProps> = ({ children }) => {
	return (
		<DropdownMenuTrigger asChild>
			{children || (
				<Button variant="outline" size="sm" className="pktw-gap-2">
					Open in chat
					<ChevronDown className="pktw-size-3" />
				</Button>
			)}
		</DropdownMenuTrigger>
	);
};

export interface OpenInContentProps {
	className?: string;
	children: React.ReactNode;
}

export const OpenInContent: React.FC<OpenInContentProps> = ({ className, children }) => {
	return (
		<DropdownMenuContent className={cn("pktw-min-w-[200px] !pktw-bg-background", className)}>
			{children}
		</DropdownMenuContent>
	);
};

const createOpenInItem = (platformName: string, urlTemplate: string) => {
	return () => {
		const { query } = useOpenInContext();
		const url = urlTemplate.replace('{query}', encodeURIComponent(query));

		return (
			<DropdownMenuItem
				onSelect={() => {
					window.open(url, '_blank', 'noopener,noreferrer');
				}}
			>
				<span className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-1">
					{platformName}
				</span>
				<ExternalLink className="pktw-size-3" />
			</DropdownMenuItem>
		);
	};
};

export const OpenInChatGPT = createOpenInItem(
	'ChatGPT',
	'https://chat.openai.com/?q={query}'
);

export const OpenInClaude = createOpenInItem(
	'Claude',
	'https://claude.ai/new?q={query}'
);

export const OpenInT3 = createOpenInItem(
	'T3 Chat',
	'https://t3.chat/?q={query}'
);

export const OpenInScira = createOpenInItem(
	'Scira AI',
	'https://scira.ai/?q={query}'
);

export const OpenInv0 = createOpenInItem(
	'v0',
	'https://v0.dev/?q={query}'
);

export const OpenInCursor = createOpenInItem(
	'Cursor',
	'https://cursor.sh/?q={query}'
);

export interface OpenInItemProps {
	children: React.ReactNode;
	onSelect?: () => void;
}

export const OpenInItem: React.FC<OpenInItemProps> = ({ children, onSelect }) => {
	return (
		<DropdownMenuItem onSelect={onSelect}>
			{children}
		</DropdownMenuItem>
	);
};

export interface OpenInLabelProps {
	children: React.ReactNode;
}

export const OpenInLabel: React.FC<OpenInLabelProps> = ({ children }) => {
	return (
		<div className="pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-semibold pktw-text-muted-foreground">
			{children}
		</div>
	);
};

export const OpenInSeparator: React.FC<React.ComponentProps<typeof DropdownMenuSeparator>> = (props) => {
	return <DropdownMenuSeparator {...props} />;
};

