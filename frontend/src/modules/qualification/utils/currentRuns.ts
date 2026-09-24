import type { MonthlyCache, QualificationWorkspace } from '../types';

// Only the latest run of each saved tactical version, from this exact monthly snapshot.
export function currentRuns(workspace: QualificationWorkspace, cache?: MonthlyCache) {
  if (!cache) return [];
  return workspace.templates.filter((rule) => rule.tier === 'tactical').flatMap((rule) => {
    const run = workspace.runs.find((item) => item.templateId === rule.id && item.revision === rule.revision && item.cacheId === cache.id);
    return run ? [run] : [];
  });
}
