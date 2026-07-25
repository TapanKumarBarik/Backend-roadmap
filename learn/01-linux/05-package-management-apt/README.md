# Package Management with APT

## Why this matters

Almost no real Linux work happens with only the tools that ship in a base install — you'll constantly need to add editors, monitoring tools, language runtimes, and libraries. Manually downloading binaries from random websites is slow, insecure, and creates dependency and update nightmares. Every Linux engineer relies on a package manager daily, and on Ubuntu (and WSL2's Ubuntu) that's APT — you'll use it in almost every module from here on, including to install the tools this very curriculum needs.

## Concepts

**What a package manager is, and why it beats manual downloads.** A package is a bundle containing a piece of software, metadata about it (version, description), and a list of other packages it depends on. A package manager is a tool that downloads, installs, upgrades, and removes these packages for you, automatically pulling in anything they depend on. Compare that to manually downloading a program's binary from a website: you'd have to figure out dependencies yourself, there's no easy "uninstall cleanly," no consistent way to check for updates, and no guarantee the file wasn't tampered with. Package managers solve all of this with a curated, verified catalog.

**APT and the Debian/Ubuntu ecosystem.** Ubuntu is built on Debian, and both use the `.deb` package format managed by a lower-level tool called `dpkg`. APT (Advanced Package Tool) sits on top of `dpkg` and adds the parts people actually want: fetching packages from remote servers ("repositories"), resolving dependencies automatically, and upgrading everything in one command. When you type `apt install something`, APT looks up `something` in its local index of available packages, works out anything it needs, downloads it all, and hands it to `dpkg` to actually unpack and install onto your filesystem.

**The package index and why you `update` before you `upgrade`.** APT doesn't ask the internet "does this package exist" every single time — it keeps a local cache of what's available and at what version, per configured repository. `apt update` refreshes that local cache from the repositories (it does not install or upgrade anything by itself). Only after that cache is fresh does `apt upgrade` know which installed packages have newer versions available. Skipping `update` means you might be told everything is "up to date" when it isn't — the local cache is just stale.

**`upgrade` vs `full-upgrade`.** `apt upgrade` installs newer versions of packages you already have, but it will refuse to remove any currently installed package to do so — if upgrading one package would require removing another, it just leaves that package alone. `apt full-upgrade` (older tutorials may call it `dist-upgrade`) is willing to remove packages if that's what's needed to complete every available upgrade, which matters more when major version jumps happen. For routine updates, `upgrade` is the safer everyday habit.

**Repositories and adding new sources (lightly).** The "repositories" APT downloads from are just servers hosting package catalogs, and Ubuntu's default install already points at Canonical's official ones. Sometimes software isn't in the default repositories, and projects publish their own repository (Ubuntu calls a lightweight, personal one a "PPA" — Personal Package Archive). The command `sudo add-apt-repository ppa:some/ppa` adds one of these as a new source so APT knows to look there too, and you'd normally run `apt update` immediately afterward so APT picks up its new catalog. This curriculum won't need you to add any PPAs, but you should recognize the command when you see it in the wild — and know that adding third-party repositories means trusting whoever publishes them.

**Where installed packages actually go.** APT-installed programs generally place their executable binaries in standard system directories like `/usr/bin` (most user tools) or `/usr/sbin` (system administration tools), with supporting files often under `/usr/lib` or `/etc`. You don't need to hunt these down by hand — `which` and `whereis` do it for you.

