# Module 02: CI Pipelines for Backend Code

> **Prerequisites:** [00-containerizing-a-backend-app](../00-containerizing-a-backend-app/README.md), [01-the-12-factor-app-in-a-container](../01-the-12-factor-app-in-a-container/README.md), and [Testing in CI and Test Strategy](../../12-testing-and-code-quality/07-testing-in-ci-and-test-strategy/README.md).  
> **Estimated Reading Time:** 28 minutes  
> **Target Audience:** Backend engineers and DevOps specialists building automated, secure CI pipelines that produce verified, immutable container artifacts.

> [!TIP]
> **Golden Rule of Backend CI Pipelines:** CI's mission ends when a clean, tested, scanned, and immutable container image—tagged by its unique git commit SHA—is published to the registry. Always order stages from cheapest to most expensive (lint $\rightarrow$ type-check $\rightarrow$ unit $\rightarrow$ integration $\rightarrow$ security scan $\rightarrow$ build), and never overwrite mutable tags like `:latest` as your primary release identifier.

---

## Visual Mental Models & Architecture

### The End-to-End Backend CI Pipeline Lifecycle

Modern continuous integration pipelines enforce a dual-lane architecture: a **fast gating lane** on every pull request to catch defects in minutes, and an **artifact publication lane** on merges to `main` that scans vulnerabilities and pushes the immutable release image.

```mermaid
flowchart TD
    subgraph PR_Gate["Pull Request Gating Lane (Every PR - Target < 5 mins)"]
        direction TB
        Checkout["actions/checkout@v4 (Clean Working Tree)"] --> LockedInstall["Install Locked Dependencies (Cache Key: Lockfile)"]
        LockedInstall --> LintStage["Stage 1: Lint & Format (Ruff / ESLint / golangci-lint)\n~5 seconds"]
        LintStage --> TypeStage["Stage 2: Static Typing (mypy --strict / tsc / Roslyn)\n~15 seconds"]
        TypeStage --> SecretStage["Stage 3: Secret Detection (Gitleaks / TruffleHog)\n~10 seconds"]
        SecretStage --> UnitStage["Stage 4: Unit Test Suite (Parallelized)\n~45 seconds"]
        UnitStage --> ServiceContainer[("CI Service Container\n(postgres:16 Sidecar)")]
        ServiceContainer --> IntegStage["Stage 5: DB Integration Tests (Real SQL)\n~90 seconds"]
        IntegStage --> BranchProtect{"Branch Protection Rules\n(Enforce Green Gate)"}
    end

    BranchProtect -- Approved & Merged --> MainArtifact

    subgraph MainArtifact["Artifact & Security Lane (Merge to main Only)"]
        direction TB
        DockerBuild["Build OCI Container Image\n(Multi-Stage Dockerfile)"] --> VulnScan["Vulnerability Scan (Trivy / Grype)\nFail on CRITICAL CVEs"]
        VulnScan --> RegistryPush["Push to Container Registry (GHCR / ECR / ACR)\nTag: myapp:git-${GITHUB_SHA}"]
        RegistryPush --> CD_Trigger["Trigger Continuous Deployment (CD / GitOps)\n(Module 03 Hand-off)"]
    end
```

---

## Systematic Taxonomic Reference Grids

### CI Stage Taxonomy & Fail-Fast Ordering

