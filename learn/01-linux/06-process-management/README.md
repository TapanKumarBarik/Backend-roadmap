# Process Management

## Why this matters

Every command you run, every server you start, and every script that hangs or misbehaves is a process — and eventually you will need to see what's running, figure out why something is eating CPU or won't respond, and stop it safely (or forcefully). This is exactly the skill you'll reach for later when a Docker container's process won't exit cleanly, or a Kubernetes pod is stuck, so building solid intuition here on plain Linux pays off directly in the later tracks.

## Concepts

**What a process is.** A process is a running instance of a program. When you type `htop` and press Enter, the shell asks the kernel to load that program into memory and start executing it — that running instance is a process, with its own process ID.

**PID and PPID.** Every process gets a unique number called a PID (process ID) the moment it starts. Every process (except the very first one at boot) is started by some other process, called its parent, whose PID is recorded as the child's PPID (parent process ID). For example, when you run a command in your terminal, your shell (like `bash`) is the parent, and the command you launched is its child. This parent-child relationship forms a tree all the way back to the first process the kernel starts at boot.

```
PID 1 (init, the first process at boot)
  └── PID 842  bash (your login shell)          PPID=1
        ├── PID 1105  htop                       PPID=842
        └── PID 1201  sleep 300                  PPID=842
              (backgrounded with &, still a child of bash)
```

Every box in that tree traces back to PID 1 — this is why `ps aux` output has a PPID column at all, and why closing a parent shell (without `nohup`) tends to take its children down with it.

**Foreground vs background.** A foreground process has control of your terminal — your prompt won't come back until it finishes, and it can read your keyboard input directly. A background process runs without holding onto your terminal, so you get your prompt back immediately and can keep typing other commands while it runs.

**Signals.** A signal is a small, standardized message sent to a process asking it to do something — most commonly, to stop. `SIGTERM` ("terminate") politely asks a process to shut down, giving it a chance to clean up open files or save state before exiting; well-behaved programs honor this. `SIGKILL` is not a request — the kernel terminates the process immediately, with no chance for it to clean up anything. `SIGKILL` is a last resort for processes that ignore `SIGTERM` or are stuck (unresponsive).

**`Ctrl+C` and `Ctrl+Z` from the keyboard.** While a foreground process has your terminal, `Ctrl+C` sends it `SIGINT` (interrupt), which by default also ends the process — this is your everyday "stop this program" keystroke. `Ctrl+Z` is different: it sends `SIGTSTP`, which merely pauses (suspends) the process and hands your prompt back, without ending it — the paused process is still in memory, just not running, until you resume it.

```
  kill <PID>          SIGTERM (15)   "please stop" — process can catch it,
                                      clean up, and exit on its own terms

  kill -9 <PID>        SIGKILL (9)   "you're stopped" — kernel ends it
                                      instantly, no cleanup, can't be caught

  Ctrl+C                SIGINT (2)   "interrupt" — default action ends it,
                                      same idea as SIGTERM but from a keypress

  Ctrl+Z               SIGTSTP (20)  "pause" — process frozen in memory,
                                      resume later with fg/bg, not terminated
```

The escalation path for a stuck process is always: `SIGTERM` first (`kill <PID>`), give it a moment, only reach for `SIGKILL` (`kill -9`) if it truly won't respond.

**Jobs: backgrounding and resuming from your shell.** Your shell keeps track of processes you started from it as numbered "jobs." Appending `&` to a command starts it directly in the background. A process you `Ctrl+Z`-suspended, or backgrounded with `&`, can later be resumed in the foreground or background. This is entirely a convenience your interactive shell provides — it's tracking jobs launched in that shell session.

