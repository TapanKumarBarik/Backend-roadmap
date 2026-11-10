# Module 02: Config Management Fundamentals

> **Prerequisites:** [Module 00: Error Handling Strategies](../00-error-handling-strategies/README.md), [Module 01: Global Error Handlers & User-Facing Errors](../01-global-error-handlers-and-user-facing-errors/README.md).
> **Estimated Reading Time:** 30 minutes
> **Target Audience:** Backend Engineers, DevOps Engineers, Cloud Platform Architects.

---

> [!TIP]
> **Golden Rule of Config Management**: Strictly separate code from configuration by treating application binaries and container images as **immutable**. A build artifact produced by CI must be capable of deploying across development, staging, or production without recompilation or image repackaging, differing solely in the external environment variables or configuration injected at runtime boot.

---

## 1. Visual Mental Models & System Architecture

Configuration is any value your application requires that varies between deployment environments (development, staging, production, or individual developer workstations) without the underlying code changing. When config is hardcoded or baked directly into build artifacts, disasters inevitably follow: integration tests wipe production databases, outdated endpoints linger across releases, and secrets leak into source control.

The foundation of production-grade configuration management is **Build Immutability**.

### The Immutable Build & Environment Injection Pipeline

```mermaid
flowchart TD
    subgraph BuildPhase["1. Build Phase (CI Server)"]
        Source["Application Source Code (Git)"] --> Test["Unit & Lint Checks"]
        Test --> Build["Compile & Containerize"]
        Build --> Image[("Single Immutable Container Image<br/>(ghcr.io/acme/api:v1.4.2)")]
    end

    subgraph DeployPhase["2. Release & Runtime Phase (CD / Kubernetes)"]
        Image --> Dev["Development Environment<br/>(Local Minikube)"]
        Image --> Staging["Staging Environment<br/>(Preview Cluster)"]
        Image --> Prod["Production Environment<br/>(Multi-AZ Cluster)"]
    end

    subgraph Injection["3. External Environment Injection"]
        EnvDev["Dev Config & Secrets<br/>(DEBUG=true, DB=localhost)"] -.->|Inject at Boot| Dev
        EnvStaging["Staging Config & Secrets<br/>(DEBUG=false, DB=staging-db)"] -.->|Inject at Boot| Staging
        EnvProd["Prod Config & Secrets<br/>(DEBUG=false, DB=prod-db-cluster)"] -.->|Inject at Boot| Prod
    end
```

### The Configuration Litmus Test Decision Tree

```mermaid
flowchart TD
    Start["New Application Value or Constant"] --> Q1{"Could this value differ between<br/>Dev, Staging, and Production?"}
    
    Q1 -->|Yes| IsConfig["It is CONFIGURATION.<br/>Must be externalized to Environment Variables / Secrets."]
    Q1 -->|No| Q2{"Could this value change at runtime<br/>without deploying new code<br/>(e.g., A/B test, emergency kill-switch)?"}
    
    Q2 -->|Yes| IsDynamic["It is DYNAMIC CONFIG.<br/>Feature flag or dynamic parameter store."]
    Q2 -->|No| IsCode["It is CODE.<br/>Bake directly into codebase as typed constant."]
```

### Configuration Startup Lifecycle & Fail-Fast Validation

```mermaid
stateDiagram-v2
    direction TB
    [*] --> Process_Start: OS Spawns Process
    Process_Start --> Ingest_Environment: Read OS Environment Variables
    
    state Ingest_Environment {
        Parse_Strings: Ingest Raw Key-Value Strings
        Type_Coercion: Convert "8080" -> int, "true" -> bool
    }

    Ingest_Environment --> Schema_Validation: Validate against Pydantic / Zod Schema
    
    state Schema_Validation {
        Check_Required: Are all required keys present?
        Range_Validation: Is port between 1-65535?
        Format_Validation: Is DATABASE_URL a valid PostgreSQL URI?
    }

    Schema_Validation --> Boot_Failure: Validation Error (Missing DB_URL)
    Boot_Failure --> [*]: Exit Code 1 (Fail Fast with Clear Diagnostics)

    Schema_Validation --> Instantiate_Singletons: Validation Successful
    Instantiate_Singletons --> Ready_For_Traffic: Bind HTTP Listener
    Ready_For_Traffic --> [*]
```

