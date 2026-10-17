# Backend Engineering Training Assignment

## Project: Shopify Commerce Intelligence Platform

**Duration:** Approximately 6–8 weeks (depending on experience and availability)

**Primary technologies:** TypeScript, NestJS, MySQL, AWS, Docker, GitHub Actions

**Additional technologies:** EventBridge, SQS, Kafka, RabbitMQ, BullMQ, Redis, KMS, Secrets Manager, Terraform or AWS CDK

---

# 1\. Overview

## Objective

Build a production-oriented, multi-tenant Shopify application that installs on merchant stores, collects commerce data, processes events asynchronously, and exposes analytics through a backend API.

The purpose of this assignment is not simply to produce a working application.

You are expected to develop a strong understanding of:

- Backend system architecture and API development.  
- Cloud infrastructure, networking, and deployment.  
- CI/CD and Infrastructure as Code (IaC).  
- Relational database design, schema migrations, and transactions.  
- Message queues, event streaming, and asynchronous processing.  
- Distributed systems and reliability.  
- Authentication, authorization, encryption, and secrets management.  
- Monitoring, scalability, and production operations.

You must be able to explain not only how the system works, but **why each technology was selected, what alternatives exist, and under which circumstances those alternatives would be preferable**.

## Core Engineering Principle

**The application must run on AWS from the very beginning.**

Do not develop the entire application locally and deploy it at the end.

Your first milestone is a minimal backend deployed to AWS through an automated CI/CD pipeline.

Every subsequent phase should extend the existing infrastructure.

For example:

- When the application needs persistence, introduce RDS.  
- When it needs Shopify credentials, introduce secure token storage with KMS.  
- When it needs webhook processing, introduce EventBridge and SQS.  
- When it needs background jobs, introduce workers and a second messaging technology.  
- When traffic increases, introduce monitoring and autoscaling.

Infrastructure must evolve alongside the business requirements.

Local development is encouraged, but every completed feature must also work in the deployed AWS environment.

## General Rules

1. All infrastructure must be defined through Terraform or AWS CDK.  
2. All application deployments must run through GitHub Actions.  
3. No long-lived AWS access keys may be stored in GitHub.  
4. Application secrets must never be committed to source control.  
5. Every major architectural decision must be documented.  
6. Every phase must include automated testing.  
7. Every phase must end with a working AWS deployment.  
8. Production-style security controls must be applied throughout the project.  
9. Infrastructure costs must be considered when choosing services.  
10. Prefer understanding and simplicity over adding unnecessary technologies.

For every major technology decision, answer:

- What problem does this technology solve?  
- Why did you choose it?  
- What alternatives did you consider?  
- What are its limitations?  
- When would you choose a different solution?  
- What could go wrong in production?  
- How would the system behave under increased load?

---

# 2\. Business Requirements

Build a Shopify application called **Commerce Intelligence**.

The application should support multiple Shopify stores and provide the following capabilities.

## Store installation

- Install the application on multiple Shopify development stores.  
- Authenticate and authorize stores using an appropriate Shopify authorization flow.  
- Retrieve and securely store store-level access credentials.  
- Retrieve shop metadata using the Shopify Admin GraphQL API.  
- Handle token expiration, refresh, and revocation as applicable.  
- Handle application uninstallation.

## Data synchronization

- Import existing products, variants, collections, and orders.  
- Persist the data in MySQL.  
- Maintain relationships between entities.  
- Handle large historical imports asynchronously.  
- Respect Shopify API rate limits.

## Real-time event processing

Receive events for:

- Orders created.  
- Orders updated.  
- Products created.  
- Products updated.  
- Products deleted.  
- App uninstalled.

Events must be routed through AWS cloud services and processed asynchronously.

## Analytics

Expose REST endpoints that provide:

- Total number of orders per store.  
- Total revenue per store.  
- Revenue over time.  
- Most frequently purchased products.  
- Order counts over time.  
- Synchronization status.  
- Webhook processing statistics.

The analytics API must ensure data isolation between different Shopify stores.

A frontend dashboard is optional. The primary focus is backend engineering.

---

# 3\. Phase 1 — AWS Infrastructure, Backend Foundation & CI/CD

**Suggested duration:** Week 1

