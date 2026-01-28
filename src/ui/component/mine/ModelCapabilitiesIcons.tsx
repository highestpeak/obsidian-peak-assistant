import React from 'react';
import { Eye, FileText, Wrench, Globe, Code, Image as ImageIcon, Brain } from 'lucide-react';
import { ModelCapabilities } from '@/core/providers/types';
import { cn } from '@/ui/react/lib/utils';
import { formatMaxContext } from '@/core/utils/format-utils';

interface ModelCapabilitiesIconsProps {
	capabilities: ModelCapabilities;
	isHovered?: boolean;
	className?: string;
}

/**
 * Component to display model capabilities icons
 * Shows various AI model capabilities with colored icons
 */
export const ModelCapabilitiesIcons: React.FC<ModelCapabilitiesIconsProps> = ({
	capabilities,
	isHovered = false,
	className
}) => {
	return (
		<div className={cn("pktw-flex pktw-items-center pktw-gap-1 pktw-flex-shrink-0", className)}>
			{capabilities.vision && (
				<div title="Vision">
					<Eye className={cn("pktw-w-3.5 pktw-h-3.5 pktw-text-emerald-500", isHovered && 'pktw-text-inherit')} />
				</div>
			)}
			{capabilities.pdfInput && (
				<div title="PDF Input">
					<FileText className={cn("pktw-w-3.5 pktw-h-3.5 pktw-text-red-500", isHovered && 'pktw-text-inherit')} />
				</div>
			)}
			{capabilities.tools && (
				<div title="Tools">
					<Wrench className={cn("pktw-w-3.5 pktw-h-3.5 pktw-text-blue-500", isHovered && 'pktw-text-inherit')} />
				</div>
			)}
			{(capabilities.webSearch || capabilities.xSearch || capabilities.newsSearch || capabilities.rssSearch) && (
				<div title="Search">
					<Globe className={cn("pktw-w-3.5 pktw-h-3.5 pktw-text-purple-500", isHovered && 'pktw-text-inherit')} />
				</div>
			)}
			{capabilities.codeInterpreter && (
				<div title="Code Interpreter">
					<Code className={cn("pktw-w-3.5 pktw-h-3.5 pktw-text-orange-500", isHovered && 'pktw-text-inherit')} />
				</div>
			)}
			{capabilities.imageGeneration && (
				<div title="Image Generation">
					<ImageIcon className={cn("pktw-w-3.5 pktw-h-3.5 pktw-text-pink-500", isHovered && 'pktw-text-inherit')} />
				</div>
			)}
			{capabilities.reasoning && (
				<div title="Reasoning">
					<Brain className={cn("pktw-w-3.5 pktw-h-3.5 pktw-text-indigo-500", isHovered && 'pktw-text-inherit')} />
				</div>
			)}
			{capabilities.maxCtx && (
				<span className="pktw-text-[10px] pktw-font-medium pktw-text-muted-foreground pktw-px-1 pktw-py-0.5 pktw-bg-muted pktw-rounded pktw-flex-shrink-0" title="Max Context">
					{formatMaxContext(capabilities.maxCtx)}
				</span>
			)}
		</div>
	);
};