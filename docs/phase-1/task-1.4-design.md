# Task 1.4 — Infrastructure as Code: Design

**Date:** 2026-10-22
**Branch:** `feat/task-1.4-infrastructure-as-code`
**Status:** built, deployed and verified on 2026-10-22. One decision was added during the build
and is marked **(found at build step 4)**: the NAT image (§4.9).
**Spec:** `docs/Boris-ing.md`, section 3, Task 1.4

This document records what was decided for Task 1.4 and why. A builder should be able to implement
from it without going back to the author. Anything marked **(builder's call)** is left open on
purpose. Anything marked **(my call)** was decided by Claude during planning and can be overridden.
Anything marked **(Boris)** was decided by Boris in chat.

---

## 1. Intent

Task 1.4 asks for infrastructure as code. The general rules demanded that from the first line, so
most of this task was done while building Tasks 1.2 and 1.3: the three stacks are CDK code in git,
they synthesize without credentials, a deploy is one command with one argument, and the deploy
procedure is in the README. This task checks each of the seven requirements against what exists,
closes the gaps, and writes down the things that were decided implicitly along the way: how the
state is kept, what counts as a secret, how an infrastructure change is reviewed and applied.

One code change comes out of it, termination protection on the two stacks that must outlive the
application. The rest is documentation: a written review-and-apply procedure, the architecture and
networking diagram the Phase 1 deliverables ask for, and corrections to the README. Task 1.5 then
automates the procedure this task writes down.

## 2. Goals, non-goals, anti-goals

**Goals**

- Every Task 1.4 requirement traced to the code or document that satisfies it (§4.1).
- The network and registry stacks refuse deletion until a person turns protection off (§4.2).
- The NAT instance's image is pinned in the stage config, so the same commit deploys the same
  network every time and patching it is a deliberate change (§4.9).
- One written rule for what may appear in source: credentials never, code account-agnostic,
  documents free to name the deployment (§4.3).
- One written procedure for how an infrastructure change is reviewed and applied, now and once
  Task 1.5 exists, including drift detection (§4.4).
- `docs/phase-1/architecture.md`: the network, the request path and the delivery path as deployed,
  as text diagrams GitHub renders (§4.5).
- The README current: status, bootstrap, first-deploy order, tear-down, the procedure (§4.6).
- `task-1.4-questions.md` answering the general questions for the tool and the state model, and
  ending with why we picked what we picked.

**Non-goals** (later tasks)

- The GitHub Actions workflows, the OIDC provider and the two roles: Task 1.5.
- Running drift detection on a schedule or inside the deploy workflow: a Task 1.5 decision.
- A `prod` stage entry. The code is parameterised; only `dev` exists, as in 1.2 and 1.3.
- Migrating to Terraform, or rewriting git history to remove the account id.

**Anti-goals**

- A change that makes `cdk destroy` of the app stack fail: the tear-down must keep working.
- A stage-config field with a single stage and a single value.
- A credential, token or key anywhere in the repository, including documents.
- A diagram as an image file that cannot be diffed in a pull request.

## 3. Constraints

| Constraint | Value |
|---|---|
| Account, region, profile | As in 1.3: `eu-north-1`, `AWS_PROFILE=ci-admin`, no access keys |
| Environment | Three stacks deployed and verified on 2026-10-20, `cdk diff` clean, the service on the image tagged `f62256b…`; about 44 USD a month |
| Budget | 50 USD a month. This task adds nothing |
| CDK | `aws-cdk-lib` 2.273.0, CLI 2.1145.0. The CLI has `cdk drift` and updates termination protection on existing stacks during `deploy` (both verified 2026-10-22) |
| Process | Same as 1.2 and 1.3: TDD, every file shown before it is written, decisions one at a time |

## 4. Decisions

### 4.1 The gap check

Each requirement of the spec, what already satisfies it, and what this task adds.

| Requirement | Already satisfied by | Gap | Closed in |
|---|---|---|---|
| Use Terraform or AWS CDK | CDK in TypeScript; the choice argued in `task-1.2-questions.md` | none | |
| Define infrastructure in source control | `infra/`: three stacks, 70 assertion tests, lockfile, pinned versions | none | |
| Support repeatable deployments | synth without credentials, explicit zones, no context lookups, the image tag as the one deploy argument, a clean `cdk diff` after every deploy | the NAT image resolves to Amazon's latest at deploy time, so the same commit deploys differently over time and a clean diff goes stale within a week (found at build step 4); the one-time `cdk bootstrap` is missing from the README; the retained registry stack cannot be recreated under the same name without a step nobody wrote down | §4.9, §4.6 |
| Maintain infrastructure state safely | CloudFormation holds the state; no state file; `cdk.context.json` never exists | no stack is protected against deletion; no drift check anywhere; the weak-reference trade is explained only inside the 1.3 design | §4.2, §4.4 |
| Separate infrastructure configuration from application configuration | `infra/` is its own package, never imported by `src/`, excluded from the image; stage config on one side, `env.schema.ts` on the other, the task definition the only bridge | none | |
| Avoid hardcoded secrets | no secrets exist yet; stacks are account-agnostic; the `checkSecretUsage` feature flag is on | the 1.3 design names the account id, which a 1.2 anti-goal forbids; no written rule for the secrets Phase 2 will bring | §4.3 |
| Document the deployment process | README: build, push, diff, deploy, tear-down | status line stale; bootstrap and first-deploy order thin; no protection step in the tear-down | §4.6 |
| Explain how infrastructure changes are reviewed and applied | one sentence in the 1.2 design: the diff is read before approval | no written procedure; CI deploys cannot answer CDK's approval prompt, so the review must move into the pull request | §4.4 |

Phase 1 also lists an architecture and networking diagram among its deliverables. Two ASCII
sketches exist, neither complete; §4.5 gives the diagram a home.

### 4.2 Termination protection on the long-lived stacks

**(Boris, option a)** after the three options were laid out.

Termination protection is a flag on a CloudFormation stack, outside the template. While it is on,
every `DeleteStack` call is refused, whether it comes from `cdk destroy`, the console or the CLI.
It blocks nothing else: updates, replacements and console edits of individual resources all still
happen. Turning it off is one explicit command. Deleting a protected stack therefore takes two
deliberate steps in two places instead of one confirmation on autopilot.

Why it matters here more than usual: the app stack reads the network stack's outputs through weak
references (1.3 design §4.3), so CloudFormation does not know the app depends on the network. A
`DeleteStack` on the network stack would start deleting. The flow log, the routes, the NAT instance
and the S3 endpoint would go first; the subnets and security groups would fail because the load
balancer and the task still have network interfaces in them; the stack would end in
`DELETE_FAILED` with the API down and a manual clean-up ahead. The registry stack is the milder
case: the repository survives through its retain policy, but the stack is gone and a redeploy fails
because the repository name is taken.

| Stack | Protected | Why |
|---|---|---|
| `-network` | yes | its loss is an outage and a stuck stack |
| `-registry` | yes | its loss is a name clash on the next deploy, and the images are the rollback targets |
| `-app` | no | the one stack the README destroys on purpose; everything in it is recreated by a deploy in about twenty minutes |

Implementation: `terminationProtection: true` in the `super()` props of `NetworkStack` and
`RegistryStack`; `AppStack` unchanged. The flag is not part of the template, so `cdk diff` is not
expected to show it; the CDK CLI compares the stack's current setting with the synthesized one on
every deploy and calls `UpdateTerminationProtection` when they differ. A deploy of the two stacks
with no template change applies it. Verified afterwards with
`aws cloudformation describe-stacks --query 'Stacks[0].EnableTerminationProtection'` for all three.

The tear-down for a long pause gains one line before destroying the network stack:

```bash
aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name commerce-intelligence-dev-network
```

The next `cdk deploy` of that stack turns protection back on, because the code says so.

Rejected **(b)**: a `terminationProtection` boolean in the stage config. The pattern fits the other
stage values, but with one stage whose value would be `false` the field protects nothing, and it
assumes all stacks in a stage share the setting, which the table above does not. Rejected **(c)**:
nothing, relying on the confirmation prompts and on the Task 1.5 deploy role never being allowed
to delete a stack. Both are true; neither guards against the admin profile that does every deploy
today.

What protection does not cover, in any option: an update that removes something the app stack
uses, for example a security group taken out of the network stack. CloudFormation would apply it.
That gap is closed by the diff review of §4.4, not by a flag.

### 4.3 What may and may not appear in source

**(Boris, option b)** after the two options were laid out.

The 1.2 design listed "an account id, access key or any credential in source" as an anti-goal, and
kept the stacks account-agnostic partly so the id never had to appear. The 1.3 design then printed
the id in its constraints table, and that commit is on `main`. AWS's own position is that an account
id is an identifier, not a secret: shared with care, not hidden. The rule is restated precisely:

- **Credentials never, anywhere.** No access key, token, password or private key in code,
  configuration, documents, workflow files or commit messages.
- **Code is account-agnostic.** Stack code, stage configuration and workflow files never name the
  account. A clone deploys to another account by changing an input, not a file. The inputs that
  bind the repository to one account, such as the role ARN Task 1.5 needs, arrive from outside: a
  GitHub Actions variable, a CDK context value, a CLI profile.
- **Documents may name the deployment.** Design docs, questions docs and the README describe this
  environment, and the repository is private. The 1.3 doc stays as it is.
- **Resource identifiers are configuration.** The hosted zone id, the zone name, the API host name
  and the region live in the stage config because they are facts about the deployment, not
  credentials; anyone with access to the account can read them.

For the secrets later phases bring (the database password in Task 2.1, Shopify tokens in Phase 3):
a secret is created by AWS and referenced by ARN, never typed into the stage config, never written
into an environment variable literal in the task definition. The `@aws-cdk/core:checkSecretUsage`
flag already on in `cdk.json` makes `cdk synth` fail if a `SecretValue` would be rendered in plain
text into a template; the rule above is the human half of that guard.

Edits: the 1.2 design's anti-goal line gets a dated note pointing here, in the style of the
"Revisited in Task 1.3" notes; `CLAUDE.md` gains the rule under "Conventions from Task 1.4".

Rejected **(a)**: keep the anti-goal as written, scrub the id from the 1.3 doc and use `<account>`
placeholders everywhere. History keeps the value, so the scrub changes nothing and the docs get
vaguer.

### 4.4 How infrastructure changes are reviewed and applied

**(Boris, option a)** after the three options were laid out.

Today a change goes: branch, infra gate, `cdk diff` read in chat, `cdk deploy` from the laptop
answering CDK's approval prompt for IAM and security-group changes, then the pull request is merged.
Task 1.5 flips the order: merge triggers the deploy, and a workflow cannot answer a prompt, so the
deploy runs with `--require-approval never`. The gate proves the template builds; only `cdk diff`
shows what would change against what is deployed, and that needs AWS credentials, because it reads
the live template from CloudFormation. The bootstrap stack already holds a read-only role for
exactly this, the lookup role.

The decision: **the pull request carries the diff.** The 1.5 pull-request workflow assumes a
read-only role, runs `cdk diff` for all stacks, and posts the output on the pull request. Review
means reading that diff before merge, which is what happens in chat today. Merge applies it. This
is plan-then-apply, done with CDK's own commands.

The procedure, as it will be written in the README. Steps marked *(until 1.5)* are the interim
form and are removed when the workflows land.

1. Change on a branch. `npm run infra:check` passes locally.
2. Open a pull request. The pull-request workflow runs the app gate, the infra gate, the Docker
   build and `cdk diff` against the deployed stacks through the read-only role, and posts the diff
   on the pull request. *(until 1.5: the author runs `npm run diff -- -c imageTag=<deployed sha>`
   in `infra/` and pastes the output into the pull request description.)*
3. Review. The reviewer reads the diff. Three things get a second look: IAM and security-group
   changes, which CDK marks; resources the diff says will be replaced; and any change to the
   network stack, because weak references mean CloudFormation will not catch an app-stack
   dependency removed from it.
4. Merge. The deploy workflow builds and pushes the image and runs
   `cdk deploy --all --require-approval never -c imageTag=<sha>`; what deploys is what was
   reviewed. *(until 1.5: the author deploys from the laptop after the merge, with the prompt.)*
5. Verify. `cdk diff` with the deployed tag reports no differences; the task's own checks pass.
6. Drift. `npm run drift` in `infra/` runs `cdk drift` on the three stacks. It is run before a
   planned infrastructure change and after anyone has worked in the console. A drifted resource is
   either brought back by a deploy, when the code still describes what is wanted, or the code is
   changed to match and deployed. Drift detection covers most of the resource types in use and
   reports the rest as not checked.

The `drift` script passes the placeholder tag, like `synth`, because the command synthesizes the
app to find the stacks but compares nothing in the template **(builder's call on the name)**.

What this commits Task 1.5 to: a read-only role for pull requests that may assume the bootstrap
lookup role and run drift detection, a deploy role for `main`, and a diff job that posts to the
pull request. Requiring the pull-request workflow to pass before merge is a branch-protection
setting on GitHub, set by hand once and noted in the README.

Rejected **(b)**: the deployer pastes a local diff for good. It is the interim step above, kept
only until the workflow exists, because a pasted diff is whatever the deployer ran, whenever they
ran it. Rejected **(c)**: gate only, no pre-merge diff. It removes the one human look at IAM and
security-group changes that CDK's prompt used to force, instead of moving it.

### 4.5 The architecture and networking diagram

**(Boris, option a)** after the three options were laid out.

A new file, `docs/phase-1/architecture.md`, describing the environment as deployed. It is a
document about the environment, not about one task, so it gets a file that outlives the tasks and
is extended as the environment grows: Task 1.5 adds the pipeline, Task 2.1 the database.

Diagrams are Mermaid blocks inside the markdown: GitHub renders them as diagrams, git shows them
as text, and a pull request reviews a diagram change like a code change. The two ASCII sketches in
the 1.2 design and the 1.3 questions stay where they are as the record of those tasks. **(my call)**

Contents, three figures and one table:

1. **The network.** The VPC with its two zones; the public, private and isolated tiers with their
   addresses; the Internet Gateway; the NAT instance in zone a's public subnet; the S3 gateway
   endpoint; the default route of each tier. The reserved third zone is a note, not a box.
2. **The request path.** Client, Route 53 alias, the load balancer with its two listeners and the
   certificate, the target group and its health check, the Fargate task in a private subnet, the
   log group. Security groups appear as labels on the edges they allow.
3. **The delivery path, as done by hand.** Developer machine, `docker build` and `push` to the
   repository, `cdk deploy` through CloudFormation to the three stacks, the task definition
   naming the image by tag. A sentence says Task 1.5 replaces the developer with GitHub Actions
   and two roles.
4. **The stacks.** One table: stack, what it holds, who depends on it, protected or not.

The README links the file from its Infrastructure section and its documentation list.

Rejected **(b)**: a section inside this design doc; wrong lifetime. Rejected **(c)**: wait for the
end of 1.5 and draw once; saves one edit and leaves this task's documentation without the picture.

### 4.6 Documentation fixes

**(my call)**, all in the README unless noted.

- Status line: Phase 1, Tasks 1.1 to 1.3 complete and deployed; 1.4 in progress.
- Prerequisites gain the one-time bootstrap, after the profile and before the first deploy:
  `npx cdk bootstrap aws://<account>/eu-north-1` from `infra/` with the profile, the account id
  read with `aws sts get-caller-identity`. One sentence says what it creates and that the CLI asks
  for it again when its version moves.
- The first deploy becomes a numbered sequence: network and registry, the image push, the app
  stack. The ordering sentence that exists today is folded into it.
- A section "How infrastructure changes are reviewed and applied" holding the procedure of §4.4.
- Tear-down: the protection step of §4.2 before destroying the network stack; a note that the
  retained repository survives a destroyed registry stack, and that recreating the stack needs the
  repository brought under it with `cdk import` or deleted first.
- The documentation list gains this doc, the questions doc and `architecture.md`.
- `CLAUDE.md`, "Conventions from Task 1.4": the rule of §4.3; long-lived stacks carry termination
  protection and the tear-down turns it off first; the review procedure lives in the README;
  `create*Stack` fixtures return stacks, `synthesize*` return templates (§4.7).
- `docs/phase-1/task-1.2-design.md`: the anti-goal line about the account id gets a dated note
  pointing at §4.3 here.
- The procedure of §4.4 gains the command that prints Amazon's current latest image id, to be run
  before any network-stack deploy and at least quarterly (§4.9).
- `docs/phase-1/task-1.3-design.md`: the image row of §4.4 gets a dated revisit note pointing at
  §4.9 here.

### 4.7 Tests

Termination protection is a stack property, not a template property, so the existing fixtures,
which return `Template`s, cannot see it. The fixtures gain a layer underneath **(my call)**:

```
infra/test/
  create-network-stack.ts     createNetworkStack(app, config): NetworkStack
  create-registry-stack.ts    createRegistryStack(app, config): RegistryStack
  create-app-stack.ts         createAppStack(app, config, imageTag): AppStack; builds the other two in the same App, as bin/app.ts does
  synthesize-network-stack.ts synthesizeNetworkStack(config): Template.fromStack(createNetworkStack(createTestApp(), config))
  synthesize-registry-stack.ts  likewise
  synthesize-app-stack.ts       likewise
  read-validation-violations.ts readValidationViolations(app): the findings CDK's validation rules wrote into the synthesized assembly's report
```

`create*` builds a construct, `synthesize*` builds a template: the verbs from 1.2. The `app`
parameter is explicit so the app fixture can put the three stacks in one `App`, which is the only
way the cross-stack references resolve. The refactor changes no template, so the gate stays green
across it.

New behaviours, one `it` each:

| Spec | Behaviour |
|---|---|
| `network-stack.spec.ts` | the stack is protected against deletion: `terminationProtection` is `true` |
| `registry-stack.spec.ts` | the stack is protected against deletion |
| `app-stack.spec.ts` | the stack stays destroyable: `terminationProtection` is `false` |
| `stage-config.spec.ts` | `dev` resolves `natInstanceAmiId` to the documented image id |
| `network-stack.spec.ts` | the NAT instance boots from the image pinned in the stage config, with the forwarding setup in its user data; the template has no SSM image parameter |
| `network-stack.spec.ts` | the stack leaves no validation finding unacknowledged |

The first two are red before the change. The third passes on day one; it is written anyway,
because it pins a decision that the first two would otherwise invite someone to "complete".
The last row rewrites the 1.3 test that asserted the SSM parameter. `findOnlyParameterId` in
`template-queries.ts` was added for that test and is removed if nothing else uses it.

**Not automated:** that CloudFormation actually refuses the delete. Verified once by hand in build
step 4 with `describe-stacks`, not with a `destroy` attempt, since a failed attempt on an unprotected
stack would be the outage this task exists to prevent.

### 4.8 Cost

Nothing changes. Termination protection and drift detection are free; the read-only role and the
diff job are Task 1.5's and run on GitHub's included minutes.

### 4.9 The NAT image is pinned

**(Boris, option a; found at build step 4)** The first `cdk diff` of this task marked the NAT
instance for replacement with no code change. Its image is resolved from the public SSM parameter
for the latest Amazon Linux 2023 ARM image at every deploy (1.3 design §4.4); Amazon had published
a new image the day before; an instance cannot change image in place. Read on 2026-10-22: images
arrive about weekly (`2023.12.20261016.0` on 10-16, `2023.12.20261021.0` on 10-21), and each is
deprecated about ninety days after publication.

Three consequences the 1.3 design did not weigh. The same commit deploys differently depending on
the day. A clean diff goes stale within a week, which undermines the review of §4.4. And any
network-stack deploy for an unrelated reason replaces the NAT and cuts outbound traffic for the
minutes the new instance takes to boot and run its setup.

Decision: the image id is stage configuration. `natInstanceAmiId` joins `StageConfig`, set in `dev`
to the image that is running, `ami-04e0c7320ad3a3a48`; the provider receives
`MachineImage.genericLinux({ [region]: id })`, which renders as a literal because the stack pins
its region. Still no context lookup. The provider's default user data, IP forwarding and the
masquerade rule, is unchanged and stays asserted by the test. Patching the NAT becomes a one-line
change in a pull request whose diff shows the replacement, deployed at a chosen moment. CDK's
validator flags every literal image id as unportable across regions; the finding is acknowledged
on the instance with the reason, because the stack pins its region and the id is pinned on
purpose, and a test asserts that the stack leaves no finding unacknowledged. Those findings live
in the assembly's validation report, not in construct metadata, hence the `read*` fixture.

How a newer image is found: nothing automatic in this task. The README procedure carries the
command that prints the id Amazon currently calls latest:

```bash
aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64 --query Parameter.Value --output text
```

It is run before any network-stack deploy and at least quarterly. Follow-up for Task 1.5 or
Phase 6 **(Boris)**: a scheduled workflow runs the command and opens the pull request with the new
id when it is behind, so finding the image is automatic and applying it stays a decision.

Rejected **(b)**: keep "latest" and accept replacements whenever anyone deploys the network stack;
patches arrive for free, and so do outbound interruptions. Rejected **(c)**: pin to the newest
image and replace the NAT today, together with the protection flag; two changes in one deploy
during a task that planned none.

## 5. Build order

One piece at a time. Each piece: show the failing test in chat → approval → write it → run it red →
show the implementation in chat → approval → write it → run it green → run the whole gate.

1. Branch `feat/task-1.4-infrastructure-as-code` (done); this document.
2. The `create*Stack` fixtures of §4.7 and the `synthesize*` fixtures rewritten on top of them.
   Gate green: a refactor, no behaviour change.
3. The three `it` blocks of §4.7, red for the two protected stacks; `terminationProtection: true`
   in `NetworkStack` and `RegistryStack`; green; the `drift` script in `infra/package.json`; gate.
4. `natInstanceAmiId` in the stage config with its spec; the provider takes the image; the
   network spec's image test rewritten; `findOnlyParameterId` removed if unused; gate.
   `npm run diff -- -c imageTag=<deployed sha>` read in chat: no differences in any stack.
5. Deploy the network and registry stacks from Boris's terminal. Verify
   `EnableTerminationProtection` on all three stacks with `describe-stacks`. Run `npm run drift`
   once, read in chat. A final `cdk diff` clean.
6. `docs/phase-1/architecture.md`; rendering checked on GitHub once the branch is pushed.
7. README, `CLAUDE.md`, the 1.2 and 1.3 design notes.
8. `docs/phase-1/task-1.4-questions.md`: the seven general questions for CloudFormation-through-CDK
   as the tool and the state store, building on the Terraform comparison in the 1.2 questions
   rather than repeating it; one section per requirement phrased as a question; "Why we picked
   what we picked".

Commits happen when the author says so.

## 6. Done when

- `npm run infra:check` and the root gate pass with no AWS session.
- `describe-stacks` shows `EnableTerminationProtection` `true` on the network and registry stacks
  and `false` on the app stack.
- `npm run drift` reports the three stacks, and anything it finds is explained or fixed.
- `cdk diff -c imageTag=<deployed sha>` reports no differences.
- The running NAT instance still has image `ami-04e0c7320ad3a3a48`: this task deployed the flag
  and nothing else to the network.
- The README has the current status, the bootstrap step, the first-deploy sequence, the
  review-and-apply procedure and the tear-down with the protection step.
- `docs/phase-1/architecture.md` renders on GitHub with the three figures and the table.
- `docs/phase-1/task-1.4-questions.md` exists.

## 7. Left to the builder

- The name of the drift script and whether the README shows the raw `cdk drift` command as well.
- The Mermaid layout: direction, subgraph nesting, how much addressing goes on the boxes.
- The exact wording of the README procedure and where the interim steps are marked.
- Whether the three fixture files for `create*Stack` are separate files or one `create-stacks.ts`;
  three files match the rest of `test/`.
- The `it` block names.
