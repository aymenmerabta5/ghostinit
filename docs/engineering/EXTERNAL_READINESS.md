# External readiness contracts

GhostInit separates credential-free release gates from opt-in checks against operator-owned
sandbox and staging services. The two are intentionally not interchangeable.

## What ordinary CI proves

The permanent portability job runs on Ubuntu, Windows, and macOS. It performs source checks,
project and automation-script typechecks, capability-evidence closure, focused portability and
security tests, the external-harness contract tests with an injected fake transport, a CLI build,
and packed-CLI acceptance. These jobs do not receive external credentials and the contract tests
cannot contact a provider.

The exhaustive generated-project matrix, realtime runtime, and production-build lifecycles remain
separate Ubuntu gates. A green portability job is therefore cross-platform package evidence, not a
claim that every generated application matrix ran on every operating system.

The Cloudflare Worker corners are also credential-free: they build and scan the upload artifact,
run `wrangler deploy --dry-run`, and exercise routes through a bounded local Wrangler process. They
prove packaging, configuration shape, and local Worker routing, not an upload to an operator account
or the existence of account-scoped R2, Durable Object, variable, secret, route, or DNS resources.

## Protected manual workflow

`.github/workflows/external-readiness.yml` is `workflow_dispatch` only. It has no push, pull-request,
tag, or schedule trigger. A credentialed job is reachable only after an unprivileged preflight has
verified all of the following:

- the repository is exactly `aymenmerabta5/ghostinit` and is not a fork;
- the dispatch ref is the repository's default branch and GitHub reports that ref as protected;
- the target is one of the seven closed-set values; and
- checkout is pinned to the dispatch SHA.

Every successful probe appends its target to a runner-local completion file. A final sentinel fails
unless exactly one completion matches the requested target. An unsupported API dispatch therefore
cannot become a green workflow by skipping all conditional probe steps.

The credentialed job selects one target-specific GitHub environment:
`external-readiness-upstash`, `external-readiness-convex`, `external-readiness-stripe`,
`external-readiness-chargily`, `external-readiness-paddle`, `external-readiness-polar`, or
`external-readiness-staging`. Before the first run, a repository administrator must configure every
used environment with required reviewers, protected-default-branch deployment restrictions, and
only that target's secret. Referencing an environment in YAML and checking `github.ref_protected`
does **not** prove that required reviewers or deployment restrictions are configured. Verify those
repository settings independently before treating a run as approved readiness evidence. Reviewers
must inspect the dispatched commit and the target before approving deployment.

| Target   | Target-scoped environment     | Environment secret               | Operation                                                                                                                                                           |
| -------- | ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstash  | `external-readiness-upstash`  | `GHOSTINIT_SMOKE_UPSTASH_CONFIG` | Anonymous denial, dedicated-resource canary, then unique 60-second-TTL `SET` plus `GET`, followed by required `DEL` cleanup                                         |
| Convex   | `external-readiness-convex`   | `GHOSTINIT_SMOKE_CONVEX_CONFIG`  | The same purpose-built query must prove `{ authenticated: false, canary }` anonymously and `{ authenticated: true, canary }` with the dedicated test identity       |
| Stripe   | `external-readiness-stripe`   | `STRIPE_TEST_SECRET_KEY`         | Anonymous denial, then read-only balance retrieval; only `sk_test_` or `rk_test_` credentials and a response with `livemode: false` are accepted                    |
| Chargily | `external-readiness-chargily` | `CHARGILY_TEST_API_KEY`          | Anonymous denial, then read-only balance retrieval against the fixed test API; the response must identify a non-live balance                                        |
| Paddle   | `external-readiness-paddle`   | `PADDLE_SANDBOX_API_KEY`         | Anonymous denial, then read-only event-type listing against the fixed sandbox API; only modern `pdl_sdbx_apikey_` keys and non-empty named event types are accepted |
| Polar    | `external-readiness-polar`    | `POLAR_SANDBOX_ACCESS_TOKEN`     | Anonymous denial, then read-only organization listing against the fixed sandbox API                                                                                 |
| Staging  | `external-readiness-staging`  | `GHOSTINIT_STAGING_CONFIG`       | Anonymous request must return 401/403; authenticated request must return exactly `{ status: "ok", environment: "staging", canary }`                                 |

The workflow injects credentials only into the selected probe step. It has no workflow-level or
job-level environment map, and each target-specific environment prevents one approval from
unlocking every provider's credential.

## Atomic destination configurations

Upstash, Convex, and staging do not have universal public URLs. Their endpoint and credential are
therefore stored together in one target-scoped environment secret rather than combining a secret
token with independently mutable repository variables. Each secret is single-line JSON, accepts
only the documented fields, and has `schemaVersion: 1`.

```json
{
  "schemaVersion": 1,
  "endpoint": "https://RESOURCE.upstash.io",
  "hostnameSha256": "LOWERCASE_SHA256",
  "canary": "ghostinit-external-readiness:v1:upstash:DEDICATED_ID",
  "token": "TOKEN"
}
```

