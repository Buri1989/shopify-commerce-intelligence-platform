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

describe.each(['checks.yml', 'pull-request.yml', 'deploy.yml'])(
  '%s',
  (fileName) => {
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
  },
);

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

describe('deploy.yml', () => {
  let rawYaml: string;
  let workflow: Workflow;

  beforeAll(() => {
    ({ rawYaml, workflow } = readWorkflowFile('deploy.yml'));
  });

  it('runs on a push to main, on the rollback button with a required image tag, and on nothing else', () => {
    expect(workflow.on).toEqual({
      push: { branches: ['main'] },
      workflow_dispatch: {
        inputs: {
          imageTag: expect.objectContaining({ required: true, type: 'string' }),
        },
      },
    });
  });

  it('queues deploys one behind the other and cancels nothing', () => {
    expect(workflow.concurrency).toEqual({
      group: 'deploy-dev',
      'cancel-in-progress': false,
    });
  });

  it('deploys the pushed commit, or the tag given to the button, to the project repository', () => {
    expect(workflow.env).toEqual({
      IMAGE_TAG: '${{ inputs.imageTag || github.sha }}',
      ECR_REPOSITORY: 'commerce-intelligence-dev',
    });
  });

  it('re-runs the checks and builds only for a push; the button goes straight to deploy', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['checks', 'build', 'deploy']);
    expect(workflow.jobs.checks.uses).toBe('./.github/workflows/checks.yml');
    expect(workflow.jobs.checks.if).toBe("github.event_name == 'push'");
    expect(workflow.jobs.build.if).toBe("github.event_name == 'push'");
    expect(workflow.jobs.deploy.needs).toEqual(['checks', 'build']);
    expect(workflow.jobs.deploy.if).toBe('${{ !failure() && !cancelled() }}');
  });

  it('logs in with the deploy role and never the pull request role', () => {
    expect(rawYaml).toContain('vars.AWS_DEPLOY_ROLE_ARN');
    expect(rawYaml).not.toContain('AWS_PULL_REQUEST_ROLE_ARN');
  });

  it('builds the ARM image, pushes it as a plain image and reuses layers through the cache', () => {
    const buildStep = (workflow.jobs.build.steps ?? []).find((step) =>
      step.uses?.startsWith('docker/build-push-action@'),
    );
    expect(buildStep?.with).toMatchObject({
      platforms: 'linux/arm64',
      push: true,
      provenance: false,
      'cache-from': 'type=gha',
      'cache-to': 'type=gha,mode=max',
    });
  });

  it('deploys every stack without a prompt, with the image tag as a deploy argument', () => {
    const deployCommands = (workflow.jobs.deploy.steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');
    expect(deployCommands).toContain(
      'npm run -s deploy -- --all --require-approval never',
    );
    expect(deployCommands).toContain('-c imageTag="$IMAGE_TAG"');
  });

  it('checks /health and /ready from outside and writes the run summary', () => {
    const deployCommands = (workflow.jobs.deploy.steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');
    expect(deployCommands).toContain('/health');
    expect(deployCommands).toContain('/ready');
    expect(deployCommands).toContain('GITHUB_STEP_SUMMARY');
  });
});
