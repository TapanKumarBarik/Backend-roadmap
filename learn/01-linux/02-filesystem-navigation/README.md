# Filesystem Navigation

## Why this matters
Docker images, Kubernetes pods, and every Linux server you'll ever touch organize their contents in the same directory structure you're about to learn - configuration in `/etc`, logs in `/var`, temporary files in `/tmp`. Being fluent at moving around, creating, copying, and deleting files from the command line is the single most-used skill in this entire curriculum; you'll do it dozens of times per day going forward.

## Concepts

**The filesystem is one big tree.** Unlike Windows, which has separate drive letters like `C:\` and `D:\`, Linux has a single unified tree of directories starting from one root, written as `/`. Every file and folder on the system, no matter what physical disk it lives on, appears somewhere under `/`.

**Key top-level directories** (you don't need to memorize all of these today, but recognizing them helps you understand any Linux system you encounter):
- `/` - the root of the entire filesystem; everything else is nested inside it.
- `/home` - contains a personal folder for each user, e.g. `/home/yourusername`. This is your own space to create and organize files.
- `/etc` - system-wide configuration files (short for "et cetera," historically, though people now often read it as "editable text configuration").
- `/var` - "variable" data that changes while the system runs, like logs (`/var/log`).
- `/tmp` - temporary files; anything here may be deleted automatically on reboot, so never store anything important there.
- `/usr` - most installed user programs and their supporting files live under here (not to be confused with `/home` - despite the name, `/usr` historically stood for "Unix System Resources," not "user").

**Absolute vs. relative paths.** A path is just an address for a file or folder.
- An **absolute path** always starts with `/` and describes the full route from the root, no matter where you currently are, e.g. `/home/yourusername/notes.txt`.
- A **relative path** describes a location starting from wherever you currently are, e.g. `notes.txt` (a file right here) or `subfolder/notes.txt` (a file inside a folder right here). Relative paths don't start with `/`.
- Two special shorthand names are used inside relative paths: `.` means "this current directory," and `..` means "one directory up (the parent)." So `cd ..` moves you up one level, and `./script.sh` refers to a file named `script.sh` right where you are.
- `~` is shorthand for your home directory (e.g. `/home/yourusername`), usable in either absolute-feeling or relative-feeling contexts - `cd ~` always takes you home from anywhere.

**Wildcards / globbing.** The shell can match multiple filenames at once using special characters, expanded by the shell itself before the command even runs:
- `*` matches any number of characters (including none). `*.txt` matches every file ending in `.txt`.
- `?` matches exactly one character. `file?.txt` matches `file1.txt` but not `file10.txt`.
- This expansion is called "globbing," and it works with essentially any command that takes filenames as arguments (`ls`, `cp`, `rm`, etc.).

## Command reference

| Command | What it does | Example |
|---|---|---|
| `pwd` | Prints your current directory as an absolute path. | `pwd` |
| `cd` | Changes your current directory ("change directory"). Used alone, `cd` with no argument takes you to your home directory. | `cd /home/yourusername/projects` |
| `cd ..` | Moves up one directory level (to the parent of where you currently are). | `cd ..` |
| `cd ~` | Moves directly to your home directory from anywhere. | `cd ~` |
| `ls` | Lists the contents (files and folders) of a directory. With no argument, lists the current directory. | `ls` |
| `ls -l` | The `-l` flag shows a detailed "long" listing: permissions, owner, size, and modification date for each item (permissions are covered fully in module 03). | `ls -l` |
| `ls -a` | The `-a` flag shows "all" files, including hidden ones (files/folders whose names start with a `.`, which are hidden from a plain `ls` by convention). | `ls -a` |
| `ls -h` | The `-h` flag makes file sizes "human-readable" (e.g. `4.0K`, `1.2M`) instead of raw byte counts. Typically combined with `-l`, e.g. `ls -lh`. | `ls -lh` |
| `mkdir` | Creates a new, empty directory ("make directory"). | `mkdir photos` |
| `mkdir -p` | The `-p` flag creates any missing parent directories along the way, and doesn't error if the directory already exists. | `mkdir -p projects/2026/docker` |
| `rmdir` | Removes a directory, but only if it is completely empty. Fails with an error otherwise. | `rmdir photos` |
| `touch` | Creates a new, empty file if it doesn't exist, or updates the "last modified" timestamp if it already does. | `touch notes.txt` |
| `cp` | Copies a file (or, with a flag, a directory) from a source location to a destination. | `cp notes.txt notes-backup.txt` |
| `cp -r` | The `-r` flag copies directories "recursively" - meaning the directory and everything inside it, including nested subfolders. Required when copying folders (plain `cp` refuses). | `cp -r projects projects-backup` |
| `mv` | Moves a file or directory to a new location, or renames it (renaming is just "moving" to a new name in the same folder). | `mv notes.txt archive/notes.txt` |
| `rm` | Deletes ("removes") a file permanently. There is no recycle bin - deleted files are not easily recoverable. | `rm notes-backup.txt` |
| `rm -r` | The `-r` flag removes a directory and everything inside it recursively. Without it, `rm` refuses to delete a directory at all. | `rm -r old-folder` |
| `rm -rf` | Adds `-f` ("force") to `-r`, suppressing confirmation prompts and ignoring nonexistent files. Extremely destructive if pointed at the wrong path - there is no undo, and it will not ask "are you sure?" | `rm -rf old-folder` |
| `find` | Searches a directory tree for files/folders matching criteria (name, type, size, etc.). | `find . -name "*.txt"` |
| `tree` | Displays a directory's contents as an indented tree diagram. Not installed by default on Ubuntu - install it with `sudo apt install tree` (package management is covered fully in module 05). | `tree` |

## Hands-on exercises

1. **Open your Ubuntu terminal.** Confirm your starting location:
   ```
   pwd
   ```
   Expected output: something like `/home/yourusername`.

2. **List what's already in your home directory.** Run:
   ```
   ls
   ```
   Then run:
   ```
   ls -la
   ```
   Compare the two outputs - the second should show more entries, including ones starting with `.` (hidden files) and details like permissions, owner, size, and date (the `-l` part). Notice entries `.` and `..` at the top representing "this directory" and "the parent directory."

3. **Create a practice directory structure.** Run:
   ```
   mkdir -p ~/linux-practice/photos
   ```
   This creates `linux-practice` and, inside it, `photos`, in one step thanks to `-p`. Move into it:
   ```
   cd ~/linux-practice
   ```
   Confirm with `pwd`.

4. **Create some files.** Run:
   ```
   touch notes.txt todo.txt draft.txt
   ```
   Then list them:
   ```
   ls -lh
   ```
   Expected output: three files, each roughly `0` bytes in size since `touch` just created empty files.

5. **Practice relative vs. absolute paths.** From inside `~/linux-practice`, run:
   ```
   ls photos
   ```
   (relative path - `photos` is right here). Now run the same thing as an absolute path:
   ```
   ls /home/yourusername/linux-practice/photos
   ```
   (replace `yourusername` with your actual username from `whoami`). Both should show the same thing: an empty directory listing.

6. **Move around with `cd` and `..`.** Run:
   ```
   cd photos
   pwd
   cd ..
   pwd
   cd ..
   pwd
   ```
   Watch the output of each `pwd` - you should see yourself moving from `photos`, back up to `linux-practice`, and then up again to your home directory.

7. **Copy and rename files.** Go back into the practice folder (`cd ~/linux-practice`), then run:
   ```
   cp notes.txt notes-copy.txt
   ls
   ```
   You should now see both `notes.txt` and `notes-copy.txt`. Now rename `draft.txt` to `final.txt`:
   ```
   mv draft.txt final.txt
   ls
   ```
   Notice `draft.txt` is gone and `final.txt` has appeared in its place - `mv` renamed it since the destination was in the same folder.

8. **Copy an entire directory.** Run:
   ```
   cp -r ~/linux-practice ~/linux-practice-backup
   ls ~/linux-practice-backup
   ```
   Expected output: the backup folder contains the same files and the `photos` subfolder, confirming `-r` copied everything recursively.

9. **Use wildcards.** From inside `~/linux-practice`, run:
   ```
   ls *.txt
   ```
   Expected output: all three `.txt` files listed. Now try:
   ```
   touch file1.log file2.log file3.log
   ls file?.log
   ```
   Expected output: all three `.log` files, since `?` matches exactly the single digit character in each name.

10. **Use `find` to search.** From your home directory (`cd ~`), run:
    ```
    find linux-practice -name "*.txt"
    ```
    Expected output: a list of paths to every `.txt` file under `linux-practice` and its subfolders/backup copy, demonstrating that `find` searches recursively by default.

11. **Break something on purpose: try to remove a non-empty directory the "safe" way.** Run:
    ```
    rmdir ~/linux-practice
    ```
    Expected output: an error like `rmdir: failed to remove 'linux-practice': Directory not empty`. Read the error - `rmdir` refuses to delete anything that still has files inside, as a safety feature. This is expected and correct behavior, not a bug.

12. **Clean up properly and understand the danger of `rm -rf`.** Now remove the backup folder you no longer need, recursively:
    ```
    rm -r ~/linux-practice-backup
    ```
    Confirm it's gone with `ls ~`. Before running any `rm -r` or `rm -rf` command in the future, always double check the path with `pwd` and `ls` first - unlike Windows, there is no recycle bin, and `rm -rf` in particular will delete without asking for confirmation and without any way to undo it. Never run `rm -rf` on a path you haven't carefully verified, and never run it on `/` or your home directory root.

## Common mistakes & troubleshooting

- **Running `rm -rf` on the wrong path**: Always run `pwd` and `ls` immediately before a recursive delete to confirm exactly where you are and what you're about to remove. There is no undo.
- **Forgetting `-r` when copying or removing directories**: `cp` and `rm` both refuse to act on directories without `-r` (or `-rf` for force-delete), producing an error like `cp: -r not specified; omitting directory` or `rm: cannot remove 'folder': Is a directory`. This is a safety feature, not a bug.
- **Using `rmdir` on a folder that still has files**: `rmdir` only works on empty directories by design. Use `rm -r` instead if you intend to delete a folder and its contents.
- **Confusing relative and absolute paths**: If a command can't find a file, check whether you're using a relative path from the wrong current directory - run `pwd` first to confirm where you actually are.
- **Assuming `cd` prints anything**: `cd` is silent on success - if nothing appears to happen, that likely means it worked. Follow it with `pwd` if you want confirmation.
- **Typing `cd..` instead of `cd ..`**: The space between the command and its argument matters; Linux is strict about this and will report `cd..: command not found`.
- **Forgetting hidden files exist**: A plain `ls` won't show configuration files/folders starting with `.` (like `.bashrc`). Use `ls -a` when you need the full picture.
- **Wildcard matched nothing and the command errors oddly**: If `*.txt` doesn't match any files, some commands will pass the literal string `*.txt` through unexpanded, causing confusing "No such file" errors. Double-check with a plain `ls` first.

## Checkpoint quiz

1. What is the difference between an absolute path and a relative path? Give an example of each.
2. What do `.` and `..` mean when used in a path?
3. Why does `rmdir` sometimes refuse to delete a folder, and what command would you use instead?
4. What is the practical difference between `rm -r` and `rm -rf`, and why should you be more cautious with the second?
5. If you're in `/home/yourusername/linux-practice` and run `cd ..`, where do you end up, and how would you confirm it?
6. What does the `*` wildcard match that `?` does not?
7. Why did copying a directory require the `-r` flag on `cp` but copying a single file did not?
8. Name two hidden dangers of `rm -rf` and one habit that helps you avoid them.

<details>
<summary>Show answers</summary>

1. An absolute path always starts from the root `/` and fully specifies the location regardless of where you currently are, e.g. `/home/yourusername/notes.txt`. A relative path is interpreted starting from your current directory and does not start with `/`, e.g. `notes.txt` or `../notes.txt`.
2. `.` refers to the current directory you're in. `..` refers to the parent directory (one level up from where you are).
3. `rmdir` only removes directories that are completely empty, as a safety measure against accidentally deleting folders full of files. To delete a non-empty directory and everything inside it, use `rm -r` (or `rm -rf` to also skip confirmations and force it).
4. `rm -r` recursively deletes a directory and its contents, but Linux may still stop for confirmation on certain protected or write-protected files. `rm -rf` adds `-f` ("force"), which suppresses all prompts and error messages and pushes through regardless - meaning a typo in the path can silently and irreversibly delete the wrong thing with zero warning.
5. You'd end up in `/home/yourusername` (the parent of `linux-practice`). Confirm it by running `pwd`, which would print `/home/yourusername`.
6. `*` matches any number of characters (zero or more), so it can match filenames of any length. `?` matches exactly one character, so it only matches names of a specific length pattern.
7. Because a directory isn't a single unit of data - it's a container that may hold many files and subfolders. `-r` ("recursive") tells `cp` to walk into the directory and copy everything inside it too; without it, `cp` doesn't know how deep to go, so it refuses by default as a safeguard.
8. Two hidden dangers: (1) it never asks for confirmation, so a typo in the path can delete the wrong folder instantly and irreversibly; (2) there is no recycle bin or undo in Linux, so recovery after the fact is generally not possible. A helpful habit: always run `pwd` and `ls` right before the command to double-check exactly where you are and what you're about to delete.

</details>

## Next
Continue to [03-file-permissions-ownership](../03-file-permissions-ownership/README.md) to learn how Linux controls who can read, write, or execute each file, and how to read and change those permissions yourself.
