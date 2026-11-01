# Task 1.3 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Task 1.3 asks
for one investigation, EC2 against ECS Fargate against Lambda against EKS, and the general rules
ask seven questions of each decision. Deployed 2026-10-20. Alternatives and trade-offs are in
`task-1.3-design.md`.

## 1. EC2, ECS Fargate, Lambda, EKS: when each fits

Four ways to run code on AWS:

- **EC2**: a virtual machine. We would install and patch the operating system, plan how much
  capacity to buy, and replace a machine that dies. The cheapest per core when it is busy all
  the time. It runs anything, GPUs included.
- **ECS Fargate**: a container with no machine we can see. We describe the task, the container
  and its size; AWS runs it, patches what is under it, and bills per vCPU-second. No GPUs, no
  privileged mode, 30 to 60 seconds to start, about a fifth dearer than EC2 when fully used.
- **Lambda**: a function that runs once per event, billed per millisecond, free while idle. A
  run may last at most 15 minutes, nothing is kept between runs, and the first call after a
  pause is slow, a cold start. The Phase 3 workers and the Phase 4 queue consumers do not fit.
- **EKS**: managed Kubernetes. About 73 USD a month for the control plane, plus the nodes, an
  ingress, autoscalers and a yearly upgrade. It pays off with many services or many teams.

|                | EC2                 | ECS Fargate         | Lambda             | EKS                   |
| -------------- | ------------------- | ------------------- | ------------------ | --------------------- |
| Unit           | virtual machine     | container task      | function run       | pod                   |
| You operate    | OS, capacity        | the task definition | the function       | cluster and add-ons   |
| Billing        | per instance-hour   | per task-second     | per request and ms | control plane + nodes |
| Idle cost here | ~6 USD              | ~8 USD              | ~0                 | ~73 USD before nodes  |
| Best for       | custom, steady load | services, workers   | events, bursts     | many services         |

This project: one long-lived HTTP service, workers later, no Kubernetes team, no GPU. Fargate.

## 2. ECS Fargate, the seven questions

- **What problem does it solve?** Keep a container running behind a load balancer, replace it
  when it dies, roll out a new version without a gap, and own no server.
- **Why did we choose it?** The spec names it, and §1 says why it fits.
- **What alternatives did we consider?** The three above. Lambda lost on the Phase 3 and 4
  workloads.
- **What are its limitations?** No GPU or privileged mode; tens of seconds to boot; CPU and
  memory come from a fixed menu of sizes; about 8 USD a month while idle; pulling the image and
  writing logs depend on the task's network path.
- **When would we choose differently?** A webhook receiver alone: Lambda. A dozen services and
  a platform team: EKS. Full cores all month, or special hardware: EC2.
- **What could go wrong in production?** A task that cannot reach the image registry stays
  `PENDING` and dies; we saw this on the first deploy. A task that passes the health check but
  misbehaves. Subnets running out of addresses. A log outage freezing the app, which the
  non-blocking log driver prevents. 502 errors from the keep-alive timeout, fixed in the app.
- **How does it behave under increased load?** One task until its quarter of a vCPU is
  saturated; then a scaling policy, Phase 6, adds tasks across the zones. The NAT instance's
  bandwidth is the first limit on outgoing traffic.

## 3. The image path: ECR, SHA tags, the tag as a deploy argument

- **Problem**: get the image, the packaged app, to the machine that runs it, and know which code
  is running.
- **Choice**: a project repository in ECR, AWS's image registry, with tags that cannot be
  overwritten; every image tagged with the commit it was built from; the deploy told which one
  to run with `cdk deploy -c imageTag=<sha>`.
- **Alternatives**: CDK building the image at deploy time, into its bootstrap repository under
  a content hash; the pipeline writing task definitions itself, which makes two writers, so
  `cdk diff` stops telling the truth.
- **Limitations**: the first deploy needs a manual push; a wrong tag fails with "not found".
- **When differently**: a monorepo with twenty images would stamp the tag into a parameter
  instead.
- **In production**: a tag that was never pushed fails at start and the circuit breaker rolls
  back; the lifecycle rule keeps the last twenty images.
- **Under load**: not affected; the image layers come through the S3 endpoint.

## 4. HTTPS: an Application Load Balancer with an ACM certificate

