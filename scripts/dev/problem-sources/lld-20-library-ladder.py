LIB1 = r'''class Library:
    LOAN_DAYS = 14
    MAX_LOANS = 3

    def __init__(self):
        self._books = {}
        self._loans = {}

    @staticmethod
    def _check_day(today):
        if type(today) is not int or today < 0:
            raise ValueError("Bad date")

    def _member(self, member):
        if member not in self._loans:
            raise ValueError("Unknown member")
        return self._loans[member]

    def _book(self, isbn):
        if isbn not in self._books:
            raise ValueError("Unknown book")
        return self._books[isbn]

    def add_book(self, isbn, title, copies=1):
        if not isinstance(isbn, str) or not isbn.strip():
            raise ValueError("ISBN required")
        if not isinstance(title, str) or not title.strip():
            raise ValueError("Title required")
        if type(copies) is not int or copies < 1:
            raise ValueError("Copies must be positive")
        isbn, title = isbn.strip(), title.strip()
        book = self._books.get(isbn)
        if book is None:
            self._books[isbn] = {"title": title, "copies": copies}
        elif book["title"] != title:
            raise ValueError("ISBN has a different title")
        else:
            book["copies"] += copies

    def join(self, member):
        if not isinstance(member, str) or not member.strip():
            raise ValueError("Member required")
        if member in self._loans:
            raise ValueError("Already a member")
        self._loans[member] = {}

    def title_of(self, isbn):
        return self._book(isbn)["title"]

    def available(self, isbn):
        book = self._book(isbn)
        out = sum(1 for loans in self._loans.values() if isbn in loans)
        return book["copies"] - out

    def borrow(self, member, isbn, today):
        self._check_day(today)
        loans = self._member(member)
        self._book(isbn)
        if isbn in loans:
            raise ValueError("Already borrowed")
        if len(loans) >= self.MAX_LOANS:
            raise ValueError("Loan limit reached")
        if self.available(isbn) < 1:
            raise ValueError("No copies available")
        loans[isbn] = today + self.LOAN_DAYS
        return loans[isbn]

    def return_book(self, member, isbn, today):
        self._check_day(today)
        loans = self._member(member)
        self._book(isbn)
        if isbn not in loans:
            raise ValueError("Not borrowed")
        del loans[isbn]

    def loans_of(self, member):
        loans = self._member(member)
        return sorted(loans.items(), key=lambda item: (item[1], item[0]))'''

LIB2 = r'''class Library:
    LOAN_DAYS = 14
    MAX_LOANS = 3
    FINE_PER_DAY = 25
    FINE_LIMIT = 500

    def __init__(self):
        self._books = {}
        self._members = {}

    @staticmethod
    def _check_day(today):
        if type(today) is not int or today < 0:
            raise ValueError("Bad date")

    def _member(self, member):
        if member not in self._members:
            raise ValueError("Unknown member")
        return self._members[member]

    def _book(self, isbn):
        if isbn not in self._books:
            raise ValueError("Unknown book")
        return self._books[isbn]

    def add_book(self, isbn, title, copies=1):
        if not isinstance(isbn, str) or not isbn.strip():
            raise ValueError("ISBN required")
        if not isinstance(title, str) or not title.strip():
            raise ValueError("Title required")
        if type(copies) is not int or copies < 1:
            raise ValueError("Copies must be positive")
        isbn, title = isbn.strip(), title.strip()
        book = self._books.get(isbn)
        if book is None:
            self._books[isbn] = {"title": title, "copies": copies}
        elif book["title"] != title:
            raise ValueError("ISBN has a different title")
        else:
            book["copies"] += copies

    def join(self, member):
        if not isinstance(member, str) or not member.strip():
            raise ValueError("Member required")
        if member in self._members:
            raise ValueError("Already a member")
        self._members[member] = {"loans": {}, "fines": 0}

    def title_of(self, isbn):
        return self._book(isbn)["title"]

    def available(self, isbn):
        book = self._book(isbn)
        out = sum(1 for record in self._members.values() if isbn in record["loans"])
        return book["copies"] - out

    def borrow(self, member, isbn, today):
        self._check_day(today)
        record = self._member(member)
        self._book(isbn)
        if record["fines"] >= self.FINE_LIMIT:
            raise ValueError("Fines too high")
        if isbn in record["loans"]:
            raise ValueError("Already borrowed")
        if len(record["loans"]) >= self.MAX_LOANS:
            raise ValueError("Loan limit reached")
        if self.available(isbn) < 1:
            raise ValueError("No copies available")
        record["loans"][isbn] = {"due": today + self.LOAN_DAYS, "renewed": False}
        return record["loans"][isbn]["due"]

    def return_book(self, member, isbn, today):
        self._check_day(today)
        record = self._member(member)
        self._book(isbn)
        if isbn not in record["loans"]:
            raise ValueError("Not borrowed")
        loan = record["loans"].pop(isbn)
        fine = max(0, today - loan["due"]) * self.FINE_PER_DAY
        record["fines"] += fine
        return fine

    def renew(self, member, isbn, today):
        self._check_day(today)
        record = self._member(member)
        self._book(isbn)
        if isbn not in record["loans"]:
            raise ValueError("Not borrowed")
        loan = record["loans"][isbn]
        if loan["renewed"]:
            raise ValueError("Already renewed")
        if today > loan["due"]:
            raise ValueError("Overdue")
        loan["due"] += self.LOAN_DAYS
        loan["renewed"] = True
        return loan["due"]

    def fines(self, member):
        return self._member(member)["fines"]

    def pay(self, member, amount):
        record = self._member(member)
        if type(amount) is not int or amount < 1:
            raise ValueError("Amount must be positive")
        if amount > record["fines"]:
            raise ValueError("Amount exceeds fines")
        record["fines"] -= amount
        return record["fines"]

    def loans_of(self, member):
        record = self._member(member)
        return sorted(((isbn, loan["due"]) for isbn, loan in record["loans"].items()), key=lambda item: (item[1], item[0]))'''

