# Task 1.4 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Task 1.4 has no
question list of its own: it has seven requirements, and the general rules ask their seven
questions of the decision. The decision is CloudFormation through CDK, as the way the
infrastructure is described and as the record of what is deployed. Task 1.2 argued CDK over
Terraform as the language to write in; this document is about where the record is kept and how a
change is made. Verified 2026-10-22. Alternatives and trade-offs are in `task-1.4-design.md`.

## 1. CloudFormation through CDK, the seven questions

- **What problem does it solve?** Describe the infrastructure in code that is type-checked, tested
  and reviewed, and keep a record of what that code produced, so that the next change is applied
  as a difference against what is already there. CDK, the library we write the infrastructure
  in, is the first half: TypeScript that produces a template, the description of every resource.
  CloudFormation, the AWS service that reads the template, makes the resources and keeps the
  record of what it made, is the second half. The record lives in the service, not in a file we
  hold.
- **Why did we choose it?** There is nothing to protect. The state, the record of what is
  deployed, is kept by CloudFormation itself: no storage bucket for it, no lock table, no file
  that can be corrupted. CloudFormation refuses a second update while one is running, rolls a
  failed update back by itself, and on demand compares its record with the resources as they
  really are.
- **What alternatives did we consider?** Terraform, which keeps its state in an S3 bucket with a
  DynamoDB table as the lock; it was declined in Task 1.2. Pulumi, which brings its own state
  service and a second runtime. Raw CloudFormation templates written by hand: the same state, but
  no types and no tests. CDK Pipelines, which deploys through CodePipeline; the spec asks for
  GitHub Actions.
- **What are its limitations?** Feedback is slow: minutes for each change set, the preview of an
  update, and minutes for the update itself. New AWS features reach it late. A template may hold
  at most 500 resources and 1 MB. The diff compares templates only, so it is blind to settings of
  the stack itself, such as termination protection. A value that is only known at deploy time
  makes two deploys of one commit differ. Weak references, where a stack reads another stack's
  values without CloudFormation tying the two together, drop the guard against deleting something
  another stack reads. Drift detection skips some resource types, our stand-alone security-group
  rules among them.
- **When would we choose differently?** Several clouds: Terraform. Rules enforced across hundreds
  of stacks: Terraform's policy tools, or cdk-nag through the `Validations` hook we already use.
  Dozens of accounts: CDK stages with a pipeline construct.
- **What could go wrong in production?** A rollback that fails leaves the stack in
  `UPDATE_ROLLBACK_FAILED`, and a person has to step in. Deleting a stack that another stack
  reads leaves `DELETE_FAILED` with the service down; termination protection guards against it. A
  replacement of a resource hiding inside an unrelated change: catching it is the reviewer's job.
  A change made in the console drifts the stack away from its record: the drift step finds it.
  The bootstrap, the resources the CDK command line needs in the account, falls behind the CDK
  version: run `cdk bootstrap` again.
- **How does it behave under increased load?** It is not on the request path; users never touch
  it. One update per stack at a time, so the app stack, which changes on every release, is kept
  apart from the stacks that rarely change. A second service would get its own stack.

## 2. How is a deployment repeated from zero?

A deployment is repeatable when everything it needs is in code, so anyone with access can rebuild
the same environment with the same commands. It must not depend on one person's laptop, on steps
done by hand, or on values looked up at the time.

In this project: a clean clone, `npm ci` in both packages, the SSO profile, the short-lived login through AWS's
single sign-on, then the README's sequence: bootstrap, the network and registry stacks, the image
push, the app stack. Everything the stacks need is in the repository or in the stage config.
Nothing is looked up with credentials when the templates are produced, so the `cdk synth` of the
gate equals the one of the deploy.

Not repeatable from the repository: the domain and its hosted zone, bought by hand (a new account
changes two config values), and the bootstrap stack, made by the CDK command line. The NAT image
was "latest" until this task; it is pinned now.

## 3. How is the state kept safe?

The state is the record of what a tool has deployed. If it is lost or wrong, the tool no longer
knows what it owns. So it must live in one protected place, with access rules, and with a guard so
that two updates cannot run at once.

Ours is CloudFormation's record inside the account, protected by IAM, AWS's permission
system. Nothing on a laptop or in the repository holds it. `cdk.context.json`, the file where CDK
caches looked-up values, never exists, because nothing is looked up.

