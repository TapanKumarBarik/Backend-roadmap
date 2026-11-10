# Module 05: Service Configuration and Environments

> **Prerequisites:** [00-containerizing-a-backend-app](../00-containerizing-a-backend-app/README.md), [01-the-12-factor-app-in-a-container](../01-the-12-factor-app-in-a-container/README.md), and [Config and Secrets Management](../../08-observability-and-operational-readiness/02-configuration-and-secrets-management/README.md).  
> **Estimated Reading Time:** 28 minutes  
> **Target Audience:** Backend engineers and cloud infrastructure architects managing multi-environment configurations, zero-trust secrets injection, and runtime feature toggling.

> [!TIP]
> **Golden Rule of Service Configuration:** An immutable container image must run identically in development, staging, and production without rebuilding. Differences across environments must exist exclusively in injected runtime configuration, secrets must be typed to prevent log leakage and strictly isolated by environment scopes, and feature flags should decouple code deployment from feature release.

---

## Visual Mental Models & Architecture

### The Secure Configuration & Feature Flag Lifecycle

To achieve true dev/prod parity, runtime configuration is externalized from container images. Non-sensitive settings are injected via environment descriptors (ConfigMaps), while sensitive credentials are dynamically pulled from cryptographically isolated secret vaults.

```mermaid
flowchart TD
    subgraph Storage_Tiers["Configuration Storage Tiers"]
        Vault["Secret Store / Vault\n(AWS Secrets Mgr, Azure Key Vault, HashiCorp)"]
        ConfigRepo["Environment Config Repo / ConfigMap\n(GitOps Versioned - Non-Sensitive)"]
        FlagService["Feature Flag Engine\n(LaunchDarkly, Unleash, In-Memory Config)"]
    end

    subgraph Runtime_Pod["Container Runtime Boundary (Deploy Time)"]
        EnvInjection["Environment Injection\n(Pod Spec envFrom / secretRef)"]
        
        subgraph Boot_Validation["Application Boot (Fail-Fast Gate)"]
            Parser["Typed Config Validator\n(Pydantic Settings, Zod, Viper)"]
            FailCheck{"Valid Schema &\nRequired Fields?"}
            Parser --> FailCheck
        end

        FailCheck -- No (Missing / Malformed) --> Crash["Crash Container Immediately (Exit 1)\nPrevents Half-Configured Deploy!"]
        FailCheck -- Yes (Validated) --> MemoryConfig["In-Memory App State"]

        subgraph Execution["Runtime Execution"]
            MemoryConfig --> SecretRedact["SecretStr Redaction\n(Logs print '**********')"]
            MemoryConfig --> FlagEval["Dynamic Feature Toggle Check\n(if flags.new_checkout: ...)"]
        end
    end

    Vault -. Encrypted Ingestion .-> EnvInjection
    ConfigRepo -. Injected Values .-> EnvInjection
    FlagService -. Live State Stream .-> FlagEval
    EnvInjection --> Parser

    classDef storage fill:#f9f0ff,stroke:#8a2be2,stroke-width:2px;
    classDef runtime fill:#e6fffa,stroke:#00a389,stroke-width:2px;
    classDef error fill:#fff0f0,stroke:#e53e3e,stroke-width:2px;
    class Storage_Tiers storage;
    class Runtime_Pod runtime;
    class Crash error;
```

---

## Systematic Taxonomic Reference Grids

### Configuration Classification & Sensitivity Matrix

| Configuration Tier | Example Parameters | Recommended Storage Engine | Injection Method | Rotation Frequency | Leakage Blast Radius |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Static Code Constants** | Math constants, internal error codes, regexes | Source code repository | Hardcoded in source code | Code commit only | Zero (Non-sensitive) |
| **Non-Sensitive Env Config** | `LOG_LEVEL`, `PORT`, `MAX_POOL_SIZE`, `REGION` | Kubernetes `ConfigMap`, GitOps values | Environment variables (`-e`, `envFrom`) | Per deployment | Low (Operational drift) |
| **Dynamic Feature Flags** | `enable_new_pricing`, `killswitch_v2` | Feature Flag Engine (Unleash, LaunchDarkly) | Redis / gRPC SDK / Polled HTTP | Real-time (Sub-second) | Low (Functional degradation) |
| **Confidential Secrets** | `DATABASE_URL`, API keys, private signing keys | Dedicated Vault (AWS Secrets Manager, Key Vault) | Injected Secrets / CSI Driver | 30 – 90 days | **Extreme** (Data breach / Compromise) |