---

## 2. Taxonomic Reference Grids & Systematic Comparison Grids

### Configuration vs. Code: The Definitive Classification

| Value Example | Classification | Reason | Where It Belongs |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Config** | Changes across dev (`localhost`), staging (`stage-db`), and prod (`prod-db`). | Environment Variable / K8s Secret |
| `MAX_ORDER_ITEMS = 100` | **Code** | Core business domain rule. Governed by domain logic and unit tests. | Source code constant (`constants.ts`) |
| `LOG_LEVEL` | **Config** | `DEBUG` in dev, `INFO` or `WARN` in production. | Environment Variable (`LOG_LEVEL`) |
| `API_ROUTING_TABLE` | **Code** | URL dispatch logic and controllers are integral to application structure. | Web router code (`routes.go`) |
| `STRIPE_SECRET_KEY` | **Config (Secret)** | Sensitive credential; must never exist in git or public images. | Vault / AWS Secrets Manager / K8s Secret |
| `DISCOUNT_PERCENT = 0.15`| **Dynamic Config** | Marketing campaign parameters that change frequently without engineers deploying. | Feature Flag / Remote Config Store (LaunchDarkly) |

### Configuration Delivery Mechanisms Compared

| Delivery Mechanism | Injection Point | Pros | Cons & Failure Modes | Ideal Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Environment Variables** | Process OS Environment | 12-factor standard; universal across Docker, K8s, and cloud PaaS; zero disk dependencies. | Flat string structure; no nesting; prone to leaking into child processes if unmanaged. | Standard service configuration (ports, URLs, timeouts). |
| **Static Config Files (`.env`, YAML, TOML)**| Disk files read at boot | Supports rich hierarchical nesting; easy to read locally. | Danger of committing secrets to git; managing file permissions in containers. | Local developer scratchpads (`.env.example`), complex CLI tools. |
| **Kubernetes ConfigMaps** | Volume mount or Env injection | Native cluster integration; version-controlled in GitOps; dynamic updates. | 1MB payload ceiling; changes require pod restarts unless watching volume files. | Containerized microservice deployment configs. |
| **Dynamic Key-Value Store (Consul / etcd)** | Network API / Long-polling | Hot-reloading without container restarts; centralized management. | Adds an operational distributed system dependency; network partitions block boot. | Distributed feature toggles, dynamic rate limits. |

---

## 3. Production War Stories: Incident Post-Mortem

### The Incident: Production Database Wiped During Local Staging Integration Tests

- **Severity:** SEV-1 (Catastrophic Data Loss & Downtime)
- **Time to Detection:** 8 minutes
- **Time to Mitigation:** 3 hours 45 minutes (Restored from WAL Point-In-Time Backup)
- **Impact:** 18 production tables dropped, including 85,000 active customer records. All customer operations halted during midday business hours.

#### What Happened
An engineering team maintained a shared `.env` file template for local development. To test database migrations before deploying to staging, an engineer copied settings from the team's internal wiki. The file contained commented-out configurations for all environments:

```bash
# .env (Local Developer Machine)
# DATABASE_URL=postgresql://dev:pass@localhost:5432/app_dev
# DATABASE_URL=postgresql://stage_user:secret@db.staging.internal:5432/app_stage
DATABASE_URL=postgresql://prod_app:supersecret@db.prod.internal:5432/app_prod
```

The developer intended to run the automated integration test suite against staging. Looking at the file in their editor, they accidentally uncommented the production database line instead of staging. 

They executed:
```bash
pytest tests/integration/
```

