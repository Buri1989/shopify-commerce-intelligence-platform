# Task 3.1 — Shopify authentication: Design

**Date:** 2026-11-08
**Branch:** `feat/task-3.1-shopify-authentication`
**Status:** design agreed in chat on 2026-11-08; not yet built.
**Spec:** `docs/Boris-ing.md`, section 5, Task 3.1 (lines 431–456); store installation business
requirements at lines 87–94; phase deliverables and acceptance criteria at lines 522–533; the seven
general questions at lines 69–77.

This document records what was decided for Task 3.1 and why. Every decision was taken by Boris in
chat and is marked **(Boris, decision N)**, with the alternatives he rejected. The mechanics are in
§5. Every file is shown in chat before it is written.

---

## 1. Intent

The backend is deployed and has tables for stores and their keys, but no store can install it. This
task adds the install: a store owner opens our install address, approves the app on Shopify, and our
server checks the return, trades the one-time code for the store's keys, reads the shop's details and
saves both. It also keeps the keys working after their one hour, and adds the uninstall step.

## 2. Goals, non-goals

**Goals**

- Every item of spec lines 437–444 traced to a decision (§4.1).
- An install that works on more than one development store, on the deployed app (§4.12).
- Every protection Shopify defines for this flow checked by our own tested code (§4.3).
- A working key for any installed store, refreshed before it runs out, safe when two requests
  refresh at once (§4.7).
- Reinstall and uninstall, each in one transaction (§4.8).

**Non-goals**

- Encrypting the keys, KMS and tenant-level authorization: Task 3.3 (lines 486–498).
- Reading products, collections and orders, and Shopify's rate limits: Task 3.2.
- Receiving Shopify's "app uninstalled" event: Phase 4 calls the uninstall step (§4.8).
- An embedded app and token exchange: researched for the questions doc only (§4.2).

## 3. Constraints

- No secret in source, stage config or workflows; a secret is created by AWS and referenced by ARN
  (general rule 4, Task 1.4).
- A new package only on Boris's decision of package, version and alternatives.
- A table change starts in `src/database/schema/`, one change per migration file, forward only, and
  keeps the previous image working (Task 2.3).
- Only repositories use Drizzle; a transaction lives inside the repository method (Task 2.4).
- A deliberate refusal is an `HttpException`; a new error source gets a mapper (Task 1.1).
- TDD, every file shown in chat first.

## 4. Decisions

### 4.1 The spec traced

| Spec | Item | Where |
| --- | --- | --- |
| 437 | Multiple development stores | §4.10, §4.12 |
| 438 | Authorization code grant | §4.2 |
| 439 | Research session tokens and token exchange | §4.2, questions doc |
| 440 | State and other protections | §4.3 |
| 441 | Offline credentials | §4.2 |
| 442 | Expiring tokens and refresh | §4.6, §4.7 |
| 443 | Store metadata and credentials saved | §4.5, §4.6, §4.11 |
| 444 | Reinstall and uninstall | §4.8 |
| 448–456 | Questions 1–9 | §4.13 |
| 524 | Functional Shopify installation | §4.12 |

### 4.2 The flow: standalone, authorization code grant, offline keys

**(Boris, decision 1)** A standalone app with Shopify's authorization code grant. The owner's
browser carries a short-lived code; the keys travel server to server only. The app has no screen
inside Shopify. The install asks for no per-user access, so Shopify hands out offline keys, which
belong to the store and outlive any one staff member's session (line 441).

Rejected: **an embedded app with token exchange**: a frontend inside the Shopify admin, which the
spec calls optional (line 131), and Shopify doing the install, so the protections of line 440 would
be Shopify's, not ours. **Both**: two install paths for a frontend the spec does not need. Token
exchange is answered from research as question 3.

### 4.3 Protections: state cookie, our own checks

**(Boris, decision 2)** The state value lives in a signed cookie in the owner's browser, which ties
the check to the browser that started the install.

Rejected: **a MySQL row**: it still needs a cookie to find the row, plus a table and a cleanup job.
**The app's memory**: lost on every deploy, and wrong with two copies.