| Stage Number | Pipeline Phase | Tooling Ecosystems | Average Duration | Blocker Level | Failure Mode Caught |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 1** | Code Style & Linters | Ruff, ESLint, golangci-lint | 2 – 5 sec | Merge Blocker | Dead imports, formatting drift, common bug patterns. |
| **Stage 2** | Static Type Checking | mypy (`--strict`), tsc, dotnet | 10 – 30 sec | Merge Blocker | Unhandled null/nil pointers, signature mismatches. |
| **Stage 3** | Secret Scanning | Gitleaks, TruffleHog, GitGuardian | 5 – 15 sec | Merge Blocker | Hardcoded API keys, private keys, database passwords. |
| **Stage 4** | Unit Test Execution | Pytest, Vitest, Go test, xUnit | 30 – 90 sec | Merge Blocker | Regressions in domain logic, pricing rules, edge cases. |
| **Stage 5** | Database Integration | CI Service Containers (Postgres) | 1 – 3 min | Merge Blocker | Broken migrations, dialect syntax errors, constraint bugs. |
| **Stage 6** | Image Compilation | Docker Buildx, Kaniko | 1 – 2 min | Artifact Blocker | Broken Dockerfiles, missing build dependencies. |
| **Stage 7** | Vulnerability Scan | Trivy, Snyk, Grype | 30 – 60 sec | Release Blocker | Known CVEs in OS packages or third-party dependencies. |
| **Stage 8** | Registry Publishing | OCI Registry (GHCR, ECR, GCR) | 15 – 30 sec | Release Blocker | Authentication failures, network drops to registry. |

### Container Image Tagging Strategies Matrix

| Tagging Strategy | Tag Example | Immutability Profile | Rollback Capability | Traceability to Source | Production Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mutable Latest** | `:latest` | **None** (Overwritten on every build) | Impossible; cannot pinpoint past states | Zero | **Anti-Pattern:** Never use for deployment targets. |
| **Git Commit SHA** | `:git-7f8a1bc` | **Strictly Immutable** | Trivial; deploy previous commit's SHA | 100% exact commit hash | **Standard Industry Best Practice**. |
| **Semantic Version** | `:v1.4.2` | Immutable (via release tags) | Excellent | High (tied to git release tag) | Ideal for public SDKs and versioned APIs. |
| **Build Number** | `:build-412` | Immutable per CI run | Moderate | Low (requires cross-referencing CI logs) | Permissible internally; inferior to Git SHA. |

---

## Production War Stories: Incident Post-Mortem

### SEV-1 Post-Mortem: The `:latest` Tag Overwrite & The Un-Rollable Outage

#### Incident Overview
* **Severity:** SEV-1 (Complete Global Payment Outage)
* **Detection Time:** 8 minutes post-deployment
* **Resolution Time:** 3 hours 12 minutes
* **Financial Impact:** \$420,000 in dropped transactions; severe brand damage across enterprise clients.

#### What Happened
A financial services team configured their CI pipeline to tag and publish every production build as `payment-service:latest`. Kubernetes deployment manifests referenced `image: payment-service:latest` with `imagePullPolicy: Always`.

At 14:00, a pull request containing a subtle memory leak and database connection starvation bug was merged into `main`. CI compiled the image, tagged it `payment-service:latest`, and pushed it to the registry. The Kubernetes rolling deployment updated all pods. Within 8 minutes, memory exhausted, pods began crashing with `OOMKilled`, and payment checkouts failed globally.

The incident commander immediately issued the standard rollback command:
`kubectl rollout undo deployment/payment-service`.

The rollback failed completely:
1. Kubernetes rolled back the deployment configuration, but the pod template still specified `image: payment-service:latest`.
2. The Kubelet pulled the image tagged `:latest` from the registry.
3. Because CI had just overwritten `:latest` with the broken release, `:latest` was identical to the broken code!
4. The previous, stable container image was untagged and lost in the registry garbage-collection pool. Engineers spent over 3 hours checking out past git commits on laptops, manually rebuilding Docker images, and pushing an emergency hotfix.

```mermaid
sequenceDiagram
    autonumber
    actor Engineer as DevOps On-Call
    participant K8s as Kubernetes Cluster
    participant Registry as Container Registry (ECR)
    participant CI as CI Pipeline

    Note over CI: Bad commit merged to main
    CI->>Registry: Pushes broken build as :latest (Overwrites good image!)
    K8s->>Registry: Pulls :latest (Broken code running)
    Note over K8s: Production crashes with OOMKilled!
    Engineer->>K8s: kubectl rollout undo (Rollback to previous state!)
    K8s->>Registry: Pulls :latest again (Still points to broken build!)
    Note over Engineer,K8s: Rollback failed! Stable image was overwritten and cannot be recovered!
```

