// Shared "House Rent Receipt" rendering. Ported from v2 so the Invoices ledger
// produces an identical printed receipt. Opens in a new window with a
// print / save-as-PDF toolbar.

import {
  MONTHS_FULL,
  PAYMENT_METHOD_LABEL,
  type Property,
  type RevenueEntry,
  type Unit,
} from "@/lib/data";

export type ReceiptData = {
  number: string;
  date: string;
  receivedFrom: string;
  sum: number;
  paymentMethod: string;
  premise: string;
  fromDate: string;
  toDate: string;
  being: string;
  monthLabel: string;
};

export const RECEIPT_DISCLAIMER =
  "The persons who hold this receipt are not entitled to sub-let the room either wholly or partly without the written consent of the Landlord and/or the Landlord's authorised agent and in default they will be removed from the premise. Those who desire to leave the premises must give sufficient notice to the Landlord and/or the Landlord's authorised agent as stipulated in the Tenancy Agreement. Deposit paid must NOT be used to as the last month's rental payment.";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format an ISO "YYYY-MM-DD" date as "D.M.YYYY" for the receipt. */
function fmtDots(iso?: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** Receipt amounts print without grouping (e.g. "1600", "2508.24"). */
function receiptAmount(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function entryTotal(e: RevenueEntry) {
  return e.rental + (e.electricity ?? 0) + (e.other ?? 0);
}

/** Assemble the House Rent Receipt fields for an entry. */
export function buildReceiptData(
  entry: RevenueEntry,
  property: Property | undefined,
  unit: Unit | undefined,
  tenantName: string | undefined,
  number: string
): ReceiptData {
  const roomRental = property?.rentalModel === "room_rental";
  const premise = [
    roomRental ? unit?.name : null,
    property?.name,
    property?.address,
    [property?.postcode, property?.city].filter(Boolean).join(" ").trim() || null,
    property?.state,
  ]
    .filter(Boolean)
    .join(", ")
    .toUpperCase();
  const lastDay = new Date(entry.year, entry.month, 0).getDate();
  const method = entry.method === "other" && entry.customPaymentMethod
    ? entry.customPaymentMethod
    : entry.method ? PAYMENT_METHOD_LABEL[entry.method] : "Cash / Bank Transfer";
  return {
    number,
    date: fmtDots(entry.paymentDate) || fmtDots(todayIso()),
    receivedFrom: unit?.tenantName ?? tenantName ?? "-",
    sum: entryTotal(entry),
    paymentMethod: method,
    premise,
    fromDate: `1.${entry.month}.${entry.year}`,
    toDate: `${lastDay}.${entry.month}.${entry.year}`,
    being: "RENTAL",
    monthLabel: `${MONTHS_FULL[entry.month - 1].toUpperCase()} ${entry.year}`,
  };
}

export function renderReceiptHtml(d: ReceiptData, autoPrint: boolean) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Receipt ${esc(d.number)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #eceef1; color: #111;
    font-family: Arial, Helvetica, "Segoe UI", sans-serif; font-size: 13px; }
  .sheet { background: #fff; max-width: 720px; margin: 28px auto; border: 2px solid #000; }
  table { width: 100%; border-collapse: collapse; }
  td { border: 1px solid #000; padding: 8px 10px; vertical-align: top; }
  .title { font-size: 22px; font-weight: 700; }
  .k { font-size: 12px; color: #111; }
  .v { font-weight: 700; }
  .big { font-size: 18px; font-weight: 700; text-transform: uppercase; }
  .fill { height: 46px; }
  .rm { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
  .muted { color: #444; font-size: 12px; margin-top: 4px; }
  .sig { height: 96px; }
  .disclaimer { font-style: italic; font-size: 11px; line-height: 1.55; }
  .toolbar { position: fixed; top: 14px; right: 14px; display: flex; gap: 8px; }
  .toolbar button { padding: 8px 14px; font-size: 12px; cursor: pointer;
    border-radius: 4px; border: 1px solid #999; background: #fff; }
  .toolbar button.primary { background: #111; color: #fff; border-color: #111; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; max-width: none; }
    .toolbar { display: none; }
    @page { size: A4; margin: 12mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.close()">Close</button>
    <button class="primary" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="sheet">
    <table>
      <tr>
        <td class="title" style="width:40%">House Rent Receipt</td>
        <td class="k" style="width:12%">Date</td>
        <td class="v" style="width:20%">${esc(d.date)}</td>
        <td class="k" style="width:14%">Receipt No.</td>
        <td class="v" style="width:14%">${esc(d.number)}</td>
      </tr>
      <tr><td colspan="5" class="k">Terima daripada / RECEIVED from</td></tr>
      <tr><td colspan="5" class="big fill">${esc(d.receivedFrom)}</td></tr>
      <tr>
        <td colspan="3" class="k">Sebanyak Ringgit / The sum of Ringgit</td>
        <td colspan="2">
          <div class="rm">RM&nbsp;&nbsp;${esc(receiptAmount(d.sum))}</div>
          <div class="muted">${esc(d.paymentMethod)}</div>
        </td>
      </tr>
      <tr><td colspan="5" class="k">Untuk sewa rumah No. / Being rent of premise No.</td></tr>
      <tr><td colspan="5" class="big fill">${esc(d.premise)}</td></tr>
      <tr>
        <td class="k">Dari / From</td>
        <td colspan="2" class="v">${esc(d.fromDate)}</td>
        <td class="k">Ke / To</td>
        <td class="v">${esc(d.toDate)}</td>
      </tr>
      <tr>
        <td class="k">Untuk / Being</td>
        <td colspan="2" class="v">${esc(d.being)}</td>
        <td class="k">bulan / month</td>
        <td class="v">${esc(d.monthLabel)}</td>
      </tr>
      <tr>
        <td colspan="2" class="sig"></td>
        <td colspan="3" class="disclaimer">${esc(RECEIPT_DISCLAIMER)}</td>
      </tr>
      <tr>
        <td colspan="2" class="k">Tandatangan / Signature</td>
        <td colspan="3"></td>
      </tr>
    </table>
  </div>
  ${autoPrint ? `<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>` : ""}
</body>
</html>`;
}

export function openReceiptWindow(data: ReceiptData, autoPrint: boolean, target?: Window | null) {
  const w = target === undefined ? window.open("", "_blank", "width=840,height=1000") : target;
  if (!w || w.closed) return null;
  w.document.open();
  w.document.write(renderReceiptHtml(data, autoPrint));
  w.document.close();
  return w;
}