LIB3 = r'''class Library:
    LOAN_DAYS = 14
    MAX_LOANS = 3
    FINE_PER_DAY = 25
    FINE_LIMIT = 500

    def __init__(self):
        self._books = {}
        self._members = {}
        self._queues = {}
        self._holds = {}

    @staticmethod
    def _check_day(today):
        if type(today) is not int or today < 0:
            raise ValueError("Bad date")

    def _member(self, member):
        if member not in self._members:
            raise ValueError("Unknown member")
        return self._members[member]

    def _book(self, isbn):
        if isbn not in self._books:
            raise ValueError("Unknown book")
        return self._books[isbn]

    def _assign_holds(self, isbn):
        queue = self._queues.setdefault(isbn, [])
        holds = self._holds.setdefault(isbn, [])
        while queue and self.available(isbn) > 0:
            holds.append(queue.pop(0))

    def add_book(self, isbn, title, copies=1):
        if not isinstance(isbn, str) or not isbn.strip():
            raise ValueError("ISBN required")
        if not isinstance(title, str) or not title.strip():
            raise ValueError("Title required")
        if type(copies) is not int or copies < 1:
            raise ValueError("Copies must be positive")
        isbn, title = isbn.strip(), title.strip()
        book = self._books.get(isbn)
        if book is None:
            self._books[isbn] = {"title": title, "copies": copies}
        elif book["title"] != title:
            raise ValueError("ISBN has a different title")
        else:
            book["copies"] += copies
        self._assign_holds(isbn)

    def join(self, member):
        if not isinstance(member, str) or not member.strip():
            raise ValueError("Member required")
        if member in self._members:
            raise ValueError("Already a member")
        self._members[member] = {"loans": {}, "fines": 0}

    def title_of(self, isbn):
        return self._book(isbn)["title"]

    def available(self, isbn):
        book = self._book(isbn)
        out = sum(1 for record in self._members.values() if isbn in record["loans"])
        return book["copies"] - out - len(self._holds.get(isbn, []))

    def queue(self, isbn):
        self._book(isbn)
        return list(self._queues.get(isbn, []))

    def holds(self, isbn):
        self._book(isbn)
        return list(self._holds.get(isbn, []))

    def reserve(self, member, isbn):
        record = self._member(member)
        self._book(isbn)
        if isbn in record["loans"]:
            raise ValueError("Already borrowed")
        queue = self._queues.setdefault(isbn, [])
        if member in queue or member in self._holds.get(isbn, []):
            raise ValueError("Already reserved")
        if self.available(isbn) > 0:
            raise ValueError("Copies available")
        queue.append(member)
        return len(queue)

    def cancel_reservation(self, member, isbn):
        self._member(member)
        self._book(isbn)
        queue = self._queues.get(isbn, [])
        holds = self._holds.get(isbn, [])
        if member in queue:
            queue.remove(member)
        elif member in holds:
            holds.remove(member)
            self._assign_holds(isbn)
        else:
            raise ValueError("No reservation")

    def borrow(self, member, isbn, today):
        self._check_day(today)
        record = self._member(member)
        self._book(isbn)
        if record["fines"] >= self.FINE_LIMIT:
            raise ValueError("Fines too high")
        if isbn in record["loans"]:
            raise ValueError("Already borrowed")
        if len(record["loans"]) >= self.MAX_LOANS:
            raise ValueError("Loan limit reached")
        holds = self._holds.get(isbn, [])
        if member in holds:
            holds.remove(member)
        elif self.available(isbn) < 1:
            raise ValueError("No copies available")
        record["loans"][isbn] = {"due": today + self.LOAN_DAYS, "renewed": False}
        return record["loans"][isbn]["due"]

    def return_book(self, member, isbn, today):
        self._check_day(today)
        record = self._member(member)
        self._book(isbn)
        if isbn not in record["loans"]:
            raise ValueError("Not borrowed")
        loan = record["loans"].pop(isbn)
        fine = max(0, today - loan["due"]) * self.FINE_PER_DAY
        record["fines"] += fine
        self._assign_holds(isbn)
        return fine

    def renew(self, member, isbn, today):
        self._check_day(today)
        record = self._member(member)
        self._book(isbn)
        if isbn not in record["loans"]:
            raise ValueError("Not borrowed")
        loan = record["loans"][isbn]
        if loan["renewed"]:
            raise ValueError("Already renewed")
        if today > loan["due"]:
            raise ValueError("Overdue")
        loan["due"] += self.LOAN_DAYS
        loan["renewed"] = True
        return loan["due"]

    def fines(self, member):
        return self._member(member)["fines"]

    def pay(self, member, amount):
        record = self._member(member)
        if type(amount) is not int or amount < 1:
            raise ValueError("Amount must be positive")
        if amount > record["fines"]:
            raise ValueError("Amount exceeds fines")
        record["fines"] -= amount
        return record["fines"]

    def loans_of(self, member):
        record = self._member(member)
        return sorted(((isbn, loan["due"]) for isbn, loan in record["loans"].items()), key=lambda item: (item[1], item[0]))'''

