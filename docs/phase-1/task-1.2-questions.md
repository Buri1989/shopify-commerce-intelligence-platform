# Task 1.2 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Alternatives and
trade-offs are in `task-1.2-design.md`.

## 1. What is a VPC?

A VPC, a virtual private cloud, is a private network inside an AWS region that belongs to one
account. We pick its address range and draw its structure: subnets, route tables, gateways,
security groups. Nothing gets in unless a route and a rule allow it.

Ours: the range `10.0.0.0/16` in `eu-north-1`, Stockholm, built by CDK's `Vpc` construct in
`infra/lib/network/create-vpc.ts`. Three kinds of subnets across two availability zones, with
address space kept free for a third zone.

## 2. What is the difference between public and private subnets?

A subnet is a slice of the VPC's addresses in one zone. The only difference between public and
private is the route table. A public subnet sends traffic for the internet, `0.0.0.0/0`, to the
Internet Gateway. A private subnet does not, so nothing in it can be reached from outside.

| Tier                      | Default route    | Lives there            |
| ------------------------- | ---------------- | ---------------------- |
| public (`/24` per zone)   | Internet Gateway | load balancer, NAT     |
| private (`/20` per zone)  | NAT              | application containers |
| isolated (`/24` per zone) | none             | database               |

The public subnets have `MapPublicIpOnLaunch: false`, so nothing placed in them gets a public
address by accident.

## 3. What are route tables?

A route table is a list of rules of the form "traffic to this address range goes to that
target"; the most specific range wins. Every VPC has a `local` route for traffic inside the VPC.
Each subnet is attached to exactly one table.

Here there is one table per subnet, six in all. Public tables: `0.0.0.0/0 → igw`, the Internet
Gateway. Private tables: `0.0.0.0/0 → nat`, plus the route to the S3 endpoint. Isolated tables:
the `local` route only.

## 4. What does an Internet Gateway do?

It connects the VPC to the internet. For a resource that has a public IP it translates between
the private and the public address, in both directions. It is free and needs no management. It
does nothing for a resource without a public IP; that one needs NAT.

## 5. What is NAT, and when is it necessary?

NAT, network address translation, lets private resources start connections to the internet. The
NAT has a public IP; it rewrites the source address of outgoing traffic to its own and sends each
reply back to the resource that asked. Nothing can be started from the outside in.

It is needed when a private resource must call out: Shopify's API, pulling the container image,
AWS services that have no endpoint inside the VPC. It is not needed for incoming traffic, which
the load balancer handles, nor for AWS services reached through an endpoint.

The options, Stockholm prices, per month:

| Option                       | Cost                    | Trade-off                                                         |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------- |
| NAT Gateway per zone         | ~67 USD + data          | managed, survives a zone failure                                  |
| **One NAT Gateway (chosen)** | ~38 USD + data          | managed; a failure in its zone stops outbound from the other zone |
| NAT instance (`t4g.nano`)    | ~3 USD + IP             | a server to patch, single point of failure, thin bandwidth        |
| No NAT, public subnets       | ~4 USD per container IP | no private tier                                                   |

Chosen: one managed gateway, with one route table per zone, so that `natGatewayCount: 2` is the
whole upgrade to two.

**Revisited in Task 1.3.** The dev environment moved to a NAT instance: a small server,
`t4g.micro`, running Amazon Linux 2023, created by CDK's provider. The gateway stays the answer
for production. See `task-1.3-questions.md` §5.

## 6. Can an application running in a private subnet access Shopify APIs?

Yes, as long as it has a route out. A private subnet only blocks connections started from the
internet. The application starts this one itself: it looks up the host name and opens a connection
on port 443. The route table sends that connection to a NAT, and the NAT passes it through the
Internet Gateway and sends the reply back. The security group must also allow the traffic out.

Without NAT, no. Incoming traffic is a separate path: Shopify's webhooks reach the app through the
load balancer, never directly.

In this project, the `app` security group allows outgoing traffic on 443 only.

## 7. How can an ECS task reach AWS services without accessing the public internet?

Through VPC endpoints, doors from the VPC straight into an AWS service:

- **Gateway endpoints**, for S3 and DynamoDB only: a route in the chosen route tables, free. One
  for S3 is attached here, so pulling the image's layers skips the NAT fee.
- **Interface endpoints**, PrivateLink: a network interface with a private IP in our subnets,
  about 0.011 USD per hour per zone, each. The five this project would want cost about 80 USD a
  month in two zones, more than the NAT they would relieve. They wait.

The task also needs IAM permission for the service it calls; Task 1.3 adds that.

