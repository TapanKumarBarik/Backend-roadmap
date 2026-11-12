"""Writes the data the SQL practice problems run on: content/practice/sql-data/<dataset>.sql, one file of CREATE TABLE and INSERT statements for each dataset.

    python scripts/dev/make-sql-data.py

The data is small enough to read (a few hundred rows at most), invented, and seeded, so running this again writes the same files. It has the things SQL
problems are about on purpose: customers with no orders, a product nobody bought, NULLs, ties in a number, an employee with no manager, a department with
nobody in it. The files are committed: change a dataset here, run this, then re-run `node scripts/check/check-sql-problems.mjs --write` so every
problem's expected tables follow.
"""
import os
import random
from datetime import date, datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'content', 'practice', 'sql-data')


def sql(value):
    """A Python value as a SQL literal."""
    if value is None:
        return 'NULL'
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def table(name, columns, rows, per_line=1):
    """CREATE TABLE (columns: 'name TYPE ...' strings) and one INSERT with a line for each row."""
    lines = []
    for i, column in enumerate(columns):
        spec, _, note = column.partition('  -- ')                       # a note after the column goes after the comma that ends it
        lines.append('  ' + spec + (',' if i < len(columns) - 1 else '') + (f'  -- {note}' if note else ''))
    head = f"CREATE TABLE {name} (\n" + "\n".join(lines) + "\n);\n"
    body = f"INSERT INTO {name} VALUES\n" + ",\n".join("  (" + ", ".join(sql(v) for v in row) + ")" for row in rows) + ";\n"
    return head + body


def write(name, parts, about):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name + '.sql'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(f"-- {about}\n-- Made by scripts/dev/make-sql-data.py: do not edit by hand.\n\n" + "\n".join(parts))
    print('wrote', name)


# ------------------------------------------------------------------------------------------------------------------------------- shop
def shop():
    rng = random.Random(11)
    names = ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Linus Torvalds', 'Margaret Hamilton', 'Dennis Ritchie', 'Barbara Liskov',
             'Ken Thompson', 'Radia Perlman', 'Tim Berners-Lee', 'Donald Knuth', 'Edsger Dijkstra', 'Frances Allen', 'John McCarthy']
    countries = ['US', 'DE', 'IN', 'BR', 'JP', 'GB', 'US', 'DE', 'IN', None, 'US', 'JP', None, 'GB']
    customers = []
    for i, name in enumerate(names, start=1):
        email = None if i in (4, 9, 12) else name.lower().replace(' ', '.') + '@example.com'
        customers.append((i, name, email, countries[i - 1], (date(2024, 1, 5) + timedelta(days=rng.randint(0, 300))).isoformat()))
    products = [
        (1, 'Pro Keyboard', 'electronics', 89.0), (2, 'Pocket Notebook', 'books', 6.5), (3, 'Pro Monitor', 'electronics', 329.0),
        (4, 'Desk Lamp', 'home', 24.99), (5, 'SQL for Developers', 'books', 39.0), (6, 'Wooden Blocks', 'toys', 18.0),
        (7, 'USB Cable', 'electronics', 9.99), (8, 'Coffee Mug', 'home', 12.5), (9, 'Puzzle 1000', 'toys', 24.99),
        (10, 'Backend Handbook', 'books', 45.0), (11, 'Standing Desk', 'home', 399.0), (12, 'Pro Mouse', 'electronics', 59.0)]
    orderable = [p for p in products if p[0] != 11]            # nobody buys the standing desk
    buyers = list(range(1, 13))                                  # customers 13 and 14 never order
    orders, items = [], []
    day = date(2025, 1, 3)
    for order_id in range(1, 41):
        day += timedelta(days=rng.choice([0, 1, 2, 3, 4, 5]))
        status = rng.choices(['paid', 'shipped', 'cancelled', 'refunded'], [55, 25, 12, 8])[0]
        customer = rng.choice(buyers[:8]) if rng.random() < 0.6 else rng.choice(buyers)     # a few customers order often
        orders.append((order_id, customer, day.isoformat(), status))
        for product in rng.sample(orderable, rng.choice([1, 1, 2, 2, 3])):
            price = product[3] if rng.random() < 0.85 else round(product[3] * 0.9, 2)
            items.append((order_id, product[0], rng.choice([1, 1, 1, 2, 3]), price))
    return write('shop', [
        table('customers', ['id INTEGER PRIMARY KEY', 'name TEXT NOT NULL', 'email TEXT', 'country TEXT', 'signed_up TEXT'], customers),
        table('products', ['id INTEGER PRIMARY KEY', 'name TEXT NOT NULL', 'category TEXT NOT NULL', 'price REAL NOT NULL'], products),
        table('orders', ['id INTEGER PRIMARY KEY', 'customer_id INTEGER NOT NULL REFERENCES customers(id)', 'ordered_at TEXT NOT NULL', "status TEXT NOT NULL  -- paid, shipped, cancelled or refunded"], orders),
        table('order_items', ['order_id INTEGER NOT NULL REFERENCES orders(id)', 'product_id INTEGER NOT NULL REFERENCES products(id)', 'quantity INTEGER NOT NULL', 'unit_price REAL NOT NULL'], items),
    ], 'An online shop: customers, the products it sells, their orders and what was in each order. Dates are text, YYYY-MM-DD.')


