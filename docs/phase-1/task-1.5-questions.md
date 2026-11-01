# Task 1.5 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Task 1.5 has no
question list of its own: it asks for two workflows, a rollback to demonstrate, and the general
rules' seven questions. The decision is GitHub Actions with OIDC. GitHub Actions is GitHub's
service that runs scripts, called workflows, on GitHub's own machines when something happens in
the repository. OIDC is the way a workflow proves to AWS who it is: with a short-lived token that
GitHub signs for that one run, not with a stored key. Built and run 2026-10-24. Alternatives and
trade-offs are in `task-1.5-design.md`. The rollback is in §5.

## 1. GitHub Actions with OIDC, the seven questions

- **What problem does it solve?** Before this task, a deploy was a person at a laptop with an
  admin profile. Now a merge to `main` is the deploy, and what deploys is exactly what the pull
  request reviewed. The workflows need a way into AWS without a stored key. GitHub signs a token
  for every run that names the repository and the branch; AWS checks it against the identity
  provider we registered and against the role's trust rule, and hands out credentials that expire
  within the hour.
- **Why did we choose it?** The spec requires GitHub Actions, and OIDC is the one login that
  meets the rule of no long-lived keys without a process for rotating keys.
- **What alternatives did we consider?** An IAM user with a key stored in GitHub secrets:
  forbidden by the rules, and a key to rotate. CDK Pipelines or CodePipeline, AWS's own pipeline
  services: the spec names GitHub Actions. One admin role for every run: a pull request from any
  branch could then deploy. GitHub environments with reviewers, a feature that holds a deploy
  until a person approves it: right with two environments, overhead with one.
- **What are its limitations?** The token's subject, the string that says which repository and
  branch is asking, is GitHub's and its format can change (§2 tells what happened). No prompts:
  nothing can ask "are you sure?" during a run, so the diff on the pull request and the branch
  rule replace CDK's own approval prompt. The runners, GitHub's machines, are Intel, so the ARM
  image is built under emulation, slowly. A private repository has 2,000 minutes a month on the
  Free plan. The narrow roles limit what the command line may do, but a template may do whatever
  the bootstrap execution role allows, which is admin by default (design doc §4.3).
- **When would we choose differently?** Several environments: GitHub environments with
  reviewers, one role each. Many repositories deploying into one account: an organization-level
  trust pattern. A regulated network: a runner we host ourselves inside the VPC. A monorepo:
  path filters and a matrix of jobs.
- **What could go wrong in production?** A merge breaks the deploy: CloudFormation rolls back,
  the run is red, the committer gets an email; the fix is a new pull request or the rollback
  button. Two merges close together: the second waits for the first. GitHub is down: the
  README's laptop recovery. Someone deletes the identity provider by hand: every login fails,
  `cdk diff` shows that it would be recreated, and the delivery stack is protected against
  deletion. The repository is renamed: runs are refused until the stage config changes, as
  intended. A compromised pull request: its role can read templates and nothing else.
- **How does it behave under increased load?** The load is merges. Deploys run one at a time in
  one concurrency group, a queue GitHub keeps per name, so ten merges an hour would queue. The
  answer is batching merges or a faster deploy, not parallel deploys of one service. The AWS
  side of the calls is free.

## 2. How a run proves who it is, and what the first run taught

A job that declares `id-token: write` gets a token from GitHub. The token says who issued it,
`token.actions.githubusercontent.com`; who it is for, `sts.amazonaws.com`, the AWS login service;
and the subject, the repository plus the event or branch that started the run. The identity
provider in the delivery stack trusts that issuer. Each role has a trust rule, the condition
under which AWS lets a caller use the role; ours match the audience and the subject exactly, with
`StringEquals`. The pull request role accepts a subject ending in `…:pull_request`; the deploy
role accepts `…:ref:refs/heads/main`, a run from the `main` branch. The pull request role may
only take on the bootstrap lookup role, which reads. The deploy role may take on the deploy,
file-publishing and lookup roles, and pull and push images in ECR. The session name carries the
run id, so CloudTrail, AWS's log of who did what, shows which run made each call.

The first live run failed with `Not authorized to perform sts:AssumeRoleWithWebIdentity`.
CloudTrail showed the subject GitHub had sent:
`repo:Buri1989@42779452/shopify-commerce-intelligence-platform@1422111906:pull_request`.
Repositories created after July 15, 2026 get a subject that cannot change: it carries the
owner's id and the repository's id next to the names. The stage config now holds the repository
exactly as the token writes it. The trust rules stayed `StringEquals`, the stack was redeployed,
and the next run logged in. The tests check the trust strings in the template; what GitHub really
puts in the token was proven by the live run.

## 3. What a pull request shows

Four checks run on every pull request: `checks / app` and `checks / infra`, the two gates;
`docker`, which builds the image; and `diff`. The diff job runs
`cdk diff --method template --fail-on never` for all stacks, with the image tag that `main` is
running, so a pull request that changes no infrastructure shows an empty diff. The result is one
comment on the pull request, edited on every push, with the commit, the tag and a link to the
run, cut at 60,000 characters. The first real comment, on pull request #6, showed three stacks
unchanged and the app stack's tag moving from `f62256b…` to `c5173f9…`, because Task 1.4 had
never built an image for the head of `main`.

## 4. How a failed deployment is diagnosed