Added in this task: termination protection on the network and registry stacks, a flag that makes
CloudFormation refuse to delete the stack; the app stack stays deletable because it comes back in
twenty minutes. The flag is verified by reading it with `describe-stacks`, not by trying a
`destroy`. Drift detection, `npm run drift`, asks CloudFormation to compare its record with the
real resources; it runs before a planned change and after work in the console. On 2026-10-22
there was no drift, and the 20 resources it cannot check are named in the README.

The gap we chose: with weak references, CloudFormation will not block a change to the network
stack that the app stack uses. The diff review replaces that guard; a change to the network stack
is read twice.

## 4. What separates infrastructure configuration from application configuration?

Infrastructure configuration describes the environment: the network, the sizes, the region. It
changes rarely and is applied by a deploy. Application configuration describes how the app behaves:
ports, log levels, connection details. It reaches the app when the app starts. Keeping them apart
lets each change on its own, and it stops the app from depending on how it is hosted.

In this project they are two packages that never import each other. `infra/` has its own dependencies and its own gate,
and the Docker build leaves it out. Infrastructure configuration is the typed `StageConfig`:
region, zones, sizes, the pinned image, the hosted zone. Application configuration is the
environment variables that `env.schema.ts` validates when the app starts. The one bridge is the
task definition, where the config value `applicationPort` becomes the environment variable
`PORT`.

One pair of values crosses on purpose and is written on both sides: the balancer's idle timeout
of 60 seconds and the app's keep-alive of 65 seconds.

## 5. What counts as a secret?

Credentials: keys, tokens, passwords, private keys. Never in code, config, documents, workflows
or commits. None exist in the repository; SSO hands out credentials that expire after a short
time, and Task 1.5 uses OIDC, a token GitHub signs for each run.

Not secrets: the account id, the hosted zone id, the region, the host name. The code never names
the account; documents may name the deployment. The Task 1.2 anti-goal on the account id was
revised openly, not quietly broken.

Later secrets: created by AWS in Secrets Manager and referenced by their ARN, AWS's name for a
resource. Never a stage config value, never a literal in the environment. CDK's
`checkSecretUsage` flag fails the synth if a secret would be written into the template in plain
text.

## 6. How is the deployment process documented?

Good deployment documents say what to run, what is running and why it is that way, each in one
place, and they change together with the code.

In this project, the README: the commands, from setup to tear-down. `docs/architecture.md`: the picture of what
runs, kept current by every task. The design docs: the reasons. The README carries steps and
pointers only.

## 7. How are infrastructure changes reviewed and applied?

Plan on the pull request, apply on merge. The branch passes the infra gate; the pull request
shows `cdk diff`, the list of what the deploy would change (pasted by hand until Task 1.5 posts
it). The reviewer looks twice at IAM permissions, security groups, replacements of resources, and
anything in the network stack. The merge deploys what was reviewed, with no interactive approval.
A diff run after the deploy is clean. Drift detection runs before the next change.

The worked example: the first diff, with no code change at all, marked the NAT instance for
replacement, because Amazon had published a new machine image and the template said "latest".
The image was pinned instead; the deploy changed the protection flag and nothing that runs.

## Why we picked what we picked

- **CloudFormation as the state store.** Nothing to protect, a second update refused while one
  runs, rollback and drift detection built in. Question 1 says why the alternatives lost.
- **Termination protection on the network and registry stacks, not on the app stack.** The two
  stacks whose loss is an outage get the guard; the one that is removed on purpose stays easy to
  remove.
- **The account id in documents, never in code or config.** AWS calls it an identifier, not a
  secret, and the git history holds it anyway. What matters is that credentials stay out and that
  the code works in any account.
- **The pull request carries the diff.** It is the last place a person sees a permission or
  security-group change before it is applied.
- **Drift detection on demand, with its blind spots named.** Free, one command, and honest about
  what it skips.
- **The NAT image pinned.** Same commit, same network; a clean diff then means nothing changes;
  patching the image is a chosen moment, not a surprise.
- **The validator warning acknowledged with a reason, and a test that no warning stays
  unacknowledged.** The rule behind the warning is about portability between regions, which a
  stack pinned to one region does not want.
- **`architecture.md` with Mermaid drawings.** It describes the environment, is reviewed like
  code, and GitHub renders the drawings.
- **`create*Stack` under `synthesize*`, and `read*` for the validation report.** Termination
  protection and validation findings are not properties in the template, so the test helpers
  read them from the stack and from the report instead.
- **The flag verified with `describe-stacks`.** A check that can cause the very failure it checks
  for is not a check.
- **The README written around what a person does.** Steps only; the reasons live in the design
  docs.
