/**
 * Procurement service layer (Phase B).
 *
 * Covers:
 *  - Suppliers CRUD
 *  - Purchase Requisitions (header + lines) with single-step approval workflow
 *      draft → submitted → approved → converted → closed   (rejected is terminal)
 *  - Purchase Orders (header + lines), PR→PO conversion
 *  - Currencies + FX rates lookup
 *
 * All writes are workspace-scoped via `profit_center_id`. RLS + audit triggers
 * (log_procurement_event) are already configured in the database; this layer
 * only translates between snake_case rows and camelCase domain objects and
 * enforces the status-transition rules client-side as a defense-in-depth check
 * (the DB also enforces them through RLS USING clauses).
 *
 * Status transitions allowed here are intentionally narrow — anything broader
 * is a policy change and must be paired with a POLICY.md update.
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

// ---------- TYPES ----------

export interface Supplier {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  defaultCurrency: string;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PrStatus = "draft" | "submitted" | "approved" | "rejected" | "converted" | "closed";
export type PoStatus =
  | "draft"
  | "sent"
  | "acknowledged"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";

export interface PrLine {
  id: string;
  prId: string;
  profitCenterId: string;
  materialId: string;
  quantity: number;
  uom: string;
  estUnitCost: number | null;
  currencyCode: string;
  notes: string | null;
}

export interface PurchaseRequisition {
  id: string;
  profitCenterId: string;
  prNumber: string;
  status: PrStatus;
  priority: string | null;
  requestedBy: string;
  requestedForDate: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: PrLine[];
}

export interface PoLine {
  id: string;
  poId: string;
  profitCenterId: string;
  materialId: string;
  qtyOrdered: number;
  qtyReceived: number;
  uom: string;
  unitCost: number;
  currencyCode: string;
  sourcePrLineId: string | null;
  notes: string | null;
}

export interface PurchaseOrder {
  id: string;
  profitCenterId: string;
  poNumber: string;
  status: PoStatus;
  supplierId: string;
  sourcePrId: string | null;
  currencyCode: string;
  totalAmount: number;
  paymentTerms: string | null;
  expectedDeliveryDate: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lines?: PoLine[];
}

export interface Currency {
  code: string;
  name: string;
  symbol: string | null;
}

export interface FxRate {
  id: string;
  profitCenterId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: string;
  notes: string | null;
}

// ---------- ROW MAPPERS ----------

function toSupplier(r: any): Supplier {
  return {
    id: r.id,
    profitCenterId: r.profit_center_id,
    code: r.code,
    name: r.name,
    contactPerson: r.contact_person ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    address: r.address ?? null,
    country: r.country ?? null,
    defaultCurrency: r.default_currency,
    paymentTerms: r.payment_terms ?? null,
    leadTimeDays: r.lead_time_days ?? null,
    isPreferred: Boolean(r.is_preferred),
    isActive: Boolean(r.is_active),
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toPrLine(r: any): PrLine {
  return {
    id: r.id,
    prId: r.pr_id,
    profitCenterId: r.profit_center_id,
    materialId: r.material_id,
    quantity: Number(r.quantity),
    uom: r.uom,
    estUnitCost: r.est_unit_cost !== null && r.est_unit_cost !== undefined ? Number(r.est_unit_cost) : null,
    currencyCode: r.currency_code,
    notes: r.notes ?? null,
  };
}

function toPr(r: any): PurchaseRequisition {
  return {
    id: r.id,
    profitCenterId: r.profit_center_id,
    prNumber: r.pr_number,
    status: r.status as PrStatus,
    priority: r.priority ?? null,
    requestedBy: r.requested_by,
    requestedForDate: r.requested_for_date ?? null,
    approvedBy: r.approved_by ?? null,
    approvedAt: r.approved_at ?? null,
    rejectedReason: r.rejected_reason ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toPoLine(r: any): PoLine {
  return {
    id: r.id,
    poId: r.po_id,
    profitCenterId: r.profit_center_id,
    materialId: r.material_id,
    qtyOrdered: Number(r.qty_ordered),
    qtyReceived: Number(r.qty_received ?? 0),
    uom: r.uom,
    unitCost: Number(r.unit_cost),
    currencyCode: r.currency_code,
    sourcePrLineId: r.source_pr_line_id ?? null,
    notes: r.notes ?? null,
  };
}

function toPo(r: any): PurchaseOrder {
  return {
    id: r.id,
    profitCenterId: r.profit_center_id,
    poNumber: r.po_number,
    status: r.status as PoStatus,
    supplierId: r.supplier_id,
    sourcePrId: r.source_pr_id ?? null,
    currencyCode: r.currency_code,
    totalAmount: Number(r.total_amount ?? 0),
    paymentTerms: r.payment_terms ?? null,
    expectedDeliveryDate: r.expected_delivery_date ?? null,
    approvedBy: r.approved_by ?? null,
    approvedAt: r.approved_at ?? null,
    cancelledAt: r.cancelled_at ?? null,
    cancelledReason: r.cancelled_reason ?? null,
    notes: r.notes ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------- SUPPLIERS ----------

export async function fetchSuppliers(profitCenterId: string): Promise<Supplier[]> {
  const { data, error } = await client
    .from("suppliers")
    .select(
      "id, profit_center_id, code, name, contact_person, email, phone, address, country, default_currency, payment_terms, lead_time_days, is_preferred, is_active, notes, created_at, updated_at",
    )
    .eq("profit_center_id", profitCenterId)
    .order("code");
  if (error) throw error;
  return (data ?? []).map(toSupplier);
}

export async function upsertSupplier(input: {
  id?: string;
  profitCenterId: string;
  code: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  defaultCurrency: string;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    profit_center_id: input.profitCenterId,
    code: input.code.trim(),
    name: input.name.trim(),
    contact_person: input.contactPerson,
    email: input.email,
    phone: input.phone,
    address: input.address,
    country: input.country,
    default_currency: input.defaultCurrency,
    payment_terms: input.paymentTerms,
    lead_time_days: input.leadTimeDays,
    is_preferred: input.isPreferred,
    is_active: input.isActive,
    notes: input.notes,
  };
  if (input.id) {
    const { error } = await client.from("suppliers").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    payload.created_by = input.createdBy;
    const { error } = await client.from("suppliers").insert(payload);
    if (error) throw error;
  }
}

// ---------- PURCHASE REQUISITIONS ----------

/** Status-transition guard. Single-step approval; mirrors DB RLS. */
export function canTransitionPr(from: PrStatus, to: PrStatus): boolean {
  const map: Record<PrStatus, PrStatus[]> = {
    draft: ["submitted"],
    submitted: ["approved", "rejected", "draft"],
    approved: ["converted", "closed"],
    rejected: [],
    converted: ["closed"],
    closed: [],
  };
  return (map[from] ?? []).includes(to);
}

