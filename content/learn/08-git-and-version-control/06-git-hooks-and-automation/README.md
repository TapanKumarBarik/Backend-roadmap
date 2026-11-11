# Module 06: Git Hooks and Automation

> **Prerequisites:** Module 01 (Basic Local Workflow), Module 09 in Linux track (Bash Scripting).  
> **Estimated Reading Time:** 25 minutes  
> **Target Audience:** DevOps Engineers, Backend Developers, Security Engineers.

> [!TIP]
> **The Golden Rule of Git Hooks:** **Client-side hooks are for developer convenience; server-side hooks (and CI/CD gates) are for security and quality enforcement.** Because any developer can bypass client-side hooks with `git commit --no-verify`, never rely on local pre-commit hooks as your sole security boundary. Use local hooks to give fast developer feedback ($< 2$ seconds), but enforce mandatory pre-receive checks and CI scanning on the central Git server.

---

## 1. Architectural Mental Model: The Hook Execution Lifecycle

Git hooks are executable programs placed inside `.git/hooks/` (or a custom directory via `core.hooksPath`) that Git invokes automatically at specific lifecycle events:

```mermaid
flowchart TD
    subgraph ClientHooks["Client-Side Hooks (Developer Workstation)"]
        PreCommit["1. pre-commit\n(Linting, formatting, secret check)\nCan abort commit!"]
        PrepMsg["2. prepare-commit-msg\n(Injects branch name / ticket ID)"]
        CommitMsg["3. commit-msg\n(Enforces Conventional Commits)\nCan abort commit!"]
        PostCommit["4. post-commit\n(Desktop notifications, metrics)"]
        PrePush["5. pre-push\n(Runs fast test suite)\nCan abort push!"]
    end

    subgraph Bypass["Bypass Hole"]
        NoVerify["git commit --no-verify\n(Completely skips pre-commit & commit-msg!)"]
    end

    subgraph ServerHooks["Server-Side Quality Gates (GitHub / GitLab / CI)"]
        PreReceive["6. pre-receive\n(Runs on Git Server)\nUnbypassable! Rejects push if secrets found!"]
        UpdateHook["7. update\n(Per-branch validation)"]
        PostReceive["8. post-receive\n(Triggers CI/CD deployment webhooks)"]
    end

    PreCommit --> PrepMsg --> CommitMsg --> PostCommit --> PrePush
    PreCommit -.->|Bypassed by --no-verify| NoVerify
    PrePush -->|git push across wire| PreReceive
    PreReceive -->|All checks green| UpdateHook --> PostReceive
    PreReceive -->|Secret detected| RejectPush["Push Rejected! (Code 1)"]

    classDef bypass fill:#ffebee,stroke:#c62828,stroke-width:2px;
    class NoVerify bypass;
    classDef server fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    class PreReceive,UpdateHook,PostReceive server;
```

---

## 2. Taxonomic Reference: Essential Git Hooks Compared

| Hook Name | Lifecycle Trigger | Can Abort Operation? | Execution Environment | Primary Production Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **`pre-commit`** | Before commit message prompt opens | **YES** (Exit $\neq 0$) | Local Client | Fast code formatting, secret scanning (`gitleaks`), syntax linting. |
| **`commit-msg`** | After commit message is written | **YES** (Exit $\neq 0$) | Local Client | Enforcing Conventional Commits (`feat:`, `fix:`) and Jira ticket IDs. |
| **`pre-push`** | Before objects are uploaded over wire | **YES** (Exit $\neq 0$) | Local Client | Running local unit test suites to prevent pushing broken builds. |
| **`post-commit`** | Immediately after commit is created | No (Read-only) | Local Client | Emitting analytics, updating local status dashboards. |
| **`pre-receive`** | On the remote server prior to updating refs | **YES (Unbypassable)** | Remote Server / CI | Rejecting pushed secrets, verifying GPG signatures, enforcing linear DAG. |
| **`post-receive`** | On remote server after refs updated | No (Read-only) | Remote Server | Dispatching webhooks to Kubernetes CI/CD, updating deployment trackers. |

---

## 3. Systematic Breakdown: Managing Version-Controlled Hooks

By default, `.git/hooks/` resides in the local `.git` directory and **is never committed to source control**. This makes sharing hooks across engineering teams difficult.

### The Modern Standard: `core.hooksPath`
To version-control hooks across your team, create a `.githooks/` directory in the root of your repository and instruct Git to use it:

```bash
# 1. Create a committed hooks directory in the repository
mkdir -p .githooks

# 2. Instruct Git to load hooks from this directory
git config core.hooksPath .githooks
```
Now, every hook in `.githooks/` is tracked in version control, reviewed via Pull Requests, and automatically shared across all team members!

---

## 4. Production War Story: The `--no-verify` Secret Leak Outage

