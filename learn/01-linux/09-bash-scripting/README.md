# Bash Scripting

## Why this matters

Every time you find yourself typing the same three commands in a row, that's a script waiting to be written. Bash scripts turn manual, error-prone sequences into repeatable, shareable automation - this is the foundation of DevOps tooling, deployment scripts, and the capstone project later in this track. Once you can write a script with variables, conditionals, and loops, you can automate almost anything you've learned how to do by hand in modules 00-08.

## Concepts

**A script is just a file of commands.** Anything you can type at the prompt, you can put in a file and run as a batch. The first line, `#!/bin/bash`, is called a shebang - it tells the operating system "use the bash program to interpret the rest of this file." Without it, running the file directly may use the wrong interpreter or fail.

**Making a script runnable.** Module 03 taught you that files have permission bits, including "execute." A script needs its execute bit set (`chmod +x script.sh`) before you can run it as `./script.sh`. Without execute permission, you'd have to run it as `bash script.sh` instead.

**Variables hold values.** A bash variable is just a name bound to a piece of text. You assign with `name=value` (no spaces around `=`), and you read it back with `$name` or `${name}`. Variables are untyped - everything is text unless you specifically do arithmetic.

**Quoting changes how the shell reads your text.** Double quotes (`"..."`) let variables and command substitutions expand inside them, but protect spaces from being split into separate arguments. Single quotes (`'...'`) turn off all expansion - what you type is exactly what you get, literally. Backticks (`` `command` ``) or the modern equivalent `$(command)` run a command and substitute its output as text - this is called command substitution.

**Arguments are how scripts take input.** When you run `./script.sh foo bar`, inside the script `$1` is `foo`, `$2` is `bar`, `$#` is the count of arguments (2), and `$@` expands to all arguments. This is how you make a script flexible instead of hardcoded.

**Conditionals let a script make decisions.** `if`, `elif`, and `else` run different commands depending on whether a test succeeds or fails. The test itself is written with `test` or the shorthand `[ ... ]` (or the more modern, more forgiving `[[ ... ]]`). A test's "success" or "failure" is just an exit code - which brings us to `$?`.

**Every command reports an exit code.** After any command runs, the special variable `$?` holds its exit status: `0` means success, anything else means some kind of failure. Scripts use this constantly - both to check whether a previous command worked, and to report their own success or failure to whoever (or whatever) called them.

**Loops repeat work.** A `for` loop iterates over a fixed list of items (numbers, filenames, arguments). A `while` loop keeps running as long as a condition stays true - useful for "keep going until something happens" logic.

**Functions bundle reusable logic.** Just like you don't want to retype a pipeline every time, you don't want to retype the same block of script logic. A bash function groups commands under a name you can call repeatedly, optionally with its own arguments.

**Reading input interactively.** The `read` builtin pauses a script and waits for the user to type something, storing it in a variable - this is how a script can prompt for input rather than only relying on arguments.

**Arithmetic needs special syntax.** Because bash treats everything as text by default, you need `$(( expression ))` (or the `(( expression ))` form for conditions/increments) to do actual numeric math like addition or comparison.

## Command reference

