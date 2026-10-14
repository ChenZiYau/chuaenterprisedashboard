# Data-entry and dashboard fixes — 14 October 2026

The earlier audit report was not available in this session or repository. These findings were confirmed directly in the code, then checked against the connected Supabase project's columns, foreign keys and indexes using read-only MCP queries. The MCP project matches the application's configured project. Existing uncommitted tenant/revenue work was preserved and completed.

No production records were written or deleted, no schema changes or migrations were run, and nothing was deployed. Automated writes and deletes used in-memory test databases only.

## 1. Critical: private dashboard data in the public login response

- **Files:** `app/layout.tsx`, `proxy.ts`, `lib/clientApi.ts`, `components/DashboardShell.tsx`.
- **Cause:** The shared root layout fetched service-role data and passed it to a client provider even for unauthenticated login requests. API authentication redirected to HTML, which the client save helper could mistake for a successful save. The proxy's static-file exception also excluded API paths ending in an image extension.
- **Fix:** Verify the signed session before loading private records. Return JSON 401 for unauthenticated protected API requests, reject redirected/non-JSON save responses, and always match API paths in the proxy. Authenticated data-load failures show a Retry screen instead of an apparently empty dashboard.
- **Tests:** `tests/data-access.test.cjs`: anonymous layout makes zero data queries, authenticated layout receives data, load failures set an error, expired sessions fail correctly, API image-extension paths remain protected, and save/delete helpers handle failures. All pass. The production-server/browser smoke test also verifies login privacy and API 401 behavior.
- **Other-feature effects:** Login remains available when database retrieval fails. Public keepalive and bearer-protected vault property-list routes retain their existing access behavior. All save callers now receive an error instead of false success after session expiry.

## 2. High: revenue and expense entry/editing did not reliably save the intended record

- **Files:** `components/QuickEntryModal.tsx`; `app/revenue/page.tsx`; `app/expenses/page.tsx`; `components/PropertyRevenueTab.tsx`; `components/PropertyExpensesTab.tsx`; `app/api/revenue/route.ts`; `app/api/revenue/[id]/route.ts`; `app/api/expenses/route.ts`; `app/api/expenses/[id]/route.ts`; `app/api/_lib/financialEntries.ts`; `lib/data.ts`; `lib/db.ts`; `lib/receipt.ts`.
- **Cause:** Some Edit handlers did nothing; others opened a new form or the wrong billing period. Expense edits inserted another row. Invalid expense rows could be dropped from a batch. Expenses were blocked for vacant properties. Revenue notes/custom payment text were collected but discarded, and re-saving could reset invoice metadata or recalculate an unchanged historical electricity charge.
- **Fix:** Open the selected record, prefill its values and update its ID through PUT. Lock the identifying property/billing period during edits. Validate complete batches and property/unit relationships before writing. Allow vacant-property expenses; preserve invoice metadata and unchanged historical charges; persist notes/custom payment text and total amounts in existing columns. Guard entry buttons when no property exists. Refresh financial lists after successful mutations. Reserve receipt popups before awaiting saves, and close them on save failure.
- **Tests:** `tests/financial-entries.test.cjs` (9 tests) and the edit/refresh/empty-property cases in `tests/dashboard-ui.test.cjs` pass. Browser checks pass for revenue creation, edit, reload, and expense creation/edit without duplication.
- **Other-feature effects:** Financial totals and invoice screens receive refreshed data. Stricter validation rejects malformed requests instead of partially saving them. Sequential same-period revenue saves update the existing row; simultaneous requests remain subject to the database limitation below.

## 3. High: tenant saves and occupancy could disagree

