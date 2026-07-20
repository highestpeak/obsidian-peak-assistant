import React from 'react';
import { ChevronRight } from 'lucide-react';
import { FileIcon, getFileTypeByName } from '@/ui/view/shared/file-utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import { ProjectSectionHead } from './ProjectSectionHead';
import type { ProjectResourceRow } from '../../hooks/useProjectLoad';

interface ProjectResourcesTabProps {
	rows: ProjectResourceRow[];
}

/**
 * Resources tab (chat-studio §9, audit new-3). Section head + single bordered
 * list of two-row rows (icon seat + title + source meta + chevron). The former
 * hardcoded "gen"/"in" direction badges are dropped — not in the mock and a
 * configurability violation; the source is carried by the meta line instead.
 */
export const ProjectResourcesTab: React.FC<ProjectResourcesTabProps> = ({ rows }) => {
	const strings = useChatStudioStrings().projectHome;
	const { vaultNavigation } = useServiceContext();

	const open = (row: ProjectResourceRow) => {
		if (!row.openTarget) return;
		if (row.kind === 'attachment') vaultNavigation.openAttachmentSource(row.openTarget);
		else void vaultNavigation.openLink(row.openTarget);
	};

	return (
		<section className="pkchat-projsection">
			<ProjectSectionHead
				title={strings.resourcesSectionTitle}
				desc={strings.resourcesSectionDesc}
			/>
			{rows.length === 0 ? (
				<div className="pkchat-projempty">{strings.resourcesEmpty}</div>
			) : (
				<div className="pkchat-projlist">
					{rows.map((row) => {
						const kindLabel = row.kind === 'artifact'
							? (row.artifact?.kind ?? 'artifact')
							: getFileTypeByName(row.title);
						return (
							<button
								key={row.id}
								type="button"
								className="pkchat-projrow"
								onClick={() => open(row)}
							>
								<span className="pkchat-projrow__icon" aria-hidden>
									<FileIcon type={typeof kindLabel === 'string' ? kindLabel : 'file'} size={13} />
								</span>
								<span className="pkchat-projrow__copy">
									<span className="pkchat-projrow__title">{row.title}</span>
									{row.subtitle && (
										<span className="pkchat-projrow__meta">{row.subtitle}</span>
									)}
								</span>
								<span className="pkchat-projrow__end">
									<ChevronRight className="pkchat-projrow__chevron" aria-hidden />
								</span>
							</button>
						);
					})}
				</div>
			)}
		</section>
	);
};
