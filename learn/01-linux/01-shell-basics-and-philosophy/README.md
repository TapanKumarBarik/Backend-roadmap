# Shell Basics and Unix Philosophy

## Why this matters
Every interaction you'll have with Docker, Kubernetes, and cloud servers eventually comes down to typing commands into a shell - there's no GUI installer for most of it. Understanding what the shell actually is, how a command is structured, and the design philosophy behind Linux tools will make every future command you learn easier to guess, remember, and combine, instead of feeling like magic incantations.

## Concepts

**What is a terminal?** A terminal (or "terminal emulator") is the window on your screen - like the Ubuntu window or a Windows Terminal tab - where you type text and see text come back. Historically, "terminal" referred to a physical device (a screen and keyboard connected to a big computer). Today it's just a program that emulates that experience.

**What is a shell?** The shell is the program running *inside* the terminal that actually reads what you type, interprets it as a command, runs it, and shows you the result. Ubuntu's default shell is called **bash** (Bourne Again SHell). The terminal is the window; the shell is the interpreter living inside it. You could open different terminal apps, but they'd all be running the same bash shell underneath, since that's what Ubuntu ships with by default.

**What is a TTY?** TTY stands for "teletypewriter" - an old term from physical hardware terminals. In modern Linux, "TTY" just refers to the text input/output session your shell is attached to. You don't need to manage this directly as a beginner - just know that when people say "open a TTY" or "your TTY," they mean your terminal session.

**The prompt.** When you open Ubuntu, you see something like:
```
yourusername@yourcomputername:~$
```
This is called the **prompt** - it's the shell telling you it's ready for input. Breaking it down:
- `yourusername` - the Linux user you're logged in as (what `whoami` prints).
- `@yourcomputername` - the name of the machine.
- `:~` - your current location (directory). The `~` (tilde) is shorthand for your home directory. Module 02 covers this in depth.
- `$` - indicates you're a regular user. (If you ever see `#` instead, it means you're operating as the root/superuser - a much more powerful and dangerous mode, worth noticing immediately.)

**Command structure.** Nearly every Linux command follows the same shape:
```
command [flags/options] [arguments]
```
- The **command** is the name of the program to run, e.g. `echo`.
- **Flags** (also called options or switches) change *how* the command behaves. They usually start with `-` (single-letter, like `-a`) or `--` (full word, like `--all`). Multiple single-letter flags can often be combined, e.g. `-la` instead of `-l -a`.
- **Arguments** are the things the command acts *on* - like a word to print, or a filename.

For example, in `echo -n hello`, `echo` is the command, `-n` is a flag (meaning "don't print a trailing newline"), and `hello` is the argument.

