# Borrowing and Returns Reliability Fix

This update hardens the browser-side borrowing workflow. It does not modify the live Supabase database.

Changes in assets/app.js:
- Prevents duplicate submit attempts while a borrowing request is in progress.
- Validates selected quantities and unique unit IDs before calling create_borrowing.
- Uses local calendar dates for the seven-day due-date validation, avoiding UTC date-boundary shifts.
- Restores the submit button after failed requests and shows errors rather than leaving the form stuck.
- Prevents duplicate approve/reject/cancel/return actions in the same browser session and handles request errors.
- Keeps the existing Supabase RPC names and authentication/configuration unchanged.

Important backend limitation:
The ZIP does not include the PostgreSQL function definitions for create_borrowing, approve_borrowing, reject_borrowing, cancel_borrowing, or receive_borrowing_return. True concurrency protection, permission enforcement, atomic unit reservation/release, and duplicate-return prevention must be guaranteed inside those database functions. This frontend patch does not claim to replace those checks. Do not run unreviewed SQL against the live database.
