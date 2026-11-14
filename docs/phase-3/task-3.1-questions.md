# Task 3.1 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Task 3.1 lists nine
questions (spec lines 448–456), answered in section 2. Section 1 answers the seven general questions
(spec lines 71–77) for the authorization code grant, which this task adds. Built 2026-11-14. The
alternatives and trade-offs are in `task-3.1-design.md`.

## 1. The seven general questions, for the authorization code grant

The authorization code grant is how a store installs our app. The owner approves the app on Shopify,
Shopify sends the owner's browser back to us with a one-time code, and our server trades that code,
with our app's secret, for the store's keys.

**What problem does it solve?** Our app needs a key to read a store's data through Shopify's Admin
API, the interface for reading and changing a store's data. The grant gets that key with the owner's
approval, without the owner sharing a password, and without the key ever passing through the
browser.

**Why did we choose it?**

- The spec asks for it in a standalone app (line 438), and ours is standalone: it has no screens
  inside the Shopify admin.
- The protections are our own tested code (line 440): the state value, the shop's address, Shopify's
  signature on the return (the HMAC), and the scopes, which are the kinds of data the app asked for.
- It gives offline keys, which belong to the store, so work with nobody logged in can use them (line
  441).

**What alternatives did we consider?**

- An embedded app with token exchange: it needs screens inside the Shopify admin, which the spec
  calls optional (line 131), and Shopify does the install, so the protections are Shopify's, not
  ours.
- Both paths: two ways to install, for screens we do not need.
- Shopify's library, `@shopify/shopify-api`, running the flow: the checks happen in someone else's
  code, and it brings its own way of keeping sessions, which we would have to bend to fit Nest.

**What are its limitations?**

- A person must approve in a browser. Nothing installs on its own.
- Shopify must be able to send the owner back to a public HTTPS address, and that address must match
  the one in the Dev Dashboard.
- The app must guard its client secret. Whoever has it can pass for our app.
- Every check is ours to get right. A wrong check has no library behind it; only the tests catch it.
- Shopify calls this the legacy install flow and steers new apps to its own managed installation, so
  it may change.
- A new scope means every store approves again.

**When would we choose differently?**

- An app with screens inside the Shopify admin: token exchange, with Shopify doing the install.
- If Shopify retires the legacy install flow: the install path Shopify names then.

**What could go wrong in production?**

- The client secret leaks. Anyone can then sign a fake return and trade a stolen code as our app.
  The fix is a new secret in the Dev Dashboard, pasted into AWS, and a restart.
- The return address in the Dev Dashboard drifts from the app's setting. Shopify refuses to send
  owners back, and every install fails until the two match.
- Shopify is slow or down during the trade. The install fails with a 503, and the owner tries again.
- The trade works but the save fails. Shopify counts the app as installed while we hold no keys; the
  owner opens the install link again and gets new ones.
- The owner's browser loses the cookie, or the owner takes more than 10 minutes. The state check
  fails, and the owner starts over.

**How does it behave under increased load?** Installs are rare: one per store, plus an occasional
reinstall. Each one is two requests to our app and two to Shopify, each capped at 10 seconds, plus
one short database transaction. The app keeps nothing in memory between the two requests, because
the state travels in the owner's cookie, so any copy of the app can answer the return and more
copies share the work. What grows with stores is the key refresh, not the install: at most one trade
per store per hour, each holding a lock on that store's row.

## 2. Questions 1 to 9

### 1. What is OAuth 2.0?

OAuth 2.0 is the common standard for giving an app limited permission to use a person's data on
another service, without the app ever seeing that person's password. The app gets a token instead: a
key the service hands out in place of the password, which opens only what the person approved.

### 2. What is the authorization code grant?

It is the usual way an app gets that permission. The app sends the person to the service, the person
logs in there and approves, and the service sends them back to the app with a one-time code. The
app's server then trades that code, together with the app's own secret (a password only the server
knows), for the access token. The token goes from the service straight to the server and never
passes through the browser, so a stolen code is useless on its own.

### 3. What is token exchange?

Token exchange is a standard way for an app to swap a token it already has for a new one with
different access, without the person logging in again. In Shopify it is how an embedded app (one
that opens inside the Shopify admin) gets its key. Shopify hands the app's page a session token, a
short-lived pass that says which store and which person is looking, and the app's server swaps it
for an access token. There is no redirect, because Shopify asks for approval itself when the store
installs the app.

