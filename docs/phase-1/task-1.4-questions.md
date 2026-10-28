# Task 1.4 — Questions to investigate

Short answers. Task 1.4 has no question list of its own: seven requirements and the general
rules' seven questions. The decision is CloudFormation through CDK as the description of the
infrastructure and the record of what is deployed. Task 1.2 argued CDK over Terraform as a
language; this doc is about the state model and the procedure. Verified 2026-10-22. Alternatives
and trade-offs are in `task-1.4-design.md`.

## 1. CloudFormation through CDK, the seven questions

- **Problem**: describe infrastructure in code that is type-checked, tested and reviewed, and
  keep the record of what it produced so the next change is a difference. CDK is the first
  half; CloudFormation is the second, a service, not a file.
- **Why**: nothing to protect. No bucket, no lock table, no file to corrupt. CloudFormation
  refuses a second update while one runs, rolls a failed update back by itself, and compares
  its record with the live resources on demand.
- **Alternatives**: Terraform with S3 state and a DynamoDB lock (declined in 1.2); Pulumi (its
  own state service, a second runtime); raw templates (same state, no types, no tests); CDK
  Pipelines (CodePipeline; the spec asks for GitHub Actions).
- **Limitations**: slow feedback, minutes per change set and update; new AWS features lag; 500
  resources and 1 MB per template; the diff is a template diff, blind to stack settings such as
  termination protection; a value resolved at deploy time makes two deploys of one commit
  differ; weak references drop the guard against deleting what another stack reads; drift
  detection skips some types, our standalone security-group rules among them.
- **When differently**: several clouds: Terraform. Policy across hundreds of stacks: Terraform's
  policy tools, or cdk-nag through the `Validations` hook we already use. Dozens of accounts:
  CDK stages with a pipeline construct.
- **What could go wrong**: a failed rollback leaves `UPDATE_ROLLBACK_FAILED` and needs a person.
  Deleting a stack another one reads leaves `DELETE_FAILED` with the service down; termination
  protection guards it. A replacement hiding in an unrelated change: the reviewer's job. A
  console change drifts the stack: the drift step. The bootstrap falls behind the CLI: run
  `cdk bootstrap` again.
- **Under load**: not on the request path. One update per stack at a time, so the app stack that
  changes every release is apart from the rare-change stacks. A second service gets its own
  stack.

## 2. How is a deployment repeated from zero?

Clean clone, `npm ci` in both packages, the SSO profile, the README's sequence: bootstrap,
network and registry, image push, app stack. Everything the stacks need is in the repository or
the stage config. No credentialed lookups at synth, so the gate's `cdk synth` equals the deploy's.

Not repeatable from the repository: the domain and hosted zone (bought by hand; a new account
changes two config values) and the bootstrap stack (made by the CLI). The NAT image was "latest"
until this task; it is pinned now.

## 3. How is the state kept safe?

The state is CloudFormation's record in the account, protected by IAM. Nothing on a laptop or in
the repository holds it. `cdk.context.json` never exists because there are no lookups.

Added here: termination protection on the network and registry stacks; the app stack stays
deletable because it comes back in twenty minutes. Verified with `describe-stacks`, not a
`destroy` attempt. Drift detection, `npm run drift`, before a planned change and after console
work; on 2026-10-22 no drift, 20 resources it cannot check, named in the README.

The gap by our choice: weak references mean CloudFormation will not block a network change the
app uses. The diff review replaces that guard; read any network-stack change twice.

## 4. What separates infrastructure configuration from application configuration?

Two packages that never import each other. `infra/` has its own dependencies and gate and is
excluded from the Docker build. Infrastructure configuration is the typed `StageConfig`: region,
zones, sizes, pinned image, hosted zone. Application configuration is the environment validated
by `env.schema.ts` at boot. The one bridge is the task definition, where `applicationPort`
becomes `PORT`.

One pair crosses on purpose and is written on both sides: the balancer's 60 s idle timeout and
the app's 65 s keep-alive.

## 5. What counts as a secret?

Credentials: keys, tokens, passwords, private keys. Never in code, config, docs, workflows or
commits. None exist in the repository; SSO issues short-lived credentials and Task 1.5 uses
OIDC.

Not secrets: the account id, hosted zone id, region, host name. Code stays account-agnostic;
documents may name the deployment. The 1.2 anti-goal on the account id was revised, not quietly
broken.

Later secrets: created by AWS in Secrets Manager, referenced by ARN. Never a stage config value
or an environment literal. CDK's `checkSecretUsage` flag fails synth if a secret would render in
plain text.

## 6. How is the deployment process documented?

README: the commands, setup to tear-down. `docs/architecture.md`: the picture, kept current by
every task. Design docs: the reasons. The README carries steps and pointers only.

## 7. How are infrastructure changes reviewed and applied?

Plan on the pull request, apply on merge. The branch passes the infra gate; the pull request
shows `cdk diff` (pasted until Task 1.5 posts it). The reviewer looks twice at IAM, security
groups, replacements and the network stack. Merge deploys what was reviewed, with no interactive
approval. A diff after the deploy is clean. Drift runs before the next change.

The worked example: the first diff, with no code change, marked the NAT instance for replacement
because Amazon published a new image and the template said "latest". The image was pinned
instead; the deploy changed the protection flag and nothing that runs.

## Why we picked what we picked

- **CloudFormation as the state store**: nothing to protect, concurrent updates refused, rollback
  and drift built in. See §1.
- **Termination protection on network and registry, not app**: the two whose loss is an outage
  get the guard; the one removed on purpose stays easy.
- **Account id in documents, never in code or config**: AWS calls it an identifier; git history
  holds it anyway; credentials and account-agnostic code are what matter.
- **The pull request carries the diff**: the last place a person sees an IAM or group change
  before it applies.
- **Drift detection on demand, blind spots named**: free, one command, honest about what it
  skips.
- **NAT image pinned**: same commit, same network; a clean diff means nothing changes; patching
  is a chosen moment.
- **Validator warning acknowledged with a reason, and a test that none stays unacknowledged**:
  the rule is about portability the region-pinned stack does not want.
- **`architecture.md` with Mermaid**: describes the environment, reviewed like code, rendered by
  GitHub.
- **`create*Stack` under `synthesize*`, `read*` for the validation report**: termination
  protection and findings are not template properties.
- **Flag verified with `describe-stacks`**: a check that can cause the failure it checks for is
  not a check.
- **README around what a person does**: steps; the reasons live in the design docs.