## Objective

Create a cloud-hosted backend environment before implementing any Shopify business logic.

By the end of this phase, you should have a containerized NestJS application running on AWS, with all deployments automated.

## Task 1.1 — Backend foundation

Create a NestJS backend application.

Requirements:

- Use TypeScript.  
- Organize the project into logical modules.  
- Implement configuration management.  
- Implement structured logging.  
- Implement centralized error handling.  
- Implement request validation.  
- Expose `/health` and `/ready` endpoints.  
- Write basic unit and integration tests.  
- Create a multi-stage Dockerfile.

Questions to investigate:

1. Why NestJS? What are its advantages and disadvantages?  
2. What is dependency injection?  
3. What is the difference between controllers, services, and repositories?  
4. What makes a REST API well-designed?  
5. What are middleware, guards, and interceptors?  
6. How should an application handle configuration across environments?  
7. Why are health and readiness endpoints different?

## Task 1.2 — AWS networking

Create the foundational AWS infrastructure.

Requirements:

- Create a dedicated VPC.  
- Use at least two Availability Zones.  
- Configure public and private subnets.  
- Configure route tables.  
- Configure an Internet Gateway.  
- Investigate NAT Gateway and alternatives for outbound connectivity.  
- Configure security groups.  
- Apply least-privilege networking rules.

Questions to investigate:

1. What is a VPC?  
2. What is the difference between public and private subnets?  
3. What are route tables?  
4. What does an Internet Gateway do?  
5. What is NAT, and when is it necessary?  
6. Can an application running in a private subnet access Shopify APIs?  
7. How can an ECS task reach AWS services without accessing the public internet?  
8. Why should databases be deployed in private subnets?  
9. What happens if an Availability Zone becomes unavailable?  
10. What are the cost implications of NAT Gateways and multi-AZ architecture?

## Task 1.3 — Compute and deployment

Deploy the application using AWS.

Requirements:

- Build a Docker image.  
- Store images in Amazon ECR.  
- Deploy the application using ECS Fargate.  
- Expose the API through an Application Load Balancer.  
- Configure HTTPS with AWS Certificate Manager.  
- Configure ECS task definitions and IAM roles.  
- Configure CPU and memory allocations.  
- Configure health checks.  
- Forward logs to CloudWatch.

Research alternatives:

- EC2  
- ECS Fargate  
- AWS Lambda  
- EKS

Explain when each approach should be used and its operational trade-offs.

## Task 1.4 — Infrastructure as Code

Use Terraform or AWS CDK.

Requirements:

- Define infrastructure in source control.  
- Support repeatable deployments.  
- Maintain infrastructure state safely.  
- Separate infrastructure configuration from application configuration.  
- Avoid hardcoded secrets.  
- Document the deployment process.  
- Explain how infrastructure changes are reviewed and applied.

## Task 1.5 — GitHub Actions CI/CD

Create two workflows.

### Pull request workflow

- Install dependencies.  
- Run linting.  
- Run TypeScript type checking.  
- Run automated tests.  
- Build the application.  
- Validate the Docker build.  
- Validate infrastructure definitions.

### Deployment workflow

When code is merged into `main`:

1. Build the application.  
2. Create a Docker image.  
3. Tag the image with the Git commit SHA.  
4. Authenticate with AWS through GitHub OIDC.  
5. Push the image to ECR.  
6. Deploy the application to ECS.  
7. Wait for deployment health checks.  
8. Report deployment success or failure.

Demonstrate rollback to a previous working version.

## Deliverables

- Git repository.  
- Working NestJS application.  
- Docker configuration.  
- AWS infrastructure deployed using IaC.  
- Automated CI/CD pipeline.  
- Accessible HTTPS endpoint.  
- CloudWatch logs.  
- Architecture and networking diagram.  
- Infrastructure cost estimate.

## Acceptance criteria

A new commit merged into `main` automatically deploys the application to AWS without manual intervention.

The application is reachable over HTTPS, and a failed deployment can be diagnosed using AWS logs and deployment status.

---

# 4\. Phase 2 — MySQL, Database Architecture & Migrations

**Suggested duration:** Week 2

## Objective

Extend the existing AWS infrastructure with a managed relational database.

