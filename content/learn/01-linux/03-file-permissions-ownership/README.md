# Module 03: File Permissions and Ownership

> **Prerequisites:** Module 02 (Filesystem Navigation), terminal CLI access.  
> **Estimated Reading Time:** 25 minutes  
> **Target Audience:** Backend Engineers, Site Reliability Engineers, Container Security Specialists.

> [!TIP]
> **The Golden Rule of Linux Permissions:** Never use `chmod 777` and never add `sudo` by reflex. Permissions are isolation boundaries enforced by the kernel's Discretionary Access Control (DAC) engine. Always deconstruct permissions into **Target Entity (User / Group / Others)** and **Resource Capability (Read / Write / Execute)**. When permissions fail, adjust user or group ownership (`chown`) to match the running service identity rather than opening world-writable holes.

---

## 1. Architectural Mental Model: Discretionary Access Control (DAC)

When a process initiates a filesystem system call (such as `open()`, `unlink()`, or `execve()`), the Linux kernel validates the process's **Effective User ID (EUID)** and **Effective Group IDs (EGID)** against the file's inode metadata.

```mermaid
flowchart TD
    Proc["Running Process\n(e.g., EUID=1001 'app', EGID=1001 'app')"] --> Syscall["System Call\nopen('/etc/app/config.json', O_RDWR)"]
    Syscall --> DAC{"Kernel DAC Check\nTarget Inode: -rw-r----- 1 root app"}

    DAC -->|"Is EUID == Inode Owner (root)?"| UserCheck{"Check Owner Bits (rw-)"}
    DAC -->|"Is EGID in Inode Group (app)?"| GroupCheck{"Check Group Bits (r--)"}
    DAC -->|Neither Matches| OtherCheck{"Check Others Bits (---)"}

    UserCheck -->|Matches Request?| Allow["Permit Access (Syscall OK)"]
    UserCheck -->|Does Not Match| Deny["EACCES: Permission Denied"]

    GroupCheck -->|Requested Read?| Allow
    GroupCheck -->|"Requested Write (O_RDWR)?"| Deny

    OtherCheck -->|"Bits are 0 (---)"| Deny
```

### The Inode Evaluation Rule
The kernel evaluates permissions in **strict priority order**:
1. If the process UID matches the file's Owner UID, **only the owner bits are checked**. Group and other bits are ignored.
2. If the UID does not match but the process is a member of the file's Group GID, **only the group bits are checked**. Other bits are ignored.
3. If neither matches, **only the other bits are checked**.
4. The superuser (`root` / UID `0`) bypasses read/write DAC restrictions, though it still requires execute permissions (`+x`) on binaries.

---

## 2. Anatomy of the 10-Character Permission String

When you run `ls -l`, each entry displays a 10-character mode string:

```
  ┌── File Type: - (file), d (directory), l (symlink), c (char), b (block), s (socket)
  │
  │   ┌── Owner (User) Permissions: Read (4) + Write (2) + Execute (1)
  │   │
  │   │     ┌── Group Permissions: Read (4) + Write (0) + Execute (0)
  │   │     │
  │   │     │     ┌── Others (World) Permissions: None (0)
  ▼   ▼     ▼     ▼
  -  r w x  r - - - - -    1 app-runner app-group 4096 Nov 10 12:00 deploy.sh
```

### File vs. Directory Permission Semantics
The permissions `r`, `w`, and `x` have fundamentally different meanings depending on whether the inode represents a file or a directory:

| Bit | Meaning on a Regular File | Meaning on a Directory | Critical Production Impact |
| :--- | :--- | :--- | :--- |
| **`r` (Read, 4)** | View or stream file content (`cat`, `less`) | List directory contents (`ls`) | Without `r`, `ls` cannot read directory file names. |
| **`w` (Write, 2)** | Modify or overwrite file data | Create, rename, or delete files inside directory | **Deleting a file requires `w` on its parent directory**, not on the file itself! |
| **`x` (Execute, 1)** | Execute file as a program/binary | Enter or traverse directory (`cd`, access sub-inodes) | A directory without `+x` is impenetrable, even if sub-files are `777`! |

