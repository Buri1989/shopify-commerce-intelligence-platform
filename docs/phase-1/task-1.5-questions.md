# Task 1.5 — Questions to investigate

Short answers. Task 1.5 has no question list of its own: two workflows, a rollback to
demonstrate, and the general rules' seven questions. The decision is GitHub Actions with OIDC:
the workflows run on GitHub's machines and prove who they are to AWS with a short-lived token,
not a stored key. Built and run 2026-10-24. Alternatives and trade-offs are in
`task-1.5-design.md`. The rollback is in §5.

## 1. GitHub Actions with OIDC, the seven questions

- **Problem**: a deploy was a person at a laptop with an admin profile. Now a merge to `main` is
  the deploy, and what deploys is what the pull request reviewed. The workflows need a way into
  AWS without a stored key: GitHub signs a token per run naming the repository and branch, AWS
  checks it against the registered provider and the role's trust rule, and hands out credentials
  that expire within the hour.
- **Why**: the spec requires GitHub Actions, and OIDC is the one login that meets the
  no-long-lived-keys rule without a rotation process.
- **Alternatives**: an IAM user with a key in GitHub secrets (forbidden, and a key to rotate);
  CDK Pipelines or CodePipeline (the spec names GitHub Actions); one admin role for every run (a
  pull request from any branch could deploy); GitHub environments with reviewers (right with two
  environments, overhead with one).
- **Limitations**: the token's subject is GitHub's string and can change (§2); no prompts, so
  the diff and the branch rule replace CDK's approval; runners are Intel, so the ARM image is
  built under emulation; a private repository has 2,000 minutes a month on the Free plan; the
  narrow roles limit the CLI, but a template may do whatever the bootstrap execution role
  allows, which is admin by default (design §4.3).
- **When differently**: several environments: GitHub environments with reviewers, one role each.
  Many repositories into one account: an organization-level trust pattern. A regulated network:
  a self-hosted runner in the VPC. A monorepo: path filters and a matrix.
- **What could go wrong**: a merge breaks the deploy: CloudFormation rolls back, the run is red,
  the committer gets an email; the fix is a pull request or the rollback button. Two merges
  close together: the second waits. GitHub down: the README's laptop recovery. Provider deleted
  by hand: every login fails, `cdk diff` shows the recreate, and the delivery stack is
  protected. Repository renamed: runs refused until the stage config changes, as intended. A
  compromised pull request: its role reads templates and nothing else.
- **Under load**: the load is merges. Deploys serialise on one concurrency group, so ten merges
  an hour would queue. The answer is batching or a faster deploy, not parallel deploys of one
  service. The AWS-side calls are free.

## 2. How a run proves who it is, and what the first run taught

