# Task 1.2 — AWS Networking: Design

**Date:** 2026-10-18
**Branch:** `feat/task-1.2-aws-networking`
**Status:** deployed on 2026-10-20 and verified against §6. Its NAT Gateway was replaced by a NAT
instance in Task 1.3; see `task-1.3-design.md` §4.4.
**Spec:** `docs/Boris-ing.md`, section 3, Task 1.2

This document records what was decided for Task 1.2 and why. A builder should be able to implement
from it without going back to the author. Anything marked **(builder's call)** is left open on
purpose. Anything marked **(my call)** was decided by Claude during planning and can be overridden.
Anything marked **(Boris)** was decided by Boris in chat.

---

## 1. Intent

Give the application a network to live in before Task 1.3 puts it on ECS. The network is written
as code from the first line, because the assignment's general rule 1 says all infrastructure is
defined through Terraform or CDK, and it is shaped the way production networks are shaped: a
dedicated VPC spanning two availability zones, a public tier for the load balancer, a private tier
for the application with outbound-only internet access, and an isolated tier for the database with
no internet route at all. Security groups define which tier may talk to which, on which port, and
nothing else.

Nothing in this task runs the application. The deliverable is a deployed, empty, correctly wired
network and the code that creates it, with tests that prove its shape before anything is deployed.
Task 1.3 attaches the load balancer and the ECS service to it; Task 2.1 attaches the database.

This is a training assignment. Every decision below is one the author must be able to explain and
defend. The companion file `task-1.2-questions.md` answers the spec's ten "questions to investigate"
once the code exists.

## 2. Goals, non-goals, anti-goals

**Goals**

- One CDK app under `infra/` that synthesizes and deploys a `commerce-intelligence-dev-network`
  stack in `eu-north-1` from a clean clone with `npm ci` and the SSO profile.
- A VPC with public, private and isolated subnets in two availability zones, an Internet Gateway,
  one NAT Gateway, a free S3 gateway endpoint, and per-zone route tables.
- Three security groups, `alb`, `app` and `data`, whose rules are the complete list of allowed
  traffic between tiers. Nothing allows all outbound.
- Going from one NAT Gateway to one per zone is a single configuration value and a redeploy.
- Every resource above is asserted by a unit test that was red before the code existed, and the
  whole infra gate, `cdk synth` included, runs without an AWS session.
- Rejected traffic is logged, so a wrong security group rule in Task 1.3 is diagnosable.

**Non-goals**

- Any compute, load balancer, database, queue or endpoint beyond the ones named above. They come
  with the tasks that need them and attach to what this task exports.
- GitHub Actions. Task 1.5 moves `cdk deploy` into a workflow; until then it runs from the
  developer's machine through the SSO profile.
- IPv6. Discussed in the questions doc as a future cost lever, not built.
- A second stage. The code is parameterised by stage so `prod` is a second config entry, but only
  `dev` exists.
- Network ACLs. Security groups carry the policy; ACLs stay at the VPC default (allow all), which
  is the usual choice unless a subnet-level deny is needed.

**Anti-goals** (would make this a failure even if it technically works)

- Any resource with a public IP that is not the load balancer or the NAT Gateway.
- A security group with an "allow all outbound" rule, or an inbound rule from `0.0.0.0/0` on
  anything but the `alb` group's ports 80 and 443.
- A database subnet with a route to the internet, in either direction.
- An account id, access key or any credential in source. *(Revised in Task 1.4: the account id is
  an identifier, not a credential. It may appear in documents, never in code or configuration;
  see `task-1.4-design.md` §4.3.)*
- A test suite that only snapshots the template. Tests name the resources and rules they expect.
- Infrastructure code tangled with application code: the app image must not contain `infra/`, and
  the app must not import from it.

## 3. Constraints

From the spec (section 1, General Rules): infrastructure as code, no long-lived keys, no secrets in
source, documented decisions, automated tests in every phase, production-style security controls,
costs considered, simplicity over extra technology.

From the account and the repo as they stand:

| Constraint | Value |
|---|---|
| AWS account | Paid plan, root with MFA, IAM Identity Center enabled in `eu-north-1`; user `boris` with `AdministratorAccess`. CLI profile `ci-admin` (SSO, no access keys). Set up 2026-10-18 |
| Region | `eu-north-1` (Stockholm) **(Boris)**. EU data residency for merchant data, cheapest EU region, close to the author. Three zones available: `eu-north-1a/b/c` |
| Tool | AWS CDK v2 in TypeScript **(Boris)**. One language, one test runner, assertion tests that run without credentials; CloudFormation holds the state. Terraform considered and declined: a second language and a state file to protect, for a more market-common tool. Documented in the questions doc |
| Budget | AWS Budget `commerce-intelligence-monthly`, 50 USD/month with alerts. This stack alone costs roughly 38 USD/month while deployed (NAT Gateway hourly plus its public IPv4 address), before data processing |
| Module system | ESM (`"type": "module"`), relative imports end in `.js`, as in the app |
| Node | 24 LTS (`.nvmrc`) |
| Test runner | Vitest, `globals: true`, specs co-located, as in the app |
| Lint / format | oxlint and Prettier, reusing the root configuration |
| Process | TDD per `.claude/skills/tdd-guardian`; every file shown in chat before it is written |
| Deploy | From the developer's machine with `AWS_PROFILE=ci-admin` until Task 1.5 |

## 4. Decisions

### 4.1 Where the infrastructure code lives

`infra/` at the repository root is its own npm package with its own `package.json`, lockfile,
`tsconfig.json`, Vitest config and `cdk.json`. It is not an npm workspace. **(my call)**

Why a separate package rather than more files in the app package: the two change for different
reasons and deploy through different pipelines (the app as a Docker image, the infrastructure as
CloudFormation stacks). CDK's dependencies are heavy and must not enter the app's build context.
Task 1.4 asks explicitly to separate infrastructure configuration from application configuration.
Why not a workspace: the Dockerfile runs `npm ci` on the root package; a workspace would pull
`infra/` into every image build or need special flags. Two plain packages keep both builds dumb.

The root `package.json` gets passthrough scripts (`infra:test`, `infra:synth`, …, exact names
**(builder's call)**) so the gate can be run from the root. `.dockerignore` gains `infra`.
`.gitignore` gains `infra/cdk.out/`, `infra/node_modules/` and `infra/cdk.context.json` (§4.2).

The root `tsconfig.json` has no `include` and excludes only `dist`, and both root Vitest configs
collect `**/*.spec.ts` from the repository root. Left alone, the app's `tsc --noEmit` would
type-check `infra/` (and fail on a clone that has not run `npm ci` there) and the app's `npm test`
would run the infra specs a second time under the app's setup file. So the root `tsconfig.json`
and both Vitest configs get `infra` added to their `exclude`. That is the only change to the app's
own configuration. **(my call, after builder check)**

```
infra/
  package.json                 private; scripts: test, typecheck, lint, format, synth, diff, deploy
  package-lock.json
  tsconfig.json                NodeNext, strict, noEmit; tsx runs the app
  vitest.config.ts
  cdk.json                     app: "npx tsx bin/app.ts"; context: the CDK recommended feature flags
  bin/
    app.ts                     creates the App, resolves the stage config, instantiates NetworkStack
  lib/
    config/
      project-name.ts          PROJECT_NAME, used by the VPC name, log group, tags and stack ids
      stage-config.ts          StageConfig type, the dev entry, resolveStageConfig(stageName)
      stage-config.spec.ts
    project-tags.ts            applyProjectTags(scope, stage): project, stage, managed-by
    project-tags.spec.ts
    network/
      network-stack.ts         NetworkStack: composes the pieces, exposes vpc and securityGroups;
                               networkStackId(stage)
      network-stack.spec.ts    the shape of the whole synthesized stack
      create-vpc.ts            createVpc(scope, config): the ec2.Vpc with subnets, NAT, endpoint
      perimeter-security-groups.ts   createPerimeterSecurityGroups(scope, vpc, port): alb, app, data
      perimeter-security-groups.spec.ts
      create-flow-log.ts       createRejectFlowLog(scope, vpc, { stage, retentionDays })
      create-flow-log.spec.ts
      create-network-outputs.ts      createNetworkOutputs(scope, vpc, groups): the CfnOutputs
  test/
    template-queries.ts        find*/read* functions over a synthesized template, used by specs
    synthesize-network-stack.ts        synthesizeNetworkStack(config): the real stack as a Template
    synthesize-on-minimal-vpc.ts       synthesizeOnMinimalVpc(addToStack): a construct on a tiny VPC
```

Rules carried over from the app: one responsibility per file, `create*` builds something, public
function first and helpers after, comments explain why. A constant stays private to the module that
uses it until a second module needs it. The app never imports from `infra/` and `infra/` never
imports from `src/`. Spec files hold `beforeAll` and `it` blocks only; everything they need to
query a template or build a stack lives in `test/` and is imported **(Boris, during step 4)**.
Verbs: `find*` looks something up in a template, `read*` returns a resource's properties,
`synthesize*` builds a template, `create*` builds a construct.

### 4.2 Stage configuration

One typed object per stage, selected by the CDK context value `stage` (default `dev`):

```ts
export type StageConfig = {
  readonly stage: string;             // 'dev'
  readonly region: string;            // 'eu-north-1'
  readonly availabilityZones: readonly string[]; // ['eu-north-1a', 'eu-north-1b']
  readonly vpcCidr: string;           // '10.0.0.0/16'
  readonly natGatewayCount: number;   // 1 in dev; 2 is the production value
  readonly applicationPort: number;   // 3000, the app's PORT default from Task 1.1
  readonly flowLogRetentionDays: number; // 14
};
```

`resolveStageConfig('dev')` returns the entry; an unknown stage throws with a message naming the
known stages.

**The stack is account-agnostic and region-pinned:** `bin/app.ts` sets `env: { region }` from the
config and no account. The region comes from the config, not from the profile, so a wrong profile
region cannot deploy to the wrong place; the account is whichever one the credentials resolve to,
and there is exactly one. **(my call, after builder check)**

Why not pin the account too: the builder check synthesized the design with a pinned account and
found that `ec2.Vpc` then validates the explicit zone list against the account's real zones, which
is a context lookup. That lookup needs credentials at the first `cdk synth` and caches the result,
including the account id, in `cdk.context.json`. Either that file is committed (CDK's own
recommendation, but it puts the account id in source) or every `synth` needs an SSO session, in
the gate and in Task 1.5's validation job. An account-agnostic stack performs no lookup, so
`npm run synth` works from a clean clone with no AWS session, `cdk.context.json` never appears
(it is gitignored in case a later construct creates one), and the account id stays out of the
repository. The cost: a typo in a zone name is caught by CloudFormation at deploy time rather
than at synth time, and a future construct that needs a lookup (a hosted zone in Task 1.3, for
example) must receive its ids through the stage config instead. That is the better habit anyway.

Availability zones are listed explicitly rather than discovered with `maxAzs`. Discovery is also a
context lookup; an explicit list makes synthesis deterministic in tests, in the gate and in CI. The
zone names were verified against the account on 2026-10-18. **(my call)**

### 4.3 The VPC: one L2 `ec2.Vpc`, configured explicitly, with the primitives named in tests

The network is built with CDK's high-level `ec2.Vpc` construct rather than by hand from the
low-level `Cfn*` resources. **(my call)**

Why: every later construct this project uses (the load balancer, the Fargate service, the RDS
instance, interface endpoints) takes an `IVpc` and a subnet selection, and `ec2.Vpc` is what
produces them. Hand-built subnets would need to be re-imported through `Vpc.fromVpcAttributes` in
every later stack. The construct also creates exactly the production layout we want: one route
table per subnet, the default routes per tier, the Internet Gateway attachment, the NAT Gateways
with their Elastic IPs, and the gateway endpoint routes.

The learning concern, that ten lines hide the primitives the spec asks about, is handled in two
places. The unit tests enumerate every primitive by CloudFormation type and count (§4.9), so the
builder cannot pass them without knowing what a route table association is. And the synthesized
template is read in chat at build step 6 before anything is deployed.

Configuration:

| Setting | Value | Why |
|---|---|---|
| CIDR | `10.0.0.0/16` | 65k addresses; room for three tiers in three zones with space left |
| Zones | the two from the stage config | spec: at least two |
| `reservedAzs` | 1 | reserves address space for a third zone so adding it later does not renumber, and therefore replace, existing subnets |
| `public` tier | `PUBLIC`, `/24` per zone, `mapPublicIpOnLaunch: false` | load balancer nodes and the NAT Gateway; nothing launched here gets a public IP by accident |
| `private` tier | `PRIVATE_WITH_EGRESS`, `/20` per zone | application containers; generous so autoscaling never runs out of addresses |
| `isolated` tier | `PRIVATE_ISOLATED`, `/24` per zone | database and cache; no default route in either direction |
| `natGateways` | `natGatewayCount` from config, 1 in dev | §4.4 |
| S3 gateway endpoint | on the private tier's route tables, selected explicitly with `subnets: [{ subnetType: PRIVATE_WITH_EGRESS }]` | free; ECR image layers are served from S3, so pulls bypass the NAT's per-gigabyte fee. This is the first half of the answer to spec question 7. Without the explicit selection CDK associates every route table, public and isolated included **(after builder check)** |
| DNS support and hostnames | enabled (default) | needed by interface endpoints and RDS later |
| Default security group | `restrictDefaultSecurityGroup: true`, passed explicitly | CDK strips the default group's allow-all rules through a small custom resource (a Lambda function and an IAM role). Passed explicitly rather than relied on as a `cdk.json` feature flag, because the unit tests create a bare `App` that reads no `cdk.json`; explicit means tests and `cdk synth` agree. Accepted: a Lambda-backed resource inside a network stack, but it closes the one implicit allow in a new VPC **(my call, after builder check)** |

Resulting subnet addresses, verified by synthesizing this configuration during the builder check
(the allocator goes tier by tier, which is why `reservedAzs` matters: without it the isolated
subnets would land at `10.0.48.0/24` and move, and therefore be replaced, when a third zone is
added):

| Tier | zone a | zone b | reserved for zone c |
|---|---|---|---|
| public | `10.0.0.0/24` | `10.0.1.0/24` | `10.0.2.0/24` |
| private | `10.0.16.0/20` | `10.0.32.0/20` | `10.0.48.0/20` |
| isolated | `10.0.64.0/24` | `10.0.65.0/24` | `10.0.66.0/24` |

Resulting routing, two zones shown, the third reserved:

```
                          Internet
                             │
                     Internet Gateway
                             │
┌──────────────────── VPC 10.0.0.0/16 ─────────────────────┐
│ zone a                          zone b                    │
│ public  /24  rt: 0/0 → IGW       public  /24  rt: 0/0 → IGW│
│   [NAT Gateway + EIP]                                     │
│ private /20  rt: 0/0 → NAT(a)    private /20  rt: 0/0 → NAT(a)
│              + S3 prefix list                + S3 prefix list
│ isolated /24 rt: local only      isolated /24 rt: local only
└───────────────────────────────────────────────────────────┘
```

With `natGatewayCount: 2` the only change is zone b's private route pointing at a NAT Gateway in
zone b's public subnet.

### 4.4 Outbound connectivity: one NAT Gateway, per-zone route tables from day one

**(Boris)** after the four options were laid out. The spec asks for NAT Gateway and its alternatives
to be investigated; the investigation and the numbers are in the questions doc. The decision:

- **Chosen:** one managed NAT Gateway in zone a's public subnet. Private subnets in both zones
  route `0.0.0.0/0` to it. Monthly cost in Stockholm: about 34 USD for the gateway, 3.6 USD for its
  public IPv4 address, plus 0.046 USD per gigabyte processed.
- **Accepted risk:** if zone a fails, zone b's containers stay up and keep serving requests that
  need only the database, but every outbound call (Shopify, ECR, CloudWatch) from zone b fails until
  a gateway exists in zone b. This is a development environment; the risk is documented, not
  mitigated.
- **Runbook if it happens:** set `natGatewayCount: 2` in the stage config and deploy. CloudFormation
  creates the second gateway and repoints zone b's route table; the gateway takes a few minutes to
  become available. The same change in advance is the production configuration.
- **Rejected for now:** a NAT instance (fck-nat on a `t4g.nano`, about 3 USD/month). It is a
  server to patch and monitor, a single point of failure that needs an auto scaling group and an
  interface re-attachment script to recover, has a thin baseline bandwidth, and is a community
  image rather than an AWS service. Right for hobby budgets; wrong for the production story this
  assignment asks for. The CDK switch is `natGatewayProvider: NatProvider.instanceV2(...)`, a
  handful of lines, so the decision is reversible.
- **Rejected:** containers in public subnets with public IPs and no NAT. Valid for Fargate per AWS
  docs, but it removes the private tier the spec asks for and leaves only the security group between
  a container and the internet.
- **Not an alternative, but part of the picture:** interface VPC endpoints for ECR, CloudWatch Logs,
  Secrets Manager and SQS would let containers reach those services without the NAT. At about 8 USD
  per endpoint per zone per month, the five this project will need cost more than the NAT Gateway
  they would relieve. Deferred until data volume justifies them; the S3 gateway endpoint, which is
  free, is included now.

### 4.5 Security groups: the perimeter, created here and attached later

Three security groups are created in this stack by the `PerimeterSecurityGroups` construct and
exported for Task 1.3 (load balancer, ECS service) and Task 2.1 (RDS) to attach. **(my call)**

Why here and not with the resources they protect: the spec puts security groups in this task; the
rules describe traffic *between tiers*, which is network policy, and keeping them in one construct
makes least privilege reviewable in one place and testable before any compute exists. Later stacks
pass these groups in instead of letting CDK invent permissive ones.

All three are created with `allowAllOutbound: false`. Every rule is explicit:

| Group | Inbound | Outbound |
|---|---|---|
| `alb` | TCP 80 from `0.0.0.0/0`; TCP 443 from `0.0.0.0/0` | TCP `applicationPort` to `app` |
| `app` | TCP `applicationPort` from `alb` | TCP 443 to `0.0.0.0/0` (Shopify, AWS APIs); TCP 3306 to `data` |
| `data` | TCP 3306 from `app` | none |

Notes:

- Port 80 is open on `alb` only so Task 1.3 can redirect it to 443; the listener does the redirect,
  the group just lets the request arrive.
- `app` egress is 443 only. Container DNS lookups go to the Amazon-provided VPC resolver, which
  security groups do not filter, so no rule for port 53 is needed. (That holds for the Amazon
  resolver only; a custom DHCP option set or an outbound Resolver endpoint would need a port 53
  rule. Neither is planned.) If a later phase needs another outbound port (Redis 6379 in Phase 4),
  it is added as a rule, not by loosening to allow-all.
- `data` has no outbound rules at all. A database does not initiate connections.
- The port `3306` constant lives in `perimeter-security-groups.ts` until Task 2.1 needs it too, at
  which point it moves to a file named for the concept. `applicationPort` is already shared, hence
  in the stage config.
- On a group created with `allowAllOutbound: false` and *no* egress rule at all, CDK emits a
  placeholder egress rule (`255.255.255.255/32`, ICMP type 252, "Disallow all traffic") so that
  CloudFormation does not fall back to the default allow-all. It disappears as soon as the group
  gets a real egress rule. In this design only `data` carries it; `alb` and `app` do not. It is not
  a hole, and the tests expect it on `data` only. **(after builder check)**
- Rules whose peer is a CIDR are emitted inline on the `AWS::EC2::SecurityGroup`; rules whose peer
  is another group are emitted as standalone `AWS::EC2::SecurityGroupIngress` /
  `AWS::EC2::SecurityGroupEgress` resources to avoid a dependency cycle between the two groups.
  Tests assert on both shapes.

### 4.6 VPC Flow Logs: rejected traffic only, to CloudWatch Logs

`createRejectFlowLog` enables a flow log on the VPC for `REJECT` traffic, delivered to a CloudWatch
Logs group `/commerce-intelligence/<stage>/vpc-flow-logs` with 14-day retention and a `DESTROY`
removal policy in dev. CDK creates the delivery role. **(my call)**

Why: in Task 1.3 the first thing that goes wrong with a new network is "the load balancer cannot
reach the task", and the reject log answers it in one query. Logging accepted traffic too would
cost more (health checks every few seconds) and add nothing at this stage; it is a one-word change
if ever wanted. Cost at this scale: cents.

### 4.7 Tags and naming

- Stack id and name: `commerce-intelligence-<stage>-network`.
- Tags applied at the stack level so every resource inherits them: `project=commerce-intelligence`,
  `stage=<stage>`, `managed-by=cdk`. These become cost allocation tags once Cost Explorer is enabled.
- The VPC gets `Name=commerce-intelligence-<stage>` so it reads in the console.
- Everything else keeps CDK-generated names; nothing downstream depends on a physical name.
  **(my call)**

### 4.8 What the stack exposes

`NetworkStack` exposes `readonly vpc: ec2.Vpc` and
`readonly securityGroups: { readonly alb: ec2.SecurityGroup; readonly app: ec2.SecurityGroup; readonly data: ec2.SecurityGroup }`.
Later stacks in the same CDK app take them as constructor props; CDK wires the cross-stack
references. For humans, the stack also writes `CfnOutput`s for the VPC id and the three group
ids. **(my call)**

### 4.9 Tests

All written red first. Tests synthesize the stack with `Template.fromStack` against a fixed fake
account id and the dev config; no credentials, no network. No snapshot tests: each test names the
resource type, the count and the properties it expects, so the builder has to know what each
primitive is.

**`lib/config/stage-config.spec.ts`**

| Behaviour |
|---|
| `dev` resolves to the documented values: region, two zones, CIDR, one NAT, port 3000, 14 days |
| an unknown stage throws and the message names the known stages |

**`lib/network/network-stack.spec.ts`** (the VPC shape)

| Behaviour |
|---|
| exactly one `AWS::EC2::VPC` with CIDR `10.0.0.0/16`, DNS support and hostnames enabled, the `Name` tag |
| six `AWS::EC2::Subnet` with exactly the addresses of the §4.3 table, each in its configured zone; public ones have `MapPublicIpOnLaunch: false` |
| the default security group is restricted: one `Custom::VpcRestrictDefaultSG` resource exists (and therefore the stack's IAM role count is not asserted as "one"; the flow log and this custom resource each bring a role) |
| one `AWS::EC2::InternetGateway` and one `AWS::EC2::VPCGatewayAttachment` to the VPC |
| six `AWS::EC2::RouteTable` and six `AWS::EC2::SubnetRouteTableAssociation` (one per subnet) |
| each public route table has a `0.0.0.0/0` route whose target is the Internet Gateway |
| one `AWS::EC2::NatGateway` with one `AWS::EC2::EIP`, placed in a public subnet |
| each private route table has a `0.0.0.0/0` route whose target is a NAT Gateway |
| no isolated route table has a `0.0.0.0/0` route |
| one `AWS::EC2::VPCEndpoint` of type Gateway for S3, associated with exactly the private route tables |
| with `natGatewayCount: 2`: two NAT Gateways, two EIPs, and each private route points to a different one |
| the stack carries the three tags; the reject flow log exists (delegates to the flow-log spec) |

**`lib/network/perimeter-security-groups.spec.ts`**

| Behaviour |
|---|
| three `AWS::EC2::SecurityGroup` in the VPC, none with an egress rule to `0.0.0.0/0` other than the `app` group's TCP 443 |
| `alb`: inbound TCP 80 and TCP 443 from `0.0.0.0/0` and nothing else; outbound only TCP `applicationPort` to `app` |
| `app`: inbound only TCP `applicationPort` from `alb`; outbound TCP 443 to `0.0.0.0/0` and TCP 3306 to `data`, nothing else |
| `data`: inbound only TCP 3306 from `app`; no outbound rule other than CDK's disallow-all placeholder |
| the `applicationPort` in the rules follows the value passed in (a different port yields different rules) |

**`lib/network/create-flow-log.spec.ts`**

| Behaviour |
|---|
| one `AWS::EC2::FlowLog` on the VPC with `TrafficType: REJECT` and CloudWatch Logs as destination |
| the log group has the expected name and 14-day retention |

`cdk synth` runs in the gate as well; a stack that synthesizes is the infrastructure equivalent of
a type check.

**Not automated:** that the deployed network actually passes traffic as designed. No compute exists
yet to send it. Task 1.3's first deployment is the integration test of this task, and the reject
flow log is the instrument.

### 4.10 Deploying before CI exists

- One-time: `npx cdk bootstrap aws://<account>/eu-north-1` with `AWS_PROFILE=ci-admin`. This
  creates the `CDKToolkit` stack (an S3 bucket for assets, an ECR repository, and the IAM roles CDK
  deploys through). Task 1.5's GitHub OIDC role will be allowed to assume those roles; nothing else
  changes.
- Each deploy until Task 1.5: `npm run deploy` in `infra/` (wrapping `cdk deploy`) with the same
  profile; `npm run diff` first, and the diff is read in chat before approval, the same way a pull
  request will show it later.
- The stack stays deployed once it works. The NAT Gateway costs about 1.2 USD a day while idle,
  absorbed by the account's credits; destroying and recreating between tasks is possible
  (`cdk destroy`, five minutes to rebuild) but the spec's "AWS from day one" and the value of a
  stable environment for Task 1.3 argue against it. **(my call, cost is Boris's to override)**

### 4.11 Documentation and repo hygiene

- `docs/phase-1/task-1.2-design.md` (this file) and `task-1.2-questions.md`, written after the
  code and covering the ten questions, the NAT investigation with numbers, the Terraform versus CDK
  decision, and the zone-failure analysis.
- `README.md` gains an "Infrastructure" section: prerequisites (AWS CLI, SSO profile), bootstrap,
  the infra gate, diff and deploy.
- `CLAUDE.md` gains the infra gate command and the conventions from §4.1 that differ from the app's.

## 5. Build order

One piece at a time. Each piece: show the failing test in chat → approval → write it → run it red →
show the implementation in chat → approval → write it → run it green → run the whole infra gate.

1. `infra/` package skeleton: `package.json`, lockfile, `tsconfig.json`, `vitest.config.ts`,
   `cdk.json` (feature flags taken from a fresh `cdk init` in a scratch directory), root passthrough
   scripts, `infra` excluded in the root `tsconfig.json` and both root Vitest configs, `.gitignore`
   and `.dockerignore` entries. Verify versions against the registry (`aws-cdk-lib`, `constructs`,
   `aws-cdk`, `tsx`, `vitest`) and their Node 24 support before installing. The builder check used
   `aws-cdk-lib` 2.273.0 and the `aws-cdk` CLI 2.1145.0 successfully on this machine.
2. `lib/config/stage-config.ts` with its spec.
3. `lib/network/create-vpc.ts` and the VPC half of `network-stack.spec.ts`: VPC, subnets, gateway,
   route tables, routes, NAT, S3 endpoint, the `natGatewayCount: 2` case.
4. `lib/network/perimeter-security-groups.ts` with its spec.
5. `lib/network/create-flow-log.ts` with its spec; tags; `CfnOutput`s; the stack's own spec green.
6. `bin/app.ts`; `cdk synth` in the gate; the synthesized template read in chat.
7. Bootstrap, `cdk diff`, `cdk deploy` with the SSO profile; verify with the CLI (§6); a second
   `cdk diff` reports no changes.
8. `README.md` and `CLAUDE.md` updates; then `task-1.2-questions.md`.

Commits happen when the author says so.

## 6. Done when

- In `infra/`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format` and `npm run synth`
  all pass, with no AWS session active, and the root gate still passes.
- `cdk deploy` creates `commerce-intelligence-dev-network` in `eu-north-1`; a following `cdk diff`
  reports no differences.
- The AWS CLI (profile `ci-admin`) shows: one VPC tagged `project=commerce-intelligence`; six
  subnets across `eu-north-1a` and `eu-north-1b`; one Internet Gateway attached; one NAT Gateway in
  a public subnet with an Elastic IP; six route tables with the default routes of §4.3; one S3
  gateway endpoint on the private route tables; three security groups with exactly the rules of
  §4.5; a flow log on the VPC with a `/commerce-intelligence/dev/vpc-flow-logs` log group.
- Changing `natGatewayCount` to 2 in the dev config and running `cdk diff` shows exactly one new
  NAT Gateway, one new EIP and one changed route, and nothing else; the change is reverted, not
  deployed.
- The app's `docker build` still succeeds and the image does not contain `infra/`.
- `docs/phase-1/task-1.2-questions.md` exists with answers to all ten questions.

## 7. Left to the builder

- Exact npm script names in `infra/package.json` and the root passthrough names.
- Whether `PerimeterSecurityGroups` is a `Construct` subclass or a `create*` function returning the
  three groups; either satisfies §4.5. The two `create*` functions stay functions.
- How oxlint and Prettier are invoked from `infra/` against the root configuration.
- The CDK feature-flag set in `cdk.json`, taken from the current `cdk init` output.
- Internal helper names and the order of assertions within each spec.
- Whether the `CfnOutput`s carry export names; nothing in Task 1.3 will import by name.