---

## 3. Systematic Reference: Octal Modes and Production Profiles

| Octal | Symbolic | File Semantic | Directory Semantic | Production Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **`600`** | `rw-------` | Read/write by owner only | Owner can read/write but cannot enter | **Private SSH keys** (`~/.ssh/id_ed25519`), TLS private keys, `.env` secrets. |
| **`644`** | `rw-r--r--` | Owner reads/writes; all others read | Owner modifies; others list contents | **Public web files**, config files (`nginx.conf`), static HTML/assets. |
| **`700`** | `rwx------` | Owner reads, writes, executes | Owner traverses, lists, creates files | **SSH directory** (`~/.ssh`), private daemon data (`/var/lib/postgresql/data`). |
| **`755`** | `rwxr-xr-x` | Owner reads/writes/runs; others run | All can traverse and list; owner can write | **Standard binaries** (`/usr/bin`), executable scripts, public web directories. |
| **`1777`** | `rwxrwxrwt` | World writable with **Sticky Bit** | Anyone can create; only owner can delete | **Shared temporary scratch space** (`/tmp`, `/var/tmp`). |
| **`777`** | `rwxrwxrwx` | World readable, writable, executable | Unrestricted access to any process | **PROHIBITED IN PRODUCTION.** Major security vulnerability. |

---

## 4. Production War Story: The `chmod -R 777` Container Compromise

```mermaid
sequenceDiagram
    actor Attacker as Remote Malicious Actor
    participant Nginx as Web App Container (UID 1000)
    participant Shared as Shared Docker Volume (/var/app/data)
    participant DB as Postgres Container (UID 999)

    Note over Nginx,DB: Dev ran "chmod -R 777" on volume to solve permission error!
    Attacker->>Nginx: Exploit Web File-Upload Vulnerability
    Nginx->>Shared: Write malicious shared object library (libtamper.so)
    Note over Shared: Volume is world-writable (777)!
    Attacker->>Nginx: Overwrite DB configuration file in shared volume
    DB->>Shared: Read modified config / credentials
    Note over DB: Postgres starts with attacker-controlled auth parameters!
    Attacker->>DB: Connect directly to DB as superuser and exfiltrate customer PII
```

### The Incident
During a major payment microservice deployment, a junior engineer encountered repeated `EACCES: Permission denied` errors when mounting a shared volume between an Nginx front-proxy and an internal processing worker. To "unblock deployment," the engineer added a startup hook:
```bash
chmod -R 777 /var/app/shared_storage
```

### The Post-Mortem Data
* **Severity:** SEV-1 (Data Breach & Privilege Escalation)
* **Mean Time to Detect (MTTD):** 25 minutes (GuardDuty anomaly detected external IP connection)
* **Mean Time to Resolution (MTTR):** 90 minutes (Revoking all certificates, isolating cluster)

### The Root Cause
By granting mode `777`, any unprivileged process on the host or inside any container mounting that volume had full read and write control. When an adjacent container running legacy image processing software was compromised via a known CVE, the attacker traversed the filesystem, found the world-writable volume, modified the application's configuration tokens, and extracted live database credentials.

### The Fix & Architectural Hardening
1. **Never use `777`:** Use targeted group ownership:
```bash
# Set specific ownership to dedicated service user and group
chown -R 10001:10001 /var/app/shared_storage
chmod 750 /var/app/shared_storage
```
2. **Enforce Container Non-Root Context:** Ensure Dockerfiles specify non-root users:
```dockerfile
RUN groupadd -g 10001 appgroup && useradd -u 10001 -g appgroup appuser
USER 10001:10001
```
3. **Automated CI/CD Linting:** Deploy Hadolint and Trivy rules that automatically block any Dockerfile or Helm chart containing `chmod 777` or `chmod a+rwx`.

---

## 5. Multi-Language Production Code: Safe File Permission Handling

Backend applications must explicitly declare safe permission modes when generating files (e.g. token files, cache files, uploaded assets), and must never inherit an insecure `umask`.