**The Unix philosophy.** Linux tools were designed around a few core ideas that still shape how you use the terminal today:
- **Do one thing well.** Each command tends to have a single, narrow job (e.g. `echo` just prints text; it doesn't also search files or manage processes).
- **Everything is text.** Programs communicate by reading and writing plain text, which means any tool's output can become another tool's input.
- **Compose small tools together.** Rather than one giant program with every feature, you combine small, focused programs to accomplish bigger tasks. You'll see this later with the pipe symbol (`|`), which sends one command's output into another command as input - you don't need to use it yet, just know the idea exists.
- **Everything is a file.** In Linux, not just documents but devices, settings, and even some running process information are represented and accessed as files. This is why file-related skills (coming in modules 02-03) generalize so widely across the system.

**Getting help without leaving the terminal.** You will constantly forget exact flag names - that's normal, even for experienced engineers. Linux gives you two built-in ways to check:
- `command --help` prints a short summary of what a command does and its available flags, directly in your terminal.
- `man command` opens the full "manual page" - a more detailed, structured reference document. You navigate it with arrow keys or Page Up/Down, and press `q` to quit back to your prompt.

**Tab completion.** While typing a command or a filename, pressing the Tab key will try to auto-complete it for you. If there's only one possible match, it completes instantly. If there are several possible matches, pressing Tab twice will list them. This saves typing and helps avoid typos.

**Command history.** The shell remembers commands you've previously run. Pressing the Up arrow cycles backward through your recent commands (Down arrow goes forward again), letting you reuse or tweak a previous command instead of retyping it from scratch.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `pwd` | Prints the full path of your current directory ("print working directory"). | `pwd` |
| `whoami` | Prints the username of the currently logged-in user. | `whoami` |
| `echo` | Prints (repeats back) text to the screen. Useful for testing, displaying variable values, or generating simple text output. | `echo hello world` |
| `echo -n` | The `-n` flag tells `echo` to skip printing the trailing newline character after the text, so the next prompt appears right after the text instead of on a new line. | `echo -n "no newline after this"` |
| `clear` | Clears all visible text from the terminal window, giving you a fresh, empty screen. Your command history is untouched - only the visual clutter is removed. | `clear` |
| `history` | Lists the numbered commands you've previously run in this shell. | `history` |
| `date` | Prints the current system date and time. | `date` |
| `man` | Opens the full manual page for a command. Press `q` to exit back to the prompt, arrow keys or Page Up/Down to scroll. | `man echo` |
| `--help` | A flag supported by most commands that prints a brief usage summary instead of opening the full manual. | `echo --help` |

## Hands-on exercises

1. **Open your Ubuntu terminal** (using any of the three methods from module 00). Look closely at your prompt. Run:
   ```
   whoami
   ```
   Compare the output to the username shown in your prompt before the `@` symbol - they should match.

2. **Print your current location.** Run:
   ```
   pwd
   ```
   Compare the output to what appears after the `:` in your prompt (with `~` representing your home directory shorthand).

3. **Use `echo` to print a message.** Run:
   ```
   echo Hello, Linux!
   ```
   Expected output: `Hello, Linux!` printed back exactly.

4. **Try `echo` with a flag.** Run:
   ```
   echo -n "No newline here"
   ```
   Notice that after it runs, your next prompt appears immediately after the text on the same line, instead of on a fresh line like normal `echo` output does. This demonstrates a flag changing a command's behavior.

5. **Check today's date and time.** Run:
   ```
   date
   ```
   Expected output: the current day, date, time, and timezone.

6. **Practice tab completion.** Type `ech` (just those three letters, don't press Enter) and then press the Tab key. It should auto-complete to `echo`. Then finish the command by typing ` tab completion works` and press Enter.

7. **Build up command history.** Run each of these one at a time, pressing Enter after each: `pwd`, `whoami`, `date`, `echo test`. Then run:
   ```
   history
   ```
   Expected output: a numbered list showing the commands you just ran, most recent at the bottom.

8. **Reuse a previous command with the Up arrow.** Press the Up arrow key several times and watch your previous commands reappear one by one at your prompt without you retyping them. Press Down arrow to move forward again. Pick one, press Enter to rerun it.

9. **Look up a command's manual page.** Run:
   ```
   man date
   ```
   Scroll down a little using the Down arrow or Page Down, then press `q` to quit back to your normal prompt. Note the structured sections like NAME, SYNOPSIS, and DESCRIPTION.

10. **Compare `--help` to `man`.** Run:
    ```
    date --help
    ```
    Notice this is much shorter and more terse than the `man` page - a quick cheat-sheet rather than a full manual.

11. **Intentionally trigger an error and read it.** Run a made-up flag that doesn't exist:
    ```
    echo --bogusflag hello
    ```
    Note what happens: with `echo`, unrecognized things starting with `-` are often just printed literally rather than causing a hard error, since `echo` is very permissive. Now try a stricter command:
    ```
    date --bogusflag
    ```
    Expected output: an error like `date: unrecognized option '--bogusflag'` followed by a usage hint. Read the error message and notice how it names the exact problem (an option it doesn't recognize) - this is the pattern you'll use to debug commands throughout this curriculum.

12. **Clear your screen.** Run:
    ```
    clear
    ```
    Confirm the screen is now empty except for a fresh prompt. Then run `history` again to confirm your past commands are still remembered even though the screen was cleared.

## Common mistakes & troubleshooting

- **Confusing the terminal app with the shell**: Closing a Windows Terminal tab doesn't "reset" Linux - the shell (bash) and your files persist independently of which terminal app you used to view them.
- **Typing flags with the wrong dash style**: `-help` (single dash) is not the same as `--help` (double dash). Single dashes are for short, one-letter flags (possibly combined, like `-la`); double dashes are for full-word flags. Using the wrong style often produces a confusing error or unexpected behavior.
- **Forgetting to press `q` to exit `man` pages**: Beginners often think the terminal has frozen after running `man something`. It hasn't - you're inside the pager program `less`, viewing the manual. Press `q` to return to your prompt.
- **Assuming `clear` deletes history**: It only clears the visible screen. Your command history (viewable with `history`) is unaffected.
- **Not reading the actual error message**: Errors like `command not found` or `unrecognized option` are specific and literal - they tell you exactly what went wrong (a typo, a bad flag) if you read them carefully instead of just reacting to "it broke."
- **Expecting Tab to always complete instantly**: If there are multiple possible completions, one Tab press does nothing visible - press Tab a second time to see the list of options.

## Checkpoint quiz

1. What is the difference between a terminal and a shell?
2. In the command `echo -n hello`, identify the command, the flag, and the argument.
3. What does the `$` at the end of your prompt tell you, and what would a `#` instead mean?
4. Why does the Unix philosophy favor many small tools over one large program?
5. If you forget a command's exact flags, name two built-in ways to look them up, and describe how they differ.
6. Does pressing `clear` delete your command history? How would you check?
7. What does "everything is text" mean in the context of Unix, and why does it matter for combining tools?
8. You ran `date --bogusflag` and got an error. What does that error message tell you, and what would you change to fix it?

<details>
<summary>Show answers</summary>

1. The terminal is the window/app you see and type into; the shell (like bash) is the program running inside it that actually interprets and executes your commands. Different terminal apps can host the same underlying shell.
2. `echo` is the command, `-n` is the flag (suppresses the trailing newline), and `hello` is the argument (the text to print).
3. `$` indicates you're operating as a regular, non-privileged user. A `#` would indicate you're operating as the root/superuser, which has full unrestricted access to the system - something to be extra careful with.
4. Small, focused tools are easier to understand, test, and reuse. They can be combined in countless ways to solve new problems (later via pipes), rather than needing every possible feature bundled into one monolithic program.
5. `command --help` gives a quick, terse summary of usage and flags right in the terminal. `man command` opens a longer, more detailed reference document with structured sections, navigated with arrows/Page Up-Down and exited with `q`.
6. No, `clear` only wipes the visible terminal screen. You can confirm your history is intact by running `history` right after clearing.
7. It means programs read and write plain, human-readable text rather than proprietary binary formats. This matters because it lets any tool's text output be understood and reused as another tool's input, enabling composability.
8. The error tells you `--bogusflag` is not a recognized option for the `date` command - it's a literal, specific complaint about an unknown flag, not a vague failure. To fix it, remove the invalid flag or replace it with an actual valid one (checkable via `date --help` or `man date`).

</details>

## Next
Continue to [02-filesystem-navigation](../02-filesystem-navigation/README.md) to learn how Linux organizes files and directories, and how to move around and manage them from the command line.
