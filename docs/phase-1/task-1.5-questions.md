# Task 1.5 — Questions to investigate

Task 1.5 has no question list of its own; it has two workflows to build, a rollback to demonstrate,
and the general rules' seven questions for every major technology decision. The decision here is
GitHub Actions with OIDC: the workflows run on GitHub's machines and prove who they are to AWS with
a short-lived token instead of a stored key. Answers reflect what was built and run on 2026-10-24.
The alternatives in full are in `task-1.5-design.md`. The rollback demonstration is recorded in §5
after the merge, in the follow-up pull request.

## 1. GitHub Actions with OIDC, the seven questions

**What problem does it solve?** Two problems. A deploy was a person at a laptop with an
administrator profile; now a merge to `main` is the deploy, and what deploys is what the pull
request reviewed. And the workflows needed a way into AWS: a stored access key would be a long-lived
secret in GitHub, which general rule 3 forbids. With OIDC, GitHub signs a token for each run that
says which repository, event or branch is running; AWS verifies the signature against the provider
registered in the account, compares the token's audience and subject with the role's trust rule,
and hands out credentials that expire within the hour. Nothing is stored anywhere.

**Why did we choose it?** The spec requires GitHub Actions (rule 2), and OIDC is the one way to log
in from it that meets rule 3 without inventing a key-rotation process. The rest of the shape was
already decided in 1.3 and 1.4: images tagged with the commit SHA, `cdk deploy --all` with the tag
as the one argument, the diff on the pull request through a read-only role.

**What alternatives did we consider?** An IAM user with an access key in GitHub secrets: rule 3,
and a key that lives until someone remembers to rotate it. CDK Pipelines or CodePipeline: AWS-native,
but the spec names GitHub Actions and the pipeline definition would live in a second place. One
administrator role for every run instead of two narrow ones: simpler, and a pull request from any
branch could deploy. GitHub environments with required reviewers: the right tool with a second
environment, overhead with one.

**What are its limitations?** The token's subject is a string GitHub defines and can change: the
first live run of this task was refused because repositories created after July 15, 2026 carry the
owner and repository ids in the subject (§2). A workflow cannot answer a prompt, so CDK's approval
prompt is replaced by the pull request's diff and the branch rule. GitHub's runners are Intel; the
ARM image is built under emulation and is slow without the layer cache. A private repository has a
monthly minutes allowance, 2,000 on the Free plan. The narrow roles limit what the CLI may do
directly; what a template may do once it reaches CloudFormation is whatever the bootstrap execution
role allows, which is administrator by default (design §4.3).

**When would we choose differently?** Several environments: GitHub environments with required
reviewers and one role per environment. Many repositories deploying into one account: one trust
pattern at the organization level and a role per team. A regulated setup where build traffic may
not leave the network: a self-hosted runner in the VPC. A monorepo with many services: path filters
and a build matrix.

**What could go wrong in production?** A merge that breaks the deploy: CloudFormation rolls the
stack back, the run is red, GitHub emails the committer, the summary links the stack events and the
log group; the fix is a pull request, or the rollback button meanwhile. Two merges close together:
the second run waits for the first; nothing is cancelled. GitHub unavailable: the README's recovery
procedure deploys from a laptop. The OIDC provider deleted by hand: every run fails to log in,
`cdk diff` shows the recreate, and the delivery stack is protected against deletion. The repository
renamed: the subject changes, runs are refused until the stage config is updated in a pull request,
which is the intended behaviour. A compromised pull request: its role can read templates and nothing
else.

**How would the system behave under increased load?** The load is merges, not requests. Deploys
serialise on one concurrency group, so ten merges an hour would queue for hours; the answer at that
point is batching merges or a faster deploy, not parallel deploys of one service. Pull request runs
scale with GitHub's runner pool; the two checks jobs, the diff and the Docker build already run on
four machines. The AWS side is free and unmetered: IAM, STS and CloudFormation calls.

## 2. How a run proves who it is, and what the first run taught

GitHub mints a token for a job that has `id-token: write`. The token carries the issuer
(`token.actions.githubusercontent.com`), the audience the action asked for (`sts.amazonaws.com`),
and the subject: the repository plus the event or branch. The action sends it to AWS STS with the
role to assume. The delivery stack's provider tells AWS to trust tokens from that issuer; each
role's trust rule accepts a token only when the audience and the subject match exactly
(`StringEquals`). The pull request role accepts `…:pull_request`, the deploy role
`…:ref:refs/heads/main`. The pull request role may then only assume the bootstrap lookup role; the
deploy role may assume the bootstrap deploy, file-publishing and lookup roles and pull and push on
the repository. The session name carries the run id, so CloudTrail ties every call to a run.

The first live run failed at the login: `Not authorized to perform sts:AssumeRoleWithWebIdentity`.
CloudTrail's event for the refused call shows the subject GitHub sent as the user name:
`repo:Buri1989@42779452/shopify-commerce-intelligence-platform@1422111906:pull_request`. GitHub's
API confirmed it (`use_immutable_subject: true`) and its docs explain it: repositories created
after July 15, 2026 use an immutable subject with the owner and repository ids, so a recycled name
can never match. The stage config now holds the repository exactly as the token writes it, the
trust rules stayed `StringEquals`, the stack was redeployed, and the next run logged in. The
lesson is recorded in the design (§4.3): the trust policy's strings are asserted by tests, and the
one thing a test cannot assert, what GitHub puts in the token, is proven by the live run.