Design a normalized database schema capable of supporting multiple Shopify stores and their commerce data.

## Task 2.1 — Add AWS RDS

Use IaC to provision Amazon RDS for MySQL.

Requirements:

- Deploy RDS into private subnets.  
- Configure appropriate security groups.  
- Allow connections only from authorized application components.  
- Configure database credentials securely.  
- Enable appropriate encryption at rest.  
- Configure automated backups.  
- Connect the NestJS backend to RDS.  
- Manage connection pooling.

Investigate the advantages and limitations of RDS compared with a self-managed MySQL instance.

## Task 2.2 — Database modeling

Design the following entities:

- Stores.  
- Store credentials.  
- Products.  
- Product variants.  
- Collections.  
- Products within collections.  
- Orders.  
- Order items.  
- Webhook processing records.  
- Store analytics.

Create an Entity Relationship Diagram before implementing the schema.

Your design must demonstrate:

### One-to-one (1:1)

Example: Store ↔ Store Credentials.

Explain when splitting entities into separate tables is appropriate.

### One-to-many (1:N)

Examples:

- Store → Orders.  
- Order → Order Items.  
- Product → Variants.

Explain foreign keys, referential integrity, cascading operations, and indexing.

### Many-to-many (N:M)

Example: Products ↔ Collections.

Implement a junction table with appropriate unique constraints.

## Task 2.3 — Migrations

Choose a migration framework such as:

- Drizzle ORM migrations.  
- TypeORM migrations.  
- Flyway.

Requirements:

- Implement at least five incremental schema migrations.  
- Create indexes using migrations.  
- Demonstrate a change to an existing populated table.  
- Demonstrate a data migration/backfill.  
- Handle migration failures.  
- Explain backward-compatible migration strategies.

Integrate database migrations with the deployment process.

Migrations should execute as controlled, one-off operations, rather than independently from every running application instance.

The solution must prevent concurrent migration execution.

## Task 2.4 — Database operations

Implement:

- CRUD operations.  
- Transactions.  
- Unique constraints.  
- Pagination.  
- Efficient filtering.  
- Indexes for common queries.  
- Tenant isolation.

Questions to investigate:

1. What are primary and foreign keys?  
2. What are composite indexes?  
3. What is database normalization?  
4. When should denormalization be used?  
5. What are ACID properties?  
6. What are transaction isolation levels?  
7. What are deadlocks?  
8. What are optimistic and pessimistic locks?  
9. How do indexes affect write performance?  
10. How do you diagnose slow queries using EXPLAIN?  
11. How should external Shopify IDs be represented?  
12. How can tenant isolation be enforced?  
13. How do you perform a zero-downtime schema change?

## Deliverables

- Updated AWS infrastructure.  
- RDS MySQL instance.  
- Database ERD.  
- Migration scripts.  
- Database entities and repositories.  
- Database tests.  
- Query optimization analysis.  
- Updated deployment pipeline.

## Acceptance criteria

The application connects securely to RDS, database migrations execute through the deployment process, and schema changes can be applied without manually accessing the database.

---

# 5\. Phase 3 — Shopify Integration, Authentication & Security

**Suggested duration:** Week 3

## Objective

Convert the deployed backend into a functioning multi-tenant Shopify application.

## Task 3.1 — Shopify authentication

Implement an appropriate Shopify installation and authorization flow.

Requirements:

- Support installation on multiple development stores.  
- Implement Shopify's authorization code grant if using a standalone/API-only app.  
- Research session-token authentication and token exchange for embedded apps.  
- Validate state and other applicable authorization protections.  
- Obtain offline store access credentials.  
- Support expiring tokens and refresh when applicable.  
- Save store metadata and credentials.  
- Handle app reinstallation and uninstallation.

Questions to investigate:

1. What is OAuth 2.0?  
2. What is the authorization code grant?  
3. What is token exchange?  
4. What is the difference between online and offline tokens?  
5. What are access tokens and refresh tokens?  
6. What is CSRF, and how is it prevented during authorization?  
7. What happens when a store uninstalls an application?  
8. What happens if authorization is interrupted?  
9. How should authentication errors be handled?

## Task 3.2 — Shopify API integration

Use the Shopify Admin GraphQL API.