STEP1_TESTS = r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
lib = Library()
for bad in ("", "   ", None, 5):
    assert error_of(lib.add_book, bad, "T") == "ValueError: ISBN required"
assert error_of(lib.add_book, "i1", "") == "ValueError: Title required"
assert error_of(lib.add_book, "i1", None) == "ValueError: Title required"
for bad in (0, -1, 1.5, True):
    assert error_of(lib.add_book, "i1", "Dune", bad) == "ValueError: Copies must be positive"
assert error_of(lib.add_book, "", "", 0) == "ValueError: ISBN required"
lib.add_book("i1", "Dune", 2)
lib.add_book("i2", " Emma ")
lib.add_book("i3", "Ulysses")
lib.add_book("i4", "Hamlet")
assert lib.available("i1") == 2 and lib.title_of("i2") == "Emma"
lib.add_book(" i1 ", "Dune")
assert lib.available("i1") == 3
assert error_of(lib.add_book, "i1", "Other") == "ValueError: ISBN has a different title" and lib.available("i1") == 3
assert error_of(lib.available, "zzz") == "ValueError: Unknown book" and error_of(lib.title_of, "zzz") == "ValueError: Unknown book"
for bad in ("", "  ", None, 3):
    assert error_of(lib.join, bad) == "ValueError: Member required"
lib.join("ann")
lib.join("bob")
assert error_of(lib.join, "ann") == "ValueError: Already a member"
assert error_of(lib.loans_of, "zed") == "ValueError: Unknown member"
assert lib.loans_of("ann") == []
for bad in (-1, 1.5, True, None, "3"):
    assert error_of(lib.borrow, "nobody", "nope", bad) == "ValueError: Bad date"
assert error_of(lib.borrow, "nobody", "nope", 1) == "ValueError: Unknown member"
assert error_of(lib.borrow, "ann", "nope", 1) == "ValueError: Unknown book"
assert lib.borrow("ann", "i1", 10) == 24 and lib.available("i1") == 2
assert lib.loans_of("ann") == [("i1", 24)]
assert error_of(lib.borrow, "ann", "i1", 11) == "ValueError: Already borrowed"
assert lib.borrow("ann", "i2", 11) == 25 and lib.borrow("ann", "i3", 5) == 19
assert lib.loans_of("ann") == [("i3", 19), ("i1", 24), ("i2", 25)]
assert error_of(lib.borrow, "ann", "i4", 12) == "ValueError: Loan limit reached" and error_of(lib.borrow, "ann", "nope", 12) == "ValueError: Unknown book"
assert error_of(lib.borrow, "ann", "i1", 12) == "ValueError: Already borrowed"
assert error_of(lib.borrow, "bob", "i2", 12) == "ValueError: No copies available" and lib.available("i2") == 0
assert lib.borrow("bob", "i4", 3) == 17 and lib.borrow("bob", "i1", 11) == 25
assert lib.loans_of("bob") == [("i4", 17), ("i1", 25)]
for bad in (-1, 1.5, True):
    assert error_of(lib.return_book, "nobody", "nope", bad) == "ValueError: Bad date"