# ---------------------------------------------------------------------------------------------------------------------------- company
def company():
    departments = [(1, 'Engineering'), (2, 'Product'), (3, 'Sales'), (4, 'Support'), (5, 'Legal')]       # Legal has nobody in it
    employees = [
        (1, 'Maya Chen', None, None, 250000, '2019-01-10'), (2, 'Omar Haddad', 1, 1, 190000, '2019-03-04'), (3, 'Priya Nair', 2, 1, 185000, '2019-06-17'),
        (4, 'Lucas Meyer', 3, 1, 170000, '2020-02-01'), (5, 'Sofia Rossi', 1, 2, 150000, '2020-05-11'), (6, 'Ethan Brooks', 1, 5, 120000, '2021-01-18'),
        (7, 'Aiko Tanaka', 1, 5, 120000, '2021-04-26'), (8, 'Noah Kim', 1, 5, 105000, '2022-09-05'), (9, 'Zara Ali', 1, 5, 155000, '2020-11-23'),
        (10, 'Hugo Martin', 2, 3, 98000, '2022-02-14'), (11, 'Isla Novak', 2, 3, 112000, '2021-08-30'), (12, 'Mateo Silva', 3, 4, 90000, '2022-06-06'),
        (13, 'Chloe Dubois', 3, 4, 90000, '2023-01-09'), (14, 'Ravi Patel', 3, 4, 85000, '2023-04-17'), (15, 'Elena Popov', 4, 3, 80000, '2021-10-11'),
        (16, 'Tom Becker', 4, 15, 62000, '2023-07-03'), (17, 'Nina Costa', 4, 15, 60000, '2024-02-12'), (18, 'Felix Wagner', None, 2, 70000, '2024-05-20')]
    return write('company', [
        table('departments', ['id INTEGER PRIMARY KEY', 'name TEXT NOT NULL'], departments),
        table('employees', ['id INTEGER PRIMARY KEY', 'name TEXT NOT NULL', 'dept_id INTEGER REFERENCES departments(id)  -- NULL for people in no department', 'manager_id INTEGER REFERENCES employees(id)  -- NULL for the head of the company', 'salary INTEGER NOT NULL', 'hired_on TEXT NOT NULL'], employees),
    ], 'A company: its departments and its employees, each with the employee they report to. Dates are text, YYYY-MM-DD.')