### Feature Flag Taxonomy Matrix

| Flag Category | Primary Purpose | Typical Lifespan | Dynamism Requirement | Recommended Cleanup SLA |
| :--- | :--- | :--- | :--- | :--- |
| **Release Toggles** | Dark deployment; decouple deploy from release | 1 – 4 weeks | Semi-dynamic (Manual toggle) | Remove immediately upon 100% rollout |
| **Operational Kill-Switches** | Disable degraded non-critical integrations (e.g. recommendations) | Permanent | **Instant Real-Time** (Emergency flip) | Retain permanently; audit annually |
| **Experimentation (A/B)** | Test user conversion variants statistically | 2 – 8 weeks | Dynamic (User cohort hash routing) | Remove when experiment concludes |
| **Permission / Entitlement** | Gate features by customer subscription plan | Permanent | Dynamic per request | Permanent (Domain logic model) |

---

## Production War Stories: Incident Post-Mortem

### SEV-1 Post-Mortem: The Shared Secret Store Database Wiping Disaster

#### Incident Overview
* **Severity:** SEV-1 (Critical Catastrophic Data Loss)
* **Detection Time:** 12 minutes after CI integration test execution
* **Resolution Time:** 6 hours 45 minutes (Restoring point-in-time PostgreSQL backup)
* **Impact:** 850,000 active customer records wiped from production; 4 hours of transaction history lost.

#### What Happened
A multi-tier engineering team maintained separate Kubernetes clusters for staging and production. However, to simplify administrative overhead, both clusters were configured to read secrets from a **single shared AWS Secrets Manager account**. The production database connection string was stored under `/backend/prod/DATABASE_URL` and staging under `/backend/staging/DATABASE_URL`.

An engineer automated an end-to-end integration test suite in the staging CI pipeline. To ensure test isolation, the test suite contained a database fixture that ran:
```python
def cleanup_test_database():
    cursor.execute("TRUNCATE TABLE users, orders, subscriptions CASCADE;")
```

During a CI pipeline configuration update, a copy-paste error occurred in the staging Helm values file:
```yaml
# Staging values.yaml
secrets:
  databaseUrlSecretName: "/backend/prod/DATABASE_URL" # CRITICAL ERROR: Pointed to Prod!
```

Because the staging IAM role had broad read permissions across the entire AWS Secrets Manager account (`secretsmanager:GetSecretValue` on `arn:aws:secretsmanager:*:*:secret:*`), the staging pod successfully acquired the **production database connection string**.

The staging test suite booted against the production database, verified connectivity, and executed the teardown fixture, instantly truncating 850,000 customer accounts.

```mermaid
sequenceDiagram
    autonumber
    actor StagingCI as Staging CI Test Runner
    participant Vault as Shared Secrets Manager
    participant ProdDB as Production PostgreSQL
    participant App as Production Traffic

    StagingCI->>Vault: GetSecretValue("/backend/prod/DATABASE_URL")
    Note over Vault: Permissive IAM role allows cross-environment secret retrieval!
    Vault-->>StagingCI: postgresql://admin:pass@prod-db.internal:5432/core
    StagingCI->>ProdDB: Connect to Database (Thinks it's Staging!)
    StagingCI->>ProdDB: TRUNCATE TABLE users, orders CASCADE;
    Note over ProdDB: 850,000 Production Customer Records Deleted!
    App->>ProdDB: SELECT * FROM users WHERE id=...
    ProdDB-->>App: 0 rows (Empty Database)
    Note over App: Production crash loop! All customer sessions invalidated!
```

#### Root Cause Analysis
1. **Breached Environment Isolation:** Staging had read access to production secrets. Environments must be isolated by **cryptographic and physical account boundaries**, not naming conventions.
2. **Missing Database-Level Access Control:** The production application user had uninhibited DDL permissions (`TRUNCATE`), which should never be granted to standard web application connection pools.
3. **No Fail-Safe Connection Verification:** The test runner had no sanity check to verify that its target database name was not `prod`.

