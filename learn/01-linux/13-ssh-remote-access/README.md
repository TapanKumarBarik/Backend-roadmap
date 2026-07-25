# SSH and Remote Access

## Why this matters

Almost nothing you manage professionally sits on the machine in front of you - servers, cloud VMs, Kubernetes nodes, and container hosts are all reached remotely, and SSH is the near-universal way to do that securely. Once you get to the Docker and Kubernetes parts of this curriculum, you'll be SSHing into hosts and copying files around constantly, so getting comfortable with key pairs, `ssh`, and `scp` now removes a huge amount of friction later.

## Concepts

**What SSH is and why it replaced telnet.** SSH (Secure Shell) is a protocol for getting a remote command-line session on another machine over a network, the same way you've been getting a local shell on your own machine since module 01. Older tools like `telnet` did the same basic job but sent everything - including your password - as plain, unencrypted text over the network, so anyone watching the traffic could read it. SSH encrypts the entire session: your login, your keystrokes, and everything the remote machine sends back. This is why SSH is the default today and telnet is essentially never used for remote administration anymore.

**Client and server.** SSH has two sides: the client (the `ssh` command you run to connect *out* to somewhere) and the server (a background service, `sshd`, that listens for incoming connections and is what actually lets a machine be connected *into*). Ubuntu ships with the SSH client already installed, which is why you can `ssh` out to other machines immediately. The server is a separate package you install only if you want *this* machine to accept incoming SSH connections.