Implement functionality to:

- Retrieve store information.  
- Retrieve products and variants.  
- Retrieve collections.  
- Retrieve orders.  
- Handle GraphQL errors.  
- Handle pagination.  
- Respect API rate limits.  
- Handle missing or insufficient scopes.

Questions to investigate:

1. Why GraphQL instead of REST?  
2. How does cursor-based pagination work?  
3. What is Shopify's GraphQL query-cost system?  
4. What happens when the API throttles a request?  
5. When should bulk operations be used?  
6. How should external API integrations implement retry and timeout policies?

## Task 3.3 — Secure credentials

Extend the AWS infrastructure with:

- AWS KMS.  
- AWS Secrets Manager.  
- Appropriate IAM policies.

Requirements:

- Encrypt Shopify access tokens before storing them in MySQL.  
- Implement a secure decryption mechanism.  
- Restrict access to encryption operations.  
- Store application-level secrets securely.  
- Avoid leaking secrets in logs or API responses.  
- Document key-rotation behavior.  
- Apply tenant-level authorization.

Investigate envelope encryption and explain when application-level encryption is preferable to relying only on RDS encryption at rest.

## Task 3.4 — Security research

Research and compare:

- AWS KMS.  
- AWS Secrets Manager.  
- HashiCorp Vault.

For each, explain:

- Its primary purpose.  
- Where it stores secrets or keys.  
- Whether it performs encryption.  
- How access is controlled.  
- Whether it supports rotation.  
- Its operational overhead.  
- When it should be used.

Explain why KMS and Secrets Manager are complementary rather than equivalent.

## Deliverables

- Functional Shopify installation.  
- Securely stored credentials.  
- Shopify API integration.  
- KMS and Secrets Manager infrastructure.  
- Authorization and tenant-isolation tests.  
- Security architecture document.

## Acceptance criteria

Multiple Shopify development stores can install the application, their data remains isolated, and sensitive credentials are protected even if someone gains read-only access to the application database.

---

# 6\. Phase 4 — Messaging, EventBridge & Distributed Systems

**Suggested duration:** Weeks 4–5

## Objective

Implement reliable asynchronous processing of Shopify events.

You must research all four messaging technologies and implement at least two.

## Task 4.1 — Messaging technology research

Research:

1. Apache Kafka.  
2. Amazon SQS.  
3. BullMQ with Redis.  
4. RabbitMQ.

Produce a comparison covering:

- Primary use cases.  
- Queue versus event-streaming semantics.  
- Message persistence.  
- Message acknowledgments.  
- Consumer models.  
- Delivery guarantees.  
- Message ordering.  
- Retry strategies.  
- Dead-letter handling.  
- Replay capabilities.  
- Horizontal scaling.  
- Infrastructure complexity.  
- Operational cost.  
- Managed versus self-hosted deployment options.

For every technology, provide at least three concrete business scenarios in which you would choose it.

Explain why it would be preferable to the alternatives in those scenarios.

Examples to investigate:

- Processing payment events.  
- Processing Shopify webhooks.  
- Sending transactional emails.  
- Scheduling delayed jobs.  
- Synchronizing millions of records.  
- Distributing events to multiple independent services.  
- Implementing an audit/event history.  
- Processing large-scale clickstream data.

## Task 4.2 — AWS EventBridge integration

Configure Shopify webhooks to use AWS EventBridge.

Use IaC to provision:

- EventBridge integration and rules.  
- SQS queue.  
- Dead-letter queue.  
- IAM policies.  
- Worker infrastructure.

Build an event processing pipeline:

Shopify → EventBridge → SQS → Worker → MySQL

The worker must process:

- Order creation.  
- Order updates.  
- Product creation.  
- Product updates.  
- Product deletion.  
- Application uninstallation.

Questions to investigate:

1. What is an event bus?  
2. How is EventBridge different from SQS?  
3. What is event-driven architecture?  
4. What is fan-out?  
5. What is the difference between an event and a command?  
6. Why route events through EventBridge rather than directly to a worker?  
7. How do EventBridge rules work?  
8. Can events be delivered more than once?  
9. What happens when consumers cannot keep up?  
10. When would EventBridge alone be sufficient?