**(Boris, decision 3)** We write the checks ourselves, each one a small tested function: state
matches the cookie; the shop matches `^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$`; the HMAC is
right; the granted scopes cover the requested ones.

Rejected: **`@shopify/shopify-api`**: the checks happen in someone else's code, and it brings its own
session storage to bend into Nest. The cost of our choice: a wrong check has no library behind it;
the tests cover that.

**(Boris, decision 4)** `cookie-parser` 1.4.7, with `@types/cookie-parser` 1.4.10 for development,
reads and verifies the signed cookie. Express writes it.

Rejected: **our own cookie reader**: the `Cookie` header has awkward cases, and signing is plumbing,
not one of the protections.

**(Boris, decision 20)** The cookie `oauth_state`: signed, `HttpOnly`, `Secure`, `SameSite=Lax`,
path `/installation`, 10 minutes, deleted at the callback. Lax is the strictest setting that still
travels on Shopify's redirect back to us.

Rejected: **`SameSite=None`**: sent on background requests from other sites for no gain. **No time
limit**: a value that stays valid for days after any real install ended.

**(Boris, decision 26)** `/installation/start` checks only the shop's address, so a browser is never
sent anywhere but a `.myshopify.com` shop. Every other check runs at the callback, before any key is
traded. The direct install link keeps working (§4.7).

The cost: Shopify's manual guide also verifies the HMAC on the first request. The questions doc says
why we do not: the start address grants nothing.

Rejected: **require the HMAC at start**: an owner could not use the plain install link. **Check it
when present**: a check anyone skips by leaving the signature off.

### 4.4 Secrets and settings

**(Boris, decision 5)** Two secrets in Secrets Manager, reaching the app's container as ECS secrets:
`SHOPIFY_CLIENT_SECRET`, which Boris pastes in once, and `COOKIE_SECRET`, which AWS generates. About
0.80 USD a month.

Rejected: **Parameter Store**: CloudFormation cannot create its encrypted kind, so a second way to
keep secrets. **GitHub secrets**: plain text in the task definition.

**(Boris, decision 6)** A seventh stack, `-secrets`, with termination protection, holding only these
two. The app stack is deleted on purpose to pause the environment; the Shopify secret must survive
that.

Rejected: **the app stack**: every pause deletes the pasted secret. **The data stack**: a second,
unrelated reason to change.

**(Boris, decision 22)** The client id is not a credential: it does nothing without the secret and
every owner sees it. It is the stage config value `shopifyClientId`, reaching the container as
`SHOPIFY_CLIENT_ID`. The callback address is built from the stage config's `apiDomainName` and
reaches the container as `SHOPIFY_CALLBACK_URL`.

Rejected: **Secrets Manager**: a public value treated as a secret, unreadable when checking the
Dashboard. **A constant in code**: a new app would need a new image.

**(Boris, decision 25)** The settings schema is split. `migrate.ts` checks only the database and
logging part; the app checks all of it. The four new settings go to the app's task definition only,
so the migration task never holds a Shopify secret and its role cannot read one.

Rejected: **both tasks get everything**: the migration container and role reach secrets they never
use (general rule 8). **The new settings optional**: an app without its secret would start, pass
`/ready`, and fail at the first install.

### 4.5 The shop's details

**(Boris, decision 7)** One GraphQL query right after the code trade, through Node's `fetch`:
`shop { id name currencyCode myshopifyDomain }`. The store row is complete when the install ends
(line 443, line 92).

Rejected: **REST `shop.json`**: legacy, and new public apps must use GraphQL. **Fill in later**:
`name` and `currency` are required since Task 2.2.

**(Boris, decision 23)** The query pins Admin API version `2026-10`, the latest stable, supported
until 16 October 2027, as a constant in the file that sends it. Moving to a newer version is its own
pull request. Past the end date, Shopify answers with the oldest version it still offers, and the
`X-Shopify-API-Version` header on each answer says which version that was.

Rejected: **a stage config value**: two stages could run one code against two versions. **The
`2027-01` release candidate**: it can still change.

### 4.6 The keys table

