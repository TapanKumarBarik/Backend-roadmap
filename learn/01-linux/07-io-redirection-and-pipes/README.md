# I/O Redirection and Pipes

## Why this matters

Nearly every useful Linux command you'll ever run in practice isn't used alone — it's fed input from somewhere, or its output is sent somewhere else, or it's chained together with other commands. Saving command output to a file, silencing noisy error messages, and feeding one command's results into another are everyday tasks for any engineer, and they all rest on the same small set of ideas covered here. This module also sets up exactly what you need to make real use of text-processing tools like `grep`, `sed`, and `awk` in the next module.

## Concepts

**Every process has three standard "streams."** When any program runs, Linux automatically gives it three communication channels, each identified by a small number called a file descriptor: **stdin** (standard input, file descriptor `0`) is where the program reads input from — by default, your keyboard. **stdout** (standard output, file descriptor `1`) is where the program writes its normal output — by default, your terminal screen. **stderr** (standard error, file descriptor `2`) is a *separate* channel for error/diagnostic messages — also shown on your terminal screen by default, but kept distinct from stdout so the two can be handled independently. The reason errors get their own channel: it lets you save a command's real output to a file while still seeing any errors on screen (or vice versa), instead of errors getting mixed into your saved results.

**Redirection changes where a stream goes.** Normally stdout and stderr both land on your screen, and stdin comes from your keyboard. Redirection lets you swap any of these for a file instead, using special symbols in your command line, without the program itself needing to know or care.

**`>` overwrites, `>>` appends.** Redirecting stdout to a file with `>` creates the file if it doesn't exist, or completely replaces its contents if it does. `>>` instead adds new content to the end of an existing file (creating it if needed), preserving whatever was already there. Reaching for `>` when you meant `>>` is one of the most common ways beginners accidentally destroy a file's previous contents.

**`<` feeds a file in as stdin.** Instead of a program waiting for you to type input at the keyboard, `<` tells it to read its input from a file instead, as if the file's contents had been typed in.

**`2>` redirects stderr specifically.** Because stdout and stderr are separate streams (file descriptors `1` and `2`), you can redirect just one of them. `2>` sends only error messages to a file (or to `/dev/null` to discard them), while normal output still goes to your screen as usual.

**`&>` redirects both stdout and stderr together.** Sometimes you want everything a command produces — output and errors — captured in one place. `&>` sends both streams to the same destination in one go, saving you from writing two separate redirections.

**`/dev/null` is a special "nowhere."** It's a real device file every Linux system has that silently discards anything written to it and produces no output if read from. Redirecting a stream to `/dev/null` is the standard way to say "I don't care about this output, throw it away."

**Pipes (`|`) connect two commands directly.** A pipe takes the stdout of the command on its left and feeds it directly into the stdin of the command on its right — no temporary file involved. This lets you chain simple commands into a more powerful one, each doing one small job and passing its results along, which is a core Unix philosophy you'll lean on heavily once `grep`/`sed`/`awk` enter the picture in the next module.

**`tee` splits a stream in two.** Normally, once you pipe or redirect stdout somewhere, you don't see it on screen anymore. `tee` reads from stdin and writes what it received to *both* a file *and* stdout simultaneously, letting you save a command's output while still watching it scroll by live (like a plumbing "T" junction splitting a pipe).

## Command reference

