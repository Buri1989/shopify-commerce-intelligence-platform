# Task 1.2 — Questions to investigate

Short answers. Alternatives and trade-offs are in `task-1.2-design.md`.

## 1. What is a VPC?

A private network inside an AWS region, owned by one account. You pick the address range and
draw the structure: subnets, route tables, gateways, security groups. Nothing gets in unless a
route and a rule allow it.

Here: `10.0.0.0/16` in `eu-north-1`, built by CDK's `Vpc` construct in
`infra/lib/network/create-vpc.ts`. Three subnet tiers across two zones, space reserved for a
third.

## 2. What is the difference between public and private subnets?

Only the route table. A public subnet routes `0.0.0.0/0` to the Internet Gateway. A private
subnet does not, so nothing in it can be reached from outside.

| Tier                      | Default route    | Lives there            |
| ------------------------- | ---------------- | ---------------------- |
| public (`/24` per zone)   | Internet Gateway | load balancer, NAT     |
| private (`/20` per zone)  | NAT              | application containers |
| isolated (`/24` per zone) | none             | database               |

Public subnets have `MapPublicIpOnLaunch: false`, so nothing gets a public address by accident.

## 3. What are route tables?

A list of "traffic to this range goes to that target", longest prefix wins. Every VPC has a
`local` route. Each subnet has exactly one table.

One table per subnet here, six in all. Public: `0.0.0.0/0 → igw`. Private: `0.0.0.0/0 → nat`
plus the S3 endpoint route. Isolated: `local` only.

## 4. What does an Internet Gateway do?

Connects the VPC to the internet. For a resource with a public IP it translates between the
private and the public address, both directions. Free, nothing to manage. Does nothing for a
resource without a public IP; that needs NAT.

## 5. What is NAT, and when is it necessary?

Network Address Translation lets private resources start connections to the internet. The NAT
has a public IP, rewrites the source address to its own and routes replies back. Nothing can be
started from outside.

Needed when a private resource must call out: Shopify's API, image pulls, AWS services without
an endpoint. Not needed for inbound traffic (the load balancer handles that) or for services
reached through endpoints.

Options, Stockholm, per month:

| Option                       | Cost                    | Trade-off                                                         |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------- |
| NAT Gateway per zone         | ~67 USD + data          | managed, survives a zone failure                                  |
| **One NAT Gateway (chosen)** | ~38 USD + data          | managed; a failure in its zone stops outbound from the other zone |
| NAT instance (`t4g.nano`)    | ~3 USD + IP             | a server to patch, single point of failure, thin bandwidth        |
| No NAT, public subnets       | ~4 USD per container IP | no private tier                                                   |

Chosen: one managed gateway with per-zone route tables, so `natGatewayCount: 2` is the whole
upgrade.

**Revisited in Task 1.3.** Dev moved to a NAT instance (CDK's provider, Amazon Linux 2023,
`t4g.micro`). The gateway stays the production answer. See `task-1.3-questions.md` §5.

## 6. Can an application running in a private subnet access Shopify APIs?

Yes. The container resolves the hostname, opens TCP 443, the route table sends it to the NAT,
the NAT forwards it through the Internet Gateway and routes the reply back. The `app` group
allows outbound 443 only.

Without NAT: no. Shopify never connects to the container; webhooks come through the load
balancer.

## 7. How can an ECS task reach AWS services without accessing the public internet?

VPC endpoints:

- **Gateway endpoints** (S3, DynamoDB): a route in the chosen tables, free. One for S3 is
  attached here, so image pulls skip the NAT fee.
- **Interface endpoints** (PrivateLink): a network interface with a private IP, about 0.011 USD
  per hour per zone each. The five this project would want cost about 80 USD a month in two
  zones, more than the NAT they relieve. They wait.

The task also needs IAM permission, which Task 1.3 adds.

## 8. Why should databases be deployed in private subnets?

A database never needs the internet. Every path that does not exist cannot be attacked. Here it
is isolated: no default route, security group accepts MySQL from `app` only, no outbound rule.
A leaked password is useless from outside the VPC.

## 9. What happens if an Availability Zone becomes unavailable?

Everything in that zone stops. The load balancer stops sending there and ECS starts
replacements in the other zone.

With one NAT in zone a, a zone a failure also cuts outbound from zone b. Fix:
`natGatewayCount: 2` and deploy; CloudFormation adds the gateway and repoints zone b's table in
minutes. That is the production setting. For the database the answer is Multi-AZ RDS
(Task 2.1).

## 10. What are the cost implications of NAT Gateways and multi-AZ architecture?

Stockholm, approximate:

| Item                      | Price                        | Per month                             |
| ------------------------- | ---------------------------- | ------------------------------------- |
| NAT Gateway               | 0.046 USD/h + 0.046 USD/GB   | ~34 USD + data                        |
| Public IPv4 address       | 0.005 USD/h                  | ~3.6 USD                              |
| Cross-zone data           | 0.01 USD/GB each way         | zone b through zone a's NAT pays this |
| Application Load Balancer | 0.024 USD/h + capacity units | ~17 USD +                             |
| Interface endpoint        | 0.011 USD/h per zone         | ~8 USD per zone each                  |

Multi-AZ doubles the per-zone items: a second NAT and IP (~38 USD), a second database
instance, more containers. Subnets, tables, gateways and groups are free. Dev as deployed:
about 38 USD a month idle. Production shape: about 75 USD before compute.

**Revisited in Task 1.3.** With the NAT instance dev costs about 10.5 USD a month.

## Why we picked what we picked

- **CDK in TypeScript over Terraform**: one language and test runner with the app; template
  tests run without credentials; CloudFormation holds the state.
- **`eu-north-1`**: EU residency, cheapest EU region, close to the developer.
- **Separate `infra/` package**: changes and deploys apart from the app; CDK stays out of the
  Docker build.
- **CDK's `Vpc` construct, configured explicitly**: every later construct wants an `IVpc`.
  Tests name every primitive by type and count.
- **Explicit availability zones**: no credentialed lookup; synth is deterministic.
- **`reservedAzs: 1`**: adding a third zone later does not renumber existing subnets.
- **Three subnet tiers**: isolated for the database, private for things that call out.
- **One route table per subnet**: a zone's routing can change alone.
- **One NAT Gateway**: managed, half the production price, one value to upgrade. See
  question 5.
- **S3 gateway endpoint now, interface endpoints later**: free against more than the NAT
  costs. See question 7.
- **Security groups created with the network**: least privilege in one place, testable before
  compute exists.
- **No allow-all outbound**: each group lists its egress; `data` has none.
- **`MapPublicIpOnLaunch: false`**: no accidental public addresses.
- **Account-agnostic, region-pinned stacks**: no account id in the repo; a wrong profile cannot
  deploy elsewhere.
- **Reject-only flow logs, 14 days**: the tool for "why can't the balancer reach the task".
  Accepted traffic would cost more.
- **Tags `project`, `stage`, `managed-by`**: cost allocation.
- **One typed stage config**: environment differences are data; `prod` sets
  `natGatewayCount: 2`.
- **Assertion tests, no snapshots**: each test names a resource and its properties.
- **Test support in `infra/test/`**: specs hold tests only.
- **Deploy from the laptop through SSO until Task 1.5**: no long-lived keys.
