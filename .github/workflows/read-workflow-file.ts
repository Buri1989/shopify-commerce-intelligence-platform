import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export type WorkflowStep = {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Readonly<Record<string, unknown>>;
};

export type WorkflowJob = {
  readonly uses?: string;
  readonly if?: string;
  readonly needs?: readonly string[];
  readonly permissions?: Readonly<Record<string, string>>;
  readonly 'timeout-minutes'?: number;
  readonly steps?: readonly WorkflowStep[];
};

export type Workflow = {
  readonly on: Readonly<Record<string, unknown>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly env?: Readonly<Record<string, string>>;
  readonly concurrency?: {
    readonly group: string;
    readonly 'cancel-in-progress': boolean;
  };
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
};

export type WorkflowFile = {
  readonly rawYaml: string;
  readonly workflow: Workflow;
};

export function readWorkflowFile(workflowFileName: string): WorkflowFile {
  const rawYaml = readFileSync(
    new URL(workflowFileName, import.meta.url),
    'utf8',
  );
  return { rawYaml, workflow: parse(rawYaml) as Workflow };
}

export function listExternalActionsAsWritten(rawYaml: string): string[] {
  return rawYaml
    .split('\n')
    .map((line) => USES_LINE_PATTERN.exec(line.trim())?.[1])
    .filter((action): action is string => action !== undefined)
    .filter((action) => !action.startsWith(LOCAL_WORKFLOW_PREFIX));
}

export function findStep(job: WorkflowJob, stepName: string): WorkflowStep {
  const step = (job.steps ?? []).find(
    (candidate) => candidate.name === stepName,
  );
  if (step === undefined) {
    throw new Error(`No step named "${stepName}" in the job`);
  }
  return step;
}

const USES_LINE_PATTERN = /^(?:-\s*)?uses:\s*(.+)$/;
const LOCAL_WORKFLOW_PREFIX = './';
