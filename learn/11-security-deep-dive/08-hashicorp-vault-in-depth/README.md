# HashiCorp Vault in Depth

## Why this matters

Module 02 named HashiCorp Vault as the cloud-agnostic alternative to Key
Vault, described its headline feature — **dynamic secrets** — in one
paragraph, and moved on. That paragraph undersold the idea: a dynamic
secret isn't just "generated on demand," it's a secret with a **built-in
expiry date that Vault itself enforces**, revoking the underlying access
automatically, whether or not anyone remembers to. A leaked static Key
Vault secret is dangerous until a human notices and rotates it. A leaked
dynamic Vault credential is dangerous for, at most, its lease duration —
minutes, typically — after which it simply stops working on its own.
This module runs Vault for real: the KV engine (a closer analog to Key
Vault, for the versioning/audit comparison), and then the **database
secrets engine**, where you'll generate a real, working Postgres
credential, prove it works, and prove that revoking its lease cuts off
that exact access immediately — the mechanism, not the marketing.

## Concepts

### Vault's core model: a secrets engine mounted at a path

Vault doesn't have one universal "store a secret" API — it has
**secrets engines**, each mounted at a path, each implementing its own
logic for what "read a secret" means. The **KV (key-value) engine**
behaves like Key Vault: you write a value, you read it back, Vault
versions it. The **database engine** behaves completely differently: you
don't write a value to read back at all — you define *how Vault should
generate one*, and every read creates a **brand-new, real credential**
in the target database, on the spot.

```
  KV engine:              write once ──► read the SAME value back (versioned)
  vault kv put secret/x   vault kv get secret/x  →  "s3cr3t"

  Database engine:        no write of a value at all —
  vault write .../roles/r  configure HOW to generate one
  vault read .../creds/r  →  a NEW, real Postgres role, created just now
  vault read .../creds/r  →  ANOTHER new, different Postgres role
```

This distinction — "give me back what I stored" vs. "generate me a real,
working credential right now" — is the entire conceptual leap from Key
Vault to Vault's dynamic-secrets model.

### Leases: every dynamic secret has a built-in, enforced expiry

Every credential the database engine generates comes with a **lease** —
a `lease_id`, and a duration after which Vault automatically revokes it,
no human action required. Revocation isn't a soft "please stop using
this" — for the database engine, it's Vault actually connecting to the
target database and running the SQL to drop or disable the role it
created. A dynamic credential that's never explicitly revoked still
expires on its own once its lease runs out; **explicit revocation**
(`vault lease revoke`) does the same thing immediately, on demand — the
exact tool an incident response (module 07) reaches for the moment a
credential is suspected compromised.

```
  vault read database/creds/readonly
       │
       ▼
  Postgres role created for real, lease starts (e.g. 1 minute)
       │
       ├── lease expires naturally ──► Vault auto-revokes: role dropped
       │
       └── vault lease revoke <id> ──► Vault revokes immediately: role dropped
```

### Configuring the database engine: connection + role template

Two pieces of configuration turn the database engine on for a specific
database:

1. **A connection** — Vault's own credentials for reaching the target
   database, so it has permission to create/drop roles on your behalf.
   This one, relatively long-lived credential is the *only* standing
   database credential in the whole system — everything the database
   engine generates afterward is short-lived.
2. **A role** — a SQL template describing exactly what a generated
   credential should be allowed to do (`GRANT SELECT ...` for a
   read-only role, say) and how long its lease should last
   (`default_ttl`/`max_ttl`).

```hcl
# The connection: Vault's own (long-lived) credential to reach the DB
vault write database/config/appdb-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="readonly" \
  connection_url="postgresql://{{username}}:{{password}}@db-host:5432/appdb" \
  username="vault-admin" \
  password="..."

# The role: what a generated credential is allowed to do, and for how long
vault write database/roles/readonly \
  db_name=appdb-postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1m" \
  max_ttl="5m"
```

Every subsequent `vault read database/creds/readonly` runs that
`creation_statements` template with a fresh, randomly-generated
`{{name}}` and `{{password}}` — a genuinely new Postgres role each time,
not a shared one.

### Why this beats a static secret, concretely