export async function fetchPurchaseRequisitions(profitCenterId: string): Promise<PurchaseRequisition[]> {
  const { data, error } = await client
    .from("purchase_requisitions")
    .select(
      "id, profit_center_id, pr_number, status, priority, requested_by, requested_for_date, approved_by, approved_at, rejected_reason, notes, created_at, updated_at",
    )
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toPr);
}

export async function fetchPrLines(prId: string): Promise<PrLine[]> {
  const { data, error } = await client
    .from("purchase_requisition_lines")
    .select("id, pr_id, profit_center_id, material_id, quantity, uom, est_unit_cost, currency_code, notes")
    .eq("pr_id", prId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(toPrLine);
}

export interface PrLineInput {
  materialId: string;
  quantity: number;
  uom: string;
  estUnitCost: number | null;
  currencyCode: string;
  notes: string | null;
}

export async function createPurchaseRequisition(input: {
  profitCenterId: string;
  prNumber: string;
  priority: string | null;
  requestedForDate: string | null;
  notes: string | null;
  requestedBy: string;
  lines: PrLineInput[];
}): Promise<string> {
  if (!input.prNumber.trim()) throw new Error("PR number is required");
  if (input.lines.length === 0) throw new Error("Add at least one line item");
  for (const l of input.lines) {
    if (!l.materialId) throw new Error("Each line needs a material");
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new Error("Each line needs quantity > 0");
  }

  const { data: prRow, error: prErr } = await client
    .from("purchase_requisitions")
    .insert({
      profit_center_id: input.profitCenterId,
      pr_number: input.prNumber.trim(),
      priority: input.priority,
      requested_for_date: input.requestedForDate,
      notes: input.notes,
      requested_by: input.requestedBy,
      status: "draft",
    })
    .select("id")
    .single();
  if (prErr) throw prErr;
  const prId = (prRow as any).id as string;

  const linePayload = input.lines.map((l) => ({
    pr_id: prId,
    profit_center_id: input.profitCenterId,
    material_id: l.materialId,
    quantity: l.quantity,
    uom: l.uom,
    est_unit_cost: l.estUnitCost,
    currency_code: l.currencyCode,
    notes: l.notes,
  }));
  const { error: lineErr } = await client.from("purchase_requisition_lines").insert(linePayload);
  if (lineErr) throw lineErr;

  return prId;
}

export async function transitionPurchaseRequisition(input: {
  prId: string;
  fromStatus: PrStatus;
  toStatus: PrStatus;
  actorUserId: string;
  rejectedReason?: string | null;
}): Promise<void> {
  if (!canTransitionPr(input.fromStatus, input.toStatus)) {
    throw new Error(`Transition ${input.fromStatus} → ${input.toStatus} is not allowed`);
  }
  const patch: Record<string, unknown> = { status: input.toStatus };
  if (input.toStatus === "approved") {
    patch.approved_by = input.actorUserId;
    patch.approved_at = new Date().toISOString();
  }
  if (input.toStatus === "rejected") {
    if (!input.rejectedReason || input.rejectedReason.trim().length < 3) {
      throw new Error("Rejection reason (3+ characters) is required");
    }
    patch.rejected_reason = input.rejectedReason.trim();
  }
  const { error } = await client.from("purchase_requisitions").update(patch).eq("id", input.prId);
  if (error) throw error;
}

// ---------- PURCHASE ORDERS ----------

export function canTransitionPo(from: PoStatus, to: PoStatus): boolean {
  const map: Record<PoStatus, PoStatus[]> = {
    draft: ["sent", "cancelled"],
    sent: ["acknowledged", "cancelled"],
    acknowledged: ["partially_received", "received", "cancelled"],
    partially_received: ["partially_received", "received", "cancelled"],
    received: ["closed"],
    closed: [],
    cancelled: [],
  };
  return (map[from] ?? []).includes(to);
}

export async function fetchPurchaseOrders(profitCenterId: string): Promise<PurchaseOrder[]> {
  const { data, error } = await client
    .from("purchase_orders")
    .select(
      "id, profit_center_id, po_number, status, supplier_id, source_pr_id, currency_code, total_amount, payment_terms, expected_delivery_date, approved_by, approved_at, cancelled_at, cancelled_reason, notes, created_by, created_at, updated_at",
    )
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toPo);
}

