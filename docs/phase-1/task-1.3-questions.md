# Task 1.3 — Questions to investigate

Short answers. Task 1.3 asks for one investigation, EC2 against ECS Fargate against Lambda
against EKS, and the general rules ask seven questions of each decision. Deployed 2026-10-20.
Alternatives and trade-offs are in `task-1.3-design.md`.

## 1. EC2, ECS Fargate, Lambda, EKS: when each fits

- **EC2**: a virtual machine. You patch the OS, plan capacity, replace dead hosts. Cheapest per
  core at high use. Runs anything, GPUs included.
- **ECS Fargate**: a container with no host you can see. You describe the task; AWS runs and
  patches under it, bills per vCPU-second. No GPUs, no privileged mode, 30 to 60 seconds to
  start, about a fifth dearer than EC2 at full use.
- **Lambda**: a function per event, billed per millisecond, free while idle. At most 15 minutes
  a run, nothing persists, cold starts. The Phase 3 workers and Phase 4 queue consumers do not
  fit.
- **EKS**: managed Kubernetes. About 73 USD a month for the control plane, plus nodes, ingress,
  autoscalers and a yearly upgrade. Pays off with many services or teams.

|                | EC2                 | ECS Fargate         | Lambda             | EKS                   |
| -------------- | ------------------- | ------------------- | ------------------ | --------------------- |
| Unit           | virtual machine     | container task      | function run       | pod                   |
| You operate    | OS, capacity        | the task definition | the function       | cluster and add-ons   |
| Billing        | per instance-hour   | per task-second     | per request and ms | control plane + nodes |
| Idle cost here | ~6 USD              | ~8 USD              | ~0                 | ~73 USD before nodes  |
| Best for       | custom, steady load | services, workers   | events, bursts     | many services         |

This project: one long-lived HTTP service, workers later, no Kubernetes team, no GPU. Fargate.

## 2. ECS Fargate, the seven questions

- **Problem**: keep a container running behind a load balancer, replace it when it dies, roll
  out without a gap, own no server.
- **Why**: the spec names it, and §1 says why it fits.
- **Alternatives**: the three above. Lambda lost on the Phase 3 and 4 workloads.
- **Limitations**: no GPU or privileged mode; tens of seconds to boot; CPU and memory from a
  fixed menu; about 8 USD a month idle; image pull and logs depend on the task's network path.
- **When differently**: a webhook receiver alone: Lambda. A dozen services and a platform
  team: EKS. Full cores all month or special hardware: EC2.
- **What could go wrong**: a task that cannot reach the registry stays `PENDING` and dies (seen
  on the first deploy); a task healthy but misbehaving; subnets out of addresses; a log outage
  freezing the app (non-blocking driver); keep-alive 502s (fixed in the app).
- **Under load**: one task until 0.25 vCPU saturates, then a scaling policy (Phase 6) adds tasks
  across zones. The NAT instance's bandwidth is the first outbound limit.

## 3. The image path: ECR, SHA tags, the tag as a deploy argument

- **Problem**: get the image to the runner and know which code runs.
- **Choice**: a project ECR repository with immutable tags, every image tagged with its commit,
  `cdk deploy -c imageTag=<sha>`.
- **Alternatives**: CDK building at deploy time (bootstrap repository, content hash); the
  pipeline writing task definitions itself (two writers, `cdk diff` stops telling the truth).
- **Limitations**: the first deploy needs a manual push; a wrong tag fails as "not found".
- **When differently**: a monorepo with twenty images would stamp the tag into a parameter.
- **In production**: a tag never pushed fails at start and the circuit breaker rolls back; the
  lifecycle rule keeps twenty images.
- **Under load**: irrelevant; layers come through the S3 endpoint.

## 4. HTTPS: an Application Load Balancer with an ACM certificate

- **Problem**: one public address, TLS, routing to tasks that come and go.
- **Choice**: internet-facing ALB in the public subnets, HTTP redirects to HTTPS, free ACM
  certificate validated through Route 53, target group checks `/ready` every 15 s.
- **Alternatives**: NLB (TCP only, TLS in the app); CloudFront (an extra service); a public IP
  per task (no private tier).
