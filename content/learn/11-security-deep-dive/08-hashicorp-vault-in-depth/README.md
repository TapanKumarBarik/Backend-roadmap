# HashiCorp Vault in Depth

> **Prerequisites:** Module 02 (Secrets Management & Azure Key Vault), Module 07 (Incident Response Credential Rotation), and local Docker Engine with `psql` or Postgres container runtime access.  
> **Estimated Reading Time:** 35 minutes  
> **Target Audience:** Backend Engineers, Platform Engineers, Security Engineers, Database Reliability Engineers.

> [!TIP]
> **The Golden Rule of Dynamic Secrets:** Dynamic credentials shrink blast radius by bounding *lifetime* via enforced TTLs and leases, not *permissions* — always pair short TTLs with minimal least-privilege SQL grants (`SELECT`/`INSERT`/`UPDATE`, never `ALL PRIVILEGES`), protect Vault's single standing database connection credential, design long-running services to renew or re-fetch leases before expiry, and never run Vault dev mode outside local learning.

---

## Why This Matters

Module 02 named HashiCorp Vault as the cloud-agnostic alternative to Key Vault, described its headline feature — **dynamic secrets** — in one paragraph, and moved on. That paragraph undersold the idea: a dynamic secret isn't just "generated on demand," it's a secret with a **built-in expiry date that Vault itself enforces**, revoking the underlying access automatically, whether or not anyone remembers to. A leaked static Key Vault secret is dangerous until a human notices and rotates it. A leaked dynamic Vault credential is dangerous for, at most, its lease duration — minutes, typically — after which it simply stops working on its own. This module runs Vault for real: the KV engine (a closer analog to Key Vault, for the versioning/audit comparison), and then the **database secrets engine**, where you'll generate a real, working Postgres credential, prove it works, and prove that revoking its lease cuts off that exact access immediately — the mechanism, not the marketing.

---

## 1. Architectural Mental Model: KV vs. Dynamic Database Secrets & Lease Lifecycle

Vault isolates credential workflows behind **mounted secrets engines**. Whereas the KV v2 engine behaves like a versioned safe returning stored static bytes, the Database secrets engine uses a single standing admin connection to provision ephemeral, uniquely named Postgres roles on every read and enforces their destruction when a lease expires or is revoked:

```mermaid
flowchart TD
    subgraph StaticKV["KV v2 Engine (Mounted at secret/)"]
        KVP["vault kv put secret/x value=s3cr3t"] --> KVS["Versioned Storage (v1, v2...)"]
        KVS --> KVG["vault kv get secret/x -> Returns Same Stored Value"]
    end

    subgraph DynamicDB["Database Secrets Engine (Mounted at database/)"]
        Conn["Connection Config (Single Standing Admin Credential)"] --> RoleTmpl["Role Template (SQL Grants + default_ttl / max_ttl)"]
        Read["vault read database/creds/readonly"] --> RoleTmpl
        RoleTmpl -->|Executes CREATE ROLE| PG["Target PostgreSQL Server"]
        PG -->|Returns Unique Role + lease_id| Lease["Active Lease Timer (e.g. 1m)"]
        Lease -->|Natural TTL Expiry| Revoke["Vault Executes DROP ROLE"]
        Lease -->|Explicit vault lease revoke| Revoke
    end
```

### Core Concepts

#### Vault's Core Model: A Secrets Engine Mounted at a Path
Vault doesn't have one universal "store a secret" API — it has **secrets engines**, each mounted at a path, each implementing its own logic for what "read a secret" means. The **KV (key-value) engine** behaves like Key Vault: you write a value, you read it back, Vault versions it. The **database engine** behaves completely differently: you don't write a value to read back at all — you define *how Vault should generate one*, and every read creates a **brand-new, real credential** in the target database, on the spot. This distinction — "give me back what I stored" vs. "generate me a real, working credential right now" — is the entire conceptual leap from Key Vault to Vault's dynamic-secrets model.

#### Leases: Every Dynamic Secret Has a Built-In, Enforced Expiry
Every credential the database engine generates comes with a **lease** — a `lease_id`, and a duration after which Vault automatically revokes it, no human action required. Revocation isn't a soft "please stop using this" — for the database engine, it's Vault actually connecting to the target database and running the SQL to drop or disable the role it created. A dynamic credential that's never explicitly revoked still expires on its own once its lease runs out; **explicit revocation** (`vault lease revoke`) does the same thing immediately, on demand — the exact tool an incident response (module 07) reaches for the moment a credential is suspected compromised.