**(Boris, decision 8)** Shopify gives our app keys that expire: the access token after one hour, the
refresh token after 90 days. `store_credentials` gains `refresh_token` and `refresh_token_expires_at`,
and `expires_at` becomes required: three migration files, add, add, require. No running image has
written a row, so there is nothing to fill in between. `access_token` stays as it is until Task 3.3
encrypts it.

Rejected: **all optional**: room for a never-expiring key Shopify no longer gives us, and an
untestable branch in every reader.

### 4.7 A working key: refresh, lock, failures

**(Boris, decision 9)** The key is refreshed just before use, when 5 minutes or less are left. A
refresh returns a new pair, and both are saved. The cost: a store our app does not call for 90 days
loses its refresh token and must authorize again.

Rejected: **a timer**: refreshes for stores that need nothing, and duplicate timers with two copies.
**After a 401**: one failed request per store per hour by design.

**(Boris, decision 10)** The refresh holds a row lock (`SELECT … FOR UPDATE`) on that store's keys
row. Shopify's staff confirm two competing refreshes can cancel each other. A second request waits,
reads the fresh row and uses it without trading.

Rejected: **a lock in memory**: one copy only, and a deploy runs two. **No lock**: a store silently
loses its keys.

**(Boris, decision 11)** A 401 from Shopify deletes the store's keys: the store must authorize again.
A 5xx, a 429 or no answer in 10 seconds leaves the keys as they were: try again later. The 10 seconds
also cap how long the lock is held.

Rejected: **every failure alike**: a dead key tried forever. **Retries inside the request**: more
than 30 seconds holding a lock.

**(Boris, decision 27)** No new column. A store with no keys row and an empty `uninstalled_at` must
authorize again; a set `uninstalled_at` means uninstalled.

Rejected: **a `status` column**: the same fact saved twice, able to disagree.

**(Boris, decision 28)** Two errors of our own, each with a mapper: `StoreMustAuthorizeError` (409)
and `ShopifyUnavailableError` (503). The key piece does not know whether a web request or background
work called it; background work tells them apart by class.

Rejected: **Nest's HTTP exceptions from the key piece**: it ties the piece to the web (2.4 decision
4). **One class with a retry flag**: every caller must read the flag. A 403 is not used, because Task
3.3 gives permission errors to our own API's users (line 498).

### 4.8 Reinstall and uninstall

**(Boris, decision 12)** The uninstall step is built now: one method, one transaction, setting
`uninstalled_at` and deleting the keys (Task 2.2 §4.6). Phase 4's event handler calls it.

Rejected: **also on a refused refresh**: a quiet store is not an uninstalled one. **Leave it to Phase
4**: line 444 is this task's.

Reinstall follows from Task 2.2's table notes: the install's save finds the store by its Shopify id;
a new store gets a row, a known one gets its name, currency and domain from the shop query,
`installed_at` set to now, `uninstalled_at` cleared and the new keys written over the old, all in
one transaction. A store that must authorize again takes the same path.

### 4.9 What the owner sees

**(Boris, decision 13)** On success, one line of plain text: "Commerce Intelligence is installed on
example.myshopify.com. You can close this page."

Rejected: **back to the Shopify admin**: no sign anything happened. **JSON**: reads like an error to
an owner.

**(Boris, decision 14)** On failure, the project's normal error answer: an `HttpException` or one of
§4.7's errors, through the existing filter, each message saying what to do next (§5.5).

Rejected: **a plain-text error filter for the install routes**: a second error path with its own
logging and tests.

### 4.10 Registration and scopes

**(Boris, decision 15)** The app is registered by hand in Shopify's Dev Dashboard, once, and every
setting is written down here (§5.9) and in the README. One app, one client id and one secret serve
every store; each store's install adds one stores row and one keys row. Public distribution,
unlisted, is what lets several stores install it (line 437). Managed installation stays off.

The cost: the written list stays true only if we update it.

Rejected: **`shopify.app.toml` with Shopify's CLI**: a new tool, a Shopify login and a second deploy
path, and a setting Shopify advises against to keep our own install flow.

**(Boris, decision 16)** Scopes `read_products` and `read_orders`, in code: exactly what Task 3.2
reads (lines 464–467). `read_orders` reaches the last 60 days.

Rejected: **`read_all_orders` too**: Shopify's approval and every owner's consent for data no code in
this phase reads.