- **Files:** `app/api/tenants/route.ts`, `app/api/tenants/[id]/route.ts`, `app/tenants/page.tsx`, `components/AddTenantModal.tsx`, `lib/tenantInput.ts`, `lib/tenantOccupancy.ts`, shared `lib/clientApi.ts`.
- **Cause:** Missing/weak validation allowed invalid records; tenant mutations updated only page-local state. Moving/deleting one tenant could clear a co-tenant's occupancy. Deletion left `is_rented` true. Secondary occupancy failures were ignored or incorrectly reported as a failed tenant save after the primary write had already succeeded.
- **Fix:** Validate required text and real, ordered lease dates. Persist and use returned server IDs. Recompute both occupancy fields from remaining tenants, refresh shared data after success, and keep failed drafts. Report committed tenant writes with an explicit occupancy warning if the secondary sync fails, avoiding a misleading retry that could duplicate the tenant.
- **Tests:** `tests/tenants.test.cjs` (11 tests) pass: create, edit, move, co-tenants, deletion, invalid input, missing records and injected database failures. Browser tenant edit and occupancy synchronization also pass.
- **Other-feature effects:** Revenue eligibility, tenant labels and occupancy indicators refresh together. Co-tenants remain supported. Occupancy synchronization still uses separate requests; an explicit warning is surfaced if it fails.

## 4. High: property edits could erase deposits or detach linked records

- **Files:** `components/AddPropertyModal.tsx`, `lib/propertyRows.ts`, `app/api/properties/route.ts`, `app/api/properties/[id]/route.ts`, `app/properties/page.tsx`, `app/properties/[id]/page.tsx`, shared `lib/DataContext.tsx`.
- **Cause:** The property form rebuilt units with null deposits/default electricity allowances. Missing unit payloads were treated as empty lists, and removing a unit could detach tenant/revenue/expense history. Property tenant selectors changed only a display name rather than the tenant's actual unit assignment. Local-only saves left newly created properties unavailable elsewhere.
- **Fix:** Preserve existing deposits and allowances, including explicit zeros. Validate unit lists and check references before any removal writes. Property edits do not overwrite tenant occupancy, and new units start vacant; assignment is performed in the existing Tenants editor. Publish saved properties/units into shared state and refresh server data. Preserve failed form drafts.
- **Tests:** `tests/property-regressions.test.cjs` (14 tests) pass, covering both rental models, zero values, draft preservation, linked-unit removal, malformed lists, and occupancy protection. Browser property editing preserves the previously saved deposit, custom allowance and occupancy.
- **Other-feature effects:** Ordinary property edits preserve deposits and billing settings. Removing a unit with linked records now returns a clear conflict. Tenant assignment is explicitly performed from Tenants rather than from a property display-name selector.

## 5. High: deposit Save/Cancel did not persist or restore values

- **Files:** `app/deposits/page.tsx`, new `app/api/units/[id]/route.ts`, shared `lib/DataContext.tsx`.
- **Cause:** Save and Cancel both only exited editing. Totals used unchanged unit data, and explicit zero deposits incorrectly fell back to calculated rent multiples.
- **Fix:** Save through a narrowly scoped deposit endpoint; validate finite, non-negative values; update shared units and totals using the returned record. Restore saved values on Cancel, preserve drafts on error, disable editing while saving, and treat zero as an explicit override.
- **Tests:** `tests/deposits.test.cjs` (13 tests) pass, including failure, Cancel, zero, pending-save controls and API field isolation. Browser save, totals and reload checks pass.
- **Other-feature effects:** The endpoint updates only deposit columns, preserving rent, tenant assignment and electricity settings. Property and overall deposit totals update together.

## 6. High: invoice generation was only local; invoice actions were misleading

- **Files:** `app/invoices/page.tsx`, `components/PropertyInvoiceTab.tsx`, `app/api/revenue/[id]/route.ts`, `lib/receipt.ts`, shared `lib/clientApi.ts`.
- **Cause:** Gen only changed React state, so Generated reverted after reload. Global invoice Edit was disconnected. Delete immediately deleted the underlying revenue record without explaining the financial effect. Opening a receipt after an awaited save could trigger popup blocking.
- **Fix:** Persist only `invoice_generated` through a restricted PATCH operation, use returned records, refresh both ledgers, and wire Edit to the revenue editor. Reserve the popup synchronously and handle failure. Require an explicit confirmation explaining that invoice deletion also deletes revenue and changes totals.
- **Tests:** Invoice-only update isolation and retrieval tests in `tests/financial-entries.test.cjs`; both invoice screens' Gen and confirmation tests in `tests/dashboard-ui.test.cjs`; all pass. Browser invoice generation and reload persistence pass.
- **Other-feature effects:** Generating an invoice cannot overwrite financial amounts from a stale page. Confirmed deletion retains the existing revenue-deletion behavior, now disclosed before execution.

