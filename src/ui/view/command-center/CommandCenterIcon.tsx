import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
	Archive,
	BarChart3,
	Bell,
	BookOpen,
	Bookmark,
	Brain,
	CalendarDays,
	CheckSquare,
	Circle,
	Code2,
	Command,
	Compass,
	Database,
	File,
	FilePlus2,
	FileSearch,
	FileText,
	Folder,
	FolderOpen,
	Globe,
	Grid2X2,
	Hash,
	History,
	House,
	Image,
	Inbox,
	LayoutDashboard,
	Lightbulb,
	Link2,
	ListChecks,
	Map,
	MessageSquare,
	Mic,
	Network,
	Palette,
	PanelsTopLeft,
	PenLine,
	Pin,
	Plus,
	Route,
	Search,
	Settings2,
	Sparkles,
	Star,
	Table2,
	Tag,
	Timer,
	WandSparkles,
	Workflow,
} from 'lucide-react';
import type { CommandCenterItemIcon } from '@/core/command-center';

export const COMMAND_CENTER_LUCIDE_ICONS: Readonly<Record<string, LucideIcon>> = {
	archive: Archive,
	'chart-no-axes-column': BarChart3,
	bell: Bell,
	'book-open': BookOpen,
	bookmark: Bookmark,
	brain: Brain,
	'calendar-days': CalendarDays,
	'check-square': CheckSquare,
	circle: Circle,
	'code-2': Code2,
	command: Command,
	compass: Compass,
	database: Database,
	file: File,
	'file-plus-2': FilePlus2,
	'file-search': FileSearch,
	'file-text': FileText,
	folder: Folder,
	'folder-open': FolderOpen,
	globe: Globe,
	'grid-2x-2': Grid2X2,
	hash: Hash,
	history: History,
	house: House,
	image: Image,
	inbox: Inbox,
	'layout-dashboard': LayoutDashboard,
	lightbulb: Lightbulb,
	'link-2': Link2,
	'list-checks': ListChecks,
	map: Map,
	'message-square': MessageSquare,
	mic: Mic,
	network: Network,
	palette: Palette,
	'panels-top-left': PanelsTopLeft,
	'pen-line': PenLine,
	pin: Pin,
	plus: Plus,
	route: Route,
	search: Search,
	'settings-2': Settings2,
	sparkles: Sparkles,
	star: Star,
	'table-2': Table2,
	tag: Tag,
	timer: Timer,
	'wand-sparkles': WandSparkles,
	workflow: Workflow,
};

export const COMMAND_CENTER_EMOJI = [
	'✨', '🧭', '🏠', '🗂️', '📝', '💬', '🔎', '🗺️', '📌', '⭐',
	'💡', '📚', '📊', '🧠', '🎨', '🛠️', '📅', '✅', '🚀', '⚡',
	'🔖', '🧩', '📥', '📤', '🔗', '🗃️', '🧪', '🎯', '🌱', '🔮',
] as const;

export function CommandCenterIcon({
	icon,
	size = 18,
	className,
}: {
	icon?: CommandCenterItemIcon;
	size?: number;
	className?: string;
}): React.ReactElement | null {
	if (!icon) return null;
	if (icon.kind === 'emoji') {
		return <span className={className ? `pk-cc-emoji ${className}` : 'pk-cc-emoji'} aria-hidden="true">{icon.value}</span>;
	}
	const Icon = COMMAND_CENTER_LUCIDE_ICONS[icon.name] ?? Circle;
	return <Icon className={className} size={size} strokeWidth={1.75} aria-hidden="true" />;
}
