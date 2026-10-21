# Database Schema Design — BillMate MVP

**Source of truth:** `PRD.md`
**Target:** PostgreSQL
**Status:** design document only — no Prisma schema, no application code, no migration files yet.

**Global conventions:**
- Primary keys: `BIGINT GENERATED ALWAYS AS IDENTITY`.
- Timestamps: `TIMESTAMPTZ NOT NULL DEFAULT now()` (`created_at`; `updated_at` maintained by the app).
- Money: `NUMERIC(15,2)` (Decimal). **Never FLOAT/DOUBLE.**
- Statuses: `TEXT` + `CHECK` constraint (easier to alter than native ENUMs for an MVP).
- Deletes: `ON DELETE RESTRICT` by default (prevents accidental data loss); `InvoiceItem → Invoice` is `CASCADE`.
- Every business-data query is scoped to the authenticated user via `user_id` (see Scoping rule).

---

## Relationships

```
User 1 ── 1 BusinessProfile
User 1 ── N Customer
User 1 ── N Project        Customer 1 ── N Project
User 1 ── N Invoice        Project 1 ── N Invoice
Invoice 1 ── N InvoiceItem
Invoice 1 ── N Payment
User 1 ── N Expense        Project 1 ── N Expense
```

- Project belongs to one Customer and one User.
- Invoice belongs to one Project and one User.
- InvoiceItem belongs to one Invoice.
- Payment belongs to one Invoice.
- Expense belongs to one Project and one User.

---

## 1. User

| Field | Type | Nullable | Constraints / Default |
|-------|------|----------|------------------------|
| id | BIGINT | NOT NULL | PRIMARY KEY |
| email | TEXT | NOT NULL | UNIQUE |
| password_hash | TEXT | NOT NULL | credentials auth only (no OAuth) |
| full_name | TEXT | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |

**Indexes:** unique index on `email` (implied by UNIQUE).

## 2. BusinessProfile

| Field | Type | Nullable | Constraints / Default |
|-------|------|----------|------------------------|
| id | BIGINT | NOT NULL | PRIMARY KEY |
| user_id | BIGINT | NOT NULL | FOREIGN KEY → User(id), UNIQUE (one profile per user) |
| business_name | TEXT | NOT NULL | |
| address | TEXT | NULL | |
| phone | TEXT | NULL | |
| email | TEXT | NULL | |
| tax_id | TEXT | NULL | e.g., NPWP |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |

**Indexes:** `user_id` (unique).

## 3. Customer

| Field | Type | Nullable | Constraints / Default |
|-------|------|----------|------------------------|
| id | BIGINT | NOT NULL | PRIMARY KEY |
| user_id | BIGINT | NOT NULL | FOREIGN KEY → User(id) |
| name | TEXT | NOT NULL | |
| phone | TEXT | NULL | |
| email | TEXT | NULL | |
| address | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |

**Indexes:** `user_id`; `(user_id, created_at)`.

## 4. Project

| Field | Type | Nullable | Constraints / Default |
|-------|------|----------|------------------------|
| id | BIGINT | NOT NULL | PRIMARY KEY |
| user_id | BIGINT | NOT NULL | FOREIGN KEY → User(id) |
| customer_id | BIGINT | NOT NULL | FOREIGN KEY → Customer(id) |
| name | TEXT | NOT NULL | |
| project_value | NUMERIC(15,2) | NOT NULL | Decimal, IDR |
| start_date | DATE | NOT NULL | |
| end_date | DATE | NULL | |
| status | TEXT | NOT NULL | DEFAULT 'PLANNED'; CHECK IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED') |
| notes | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |

**Indexes:** `user_id`; `customer_id`; `(user_id, status)`.

## 5. Invoice

