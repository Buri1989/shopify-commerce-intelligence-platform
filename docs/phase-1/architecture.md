# Architecture

The Commerce Intelligence environment as deployed: stage `dev`, region `eu-north-1`, four
CloudFormation stacks defined with AWS CDK in `infra/`. This file describes what runs; the design
doc of each task records why it is shaped that way. It is updated as the environment grows.

**Last updated:** 2026-10-24, Task 1.5. Task 2.1 adds the database.

## 1. The network

Stack `commerce-intelligence-dev-network`. One VPC over two availability zones, three tiers of
subnets, one NAT instance, a free S3 gateway endpoint. Address space for a third zone is reserved
(`10.0.2.0/24`, `10.0.48.0/20`, `10.0.66.0/24`) so adding it later renumbers nothing.

```mermaid
flowchart TB
    internet((Internet))
    igw[Internet Gateway]
    internet --- igw
    subgraph vpc["VPC 10.0.0.0/16"]
        subgraph zonea["eu-north-1a"]
            puba["public 10.0.0.0/24<br/>0.0.0.0/0 → Internet Gateway"]
            nat["NAT instance, t4g.micro<br/>Amazon Linux 2023, pinned image<br/>public IP, forwards TCP 80 and 443"]
            priva["private 10.0.16.0/20<br/>0.0.0.0/0 → NAT instance"]
            isoa["isolated 10.0.64.0/24<br/>no default route"]
        end
        subgraph zoneb["eu-north-1b"]
            pubb["public 10.0.1.0/24<br/>0.0.0.0/0 → Internet Gateway"]
            privb["private 10.0.32.0/20<br/>0.0.0.0/0 → NAT instance"]
            isob["isolated 10.0.65.0/24<br/>no default route"]
        end
        s3["S3 gateway endpoint<br/>on both private route tables"]
    end
    igw --- puba
    igw --- pubb
    puba --- nat
    priva --> nat
    privb --> nat
    priva --- s3
    privb --- s3
```

Every subnet has its own route table. Public subnets do not assign public IPs on launch; the load
balancer and the NAT instance ask for theirs. Rejected traffic is logged to
`/commerce-intelligence/dev/vpc-flow-logs` for 14 days.

Security groups are the whole list of allowed traffic between tiers. None allows all outbound.

| Group  | Inbound                        | Outbound                                |
| ------ | ------------------------------ | --------------------------------------- |
| `alb`  | TCP 80 and 443 from anywhere   | TCP 3000 to `app`                       |
| `app`  | TCP 3000 from `alb`            | TCP 443 to anywhere; TCP 3306 to `data` |
| `data` | TCP 3306 from `app`            | none                                    |
| NAT    | all traffic from `10.0.0.0/16` | TCP 80 and 443 to anywhere              |

## 2. The request path

Stack `commerce-intelligence-dev-app`. One public hostname, TLS ended at the load balancer, one
Fargate task in a private subnet, logs to CloudWatch.

```mermaid
flowchart LR
    client((Client))
    dns["Route 53<br/>api.commerce-intelligence.click<br/>alias to the load balancer"]
    alb["Application Load Balancer<br/>public subnets, both zones, group alb<br/>:80 → 301 to :443<br/>:443 ACM certificate, TLS 1.2 and 1.3"]
    tg["Target group<br/>HTTP :3000, targets by IP<br/>GET /ready every 15 s, healthy after 2, unhealthy after 3<br/>deregistration delay 30 s"]
    task["Fargate task, group app<br/>0.25 vCPU, 0.5 GB, ARM64<br/>private subnet, no public IP<br/>NestJS on :3000"]
    logs["CloudWatch Logs<br/>/commerce-intelligence/dev/app, 14 days"]
    internet((Internet))
    ecr[(ECR)]
    client -->|"1. resolve"| dns
    client -->|"2. HTTPS"| alb
    alb -->|"alb → app, TCP 3000"| tg
    tg --> task
    task -->|"awslogs driver, non-blocking"| logs
    task -.->|"app → anywhere, TCP 443, through the NAT"| internet
    task -.->|"image layers through the S3 endpoint"| ecr
```