| Command / symbol | What it does | Example |
|---|---|---|
| `command > file` | Redirects stdout to `file`, overwriting the file's existing contents (or creating it). | `echo hello > greeting.txt` writes "hello" into greeting.txt, replacing anything there before |
| `command >> file` | Redirects stdout to `file`, appending after existing contents instead of overwriting. | `echo world >> greeting.txt` adds a new line without erasing "hello" |
| `command < file` | Feeds `file`'s contents to `command` as stdin instead of the keyboard. | `sort < names.txt` sorts the lines found in names.txt |
| `command 2> file` | Redirects only stderr to `file`; normal stdout still prints to the screen. | `ls /nope 2> errors.txt` sends the "No such file or directory" message into errors.txt |
| `command 2>> file` | Redirects stderr to `file`, appending instead of overwriting. | `ls /nope 2>> errors.txt` |
| `command &> file` | Redirects both stdout and stderr together into `file`. | `ls /home /nope &> all_output.txt` |
| `command > /dev/null` | Discards stdout entirely (writes it into the "nowhere" device). | `noisy-command > /dev/null` hides normal output but errors still show |
| `command 2> /dev/null` | Discards stderr entirely, keeping normal stdout visible. | `find / -name "*.conf" 2>/dev/null` hides "Permission denied" clutter while still showing found matches |
| `cmd1 \| cmd2` | Pipes cmd1's stdout directly into cmd2's stdin, without a temporary file. | `ps aux | less` sends the process list into `less` for scrollable viewing |
| `tee file` | Reads stdin and writes it to both `file` and stdout at the same time. | `ps aux | tee processes.txt` shows the process list on screen and also saves it |
| `tee -a file` | Same as `tee`, but appends to `file` instead of overwriting it. | `echo done | tee -a log.txt` |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Run `echo "first line" > notes.txt`, then view it with `cat notes.txt`. You should see exactly one line: `first line`.

2. Run `echo "second line" > notes.txt` again (note: `>`, not `>>`), then `cat notes.txt`. Notice `first line` is gone — `>` overwrote the file completely. This is the mistake this module warns about; you just caused it deliberately so you'll recognize it later.

3. Now use `>>` correctly: run `echo "line A" >> notes.txt`, then `echo "line B" >> notes.txt`, then `cat notes.txt`. You should see both "second line" (from step 2) and the two new lines, all three preserved in order.

4. Practice `<`: run `sort < notes.txt`. It should print the three lines from `notes.txt`, sorted alphabetically, without you typing anything as input — the file supplied stdin instead of the keyboard.

5. Cause a real error on purpose: run `ls /this/path/does/not/exist`. Read the error message on screen (something like "No such file or directory"). Now capture just that error into a file: `ls /this/path/does/not/exist 2> error.log`, then `cat error.log` to confirm the message landed there instead of your screen.

6. Test that stdout and stderr are truly independent: run `ls /home /this/path/does/not/exist`. Notice one part of the output (the real `/home` listing) prints normally while the error prints too — both to your screen by default. Now run `ls /home /this/path/does/not/exist 2> /dev/null` and confirm only the `/home` listing shows, with the error silently discarded.

7. Capture everything at once: run `ls /home /this/path/does/not/exist &> combined.txt`, then `cat combined.txt`. Confirm both the directory listing and the error message ended up in the same file.

8. Practice a pipe: run `ps aux | less`. Scroll down with the arrow keys or spacebar to see more processes than fit on one screen, then press `q` to exit `less` and return to your prompt. This is the pipe from module 06's process list feeding straight into a scrollable viewer.

9. Practice `tee`: run `ps aux | tee processes.txt | less`. Notice you still get the scrollable `less` view (the pipe continues past `tee`), and after quitting `less`, run `cat processes.txt` to confirm the same content was also saved to a file — `tee` split the stream in two without you losing either copy.