A static credential (a Key Vault secret, an env var, a value in a
`.env` file) grants access **until someone notices it should be revoked
and does so** — module 02's whole "long-lived secret is a standing
liability" argument. A dynamic credential grants access **until its
lease expires, automatically, regardless of whether anyone is watching**.
The blast radius of a leaked dynamic credential is bounded by its TTL
in a way a static secret's simply isn't — this is the concrete,
mechanical reason module 02 called dynamic secrets "the most secure
secret is one that's short-lived and auto-revoked," now something you've
run and broken (in the good sense — proven the revocation actually
works) yourself.

### The operational cost: you now run Vault

Module 02 flagged this and it's worth restating concretely, now that
you've stood Vault up yourself: you're responsible for its
availability, its unsealing (a fresh, non-dev Vault starts **sealed** —
unable to decrypt its own storage — until enough unseal keys are
provided; dev mode, used in this module's exercises, skips this
entirely and should never be used beyond local learning), its storage
backend, and its upgrades. Managed Key Vault trades away the
dynamic-secrets power for someone else operating all of that. Neither
choice is universally correct — it's the same build-vs-buy trade-off
that recurs throughout this track.

## Command reference

| Command | What it does | Example |
|---|---|---|
| Start a dev-mode Vault | Runs Vault in-memory, unsealed, for local learning only | `docker run -d --cap-add=IPC_LOCK -e VAULT_DEV_ROOT_TOKEN_ID=root -e VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200 -p 8200:8200 hashicorp/vault:1.17` |
| Write a KV secret | Stores a versioned value | `vault kv put secret/myapp/db-pass value=s3cr3t` |
| Read a KV secret | Reads the current version back | `vault kv get secret/myapp/db-pass` |
| Read a specific KV version | Reads an older version | `vault kv get -version=1 secret/myapp/db-pass` |
| Enable the database engine | Mounts the engine at `database/` | `vault secrets enable database` |
| Configure a DB connection | Gives Vault its own credential to the target DB | `vault write database/config/<name> plugin_name=postgresql-database-plugin ...` |
| Define a dynamic role | The SQL template + TTLs for generated credentials | `vault write database/roles/<role> db_name=... creation_statements=... default_ttl=1m` |
| Generate a dynamic credential | Creates a real, new DB role right now | `vault read database/creds/<role>` |
| Revoke a lease immediately | Actually drops the generated role, on demand | `vault lease revoke <lease_id>` |

## Hands-on exercises

Run Vault in dev mode via Docker — **dev mode only**, never for anything
beyond local learning (it runs unsealed, in-memory, with a fixed root
token):

```bash
docker run -d --name vault-dev --cap-add=IPC_LOCK \
  -e 'VAULT_DEV_ROOT_TOKEN_ID=root' \
  -e 'VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200' \
  -p 8200:8200 hashicorp/vault:1.17
export VAULT_ADDR="http://127.0.0.1:8200"
export VAULT_TOKEN="root"
```

### 1. Store and version a KV secret

```bash
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault kv put secret/myapp/db-pass value=s3cr3t
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault kv put secret/myapp/db-pass value=rotated-v2
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault kv metadata get secret/myapp/db-pass
```

Expected: the metadata output shows **two versions**, exactly like
module 02's Key Vault version history — writing a new value never
overwrote the old one.

### 2. Stand up Postgres and connect it to Vault's database engine

```bash
docker network create vault-net
docker network connect vault-net vault-dev
docker run -d --name vault-pg --network vault-net -e POSTGRES_PASSWORD=vaultroot -e POSTGRES_DB=appdb postgres:16

docker exec vault-pg psql -U postgres -d appdb -c "CREATE ROLE \"vault-admin\" WITH LOGIN PASSWORD 'vaultroot' SUPERUSER;"

docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault secrets enable database

docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault write database/config/appdb-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="readonly" \
  connection_url="postgresql://{{username}}:{{password}}@vault-pg:5432/appdb?sslmode=disable" \
  username="vault-admin" \
  password="vaultroot"
```

Expected: `Success! Data written to: database/config/appdb-postgres` —
Vault now has its own (long-lived) credential to reach Postgres, the
*only* standing credential in this whole exercise.

### 3. Define a dynamic, short-lived, read-only role