#### Root Cause Analysis
1. **Mutable Tag Deployment Anti-Pattern:** Deploying against `:latest` meant that past releases were not content-addressed or preserved. Overwriting `:latest` permanently destroyed the immediate rollback path.
2. **Missing Immutable Identifiers:** The deployment pipeline had no record of the specific Git SHA running in production.
3. **No Rollback Validation in Staging:** Emergency rollback procedures had never been rehearsed against immutable artifact tags.

#### The Fix & Architectural Hardening
1. **Mandatory Git SHA Tagging:** Reconfigured CI to tag every image with `:git-${GITHUB_SHA}`. The `:latest` tag was completely deprecated for deployment manifests.
2. **Instant Rollback via Manifest Updates:** Rollbacks now update the deployment spec to reference the prior known-good SHA (`payment-service:git-a4f912e`), which remains permanently cached in the registry.
3. **Automated Rollback Integration:** GitOps controllers (ArgoCD) pin deployments to explicit SHAs, ensuring 100% deterministic rollbacks in <15 seconds.

---

## Multi-Language Production Code Tabs

The following CI pipeline definitions illustrate production workflows featuring cheap fail-fast checks, database service containers, secret scanning, vulnerability gating, and immutable SHA publishing.

=== "Go"
    ```yaml
    # .github/workflows/ci.yml - Production Go CI Pipeline
    name: Go Backend CI
    on:
      push:
        branches: [main]
      pull_request:

    jobs:
      verify:
        name: Fast Gating Lane (< 4m)
        runs-on: ubuntu-latest
        services:
          postgres:
            image: postgres:16-alpine
            env:
              POSTGRES_USER: testuser
              POSTGRES_PASSWORD: testpassword
              POSTGRES_DB: testdb
            ports: ["5432:5432"]
            options: >-
              --health-cmd pg_isready
              --health-interval 5s
              --health-timeout 5s
              --health-retries 5

        steps:
          - uses: actions/checkout@v4

          - uses: actions/setup-go@v5
            with:
              go-version: '1.22'
              cache: true

          - name: Secret Scan (Gitleaks)
            uses: gitleaks/gitleaks-action@v2
            env:
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

          - name: Lint (golangci-lint)
            uses: golangci/golangci-lint-action@v6
            with:
              version: v1.59.1

          - name: Unit Tests (Race Detector)
            run: go test -v -race -short ./...

          - name: Integration Tests (vs Postgres)
            env:
              DATABASE_URL: "postgres://testuser:testpassword@localhost:5432/testdb?sslmode=disable"
            run: go test -v -tags=integration ./tests/integration/...

      publish-artifact:
        name: Build, Scan & Publish
        needs: verify
        if: github.ref == 'refs/heads/main'
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4

          - name: Build OCI Image
            run: docker build -t myapp:git-${{ github.sha }} .

          - name: Trivy Vulnerability Scan
            uses: aquasecurity/trivy-action@master
            with:
              image-ref: myapp:git-${{ github.sha }}
              format: 'table'
              exit-code: '1'
              severity: 'CRITICAL'

          - name: Push to Registry
            run: |
              echo "${{ secrets.REGISTRY_TOKEN }}" | docker login -u "${{ secrets.REGISTRY_USER }}" --password-stdin ghcr.io
              docker tag myapp:git-${{ github.sha }} ghcr.io/myorg/myapp:git-${{ github.sha }}
              docker push ghcr.io/myorg/myapp:git-${{ github.sha }}
    ```

