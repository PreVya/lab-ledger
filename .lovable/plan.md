# Category-wise patient test selection

## Goal
Redesign only the Tests area in the Patient Entry/Edit window so a large catalogue is faster to browse, search, select, and verify. Existing patient details, tracking flags, Billing, Payment Transactions, saving, and calculations remain unchanged.

## Changes
- Replace the single mixed test list and global filter with dynamic compartments:
  - In-House Tests
  - One compartment per outsourced lab name already present in the catalogue
  - A fallback Outsourced Tests compartment only when an outsourced test has no lab name
- Give every compartment its own independent search field matching test name, test code, and lab name.
- Keep each compartment readable with a checkbox, test name, category/lab badge, optional code badge, and right-aligned rate.
- Add a distinct Selected Tests compartment that updates immediately and shows only test name, category/lab, rate, and a remove action—never a test code.
- Keep selections stable while searching; removing a selected test also clears its checkbox and immediately updates the existing Billing totals.
- Use a spacious responsive layout without dead space: category compartments receive the main width, while Selected Tests remains easy to review and adapts cleanly on narrower screens.

## Technical details
- Change only `src/components/patient-form-dialog.tsx` plus the task checklist.
- Derive categories from the existing `TestCatalog` fields (`outsourced`, `outsourcedLab`, `testCode`) with no backend, schema, migration, or catalogue-data changes.
- Preserve the existing `selectedTests`, `toggleTest`, total/net calculation, save payload, and Payment Transactions implementation.
- Reset compartment searches when the patient window opens to prevent stale filters between patients.
- Verify type safety and exercise New/Edit Patient interactions in the running preview, including independent searches, selection/removal, billing updates, and unchanged payment controls.
