# Task 1.3 — Questions to investigate

Task 1.3 asks for one investigation, EC2 versus ECS Fargate versus Lambda versus EKS, and the
general rules ask seven questions of every major technology decision. Answers reflect what was
built and deployed on 2026-10-20. The alternatives and trade-offs in full are in
`task-1.3-design.md`.

## 1. EC2, ECS Fargate, Lambda, EKS: when each fits

All four run code on AWS; they differ in what you hand over and what you keep.

**EC2** is a virtual machine. You choose the instance, install the runtime, keep the operating
system patched, decide when to add machines, and replace one when it dies. You can run anything
on it, including a database, a GPU job or a custom kernel, and at high utilisation it is the
cheapest compute per core, especially with reserved or spot pricing. The price is operations:
images to rebuild, agents to run, capacity to plan, hosts to watch. ECS can also schedule
containers onto EC2 instances you own ("ECS on EC2"), which keeps the scheduler and removes
none of the host work.

**ECS Fargate** runs a container without a host you can see. You describe the task, its CPU,
memory, image and ports, and AWS finds a place to run it, patches what is under it and bills
per vCPU-second and GB-second. There is nothing to SSH into, nothing to patch, and each task is
isolated in its own micro-VM. The limits: no GPUs, no privileged containers, a task takes
thirty to sixty seconds to start, and at full utilisation it costs about a fifth more than the
same cores on EC2.

**Lambda** runs a function for one request or event and bills per millisecond. It scales from
zero to thousands of concurrent runs without anything to configure and costs nothing while
idle, which at this project's traffic would be the cheapest option by far. The limits are
structural: a run lasts at most fifteen minutes, nothing persists between runs, long-lived
connections and background loops do not exist, and the first request after idle pays a cold
start. A NestJS app can be wrapped for it, but the long-running workers of Phase 3 and the
queue consumers of Phase 4 do not fit the model.

**EKS** is managed Kubernetes. AWS runs the control plane for about 73 USD a month and you run
the nodes, on EC2 or on Fargate, plus the ecosystem Kubernetes expects: an ingress controller,
certificate management, cluster and pod autoscalers, and a version upgrade roughly every year.
It pays off with many services, several teams, or a need to run the same workloads elsewhere.
For one service it is a second platform to learn and operate before the first container runs.

| | EC2 | ECS Fargate | Lambda | EKS |
|---|---|---|---|---|
| Unit | virtual machine | container task | function run | pod |
| You operate | OS, capacity, hosts | the task definition | the function | the cluster and its add-ons |
| Billing | per instance-hour | per task-second | per request and millisecond | control plane plus nodes |
| Idle cost here | ~6 USD, one micro | ~8 USD, one task | ~0 | ~73 USD before any node |
| Scales by | adding instances | adding tasks | itself, instantly | adding pods and nodes |
| Best for | custom needs, high steady load | long-running services, workers | events, webhooks, bursts | many services, Kubernetes skills |

This project runs one long-lived HTTP service now, workers and queue consumers later, with no
Kubernetes team and no GPU. That is the Fargate column.

## 2. ECS Fargate, the seven questions

**What problem does it solve?** Keeping a container running behind a load balancer, replacing
it when it dies, rolling out a new version without a gap, and doing all of it with no server to
own.

**Why did we choose it?** The spec names it, and §1 is why the spec is right for this shape of
system: one service, later a few workers, a small team.

**What alternatives did we consider?** The three above. Lambda was the serious one on cost; it
lost on the Phase 3 and 4 workloads.

**What are its limitations?** No GPU or privileged mode; a task boots in tens of seconds, so
scaling is not instant; a task's CPU and memory are chosen from a fixed menu; the smallest task
costs about 8 USD a month even when idle; the log driver and the image pull depend on the
network path the task sits in.

**When would we choose differently?** A webhook receiver with nothing else to do: Lambda. A
dozen services and a platform team: EKS. A workload that needs every core at full tilt all
month, or hardware Fargate does not offer: EC2.

