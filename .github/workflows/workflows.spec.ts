import {
  listExternalActionsAsWritten,
  readWorkflowFile,
  type Workflow,
} from './read-workflow-file.js';

const PINNED_ACTION_PATTERN =
  /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;
const AWS_LOGIN_ACTION_PREFIX = 'aws-actions/configure-aws-credentials@';
const SETUP_NODE_ACTION_PREFIX = 'actions/setup-node@';
const ALLOWED_PERMISSIONS = ['contents', 'id-token', 'pull-requests'];

describe.each(['checks.yml', 'pull-request.yml'])('%s', (fileName) => {
  let rawYaml: string;
  let workflow: Workflow;

  beforeAll(() => {
    ({ rawYaml, workflow } = readWorkflowFile(fileName));
  });

  it('pins every action to a commit SHA and names the version beside it', () => {
    const actions = listExternalActionsAsWritten(rawYaml);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action).toMatch(PINNED_ACTION_PATTERN);
    }
  });

  it('grants the token read access to the repository and nothing more by default', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  it('lets only the jobs that log in to AWS mint an identity token', () => {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      const logsInToAws = (job.steps ?? []).some((step) =>
        step.uses?.startsWith(AWS_LOGIN_ACTION_PREFIX),
      );
      if (logsInToAws) {
        expect(job.permissions, jobName).toMatchObject({
          contents: 'read',
          'id-token': 'write',
        });
      } else {
        expect(job.permissions, jobName).toBeUndefined();
      }
    }
  });

  it('lets only the diff job write pull request comments', () => {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      const expected = jobName === 'diff' ? 'write' : undefined;
      expect(job.permissions?.['pull-requests'], jobName).toBe(expected);
    }
  });

  it('grants no other permission to any job', () => {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      const unknown = Object.keys(job.permissions ?? {}).filter(
        (permission) => !ALLOWED_PERMISSIONS.includes(permission),
      );
      expect(unknown, jobName).toEqual([]);
    }
  });

  it('gives every job that runs steps a time limit', () => {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps !== undefined) {
        expect(job['timeout-minutes'], jobName).toEqual(expect.any(Number));
      }
    }
  });

  it('reads the Node version from .nvmrc in every setup-node step', () => {
    const setupNodeSteps = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .filter((step) => step.uses?.startsWith(SETUP_NODE_ACTION_PREFIX));
    expect(setupNodeSteps.length).toBeGreaterThan(0);
    for (const step of setupNodeSteps) {
      expect(step.with?.['node-version-file']).toBe('.nvmrc');
    }
  });
});

describe('checks.yml', () => {
  it('runs only when another workflow calls it', () => {
    expect(Object.keys(readWorkflowFile('checks.yml').workflow.on)).toEqual([
      'workflow_call',
    ]);
  });
});

describe('pull-request.yml', () => {
  let rawYaml: string;
  let workflow: Workflow;

  beforeAll(() => {
    ({ rawYaml, workflow } = readWorkflowFile('pull-request.yml'));
  });

  it('runs on pull requests against main and on nothing else', () => {
    expect(workflow.on).toEqual({ pull_request: { branches: ['main'] } });
  });

  it('queues runs of the same pull request and cancels nothing', () => {
    expect(workflow.concurrency).toEqual({
      group: 'pull-request-${{ github.event.pull_request.number }}',
      'cancel-in-progress': false,
    });
  });

  it('never references the deploy role', () => {
    expect(rawYaml).not.toContain('AWS_DEPLOY_ROLE_ARN');
  });

  it('runs the shared checks, the diff and the Docker build', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual([
      'checks',
      'diff',
      'docker',
    ]);
    expect(workflow.jobs.checks.uses).toBe('./.github/workflows/checks.yml');
  });
});
