import { useEffect, useState } from 'react';
import {
	DEFAULT_GRAPH_WORKSPACE_CONFIG,
	loadGraphWorkspaceConfig,
	type GraphWorkspaceConfig,
} from './graphWorkspaceDefaults';

export function useGraphWorkspaceConfig(supplied?: GraphWorkspaceConfig): GraphWorkspaceConfig {
	const [loaded, setLoaded] = useState(DEFAULT_GRAPH_WORKSPACE_CONFIG);
	useEffect(() => {
		if (supplied) return;
		let active = true;
		void loadGraphWorkspaceConfig().then((next) => {
			if (active) setLoaded(next);
		});
		return () => { active = false; };
	}, [supplied]);
	return supplied ?? loaded;
}
