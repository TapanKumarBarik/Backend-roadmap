# 02 - Building and Testing in CI

> **Prerequisites**: [00 - CI/CD Concepts](../00-cicd-concepts-and-pipeline-anatomy/README.md), [01 - GitHub Actions Deep Dive](../01-github-actions-deep-dive/README.md).  
> **Target Audience**: Backend Engineers, QA Automation Leads, and DevOps Practitioners establishing fast, deterministic, fail-fast continuous integration pipelines.  
> **Estimated Deep-Dive Time**: 40 minutes.

---

> [!TIP]
> **The Golden Rule of CI Testing Gates**: **A test suite that developers re-run until it passes is not a gate; it is an illusion.** Eliminate flaky tests aggressively. Always configure branch protection with **`strict: true`** (Require branches to be up to date before merging) so integration tests validate the final merged state against `main`. Spin up real ephemeral dependencies using GitHub Actions **`services:`** containers rather than mocking database drivers.

---

## 1. Visual Mental Models: The CI Verification Pipeline

In production CI architectures, code verification operates across distinct tiers ordered by execution speed and resource cost:

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer (Pull Request)
    participant GH as GitHub Pull Request
    participant Runner as GitHub Actions Runner VM
    participant Services as Service Containers (Postgres & Redis)
    participant Gate as Branch Protection Engine

    Dev->>GH: Open Pull Request (feature -> main)
    GH->>Runner: Trigger ci-verification.yml
    Note over Runner: Phase 1: Fast Static Checks (30s)<br/>Linters, Formatters, Gitleaks Secret Scan
    Note over Runner: Phase 2: Unit Test Suite (60s)<br/>Isolated in-memory business logic tests
    Runner->>Services: Spin up ephemeral Postgres & Redis containers
    Services-->>Runner: Healthchecks pass (Port 5432 & 6379 ready)
    Note over Runner: Phase 3: Integration Test Suite (120s)<br/>Executes real SQL migrations & transactions
    Runner->>Gate: POST /repos/.../statuses (Check: 'ci/test-suite' -> SUCCESS)
    Gate-->>GH: Verify branch up-to-date with main: Validated!
    GH-->>Dev: Merge Button Unlocked (Green Checkmark)
```

---

### Service Containers vs Host Process Execution

```mermaid
flowchart TD
    subgraph RunnerVM ["GitHub Actions Runner VM (ubuntu-latest)"]
        subgraph HostContext ["Host Runner Environment"]
            TestRunner["Language Test Runner<br/>(go test / npm test / pytest)"]
        end

        subgraph DockerBridge ["Docker Container Network (Service Containers)"]
            Postgres["PostgreSQL 16<br/>(Image: postgres:16-alpine)<br/>Mapped: 127.0.0.1:5432"]
            Redis["Redis 7<br/>(Image: redis:7-alpine)<br/>Mapped: 127.0.0.1:6379"]
        end
    end

    TestRunner -->|TCP localhost:5432| Postgres
    TestRunner -->|TCP localhost:6379| Redis
    NoteHost["Test runner executes natively on host VM for max CPU performance.<br/>Database runs in container with tmpfs in-memory storage for 10x faster I/O."]
    HostContext --- NoteHost
```

---

## 2. Technical Comparison: Testing Tiers & Service Containers

### CI Testing Tiers Specification Matrix

| Testing Tier | Typical Duration | External Dependencies | Mocking Strategy | CI Gating Priority |
| :--- | :--- | :--- | :--- | :--- |
| **Lint & SAST** | 10 – 30 seconds | None | Not applicable | **Phase 1**: Fail-fast first |
| **Unit Tests** | 30 – 90 seconds | In-memory only | Mock all external I/O & network | **Phase 2**: Fail-fast before database boot |
| **Integration Tests** | 2 – 5 minutes | Real DB / Cache | Ephemeral `services:` containers | **Phase 3**: Run on passing unit tests |
| **Contract / E2E** | 5 – 15 minutes | Staging cluster / wiremock | Pact / WireMock recording | **Phase 4**: Nightly or pre-merge gate |

---

### GitHub Actions `services:` Configuration Syntax

When using GitHub Actions service containers, always declare robust health checks so the test runner does not attempt to dial the database before the daemon finishes initializing:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 2s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 2s
          --health-retries 5
```

---

## 3. Production War Story: The Flaky Test Retry Stampede & Schema Annihilation