assert error_of(lib.return_book, "nobody", "nope", 1) == "ValueError: Unknown member"
assert error_of(lib.return_book, "ann", "nope", 1) == "ValueError: Unknown book"
assert error_of(lib.return_book, "ann", "i4", 1) == "ValueError: Not borrowed"
assert lib.return_book("ann", "i2", 30) is None
assert lib.available("i2") == 1 and lib.loans_of("ann") == [("i3", 19), ("i1", 24)]
assert error_of(lib.return_book, "ann", "i2", 31) == "ValueError: Not borrowed"
assert lib.borrow("bob", "i2", 31) == 45 and lib.available("i2") == 0
lib.join("cy")
lib.join("dee")
assert lib.borrow("cy", "i1", 40) == 54 and lib.available("i1") == 0
assert error_of(lib.borrow, "dee", "i1", 41) == "ValueError: No copies available"
lib.return_book("ann", "i1", 41)
lib.add_book("i5", "Odyssey")
assert lib.available("i1") == 1 and lib.borrow("dee", "i5", 41) == 55 and lib.borrow("dee", "i1", 41) == 55
assert lib.loans_of("dee") == [("i1", 55), ("i5", 55)]
assert lib.loans_of("dee").append("junk") is None and lib.loans_of("dee") == [("i1", 55), ("i5", 55)]
lib.return_book("dee", "i1", 0)
assert lib.loans_of("dee") == [("i5", 55)]
assert lib.borrow("dee", "i1", 0) == 14'''

HELPER = r"""def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
"""

REGRESS = r"""lib = Library()
lib.add_book("i1", "Dune", 2)
lib.add_book("i2", "Emma")
lib.add_book("i3", "Ulysses")
lib.add_book("i4", "Hamlet")
for name in ("ann", "bob", "cy"):
    lib.join(name)
assert error_of(lib.join, "ann") == "ValueError: Already a member" and error_of(lib.add_book, "i1", "Other") == "ValueError: ISBN has a different title"
assert lib.borrow("ann", "i1", 10) == 24 and lib.borrow("ann", "i2", 11) == 25 and lib.borrow("ann", "i3", 5) == 19
assert lib.loans_of("ann") == [("i3", 19), ("i1", 24), ("i2", 25)]
assert error_of(lib.borrow, "ann", "i4", 12) == "ValueError: Loan limit reached" and error_of(lib.borrow, "ann", "nope", 12) == "ValueError: Unknown book" and error_of(lib.borrow, "ann", "i1", 12) == "ValueError: Already borrowed"
assert error_of(lib.borrow, "bob", "i2", 12) == "ValueError: No copies available" and lib.available("i2") == 0
assert error_of(lib.borrow, "zed", "i2", 12) == "ValueError: Unknown member" and error_of(lib.borrow, "bob", "zzz", 12) == "ValueError: Unknown book"
assert error_of(lib.borrow, "bob", "i2", -1) == "ValueError: Bad date" and error_of(lib.return_book, "bob", "i2", 12) == "ValueError: Not borrowed"
lib.return_book("ann", "i2", 25)
assert lib.available("i2") == 1 and lib.loans_of("ann") == [("i3", 19), ("i1", 24)] and lib.borrow("bob", "i2", 31) == 45
assert lib.title_of("i2") == "Emma" and error_of(lib.available, "zzz") == "ValueError: Unknown book" and error_of(lib.loans_of, "zed") == "ValueError: Unknown member"
"""

FINES = r"""fine_lib = Library()
for isbn, title, copies in (("i1", "Dune", 1), ("i2", "Emma", 1), ("i3", "Ulysses", 2)):
    fine_lib.add_book(isbn, title, copies)
for name in ("ann", "bob", "cy"):
    fine_lib.join(name)
assert fine_lib.fines("ann") == 0 and error_of(fine_lib.fines, "zed") == "ValueError: Unknown member"
assert fine_lib.borrow("ann", "i1", 10) == 24
assert fine_lib.return_book("ann", "i1", 24) == 0 and fine_lib.fines("ann") == 0
assert fine_lib.borrow("ann", "i1", 30) == 44
assert fine_lib.return_book("ann", "i1", 45) == 25 and fine_lib.fines("ann") == 25
assert fine_lib.borrow("ann", "i2", 50) == 64
assert fine_lib.return_book("ann", "i2", 74) == 250 and fine_lib.fines("ann") == 275
assert fine_lib.borrow("ann", "i1", 0) == 14 and fine_lib.return_book("ann", "i1", 3) == 0
assert error_of(fine_lib.pay, "zed", 5) == "ValueError: Unknown member"
assert error_of(fine_lib.pay, "zed", 0) == "ValueError: Unknown member"
for bad in (0, -5, 1.5, True, None):
    assert error_of(fine_lib.pay, "ann", bad) == "ValueError: Amount must be positive"
assert error_of(fine_lib.pay, "ann", 276) == "ValueError: Amount exceeds fines" and fine_lib.fines("ann") == 275
assert fine_lib.pay("ann", 100) == 175 and fine_lib.fines("ann") == 175
assert fine_lib.borrow("ann", "i3", 100) == 114
assert fine_lib.return_book("ann", "i3", 134) == 500 and fine_lib.fines("ann") == 675
assert error_of(fine_lib.borrow, "ann", "i1", 140) == "ValueError: Fines too high"
assert error_of(fine_lib.borrow, "ann", "nope", 140) == "ValueError: Unknown book"
assert error_of(fine_lib.borrow, "zed", "i1", 140) == "ValueError: Unknown member"
assert fine_lib.pay("ann", 175) == 500
assert error_of(fine_lib.borrow, "ann", "i1", 140) == "ValueError: Fines too high"
assert fine_lib.pay("ann", 1) == 499
assert fine_lib.borrow("ann", "i1", 140) == 154
assert fine_lib.borrow("bob", "i3", 200) == 214
assert fine_lib.renew("bob", "i3", 205) == 228
assert fine_lib.loans_of("bob") == [("i3", 228)]
assert error_of(fine_lib.renew, "bob", "i3", 206) == "ValueError: Already renewed"
assert fine_lib.return_book("bob", "i3", 230) == 50 and fine_lib.fines("bob") == 50
assert fine_lib.borrow("cy", "i3", 300) == 314
assert error_of(fine_lib.renew, "cy", "i3", 315) == "ValueError: Overdue"
assert fine_lib.renew("cy", "i3", 314) == 328
assert error_of(fine_lib.renew, "cy", "i2", 300) == "ValueError: Not borrowed"
assert error_of(fine_lib.renew, "zed", "i3", 300) == "ValueError: Unknown member"
assert error_of(fine_lib.renew, "cy", "nope", 300) == "ValueError: Unknown book"
assert error_of(fine_lib.renew, "cy", "i3", -1) == "ValueError: Bad date"
assert error_of(fine_lib.renew, "cy", "i3", 330) == "ValueError: Already renewed"
assert fine_lib.return_book("cy", "i3", 327) == 0 and fine_lib.fines("cy") == 0
late = Library()
late.add_book("x", "X")
late.add_book("y", "Y")
late.join("m")
late.borrow("m", "x", 0)
late.renew("m", "x", 14)
assert late.return_book("m", "x", 29) == 25 and late.fines("m") == 25
late.borrow("m", "x", 30)
late.borrow("m", "y", 30)
late.return_book("m", "y", 130)
assert late.fines("m") >= 500 and error_of(late.borrow, "m", "x", 131) == "ValueError: Fines too high"
"""

MINI = r"""mini = Library()
mini.add_book("x", "X")
mini.join("m")
mini.borrow("m", "x", 0)
assert mini.renew("m", "x", 5) == 28 and error_of(mini.renew, "m", "x", 15) == "ValueError: Already renewed"
assert mini.return_book("m", "x", 29) == 25 and mini.fines("m") == 25 and mini.pay("m", 25) == 0
big = Library()
big.add_book("x", "X", 2)
big.add_book("y", "Y")
big.join("m")
big.borrow("m", "x", 0)
big.return_book("m", "x", 30)
assert big.fines("m") == 400 and big.borrow("m", "y", 31) == 45
big.return_book("m", "y", 45 + 5)
assert big.fines("m") == 525 and error_of(big.borrow, "m", "x", 60) == "ValueError: Fines too high"
edge = Library()
edge.add_book("x", "X")
edge.join("m")
edge.borrow("m", "x", 0)
assert error_of(edge.renew, "m", "x", 15) == "ValueError: Overdue"
edge.return_book("m", "x", 34)
assert edge.fines("m") == 500 and error_of(edge.borrow, "m", "x", 35) == "ValueError: Fines too high" and error_of(edge.pay, "m", 501) == "ValueError: Amount exceeds fines" and edge.pay("m", 1) == 499 and edge.borrow("m", "x", 36) == 50
"""

RES = r"""r = Library()
r.add_book("i1", "Dune")
r.add_book("i2", "Emma", 2)
for name in ("ann", "bob", "cy", "dee"):
    r.join(name)
assert r.queue("i1") == [] and r.holds("i1") == [] and error_of(r.queue, "zzz") == "ValueError: Unknown book" and error_of(r.holds, "zzz") == "ValueError: Unknown book"
assert r.borrow("ann", "i1", 0) == 14
assert error_of(r.reserve, "zed", "i1") == "ValueError: Unknown member" and error_of(r.reserve, "bob", "zzz") == "ValueError: Unknown book"
assert error_of(r.reserve, "ann", "i1") == "ValueError: Already borrowed" and error_of(r.reserve, "dee", "i2") == "ValueError: Copies available"
assert r.reserve("bob", "i1") == 1 and r.reserve("cy", "i1") == 2 and r.queue("i1") == ["bob", "cy"] and r.holds("i1") == [] and r.available("i1") == 0
assert error_of(r.reserve, "bob", "i1") == "ValueError: Already reserved" and r.queue("i1").append("junk") is None and r.queue("i1") == ["bob", "cy"]
assert r.return_book("ann", "i1", 10) == 0 and r.holds("i1") == ["bob"] and r.queue("i1") == ["cy"] and r.available("i1") == 0
assert error_of(r.borrow, "cy", "i1", 11) == "ValueError: No copies available" and error_of(r.borrow, "dee", "i1", 11) == "ValueError: No copies available"
assert error_of(r.reserve, "bob", "i1") == "ValueError: Already reserved" and error_of(r.cancel_reservation, "dee", "i1") == "ValueError: No reservation"
assert error_of(r.cancel_reservation, "zed", "i1") == "ValueError: Unknown member" and error_of(r.cancel_reservation, "bob", "zzz") == "ValueError: Unknown book"
assert r.holds("i1").append("junk") is None and r.holds("i1") == ["bob"]
assert r.borrow("bob", "i1", 11) == 25 and r.holds("i1") == [] and r.queue("i1") == ["cy"] and r.available("i1") == 0 and r.loans_of("bob") == [("i1", 25)]
assert r.return_book("bob", "i1", 12) == 0 and r.holds("i1") == ["cy"] and r.queue("i1") == []
r.cancel_reservation("cy", "i1")
assert r.holds("i1") == [] and r.available("i1") == 1 and r.borrow("dee", "i1", 13) == 27
assert r.reserve("cy", "i1") == 1 and r.reserve("bob", "i1") == 2
r.cancel_reservation("cy", "i1")
assert r.queue("i1") == ["bob"] and r.reserve("cy", "i1") == 2
assert r.return_book("dee", "i1", 14) == 0 and r.holds("i1") == ["bob"] and r.queue("i1") == ["cy"]
r.cancel_reservation("bob", "i1")
assert r.holds("i1") == ["cy"] and r.queue("i1") == [] and error_of(r.cancel_reservation, "bob", "i1") == "ValueError: No reservation"
r.add_book("i1", "Dune", 2)
assert r.available("i1") == 2 and r.holds("i1") == ["cy"] and r.borrow("cy", "i1", 15) == 29 and r.holds("i1") == []
w = Library()
w.add_book("a", "A")
for name in ("p", "q", "r"):
    w.join(name)
w.borrow("p", "a", 0)
w.reserve("q", "a")
w.reserve("r", "a")
w.add_book("a", "A", 2)
assert w.holds("a") == ["q", "r"] and w.queue("a") == [] and w.available("a") == 0 and error_of(w.reserve, "p", "a") == "ValueError: Already borrowed" and error_of(w.reserve, "q", "a") == "ValueError: Already reserved"
h = Library()
h.add_book("b", "B")
h.add_book("c", "C")
h.join("u")
h.join("v")
h.borrow("u", "c", 0)
h.return_book("u", "c", 30)
h.borrow("u", "c", 31)
h.return_book("u", "c", 50)
h.borrow("v", "b", 51)
h.reserve("u", "b")
h.return_book("v", "b", 52)
assert h.fines("u") == 525 and h.holds("b") == ["u"] and error_of(h.borrow, "u", "b", 53) == "ValueError: Fines too high" and h.holds("b") == ["u"]
assert h.pay("u", 26) == 499 and h.borrow("u", "b", 54) == 68 and h.holds("b") == []
g = Library()
g.add_book("g1", "G1")
for isbn in ("g2", "g3", "g4"):
    g.add_book(isbn, isbn)
g.join("a")
g.join("b")
for isbn in ("g2", "g3", "g4"):
    g.borrow("a", isbn, 0)
g.borrow("b", "g1", 0)
g.reserve("a", "g1")
g.return_book("b", "g1", 1)
assert g.holds("g1") == ["a"] and error_of(g.borrow, "a", "g1", 2) == "ValueError: Loan limit reached" and g.holds("g1") == ["a"]
g.return_book("a", "g2", 3)
assert g.borrow("a", "g1", 3) == 17 and g.holds("g1") == []
"""

STEP2_TESTS = HELPER + REGRESS + FINES
STEP3_TESTS = HELPER + REGRESS + MINI + RES


STEP1_STARTER = r'''class Library:
    LOAN_DAYS = 14
    MAX_LOANS = 3

    def __init__(self):
        ...

    def add_book(self, isbn, title, copies=1):
        ...

    def join(self, member):
        ...

    def title_of(self, isbn):
        ...

    def available(self, isbn):
        ...

    def borrow(self, member, isbn, today):
        """Return the due day."""
        ...

    def return_book(self, member, isbn, today):
        ...

    def loans_of(self, member):
        ...'''

PROBLEMS = [
P(
    slug='lld-library-1', title='Library Lending, Step 1', topic='lld-change-requests', difficulty='intermediate',
    module='lld/13-library-and-vending-machine/README.md',
    description='Step 1 of 3: a lending desk with books and copies, members, a loan limit and fourteen-day loans.',
    statement=r'''This is **step 1 of 3**. Steps 2 and 3 add fines, renewals and reservations to the class you write here, so keep it tidy.

