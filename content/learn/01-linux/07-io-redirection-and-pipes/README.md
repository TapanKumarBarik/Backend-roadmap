# Module 07: I/O Redirection and Pipes

> **Prerequisites:** Module 01 (Shell Basics and Unix Philosophy), Module 06 (Process Management).  
> **Estimated Reading Time:** 25 minutes  
> **Target Audience:** Backend Developers, DevOps Engineers, Infrastructure Automation Authors.

> [!TIP]
> **The Golden Rule of Linux I/O:** Every Linux process starts with three standard file descriptors: `0` (stdin), `1` (stdout), and `2` (stderr). The shell evaluates redirections **strictly from left to right**. To capture both normal logs and error traces into a file, always write `> output.log 2>&1` (or `&> output.log`). If you write `2>&1 > output.log`, stderr is duplicated to the terminal *before* stdout is redirected, resulting in uncaptured error logs!

---

## 1. Architectural Mental Model: Standard Streams and Kernel Anonymous Pipes

In the Unix programming model, programs do not need to know where their inputs come from or where their outputs go. A program simply reads from File Descriptor (FD) `0` and writes to FD `1` and FD `2`. The shell manipulates these descriptors using the `dup2()` system call before invoking `execve()`.

```mermaid
flowchart LR
    subgraph Proc1["Process 1: Producer (e.g., cat /var/log/nginx.log)"]
        FD0_1["FD 0: stdin"]
        FD1_1["FD 1: stdout"]
        FD2_1["FD 2: stderr"]
    end

    subgraph KernelPipe["Linux Kernel Anonymous Pipe Buffer"]
        RingBuf["Circular Memory Ring Buffer\n(Capacity: 64 KB in RAM)"]
    end

    subgraph Proc2["Process 2: Consumer (e.g., grep ' 500 ')"]
        FD0_2["FD 0: stdin"]
        FD1_2["FD 1: stdout"]
        FD2_2["FD 2: stderr"]
    end

    subgraph Sinks["Destinations"]
        Terminal["Terminal Screen / dev/pts/X"]
        DiskFile["File on Disk (errors.log)"]
    end

    FD1_1 -->|write()| RingBuf
    RingBuf -->|read()| FD0_2
    FD2_1 -->|2>| DiskFile
    FD1_2 -->|stdout| Terminal
    FD2_2 -->|stderr| Terminal
```

### The Anonymous Pipe Buffer
When you run `cmd1 | cmd2`:
1. The kernel allocates a **64 KB in-memory circular ring buffer**.
2. Both commands execute **concurrently** in separate child subshell processes.
3. If `cmd1` generates data faster than `cmd2` consumes it, `cmd1` blocks on `write()` when the 64 KB buffer fills.
4. If `cmd2` exits early (e.g. `head -n 5`), any subsequent write by `cmd1` triggers a kernel `SIGPIPE` signal (exit code `141`), terminating the producer cleanly.

---

## 2. Systematic Reference: Redirection Operators

| Operator | Syntax Example | Action Performed | Kernel Operation |
| :--- | :--- | :--- | :--- |
| **`>`** | `cmd > file.txt` | Overwrites `file.txt` with stdout (creates if missing) | `open(O_WRONLY\|O_CREAT\|O_TRUNC)`, `dup2(fd, 1)` |
| **`>>`** | `cmd >> file.txt` | Appends stdout to `file.txt` | `open(O_WRONLY\|O_CREAT\|O_APPEND)`, `dup2(fd, 1)` |
| **`<`** | `cmd < input.json` | Feeds `input.json` to stdin | `open(O_RDONLY)`, `dup2(fd, 0)` |
| **`2>`** | `cmd 2> err.log` | Redirects stderr only to `err.log` | `open(O_WRONLY)`, `dup2(fd, 2)` |
| **`2>&1`** | `cmd > all.log 2>&1` | Merges stderr into stdout stream | `dup2(1, 2)` |
| **`&>`** | `cmd &> all.log` | Bash shortcut for `> all.log 2>&1` | Redirects both stdout and stderr |
| **`\|`** | `cmd1 \| cmd2` | Pipes stdout of `cmd1` to stdin of `cmd2` | `pipe()`, `dup2(pipe_out, 1)`, `dup2(pipe_in, 0)` |
| **`\|&`** | `cmd1 \|& cmd2` | Pipes both stdout and stderr into `cmd2` | Merges FD 1 & 2 into pipe |
| **`tee`** | `cmd \| tee file.txt` | Splits stream: writes to file AND terminal | Userspace stream duplication |
| **`<(cmd)`** | `diff <(cmd1) <(cmd2)` | **Process Substitution:** Exposes command output as a FIFO file | Creates `/dev/fd/63` anonymous pipe descriptor |