#### Configuring the Database Engine: Connection + Role Template
Two pieces of configuration turn the database engine on for a specific database:

1. **A connection** — Vault's own credentials for reaching the target database, so it has permission to create/drop roles on your behalf. This one, relatively long-lived credential is the *only* standing database credential in the whole system — everything the database engine generates afterward is short-lived.
2. **A role** — a SQL template describing exactly what a generated credential should be allowed to do (`GRANT SELECT ...` for a read-only role, say) and how long its lease should last (`default_ttl` / `max_ttl`).

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

Every subsequent `vault read database/creds/readonly` runs that `creation_statements` template with a fresh, randomly-generated `{{name}}` and `{{password}}` — a genuinely new Postgres role each time, not a shared one.

#### Why This Beats a Static Secret, Concretely
A static credential (a Key Vault secret, an env var, a value in a `.env` file) grants access **until someone notices it should be revoked and does so** — module 02's whole "long-lived secret is a standing liability" argument. A dynamic credential grants access **until its lease expires, automatically, regardless of whether anyone is watching**. The blast radius of a leaked dynamic credential is bounded by its TTL in a way a static secret's simply isn't — this is the concrete, mechanical reason module 02 called dynamic secrets "the most secure secret is one that's short-lived and auto-revoked," now something you can verify end to end.

