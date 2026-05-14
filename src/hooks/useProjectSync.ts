/**
 * useProjectSync — bidirectional sync between a page's local project state
 * and the global ProjectContext.
 *
 * Usage in any page:
 *   const [selProjId, setSelProjId] = useState(() => localStorage.getItem('seo_season_proj') || '');
 *   const handleProjectChange = useProjectSync(selProjId, setSelProjId);
 *
 * Then pass handleProjectChange to PortalNav's onProjectChange prop.
 * The hook ensures:
 *   - When ProjectContext changes (user switches in PortalNav), local state updates
 *   - When local state changes, ProjectContext updates
 *   - On mount, the stronger value wins (ProjectContext if set, else local)
 */
import { useEffect, useCallback } from 'react';
import { useProject } from '@/contexts/ProjectContext';

export function useProjectSync(
  localId: string,
  setLocalId: (id: string) => void,
): (id: string) => void {
  const { selectedProjectId, setSelectedProjectId } = useProject();

  /* On mount: sync local ↔ context */
  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== localId) {
      setLocalId(selectedProjectId);
    } else if (localId && !selectedProjectId) {
      setSelectedProjectId(localId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* When context changes externally → update local */
  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== localId) {
      setLocalId(selectedProjectId);
    }
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Return a setter that writes both */
  return useCallback((id: string) => {
    setLocalId(id);
    setSelectedProjectId(id);
  }, [setLocalId, setSelectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps
}