=== "Node.js/TypeScript"
    ```yaml
    # .github/workflows/ci.yml - Production Node.js / TypeScript CI Pipeline
    name: Node.js Backend CI
    on:
      push:
        branches: [main]
      pull_request:

    jobs:
      verify:
        name: Fast Gating Lane (< 4m)
        runs-on: ubuntu-latest
        services:
          postgres:
            image: postgres:16-alpine
            env:
              POSTGRES_USER: testuser
              POSTGRES_PASSWORD: testpassword
              POSTGRES_DB: testdb
            ports: ["5432:5432"]
            options: --health-cmd pg_isready --health-interval 5s --health-retries 5

        steps:
          - uses: actions/checkout@v4

          - uses: actions/setup-node@v4
            with:
              node-version: 20
              cache: 'npm'

          - name: Install Locked Dependencies
            run: npm ci

          - name: Secret Scan
            uses: gitleaks/gitleaks-action@v2
            env:
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

          - name: Code Quality (ESLint & Prettier)
            run: npm run lint

          - name: Static Type Check (tsc)
            run: npx tsc --noEmit

          - name: Unit & Integration Tests
            env:
              DATABASE_URL: "postgresql://testuser:testpassword@localhost:5432/testdb"
            run: npm test -- --coverage --bail

      publish-artifact:
        name: Build, Scan & Publish
        needs: verify
        if: github.ref == 'refs/heads/main'
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - name: Build Image
            run: docker build -t myapp:git-${{ github.sha }} .

          - name: Vulnerability Scan
            uses: aquasecurity/trivy-action@master
            with:
              image-ref: myapp:git-${{ github.sha }}
              exit-code: '1'
              severity: 'CRITICAL'

          - name: Publish SHA Tag
            run: |
              echo "${{ secrets.REGISTRY_TOKEN }}" | docker login -u "${{ secrets.REGISTRY_USER }}" --password-stdin ghcr.io
              docker tag myapp:git-${{ github.sha }} ghcr.io/myorg/myapp:git-${{ github.sha }}
              docker push ghcr.io/myorg/myapp:git-${{ github.sha }}
    ```

=== "Python"
    ```yaml
    # .github/workflows/ci.yml - Production Python / FastAPI CI Pipeline
    name: Python Backend CI
    on:
      push:
        branches: [main]
      pull_request:

    jobs:
      verify:
        name: Fast Gating Lane (< 4m)
        runs-on: ubuntu-latest
        services:
          postgres:
            image: postgres:16-alpine
            env:
              POSTGRES_USER: testuser
              POSTGRES_PASSWORD: testpassword
              POSTGRES_DB: testdb
            ports: ["5432:5432"]
            options: >-
              --health-cmd pg_isready
              --health-interval 5s
              --health-retries 5

        steps:
          - uses: actions/checkout@v4

          - uses: actions/setup-python@v5
            with:
              python-version: "3.12"
              cache: "pip"

          - name: Install Pinned Dependencies
            run: pip install -e ".[dev]"

          - name: Secret Scanning
            uses: gitleaks/gitleaks-action@v2
            env:
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

          - name: Stage 1 - Lint & Formatting (Ruff)
            run: |
              ruff check .
              ruff format --check .

          - name: Stage 2 - Strict Type Checking (mypy)
            run: mypy --strict app/

          - name: Stage 3 - Unit & Integration Tests (pytest)
            env:
              DATABASE_URL: "postgresql://testuser:testpassword@localhost:5432/testdb"
            run: |
              pytest -m "not e2e" -n auto --maxfail=1 --cov=app

      publish-artifact:
        name: Build, Scan & Publish
        needs: verify
        if: github.ref == 'refs/heads/main'
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4

          - name: Build OCI Image
            run: docker build -t myapp:git-${{ github.sha }} .

          - name: Trivy Container Vulnerability Scan
            uses: aquasecurity/trivy-action@master
            with:
              image-ref: myapp:git-${{ github.sha }}
              exit-code: '1'
              severity: 'CRITICAL'

          - name: Push Immutable Git SHA Image
            run: |
              echo "${{ secrets.REGISTRY_TOKEN }}" | docker login -u "${{ secrets.REGISTRY_USER }}" --password-stdin ghcr.io
              docker tag myapp:git-${{ github.sha }} ghcr.io/myorg/myapp:git-${{ github.sha }}
              docker push ghcr.io/myorg/myapp:git-${{ github.sha }}
    ```