10. Break something on purpose, more subtly: run `sort < notes.txt < /this/path/does/not/exist` (redirecting stdin from a file that doesn't exist). Read the error message carefully — it should complain about that missing file specifically, not about `sort` itself, teaching you that redirection errors point at the file/path, not necessarily the command. Then clean up all the practice files from this module: `rm notes.txt error.log combined.txt processes.txt`.

## Common mistakes & troubleshooting

- **Using `>` when you meant `>>`:** `>` silently destroys the file's previous contents with no warning or confirmation. If you only ever meant to add a line to an existing log or notes file, this is a frequent and painful mistake — when in doubt, use `>>`, or check with `cat` first.
- **Expecting `2> /dev/null` to also hide normal output:** it only discards stderr; if a command's actual problem output was on stdout (not stderr) for some reason, it will still show. Mixing up which stream something goes to is the usual cause of "I redirected it but it still shows up."
- **Redirecting before the command finishes writing, causing a race with `>>` and multiple processes:** generally not a beginner concern day-to-day, but worth knowing that piping/redirecting assumes one command finishes producing before/while the next consumes — it's not magic file locking.
- **Forgetting redirection happens before the command runs, not "live":** `command > file 2>&1` order matters (this exact combined form is a slightly more advanced variant of `&>` you may see in other tutorials) — but for this module's `&>`, just know it captures both streams together in one step, which is simpler and sufficient for now.
- **Piping a command that doesn't produce the output you expect:** if `cmd1 | cmd2` looks like it did nothing, check that `cmd1` actually printed something on its own first (run it alone) before assuming the pipe itself is broken.
- **Confusing `tee` with plain redirection:** `command > file` shows nothing on screen (all output goes to the file); `command | tee file` shows the output on screen *and* saves it. Reaching for `>` when you actually wanted to watch the output live and keep a copy is a common mix-up.
- **Trying to redirect into a file you're currently reading from (e.g. `sort < notes.txt > notes.txt`):** this can truncate the file to empty before `sort` gets to read it, because the shell opens the output file (truncating it) before running the command. Never redirect a command's output back into the same file it's reading input from.

## Checkpoint quiz

1. What are the three standard streams every process gets, and what file descriptor number is each identified by?
2. Why does stderr exist as a separate stream instead of errors just being mixed into stdout?
3. You run `echo "important note" > log.txt` a second time by habit, expecting it to add a line, and now your previous notes are gone. What happened, and which symbol should you have used?
4. What's the difference between `command 2> file` and `command &> file`?
5. What does redirecting to `/dev/null` actually accomplish, and when would you want to do that to stderr specifically rather than stdout?
6. How does a pipe (`|`) differ from simply redirecting stdout to a file with `>` and then having the next command read that file with `<`?
7. Why might `ps aux | tee results.txt | less` be more useful than `ps aux > results.txt` followed by `less results.txt`?
8. Why is it risky to run `sort < data.txt > data.txt`, and what would be a safer way to sort a file "in place"?

<details>
<summary>Show answers</summary>

1. stdin (file descriptor 0, input the program reads), stdout (file descriptor 1, normal output), and stderr (file descriptor 2, error/diagnostic output).
2. Keeping stderr separate lets you redirect or discard normal output and error output independently — for example, saving real results to a file while still seeing errors on screen, or vice versa, instead of both being permanently tangled together in one stream.
3. `>` overwrites the target file's entire contents every time it's used, so the second `echo ... > log.txt` erased whatever was there from the first run. `>>` should have been used to append instead.
4. `2> file` redirects only stderr into `file`, leaving stdout to print to the screen as usual. `&> file` redirects both stdout and stderr together into the same file, capturing everything the command produces.
5. Redirecting to `/dev/null` discards that stream entirely, producing no file and no output — it's the standard way to silence output you don't care about. Redirecting stderr there specifically (`2> /dev/null`) is useful when a command's real results (stdout) still matter but its error/warning noise (e.g. "Permission denied" spam) doesn't.
6. A pipe connects two commands directly in memory — cmd1's stdout feeds straight into cmd2's stdin with no intermediate file created, and both commands can run essentially concurrently. Redirecting to a file and then reading it back requires an actual file on disk as a middleman and two separate steps.
7. `tee` lets you watch the output scroll by live in `less` while simultaneously saving a full copy to `results.txt` in one step. The `>` plus separate `less` approach also saves the file, but only lets you view it afterward via `less`, not live as it's produced (and needs two separate commands).
8. The shell opens (and truncates) `data.txt` for output before `sort` gets a chance to actually read its original contents as input, so the file can end up empty. A safer approach is to sort into a different temporary file (`sort data.txt > sorted_data.txt`) and then rename it over the original if desired, or use a tool specifically designed for in-place editing.

</details>

## Next

This completes the Linux fundamentals track. Continue on to the Docker track to start applying these skills to containers.