The integration test harness executed its standard pre-test fixture:
```python
# conftest.py
@pytest.fixture(autouse=True)
def wipe_database():
    db.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
```

Within 12 seconds, the test runner connected directly over the corporate VPN to the production PostgreSQL primary instance and obliterated the entire public schema.

```mermaid
sequenceDiagram
    autonumber
    participant Dev as Local Developer Machine
    participant Env as Local .env File
    participant Test as Pytest Test Runner
    participant ProdDB as Production Primary Database

    Dev->>Env: Accidentally uncomments prod connection string
    Dev->>Test: pytest tests/integration/
    Test->>Env: Reads DATABASE_URL (Points to prod database!)
    Note over Test: No validation checking if host == prod!
    Test->>ProdDB: DROP SCHEMA public CASCADE;
    Note over ProdDB: 18 production tables dropped instantly!
    ProdDB-->>Test: Tables obliterated (Test proceeds...)
    Note over ProdDB: Production API crashes with UndefinedTable
```

#### Root Cause
1. **Co-Mingled Configuration Files:** Storing credentials for multiple environments in a single shared file where human error (uncommenting a single line) can target production.
2. **Missing Startup Guards:** The test runner lacked defensive assertions verifying that it was never connected to an environment with `APP_ENV=production` or hostnames containing `.prod.`.
3. **Over-Privileged Application Roles:** The database user account used by applications possessed administrative DDL permissions (`DROP SCHEMA`), allowing operational scripts to delete entire relational schemas.

#### The Fix & Architectural Hardening
1. **Network & Credential Isolation:** Production databases were placed in private subnets inaccessible from developer VPNs without explicit, audited bastion authorization.
2. **Fail-Safe Test Environment Assertion:**
   ```python
   # conftest.py
   assert os.getenv("APP_ENV") in ("test", "development"), "Refusing to run tests outside test environment!"
   assert "prod" not in os.getenv("DATABASE_URL", ""), "Safety tripwire: Production database URL detected in test suite!"
   ```
3. **Database Role Principle of Least Privilege:** Revoked DDL (`DROP`, `ALTER`, `CREATE`) privileges from standard application runtime users, restricting DDL solely to migration pipelines.

---

## 4. Multi-Language Production Implementations

The following code tabs demonstrate enterprise configuration patterns: typed schemas, environment variable parsing, default fallbacks, secret masking in logs, and fail-fast startup validation across Go, TypeScript, and Python.

### Go Production Implementation (Typed Envconfig with Validation)

```go
package main

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/kelseyhightower/envconfig"
)

// AppConfig represents the strongly-typed application configuration.
type AppConfig struct {
	Environment string `envconfig:"APP_ENV" default:"development"`
	Port        int    `envconfig:"PORT" default:"8080"`
	DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`
	LogLevel    string `envconfig:"LOG_LEVEL" default:"INFO"`
	SecretKey   string `envconfig:"API_SECRET_KEY" required:"true"`
}

// Validate executes domain-level invariant checks on configuration.
func (c *AppConfig) Validate() error {
	validEnvs := map[string]bool{"development": true, "staging": true, "production": true}
	if !validEnvs[strings.ToLower(c.Environment)] {
		return fmt.Errorf("invalid APP_ENV: must be development, staging, or production")
	}

	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("invalid PORT %d: must be between 1 and 65535", c.Port)
	}

	u, err := url.Parse(c.DatabaseURL)
	if err != nil || u.Scheme != "postgresql" {
		return fmt.Errorf("DATABASE_URL must be a valid postgresql:// URI")
	}

	if len(c.SecretKey) < 32 {
		return fmt.Errorf("API_SECRET_KEY must be at least 32 characters for security")
	}

	return nil
}

// String implements fmt.Stringer to prevent accidental secret logging.
func (c *AppConfig) String() string {
	return fmt.Sprintf("AppConfig{Env: %s, Port: %d, LogLevel: %s, DatabaseURL: [MASKED], SecretKey: [MASKED]}",
		c.Environment, c.Port, c.LogLevel)
}