#### The Fix & Architectural Hardening
1. **Multi-Account AWS Architecture:** Isolated staging and production into completely independent AWS accounts with zero cross-account IAM trust relationships. Staging pods physically cannot read production secrets.
2. **Principle of Least Privilege:** Revoked `TRUNCATE` and `DROP` privileges from standard application runtime users.
3. **Environment Sanity Guard:** Added a mandatory boot validator that crashes the application if `APP_ENV != "prod"` but the database host contains `prod.internal`.

---

## Multi-Language Production Code Tabs

The following production implementations illustrate typed configuration parsing, automatic `SecretStr` logging redaction, and runtime feature flag evaluation in Go, Node.js/TypeScript, Python, and C#.

=== "Go"
    ```go
    // Package config demonstrates typed, fail-fast configuration validation
    // with automatic secret redaction and feature flag integration.
    package config

    import (
    	"errors"
    	"fmt"
    	"os"
    	"strings"
    )

    var ErrMissingConfig = errors.New("missing required environment configuration")

    // SecretString wraps sensitive strings to prevent log leakage.
    type SecretString string

    // String redacts the underlying credential when printed or logged.
    func (s SecretString) String() string {
    	return "**********"
    }

    // Expose returns the raw secret value when explicitly needed for API clients.
    func (s SecretString) Expose() string {
    	return string(s)
    }

    type Config struct {
    	AppEnv            string
    	DatabaseURL       SecretString
    	Port              string
    	NewCheckoutToggle bool
    }

    // Load parses and validates environment configuration on boot.
    func Load() (*Config, error) {
    	env := os.Getenv("APP_ENV")
    	if env == "" {
    		env = "dev"
    	}
    	if env != "dev" && env != "staging" && env != "prod" {
    		return nil, fmt.Errorf("invalid APP_ENV: %s", env)
    	}

    	dbURL := os.Getenv("DATABASE_URL")
    	if dbURL == "" {
    		return nil, fmt.Errorf("%w: DATABASE_URL must be provided", ErrMissingConfig)
    	}

    	// Parity guard: Staging must not point to prod
    	if env != "prod" && strings.Contains(dbURL, "prod") {
    		return nil, errors.New("CRITICAL: Non-prod environment configured with production database")
    	}

    	port := os.Getenv("PORT")
    	if port == "" {
    		port = "8080"
    	}

    	return &Config{
    		AppEnv:            env,
    		DatabaseURL:       SecretString(dbURL),
    		Port:              port,
    		NewCheckoutToggle: os.Getenv("FEATURE_NEW_CHECKOUT") == "true",
    	}, nil
    }
    ```

=== "Node.js/TypeScript"
    ```typescript
    // TypeScript Zod Schema with Secret Masking & Fail-Fast Boot
    import { z } from "zod";

    class SecretString {
      constructor(private readonly value: string) {}

      public toString(): string {
        return "**********";
      }

      public expose(): string {
        return this.value;
      }
    }

    const EnvironmentSchema = z.object({
      APP_ENV: z.enum(["dev", "staging", "prod"]).default("dev"),
      PORT: z.coerce.number().default(3000),
      DATABASE_URL: z.string().url().transform((val) => new SecretString(val)),
      FEATURE_NEW_CHECKOUT: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    }).refine((data) => {
      // Parity Guard: Prevent staging pointing to prod
      if (data.APP_ENV !== "prod" && data.DATABASE_URL.expose().includes("prod")) {
        return false;
      }
      return true;
    }, {
      message: "Security Violation: Non-prod environment cannot target production database",
      path: ["DATABASE_URL"],
    });

    export type Config = z.infer<typeof EnvironmentSchema>;

    export function loadConfig(): Config {
      const result = EnvironmentSchema.safeParse(process.env);
      if (!result.success) {
        console.error("FATAL: Environment configuration validation failed:");
        console.error(JSON.stringify(result.error.format(), null, 2));
        process.exit(1); // Fail fast immediately on boot
      }
      return result.data;
    }
    ```

