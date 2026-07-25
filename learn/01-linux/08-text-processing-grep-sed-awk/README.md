# Text Processing: grep, sed, awk, and Friends

## Why this matters

Real servers produce mountains of text: logs, config files, CSV exports, command output. You will not open these in a GUI editor — you will slice them at the command line. `grep`, `sed`, and `awk` are the difference between "I read through 50,000 lines by eye" and "I found the 3 lines I needed in half a second." Combined with pipes (module 07), these tools let you build custom filters on the fly without writing a program.

## Concepts

**Pattern matching with grep.** `grep` searches text for lines matching a pattern and prints those lines. The simplest use is a literal word search, but `grep` also understands regular expressions (regex) - patterns that describe *shapes* of text, not just exact words. For example, the regex `^Error` means "a line starting with the word Error," and `[0-9]+` means "one or more digits."

**Streams, not files, in your head.** Just like module 07 taught you that a pipe connects stdout of one command to stdin of the next, think of `grep`, `sed`, and `awk` as filters sitting in the middle of a pipeline: text flows in one end, transformed or filtered text flows out the other.

**Substitution with sed.** `sed` (stream editor) reads text line by line and applies edit commands to it, most commonly "find this pattern, replace with that text" using the `s/pattern/replacement/` syntax. Think of it as "find and replace," but scriptable and usable in a pipeline or against a file.

**Fields and columns with awk.** Many text files are organized into columns - fields separated by whitespace, commas, or some other delimiter (think of a log line: timestamp, log level, message). `awk` treats each line as a row split into fields you can refer to as `$1`, `$2`, and so on, with `$0` meaning the whole line and `NF` meaning "number of fields." This makes awk excellent for pulling out "just the 3rd column" or "lines where the 5th column is greater than 100."

**Sorting and deduplicating.** `sort` and `uniq` are simple but critical companions: `sort` orders lines (alphabetically or numerically), and `uniq` collapses adjacent duplicate lines, optionally counting how many times each appeared. Because `uniq` only collapses *adjacent* duplicates, you almost always `sort` first.

**Counting and previewing.** `wc` (word count) counts lines, words, or characters. `head` and `tail` show you the beginning or end of a file without dumping the whole thing - useful for huge logs. `tail -f` specifically "follows" a file, printing new lines as they are appended, which is exactly how you watch a live log.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `grep pattern file` | Prints lines in `file` matching `pattern`. | `grep "ERROR" app.log` - prints every line containing the literal text ERROR. |
| `grep -i pattern file` | Case-insensitive match. | `grep -i "error" app.log` - matches ERROR, error, Error, etc. |
| `grep -v pattern file` | Inverts the match - prints lines that do NOT match. | `grep -v "DEBUG" app.log` - shows every line except DEBUG lines. |
| `grep -r pattern dir` | Recursively searches all files under a directory. | `grep -r "TODO" ~/project` - finds the word TODO in every file under `~/project`. |
| `grep -n pattern file` | Shows the line number of each match. | `grep -n "ERROR" app.log` - prefixes matches with their line number, e.g. `42:ERROR ...`. |
| `grep -c pattern file` | Counts matching lines instead of printing them. | `grep -c "ERROR" app.log` - prints a single number: how many lines matched. |
| `grep -E pattern file` | Enables extended regex (so `+`, `?`, `\|`, `{}` work without backslashes). | `grep -E "ERROR\|WARN" app.log` - matches lines containing ERROR or WARN. |
| `sed 's/old/new/' file` | Replaces the first occurrence of `old` with `new` on each line, printing the result (file unchanged). | `sed 's/ERROR/FAIL/' app.log` - shows the file with the first ERROR per line changed to FAIL. |
| `sed 's/old/new/g' file` | Same, but replaces every occurrence per line (`g` = global). | `sed 's/:/,/g' data.txt` - turns every colon into a comma. |
| `sed -i 's/old/new/g' file` | Edits the file in place (overwrites it) instead of just printing. | `sed -i 's/foo/bar/g' config.txt` - permanently changes foo to bar inside config.txt. Use with care - there's no undo. |
| `sed '2d' file` | Deletes line 2 from the output. | `sed '2d' notes.txt` - prints the file with line 2 removed. |
| `sed -n '3p' file` | Suppresses default output (`-n`) and only prints line 3 (`p`). | `sed -n '3p' notes.txt` - prints only the 3rd line. |
| `awk '{print $1}' file` | Prints the first whitespace-separated field of each line. | `awk '{print $1}' app.log` - prints just the first column, e.g. the timestamp. |
| `awk -F: '{print $1}' file` | Sets the field separator to `:` instead of whitespace. | `awk -F: '{print $1}' /etc/passwd` - prints the username field from each colon-separated line. |
| `awk '{print $2, $NF}' file` | Prints the 2nd field and the last field (`NF` = number of fields). | `awk '{print $2, $NF}' app.log` - prints the log level and the last word of each line. |
| `awk '$3 > 100'` | Prints lines where field 3 is numerically greater than 100 (a filter, no explicit print block needed). | `awk '$3 > 100' data.txt` - prints only rows whose 3rd column exceeds 100. |
| `cut -d, -f1` | Extracts field 1 using `,` as the delimiter (`-d`). | `cut -d, -f1 data.csv` - prints just the first comma-separated column. |
| `cut -f2,3` | Extracts fields 2 and 3 (default delimiter is tab). | `cut -f2,3 data.tsv` - prints columns 2 and 3. |
| `sort file` | Sorts lines alphabetically. | `sort names.txt` - prints names in alphabetical order. |
| `sort -n file` | Sorts numerically instead of alphabetically (so 9 comes before 10). | `sort -n counts.txt` - sorts by numeric value, not by first digit. |
| `sort -r file` | Reverses the sort order. | `sort -rn counts.txt` - numeric sort, largest first. |
| `sort -k2 file` | Sorts using field 2 as the key. | `sort -k2 -n data.txt` - sorts numerically by the 2nd whitespace-separated field. |
| `uniq file` | Collapses adjacent duplicate lines into one. | `sort names.txt \| uniq` - sort first so duplicates become adjacent, then collapse them. |
| `uniq -c file` | Same, but prefixes each line with a count of how many times it appeared. | `sort names.txt \| uniq -c` - shows how many times each name occurs. |
| `wc file` | Prints line, word, and byte counts. | `wc app.log` - prints something like `120 800 45231 app.log`. |
| `wc -l file` | Counts lines only. | `wc -l app.log` - prints just the number of lines. |
| `wc -w file` | Counts words only. | `wc -w app.log` - prints just the number of words. |
| `wc -c file` | Counts bytes only. | `wc -c app.log` - prints just the byte count. |
| `head -n N file` | Prints the first N lines. | `head -n 5 app.log` - prints the first 5 lines. |
| `tail -n N file` | Prints the last N lines. | `tail -n 5 app.log` - prints the last 5 lines. |
| `tail -f file` | Follows the file, printing new lines as they're appended (until you Ctrl+C). | `tail -f app.log` - watch a log in real time as new entries are written to it. |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Create a working directory and move into it:
   ```
   mkdir -p ~/textprocessing && cd ~/textprocessing
   ```