=== "C#"
    ```yaml
    # .github/workflows/ci.yml - Production .NET / C# CI Pipeline
    name: .NET Backend CI
    on:
      push:
        branches: [main]
      pull_request:

    jobs:
      verify:
        name: Fast Gating Lane (< 5m)
        runs-on: ubuntu-latest
        services:
          postgres:
            image: postgres:16-alpine
            env:
              POSTGRES_USER: testuser
              POSTGRES_PASSWORD: testpassword
              POSTGRES_DB: testdb
            ports: ["5432:5432"]
            options: --health-cmd pg_isready --health-interval 5s --health-retries 5

        steps:
          - uses: actions/checkout@v4

          - uses: actions/setup-dotnet@v4
            with:
              dotnet-version: '8.0.x'

          - name: Secret Scanning
            uses: gitleaks/gitleaks-action@v2
            env:
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

          - name: Code Formatting & Roslyn Analyzers
            run: |
              dotnet format --verify-no-changes
              dotnet build -c Release -warnaserror

          - name: Unit & Integration Tests
            env:
              ConnectionStrings__DefaultConnection: "Host=localhost;Port=5432;Database=testdb;Username=testuser;Password=testpassword"
            run: dotnet test -c Release --no-build --filter "Category!=E2E"

      publish-artifact:
        name: Build, Scan & Publish
        needs: verify
        if: github.ref == 'refs/heads/main'
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - name: Build OCI Image
            run: docker build -t myapp:git-${{ github.sha }} .

          - name: Trivy Security Scan
            uses: aquasecurity/trivy-action@master
            with:
              image-ref: myapp:git-${{ github.sha }}
              exit-code: '1'
              severity: 'CRITICAL'

          - name: Publish Image
            run: |
              echo "${{ secrets.REGISTRY_TOKEN }}" | docker login -u "${{ secrets.REGISTRY_USER }}" --password-stdin ghcr.io
              docker tag myapp:git-${{ github.sha }} ghcr.io/myorg/myapp:git-${{ github.sha }}
              docker push ghcr.io/myorg/myapp:git-${{ github.sha }}
    ```

---

## Practical Hands-On Verification CLI Workflows

### Rehearsing the CI Quality Gate Locally

Before pushing code to a remote repository, execute the local CLI mirror of the gating pipeline:

```bash
# 1. Step 1: Scan for committed secrets across git history
gitleaks detect --no-banner

# 2. Step 2: Run linters and formatting checks
ruff check . && ruff format --check .

# 3. Step 3: Run strict static type checking
mypy --strict app/

# 4. Step 4: Run unit and integration tests against local Docker DB
DATABASE_URL="postgresql://postgres:test@localhost:5432/test" \
pytest -m "not e2e" -n auto --maxfail=1

# 5. Step 5: Test container image compilation locally
export GIT_SHA=$(git rev-parse --short HEAD)
docker build -t myapp:git-${GIT_SHA} .

# 6. Step 6: Execute local vulnerability scan on compiled artifact
trivy image --severity CRITICAL --exit-code 1 myapp:git-${GIT_SHA}
```

**Expected Wire Output (All Local Gates Green):**
```text
No leaks detected!
0 errors found across 38 files.
Success: no issues found in 38 source files.
======================= 44 passed in 2.14s =======================
Successfully tagged myapp:git-7f8a1bc
2026-11-10T14:30:00.000Z INFO Number of language-specific files: 1
2026-11-10T14:30:01.000Z INFO myapp:git-7f8a1bc (debian 12.5)
Total: 0 (CRITICAL: 0)
```

---

## Operational Validation Checkpoints (Scenario Quizzes)

### Checkpoint 1: The False Security of Dependency Floats in CI
<details>
<summary><strong>Scenario Assessment:</strong> A project's CI configuration contains: <code>run: pip install -r requirements.txt</code> where requirements.txt lists unpinned packages (e.g., <code>fastapi</code>, <code>sqlalchemy</code>, <code>pydantic</code>). A developer submits a documentation update with zero code changes. The CI pipeline fails completely. What happened, and what dependency principle was violated?</summary>