=== "Python"
    ```python
    """Production Pydantic Settings: Fail-Fast Startup, SecretStr, and Parity Protection."""

    from __future__ import annotations

    from typing import Literal
    from pydantic import PostgresDsn, SecretStr, field_validator, model_validator
    from pydantic_settings import BaseSettings, SettingsConfigDict


    class AppConfig(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=None,  # Do not read .env in production container!
            case_sensitive=True,
            extra="ignore",
        )

        APP_ENV: Literal["dev", "staging", "prod"] = "dev"
        PORT: int = 8000
        DATABASE_URL: PostgresDsn
        STRIPE_API_KEY: SecretStr
        FEATURE_NEW_CHECKOUT: bool = False

        @model_validator(mode="after")
        def verify_environment_isolation(self) -> AppConfig:
            raw_db = self.DATABASE_URL.unicode_string()
            # Enforce hard isolation: staging must never target prod DB
            if self.APP_ENV != "prod" and "prod" in raw_db:
                msg = (
                    "FATAL SECURITY VIOLATION: Non-production environment attempting "
                    "to connect to production database cluster."
                )
                raise ValueError(msg)
            return self


    def load_configuration() -> AppConfig:
        try:
            return AppConfig()
        except Exception as exc:
            import sys

            # Print clear fatal log and terminate immediately (Exit 1)
            sys.stderr.write(f"FATAL: Application boot aborted due to invalid config: {exc}\n")
            sys.exit(1)
    ```

=== "C#"
    ```csharp
    namespace BackendRoadmap.Configuration;

    using System;

    public class SecretString
    {
        private readonly string _value;

        public SecretString(string value) => _value = value;

        public override string ToString() => "**********";

        public string Expose() => _value;
    }

    public class AppSettings
    {
        public string AppEnv { get; set; } = "dev";
        public int Port { get; set; } = 8080;
        public string DatabaseUrl { get; set; } = string.Empty;
        public bool FeatureNewCheckout { get; set; } = false;

        public void Validate()
        {
            if (string.IsNullOrWhiteSpace(DatabaseUrl))
                throw new InvalidOperationException("DATABASE_URL is required.");

            if (AppEnv != "dev" && AppEnv != "staging" && AppEnv != "prod")
                throw new InvalidOperationException($"Invalid APP_ENV: {AppEnv}");

            if (AppEnv != "prod" && DatabaseUrl.Contains("prod", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("CRITICAL: Staging cannot target production database.");
        }
    }
    ```

---

## Practical Hands-On Verification CLI Workflows

### 1. Verifying Fail-Fast Startup on Missing Configuration
```bash
# Test starting container without required DATABASE_URL
docker run --rm -e APP_ENV=prod myapp:git-7f8a1bc
```

**Expected Wire Output (Immediate Fail-Fast Crash):**
```text
FATAL: Application boot aborted due to invalid config: 1 validation error for AppConfig
DATABASE_URL
  Field required [type=missing, input_value={}, input_type=dict]
```

### 2. Verifying Secret Redaction in Application Logs
```bash
# Run with valid credentials and inspect logs
docker run --rm \
  -e APP_ENV=dev \
  -e DATABASE_URL="postgresql://user:secret123@localhost:5432/devdb" \
  -e STRIPE_API_KEY="sk_test_51Hxyz" \
  myapp:git-7f8a1bc python -c "from app.config import load_configuration; cfg = load_configuration(); print('DB URL:', cfg.DATABASE_URL); print('Stripe Key:', cfg.STRIPE_API_KEY)"
```

**Expected Wire Output (Secrets Fully Masked):**
```text
DB URL: postgresql://user:**********@localhost:5432/devdb
Stripe Key: **********
```

---

## Operational Validation Checkpoints (Scenario Quizzes)

### Checkpoint 1: Why `if app_env == "prod"` Branches Are Dangerous
<details>
<summary><strong>Scenario Assessment:</strong> A developer submits a pull request containing: <code>if config.APP_ENV == "prod": enable_fraud_check()</code>. The developer argues: "We don't need fraud checking in dev or staging because it slows down testing." Why does this violate Factor X (Dev/Prod Parity) and how should it be refactored?</summary>