**What could go wrong in production?** The first deploy showed the biggest one: a task that
cannot reach the registry sits in `PENDING` and then dies, and with no healthy task the service
never stabilises. Others: a task that passes its health check but misbehaves, which the circuit
breaker cannot see; subnets running out of addresses under aggressive scaling, which the `/20`
private tier is sized against; a log destination outage freezing the app, which the
non-blocking driver prevents; and the keep-alive mismatch that produces random 502s, fixed in
the app.

**How would it behave under increased load?** One task serves until its 0.25 vCPU saturates.
The next step is a scaling policy on CPU or request count, Phase 6, which adds tasks across the
two zones; the balancer spreads them without configuration. The NAT instance's bandwidth is
the first shared limit on the outbound side; the managed gateway removes it.

## 3. The image path: ECR, SHA tags, the tag as a deploy argument

**Problem.** Getting a built image to the thing that runs it, and knowing exactly which code is
running. **Choice.** A project ECR repository with immutable tags; every image tagged with the
commit it was built from; `cdk deploy -c imageTag=<sha>` names the one to run.
**Alternatives.** CDK building the image at deploy time, which lands it in the bootstrap
repository under a content hash; or the pipeline writing task definition revisions itself,
which makes two writers of one resource and `cdk diff` stop telling the truth. **Limitations.**
A first deploy needs a manual push before the service can exist; a human can type the wrong
tag, which the immutable repository turns into a "not found" rather than a silent swap.
**When differently.** A monorepo deploying twenty images per commit would want the pipeline to
stamp the tag into a parameter rather than a command line. **In production.** A tag that was
never pushed fails at task start, and the circuit breaker rolls back; the lifecycle rule keeping
twenty images bounds how far back a rollback can reach. **Under load.** Irrelevant; the
registry serves layers through the S3 endpoint at any rate.

## 4. HTTPS: an Application Load Balancer with an ACM certificate

**Problem.** One public address, TLS, health-aware routing to tasks that come and go.
**Choice.** An internet-facing ALB in the public subnets, HTTP answered only with a redirect,
a free ACM certificate for the one hostname validated through our Route 53 zone, a target
group checking `/ready` every fifteen seconds. **Alternatives.** A Network Load Balancer is
cheaper per hour but speaks TCP, so TLS would end in the app; CloudFront in front of the
balancer would give a certificate without a domain but adds a service the spec did not ask
for; a public IP per task removes the private tier. **Limitations.** The balancer is the
largest fixed cost of the environment, about 25 USD a month with its two addresses, and it
needs a domain you control for a certificate. **When differently.** Many small APIs behind
one balancer can share it with host-based rules; an internal service needs an internal
balancer with no public addresses. **In production.** The certificate renews itself as long
as the validation record stays in the zone, which CloudFormation owns; deleting the zone
record by hand breaks renewal a year later. Deregistration delay and the app's drain window
decide whether a deploy drops requests; the loop in §6 of the design saw none. **Under load.**
The balancer scales itself and bills per capacity unit; the app behind it is what needs more
tasks.

## 5. Outbound traffic: a NAT instance, and what the first deploy taught

**Problem.** Tasks in private subnets must reach ECR, CloudWatch and later Shopify, and nothing
on the internet may reach them. **Choice.** One `t4g.micro` running Amazon Linux 2023 with
CDK's NAT instance provider, no SSH, IMDSv2, Session Manager for a shell if ever needed, a
security group that accepts traffic only from inside the VPC and sends only HTTPS and HTTP out.
**Alternatives.** The managed NAT Gateway chosen in Task 1.2, which is the production answer:
self-healing, scaling to tens of gigabits, nothing to patch, at about 37 USD a month against
about 10.5. **Limitations.** One machine; if it dies, outbound traffic from both zones stops
until the network stack is redeployed, about ten minutes. Thin baseline bandwidth. An
operating system that will want patches. **When differently.** The first real user, or the
first time an outage would cost more than 27 USD a month, is the moment to flip the provider
back to the gateway, a few lines in `create-vpc.ts`.

