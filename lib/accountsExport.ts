import ExcelJS from "exceljs";
import { EXPENSE_CATEGORY_LABEL, PAYMENT_METHOD_LABEL, type Property, type Unit, type RevenueEntry, type ExpenseEntry } from "./data";

export interface AccountsExportInput {
  properties: Property[];
  units: Unit[];
  revenue: RevenueEntry[];
  expenses: ExpenseEntry[];
  fromDate: string;
  toDate: string;
  displayed: RevenueEntry[] | ExpenseEntry[];
  source: "revenue" | "expenses";
  filters: string;
}
const cents = (value: number) => Math.round(value * 100);
const revenueCents = (e: RevenueEntry) => cents(e.rental) + cents(e.electricity ?? 0) + cents(e.other ?? 0);

export function buildAccountsWorkbook(input: AccountsExportInput) {
  const { properties, units, fromDate, toDate } = input;
  if (fromDate && toDate && fromDate > toDate) throw new Error("Start date must be on or before end date.");
  const ids = new Set(properties.map(p => p.id));
  const inRange = (date: string) => (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  const propertyName = (id: string) => properties.find(p => p.id === id)?.name ?? id;
  const roomName = (id: string | null) => id ? units.find(u => u.id === id)?.name ?? id : "Whole property";
  const sortEntries = <T extends RevenueEntry | ExpenseEntry>(rows: T[]) => [...rows].sort((a, b) =>
    propertyName(a.propertyId).localeCompare(propertyName(b.propertyId)) || a.propertyId.localeCompare(b.propertyId) ||
    roomName(a.unitId).localeCompare(roomName(b.unitId), undefined, { numeric: true }) ||
    (a.unitId ?? "").localeCompare(b.unitId ?? "") ||
    ("paymentDate" in a ? a.paymentDate : a.expenseDate).localeCompare("paymentDate" in b ? b.paymentDate : b.expenseDate));
  const revenue = sortEntries(input.revenue.filter(e => ids.has(e.propertyId) && inRange(e.paymentDate)));
  const expenses = sortEntries(input.expenses.filter(e => ids.has(e.propertyId) && inRange(e.expenseDate)));
  const book = new ExcelJS.Workbook();
  book.creator = "Chua Enterprise";
  book.created = new Date();
  function sheet(name: string, headers: string[], rows: (string | number)[][], moneyColumns: number[] = []) {
    const ws = book.addWorksheet(name);
    ws.addRow(headers);
    rows.forEach(row => ws.addRow(row));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ws.rowCount), column: headers.length } };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF253858" } };
    headers.forEach((header, index) => { ws.getColumn(index + 1).width = Math.min(42, Math.max(20, header.length + 3)); });
    moneyColumns.forEach(column => { ws.getColumn(column).numFmt = '#,##0.00;[Red](#,##0.00)'; });
    return ws;
  }
  sheet("Report info", ["Setting", "Value"], [
    ["Start date (inclusive)", fromDate || "All earlier dates"], ["End date (inclusive)", toDate || "All later dates"],
    ["Currency", "MYR"], ["Opened from", input.source], ["Displayed-row filters", input.filters],
    ["Accounts scope", "All rooms, statuses and expense categories for the selected properties and dates."],
    ["Date basis", "Revenue: payment date; expenses: expense date. Scheduled rent uses its scheduled date."],
    ["Recorded P/L", "Recorded revenue minus expenses. Includes saved pending/partial/overdue entries; not a cash-received statement."],
    ["Scheduled rent", "Unsaved scheduled rent is excluded from recorded P/L and listed separately."],
    ["Displayed rows", "All matching rows across all pages, including scheduled rent, exactly as filtered in the source tab."],
    ["Tenant names", "Current room occupant names; historical tenant identity is not stored on revenue entries."],
  ]);
  const total = (rs: RevenueEntry[], es: ExpenseEntry[]) => {
    const recorded = rs.filter(e => !e.scheduled).reduce((s, e) => s + revenueCents(e), 0);
    const scheduled = rs.filter(e => e.scheduled).reduce((s, e) => s + revenueCents(e), 0);
    const expense = es.reduce((s, e) => s + cents(e.amount), 0);
    return [recorded / 100, scheduled / 100, expense / 100, (recorded - expense) / 100, (recorded + scheduled - expense) / 100];
  };
  const summaryHeaders = ["Recorded revenue", "Scheduled rent (not recorded)", "Expenses", "Recorded profit / loss", "Projected P/L incl. scheduled"];
  const orderedProperties = [...properties].sort((a,b) => a.name.localeCompare(b.name));
  sheet("Property P&L", ["Property", ...summaryHeaders], [
    ...orderedProperties.map(p => [p.name, ...total(revenue.filter(e => e.propertyId === p.id), expenses.filter(e => e.propertyId === p.id))]),
    ["GRAND TOTAL", ...total(revenue, expenses)],
  ], [2,3,4,5,6]);
  const roomRows: (string | number)[][] = [];
  for (const p of orderedProperties) {
    const rs = revenue.filter(e => e.propertyId === p.id), es = expenses.filter(e => e.propertyId === p.id);
    const roomIds = [...new Set([...rs.map(e => e.unitId), ...es.map(e => e.unitId)])].sort((a,b) => roomName(a).localeCompare(roomName(b), undefined, {numeric:true}));
    roomIds.forEach(id => roomRows.push([p.name, roomName(id), ...total(rs.filter(e => e.unitId === id), es.filter(e => e.unitId === id))]));
    roomRows.push([p.name, "PROPERTY TOTAL", ...total(rs, es)]);
  }
  sheet("Room totals", ["Property", "Room / unit", ...summaryHeaders], roomRows, [3,4,5,6,7]);
  const revenueHeaders = ["Property", "Room / unit", "Current tenant", "Payment / scheduled date", "Billing month", "Rent", "Electricity", "Other charges", "Total", "Status", "Record type", "Method", "Invoice number", "Notes", "Entry ID"];
  const revenueRows = (rs: RevenueEntry[]) => rs.map(e => [propertyName(e.propertyId), roomName(e.unitId), units.find(u => u.id === e.unitId)?.tenantName ?? "", e.paymentDate, `${e.year}-${String(e.month).padStart(2,"0")}`, e.rental, e.electricity ?? 0, e.other ?? 0, revenueCents(e)/100, e.status, e.scheduled ? "Scheduled (not recorded)" : "Recorded", e.scheduled ? "" : e.customPaymentMethod || PAYMENT_METHOD_LABEL[e.method], e.invoiceNumber, e.notes ?? "", e.id]);
  const expenseHeaders = ["Property", "Room / unit", "Expense date", "Billing month", "Category", "Description", "Type", "Amount", "Entry ID"];
  const expenseRows = (es: ExpenseEntry[]) => es.map(e => [propertyName(e.propertyId), roomName(e.unitId), e.expenseDate, `${e.year}-${String(e.month).padStart(2,"0")}`, EXPENSE_CATEGORY_LABEL[e.category], e.description ?? "", e.type ?? "", e.amount, e.id]);
  sheet("Revenue details", revenueHeaders, revenueRows(revenue), [6,7,8,9]);
  sheet("Expense details", expenseHeaders, expenseRows(expenses), [8]);
  if (input.source === "revenue") sheet("Displayed rows", revenueHeaders, revenueRows(input.displayed as RevenueEntry[]), [6,7,8,9]);
  else sheet("Displayed rows", expenseHeaders, expenseRows(input.displayed as ExpenseEntry[]), [8]);
  return book;
}

export async function downloadAccounts(input: AccountsExportInput) {
  const buffer = await buildAccountsWorkbook(input).xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  const scope = input.properties.length === 1 ? input.properties[0].name : "All-properties";
  link.download = `Accounts-${scope.replace(/[^a-zA-Z0-9_-]/g, "-")}-${input.fromDate || "start"}-to-${input.toDate || "end"}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