- **Problem**: one public address, TLS, and routing to tasks that come and go.
- **Choice**: an internet-facing Application Load Balancer in the public subnets; HTTP redirects
  to HTTPS; a free certificate from ACM, AWS's certificate service, validated through Route 53;
  the target group checks `/ready` every 15 seconds.
- **Alternatives**: a Network Load Balancer (TCP only, so TLS would be done in the app);
  CloudFront (an extra service); a public IP per task (no private tier).
- **Limitations**: the largest fixed cost, about 25 USD a month; it needs a domain.
- **When differently**: many APIs would share one balancer with host rules; an internal service
  would get an internal balancer.
- **In production**: the certificate renews itself while the validation record stays in the
  zone. The deregistration delay and the app's drain window decide whether a deploy drops
  requests; none dropped.
- **Under load**: the balancer scales itself; the app needs more tasks.

## 5. Outbound traffic: a NAT instance, and what the first deploy taught

- **Problem**: the private tasks must reach ECR, CloudWatch and Shopify; nothing must reach
  them.
- **Choice**: one `t4g.micro` server with Amazon Linux 2023, made by CDK's NAT provider; no
  SSH; IMDSv2, the safer way for a server to read its own metadata; Session Manager for access;
  a security group that accepts traffic from the VPC only and sends HTTPS and HTTP out.
- **Alternatives**: the managed gateway from Task 1.2, the production answer, about 37 USD
  against 10.5.
- **Limitations**: one machine; if it dies, outgoing traffic stops until the network stack is
  redeployed, about ten minutes. Thin bandwidth. An operating system to patch.
- **When differently**: at the first real user, or when an outage costs more than the 27 USD a
  month saved. The switch back is the provider in `create-vpc.ts`.

**What went wrong.** The design said `t4g.nano`. The first deploy hung: the task could not reach
ECR. The boot log of the server showed the package install killed for lack of memory, so the
rule that rewrites addresses was never written. `t4g.micro` has the memory. Second lesson:
CloudFormation applies a change of instance type by stopping and starting the machine, and the
boot setup runs only on a fresh machine. The instance's logical id now carries its type, so a
size change replaces the machine. Both are tests now.

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

- **ECS Fargate.** The spec names it; it fits one service with workers to come. §1 and §2.
- **ECR, immutable SHA tags, the tag as a deploy argument.** CDK stays the one description of
  what runs; a rollback is the same command with an older tag. Proven 2026-10-20, no dropped
  request.
- **Three stacks.** The registry outlives the service; the network changes on its own schedule;
  the app changes on every deploy.
- **Weak cross-stack references.** A stack reads another stack's values without CloudFormation
  locking the two together, so there is no "export in use" deadlock; `cdk diff` on the network
  stack is the review.
- **The 1.2 security groups imported as immutable.** Otherwise CDK would write duplicate rules;
  a test guards that the app stack holds no rule.
- **The NAT instance replacing the gateway.** Boris's call once the gateway was half the bill.
  The gateway stays the production answer. §5.
- **`t4g.micro`, replaced on a type change.** Learned at deploy. §5.
- **ARM containers.** The Mac that builds is ARM, and Fargate on ARM is cheaper.
- **0.25 vCPU, 0.5 GB, one task, on demand.** The smallest size with room; Spot pricing would
  muddy the rollback.
- **Two scoped IAM roles.** The execution role, which ECS uses to start the task, may pull one
  repository and write one log group; the task role, which the app itself uses, is empty until
  later phases.
- **The non-blocking log driver.** A CloudWatch outage must not freeze the app.
- **Health check on `/ready`, every 15 s, healthy after 2, unhealthy after 3, 30 s
  deregistration.** The defaults make a deploy wait minutes.
- **Rolling deploy 100/200 with the circuit breaker.** The new task is healthy before the old
  one stops; a bad image rolls back without a human.
- **Keep-alive above the balancer's idle timeout, one trusted proxy hop.** Avoids the classic
  502; the client's address survives for the Phase 3 rate limits.
- **A Route 53 domain, `.click`, auto-renew off.** Cheapest at 3 USD a year; the certificate and
  the DNS record are created by the deploy.
- **No wildcard certificate, access logs or deletion protection.** Production settings, Phase 6.
- **Test fixtures read `cdk.json`.** A bare test App has no feature flags; the tests were green
  on the wrong templates.
- **Deploy by hand until Task 1.5.** The pipeline automates something known to work.
