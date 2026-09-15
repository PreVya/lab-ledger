# Resize the Patient Entry window

## Goal
Keep the current Registration / Test Selection / Review placement while making the window near full-screen, keeping registration controls visible, and giving Selected Tests most of the right rail.

## Changes
- Increase the window to about 98vw by 96vh while preserving the fixed header, payment area, and footer.
- Rebalance the three desktop columns to roughly 27% / 46% / 27%.
- Remove scrolling from Registration Details and tighten its field spacing so both report toggles remain visible.
- Keep scrolling limited to the active test list and long Selected Tests lists.
- Make Selected Tests fill the available right-column height and reduce Billing to a compact summary beneath it.
- Leave Payment Transactions and every patient, test, billing, payment, save, ledger, and bill action unchanged.

## Verification
- Check the window at a normal laptop viewport and confirm registration fields and toggles, several selected-test rows, compact billing, payments, and footer actions are visible without overlap.
- Run the existing TypeScript check.