// LoadConfig loads and validates configuration at startup, failing fast.
func LoadConfig() (*AppConfig, error) {
	var cfg AppConfig
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, fmt.Errorf("failed to process environment variables: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("configuration validation failure: %w", err)
	}

	return &cfg, nil
}
```

### TypeScript / Node.js Production Implementation (Zod Environment Validation)

```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().min(1024).max(65535).default(8080),
  DATABASE_URL: z.string().url().startsWith('postgresql://', {
    message: 'DATABASE_URL must be a valid postgresql:// connection string',
  }),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
  API_SECRET_KEY: z.string().min(32, {
    message: 'API_SECRET_KEY must be at least 32 characters long',
  }),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadAndValidateConfig(): AppConfig {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ FATAL: Configuration validation failed at startup:');
    result.error.errors.forEach((err) => {
      console.error(`  - Field: ${err.path.join('.')} -> ${err.message}`);
    });
    // Fail fast immediately before listening to traffic
    process.exit(1);
  }

  const config = result.data;
  console.log(`✅ Configuration validated successfully for environment: [${config.APP_ENV}]`);
  return config;
}
```

### Python Production Implementation (Pydantic Settings with Secret Masking)

```python
"""
Production Configuration Management using Pydantic Settings.
Enforces type coercion, URL validation, secret masking in __repr__,
and immediate startup fail-fast behavior.
"""

from __future__ import annotations

import sys
from typing import Literal
from pydantic import Field, PostgresDsn, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ApplicationSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_ENV: Literal["development", "staging", "production"] = "development"
    PORT: int = Field(default=8080, ge=1, le=65535)
    DATABASE_URL: PostgresDsn
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARN", "ERROR"] = "INFO"
    # SecretStr automatically masks its value in logs and __repr__
    API_SECRET_KEY: SecretStr

    @field_validator("API_SECRET_KEY")
    @classmethod
    def validate_secret_strength(cls, v: SecretStr) -> SecretStr:
        secret_val = v.get_secret_value()
        if len(secret_val) < 32:
            raise ValueError("API_SECRET_KEY must be at least 32 characters in length.")
        return v


def load_settings_or_exit() -> ApplicationSettings:
    """Loads configuration at process startup, failing loudly on invalid configuration."""
    try:
        settings = ApplicationSettings()
        # Safe logging: secrets are automatically masked as '**********'
        print(f"Configuration loaded successfully for environment: '{settings.APP_ENV}'")
        return settings
    except Exception as exc:
        print(f"❌ FATAL: Process boot aborted due to invalid configuration:\n{exc}", file=sys.stderr)
        sys.exit(1)
```

---

## 5. Practical Hands-On Verification CLI Workflows

Verify immutable container behavior across multiple environments using standard CLI commands.

### Workflow 1: Testing Container Immutability across Environments

```bash
# Build the application image ONCE
docker build -t my-backend-app:v1.0.0 .

# Launch Development Instance
docker run --rm -d \
  --name app-dev \
  -e APP_ENV=development \
  -e PORT=8080 \
  -e DATABASE_URL=postgresql://user:pass@localhost:5432/dev_db \
  -e API_SECRET_KEY=dev_secret_key_exceeding_32_characters_long \
  -p 8080:8080 my-backend-app:v1.0.0

# Verify Development Container is Healthy
docker logs app-dev
```

Expected wire output:
```text
✅ Configuration validated successfully for environment: [development]
Server listening on port 8080...
```

### Workflow 2: Testing Startup Fail-Fast Validation on Missing Key

```bash
# Attempt to run container with missing required DATABASE_URL
docker run --rm \
  -e APP_ENV=production \
  -e API_SECRET_KEY=short \
  my-backend-app:v1.0.0
```

Expected wire output:
```text
❌ FATAL: Process boot aborted due to invalid configuration:
2 validation errors for ApplicationSettings
DATABASE_URL
  Field required [type=missing, input_value={}, input_type=dict]
