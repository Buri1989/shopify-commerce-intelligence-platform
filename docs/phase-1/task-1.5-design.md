# Task 1.5 — GitHub Actions CI/CD: Design

**Date:** 2026-10-24
**Branch:** `feat/task-1.5-github-actions-ci-cd`
**Status:** designed, not built.
**Spec:** `docs/Boris-ing.md`, section 3, Task 1.5 (lines 238–265); deliverables and acceptance
criteria at lines 267–285.

This document records what was decided for Task 1.5 and why. A builder should be able to implement
from it without going back to the author. Every decision in it was taken by Boris in chat and is
marked **(Boris)**; the alternatives he rejected are given with each. The mechanical details left
open on purpose are listed in §7, and every file is shown in chat before it is written.

---

## 1. Intent

Until now a deploy is a person at a laptop: build the image, push it, read `cdk diff`, run
`cdk deploy`, answer the prompt. Task 1.5 moves that into GitHub Actions. A pull request runs every
check and shows the infrastructure diff before anyone merges; a merge to `main` builds the image,
tags it with the commit SHA, pushes it, deploys all stacks, checks the API from the outside and
reports. No AWS key is stored anywhere: each run proves who it is to AWS with GitHub's OIDC token
and gets credentials that expire within the hour. A rollback is the same deploy with an older tag,
started from a button.

The AWS side of that login, the identity provider entry and two IAM roles, is CDK code in a fourth
stack. It is the one stack deployed by hand once, because the workflows cannot log in until it
exists. After that the pipeline deploys everything, including itself.

The companion `task-1.5-questions.md` answers the general questions for GitHub Actions with OIDC as
the technology decision and records the rollback demonstration.

## 2. Goals, non-goals, anti-goals

**Goals**

- Every requirement of the spec's two workflows traced to a job or step (§4.1).
- A merge to `main` deploys with no manual step, and the run says what happened (§4.5).
- A pull request shows `cdk diff` against the deployed stacks, computed with the tag `main` runs,
  as one comment kept current (§4.4).
- No long-lived credential anywhere: OIDC, two roles, trust rules narrowed to this repository and
  to pull requests or `main` respectively (§4.2, §4.3).
- A rollback demonstrated through the pipeline, both ways (§4.6).
- The stack tested like the others; the workflow files guarded by a test of our rules; the pull
  request that adds them run for real (§4.7).
- The README's "(until 1.5)" steps gone; `architecture.md` showing the pipeline (§4.10).

**Non-goals** (later)

- A scheduled job that opens a pull request when a newer NAT image exists (1.4 §4.9 follow-up).
- Version numbers or git tags for releases: when a second environment exists.
- GitHub environments and deployment approvals: with a second environment.
- Narrowing CloudFormation's execution role: Phase 6 hardening.
- ARM runners, external notifications, the CDK CLI bump (its own pull request).

**Anti-goals**

- An AWS access key, in GitHub or anywhere else.
- A role whose trust rule does not name this repository and the event or branch.
- A workflow that writes files, formats code or changes the repository.
- An action referenced by a floating tag such as `@v4`.
- A deploy from a laptop as the normal path. The hand commands stay only for the first deploy into
  an empty account and for recovery.

## 3. Constraints

| Constraint | Value |
|---|---|
| Account, region, profile | As before: `eu-north-1`, `AWS_PROFILE=ci-admin` for the hand steps, no access keys |
| Environment | Three stacks deployed, `cdk diff` clean on 2026-10-22; the service runs image tag `f62256b…`; `main` is `c5173f9`, for which no image exists yet |
| Repository | `Buri1989/shopify-commerce-intelligence-platform`, private; Boris is the only committer |
| GitHub plan | Unknown at design time. Decides whether branch protection is available (§4.8) |
| Runners | GitHub-hosted `ubuntu-latest`, Intel. ARM images are built under emulation (1.3 §3) |
| CDK | `aws-cdk-lib` 2.273.0, CLI 2.1145.0, unchanged in this task. Bootstrap qualifier `hnb659fds` |
| Decided earlier, not reopened | ARM images tagged with the git SHA; `cdk deploy --all -c imageTag=<sha>`; `--require-approval never`; the pull request carries the diff through a read-only role; role ARNs reach workflows as GitHub variables (1.3 §4.2, 1.4 §4.3, §4.4) |
| Process | TDD, every file shown before it is written, decisions one at a time |