## Task 4.3 — Implement the first messaging technology

Use SQS as the first required messaging implementation.

Requirements:

- Consume messages asynchronously.  
- Implement retries.  
- Configure a dead-letter queue.  
- Implement idempotent processing.  
- Handle worker crashes.  
- Support message redrive.  
- Configure visibility timeouts appropriately.  
- Scale worker concurrency.  
- Monitor queue depth.

Investigate Standard versus FIFO queues and explain the implications for ordering and throughput.

## Task 4.4 — Implement a second messaging technology

Choose one:

- BullMQ.  
- RabbitMQ.  
- Kafka.

Suggested implementation: BullMQ for historical Shopify data synchronization.

The second implementation must solve a meaningful problem rather than simply duplicating the SQS pipeline.

Example:

A new store installs the app → a background job starts → products and orders are imported → progress is persisted → failures are retried.

Requirements:

- Job creation and consumption.  
- Controlled concurrency.  
- Retry with exponential backoff.  
- Progress tracking.  
- Failure handling.  
- Restart recovery.  
- Rate-limit handling.

If selecting BullMQ, provision Redis using an appropriate AWS deployment.

If selecting RabbitMQ or Kafka, document the associated infrastructure and operating costs.

## Task 4.5 — Distributed systems failure scenarios

Demonstrate how the system behaves when:

1. The same Shopify webhook arrives twice.  
2. A worker crashes while processing an event.  
3. A worker commits a database transaction but fails to acknowledge the message.  
4. MySQL is temporarily unavailable.  
5. A message repeatedly fails.  
6. Messages arrive out of order.  
7. Shopify rate limits the application.  
8. Thousands of messages arrive simultaneously.  
9. The system is redeployed while jobs are running.  
10. An application is uninstalled while historical synchronization is active.

Research:

- At-most-once delivery.  
- At-least-once delivery.  
- Exactly-once semantics and their limitations.  
- Idempotency.  
- Eventual consistency.  
- Transactional outbox pattern.  
- Consumer groups.  
- Message partitions.  
- Backpressure.

## Deliverables

- Comparison of all four messaging systems.  
- Functional EventBridge-to-SQS pipeline.  
- Independently deployed worker.  
- Second messaging implementation.  
- DLQ and retry handling.  
- Idempotency implementation.  
- Automated failure tests.  
- Updated infrastructure diagram.

## Acceptance criteria

Shopify events can be processed reliably under duplicate delivery, transient failures, worker restarts, and temporary database outages.

The developer must demonstrate why the two selected messaging technologies were chosen and explain when Kafka or RabbitMQ would be preferable.

---

# 7\. Phase 5 — Background Processing, Data Synchronization & Analytics

**Suggested duration:** Week 6

## Objective

Use the infrastructure built so far to implement meaningful commerce functionality.

## Task 5.1 — Historical synchronization

When a new store installs the application:

- Start an asynchronous historical import.  
- Retrieve products and collections.  
- Retrieve historical orders.  
- Persist data to MySQL.  
- Respect Shopify rate limits.  
- Track synchronization progress.  
- Handle interruptions and resume safely.  
- Prevent concurrent duplicate imports.  
- Cancel or stop jobs for uninstalled stores.

Evaluate whether standard paginated GraphQL queries or bulk operations are more appropriate for large imports.

## Task 5.2 — Analytics

Implement API endpoints for:

- Total orders per store.  
- Revenue per store.  
- Daily revenue.  
- Top-selling products.  
- Order counts by date.  
- Synchronization status.

Design an aggregation strategy.

Consider:

- Calculating analytics directly from raw orders.  
- Maintaining precomputed aggregation tables.  
- Updating aggregates asynchronously.

Explain the trade-offs in query performance, storage, update complexity, and consistency.

## Task 5.3 — Data consistency

Investigate:

- What happens if a webhook arrives while historical synchronization is still running?  
- What happens if Shopify sends an older update after a newer one?  
- How can you avoid double-counting orders?  
- How should deleted products be represented?  
- How can analytics be rebuilt if incorrect data was previously stored?  
- How should monetary values and currencies be represented?  
- How should refunds and canceled orders affect revenue?

## Deliverables

