# Task 1.2 — Questions to investigate

Answers reflect the network built in this task. The alternatives and trade-offs are in
`task-1.2-design.md`.

## 1. What is a VPC?

A Virtual Private Cloud is a private network inside an AWS region that belongs to one account:
a range of private IP addresses, isolated from every other customer, inside which you draw the
structure yourself. Subnets slice the range per availability zone, route tables decide where
traffic from each subnet goes, gateways connect it to the outside, and security groups filter
traffic per resource. Nothing outside reaches anything inside unless a route and a rule allow it.

Here: `10.0.0.0/16` in `eu-north-1`, built by CDK's `Vpc` construct from an explicit
configuration (`infra/lib/network/create-vpc.ts`), with three tiers of subnets across two zones
and address space held back for a third.

## 2. What is the difference between public and private subnets?

Only the route table. A public subnet has a route for `0.0.0.0/0` that points at the Internet
Gateway, so a resource in it with a public IP can be reached from the internet and reach it. A
private subnet has no such route; its resources have private addresses only and are unreachable
from outside no matter what their security group says.

This network has three kinds:

| Tier                      | Default route    | Lives there                             |
| ------------------------- | ---------------- | --------------------------------------- |
| public (`/24` per zone)   | Internet Gateway | load balancer nodes, the NAT Gateway    |
| private (`/20` per zone)  | NAT Gateway      | application containers                  |
| isolated (`/24` per zone) | none             | database, later cache                   |

Public subnets are also created with `MapPublicIpOnLaunch: false`, so nothing placed there gets
a public address by accident; the load balancer and the NAT Gateway ask for theirs explicitly.

## 3. What are route tables?

A route table is the list of rules "traffic to this destination range goes to that target",
evaluated by longest prefix match. Every VPC has an implicit `local` route for its own range.
Each subnet is associated with exactly one table; one table can serve many subnets.

This stack creates one table per subnet, six in all, so a zone's routing can change on its own.
The public tables add `0.0.0.0/0 → igw`, the private tables add `0.0.0.0/0 → nat` plus the S3
prefix list route from the gateway endpoint, and the isolated tables have the `local` route only.
The test `routes private subnets to the NAT Gateway` follows subnet → association → table → route
exactly the way the VPC does.

## 4. What does an Internet Gateway do?

It is the VPC's connection to the internet: a horizontally scaled, redundant AWS component that
you attach to the VPC once. For a resource that has a public IP, it translates one-to-one
between the private address inside the VPC and the public address outside, in both directions.
It has no capacity to manage and no cost. It does nothing for a resource without a public IP,
which is why private subnets need NAT.

## 5. What is NAT, and when is it necessary?

Network Address Translation lets resources that have only private addresses start connections
to the internet. The NAT device has a public IP in a public subnet. For each outgoing
connection it rewrites the source address to its own, remembers the connection in a table, and
rewrites replies back to the private address. The internet only ever sees the NAT; connections
cannot be started from outside because the table only holds connections started inside.