From the run outward. The run is red and the committer gets an email. The run's summary page
names the failed step, shows ✅ or ❌ per stack and the two health answers, and links the
CloudFormation console and the app's log group. CloudFormation's event list names the resource
that failed and the reason. A task that never passes the health check trips the circuit breaker,
the ECS setting that gives up on a deploy whose tasks do not become healthy, and the stack ends in
`UPDATE_ROLLBACK_COMPLETE` with the old image still running. The app's own output is in the log
group `/commerce-intelligence/dev/app`. A green deploy with a red health check points at DNS, the
certificate or the load balancer, not at the task.

## 5. Rollback

A rollback is the deploy workflow started from the button with an older image tag. Demonstrated
2026-10-24 after pull request #6, three runs on `main`:

| Run                                                                                              | Started by           | Image tag              | Deploy job                              | Start to healthy |
| ------------------------------------------------------------------------------------------------ | -------------------- | ---------------------- | --------------------------------------- | ---------------- |
| [1](https://github.com/Buri1989/shopify-commerce-intelligence-platform/actions/runs/40095264280) | the merge, `c2050b2` | `c2050b2…`, new        | 4 m 54 s, after checks and a cold build | 7 m 43 s         |
| [2](https://github.com/Buri1989/shopify-commerce-intelligence-platform/actions/runs/40097034175) | the button           | `f62256b…`, Task 1.4's | 3 m 49 s, checks and build skipped      | 3 m 55 s         |
| [3](https://github.com/Buri1989/shopify-commerce-intelligence-platform/actions/runs/40098292231) | the button           | `c2050b2…` again       | 4 m 27 s, checks and build skipped      | 4 m 32 s         |

After every run, `/health` and `/ready` answered 200 at the first try, both from inside the run
and from a laptop. `describe-services`, the ECS command that shows what a service runs, showed
the expected tag after runs 2 and 3. The three infrastructure stacks reported no changes; the app
stack created a new task definition, and the service rolled over to it in about three minutes.
`cdk diff` was clean after runs 1 and 3. A rollback costs about four minutes and builds nothing.

## 6. Cost

On the AWS side: nothing. The identity provider, the roles and the calls they make are free. On
GitHub: the repository is public since 2026-10-24, so the runners cost nothing. If it were
private: a push to a pull request costs about six billed minutes, a merge deploy about 11, a
rollback about four. The Free plan's 2,000 minutes a month would hold ten pushes and five merges
a week.

## Why we picked what we picked

- **A fourth stack, the delivery stack, for the identity provider and the roles.** Nothing runs
  on it, so a change to a trust rule redeploys nothing that serves traffic. The permission GitHub
  has is written in git, like everything else.
- **Two narrow roles that go through CDK's bootstrap roles.** A pull request's role may only
  read; the `main` branch's role deploys. Both work by taking on the roles CDK created at
  bootstrap. The bootstrap execution role is admin, which is written down; narrowing it is
  Phase 6.
- **The repository named by its immutable identity, matched with `StringEquals`.** The trust
  rule says exactly what the token says, nothing wider. A rename of the repository is then a
  deliberate pull request that changes the stage config.
- **One shared `checks.yml`.** The gate is defined once and used by both the pull request and the
  deploy workflows, so the merge commit is checked again before it deploys.
- **Four jobs in parallel on a pull request, with Docker built for the runner's own
  architecture.** The checks finish in about two minutes. The slow ARM build, done under
  emulation, happens once, on deploy.
- **The diff uses the tag `main` runs, in one comment kept current.** A pull request without
  infrastructure changes shows an empty diff, and there is one place to read it, not a comment
  per push.
- **`cdk diff --method template --fail-on never`.** The lookup role is all a pull request may
  take on, and comparing templates is all it needs. The diff is information for the reviewer; it
  does not block the merge.
- **Checks, then build, then deploy; the button skips straight to deploy.** A broken merge fails
  in minute three, before anything is built or deployed. A rollback from the button takes four
  minutes.
- **A layer cache for the ARM build.** Docker builds an image in layers and can reuse the layers
  that did not change; the layer that installs the npm packages is the slow part. A stale cache
  only makes the build slower, never different.
- **`provenance: false` on the build.** Without it, the build tool attaches a record of how the
  image was built, in a form ECS cannot pull. With it, ECR gets a plain image.
- **The public API checked from outside, six tries.** The deploy's last step calls `/health` and
  `/ready` over the internet, as a user would, and needs no AWS permission to do so.
- **A GitHub status plus a summary page.** The commit shows green or red, a failure sends an
  email, and the summary is one page with the facts.
- **Deploys queue; nothing is cancelled.** Cancelling a run on GitHub would not cancel the
  CloudFormation update it started.
- **A check that the image exists, before the deploy.** A typo in the rollback tag fails in a
  second, not ten minutes later when ECS cannot pull the image.
- **Every action pinned to a commit SHA, and a test over the workflow files.** A workflow uses
  actions written by others; a version tag like `v4` can be moved to other code, a commit SHA
  cannot. The test keeps the pin and the other rules in place.
- **The role ARNs and the region as repository variables.** They are names, not secrets. A clone
  of the project into another account changes three settings and nothing in the files.
- **No version numbers.** Every merge is a release, named by its commit SHA.
- **The CDK command line left at 2.1145.0.** One change at a time: a surprise then has one
  possible cause. The upgrade is its own pull request.