## 3. What a pull request shows

Four checks: `checks / app` (lint, type-check, format, unit and e2e tests, build), `checks / infra`
(the infra gate), `docker` (the Dockerfile built for the runner's architecture) and `diff`. The
diff job logs in with the pull request role and runs `cdk diff --method template --fail-on never`
for all four stacks with the image tag `main` runs, so a pull request that touches no
infrastructure shows an empty diff. The result is one comment, edited on every push and never
duplicated, carrying the commit, the tag and a link to the run log; it is cut at 60,000 characters
with a note, under GitHub's limit. The first real comment on pull request #6 showed three stacks
with no differences and the app stack's image tag moving from `f62256b…` to `c5173f9…`, because
Task 1.4 never built an image for main's head; the first automatic deploy removes that line.

## 4. How a failed deployment is diagnosed

From the run outward. The run is red on the commit and in the Actions tab and GitHub emails the
committer. The run summary says which step failed, which stacks reported `✅` or `❌`, what the two
health calls answered, and links the CloudFormation console filtered to the project and the app
log group. CloudFormation's events for the app stack name the resource and the reason; a task
definition whose tasks never pass the health check trips the circuit breaker, which rolls the
service back and fails the update, so the stack ends in `UPDATE_ROLLBACK_COMPLETE` with the
previous image running. The task's own output is in `/commerce-intelligence/dev/app`. The two
health calls from outside separate "the stack updated" from "the API answers": a green deploy with
a red health check points at DNS, the certificate or the balancer rather than the task.

## 5. Rollback

Recorded after the merge, in the follow-up pull request: the two runs, their links and timings.

## 6. Cost

Nothing on the AWS side: the provider, the roles and their calls are free. On GitHub, a private
repository counts Linux minutes per job. Measured on the first runs: a pull request push about
two minutes of wall time on four machines, about six billed minutes; a deploy is estimated at
about 22 minutes with the layer cache warm and 28 cold; a rollback about five. The Free plan's
2,000 minutes a month hold ten pull request pushes and five merges a week with room to spare.

## Why we picked what we picked

Short reasons for each Task 1.5 decision. The alternatives and trade-offs in full are in
`task-1.5-design.md`.

- **A fourth stack for the provider and the roles.** Nothing runs on it, so a trust-policy change
  redeploys nothing that runs; the provider is account-wide while the registry is per stage; and the
  one piece that grants GitHub access to AWS stays in git.
- **Two narrow roles that work through the bootstrap roles.** A pull request may only read; `main`
  may deploy the way the laptop did. The administrator nature of CloudFormation's execution role is
  written down, not changed; narrowing it is Phase 6.
- **The immutable repository identity in the trust rules, with `StringEquals`.** What GitHub puts
  in the token, exactly; no wildcard over the ids; a rename is a deliberate pull request.
- **A shared `checks.yml` called by both workflows.** One definition of the gate; the merge commit
  is re-checked because the pull request tested the branch, not the merge.
- **Four parallel jobs on a pull request, the Docker build for the runner's architecture.** About
  two minutes of waiting; the ARM build happens once, on the deploy, before anything reaches ECS.
- **The diff computed with main's head as the tag, posted as one comment kept current.** An empty
  diff for a pull request that touches no infrastructure, and one place to read.
- **`--method template --fail-on never`.** The lookup role is all a pull request may assume, and
  the diff is for the reviewer, not a gate.
- **Checks before build before deploy; the button skips to deploy.** A broken merge fails in
  minute three with nothing touched; a rollback takes five minutes with an image that was already
  checked when it first shipped.
- **The layer cache on the ARM build.** The npm install layer is the slow part under emulation;
  a stale cache means a slower build, never a different one.
- **`provenance: false`.** ECR gets a plain single-platform image that ECS can pull, not an
  attestation index.
- **The public API checked from outside, six tries ten seconds apart.** It checks what a user
  sees, DNS to task, and needs no permission; CloudFormation already waited for the service.
- **GitHub's status plus a written summary.** Green or red on the commit, an email on a failed
  `main` run, and one page with the commit, the tag, the stacks, the responses and the links.
- **Deploys queue, nothing is cancelled.** Cancelling a run does not cancel the CloudFormation
  update it started.
- **The image-exists check before the deploy.** One `BatchGetImage` call fails a typo in the
  rollback tag in a second instead of ten minutes later through the circuit breaker.
- **Actions pinned to a commit SHA and a rules test over the workflow files.** A tag can be moved;
  a SHA cannot. The test keeps the rules a later edit could break unnoticed.
- **Role ARNs and the region as repository variables.** Names, not secrets; a clone deploys
  elsewhere by changing three settings and no file.
- **No version numbers.** Every merge is a release named by its SHA, which the spec requires
  anyway; a chosen version comes with a second environment.
- **The CDK CLI left at 2.1145.0.** The first real runs of the pipeline have one possible cause for
  any surprise; the bump is its own pull request.