**Surviving terminal closure with `nohup`.** Normally, when you close your terminal, every process it started (including backgrounded ones) receives a hangup signal and typically dies. `nohup` ("no hangup") runs a command in a way that ignores that signal, so it keeps running even after you log out or close the terminal — useful for a long-running task you want to walk away from.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `ps aux` | Lists running processes system-wide with owner, PID, CPU%, memory%, and command. `a` shows processes for all users, `u` gives the user-oriented detailed columns, `x` includes processes not attached to a terminal. | `ps aux` |
| `top` | Interactive, live-updating table of processes sorted by resource usage; refreshes continuously until you quit. Press `q` to quit. | `top` |
| `htop` | A friendlier, colorized, scrollable version of `top` (installed via apt in module 05); supports mouse clicks and function-key shortcuts for sorting/killing. Press `F10` or `q` to quit. | `htop` |
| `command &` | Runs `command` in the background immediately, returning your prompt right away; prints a job number and PID. | `sleep 300 &` |
| `jobs` | Lists the background/suspended jobs tracked by your current shell session, with job numbers and status (Running/Stopped). | `jobs` |
| `fg %<n>` | Brings job number `n` into the foreground (omit `%n` to use the most recent job). | `fg %1` |
| `bg %<n>` | Resumes a suspended (stopped) job, but keeps it running in the background instead of the foreground. | `bg %1` |
| `Ctrl+C` | Sends `SIGINT` to the foreground process, normally terminating it. | Press while a command is running in your terminal |
| `Ctrl+Z` | Sends `SIGTSTP` to the foreground process, suspending (pausing) it and returning your prompt. | Press while a command is running in your terminal |
| `kill <PID>` | Sends a signal (default `SIGTERM`) to a process by PID, asking it to terminate gracefully. | `kill 4821` |
| `kill -9 <PID>` | Sends `SIGKILL` to a process by PID, forcing immediate termination with no cleanup. `-9` is the numeric signal for `SIGKILL`. | `kill -9 4821` |
| `killall <name>` | Sends a signal (default `SIGTERM`) to every process matching a program name, instead of needing a PID. | `killall sleep` |
| `pgrep <pattern>` | Searches running processes by name/pattern and prints matching PIDs, without killing anything. | `pgrep htop` |
| `pkill <pattern>` | Sends a signal (default `SIGTERM`) to every process whose name matches a pattern, like `pgrep` combined with `kill`. | `pkill -9 sleep` |
| `nohup <command> &` | Runs `command` immune to the hangup signal sent when your terminal closes, so it keeps running after logout; output is redirected to a file named `nohup.out` unless you redirect it elsewhere. | `nohup sleep 600 &` |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Run `ps aux` and look at the output. Find the line for your current shell (look for `bash` or similar in the command column near the end of the line), and note its PID.

2. Run `ps aux | wc -l` (a small pipe preview — it counts lines) to see roughly how many processes are currently running on your system.