### 4. What is the difference between online and offline tokens?

An online token is like a personal keycard. It belongs to one person on the store's staff, opens
only the doors that person is allowed through, and stops working when that person's session ends. It
suits work a person is doing on screen right now.

An offline token is like the master keycard. It belongs to the app, opens every door the store
approved when it installed the app, and works around the clock with nobody logged in, so it suits
background work.

### 5. What are access tokens and refresh tokens?

- **Access token:** like your hotel room keycard. You show it every time you open your room or the
  gym, which for an app means on every request to the service. For safety it stops working after a
  short time, often one hour, so a stolen card is soon useless.
- **Refresh token:** like your reservation receipt at the front desk. When the keycard runs out, you
  don't pay again or show your passport; you hand the receipt to the front desk and get a new
  keycard. For an app, the person does not log in again: the server sends the refresh token to the
  service and gets a new access token. The receipt lasts much longer than the keycard, but it has an
  end date too, and the hotel can cancel it.

### 6. What is CSRF, and how is it prevented during authorization?

CSRF (cross-site request forgery) is an attack where a bad website tricks your browser into doing
something on another site without you knowing. It works only when you are already logged in to the
good site, because your browser sends that site's cookies with every request to it, even one the bad
site started.

Sites stop it in two ways. A SameSite cookie is one the browser does not send when another site
started the request. A CSRF token is a random secret the good site puts in its own pages and checks
on every request; the bad site cannot read it, so its fake request does not have it.

During authorization, the CSRF token is the state value. The app makes a random state, keeps it in
the person's browser, and sends it to the service along with the person. The service sends the same
state back with the code, and the app takes the code only if the two match. Without it, an attacker
could send someone's browser back to the app with the attacker's own code, and the person would end
up connected to the attacker's account. A SameSite cookie does not stop this, because the return
from the service is a normal link the browser follows, and the browser still sends the cookie for
that.

### 7. What happens when a store uninstalls an application?

For the store:

- **The app is locked out.** It can no longer see or change anything in the store.
- **Payments stop.** Shopify cancels the app's monthly charge on its own. If the store paid on the
  app's own website instead of through Shopify, it still has to cancel there.
- **Its features disappear.** Pop-ups, review boxes and banners from the app stop working on the
  store's site.
- **Products and orders are safe.** Removing an app never deletes the store's products, customers or
  past orders.
- **Leftover code can stay behind.** Some apps add code to the store's theme, the files that make up
  the site's design. Uninstalling does not always remove it, and it can slow the site down.

For the app:

- **Shopify tells the app.** It sends a webhook, a message to an address the app registered, saying
  the store uninstalled it.
- **The app's keys stop working at once.** Shopify refuses any request made with them, so the app
  should stop its work for that store and delete them.
- **The app must delete the store's data.** The app company may still hold copies on its own system,
  such as settings or email lists. 48 hours after the uninstall, Shopify sends a second webhook
  asking it to erase the store's data, and Shopify's rules require the app to do it.

### 8. What happens if authorization is interrupted?

The process simply stops: the app gets no access and nothing is saved. The person clicks "Install"
again to start over. It can stop at three points:

- **Before approval.** The person closes the page or refuses on the approval screen. The app never
  gets a code, so it never gets access. If the person refuses, the service sends them back to the
  app with an error instead of a code.
- **On the way back.** The one-time code lasts only a few minutes, and the state the app saved
  usually has a time limit too. If the person comes back too late, the app refuses the old code.
- **During the swap.** If the trade of the code for the keys fails, the app gets no keys. A
  well-built app saves the store only after the trade works, so nothing half-done is left behind.

### 9. How should authentication errors be handled?

Deny access, show the person a vague message, and log the details privately.

- **Deny access at once.** Block the request before any protected code runs, and answer
  `401 Unauthorized`, which means "we do not know who you are". `403 Forbidden` is for someone known
  who is not allowed to do this.
- **Show a vague message.** Say "Invalid username or password" instead of which one was wrong, so an
  attacker cannot find out which accounts exist.
- **Log the details privately.** Record the time, the IP address and the reason in internal logs,
  but never a password or a token.