| Field | Type | Nullable | Constraints / Default |
|-------|------|----------|------------------------|
| id | BIGINT | NOT NULL | PRIMARY KEY |
| user_id | BIGINT | NOT NULL | FOREIGN KEY → User(id) |
| project_id | BIGINT | NOT NULL | FOREIGN KEY → Project(id) |
| invoice_number | TEXT | NOT NULL | UNIQUE per user: UNIQUE (user_id, invoice_number) |
| issue_date | DATE | NOT NULL | DEFAULT CURRENT_DATE |
| due_date | DATE | NOT NULL | used to derive overdue at read time |
| status | TEXT | NOT NULL | DEFAULT 'UNPAID'; CHECK IN ('UNPAID','PARTIALLY_PAID','PAID') |
| tax_rate | NUMERIC(5,2) | NOT NULL | DEFAULT 0 — tax configurable per invoice |
| subtotal | NUMERIC(15,2) | NOT NULL | Decimal |
| tax_amount | NUMERIC(15,2) | NOT NULL | DEFAULT 0 — Decimal |
| total | NUMERIC(15,2) | NOT NULL | Decimal |
| notes | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |

**Indexes:** `user_id`; `project_id`; `(user_id, status)`; `(user_id, invoice_number)` (unique).

**Derived (never stored):** `OVERDUE = (status != 'PAID') AND (due_date < CURRENT_DATE)` — computed at read time.

## 6. InvoiceItem

| Field | Type | Nullable | Constraints / Default |
|-------|------|----------|------------------------|
| id | BIGINT | NOT NULL | PRIMARY KEY |
| invoice_id | BIGINT | NOT NULL | FOREIGN KEY → Invoice(id), ON DELETE CASCADE |
| description | TEXT | NOT NULL | |
| quantity | NUMERIC(12,2) | NOT NULL | DEFAULT 1 |
| unit_price | NUMERIC(15,2) | NOT NULL | Decimal |
| amount | NUMERIC(15,2) | NOT NULL | Decimal line total |
| sort_order | INTEGER | NOT NULL | DEFAULT 0 |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |

**Indexes:** `invoice_id`.

## 7. Payment

| Field | Type | Nullable | Constraints / Default |
|-------|------|----------|------------------------|
| id | BIGINT | NOT NULL | PRIMARY KEY |
| invoice_id | BIGINT | NOT NULL | FOREIGN KEY → Invoice(id), ON DELETE RESTRICT |
| amount | NUMERIC(15,2) | NOT NULL | Decimal, IDR — recorded, not processed (no gateway) |
| payment_date | DATE | NOT NULL | DEFAULT CURRENT_DATE |
| method | TEXT | NULL | e.g., transfer, cash |
| notes | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |

**Indexes:** `invoice_id`.

## 8. Expense

| Field | Type | Nullable | Constraints / Default |
|-------|------|----------|------------------------|
| id | BIGINT | NOT NULL | PRIMARY KEY |
| user_id | BIGINT | NOT NULL | FOREIGN KEY → User(id) |
| project_id | BIGINT | NOT NULL | FOREIGN KEY → Project(id) |
| description | TEXT | NOT NULL | |
| amount | NUMERIC(15,2) | NOT NULL | Decimal, IDR |
| date | DATE | NOT NULL | |
| category | TEXT | NOT NULL | free text (no enum in MVP) |
| notes | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |

**Indexes:** `user_id`; `project_id`; `(user_id, date)`.

---

## Scoping rule

Every business-data query must include the authenticated user:

- Root entities (`Customer`, `Project`, `Invoice`, `Expense`): filter directly on `user_id`.
- Child entities (`InvoiceItem`, `Payment`): scope through the parent — join `Invoice` and filter on `invoice.user_id`.

## Business-rule checklist

- Project → one Customer, one User ✔
- Invoice → one Project, one User ✔
- InvoiceItem → one Invoice ✔
- Payment → one Invoice ✔
- Expense → one Project, one User ✔
- All money `NUMERIC` (Decimal), never floating point ✔
- Invoice status only `UNPAID`, `PARTIALLY_PAID`, `PAID` (CHECK) ✔
- `OVERDUE` derived at read time, never stored ✔
- Invoice number unique per user: `UNIQUE (user_id, invoice_number)` ✔
- All queries scoped to authenticated user ✔

**Deliberately excluded (per PRD):** payroll, inventory, payment-gateway tables, multi-user organization tables, OAuth tables, soft-delete columns.
