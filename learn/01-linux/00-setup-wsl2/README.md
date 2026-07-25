# Setting Up WSL2 and Ubuntu

## Why this matters
Almost all production servers, containers, and cloud infrastructure run Linux, not Windows. If you're going to learn Docker and Kubernetes on a Windows 11 machine, you need a real Linux environment to practice in - and WSL2 (Windows Subsystem for Linux 2) gives you that without needing a separate physical machine or a slow virtual machine. Every exercise in this curriculum happens inside the Ubuntu shell you're about to set up.

## Concepts

**What is WSL2?** WSL2 stands for "Windows Subsystem for Linux, version 2." It lets Windows run a real Linux kernel alongside Windows itself, so you can install a Linux distribution (like Ubuntu) and use it as if you had a separate Linux computer - without rebooting or using a separate virtual machine tool like VirtualBox.

**What is Ubuntu?** Ubuntu is a "distribution" (or "distro") of Linux - a specific packaged version of the Linux operating system with its own set of default tools and a package manager (a way to install software). It's one of the most popular distros and a great starting point because most tutorials and documentation assume it.

**What is a terminal / shell?** For now, just know that a terminal is a window where you type text commands instead of clicking buttons, and the shell is the program that reads what you type and runs it. The next module explains this in depth - for this module, you just need to get one open and working.