### Incident Overview
A tier-1 fintech processing platform maintained an automated continuous delivery pipeline requiring a passing test suite before staging promotion. An integration test verifying database transactions suffered from intermittent test race conditions, failing approximately 15% of the time.

Engineers routinely hit "Re-run all jobs" until the run randomly turned green. During a high-stress emergency deployment, a pull request containing a destructive SQL migration (`DROP COLUMN legacy_user_id`) had a broken fallback handler masked by a flaky test pass on retry attempt 6. The PR merged into `main`, and the migration permanently destroyed the legacy foreign key table across production, severing legacy merchant API integrations for 52 minutes.

### The Catastrophic Failure Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer (Under Pressure)
    participant GH as GitHub PR Interface
    participant CI as GitHub Actions Runner
    participant DB as Production Database

    Dev->>GH: Open PR with flawed database migration
    GH->>CI: Run integration tests
    Note over CI: Test 84 fails: Assertion error on unhandled foreign key!<br/>Status: Check Failed (RED)
    Dev->>GH: Clicks 'Re-run failed jobs' (Attempt 2: Fails)
    Dev->>GH: Clicks 'Re-run failed jobs' (Attempt 3: Fails)
    Dev->>GH: Clicks 'Re-run failed jobs' (Attempt 4: PASSES due to race timing!)
    Note over GH: Status check reports GREEN!<br/>Branch protection satisfied.
    Dev->>GH: Merges PR to main
    GH->>DB: CD executes migration: Drops legacy foreign key!
    Note over DB: Production crash: 2,400 legacy merchant POS terminals offline!
```

### Root Cause Analysis
1. **Flaky Test Normalization**: The engineering organization tolerated non-deterministic tests. Because "Re-run" was accepted practice, the failure of Test 84 was dismissed as "just the flaky test" rather than investigated as an actual code defect.
2. **Missing Strict Branch Protection**: Branch protection did not mandate `strict: true`. The branch was tested against a stale commit of `main` from 4 days earlier; when merged, it conflicted with another engineer's schema update.
3. **Piping Exit Code Masking**: The test execution step was written as `npm test | tee test.log`. In standard Bash, the exit status of a pipeline is the exit code of the *last* command (`tee`, which always returns 0). Unless `set -o pipefail` is active, failing tests report successful green status!

### The Remediation & Permanent Quality Policies
1. **Zero-Tolerance Test Quarantine**: Any test that fails once without code changes is quarantined into a non-blocking diagnostic suite until resolved.
2. **Mandatory Shell Safety in Workflows**: Enforce `set -euo pipefail` across all runner commands:
   ```yaml
   defaults:
     run:
       shell: bash
   ```
3. **Strict Branch Protection Configuration**:
   ```bash
   gh api -X PUT repos/:owner/:repo/branches/main/protection/required_status_checks \
     -f strict=true \
     -f 'contexts[]=test-suite'
   ```

---

## 4. Multi-Language Production Test Pipelines with Real Services

Below are production-ready GitHub Actions pipelines for **Go**, **Node.js/TypeScript**, and **Python**. Each workflow mounts real PostgreSQL and Redis service containers, runs database migrations, caches dependencies, and enforces an 85% code coverage threshold.

### Go Production Pipeline (`.github/workflows/go-ci.yml`)

```yaml
name: Go CI Test Suite

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions: {}

jobs:
  test:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    permissions:
      contents: read
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: testuser
          POSTGRES_PASSWORD: testpassword
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 2s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 2s
          --health-retries 5

    env:
      DB_DSN: "postgres://testuser:testpassword@127.0.0.1:5432/testdb?sslmode=disable"
      REDIS_ADDR: "127.0.0.1:6379"

    steps:
      - name: Checkout Code
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11

      - name: Setup Go with Cache
        uses: actions/setup-go@0c52d547c9bc32b1aa3301fd7a9cb496313a4491
        with:
          go-version: '1.23'
          cache: true

      - name: Verify Module Dependencies
        run: go mod verify

      - name: Run Database Migrations
        run: |
          go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
          migrate -path migrations -database "$DB_DSN" up

      - name: Run Tests with Race Detector & Coverage Gate
        run: |
          set -euo pipefail
          go test -v -race -covermode=atomic -coverprofile=coverage.out ./...
          
          # Enforce minimum 80% coverage threshold
          TOTAL_COV=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')
          echo "Total Test Coverage: ${TOTAL_COV}%"
          if (( $(echo "$TOTAL_COV < 80.0" | bc -l) )); then
            echo "Quality Gate FAILED: Coverage ${TOTAL_COV}% is below 80.0% threshold!"
            exit 1
          fi