### Go
```go
package main

import (
	"fmt"
	"io/fs"
	"os"
)

// WriteSecretFile writes sensitive credentials to disk with strict 0600 (owner read/write only) permissions.
func WriteSecretFile(path string, secretData []byte) error {
	// os.O_EXCL ensures we do not accidentally overwrite an existing file or follow a pre-existing symlink
	flags := os.O_WRONLY | os.O_CREATE | os.O_EXCL | os.O_TRUNC
	file, err := os.OpenFile(path, flags, 0600)
	if err != nil {
		return fmt.Errorf("failed to create secret file with mode 0600: %w", err)
	}
	defer file.Close()

	if _, err := file.Write(secretData); err != nil {
		return fmt.Errorf("failed writing secret data: %w", err)
	}

	// Verify permissions via inode stat
	fi, err := file.Stat()
	if err != nil {
		return err
	}
	if fi.Mode().Perm() != 0600 {
		return fmt.Errorf("security violation: file mode is %04o, expected 0600", fi.Mode().Perm())
	}

	return nil
}

func main() {
	secretPath := "/tmp/app_token.key"
	_ = os.Remove(secretPath) // Clean up for demonstration

	err := WriteSecretFile(secretPath, []byte("SUPER_SECRET_PRODUCTION_API_KEY_99"))
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	fmt.Printf("✅ Secret file written securely to %s with 0600 permissions.\n", secretPath)
}
```

### Node.js / TypeScript
```typescript
import * as fs from 'fs/promises';
import { constants } from 'fs';

/**
 * Creates a restricted configuration file accessible exclusively by the application process owner (0o600).
 */
export async function writeSecureConfig(filepath: string, configData: string): Promise<void> {
  // Mode 0o600 = User Read + User Write; No Group, No Others
  await fs.writeFile(filepath, configData, {
    mode: 0o600,
    flag: 'w',
  });

  // Verify inode mode
  const stats = await fs.stat(filepath);
  const octalMode = '0' + (stats.mode & 0o777).toString(8);

  if (octalMode !== '0600') {
    throw new Error(`Insecure file mode detected: ${octalMode} (expected 0600)`);
  }

  console.log(`✅ File ${filepath} secured with mode ${octalMode}`);
}

async function run() {
  const file = '/tmp/database_credentials.json';
  await writeSecureConfig(file, JSON.stringify({ pass: 'vault_pass_xyz' }));
}

run().catch(console.error);
```

### Python
```python
import os
import stat
from pathlib import Path

def write_hardened_secret(filepath: Path, secret_content: str) -> None:
    """
    Creates a secret file safely by enforcing a temporary process umask
    and specifying 0o600 file modes.
    """
    # Set umask to mask out all group and others permissions (0o077)
    old_umask = os.umask(0o077)
    try:
        # Open with O_CREAT and O_WRONLY with strict 0o600 permissions
        fd = os.open(filepath, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(secret_content)
    finally:
        # Always restore original umask
        os.umask(old_umask)

    # Validate mode on disk
    file_mode = stat.S_IMODE(os.stat(filepath).st_mode)
    if file_mode != 0o600:
        raise PermissionError(f"File mode insecure: {oct(file_mode)} != 0o600")

    print(f"✅ Secure file created: {filepath} ({oct(file_mode)})")

if __name__ == "__main__":
    target = Path("/tmp/jwt_private.pem")
    write_hardened_secret(target, "-----BEGIN RSA PRIVATE KEY-----\nMIIE...")
```

---

## 6. Practical Hands-On Verification CLI Workflows

Execute these commands in your Ubuntu terminal to inspect and modify permissions:

### Workflow 1: Inspect Detailed Inode Permissions and Umask
```bash
# 1. Check current shell umask (default file creation mask)
umask

# 2. Create test files and inspect the resulting mode
touch ~/test-file.txt
mkdir ~/test-dir
ls -ld ~/test-file.txt ~/test-dir
```
**Expected Output:**
```text
0022
-rw-r--r-- 1 asha asha    0 Nov 10 15:10 /home/asha/test-file.txt
drwxr-xr-x 2 asha asha 4096 Nov 10 15:10 /home/asha/test-dir
```
*(Notice that default file mode `666 - 022 = 644`, while directory mode `777 - 022 = 755`).*