---

## 3. Redirection Order: The Classic Trap

The difference between `> file 2>&1` and `2>&1 > file` is one of the most common Linux exam and production interview questions:

```
  CORRECT: cmd > file.log 2>&1
  Step 1: FD 1 (stdout) is redirected to file.log
  Step 2: FD 2 (stderr) is redirected to wherever FD 1 currently points (file.log)
  Result: BOTH stdout and stderr are saved in file.log.

  WRONG:   cmd 2>&1 > file.log
  Step 1: FD 2 (stderr) is redirected to wherever FD 1 currently points (the terminal!)
  Step 2: FD 1 (stdout) is redirected to file.log
  Result: Stderr prints to terminal screen; ONLY stdout is saved in file.log!
```

---

## 4. Production War Story: The Silent Corrupted Backup (SIGPIPE & Missing pipefail)

```mermaid
sequenceDiagram
    actor Cron as Production Backup Cron
    participant Script as backup.sh
    participant Dump as pg_dump (Database Producer)
    participant Enc as gpg (Encryption Consumer)
    participant S3 as S3 Remote Storage

    Note over Script: backup.sh runs: pg_dump prod_db | gpg --encrypt > /backup/db.enc
    Script->>Dump: Start dumping 500GB database
    Dump->>Enc: Stream SQL bytes across anonymous pipe buffer
    Note over Enc: Fatal Error: Encryption key expired or keyring locked!
    Enc-->>Script: gpg exits with code 2 (Crash)!
    Enc->>Dump: Closed pipe causes kernel to send SIGPIPE to pg_dump
    Dump-->>Script: pg_dump aborts with exit code 141 (Terminated by SIGPIPE)
    Note over Script: Shell evaluates pipeline exit status using LAST command (gpg)!
    Note over Script: BUT script lacks "set -e" or evaluates $? incorrectly!
    Script->>S3: aws s3 cp /backup/db.enc s3://backups/
    Note over S3: Uploads 0-byte corrupt file! Script logs: "Backup Succeeded!"
    Note over Cron: 3 months later: Ransomware strikes; all backups found empty!
```

### The Incident
An enterprise fintech platform suffered ransomware encryption. When SREs attempted to restore the primary database from nightly backups, they discovered that every single backup archive generated over the preceding 90 days was **0 bytes in size**.

### The Post-Mortem Data
* **Severity:** SEV-1 (Catastrophic Business Impact)
* **Mean Time to Detect (MTTD):** 90 days (Discovered during emergency disaster recovery)
* **Mean Time to Resolution (MTTR):** 4 days (Manual forensic reconstruction from WAL logs)

### The Root Cause
The production backup script executed:
```bash
pg_dump -U postgres production_db | gzip | aws s3 cp - s3://my-backups/db.sql.gz
```
An expired IAM credential caused `aws s3 cp` to fail immediately. Because standard Bash pipelines report only the exit status of the **final command**, and subsequent lines were poorly guarded without `set -o pipefail`, the script assumed success. `pg_dump` received `SIGPIPE` (Signal 13 / Exit 141) from the kernel as soon as the pipe closed, leaving zero usable data.

### The Fix & Hardening
1. **Enable Strict Pipeline Failure:**
```bash
set -euo pipefail
```
With `pipefail`, if `pg_dump` or `gzip` fails, the pipeline returns that failure code instead of hiding behind the last process.
2. **Validate Archive Non-Zero Byte Sizes:**
```bash
# Verify output file exists and is larger than 100MB before reporting success
FILE_SIZE=$(stat -c%s "/var/backups/db.sql.gz" 2>/dev/null || echo 0)
if [ "$FILE_SIZE" -lt 104857600 ]; then
    echo "FATAL: Backup file suspiciously small ($FILE_SIZE bytes)!" >&2
    exit 1
fi
```

