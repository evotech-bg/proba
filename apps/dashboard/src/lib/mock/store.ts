// Real-data store: hydrates from the SQLite-backed server snapshot and writes through server
// functions. Keeps the original action signatures so the UI components are unchanged.
// (Lives under mock/ for import-path compatibility; it is no longer mock data.)
import { create } from 'zustand'
import { fetchSnapshot, mutate } from '../api/proba.functions'
import type { ActivityItem, App, Flaky, Project, Requirement, Run, Session, Step, Suite, Task, TaskStatus, TestCase } from './types'

const SCOPE_KEY = 'proba.scope'
const loadScope = (): { projectKey?: string; appKey?: string } => {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(window.localStorage.getItem(SCOPE_KEY) ?? '{}') } catch { return {} }
}
const saveScope = (s: { projectKey?: string; appKey?: string }) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(SCOPE_KEY, JSON.stringify(s))
}

interface ProbaState {
  tests: TestCase[]
  requirements: Requirement[]
  tasks: Task[]
  runs: Run[]
  flaky: Flaky[]
  sessions: Session[]
  suites: Suite[]
  activity: ActivityItem[]
  projects: Project[]
  apps: App[]
  activeProjectKey?: string
  activeAppKey?: string
  hydrated: boolean

  refresh: () => Promise<void>
  hydrate: (snap: Partial<ProbaState>) => void
  setScope: (scope: { projectKey?: string; appKey?: string }) => void
  createProject: (name: string, description?: string) => void
  createApp: (projectKey: string, name: string, platform?: string) => void
  assignAppKey: (entity: 'test' | 'suite' | 'requirement' | 'task', id: string, appKey?: string) => void

  upsertTest: (t: TestCase) => void
  patchTest: (id: string, patch: Partial<TestCase>) => void
  deleteTest: (id: string) => void
  patchStep: (testId: string, stepId: string, patch: Partial<Step>) => void
  addStep: (testId: string, step: Step) => void
  removeStep: (testId: string, stepId: string) => void
  reorderSteps: (testId: string, ids: string[]) => void

  upsertTask: (t: Task) => void
  patchTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  moveTask: (id: string, status: TaskStatus) => void

  addRequirement: (r: Requirement) => void
  linkRequirement: (reqId: string, caseId: string) => void
  unlinkRequirement: (reqId: string, caseId: string) => void

  addRun: (r: Run) => void
  toggleQuarantine: (caseId: string) => void
  pushActivity: (a: ActivityItem) => void

  createSuite: (name: string, kind: string) => void
  updateSuite: (id: string, patch: { name?: string; kind?: string; description?: string }) => void
  deleteSuite: (id: string) => void
  addCaseToSuite: (suiteId: string, caseId: string) => void
  removeCaseFromSuite: (suiteId: string, caseId: string) => void

  approveBaseline: (caseId: string, actualUrl: string) => void
  resetBaseline: (caseId: string) => void
}

/** Client-side id generator (used by components for optimistic keys before refetch). */
export const newId = () => Math.random().toString(36).slice(2, 10)

const run = (op: string, args: Record<string, unknown> = {}) => mutate({ data: { op, args } })

export const useProba = create<ProbaState>((set, get) => {
  const refresh = async () => {
    const snap = await fetchSnapshot()
    set({ ...(snap as unknown as Partial<ProbaState>), hydrated: true })
  }
  const after = (p: Promise<unknown>) => {
    p.then(refresh).catch((e) => console.error('mutation failed', e))
  }
  // the app new entities should be created under (the active surface, if one is selected)
  const scopeApp = () => get().activeAppKey
  const initial = loadScope()
  return {
    tests: [], requirements: [], tasks: [], runs: [], flaky: [], sessions: [], suites: [], activity: [],
    projects: [], apps: [], activeProjectKey: initial.projectKey, activeAppKey: initial.appKey, hydrated: false,
    refresh,
    hydrate: (snap) => set({ ...snap, hydrated: true }),
    setScope: ({ projectKey, appKey }) => { saveScope({ projectKey, appKey }); set({ activeProjectKey: projectKey, activeAppKey: appKey }) },
    createProject: (name, description) => after(run('createProject', { name, description })),
    createApp: (projectKey, name, platform) => after(run('createApp', { projectKey, name, platform })),
    assignAppKey: (entity, id, appKey) => after(run('assignAppKey', { entity, id, appKey })),

    upsertTest: (t) => after(run('createTest', { title: t.title, appKey: scopeApp() })),
    patchTest: (id, patch) => after(run('patchTest', { id, patch })),
    deleteTest: (id) => after(run('deleteTest', { id })),
    patchStep: (testId, stepId, patch) => after(run('patchStep', { testId, stepId, patch })),
    addStep: (testId, step) => after(run('addStep', { testId, step })),
    removeStep: (testId, stepId) => after(run('removeStep', { testId, stepId })),
    reorderSteps: (testId, ids) => after(run('reorderSteps', { testId, ids })),

    upsertTask: (t) => after(run('createTask', { title: t.title, status: t.status, priority: t.priority, description: t.description, appKey: scopeApp() })),
    patchTask: (id, patch) => after(run('patchTask', { id, patch })),
    deleteTask: (id) => after(run('deleteTask', { id })),
    moveTask: (id, status) => after(run('moveTask', { id, status })),

    addRequirement: (r) => after(run('addRequirement', { key: r.key, title: r.title, appKey: scopeApp() })),
    linkRequirement: (reqId, caseId) => after(run('linkRequirement', { reqId, caseId })),
    unlinkRequirement: (reqId, caseId) => after(run('unlinkRequirement', { reqId, caseId })),

    addRun: () => {},
    toggleQuarantine: (caseId) => after(run('toggleQuarantine', { caseId })),
    pushActivity: () => {},

    createSuite: (name, kind) => after(run('createSuite', { name, kind, appKey: scopeApp() })),
    updateSuite: (id, patch) => after(run('updateSuite', { id, patch })),
    deleteSuite: (id) => after(run('deleteSuite', { id })),
    addCaseToSuite: (suiteId, caseId) => after(run('addCaseToSuite', { suiteId, caseId })),
    removeCaseFromSuite: (suiteId, caseId) => after(run('removeCaseFromSuite', { suiteId, caseId })),

    approveBaseline: (caseId, actualUrl) => after(run('approveBaseline', { caseId, actualUrl })),
    resetBaseline: (caseId) => after(run('resetBaseline', { caseId })),
  }
})

/**
 * Predicate for the active project/app scope. Pages call `const inScope = useScopeFilter()`
 * then `items.filter((x) => inScope(x.appKey))`. No scope selected → everything passes.
 */
export function useScopeFilter(): (appKey?: string) => boolean {
  const projectKey = useProba((s) => s.activeProjectKey)
  const appKey = useProba((s) => s.activeAppKey)
  const apps = useProba((s) => s.apps)
  return (entityAppKey?: string) => {
    if (appKey) return entityAppKey === appKey
    if (projectKey) {
      const inProject = new Set(apps.filter((a) => a.projectKey === projectKey).map((a) => a.key))
      return entityAppKey != null && inProject.has(entityAppKey)
    }
    return true
  }
}