export async function fetchPoLines(poId: string): Promise<PoLine[]> {
  const { data, error } = await client
    .from("purchase_order_lines")
    .select(
      "id, po_id, profit_center_id, material_id, qty_ordered, qty_received, uom, unit_cost, currency_code, source_pr_line_id, notes",
    )
    .eq("po_id", poId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(toPoLine);
}

export interface PoLineInput {
  materialId: string;
  qtyOrdered: number;
  uom: string;
  unitCost: number;
  currencyCode: string;
  sourcePrLineId?: string | null;
  notes?: string | null;
}

export function calcPoTotal(lines: { qtyOrdered: number; unitCost: number }[]): number {
  return lines.reduce((sum, l) => sum + l.qtyOrdered * l.unitCost, 0);
}

export async function createPurchaseOrder(input: {
  profitCenterId: string;
  poNumber: string;
  supplierId: string;
  sourcePrId: string | null;
  currencyCode: string;
  paymentTerms: string | null;
  expectedDeliveryDate: string | null;
  notes: string | null;
  createdBy: string;
  lines: PoLineInput[];
}): Promise<string> {
  if (!input.poNumber.trim()) throw new Error("PO number is required");
  if (!input.supplierId) throw new Error("Supplier is required");
  if (input.lines.length === 0) throw new Error("Add at least one PO line");
  for (const l of input.lines) {
    if (!l.materialId) throw new Error("Each line needs a material");
    if (!Number.isFinite(l.qtyOrdered) || l.qtyOrdered <= 0) throw new Error("Each line needs quantity > 0");
    if (!Number.isFinite(l.unitCost) || l.unitCost < 0) throw new Error("Each line needs a unit cost ≥ 0");
  }

  const total = calcPoTotal(input.lines);

  const { data: poRow, error: poErr } = await client
    .from("purchase_orders")
    .insert({
      profit_center_id: input.profitCenterId,
      po_number: input.poNumber.trim(),
      supplier_id: input.supplierId,
      source_pr_id: input.sourcePrId,
      currency_code: input.currencyCode,
      payment_terms: input.paymentTerms,
      expected_delivery_date: input.expectedDeliveryDate,
      notes: input.notes,
      created_by: input.createdBy,
      status: "draft",
      total_amount: total,
    })
    .select("id")
    .single();
  if (poErr) throw poErr;
  const poId = (poRow as any).id as string;

  const linePayload = input.lines.map((l) => ({
    po_id: poId,
    profit_center_id: input.profitCenterId,
    material_id: l.materialId,
    qty_ordered: l.qtyOrdered,
    uom: l.uom,
    unit_cost: l.unitCost,
    currency_code: l.currencyCode,
    source_pr_line_id: l.sourcePrLineId ?? null,
    notes: l.notes ?? null,
  }));
  const { error: lineErr } = await client.from("purchase_order_lines").insert(linePayload);
  if (lineErr) throw lineErr;

  return poId;
}

export async function transitionPurchaseOrder(input: {
  poId: string;
  fromStatus: PoStatus;
  toStatus: PoStatus;
  actorUserId: string;
  cancelledReason?: string | null;
}): Promise<void> {
  if (!canTransitionPo(input.fromStatus, input.toStatus)) {
    throw new Error(`Transition ${input.fromStatus} → ${input.toStatus} is not allowed`);
  }
  const patch: Record<string, unknown> = { status: input.toStatus };
  if (input.toStatus === "sent") {
    patch.approved_by = input.actorUserId;
    patch.approved_at = new Date().toISOString();
  }
  if (input.toStatus === "cancelled") {
    if (!input.cancelledReason || input.cancelledReason.trim().length < 3) {
      throw new Error("Cancellation reason (3+ characters) is required");
    }
    patch.cancelled_at = new Date().toISOString();
    patch.cancelled_reason = input.cancelledReason.trim();
  }
  const { error } = await client.from("purchase_orders").update(patch).eq("id", input.poId);
  if (error) throw error;
}

/**
 * Convert an approved PR into a draft PO. Pre-fills lines from PR lines.
 * Caller chooses the supplier + currency. Caller is responsible for moving the
 * PR to "converted" via `transitionPurchaseRequisition` after this returns.
 */
export async function convertPrToPo(input: {
  prId: string;
  profitCenterId: string;
  poNumber: string;
  supplierId: string;
  currencyCode: string;
  paymentTerms: string | null;
  expectedDeliveryDate: string | null;
  notes: string | null;
  createdBy: string;
  /** unit-cost overrides keyed by pr_line_id */
  unitCostOverrides?: Record<string, number>;
}): Promise<string> {
  const prLines = await fetchPrLines(input.prId);
  if (prLines.length === 0) throw new Error("Source PR has no line items");

  const lines: PoLineInput[] = prLines.map((l) => ({
    materialId: l.materialId,
    qtyOrdered: l.quantity,
    uom: l.uom,
    unitCost: input.unitCostOverrides?.[l.id] ?? l.estUnitCost ?? 0,
    currencyCode: input.currencyCode,
    sourcePrLineId: l.id,
    notes: l.notes,
  }));

  return createPurchaseOrder({
    profitCenterId: input.profitCenterId,
    poNumber: input.poNumber,
    supplierId: input.supplierId,
    sourcePrId: input.prId,
    currencyCode: input.currencyCode,
    paymentTerms: input.paymentTerms,
    expectedDeliveryDate: input.expectedDeliveryDate,
    notes: input.notes,
    createdBy: input.createdBy,
    lines,
  });
}

// ---------- CURRENCIES & FX ----------

export async function fetchCurrencies(): Promise<Currency[]> {
  const { data, error } = await client
    .from("currencies")
    .select("code, name, symbol")
    .eq("is_active", true)
    .order("code");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ code: r.code, name: r.name, symbol: r.symbol ?? null }));
}

export async function fetchFxRates(profitCenterId: string): Promise<FxRate[]> {
  const { data, error } = await client
    .from("fx_rates")
    .select("id, profit_center_id, from_currency, to_currency, rate, effective_date, notes")
    .eq("profit_center_id", profitCenterId)
    .order("effective_date", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    profitCenterId: r.profit_center_id,
    fromCurrency: r.from_currency,
    toCurrency: r.to_currency,
    rate: Number(r.rate),
    effectiveDate: r.effective_date,
    notes: r.notes ?? null,
  }));
}

/**
 * Look up the most recent FX rate at-or-before `asOf` for a from→to pair.
 * Returns 1 when from === to. Returns null when no rate exists; UI must
 * surface this so the user enters the rate before continuing.
 */
export function findFxRate(
  rates: FxRate[],
  fromCurrency: string,
  toCurrency: string,
  asOf: string,
): number | null {
  if (fromCurrency === toCurrency) return 1;
  const candidates = rates
    .filter((r) => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency && r.effectiveDate <= asOf)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
  return candidates[0]?.rate ?? null;
}