```bash
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault write database/roles/readonly \
  db_name=appdb-postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1m" \
  max_ttl="5m"
```

### 4. Generate a real, working dynamic credential

```bash
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault read -format=json database/creds/readonly
```

Expected: a JSON response with a brand-new `username` (something like
`v-token-readonly-...`), a `password`, and a `lease_id`. Run it again —
expected: a **completely different** username/password/lease_id every
time, proving this is real generation, not returning a cached static
value.

### 5. Prove the generated credential actually works against Postgres

```bash
USERNAME="<paste from exercise 4>"
PASSWORD="<paste from exercise 4>"
docker run --rm --network vault-net -e PGPASSWORD="$PASSWORD" postgres:16 \
  psql -h vault-pg -U "$USERNAME" -d appdb -c "SELECT current_user;"
```

Expected: the query succeeds and returns the generated username — this
is a real Postgres role that Vault created moments ago, not a
simulation.

### 6. Revoke the lease and prove access is cut off immediately

```bash
LEASE_ID="<paste from exercise 4's output>"
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault lease revoke "$LEASE_ID"
docker run --rm --network vault-net -e PGPASSWORD="$PASSWORD" postgres:16 \
  psql -h vault-pg -U "$USERNAME" -d appdb -c "SELECT current_user;"
```

Expected: `FATAL: password authentication failed for user "..."` — the
*exact same* credentials that worked in exercise 5 are now rejected,
because Vault actually dropped that Postgres role when the lease was
revoked. This is the mechanism module 02 described in one sentence,
now proven end to end: generate, use, revoke, confirm dead.

### 7. Diagnose and fix: a Vault role that grants far more than intended

A team defines a dynamic role whose `creation_statements` grants
`ALL PRIVILEGES` instead of `SELECT` "to avoid permission errors during
testing," and never tightens it before using the role in a real
application. Explain the risk this creates, and fix the role definition.

<details>
<summary>Solution</summary>

Root cause: dynamic secrets bound the *lifetime* of leaked credentials,
but say nothing about their *scope* — a short-lived credential with
`ALL PRIVILEGES` can still do enormous damage in the minutes before its
lease expires (drop tables, alter data, exfiltrate everything). Dynamic
secrets are a mitigation for *standing* risk, not a substitute for
least-privilege grants.

Fix: redefine the role's `creation_statements` to grant exactly what
the consuming application needs — `GRANT SELECT` for a read-only
reporting service, `GRANT SELECT, INSERT, UPDATE` for a typical app
role, never `ALL PRIVILEGES` as a default. Combine short-lived *and*
narrowly-scoped — the two properties are independent and both matter.

</details>

### 8. Clean up

```bash
docker rm -f vault-dev vault-pg
docker network rm vault-net
```

## Independent challenge

No commands given. Design the secrets architecture for a service that
needs: (1) a database credential for its normal read/write operations,
(2) a separate, more privileged database credential only used by a
nightly migration job, and (3) a static API key for a third-party
service that doesn't support dynamic credential generation at all.
Decide, for each of the three, whether it should be a Vault dynamic
secret or a KV-stored static secret, what TTL you'd give any dynamic
ones, and what consumption pattern (module 02's mount-vs-env-var
lesson, applied here) each credential should use so that a short lease
doesn't expire mid-operation. Explain specifically why the nightly
migration job's credential benefits *more* from being dynamic than the
service's everyday read/write credential does.

<details>
<summary>Stuck? One hint</summary>

(1) and (2) are dynamic-secret candidates (a real database), (3) must
be a static KV secret (no dynamic generation possible for a third-party
API key). The migration job's credential benefits more from being
dynamic because it's **used rarely, for a short bounded window, then
not needed again until the next run** — a perfect fit for "generate
right before use, let it expire shortly after," minimizing the window
where a highly-privileged credential exists at all. The everyday
service credential still benefits from being dynamic, but needs a
longer-lived approach (renewable leases, or the app requesting a fresh
one periodically) since the service runs continuously — a mismatch
between a 1-minute TTL and a long-running process is exactly the kind of
gap that would make a lease expire mid-request if not handled
deliberately.

</details>

## Common mistakes & troubleshooting