### 4.11 Code layout

**(Boris, decision 17)** A store and its keys are one table group: the install save, the uninstall,
reading the keys and the locked refresh are `StoresRepository` methods, as `OrdersRepository` owns
orders and items. This closes Task 2.4's known limit, a transaction across stores and credentials.

Rejected: **a transaction the caller opens**: rejected in 2.4 decision 5. **Two writes**: a store
half installed.

**(Boris, decision 18)** `src/installation/` holds the install flow: routes, checks, shop query,
finish page. `src/access-tokens/` holds the two trades with Shopify and the working-key piece.

Rejected: **one `src/shopify-auth/`**: two reasons to change, and "auth" collides with Task 3.3.
**Inside `src/stores/`**: the data layer would depend on Shopify.

**(Boris, decision 19)** `/installation/start`, which is also the app address in the Dev Dashboard,
and `/installation/callback`.

Rejected: **`/auth/…`**: suggests logging in to our own API. **Top-level `/install`, `/callback`**:
says nothing about what they belong to.

### 4.12 Tests and the real install

**(Boris, decision 21)** The e2e tests replace our own Shopify-calling pieces (the code trade, the
refresh trade, the shop query) with fakes through `createTestApp([], [{ provide, useValue }])`. Each
of those pieces has a unit spec with `fetch` stubbed, which checks the exact request and how each
answer is read.

Rejected: **a fake Shopify server**: a test-only setting that could send a merchant's code and our
secret elsewhere. **`fetch` stubbed everywhere**: every route test tied to every request's shape.

**(Boris, decision 24)** A real install runs only on the deployed app. After the merge deploys, Boris
installs on two development stores and reinstalls one. Nobody can reach the AWS database by hand
(2.4 §4.16), so the evidence is the success page and the install log lines (§5.6).

The cost: a mistake the tests miss becomes a fix pull request.

Rejected: **a tunnel**: a new program, merchant codes through an outside company, a second app.
**Plain `http://localhost`**: no official rule allows it, and the `Secure` cookie may not travel.

### 4.13 Phase questions and documentation

Questions 1–9 are answered in `docs/phase-3/task-3.1-questions.md` by Boris, one at a time, with the
seven general questions and "Why we picked what we picked". The README gains the Dev Dashboard
settings, the paste-the-secret step and the install link. `docs/architecture.md` gains the `-secrets`
stack, the two routes and its "Last updated" line. `AGENTS.md` gains "Conventions from Task 3.1".

### 4.14 What later tasks inherit

- Encrypting `access_token` and `refresh_token`, Task 3.3 (§4.6).
- Calling the uninstall step from the "app uninstalled" event, Phase 4 (§4.8).
- The working-key piece as the one way to call Shopify, Task 3.2 (§4.7).
- Retrying `ShopifyUnavailableError` in background work, Phase 4 (§4.7).
- Moving off API version `2026-10` before 16 October 2027 (§4.5).

## 5. The design

### 5.1 The files

```text
src/common/errors/   store-must-authorize.error.ts   store-must-authorize.mapper.ts
                     shopify-unavailable.error.ts    shopify-unavailable.mapper.ts
src/config/          env.schema.ts (split: migrationEnvSchema, envSchema)
src/database/schema/ store-credentials.ts (two columns, expires_at required)
src/database/migrations/
                     0007_add_store_credentials_refresh_token.sql
                     0008_add_store_credentials_refresh_token_expires_at.sql
                     0009_require_store_credentials_expiry.sql
src/stores/          stores.repository.ts (five methods added)
src/access-tokens/   access-tokens.module.ts   access-tokens.service.ts
                     shopify-token-client.ts
src/installation/    installation.module.ts    installation.controller.ts
                     installation.service.ts   shopify-shop-client.ts
                     is-shop-domain.ts                 verify-shopify-hmac.ts
                     create-shopify-authorize-url.ts   oauth-state-cookie.ts
src/app.setup.ts     cookie-parser with COOKIE_SECRET
infra/lib/secrets/   secrets-stack.ts
infra/lib/app/       resolve-shopify-environment.ts   resolve-app-secrets.ts
infra/lib/config/    stage-config.ts (shopifyClientId)
infra/bin/app.ts     the seventh stack
test/                installation.e2e-spec.ts   access-tokens.e2e-spec.ts
                     (stores.repository.e2e-spec.ts extended)
```

