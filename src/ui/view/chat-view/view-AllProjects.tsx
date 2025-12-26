import React, { useState, useEffect, useCallback } from 'react';
import { ChatProject } from '@/service/chat/types';
import { cn } from '@/ui/react/lib/utils';
import { Folder } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';

interface AllProjectsViewProps {
	onProjectClick: (project: ChatProject) => void;
}

const PROJECTS_PAGE_SIZE = 20;

/**
 * View component for displaying all projects in a card grid
 */
export const AllProjectsViewComponent: React.FC<AllProjectsViewProps> = ({
	onProjectClick,
}) => {
	const { manager } = useServiceContext();
	const [projects, setProjects] = useState<ChatProject[]>([]);
	const [projectsPage, setProjectsPage] = useState(0);
	const [loading, setLoading] = useState(true);

	// Load projects
	useEffect(() => {
		const loadProjects = async () => {
			setLoading(true);
			const allProjects = await manager.listProjects();
			setProjects(allProjects);
			setProjectsPage(0);
			setLoading(false);
		};
		loadProjects();
	}, [manager]);

	// Calculate projects to show
	const endIndex = (projectsPage + 1) * PROJECTS_PAGE_SIZE;
	const projectsToShow = projects.slice(0, endIndex);
	const hasMore = endIndex < projects.length;

	// Setup infinite scroll
	const sentinelRef = React.useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!hasMore || !sentinelRef.current) return;

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						setProjectsPage((prev) => prev + 1);
					}
				});
			},
			{ threshold: 0.1 }
		);

		observer.observe(sentinelRef.current);

		return () => {
			observer.disconnect();
		};
	}, [hasMore, projectsPage]);

	if (loading) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				Loading projects...
			</div>
		);
	}

	if (projectsToShow.length === 0) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				No projects yet.
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-y-auto">
			<div className="pktw-grid pktw-grid-cols-1 md:pktw-grid-cols-2 lg:pktw-grid-cols-3 pktw-gap-4 pktw-p-6">
				{projectsToShow.map((project) => (
					<div
						key={project.meta.id}
						className={cn(
							'pktw-flex pktw-flex-col pktw-gap-3 pktw-p-4 pktw-rounded-lg',
							'pktw-border pktw-border-border pktw-bg-card',
							'pktw-cursor-pointer pktw-transition-all',
							'hover:pktw-shadow-md hover:pktw-border-primary/50'
						)}
						onClick={() => onProjectClick(project)}
					>
						{/* Project name */}
						<div className="pktw-flex pktw-items-center pktw-gap-2">
							<Folder className="pktw-w-5 pktw-h-5 pktw-text-muted-foreground" />
							<h3 className="pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-m-0">
								{project.meta.name}
							</h3>
						</div>

						{/* Project summary */}
						<div className="pktw-text-sm pktw-text-muted-foreground pktw-line-clamp-3">
							{project.context?.shortSummary || 'No summary available.'}
						</div>
					</div>
				))}
			</div>

			{/* Scroll sentinel for infinite scroll */}
			{hasMore && (
				<div
					ref={sentinelRef}
					className="pktw-h-4 pktw-w-full"
					aria-hidden="true"
				/>
			)}
		</div>
	);
};

