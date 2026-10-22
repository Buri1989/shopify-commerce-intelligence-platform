# Task 1.4 — Questions to investigate

Task 1.4 has no question list of its own; it has seven requirements and the general rules' seven
questions for every major technology decision. The decision here is CloudFormation, driven through
CDK, as both the description of the infrastructure and the record of what is deployed. Task 1.2's
questions doc already argued CDK over Terraform as a language; this one is about the state model
and the operating procedure. Answers reflect what was built, deployed and verified on 2026-10-22.
The alternatives in full are in `task-1.4-design.md`.

## 1. CloudFormation through CDK, the seven questions

**What problem does it solve?** Two problems that are usually solved by two tools. Describing the
infrastructure in code that can be type-checked, unit-tested and reviewed like any other code, and
keeping the record of what that code produced so the next change can be computed as a difference.
CDK is the first half; CloudFormation is the second, and it is a service, not a file.

**Why did we choose it?** For the state half specifically: there is nothing to protect. No bucket,
no lock table, no file that two people can corrupt by deploying at once. CloudFormation refuses a
second update while one runs, rolls a failed update back to the last good template by itself,
and can compare its record with the live resources on demand. The price of that convenience is
paid in the limitations below.

**What alternatives did we consider?** Terraform with state in S3 and a DynamoDB lock, declined
in Task 1.2. Pulumi, which brings its own state service or a self-managed backend and a second
runtime. Raw CloudFormation templates, which give the same state model with no types and no unit
tests. CDK Pipelines, which would make CodePipeline the deployer; the spec asks for GitHub
Actions.

**What are its limitations?** Feedback is slow: a change set takes a minute to compute and an
update takes minutes to apply, where Terraform plans in seconds. CloudFormation support for new
AWS features lags the API. A template is capped at 500 resources and one megabyte, which is why
systems split into stacks early. The diff is a template diff: it cannot show stack-level settings
such as termination protection, and it shows a replacement only when CloudFormation can tell one
is coming. A value resolved at deploy time, such as "the latest image", makes two deploys of the
same commit differ, which this task found the hard way. Weak cross-stack references drop the one
guard CloudFormation had against deleting something another stack reads. Drift detection skips
several resource types, among them the standalone security-group rules between our tiers.

**When would we choose differently?** Several clouds or many non-AWS providers: Terraform. A
platform team enforcing policy across hundreds of stacks: Terraform with its policy tooling, or
CDK with a validation plugin such as cdk-nag, which this project can add later through the same
`Validations` hook it already uses for one rule. Dozens of accounts and stages: CDK stages with a
pipeline construct.

**What could go wrong in production?** A failed update rolls back by itself; a failed rollback
leaves the stack in `UPDATE_ROLLBACK_FAILED` and needs a person. Someone deletes a stack another
stack reads from: with weak references CloudFormation starts deleting, fails halfway on the
resources still in use, and leaves `DELETE_FAILED` with the service down; termination protection
is the guard. A replacement hides inside an unrelated change: the reviewer's job in step 3 of the
procedure. A console change drifts the stack, and the next deploy either silently reverts it or
fails on it: the drift step before a planned change. The bootstrap stack falls behind the CLI: the
CLI says so and `cdk bootstrap` is run again.

**How would it behave under increased load?** It is not on the request path. What grows is the
number of stacks and the frequency of deploys. CloudFormation handles one update per stack at a
time, so the stack that changes with every release, the app stack, is kept apart from the ones
that change rarely; a second service would get its own stack rather than growing this one. API
rate limits matter only with many stacks deploying in parallel, which a pipeline can serialise.

## 2. How is a deployment repeated from zero?

A clean clone, `npm ci` in both packages, the SSO profile, and the README's sequence: bootstrap
once, network and registry, the image push, the app stack. Everything the stacks need is in the
repository or in the stage config: explicit availability zones, the hosted zone id, the pinned NAT
image, the image tag as the one argument per deploy. Nothing is looked up with credentials at
synth time, so `cdk synth` in the gate and in CI gives the same template as the deploy.

Two things are not repeatable from the repository alone, and are written down as such. The domain
and its hosted zone were bought by hand; a new account would buy its own and change two config
values. The CDK bootstrap stack is created by the CLI, not by our code, and its version is a fact
of the account. One more thing was repeatable only by accident until this task: the NAT image.
"Latest" at deploy time meant the same commit built a different network depending on the week;
the id is pinned now, and moving it is a change like any other.

## 3. How is the state kept safe?

The state is CloudFormation's record of each stack, in the account, protected by IAM. Nothing in
the repository or on a laptop holds it, so nothing can be lost or corrupted by a developer. The
`cdk.context.json` cache that CDK would write for lookups never exists here, because the stacks
perform no lookups.

What this task added. Termination protection on the network and registry stacks: a delete is
refused until the flag is turned off by one explicit command, documented in the tear-down. The app
stack is left deletable because it is the one removed on purpose and comes back in twenty
minutes. The flag is applied by `cdk deploy` and verified with `describe-stacks`, not with a
`destroy` attempt, because a failed attempt on an unprotected stack would be the outage the flag
prevents. Drift detection, `npm run drift`, before a planned change and after console work; on
2026-10-22 it found no drift and listed 20 resources it cannot check, which the README names so
nobody assumes those are covered.

What the state model cannot do here, by our own choice: the app stack reads the network stack
through weak references, so CloudFormation will not stop an update that removes something the app
uses. The diff review is the replacement for that guard, and the procedure says to read any
network-stack change twice.