```

---

### Node.js / TypeScript Pipeline (`.github/workflows/node-ci.yml`)

```yaml
name: Node.js CI Test Suite

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions: {}

jobs:
  test:
    name: TypeScript Build & Integration Tests
    runs-on: ubuntu-latest
    permissions:
      contents: read
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: nodeuser
          POSTGRES_PASSWORD: nodepassword
          POSTGRES_DB: nodedb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 2s
          --health-retries 5

    env:
      DATABASE_URL: "postgresql://nodeuser:nodepassword@127.0.0.1:5432/nodedb"

    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11

      - name: Setup Node.js with Cache
        uses: actions/setup-node@60edb5dd545a775178f525247059d6428237b63f
        with:
          node-version: 20.x
          cache: 'npm'

      - name: Deterministic Install
        run: npm ci

      - name: Type Check & Lint
        run: |
          npx tsc --noEmit
          npm run lint

      - name: Run Prisma / DB Migrations
        run: npx prisma migrate deploy

      - name: Run Jest Test Suite with Coverage
        run: |
          set -euo pipefail
          npm test -- --ci --coverage --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80}}'
```

---

### Python Pipeline (`.github/workflows/python-ci.yml`)

```yaml
name: Python CI Test Suite

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions: {}

jobs:
  test:
    name: Pytest & PostgreSQL Integration
    runs-on: ubuntu-latest
    permissions:
      contents: read
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: pyuser
          POSTGRES_PASSWORD: pypassword
          POSTGRES_DB: pydb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 2s
          --health-retries 5

    env:
      DATABASE_URL: "postgresql+asyncpg://pyuser:pypassword@127.0.0.1:5432/pydb"

    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11

      - name: Setup Python
        uses: actions/setup-python@0a5c61591373683505ea898e09a3ea4f39ef2b9c
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install Dependencies
        run: |
          python -m pip install --upgrade pip
          pip install ruff pytest pytest-asyncio pytest-cov alembic asyncpg

      - name: Run Database Migrations
        run: alembic upgrade head

      - name: Run Tests with Coverage Gate
        run: |
          set -euo pipefail
          pytest --cov=app --cov-report=term-missing --cov-fail-under=85
```

---

## 5. Practical Hands-On Verification Laboratory

In this hands-on laboratory, you will configure a GitHub Actions workflow with an active PostgreSQL service container, verify that pipe failures are not swallowed, and configure branch protection using the GitHub CLI.

### Step 1: Scaffold Workflow with Ephemeral Database

Create `.github/workflows/ci-integration.yml`:

```yaml
name: CI Verification

on:
  pull_request:
    branches: [main]

permissions: {}

jobs:
  validate:
    name: Database Smoke Test
    runs-on: ubuntu-latest
    permissions:
      contents: read
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: testadmin
          POSTGRES_PASSWORD: secretpassword
          POSTGRES_DB: validation_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 2s
          --health-retries 5

    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11

      - name: Validate Database Connectivity
        run: |
          sudo apt-get update && sudo apt-get install -y postgresql-client
          export PGPASSWORD=secretpassword
          psql -h 127.0.0.1 -U testadmin -d validation_db -c "SELECT version();"

      - name: Seed Ephemeral Table & Verify Isolation
        run: |
          export PGPASSWORD=secretpassword
          psql -h 127.0.0.1 -U testadmin -d validation_db -c "CREATE TABLE accounts (id INT PRIMARY KEY, balance NUMERIC); INSERT INTO accounts VALUES (1, 1500.00);"
          RESULT=$(psql -h 127.0.0.1 -U testadmin -d validation_db -t -c "SELECT balance FROM accounts WHERE id = 1;")
          echo "Verified Account Balance: $RESULT"
```

---

### Step 2: Configure Strict Branch Protection via GitHub CLI

To make `validate` a non-negotiable blocking gate before any PR can be merged into `main`, execute via `gh` CLI:

```bash
# 1. Inspect current branch protection
gh api repos/:owner/:repo/branches/main/protection

# 2. Enforce required status check with strict branch up-to-date policy
gh api -X PUT repos/:owner/:repo/branches/main/protection/required_status_checks \
  -H "Accept: application/vnd.github+json" \
  -F strict=true \
  -F "contexts[]=Database Smoke Test"

