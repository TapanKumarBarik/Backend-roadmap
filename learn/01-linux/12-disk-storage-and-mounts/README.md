# Disk, Storage, and Mounts

## Why this matters

Every server you'll ever operate eventually runs low on disk space, mounts the wrong volume, or fills up a log directory until something crashes. Knowing how to see what's using space, understand what a "mount" actually is, and tell a hard link from a symlink is the difference between a two-minute fix and a confused escalation. In WSL2 this also matters for a Windows-specific reason: your Linux filesystem lives inside a virtual disk file that Windows manages, and that file has its own quirks around growing and shrinking.

## Concepts

**Filesystems and mounting.** A filesystem is the structure that organizes data on a storage device - it's how the raw bytes on a disk become "files" and "directories" you can navigate. "Mounting" is the act of attaching a filesystem to a specific point in your existing directory tree so you can reach it by path. Nothing is available until it's mounted somewhere. When Ubuntu boots, it mounts its root filesystem at `/`, and typically mounts other things (like a separate partition, a USB drive, or - in WSL2's case - your Windows drives) at other points underneath `/`.

**The /mnt convention in WSL2.** You've already used `/mnt/c` to reach your `C:` drive from earlier modules. This is exactly the mounting concept in action: WSL2 takes the Windows filesystem and mounts it at `/mnt/c` (and `/mnt/d`, etc., for other drives), so from Linux's point of view, your Windows files are just another directory tree grafted onto the Linux one. This is why `cd /mnt/c/Users/yourname` gets you to your Windows user folder. The reverse isn't automatic in the same way - Windows sees your WSL2 filesystem through the special `\\wsl$\` or `\\wsl.localhost\` network path, not as a normal drive letter, because the Linux filesystem actually lives inside a virtual disk.

**The WSL2 virtual disk.** Your entire Ubuntu installation - `/`, `/home`, `/var`, everything except `/mnt/c` and friends - physically lives inside a single file on your Windows machine called `ext4.vhdx` (a virtual hard disk). WSL2 runs a real, lightweight Linux kernel in a lightweight VM, and that VM's "disk" is this file. This matters for two practical reasons covered in the exercises below: `df -h` inside WSL2 will show usage for this virtual disk, and the `.vhdx` file grows as you use more space but does **not** automatically shrink back down when you delete files.

**Disk usage vs. individual file/directory size.** `df` (disk free) reports usage at the filesystem level - how full each mounted filesystem is, as a whole. `du` (disk usage) reports how much space specific files or directories are consuming, so you can find out *what* is eating the space that `df` says is full. These two tools answer different questions and you'll usually use them together: `df` tells you there's a problem, `du` helps you find where.

**Inodes, briefly.** Every file and directory on a Linux filesystem has metadata - permissions, owner, timestamps, and pointers to where its actual data blocks live - stored in a structure called an inode. The filename you see is really just a label pointing at an inode number. This matters because a filesystem can theoretically run out of inodes (too many small files) even when there's plenty of raw disk space left, though this is rare for a beginner to hit directly. The important takeaway for now: a "file" is really "a name pointing at an inode," and that's what makes hard links possible (see below).

**Hard links vs. symbolic links.** A hard link is a second filename pointing at the *same inode* as an existing file - it's not a copy, it's another name for the identical data on disk. If you edit through one name, the other name shows the same change, because they're the same underlying file. Delete one name, the data survives as long as at least one link remains. A symbolic link (symlink) is different: it's a small special file that just contains a path, pointing at another file by name. If you delete the target, the symlink still exists but becomes "broken" (dangling), because it never held the data itself, just a reference to a path. Think of a hard link as two street addresses for the identical house, and a symlink as a signpost pointing toward an address - if the house at that address gets demolished, the signpost is still standing but now points at nothing.

**Mounting and unmounting.** `mount` (with no arguments) lists everything currently mounted; with arguments it attaches a filesystem to a directory (a "mount point"). `umount` detaches it. You won't typically need to mount/unmount things by hand in ordinary WSL2 use since Windows drives are already mounted for you, but understanding the command matters for external drives, ISO images, and (later in this curriculum) container volumes and Kubernetes persistent storage, which are all built on this same mounting concept.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `df -h` | Shows disk space usage for all mounted filesystems, human-readable (`-h` = sizes in KB/MB/GB instead of raw bytes) | `df -h` |
| `du -sh <path>` | Shows total disk usage of a directory, summarized (`-s` = summary only, one line) and human-readable (`-h`) | `du -sh /var/log` |
| `du -h --max-depth=1 <path>` | Shows disk usage broken down one level deep, so you can see which subdirectory is the biggest | `du -h --max-depth=1 /home/yourname` |
| `lsblk` | Lists block devices (disks and partitions) and their mount points as a tree | `lsblk` |
| `fdisk -l` | Lists partition tables on disks in detail (requires `sudo`); more low-level than `lsblk` | `sudo fdisk -l` |
| `mount` | With no arguments, lists all currently mounted filesystems; with arguments, mounts a device or image at a mount point | `mount \| grep ext4` |
| `umount <path>` | Unmounts a filesystem from the given mount point | `sudo umount /mnt/mydrive` |
| `ln <target> <linkname>` | Creates a hard link named `linkname` pointing at the same inode as `target` | `ln original.txt hardlink.txt` |
| `ln -s <target> <linkname>` | Creates a symbolic link named `linkname` that stores the path to `target` (`-s` = symbolic) | `ln -s /mnt/c/Users/you/notes.txt mynotes` |
| `stat <file>` | Shows detailed metadata about a file, including its inode number | `stat myfile.txt` |
| `wsl --shutdown` | (Run from Windows, not WSL2) Fully shuts down all WSL2 instances and the underlying lightweight VM | `wsl --shutdown` |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Run `df -h` and look at the output. Find the line for `/` (your root filesystem). Note the `Size`, `Used`, `Avail`, and `Use%` columns. This is your WSL2 virtual disk.

2. Run `df -h /mnt/c`. Compare its `Filesystem` column to the one for `/`. They should look different (one is likely reported as `drvfs`, the WSL2 driver for Windows drives, versus `ext4` for the native Linux disk) - this confirms `/mnt/c` is a genuinely different, separately-mounted filesystem grafted into your tree, not part of your Linux disk.

3. Run `mount | grep -E "on / |on /mnt/c"` and read the two lines. Note the filesystem type shown in parentheses for each (for example `ext4` vs `drvfs` or `9p`). This is the mount command confirming what `df` told you.

4. Run `lsblk`. In WSL2, this output is often minimal or shows only a couple of virtual devices, unlike on a physical machine where you'd see real disks and partitions - WSL2 abstracts the underlying storage, so don't expect a rich device tree here. Make a note in your own words of what you see (or don't see).

5. Run `sudo fdisk -l 2>&1 | head -30`. Again, in WSL2 this may show little or nothing useful compared to bare-metal Linux, because the virtual disk isn't exposed as a raw block device the same way. This is expected - the exercise is to see the limitation firsthand, not to get rich output.

6. Find what's using space in your home directory. Run:
   ```
   du -h --max-depth=1 ~ 2>/dev/null | sort -rh
   ```
   Read this left to right: `du` computes usage, `--max-depth=1` limits it to immediate subdirectories, `2>/dev/null` throws away "permission denied" noise (from module 07), and `sort -rh` sorts human-readable sizes in reverse (largest first, from module 08). Identify your largest subdirectory.

7. Create a test file and both kinds of links, then prove they behave differently:
   ```
   cd ~
   mkdir -p linktest && cd linktest
   echo "original data" > original.txt
   ln original.txt hardlink.txt
   ln -s original.txt symlink.txt
   ls -li
   ```
   Look at the first column (the inode number) in the `ls -li` output. `original.txt` and `hardlink.txt` should show the **same** inode number. `symlink.txt` will show a different inode number and its own line will display `symlink.txt -> original.txt`.

8. Now break the symlink on purpose. Run:
   ```
   rm original.txt
   cat hardlink.txt
   cat symlink.txt
   ```
   `cat hardlink.txt` should still print `original data` - the data survived because the hard link is another name for the same inode. `cat symlink.txt` should fail with something like `cat: symlink.txt: No such file or directory` - the symlink pointed at a path that no longer resolves. Read that error message carefully; this is the "dangling symlink" failure mode you'll now recognize instantly in the future.

9. Fix the dangling symlink by recreating what it points to, then verify:
   ```
   echo "new data" > original.txt
   cat symlink.txt
   ```
   The symlink works again because the path it stores now resolves to a real file again.

10. Clean up and check overall usage reporting one more time: run `cd ~ && rm -rf linktest` then `df -h /`. Confirm the filesystem is still mounted and note that deleting a few small files barely moves the `Used`/`Avail` numbers - real space investigations need `du` on larger directories, which is why you practiced step 6.

## Common mistakes & troubleshooting

- **Expecting `lsblk` or `fdisk -l` to show a real disk layout in WSL2.** They usually won't, because WSL2 storage is virtualized differently than bare-metal Linux. Don't assume your WSL2 skills transfer 1:1 to disk partitioning on a real server without checking - the concepts do, the specific output often won't.
- **Confusing `df` and `du`.** `df` tells you how full a filesystem is overall; `du` tells you how big a specific directory or file is. If `df` says you're low on space, use `du` to hunt down the culprit - don't expect `df` itself to tell you *what* is using the space.
- **Forgetting `-h` and reading raw byte counts as if they were KB.** Without `-h`, both commands print raw block counts, which are easy to misread. Always use `-h` unless you have a specific scripting reason not to.
- **Deleting the target of a hard link and expecting the other name to disappear too.** It won't - that's the entire point of a hard link. Only when *all* names (links) to an inode are removed does the underlying data actually get freed.
- **Deleting the target of a symlink and being surprised it "breaks."** A symlink holds a path, not data. If you move or rename the target instead of deleting it, the symlink breaks the same way - it doesn't track renames.
- **Expecting the WSL2 virtual disk to shrink automatically after deleting large files.** The `.vhdx` file grows as needed but does not shrink itself back down by default. If you need to reclaim that Windows-side disk space, you run `wsl --shutdown` from a Windows PowerShell/CMD prompt (not from inside Ubuntu) to fully stop the VM, and then optionally compact the `.vhdx` using Windows' `diskpart` tool (an advanced, occasional-maintenance step, not something you need for daily work).
- **Running `mount` or `umount` on system paths without understanding the effect.** Unmounting `/` or `/mnt/c` while you're actively using them can break your shell session. Practice mount/unmount concepts on things you create yourself, not on paths you rely on.

## Checkpoint quiz

1. What's the conceptual difference between what `df` reports and what `du` reports?
2. Why does `/mnt/c` show a different filesystem type than `/` when you run `df -h` or `mount`?
3. If you have a hard link and a symlink both pointing at the same original file, and you delete the original file, what happens to each link and why?
4. What is an inode, in your own words?
5. Why might `lsblk` and `fdisk -l` show little useful output inside WSL2 compared to a physical Linux machine?
6. You deleted a 20 GB file inside WSL2 but Windows still shows your `ext4.vhdx` file as just as large as before. Is this a bug? What would you do about it?
7. You run `du -h --max-depth=1 /var | sort -rh` and see `/var/log` is unusually large. What would your next command be to find the specific file(s) responsible?

<details>
<summary>Show answers</summary>

1. `df` reports how full entire mounted filesystems are (aggregate space used/available per filesystem); `du` reports how much disk space a specific file or directory tree consumes. `df` tells you there's a space problem at the filesystem level; `du` helps you locate which files/directories are responsible.
2. Because they're genuinely different filesystems mounted at different points: `/` is the native Linux `ext4` filesystem living inside the WSL2 virtual disk, while `/mnt/c` is Windows' NTFS filesystem exposed into WSL2 through a translation driver (commonly shown as `drvfs` or `9p`), not a native Linux filesystem.
3. The hard link still works and shows the original content, because a hard link is another name for the same inode/data - the data isn't gone until every hard link to it is removed. The symlink breaks ("No such file or directory") because it only stored a path to the original filename, and that path no longer resolves to anything.
4. An inode is the metadata structure the filesystem uses to represent a file - permissions, owner, timestamps, and pointers to the actual data blocks. A filename is just a label that points at an inode; multiple filenames (hard links) can point at the same inode.
5. Because WSL2 doesn't expose real physical disks/partitions to the Linux kernel the way bare metal does - the Linux filesystem lives inside a single virtual disk file managed by the Windows host, so there isn't a rich set of real block devices/partitions for these tools to enumerate.
6. Not a bug - it's expected behavior. The WSL2 virtual disk (`ext4.vhdx`) grows to accommodate data but doesn't automatically shrink when you free space. To reclaim the space on the Windows side, shut down WSL2 with `wsl --shutdown` (from Windows, not Ubuntu) and optionally compact the `.vhdx` file using Windows' `diskpart`.
7. `du -h --max-depth=1 /var/log | sort -rh` to drill one level further into `/var/log` and see which specific log subdirectory or file is large, repeating/drilling down as needed until you find the actual large file(s).

</details>

## Next

Continue to [13-ssh-remote-access](../13-ssh-remote-access/README.md) to learn how to securely connect to and from remote machines using SSH.