## 4. Decisions

### 4.1 The spec traced

Pull request workflow (spec lines 242–250):

| Requirement | Where |
|---|---|
| Install dependencies | `npm ci` in the app and infra jobs |
| Run linting | `npm run lint`, `npm run infra:lint` |
| Run TypeScript type checking | `npm run typecheck` (new, §4.9), `npm run infra:typecheck` |
| Run automated tests | `npm test`, `npm run test:e2e`, `npm run infra:test` |
| Build the application | `npm run build` |
| Validate the Docker build | the docker job: `docker build` for the runner's architecture |
| Validate infrastructure definitions | `npm run infra:synth`, plus `cdk diff` posted on the pull request |

Deployment workflow (spec lines 252–263):

| Step | Where |
|---|---|
| 1. Build the application | the shared checks, then the Docker build stage compiles it |
| 2. Create a Docker image | `docker buildx build --platform linux/arm64` |
| 3. Tag the image with the Git commit SHA | `<registry>/commerce-intelligence-dev:${{ github.sha }}` |
| 4. Authenticate with AWS through GitHub OIDC | `aws-actions/configure-aws-credentials` with the deploy role |
| 5. Push the image to ECR | `docker buildx build --push` after `aws-actions/amazon-ecr-login` |
| 6. Deploy the application to ECS | `npm run deploy -- --all --require-approval never -c imageTag=<sha>` |
| 7. Wait for deployment health checks | CloudFormation waits for the service; then `/health` and `/ready` over HTTPS |
| 8. Report deployment success or failure | the run's status and a written summary on the run page |

Rollback (line 265): §4.6. Acceptance criterion (lines 279–285): a merge deploys without
intervention; a failure is diagnosed from the run summary, CloudFormation events and the logs.

### 4.2 The delivery stack

**(Boris, option a)** A fourth stack, `commerce-intelligence-dev-delivery`, holding the GitHub OIDC
provider and the two roles, with the role ARNs as outputs. Termination protection on, like the
other long-lived stacks: nothing runs on it, but without it no pipeline run can log in.

What the provider is: an entry in the account saying "tokens issued by
`token.actions.githubusercontent.com` are accepted once their signature is verified", with the
audience `sts.amazonaws.com`. It is one per account. A second stage in the same account would
import it rather than create it; that is noted here and not built. The construct is CDK's
`OidcProviderNative`, a plain `AWS::IAM::OIDCProvider` resource; the older `OpenIdConnectProvider`
deploys a Lambda to fetch certificate thumbprints, which AWS no longer needs for GitHub.

The repository name is a fact of the deployment, so it joins the stage config as
`githubRepository: 'Buri1989/shopify-commerce-intelligence-platform'` (1.4 §4.3: resource
identifiers are configuration; code names no account).

The stack reads the repository ARN from the registry stack to grant push, a weak reference like
the others. It depends on nothing else and nothing depends on it. `bin/app.ts` creates it after the
registry stack.

Rejected **(b)**: inside the registry stack. The registry's one job is a repository that outlives
everything; a trust-policy change would redeploy the stack holding it, and the provider is
account-wide while the registry is per stage. Rejected **(c)**: inside the network stack, same
problem and a deploy that can replace the NAT. Rejected **(d)**: by hand or CLI, breaking general
rule 1 and leaving the one piece that grants GitHub access to AWS outside git.

### 4.3 The two roles

**(Boris, option a)** Narrow roles that work through the bootstrap roles, exactly as the laptop
does today; the administrator nature of CloudFormation's execution role documented, not changed.