GitHub mints a token for a job with `id-token: write`: issuer
`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, subject the repository plus
the event or branch. The delivery stack's provider trusts that issuer; each role's trust rule
matches audience and subject with `StringEquals`. The pull request role accepts
`…:pull_request`, the deploy role `…:ref:refs/heads/main`. The pull request role may assume only
the bootstrap lookup role; the deploy role the deploy, file-publishing and lookup roles plus
ECR pull and push. The session name carries the run id for CloudTrail.

The first live run failed: `Not authorized to perform sts:AssumeRoleWithWebIdentity`. CloudTrail
showed the subject GitHub sent:
`repo:Buri1989@42779452/shopify-commerce-intelligence-platform@1422111906:pull_request`.
Repositories created after July 15, 2026 use an immutable subject with the owner and repository
ids. The stage config now holds the repository exactly as the token writes it, the trust rules
stayed `StringEquals`, the stack was redeployed, and the next run logged in. Tests assert the
trust strings; what GitHub puts in the token is proven by the live run.

## 3. What a pull request shows

Four checks: `checks / app`, `checks / infra`, `docker` and `diff`. The diff job runs
`cdk diff --method template --fail-on never` for all stacks with the tag `main` runs, so a pull
request without infrastructure changes shows an empty diff. One comment, edited on every push,
with the commit, the tag and a run link, cut at 60,000 characters. The first real comment on
pull request #6 showed three stacks unchanged and the app stack's tag moving from `f62256b…` to
`c5173f9…`, because Task 1.4 never built an image for main's head.

## 4. How a failed deployment is diagnosed

From the run outward. The run is red and the committer gets an email. The summary names the
failed step, each stack's ✅ or ❌, the two health answers, and links the CloudFormation console
and the app log group. CloudFormation's events name the resource and the reason; a task that
never passes the health check trips the circuit breaker and the stack ends in
`UPDATE_ROLLBACK_COMPLETE` with the old image running. Task output is in
`/commerce-intelligence/dev/app`. A green deploy with a red health check points at DNS, the
certificate or the balancer, not the task.

## 5. Rollback

Demonstrated 2026-10-24 after pull request #6, three runs on `main`:

| Run                                                                                              | Started by           | Image tag              | Deploy job                              | Start to healthy |
| ------------------------------------------------------------------------------------------------ | -------------------- | ---------------------- | --------------------------------------- | ---------------- |
| [1](https://github.com/Buri1989/shopify-commerce-intelligence-platform/actions/runs/40095264280) | the merge, `c2050b2` | `c2050b2…`, new        | 4 m 54 s, after checks and a cold build | 7 m 43 s         |
| [2](https://github.com/Buri1989/shopify-commerce-intelligence-platform/actions/runs/40097034175) | the button           | `f62256b…`, Task 1.4's | 3 m 49 s, checks and build skipped      | 3 m 55 s         |
| [3](https://github.com/Buri1989/shopify-commerce-intelligence-platform/actions/runs/40098292231) | the button           | `c2050b2…` again       | 4 m 27 s, checks and build skipped      | 4 m 32 s         |

After every run `/health` and `/ready` answered 200 at the first try, from the run and from a
laptop. `describe-services` showed the expected tag after runs 2 and 3. The three infrastructure
stacks reported no changes; the app stack created a task definition and the service rolled over
in about three minutes. `cdk diff` was clean after runs 1 and 3. A rollback costs about four
minutes and builds nothing.

## 6. Cost

AWS side: nothing; the provider, the roles and their calls are free. GitHub: the repository is
public since 2026-10-24, so runners are unmetered. If private: a pull request push about six
billed minutes, a merge deploy about 11, a rollback about four. The Free plan's 2,000 minutes
would hold ten pushes and five merges a week.

## Why we picked what we picked

- **A fourth stack for the provider and roles**: nothing runs on it, so a trust change redeploys
  nothing that runs; the grant stays in git.
- **Two narrow roles through the bootstrap roles**: a pull request only reads; `main` deploys.
  The execution role's admin nature is written down; narrowing it is Phase 6.
- **Immutable repository identity, `StringEquals`**: exactly what the token says; a rename is a
  deliberate pull request.
- **Shared `checks.yml`**: one definition of the gate; the merge commit is re-checked.
- **Four parallel jobs, Docker built for the runner's architecture**: two minutes of waiting;
  the ARM build happens once, on deploy.
- **Diff with main's tag, one comment kept current**: empty for non-infra pull requests, one
  place to read.
- **`--method template --fail-on never`**: the lookup role is all a pull request may assume; the
  diff informs, it does not gate.
- **Checks, build, deploy; the button skips to deploy**: a broken merge fails in minute three; a
  rollback takes four minutes.
- **Layer cache on the ARM build**: the npm install layer is the slow part; a stale cache is
  slower, never different.
- **`provenance: false`**: ECR gets a plain image ECS can pull.
- **Public API checked from outside, six tries**: checks what a user sees, needs no permission.
- **GitHub status plus a summary**: green or red on the commit, an email on failure, one page
  with the facts.
- **Deploys queue, nothing cancelled**: cancelling a run does not cancel the CloudFormation
  update.
- **Image-exists check before deploy**: a typo in the rollback tag fails in a second, not ten
  minutes later.
- **Actions pinned to a SHA, a rules test over the workflows**: a tag can move; the test keeps
  the rules.
- **Role ARNs and region as repository variables**: names, not secrets; a clone changes three
  settings.
- **No version numbers**: every merge is a release named by its SHA.
- **CDK CLI left at 2.1145.0**: one possible cause for any surprise; the bump is its own pull
  request.