---

## 5. Multi-Language Production Code: Managing Pipes & Standard Streams

Backend applications frequently need to pipe data between external child processes without buffering entire gigabytes in memory.

### Go (`io.Pipe` & `exec.Cmd`)
```go
package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os/exec"
	"time"
)

// StreamPipeline pipes the stdout of cmd1 directly into the stdin of cmd2 in streaming memory.
func StreamPipeline(ctx context.Context) (string, error) {
	cmd1 := exec.CommandContext(ctx, "echo", "apple\nbanana\ncherry\napple\ndate")
	cmd2 := exec.CommandContext(ctx, "sort")
	cmd3 := exec.CommandContext(ctx, "uniq", "-c")

	// Create pipe cmd1 -> cmd2
	pipe1, err := cmd1.StdoutPipe()
	if err != nil {
		return "", err
	}
	cmd2.Stdin = pipe1

	// Create pipe cmd2 -> cmd3
	pipe2, err := cmd2.StdoutPipe()
	if err != nil {
		return "", err
	}
	cmd3.Stdin = pipe2

	var out bytes.Buffer
	cmd3.Stdout = &out

	// Start pipeline
	if err := cmd1.Start(); err != nil {
		return "", err
	}
	if err := cmd2.Start(); err != nil {
		return "", err
	}
	if err := cmd3.Start(); err != nil {
		return "", err
	}

	// Wait in reverse order
	_ = cmd1.Wait()
	_ = cmd2.Wait()
	if err := cmd3.Wait(); err != nil {
		return "", err
	}

	return out.String(), nil
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := StreamPipeline(ctx)
	if err != nil {
		fmt.Printf("Pipeline failed: %v\n", err)
		return
	}
	fmt.Printf("Pipeline Output:\n%s", result)
}
```

### Node.js / TypeScript (`stream.pipeline`)
```typescript
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

/**
 * Pipes output of a producer command into a consumer and writes to disk.
 */
export async function executeStreamingPipeline(destinationPath: string): Promise<void> {
  // Spawn commands without shell intermediary
  const producer = spawn('echo', ['alpha\nbeta\ngamma\nalpha']);
  const transformer = spawn('sort');

  // Pipe stdout of producer into stdin of transformer
  producer.stdout.pipe(transformer.stdin);

  const fileSink = createWriteStream(destinationPath);

  // Safely manage backpressure and teardowns
  await pipeline(transformer.stdout, fileSink);
  console.log(`✅ Pipeline successfully written to ${destinationPath}`);
}

executeStreamingPipeline('/tmp/sorted_output.txt').catch(console.error);
```

### Python (`subprocess.PIPE`)
```python
import subprocess
import sys

def run_piped_command():
    """
    Simulates: ps aux | grep python | awk '{print $2}' without using shell=True.
    """
    p1 = subprocess.Popen(["ps", "aux"], stdout=subprocess.PIPE)
    p2 = subprocess.Popen(["grep", "python"], stdin=p1.stdout, stdout=subprocess.PIPE)
    
    # Allow p1 to receive a SIGPIPE if p2 exits
    if p1.stdout:
        p1.stdout.close()

    output, err = p2.communicate()
    print("Filtered Process Table:")
    print(output.decode("utf-8"))

if __name__ == "__main__":
    run_piped_command()
```

---

## 6. Practical Hands-On Verification CLI Workflows

Follow these workflows in your Ubuntu terminal:

### Workflow 1: Strict Separation of Output and Errors
```bash
# 1. Run a command producing both stdout and stderr
ls -d /etc /nonexistent_folder_abc > /tmp/stdout.log 2> /tmp/stderr.log

# 2. Inspect separated files
cat /tmp/stdout.log
cat /tmp/stderr.log
```
**Expected Output:**
```text
/etc
ls: cannot access '/nonexistent_folder_abc': No such file or directory
```

