/** Shared dashboard types, labels and formatting. Records come from Supabase. */

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export type PaymentStatus = "paid" | "partial" | "pending" | "overdue";
export type PaymentMethod = "bank_transfer" | "cash" | "cheque" | "other";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  pending: "Pending",
  overdue: "Overdue",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export const PAYMENT_METHODS: PaymentMethod[] = ["bank_transfer", "cash", "cheque", "other"];
export const PAYMENT_STATUSES: PaymentStatus[] = ["paid", "partial", "pending", "overdue"];

export type RentalModel = "room_rental" | "whole_unit";

export const RENTAL_MODEL_LABEL: Record<RentalModel, string> = {
  room_rental: "Room Rental",
  whole_unit: "Whole Unit",
};

export type PropertyType = "house" | "condo" | "apartment" | "townhouse" | "commercial" | "other";
export type PropertyStatus = "active" | "inactive" | "under_service";

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  house: "House",
  condo: "Condo",
  apartment: "Apartment",
  townhouse: "Townhouse",
  commercial: "Commercial",
  other: "Other",
};

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  under_service: "Under Service",
};

export type Property = {
  id: string;
  /** Custom share-link slug (vault gallery URL path). Falls back to `id`. */
  slug?: string;
  name: string;
  shortName: string;
  city: string;
  rentalModel: RentalModel;
  address?: string;
  state?: string;
  postcode?: string;
  propertyType?: PropertyType;
  status?: PropertyStatus;
  description?: string;
  /** Cover photo shown on the property card. Cards without one fall back to a
   *  monogram placeholder, so this is always optional. */
  imageUrl?: string;
};

export type Tenant = {
  id: string;
  name: string;
  icNumber: string;
  phone: string;
  email: string | null;
  unitId: string; // Empty when unassigned; stored as NULL in Supabase.
  leaseStart: string; // YYYY-MM-DD
  leaseEnd: string; // YYYY-MM-DD
};

export type Unit = {
  id: string;
  propertyId: string;
  name: string;
  tenantName?: string;
  rentalRate: number;
  depositMonths: number | null;
  depositAmount: number | null;
  /** kWh included free each month before the tenant is charged. */
  electricityFreeUnits: number;
};

export type RevenueEntry = {
  id: string;
  propertyId: string;
  unitId: string;
  month: number; // 1-12
  year: number;
  paymentDate: string; // YYYY-MM-DD
  rental: number;
  /** Sub-meter reading for the month (kWh). Next month's usage = its reading − this one. */
  electricityReading: number | null;
  electricity: number | null;
  other: number | null;
  method: PaymentMethod;
  customPaymentMethod?: string;
  notes?: string;
  status: PaymentStatus;
  invoiceGenerated: boolean;
  invoiceNumber: string;
};

export type ExpenseCategory =
  | "utilities"
  | "internet"
  | "maintenance"
  | "cleaning"
  | "quit_rent"
  | "insurance"
  | "other";

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  utilities: "Utilities",
  internet: "Internet / WiFi",
  maintenance: "Maintenance & Repairs",
  cleaning: "Cleaning",
  quit_rent: "Quit Rent & Assessment",
  insurance: "Insurance",
  other: "Other",
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "utilities", "internet", "maintenance", "cleaning", "quit_rent", "insurance", "other",
];

export type ExpenseEntry = {
  id: string;
  propertyId: string;
  unitId: string | null; // null = whole property
  month: number;
  year: number;
  expenseDate: string;
  category: ExpenseCategory;
  description: string | null;
  type: "recurring" | "irregular" | null;
  amount: number;
  /** Whether the expense / maintenance issue has been fixed or resolved. */
  fixed?: boolean;
};

export function fmtMYR(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(value);
}