## 4. What separates infrastructure configuration from application configuration?

Two packages that never import each other. `infra/` has its own dependencies, gate and lockfile and
is excluded from the Docker build context; `src/` never sees it. Infrastructure configuration is
the typed `StageConfig` object: region, zones, sizes, the pinned image, the hosted zone. Application
configuration is the environment validated by `env.schema.ts` at boot: `NODE_ENV`, `PORT`,
`LOG_LEVEL`. The one bridge is the task definition, where the stage config's `applicationPort`
becomes the container's `PORT`, so the number has one source at deploy time.

Two values are deliberately paired across the boundary and written next to each other on both
sides: the load balancer's 60-second idle timeout and the app's 65-second keep-alive. That is a
documented invariant, not a leak.

## 5. What counts as a secret?

Credentials: access keys, tokens, passwords, private keys. Never in code, configuration,
documents, workflow files or commit messages. None exist in the repository today, and the deploy
path uses none: the SSO profile issues short-lived credentials, and Task 1.5's roles will be
assumed through OIDC.

Not secrets, and treated as configuration: the account id, the hosted zone id, the region, the
host name. The rule this task wrote is that code stays account-agnostic, so a clone deploys
elsewhere by changing an input, while documents may name the deployment because they describe it.
The 1.2 anti-goal that forbade the account id in source was revised rather than quietly broken.

For the secrets later phases bring: a secret is created by AWS, in Secrets Manager with KMS, and
referenced by ARN; never a stage config value, never an environment literal in the task
definition. CDK's `checkSecretUsage` flag, already on, fails synthesis if a secret value would be
rendered in plain text; the rule is the human half of that guard.

## 6. How is the deployment process documented?

In the README, as the commands a person runs: setup, bootstrap, the first deploy as a numbered
sequence, every deploy after it, the review-and-apply procedure, tear-down. In
`docs/phase-1/architecture.md`, as the picture: the network, the request path, the delivery path,
the stacks, kept current by every task that changes the environment. In the design docs, as the
reasons. The README is the one a new engineer reads first, so it carries no reasoning, only steps
and the pointers.

## 7. How are infrastructure changes reviewed and applied?

Plan on the pull request, apply on merge. A change is made on a branch and passes the infra gate.
The pull request shows `cdk diff` against the deployed stacks; until Task 1.5 posts it through a
read-only role, the author pastes it. The reviewer reads the diff and looks twice at IAM and
security-group changes, at replacements, and at anything in the network stack. The merge deploys
exactly what was reviewed, with CDK's interactive approval switched off because the approval
already happened. A diff after the deploy is clean. Drift detection runs before the next planned
change.

The worked example happened inside this task. The first diff, with no code change, marked the NAT
instance for replacement: Amazon had published a new Linux image the day before and the template
said "latest". Had that been an unrelated pull request, step 3 of the procedure is where the
reviewer would have seen "requires replacement" and asked why. Instead of deploying it, the image
was pinned, and the deploy that followed changed the protection flag and nothing that runs.

## Why we picked what we picked

Short reasons for each Task 1.4 decision. The alternatives and trade-offs in full are in
`task-1.4-design.md`.

- **CloudFormation as the state store, through CDK.** Nothing to protect, concurrent updates
  refused by the service, automatic rollback, drift detection built in; the price is slow
  feedback and the limitations in §1. Chosen in Task 1.2 and confirmed here.
- **Termination protection on the network and registry stacks, not the app stack.** The two
  whose loss is an outage or a stuck stack get the guard; the one removed on purpose stays easy
  to remove. A stage-config switch would have protected nothing with one stage; relying on prompts
  does not guard the admin profile that deploys today.
- **The account id may appear in documents, never in code or configuration.** AWS calls it an
  identifier, git history holds it anyway, and the thing worth protecting is credentials and
  account-agnostic code. Scrubbing the 1.3 doc would have changed nothing.
- **The pull request carries the diff.** Once deploys run on merge, the pull request is the last
  place a person sees an IAM or security-group change before it applies, and a diff posted by the
  workflow is the change for the exact commit being merged. A pasted diff is the interim form.
- **Drift detection on demand, with its blind spots named.** Free, one command, and honest about
  the resource types it skips, so the diff review stays the guard for those.
- **The NAT image pinned in the stage config.** A deploy of the same commit must build the same
  network, a clean diff must mean nothing changes, and patching the NAT must be a chosen moment,
  because it interrupts outbound traffic. Finding a newer image is a documented command for now
  and a scheduled pull request later.
- **The validator's warning acknowledged on the instance, with the reason, and a test that nothing
  stays unacknowledged.** The rule is about portability across regions, which the region-pinned
  stack does not want; the acknowledgement records why, and the test keeps the gate's synth clean
  without hiding the next finding.
- **`architecture.md` as a living file with Mermaid diagrams.** A diagram describes the
  environment, not a task; text diagrams are reviewed in pull requests like code and rendered by
  GitHub.
- **A `create*Stack` layer under the `synthesize*` fixtures, and a `read*` fixture for the
  validation report.** Termination protection and validation findings are not template
  properties; the fixtures expose the stack and the assembly without changing what the existing
  70 tests see.
- **The flag verified with `describe-stacks`, not with a `destroy` attempt.** A verification that
  can cause the failure it checks for is not a verification.
- **The README restructured around what a person does.** Bootstrap, the first deploy as a
  sequence, the routine deploy, the procedure, the tear-down with the protection step; the reasons
  live in the design docs.
