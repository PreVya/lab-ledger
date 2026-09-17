# Roadmap

- [x] Payment fix (canonical payment rows, transactions UI, Balance Received)
- [x] WhatsApp report required flag (schema + migration + form)
- [x] Outsourced report ready flag (schema + migration + form)
- [x] Salutation dropdown (Mast./Mr./Miss./Mrs.) merged into patient name
- [x] Latest-entry-only hard delete (backend guard + endpoint + ledger delete icon + demo mode)
- [x] Category-wise patient test selection with independent searches and selected-tests review
- [x] Patient test workspace refinement with one active category, spacious review, and preserved bill actions
- [x] Patient Entry/Edit dashboard split layout with balanced details, tests, selection, billing, and payments
- [x] Patient Entry/Edit sizing refinement with visible registration flags, taller selected tests, and compact billing
- [x] Patient Entry/Edit regression fix with strict workspace, payments, and footer layout flow
- [x] Patient Entry/Edit visibility fix for selected-test scrolling, both report toggles, and bill actions

- [x] Phase 4 — Tea/Coffee module: rates (tea Rs.10, coffee Rs.20), daily consumption entries (no ledger impact), monthly bill with snapshot on payment, Mark as Paid creates exactly one cash Expense on the real paid date (may fall in a later month), duplicate-payment protection, Tea/Coffee nav tab. Migration: phase_4_tea_coffee_module (run `yarn prisma migrate deploy` in backend/).

- [x] Phase 4 Analytics (first 8 reports): /analytics tab, date-range filter, summary cards, business vs collection, payment mode split, advance/balance split, daily/weekly/monthly collection tabs. Collection from Payment rows only; business/discount from Patient rows; DailyLedger balances never read. No migration required.