It is necessary when something in a private subnet must _initiate_ an internet connection:
calling Shopify's API, pulling a container image from a public registry, sending logs to an AWS
service that has no VPC endpoint. It is not necessary for inbound traffic (that is the load
balancer's job through the Internet Gateway) or for AWS services reached through endpoints.

The investigation the task asked for, priced for Stockholm per month:

| Option                                 | Cost                                   | Trade-off                                                                                                                                                         |
| -------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NAT Gateway per zone                   | ~67 USD + data                         | managed, survives a zone failure                                                                                                                                  |
| **One NAT Gateway (chosen)**           | ~34 USD + 3.6 USD for its IP + data    | managed; a zone failure in its zone stops outbound traffic from the other zone until a second one is deployed                                                     |
| NAT instance (fck-nat, `t4g.nano`)     | ~3 USD + IP                            | a Linux server you patch and monitor, a single point of failure that needs an auto scaling group to recover, thin baseline bandwidth, community image            |
| No NAT, containers in public subnets   | ~4 USD per container IP                | removes the private tier; only the security group separates a container from the internet                                                                        |

Chosen: one managed gateway now, with per-zone route tables so that `natGatewayCount: 2` in the
stage config is the whole upgrade. The instance is the right answer for hobby budgets and the
wrong one for a production story; the public-subnet pattern is valid for Fargate but gives up
what this task exists to build.

**Revisited in Task 1.3 (2026-10-20).** Once the cost model was laid out for an environment with
no users, Boris chose the NAT instance for dev: CDK's own provider on Amazon Linux 2023, no
community image, a `t4g.micro` after a `t4g.nano` proved too small to install its own rule. The
managed gateway stays the production answer. The story is in `task-1.3-questions.md` §5.

## 6. Can an application running in a private subnet access Shopify APIs?

Yes. The container resolves `*.myshopify.com` through the VPC's resolver, opens a TCP 443
connection, its subnet's route table sends the packet to the NAT Gateway, the gateway swaps the
source address for its public IP and forwards through the Internet Gateway, and the reply comes
back through the gateway's connection table. The `app` security group allows exactly that
outbound port and nothing else, so the container can call Shopify and AWS APIs but not, for
example, send mail or reach an arbitrary port.

Without the NAT Gateway the answer is no: the container has no public address and the Internet
Gateway cannot translate for it. Shopify, for its part, never connects _to_ the container;
webhooks arrive through the load balancer, and from Phase 4 through EventBridge.

## 7. How can an ECS task reach AWS services without accessing the public internet?

Through VPC endpoints, which put an AWS service inside the VPC's routing:

- **Gateway endpoints** (S3 and DynamoDB only) add a route for the service's address ranges to
  the chosen route tables. They are free. This stack attaches one for S3 to the private route
  tables; ECR stores image layers in S3, so image pulls bypass the NAT Gateway's per-gigabyte
  fee.
- **Interface endpoints** (PrivateLink) create a network interface with a private IP in your
  subnets for a service, with private DNS so the normal service hostname resolves to it. They
  cost about 0.011 USD per hour per zone each, plus data. The five this project will want (ECR
  API, ECR Docker, CloudWatch Logs, Secrets Manager, SQS) in two zones come to about 80 USD a
  month, more than the NAT Gateway they would relieve, so they wait until data volume justifies
  them. Each would also need the `app` group to be allowed TCP 443 to the endpoint's group.

The task also needs permission, not just a path: in Task 1.3 the task role grants the specific
API actions, and the traffic stays on the AWS network either way once endpoints exist.

## 8. Why should databases be deployed in private subnets?

Because a database has no business talking to the internet in either direction, and every
path that does not exist cannot be attacked. In this network the database tier is _isolated_,
one step further than private: its route tables have no default route at all, so even a
compromised database could not send data out, and its security group accepts only MySQL from
the `app` group and has no outbound rule. A leaked password is then useless from outside the
VPC. It also keeps the database out of the NAT Gateway's bill and, for merchant data, inside
the region.

## 9. What happens if an Availability Zone becomes unavailable?

Everything placed in that zone stops: the containers there, that zone's load balancer node, and
the NAT Gateway if it is there. The load balancer stops sending to the failed targets, ECS
starts replacement tasks in the surviving zone's private subnet, and requests that only need the
database keep working.

With this task's single NAT Gateway in zone a, a zone a failure also cuts outbound traffic from
zone b: its containers are up but every call to Shopify or AWS APIs hangs. The runbook is to set
`natGatewayCount: 2` and deploy; CloudFormation adds a gateway in zone b and repoints zone b's
route table within a few minutes. Making that change in advance is the production
configuration, and it is why each zone has its own route table from day one. The same question
returns in Task 2.1 for the database, where the answer is Multi-AZ RDS.

## 10. What are the cost implications of NAT Gateways and multi-AZ architecture?

Stockholm list prices, approximate:

| Item                                                 | Price                                   | Per month                                              |
| ---------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| NAT Gateway                                          | 0.046 USD/h + 0.046 USD/GB processed    | ~34 USD + data                                         |
| Public IPv4 address (each, including the gateway's)  | 0.005 USD/h                             | ~3.6 USD                                               |
| Cross-zone data transfer                             | 0.01 USD/GB each way                    | zone b traffic through zone a's gateway pays this too  |
| Application Load Balancer                            | 0.024 USD/h + capacity units            | ~17 USD +                                              |
| Interface endpoint                                   | 0.011 USD/h per zone each               | ~8 USD per zone each                                   |

Multi-AZ doubles the per-zone items: a second NAT Gateway and its address (~38 USD), a second
database instance for Multi-AZ RDS (double the instance price), one more node of anything that
runs per zone. Subnets, route tables, gateways and security groups themselves cost nothing, so
the two-zone layout is free; only the redundant _things inside it_ cost. This stack as deployed
for development costs about 38 USD a month idle; the production shape of the same stack about
75 USD before any compute.

**Revisited in Task 1.3.** With the NAT instance the development network costs about 10.5 USD a
month instead of 38; the production shape is unchanged.

## Why we picked what we picked

Short reasons for each Task 1.2 decision. The alternatives and trade-offs in full are in
`task-1.2-design.md`.

- **AWS CDK in TypeScript over Terraform.** One language, linter, formatter and test runner
  with the app; assertion tests on the synthesized template run in milliseconds without
  credentials, which fits test-first; CloudFormation holds the state. Terraform is more
  common in the market and teaches state management, at the cost of a second language in the
  gate and a state file to protect.
- **`eu-north-1` over Frankfurt or Virginia.** Merchant data stays in the EU, it is the
  cheapest EU region, and it is close to the developer. Virginia saves a few dollars a month;
  Frankfurt costs about a fifth more for the same residency.
- **A separate `infra/` package, not a workspace and not files in the app package.**
  Infrastructure and application change for different reasons and deploy through different
  pipelines; CDK's dependencies must not enter the app's build context; the Dockerfile's
  `npm ci` stays simple.
- **CDK's high-level `Vpc` construct, configured explicitly, over hand-built `Cfn*`
  resources.** Every later construct wants an `IVpc`; hand-built subnets would be re-imported
  in every stack. The risk of hidden primitives is covered by tests that name every primitive
  by type and count, and by reading the synthesized template before deploying.
- **Explicit availability zones over `maxAzs` discovery.** Discovery is a credentialed
  context lookup; an explicit list, verified against the account, makes synthesis
  deterministic in tests, in the gate and in CI.
- **`reservedAzs: 1`.** The allocator numbers subnets tier by tier; reserving a third zone's
  space now means adding it later does not renumber, and therefore replace, the subnets that
  exist.
- **Three subnet tiers, not two.** An isolated tier with no default route at all is the right
  home for a database; "private with NAT" is for things that must call out.
- **One route table per subnet.** A zone's routing can change on its own, which is exactly
  what the NAT-per-zone upgrade needs.
- **One NAT Gateway over one per zone, a NAT instance, or containers in public subnets.**
  Managed, half the production price, and the upgrade is one configuration value. The
  instance saves thirty dollars for a server to patch and a failover to build; public subnets
  remove the private tier. See question 5.
- **S3 gateway endpoint now, interface endpoints later.** The gateway endpoint is free and
  takes image pulls off the NAT; the five interface endpoints this project would want cost
  more than the NAT Gateway they relieve. See question 7.
- **Security groups created with the network and attached later.** The rules describe
  traffic between tiers; one place makes least privilege reviewable and testable before any
  compute exists, and later stacks pass these groups in instead of letting CDK invent
  permissive ones.
- **No allow-all outbound anywhere.** Each group lists its egress; `data` has none; the VPC's
  default group is stripped of its implicit allow. A later port is a new rule, not a loosened
  one.
- **`MapPublicIpOnLaunch: false` on the public subnets.** Nothing gets a public address by
  accident; the load balancer and the NAT Gateway ask for theirs.
- **Account-agnostic, region-pinned stacks.** Pinning the account forces a credentialed lookup
  at every synth or an account id in the repository; pinning the region stops a wrong profile
  from deploying elsewhere. A zone typo surfaces at deploy instead of synth, which is
  acceptable.
- **Reject-only flow logs to CloudWatch, 14 days, one-minute aggregation.** The instrument
  for "why can't the load balancer reach the task" in Task 1.3. Accepted traffic would mostly
  be health checks and cost more; the log group goes with the stack because it is a
  development diagnostic.
- **Stack-level tags `project`, `stage`, `managed-by`.** Every resource inherits them, and
  they become cost allocation tags once Cost Explorer is on.
- **One typed stage config object, selected by CDK context.** Environment differences are
  data, not branches inside constructs; `prod` is a second entry with `natGatewayCount: 2`.
- **Template assertion tests, no snapshots.** Snapshots break on every change and prove
  nothing specific; each test names a resource type, a count and the properties it expects,
  following subnet → association → route table → route the way the VPC does.
- **Test support in `infra/test/`, specs hold tests only.** Query helpers and stack fixtures
  are shared modules; a spec file reads as a list of behaviours.
- **Deploy from the developer machine through SSO until Task 1.5.** No long-lived keys
  anywhere; the OIDC role later assumes the same bootstrap roles. The first deploy is
  deferred to the start of Task 1.3 so an idle gateway is not paid for in between.