### Workflow 2: Demonstrate the Directory Execute (`x`) Traversal Barrier
```bash
# 1. Create a directory with read-only permissions (no execute bit)
mkdir -p ~/no-traverse/secret
echo "vault data" > ~/no-traverse/secret/file.txt
chmod 644 ~/no-traverse

# 2. Attempt to cd into the directory or view the file
cd ~/no-traverse
cat ~/no-traverse/secret/file.txt
```
**Expected Output:**
```text
bash: cd: /home/asha/no-traverse: Permission denied
cat: /home/asha/no-traverse/secret/file.txt: Permission denied
```
*(Without the execute bit `+x`, the kernel refuses to look up any child inodes inside the directory).*

### Workflow 3: Clean Up
```bash
chmod 755 ~/no-traverse
rm -rf ~/no-traverse ~/test-file.txt ~/test-dir
```

---

## 7. Operational Validation Checkpoint

<details>
<summary><strong>Question 1: The SSH "Permissions are too open" Rejection</strong></summary>

**Scenario:** A developer attempts to authenticate to an AWS EC2 instance:
```bash
ssh -i production-key.pem ubuntu@198.51.100.5
```
The SSH client immediately aborts connection with the error:
`@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@`  
`@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @`  
`@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@`  
`Permissions 0644 for 'production-key.pem' are too open.`  
`It is required that your private key files are NOT accessible by others.`

What exact command resolves this error, and why does OpenSSH mandate this?

**Answer:**
Execute:
```bash
chmod 600 production-key.pem
```
OpenSSH client software performs a mandatory safety check on private key files before loading them into memory. Mode `0644` (`rw-r--r--`) allows any local user or unprivileged process on the machine to read the private key. OpenSSH intentionally refuses to use keys that are readable by Group or Others (`g-rwx,o-rwx`), requiring mode `600` (`rw-------`) or `400` (`r--------`).
</details>

<details>
<summary><strong>Question 2: Deleting a Read-Only File</strong></summary>

**Scenario:** A junior developer creates a file and marks it read-only:
```bash
touch sensitive.log
chmod 444 sensitive.log
```
Another user runs `rm sensitive.log` and is able to delete the file! The junior developer asks: "Why was the file deleted when its permission bit had write disabled (`r--r--r--`)?"

Explain the Linux filesystem mechanism that governs file deletion.

**Answer:**
In Linux, **file deletion is a modification of the parent directory**, not of the file itself. 

A directory is a table mapping names to inode numbers. Deleting a file (`unlink`) removes the directory entry. Therefore, permission to delete a file depends exclusively on whether the user has **write (`w`) and execute (`x`) permissions on the parent directory**, regardless of the file's individual permission bits. Mode `444` on a file prevents writing to the file's contents, but does not prevent unlinking the file if the parent directory is writable.
</details>

<details>
<summary><strong>Question 3: The Sticky Bit on `/tmp`</strong></summary>

**Scenario:** On a Linux server, `/tmp` has mode `1777` (`rwxrwxrwt`). User `alice` creates `/tmp/alice_cache.json`. User `bob` attempts to delete Alice's file: `rm /tmp/alice_cache.json`. The command fails with `rm: cannot remove '/tmp/alice_cache.json': Operation not permitted`.

Why can Bob not delete Alice's file, even though `/tmp` is world-writable (`rwx` for others)?

**Answer:**
The leading `1` in `1777` is the **Sticky Bit** (represented by `t` in the other permissions slot). 

When the sticky bit is set on a directory, the kernel restricts file deletion and renaming: a user can only delete or rename a file if they are either:
1. The **owner of the file**,
2. The **owner of the directory**, or
3. The **root superuser**.

Without the sticky bit, any user on a multi-user system could arbitrarily delete or overwrite any other user's temporary files, leading to denial-of-service attacks.
</details>

---

## Next Step

Now that you understand file permissions, DAC mechanisms, and inode attributes, proceed to **[04 · Users and Groups](../04-users-and-groups/README.md)** to master Linux identity, UIDs, GIDs, `/etc/passwd`, and service accounts.
