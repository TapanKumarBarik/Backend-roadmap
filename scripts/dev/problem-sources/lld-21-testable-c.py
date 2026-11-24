PROBLEMS = [
P(
    slug='lld-testable-daily-deal', title='Testable Deal of the Day', topic='lld-testable-design', difficulty='intermediate',
    module='lld/05-core-design-principles/README.md',
    description='Refactor a deal-of-the-day picker that reads the real date and real randomness so both can be injected, then add no-repeat and reroll rules.',
    statement=r'''The editor holds a `DealOfTheDay` that works, but nobody can test it: it asks the system for today's date (`datetime.date.today()`) and for a random choice (`random.choice`) itself. A test can neither move the date nor know which deal will come up. **Change it so both can be injected**, keep what it does by default, and add the rules below.

**Creating one:** `DealOfTheDay(deals, today=None, rng=None)`

- `deals` is a non-empty list of deals (any values). It is **copied**. An empty list is `ValueError("No deals")`.
- `today()` returns the current day (any value that can be compared with `==`). `None` means `datetime.date.today`. Use it for **every** reading of the day, once per call.
- `rng` is any object with a `choice(sequence)` method. `None` means `random.Random()`.

**Methods**

- `pick()` returns today's deal. The first call on a new day chooses one with `rng.choice` and remembers it; further calls the same day return the **same** deal and do **not** call `rng` again.
  - **No repeats:** the new deal must differ from the previous day's deal. Call `rng.choice` with the list of deals, in their original order, **without** the previous day's deal. If that leaves nothing (there is only one distinct deal), call it with all the deals.
- `reroll()` replaces today's deal and returns the new one. If no deal was picked today: `ValueError("Nothing picked today")`. The new deal must differ from **today's current deal and from the previous day's deal**: call `rng.choice` with the other deals in original order. If there are none: `ValueError("No other deal")` and nothing changes.
- `history` is a **new list** of `(day, deal)` tuples, one per day that has a deal, oldest first (a reroll replaces today's entry).''',
    starter=r'''import datetime
import random


class DealOfTheDay:
    def __init__(self, deals):
        self._deals = list(deals)
        self._last = None

    def pick(self):
        today = datetime.date.today()
        if self._last and self._last[0] == today:
            return self._last[1]
        deal = random.choice(self._deals)
        self._last = (today, deal)
        return deal''',
    tests=r'''import datetime
def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Day:
    def __init__(self, now=1):
        self.now = now
        self.reads = 0
    def __call__(self):
        self.reads += 1
        return self.now
class Rng:
    def __init__(self, *indexes):
        self.indexes = list(indexes)
        self.calls = []
    def choice(self, items):
        self.calls.append(list(items))
        return items[self.indexes.pop(0)]
assert error_of(DealOfTheDay, []) == "ValueError: No deals"
day = Day(1)
rng = Rng(1, 1, 0, 0, 0)
deals = ["a", "b", "c"]
shop = DealOfTheDay(deals, today=day, rng=rng)
deals.append("zzz")
assert shop.history == [] and day.reads == 0
assert shop.pick() == "b" and rng.calls == [["a", "b", "c"]] and day.reads == 1
assert shop.pick() == "b" and rng.calls == [["a", "b", "c"]] and day.reads == 2
day.now = 2
assert shop.pick() == "c" and rng.calls[-1] == ["a", "c"]
day.now = 3
assert shop.pick() == "a"
assert rng.calls == [["a", "b", "c"], ["a", "c"], ["a", "b"]]
assert shop.history == [(1, "b"), (2, "c"), (3, "a")]
log = shop.history
log.append("junk")
assert len(shop.history) == 3
assert shop.reroll() == "b" and rng.calls[-1] == ["b"] and shop.history[-1] == (3, "b") and len(shop.history) == 3
assert shop.pick() == "b"
day.now = 4
assert error_of(shop.reroll) == "ValueError: Nothing picked today" and len(shop.history) == 3
one = DealOfTheDay(["only"], today=Day(1), rng=Rng(0, 0, 0))
assert one.pick() == "only" and error_of(one.reroll) == "ValueError: No other deal" and one.history == [(1, "only")]
single_day = Day(1)
single = DealOfTheDay(["x"], today=single_day, rng=Rng(0, 0))
single.pick()
single_day.now = 2
assert single.pick() == "x" and single.history == [(1, "x"), (2, "x")]
two_day = Day(1)
two_rng = Rng(0, 0, 0)
two = DealOfTheDay(["p", "q"], today=two_day, rng=two_rng)
assert two.pick() == "p"
assert two.reroll() == "q" and two_rng.calls[-1] == ["q"]
assert error_of(two.reroll) is None and two_rng.calls[-1] == ["p"]
assert two.history == [(1, "p")]
two_day.now = 2
two_rng.indexes = [0, 0]
assert two.pick() == "q" and two_rng.calls[-1] == ["q"] and two.history == [(1, "p"), (2, "q")]
assert error_of(two.reroll) == "ValueError: No other deal" and two.history == [(1, "p"), (2, "q")]
tri_day = Day(1)
tri_rng = Rng(0, 0, 0, 0)
tri = DealOfTheDay(["a", "b", "c"], today=tri_day, rng=tri_rng)
tri.pick()
tri_day.now = 2
tri.pick()
assert tri.history[-1][1] == "b"
assert error_of(tri.reroll) is None and tri_rng.calls[-1] == ["c"] and tri.history[-1] == (2, "c")
rep = DealOfTheDay(["x", "x", "y"], today=Day(1), rng=Rng(0))
assert rep.pick() == "x"
dates = DealOfTheDay(["a", "b"], today=lambda: datetime.date(2030, 1, 5), rng=Rng(1))
assert dates.pick() == "b" and dates.history == [(datetime.date(2030, 1, 5), "b")]
real = DealOfTheDay(["a", "b", "c"])
first = real.pick()
assert first in ("a", "b", "c") and real.pick() == first and len(real.history) == 1 and real.history[0][0] == datetime.date.today()''',
    solution=r'''import datetime
import random


class DealOfTheDay:
    def __init__(self, deals, today=None, rng=None):
        deals = list(deals)
        if not deals:
            raise ValueError("No deals")
        self._deals = deals
        self._today = today if today is not None else datetime.date.today
        self._rng = rng if rng is not None else random.Random()
        self._history = []

    @property
    def history(self):
        return list(self._history)

    def pick(self):
        day = self._today()
        if self._history and self._history[-1][0] == day:
            return self._history[-1][1]
        previous = self._history[-1][1] if self._history else None
        candidates = [deal for deal in self._deals if deal != previous]
        if not candidates:
            candidates = list(self._deals)
        deal = self._rng.choice(candidates)
        self._history.append((day, deal))
        return deal

    def reroll(self):
        day = self._today()
        if not self._history or self._history[-1][0] != day:
            raise ValueError("Nothing picked today")
        current = self._history[-1][1]
        before = self._history[-2][1] if len(self._history) > 1 else None
        candidates = [deal for deal in self._deals if deal != current and deal != before]
        if not candidates:
            raise ValueError("No other deal")
        deal = self._rng.choice(candidates)
        self._history[-1] = (day, deal)
        return deal''',
    hints=[
        r'''Give the constructor two new parameters whose defaults are the real things: `today=None` becomes `datetime.date.today`, `rng=None` becomes `random.Random()`. Store them, and replace every direct call with `self._today()` and `self._rng.choice(...)`. Production code that writes `DealOfTheDay(deals)` behaves exactly as before.''',
        r'''Keep one list of `(day, deal)`. "Is there a deal for today" is `history[-1][0] == today`; "the previous day's deal" is the entry before today's (or the last one, when picking for a new day). That is all the state the new rules need.''',
        r'''Build the candidate list with a comprehension over `self._deals` so it keeps the original order, and pass **that list** to `choice`. A test with a scripted `rng` can then check exactly which deals were on offer. Read the day **once** per call.''',
    ],
    explanation=r'''**The idea.** Dates and randomness are *hidden inputs*. The original `pick` took two inputs that were not in its signature: the day and a random number. Code with hidden inputs can only be tested by luck. Making them parameters (with the real thing as the default) turns them into ordinary inputs.

```mermaid
classDiagram
    class DealOfTheDay {
        +pick()
        +reroll()
        +history
    }
    class Today {
        <<callable>>
        +call() day
    }
    class Rng {
        <<object>>
        +choice(items)
    }
    DealOfTheDay --> Today : injected
    DealOfTheDay --> Rng : injected
```

**What the fakes bought.** The scripted `Rng` picks an index, so the test knows the outcome *and* records the list it was given. That is how "never yesterday's deal" is checked exactly: the second call must have been offered `["a", "c"]`, not `["a", "b", "c"]`. With real randomness you would have to run the test a thousand times and hope.

**Same-day calls do not draw again.** Asking twice must not change the deal, and a fake that counts calls proves it. The original stored the day for the same reason, but nothing could check it.

**Defaults keep behaviour.** `DealOfTheDay(deals)` still uses the real date and a real random generator, and the last test checks that it still returns one stable deal per day.

**Complexity.** Each call is O(number of deals).

**Going further.** `rng.choice` is only one way to use randomness. A weighted choice needs `random.choices`. What would the injected object's interface become, and would the tests still be readable?''',
),
P(
    slug='lld-testable-backup-rotation', title='Testable Backup Rotation', topic='lld-testable-design', difficulty='advanced',
    module='lld/05-core-design-principles/README.md',
    description='Refactor a backup rotator that writes real files and reads the real clock so both are injected, fix its sorting bug and make same-second saves safe.',
    statement=r'''The editor holds a `BackupRotator` that works on a small folder, but it cannot be tested: it writes real files (`open`, `os.listdir`, `os.remove`) and reads the real clock (`time.time()`). It also has two bugs nobody noticed because nobody could test it. **Change it so the file system and the clock can be injected**, fix the bugs, and add `latest` and `count`.

**Creating one:** `BackupRotator(folder, keep=3, fs=None, clock=time.time)`

- `folder` must be a non-empty string, else `ValueError("Folder required")`. A trailing `/` is ignored. A file's path is `folder + "/" + filename`.
- `keep` must be an `int` of 1 or more (not a `bool`), else `ValueError("Keep must be positive")`. Check `folder` first.
- `clock()` returns the time in seconds; read it **once** per `save`. `fs` is any object with `write(path, text)`, `read(path)`, `names(folder)` (the file names in a folder, in any order) and `remove(path)`. `None` means the real disk (`open` and `os`).

**Methods**

- `save(name, text)` writes a backup and returns its path. `name` must match letters, digits and `_` only (`ValueError("Bad name")`). The file is called `<name>-<stamp>.bak` where `stamp = int(clock())`. If a backup of that name **already has the same stamp**, the new one is `<name>-<stamp>-1.bak` (then `-2`, ...): saves in the same second never overwrite each other.
  After writing, delete the **oldest** backups **of that name** until only `keep` remain. Order is by stamp **as a number** (so `99` is older than `100`), then by the suffix number. Backups of other names, and files that do not match `<name>-<digits>[-<digits>].bak`, are never touched. **Write first, delete after**: if the write fails, nothing is deleted and the error propagates.
- `latest(name)` returns the text of the newest backup of that name, or `ValueError("No backup for <name>")`. A bad name is `"Bad name"`.
- `count(name)` is how many backups of that name exist (bad name: `"Bad name"`).''',
    starter=r'''import os
import time


class BackupRotator:
    def __init__(self, folder, keep=3):
        self.folder = folder
        self.keep = keep

    def save(self, name, text):
        stamp = int(time.time())
        path = os.path.join(self.folder, f"{name}-{stamp}.bak")
        with open(path, "w") as handle:
            handle.write(text)
        files = sorted(f for f in os.listdir(self.folder) if f.startswith(name + "-"))
        for old in files[:-self.keep]:
            os.remove(os.path.join(self.folder, old))
        return path''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class MemFs:
    def __init__(self, files=()):
        self.files = {path: "" for path in files}
        self.log = []
        self.fail_write = False
    def write(self, path, text):
        self.log.append(("write", path))
        if self.fail_write:
            raise OSError("disk full")
        self.files[path] = text
    def read(self, path):
        self.log.append(("read", path))
        return self.files[path]
    def names(self, folder):
        prefix = folder + "/"
        return [path[len(prefix):] for path in self.files if path.startswith(prefix)]
    def remove(self, path):
        self.log.append(("remove", path))
        del self.files[path]
class Clock:
    def __init__(self, now=0):
        self.now = now
        self.reads = 0
    def __call__(self):
        self.reads += 1
        return self.now
assert error_of(BackupRotator, "") == "ValueError: Folder required"
assert error_of(BackupRotator, None) == "ValueError: Folder required"
for bad in (0, -1, 1.5, True):
    assert error_of(BackupRotator, "/b", bad) == "ValueError: Keep must be positive"
assert error_of(BackupRotator, "", 0) == "ValueError: Folder required"
fs = MemFs()
clock = Clock(100)
rot = BackupRotator("/b/", keep=2, fs=fs, clock=clock)
assert error_of(rot.save, "bad name", "x") == "ValueError: Bad name" and error_of(rot.save, "", "x") == "ValueError: Bad name" and error_of(rot.save, "a-b", "x") == "ValueError: Bad name"
assert error_of(rot.save, 5, "x") == "ValueError: Bad name" and fs.log == [] and clock.reads == 0
assert error_of(rot.latest, "bad name") == "ValueError: Bad name" and error_of(rot.count, "bad name") == "ValueError: Bad name"
assert rot.count("db") == 0 and error_of(rot.latest, "db") == "ValueError: No backup for db"
assert rot.save("db", "one") == "/b/db-100.bak" and fs.files == {"/b/db-100.bak": "one"} and clock.reads == 1
clock.now = 101.9
assert rot.save("db", "two") == "/b/db-101.bak" and rot.count("db") == 2
clock.now = 99
assert rot.save("db", "old") == "/b/db-99.bak"
assert sorted(fs.files) == ["/b/db-100.bak", "/b/db-101.bak"] and ("remove", "/b/db-99.bak") in fs.log
assert rot.latest("db") == "two"
clock.now = 100
assert rot.save("db", "three") == "/b/db-100-1.bak"
assert sorted(fs.files) == ["/b/db-100-1.bak", "/b/db-101.bak"] and fs.files["/b/db-100-1.bak"] == "three"
assert rot.latest("db") == "two" and rot.count("db") == 2
fs2 = MemFs()
clock2 = Clock(5)
rot2 = BackupRotator("/data", keep=3, fs=fs2, clock=clock2)
for text in ("a", "b", "c"):
    rot2.save("x", text)
assert sorted(fs2.files) == ["/data/x-5-1.bak", "/data/x-5-2.bak", "/data/x-5.bak"]
assert fs2.files["/data/x-5.bak"] == "a" and fs2.files["/data/x-5-1.bak"] == "b" and fs2.files["/data/x-5-2.bak"] == "c"
rot2.save("x", "d")
assert sorted(fs2.files) == ["/data/x-5-1.bak", "/data/x-5-2.bak", "/data/x-5-3.bak"] and rot2.latest("x") == "d"
rot2.save("x", "e")
assert sorted(fs2.files) == ["/data/x-5-2.bak", "/data/x-5-3.bak", "/data/x-5-4.bak"]
fs3 = MemFs(["/b/db-1.bak", "/b/dbx-1.bak", "/b/db-notes.txt", "/b/db-2.bak.bak", "/b/other-1.bak", "/b/db-1-x.bak", "/c/db-0.bak"])
rot3 = BackupRotator("/b", keep=1, fs=fs3, clock=Clock(9))
assert rot3.count("db") == 1 and rot3.count("dbx") == 1 and rot3.count("other") == 1
rot3.save("db", "new")
assert sorted(fs3.files) == sorted(["/b/db-9.bak", "/b/db-1-x.bak", "/b/db-2.bak.bak", "/b/db-notes.txt", "/b/dbx-1.bak", "/b/other-1.bak", "/c/db-0.bak"])
assert ("remove", "/b/db-1.bak") in fs3.log and len([entry for entry in fs3.log if entry[0] == "remove"]) == 1
fs4 = MemFs()
rot4 = BackupRotator("/z", keep=1, fs=fs4, clock=Clock(10))
rot4.save("n", "keep me")
fs4.fail_write = True
fs4.log.clear()
assert error_of(rot4.save, "n", "lost") == "OSError: disk full"
assert fs4.files == {"/z/n-10.bak": "keep me"} and fs4.log == [("write", "/z/n-10-1.bak")]
fs4.fail_write = False
rot4.save("n", "again")
assert fs4.files == {"/z/n-10-1.bak": "again"}
fs5 = MemFs()
rot5 = BackupRotator("/q", keep=5, fs=fs5, clock=Clock(1000))
for stamp in (9, 10, 99, 100, 101):
    fs5.files["/q/log-" + str(stamp) + ".bak"] = str(stamp)
assert rot5.count("log") == 5 and rot5.latest("log") == "101"
other_clock = Clock(50)
rot6 = BackupRotator("/q", keep=5, fs=fs5, clock=other_clock)
rot6.save("log", "fifty")
assert sorted(name for name in fs5.files) == sorted(["/q/log-10.bak", "/q/log-99.bak", "/q/log-100.bak", "/q/log-101.bak", "/q/log-50.bak"])
assert "/q/log-9.bak" not in fs5.files and rot6.latest("log") == "101"
assert error_of(BackupRotator("/tmp/not-used").count, "bad name") == "ValueError: Bad name"''',
    solution=r'''import os
import re
import time

_NAME = re.compile(r"^[A-Za-z0-9_]+$")
_FILE = re.compile(r"^([A-Za-z0-9_]+)-(\d+)(?:-(\d+))?\.bak$")


class _DiskFs:
    def write(self, path, text):
        with open(path, "w") as handle:
            handle.write(text)

    def read(self, path):
        with open(path) as handle:
            return handle.read()

    def names(self, folder):
        return os.listdir(folder)

    def remove(self, path):
        os.remove(path)


class BackupRotator:
    def __init__(self, folder, keep=3, fs=None, clock=time.time):
        if not isinstance(folder, str) or not folder:
            raise ValueError("Folder required")
        if type(keep) is not int or keep < 1:
            raise ValueError("Keep must be positive")
        self._folder = folder.rstrip("/")
        self._keep = keep
        self._fs = fs if fs is not None else _DiskFs()
        self._clock = clock

    @staticmethod
    def _check(name):
        if not isinstance(name, str) or not _NAME.match(name):
            raise ValueError("Bad name")

    def _path(self, filename):
        return self._folder + "/" + filename

    def _backups(self, name):
        found = []
        for filename in self._fs.names(self._folder):
            match = _FILE.match(filename)
            if match and match.group(1) == name:
                found.append(((int(match.group(2)), int(match.group(3) or 0)), filename))
        found.sort()
        return found

    def save(self, name, text):
        self._check(name)
        stamp = int(self._clock())
        existing = self._backups(name)
        same = [key[1] for key, _ in existing if key[0] == stamp]
        number = max(same) + 1 if same else 0
        filename = f"{name}-{stamp}.bak" if number == 0 else f"{name}-{stamp}-{number}.bak"
        path = self._path(filename)
        self._fs.write(path, text)
        existing.append(((stamp, number), filename))
        existing.sort()
        for _, old in existing[:-self._keep]:
            self._fs.remove(self._path(old))
        return path

    def count(self, name):
        self._check(name)
        return len(self._backups(name))

    def latest(self, name):
        self._check(name)
        backups = self._backups(name)
        if not backups:
            raise ValueError("No backup for " + name)
        return self._fs.read(self._path(backups[-1][1]))''',
    hints=[
        r'''Everything the class touches in the outside world goes through two objects: `self._fs` (write, read, names, remove) and `self._clock`. The default `fs` is a tiny class that wraps `open` and `os`; the defaults keep production behaviour.''',
        r'''The two old bugs: text sorting (`"x-99"` sorts after `"x-100"`) and overwriting a file saved in the same second. Fix both by *parsing* each file name into `(name, stamp, number)` with a regular expression and sorting by the **numbers**. The next number for a stamp is the highest number already used for it, plus one.''',
        r'''Order matters for safety: compute the new file name, **write it**, and only then remove old ones. If `write` raises, nothing was removed. Only consider files whose whole name matches the pattern for **this** `name`, so other names and stray files are never deleted.''',
    ],
    explanation=r'''**The idea.** Two hidden inputs, the disk and the clock. A fake file system is just a dictionary with the four methods, so the test can create files in any state (`x-99`, `x-100`, a stray `notes.txt`) and look at what was written and removed, with no temp folders and no cleanup.

**What the tests found.** Because the file system is in memory, the old code's two bugs became one-line tests: files named `99` and `100` (text order is wrong), and two saves in the same second (the second overwrote the first). Neither shows up on a developer's machine, where saves are minutes apart.

**Parse, do not guess.** `startswith(name + "-")` treats `db-notes.txt` and `dbx-1.bak` as backups of `db` in subtle ways. A regular expression for the *whole* file name makes "is this one of ours" an exact question.

**Write first, delete after.** If the new backup cannot be written, deleting the old ones would leave you with no backup at all. The test makes the fake `write` raise and checks that nothing was removed.

**The clock is read once.** Reading it twice in one call can straddle a second boundary and produce a name that does not match the one you computed.

**Complexity.** `save` lists the folder, O(files); sorting adds O(n log n).

**Going further.** Real disks fail halfway. How would you write the file under a temporary name and rename it, and what does the fake `fs` need to gain?''',
),
P(
    slug='lld-testable-feature-flags', title='Testable Feature Flags', topic='lld-testable-design', difficulty='intermediate',
    module='lld/05-core-design-principles/README.md',
    description='Refactor feature flags that read the process environment, a hash and print so the environment, bucketing and logging are injected.',
    statement=r'''The editor holds a `FeatureFlags` that works but cannot be tested: it reads the real process environment (`os.environ`), hashes users itself and prints problems. **Change it so the environment, the bucketing function and the logger can be injected**, keep the defaults, and add overrides.

**Creating one:** `FeatureFlags(env=None, bucket=None, log=None)`

- `env` is a mapping (it has `.get`). `None` means `os.environ`. Read it **at call time** (never copy it), so a change to the mapping is seen by the next call.
- `bucket(flag, user)` returns a whole number from 0 to 99 for a user. `None` means the default: `int(sha256((flag + ":" + user).encode()).hexdigest(), 16) % 100`.
- `log(message)` receives problems. `None` means `print`.

**Methods**

- `is_on(flag, user)`: `flag` and `user` must be non-blank strings, else `ValueError("Flag required")` / `ValueError("User required")` (flag first). Then, in this order:
  1. an **override** for `(flag, user)` wins;
  2. the setting is `env.get("FLAG_" + flag.upper())`; an unset flag is **off**;
  3. the value, stripped and in lower case: `"on"` is on, `"off"` is off (the bucketing function is **not** called for these); a whole number written with ASCII digits from `0` to `100` means a **percentage**: the user is on when `bucket(flag, user) < percent`;
  4. anything else (`"yes"`, `"150"`, `"-5"`, `"5%"`, empty) is off, and `log("Bad value for <flag>: <raw value>")` is called once.
- `override(flag, user, value)` forces the answer for one user; `value` must be `True` or `False` (a bool), else `ValueError("Override must be True or False")` (check `flag` and `user` first, as above).
- `clear_override(flag, user)` removes it (nothing happens if there was none).''',
    starter=r'''import hashlib
import os


class FeatureFlags:
    def is_on(self, flag, user):
        raw = os.environ.get("FLAG_" + flag.upper(), "off")
        if raw == "on":
            return True
        if raw == "off":
            return False
        percent = int(raw)
        bucket = int(hashlib.md5((flag + user).encode()).hexdigest(), 16) % 100
        return bucket < percent''',
    tests=r'''import contextlib
import hashlib
import io
import os
def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Spy:
    def __init__(self, value=0):
        self.value = value
        self.calls = []
    def __call__(self, flag, user):
        self.calls.append((flag, user))
        return self.value
env = {}
bucket = Spy(30)
lines = []
flags = FeatureFlags(env=env, bucket=bucket, log=lines.append)
assert error_of(flags.is_on, "", "u") == "ValueError: Flag required" and error_of(flags.is_on, None, "u") == "ValueError: Flag required"
assert error_of(flags.is_on, "f", "") == "ValueError: User required" and error_of(flags.is_on, "f", " ") == "ValueError: User required" and error_of(flags.is_on, "", "") == "ValueError: Flag required"
assert flags.is_on("beta", "asha") is False and bucket.calls == [] and lines == []
env["FLAG_BETA"] = "on"
assert flags.is_on("beta", "asha") is True and flags.is_on("BETA", "x") is True
env["FLAG_BETA"] = " On "
assert flags.is_on("beta", "asha") is True
env["FLAG_BETA"] = "OFF"
assert flags.is_on("beta", "asha") is False and bucket.calls == [] and lines == []
env["FLAG_BETA"] = "31"
assert flags.is_on("beta", "asha") is True and bucket.calls == [("beta", "asha")]
env["FLAG_BETA"] = "30"
assert flags.is_on("beta", "asha") is False
env["FLAG_BETA"] = "100"
assert flags.is_on("beta", "asha") is True
env["FLAG_BETA"] = "0"
assert flags.is_on("beta", "asha") is False
env["FLAG_BETA"] = " 50 "
assert flags.is_on("beta", "asha") is True
bucket.value = 99
env["FLAG_BETA"] = "100"
assert flags.is_on("beta", "asha") is True and lines == []
env["FLAG_BETA"] = "99"
assert flags.is_on("beta", "asha") is False
assert flags.is_on("beta", "u1") is False and bucket.calls[-1] == ("beta", "u1")
for raw in ("yes", "150", "-5", "5%", "", "1.5", "x1", " YES "):
    env["FLAG_BETA"] = raw
    lines.clear()
    assert flags.is_on("beta", "asha") is False and lines == ["Bad value for beta: " + raw]
superscript = chr(0xB2)
env["FLAG_BETA"] = superscript
lines.clear()
assert flags.is_on("beta", "asha") is False and lines == ["Bad value for beta: " + superscript]
env["FLAG_TWO_WORDS"] = "on"
assert flags.is_on("two_words", "u") is True
env["FLAG_BETA"] = "on"
flags.override("beta", "ben", False)
assert flags.is_on("beta", "ben") is False and flags.is_on("beta", "asha") is True
flags.override("gamma", "ben", True)
assert flags.is_on("gamma", "ben") is True and flags.is_on("gamma", "zed") is False
before = list(bucket.calls)
env["FLAG_BETA"] = "bad"
lines.clear()
assert flags.is_on("beta", "ben") is False and lines == [] and bucket.calls == before
flags.override("beta", "ben", True)
assert flags.is_on("beta", "ben") is True and lines == []
flags.clear_override("beta", "ben")
assert flags.is_on("beta", "ben") is False and lines == ["Bad value for beta: bad"]
flags.clear_override("beta", "never")
for bad in (1, 0, None, "yes"):
    assert error_of(flags.override, "beta", "ben", bad) == "ValueError: Override must be True or False"
assert error_of(flags.override, "", "ben", 1) == "ValueError: Flag required" and error_of(flags.override, "beta", "", 1) == "ValueError: User required"
assert error_of(flags.clear_override, "", "x") == "ValueError: Flag required" and error_of(flags.clear_override, "x", "") == "ValueError: User required"
other = FeatureFlags(env={"FLAG_BETA": "on"}, bucket=bucket, log=lines.append)
assert other.is_on("beta", "ben") is True
live = {}
late = FeatureFlags(env=live)
live["FLAG_LATE"] = "on"
assert late.is_on("late", "u") is True
def reference(flag, user):
    return int(hashlib.sha256((flag + ":" + user).encode()).hexdigest(), 16) % 100
pct = {"FLAG_X": "50"}
hashed = FeatureFlags(env=pct)
for user in ("asha", "ben", "cy", "dee", "eli", "fay", "gus", "hal"):
    assert hashed.is_on("x", user) == (reference("x", user) < 50) and hashed.is_on("x", user) == hashed.is_on("x", user)
assert len({hashed.is_on("x", "user" + str(n)) for n in range(40)}) == 2
os.environ["FLAG_ZZ_TEST_ONLY"] = "on"
try:
    assert FeatureFlags().is_on("zz_test_only", "u") is True
    os.environ["FLAG_ZZ_TEST_ONLY"] = "nonsense"
    printed = io.StringIO()
    with contextlib.redirect_stdout(printed):
        assert FeatureFlags().is_on("zz_test_only", "u") is False
    assert printed.getvalue().strip() == "Bad value for zz_test_only: nonsense"
finally:
    del os.environ["FLAG_ZZ_TEST_ONLY"]
assert FeatureFlags().is_on("zz_test_only", "u") is False''',
    solution=r'''import hashlib
import os


def _default_bucket(flag, user):
    return int(hashlib.sha256((flag + ":" + user).encode()).hexdigest(), 16) % 100


class FeatureFlags:
    def __init__(self, env=None, bucket=None, log=None):
        self._env = env if env is not None else os.environ
        self._bucket = bucket if bucket is not None else _default_bucket
        self._log = log if log is not None else print
        self._overrides = {}

    @staticmethod
    def _check(flag, user):
        if not isinstance(flag, str) or not flag.strip():
            raise ValueError("Flag required")
        if not isinstance(user, str) or not user.strip():
            raise ValueError("User required")

    def override(self, flag, user, value):
        self._check(flag, user)
        if type(value) is not bool:
            raise ValueError("Override must be True or False")
        self._overrides[(flag, user)] = value

    def clear_override(self, flag, user):
        self._check(flag, user)
        self._overrides.pop((flag, user), None)

    def is_on(self, flag, user):
        self._check(flag, user)
        if (flag, user) in self._overrides:
            return self._overrides[(flag, user)]
        raw = self._env.get("FLAG_" + flag.upper())
        if raw is None:
            return False
        text = raw.strip().lower()
        if text == "on":
            return True
        if text == "off":
            return False
        if text.isascii() and text.isdigit() and int(text) <= 100:
            return self._bucket(flag, user) < int(text)
        self._log("Bad value for " + flag + ": " + raw)
        return False''',
    hints=[
        r'''Three hidden inputs: the environment, the hash and the output. Make each a constructor argument that defaults to the real thing (`os.environ`, a small module-level function, `print`) and replace every direct use. Read `self._env` inside `is_on`, not in `__init__`, so a changed environment is seen.''',
        r'''Decide in the order of the statement: override, unset, `on`/`off`, number, anything else. Only the number branch calls the bucketing function, so a test can prove that `on` and `off` never hash anything.''',
        r'''`"²".isdigit()` is `True` (and `int("²")` raises). Check `text.isascii() and text.isdigit()` before converting, and keep `int(text) <= 100` in the same condition so `"150"` falls through to the "bad value" branch.''',
    ],
    explanation=r'''**The idea.** Configuration, hashing and logging are *effects on the world*: the first reads global state, the last writes to it. Passing them in turns the class into a pure decision: given an environment, a bucket and a logger, which answer?

**Why read the environment at call time.** Feature flags are meant to change while the program runs. Copying `env` in the constructor would freeze it; the test that changes the dictionary after construction pins this.

**Injecting the hash.** A test cannot know which of a million users falls under 30 percent, and does not need to: a fake `bucket` that returns 30 lets the test check the *comparison* at the boundary (30 is off for "30", on for "31"). A separate test checks that the default really is the documented formula.

**The old code's bugs.** It crashed with `ValueError` on `"yes"` (`int("yes")`), treated `"150"` as always on, and `md5` of `flag + user` made `("ab", "c")` and `("a", "bc")` collide. Writing the rules down and testing them removes all three.

**Overrides are the highest priority**, even above a bad value: a forced answer needs no parsing, so it must not log.

**Complexity.** `is_on` is O(1).

**Going further.** Sticky percentages: a user who was in at 20 percent must stay in at 30. Does your bucketing function guarantee that, and what would break it?''',
),
]