| Role | Trust: accept a GitHub token only when | May do |
|---|---|---|
| `commerce-intelligence-dev-github-pull-request` | `aud` is `sts.amazonaws.com` and `sub` is exactly `repo:Buri1989/shopify-commerce-intelligence-platform:pull_request` | `sts:AssumeRole` on the bootstrap **lookup** role. Nothing else |
| `commerce-intelligence-dev-github-deploy` | `aud` is `sts.amazonaws.com` and `sub` is exactly `repo:Buri1989/shopify-commerce-intelligence-platform:ref:refs/heads/main` | `sts:AssumeRole` on the bootstrap **deploy**, **file-publishing** and **lookup** roles; pull and push on the project repository (`grantPullPush`: buildx reads existing manifests while pushing) |

The bootstrap role ARNs are built from the stack's account token, the region and the default
qualifier: `arn:<partition>:iam::<account>:role/cdk-hnb659fds-<kind>-role-<account>-<region>`. No
literal account appears. The image-publishing role is left out: the app has no CDK Docker assets;
the image goes to our repository through the role's own permission. Both conditions use
`StringEquals`, so no wildcard widens them; a test asserts the exact strings (§4.7).

**The fact written down.** `cdk deploy` hands the work to CloudFormation, which creates resources
with the bootstrap execution role, `AdministratorAccess` by default. So a template that reaches
`cdk deploy` on `main` can change anything in the account, the delivery stack's own roles
included. The narrow roles limit what a job can do directly with the CLI; what it can do through a
template is everything. The guards are the ones already decided: only `main` gets the deploy role,
`main` changes only through a pull request (§4.8), and the pull request shows the diff with IAM
changes marked (1.4 §4.4). CloudTrail records every call under the role's session name, which
carries the repository and run. Narrowing the execution role with a custom
`--cloudformation-execution-policies` at bootstrap is Phase 6.

Rejected **(b)**: re-bootstrap now with a custom execution policy limited to the services in use.
Real production practice, but the policy grows with every phase, RDS next, then KMS, Secrets
Manager, SQS, EventBridge, and a missing permission fails a deploy halfway with a rollback.
Rejected **(c)**: give the deploy role `AdministratorAccess` directly and skip the bootstrap roles;
then every CLI step is an administrator, not only the template.

### 4.4 The pull request workflow

File `.github/workflows/pull-request.yml`, on `pull_request` against `main`. Four jobs on four
machines, in parallel; the pull request is green when all are.

**Layout (Boris, 3a: parallel jobs).** The app and infra gates live in a shared file,
`.github/workflows/checks.yml`, declared `on: workflow_call` so both workflows run the same checks
from one definition (§4.5). The pull request workflow calls it and adds two jobs of its own:

| Job | Steps |
|---|---|
| `app` (shared) | checkout; `setup-node` from `.nvmrc` with the npm cache; `npm ci`; `npm run lint`; `npm run typecheck`; `npm run format:check`; `npm test`; `npm run test:e2e`; `npm run build` |
| `infra` (shared) | checkout; node; `npm ci` in `infra/`; `npm run infra:test`; `infra:typecheck`; `infra:lint`; `infra:format:check`; `infra:synth` |
| `diff` | checkout; node; `npm ci` in `infra/`; log in to AWS with the pull request role; `cdk diff --method template --fail-on never -c imageTag=<main's head SHA>`; post the comment |
| `docker` | checkout; `docker build .` for the runner's own architecture, no push |

Runs for the same pull request wait in line, like deploys (§4.5): `concurrency` keyed by the pull
request number with `cancel-in-progress: false`. Nothing is ever cancelled **(Boris, 4d applied to
pull requests)**.

**The diff's tag (Boris, 3b: `main`'s commit).** The deployed service runs the image of `main`'s
latest successfully deployed commit. Computing the diff with `main`'s head as the tag makes a pull
request that touches no infrastructure show an empty diff, and one that does show only that change.
If the last deploy of `main` failed, or has not happened yet, the diff shows the tag difference,
which is true and worth seeing: until this task's first automatic deploy, every diff will show the
app stack moving from `f62256b…` to `main`'s head, because 1.4 deployed no new image.
Rejected: the pull request's own commit, an image that does not exist yet and a noise line on
every pull request; the placeholder `gate`, the same noise, constant.