- **Slow down repeated tries.** After several failures in a row, slow down or briefly lock the
  sign-in, to stop an attacker from guessing passwords one after another (a brute-force attack).
- **Clear dead sessions.** Remove expired cookies or tokens from the browser and send the person to
  the sign-in page.

## 3. Why we picked what we picked

- **A standalone app with the authorization code grant (decision 1).** The spec asks for it in an
  app with no screens inside Shopify, and the checks stay in our own tested code. An embedded app
  would need screens the spec calls optional, and Shopify would run the checks.
- **The state in a signed cookie (decisions 2 and 20).** The cookie ties the check to the browser
  that started the install, with no table and no cleanup. It is `SameSite=Lax`, the strictest
  setting that still comes back on Shopify's redirect, and it lasts 10 minutes.
- **Our own checks, not Shopify's library (decision 3).** Each check is a small function with its
  own test, so every protection can be seen and proven. The library would hide them and bring its
  own way of keeping sessions.
- **`cookie-parser` reads the cookie (decision 4).** Reading the cookie header and checking its
  signature is plumbing with awkward cases, not one of the protections, so a small, common package
  does it.
- **The start address checks only the shop (decision 26).** It grants nothing, so the plain install
  link keeps working. Every other check runs at the return, before any key is traded.
- **All the return's checks in the install service (decision 40).** The whole order of checks reads
  top to bottom in one method. The controller handles only the cookie and the answer.
- **The scopes check in its own file (decision 41).** It sits next to the list of scopes the install
  asks for, with its own test. Inside the token client it would also run on a refresh, where it must
  not.
- **Two secrets in Secrets Manager, AWS's store for secrets, in their own stack (decisions 5 and
  6).** AWS creates and guards them, and the app reads them when it starts. Their own stack survives
  a pause, when the app stack is deleted, so the pasted Shopify secret is not lost.
- **The secrets are deleted with their stack (decision 43).** Their names are fixed, so a kept
  secret would block rebuilding the stack, and the Shopify secret can be copied again from the Dev
  Dashboard.
- **AWS's default way of making the cookie secret (decision 44).** A custom setting gains nothing,
  and changing it later would write a new value over the pasted Shopify secret.
- **The client id in the stage config, the settings file for each environment (decision 22).** It is
  public: it does nothing without the secret, and every owner sees it. A constant in code would need
  a new image for a new app.
- **Only the app gets the Shopify settings (decision 25).** The migration task never holds a Shopify
  secret and cannot read one. If the settings were optional, an app with no secret would start and
  fail at the first install.
- **The secret pasted through a hidden prompt (decision 45).** It never shows on screen, in the
  shell's history or in a file. The clipboard or a file would leave a copy behind.
- **A restart with a new deployment (decision 46).** AWS reads the secrets only when the app starts,
  so new copies of the app must start. They start before the old ones stop, so the app keeps
  answering; stopping the one copy first would leave a gap of 503s.
- **On a fresh AWS account, the secret is pasted before the app first starts (decision 47).** The
  secrets stack goes up in the first deploy step, so the app reads the real secret the first time
  and needs no restart.
- **One GraphQL query for the shop's details (decision 7).** GraphQL is Shopify's query language for
  its Admin API. The store row is complete when the install ends. Shopify's older REST address is
  legacy, and new public apps must use GraphQL.
- **Admin API version `2026-10`, as a constant (decision 23).** It is the latest stable version,
  supported until October 2027. Each code runs against one version, and moving on is its own pull
  request.
- **An unexpected shop answer is a plain error (decision 38).** The owner gets the general 500 and
  the log keeps the details. It is one small query per install, so special cases would add code for
  answers that do not really happen.
- **Expiring keys, with the expiry required (decision 8).** Shopify now gives keys that last one
  hour, renewed with a 90-day refresh token. A required expiry means no code for a key that never
  expires.
- **Refresh just before use (decision 9).** A key with 5 minutes or less left is renewed when it is
  needed. A timer would renew keys for stores nobody calls. The cost: a store unused for 90 days
  must authorize again.
- **A row lock during the refresh (decision 10).** Two refreshes at once can cancel each other at
  Shopify, and the store loses its keys. The lock makes the second request wait and use the fresh
  key.