### 5.2 The install

1. `GET /installation/start?shop=…`: the shop must pass `isShopDomain`, or a 400. A random 32-byte
   state goes into `oauth_state`. The browser is sent to
   `https://{shop}/admin/oauth/authorize?client_id=…&scope=read_products,read_orders&redirect_uri=…&state=…`.
2. `GET /installation/callback?code=…&hmac=…&shop=…&state=…&timestamp=…`, checked in this order:
   shop format, then HMAC-SHA256 of the other parameters sorted and joined as `key=value&…` with
   the client secret, compared with `timingSafeEqual`, then state against the cookie. The cookie
   is deleted either way.
3. The code trade: `POST https://{shop}/admin/oauth/access_token`, form-encoded `client_id`,
   `client_secret`, `code`, `expiring=1`, 10 seconds. The answer's `scope` must cover both scopes.
4. The shop query with the new access token, 10 seconds.
5. `storesRepository.installStore(…)` in one transaction; one log line; the success page.

### 5.3 A working key

`accessTokensService.getStoreAccessToken(storeId)`:

1. Read the keys row with its store's shop domain. None → `StoreMustAuthorizeError`.
2. More than 5 minutes left → the access token.
3. Otherwise `storesRepository.refreshStoreCredentials(storeId, refresh)`: a transaction locks the row
   with `SELECT … FOR UPDATE`. If another request refreshed it meanwhile, the fresh token is
   returned unchanged. Otherwise `refresh` trades: `POST …/admin/oauth/access_token` with
   `client_id`, `client_secret`, `grant_type=refresh_token`, `refresh_token`, 10 seconds. The new
   pair is saved and returned.
4. A 401 → the keys row is deleted, then `StoreMustAuthorizeError`. A 5xx, 429 or timeout →
   `ShopifyUnavailableError`, the row unchanged.

Expiry times are computed as now plus Shopify's `expires_in` and `refresh_token_expires_in`.

### 5.4 The repository methods

```ts
StoresRepository (added):
  installStore(installation): Promise<SavedInstallation>   // the store id and whether it was a reinstall
  uninstallStore(storeId, uninstalledAt): Promise<void>  // uninstalled_at, keys deleted
  findStoreCredentials(storeId): Promise<StoreCredentials | undefined>
  refreshStoreCredentials(storeId, refresh): Promise<StoreCredentials>   // the locked refresh
  deleteStoreCredentials(storeId, refreshToken): Promise<void>   // only the keys Shopify refused
```

`StoreCredentials` is the keys row plus the store's `shopDomain`. Every query says the store id.

### 5.5 The error messages

| Where | Case | Status | Message |
| --- | --- | --- | --- |
| start, callback | shop missing or not `*.myshopify.com` | 400 | The shop address must look like example.myshopify.com. Start the install again from your Shopify admin. |
| callback | a parameter missing | 400 | This install link is incomplete. Start the install again from your Shopify admin. |
| callback | HMAC wrong | 403 | This install link was not signed by Shopify. Start the install again from your Shopify admin. |
| callback | cookie missing or state differs | 403 | This install link has expired or was opened in another browser. Start the install again from your Shopify admin. |
| callback | Shopify refuses the code | 403 | Shopify refused this install. Start the install again from your Shopify admin. |
| callback | scopes short | 403 | The app needs read access to products and orders. Start the install again and approve all requested access. |
| callback, key | Shopify 5xx, 429, timeout | 503 | Shopify did not answer. Try again later. |
| key | no keys, or refresh refused | 409 | Store {id} must authorize the app again. |

### 5.6 Logs

One info line per install, `store installed`, with the store id, the shop domain and whether it was a
reinstall, and one per uninstall. The request and error logs record the path only, so the code, HMAC
and state never reach them; an e2e test proves it for the callback. Tokens and secrets are never
logged.

### 5.7 The migration files