**Why "admin PowerShell" for installation?** Installing WSL2 changes low-level Windows settings (enabling a virtualization feature), so Windows requires you to run that one command as an Administrator. Once WSL2 and Ubuntu are installed, you will NOT need admin rights for your day-to-day Linux work.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `wsl --install -d Ubuntu` | Installs WSL2 and the Ubuntu distribution in one step. Run this from an **administrator** PowerShell window on Windows. `-d Ubuntu` tells it which distro to install (`-d` = "distribution"). | `wsl --install -d Ubuntu` |
| `wsl --status` | Shows the current WSL configuration, including which version (1 or 2) is set as default and which distro is installed. Useful to confirm the install worked. | `wsl --status` |
| `wsl --list --verbose` | Lists all installed Linux distributions and shows their state (Running/Stopped) and WSL version. `--verbose` (or `-v`) adds the extra detail columns. | `wsl --list --verbose` |
| `wsl` | Opens a shell into your default WSL distribution, run from PowerShell or cmd. | `wsl` |
| `sudo apt update` | Refreshes the local list of available software packages and their versions from Ubuntu's package servers. `sudo` runs the command with administrator ("superuser") privileges, required because updating package lists touches system files. | `sudo apt update` |
| `sudo apt upgrade -y` | Installs newer versions of any packages that have updates available. `-y` automatically answers "yes" to the confirmation prompt so it doesn't stop and wait for you. | `sudo apt upgrade -y` |
| `lsb_release -a` | Prints details about the installed Linux distribution and release version ("lsb" = Linux Standard Base). Good sanity check that you're really in Ubuntu. | `lsb_release -a` |
| `whoami` | Prints the username you are currently logged in as. | `whoami` |
| `pwd` | Prints the "present working directory" - the folder you're currently in. | `pwd` |
| `exit` | Closes the current shell session (leaves Ubuntu, returns to Windows if that's where you started). | `exit` |

## Hands-on exercises

1. **Check your Windows version.** Press the Windows key, type "About your PC", and open it. Confirm you're on Windows 11 (WSL2 works on most modern Windows 10 versions too, but this guide assumes Windows 11). WSL2 requires virtualization support, which is on by default on nearly all modern PCs.

2. **Open PowerShell as Administrator.** Click the Start menu, type "PowerShell", right-click "Windows PowerShell," and choose "Run as administrator." A blue window should open. If Windows asks "Do you want to allow this app to make changes to your device?", click Yes.

3. **Install WSL2 and Ubuntu.** In that admin PowerShell window, type:
   ```
   wsl --install -d Ubuntu
   ```
   Press Enter. This downloads and installs the WSL2 engine and the Ubuntu distribution. It may take several minutes and may ask you to restart your computer partway through - if so, restart, then let the install finish automatically after login. Expected output includes progress messages ending in something like "Ubuntu has been installed."

4. **First launch and account setup.** After installation finishes (or after the restart), an Ubuntu window should open automatically (or find "Ubuntu" in your Start menu and launch it). The first time it runs, it will ask you to create a **UNIX username and password**. This is separate from your Windows login - it can be the same or different. Type a lowercase username (no spaces) and press Enter, then type a password and press Enter to confirm. Note: when you type the password, nothing will appear on screen at all, not even dots - this is normal Linux behavior for hiding password length. Just type it carefully and press Enter.

5. **Verify you're really in Ubuntu.** In the Ubuntu window that just opened, run:
   ```
   lsb_release -a
   ```
   Expected output should show `Distributor ID: Ubuntu` and a release version number like `22.04` or `24.04`.

6. **Check who you are and where you are.** Run:
   ```
   whoami
   ```
   Expected output: the username you just created. Then run:
   ```
   pwd
   ```
   Expected output: something like `/home/yourusername` - this is your personal "home" folder in Linux (more on this in module 02).

7. **Update your package lists and installed software.** Run:
   ```
   sudo apt update && sudo apt upgrade -y
   ```
   You'll be asked for your Ubuntu password (the one from step 4) since `sudo` requires it - type it and press Enter (again, no characters will show). This may take a few minutes on first run as it downloads updates. Expected output ends with something like "X upgraded, Y newly installed" or "0 upgraded" if everything was already current.

8. **Install Windows Terminal for a better experience.** Open the Microsoft Store on Windows (Start menu, type "Store"), search for "Windows Terminal," and install it. It's a modern terminal app that supports tabs, better fonts, and color, and it can launch straight into your Ubuntu shell. Once installed, open Windows Terminal and check the dropdown arrow next to the "+" tab button - you should see "Ubuntu" listed as a profile option.

9. **Practice reopening your Ubuntu shell three different ways:**
   - From the Start menu, type "Ubuntu" and launch the app directly.
   - Open Windows Terminal and select the "Ubuntu" profile from the dropdown arrow next to the "+".
   - Open any PowerShell or cmd window and simply type `wsl`, then press Enter.

   Confirm all three land you in the same home directory by running `pwd` in each.

10. **Intentionally cause and read an error.** In your Ubuntu shell, run a command that doesn't exist, for example:
    ```
    sduo apt update
    ```
    (a common typo of `sudo`). Read the error message carefully - it will say something like `sduo: command not found`. This is Linux telling you it looked for a program literally named `sduo` and couldn't find one. Fix the typo and rerun it correctly as `sudo apt update` to confirm it works. Getting comfortable reading "command not found" errors now will save you a lot of confusion later.

11. **Confirm your WSL setup from the Windows side.** Open PowerShell (does not need to be Administrator this time) and run:
    ```
    wsl --list --verbose
    ```
    Expected output: a table showing `Ubuntu` with `VERSION` equal to `2` and `STATE` equal to `Running` or `Stopped`.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Verify a brand-new WSL2 setup end to end without retracing the exercise steps line by line. Starting from an ordinary (non-administrator) PowerShell window on Windows, confirm that your Ubuntu distribution is genuinely running under WSL version 2 rather than version 1, then drop into the Ubuntu shell, establish which Linux user you are and where your home directory lives, and finally prove the machine can actually reach Ubuntu's package servers over the network. As you go, decide for yourself which single one of these steps would have required an Administrator PowerShell and which did not, and why.

<details>
<summary>Stuck? One hint</summary>

One command run from the Windows side lists every installed distro with its WSL version in its own column; the "can it reach the package servers" check is the very same catalog-refresh command that needed superuser rights when you ran it inside Linux.

</details>

## Common mistakes & troubleshooting

- **"WSL 2 requires an update to its kernel component" error**: This means the WSL2 Linux kernel package needs updating separately. Follow the link Windows shows, or run `wsl --update` from an admin PowerShell.
- **Virtualization not enabled in BIOS**: If installation fails with a virtualization-related error, you may need to enable virtualization (often called "Intel VT-x" or "AMD-V") in your PC's BIOS/UEFI settings. This is rare on modern pre-built PCs but happens on some laptops with it disabled by default.
- **Typing the password and seeing nothing happen**: This is expected. Linux terminals hide password input completely (no dots, no asterisks). Just type slowly and press Enter.
- **Forgetting the Ubuntu password**: Unlike Windows, there's no easy "forgot password" link. You'd need to reset it via a WSL-specific recovery process (booting as root) - so write your password down somewhere safe while you're learning.
- **Confusing the Windows user account with the Linux (Ubuntu) user account**: These are two separate systems. Your Windows password does not apply inside Ubuntu, and vice versa.
- **Running `apt update`/`apt upgrade` without `sudo`**: You'll get a "Permission denied" style error because modifying system package information requires elevated privileges. Always prefix these with `sudo`.
- **Multiple Ubuntu windows feeling "different"**: They're not - every way of opening Ubuntu (Start menu, Windows Terminal, or `wsl` from PowerShell) drops you into the exact same Linux environment and files. Nothing is duplicated.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the difference between WSL2 and Ubuntu - are they the same thing?
2. Why did you need to run the installation command as an Administrator, but not your day-to-day Ubuntu commands?
3. What does `sudo` do, and why did `apt update` need it?
4. If you closed the Ubuntu window and reopened it later, would your files and installed updates still be there? Why?
5. Why is the Ubuntu username/password separate from your Windows login?
6. What would you expect to see if you ran `whoami` right after installing a second Linux distribution and switching to it?
7. What does it mean that `wsl --list --verbose` showed `VERSION 2` instead of `VERSION 1`?

<details>
<summary>Show answers</summary>

1. No. WSL2 is the underlying technology/engine that lets Windows run a real Linux kernel. Ubuntu is a specific Linux distribution (an actual operating system with its own files and package manager) that runs on top of WSL2. You could install other distros (like Debian or Fedora) on the same WSL2 engine.
2. Installing WSL2 changes system-level Windows features (enabling virtualization support), which requires administrator rights. Once installed, everyday commands inside Ubuntu (like `whoami` or `pwd`) don't touch those system-level Windows settings, so no admin rights are needed - though some Linux commands still need `sudo` for Linux-level admin actions.
3. `sudo` ("superuser do") temporarily runs a command with administrator/root privileges. `apt update` needs it because refreshing system package lists modifies files that a regular, non-privileged user isn't allowed to touch.
4. Yes, they persist. WSL2 stores your Ubuntu filesystem persistently on disk, separate from any single terminal window. Closing the window just ends that session; it doesn't delete or reset anything.
5. Because Ubuntu is effectively a separate operating system running inside Windows, with its own independent user account system - it has no knowledge of your Windows login credentials.
6. It would show the username of whichever distro's default user you're currently in - `whoami` always reflects the current shell session's active Linux user, not a Windows-wide identity.
7. It confirms Ubuntu is running under the newer, faster WSL2 architecture (a real lightweight virtual machine with a full Linux kernel) rather than the older WSL1 (which translated Linux system calls to Windows ones without a real Linux kernel).

</details>

## Next
Continue to [01-shell-basics-and-philosophy](../01-shell-basics-and-philosophy/README.md) to learn what a shell actually is, how commands are structured, and the Unix philosophy that shapes everything else in this curriculum.