```json
{
  "schemaVersion": 1,
  "endpoint": "https://DEPLOYMENT.convex.cloud",
  "hostnameSha256": "LOWERCASE_SHA256",
  "query": "health:externalReadiness",
  "canary": "ghostinit-external-readiness:v1:convex:DEDICATED_ID",
  "accessToken": "APPLICATION_IDENTITY_TOKEN"
}
```

```json
{
  "schemaVersion": 1,
  "endpoint": "https://staging.example.com/api/health",
  "hostnameSha256": "LOWERCASE_SHA256",
  "canary": "ghostinit-external-readiness:v1:staging:DEDICATED_ID",
  "bearerToken": "TOKEN"
}
```

`hostnameSha256` is the lowercase SHA-256 digest of the endpoint hostname, calculated and reviewed
offline. The harness verifies it before any credentialed request. Bundling prevents a separately
editable URL or digest from redirecting an existing token; rotating the bundle remains a privileged
environment-administrator operation and must be independently reviewed. This is a trust boundary,
not cryptographic proof that GitHub environment configuration is immutable.

The canary suffix is an operator-chosen identifier of 8 to 80 ASCII letters, digits, dots,
underscores, or hyphens. Pre-provision the full Upstash canary at
`ghostinit:external-readiness:canary`. The Convex query must return only `authenticated` and `canary`
inside its `value`, must derive `authenticated` from `ctx.auth.getUserIdentity()`, and must never
return sensitive identity data. Use dedicated non-production resources and least-privilege
credentials; do not place these canaries in production resources.

The ordinary generated `/api/health` route is public and does **not** satisfy the staging contract.
Protect a staging-only adapter at the gateway so the anonymous negative control is 401/403 and the
authenticated body has exactly the required three fields.

## Safety contract

- The harness refuses to run unless `GHOSTINIT_EXTERNAL_READINESS=1` is set by the selected manual
  workflow step, and both the CLI parser and harness reject unsupported targets before any fetch.
- Upstash and Convex endpoints must use their official HTTPS domain suffix. Staging rejects local,
  reserved, IP-literal, non-HTTPS, non-default-port, credential-bearing, query-bearing, and
  non-`/api/health` URLs. Redirects fail. The three mutable destinations and their credentials are
  atomic target secrets; ordinary repository variables cannot redirect them.
- Every authenticated endpoint must first prove an anonymous negative control. Convex proves the
  negative control through its purpose-built response; the other targets require HTTP 401 or 403.
  Credentials are sent only after that control passes.
- Production billing modes and known production key forms are rejected. Polar's environments use
  the same token prefix, so its fixed sandbox hostname provides the fail-closed boundary: a
  production Polar token cannot authenticate there. No probe creates a checkout, customer,
  subscription, payment, webhook, or production resource.
- Each HTTP operation has a 10-second default deadline. The harness accepts only a 1-to-30-second
  configured deadline, the job has a five-minute deadline, JSON bodies are capped at 64 KiB, and
  streams, abort controllers, and timers are released in `finally` paths.
- Upstash is the only stateful probe. Its unique key has a 60-second TTL, cleanup is attempted even
  after a failed write/read assertion, and unconfirmed cleanup fails the run. All other probes are
  read-only.
- HTTP 200 alone is never readiness. The harness validates service-specific response discriminants,
  test/sandbox markers, canaries, and required collection shapes. It never logs raw response bodies.
- Credentials are step-scoped GitHub environment secrets and use GitHub's native masking. Harness
  errors additionally replace the atomic JSON, its scalar fields, exact secret and endpoint values,
  and URI/form/JSON-encoded forms. Control characters and newlines are removed before stderr.
- Request headers, environment maps, provider object identifiers, and stack traces are never
  serialized. Successful stdout contains only schema version, target, duration, and success.

The official contracts used by the harness are documented by [Upstash REST](https://upstash.com/docs/redis/features/restapi),
[Convex Functions HTTP API](https://docs.convex.dev/http-api/),
[Stripe balance retrieval](https://docs.stripe.com/api/balance/balance_retrieve),
[Chargily balance retrieval](https://dev.chargily.com/pay-v2/api-reference/balance/retrieve-balance),
[Paddle API quickstart](https://developer.paddle.com/api-reference/about/), and
[Polar sandbox](https://polar.sh/docs/integrate/sandbox).

## Release interpretation

Passing ordinary `test:ci` or `release` still means **external credential smoke: not run**. A manual
success proves only that the selected credential authenticated, the selected endpoint was reachable,
and that one minimal operation completed for that commit and environment. It does not prove payment
settlement, webhook delivery, production scopes, provider uptime after the run, or full release
readiness.

Likewise, a green Cloudflare dry-run/local preview is not a live deployment attestation. Before
production traffic, an operator must provision the generated R2 bucket for Next/OpenNext, deploy the
Durable Object migration, configure build-time values and runtime secrets separately, run the
generated deployment in a protected staging account, and verify the public health/API paths and
stateful cache behavior. Keep that account-specific record outside credential-free release claims.

As of 2026-09-02, this infrastructure has been contract-tested only. No Upstash, Convex, billing
provider, or staging deployment was contacted while implementing it.