2. Create a sample log file using a heredoc:
   ```
   cat > app.log << 'EOF'
   2024-01-10 08:01:12 INFO Starting service on port 8080
   2024-01-10 08:01:15 INFO Connected to database
   2024-01-10 08:02:03 WARN Slow query took 1200ms
   2024-01-10 08:03:44 ERROR Failed to connect to cache
   2024-01-10 08:03:45 ERROR Retrying cache connection
   2024-01-10 08:03:50 INFO Cache connection restored
   2024-01-10 08:10:00 DEBUG Health check passed
   2024-01-10 08:15:22 WARN Disk usage at 85 percent
   2024-01-10 08:20:01 ERROR Disk usage at 95 percent
   2024-01-10 08:25:00 INFO Backup completed successfully
   EOF
   ```
   Run `cat app.log` and confirm you see all 10 lines.

3. Find every ERROR line: `grep "ERROR" app.log`. Expect 3 lines to print. Now try `grep -c "ERROR" app.log` and confirm it prints `3`.

4. Find every WARN or ERROR line in one command using extended regex: `grep -E "WARN|ERROR" app.log`. Expect 5 lines.

5. Print every line except INFO lines, with line numbers, using `grep -vn "INFO" app.log`. Confirm the line numbers match the original file (count them against `cat -n app.log`).

6. Use awk to print just the log level (4th field) and message (5th field onward is trickier - for now just print field 4) for every line: `awk '{print $4}' app.log`. You should see INFO, INFO, WARN, ERROR, ERROR, INFO, DEBUG, WARN, ERROR, INFO.

7. Count how many lines exist per log level. Pipe awk's field-4 output into `sort` and `uniq -c`:
   ```
   awk '{print $4}' app.log | sort | uniq -c
   ```
   Expect output showing counts like `3 ERROR`, `4 INFO`, `1 DEBUG`, `2 WARN` (order may vary; `uniq -c` counts adjacent duplicates, which is why `sort` runs first).

8. Use `sed` to replace WARN with WARNING everywhere, but only in the terminal output (not the file): `sed 's/WARN/WARNING/g' app.log`. Confirm the file itself is unchanged afterward with `grep WARN app.log` (should still say WARN).

9. Now make the change permanent with `sed -i 's/WARN/WARNING/g' app.log`, then confirm with `grep WARNING app.log`. This is a one-way change - `sed -i` overwrites the file directly.

10. Deliberately break something to learn to read errors: run `sed -i 's/WARN/WARNING/' app.log2` (note the typo - `app.log2` does not exist). Read the error message carefully (it will say something like "No such file or directory"). This is the same class of error you saw with `cat` or `cd` on nonexistent paths in earlier modules - `sed` behaves the same way.