<strong>Answer:</strong>
Branching on `APP_ENV == "prod"` introduces **untested-until-production code paths**:
1. **Broken Parity:** Code executed inside an `if APP_ENV == "prod"` block is physically impossible to test in staging, CI, or local development. Any syntax errors, runtime exceptions, or latency bottlenecks inside `enable_fraud_check()` will only trigger when real production users execute the code.
2. **Hidden Degradation:** If the fraud service has an invalid API key, staging tests will pass 100% green while production immediately collapses with 500 errors.

**Proper Refactoring:**
Parameterize behavior using explicit **feature configuration values**:
```python
# In AppConfig:
ENABLE_FRAUD_CHECKS: bool = True  # Driven by config, not environment name

# In Business Logic:
if config.ENABLE_FRAUD_CHECKS:
    enable_fraud_check()
```
Now, staging can test the real fraud check code path by setting `ENABLE_FRAUD_CHECKS=true`, verifying the actual production behavior before deployment.
</details>

### Checkpoint 2: The Stale Feature Flag Accumulation Trap
<details>
<summary><strong>Scenario Assessment:</strong> A codebase has accumulated 48 active feature flags over two years. Developers frequently encounter bugs where enabling Flag A unexpectedly breaks Flag B due to combinatorial interactions. What lifecycle policy was missing, and how do you remediate stale flags?</summary>

<strong>Answer:</strong>
The team failed to enforce a **Feature Flag Retirement SLA**:
1. Every feature flag introduces an exponential branch factor ($2^N$ test combinations for $N$ flags). 48 flags create trillions of theoretical runtime states that no automated test suite can ever validate.
2. **Flag Remediation Policy:**
   - **Categorize Flags:** Separate **Release Flags** (temporary) from **Operational Kill-Switches** (permanent).
   - **Strict Expiration Dates:** Release flags must have a mandatory ticket created at inception for their removal, with an SLA of **14 days post-100% rollout**.
   - **Contract Phase:** Removing a feature flag is the final "contract" step: delete the `if/else` conditional, make the new code path unconditional, and delete the configuration key from all environments.
</details>

### Checkpoint 3: Why Injecting Secrets via Plain Environment Variables Has Risks
<details>
<summary><strong>Scenario Assessment:</strong> In containerized cloud environments, why is mounting secrets as temporary in-memory files (e.g., <code>/run/secrets/db_password</code>) considered more secure than passing secrets as standard environment variables (<code>-e DB_PASSWORD=...</code>)?</summary>

<strong>Answer:</strong>
While environment variables satisfy Factor III, they have **severe leak paths in modern operating systems and debuggers**:
1. **Child Process Inheritance:** Environment variables are inherited by all child processes spawned by the main application, exposing database credentials to subprocesses or external CLI tools.
2. **Process Inspection Leaks:** On Linux systems, any process running under the same user or root can view environment variables by reading `/proc/<PID>/environ`.
3. **Crash Dump & Diagnostic Leaks:** Debugging tools, APM agents, and error reporting platforms (e.g., Sentry, Datadog) frequently dump all active environment variables during an unhandled exception or core dump, leaking plain text API keys into external web dashboards.
4. **`docker inspect` Exposure:** Anyone with read permissions to the Docker daemon can execute `docker inspect <container>` and view all `-e` parameters in cleartext.

**Mounting via In-Memory Files (`tmpfs`):** Mounting secrets to `/run/secrets/` keeps data in RAM, avoids disk persistence, does not leak into `/proc/environ` or `docker inspect`, and enables automatic, zero-restart secret rotation when the vault updates the secret file.
</details>

---

## Summary & Further Study

- **Immutable Images:** One container image serves dev, staging, and prod; differences exist purely in injected configuration.
- **Fail-Fast Boot:** Missing or invalid configuration must crash the application instantly on startup to halt bad deployments.
- **Secret Hygiene:** Type sensitive credentials as `SecretStr` to prevent logging leaks, and enforce physical account boundaries between staging and prod.
- **Flag Discipline:** Use feature flags to decouple deployment from release, but aggressively retire release flags once stable.

### Further Reading
- [The Twelve-Factor App: Factor III (Config)](https://12factor.net/config)
- [Pydantic Settings Documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [Martin Fowler on Feature Toggles](https://martinfowler.com/articles/feature-toggles.html)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