```mermaid
sequenceDiagram
    actor Dev as Feature Developer
    participant Git as Local Git Engine (.git/hooks/pre-commit)
    participant GitHub as Remote GitHub Repository
    participant Scanner as Threat Actor Botnet (Automated GitHub Scraper)
    participant Stripe as Stripe Live Payment API

    Note over Dev: Dev stages bugfix + accidentally stages .env file containing STRIPE_SECRET_KEY!
    Dev->>Git: git commit -m "fix: patch login bug"
    Note over Git: Local pre-commit hook runs ESLint: fails on trailing comma!
    Note over Dev: Dev is in a rush: runs git commit --no-verify to skip ESLint!
    Note over Git: --no-verify disables pre-commit hook! Secret scan NEVER executes!
    Git->>GitHub: git push origin main
    Note over GitHub: Remote lacks server-side push protection!
    Scanner->>GitHub: Public commit event detected#59; scrapes STRIPE_SECRET_KEY in 45 seconds!
    Scanner->>Stripe: Execute 15,000 stolen credit card verification charges!
    Stripe-->>Dev: Account flagged for massive fraudulent card testing: $45,000 fine incurred!
    Note over Dev: Emergency SEV-1: Revoke keys#59; dispute fraudulent transactions!
```

### The Incident
During a late-night incident response, a developer patched a bug. The local `pre-commit` hook failed on an unrelated markdown formatting warning. Frustrated, the developer ran:
```bash
git commit -m "hotfix: resolve customer issue" --no-verify
git push origin main
```
Unbeknownst to the developer, their `git add .` command had staged a `.env` file containing live Stripe API production keys (`sk_live_...`). 

Forty-five seconds after pushing to GitHub, an automated scanning bot harvested the credentials and initiated 15,000 card-testing transactions, incurring \$45,000 in payment processor penalty fees.

### The Post-Mortem Data
* **Severity:** SEV-1 (Financial Fraud & Credential Exposure)
* **Mean Time to Detect (MTTD):** 8 minutes
* **Mean Time to Resolution (MTTR):** 35 minutes (Key revocation and dispute filing)

### The Root Cause
The team relied entirely on a **client-side `pre-commit` hook** for secret scanning. Because `git commit --no-verify` completely disables client-side hooks, the security check was easily bypassed.

### The Fix & Hardening
1. **Enable Server-Side Push Protection:** In GitHub/GitLab, enable **Push Protection**. The server-side `pre-receive` hook intercepts pushes containing known secret patterns (AWS, Stripe, Slack tokens) and rejects the push before the objects enter the repository.
2. **Automate Hook Installation in Setup:**
In `package.json` or Makefile, configure automated hook binding:
```json
"scripts": {
  "prepare": "git config core.hooksPath .githooks"
}
```
3. **CI/CD Quality Gate:** Run `trufflehog` and `gitleaks` in GitHub Actions CI workflows as a mandatory blocking status check.

---

## 5. Multi-Language Production Code: Production Git Hook Implementations

Git hooks can be written in any scripting or compiled language, as long as the file is executable (`chmod +x`) and begins with a valid shebang.

### Bash: Production `.githooks/pre-commit` (Secret Detection)
```bash
#!/usr/bin/env bash
set -euo pipefail

# Scan staged files for sensitive credential patterns
FORBIDDEN_REGEX="(sk_live_[0-9a-zA-Z]{24}|AKIA[0-9A-Z]{16}|-----BEGIN RSA PRIVATE KEY-----)"

# Inspect only the staged diff (not unstaged files on disk)
if git diff --cached | grep -Eq "$FORBIDDEN_REGEX"; then
    echo "❌ [SECURITY ERROR] Attempting to commit sensitive credentials or private keys!" >&2
    echo "   Found matching pattern in staged changes. Clean up before committing." >&2
    exit 1
fi

echo "✅ Pre-commit security scan passed."
exit 0
```

### Node.js / TypeScript: `.githooks/commit-msg` (Conventional Commits)
```javascript
#!/usr/bin/env node
const fs = require('fs');

// Git passes the path to the commit message file as the first argument ($1)
const commitMsgFile = process.argv[2];
const message = fs.readFileSync(commitMsgFile, 'utf8').trim();

// Conventional Commit regex: type(scope)?: description
const conventionalRegex = /^(feat|fix|docs|style|refactor|perf|test|chore|ci)(\([a-z0-9-]+\))?: .+/;

if (!conventionalRegex.test(message)) {
  console.error('\n❌ [INVALID COMMIT MESSAGE]');
  console.error(`   Received: "${message}"`);
  console.error('   Expected format: <type>(<scope>): <subject>');
  console.error('   Examples:');
  console.error('     feat(auth): add jwt signature validation');
  console.error('     fix(db): resolve connection pool leak\n');
  process.exit(1);
}

process.exit(0);
```