Write a class `Library`. Days are whole numbers (`today` is a day number, `0` or more; anything else, including a `bool`, is `ValueError("Bad date")`).

**Books and members**

- `add_book(isbn, title, copies=1)` adds copies of a book. Checks in order: blank `isbn` (not a string or only spaces) `ValueError("ISBN required")`; blank `title` `ValueError("Title required")`; `copies` not an `int` of 1 or more (not a `bool`) `ValueError("Copies must be positive")`. The ISBN and title are stored **stripped**. Adding a known ISBN adds copies; with a **different title** it is `ValueError("ISBN has a different title")` and nothing changes.
- `join(member)` makes a member. A blank name is `ValueError("Member required")`; a repeated one `ValueError("Already a member")`.
- `title_of(isbn)` and `available(isbn)` (copies not currently on loan). An unknown ISBN is `ValueError("Unknown book")`.

**Lending.** A loan lasts **14 days**: `due = today + 14`. A member may hold at most **3** loans.

- `borrow(member, isbn, today)` returns the due day. Checks in this order: `"Bad date"`, `"Unknown member"`, `"Unknown book"`, `"Already borrowed"` (the member already holds this book), `"Loan limit reached"`, `"No copies available"`.
- `return_book(member, isbn, today)` returns the copy; it returns `None`. Checks: `"Bad date"`, `"Unknown member"`, `"Unknown book"`, `"Not borrowed"`.
- `loans_of(member)` is a **new list** of `(isbn, due)` tuples sorted by due day, then by ISBN. Unknown member `ValueError("Unknown member")`.''',
    starter=STEP1_STARTER,
    tests=STEP1_TESTS, solution=LIB1,
    hints=[
        r'''Keep one dictionary of books (`title`, total `copies`) and one of members, each holding that member's loans as `{isbn: due}`. Copies on the shelf is never stored: it is `copies` minus the number of members holding the ISBN, so it cannot go out of step.''',
        r'''Write tiny helpers `_member(name)`, `_book(isbn)` and `_check_day(today)` that raise the right error. Every public method then starts with the same few lines, in the order the statement lists, and the error order takes care of itself.''',
        r'''Steps 2 and 3 will need *per-loan* data (was it renewed?) and *per-member* data (fines). Notice that "a member's loans" is where both will go, and keep that in one place.''',
    ],
    explanation=r'''**The idea.** A lending desk is two tables, books and members, and a handful of rules about moving a copy between them. The shelf count is **derived** (copies minus loans), never stored, so there is no second number to forget to update.

**The order of checks is the API.** Bad date, unknown member, unknown book, then the rules about *this* borrower and *this* book. Callers (and tests) depend on which error they see when several things are wrong.

**Step 2 and 3 preview.** Step 2 adds money (fines), a renewal and a new reason to refuse a loan. Step 3 adds a queue for books with no copy on the shelf. Code that keeps "what a member holds" in one place and "how many copies are out" in one derived number absorbs both changes with small edits.

**Complexity.** `available` scans the members, O(members); an `out` counter per book makes it O(1) at the price of one more number to keep in step.

**Going further.** Two copies of the same book cannot be told apart here. What would you need to add to record *which* copy a member holds (a barcode)?''',
),
P(
    slug='lld-library-2', title='Library Lending, Step 2', topic='lld-change-requests', difficulty='intermediate',
    module='lld/13-library-and-vending-machine/README.md',
    description='Step 2 of 3: late returns cost money, high fines block new loans, and a loan can be renewed once.',
    statement=r'''This is **step 2 of 3**. The starting code is a working solution to step 1. Everything from step 1 still holds **except where this step changes it**.

**What changes**

- `return_book(member, isbn, today)` now **returns the fine in cents**: `25` for every day after the due day (`max(0, today - due) * 25`), `0` when on time. The fine is added to the member's balance.
- `borrow` has a **new check**: a member whose balance is **500 or more** may not borrow: `ValueError("Fines too high")`. The order is now: `"Bad date"`, `"Unknown member"`, `"Unknown book"`, **`"Fines too high"`**, `"Already borrowed"`, `"Loan limit reached"`, `"No copies available"`.

**What is new**

- `fines(member)` is the member's balance in cents (unknown member `ValueError("Unknown member")`).
- `pay(member, amount)` reduces the balance and returns the new balance. Checks in order: `"Unknown member"`; `amount` not an `int` of 1 or more (not a `bool`) `ValueError("Amount must be positive")`; more than the balance `ValueError("Amount exceeds fines")`.
- `renew(member, isbn, today)` extends a loan by **14 more days from its current due day** (not from today) and returns the new due day. A loan can be renewed **once**. Checks in order: `"Bad date"`, `"Unknown member"`, `"Unknown book"`, `"Not borrowed"`, `"Already renewed"`, then `ValueError("Overdue")` when `today` is **after** the due day (renewing *on* the due day is fine). A renewed loan that is returned late is fined from its **new** due day.

**Example**

```
lib.borrow("ann", "i1", 10)         # due 24
lib.return_book("ann", "i1", 27)    # 3 days late: returns 75
lib.fines("ann")                    # 75
```''',
    starter=LIB1,
    tests=STEP2_TESTS, solution=LIB2,
    hints=[
        r'''A member now has two things: loans and a balance. Change `self._loans[member]` from a plain dict into a record `{"loans": {...}, "fines": 0}`, and let each loan carry `{"due": ..., "renewed": False}`. Everything else reads through those.''',
        r'''Put the new check exactly where the statement puts it, between "unknown book" and "already borrowed". The order of the checks is part of the contract, and the tests pin it.''',
        r'''`renew` adds 14 to the **old due day**, so an early renewal does not waste the days left. Mark the loan as renewed and reject a second renewal; compare `today > due` (not `>=`) for "overdue".''',
    ],
    explanation=r'''**The idea.** This is a change request: new rules arrive for code that already works. What changed in step 1's code:

- a member's record grew from `{isbn: due}` to `{"loans": {...}, "fines": n}`, and each loan from a number to a small dict (two edits where the data is created);
- `return_book` now computes and returns a fine;
- `borrow` gained one guard;
- `fines`, `pay` and `renew` are new methods.

**Money rules in integers.** Fines are whole cents and whole days; `max(0, today - due) * 25` has no floats and no branches.

**Validate, then change.** `pay` checks the amount against the balance before touching it, `renew` checks every refusal before extending. A refused call changes nothing.

**Why renew from the due day.** Renewing early must not shorten the borrower's time. Adding 14 to the current due day gives the extension the rules promise, and an overdue loan cannot be renewed at all, so the fine rule stays simple.

**Complexity.** All new operations are O(1) except `available`, unchanged from step 1.

**Going further.** Fines that grow without limit are rarely allowed: add a cap per loan (for example the price of the book). Where would it go, and which test would you write first?''',
),
P(
    slug='lld-library-3', title='Library Lending, Step 3', topic='lld-change-requests', difficulty='advanced',
    module='lld/13-library-and-vending-machine/README.md',
    description='Step 3 of 3: members queue for books that are out, a returned copy is held for the first in line, and holds survive other rules.',
    statement=r'''This is **step 3 of 3**. The starting code is a working solution to step 2. Everything holds **except where this step changes it**.

**New idea: reservations.** A member can queue for a book that has **no copy available**. When a copy comes back, it is **held** for the first member in the queue until they borrow it (or cancel).

**What changes**

- `available(isbn)` is now copies **minus loans minus holds**: a copy that is held for someone is not available to anybody else.
- `borrow` : a member who has a **hold** on the book borrows it **even though `available` is 0** (the hold is used up). Everyone else still needs `available >= 1`. All other checks and their order are unchanged (fines, already borrowed and the loan limit are checked **before** the hold is used, and a refused `borrow` keeps the hold).
- `return_book` and `add_book` (new copies) hand copies to the queue: while the queue is not empty and a copy is available, the **first** queued member gets a hold.

**What is new**

- `reserve(member, isbn)` puts the member at the end of the queue and returns their **position** (1 for the first). Checks in order: `"Unknown member"`, `"Unknown book"`, `"Already borrowed"` (they hold a loan of it), `"Already reserved"` (they are queued or hold a hold), then `ValueError("Copies available")` when `available(isbn) > 0` (they should simply borrow).
- `cancel_reservation(member, isbn)` leaves the queue or gives up a hold (the copy passes to the next in line, or becomes available). Checks: `"Unknown member"`, `"Unknown book"`, then `ValueError("No reservation")`.
- `queue(isbn)` is a **new list** of the members still waiting; `holds(isbn)` is a **new list** of the members holding a copy for them. Unknown ISBN `"Unknown book"`.''',
    starter=LIB2,
    tests=STEP3_TESTS, solution=LIB3,
    hints=[
        r'''Add two dictionaries: `queues[isbn]` (members waiting, oldest first) and `holds[isbn]` (members who have a copy put aside). `available` just subtracts `len(holds[isbn])` as well.''',
        r'''Write **one** helper, `_assign_holds(isbn)`: while the queue is not empty and `available(isbn) > 0`, move the first queued member into the holds. Call it from `return_book`, from `add_book` and from cancelling a hold: three events, one rule.''',
        r'''In `borrow`, run every existing refusal first (fines, already borrowed, loan limit). Only then, if the member is in `holds[isbn]`, remove the hold and go ahead; otherwise require `available >= 1`. A refused borrow must leave the hold in place.''',
    ],
    explanation=r'''**The idea.** A reservation queue changes one number (what "available" means) and adds two lists. The rest of the class is untouched; step 1's rules and step 2's money rules still hold, and the tests re-check them.

```mermaid
flowchart TD
    R[copy returned or added] --> Q{queue empty?}
    Q -- yes --> A[copy is available]
    Q -- no --> H[first in queue gets a hold]
    H --> B[holder borrows: hold used up]
    H --> C[holder cancels: next in line or available]
```

**One helper keeps three events consistent.** A copy can become free in three ways: returned, newly added, or released by a cancelled hold. If each way assigned holds on its own, one of them would be forgotten. `_assign_holds` is the single place where "a free copy meets a waiting member".

**A hold is not a loan.** The copy sits on the shelf but nobody else can have it. That is why `available` subtracts holds, and why a refused `borrow` (fines too high, loan limit) must leave the hold alone: the member did not give it up.

**Looking back.** Three steps, one class, no rewrite. Each step touched the data in one place and the rules in a few; the order of the checks stayed a contract all the way.

**Complexity.** `available` is O(members); the queue operations are O(queue).

**Going further.** Holds that never get collected block the next person for ever. Add an expiry (a hold lasts 3 days). Which methods now need to know what day it is?''',
),
]