- **Using Vault dev mode for anything beyond local learning.** Dev mode
  runs unsealed, in-memory, with a fixed root token — it has none of
  production Vault's security properties. Every exercise in this module
  says so explicitly for a reason.
- **Assuming a short TTL alone means a role is safe.** Exercise 7
  showed this directly: an overly broad grant is still dangerous for
  its whole lease window. Short-lived and narrowly-scoped are two
  independent properties — you need both.
- **Confusing the database engine's "connection" credential with what
  it generates.** The connection credential (Vault's own access to the
  database) is the one standing, long-lived credential in the whole
  system — protect it accordingly. Everything the engine *generates*
  from that connection is short-lived by design.
- **Forgetting a long-running process needs a lease-renewal strategy.**
  A dynamic credential with a 1-minute TTL handed to a service that
  runs for hours will simply stop working partway through unless the
  service explicitly renews or re-requests it — plan for this rather
  than discovering it in production.
- **Treating Vault as a drop-in replacement with no operational cost.**
  As the Concepts section stresses, you now own Vault's availability,
  unsealing, and upgrades — a real trade against managed Key Vault, not
  a strictly-better free upgrade.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the fundamental difference between how the KV engine and the
   database engine respond to a read request?
2. What is a lease, and what two things can cause a dynamic credential
   to stop working?
3. Why does the database secrets engine need its own "connection"
   credential, and why is that credential different in kind from what
   it generates?
4. In exercise 7, why wasn't a short TTL enough to make the overly
   broad role safe?
5. What's the operational cost of choosing Vault over a managed
   service like Key Vault, and why doesn't that make Vault the wrong
   choice universally?

<details>
<summary>Answers</summary>

1. The KV engine returns the same value you previously stored (versioned,
   but otherwise "give me back what I wrote"). The database engine
   generates a brand-new, real credential in the target database on
   every read — there's no stored value being returned at all; each
   read is a fresh act of creation.
2. A lease is the duration Vault attaches to a generated dynamic
   credential, after which Vault automatically revokes it. A credential
   stops working either when its lease naturally expires, or when
   someone explicitly runs `vault lease revoke` on it before that,
   producing the same result on demand.
3. Because Vault has to actually create and drop roles in the target
   database on your behalf, it needs its own standing access to do
   that — this connection credential is long-lived and privileged (the
   one credential in the system that isn't dynamic), fundamentally
   different from the short-lived, narrowly-scoped credentials it
   subsequently generates for consumers.
4. Because a short TTL only bounds *how long* a leaked credential is
   dangerous — it says nothing about *what* that credential can do while
   it's still valid. An `ALL PRIVILEGES` role can do serious damage in
   even a one-minute window; short-lived and narrowly-scoped are
   independent properties that both need to be deliberately configured.
5. You become responsible for Vault's availability, unsealing, storage
   backend, and upgrades — work a managed service like Key Vault
   absorbs for you. It's not universally wrong because that operational
   cost buys real capability (dynamic secrets, pluggable auth, more
   portability across clouds) that a team with the operational maturity
   to run it may specifically need.

</details>

## Further reading & sources

- [HashiCorp Vault: What is Vault?](https://developer.hashicorp.com/vault/docs/what-is-vault) - the official conceptual overview of secrets engines and the broader Vault model.
- [HashiCorp Vault: Database secrets engine](https://developer.hashicorp.com/vault/docs/secrets/databases) - the full reference for the connection/role/creds mechanics used throughout this module's exercises.
- [HashiCorp Vault: Leases, renewal, and revocation](https://developer.hashicorp.com/vault/docs/concepts/lease) - the lease lifecycle this module's exercise 6 exercises directly.
- [HashiCorp Vault: Seal/unseal concepts](https://developer.hashicorp.com/vault/docs/concepts/seal) - what dev mode skips, and what a real production Vault deployment must handle.
- [HashiCorp: Vault vs. dev mode warnings](https://developer.hashicorp.com/vault/docs/concepts/dev-server) - the official warning against using dev mode beyond local learning, referenced throughout this module.

## Next

Continue to
[09-capstone-project](../09-capstone-project/README.md) — bring every
layer of this track together into one defensible deployment, complete
with the incident-response runbook you practiced in module 07.
</content>