**Install vs remove vs purge.** `apt remove` uninstalls a package's program files but leaves its configuration files behind (handy if you plan to reinstall later and want your settings preserved). `apt purge` removes the package *and* its configuration files, for a fully clean slate.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `sudo apt update` | Refreshes APT's local index of what packages/versions are available from configured repositories. Installs nothing by itself. | `sudo apt update` |
| `sudo apt upgrade` | Installs newer versions of already-installed packages, but won't remove any package to do it. | `sudo apt upgrade` |
| `sudo apt full-upgrade` | Like `upgrade`, but will remove packages if necessary to complete all available upgrades. | `sudo apt full-upgrade` |
| `sudo apt install <pkg>` | Installs a package (and anything it depends on). Can take multiple package names at once. | `sudo apt install tree curl` |
| `sudo apt remove <pkg>` | Uninstalls a package's program files, keeping its configuration files behind. | `sudo apt remove tree` |
| `sudo apt purge <pkg>` | Uninstalls a package and deletes its configuration files too. | `sudo apt purge tree` |
| `sudo apt autoremove` | Removes packages that were pulled in as dependencies but are no longer needed by anything installed. | `sudo apt autoremove` |
| `apt search <term>` | Searches package names and descriptions in the local index for a keyword. | `apt search text editor` |
| `apt show <pkg>` | Shows detailed metadata about a package: version, description, size, dependencies. | `apt show curl` |
| `apt list --installed` | Lists every package currently installed on the system. | `apt list --installed` (pipe through `grep` to filter, covered in module 07) |
| `dpkg -l` | Lists installed packages via the lower-level `dpkg` tool, with status flags and version columns; more low-level/verbose than `apt list`. | `dpkg -l | grep curl` (again, piping is previewed here; full detail in module 07) |
| `sudo add-apt-repository ppa:<name>` | Adds a third-party repository (commonly a PPA) as a new package source so APT can install from it. Run `apt update` afterward. | `sudo add-apt-repository ppa:example/example` |
| `which <command>` | Prints the full path of the executable that would run for a given command name, based on your `PATH`. | `which htop` might print `/usr/bin/htop` |
| `whereis <command>` | Similar to `which`, but also shows related binary, source, and manual page locations, not just the one that would run. | `whereis htop` |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Refresh the package index: `sudo apt update`. Read the output — it lists each repository it checked and how many packages were fetched or are upgradable.

2. See what's upgradable on your system: `sudo apt upgrade`. If it lists packages, review the list, then type `y` to confirm (or `N` if you'd rather not upgrade right now — either is fine for this exercise).

3. Search for a package before installing it: `apt search tree`. Look through the results for a line that plainly describes a directory-listing tool (the description should mention displaying directory structure).

4. Look at package details before installing: `apt show tree`. Note the `Version`, `Depends`, and `Description` fields.

5. Install three real tools you'll use in upcoming modules: `sudo apt install tree curl htop`. Watch the output — it should show a plan (packages to be installed, total download size) before actually downloading and unpacking.

6. Confirm they're really there: run `which tree`, `which curl`, and `which htop`. Each should print a path like `/usr/bin/tree`. Then run `tree --help | head -5` (again, a small pipe preview) just to confirm the program runs.

7. Check the installed package list: `apt list --installed` and separately `dpkg -l`. Compare the two outputs' formats — `dpkg -l` shows a status column (`ii` means fully installed) plus version and short description in one table.

8. Break something on purpose: try `sudo apt install thisisnotarealpackage123`. Read the error message carefully — APT should say it's "Unable to locate package," which is different from a network error or a permissions error. This teaches you to distinguish "package doesn't exist" from other kinds of failures.

9. Remove a package but keep its config: `sudo apt remove tree`. Then reinstall it: `sudo apt install tree`, and notice APT still treats it as a fresh install of program files. Now fully purge it instead: `sudo apt purge tree`. Confirm it's gone: `which tree` should print nothing (or exit with no output/an error, depending on your shell).

