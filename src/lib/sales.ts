/**
 * Sales & Export — Phase A library.
 *
 * Workspace-scoped fetchers + creators for sales_customers, sales_inquiries,
 * and sales_orders, plus pure aggregation helpers used by the dashboard tab.
 *
 * RLS handles authorization on every call. All write paths set created_by
 * to the current auth.uid() at the call site so RLS WITH CHECK passes.
 *
 * Audit logging is performed by the calling page via createAuditLog (mirrors
 * the pattern used in finance / quality / procurement).
 */

import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SalesCustomerType = "steel_mill" | "trader" | "foundry" | "distributor" | "other";

export type SalesInquiryStatus = "open" | "quoted" | "won" | "lost" | "cancelled";

export type SalesOrderStatus =
  | "draft"
  | "confirmed"
  | "in_production"
  | "ready_for_dispatch"
  | "dispatched"
  | "sailed"
  | "delivered"
  | "invoiced"
  | "paid"
  | "cancelled";

export interface SalesCustomer {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  customerType: SalesCustomerType;
  isExport: boolean;
  country: string | null;
  region: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTermsDays: number;
  creditLimit: number | null;
  currencyCode: string;
  gstOrTaxId: string | null;
  notes: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesInquiry {
  id: string;
  profitCenterId: string;
  inquiryNo: string;
  inquiryDate: string;
  customerId: string;
  customerName?: string;
  isExport: boolean;
  product: string;
  grade: string | null;
  qtyMt: number;
  expectedPrice: number | null;
  currencyCode: string;
  incoterms: string | null;
  port: string | null;
  status: SalesInquiryStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrder {
  id: string;
  profitCenterId: string;
  soNumber: string;
  orderDate: string;
  customerId: string;
  customerName?: string;
  inquiryId: string | null;
  isExport: boolean;
  product: string;
  grade: string | null;
  qtyMt: number;
  pricePerMt: number;
  currencyCode: string;
  fxRate: number | null;
  incoterms: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  status: SalesOrderStatus;
  totalValue: number;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const mapCustomer = (r: any): SalesCustomer => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  code: r.code,
  name: r.name,
  customerType: r.customer_type,
  isExport: !!r.is_export,
  country: r.country,
  region: r.region,
  contactEmail: r.contact_email,
  contactPhone: r.contact_phone,
  paymentTermsDays: Number(r.payment_terms_days ?? 30),
  creditLimit: r.credit_limit !== null ? Number(r.credit_limit) : null,
  currencyCode: r.currency_code ?? "INR",
  gstOrTaxId: r.gst_or_tax_id,
  notes: r.notes,
  isActive: !!r.is_active,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapInquiry = (r: any): SalesInquiry => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  inquiryNo: r.inquiry_no,
  inquiryDate: r.inquiry_date,
  customerId: r.customer_id,
  customerName: r.sales_customers?.name,
  isExport: !!r.is_export,
  product: r.product,
  grade: r.grade,
  qtyMt: Number(r.qty_mt ?? 0),
  expectedPrice: r.expected_price !== null ? Number(r.expected_price) : null,
  currencyCode: r.currency_code ?? "INR",
  incoterms: r.incoterms,
  port: r.port,
  status: r.status,
  notes: r.notes,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapOrder = (r: any): SalesOrder => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  soNumber: r.so_number,
  orderDate: r.order_date,
  customerId: r.customer_id,
  customerName: r.sales_customers?.name,
  inquiryId: r.inquiry_id,
  isExport: !!r.is_export,
  product: r.product,
  grade: r.grade,
  qtyMt: Number(r.qty_mt ?? 0),
  pricePerMt: Number(r.price_per_mt ?? 0),
  currencyCode: r.currency_code ?? "INR",
  fxRate: r.fx_rate !== null ? Number(r.fx_rate) : null,
  incoterms: r.incoterms,
  portOfLoading: r.port_of_loading,
  portOfDischarge: r.port_of_discharge,
  status: r.status,
  totalValue: Number(r.total_value ?? 0),
  notes: r.notes,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function fetchCustomers(
  profitCenterId: string,
  opts: { isExport?: boolean; activeOnly?: boolean } = {},
): Promise<SalesCustomer[]> {
  let q = client.from("sales_customers").select("*").eq("profit_center_id", profitCenterId);
  if (opts.isExport !== undefined) q = q.eq("is_export", opts.isExport);
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapCustomer);
}

export interface CreateCustomerInput {
  profitCenterId: string;
  name: string;
  customerType: SalesCustomerType;
  isExport: boolean;
  country?: string | null;
  region?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  paymentTermsDays?: number;
  creditLimit?: number | null;
  currencyCode?: string;
  gstOrTaxId?: string | null;
  notes?: string | null;
  createdBy: string;
}

export async function createCustomer(input: CreateCustomerInput): Promise<SalesCustomer> {
  const { data, error } = await client.from("sales_customers").insert({
    profit_center_id: input.profitCenterId,
    name: input.name,
    customer_type: input.customerType,
    is_export: input.isExport,
    country: input.country ?? null,
    region: input.region ?? null,
    contact_email: input.contactEmail ?? null,
    contact_phone: input.contactPhone ?? null,
    payment_terms_days: input.paymentTermsDays ?? 30,
    credit_limit: input.creditLimit ?? null,
    currency_code: input.currencyCode ?? (input.isExport ? "USD" : "INR"),
    gst_or_tax_id: input.gstOrTaxId ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select().single();
  if (error) throw error;
  return mapCustomer(data);
}

export async function deactivateCustomer(id: string): Promise<void> {
  const { error } = await client.from("sales_customers")
    .update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Inquiries
// ---------------------------------------------------------------------------

export async function fetchInquiries(
  profitCenterId: string,
  opts: { isExport?: boolean; status?: SalesInquiryStatus } = {},
): Promise<SalesInquiry[]> {
  let q = client.from("sales_inquiries")
    .select("*, sales_customers(name)")
    .eq("profit_center_id", profitCenterId);
  if (opts.isExport !== undefined) q = q.eq("is_export", opts.isExport);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("inquiry_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapInquiry);
}

export interface CreateInquiryInput {
  profitCenterId: string;
  customerId: string;
  isExport: boolean;
  product: string;
  grade?: string | null;
  qtyMt: number;
  expectedPrice?: number | null;
  currencyCode?: string;
  incoterms?: string | null;
  port?: string | null;
  notes?: string | null;
  createdBy: string;
}

export async function createInquiry(input: CreateInquiryInput): Promise<SalesInquiry> {
  if (input.qtyMt <= 0) throw new Error("Quantity must be greater than 0");
  const { data, error } = await client.from("sales_inquiries").insert({
    profit_center_id: input.profitCenterId,
    customer_id: input.customerId,
    is_export: input.isExport,
    product: input.product,
    grade: input.grade ?? null,
    qty_mt: input.qtyMt,
    expected_price: input.expectedPrice ?? null,
    currency_code: input.currencyCode ?? (input.isExport ? "USD" : "INR"),
    incoterms: input.incoterms ?? null,
    port: input.port ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select("*, sales_customers(name)").single();
  if (error) throw error;
  return mapInquiry(data);
}

export async function updateInquiryStatus(id: string, status: SalesInquiryStatus): Promise<void> {
  const { error } = await client.from("sales_inquiries")
    .update({ status }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function fetchOrders(
  profitCenterId: string,
  opts: { isExport?: boolean; status?: SalesOrderStatus } = {},
): Promise<SalesOrder[]> {
  let q = client.from("sales_orders")
    .select("*, sales_customers(name)")
    .eq("profit_center_id", profitCenterId);
  if (opts.isExport !== undefined) q = q.eq("is_export", opts.isExport);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("order_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapOrder);
}

export interface CreateOrderInput {
  profitCenterId: string;
  customerId: string;
  inquiryId?: string | null;
  isExport: boolean;
  product: string;
  grade?: string | null;
  qtyMt: number;
  pricePerMt: number;
  currencyCode?: string;
  fxRate?: number | null;
  incoterms?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  status?: SalesOrderStatus;
  notes?: string | null;
  createdBy: string;
}

export async function createOrder(input: CreateOrderInput): Promise<SalesOrder> {
  if (input.qtyMt <= 0) throw new Error("Quantity must be greater than 0");
  if (input.pricePerMt < 0) throw new Error("Price cannot be negative");
  const { data, error } = await client.from("sales_orders").insert({
    profit_center_id: input.profitCenterId,
    customer_id: input.customerId,
    inquiry_id: input.inquiryId ?? null,
    is_export: input.isExport,
    product: input.product,
    grade: input.grade ?? null,
    qty_mt: input.qtyMt,
    price_per_mt: input.pricePerMt,
    currency_code: input.currencyCode ?? (input.isExport ? "USD" : "INR"),
    fx_rate: input.fxRate ?? null,
    incoterms: input.incoterms ?? null,
    port_of_loading: input.portOfLoading ?? null,
    port_of_discharge: input.portOfDischarge ?? null,
    status: input.status ?? "draft",
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select("*, sales_customers(name)").single();
  if (error) throw error;
  return mapOrder(data);
}

export async function updateOrderStatus(id: string, status: SalesOrderStatus): Promise<void> {
  const { error } = await client.from("sales_orders")
    .update({ status }).eq("id", id);
  if (error) throw error;
}

/**
 * Convert an inquiry into a confirmed order. Pure mapping helper — the caller
 * is responsible for actually invoking createOrder + updateInquiryStatus.
 * Locks the source inquiry by transitioning it to 'won'.
 *
 * Returns the input shape required by createOrder so the caller can layer
 * additional fields (price, fx, ports) on top.
 */
export function convertInquiryToOrder(
  inq: Pick<SalesInquiry,
    "profitCenterId" | "customerId" | "id" | "isExport" | "product" | "grade"
    | "qtyMt" | "currencyCode" | "incoterms" | "port" | "expectedPrice"
  >,
  overrides: { pricePerMt: number; createdBy: string; fxRate?: number | null },
): CreateOrderInput {
  return {
    profitCenterId: inq.profitCenterId,
    customerId: inq.customerId,
    inquiryId: inq.id,
    isExport: inq.isExport,
    product: inq.product,
    grade: inq.grade,
    qtyMt: inq.qtyMt,
    pricePerMt: overrides.pricePerMt,
    currencyCode: inq.currencyCode,
    fxRate: overrides.fxRate ?? null,
    incoterms: inq.incoterms,
    portOfLoading: null,
    portOfDischarge: inq.port,
    status: "confirmed",
    createdBy: overrides.createdBy,
  };
}

// ---------------------------------------------------------------------------
// Pure aggregations (used by Dashboard tab — fully unit-testable)
// ---------------------------------------------------------------------------

export interface SalesKpis {
  openInquiries: number;
  quotedInquiries: number;
  totalBookingMt: number;
  confirmedOrders: number;
  dispatchedMt: number;
  totalValueByCurrency: Record<string, number>;
  domesticPctByValueInr: number;
  exportPctByValueInr: number;
}

const ACTIVE_ORDER_STATUSES: SalesOrderStatus[] = [
  "confirmed", "in_production", "ready_for_dispatch",
  "dispatched", "sailed", "delivered", "invoiced", "paid",
];

const DISPATCHED_STATUSES: SalesOrderStatus[] = [
  "dispatched", "sailed", "delivered", "invoiced", "paid",
];

/**
 * Convert an order's value to INR for cross-currency comparison.
 * Uses fx_rate when present (assumed: 1 unit foreign = fx_rate INR).
 * If fx_rate missing and currency is INR, returns total_value as-is.
 * If fx_rate missing and currency is foreign, returns 0 (excluded from mix).
 */
function toInr(order: Pick<SalesOrder, "totalValue" | "currencyCode" | "fxRate">): number {
  if (order.currencyCode === "INR") return order.totalValue;
  if (order.fxRate && order.fxRate > 0) return order.totalValue * order.fxRate;
  return 0;
}

export function aggregateSalesKpis(
  inquiries: SalesInquiry[],
  orders: SalesOrder[],
): SalesKpis {
  const safeInq = inquiries ?? [];
  const safeOrd = orders ?? [];

  const openInquiries = safeInq.filter((i) => i.status === "open").length;
  const quotedInquiries = safeInq.filter((i) => i.status === "quoted").length;

  const activeOrders = safeOrd.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status));
  const totalBookingMt = activeOrders.reduce((s, o) => s + o.qtyMt, 0);
  const confirmedOrders = activeOrders.length;

  const dispatchedMt = safeOrd
    .filter((o) => DISPATCHED_STATUSES.includes(o.status))
    .reduce((s, o) => s + o.qtyMt, 0);

  const totalValueByCurrency: Record<string, number> = {};
  for (const o of activeOrders) {
    totalValueByCurrency[o.currencyCode] = (totalValueByCurrency[o.currencyCode] ?? 0) + o.totalValue;
  }

  let domesticInr = 0;
  let exportInr = 0;
  for (const o of activeOrders) {
    const inr = toInr(o);
    if (o.isExport) exportInr += inr;
    else domesticInr += inr;
  }
  const totalInr = domesticInr + exportInr;
  const domesticPctByValueInr = totalInr > 0 ? (domesticInr / totalInr) * 100 : 0;
  const exportPctByValueInr = totalInr > 0 ? (exportInr / totalInr) * 100 : 0;

  return {
    openInquiries,
    quotedInquiries,
    totalBookingMt,
    confirmedOrders,
    dispatchedMt,
    totalValueByCurrency,
    domesticPctByValueInr,
    exportPctByValueInr,
  };
}
