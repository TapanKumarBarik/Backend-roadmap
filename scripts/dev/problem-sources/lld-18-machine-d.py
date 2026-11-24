PROBLEMS = [
P(
    slug='lld-bike-rental', title='Bike Rental Stations', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/17-ride-sharing/README.md',
    description='Run a bike-share network: stations with docks, one bike per rider, a free first half hour and block pricing after it.',
    statement=r'''Write a class `BikeRental` for a city bike-share. Money is whole **cents**; time comes from an injected `clock` (a function returning seconds), which you call once per successful `rent` or `return_bike` and never otherwise.

**Creating one:** `BikeRental(clock)`.

**Setting up**

- `add_station(name, docks)` creates a station with `docks` slots (an `int` of 1 or more, else `ValueError("Docks must be positive")`); a repeated name is `ValueError("Duplicate station")`. Check the name first.
- `add_bikes(station, count)` puts `count` new bikes in a station and returns their ids. Ids are `"B1"`, `"B2"`, ... across the whole network, in the order created. Checks in order: unknown station `"Unknown station"`, `count` not an `int` of 1 or more `"Count must be positive"`, more bikes than docks `"Not enough docks"`.

**Renting.** Each station is a **queue**: the bike that has been docked the longest goes out first, and a returned bike joins the back.

- `rent(user, station)` returns the bike id. Checks in order: `"Unknown station"`, `"Already renting"` (a rider holds one bike at a time), `"No bikes available"`.
- `return_bike(user, station)` docks the bike and returns the **fee**. Checks in order: `"Unknown station"`, `"No rental"`, `"Station is full"` (the rider keeps the bike).
- **Fee:** the first **1,800 seconds** are free; after that **100 cents for every started 900 seconds**. A ride of exactly 1,800 s costs 0; 1,801 s costs 100; 2,700 s costs 100; 2,701 s costs 200.

**Questions:** `bikes_at(station)`, `free_docks(station)`, `rental_of(user)` (the bike id or `None`) and `revenue`, the total of all fees. Questions about an unknown station raise `"Unknown station"`.''',
    starter=r'''class BikeRental:
    def __init__(self, clock):
        ...

    def add_station(self, name, docks):
        ...

    def add_bikes(self, station, count):
        """Create `count` bikes in the station; return their ids."""
        ...

    def rent(self, user, station):
        ...

    def return_bike(self, user, station):
        """Dock the bike; return the fee in cents."""
        ...

    def bikes_at(self, station):
        ...

    def free_docks(self, station):
        ...

    def rental_of(self, user):
        ...

    @property
    def revenue(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Clock:
    def __init__(self):
        self.now = 0
        self.reads = 0
    def __call__(self):
        self.reads += 1
        return self.now
clock = Clock()
city = BikeRental(clock)
assert error_of(city.add_station, "X", 0) == "ValueError: Docks must be positive" and error_of(city.add_station, "X", 1.5) == "ValueError: Docks must be positive" and error_of(city.add_station, "X", True) == "ValueError: Docks must be positive"
city.add_station("A", 2)
city.add_station("B", 3)
assert error_of(city.add_station, "A", 5) == "ValueError: Duplicate station" and error_of(city.add_station, "A", 0) == "ValueError: Duplicate station"
assert error_of(city.add_bikes, "Z", 1) == "ValueError: Unknown station" and error_of(city.add_bikes, "Z", 0) == "ValueError: Unknown station" and error_of(city.add_bikes, "A", 0) == "ValueError: Count must be positive" and error_of(city.add_bikes, "A", 1.5) == "ValueError: Count must be positive" and error_of(city.add_bikes, "A", True) == "ValueError: Count must be positive" and error_of(city.add_bikes, "A", 3) == "ValueError: Not enough docks"
assert city.bikes_at("A") == 0 and city.free_docks("A") == 2
assert city.add_bikes("A", 2) == ["B1", "B2"] and city.add_bikes("B", 1) == ["B3"]
assert city.bikes_at("A") == 2 and city.free_docks("A") == 0 and city.bikes_at("B") == 1 and city.free_docks("B") == 2
assert error_of(city.add_bikes, "A", 1) == "ValueError: Not enough docks"
assert error_of(city.bikes_at, "Z") == "ValueError: Unknown station" and error_of(city.free_docks, "Z") == "ValueError: Unknown station"
assert city.rental_of("ann") is None and city.revenue == 0
assert clock.reads == 0
clock.now = 1000
assert city.rent("ann", "A") == "B1"
assert clock.reads == 1 and city.rental_of("ann") == "B1" and city.bikes_at("A") == 1 and city.free_docks("A") == 1
assert error_of(city.rent, "ann", "Z") == "ValueError: Unknown station" and error_of(city.rent, "ann", "B") == "ValueError: Already renting" and error_of(city.rent, "ann", "A") == "ValueError: Already renting"
assert city.rent("bob", "A") == "B2"
assert error_of(city.rent, "cy", "A") == "ValueError: No bikes available"
assert clock.reads == 2
assert error_of(city.return_bike, "cy", "A") == "ValueError: No rental" and error_of(city.return_bike, "ann", "Z") == "ValueError: Unknown station"
clock.now = 2800
assert city.return_bike("ann", "B") == 0
assert city.rental_of("ann") is None and city.revenue == 0 and city.bikes_at("B") == 2
assert city.rent("cy", "B") == "B3"
clock.now = 2801
assert city.return_bike("bob", "A") == 100
assert city.bikes_at("A") == 1 and city.revenue == 100
clock.now = 5500
assert city.return_bike("cy", "A") == 100
assert city.bikes_at("A") == 2 and city.free_docks("A") == 0
assert city.rent("dan", "B") == "B1"
reads = clock.reads
assert error_of(city.return_bike, "dan", "A") == "ValueError: Station is full"
assert city.rental_of("dan") == "B1" and city.bikes_at("A") == 2
assert error_of(city.return_bike, "eve", "A") == "ValueError: No rental" and clock.reads == reads
clock.now = 5501
assert city.return_bike("dan", "B") == 0
assert clock.reads == reads + 1
assert city.rent("fay", "A") == "B2" and city.rent("gil", "A") == "B3"
clock.now = 5501 + 1801
assert city.return_bike("fay", "B") == 100
clock.now = 5501 + 2700
assert city.return_bike("gil", "B") == 100
clock.now = 10000
assert city.rent("hal", "B") == "B1"
clock.now = 10000 + 2701
assert city.return_bike("hal", "A") == 200
clock.now = 20000
assert city.rent("ivy", "A") == "B1"
clock.now = 20000 + 1800 + 900 * 4
assert city.return_bike("ivy", "A") == 400
clock.now = 30000
assert city.rent("jon", "A") == "B1"
clock.now = 30000 + 1800 + 899
assert city.return_bike("jon", "A") == 100
assert city.revenue == 100 + 100 + 100 + 100 + 200 + 400 + 100''',
    solution=r'''from collections import deque


class BikeRental:
    FREE_SECONDS = 1800
    BLOCK_SECONDS = 900
    BLOCK_FEE = 100

    def __init__(self, clock):
        self._clock = clock
        self._stations = {}
        self._rentals = {}
        self._bike_count = 0
        self._revenue = 0

    def _station(self, name):
        if name not in self._stations:
            raise ValueError("Unknown station")
        return self._stations[name]

    def add_station(self, name, docks):
        if name in self._stations:
            raise ValueError("Duplicate station")
        if type(docks) is not int or docks < 1:
            raise ValueError("Docks must be positive")
        self._stations[name] = {"docks": docks, "bikes": deque()}

    def add_bikes(self, station, count):
        place = self._station(station)
        if type(count) is not int or count < 1:
            raise ValueError("Count must be positive")
        if len(place["bikes"]) + count > place["docks"]:
            raise ValueError("Not enough docks")
        created = []
        for _ in range(count):
            self._bike_count += 1
            created.append("B" + str(self._bike_count))
        place["bikes"].extend(created)
        return created

    def rent(self, user, station):
        place = self._station(station)
        if user in self._rentals:
            raise ValueError("Already renting")
        if not place["bikes"]:
            raise ValueError("No bikes available")
        bike = place["bikes"].popleft()
        self._rentals[user] = (bike, self._clock())
        return bike

    def return_bike(self, user, station):
        place = self._station(station)
        if user not in self._rentals:
            raise ValueError("No rental")
        if len(place["bikes"]) == place["docks"]:
            raise ValueError("Station is full")
        bike, started = self._rentals.pop(user)
        seconds = self._clock() - started
        extra = max(0, seconds - self.FREE_SECONDS)
        fee = -(-extra // self.BLOCK_SECONDS) * self.BLOCK_FEE
        place["bikes"].append(bike)
        self._revenue += fee
        return fee

    def bikes_at(self, station):
        return len(self._station(station)["bikes"])

    def free_docks(self, station):
        place = self._station(station)
        return place["docks"] - len(place["bikes"])

    def rental_of(self, user):
        rental = self._rentals.get(user)
        return rental[0] if rental else None

    @property
    def revenue(self):
        return self._revenue''',
    hints=[
        r'''A station is a queue of bike ids plus a dock count. `collections.deque` gives you `popleft` for "longest docked goes first" and `append` for "returned bikes join the back".''',
        r'''Round the fee **up** with integer maths, not floats: `-(-extra // 900)` is the number of started blocks. Test the boundaries 1800, 1801, 2700, 2701.''',
        r'''Run every check before you change anything. In `return_bike`, a "station is full" refusal must leave the rider still holding the bike, so remove the rental only after the checks pass.''',
    ],
    explanation=r'''**The idea.** There are three small pieces of state: bikes per station (a queue), who holds which bike (a map), and the money collected. Every rule in the statement is a guard in front of a two-line state change.

**Queues give fairness for free.** Renting the bike that has been docked longest spreads wear across bikes; a stack would hammer one bike and leave the others untouched. Choosing the data structure *is* the policy.

**Ceiling division.** Fees round up per *started* block. `-(-n // d)` is the integer ceiling without importing `math` or touching floats, which matters because a float `0.1 + 0.2` kind of error in money is a bug report.

**Order of checks again.** Unknown station, then rider state, then station state. A fixed order is what makes the error a caller sees predictable when several things are wrong.

**Complexity.** Every operation is O(1) (adding bikes is O(count)).

**Going further.** Add "rebalancing": a method that returns the stations with fewer than 20% of docks filled. Which structure would you keep up to date so that this is not a scan?''',
),
P(
    slug='lld-poll-voting', title='Poll Voting', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/21-lld-interview-playbook/README.md',
    description='Build a polling system with single and multiple choice, changed votes, retraction, closing and tie-aware results.',
    statement=r'''Write a class `PollBox` that holds many polls, each identified by an id.

**Methods**

- `create(poll_id, options, max_choices=1)` makes a poll. Checks in order: id already used `"Poll already exists"`; fewer than two options `"Need at least two options"`; repeated options `"Options must be unique"`; `max_choices` not an `int` between 1 and the number of options `"Bad max choices"`.
- `vote(poll_id, voter, choices)` records a vote; `choices` is a list of options. A voter who votes again **replaces** their earlier vote. Checks in order: `"Unknown poll"`, `"Poll is closed"`, `"Choose at least one"`, `"Too many choices"` (more than `max_choices`), `"Duplicate choice"`, then the first option in `choices` that does not exist `"Unknown option: <option>"`. A refused vote changes nothing, including a voter's earlier vote.
- `retract(poll_id, voter)` removes a voter's vote. Checks: `"Unknown poll"`, `"Poll is closed"`, `"No vote to retract"`.
- `close(poll_id)` closes a poll for good (closing again is fine).
- `results(poll_id)` is a list of `(option, votes)`, **most votes first, ties in the order the options were created**. A voter who picked several options counts once for each.
- `winners(poll_id)` is the list of options with the most votes, in creation order; an empty list when nobody has voted.
- `choices_of(poll_id, voter)` is the voter's current choices (a new list) or `None`; `turnout(poll_id)` is how many voters have a vote.

Results and the other questions work on closed polls too; an unknown poll is always `"Unknown poll"`.''',
    starter=r'''class PollBox:
    def __init__(self):
        ...

    def create(self, poll_id, options, max_choices=1):
        ...

    def vote(self, poll_id, voter, choices):
        ...

    def retract(self, poll_id, voter):
        ...

    def close(self, poll_id):
        ...

    def results(self, poll_id):
        ...

    def winners(self, poll_id):
        ...

    def choices_of(self, poll_id, voter):
        ...

    def turnout(self, poll_id):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
box = PollBox()
assert error_of(box.results, "x") == "ValueError: Unknown poll"
assert error_of(box.vote, "x", "ann", ["a"]) == "ValueError: Unknown poll"
assert error_of(box.close, "x") == "ValueError: Unknown poll"
assert error_of(box.create, "p", ["a"]) == "ValueError: Need at least two options"
assert error_of(box.create, "p", []) == "ValueError: Need at least two options"
assert error_of(box.create, "p", ["a", "a"]) == "ValueError: Options must be unique"
assert error_of(box.create, "p", ["a", "b"], 0) == "ValueError: Bad max choices"
assert error_of(box.create, "p", ["a", "b"], 3) == "ValueError: Bad max choices"
assert error_of(box.create, "p", ["a", "b"], True) == "ValueError: Bad max choices"
assert error_of(box.create, "p", ["a", "b"], 1.5) == "ValueError: Bad max choices"
box.create("lunch", ["pizza", "sushi", "tacos"])
assert error_of(box.create, "lunch", ["a", "b"]) == "ValueError: Poll already exists"
assert error_of(box.create, "lunch", ["a"]) == "ValueError: Poll already exists"
assert box.results("lunch") == [("pizza", 0), ("sushi", 0), ("tacos", 0)]
assert box.winners("lunch") == [] and box.turnout("lunch") == 0 and box.choices_of("lunch", "ann") is None
box.vote("lunch", "ann", ["sushi"])
box.vote("lunch", "bob", ["tacos"])
box.vote("lunch", "cy", ["sushi"])
assert box.results("lunch") == [("sushi", 2), ("tacos", 1), ("pizza", 0)]
assert box.winners("lunch") == ["sushi"] and box.turnout("lunch") == 3
assert box.choices_of("lunch", "ann") == ["sushi"]
mine = box.choices_of("lunch", "ann")
mine.append("junk")
assert box.choices_of("lunch", "ann") == ["sushi"]
box.vote("lunch", "ann", ["pizza"])
assert box.results("lunch") == [("pizza", 1), ("sushi", 1), ("tacos", 1)]
assert box.winners("lunch") == ["pizza", "sushi", "tacos"] and box.turnout("lunch") == 3
assert error_of(box.vote, "lunch", "dan", []) == "ValueError: Choose at least one"
assert error_of(box.vote, "lunch", "dan", ["pizza", "sushi"]) == "ValueError: Too many choices"
assert error_of(box.vote, "lunch", "dan", ["pizza", "pizza"]) == "ValueError: Too many choices"
assert error_of(box.vote, "lunch", "dan", ["nope"]) == "ValueError: Unknown option: nope"
assert error_of(box.vote, "lunch", "ann", ["nope"]) == "ValueError: Unknown option: nope"
assert box.choices_of("lunch", "ann") == ["pizza"] and box.turnout("lunch") == 3
multi = box.create("langs", ["go", "py", "rs", "js"], 3)
box.vote("langs", "a", ["py", "go"])
box.vote("langs", "b", ["py", "rs", "js"])
box.vote("langs", "c", ["rs"])
assert box.results("langs") == [("py", 2), ("rs", 2), ("go", 1), ("js", 1)]
assert box.winners("langs") == ["py", "rs"]
assert box.turnout("langs") == 3
assert error_of(box.vote, "langs", "d", ["go", "py", "rs", "js"]) == "ValueError: Too many choices"
assert error_of(box.vote, "langs", "d", ["go", "go"]) == "ValueError: Duplicate choice"
assert error_of(box.vote, "langs", "d", ["go", "x", "x"]) == "ValueError: Duplicate choice"
assert error_of(box.vote, "langs", "d", ["go", "x"]) == "ValueError: Unknown option: x"
assert error_of(box.vote, "langs", "d", ["x", "y"]) == "ValueError: Unknown option: x"
box.vote("langs", "a", ["js"])
assert box.results("langs") == [("rs", 2), ("js", 2), ("py", 1), ("go", 0)]
assert error_of(box.retract, "nope", "a") == "ValueError: Unknown poll"
assert error_of(box.retract, "langs", "zed") == "ValueError: No vote to retract"
box.retract("langs", "b")
assert box.turnout("langs") == 2 and box.choices_of("langs", "b") is None
assert box.results("langs") == [("rs", 1), ("js", 1), ("go", 0), ("py", 0)]
box.close("langs")
box.close("langs")
assert error_of(box.vote, "langs", "z", ["go"]) == "ValueError: Poll is closed"
assert error_of(box.vote, "langs", "z", []) == "ValueError: Poll is closed"
assert error_of(box.retract, "langs", "a") == "ValueError: Poll is closed"
assert error_of(box.retract, "langs", "zed") == "ValueError: Poll is closed"
assert box.winners("langs") == ["rs", "js"] and box.turnout("langs") == 2
assert box.choices_of("langs", "a") == ["js"] and box.choices_of("langs", "c") == ["rs"]
assert box.results("lunch") == [("pizza", 1), ("sushi", 1), ("tacos", 1)]
assert error_of(box.create, "langs", ["x", "y"]) == "ValueError: Poll already exists"
box.vote("lunch", "ann", ["tacos"])
assert box.results("lunch") == [("tacos", 2), ("sushi", 1), ("pizza", 0)]''',
    solution=r'''class PollBox:
    def __init__(self):
        self._polls = {}

    def _poll(self, poll_id):
        if poll_id not in self._polls:
            raise ValueError("Unknown poll")
        return self._polls[poll_id]

    def create(self, poll_id, options, max_choices=1):
        if poll_id in self._polls:
            raise ValueError("Poll already exists")
        options = list(options)
        if len(options) < 2:
            raise ValueError("Need at least two options")
        if len(set(options)) != len(options):
            raise ValueError("Options must be unique")
        if type(max_choices) is not int or not 1 <= max_choices <= len(options):
            raise ValueError("Bad max choices")
        self._polls[poll_id] = {"options": options, "max": max_choices, "votes": {}, "closed": False}

    def vote(self, poll_id, voter, choices):
        poll = self._poll(poll_id)
        if poll["closed"]:
            raise ValueError("Poll is closed")
        choices = list(choices)
        if not choices:
            raise ValueError("Choose at least one")
        if len(choices) > poll["max"]:
            raise ValueError("Too many choices")
        if len(set(choices)) != len(choices):
            raise ValueError("Duplicate choice")
        for choice in choices:
            if choice not in poll["options"]:
                raise ValueError("Unknown option: " + str(choice))
        poll["votes"][voter] = choices

    def retract(self, poll_id, voter):
        poll = self._poll(poll_id)
        if poll["closed"]:
            raise ValueError("Poll is closed")
        if voter not in poll["votes"]:
            raise ValueError("No vote to retract")
        del poll["votes"][voter]

    def close(self, poll_id):
        self._poll(poll_id)["closed"] = True

    def results(self, poll_id):
        poll = self._poll(poll_id)
        tally = {option: 0 for option in poll["options"]}
        for choices in poll["votes"].values():
            for choice in choices:
                tally[choice] += 1
        return sorted(tally.items(), key=lambda item: -item[1])

    def winners(self, poll_id):
        results = self.results(poll_id)
        top = results[0][1]
        if top == 0:
            return []
        return [option for option, votes in results if votes == top]

    def choices_of(self, poll_id, voter):
        choices = self._poll(poll_id)["votes"].get(voter)
        return list(choices) if choices is not None else None

    def turnout(self, poll_id):
        return len(self._poll(poll_id)["votes"])''',
    hints=[
        r'''Store each poll as a dict: its options in creation order, `max_choices`, a `votes` dict from voter to their list of choices, and a closed flag. Replacing a vote is then just `votes[voter] = choices`.''',
        r'''Never keep a running tally you must also undo when a vote is replaced or retracted. Count from the votes each time you need results: it is slower, but it cannot get out of step.''',
        r'''`sorted` is stable, so sorting `(option, count)` pairs by `-count` alone keeps ties in the order the options were created, because the tally dict was built in that order.''',
    ],
    explanation=r'''**The idea.** A poll is options plus a map from voter to their current choices. Results are *derived*: count the map. Because there is no stored tally, changing or retracting a vote cannot leave a wrong count behind.

**Validate completely, then store.** A vote is refused for one of six reasons, in a fixed order, and a refused vote must not disturb the voter's previous one. Building the new list first and assigning it last is the whole trick.

**Stable sort for tie-breaking.** Python's sort keeps equal items in their original order. Building the tally in option order and sorting by count alone gives "ties in creation order" with no extra key.

**Closed means closed.** The closed check comes right after the poll lookup, before looking at the vote. Otherwise an empty vote on a closed poll would report "Choose at least one" instead of the real problem.

**Complexity.** `vote` is O(options) in the worst case; `results` is O(votes x choices + options log options).

**Going further.** Add a *ranked-choice* poll: each vote is an ordered list, and the winner is found by eliminating the last-place option round by round. What data does `results` need to return?''',
),
P(
    slug='lld-cron-scheduler', title='Job Scheduler', topic='lld-machine-coding', difficulty='advanced',
    module='lld/21-lld-interview-playbook/README.md',
    description='Schedule recurring and one-off jobs against an injected clock: fixed-rate repeats, skipped periods, isolated failures.',
    statement=r'''Write a class `Scheduler` that runs jobs when they are due. Nothing runs by itself: the caller calls `run_due()`. Time comes from an injected `clock` (a function returning seconds); call it **once** per `run_due` and once per job you register.

**Creating one:** `Scheduler(clock)`.

**Registering**

- `every(name, seconds, action)` runs `action()` repeatedly. The first run is due at `now + seconds`. `seconds` must be a number above 0 (not a `bool`), else `ValueError("Interval must be positive")`.
- `once(name, delay, action)` runs it a single time, due at `now + delay`; `delay` must be a number of 0 or more, else `ValueError("Delay cannot be negative")`.
- A name already in use is `ValueError("Job already exists: <name>")` (check the interval or delay first).
- `cancel(name)` removes a job; an unknown name is `ValueError("Unknown job: <name>")`. A job may cancel another job from inside its action.

**Running.** `run_due()` runs every job that is due (`due <= now`) in order of **due time, then the order they were registered**, and returns the list of names it ran.

- A **recurring** job's next due time is `due + k * seconds` for the smallest `k` that puts it **after** `now`: it keeps its rhythm, and if the scheduler was late by several periods the job runs **once**, not once per missed period. A `once` job is removed after it runs.
- If an action **raises**, the scheduler carries on with the other jobs, records `(name, str(error))`, and treats the job as having run (it is rescheduled as usual).
- A job registered *during* `run_due` is not run in that same call, even if it is already due.
- A job cancelled by an earlier action in the same call does not run.

`next_due()` is the earliest due time of any job, or `None`. `errors` is a **new list** of `(name, message)` in the order they happened. `jobs()` is the sorted list of job names.''',
    starter=r'''class Scheduler:
    def __init__(self, clock):
        ...

    def every(self, name, seconds, action):
        ...

    def once(self, name, delay, action):
        ...

    def cancel(self, name):
        ...

    def run_due(self):
        """Run what is due; return the names that ran."""
        ...

    def next_due(self):
        ...

    def jobs(self):
        ...

    @property
    def errors(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Clock:
    def __init__(self):
        self.now = 0
        self.reads = 0
    def __call__(self):
        self.reads += 1
        return self.now
clock = Clock()
log = []
sched = Scheduler(clock)
assert sched.next_due() is None and sched.jobs() == [] and sched.run_due() == [] and sched.errors == []
for bad in (0, -5, None, "5", True):
    assert error_of(sched.every, "x", bad, log.clear) == "ValueError: Interval must be positive"
for bad in (-1, None, "1"):
    assert error_of(sched.once, "x", bad, log.clear) == "ValueError: Delay cannot be negative"
assert sched.jobs() == []
sched.every("a", 10, lambda: log.append("a"))
assert sched.next_due() == 10 and sched.jobs() == ["a"]
assert error_of(sched.every, "a", 5, log.clear) == "ValueError: Job already exists: a"
assert error_of(sched.once, "a", 5, log.clear) == "ValueError: Job already exists: a"
assert error_of(sched.every, "a", 0, log.clear) == "ValueError: Interval must be positive"
clock.now = 9
assert sched.run_due() == [] and log == []
clock.now = 10
assert sched.run_due() == ["a"] and log == ["a"] and sched.next_due() == 20
assert sched.run_due() == [] and log == ["a"]
clock.now = 35
assert sched.run_due() == ["a"] and log == ["a", "a"] and sched.next_due() == 40
clock.now = 40
assert sched.run_due() == ["a"] and sched.next_due() == 50
reads = clock.reads
sched.run_due()
assert clock.reads == reads + 1
sched.every("b", 5, lambda: log.append("b"))
assert clock.reads == reads + 2
sched.once("c", 0, lambda: log.append("c"))
sched.once("d", 3, lambda: log.append("d"))
log.clear()
clock.now = 45
log.clear()
assert sched.run_due() == ["c", "d", "b"] and log == ["c", "d", "b"]
assert sched.jobs() == ["a", "b"] and sched.next_due() == 50
clock.now = 50
log.clear()
assert sched.run_due() == ["a", "b"] and log == ["a", "b"]
sched.cancel("a")
assert sched.jobs() == ["b"]
assert error_of(sched.cancel, "a") == "ValueError: Unknown job: a"
fresh_clock = Clock()
fresh = Scheduler(fresh_clock)
order = []
fresh.every("late", 10, lambda: order.append("late"))
fresh.every("early", 5, lambda: order.append("early"))
fresh.every("aa-tie", 10, lambda: order.append("aa-tie"))
fresh_clock.now = 10
assert fresh.run_due() == ["early", "late", "aa-tie"] and order == ["early", "late", "aa-tie"] and fresh.jobs() == ["aa-tie", "early", "late"]
assert fresh.next_due() == 15
def boom():
    raise RuntimeError("boom")
failing = Scheduler(fresh_clock)
ran = []
failing.every("bad", 10, boom)
failing.every("good", 10, lambda: ran.append("good"))
fresh_clock.now = 30
assert failing.run_due() == ["bad", "good"] and ran == ["good"]
assert failing.errors == [("bad", "boom")] and failing.next_due() == 40
copy = failing.errors
copy.append("junk")
assert failing.errors == [("bad", "boom")]
fresh_clock.now = 40
failing.run_due()
assert failing.errors == [("bad", "boom"), ("bad", "boom")] and ran == ["good", "good"]
nest_clock = Clock()
nest = Scheduler(nest_clock)
trace = []
def spawn():
    trace.append("spawn")
    nest.once("child", 0, lambda: trace.append("child"))
nest.once("parent", 5, spawn)
nest_clock.now = 5
assert nest.run_due() == ["parent"] and trace == ["spawn"] and nest.jobs() == ["child"]
assert nest.run_due() == ["child"] and trace == ["spawn", "child"] and nest.jobs() == []
kill_clock = Clock()
kill = Scheduler(kill_clock)
seen = []
kill.once("first", 1, lambda: (seen.append("first"), kill.cancel("second")))
kill.once("second", 1, lambda: seen.append("second"))
kill_clock.now = 1
assert kill.run_due() == ["first"] and seen == ["first"] and kill.jobs() == []
swap_clock = Clock()
swap = Scheduler(swap_clock)
swapped = []
def replace():
    swapped.append("old")
    swap.cancel("b")
    swap.once("b", 0, lambda: swapped.append("new b"))
swap.once("a", 1, replace)
swap.once("b", 1, lambda: swapped.append("b"))
swap_clock.now = 1
assert swap.run_due() == ["a"] and swapped == ["old"] and swap.jobs() == ["b"]
assert swap.run_due() == ["b"] and swapped == ["old", "new b"]
float_clock = Clock()
floaty = Scheduler(float_clock)
floaty.every("f", 0.5, lambda: None)
float_clock.now = 1.6
assert floaty.run_due() == ["f"] and floaty.next_due() == 2.0
once_clock = Clock()
only = Scheduler(once_clock)
only.once("now", 0, lambda: None)
assert only.next_due() == 0 and only.run_due() == ["now"] and only.next_due() is None
me_clock = Clock()
me = Scheduler(me_clock)
me.once("me", 0, lambda: me.cancel("me"))
me.every("loop", 1, lambda: me.cancel("loop"))
me_clock.now = 1
assert me.run_due() == ["me", "loop"] and me.jobs() == [] and me.next_due() is None''',
    solution=r'''class Scheduler:
    def __init__(self, clock):
        self._clock = clock
        self._jobs = {}
        self._sequence = 0
        self._errors = []

    def _register(self, name, delay, interval, action):
        if name in self._jobs:
            raise ValueError("Job already exists: " + str(name))
        self._sequence += 1
        self._jobs[name] = {"due": self._clock() + delay, "interval": interval, "action": action, "seq": self._sequence}

    def every(self, name, seconds, action):
        if type(seconds) not in (int, float) or seconds <= 0:
            raise ValueError("Interval must be positive")
        self._register(name, seconds, seconds, action)

    def once(self, name, delay, action):
        if type(delay) not in (int, float) or delay < 0:
            raise ValueError("Delay cannot be negative")
        self._register(name, delay, None, action)

    def cancel(self, name):
        if name not in self._jobs:
            raise ValueError("Unknown job: " + str(name))
        del self._jobs[name]

    def run_due(self):
        now = self._clock()
        due = [(job["due"], job["seq"], name, job) for name, job in self._jobs.items() if job["due"] <= now]
        due.sort(key=lambda item: (item[0], item[1]))
        ran = []
        for due_time, _, name, job in due:
            if self._jobs.get(name) is not job:
                continue
            ran.append(name)
            try:
                job["action"]()
            except Exception as error:
                self._errors.append((name, str(error)))
            if self._jobs.get(name) is not job:
                continue
            if job["interval"] is None:
                del self._jobs[name]
            else:
                missed = int((now - due_time) // job["interval"]) + 1
                job["due"] = due_time + missed * job["interval"]
        return ran

    def next_due(self):
        if not self._jobs:
            return None
        return min(job["due"] for job in self._jobs.values())

    def jobs(self):
        return sorted(self._jobs)

    @property
    def errors(self):
        return list(self._errors)''',
    hints=[
        r'''Each job is a small record: due time, interval (or `None` for a one-off), the action, and a registration number. `run_due` takes a **snapshot** of the due jobs first, sorted by `(due, registration number)`; jobs added by actions are not in the snapshot, which is exactly why they wait for the next call.''',
        r'''Rescheduling keeps the rhythm: add whole intervals to the **old due time**, not to `now`. The number to add is `(now - due) // interval + 1`, which skips every missed period at once.''',
        r'''Check `self._jobs.get(name) is job` before running **and** after running. An earlier action may have cancelled the job, or cancelled and re-created the name, in which case the new record is a different job that must not be rescheduled by the old one.''',
    ],
    explanation=r'''**The idea.** A scheduler is a map of jobs plus a rule for "which are due, in what order, and what happens to them afterwards". Keeping the loop in `run_due` (called by whoever owns the real timer) is what makes it testable: a fake clock and a few calls cover every case.

```mermaid
flowchart TD
    A[run_due] --> B[now = clock]
    B --> C[snapshot jobs with due <= now]
    C --> D[sort by due time then registration]
    D --> E{still the same job?}
    E -- yes --> F[run action, catch errors]
    F --> G[reschedule or remove]
    E -- no --> H[skip]
```

**Fixed rate, not fixed delay.** `due + k * interval` keeps a job on its grid (every :00, :10, :20). `now + interval` would drift later by however long the action took. And when the process was paused for a minute, running once and jumping ahead beats firing sixty back-to-back catch-up runs.

**Failures are data.** One bad job must not stop the others. Recording the error and rescheduling anyway is the same choice cron makes: a job that failed at 10:00 still gets its 10:10 turn.

**Snapshot, then verify identity.** Iterating the live dict while actions change it is an error in Python and a surprise in every language. The snapshot plus the `is job` check handle both "added during the pass" and "cancelled during the pass".

**Complexity.** `run_due` is O(n log n) for n jobs; a heap keyed by due time makes it O(k log n) for k due jobs.

**Going further.** Replace the dict scan with a heap. What do you do with a cancelled job that is still inside the heap?''',
),
P(
    slug='lld-food-delivery-dispatch', title='Delivery Dispatch', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/17-ride-sharing/README.md',
    description='Assign each order to the nearest free driver, queue orders when everyone is busy, and hand queued orders out as drivers free up.',
    statement=r'''Write a class `Dispatcher` for a delivery service. Locations are `(x, y)` points on a grid; distance is **Manhattan** distance `|x1 - x2| + |y1 - y2|`.

**Drivers.** `add_driver(name, x, y)` adds a free driver at a location. A repeated name is `ValueError("Duplicate driver")`. If orders are **waiting**, the new driver immediately takes the oldest one. `add_driver` returns that order's id, or `None`.

**Orders.** `request(order_id, x, y)` places an order whose destination is `(x, y)`; a repeated id of an order that is still open is `ValueError("Duplicate order")`.

- If a driver is free, the order goes to the **nearest free driver**, ties broken by name (alphabetical). `request` returns the driver's name.
- If nobody is free, the order **waits** in a first-come-first-served queue and `request` returns `None`.

**Finishing.**

- `complete(order_id)` marks a delivery done: the driver is now **at the order's destination** and free. If orders are waiting, that driver takes the **oldest** waiting order (whatever its location) and `complete` returns that order's id; otherwise `None`. Unknown id `ValueError("Unknown order")`; an order still waiting `ValueError("Order not assigned")`. A completed order is closed, so its id may be used again.
- `cancel(order_id)` closes an order. A waiting order simply leaves the queue; an assigned order frees its driver **where the driver was** (they did not move) and the driver takes the oldest waiting order, if any. `cancel` returns that order's id or `None`. Unknown id `ValueError("Unknown order")`.

**Questions:** `assigned(order_id)` is the driver's name or `None` while waiting (unknown id `"Unknown order"`); `waiting` is a **new list** of waiting order ids, oldest first; `position(driver)` is the driver's `(x, y)` (unknown name `ValueError("Unknown driver")`).''',
    starter=r'''class Dispatcher:
    def __init__(self):
        ...

    def add_driver(self, name, x, y):
        """Add a free driver; return the waiting order they took, or None."""
        ...

    def request(self, order_id, x, y):
        """Return the driver's name, or None when the order has to wait."""
        ...

    def complete(self, order_id):
        """Return the waiting order the driver takes next, or None."""
        ...

    def cancel(self, order_id):
        ...

    def assigned(self, order_id):
        ...

    @property
    def waiting(self):
        ...

    def position(self, driver):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
d = Dispatcher()
assert d.waiting == [] and error_of(d.position, "x") == "ValueError: Unknown driver"
assert d.request("o0", 1, 1) is None and d.waiting == ["o0"] and d.assigned("o0") is None
assert d.add_driver("amy", 0, 0) == "o0" and d.waiting == [] and d.assigned("o0") == "amy"
assert error_of(d.add_driver, "amy", 5, 5) == "ValueError: Duplicate driver"
assert d.position("amy") == (0, 0)
assert d.complete("o0") is None and d.position("amy") == (1, 1) and error_of(d.assigned, "o0") == "ValueError: Unknown order"
assert d.add_driver("bo", 10, 0) is None
assert d.request("o1", 9, 1) == "bo" and d.assigned("o1") == "bo"
assert d.request("o2", 2, 2) == "amy"
assert error_of(d.request, "o2", 0, 0) == "ValueError: Duplicate order"
assert d.request("o3", 5, 5) is None and d.assigned("o3") is None and d.waiting == ["o3"]
assert d.request("o4", 0, 0) is None and d.waiting == ["o3", "o4"]
assert error_of(d.complete, "o3") == "ValueError: Order not assigned"
assert error_of(d.complete, "zzz") == "ValueError: Unknown order"
assert d.complete("o1") == "o3" and d.position("bo") == (9, 1) and d.assigned("o3") == "bo" and d.waiting == ["o4"]
assert d.complete("o2") == "o4" and d.position("amy") == (2, 2) and d.assigned("o4") == "amy" and d.waiting == []
assert d.complete("o3") is None and d.position("bo") == (5, 5)
assert d.complete("o4") is None and d.position("amy") == (0, 0)
wait = d.waiting
wait.append("junk")
assert d.waiting == []
assert d.request("o1", 0, 1) == "amy"
t = Dispatcher()
t.add_driver("zed", 0, 0)
t.add_driver("abe", 0, 4)
t.add_driver("mel", 4, 0)
assert t.request("r1", 0, 2) == "abe"
assert t.request("r2", 0, 2) == "zed"
assert t.request("r3", 2, 2) == "mel"
assert t.request("r4", 0, 0) is None
t2 = Dispatcher()
t2.add_driver("zed", 0, 3)
t2.add_driver("abe", 3, 0)
assert t2.request("r", 0, 0) == "abe"
c = Dispatcher()
c.add_driver("d1", 0, 0)
assert c.request("a", 3, 3) == "d1"
assert c.request("b", 1, 1) is None and c.request("c", 2, 2) is None and c.waiting == ["b", "c"]
assert error_of(c.cancel, "zzz") == "ValueError: Unknown order"
assert c.cancel("b") is None and c.waiting == ["c"] and error_of(c.assigned, "b") == "ValueError: Unknown order"
assert c.cancel("a") == "c" and c.position("d1") == (0, 0) and c.assigned("c") == "d1" and c.waiting == []
assert c.request("b", 9, 9) is None
assert c.cancel("c") == "b" and c.assigned("b") == "d1" and c.position("d1") == (0, 0)
assert c.request("a", 0, 0) is None
assert c.complete("b") == "a" and c.position("d1") == (9, 9)
fifo = Dispatcher()
fifo.add_driver("only", 0, 0)
fifo.request("first", 50, 50)
fifo.request("near", 0, 1)
fifo.request("far", 40, 40)
assert fifo.waiting == ["near", "far"]
assert fifo.complete("first") == "near" and fifo.position("only") == (50, 50)
fifo.request("later", 1, 1)
assert fifo.add_driver("second", 99, 99) == "far" and fifo.waiting == ["later"]
assert fifo.add_driver("third", 0, 0) == "later" and fifo.waiting == []
g = Dispatcher()
g.add_driver("a", 0, 0)
g.add_driver("b", 0, 5)
assert g.request("x", 3, 3) == "b"
reuse = Dispatcher()
reuse.add_driver("r", 0, 0)
reuse.request("x", 1, 1)
reuse.complete("x")
assert reuse.request("x", 2, 2) == "r" and reuse.assigned("x") == "r"''',
    solution=r'''class Dispatcher:
    def __init__(self):
        self._drivers = {}
        self._orders = {}
        self._waiting = []

    def _order(self, order_id):
        if order_id not in self._orders:
            raise ValueError("Unknown order")
        return self._orders[order_id]

    def _assign(self, order_id, driver):
        self._drivers[driver]["order"] = order_id
        self._orders[order_id]["driver"] = driver

    def _next_for(self, driver):
        if not self._waiting:
            return None
        order_id = self._waiting.pop(0)
        self._assign(order_id, driver)
        return order_id

    def add_driver(self, name, x, y):
        if name in self._drivers:
            raise ValueError("Duplicate driver")
        self._drivers[name] = {"pos": (x, y), "order": None}
        return self._next_for(name)

    def request(self, order_id, x, y):
        if order_id in self._orders:
            raise ValueError("Duplicate order")
        self._orders[order_id] = {"pos": (x, y), "driver": None}
        free = [
            (abs(info["pos"][0] - x) + abs(info["pos"][1] - y), name)
            for name, info in self._drivers.items() if info["order"] is None
        ]
        if not free:
            self._waiting.append(order_id)
            return None
        driver = min(free)[1]
        self._assign(order_id, driver)
        return driver

    def complete(self, order_id):
        order = self._order(order_id)
        driver = order["driver"]
        if driver is None:
            raise ValueError("Order not assigned")
        self._drivers[driver]["pos"] = order["pos"]
        self._drivers[driver]["order"] = None
        del self._orders[order_id]
        return self._next_for(driver)

    def cancel(self, order_id):
        order = self._order(order_id)
        driver = order["driver"]
        del self._orders[order_id]
        if driver is None:
            self._waiting.remove(order_id)
            return None
        self._drivers[driver]["order"] = None
        return self._next_for(driver)

    def assigned(self, order_id):
        return self._order(order_id)["driver"]

    @property
    def waiting(self):
        return list(self._waiting)

    def position(self, driver):
        if driver not in self._drivers:
            raise ValueError("Unknown driver")
        return self._drivers[driver]["pos"]''',
    hints=[
        r'''Keep drivers (position, current order or `None`), open orders (destination, driver or `None`) and a plain list of waiting order ids. Free and busy are not separate lists: a driver is free when their `order` is `None`.''',
        r'''To pick the nearest free driver, build `(distance, name)` pairs and take `min`. Tuples compare element by element, so a distance tie falls back to the alphabetically first name without any extra code.''',
        r'''There is one "a driver just became free" routine: take the oldest waiting order, if any. `add_driver`, `complete` and `cancel` all end by calling it, which is why they all return "the order the driver took".''',
    ],
    explanation=r'''**The idea.** Dispatch is two queues meeting: orders without a driver, and drivers without an order. At any moment at most one of them is non-empty, and every event (a new order, a new driver, a finished or cancelled delivery) must restore that.

**One routine for "a driver is free".** `add_driver`, `complete` and `cancel(assigned)` all end with the same step: hand the freed driver the oldest waiting order. Writing it once is what stops the three paths from drifting apart.

**Nearest versus oldest.** A new order picks the *nearest* free driver (best for that customer); a freed driver picks the *oldest* waiting order (fair to the customers). Two different rules for two different questions, and the statement names both.

**Cancel does not move the driver.** A completed order puts the driver at the destination; a cancelled one does not, because they never got there. Small detail, easy to miss, and the tests pin it.

**Complexity.** `request` scans the drivers, O(drivers); the waiting queue pop here is O(waiting). A spatial index (grid cells) makes "nearest free driver" sub-linear in a big city.

**Going further.** Let the nearest driver be chosen by *estimated arrival time*, with each busy driver finishing at a known time. What changes about the data you store?''',
),
P(
    slug='lld-tournament-bracket', title='Tournament Bracket', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/14-tic-tac-toe-and-chess/README.md',
    description='Run a single-elimination tournament with byes for top seeds, re-seeded rounds, reported winners and a history.',
    statement=r'''Write a class `Bracket` for a single-elimination tournament.

**Creating one:** `Bracket(players)` where `players` is a list of unique names **in seed order** (first = best seed). Fewer than two players is `ValueError("Need at least two players")`; a repeated name is `ValueError("Duplicate player: <name>")` (the first repeat, in list order). Check the count first.

**Round one.** Let `size` be the smallest power of two that is at least the number of players, and `byes = size - players`. The top `byes` seeds **skip round one** (they are already in round two). The other players play round one: the best remaining seed against the worst, the second best against the second worst, and so on.

**Later rounds.** After every match of a round has been reported, the survivors (winners, plus the players who had a bye) are **re-seeded by their original seed**, and paired the same way: best against worst, second best against second worst. A single survivor is the **champion**.

**Methods and properties**

- `matches` is the list of the current round's **unplayed** matches as `(better_seed, worse_seed)` tuples, in pairing order (a new list each time); empty once there is a champion.
- `report(winner)` records that `winner` won their pending match. A name that is not in a pending match (unknown, already played, or has a bye this round) is `ValueError("Not in a pending match: <name>")`; once there is a champion every report is `ValueError("Tournament is over")` (check that first).
- `round` is the current round number, starting at 1; it moves on as soon as the last match of a round is reported (and stays at the final round after the champion is known).
- `champion` is the winner, or `None`.
- `history` is a list of `(round, winner, loser)`, in the order matches were reported.

**Example.** Five players `A B C D E`: size 8, so `A`, `B`, `C` have byes and round one is `D` vs `E`.''',
    starter=r'''class Bracket:
    def __init__(self, players):
        ...

    @property
    def matches(self):
        ...

    def report(self, winner):
        ...

    @property
    def round(self):
        ...

    @property
    def champion(self):
        ...

    @property
    def history(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
assert error_of(Bracket, []) == "ValueError: Need at least two players"
assert error_of(Bracket, ["A"]) == "ValueError: Need at least two players"
assert error_of(Bracket, ["A", "B", "A"]) == "ValueError: Duplicate player: A"
assert error_of(Bracket, ["A", "B", "C", "B", "A"]) == "ValueError: Duplicate player: B"
assert error_of(Bracket, ["A", "A"]) == "ValueError: Duplicate player: A"
two = Bracket(["x", "y"])
assert two.matches == [("x", "y")] and two.round == 1 and two.champion is None and two.history == []
assert error_of(two.report, "z") == "ValueError: Not in a pending match: z"
two.report("y")
assert two.champion == "y" and two.matches == [] and two.round == 1 and two.history == [(1, "y", "x")]
assert error_of(two.report, "y") == "ValueError: Tournament is over"
assert error_of(two.report, "q") == "ValueError: Tournament is over"
four = Bracket(["a", "b", "c", "d"])
assert four.matches == [("a", "d"), ("b", "c")] and four.round == 1
four.report("d")
assert four.matches == [("b", "c")] and four.round == 1
assert error_of(four.report, "a") == "ValueError: Not in a pending match: a"
assert error_of(four.report, "d") == "ValueError: Not in a pending match: d"
four.report("b")
assert four.round == 2 and four.matches == [("b", "d")] and four.champion is None
assert four.history == [(1, "d", "a"), (1, "b", "c")]
four.report("b")
assert four.champion == "b" and four.round == 2 and four.matches == []
assert four.history == [(1, "d", "a"), (1, "b", "c"), (2, "b", "d")]
copy = four.history
copy.append("junk")
assert len(four.history) == 3
five = Bracket(["A", "B", "C", "D", "E"])
assert five.matches == [("D", "E")] and five.round == 1
assert error_of(five.report, "A") == "ValueError: Not in a pending match: A"
five.report("E")
assert five.round == 2 and five.matches == [("A", "E"), ("B", "C")]
five.report("C")
five.report("A")
assert five.round == 3 and five.matches == [("A", "C")]
five.report("C")
assert five.champion == "C" and five.history == [(1, "E", "D"), (2, "C", "B"), (2, "A", "E"), (3, "C", "A")]
six = Bracket(list("123456"))
assert six.matches == [("3", "6"), ("4", "5")]
six.report("6")
six.report("4")
assert six.round == 2 and six.matches == [("1", "6"), ("2", "4")]
six.report("1")
six.report("2")
assert six.round == 3 and six.matches == [("1", "2")]
six.report("2")
assert six.champion == "2"
three = Bracket(["p", "q", "r"])
assert three.matches == [("q", "r")]
three.report("q")
assert three.matches == [("p", "q")]
seven = Bracket(list("abcdefg"))
assert seven.matches == [("b", "g"), ("c", "f"), ("d", "e")]
for winner in ("g", "c", "d"):
    seven.report(winner)
assert seven.round == 2 and seven.matches == [("a", "g"), ("c", "d")]
sixteen = Bracket([str(n).zfill(2) for n in range(16)])
assert sixteen.matches[0] == ("00", "15") and sixteen.matches[-1] == ("07", "08") and len(sixteen.matches) == 8
big = Bracket([str(n) for n in range(100)])
assert len(big.matches) == 36 and big.matches[0] == ("28", "99")
rounds = 0
while big.champion is None:
    for first, second in big.matches:
        big.report(first)
    rounds += 1
assert big.champion == "0" and rounds == 7 and len(big.history) == 99
odd = Bracket(["a", "b", "c"])
odd.report("c")
odd.report("c")
assert odd.champion == "c" and odd.history == [(1, "c", "b"), (2, "c", "a")]''',
    solution=r'''class Bracket:
    def __init__(self, players):
        players = list(players)
        if len(players) < 2:
            raise ValueError("Need at least two players")
        seen = set()
        for name in players:
            if name in seen:
                raise ValueError("Duplicate player: " + str(name))
            seen.add(name)
        self._seed = {name: index for index, name in enumerate(players)}
        size = 1
        while size < len(players):
            size *= 2
        byes = size - len(players)
        self._round = 1
        self._advanced = players[:byes]
        self._winners = []
        self._history = []
        self._champion = None
        self._pending = self._pair(players[byes:])

    def _pair(self, names):
        ordered = sorted(names, key=self._seed.get)
        return [(ordered[i], ordered[-1 - i]) for i in range(len(ordered) // 2)]

    @property
    def matches(self):
        return list(self._pending)

    @property
    def round(self):
        return self._round

    @property
    def champion(self):
        return self._champion

    @property
    def history(self):
        return list(self._history)

    def report(self, winner):
        if self._champion is not None:
            raise ValueError("Tournament is over")
        for index, (first, second) in enumerate(self._pending):
            if winner in (first, second):
                break
        else:
            raise ValueError("Not in a pending match: " + str(winner))
        loser = second if winner == first else first
        del self._pending[index]
        self._winners.append(winner)
        self._history.append((self._round, winner, loser))
        if self._pending:
            return
        survivors = self._advanced + self._winners
        self._advanced = []
        self._winners = []
        if len(survivors) == 1:
            self._champion = survivors[0]
            return
        self._round += 1
        self._pending = self._pair(survivors)''',
    hints=[
        r'''Give every player their seed number once (`{name: index}`) and always sort by it. Pairing is then the same function in every round: sort the survivors by seed and pair `ordered[i]` with `ordered[-1 - i]`.''',
        r'''Round one is special only because of the byes: the top `size - players` seeds are put aside as "already advanced". When the last match of a round is reported, the next round's survivors are those players plus the round's winners.''',
        r'''Find the match that contains `winner`, remove it from the pending list, and remember the winner. When the pending list becomes empty, either you have one survivor (the champion) or you pair the survivors and bump the round number.''',
    ],
    explanation=r'''**The idea.** A bracket is a loop over rounds. Each round is "pair the survivors, play the pairs, keep the winners". Byes are just survivors who did not have to play yet.

```mermaid
flowchart LR
    A[A bye] --> R2
    B[B bye] --> R2
    C[C bye] --> R2
    D[D vs E] --> R2[round 2: re-seed]
    R2 --> F[final]
```

**Why byes go to the top seeds.** The reward for a better seed is an easier road. Giving the byes to the first `size - players` seeds is the standard rule, and it is what makes round two a full power of two, so the rest of the tournament needs no special cases.

**Re-seeding.** Pairing best against worst *every round* (rather than fixing a bracket tree up front) guarantees the favourites meet as late as possible. Fixed brackets are also common; the point of the problem is that your pairing rule is one small function.

**State, not a tree.** You never need to build a tree of matches. Three lists (pending, winners so far, players waiting with a bye) and a round counter are enough, and `history` is just an append-only log.

**Complexity.** `report` is O(matches in the round); pairing is O(n log n) per round.

**Going further.** Add `loser's bracket` (double elimination): what must `history` record so that the second-chance rounds can be rebuilt?''',
),
]
