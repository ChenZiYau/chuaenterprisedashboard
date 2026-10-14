/** Static sample data powering the dashboard design. */

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
  unitId: string;
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

export const properties: Property[] = [
  { id: "p1", name: "Sri Petaling House", shortName: "Sri Petaling", city: "Kuala Lumpur", rentalModel: "room_rental", imageUrl: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=900&q=60" },
  { id: "p2", name: "Kuchai Lama Condo", shortName: "Kuchai Lama", city: "Kuala Lumpur", rentalModel: "whole_unit", imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=60" },
  { id: "p3", name: "Puchong Apartment", shortName: "Puchong", city: "Puchong", rentalModel: "room_rental", imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=60" },
];

export const units: Unit[] = [
  { id: "u1", propertyId: "p1", name: "Room A", tenantName: "Lim Wei Jian", rentalRate: 750, depositMonths: 2, depositAmount: null, electricityFreeUnits: 30 },
  { id: "u2", propertyId: "p1", name: "Room B", tenantName: "Nurul Aisyah", rentalRate: 680, depositMonths: 2, depositAmount: null, electricityFreeUnits: 30 },
  { id: "u3", propertyId: "p1", name: "Room C", tenantName: "Tan Mei Ling", rentalRate: 620, depositMonths: 1, depositAmount: 800, electricityFreeUnits: 30 },
  { id: "u4", propertyId: "p1", name: "Room D", rentalRate: 600, depositMonths: null, depositAmount: null, electricityFreeUnits: 30 },
  { id: "u5", propertyId: "p2", name: "Whole Unit", tenantName: "Rajesh Kumar", rentalRate: 1800, depositMonths: 2, depositAmount: null, electricityFreeUnits: 0 },
  { id: "u6", propertyId: "p3", name: "Room 1", tenantName: "Chong Kah Ho", rentalRate: 550, depositMonths: 1, depositAmount: null, electricityFreeUnits: 30 },
  { id: "u7", propertyId: "p3", name: "Room 2", tenantName: "Siti Hajar", rentalRate: 580, depositMonths: 2, depositAmount: null, electricityFreeUnits: 30 },
  { id: "u8", propertyId: "p3", name: "Room 3", rentalRate: 520, depositMonths: null, depositAmount: null, electricityFreeUnits: 30 },
];

export const tenants: Tenant[] = [
  { id: "t1", name: "Lim Wei Jian", icNumber: "950214-14-5673", phone: "012-345 6789", email: "weijian.lim@gmail.com", unitId: "u1", leaseStart: "2025-08-01", leaseEnd: "2026-07-31" },
  { id: "t2", name: "Nurul Aisyah", icNumber: "980722-10-5218", phone: "017-882 4431", email: "nurul.aisyah98@gmail.com", unitId: "u2", leaseStart: "2026-01-15", leaseEnd: "2027-01-14" },
  { id: "t3", name: "Tan Mei Ling", icNumber: "921103-08-6644", phone: "016-220 9187", email: null, unitId: "u3", leaseStart: "2025-06-01", leaseEnd: "2026-05-31" },
  { id: "t4", name: "Rajesh Kumar", icNumber: "880517-14-5321", phone: "019-773 5042", email: "rajesh.k@outlook.com", unitId: "u5", leaseStart: "2025-04-01", leaseEnd: "2027-03-31" },
  { id: "t5", name: "Chong Kah Ho", icNumber: "990830-14-7719", phone: "011-2456 8890", email: "kahho.chong@gmail.com", unitId: "u6", leaseStart: "2025-12-01", leaseEnd: "2026-11-30" },
  { id: "t6", name: "Siti Hajar", icNumber: "960409-06-5236", phone: "013-908 2214", email: "sitihajar96@yahoo.com", unitId: "u7", leaseStart: "2026-02-01", leaseEnd: "2027-01-31" },
];

export const revenueEntries: RevenueEntry[] = [
  { id: "r1", propertyId: "p1", unitId: "u1", month: 6, year: 2026, paymentDate: "2026-06-03", rental: 750, electricityReading: 3800, electricity: 85, other: null, method: "bank_transfer", status: "paid", invoiceGenerated: true, invoiceNumber: "A12-0626" },
  { id: "r2", propertyId: "p1", unitId: "u2", month: 6, year: 2026, paymentDate: "2026-06-05", rental: 680, electricityReading: 2610, electricity: 72, other: null, method: "bank_transfer", status: "paid", invoiceGenerated: true, invoiceNumber: "B12-0626" },
  { id: "r3", propertyId: "p1", unitId: "u3", month: 6, year: 2026, paymentDate: "2026-06-10", rental: 620, electricityReading: 2010, electricity: 64, other: 30, method: "cash", status: "partial", invoiceGenerated: false, invoiceNumber: "C12-0626" },
  { id: "r4", propertyId: "p2", unitId: "u5", month: 6, year: 2026, paymentDate: "2026-06-01", rental: 1800, electricityReading: null, electricity: null, other: null, method: "bank_transfer", status: "paid", invoiceGenerated: true, invoiceNumber: "K6-0626" },
  { id: "r5", propertyId: "p3", unitId: "u6", month: 6, year: 2026, paymentDate: "2026-06-07", rental: 550, electricityReading: 1330, electricity: 45, other: null, method: "cash", status: "pending", invoiceGenerated: false, invoiceNumber: "P1-0626" },
  { id: "r6", propertyId: "p3", unitId: "u7", month: 6, year: 2026, paymentDate: "2026-06-02", rental: 580, electricityReading: 1670, electricity: 51, other: null, method: "bank_transfer", status: "paid", invoiceGenerated: true, invoiceNumber: "P2-0626" },
  { id: "r7", propertyId: "p1", unitId: "u1", month: 5, year: 2026, paymentDate: "2026-05-04", rental: 750, electricityReading: 3666, electricity: 78, other: null, method: "bank_transfer", status: "paid", invoiceGenerated: true, invoiceNumber: "A11-0526" },
  { id: "r8", propertyId: "p1", unitId: "u2", month: 5, year: 2026, paymentDate: "2026-05-06", rental: 680, electricityReading: 2482, electricity: 69, other: null, method: "bank_transfer", status: "paid", invoiceGenerated: true, invoiceNumber: "B11-0526" },
  { id: "r9", propertyId: "p1", unitId: "u3", month: 5, year: 2026, paymentDate: "2026-05-15", rental: 620, electricityReading: 1890, electricity: 58, other: null, method: "cash", status: "overdue", invoiceGenerated: false, invoiceNumber: "C11-0526" },
  { id: "r10", propertyId: "p2", unitId: "u5", month: 5, year: 2026, paymentDate: "2026-05-01", rental: 1800, electricityReading: null, electricity: null, other: 120, method: "bank_transfer", status: "paid", invoiceGenerated: true, invoiceNumber: "K5-0526" },
  { id: "r11", propertyId: "p3", unitId: "u6", month: 5, year: 2026, paymentDate: "2026-05-09", rental: 550, electricityReading: 1210, electricity: 42, other: null, method: "cash", status: "paid", invoiceGenerated: true, invoiceNumber: "P1-0526" },
  { id: "r12", propertyId: "p3", unitId: "u7", month: 5, year: 2026, paymentDate: "2026-05-03", rental: 580, electricityReading: 1544, electricity: 47, other: null, method: "bank_transfer", status: "paid", invoiceGenerated: true, invoiceNumber: "P2-0526" },
  { id: "r13", propertyId: "p1", unitId: "u1", month: 4, year: 2026, paymentDate: "2026-04-05", rental: 750, electricityReading: 3520, electricity: 81, other: null, method: "bank_transfer", status: "paid", invoiceGenerated: true, invoiceNumber: "A10-0426" },
  { id: "r14", propertyId: "p2", unitId: "u5", month: 4, year: 2026, paymentDate: "2026-04-01", rental: 1800, electricityReading: null, electricity: null, other: null, method: "cheque", status: "paid", invoiceGenerated: true, invoiceNumber: "K4-0426" },
];

export const expenseEntries: ExpenseEntry[] = [
  { id: "e1", propertyId: "p1", unitId: null, month: 6, year: 2026, expenseDate: "2026-06-02", category: "internet", description: "Unifi 300Mbps", type: "recurring", amount: 129 },
  { id: "e2", propertyId: "p1", unitId: null, month: 6, year: 2026, expenseDate: "2026-06-08", category: "utilities", description: "TNB common area", type: "recurring", amount: 186.4 },
  { id: "e3", propertyId: "p1", unitId: "u3", month: 6, year: 2026, expenseDate: "2026-06-14", category: "maintenance", description: "Aircond service Room C", type: "irregular", amount: 180 },
  { id: "e4", propertyId: "p2", unitId: null, month: 6, year: 2026, expenseDate: "2026-06-05", category: "maintenance", description: "Water heater replacement", type: "irregular", amount: 420 },
  { id: "e5", propertyId: "p3", unitId: null, month: 6, year: 2026, expenseDate: "2026-06-03", category: "cleaning", description: "Common area cleaning", type: "recurring", amount: 150 },
  { id: "e6", propertyId: "p1", unitId: null, month: 5, year: 2026, expenseDate: "2026-05-02", category: "internet", description: "Unifi 300Mbps", type: "recurring", amount: 129 },
  { id: "e7", propertyId: "p1", unitId: null, month: 5, year: 2026, expenseDate: "2026-05-10", category: "utilities", description: "TNB common area", type: "recurring", amount: 172.9 },
  { id: "e8", propertyId: "p2", unitId: null, month: 5, year: 2026, expenseDate: "2026-05-20", category: "quit_rent", description: "Assessment 1st half 2026", type: "irregular", amount: 385 },
  { id: "e9", propertyId: "p3", unitId: null, month: 5, year: 2026, expenseDate: "2026-05-06", category: "cleaning", description: "Common area cleaning", type: "recurring", amount: 150 },
  { id: "e10", propertyId: "p3", unitId: "u7", month: 5, year: 2026, expenseDate: "2026-05-18", category: "maintenance", description: "Door lock repair Room 2", type: "irregular", amount: 95 },
  { id: "e11", propertyId: "p2", unitId: null, month: 4, year: 2026, expenseDate: "2026-04-12", category: "insurance", description: "Fire insurance renewal", type: "irregular", amount: 560 },
  { id: "e12", propertyId: "p1", unitId: null, month: 4, year: 2026, expenseDate: "2026-04-02", category: "internet", description: "Unifi 300Mbps", type: "recurring", amount: 129 },
];

export function getProperty(id: string) {
  return properties.find((p) => p.id === id);
}

export function getUnit(id: string) {
  return units.find((u) => u.id === id);
}

export function getUnitsForProperty(propertyId: string) {
  return units.filter((u) => u.propertyId === propertyId);
}

export function fmtMYR(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(value);
}