- Working historical synchronization process.  
- Analytics REST API.  
- Progress tracking.  
- Data consistency strategy.  
- Database optimization analysis.  
- Deployed application updates.

## Acceptance criteria

A newly installed store is synchronized automatically, ongoing webhooks keep its data updated, and the API returns accurate store-specific analytics.

---

# 8\. Phase 6 — Production Readiness, Scalability & Reliability

**Suggested duration:** Weeks 7–8

## Objective

Prepare the application for realistic production operating conditions.

## Task 6.1 — Observability

Implement:

- Structured JSON logs.  
- Request and correlation IDs.  
- CloudWatch metrics.  
- ECS monitoring.  
- Worker failure metrics.  
- Queue depth monitoring.  
- DLQ alerts.  
- API error-rate monitoring.  
- Database performance monitoring.

Demonstrate how to trace an incoming Shopify event through the processing pipeline.

## Task 6.2 — Reliability

Implement or demonstrate:

- Graceful shutdown.  
- Deployment rollback.  
- Worker recovery.  
- Retry and redrive procedures.  
- Database backup and restore.  
- Failure isolation.  
- Configuration validation.  
- Infrastructure recovery procedures.

## Task 6.3 — Security hardening

Review:

- IAM permissions.  
- Security groups.  
- Database network isolation.  
- Secrets access.  
- Token encryption.  
- Logging of sensitive information.  
- API authentication.  
- Tenant isolation.  
- Dependency vulnerabilities.  
- Publicly exposed cloud resources.

Create a basic threat model explaining likely attack vectors and mitigations.

## Task 6.4 — Performance and scaling

Simulate 10,000 webhook events distributed across multiple stores.

Measure:

- Event processing throughput.  
- Average and p95 processing latency.  
- Queue backlog.  
- Worker CPU/memory usage.  
- Database CPU and connections.  
- Retry rates.  
- Dead-letter rates.  
- Estimated infrastructure cost.

Identify bottlenecks.

Explain how the architecture would change if:

- The number of stores increases tenfold.  
- Event volume increases one hundredfold.  
- Order tables grow to hundreds of millions of rows.  
- Multiple consumers need to independently process the same events.  
- The system must support multiple geographic regions.

## Task 6.5 — Final engineering review

Prepare a 30–45 minute technical presentation covering:

1. Final system architecture.  
2. Cloud infrastructure and networking.  
3. Shopify authentication.  
4. Database schema and migrations.  
5. EventBridge integration.  
6. Messaging technology choices.  
7. Reliability and failure handling.  
8. Security and secrets management.  
9. Performance results.  
10. What you would redesign if this became a real production system.

## Final deliverables

- Complete Git repository.  
- Deployed AWS application.  
- Working CI/CD pipelines.  
- Infrastructure as Code.  
- Database ERD.  
- Architecture and networking diagrams.  
- Messaging comparison document.  
- Security architecture document.  
- Automated tests.  
- Load-test results.  
- Cloud cost analysis.  
- Final technical presentation.

---

# 9\. Definition of Done

A phase is complete only when:

- All required functionality is implemented.  
- Relevant infrastructure is defined in code.  
- Application and infrastructure changes are deployed to AWS.  
- CI/CD succeeds.  
- Unit and integration tests pass.  
- Security implications have been considered.  
- Logging and error handling are implemented.  
- Architectural decisions are documented.  
- The employee can demonstrate the functionality.  
- The employee can explain the reasons behind the design.

Code running only on a local machine is not considered complete.

---

# 10\. Engineering Evaluation

The final evaluation is based on:

| Category | Weight |
| :---- | ----: |
| Architecture and technical decision-making | 25% |
| Implementation quality and code structure | 25% |
| Distributed systems and reliability | 20% |
| Security and infrastructure design | 15% |
| Testing and production readiness | 15% |

## What matters most

You will be evaluated on your ability to reason about engineering decisions.

Working code is necessary, but not sufficient.

You should be able to answer:

- Why did you choose this architecture?  
- What would happen if one of its components failed?  
- How does it scale?  
- What are its security risks?  
- What alternatives were available?  
- How much does it cost?  
- What would you change if the requirements evolved?

**The goal is to become an engineer who can independently design, build, deploy, operate, and reason about a production backend system.**