/**
 * Malaysia TNB domestic electricity tariff (approximate).
 * Used to calculate the chargeable electricity amount for room tenants.
 *
 * The owner reads each room's sub-meter, subtracts last month's reading to get
 * the usage, deducts the free allowance, then applies the tiered rate to the
 * chargeable units. e.g. 3800 (Mar) − 3666 (Feb) = 134 kWh − 30 free =
 * 104 kWh → RM.
 */

export interface ElectricityBill {
  unitsUsed: number;
  freeUnits: number;
  chargeableUnits: number;
  chargeAmount: number; // RM
}

/**
 * Calculate the electricity charge for a tenant.
 *
 * @param unitsUsed  Total kWh consumed this month (reading − last month's reading)
 * @param freeUnits  kWh included free by the owner (e.g. 30 kWh)
 * @returns          Breakdown with chargeable units and RM amount
 */
export function calculateElectricityCharge(
  unitsUsed: number,
  freeUnits: number
): ElectricityBill {
  const chargeable = Math.max(0, unitsUsed - freeUnits);
  const charge = applyTNBTiers(chargeable);
  return {
    unitsUsed,
    freeUnits,
    chargeableUnits: chargeable,
    chargeAmount: Math.round(charge * 100) / 100,
  };
}

/**
 * Apply TNB domestic tiered tariff to a number of chargeable kWh.
 * Rates are approximate and subject to change.
 */
function applyTNBTiers(units: number): number {
  if (units <= 0) return 0;

  let charge = 0;
  let remaining = units;

  // Tier 1: 1-200 kWh @ RM 0.218/kWh
  const t1 = Math.min(remaining, 200);
  charge += t1 * 0.218;
  remaining -= t1;
  if (remaining <= 0) return charge;

  // Tier 2: 201-300 kWh @ RM 0.334/kWh
  const t2 = Math.min(remaining, 100);
  charge += t2 * 0.334;
  remaining -= t2;
  if (remaining <= 0) return charge;

  // Tier 3: 301-600 kWh @ RM 0.516/kWh
  const t3 = Math.min(remaining, 300);
  charge += t3 * 0.516;
  remaining -= t3;
  if (remaining <= 0) return charge;

  // Tier 4: 601-900 kWh @ RM 0.546/kWh
  const t4 = Math.min(remaining, 300);
  charge += t4 * 0.546;
  remaining -= t4;
  if (remaining <= 0) return charge;

  // Tier 5: > 900 kWh @ RM 0.571/kWh
  charge += remaining * 0.571;
  return charge;
}