The service keeps one task, rolls out at 100 % minimum and 200 % maximum, and rolls back by itself
when a new task definition never passes the health check. The app keeps idle connections for 65 s
because the load balancer keeps them for 60 s.

## 3. The delivery path

Two GitHub Actions workflows and two IAM roles. A pull request runs the checks and shows `cdk diff`;
a merge to `main` builds, pushes, deploys and checks the API. Every run logs in with GitHub's OIDC
token; no access key exists. The image is tagged with the commit SHA; a rollback is the same deploy
with an older tag, started from the Actions tab.

```mermaid
flowchart LR
    subgraph github["GitHub Actions"]
        pr["pull-request.yml<br/>checks / app, checks / infra, docker, diff"]
        merge["deploy.yml on a merge to main<br/>checks, build, deploy"]
        button["deploy.yml from the button<br/>imageTag = an older SHA, straight to deploy"]
    end
    subgraph delivery["delivery stack"]
        oidc["OIDC provider<br/>token.actions.githubusercontent.com, audience sts.amazonaws.com"]
        prrole["pull request role<br/>sub = repo:…:pull_request<br/>may assume the bootstrap lookup role"]
        deployrole["deploy role<br/>sub = repo:…:ref:refs/heads/main<br/>may assume the bootstrap deploy, file-publishing and lookup roles; pull and push on ECR"]
    end
    ecr[("ECR commerce-intelligence-dev<br/>immutable tags, image = commit SHA")]
    cfn["CloudFormation<br/>through the bootstrap roles"]
    net["network stack"]
    reg["registry stack"]
    del["delivery stack"]
    app["app stack<br/>task definition names repository:SHA"]
    api(("api.commerce-intelligence.click<br/>/health and /ready"))
    pr -->|"OIDC token"| oidc
    merge -->|"OIDC token"| oidc
    button -->|"OIDC token"| oidc
    oidc --> prrole
    oidc --> deployrole
    prrole -->|"cdk diff --method template, posted as one comment"| cfn
    deployrole -->|"buildx linux/arm64, push"| ecr
    deployrole -->|"cdk deploy --all --require-approval never -c imageTag=SHA"| cfn
    cfn --> net
    cfn --> reg
    cfn --> del
    cfn --> app
    app -.->|"pulls"| ecr
    merge -.->|"curl from outside, six tries"| api
    button -.->|"curl from outside, six tries"| api
```

The trust rules name the repository by its immutable identity (`owner@id/name@id`) with
`StringEquals`, so neither a recycled name nor another branch can assume a role. What a run may do
directly is narrow; what a template deployed on `main` may do is whatever CloudFormation's execution
role allows, which is administrator by default. The guards are the ones in the README's procedure:
only `main` gets the deploy role, `main` changes through a reviewed pull request, and the pull
request shows the diff with IAM changes marked.

## 4. The stacks

| Stack                                | Holds                                                                                                                           | Depended on by                                 | Termination protection                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `commerce-intelligence-dev-network`  | VPC, subnets, route tables, Internet Gateway, NAT instance, S3 endpoint, the four security groups, the reject flow log          | the app stack, weakly                          | on                                            |
| `commerce-intelligence-dev-registry` | the ECR repository, retained on delete                                                                                          | the app and delivery stacks, weakly            | on                                            |
| `commerce-intelligence-dev-delivery` | the GitHub OIDC provider, the pull request role, the deploy role                                                                | nothing; GitHub reads its outputs as variables | on                                            |
| `commerce-intelligence-dev-app`      | cluster, log group, task definition and its two roles, service, load balancer, listeners, target group, certificate, DNS record | nothing                                        | off: the stack removed on purpose for a pause |

The app and delivery stacks read the others through weak references: CloudFormation does not
enforce the dependency, the diff review and termination protection do. The whole environment costs
about 44 USD a month; the pipeline adds nothing on the AWS side; the table is in the README.

## Where the reasons are

- `task-1.2-design.md`: the network, the tiers, the security groups.
- `task-1.3-design.md`: compute, the load balancer, the certificate, the NAT instance.
- `task-1.4-design.md`: state, termination protection, the pinned image, how changes are reviewed.
- `task-1.5-design.md`: the pipeline, the two roles, the diff comment, the rollback.
- `README.md`: the procedures: deploy, review and apply, tear-down.