## 7. High: stale/incomplete retrieval and dashboard totals

- **Files:** `lib/db.ts`, `lib/DataContext.tsx`, financial/tenant/property pages and tabs listed above, `app/share/page.tsx`, `app/layout.tsx`, `components/DashboardShell.tsx`.
- **Cause:** Single Supabase reads were limited by the server response cap. Several pages copied context into state once and never resynchronized. Property hide/undo affected only part of the dashboard; Share deletion failed to restore on network errors and used stale snapshots. Some year filters were hard-coded.
- **Fix:** Fetch every page with a stable ID tie-breaker and fail the load if any page fails. Synchronize local lists on refreshed context, propagate saved property/unit updates, and consistently hide/restore related records during undo. Normalize Share delete failures, refresh successful deletions and restore only the affected card. Use the current year in financial/property filters.
- **Tests:** `tests/data-access.test.cjs` retrieves 1,107 rows per table under a simulated cap of 113 without duplicates or missing totals, and rejects later-page failures. `tests/dashboard-ui.test.cjs` checks shared updates, hide/undo, and refreshed ledger rows. Browser reload and property financial-total checks pass.
- **Other-feature effects:** Additional read requests are needed for complete datasets. Dashboard load failures are visible and block entry into an incomplete dataset. Retrieval pagination is not a transactionally frozen snapshot during concurrent writes.

## 8. High: failed gallery loading could overwrite existing photos

- **Files:** `components/PropertyImagesTab.tsx`.
- **Cause:** A failed initial read left an empty editable gallery with Save enabled. Saving could replace existing photos with an empty list. Switching properties could retain another property's cards.
- **Fix:** Require a successful validated load before editing/saving, provide Retry, reset editor state per property, and prevent concurrent edits while a save is pending.
- **Tests:** The gallery case in `tests/dashboard-ui.test.cjs` passes: failed retrieval exposes no Save action, Retry restores saved images, and property IDs key separate editor instances.
- **Other-feature effects:** Users must reconnect/retry before replacing a gallery. No vault uploads or gallery writes were made against the live service; the external vault itself was not changed.

## Validation and test files

- `npm.cmd test`: **65 passed, 0 failed**.
- `npx.cmd tsc --noEmit --incremental false`: passed; the final production build also reran TypeScript successfully.
- `npm.cmd run build`: passed using a local dummy Supabase URL and test credentials.
- `node scripts/smoke-data-entry.cjs`: **8 browser/server checks passed**, using headless Chrome, the real production Next server and a local in-memory PostgREST double. No uncaught browser application errors.
- `git diff --check`: passed.

Test support added: `tests/helpers/load-ts.cjs`, `tests/helpers/mock-db.cjs`, `tests/helpers/hook-host.cjs`; suites `tests/data-access.test.cjs`, `tests/dashboard-ui.test.cjs`, `tests/financial-entries.test.cjs`, `tests/property-regressions.test.cjs`, `tests/deposits.test.cjs`, `tests/tenants.test.cjs`; browser runner `scripts/smoke-data-entry.cjs`. `package.json` adds the test command; no dependency changes.

## Remaining limitations requiring separate work

- The live schema has no unique `(unit_id, month, year)` revenue constraint. Two simultaneous new-entry requests can still race. The tests establish sequential duplicate prevention, not concurrent uniqueness.
- Property create/update/delete and tenant occupancy sync span multiple database requests. They are not fully atomic under failures or concurrent writers. Database-side transaction functions/constraints need a reviewed design and approval before production schema changes. Existing multi-step property deletion was not rewritten or executed against production.
- Maintenance remains an explicit placeholder. It has no implemented entry flow to repair; this change does not build a new maintenance feature.
- Live Supabase write integration and external-vault write integration were intentionally not exercised. Schema compatibility was inspected read-only; persistence behavior was tested using isolated doubles and the actual application/API code.
