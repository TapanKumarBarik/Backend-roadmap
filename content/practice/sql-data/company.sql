-- A company: its departments and its employees, each with the employee they report to. Dates are text, YYYY-MM-DD.
-- Made by scripts/dev/make-sql-data.py: do not edit by hand.

CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT INTO departments VALUES
  (1, 'Engineering'),
  (2, 'Product'),
  (3, 'Sales'),
  (4, 'Support'),
  (5, 'Legal');

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  dept_id INTEGER REFERENCES departments(id),  -- NULL for people in no department
  manager_id INTEGER REFERENCES employees(id),  -- NULL for the head of the company
  salary INTEGER NOT NULL,
  hired_on TEXT NOT NULL
);
INSERT INTO employees VALUES
  (1, 'Maya Chen', NULL, NULL, 250000, '2019-01-10'),
  (2, 'Omar Haddad', 1, 1, 190000, '2019-03-04'),
  (3, 'Priya Nair', 2, 1, 185000, '2019-06-17'),
  (4, 'Lucas Meyer', 3, 1, 170000, '2020-02-01'),
  (5, 'Sofia Rossi', 1, 2, 150000, '2020-05-11'),
  (6, 'Ethan Brooks', 1, 5, 120000, '2021-01-18'),
  (7, 'Aiko Tanaka', 1, 5, 120000, '2021-04-26'),
  (8, 'Noah Kim', 1, 5, 105000, '2022-09-05'),
  (9, 'Zara Ali', 1, 5, 155000, '2020-11-23'),
  (10, 'Hugo Martin', 2, 3, 98000, '2022-02-14'),
  (11, 'Isla Novak', 2, 3, 112000, '2021-08-30'),
  (12, 'Mateo Silva', 3, 4, 90000, '2022-06-06'),
  (13, 'Chloe Dubois', 3, 4, 90000, '2023-01-09'),
  (14, 'Ravi Patel', 3, 4, 85000, '2023-04-17'),
  (15, 'Elena Popov', 4, 3, 80000, '2021-10-11'),
  (16, 'Tom Becker', 4, 15, 62000, '2023-07-03'),
  (17, 'Nina Costa', 4, 15, 60000, '2024-02-12'),
  (18, 'Felix Wagner', NULL, 2, 70000, '2024-05-20');