# ----------------------------------------------------------------------------------------------------------------------------- events
def events():
    users = [(1, 'Ada', 'pro', '2025-02-03'), (2, 'Alan', 'free', '2025-02-03'), (3, 'Grace', 'team', '2025-02-04'), (4, 'Linus', 'free', '2025-02-04'),
             (5, 'Margaret', 'pro', '2025-02-05'), (6, 'Dennis', 'free', '2025-02-06'), (7, 'Barbara', 'pro', '2025-02-06'), (8, 'Ken', 'free', '2025-02-07'),
             (9, 'Radia', 'team', '2025-02-07'), (10, 'Tim', 'free', '2025-02-10'), (11, 'Donald', 'free', '2025-02-10'), (12, 'Edsger', 'pro', '2025-02-11')]
    rng = random.Random(23)
    rows = []

    def at(day, hour, minute, second=0):
        return datetime.fromisoformat(day + ' 00:00:00') + timedelta(hours=hour, minutes=minute, seconds=second)

    def add(user, name, when):
        rows.append((user, name, when.strftime('%Y-%m-%d %H:%M:%S')))

    for user_id, _, plan, signed in users:
        add(user_id, 'signup', at(signed, 9 + user_id % 4, rng.randint(0, 59)))
        # how far each user got: some only signed up, some looked at pricing, some started a trial, some bought
        reach = {1: 4, 2: 1, 3: 4, 4: 2, 5: 3, 6: 1, 7: 4, 8: 2, 9: 3, 10: 1, 11: 2, 12: 4}[user_id]
        offset = 0
        if reach >= 2:
            add(user_id, 'view_pricing', at(signed, 10 + user_id % 3, rng.randint(0, 59)))
        if reach >= 3:
            offset = rng.choice([0, 1, 2])
            add(user_id, 'start_trial', at((date.fromisoformat(signed) + timedelta(days=offset)).isoformat(), 14, rng.randint(0, 59)))
        if reach >= 4:
            add(user_id, 'purchase', at((date.fromisoformat(signed) + timedelta(days=offset + rng.choice([3, 5, 9, 12]))).isoformat(), 16, rng.randint(0, 59)))
        # visits: a few logins on different days, in bursts of events a few minutes apart (a session), with a gap of an hour or more between bursts
        for day_offset in sorted(rng.sample(range(0, 14), rng.choice([2, 3, 4, 5]))):
            day = (date.fromisoformat(signed) + timedelta(days=day_offset)).isoformat()
            hour = rng.choice([8, 9, 13, 17, 20])
            start = at(day, hour, rng.randint(0, 40))
            add(user_id, 'login', start)
            for k in range(rng.choice([0, 1, 2, 3])):
                start += timedelta(minutes=rng.choice([2, 4, 9, 12, 25]))
                add(user_id, rng.choice(['export', 'view_pricing', 'export', 'login']), start)
            if rng.random() < 0.3:                                    # a second visit later the same day
                start += timedelta(minutes=rng.choice([31, 45, 90, 240]))
                add(user_id, 'login', start)
    rows = sorted(set(rows), key=lambda r: (r[2], r[0], r[1]))        # no two identical events; ordered by time
    rows = [(i, *row) for i, row in enumerate(rows, start=1)]
    return write('events', [
        table('users', ['id INTEGER PRIMARY KEY', 'name TEXT NOT NULL', "plan TEXT NOT NULL  -- free, pro or team", 'signed_up TEXT NOT NULL'], users),
        table('events', ['id INTEGER PRIMARY KEY', 'user_id INTEGER NOT NULL REFERENCES users(id)', "name TEXT NOT NULL  -- signup, login, view_pricing, start_trial, purchase or export", "at TEXT NOT NULL  -- YYYY-MM-DD HH:MM:SS"], rows),
    ], 'Product analytics: the users of an app, and what they did and when. Times are text, YYYY-MM-DD HH:MM:SS.')


# --------------------------------------------------------------------------------------------------------------------------- llm_calls
def llm_calls():
    rng = random.Random(5)
    models = [('small', 0.0002, 0.0006), ('medium', 0.001, 0.003), ('large', 0.005, 0.015)]
    price = {m[0]: m for m in models}
    features = ['chat', 'search', 'summarize', 'agent']
    base_latency = {'small': 350, 'medium': 900, 'large': 2200}
    calls = []
    day = datetime(2025, 3, 1, 8, 0, 0)
    for call_id in range(1, 121):
        day += timedelta(minutes=rng.randint(20, 400))
        feature = rng.choices(features, [45, 25, 20, 10])[0]
        model = rng.choices(['small', 'medium', 'large'], [30, 50, 20] if feature != 'agent' else [10, 40, 50])[0]
        prompt = rng.choice([180, 420, 900, 1500, 2600, 4200]) + rng.randint(0, 99)
        completion = rng.choice([40, 120, 260, 480, 900]) + rng.randint(0, 49)
        status = rng.choices(['ok', 'error', 'timeout'], [90, 6, 4])[0]
        latency = int(base_latency[model] * rng.uniform(0.5, 2.2) + completion * 2)
        if status == 'timeout':
            latency, completion = 30000, 0
        elif status == 'error':
            latency, completion = rng.randint(50, 400), 0
        cost = round((prompt * price[model][1] + completion * price[model][2]) / 1000, 6) if status == 'ok' else 0.0
        calls.append((call_id, rng.randint(1, 10), feature, model, prompt, completion, latency, status, cost, day.strftime('%Y-%m-%d %H:%M:%S')))
    feedback = []
    for call in calls:
        if call[7] == 'ok' and rng.random() < 0.3:
            rating = 1 if rng.random() < (0.8 if call[2] != 'agent' else 0.55) else -1
            feedback.append((call[0], rating, None if rating == 1 or rng.random() < 0.5 else rng.choice(['too slow', 'wrong answer', 'off topic', 'made things up'])))
    return write('llm_calls', [
        table('models', ['name TEXT PRIMARY KEY', 'input_per_1k REAL NOT NULL  -- dollars per 1,000 prompt tokens', 'output_per_1k REAL NOT NULL  -- dollars per 1,000 completion tokens'], models),
        table('llm_calls', ['id INTEGER PRIMARY KEY', 'user_id INTEGER NOT NULL', "feature TEXT NOT NULL  -- chat, search, summarize or agent", 'model TEXT NOT NULL REFERENCES models(name)', 'prompt_tokens INTEGER NOT NULL', 'completion_tokens INTEGER NOT NULL', 'latency_ms INTEGER NOT NULL', "status TEXT NOT NULL  -- ok, error or timeout", 'cost_usd REAL NOT NULL  -- 0 when the call failed', 'created_at TEXT NOT NULL  -- YYYY-MM-DD HH:MM:SS'], calls),
        table('feedback', ['call_id INTEGER NOT NULL REFERENCES llm_calls(id)', 'rating INTEGER NOT NULL  -- 1 for a thumbs up, -1 for a thumbs down', 'comment TEXT'], feedback),
    ], 'Telemetry of an app that calls language models: every call (who, which feature, which model, tokens, latency, cost) and the feedback some of them got.')