3. Launch `htop`. Take a moment to look at the layout: CPU/memory bars at the top, and the scrollable process table below. Try pressing `F6` (or your version's sort key) to sort by different columns, then press `q` to quit back to your prompt.

4. Start a long-running foreground command: `sleep 60`. Notice your prompt does not return — you're stuck waiting. Press `Ctrl+C` to interrupt it early, and confirm your prompt returns immediately with no "60 seconds" wait.

5. Start another `sleep 300`, and this time press `Ctrl+Z` instead of `Ctrl+C`. Your prompt should return, and the shell should print something like `[1]+  Stopped   sleep 300`. Run `jobs` to confirm it's listed as Stopped. Then run `bg %1` to resume it in the background, and `jobs` again to confirm its status changed to Running.

6. Start a background job directly with `&`: `sleep 120 &`. Note the `[job-number] PID` the shell prints. Run `jobs` and separately `ps aux | grep sleep` (previewing a pipe filter) to see the same process from two different views.

7. Bring that background job to the foreground: `fg %1` (adjust the job number to match what `jobs` shows). Once it's in the foreground, press `Ctrl+C` to end it early instead of waiting out the full duration.

8. Find a process by name instead of by PID: start `sleep 400 &`, then run `pgrep sleep` to find its PID without scanning `ps aux` by eye. Kill it gracefully with `kill <PID>` (using the actual PID pgrep printed), and confirm it's gone by running `pgrep sleep` again (it should print nothing).

9. Break something on purpose: run `kill 999999` (a PID that almost certainly doesn't exist on your system). Read the error message carefully — it should say "No such process," which tells you the PID was invalid, distinct from a permissions error. Then start `sleep 500 &`, find its real PID with `pgrep sleep`, and try `kill -0 <PID>` (signal `0` sends nothing but checks whether the process exists and you have permission to signal it) to confirm it's alive before finally killing it properly with `kill <PID>`.

10. Test `nohup`: run `nohup sleep 120 &`. Confirm a file named `nohup.out` appeared in your current directory (`ls`). Then run `pgrep sleep` to confirm it's running, and clean up with `pkill sleep` to stop it (and optionally `rm nohup.out` to tidy up the file it created).

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Start three separate background `sleep` processes with three clearly different durations. Without writing any PID down by hand as you launch them, later find and gracefully terminate only the longest-running one, leaving the other two alive and running. Then prove those two survivors are still there. If you'd like a live view of all three at once while you work, use the `htop` tool you installed back in module 05. Do the whole thing without copying the exact command sequence from the exercises above.

<details>
<summary>Stuck? One hint</summary>

`pgrep` can list the PIDs of processes by name after the fact, and `ps` shows you each one's command (including the sleep duration) so you can pick out the longest; then a plain `kill` on just that one PID asks it to stop gracefully.

</details>

## Common mistakes & troubleshooting

- **Confusing `Ctrl+C` and `Ctrl+Z`:** `Ctrl+C` ends the process; `Ctrl+Z` only pauses it (the process is still alive, just stopped, and will keep occupying resources like open ports until you `fg`/`bg` it or kill it). A "stopped" job left forgotten is a classic source of "why is this port still in use" confusion.
- **Killing the wrong PID:** PIDs are reused over time as processes come and go, so a PID you saw five minutes ago in `ps aux` output may belong to a completely different process now. Always re-check with a fresh `ps aux`, `pgrep`, or `htop` immediately before killing something specific.
- **Reaching for `kill -9` first:** `SIGKILL` gives the process zero chance to clean up (e.g. flush a file it was writing, release a lock). Try plain `kill` (`SIGTERM`) first, and only escalate to `-9` if the process ignores it and won't die.
- **Forgetting a job is only tracked per shell session:** `jobs` only shows jobs started in *that* terminal/shell session — closing the terminal (without `nohup`) or opening a new one means those job numbers are no longer visible or backgrounded there.
- **Expecting `killall`/`pkill` to match exactly what you typed:** these match by process name/pattern, which can unexpectedly hit more processes than intended if the name is generic (e.g. `pkill python` could kill several unrelated Python scripts at once). Double check with `pgrep <pattern>` first to see exactly what would be affected.
- **Not redirecting `nohup` output and being surprised by a `nohup.out` file:** if you don't redirect stdout/stderr yourself, `nohup` writes them into `nohup.out` in your current directory by default, which can pile up if forgotten.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the difference between a process's PID and its PPID?
2. Why does `Ctrl+Z` not actually end a running program, and what state is that program left in?
3. You run `kill 4821` and nothing seems to happen — the process is still running a few seconds later. What signal did you just send, and what would be the next reasonable step?
4. Why is `kill -9` considered a last resort rather than a first choice?
5. What's the practical difference between checking `ps aux` once versus running `top`/`htop`?
6. If you background a long task with `sleep 600 &` and then close your terminal, what generally happens to it, and what command would you have used instead to keep it running?
7. What's the difference between `jobs` and `pgrep`, given that both can tell you about running processes?
8. Why should you re-check a process's PID with a fresh `ps aux` or `pgrep` right before killing it, rather than trusting a PID you saw a few minutes earlier?

<details>
<summary>Show answers</summary>

1. The PID is the process's own unique identifier; the PPID is the PID of the process that started it (its parent). Every process has exactly one PPID but processes can have many children, each with the same PPID pointing back to it.
2. `Ctrl+Z` sends `SIGTSTP`, which merely suspends (pauses) the process rather than terminating it. The program remains loaded in memory in a "Stopped" state and can later be resumed with `fg` or `bg`; it isn't running or making progress while stopped, but it isn't gone either.
3. Plain `kill` sends `SIGTERM` by default, which is only a polite request — a process can ignore it (or be too stuck to respond). The next step is to confirm it's still alive (e.g. `ps aux` or `pgrep`) and, if it truly won't terminate, escalate to `kill -9` (`SIGKILL`) to force it.
4. Because `SIGKILL` terminates a process immediately with no opportunity for it to clean up open files, flush buffered writes, or release locks, which can lead to corrupted data or orphaned resources. It should only be used when a graceful `SIGTERM` request has failed or the process is unresponsive.
5. `ps aux` is a single point-in-time snapshot of processes at the moment you ran it. `top`/`htop` continuously refresh, showing live, moving CPU/memory usage, which is much more useful for spotting a process that's currently spiking resource usage.
6. Without `nohup`, closing the terminal typically sends a hangup signal to processes it started (including backgrounded ones), ending them. Running it as `nohup sleep 600 &` instead makes it immune to that hangup, so it keeps running after the terminal closes.
7. `jobs` lists only the background/suspended processes tracked by your *current shell session*, by job number. `pgrep` searches *all* processes on the system by name/pattern and returns PIDs, regardless of which shell (if any) started them.
8. Because PIDs get reused as processes start and finish over time; a PID you noted earlier may since have been recycled and now belong to an entirely different, unrelated process, so killing it "from memory" risks terminating the wrong thing.

</details>

## Further reading & sources

- [`man7.org`: signal(7)](https://man7.org/linux/man-pages/man7/signal.7.html) - the full list of Unix signals (this module only covers the four you'll use daily) and how processes can catch or ignore them.
- [`man7.org`: ps(1)](https://man7.org/linux/man-pages/man1/ps.1.html) - `ps` has dozens of output formats beyond `aux`; worth a skim once `ps aux` feels routine.
- [htop explained (official site)](https://htop.dev/) - htop's own docs, covering the keyboard shortcuts and columns this module only lightly introduced.
- [`man7.org`: nohup(1)](https://man7.org/linux/man-pages/man1/nohup.1.html) - the nohup reference; also worth knowing `disown` and `setsid` exist as related tools for detaching processes from a shell.

## Next

Continue to [07 - I/O Redirection and Pipes](../07-io-redirection-and-pipes/README.md) to learn how to control where a process's input and output actually go — the foundation for chaining commands together.