11. Use `cut` to pull out just the date column from the log: `cut -d' ' -f1 app.log`. Note this only works cleanly because fields are space-separated with no extra spaces - discuss with yourself why `cut` is more fragile than `awk` for irregular spacing.

12. Combine several tools in one pipeline: find all ERROR lines, extract the time field, and sort them: `grep ERROR app.log | awk '{print $2}' | sort`. Confirm you get 3 sorted timestamps.

13. Use `tail -f` to watch the log live. In one terminal run `tail -f app.log`. In a second WSL2 terminal (open a new tab/window), run `echo "2024-01-10 09:00:00 INFO New line appended live" >> ~/textprocessing/app.log` and watch the first terminal update instantly. Press Ctrl+C in the first terminal to stop following.

## Common mistakes & troubleshooting

- **Forgetting `sed -i` writes are permanent.** Without `-i`, `sed` only prints the transformed text to your terminal; the file is untouched. With `-i`, there's no confirmation and no undo - test your `s///` pattern without `-i` first.
- **Quoting single vs. double quotes with special characters.** If your `sed` or `awk` pattern contains `$` or `` ` ``, double quotes can cause the shell to try to expand them before the command even runs. Prefer single quotes around `sed`/`awk` scripts unless you specifically need shell variable expansion inside them.
- **Forgetting `uniq` needs sorted input.** `uniq` only removes *adjacent* duplicates. Running `uniq` on an unsorted file silently fails to deduplicate non-adjacent repeats - always `sort | uniq`.
- **Using basic regex features in `grep` without `-E`.** Characters like `+`, `?`, and `|` are literal characters in basic grep, not special regex metacharacters, unless you escape them (`\+`) or pass `-E`. If your pattern with `|` "matches nothing" or matches the literal pipe character, this is why.
- **Off-by-one confusion with awk fields.** `$0` is the whole line, `$1` is the first field - there is no field zero for "first column." Also, `NF` is a count, not a field reference - `$NF` (with the dollar sign) is the last field.
- **Assuming `cut` handles multiple spaces well.** `cut -d' '` treats each single space as a separator, so double spaces create empty fields and throw off your column numbers. `awk`, by contrast, treats runs of whitespace as one separator by default - prefer awk for irregularly spaced text.
- **Piping into `grep` and expecting file-only behavior.** `grep pattern` with no file argument reads from stdin - this is intentional and lets you filter pipeline output, but beginners sometimes think it hung (it's actually waiting on stdin) if run with no pipe and no file.

## Checkpoint quiz

1. Why does `uniq` fail to collapse duplicate lines that appear in an unsorted file, and how do you fix it?
2. What is the difference between running `sed 's/a/b/'` on a file versus `sed -i 's/a/b/'` on the same file?
3. In `awk '{print $2, $NF}'`, what does `$NF` refer to, and why is it different from `$2`?
4. Why would `grep -E "ERROR|WARN"` behave differently from `grep "ERROR|WARN"` (without `-E`)?
5. You want to count how many times each unique username appears in a file of one username per line. Write the pipeline.
6. What is the practical difference between `head -n 5 file` and `tail -f file`?
7. Why is `cut -d' '` risky on text with inconsistent spacing, and what tool handles that better?
8. If `grep -v "DEBUG" app.log` prints nothing at all, what would that tell you about the file's contents?

<details>
<summary>Show answers</summary>

1. `uniq` only compares each line to the line immediately before it, so duplicates scattered non-adjacently are missed. Fix: sort the file first, e.g. `sort file | uniq`, so identical lines become adjacent.
2. Without `-i`, `sed` prints the transformed output to the terminal and leaves the file unchanged. With `-i`, `sed` overwrites the file in place with the transformed content, permanently.
3. `NF` holds the total number of fields on the current line, and `$NF` uses that count to reference the *last* field - so it dynamically points to whatever the final column is, unlike `$2` which always points to the fixed second field.
4. Without `-E`, `grep` uses basic regular expressions where `|` is a literal pipe character, so the pattern matches lines containing a literal "ERROR|WARN" string (unlikely to occur) rather than "ERROR" or "WARN" as alternatives. `-E` (extended regex) makes `|` mean logical OR.
5. `sort usernames.txt | uniq -c` (sort first so duplicates are adjacent, then count them).
6. `head -n 5 file` shows the first 5 lines once and exits. `tail -f file` shows the end of the file and then keeps running, printing new lines as they're appended - used for watching live logs.
7. Multiple consecutive spaces each count as a separate delimiter to `cut`, so extra spaces shift or blank out field numbers unpredictably. `awk` treats consecutive whitespace as a single separator by default, making it more robust for inconsistent spacing.
8. It would mean every line in the file contains the string "DEBUG" - since `-v` inverts the match and prints only non-matching lines, an empty result means no lines failed to match.

</details>

## Next

Continue to [09-bash-scripting](../09-bash-scripting/README.md) to learn how to combine these commands into reusable, automated scripts.