10. Clean up unused dependencies: run `sudo apt autoremove`, and read whether it reports anything to remove (on a fresh WSL install with only the exercises above, there may be nothing — that's fine, the point is knowing the command exists and what it targets).

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Pick a small command-line tool you have not installed yet (for example `cowsay`, `ncal`, `jq`, or `figlet`). Before installing anything, inspect its metadata to learn what it does, what it depends on, and how big it is. Then install it, and — using the file-location skills from module 02 combined with this module's tooling — find exactly where its executable landed on disk. Run the program once to confirm it works. Finally, remove it in the way that also wipes any configuration it left behind, and prove the binary is truly gone by trying to locate it again.

<details>
<summary>Stuck? One hint</summary>

`apt show` reveals metadata before you commit to installing; `which` reports the on-disk path of an installed command; and the removal variant that also deletes config files is the "purge" one, not plain "remove."

</details>

## Common mistakes & troubleshooting

- **Running `apt install` without `sudo`:** you'll get a permission error, because installing software modifies system directories that ordinary users can't write to. Prefix with `sudo`.
- **Forgetting `apt update` before `apt upgrade`:** you may see "0 upgraded" even when updates genuinely exist, simply because your local package index is stale. Always `update` first.
- **Confusing `apt search` with `apt show`:** `search` finds packages by keyword when you don't know the exact name; `show` gives details about a package whose exact name you already know. Running `apt show` on a keyword instead of an exact package name just fails with "Unable to locate package."
- **Assuming `apt remove` fully uninstalls everything:** configuration files often remain after `remove`. If you want a truly clean removal (e.g. before reinstalling to fix a broken config), use `purge` instead.
- **Not reading the confirmation summary:** `apt install`/`upgrade` show a plan (what will be installed/upgraded/removed and total size) before doing anything; skimming past it means missing that an upgrade is about to remove a package you wanted, or a full-upgrade is about to make a bigger change than expected.
- **Typing the wrong package name:** package names are exact and case-sensitive; a typo produces "Unable to locate package," which is your cue to `apt search` for the right name instead of assuming APT itself is broken.
- **Interrupting an install midway (e.g. closing the terminal):** can leave `dpkg` in a partially-configured state. If a later `apt` command complains about this, `sudo apt --fix-broken install` (or `sudo dpkg --configure -a`) is the standard recovery — good to know exists, even if you don't need it today.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why is a package manager generally safer and more maintainable than manually downloading a binary from a website?
2. What exactly does `apt update` do, and what does it deliberately not do?
3. You run `apt upgrade` and see "0 packages upgraded," but you're fairly sure new versions exist. What's the most likely explanation, and what command fixes it?
4. When would `apt full-upgrade` remove a package that plain `apt upgrade` would have left alone, and why does that difference exist?
5. What's the practical difference between `apt remove` and `apt purge`?
6. If you don't know a package's exact name, which command should you reach for first — `apt show` or `apt search` — and why?
7. After installing `htop`, how would you find out exactly which file on disk is the executable that runs when you type `htop`?
8. What is a PPA, and what should you keep in mind before adding one as a package source?

<details>
<summary>Show answers</summary>

1. A package manager automatically resolves and installs dependencies, verifies package integrity, and gives you a consistent way to upgrade or cleanly uninstall software later. Manually downloaded binaries leave dependency resolution, updates, and clean removal entirely up to you, and offer no built-in verification of trustworthiness.
2. `apt update` refreshes APT's local index of what package versions are available in the configured repositories. It does not install or upgrade any actual software — it only updates the catalog APT consults.
3. The local package index is likely stale because `apt update` wasn't run recently, so APT is comparing against outdated information and doesn't see the new versions. Running `sudo apt update` first, then `apt upgrade` again, fixes it.
4. `full-upgrade` will remove an installed package if that removal is required to complete every available upgrade (e.g. a dependency conflict blocking a version bump); `upgrade` refuses to remove anything and will simply skip that package's upgrade instead, leaving your installed set unchanged in that respect.
5. `remove` deletes a package's program files but leaves its configuration files on disk; `purge` deletes both the program files and the configuration files, for a completely clean removal.
6. `apt search`, because it looks through package names and descriptions for a keyword match. `apt show` requires you to already know the exact package name and just displays details about it.
7. Run `which htop`, which prints the full path (typically `/usr/bin/htop`) of the executable that your shell would actually run for that command.
8. A PPA (Personal Package Archive) is a third-party repository, often maintained by an individual or small project rather than Canonical/Ubuntu itself. Before adding one, keep in mind you are extending trust to whoever publishes it, since APT will treat packages from it the same as official ones.

</details>

## Next

Continue to [06 - Process Management](../06-process-management/README.md), where you'll use the `htop` tool you just installed to watch and control running processes.
