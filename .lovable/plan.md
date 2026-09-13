# Refine Patient Entry test workspace

## Goal
Keep the approved three-zone Patient Entry/Edit layout, but replace the busy stacked lab compartments with a calm single-category test browser. Preserve every existing patient, payment, billing, bill-generation, ledger, and save behavior.

## Changes
- Add a compact category selector showing In-House and each dynamic outsourced lab with its available-test count.
- Show only the active category’s heading, independent search, selected count, and test list in one generous scroll area.
- Preserve each category’s search while switching categories; searches continue matching test name, code, and lab name.
- Keep selections stable across categories and keep the existing checkbox/remove behavior and totals unchanged.
- Expand the right review rail so several selected tests are comfortably visible, with Billing fixed beneath the selected list.
- Keep Payment Transactions full-width below the three-column workspace without changing its controls or behavior.
- Keep the footer always visible, including Cancel, Save/Update, Generate Bill, and existing View Bill/Reprint Bill actions.

## Technical details
- Change only `src/components/patient-form-dialog.tsx` and the task checklist.
- Reuse the existing `testGroups`, `testSearches`, `selectedTests`, `toggleTest`, total/net calculations, payment component, and `BillActions` component.
- Add active-category UI state that resets safely when the window opens or catalogue categories change.
- Use one controlled scrollbar for the active test list and one only for long selected-test lists; remove per-lab scrolling.
- Verify type safety and exercise category switching, per-category search, cross-category selection/removal, billing updates, payment controls, Save/Cancel, and Generate/View/Reprint bill visibility in the running preview.