### Workflow 2: Process Substitution (`diff <(cmd1) <(cmd2)`)
Compare the outputs of two commands on the fly without creating temporary files:
```bash
# Compare environment variables between two commands
diff -u <(echo -e "A\nB\nC") <(echo -e "A\nB\nMODIFIED")
```
**Expected Output:**
```text
--- /dev/fd/63  2026-11-10 15:20:00
+++ /dev/fd/62  2026-11-10 15:20:00
@@ -1,3 +1,3 @@
 A
 B
-C
+MODIFIED
```

### Workflow 3: Multi-Stream Splitting with `tee`
```bash
# Write to screen AND file simultaneously
echo "CRITICAL EVENT: Database connected" | tee -a /tmp/event.log
cat /tmp/event.log
rm -f /tmp/stdout.log /tmp/stderr.log /tmp/event.log
```

---

## 7. Operational Validation Checkpoint

<details>
<summary><strong>Question 1: The Pipeline Subshell Variable Loss Bug</strong></summary>

**Scenario:** A developer writes a Bash script to count errors in a log file:
```bash
TOTAL_ERRORS=0
cat /var/log/app.log | while read -r line; do
    if [[ "$line" == *"ERROR"* ]]; then
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
done
echo "Final Count: $TOTAL_ERRORS"
```
Even when the file contains 50 error lines, the script prints: `Final Count: 0`.

Why did `TOTAL_ERRORS` remain 0, and how should this script be rewritten?

**Answer:**
In standard Bash, each command in a pipeline (`cmd1 | cmd2`) executes inside its own **forked subshell process**. 

The `while` loop executed in a child subshell, incremented a copy of `TOTAL_ERRORS` in its own private memory, and terminated. When the loop finished, the subshell was destroyed. The parent shell's `TOTAL_ERRORS` was never modified.

**The Fix:** Avoid piping into the loop. Use **Input Redirection** so the loop executes in the main shell:
```bash
TOTAL_ERRORS=0
while read -r line; do
    if [[ "$line" == *"ERROR"* ]]; then
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
done < /var/log/app.log
echo "Final Count: $TOTAL_ERRORS"
```
*(Now `TOTAL_ERRORS` correctly reports 50).*
</details>

<details>
<summary><strong>Question 2: What is Exit Code 141?</strong></summary>

**Scenario:** A deployment health check runs:
`curl -s https://api.internal/metrics | grep "health_ok"`
In your CI log, the pipeline fails with exit status `141`. 

What caused exit code 141, and what signal was dispatched by the kernel?

**Answer:**
Exit code `141` corresponds to **Signal 13 (`SIGPIPE`)**. In Unix conventions, fatal termination by signal results in an exit code of `128 + Signal_Number` (128 + 13 = 141).

`SIGPIPE` occurs when a process attempts to `write()` to a pipe or socket whose reading end has already been closed. For example, if `grep` matched its pattern or terminated early before `curl` finished downloading the full HTTP payload, the kernel closed the pipe. When `curl` attempted its next write, the kernel dispatched `SIGPIPE`, immediately killing `curl`.
</details>

<details>
<summary><strong>Question 3: Discarding Output Efficiently (`/dev/null`)</strong></summary>

**Scenario:** You have a cron job that runs a noisy database health check every minute: `check_db.sh`. You want to silence all regular output, but if an error occurs, you want stderr delivered to the cron mailer.

What is the exact redirection syntax?

**Answer:**
```bash
check_db.sh > /dev/null
```
By redirecting only file descriptor 1 (`stdout`) to the bit-bucket sink `/dev/null`, standard output is discarded. File descriptor 2 (`stderr`) remains connected to the default standard error stream (the terminal or cron daemon mailer), ensuring alerts trigger only when real errors occur.
</details>

---

## Next Step

Now that you understand standard streams, redirection mechanics, and pipeline buffering, proceed to **[08 · Text Processing with Grep, Sed, and Awk](../08-text-processing-grep-sed-awk/README.md)** to master regex filtering, stream editing, and columnar log parsing.