## 8. Why should databases be deployed in private subnets?

A database only needs to talk to the application, never to the internet, so a public path adds risk
and no value. In a private subnet it has no public address and no route from outside, so an attacker
cannot even reach its login. A stolen password is not enough either, because the attacker must first
get inside the network. A security group then narrows access to the application alone.

In this project the database is in an isolated subnet: no route out, and MySQL accepted from the
`app` group only.

## 9. What happens if an Availability Zone becomes unavailable?

An availability zone is one of the separate data centres a region is made of. If one fails,
everything that lives only in that zone stops, and everything in the other zones keeps running. A
system survives only if its important parts run in at least two zones:

- The load balancer stops sending traffic to the failed zone.
- The container service starts replacements in a healthy zone.
- A database with a standby copy in another zone switches to it, usually within a couple of minutes.
- A part with only one copy, such as a single NAT, is a single point of failure. Other zones that
  depend on it lose that path too.

In this project, a failure of zone a also cuts outgoing traffic from zone b, because the one NAT
lives there. Production would add a second NAT and a Multi-AZ database (Task 2.1).

## 10. What are the cost implications of NAT Gateways and multi-AZ architecture?

A NAT Gateway costs money in two ways: a fixed price per hour for each gateway, and a price for
every GB through it. Traffic between zones is charged too, so one shared gateway saves the fixed
price but pays for that traffic. Multi-AZ means running a copy of the important parts in a second
zone, which roughly doubles everything billed per zone.

Stockholm, approximate:

| Item                      | Price                        | Per month                             |
| ------------------------- | ---------------------------- | ------------------------------------- |
| NAT Gateway               | 0.046 USD/h + 0.046 USD/GB   | ~34 USD + data                        |
| Public IPv4 address       | 0.005 USD/h                  | ~3.6 USD                              |
| Cross-zone data           | 0.01 USD/GB each way         | zone b through zone a's NAT pays this |
| Application Load Balancer | 0.024 USD/h + capacity units | ~17 USD +                             |
| Interface endpoint        | 0.011 USD/h per zone         | ~8 USD per zone each                  |

Multi-AZ doubles the per-zone items: a second NAT and IP, about 38 USD, a second database
instance, more containers. Subnets, route tables, gateways and security groups are free. Dev as
deployed: about 38 USD a month while idle. The production shape: about 75 USD before compute.

**Revisited in Task 1.3.** With the NAT instance, dev costs about 10.5 USD a month.

## Why we picked what we picked

- **CDK in TypeScript rather than Terraform.** The infrastructure is written in the same language
  and tested with the same runner as the app; the tests check the generated templates without AWS
  credentials; CloudFormation keeps the record of what is deployed.
- **`eu-north-1`, Stockholm.** Data stays in the EU, it is the cheapest EU region, and it is
  close to the developer.
- **A separate `infra/` package.** Infrastructure changes and deploys apart from the app, and
  CDK stays out of the Docker build.
- **CDK's `Vpc` construct, configured explicitly.** Every later construct wants an `IVpc`. The
  tests name every piece by type and count.
- **Explicit availability zones.** No lookup that needs credentials; the synth gives the same
  result every time.
- **`reservedAzs: 1`.** Adding a third zone later does not renumber the existing subnets.
- **Three subnet tiers.** Isolated for the database, private for things that call out, public
  for what faces the internet.
- **One route table per subnet.** A zone's routing can change on its own.
- **One NAT Gateway.** Managed, half the production price, one value to upgrade. Question 5.
- **The S3 gateway endpoint now, interface endpoints later.** Free, against endpoints that cost
  more than the NAT. Question 7.
- **Security groups created with the network.** Least privilege in one place, testable before
  any compute exists.
- **No allow-all outbound.** Each group lists what it may send out; the `data` group sends
  nothing.
- **`MapPublicIpOnLaunch: false`.** No accidental public addresses.
- **Stacks pinned to a region, never to an account.** No account id in the repository; a wrong
  profile cannot deploy somewhere else.
- **Flow logs for rejected traffic only, kept 14 days.** The tool for "why can't the balancer
  reach the task". Logging accepted traffic too would cost more.
- **Tags `project`, `stage`, `managed-by`.** For reading the bill per project and stage.
- **One typed stage config.** The differences between environments are data; `prod` sets
  `natGatewayCount: 2`.
- **Assertion tests, no snapshots.** Each test names a resource and its properties, so a failure
  says what changed.
- **Test support in `infra/test/`.** The spec files hold tests only.
- **Deploy from the laptop through SSO until Task 1.5.** No long-lived keys.