**Password vs. key-based authentication.** When you `ssh` into a machine, you need to prove who you are. The simplest way is a password, typed each time. The stronger and more convenient way, used almost everywhere professionally, is a key pair: a mathematically related pair of files, a private key (which never leaves your machine and must be kept secret) and a public key (which you can hand out freely, because it's only useful for verifying, not impersonating, you). You put your public key on the remote machine; when you connect, the remote machine challenges your client to prove it holds the matching private key, without the private key or a password ever crossing the network. This is why file permissions on your private key matter so much (see below) - anyone who obtains it can pretend to be you.

**Why the permissions on `~/.ssh` and your private key matter.** You already learned in module 03 that Linux permissions control who can read/write/execute a file. SSH is unusually strict about this: if your private key file or your `~/.ssh` directory are readable by anyone other than you, SSH will refuse to use them and print a warning, because a private key readable by other users defeats the entire point of it being private. The convention is `700` (owner: read/write/execute, nobody else: anything) for the `~/.ssh` directory, and `600` (owner: read/write, nobody else: anything) for private key files.

**`authorized_keys` and how key-based login actually gets granted.** On the machine you're connecting *to*, there's a file at `~/.ssh/authorized_keys` (one line per public key) listing which public keys are allowed to log in as that user. Adding your public key there is what grants you access - there's no separate "user database" for SSH keys beyond this file. `ssh-copy-id` automates appending your public key to that file over an existing (usually password-based) connection, so you don't have to do it by hand.

**`~/.ssh/config` for host aliases.** Typing full `ssh user@long-hostname-or-ip -p 2222 -i /path/to/key` every time gets tedious. The `~/.ssh/config` file lets you define a short alias (like `myserver`) that bundles up the hostname, username, port, and key file, so you can just type `ssh myserver`. This is a client-side convenience file only - it doesn't affect the server at all.

**WSL2's networking reality for SSH practice.** WSL2 runs behind a NAT (network address translation) layer on your Windows host, meaning other machines on your network generally cannot initiate a connection *into* your WSL2 instance by default - this was touched on in module 10's networking notes. Practically, this means: (1) SSHing *out* from WSL2 to a real remote machine, VM, or cloud instance works completely normally and is the most realistic way to practice; (2) if you want to practice being on the "server" side too without a second machine, you can install `openssh-server` inside your own WSL2 instance and SSH to `localhost` from the same instance - this proves the mechanics (keys, permissions, config) but is not the same as genuine machine-to-machine access, and don't expect a Windows machine elsewhere on your network to reach your WSL2 sshd without extra port-forwarding setup that's out of scope here.

**`scp` for copying files over SSH.** `scp` (secure copy) reuses your existing SSH authentication (password or key) to copy files to or from a remote machine, so if `ssh` works, `scp` works with the same credentials. It's the SSH-secured equivalent of a local `cp`.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `ssh user@host` | Opens a remote shell session on `host`, logging in as `user` | `ssh alice@203.0.113.10` |
| `ssh -p <port> user@host` | Connects using a non-default SSH port (`-p`); default port is 22 | `ssh -p 2222 alice@203.0.113.10` |
| `ssh -i <keyfile> user@host` | Connects using a specific private key file (`-i` = identity file) instead of the default | `ssh -i ~/.ssh/id_ed25519 alice@203.0.113.10` |
| `ssh-keygen` | Generates a new public/private key pair, interactively prompting for a file location and optional passphrase | `ssh-keygen -t ed25519 -C "my-comment"` |
| `ssh-copy-id user@host` | Copies your public key to the remote machine's `~/.ssh/authorized_keys`, prompting for the remote password once to do so | `ssh-copy-id alice@203.0.113.10` |
| `scp <src> <dest>` | Securely copies a file between local and remote machines over SSH | `scp notes.txt alice@203.0.113.10:/home/alice/` |
| `scp -r <src> <dest>` | Copies a directory and its contents recursively (`-r`) | `scp -r myproject/ alice@203.0.113.10:~/backup/` |
| `sudo apt install openssh-server` | Installs the SSH server package so this machine can accept incoming connections (module 05 recap) | `sudo apt install openssh-server` |
| `sudo systemctl enable --now ssh` | Enables the SSH server to start on boot and starts it immediately (module 11 recap) | `sudo systemctl enable --now ssh` |
| `sudo systemctl status ssh` | Shows whether the SSH server is currently running | `sudo systemctl status ssh` |
| `chmod 700 ~/.ssh` | Restricts the `.ssh` directory to owner-only access, required for SSH to trust its contents | `chmod 700 ~/.ssh` |
| `chmod 600 ~/.ssh/id_ed25519` | Restricts a private key file to owner-only read/write, required for SSH to accept using it | `chmod 600 ~/.ssh/id_ed25519` |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Confirm the SSH client is already present by running `ssh -V`. You should see a version string like `OpenSSH_8.x` or similar - this confirms the client-side tooling from earlier modules' package management is already there.

2. Generate a key pair for yourself: run `ssh-keygen -t ed25519 -C "practice-key"`. When prompted for a file location, press Enter to accept the default (`~/.ssh/id_ed25519`). When prompted for a passphrase, you can press Enter twice for no passphrase for this practice exercise (in real use, a passphrase adds another layer of protection on top of the key itself).

3. List your `.ssh` directory with `ls -l ~/.ssh`. You should see `id_ed25519` (your private key) and `id_ed25519.pub` (your public key). Run `cat ~/.ssh/id_ed25519.pub` and note that it's a single line of text starting with `ssh-ed25519` - this is safe to share. Do not `cat` or share the private key file.

4. Check the permissions on your key files with `ls -l ~/.ssh/id_ed25519` and `ls -ld ~/.ssh`. `ssh-keygen` sets these correctly by default (`600` on the private key, `700` on the directory), so confirm you see `-rw-------` and `drwx------` respectively.

5. Now practice the server side locally so you have something to actually connect to. Install and start the SSH server:
   ```
   sudo apt update
   sudo apt install -y openssh-server
   sudo systemctl enable --now ssh
   sudo systemctl status ssh
   ```
   Confirm the status shows `active (running)`.

6. Add your own public key to your own `authorized_keys` file (simulating what you'd do on a remote machine):
   ```
   mkdir -p ~/.ssh
   cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   ```
   Then run `ssh localhost` (using your own Linux username). The first time, you'll be asked to confirm the host's fingerprint - type `yes`. You should be logged in without being prompted for a password, proving key-based auth worked. Type `exit` to return to your original shell.

7. Break the permissions on purpose to see the failure mode. Run `chmod 777 ~/.ssh/id_ed25519` (making the private key world-readable), then try `ssh -i ~/.ssh/id_ed25519 localhost`. You should see a warning like `Permissions ... are too open` and the connection either falls back to password auth or refuses the key. Read the error message carefully - this is exactly the situation the "why permissions matter" concept above described.

8. Fix it: run `chmod 600 ~/.ssh/id_ed25519`, then retry `ssh -i ~/.ssh/id_ed25519 localhost` and confirm it works again cleanly. Type `exit` when done.

9. Practice `scp`. Create a test file and copy it to yourself over SSH:
   ```
   echo "scp test" > ~/scp-test.txt
   scp ~/scp-test.txt localhost:~/scp-test-copy.txt
   ls -l ~/scp-test-copy.txt
   cat ~/scp-test-copy.txt
   ```
   Confirm the copy exists and has the same content.

10. Set up a host alias. Edit (or create) `~/.ssh/config` with a text editor and add:
    ```
    Host mylocal
        HostName localhost
        User <your-linux-username>
        IdentityFile ~/.ssh/id_ed25519
    ```
    Save it, then run `chmod 600 ~/.ssh/config` and test with `ssh mylocal`. You should connect without specifying the username or key file on the command line, confirming the alias is working.

11. If you have access to a real remote machine or cloud VM (optional but recommended for realism), run `ssh-copy-id user@<that-machine's-address>` to copy your public key there, then `ssh user@<that-machine's-address>` to confirm passwordless login works against an actual separate machine, not just `localhost`. This is the scenario the WSL2 NAT note above described as the realistic way to practice SSH.

## Common mistakes & troubleshooting

- **"Permission denied (publickey)" when connecting.** This almost always means either the public key was never added to the remote's `authorized_keys`, or the permissions on the remote's `~/.ssh` or `authorized_keys` are too loose (SSH refuses to trust them) or too strict for the wrong owner. Re-check both the key placement and permissions.
- **"WARNING: UNPROTECTED PRIVATE KEY FILE!" or similar.** This means your private key file's permissions are too open (readable by group/others). Fix with `chmod 600 <keyfile>`.
- **Confusing which key goes where.** The public key (`.pub` file) goes on the machine you're connecting *to* (in its `authorized_keys`). The private key stays on the machine you're connecting *from* and is never copied anywhere else.
- **Expecting another device on your home network to SSH into your WSL2 instance directly.** Because of WSL2's NAT networking, this typically doesn't work without additional port-forwarding configuration on the Windows side, which is out of scope here - use `localhost` self-connections or a real remote host to practice instead.
- **Host key verification warnings after reinstalling a remote machine or WSL distro.** If a remote machine's identity changes (reinstall, new key), SSH will refuse to connect with a loud warning about a changed host key, as a security measure against impersonation. This is resolved by removing the stale entry from `~/.ssh/known_hosts` for that host, only after you've confirmed the change is expected and legitimate.
- **`ssh: connect to host ... port 22: Connection refused`.** This usually means no SSH server is listening on the target - check that `openssh-server` is installed and the `ssh` service is running (`sudo systemctl status ssh`) on the target machine, not the machine you're connecting from.
- **Forgetting `sudo systemctl enable --now ssh` after installing the server.** Installing the package doesn't automatically start or enable the service; you must do that explicitly, as covered in module 11.

## Checkpoint quiz

1. What specific security problem does SSH solve that `telnet` does not?
2. In a key pair, which key goes on the remote machine you're connecting to, and which never leaves your own machine?
3. Why does SSH refuse to use a private key file or `.ssh` directory with overly permissive permissions?
4. What is `~/.ssh/authorized_keys` and how does a public key end up there in normal practice?
5. What does `~/.ssh/config` do, and does it affect the remote machine in any way?
6. Why can't a random machine on your home Wi-Fi normally SSH directly into your WSL2 Ubuntu instance?
7. What's the difference between what `ssh` does and what `scp` does, given they use the same underlying authentication?

<details>
<summary>Show answers</summary>

1. SSH encrypts the entire session (login credentials and all traffic), while telnet sends everything in plain text, so anyone monitoring the network could read passwords and data. SSH prevents eavesdropping and credential theft in transit.
2. The public key goes on the remote machine (in its `~/.ssh/authorized_keys`). The private key stays only on your own machine and must never be shared or copied elsewhere.
3. Because a private key (or an authorized_keys/config file) readable by other users on the system could let another local user read or use it to impersonate you; strict permissions (`600`/`700`) ensure only the owner can access it, preserving the "private" guarantee the whole scheme depends on.
4. It's a file on the remote machine listing public keys that are permitted to log in as that user, one per line. In normal practice it's populated by running `ssh-copy-id` (which appends your public key to it over an initial password-authenticated connection) or by manually appending your `.pub` key's contents to it.
5. It's a client-side configuration file that lets you define shortcuts/aliases bundling hostname, username, port, and identity file, so you can type a short alias instead of the full connection command. It has no effect on the remote machine - it's purely local convenience.
6. Because WSL2 sits behind NAT on the Windows host, so incoming connections from other devices on the network aren't routed to it by default - only outbound connections from WSL2 work without extra configuration.
7. `ssh` opens an interactive remote shell session for running commands; `scp` uses the same SSH authentication to copy files to or from a remote machine instead of giving you a shell. They share credentials/keys but serve different purposes (interactive session vs. file transfer).

</details>

## Next

Continue to [14-logging-and-journald](../14-logging-and-journald/README.md) to learn how to read system logs and dig deep into journald, the log system behind the services you started managing in module 11.