# 3. Require at least one pull request review approval
gh api -X PUT repos/:owner/:repo/branches/main/protection/required_pull_request_reviews \
  -H "Accept: application/vnd.github+json" \
  -F required_approving_review_count=1 \
  -F dismiss_stale_reviews=true
```

---

### Step 3: Verify Pipefail Behavior

Verify that shell scripts fail if an upstream piped command fails:

```bash
# ❌ VULNERABLE: Exits with 0 because grep succeeded!
(exit 1) | grep "something" || true

# ✅ SECURE: Fails with code 1 because pipefail is set!
bash -c "set -euo pipefail; (exit 1) | grep 'something'"
```

*Expected Terminal Output:*
```text
(Exit Code 1)
```

---

## 6. Command Quick-Reference Cheat Sheet

| Command / Flag | Action / Objective | Example Scenario |
| :--- | :--- | :--- |
| `set -euo pipefail` | Force script failure if any pipeline command errors | Prevent masked test failures |
| `gh pr checks <pr-number>` | Inspect live status check outputs on a pull request | CLI diagnostics of CI failures |
| `actions/setup-*` with `cache: true` | Automatic lockfile-based package caching | Reduce CI run times by 70% |
| `options: --health-cmd` | Verify container readiness before running tests | Prevent `ECONNREFUSED` on database boot |
| `gh api .../protection/required_status_checks` | Enforce required merge checks programmatically | Automate repository governance |

---

## 7. Operational Validation Checkpoints

### Scenario 1: Integration Tests Fail with `ECONNREFUSED 127.0.0.1:5432`
**Context:** The integration test job begins executing and immediately crashes with connection refused on port 5432. Re-running the job occasionally allows it to succeed.

<details>
<summary>View Diagnostic Workflow & Resolution</summary>

**Root Cause:**  
The service container configuration omitted the `options: --health-cmd` check. The host runner executed the test command while the PostgreSQL container was still spinning up and formatting its initial database catalog.

**Resolution Steps:**
Always attach the container healthcheck options:
```yaml
options: >-
  --health-cmd pg_isready
  --health-interval 5s
  --health-timeout 2s
  --health-retries 5
```
GitHub Actions will pause job step execution until the healthcheck command returns code 0.
</details>

---

### Scenario 2: Two Green PRs Merge, Breaking the `main` Branch
**Context:** Developer A opens PR 1 (modifies API return type). Developer B opens PR 2 (adds a new consumer of the old API return type). Both PRs show green checks and merge. Immediately, the build on `main` breaks.

<details>
<summary>View Diagnostic Workflow & Resolution</summary>

**Root Cause:**  
Branch protection lacked `strict: true`. Both PRs were tested in isolation against the old base commit. Neither PR was tested against the combined changes.

**Resolution Steps:**
In GitHub repository branch settings, enable **"Require branches to be up to date before merging"** (`strict: true`). Developer B will be required to rebase or merge `main` into their branch and re-run CI before GitHub unlocks the merge button.
</details>

---

### Scenario 3: Test Runner Exits 0 Despite Assertions Failing
**Context:** A developer introduces a breaking bug that causes 5 unit tests to fail. The GitHub Actions job outputs test error messages but reports a green checkmark, allowing the broken code to merge.

<details>
<summary>View Diagnostic Workflow & Resolution</summary>

**Root Cause:**  
The test script ran with shell output redirection (e.g. `pytest | tee test.log`) without `set -o pipefail`, or the test command was wrapped in an `npm run` script that caught and suppressed the exit code.

**Resolution Steps:**
1. Explicitly configure `shell: bash` with pipefail enabled.
2. In `package.json`, verify test scripts do not append `|| true` or swallow nonzero return codes.
</details>

---

## 8. Further Reading & Official Documentation

- [GitHub Actions Documentation: About Service Containers](https://docs.github.com/en/actions/using-containerized-services/about-service-containers)
- [GitHub Documentation: Managing Protected Branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Testcontainers: Multi-Language Integration Testing](https://testcontainers.com/)
- [Pragmatic Guide to Flaky Test Identification & Quarantine](https://martinfowler.com/articles/non-determinism.html)
- [Go Test Coverage and Profiling](https://go.dev/blog/cover)

---

## Next

Continue to [03 - Container Image Pipelines](../03-container-image-pipelines/README.md) to transform passing builds into production OCI container images with multi-stage optimization, semantic version tagging, and automated vulnerability scanning.
