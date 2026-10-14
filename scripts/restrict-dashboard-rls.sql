-- Proposed security fix; review other consumers before applying in Supabase.
-- The Next.js dashboard and GitHub keepalive use service_role and bypass RLS.
-- This dashboard does not use Supabase Auth sessions: its signed cookie is
-- validated by Next.js. Public Data API access to these tables is unnecessary.
-- No rows, columns, or tables are changed. Apply as one transaction.
BEGIN;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read" ON public.properties;
DROP POLICY IF EXISTS "anon write" ON public.properties;
DROP POLICY IF EXISTS properties_authenticated_all ON public.properties;
DROP POLICY IF EXISTS "anon read" ON public.units;
DROP POLICY IF EXISTS "anon write" ON public.units;
DROP POLICY IF EXISTS units_authenticated_all ON public.units;
DROP POLICY IF EXISTS "anon read" ON public.tenants;
DROP POLICY IF EXISTS "anon write" ON public.tenants;
DROP POLICY IF EXISTS tenants_authenticated_all ON public.tenants;
DROP POLICY IF EXISTS "anon read" ON public.revenue;
DROP POLICY IF EXISTS "anon write" ON public.revenue;
DROP POLICY IF EXISTS revenue_authenticated_all ON public.revenue;
DROP POLICY IF EXISTS "anon read" ON public.expenses;
DROP POLICY IF EXISTS "anon write" ON public.expenses;
DROP POLICY IF EXISTS expenses_authenticated_all ON public.expenses;

COMMIT;