<strong>Answer:</strong>
The failure occurred due to **unpinned, floating dependencies violating Factor II (Dependency Isolation)**:
1. Without a lockfile (`poetry.lock`, `requirements.lock`, or `package-lock.json`), the package manager resolves the latest upstream package versions during every CI run.
2. An upstream library (or transitive dependency) released a breaking change or deprecation between the last commit and the documentation PR.
3. Because CI installs from a fresh container without a cache, it downloaded the new breaking version, causing import errors or test failures on a PR that only changed markdown files.

**Architectural Hardening:**
- Always commit a strict, cryptographic lockfile containing exact semantic versions and SHA-256 package hashes (`pip-compile --generate-hashes` or `npm ci`).
- In CI, invoke commands that strictly enforce lockfile compliance (e.g., `pip install --no-deps -r requirements.lock` or `npm ci`).
</details>

### Checkpoint 2: Ordering CI Stages by Failure Economics
<details>
<summary><strong>Scenario Assessment:</strong> A team configures their GitHub Actions pipeline with two parallel jobs: Job A runs a 12-minute browser E2E test suite, while Job B compiles a Docker image and runs a 30-second linter. A developer makes a syntax typo in an unused import. Why is this pipeline layout economically inefficient, and how should it be restructured?</summary>

<strong>Answer:</strong>
This violates the core principle of **fail-fast, cheap feedback first**:
1. **Compute Waste & Latency:** Running expensive E2E tests concurrently with cheap static checks burns runner minutes. The developer must wait 12 minutes for the E2E suite to finish, or worse, both jobs run to completion when a 2-second linter could have failed the build immediately.
2. **Runner Queue Starvation:** Running long E2E jobs on simple lint-failing PRs consumes limited organizational runner slots, blocking other developers from merging.

**Proper Pipeline Restructuring:**
1. **Stage 1 (Gating Lane):** Run cheap static checks (`ruff`, `mypy`, `gitleaks`) serially in <30 seconds.
2. **Stage 2:** Run fast unit tests in parallel (<1 minute).
3. **Stage 3:** Run DB integration tests (<2 minutes).
4. **Non-Gating Tip:** Move 12-minute browser E2E tests out of the PR gating path into a scheduled post-merge or nightly pipeline.
</details>

### Checkpoint 3: Secret Scanning Enforcement Mechanics
<details>
<summary><strong>Scenario Assessment:</strong> An engineer accidentally commits a live Stripe production secret (<code>sk_live_...</code>) to a feature branch. Realizing the mistake, the engineer makes a second commit deleting the secret from the file and pushes both commits to GitHub. Will a standard CI secret scanner pass or fail this PR?</summary>

<strong>Answer:</strong>
A production-grade secret scanner (such as **Gitleaks** or **TruffleHog**) will **FAIL the PR immediately**:
1. Secret scanners do not merely inspect the current working directory files; they **parse the entire Git commit DAG and diff history** between the target branch (`main`) and the feature branch HEAD.
2. Even though the secret was removed in the latest commit, the secret still exists in plain text inside the parent commit object in Git's history.
3. If merged, anyone cloning the repository would have permanent access to the live production secret.

**Remediation:**
1. The secret is now considered **compromised** and must be immediately revoked and rotated in the Stripe dashboard.
2. The Git branch history must be rewritten (e.g., `git rebase -i` or `git filter-repo`) to completely erase the commit containing the key before force-pushing to the PR.
</details>

---

## Summary & Further Study

- **Fail-Fast Ordering:** Structure CI so cheap checks (linters, type checkers, secret scans) execute first, protecting expensive compute resources.
- **Immutable Artifacts:** Always tag container images with the unique git commit SHA (`:git-${GITHUB_SHA}`), ensuring exact traceability and instant rollbacks.
- **Service Containers:** Use containerized backing services in CI to test real SQL and database constraints without mocking.

### Further Reading
- [GitHub Actions Documentation: Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Gitleaks Repository & Rule Configuration](https://github.com/gitleaks/gitleaks)
- [Aqua Security: Trivy Vulnerability Scanner](https://trivy.dev/)
- [OpenSSF Best Practices for Secure CI/CD Pipelines](https://bestpractices.coreinfrastructure.org/)
