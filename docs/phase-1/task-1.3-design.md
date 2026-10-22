# Task 1.3 — Compute and Deployment: Design

**Date:** 2026-10-20
**Branch:** `feat/task-1.3-compute-and-deployment`
**Status:** built, deployed and verified on 2026-10-20. Two things changed on the way and are
marked **(after build)** or **(after deploy)** below: the test fixtures (§4.13) and the NAT instance
size with how a size change is applied (§4.4).
**Spec:** `docs/Boris-ing.md`, section 3, Task 1.3

This document records what was decided for Task 1.3 and why. A builder should be able to implement
from it without going back to the author. Anything marked **(builder's call)** is left open on
purpose. Anything marked **(my call)** was decided by Claude during planning and can be overridden.
Anything marked **(Boris)** was decided by Boris in chat.

---

## 1. Intent

Run the application on AWS, reachable over HTTPS, deployed by one command. The image lives in a
project ECR repository tagged with the git commit it was built from. ECS Fargate runs it in the
private subnets of the Task 1.2 network. An Application Load Balancer in the public subnets
terminates TLS with an ACM certificate for `api.commerce-intelligence.click` and forwards to the
containers. Logs go to CloudWatch. The infrastructure code stays the single description of what is
running: a deploy is `cdk deploy` with an image tag, a rollback is the same command with an older
tag, and a broken image rolls back by itself.

Two things change in the network from Task 1.2 on the way: the managed NAT Gateway becomes a NAT
instance, because the gateway was half the monthly bill of an environment with no users, and the
network stack starts publishing values for the other stacks.

Nothing here is automated by GitHub Actions yet. Task 1.5 takes the manual steps documented in
§4.14 and turns them into workflows. The companion `task-1.3-questions.md` compares EC2, Fargate,
Lambda and EKS.

## 2. Goals, non-goals, anti-goals

**Goals**

- An ECR repository for the application image, tags immutable, scanned on push, images retained.
- A Fargate task definition with explicit CPU, memory and architecture, two least-privilege IAM
  roles, environment from the stage config, logs to CloudWatch.
- A Fargate service in the private subnets with rolling deployments, a circuit breaker and
  automatic rollback.
- An internet-facing load balancer with HTTP redirected to HTTPS and a health check on `/ready`.
- An ACM certificate validated through Route 53 and a DNS record for the API hostname, both
  created by the deploy.
- The NAT Gateway replaced by a NAT instance.
- The build, push and deploy procedure documented and exercised by hand until Task 1.5.
- Tests that pin every setting above, synthesized without credentials.

**Non-goals** (later tasks)

- CI/CD workflows and GitHub OIDC: Task 1.5.
- Autoscaling, alarms, dashboards, Container Insights: Phase 6.
- A database and secrets: Phase 2.
- Interface VPC endpoints, a WAF, load balancer access logs: deferred, each with a cost.
- A second environment. Only `dev` exists; production values are documented, not deployed.

**Anti-goals**

- A pipeline that writes task definition revisions behind CDK's back.
- The `ApplicationLoadBalancedFargateService` pattern construct: it invents security groups and
  listener rules; the perimeter is defined in Task 1.2 and reused as is.
- A `latest` tag, a mutable tag, or a wildcard certificate.
- AWS's managed execution-role policy, which allows pulling from every repository in the account.
- A public IP on a task, or a task in a public subnet.
- Keeping the managed NAT Gateway alive as an alternative code path **(Boris)**.

## 3. Constraints

| Constraint | Value |
|---|---|
| Account, region, profile | As in Task 1.2: `905543051584`, `eu-north-1`, `AWS_PROFILE=ci-admin`, no access keys |
| Network | `commerce-intelligence-dev-network` deployed and verified on 2026-10-20 |
| Domain | `commerce-intelligence.click`, registered through Route 53 by Boris on 2026-10-20, one year, auto-renew off **(Boris)**. The hosted zone is created by the registration; its id goes into the stage config |
| Budget | 50 USD/month. Expected cost after this task: about 44 USD/month (§4.16) |
| Architecture | Containers are ARM64 **(Boris)**. The Mac that builds them until Task 1.5 is ARM; the GitHub repository is private, so the 1.5 pipeline builds ARM under emulation |
| CDK | `aws-cdk-lib` 2.273.0, CLI 2.1145.0, the `cdk.json` feature flags from Task 1.2 |
| Process | Same as 1.2: TDD, every file shown before it is written, decisions one at a time |

## 4. Decisions

### 4.1 Compute platform

ECS Fargate. The spec names it, and it is the right fit: a single long-running HTTP service with
no host to patch, billed per task-second, with the same task definition the Phase 3 workers will
reuse. EC2, Lambda and EKS are compared in the questions doc. **(spec)**

### 4.2 Image delivery: a project ECR repository, SHA tags, the tag as a deploy argument

**(Boris, option B, then option a)** after the alternatives were laid out.

- The image is built and pushed by whoever is deploying: by hand from the developer's machine until
  Task 1.5, by GitHub Actions after. It is tagged with the full git commit SHA.
- `cdk deploy` receives the tag as a context value: `-c imageTag=<sha>`. The task definition names
  `<repository>:<sha>`. The diff shows the tag change; the deploy log shows the command; a rollback
  is the same command with an older tag.
- Without a tag the CDK app refuses to synthesize, with a message that says how to pass one. The
  gate's `synth` script passes a placeholder tag so `npm run infra:check` still needs no argument.
- The first deploy of the app stack needs an image to exist. Hence the repository has its own stack
  (§4.3) and one manual push between the two deploys.

Rejected: CDK building the image at deploy time (`DockerImageAsset`): the image lands in the CDK
bootstrap repository under a content hash, not in a project repository under a SHA, and every app
change becomes an infrastructure deploy. Rejected: the pipeline registering task definition
revisions and calling `update-service`: two writers of the same resource, and `cdk diff` stops
telling the truth.

| Repository setting | Value | Why |
|---|---|---|
| Name | `commerce-intelligence-<stage>` | one repository per stage |
| Tag mutability | immutable | a SHA tag can never be overwritten; "deploy `abc123`" always means the same bytes |
| Scan on push | on, basic scanning | free; known vulnerabilities in the base image show up in the console |
| Lifecycle | keep the last 20 images, expire the rest | storage stays at cents; rollback targets stay available |
| Removal policy | retain | deleting the stack never deletes images |
| Encryption | AWS-managed key, the default | nothing in the image is a secret |

### 4.3 Stack layout and cross-stack references

Three stacks in the one CDK app, deployed in dependency order. **(my call)**

| Stack | Holds | Lifecycle |
|---|---|---|
| `commerce-intelligence-<stage>-network` | VPC, NAT instance, perimeter security groups, flow log | exists; changed by §4.4 |
| `commerce-intelligence-<stage>-registry` | the ECR repository | created once; retained |
| `commerce-intelligence-<stage>-app` | cluster, log group, roles, task definition, service, load balancer, listeners, target group, certificate, DNS record | redeployed on every app change |

The app stack takes the network stack's `vpc` and `securityGroups` and the registry stack's
`repository` as constructor props; CDK wires the references.

**How the references are wired (after builder check).** The `cdk.json` from Task 1.2 sets
`@aws-cdk/core:defaultCrossStackReferences` to `weak`, CDK's current default. The producing stack
publishes the values as stack outputs and the consuming template carries `Fn::GetStackOutput`,
which the CDK CLI (2.1145.0 supports it) resolves at deploy time by reading those outputs. Unlike
the classic `Export`/`ImportValue` pair there is no CloudFormation lock: the network stack can
change or remove a resource the app stack uses without an "export in use" error. The trade is
that CloudFormation no longer protects against that mistake; `cdk diff` on the network stack
is the review step. Deploy order is still enforced: `cdk deploy commerce-intelligence-dev-app`
deploys its dependencies first unless `--exclusively` is passed. Verified at synth; exercised at
the first deploy. Fallback if the deploy misbehaves: set the flag to `strong` and use exports.

**Security groups are imported immutable (after builder check).** The scratch synthesis showed
that handing the load balancer and the service the real `SecurityGroup` objects from the network
stack makes CDK add rule resources to them, in the network stack's template, duplicating the
rules Task 1.2 already defines and failing at deploy. The app stack therefore imports the groups
by id with `SecurityGroup.fromSecurityGroupId(..., { mutable: false })`, and the listener is
created with `open: false`. The network stack owns every rule; the app stack only attaches.

### 4.4 The NAT: an instance instead of the managed gateway

**(Boris)** after the cost model was laid out. The managed gateway and its address cost about
37 USD a month in an environment with no users; a `t4g.micro` NAT instance costs about 10.5. The
app cannot tell the difference: the private route tables point `0.0.0.0/0` at the instance, which
rewrites the source address and forwards, exactly as the gateway did. What changes is the failure
story, documented in the questions doc: the instance is one virtual machine with thin bandwidth,
no automatic replacement and an operating system; if it dies, outbound traffic from both zones
stops until the network stack is redeployed. Accepted for a development environment. The managed
gateway is the documented production alternative and is not kept as a code path.

Built with CDK's `NatProvider.instanceV2`. Settings, all verified in the scratch synthesis:

| Setting | Value | Why |
|---|---|---|
| Instance type | `t4g.micro` from the stage config | the smallest ARM instance whose memory survives the boot-time package install; see the deploy note below |
| Image | Amazon Linux 2023, ARM | resolved through the public SSM parameter `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64` at deploy time: no context lookup, no `cdk.context.json`, the same rule as §4.2 of Task 1.2 |
| Public IP | `associatePublicIpAddress: true` | the 1.2 public subnets do not assign one on launch; a NAT needs one. An ordinary public IP, not an Elastic IP: nothing depends on it being stable |
| Source/destination check | off | set by the provider; required to forward traffic that is not addressed to the instance |
| User data | the provider's default | installs `iptables-services`, enables IP forwarding, adds the `MASQUERADE` rule, saves |
| Default traffic rules | `NatTrafficDirection.NONE` | **(after builder check)** the provider's default opens the group to all traffic from `0.0.0.0/0`; `NONE` emits no implicit rule |
| Inbound | all traffic from the VPC CIDR | packets from the private subnets, which the instance forwards |
| Outbound | TCP 443 and TCP 80 to `0.0.0.0/0` | what it forwards for the `app` group, plus the instance's own package installs and SSM agent. Adding an outbound port later means a rule here and in `app`, as 1.2 says |
| Key pair | none | no SSH. Shell access, if ever needed, is through Session Manager |
| Instance role | `AmazonSSMManagedInstanceCore` | Session Manager works over the instance's outbound 443; nothing inbound |
| Metadata service | IMDSv2 required | `InstanceRequireImdsv2Aspect` on the stack adds a launch template with `HttpTokens: required` |
| Count | `natGatewayCount` from the stage config, unchanged at 1 | the name stays: it is the number of NAT devices; 2 places one per zone |

**(after Task 1.4)** The image is no longer resolved at deploy time. Amazon publishes a new one
about weekly, so "latest" meant the NAT was replaced by whichever deploy came next and `cdk diff`
went stale within a week. The id is pinned in the stage config as `natInstanceAmiId` and moved
deliberately; see `task-1.4-design.md` §4.9. The §4.13 test of the SSM parameter became a test of
the pinned id.

What the deploy does: removes the NAT Gateway and its Elastic IP, creates the instance, its
launch template, security group, role and instance profile, and repoints the two private default
routes. Subnets, the other security groups and the endpoint are untouched. Outbound traffic is
interrupted for the minutes between the two; nothing runs in the private subnets yet.

Not asserted anywhere: that NTP from the instance works through the 443/80 egress. The Amazon
Time Sync address is link-local and is expected to bypass security group rules; if the instance
clock drifts, a UDP 123 egress rule is the fix. **(my call)**

**(after deploy, Boris: micro)** The design said `t4g.nano`. The first app deploy hung with its
tasks unable to reach ECR; the instance's boot log showed the package install killed for lack of
memory. Amazon Linux 2023 ships neither `iptables` nor `nftables`, its package manager needs more
than the nano's 418 MB, so the masquerade rule was never written. A `t4g.micro` installs it. The
second lesson: CloudFormation applies an instance type change by stopping and starting the
instance, and boot-time setup runs only on a fresh one, so the fix alone would not have reached the
box. The provider therefore appends the type to the instance's logical id (`replaceOnTypeChange`):
a type change replaces the instance. Both are pinned in `network-stack.spec.ts`.

### 4.5 The container

One Fargate task definition, one container. **(my call)**

| Setting | Value | Why |
|---|---|---|
| CPU, memory | 0.25 vCPU, 0.5 GB, from the stage config | the smallest Fargate size; NestJS idles well under 150 MB |
| Platform | Linux, ARM64 **(Boris)** | §3 |
| Image | `<repository>:<imageTag>` | §4.2 |
| Port | `applicationPort` from the stage config, 3000 | matches the `app` security group rule |
| Environment | `NODE_ENV=production`, `PORT=<applicationPort>`, `LOG_LEVEL=info` | the three variables `env.schema.ts` validates; no secrets exist yet |
| Logging | `awslogs` driver, group §4.9, stream prefix `app`, non-blocking mode, 25 MiB buffer | if CloudWatch is unreachable the app keeps serving and drops lines instead of blocking on every write |
| Container health check | none | the image has no `curl`; the load balancer's check gates traffic. Revisit for a worker without a load balancer |

Two IAM roles, both created by CDK, both assumed by `ecs-tasks.amazonaws.com`:

- **Execution role**, used by ECS to start the task: pull from the one repository
  (`ecr:BatchCheckLayerAvailability`, `BatchGetImage`, `GetDownloadUrlForLayer` on its ARN),
  `ecr:GetAuthorizationToken` on `*` because that API has no resource, and `logs:CreateLogStream`,
  `logs:PutLogEvents` on the one log group. CDK grants exactly this when the container image and
  log driver are attached. Not the managed `AmazonECSTaskExecutionRolePolicy`.
- **Task role**, used by the application at runtime: created with no permissions. Phase 2 and
  later add statements to it instead of inventing a role.

The cluster is Fargate-only with Container Insights off; it costs nothing by itself.

### 4.6 The service

| Setting | Value | Why |
|---|---|---|
| Desired count | 1, from the stage config | the cost choice; 2 spreads across the zones and is a one-line change |
| Capacity | on-demand | Spot would cut the task to about a third but may be interrupted, which muddies the 1.5 rollback demonstration; the saving is about 5 USD |
| Placement | private subnets, the `app` security group, no public IP | §4.3; image pulls and log delivery go through the NAT and the S3 endpoint |
| Rolling update | minimum healthy 100 %, maximum 200 % | the new task is started and healthy before the old one stops; no gap even with one task |
| Circuit breaker | on, with rollback | a task definition whose tasks never pass the health check is rolled back to the previous one by ECS, without a human. This is the rollback story Task 1.5 must demonstrate |
| Health check grace | 60 s | a cold start is not killed by an early failed check |
| Platform version | `LATEST` | nothing pins a feature |
| ECS Exec | off | enabled only when someone needs a shell, and then as a change |

A deploy, in order: ECS starts a task from the new task definition in a private subnet; the load
balancer checks `/ready` until it passes twice; the new task joins the target group; the old task
is deregistered, the load balancer stops sending it new requests and waits up to the
deregistration delay for in-flight ones; ECS sends `SIGTERM`; the app answers 503 on `/ready` for
five seconds and exits; after the stop timeout ECS would send `SIGKILL`. **(my call)**

### 4.7 The load balancer and target group

| Setting | Value | Why |
|---|---|---|
| Scheme, subnets, group | internet-facing, the two public subnets, the `alb` security group | 1.2's perimeter |
| Listener 80 | redirect to 443 with 301, `open: false` | the group already allows 80; the listener only redirects |
| Listener 443 | the certificate of §4.8, `open: false` | |
| TLS policy | `ELBSecurityPolicy-TLS13-1-2-PQ-2025-09` | CDK's default under the `usePostQuantumTlsPolicy` flag from 1.2's `cdk.json`: TLS 1.2 and 1.3 with post-quantum key exchange where the client supports it |
| Invalid headers | dropped | one attribute; closes a class of request-smuggling tricks |
| Deletion protection | off | dev; `cdk destroy` must work |
| Access logs | off | needs an S3 bucket and belongs with Phase 6 |
| Idle timeout | 60 s, the default | see the keep-alive note below |
| Target group | type `ip`, HTTP on `applicationPort` | Fargate tasks register by address |
| Health check | `GET /ready`, every 15 s, timeout 5 s, healthy after 2, unhealthy after 3, expect 200 | readiness is the question the balancer is asking; a task is in rotation about 30 s after it answers |
| Deregistration delay | 30 s | the default of 300 s makes every deploy wait five minutes per old task |

**Keep-alive (my call).** Node closes an idle keep-alive connection after 5 seconds; the load
balancer keeps one open for 60 and reuses it. When the two disagree the balancer occasionally
sends a request down a connection the app has just closed and the client gets a 502. The fix is
in the app, §4.10: Node's keep-alive timeout is set above the balancer's idle timeout. The two
numbers are an invariant across the two packages and are written next to each other in both.

### 4.8 Certificate and DNS

- One ACM certificate for `api.commerce-intelligence.click`, no wildcard, validated by DNS. The
  hosted zone is handed to CDK by id and name from the stage config
  (`HostedZone.fromHostedZoneAttributes`), no lookup. CDK emits the certificate with
  `DomainValidationOptions` naming the zone, so CloudFormation writes the validation record,
  waits for ACM to issue, and only then creates the listener. Verified in the scratch synthesis:
  no custom resource is involved. **(my call)**
- One Route 53 `A` alias record `api` pointing at the load balancer, in the same stack. The
  record exists only while the app stack does, which is correct: it points at nothing otherwise.
- The certificate is free and lives in `eu-north-1`, the load balancer's region.
- Prerequisite, before the app stack can deploy: the registration is complete, the registrant
  email is verified, and the zone id is in the config.

### 4.9 Logging

Log group `/commerce-intelligence/<stage>/app`, 14-day retention, destroyed with the stack in dev.
The application already writes one JSON line per event through pino, so CloudWatch Logs Insights
can filter by `level`, `requestId` or `path` without parsing. Health checks are already excluded
from the request log by the Task 1.1 middleware, so the balancer's probes cost nothing in
ingestion. **(my call)**

The retention value is shared with the flow log: `flowLogRetentionDays` becomes
`logRetentionDays` in the stage config, since both are "how long dev diagnostics are kept".
**(my call; builder's call to keep them separate if they ever diverge)**

### 4.10 Application changes

Two lines of behaviour in `configureApp`, with an e2e test. **(my call)**

- `keepAliveTimeout` on the HTTP server set to 65 000 ms and `headersTimeout` to 66 000 ms, both
  above the load balancer's 60-second idle timeout (§4.7), `headersTimeout` above
  `keepAliveTimeout` as Node requires.
- Express `trust proxy` set to `1`: the first hop, the load balancer, is trusted for
  `X-Forwarded-For` and `X-Forwarded-Proto`, so `request.ip` and anything built on it later
  (rate limits in Phase 3) see the client, not the balancer. Safe because the `app` security group
  accepts traffic from the balancer only.

The e2e spec boots through `createTestApp()` and asserts the three values on the created app.

### 4.11 Stage configuration

Added to `StageConfig` and the `dev` entry:

```ts
readonly natInstanceType: string;      // 't4g.micro'
readonly taskCpuUnits: number;         // 256, Fargate CPU units: a quarter of a vCPU
readonly taskMemoryMiB: number;        // 512
readonly desiredCount: number;         // 1
readonly logRetentionDays: number;     // 14, renamed from flowLogRetentionDays
readonly hostedZoneId: string;         // from the registration
readonly hostedZoneName: string;       // 'commerce-intelligence.click'
readonly apiDomainName: string;        // 'api.commerce-intelligence.click'
```

The image tag is never configuration: it is the one input that changes per deploy (§4.2).
`resolveImageTag(node)` in `lib/config/image-tag.ts` reads the context value and throws the
message of §4.2 when it is missing.

### 4.12 Layout, naming, tags

```
infra/
  bin/app.ts                          resolves stage and image tag; the three stacks in order
  lib/config/image-tag.ts             resolveImageTag(node)
  lib/network/create-nat-instance-provider.ts   createNatInstanceProvider(config); hardenNatInstances(provider, config); replaceOnTypeChange
  lib/registry/registry-stack.ts      RegistryStack, registryStackId(stage); exposes repository
  lib/registry/create-repository.ts   createRepository(scope, stage)
  lib/app/app-stack.ts                AppStack, appStackId(stage); exposes cluster, service, loadBalancer; importImmutable for the 1.2 groups
  lib/app/create-cluster.ts           createCluster(scope, vpc, config)
  lib/app/create-app-log-group.ts     createAppLogGroup(scope, config)
  lib/app/create-task-definition.ts   createTaskDefinition(scope, { repository, imageTag, logGroup, config }); the two roles
  lib/app/create-service.ts           createService(scope, { cluster, taskDefinition, vpc, securityGroup, config })
  lib/app/create-load-balancer.ts     createLoadBalancer(scope, { vpc, securityGroup, certificate, config }): { loadBalancer, targetGroup }
  lib/app/create-api-endpoint.ts      createApiCertificate(scope, zone, config); createApiRecord(scope, zone, loadBalancer, config)
  lib/app/create-app-outputs.ts       CfnOutputs: API URL, load balancer DNS name, cluster and service names, log group
  test/create-test-app.ts             createTestApp(): an App carrying cdk.json's context
  test/synthesize-app-stack.ts        synthesizeAppStack(config, imageTag): the three stacks in one App, returns the app Template
  test/synthesize-registry-stack.ts   synthesizeRegistryStack(config)
```

The service is created after the balancer and attached to its target group, because ECS rejects a
health check grace period on a service without one **(after build)**. Specs sit next to each file,
`beforeAll` and `it` blocks only, helpers in `test/`, the verbs from Task 1.2. Stack ids `commerce-intelligence-<stage>-registry` and `-app`; the three project tags on
every stack; the cluster, repository and log group carry readable names because humans type them
into the CLI; everything else keeps CDK names. **(my call)**

### 4.13 Tests

All written red first; synthesized against a fixed fake account and the dev config with a fixed
tag; no credentials. Every fixture builds its App with `createTestApp()`, which loads `cdk.json`'s
context, so the templates carry the same feature flags as `cdk synth` **(after build)**: without it
the cross-stack references came out as classic exports and IAM actions in another order, and tests
passed on templates that were not the deployed ones. Cross-stack references are matched with
`matchStackOutput()`.

**`lib/config/image-tag.spec.ts`**: a tag in context is returned; a missing or empty tag throws
with a message naming `-c imageTag`.

**`lib/config/stage-config.spec.ts`**: the new fields resolve to the documented values.

**`lib/network/network-stack.spec.ts`** (changes): one `AWS::EC2::Instance` of the configured type
in a public subnet, `SourceDestCheck` false, a public IP on its interface, image from the AL2023
ARM SSM parameter; no `AWS::EC2::NatGateway`, no `AWS::EC2::EIP`; each private default route
targets the instance; the NAT security group allows all traffic from the VPC CIDR inbound and only
TCP 443 and 80 outbound; a launch template requires IMDSv2; the instance role carries
`AmazonSSMManagedInstanceCore`; with `natGatewayCount: 2`, two instances and each private route
points to a different one.

**`lib/registry/create-repository.spec.ts`**: the name, immutable tags, scan on push, the
20-image lifecycle rule, retain on delete.

**`lib/app/create-task-definition.spec.ts`**: Fargate, `awsvpc`, CPU and memory from the config,
ARM64 Linux; one container with the image URI ending in the tag, the three environment variables,
the port mapping, `awslogs` with `non-blocking` and the buffer size; the execution role's policy
holds exactly the ECR pull statements on the repository, the token statement on `*`, and the two
log statements on the log group; the task role has no policy.

**`lib/app/create-service.spec.ts`**: `FARGATE` launch type, desired count from the config,
private subnets, the `app` group, public IP disabled, 100/200, circuit breaker with rollback,
grace period 60.

**`lib/app/create-load-balancer.spec.ts`**: internet-facing in the public subnets with the `alb`
group, deletion protection off, invalid headers dropped; listener 80 whose only action is a 301
redirect to 443; listener 443 with one certificate forwarding to the target group; target group of
type `ip` on the application port with the health check values and the 30-second deregistration
delay; no `SecurityGroupIngress` or `SecurityGroupEgress` resource anywhere in the app stack.

**`lib/app/create-api-endpoint.spec.ts`**: one certificate for the API name with DNS validation
naming the hosted zone id; one `A` alias record for the API name targeting the load balancer.

**`lib/app/app-stack.spec.ts`**: the three tags; the outputs; the stack depends on the network
and registry stacks.

**App, `test/behind-load-balancer.e2e-spec.ts`** **(name: builder's call)**: `keepAliveTimeout`
65 000, `headersTimeout` 66 000, `trust proxy` 1.

**Not automated:** that traffic flows end to end. §6 checks it by hand after the deploy; Task
1.5's "wait for deployment health checks" step automates the part that matters.

### 4.14 Deploying before CI exists

The manual procedure, written into the README and replaced by workflows in Task 1.5. All commands
with `AWS_PROFILE=ci-admin`, from the repository root unless noted.

1. Network and registry: `cd infra && npm run diff -- -c imageTag=none` is read, then
   `npm run deploy -- commerce-intelligence-dev-network commerce-intelligence-dev-registry -c imageTag=none`.
   The tag is irrelevant to these two stacks but the app must synthesize.
2. Build and push, where `<sha>` is `git rev-parse HEAD` of a clean tree:
   ```bash
   aws ecr get-login-password --region eu-north-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.eu-north-1.amazonaws.com
   docker build --platform linux/arm64 -t <account>.dkr.ecr.eu-north-1.amazonaws.com/commerce-intelligence-dev:<sha> .
   docker push <account>.dkr.ecr.eu-north-1.amazonaws.com/commerce-intelligence-dev:<sha>
   ```
3. App: `npm run diff -- commerce-intelligence-dev-app -c imageTag=<sha>` is read, then the same
   with `deploy`. The first deploy waits for the certificate to validate, usually a few minutes.
4. Every later app change: steps 2 and 3 with the new SHA. A rollback: step 3 with an older SHA.
5. Tear-down, for a pause: `cdk destroy commerce-intelligence-dev-app`, then the network stack if
   the pause is long; the registry stack is retained by design and costs cents.

The gate's `synth` script becomes `cdk synth -c imageTag=gate` so `npm run infra:check` needs no
argument; `diff` and `deploy` take the tag explicitly, as above. `cdk diff` with no stack name covers
all stacks; `cdk deploy --all` deploys them. A running deploy locks `cdk.out`, so a second CLI call
during one needs `--output <dir>`.

### 4.15 Documentation and repo hygiene

- This file and `task-1.3-questions.md`, written after the code: EC2 versus Fargate versus Lambda
  versus EKS with operational trade-offs, and the per-question material the build produces.
- `README.md`: the procedure of §4.14, the cost table of §4.16, tear-down, and the keep-alive
  invariant.
- `CLAUDE.md`: a "Conventions from Task 1.3" section: the tag as context, immutable group imports,
  weak references, the retention rename.
- `docs/phase-1/task-1.2-design.md`: the status line records the deploy of 2026-10-20 and points
  here for the NAT change. `task-1.2-questions.md` §5 and §10 gain a paragraph: the NAT instance
  chosen on 2026-10-20 and why the gateway remains the production answer.

### 4.16 Cost

Stockholm prices read from the AWS Price List API on 2026-10-20, 730 hours a month, before credits.

| Item | Per month, USD |
|---|---|
| NAT instance `t4g.micro`, its public IP, 8 GB disk | 10.5 |
| Application Load Balancer | 17.5 |
| Load balancer public IPs, two zones | 7.3 |
| Fargate task 0.25 vCPU, 0.5 GB, ARM, on-demand | 7.9 |
| Hosted zone | 0.5 |
| Image storage, logs, certificate, data processed | under 1 |
| **Total** | **about 44** |

Down from about 70 with the managed gateway. The domain is 3 USD a year, already paid.

## 5. Build order

One piece at a time. Each piece: show the failing test in chat → approval → write it → run it red
→ show the implementation in chat → approval → write it → run it green → run the whole gate.

1. Branch `feat/task-1.3-compute-and-deployment`. `lib/config/image-tag.ts` with its spec. The
   stage config fields of §4.11 with their spec, the `logRetentionDays` rename through the flow
   log and its spec. The real hosted zone id, read with
   `aws route53 list-hosted-zones` once the registration shows complete.
2. `lib/network/create-nat-instance-provider.ts`; `create-vpc.ts` takes the provider; the
   `network-stack.spec.ts` changes of §4.13. Gate. `cdk diff` read in chat: the gateway and its
   address removed, the instance with its launch template, group, role and profile added, two
   routes changed, nothing else. Deploy. Verify with the CLI: one running instance in the 1a
   public subnet with a public IP, no NAT Gateway, both private default routes targeting it.
3. `lib/registry/` with specs; `bin/app.ts` creates the registry stack; the gate's synth script
   passes the placeholder tag. Deploy the registry stack. Build and push the first image (§4.14
   step 2).
4. `lib/app/`, one file and spec at a time in the order of §4.12: log group, task definition,
   service, load balancer, API endpoint, outputs, then the stack and its spec, then `bin/app.ts`.
   Gate green after each.
5. The app change of §4.10 with its e2e spec; the root gate; a new image built and pushed from the
   resulting commit.
6. `cdk diff` of the app stack read in chat; deploy; the §6 checks; a second deploy with a new
   tag watched with a request loop; one rollback to the previous tag; a final `cdk diff`
   clean.
7. README, CLAUDE.md, the 1.2 doc updates, then `task-1.3-questions.md`.

Commits happen when the author says so.

## 6. Done when

- `npm run infra:check` and the root gate pass with no AWS session.
- `curl -i https://api.commerce-intelligence.click/health` returns 200 and `{"status":"ok"}`;
  `/ready` returns 200 with the terminus body; `curl -i http://api.commerce-intelligence.click/`
  returns 301 to the HTTPS URL; the certificate is issued by Amazon for exactly that name and the
  connection negotiates TLS 1.3.
- The CLI shows: the ECS service with 1 running task of the current task definition, the task in
  a private subnet with no public IP and the `app` group; one healthy target; the task definition
  with 256/512, ARM64, the three environment variables and the `awslogs` non-blocking options; the
  log group `/commerce-intelligence/dev/app` receiving JSON lines from the container, including
  the Nest startup lines; the repository with the pushed SHA tags, immutable, scanned.
- The network: no NAT Gateway, no Elastic IP; one running `t4g.micro` with a public IP, source
  check off, IMDSv2 required; both private default routes target it; its group has the three
  rules of §4.4 and nothing else. The reject flow log shows no rejected traffic between the load
  balancer and the task.
- A deploy with a new tag replaces the task with zero failed requests in a one-second `curl` loop
  during the rollover; a deploy of the previous tag does the same in reverse.
- `cdk diff -c imageTag=<deployed sha>` reports no differences.
- Cost Explorer or the billing page shows the daily rate in line with §4.16 once a full day has
  passed.
- `docs/phase-1/task-1.3-questions.md` exists.

## 7. Left to the builder

- Exact file and function names inside `lib/app/` beyond the verbs; whether `createLoadBalancer`
  returns the listener and target group alongside the balancer.
- The placeholder tag value in the gate's synth script.
- The e2e spec's file name for the proxy settings; whether the three assertions share one `it`.
- The exact set and names of the app stack's `CfnOutput`s.
- The order of assertions within each spec.
- Whether `hardenNatInstances` is a second function or folded into the provider factory; the
  design only requires that the rules, the policy and the aspect exist.