- **Limitations**: the largest fixed cost, about 25 USD a month; needs a domain.
- **When differently**: many APIs share one balancer with host rules; an internal service gets
  an internal balancer.
- **In production**: the certificate renews while the validation record stays in the zone.
  Deregistration delay and the app's drain window decide whether a deploy drops requests; none
  dropped.
- **Under load**: the balancer scales itself; the app needs more tasks.

## 5. Outbound traffic: a NAT instance, and what the first deploy taught

- **Problem**: private tasks must reach ECR, CloudWatch and Shopify; nothing reaches them.
- **Choice**: one `t4g.micro`, Amazon Linux 2023, CDK's NAT provider, no SSH, IMDSv2, Session
  Manager, a group that accepts VPC traffic only and sends HTTPS and HTTP out.
- **Alternatives**: the managed gateway from Task 1.2, the production answer, about 37 USD
  against 10.5.
- **Limitations**: one machine; if it dies, outbound stops until the network stack redeploys,
  about ten minutes. Thin bandwidth. An OS to patch.
- **When differently**: the first real user, or when an outage costs more than 27 USD a month.
  Flip the provider back in `create-vpc.ts`.

**What went wrong.** The design said `t4g.nano`. The first deploy hung: the task could not
reach ECR. The boot log showed the package install killed for lack of memory, so the masquerade
rule was never written. `t4g.micro` has the memory. Second lesson: CloudFormation applies a type
change by stop and start, and boot setup runs only on a fresh instance. The instance's logical
id now carries its type, so a size change replaces it. Both are tests now.

## 6. The request path, as deployed

```
client ──HTTPS──▶ api.commerce-intelligence.click
                     │  Route 53 alias
                     ▼
            Application Load Balancer          public subnets, zones a and b
            :80 → 301 to :443                   alb group: 80 and 443 from anywhere
            :443, ACM certificate, TLS 1.3
                     │  target group, /ready every 15 s
                     ▼
            Fargate task 0.25 vCPU / 0.5 GB     private subnet, no public IP
            app container :3000                 app group: 3000 from alb only
                     │                          443 out via the NAT instance
                     │                          image layers via the S3 endpoint
                     ▼
            CloudWatch Logs /commerce-intelligence/dev/app
```

## Why we picked what we picked

- **ECS Fargate**: the spec names it; fits one service with workers to come. See §1 and §2.
- **ECR, immutable SHA tags, tag as a deploy argument**: CDK stays the one description of what
  runs; rollback is the same command with an older tag. Proven 2026-10-20, no dropped request.
- **Three stacks**: the registry outlives the service; the network changes on its own schedule;
  the app changes every deploy.
- **Weak cross-stack references**: no "export in use" deadlock; `cdk diff` on the network stack
  is the review.
- **1.2 security groups imported immutable**: CDK would otherwise write duplicate rules; a test
  guards that the app stack holds no rule.
- **NAT instance replacing the gateway**: Boris's call once the gateway was half the bill. The
  gateway stays the production answer. See §5.
- **`t4g.micro`, replaced on a type change**: learned at deploy. See §5.
- **ARM containers**: the Mac that builds is ARM, and Fargate on ARM is cheaper.
- **0.25 vCPU, 0.5 GB, one task, on demand**: the smallest size with room; Spot would muddy the
  rollback.
- **Two scoped IAM roles**: the execution role pulls one repository and writes one log group;
  the task role is empty for later phases.
- **Non-blocking log driver**: a CloudWatch outage must not freeze the app.
- **Health check on `/ready`, 15 s, healthy after 2, unhealthy after 3, 30 s deregistration**:
  the defaults make a deploy wait minutes.
- **Rolling 100/200 with the circuit breaker**: the new task is healthy before the old stops; a
  bad image rolls back without a human.
- **Keep-alive above the balancer's idle timeout, one trusted proxy hop**: avoids the classic
  502; the client address survives for Phase 3 rate limits.
- **Route 53 domain, `.click`, auto-renew off**: cheapest at 3 USD a year; certificate and
  record created by the deploy.
- **No wildcard certificate, access logs or deletion protection**: production settings,
  Phase 6.
- **Test fixtures read `cdk.json`**: a bare test App has no feature flags; tests were green on
  the wrong templates.
- **Deploy by hand until Task 1.5**: the pipeline automates something known to work.
