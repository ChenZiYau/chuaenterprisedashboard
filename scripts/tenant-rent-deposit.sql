-- Apply before deploying the tenant rent/deposit form. Existing tenants retain
-- their room defaults until explicit amounts are saved on the tenant.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS base_rent numeric(12,2) CHECK (base_rent >= 0),
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2) CHECK (deposit_amount >= 0);