`0007` adds `refresh_token varchar(255)`, `0008` adds `refresh_token_expires_at datetime(3)`, both
optional; `0009` makes those two and `expires_at` required. Each keeps the running image working.
`CHAIN_LENGTH` becomes 10. The ERD in `docs/phase-2/task-2.2-design.md` §5.1 gains the two columns,
or `erd.spec.ts` fails.

### 5.8 Infrastructure

- `-secrets` stack: `commerce-intelligence-dev/shopify-client-secret`, which starts with a random
  placeholder AWS makes so no value is ever written in code, and
  `commerce-intelligence-dev/cookie-secret`, generated. Termination protection on.
- The app's task definition only: `resolveShopifyEnvironment(config)` adds `SHOPIFY_CLIENT_ID` and
  `SHOPIFY_CALLBACK_URL`; `resolveAppSecrets(secrets)` adds the two ECS secrets. The migration task
  definition does not change.
- After the first deploy, Boris pastes the real secret with `aws secretsmanager put-secret-value`
  and, on his word, the service is restarted so the task reads it (ECS reads secrets at task start).

### 5.9 The Dev Dashboard settings

| Setting | Value |
| --- | --- |
| App URL | `https://api.commerce-intelligence.click/installation/start` |
| Allowed redirection URL | `https://api.commerce-intelligence.click/installation/callback` |
| Embedded in Shopify admin | off |
| Distribution | public, unlisted |
| Managed installation | off |
| Offline access tokens | expiring |

The exact field names are copied from the Dashboard into the README at registration.

### 5.10 What the specs prove

- Unit: `isShopDomain` accepts and refuses the patterns; `verifyShopifyHmac` accepts Shopify's
  signature and refuses a changed parameter, a missing one and a wrong length; the authorize URL
  holds the client id, both scopes, the callback and the state; the token client sends the exact form
  for both trades and reads success, 401, 5xx, 429 and timeout; the shop client sends version
  `2026-10` and the access token header and maps the answer; the env schema refuses a missing
  Shopify setting while the migration part does not need one.
- E2E, Shopify faked: a full install saves the store and keys and shows the success page; every
  §5.5 row; a reinstall updates the same store and clears `uninstalled_at`; the cookie's attributes;
  no query value in the logs.
- Repository, real MySQL: `installStore` creates and reinstalls in one transaction; a failed
  keys write leaves no store; `uninstallStore`; two concurrent refreshes trade once; another
  store's id reaches nothing.
- Infra: the secrets stack, its protection, the app task's new environment and secrets, and the
  migration task without them.

## 6. Build order

One piece at a time. Each piece: show the failing spec in chat → approval → write it → run it red →
show the implementation in chat → approval → write it → run it green → run the whole gate.

1. Branch `feat/task-3.1-shopify-authentication`; this document.
2. The two errors and their mappers; one line each in the resolver's list.
3. The env schema split; `migrate.ts` on the migration part; `.env.example`; `e2e-setup.ts` test values.
4. `store-credentials.ts`, the three migration files, the ERD, `CHAIN_LENGTH`.
5. The five `StoresRepository` methods.
6. `src/access-tokens/`: token client, service, module.
7. `cookie-parser` installed; `app.setup.ts`.
8. `src/installation/`: shop check, HMAC check, authorize URL, state cookie, shop client, service,
   controller, module; `installation.e2e-spec.ts`.
9. Boris registers the app in the Dev Dashboard (§5.9); the client id into the stage config.
10. Infra: the secrets stack, the app task's settings, `bin/app.ts`; `npm run infra:check`.
11. Docs: the README, `docs/architecture.md`, `AGENTS.md`.
12. Gate; push; the pull request; checks green; Boris merges, which deploys. On his word: the secret
    pasted, the service restarted. Install on two development stores, reinstall one; `cdk diff` clean.
13. The questions doc, Boris answering one question at a time.

Commits happen when Boris says so.

## 7. Done when

- `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run format:check` and
  `npm run infra:check` pass.
- Every §5.10 proof is a passing test.
- Two development stores install on the deployed app, and one reinstalls, each with its success page
  and log line.
- The README, `docs/architecture.md`, `AGENTS.md` and the questions doc are updated.
- `cdk diff` is clean after the deploy.