`--method template` compares the synthesized templates with the deployed ones through the lookup
role, which is all the pull request role may assume; the default method tries to create a change
set through the deploy role first and would fail before falling back. `--fail-on never` keeps the
job green when there are differences, because the diff is information for the reviewer, not a
check. The CDK CLI writes the diff to stderr; the step captures both streams into a file.

**Posting (Boris, 3c: one comment, updated in place).** A step using `actions/github-script` looks
for the job's earlier comment by a hidden marker, edits it if found, creates it otherwise. The
comment carries the commit it was computed for and the tag used. GitHub caps a comment at 65,536
characters; a longer diff is cut with a line saying so and pointing at the run log. This job alone
has `pull-requests: write`. Rejected: a new comment per push, a pile the reviewer misreads; the run
summary only, two clicks away from the merge button.

**The Docker check (Boris, 3d: the runner's architecture).** `docker build .` on Intel, about two
minutes, proves the Dockerfile works: dependencies install, the app compiles, the production image
assembles. The ARM image is built by the deploy workflow before anything reaches ECS; the one
thing an emulated build would catch sooner is a native dependency failing on ARM, which the app
does not have, and the deploy workflow's build fails on it with nothing deployed. Rejected: the
emulated ARM build on every push, five to ten minutes you wait for; both, the longest wait of all.

Permissions: `contents: read` at the top of every workflow; `id-token: write` only on jobs that
log in to AWS; `pull-requests: write` only on `diff`. The pull request workflow never references
the deploy role's variable.

### 4.5 The deploy workflow

File `.github/workflows/deploy.yml`, on `push` to `main` and on `workflow_dispatch` with one
required input, `imageTag` (§4.6). Jobs run in sequence: `checks`, `build`, `deploy`.

**Checks first (Boris, 4a).** The merge commit GitHub creates is your branch plus whatever landed
on `main` meanwhile; the pull request tested the branch, not the merge. The workflow calls
`checks.yml` before building, about three minutes against a twenty-minute deploy. A broken merge is
found in minute three with nothing touched, instead of by the circuit breaker twenty minutes later.
Rejected: trusting the pull request's result.

**Build and push.** `docker/setup-qemu-action` and `docker/setup-buildx-action`, then
`docker/build-push-action` with `platforms: linux/arm64`, `push: true`, the tag
`<registry>/commerce-intelligence-dev:${{ github.sha }}`, `provenance: false` so ECR receives a
plain single-platform image rather than an attestation index that ECS cannot pull, and
**(Boris, 4e)** `cache-from: type=gha` with `cache-to: type=gha,mode=max`. The npm install layer
is the slow part under emulation; when `package-lock.json` is unchanged the layer is reused and
the build drops from about eight minutes to about two. A stale or missing cache means a slower
build, never a different one: Docker keys layers by content. Rejected: no cache, six minutes per
deploy for nothing. The registry host comes from the ECR login step's output; the repository name
is written once at the top of the workflow as the project-stage name.

**Deploy.** `npm run deploy -- --all --require-approval never --progress events
-c imageTag=${{ github.sha }}` in `infra/`, after logging in with the deploy role. `--all` now
covers four stacks; the delivery stack normally reports no changes. `--progress events` prints
CloudFormation events as lines, which is what a log without a terminal can show.

**Health (Boris, 4b: the public API).** CloudFormation already waits for the service to stabilise,
and the circuit breaker rolls back a task definition whose tasks never pass the health check,
which fails the stack update and the job. On top of that the workflow calls
`https://api.commerce-intelligence.click/health` and `/ready` and requires 200 from both, with a
short retry (six attempts, ten seconds apart) for the moment the new task is registering. That
checks what a user sees, DNS, certificate, balancer, task, and needs no AWS permission. The URL is
the `ApiUrl` stack output, read from `cdk deploy --outputs-file`. Rejected: `aws ecs wait
services-stable`, the question CloudFormation already answered plus a permission; nothing extra,
which proves the stack updated and not that the API answers.

**Report (Boris, 4c: GitHub's status plus a written summary).** Every run is green or red on the
commit and in the Actions tab, and GitHub emails the committer when a run on `main` fails. The
last step writes the summary GitHub shows at the top of the run: the commit, the image tag,
whether it was a push or a rollback, each stack's result, the two health responses, and links to
the CloudFormation console and the log group. Rejected: a GitHub deployment record, which needs a
GitHub environment and couples the trust rule to it, worth it with a second environment; an
external notification, a service to keep alive for one reader GitHub already emails.

**One at a time (Boris, 4d: wait in line).** `concurrency: { group: deploy-dev,
cancel-in-progress: false }`. Two merges close together produce two runs; the second waits for the
first and then deploys, so both land in order. Rejected: cancelling the older run, which stops the
job but not the CloudFormation update it started, so the newer run collides anyway; nothing, a red
run and a manual re-run for a normal event.

### 4.6 Rollback

**(Boris, option a)** The deploy workflow's `workflow_dispatch` trigger with one input, `imageTag`.
Started from the Actions tab on `main`, so the deploy role accepts it. The run skips `checks` and
`build`, because nothing new is built and the image was checked when it was first deployed, and
goes straight to `deploy` with the given tag, then the health calls and the summary, which says
"rollback to <tag>". About five minutes. The rollback buys time; the fix is a normal pull request
afterwards, and until it merges the pull request diff shows that `main` and the running image
differ, which is the honest state.

The demonstration, once the workflows are live: the merge of this task's pull request deploys the
merge commit's image; then the button with the previous tag, `f62256b…`, watched to a healthy
service answering from the old image; then the button again with the new tag. Both run URLs and
the timings go into `task-1.5-questions.md`. The circuit breaker remains the automatic rollback for
an image that never becomes healthy, demonstrated in 1.3.

Rejected **(b)**: a revert pull request as the rollback. It is the fix, not the rollback: twenty
minutes and a new image when a tested one is in the repository. Rejected **(c)**: from the laptop,
outside the pipeline the spec requires, needing a login at the worst moment.

### 4.7 Tests

**The delivery stack**, with CDK assertions in the style of the other stacks, fixtures
`create-delivery-stack.ts` and `synthesize-delivery-stack.ts` under `infra/test/`:

| Spec | Behaviour |
|---|---|
| `stage-config.spec.ts` | `dev` names the GitHub repository |
| `create-github-oidc-provider.spec.ts` | one `AWS::IAM::OIDCProvider` with GitHub's URL and the `sts.amazonaws.com` audience |
| `create-pull-request-role.spec.ts` | trusts the provider for `sts:AssumeRoleWithWebIdentity` with `StringEquals` on the audience and the exact `pull_request` subject; one policy statement: `sts:AssumeRole` on the lookup role ARN built from the account token |
| `create-deploy-role.spec.ts` | the exact `ref:refs/heads/main` subject; `sts:AssumeRole` on the deploy, file-publishing and lookup role ARNs and no other role; pull and push on the repository and `GetAuthorizationToken`; nothing else |
| `delivery-stack.spec.ts` | two roles and one provider, no other resource types; outputs `PullRequestRoleArn` and `DeployRoleArn`; termination protection on; project tags |

**The workflow files**, with a rules test **(Boris, 6a)** at `.github/workflows/workflows.spec.ts`,
next to its subject as the convention says, run by the root `npm test`, parsing the three files
with the `yaml` package (new dev dependency). Written red before each workflow file. The rules:

- every `uses:` is pinned to a 40-character commit SHA, with the version in a trailing comment;
- every workflow declares `permissions` at the top with `contents: read`; `id-token: write` appears
  only on jobs that log in to AWS; `pull-requests: write` only on the `diff` job; nothing else;
- `deploy.yml` triggers on `push` to `main` and `workflow_dispatch` with the `imageTag` input, and
  on nothing else; `pull-request.yml` triggers on `pull_request` only; `checks.yml` on
  `workflow_call` only;
- `pull-request.yml` never references `AWS_DEPLOY_ROLE_ARN`;
- `deploy.yml` and `pull-request.yml` each have a `concurrency` group with
  `cancel-in-progress: false`;
- `setup-node` steps read `.nvmrc`.

The root `lint` and `format` scripts gain `.github/` so the spec is linted and formatted like the
rest. The pull request that adds the workflows is their live run: the pull request workflow runs
on itself and proves the read-only role; the merge proves the deploy role. Rejected: no test, a
green run proves today's run and not the rules a later edit can break unnoticed; actionlint, which
checks spelling, not our rules, and lives outside npm.

**Not automated:** that AWS refuses a token from another repository or branch. The trust policy's
exact strings are asserted; the refusal is AWS's and is exercised by nothing in this task.

### 4.8 Putting it live

**(Boris, 7a)** The order, and three repository variables:

1. Build the delivery stack test-first on the branch. Boris deploys it once from the laptop:
   `AWS_PROFILE=ci-admin npm run deploy -- commerce-intelligence-dev-delivery -c imageTag=<deployed sha>`.
   The outputs print the two role ARNs. `cdk diff` is clean after.
2. Boris sets three variables in the repository's Actions settings: `AWS_PULL_REQUEST_ROLE_ARN`,
   `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`. Variables, not secrets: an ARN is a name, and the region is
   configuration. The workflow files name nothing about the account; a clone deploys elsewhere by
   changing three settings and no file (1.4 §4.3). Rejected: the region written into the workflow
   files, a second copy of a value the stage config already pins.
3. Build the workflows test-first on the branch. Pushing and opening the pull request runs the pull
   request workflow on itself. The diff comment appears.
4. Merging runs the deploy workflow for the first time.
5. The rollback demonstration (§4.6), then the documentation.

**Branch protection (Boris, 7b: option a).** A setting on `main`, applied by hand once after the
pull request workflow has run so GitHub knows the check names: require the `app`, `infra`, `diff`
and `docker` checks to pass, forbid direct pushes. Not required: the branch being up to date with
`main`, because §4.5 re-runs the checks on the merge commit, and Boris works one pull request at a
time, so `main` rarely moves under an open branch; a review approval, because a single committer
cannot approve their own pull request.

**Open:** GitHub offers branch protection on private repositories only on paid plans. The plan is
checked with `gh` when Boris says so. If it is not available, the choices are to make the repository
public, which would also give free ARM runners and reopen the 1.4 statement that documents may name
the account because the repository is private; to take GitHub Pro; or to document the rule without
enforcing it, relying on the fact that only Boris can push. That decision is his and is recorded
here when taken.

### 4.9 Housekeeping

**(Boris, 8a, 8b)** Three scripts in the root `package.json`: `typecheck` (`tsc --noEmit`),
`format:check` (`prettier --check` over the app's files) and `infra:format:check`. CI runs the
check variants; `format` and `infra:format`, which write, stay the local commands, and `infra:check`
stays the local gate. The workflows name the individual scripts step by step so a failure is one
named line in the run; the README's checks section lists the new scripts. Rejected for formatting:
running `format` in CI and failing on a dirty tree, the same result by a trick with a worse message.

**(Boris, 8c)** The CDK CLI stays at 2.1145.0. The bump to 2.1146.0 is its own small pull request
later, so the first real runs of the pipeline have one possible cause for any surprise.

**(Boris)** No version numbers or release tags: every merge is a release named by its SHA, which
the spec requires anyway. A real version, chosen by hand and tagged, comes with a second
environment, when "which version is where" becomes a question. Rejected: an automatic run number,
unique and meaningless, needing write access to the repository; a semantic version bumped in every
pull request, where a forgotten bump breaks the deploy on the duplicate tag.

### 4.10 Documentation

- README: status line; the delivery stack in the stacks table (no cost); "Deploying" rewritten
  around the pipeline: a merge deploys, the button rolls back, the hand commands kept only under
  "The first deploy into an empty account" (network, registry, delivery, then the first merge) and
  "Recovery"; the "(until 1.5)" steps removed from the review-and-apply procedure; the three
  variables and the branch-protection setting under a "GitHub setup" heading; the checks section
  with the new scripts.
- `docs/phase-1/architecture.md`: §3 "The delivery path" redrawn as the pipeline: GitHub, the two
  workflows, the two roles, ECR, CloudFormation, the four stacks, the health call from outside;
  §4 gains the delivery stack row; the "Last updated" line.
- `CLAUDE.md`, "Conventions from Task 1.5": workflows call npm scripts and never raw commands;
  actions pinned to a commit SHA with the version as a comment; the rules test; the three variables;
  the delivery stack deployed by hand only the first time; `--method template` for diffs in CI.
- `docs/phase-1/task-1.4-design.md` §4.4 and the 1.3 design §4.14: a dated note that the
  workflows exist.
- `docs/phase-1/task-1.5-questions.md`: the seven general questions for GitHub Actions with OIDC;
  the rollback demonstration with run links; "Why we picked what we picked". The demonstration
  section can only be written after the merge, so it lands in a small follow-up pull request
  together with the README status line.

### 4.11 Cost

AWS: nothing. IAM roles and the OIDC provider are free; the deploy role's calls are free.

GitHub Actions, private repository: the Free plan includes 2,000 minutes a month, Pro 3,000;
Linux minutes count one for one, per job. Estimates, with the cache warm:

| Run | Jobs | About |
|---|---|---|
| Pull request push | app 3 min, infra 2, diff 2, docker 2 | 9 minutes |
| Deploy | app 3, infra 2, build 2 (8 cold), deploy 15 | 22 minutes (28 cold) |
| Rollback | deploy 5 | 5 minutes |

Ten pull request pushes and five merges a week come to about 1,000 minutes a month, inside the
Free allowance. The Docker layer cache uses GitHub's 10 GB per repository, evicted automatically.

## 5. Build order

One piece at a time. Each piece: show the failing test in chat → approval → write it → run it red →
show the implementation in chat → approval → write it → run it green → run the whole gate.

1. Branch (done); this document.
2. The three scripts of §4.9; the README checks section. Root gate green.
3. `githubRepository` in the stage config, spec first.
4. The delivery stack (§4.2, §4.3): fixtures, the provider, the two roles with their specs, the
   stack, `bin/app.ts`. `npm run infra:check` green. `npm run diff -- -c imageTag=<deployed sha>`
   read in chat: one new stack, the other three unchanged.
5. Boris deploys the delivery stack and sets the three variables (§4.8 steps 1–2). `cdk diff`
   clean. `describe-stacks` shows protection on.
6. The `yaml` dev dependency; the rules test, red; `checks.yml` and `pull-request.yml`; green;
   lint and format scopes widened to `.github/`; root gate. Push; open the pull request; the four
   jobs green; the diff comment present and showing the expected tag line.
7. The rules extended for `deploy.yml`, red; `deploy.yml`; green; push; the pull request green.
8. README, `architecture.md`, `CLAUDE.md`, the 1.3 and 1.4 notes; the questions doc without the
   demonstration section. Push.
9. Branch protection, if the plan allows (§4.8). Merge. The deploy workflow's first run: watched in
   chat; the summary read; `/health` from the new image; `npm run diff -- -c imageTag=<new sha>`
   clean.
10. The rollback demonstration (§4.6), both runs, recorded.
11. Follow-up pull request: the demonstration section, the README status line.

Commits happen when Boris says so.

## 6. Done when

- `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run format:check` and
  `npm run infra:check` pass locally with no AWS session.
- Four stacks deployed; `describe-stacks` shows protection on for network, registry and delivery,
  off for app; `cdk diff -c imageTag=<deployed sha>` reports no differences.
- A pull request shows the four green checks and one diff comment that follows the latest commit.
- A merge to `main` deployed with no manual step; the run summary names the commit, the tag, the
  stack results and two 200s.
- The rollback button deployed `f62256b…` and then the new tag again, both healthy, both recorded.
- No workflow references an action by tag, and the rules test says so.
- The three variables exist in GitHub; branch protection is on or its absence is recorded with
  the reason.
- README, `architecture.md` and `CLAUDE.md` describe the pipeline; the questions doc exists.

## 7. Left to the builder

- The exact `it` names, the YAML step names, the hidden marker text of the diff comment.
- The retry count and spacing of the health calls, within "a minute at most".
- Job `timeout-minutes` values.
- The wording of the run summary and the README sections.
- Whether the bootstrap role ARNs are built in one small module (`bootstrap-roles.ts`) or inside
  the deploy role's file; one module if both roles need the lookup ARN, which they do.