API_SECRET_KEY
  Value error, API_SECRET_KEY must be at least 32 characters in length. [type=value_error]
```

---

## 6. Operational Validation Checkpoints (Scenario Quizzes)

### Checkpoint 1: Why Baking Config into Docker Images is an Anti-Pattern
**Scenario:** A development team builds three separate Docker images during CI: `my-api:dev`, `my-api:staging`, and `my-api:prod`. Each image copies in a different `.env.dev`, `.env.staging`, or `.env.prod` file during the `docker build` step. What critical architectural failure does this introduce?

<details><summary>Click to view diagnosis and architectural solution</summary>

**Answer:**
1. **Violation of Build Immutability:**
   Baking configuration into the image means `my-api:prod` is a **different artifact** from `my-api:staging`. You are not deploying the code that was tested in staging; you are deploying an entirely new binary build that could contain different package versions, stale cache layers, or build discrepancies.
2. **Production Security Breach Risk:**
   Baking production credentials into the container image exposes sensitive database passwords and API tokens to anyone with read access to the Docker container registry.
3. **The Solution:**
   Build a **single immutable image** (`my-api:v1.0.0`). Promote that exact SHA-digest image through staging and into production, injecting environment-specific variables at runtime boot.
</details>

---

### Checkpoint 2: Startup Fail-Fast vs. Runtime Lazy Evaluation
**Scenario:** An application reads an optional integration key using `os.getenv("PAYMENT_GATEWAY_URL")`. Instead of validating it at boot, the application only reads the variable inside the checkout controller when a customer makes a purchase. The app runs smoothly for two weeks, but when the first customer attempts checkout at 2:00 AM, the endpoint crashes with a 500 error because the URL was misspelled. How is this prevented?

<details><summary>Click to view diagnosis and architectural solution</summary>

**Answer:**
1. **The Flaw of Lazy Evaluation:**
   Lazy runtime evaluation defers configuration errors until specific code paths are executed, converting configuration typos into runtime production incidents for real users.
2. **The Fail-Fast Architecture:**
   Validate **all** configuration values eagerly during application initialization (before binding the network port). If a required URL or variable is missing or malformed, the process crashes immediately at deploy time (Exit Code 1). In Kubernetes, this triggers a `CrashLoopBackOff`, preventing the broken deployment from replacing the healthy replica set.
</details>

---

### Checkpoint 3: The Danger of Dumping Config in Health Check Endpoints
**Scenario:** To simplify debugging, an engineer adds a `/debug/config` route that returns `json.dumps(settings.dict())`. The endpoint requires no authentication because the team considers hostnames and ports harmless. What catastrophic failure occurs?

<details><summary>Click to view diagnosis and architectural solution</summary>

**Answer:**
1. **Massive Credential Disclosure:**
   Dumping raw configuration objects leaks database credentials, JWT signing secrets, API keys, and internal service tokens to the public internet. Automated scanning bots target `/debug/config` and `/actuator/env` endpoints continuously.
2. **Remediation & Hardening:**
   - Never expose raw configuration dumps over HTTP.
   - Use specialized secret types (e.g., Pydantic `SecretStr`) whose `__repr__` and `__str__` methods automatically return `'**********'`.
   - Restrict administrative debug endpoints to private cluster internal networks with strict mTLS authentication.
</details>

---

## 7. Further Reading & References

- [The Twelve-Factor App: Factor III - Config](https://12factor.net/config) — The canonical manifesto on storing configuration strictly in the environment.
- [Pydantic Settings Documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) — Official guide on type-safe environment variable parsing and secret masking.
- [Zod Documentation](https://zod.dev/) — TypeScript-first schema declaration and runtime validation.

---

## Next

[Module 03: Config Sources and Secrets](../03-config-sources-and-secrets/README.md) — Connect configuration to physical sources (Kubernetes secrets, HashiCorp Vault, cloud KMS), enforce secret zero-leakage, and implement automated credential rotation.