### Python: `.githooks/pre-push` (Fast Unit Test Validation)
```python
#!/usr/bin/env python3
import subprocess
import sys

def main():
    print("🚀 [pre-push] Running fast test suite before pushing...")
    res = subprocess.run(["go", "test", "-short", "./..."], capture_output=True, text=True)
    
    if res.returncode != 0:
        print("\n❌ [PUSH ABORTED] Tests failed locally! Fix tests before pushing:", file=sys.stderr)
        print(res.stderr or res.stdout, file=sys.stderr)
        sys.exit(1)

    print("✅ All unit tests passed.")
    sys.exit(0)

if __name__ == "__main__":
    main()
```

---

## 6. Practical Hands-On Verification CLI Workflows

Follow these workflows in your Ubuntu terminal:

### Workflow 1: Author and Test a Local Pre-Commit Hook
```bash
# 1. Initialize temporary repo
mkdir -p /tmp/git-hooks-lab && cd /tmp/git-hooks-lab
git init

# 2. Author a pre-commit hook that blocks commits containing 'TODO_BLOCK'
cat << 'EOF' > .git/hooks/pre-commit
#!/usr/bin/env bash
if git diff --cached | grep -q "TODO_BLOCK"; then
    echo "❌ Commit rejected: 'TODO_BLOCK' detected in staged files!" >&2
    exit 1
fi
exit 0
EOF

# 3. Make hook executable
chmod +x .git/hooks/pre-commit

# 4. Test hook rejection
echo "This is broken TODO_BLOCK" > test.txt
git add test.txt
git commit -m "feat: test hook" || echo "Commit cleanly rejected by hook!"
```

### Workflow 2: Test the `--no-verify` Bypass
```bash
# Bypass the hook with --no-verify
git commit -m "feat: bypass hook" --no-verify
git log -n 1 --oneline
```
*(Notice the commit succeeded because `--no-verify` bypassed the pre-commit script completely!)*

### Workflow 3: Clean Up
```bash
cd ~ && rm -rf /tmp/git-hooks-lab
```

---

## 7. Operational Validation Checkpoint

<details>
<summary><strong>Question 1: Why Client-Side Hooks Cannot Guarantee Security</strong></summary>

**Scenario:** A company mandates: "All developers must install our local `pre-commit` hook to guarantee that no secret keys or unformatted code enter our GitHub repository." 

Why is this policy fundamentally flawed, and where must the true security boundary reside?

**Answer:**
Client-side hooks run on **untrusted developer hardware under developer control**. 
1. Any developer can bypass local hooks by passing the **`--no-verify`** flag (`git commit -n` or `git push --no-verify`).
2. Developers can delete or disable the executable bit on `.git/hooks/*`.
3. New clones do not automatically activate hooks unless explicitly configured.

**The True Security Boundary:** Mandatory quality and security checks must be enforced **server-side** (via GitHub/GitLab server-side **pre-receive hooks**, push protection, and automated CI status check gates).
</details>

<details>
<summary><strong>Question 2: Why `.git/hooks/` is Not Tracked by Git</strong></summary>

**Scenario:** A junior developer writes five helpful Git hooks inside `.git/hooks/`. They run `git status`, but the hooks do not appear in the untracked file list. 

Why does Git forbid tracking files inside `.git/hooks/` in version control?

**Answer:**
Allowing repositories to automatically execute arbitrary scripts from source control upon clone would create an **immediate Remote Code Execution (RCE) vulnerability**. 

If `.git/hooks/` were version-controlled, cloning an untrusted third-party repository could execute malicious scripts automatically without the user's consent. 

**The Secure Solution:** Store hooks in a version-controlled directory such as `.githooks/` and require developers or setup scripts to explicitly opt in by configuring `git config core.hooksPath .githooks`.
</details>

<details>
<summary><strong>Question 3: `pre-commit` vs `commit-msg` Hook Responsibilities</strong></summary>

**Scenario:** You want to validate that every commit message starts with a JIRA ticket number (e.g., `PROJ-123: ...`). 
Why should you implement this check in the `commit-msg` hook rather than the `pre-commit` hook?

**Answer:**
The **`pre-commit` hook runs BEFORE the user is prompted to write a commit message**. At the time `pre-commit` executes, the commit message does not yet exist!

The **`commit-msg` hook executes AFTER the commit message has been written** (and saved in a temporary file passed as `$1`). This is the dedicated hook designed specifically to inspect, validate, or reject commit message syntax.
</details>

---

## Next Step

Now that you understand Git hooks, client vs. server enforcement, and automation workflows, proceed to **[07 · Troubleshooting and Recovery](../07-troubleshooting-and-recovery/README.md)** to master `git reflog`, `git reset`, recovering deleted commits, and bisecting production regressions.