| Command / Syntax | What it does | Example |
|---|---|---|
| `#!/bin/bash` | Shebang line; must be the very first line of a script, tells the OS which interpreter to use. | `#!/bin/bash` at the top of `backup.sh`. |
| `chmod +x script.sh` | Adds execute permission so the script can be run directly. | `chmod +x backup.sh` then `./backup.sh`. |
| `./script.sh` | Runs a script in the current directory (requires execute permission and the `./` prefix since the current directory usually isn't in `PATH`). | `./backup.sh` runs the script. |
| `var=value` | Assigns a value to a variable (no spaces around `=`). | `name="Alice"` sets `name` to Alice. |
| `$var` / `${var}` | Reads a variable's value; braces are useful when the variable name could be ambiguous. | `echo "Hello, $name"` or `echo "Hello, ${name}!"` - braces avoid `$name!` being misread. |
| `"$(command)"` | Command substitution - runs `command` and substitutes its stdout as text. | `today="$(date +%F)"` stores today's date, e.g. `2026-07-24`, in `today`. |
| `$1`, `$2`, ... | Positional arguments passed to the script. | In `./greet.sh Alice`, `$1` is `Alice` inside `greet.sh`. |
| `$#` | Number of arguments passed to the script. | `echo "$#"` after `./greet.sh Alice Bob` prints `2`. |
| `$@` | All arguments, expanded as separate words. | `for arg in "$@"; do echo "$arg"; done` loops over every argument. |
| `$?` | Exit code of the last command (0 = success). | `ls /nope; echo "$?"` prints a non-zero code because `/nope` doesn't exist. |
| `if [ cond ]; then ... fi` | Runs commands only if the test in `[ ]` succeeds (exit code 0). | `if [ -f file.txt ]; then echo "exists"; fi` checks whether `file.txt` exists. |
| `if [[ cond ]]; then ... fi` | Like `[ ]` but with more forgiving syntax and extra features (e.g. pattern matching, `&&`/`||` inside the brackets). | `if [[ "$name" == "Alice" ]]; then echo "hi Alice"; fi`. |
| `-eq -ne -lt -le -gt -ge` | Numeric comparison operators for use inside `[ ]`/`[[ ]]`. | `if [ "$count" -gt 10 ]; then echo "big"; fi` - true if `count` is greater than 10. |
| `= / == / !=` | String comparison (equal/equal/not-equal) inside `[ ]`/`[[ ]]`. | `if [ "$name" = "Alice" ]; then echo "match"; fi`. |
| `-f -d -e` | File test operators: `-f` regular file exists, `-d` directory exists, `-e` anything exists. | `if [ -d /tmp ]; then echo "dir exists"; fi`. |
| `for var in list; do ... done` | Loops over each item in a list, binding it to `var` each time. | `for f in *.txt; do echo "$f"; done` prints each `.txt` filename. |
| `while [ cond ]; do ... done` | Repeats the loop body as long as the condition is true. | `while [ "$n" -lt 5 ]; do echo "$n"; n=$((n+1)); done` counts 0 to 4. |
| `function name() { ... }` / `name() { ... }` | Defines a reusable function. | `greet() { echo "Hello, $1"; }` then call it with `greet Alice`. |
| `read var` | Reads a line of input from the user into `var`. | `read -p "Enter your name: " name` prompts and stores the answer in `name`. |
| `$(( expr ))` | Evaluates an arithmetic expression and returns the result as text. | `total=$((3 + 4))` sets `total` to `7`. |
| `exit N` | Ends the script immediately with exit code `N`. | `exit 1` ends the script and reports failure to whatever called it. |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Create a scripts directory: `mkdir -p ~/scripts && cd ~/scripts`.

2. Create your first script with a text editor or heredoc:
   ```
   cat > hello.sh << 'EOF'
   #!/bin/bash
   echo "Hello, world!"
   EOF
   ```
   Try running it directly: `./hello.sh`. Expect a permission error like `bash: ./hello.sh: Permission denied` - this is expected, since you haven't set the execute bit yet.

3. Fix the permission problem using what you learned in module 03: `chmod +x hello.sh`, then run `./hello.sh` again. Expect it to print `Hello, world!`.

4. Extend the script to use a variable and command substitution:
   ```
   cat > hello.sh << 'EOF'
   #!/bin/bash
   name="World"
   today="$(date +%F)"
   echo "Hello, $name! Today is $today."
   EOF
   ```
   Run `./hello.sh` and confirm today's date appears correctly.

5. Turn it into a script that takes an argument. Rewrite `hello.sh`:
   ```
   cat > hello.sh << 'EOF'
   #!/bin/bash
   name="$1"
   echo "Hello, $name! You passed $# argument(s)."
   EOF
   ```
   Run `./hello.sh Alice` and expect `Hello, Alice! You passed 1 argument(s).`. Then run `./hello.sh` with no arguments and observe that `name` is empty - explain to yourself why (`$1` is empty when nothing was passed).

6. Add a conditional so the script handles the missing-argument case gracefully:
   ```
   cat > hello.sh << 'EOF'
   #!/bin/bash
   if [ -z "$1" ]; then
     echo "Error: no name provided. Usage: ./hello.sh <name>"
     exit 1
   fi
   name="$1"
   echo "Hello, $name!"
   EOF
   ```
   Run `./hello.sh` (no args) and confirm you see the error message. Then run `echo $?` and confirm it prints `1`. Then run `./hello.sh Alice` and confirm `echo $?` prints `0`.

7. Add a loop. Extend the script to greet every argument passed in, not just the first:
   ```
   cat > hello.sh << 'EOF'
   #!/bin/bash
   if [ "$#" -eq 0 ]; then
     echo "Error: no names provided. Usage: ./hello.sh <name1> <name2> ..."
     exit 1
   fi
   for name in "$@"; do
     echo "Hello, $name!"
   done
   EOF
   ```
   Run `./hello.sh Alice Bob Charlie` and expect three greeting lines, one per name.

8. Add a function and simple arithmetic. Create a new script `counter.sh`:
   ```
   cat > counter.sh << 'EOF'
   #!/bin/bash
   count_up() {
     local limit="$1"
     local n=0
     while [ "$n" -lt "$limit" ]; do
       echo "Count: $n"
       n=$((n + 1))
     done
   }
   count_up 5
   EOF
   chmod +x counter.sh
   ./counter.sh
   ```
   Expect it to print `Count: 0` through `Count: 4` (5 lines total).

9. Add interactive input. Extend `hello.sh` (or write a new script `interactive.sh`) that asks for input instead of relying only on arguments:
   ```
   cat > interactive.sh << 'EOF'
   #!/bin/bash
   read -p "Enter your name: " name
   read -p "Enter your age: " age
   if [ "$age" -ge 18 ]; then
     echo "$name, you are an adult."
   else
     echo "$name, you are a minor."
   fi
   EOF
   chmod +x interactive.sh
   ./interactive.sh
   ```
   Run it and answer the prompts with a name and an age. Confirm the adult/minor logic works both ways by running it twice with different ages.

10. Break something on purpose to learn quoting rules. Run this directly at the prompt (not in a script):
    ```
    filename="my file.txt"
    touch $filename
    ls
    ```
    Look closely at the output of `ls` - you'll find two files, `my` and `file.txt`, not one file called `my file.txt`. This happens because the unquoted `$filename` was word-split by spaces. Fix it by cleaning up (`rm "my" "file.txt"`) and re-running with quotes: `touch "$filename"`, then `ls` again to confirm a single file named `my file.txt` now exists. Clean up with `rm "my file.txt"`.

11. Combine everything into one incremental capstone-style script. Create `syscheck.sh` that reports basic system info, using a function, a variable, command substitution, and a conditional:
    ```
    cat > syscheck.sh << 'EOF'
    #!/bin/bash
    check_disk() {
      local usage
      usage="$(df -h / | tail -n 1 | awk '{print $5}' | tr -d '%')"
      if [ "$usage" -ge 80 ]; then
        echo "Warning: disk usage is ${usage}%, running low on space."
      else
        echo "Disk usage OK: ${usage}%."
      fi
    }
    echo "System check for $(hostname) at $(date +%T)"
    check_disk
    EOF
    chmod +x syscheck.sh
    ./syscheck.sh
    ```
    Confirm it prints your hostname, the current time, and a disk usage line. Notice this script reuses `awk` from module 08 inside a bash script - this is exactly how real-world scripts combine tools.

## Common mistakes & troubleshooting

- **Spaces around `=` in assignments.** `name = "Alice"` (with spaces) is *not* a variable assignment in bash - it's interpreted as running a command called `name` with arguments `=` and `Alice`, producing a "command not found" error. Always write `name="Alice"` with no spaces.
- **Forgetting to quote variables.** `$var` without quotes gets word-split and glob-expanded by the shell. Always prefer `"$var"` unless you specifically want that behavior (rare for beginners).
- **Confusing `=` and `==` and `-eq`.** Use `-eq`/`-ne`/`-lt`/`-gt` for numbers and `=`/`==`/`!=` for strings inside `[ ]`/`[[ ]]`. Using `-eq` on strings or `=` on numbers can silently produce wrong results instead of an obvious error.
- **Forgetting the execute bit.** A "Permission denied" error when running `./script.sh` almost always means you forgot `chmod +x script.sh`.
- **Running a script without `./` and getting "command not found."** Bash doesn't search the current directory for commands by default (for security reasons), so you must type `./script.sh`, not just `script.sh`, unless the script's directory is on your `PATH`.
- **Missing `fi`/`done`/`fi` closing keywords.** Bash control structures must be explicitly closed (`if...fi`, `for...done`, `while...done`). A missing closing keyword produces a confusing "unexpected end of file" error - check that every opener has its matching closer.
- **Using backticks and forgetting they nest poorly.** `` `command` `` works but is hard to nest and easy to misread; prefer `$(command)`, which nests cleanly, e.g. `$(echo $(date))`.
- **Comparing an empty variable in `[ ]` without quotes.** `[ $var -eq 5 ]` breaks with a syntax error if `var` is empty, because it becomes `[ -eq 5 ]`. Quoting (`[ "$var" -eq 5 ]`) avoids this, though it still errors if `$var` is genuinely empty or non-numeric - which is often exactly the check you want to add (`-z "$var"`) beforehand.

## Checkpoint quiz

1. What does the shebang line `#!/bin/bash` actually do, and what happens if you omit it?
2. Why does `./script.sh` fail with "Permission denied" the first time you create a script, and what fixes it?
3. What's the difference in behavior between `"$var"` and `$var` (unquoted) when the variable's value contains a space?
4. If a script runs `exit 1` partway through, what would you check afterward to confirm that, and what value would you expect?
5. Why would you use `[ "$count" -gt 10 ]` instead of `[ "$count" > 10 ]` when comparing numbers?
6. What is the difference between a `for` loop and a `while` loop in terms of when each one stops?
7. Why does `local` matter inside a function (as used in the `count_up` and `check_disk` examples)?
8. What does `$(( ))` do that plain variable assignment (`total = 3 + 4`) does not?

<details>
<summary>Show answers</summary>

1. The shebang tells the operating system which interpreter should execute the rest of the file - `#!/bin/bash` means "run this file's contents using the bash program." Without it, running the file via `./script.sh` may use the shell's default interpreter (which might not be bash) or, depending on the system, fail to run predictably; it's best practice to always include it.
2. New files don't have the execute permission bit set by default, so the OS refuses to run them as a program. `chmod +x script.sh` adds the execute bit, after which `./script.sh` works.
3. `"$var"` (quoted) preserves the value as a single unit even if it contains spaces, so it's treated as one argument/word. `$var` (unquoted) gets word-split by the shell on spaces, so a value like "my file.txt" becomes two separate words/arguments.
4. You'd check `$?` immediately after the script finishes (or after the command in question) - it would hold `1`, matching the exit code the script explicitly set with `exit 1`.
5. `-gt` is the numeric "greater than" operator for use inside `[ ]`. The `>` symbol inside `[ ]` is interpreted as shell output redirection, not comparison, which would create/overwrite a file named `10` instead of comparing numbers - a silent, confusing bug.
6. A `for` loop iterates over a fixed, predetermined list of items (arguments, filenames, a range) and stops when the list is exhausted. A `while` loop keeps running as long as its condition evaluates to true each time it's checked, and could loop indefinitely if the condition never becomes false.
7. `local` scopes a variable to the function it's declared in, so it doesn't leak into or collide with variables in the rest of the script (or get overwritten by another function using the same name). Without `local`, function variables are global by default in bash.
8. `$(( ))` evaluates its contents as an arithmetic expression and returns the numeric result as text, e.g. `$((3 + 4))` becomes `7`. Plain assignment like `total = 3 + 4` isn't valid bash arithmetic syntax at all - bash would try to run `total` as a command with arguments `=`, `3`, `+`, `4`, `5`.

</details>

## Next

Continue to [10-networking-basics](../10-networking-basics/README.md) to learn how your Linux machine talks to the network - IP addresses, ports, DNS, and WSL2's own networking quirks.