- **A refusal deletes the keys, an outage keeps them (decision 11).** A 401 means the key is dead,
  so the store must authorize again. A 5xx, a 429 or no answer in 10 seconds is temporary, so the
  keys stay.
- **The caller decides, under the lock, whether a trade is still needed (decision 33).** Its
  function sees the locked row and returns nothing when another request already refreshed it. The
  5-minute rule stays in one place.
- **A refresh returns nothing when the keys are gone (decision 34).** "No keys means authorize
  again" stays in the key code, the same way reading the keys already works.
- **The token client reports a refusal with its own error (decision 35).** Its two callers do
  different things with a refusal, so the client only reports it. Returning nothing already means
  "no trade was needed".
- **A refusal is counted per trade (decision 36).** For the code trade every 4xx except 429 is a
  refusal, because Shopify does not say which status a used code gets. For a refresh only a 401 is:
  a 403 there means our own secret is wrong, and our mistake must not delete every store's keys.
- **Only the refused keys are deleted (decision 37).** The delete checks that the row still holds
  the refused refresh token, so a reinstall at the same moment keeps its new keys.
- **Two errors of our own (decision 28).** `StoreMustAuthorizeError` (409) and
  `ShopifyUnavailableError` (503) let background work tell "install again" from "try later" by
  class, without the key code knowing about the web.
- **No status column (decision 27).** "No keys" and the uninstall time already give the store's
  state; a column would say it twice and could disagree.
- **A store and its keys are one table group (decision 17).** The install and the uninstall write
  both tables in one transaction, so a store is never half installed.
- **The install takes two parts, and the caller gives the time (decisions 29 and 31).** One part per
  table, so no field lands in the wrong row. One clock serves the whole install, and the tests can
  check exact times. The uninstall takes its time the same way.
- **The install returns the store id and whether it was a reinstall (decision 30).** The save learns
  this inside its own transaction, so the answer is exact and costs no extra query.
- **`installStore` and `uninstallStore` (decision 32).** A method name is the real verb plus the
  thing it acts on.
- **The uninstall step now (decision 12).** Spec line 444 belongs to this task. Shopify's uninstall
  message arrives in Phase 4, which only has to call it.
- **Two folders, `src/installation/` and `src/access-tokens/` (decision 18).** The install and the
  working key change for different reasons. One `auth` folder would mix them and clash with Task
  3.3.
- **`/installation/start` and `/installation/callback` (decision 19).** The names say what the
  routes belong to. `/auth` would suggest logging in to our own API.
- **One shared function for every request to Shopify (decision 39).** The 10-second limit and what
  counts as "Shopify unavailable" live in one place, so the two clients cannot drift apart.
- **One line of plain text on success (decision 13).** An owner sees at once that it worked. JSON
  reads like an error.
- **Failures use the normal error answer (decision 14).** Each message says what to do next, through
  the existing error filter. A second filter would be a second error path to test.
- **The app registered by hand, with every setting written down (decision 15).** Shopify's own
  command-line tool would bring a Shopify login and a second deploy path. The cost: the written list
  stays true only if we update it.
- **Public distribution, unlisted (decision 15).** It is what lets more than one store install the
  app. Shopify does not let it be changed back.
- **Scopes `read_products` and `read_orders` (decision 16).** Exactly what Task 3.2 reads. More
  would need Shopify's approval and every owner's consent for data nothing reads.
- **A new app, "Commerce Intelligence" (step 9).** Every setting it has is one we chose, and owners
  see the right name when they approve. The old "Test app" had a released version with settings
  nobody chose.
- **The same two scopes in the Dev Dashboard's Scopes field (step 9).** Shopify marks the field as
  required and does not say an empty one works with our install flow.
- **The old Test store deleted (step 9).** Only stores we install on purpose are left. The old "Test
  app" could not be deleted, because Shopify still counts its one install.
- **The end-to-end tests fake our own Shopify pieces (decision 21).** Each piece has its own unit
  test of the exact request. A fake Shopify server would need a setting that could send a real code
  and our secret elsewhere.
- **The install's end-to-end test runs on its own database (decision 42).** Test files run at the
  same time, and a shared database would let one file see another's stores.
- **A real install only on the deployed app (decision 24).** A tunnel would add a program and send
  owners' codes through an outside company. The cost: a mistake the tests miss becomes a fix pull
  request.