#### The Operational Cost: You Now Run Vault
Module 02 flagged this and it's worth restating concretely, now that you stand Vault up yourself: you're responsible for its availability, its **unsealing** (a fresh, non-dev Vault starts **sealed** — unable to decrypt its own storage — until enough unseal keys or auto-unseal KMS permissions are provided; dev mode, used in this module's exercises, skips this entirely and must never be used beyond local learning), its storage backend, and its upgrades. Managed Key Vault trades away dynamic-secrets power for someone else operating all of that. Neither choice is universally correct — it's the same build-vs-buy trade-off that recurs throughout this track.

---

## 2. Taxonomic Comparison: Static KV vs. Dynamic Secrets vs. Managed Key Vault

| Dimension | Vault KV v2 Engine | Vault Database Secrets Engine | Azure Key Vault (Module 02) |
| :--- | :--- | :--- | :--- |
| **Credential Model** | Versioned static secret stored at path | Ephemeral DB role synthesized per read | Managed versioned static secret / cert |
| **Leak Blast Radius** | Unbounded until manual rotation | Bounded by `default_ttl` / `max_ttl` | Unbounded until manual/EventGrid rotation |
| **Revocation Mechanism** | Overwrite/delete version + manual DB update | Automatic `DROP ROLE` on TTL or `vault lease revoke` | Disable version + manual downstream invalidation |
| **Standing Secrets Needed** | Many (one per app/env secret) | One (Vault's own DB admin connection) | Many (one per app/env secret) |
| **Operational Ownership** | Self-hosted (HA, Raft/storage, Seal/Unseal) | Self-hosted (HA, Raft/storage, Seal/Unseal) | Fully managed by Azure (SLA, KMS backing) |

### Key Database Engine Lease Controls

| Parameter / Concept | Scope | Effect on Runtime Behavior |
| :--- | :--- | :--- |
| **`default_ttl`** | Role definition | Initial lease lifetime granted if the caller does not request a shorter TTL |
| **`max_ttl`** | Role / Mount config | Hard ceiling beyond which a lease **cannot** be renewed — caller must fetch a new role |
| **`lease_id`** | Per generated credential | Unique handle required to renew (`vault lease renew`) or immediately drop (`vault lease revoke`) |
| **`creation_statements`** | Role SQL template | Determines *permissions* (`SELECT` vs `ALL PRIVILEGES`); independent of TTL lifetime |

---

## 3. Command Reference

| Command | What it does | Example |
| :--- | :--- | :--- |
| Start a dev-mode Vault | Runs Vault in-memory, unsealed, for local learning only | `docker run -d --cap-add=IPC_LOCK -e VAULT_DEV_ROOT_TOKEN_ID=root -e VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200 -p 8200:8200 hashicorp/vault:1.17` |
| Write a KV secret | Stores a versioned value | `vault kv put secret/myapp/db-pass value=s3cr3t` |
| Read a KV secret | Reads the current version back | `vault kv get secret/myapp/db-pass` |
| Read a specific KV version | Reads an older version | `vault kv get -version=1 secret/myapp/db-pass` |
| Enable the database engine | Mounts the engine at `database/` | `vault secrets enable database` |
| Configure a DB connection | Gives Vault its own credential to the target DB | `vault write database/config/<name> plugin_name=postgresql-database-plugin ...` |
| Define a dynamic role | The SQL template + TTLs for generated credentials | `vault write database/roles/<role> db_name=... creation_statements=... default_ttl=1m` |
| Generate a dynamic credential | Creates a real, new DB role right now | `vault read database/creds/<role>` |
| Revoke a lease immediately | Actually drops the generated role, on demand | `vault lease revoke <lease_id>` |

---

## 4. Production War Story Post-Mortem: Unrenewed Dynamic Leases Break Live Checkout at `T+60m`

- **Severity:** SEV-1
- **Detection Time:** 3 minutes (automated error spike on `/api/checkout`)
- **Resolution Time:** 29 minutes
- **Impact:** Production `orders-api` Pods fetched dynamic Postgres credentials once at container boot (`default_ttl=1h`) and stored them in an environment-like static DB pool config without a renewal loop. Exactly 60 minutes after deploy, Vault revoked every Pod's Postgres role simultaneously, triggering total database connection failures.

### What Happened

```mermaid
sequenceDiagram
    participant Pod as orders-api Pod
    participant Vault as HashiCorp Vault
    participant PG as Production PostgreSQL

    Pod->>Vault: Read database/creds/orders-rw at Startup (00:00)
    Vault->>PG: CREATE ROLE v-k8s-orders-a1b2 VALID UNTIL 01:00
    Vault-->>Pod: Return username, password, lease_id (1h TTL)
    Pod->>PG: Open Static Connection Pool Using v-k8s-orders-a1b2
    Note over Pod,PG: Traffic succeeds for 59 minutes (No Lease Renewal Configured)
    Vault->>PG: Lease Expired at 01:00 -> DROP ROLE v-k8s-orders-a1b2
    Pod->>PG: New Pool Connection Request with v-k8s-orders-a1b2
    PG-->>Pod: FATAL password authentication failed for user v-k8s-orders-a1b2
    Pod-->>Pod: CrashLoopBackOff on DB Pool Exhaustion
```

### Root Cause Analysis

1. **Static Consumption of Dynamic Secrets:** The application treated dynamic Vault credentials like static env vars injected once at startup, ignoring lease TTL semantics.
2. **Missing Renewal & Re-Fetch Lifecycle:** Neither a Vault Agent sidecar nor an in-app `LifetimeWatcher` renewed the lease prior to expiry, nor did the DB pool rotate credentials before reaching `max_ttl`.
3. **Thundering Herd on Restart:** When all replicas crashed at the exact 60-minute boundary, simultaneous restarts overwhelmed Vault auth and Postgres role creation briefly during recovery.

### The Fix & Architectural Hardening

- **Background Lease Renewal + Rotation:** Long-running services use an SDK lease watcher (or Vault Agent template) to renew leases at ~66% of `lease_duration` and swap the database connection pool cleanly with a fresh role before `max_ttl` is reached.
- **Short-Lived Jobs vs. Continuous Services:** CronJobs / DB migrations use non-renewable short TTLs (`5m`), while continuous services pair renewable leases (`1h` default, `24h` max) with graceful pool recycling.
- **Proactive Expiry Alerting:** Metrics monitor `vault.lease.remaining_seconds` so alerts fire well before any active pool credential drops below 20% remaining TTL.

---

## 5. Multi-Language Production Implementation: Dynamic DB Credential Acquisition, Renewal & Revocation

Production services consuming Vault dynamic database secrets must treat leases as first-class lifecycles: fetch fresh credentials, launch a background renewal loop, and revoke leases explicitly during graceful shutdown or incident containment.

````carousel
```go
package secrets

import (
	"context"
	"fmt"
	"time"

	vault "github.com/hashicorp/vault/api"
)

type DynamicDBCreds struct {
	Username string
	Password string
	LeaseID  string
}

// AcquireAndWatchDBLease requests a dynamic Postgres credential from Vault,
// maintains lease renewal in the background, and revokes it when ctx is canceled.
func AcquireAndWatchDBLease(ctx context.Context, client *vault.Client, role string) (*DynamicDBCreds, error) {
	secret, err := client.Logical().ReadWithContext(ctx, fmt.Sprintf("database/creds/%s", role))
	if err != nil {
		return nil, fmt.Errorf("failed reading dynamic creds for role %s: %w", role, err)
	}
	if secret == nil || secret.Data == nil {
		return nil, fmt.Errorf("empty secret returned for role %s", role)
	}

	creds := &DynamicDBCreds{
		Username: fmt.Sprint(secret.Data["username"]),
		Password: fmt.Sprint(secret.Data["password"]),
		LeaseID:  secret.LeaseID,
	}

	watcher, err := client.NewLifetimeWatcher(&vault.LifetimeWatcherInput{
		Secret:    secret,
		Increment: secret.LeaseDuration,
	})
	if err != nil {
		_ = client.Sys().RevokeWithContext(context.Background(), secret.LeaseID)
		return nil, fmt.Errorf("failed initializing lease watcher: %w", err)
	}

	go func() {
		watcher.Start()
		defer watcher.Stop()
		for {
			select {
			case <-ctx.Done():
				revokeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				_ = client.Sys().RevokeWithContext(revokeCtx, secret.LeaseID)
				cancel()
				return
			case <-watcher.DoneCh():
				return
			case <-watcher.RenewCh():
			}
		}
	}()

	return creds, nil
}
```
<!-- slide -->
```typescript
export interface DynamicLease {
  username: string;
  password: string;
  leaseId: string;
  leaseDurationSec: number;
}

/**
 * Acquires dynamic DB credentials from Vault's HTTP API, schedules automatic renewal
 * before TTL expiry, and exposes explicit immediate revocation.
 */
export class VaultDatabaseLeaseManager {
  private renewTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly vaultAddr: string, private readonly vaultToken: string) {}

  async acquire(role: string): Promise<DynamicLease> {
    const res = await fetch(`${this.vaultAddr}/v1/database/creds/${role}`, {
      headers: { "X-Vault-Token": this.vaultToken },
    });
    if (!res.ok) throw new Error(`Vault creds read failed: ${res.status}`);

    const payload = (await res.json()) as {
      lease_id: string;
      lease_duration: number;
      data: { username: string; password: string };
    };

    const lease: DynamicLease = {
      username: payload.data.username,
      password: payload.data.password,
      leaseId: payload.lease_id,
      leaseDurationSec: payload.lease_duration,
    };

    this.scheduleRenewal(lease.leaseId, lease.leaseDurationSec);
    return lease;
  }

  private scheduleRenewal(leaseId: string, durationSec: number): void {
    const renewAfterMs = Math.max(durationSec * 0.66, 5) * 1000;
    this.renewTimer = setTimeout(async () => {
      const res = await fetch(`${this.vaultAddr}/v1/sys/leases/renew`, {
        method: "PUT",
        headers: { "X-Vault-Token": this.vaultToken, "Content-Type": "application/json" },
        body: JSON.stringify({ lease_id: leaseId }),
      });
      if (res.ok) {
        const renewed = (await res.json()) as { lease_duration: number };
        this.scheduleRenewal(leaseId, renewed.lease_duration);
      }
    }, renewAfterMs);
  }

  async revoke(leaseId: string): Promise<void> {
    if (this.renewTimer) clearTimeout(this.renewTimer);
    const res = await fetch(`${this.vaultAddr}/v1/sys/leases/revoke`, {
      method: "PUT",
      headers: { "X-Vault-Token": this.vaultToken, "Content-Type": "application/json" },
      body: JSON.stringify({ lease_id: leaseId }),
    });
    if (!res.ok) throw new Error(`Lease revocation failed: ${res.status}`);
  }
}
```
<!-- slide -->
```python
from dataclasses import dataclass
import threading
import hvac


@dataclass
class DynamicCredential:
    username: str
    password: str
    lease_id: str
    lease_duration: int


class DynamicDatabaseLease:
    """Manages Vault dynamic DB credentials with background renewal and explicit revoke."""

    def __init__(self, vault_url: str, token: str) -> None:
        self._client = hvac.Client(url=vault_url, token=token)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def acquire(self, role_name: str) -> DynamicCredential:
        resp = self._client.secrets.database.generate_credentials(name=role_name)
        cred = DynamicCredential(
            username=resp["data"]["username"],
            password=resp["data"]["password"],
            lease_id=resp["lease_id"],
            lease_duration=int(resp["lease_duration"]),
        )
        self._start_renewer(cred.lease_id, cred.lease_duration)
        return cred

    def _start_renewer(self, lease_id: str, duration: int) -> None:
        def _loop() -> None:
            interval = max(duration * 0.66, 5.0)
            while not self._stop_event.wait(interval):
                try:
                    renewed = self._client.sys.renew_lease(lease_id=lease_id)
                    interval = max(int(renewed["lease_duration"]) * 0.66, 5.0)
                except hvac.exceptions.VaultError:
                    break

        self._thread = threading.Thread(target=_loop, daemon=True)
        self._thread.start()

    def revoke(self, lease_id: str) -> None:
        self._stop_event.set()
        self._client.sys.revoke_lease(lease_id=lease_id)
```
<!-- slide -->
```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using VaultSharp;
using VaultSharp.V1.AuthMethods.Token;
using VaultSharp.V1.SecretsEngines.Database;

namespace VaultDynamicSecrets
{
    public sealed class VaultDbLeaseManager : IAsyncDisposable
    {
        private readonly IVaultClient _client;
        private readonly CancellationTokenSource _cts = new();
        private string? _activeLeaseId;

        public VaultDbLeaseManager(string vaultUri, string token)
        {
            var settings = new VaultClientSettings(vaultUri, new TokenAuthMethodInfo(token));
            _client = new VaultClient(settings);
        }

        public async Task<(string Username, string Password, string LeaseId)> AcquireAsync(string role)
        {
            var secret = await _client.V1.Secrets.Database.GetCredentialsAsync(role);
            _activeLeaseId = secret.LeaseId;

            _ = RenewLoopAsync(secret.LeaseId, secret.LeaseDurationSeconds, _cts.Token);
            return (secret.Data.Username, secret.Data.Password, secret.LeaseId);
        }

        private async Task RenewLoopAsync(string leaseId, int durationSec, CancellationToken ct)
        {
            int currentDuration = durationSec;
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(Math.Max(currentDuration * 0.66, 5)), ct);
                var renewed = await _client.V1.System.RenewLeaseAsync(leaseId, currentDuration);
                currentDuration = renewed.LeaseDurationSeconds;
            }
        }

        public async ValueTask DisposeAsync()
        {
            _cts.Cancel();
            if (!string.IsNullOrEmpty(_activeLeaseId))
            {
                await _client.V1.System.RevokeLeaseAsync(_activeLeaseId);
            }
            _cts.Dispose();
        }
    }
}
```
````

---

## 6. Practical Hands-On Verification CLI Workflows

Run Vault in dev mode via Docker — **dev mode only**, never for anything beyond local learning (it runs unsealed, in-memory, with a fixed root token):

```bash
docker run -d --name vault-dev --cap-add=IPC_LOCK \
  -e 'VAULT_DEV_ROOT_TOKEN_ID=root' \
  -e 'VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200' \
  -p 8200:8200 hashicorp/vault:1.17
export VAULT_ADDR="http://127.0.0.1:8200"
export VAULT_TOKEN="root"
```

### 1. Store and Version a KV Secret

```bash
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault kv put secret/myapp/db-pass value=s3cr3t
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault kv put secret/myapp/db-pass value=rotated-v2
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault kv metadata get secret/myapp/db-pass
```

**Expected Output:**
```text
====== Metadata ======
Key                Value
---                -----
current_version    2
oldest_version     0

====== Version 1 ======
created_time       ...
destroyed          false

====== Version 2 ======
created_time       ...
destroyed          false
```

The metadata output shows **two versions**, exactly like module 02's Key Vault version history — writing a new value never overwrote the old one.

### 2. Stand Up Postgres and Connect It to Vault's Database Engine

```bash
docker network create vault-net
docker network connect vault-net vault-dev
docker run -d --name vault-pg --network vault-net -e POSTGRES_PASSWORD=vaultroot -e POSTGRES_DB=appdb postgres:16
sleep 5

docker exec vault-pg psql -U postgres -d appdb -c "CREATE ROLE \"vault-admin\" WITH LOGIN PASSWORD 'vaultroot' SUPERUSER;"

docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault secrets enable database

docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault write database/config/appdb-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="readonly" \
  connection_url="postgresql://{{username}}:{{password}}@vault-pg:5432/appdb?sslmode=disable" \
  username="vault-admin" \
  password="vaultroot"
```

**Expected Output:**
```text
Success! Enabled the database secrets engine at: database/
Success! Data written to: database/config/appdb-postgres
```

Vault now has its own (long-lived) credential to reach Postgres — the *only* standing credential in this whole exercise.

### 3. Define a Dynamic, Short-Lived, Read-Only Role

```bash
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault write database/roles/readonly \
  db_name=appdb-postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1m" \
  max_ttl="5m"
```

**Expected Output:**
```text
Success! Data written to: database/roles/readonly
```

### 4. Generate a Real, Working Dynamic Credential

```bash
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault read -format=json database/creds/readonly
```

**Expected Output:**
```json
{
  "lease_id": "database/creds/readonly/aB1cD2eF3gH4iJ5kL6mN7oP8",
  "lease_duration": 60,
  "renewable": true,
  "data": {
    "password": "...",
    "username": "v-root-readonly-..."
  }
}
```

Run it a second time: expect a **completely different** `username`, `password`, and `lease_id` every time, proving this is real credential synthesis, not a cached static value.

### 5. Prove the Generated Credential Actually Works Against Postgres

```bash
USERNAME="<paste from exercise 4>"
PASSWORD="<paste from exercise 4>"
docker run --rm --network vault-net -e PGPASSWORD="$PASSWORD" postgres:16 \
  psql -h vault-pg -U "$USERNAME" -d appdb -c "SELECT current_user;"
```

**Expected Output:**
```text
           current_user
----------------------------------
 v-root-readonly-...
(1 row)
```

This is a real Postgres role that Vault created moments ago, not a simulation.

### 6. Revoke the Lease and Prove Access Is Cut Off Immediately

```bash
LEASE_ID="<paste from exercise 4's output>"
docker exec -e VAULT_ADDR=$VAULT_ADDR -e VAULT_TOKEN=$VAULT_TOKEN vault-dev vault lease revoke "$LEASE_ID"
docker run --rm --network vault-net -e PGPASSWORD="$PASSWORD" postgres:16 \
  psql -h vault-pg -U "$USERNAME" -d appdb -c "SELECT current_user;"
```

**Expected Output:**
```text
All revocation operations queued successfully!
psql: error: connection to server at "vault-pg", port 5432 failed: FATAL: password authentication failed for user "v-root-readonly-..."
```

The *exact same* credentials that worked in Exercise 5 are now rejected, because Vault actually dropped that Postgres role when the lease was revoked. This proves the dynamic-secrets mechanism end to end: generate, use, revoke, confirm dead.

### 7. Diagnose and Fix: A Vault Role That Grants Far More Than Intended

A team defines a dynamic role whose `creation_statements` grants `ALL PRIVILEGES` instead of `SELECT` "to avoid permission errors during testing," and never tightens it before using the role in a real application. Explain the risk this creates, and fix the role definition.

<details>
<summary>Solution</summary>

Root cause: dynamic secrets bound the *lifetime* of leaked credentials, but say nothing about their *scope* — a short-lived credential with `ALL PRIVILEGES` can still do enormous damage in the minutes before its lease expires (drop tables, alter data, exfiltrate everything). Dynamic secrets are a mitigation for *standing* risk, not a substitute for least-privilege grants.

Fix: redefine the role's `creation_statements` to grant exactly what the consuming application needs — `GRANT SELECT` for a read-only reporting service, `GRANT SELECT, INSERT, UPDATE` for a typical app role, never `ALL PRIVILEGES` as a default. Combine short-lived *and* narrowly-scoped — the two properties are independent and both matter.

</details>

### 8. Clean Up

```bash
docker rm -f vault-dev vault-pg
docker network rm vault-net
```

### Independent Challenge

No commands given. Design the secrets architecture for a service that needs: (1) a database credential for its normal read/write operations, (2) a separate, more privileged database credential only used by a nightly migration job, and (3) a static API key for a third-party service that doesn't support dynamic credential generation at all. Decide, for each of the three, whether it should be a Vault dynamic secret or a KV-stored static secret, what TTL you'd give any dynamic ones, and what consumption pattern (module 02's mount-vs-env-var lesson, applied here) each credential should use so that a short lease doesn't expire mid-operation. Explain specifically why the nightly migration job's credential benefits *more* from being dynamic than the service's everyday read/write credential does.

<details>
<summary>Stuck? One hint</summary>

(1) and (2) are dynamic-secret candidates (a real database), (3) must be a static KV secret (no dynamic generation possible for a third-party API key). The migration job's credential benefits more from being dynamic because it's **used rarely, for a short bounded window, then not needed again until the next run** — a perfect fit for "generate right before use, let it expire shortly after," minimizing the window where a highly-privileged credential exists at all. The everyday service credential still benefits from being dynamic, but needs a longer-lived approach (renewable leases, or the app requesting a fresh one periodically) since the service runs continuously — a mismatch between a 1-minute TTL and a long-running process is exactly the kind of gap that would make a lease expire mid-request if not handled deliberately.

</details>

---

## 7. Common Mistakes & Troubleshooting

- **Using Vault dev mode for anything beyond local learning.** Dev mode runs unsealed, in-memory, with a fixed root token — it has none of production Vault's security properties. Every exercise in this module says so explicitly for a reason.
- **Assuming a short TTL alone means a role is safe.** Exercise 7 showed this directly: an overly broad grant is still dangerous for its whole lease window. Short-lived and narrowly-scoped are two independent properties — you need both.
- **Confusing the database engine's "connection" credential with what it generates.** The connection credential (Vault's own access to the database) is the one standing, long-lived credential in the whole system — protect it accordingly. Everything the engine *generates* from that connection is short-lived by design.
- **Forgetting a long-running process needs a lease-renewal strategy.** A dynamic credential with a 1-minute TTL handed to a service that runs for hours will simply stop working partway through unless the service explicitly renews or re-requests it — plan for this rather than discovering it in production.
- **Treating Vault as a drop-in replacement with no operational cost.** As the Concepts section stresses, you now own Vault's availability, unsealing, and upgrades — a real trade against managed Key Vault, not a strictly-better free upgrade.

---

## 8. Operational Validation Checkpoints

<details>
<summary><strong>Checkpoint 1: Production Vault Container Restarts Locked & Returns HTTP 503</strong></summary>

**Scenario:** After patching your self-hosted Kubernetes node, the production Vault Pod restarts cleanly, yet every application requesting `database/creds/orders` receives HTTP `503 Service Unavailable: Vault is sealed`. Why did dev mode never exhibit this, and what handles it in production?

**Diagnosis & Remediation:** Production Vault encrypts its storage backend using a master encryption key protected by Shamir key shares (or cloud KMS auto-unseal); on every process restart, Vault boots **sealed** without the decryption key in memory. Dev mode bypasses sealing entirely in-memory. To resolve immediately, unseal using threshold Shamir keys (`vault operator unseal`) or configure **Auto-Unseal** backed by Azure Key Vault KMS so Vault restarts automatically unseal without human intervention.

</details>

<details>
<summary><strong>Checkpoint 2: Dynamic Credential Fails Immediately After `max_ttl` Despite Active Renewal Loop</strong></summary>

**Scenario:** A long-running backend service configures a renewal loop calling `vault lease renew` every 40 minutes for a dynamic role configured with `default_ttl=1h` and `max_ttl=4h`. At the 4-hour mark, Vault revokes the role anyway and the service crashes. Why did renewal stop working?

**Diagnosis & Remediation:** `max_ttl` is a hard ceiling on the total cumulative lifetime of a single lease — renewals extend the lease *up to* `max_ttl`, never past it. Long-running applications must either (a) use Vault Agent / an SDK callback to **fetch a brand-new credential** and swap the database connection pool cleanly once remaining TTL reaches a threshold before `max_ttl`, or (b) run shorter-lived worker processes/sidecars that reload new leases gracefully.

</details>

<details>
<summary><strong>Checkpoint 3: `vault lease revoke` Returns Success Yet Attacker Session Persists Briefly</strong></summary>

**Scenario:** During an incident (module 07), you run `vault lease revoke <lease_id>`, confirming Vault dropped the Postgres role (`DROP ROLE`), yet an already-open long-running TCP connection holding a cursor keeps streaming rows for several seconds. What explains this, and how do you guarantee immediate cutoff?

**Diagnosis & Remediation:** PostgreSQL checks authentication (`pg_hba.conf` / password validation) when a **new connection** opens; dropping a role prevents all future connections and may fail if the role still owns active locks or active backends (`DROP ROLE` fails or leaves an active socket depending on `revocation_statements`). Configure custom `revocation_statements` on the Vault role that execute `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '{{name}}'; REVOKE ALL PRIVILEGES ...; DROP ROLE IF EXISTS "{{name}}";` so active malicious sockets are killed immediately alongside role deletion.

</details>

---

## 9. Checkpoint Quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the fundamental difference between how the KV engine and the database engine respond to a read request?
2. What is a lease, and what two things can cause a dynamic credential to stop working?
3. Why does the database secrets engine need its own "connection" credential, and why is that credential different in kind from what it generates?
4. In exercise 7, why wasn't a short TTL enough to make the overly broad role safe?
5. What's the operational cost of choosing Vault over a managed service like Key Vault, and why doesn't that make Vault the wrong choice universally?

<details>
<summary>Answers</summary>

1. The KV engine returns the same value you previously stored (versioned, but otherwise "give me back what I wrote"). The database engine generates a brand-new, real credential in the target database on every read — there's no stored value being returned at all; each read is a fresh act of creation.
2. A lease is the duration Vault attaches to a generated dynamic credential, after which Vault automatically revokes it. A credential stops working either when its lease naturally expires, or when someone explicitly runs `vault lease revoke` on it before that, producing the same result on demand.
3. Because Vault has to actually create and drop roles in the target database on your behalf, it needs its own standing access to do that — this connection credential is long-lived and privileged (the one credential in the system that isn't dynamic), fundamentally different from the short-lived, narrowly-scoped credentials it subsequently generates for consumers.
4. Because a short TTL only bounds *how long* a leaked credential is dangerous — it says nothing about *what* that credential can do while it's still valid. An `ALL PRIVILEGES` role can do serious damage in even a one-minute window; short-lived and narrowly-scoped are independent properties that both need to be deliberately configured.
5. You become responsible for Vault's availability, unsealing, storage backend, and upgrades — work a managed service like Key Vault absorbs for you. It's not universally wrong because that operational cost buys real capability (dynamic secrets, pluggable auth, more portability across clouds) that a team with the operational maturity to run it may specifically need.

</details>

---

## 10. Further Reading & Sources

- [HashiCorp Vault: What is Vault?](https://developer.hashicorp.com/vault/docs/what-is-vault) - the official conceptual overview of secrets engines and the broader Vault model.
- [HashiCorp Vault: Database secrets engine](https://developer.hashicorp.com/vault/docs/secrets/databases) - the full reference for the connection/role/creds mechanics used throughout this module's exercises.
- [HashiCorp Vault: Leases, renewal, and revocation](https://developer.hashicorp.com/vault/docs/concepts/lease) - the lease lifecycle this module's exercise 6 exercises directly.
- [HashiCorp Vault: Seal/unseal concepts](https://developer.hashicorp.com/vault/docs/concepts/seal) - what dev mode skips, and what a real production Vault deployment must handle.
- [HashiCorp: Vault vs. dev mode warnings](https://developer.hashicorp.com/vault/docs/concepts/dev-server) - the official warning against using dev mode beyond local learning, referenced throughout this module.
- [Secrets Management](../../../backend/09-security-deep-dive/05-secrets-management/README.md) - the tool-agnostic principles Vault implements: secrets out of code, rotation with overlapping validity, and least privilege.

---

## Next

Continue to [09-capstone-project](../09-capstone-project/README.md) — bring every layer of this track together into one defensible deployment, complete with the incident-response runbook you practiced in module 07.