# ----------------------------------------------------------------------------------------------------------------------------- ml_runs
def ml_runs():
    rng = random.Random(41)
    experiments = [(1, 'churn-model', 'classification'), (2, 'search-ranker', 'ranking'), (3, 'demand-forecast', 'forecast')]
    kinds = ['logreg', 'xgboost', 'mlp', 'transformer']
    quality = {'logreg': 0.78, 'xgboost': 0.86, 'mlp': 0.84, 'transformer': 0.88}
    runs = []
    for run_id in range(1, 31):
        experiment = 1 + (run_id - 1) % 3
        kind = kinds[(run_id * 7) % 4]
        learning_rate = rng.choice([0.001, 0.003, 0.01, 0.03, 0.1])
        batch = rng.choice([16, 32, 64, 128])
        failed = run_id in (6, 13, 22, 27)
        accuracy = None if failed else round(quality[kind] - abs(learning_rate - 0.01) * 0.6 + rng.uniform(-0.03, 0.03), 4)
        loss = None if failed else round(1.2 - accuracy + rng.uniform(-0.05, 0.05), 4)
        seconds = rng.randint(40, 900) * (3 if kind == 'transformer' else 1)
        runs.append((run_id, experiment, kind, learning_rate, batch, accuracy, loss, seconds, 'failed' if failed else 'done'))
    metrics = []
    for run_id in range(1, 9):
        loss = 1.0
        turn = [4, 6, None, 5, 3, 8, None, 5][run_id - 1]              # after this epoch the validation loss starts to rise again (overfitting)
        for epoch in range(1, 9):
            if turn is not None and epoch > turn:
                loss += rng.uniform(0.01, 0.05)
            else:
                loss -= rng.uniform(0.05, 0.12)
            metrics.append((run_id, epoch, round(loss, 4)))
    return write('ml_runs', [
        table('experiments', ['id INTEGER PRIMARY KEY', 'name TEXT NOT NULL', 'task TEXT NOT NULL'], experiments),
        table('runs', ['id INTEGER PRIMARY KEY', 'experiment_id INTEGER NOT NULL REFERENCES experiments(id)', 'model TEXT NOT NULL', 'learning_rate REAL NOT NULL', 'batch_size INTEGER NOT NULL', 'val_accuracy REAL  -- NULL when the run failed', 'val_loss REAL  -- NULL when the run failed', 'train_seconds INTEGER NOT NULL', "status TEXT NOT NULL  -- done or failed"], runs),
        table('metrics', ['run_id INTEGER NOT NULL REFERENCES runs(id)', 'epoch INTEGER NOT NULL', 'val_loss REAL NOT NULL'], metrics),
    ], 'Machine learning experiment tracking: experiments, the training runs of each (model, hyperparameters, results) and the validation loss of some runs after every epoch.')


if __name__ == '__main__':
    shop()
    company()
    events()
    llm_calls()
    ml_runs()
