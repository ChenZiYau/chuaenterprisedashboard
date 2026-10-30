# Daily database health check

The GitHub Actions workflow runs daily at approximately 08:17 Malaysia time.
It calls `record_database_healthcheck`, which inserts one random UUID into
`database_healthchecks` per Malaysia calendar date and removes entries older
than the 30-day retention window. Repeated runs on the same date do not add
duplicates. Business tables are not touched. Insert and cleanup are atomic.

## Activate

1. Resume the project in the Supabase dashboard.
2. Run `scripts/setup-database-healthcheck.sql` in the Supabase SQL editor.
3. Set repository Actions secrets `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`. Keep the service-role key private.
4. Push the workflow and script to the repository's default branch.
5. Open Actions → Supabase Keep-Alive → Run workflow. Confirm success and check
   `database_healthchecks` in Supabase's table editor.

For a manual local run with credentials in `.env`, use
`node scripts/keepalive.mjs`.

The existing `/api/keepalive` endpoint remains a separate authenticated,
read-only check; it does not create entries.

GitHub schedules can be delayed, and inactive public repositories may have
scheduled workflows disabled. Monitor Actions failures and Supabase pause
emails. This job cannot resume a paused project and does not guarantee free-plan
availability. Synthetic writes are an activity check, not database maintenance.
