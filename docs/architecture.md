# Architecture

The Commerce Intelligence environment as deployed: stage `dev`, region `eu-north-1`, five
CloudFormation stacks defined with AWS CDK in `infra/`. This file describes what runs; the design
doc of each task records why it is shaped that way. It is updated as the environment grows.

**Last updated:** 2026-10-28, Task 2.1.

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

## 4. The data path

Stack `commerce-intelligence-dev-data`. One MySQL 8.4 server in one zone, reachable from the
Fargate task only, over TLS, with a login nobody has ever seen. The app keeps a pool of ten
connections per task and proves the whole path on every `/ready`.

```mermaid
flowchart LR
    alb["Application Load Balancer<br/>GET /ready every 15 s"]
    task["Fargate task, group app<br/>mysql2 pool of 10, Drizzle on top<br/>DB_HOST, DB_PORT, DB_NAME, DB_POOL_SIZE, DB_SSL_CA_PATH as plain environment<br/>DB_USER, DB_PASSWORD as secrets"]
    db[("MySQL 8.4, db.t4g.micro, one zone<br/>isolated subnets in both zones, group data<br/>:3306, no public access<br/>20 GiB gp3, encrypted with the AWS-managed key")]
    pg["Parameter group mysql8.4<br/>require_secure_transport = ON"]
    ca["Server certificate rds-ca-rsa2048-g1<br/>verified by the app against /app/certs/eu-north-1-bundle.pem"]
    secret["Secrets Manager<br/>admin login, generated by CDK, attached to the server<br/>host, port and database name alongside"]
    exec["ECS execution role<br/>GetSecretValue on this one secret"]
    backups["Automated backups, 7 days<br/>01:00–02:00 UTC, point-in-time recovery<br/>final snapshot on delete, tags copied"]
    alb -->|"health check"| task
    task -->|"app → data, TCP 3306, TLS required by the server<br/>SELECT 1 with a 3 s limit on /ready"| db
    pg --- db
    ca -.- db
    exec -->|"at task start, HTTPS through the NAT"| secret
    exec -.->|"places DB_USER and DB_PASSWORD in the container"| task
    secret -.-|"attached"| db
    db -.-> backups
```

The server refuses a plain connection, and the app refuses a server it cannot verify, so a wrong
setting on either side fails loudly instead of downgrading. The execution role, the one ECS uses to
start the task, is the only principal that may read the secret; the task role, the one the
application runs as, has no permission on it. The host and port reach the app from the data stack's
outputs; the password reaches it only through ECS, at task start.

The pool opens connections lazily, so the task boots without the database and `/ready` tells the
truth about it: `SELECT 1` through the pool, down after 3 seconds, under the balancer's 5. The
balancer stops routing to a task whose database is unreachable; after three failures ECS replaces
the task; a deploy whose new task never becomes healthy rolls back.

RDS installs 8.4 patch releases itself in the maintenance window, Sunday 03:00–04:00 UTC, with a
restart of a few minutes. Three locks stand between a command and the data: the stack's termination
protection, the server's deletion protection, and the final snapshot taken if both are turned off
and the server is deleted anyway. No path for a person into the database exists yet; the app and,
from Task 2.3, the migration task are its only clients.

## 5. The stacks

| Stack                                | Holds                                                                                                                           | Depended on by                                 | Termination protection                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `commerce-intelligence-dev-network`  | VPC, subnets, route tables, Internet Gateway, NAT instance, S3 endpoint, the four security groups, the reject flow log          | the data and app stacks, weakly                | on                                            |
| `commerce-intelligence-dev-data`     | the parameter group, the admin secret and its attachment, the subnet group, the server                                          | the app stack, weakly                          | on                                            |
| `commerce-intelligence-dev-registry` | the ECR repository, retained on delete                                                                                          | the app and delivery stacks, weakly            | on                                            |
| `commerce-intelligence-dev-delivery` | the GitHub OIDC provider, the pull request role, the deploy role                                                                | nothing; GitHub reads its outputs as variables | on                                            |
| `commerce-intelligence-dev-app`      | cluster, log group, task definition and its two roles, service, load balancer, listeners, target group, certificate, DNS record | nothing                                        | off: the stack removed on purpose for a pause |

The data, app and delivery stacks read the others through weak references: CloudFormation does not
enforce the dependency, the diff review and termination protection do. The whole environment costs
about 59 USD a month; the pipeline adds nothing on the AWS side; the table is in the README.

## Where the reasons are

- `task-1.2-design.md`: the network, the tiers, the security groups.
- `task-1.3-design.md`: compute, the load balancer, the certificate, the NAT instance.
- `task-1.4-design.md`: state, termination protection, the pinned image, how changes are reviewed.
- `task-1.5-design.md`: the pipeline, the two roles, the diff comment, the rollback.
- `task-2.1-design.md`: the database, the secret, TLS, the pool, readiness.
- `README.md`: the procedures: deploy, review and apply, tear-down.
