# PRD — BillMate

**Status:** MVP execution approved (moved out of discovery on 2026-10-06)
**Deadline:** 2026-10-31
**Team:** 1 student developer
**Stack:** existing Next.js + TypeScript app (keep architecture simple; single monolithic app)
**Evidence base:** `docs/discovery/` (interview note, problem hypotheses, hypothesis priority, interview guide, evidence matrix, segment hypotheses, problem-space map, preliminary problem synthesis)

---

## 1. Confirmed Evidence

From one interview (father-in-law — landscape architect, landscape & plant business):
- Projects can reach hundreds of millions of rupiah in value.
- Administration is still recorded mostly manually.
- Administrative recording errors have occurred.

**Caveat:** evidence is limited to a single interview; no documents or error samples were reviewed. Facts are not yet generalized beyond this one business.

## 2. Problem Hypothesis (unvalidated)

**Core hypothesis:** manual administrative recording in project-based businesses can lead to recording errors and make project financial status difficult to track.

Supporting logic (from `hypothesis-priority.md`): exposure is total (all administration is manual), errors have occurred, and high project values amplify the cost of each error. Root cause of the observed errors is still unknown (H2).

**Decision:** proceed to MVP now. Additional interviews may happen later but are no longer a blocker.

## 3. Product Assumptions (unvalidated)

- **A1:** manual recording is the primary error mechanism (vs. ownership or missing verification).
- **A2:** errors are material relative to project value (no loss amounts documented yet).
- **A3:** error frequency and impact are high enough to justify a tool.
- **A4:** the pattern extends beyond the one interviewed business (wedding vendors, UI/UX agencies untested).
- **A5:** software can realistically reduce these errors in this context.
- **A6:** centering the MVP on the Project object addresses the core pain.
- **A7:** credentials-based authentication (no OAuth, no multi-user organization) suffices for the MVP.
- **A8:** a manual WhatsApp reminder flow is acceptable without the WhatsApp Business API.
- **A9:** tax configured per invoice covers MVP needs.
- **A10:** a single simple monolith is sufficient; no integration requirements yet.

## 4. Product Definition

**BillMate** is an administrative and financial management system for high-value, project-based businesses. The MVP centers the **Project** as the main business object.

**Core relationships:**

```
Customer → Projects
Project → Invoices
Invoice → Payments
Project → Expenses
```

## 5. MVP Scope

**Modules (10):**

1. Authentication (credentials only)
2. Business Profile
3. Customer Management
4. Project Management
5. Invoice Management
6. Payment Tracking
7. Project Expense Tracking
8. Dashboard
9. Basic Reports
10. WhatsApp Payment Reminder (manual flow — see below)

**Project (MVP fields, fixed):**
- project name
- customer
- project value
- start date
- end date
- status — `PLANNED` | `IN_PROGRESS` | `COMPLETED` | `CANCELLED`
- notes

**Expense (MVP fields, fixed):**
- project
- description
- amount
- date
- category
- notes

**Other entities (minimal; detailed fields to be defined during implementation, not in this PRD):**
- Customer: minimal record (name, contact details — TBD)
- Invoice: linked to project; **tax configurable per invoice**; **overdue is derived at read time, not stored** (TBD fields)
- Payment: linked to invoice (TBD fields)

**Conventions:**
- Currency: IDR.
- Money: Decimal.
- No payment gateway — payments are recorded, not processed.

**WhatsApp Payment Reminder (assumption A8):** manual flow only — e.g., compose/copy a reminder or open WhatsApp via a `wa.me` link. No automated sending, no WhatsApp Business API.

**Build sequencing (proposal for the one-month deadline):**
1. Auth, Business Profile, Customer, Project (core CRUD + relationships)
2. Invoice, Payment, Expense
3. Dashboard, Basic Reports
4. WhatsApp Payment Reminder (stretch)

## 6. Out of Scope (explicit)

- Full accounting system
- Full project-management / ERP system
- Payroll
- Inventory
- Payment gateway
- WhatsApp Business API
- Multi-user organization system
- OAuth

## 7. Open Items

- Detailed field definitions for Customer, Invoice, and Payment (TBD during implementation).
- Validation of assumptions A1–A5 (interviews may follow; not a blocker).
- Success metrics TBD.

**Not included in this PRD:** database schema and API specifications are deliberately not defined yet.