**What went wrong, and why it is in this document.** The design said `t4g.nano`. The first
app deploy hung for twenty minutes with the task unable to reach ECR. Reading the instance's
boot log through Session Manager showed the package install killed for lack of memory: Amazon
Linux 2023 ships neither `iptables` nor `nftables`, its package manager wants more than the
nano's 418 MB, and so the one rule that makes a box a NAT, the masquerade rule, was never
written. The instance forwarded packets with their private source addresses and the internet
could not answer. A `t4g.micro` has the memory. The second lesson was subtler: CloudFormation
applies an instance type change by stopping and starting the instance, and boot-time setup
runs only on a fresh one, so changing the size alone would have produced a bigger box with the
same missing rule. The instance's CloudFormation identity now carries its type, so a size
change replaces the box. Both facts are tests now. The cost of the lesson: about 3 USD a
month and one afternoon.

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

Short reasons for each Task 1.3 decision. The alternatives and trade-offs in full are in
`task-1.3-design.md`.

- **ECS Fargate.** The spec names it, and for one long-running service with workers to come
  and no Kubernetes team it is the right fit. See §1 and §2.
- **A project ECR repository with immutable SHA tags, and the tag as a deploy argument.** The
  spec's own words for Task 1.5, and the only option that keeps CDK the single description of
  what runs: the diff shows the tag change, and a rollback is the same command with an older
  tag. Proven on 2026-10-20 with a rollover and a rollback that dropped no request.
- **Three stacks: network, registry, app.** The repository must exist before the service and
  must outlive it; the network changes on its own schedule; the app stack is the one that
  changes with every deploy.
- **Weak cross-stack references.** CDK's current default; the network stack can change what
  the app stack uses without an "export in use" deadlock, and `cdk diff` on the network stack
  is the review step that replaces the lock.
- **The 1.2 security groups imported immutable.** Handed the real groups, CDK writes duplicate
  rules into the network stack; the import attaches without touching, and a test guards that no
  rule resource exists in the app stack.
- **A NAT instance, replacing the Task 1.2 gateway.** Boris's call once the cost model showed
  the gateway was half the bill of an environment with no users. The gateway stays the
  production answer in writing, not in code. See §5.
- **`t4g.micro`, and replacement on a type change.** Learned at deploy; see §5.
- **ARM containers.** Boris's call: the Mac that builds them until Task 1.5 is ARM, Fargate on
  ARM is cheaper, and the slower emulated builds in the pipeline are ten minutes nobody waits
  on.
- **0.25 vCPU and 0.5 GB, one task, on demand.** The smallest size runs NestJS with room; two
  tasks is a one-line change; Spot would save about 5 USD and muddy the rollback story.
- **Two IAM roles, both scoped.** The execution role pulls one repository and writes one log
  group, not AWS's managed policy that pulls from anywhere; the task role exists empty so later
  phases add to it instead of inventing one.
- **Non-blocking log driver with a buffer.** A CloudWatch outage must not freeze the app;
  dropped log lines are the better failure.
- **Health check on `/ready`, every 15 s, healthy after 2, unhealthy after 3, 30-second
  deregistration.** The balancer asks about readiness; the defaults of 30 s and 300 s make a
  deploy wait minutes for nothing.
- **Rolling update at 100/200 with the circuit breaker.** The new task is healthy before the
  old one stops, even with one task, and an image that never gets healthy is rolled back by
  ECS without a human, which is the rollback Task 1.5 must demonstrate.
- **Keep-alive timeouts above the balancer's idle timeout, and one trusted proxy hop.** The
  one class of 502 that every team behind an AWS balancer meets eventually, fixed before the
  first user; and the client address survives the balancer for the rate limits of Phase 3.
- **A domain through Route 53, `.click`, auto-renew off.** The cheapest ending at 3 USD a year,
  bought in the account so the certificate and the record are created by the deploy with no
  manual step.
- **No wildcard certificate, no access logs, no deletion protection.** One name is what we
  serve; the other two are production settings with a cost and belong to Phase 6.
- **Test fixtures that read `cdk.json`.** Found during the build: a bare test `App` has no
  feature flags, and the specs were green on templates that were not the ones being deployed.
  Now tests and `cdk synth` see the same flags, by construction.
- **Deploy by hand until Task 1.5, documented in the README.** The same commands the pipeline
  will run, exercised once by a person first, so the workflow in 1.5 automates something known
  to work.
