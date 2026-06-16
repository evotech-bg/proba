export type Verdict = "passed" | "failed" | "blocked" | "skipped" | "not_run" | "retest";
export type StepKind = "web" | "api" | "db";
export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked";
export type Polarity = "positive" | "negative";
export type Technique = "ep" | "bva" | "decision" | "pairwise" | "state" | "exploratory" | "manual";
export type Lifecycle = "draft" | "active" | "modified" | "retired";
export type Priority = "low" | "med" | "high" | "urgent";
export type LocatorStrategy = "role" | "text" | "label" | "placeholder" | "testId" | "css";
export type AssertionType = "dom" | "visual" | "layout" | "a11y" | "http" | "schema" | "db_row" | "sla";

export interface Locator {
  strategy: LocatorStrategy;
  value: string;
  name?: string;
}

export interface Assertion {
  id: string;
  type: AssertionType;
  spec: string;
}

export interface Step {
  id: string;
  ordinal: number;
  kind: StepKind;
  action: string;
  description?: string;
  target?: Locator;
  params?: Record<string, string>;
  assertions: Assertion[];
}

export interface Project {
  key: string;
  name: string;
  description?: string;
}

export interface App {
  key: string;
  projectKey: string;
  name: string;
  platform?: string;
}

export interface TestCase {
  id: string;
  title: string;
  intent?: string;
  polarity: Polarity;
  technique: Technique;
  lifecycle: Lifecycle;
  steps: Step[];
  verdict: Verdict;
  tags: string[];
  appKey?: string;
  updatedAt: string;
  latestScreenshot?: string;
}

export interface Suite {
  id: string;
  name: string;
  kind: string;
  description?: string;
  caseIds: string[];
  appKey?: string;
  passed: number;
  failed: number;
}

export interface Requirement {
  id: string;
  key: string;
  title: string;
  appKey?: string;
  linkedCaseIds: string[];
}

export interface TaskEvidence {
  source?: "replay" | "manual";
  screenshot?: string;
  failingStep?: { ordinal: number; kind: string; action: string; message: string };
  failureCount?: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: Priority;
  assignee?: string;
  caseId?: string;
  requirementId?: string;
  runId?: string;
  evidence?: TaskEvidence;
  appKey?: string;
  createdAt: string;
}

export interface RunStepResult {
  stepId: string;
  verdict: Verdict;
  durationMs: number;
  evidence?: { screenshot?: string; trace?: string; console?: string[]; network?: string[] };
}

export interface Run {
  id: string;
  environment: string;
  buildRef?: string;
  startedAt: string;
  durationMs: number;
  passed: number;
  failed: number;
  blocked: number;
  caseResults: { caseId: string; verdict: Verdict; durationMs: number; steps: RunStepResult[] }[];
  visualDiff?: {
    actual?: string; baseline?: string; diff?: string;
    diffPixels?: number; ratio?: number; ssim?: number; firstBaseline?: boolean; diffError?: string;
    console?: { type: string; text: string }[];
    network?: { method: string; url: string; status: number; ok: boolean }[];
    video?: string;
  };
  caseId?: string;
  appKey?: string;
}

export interface Flaky {
  caseId: string;
  title: string;
  score: number;
  rootCause: string;
  quarantined: boolean;
  slaDueAt: string;
  appKey?: string;
}

export type KnowledgeKind = "selector" | "quirk" | "exploration" | "healing" | "auth";

export interface Session {
  id: string;
  appKey: string;
  charter?: string;
  status: "active" | "complete" | "aborted";
  startedAt: string;
  endedAt?: string;
  timeboxMins?: number;
  stepCount: number;
  metrics?: Record<string, number>;
  notes?: string[];
  /** total durable knowledge the app has accumulated (across all sessions) */
  appKnowledgeCount?: number;
  knownSelectors: { name: string; selector: string; kind: StepKind; confidence?: number }[];
  knowledge?: { kind: KnowledgeKind; name: string; value: string; confidence: number; observedAt: string }[];
  quirks: string[];
  linkedTasks?: { id: string; title: string; status: string }[];
  timeline: { ts: string; kind: KnowledgeKind; action: string }[];
}

export interface ActivityItem {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target?: string;
}
