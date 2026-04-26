/**
 * Sales & Export — Phase A pure-logic tests.
 *
 * Covers:
 *  - aggregateSalesKpis: empty-array safety, status filtering, MT totals,
 *    multi-currency value buckets, INR-normalised export/domestic mix.
 *  - convertInquiryToOrder: shape mapping + status transition.
 */
import { describe, it, expect } from "vitest";
import {
  aggregateSalesKpis,
  convertInquiryToOrder,
  type SalesInquiry,
  type SalesOrder,
} from "@/lib/sales";

const baseInq = (overrides: Partial<SalesInquiry> = {}): SalesInquiry => ({
  id: "i1",
  profitCenterId: "pc1",
  inquiryNo: "INQ-2026-00001",
  inquiryDate: "2026-01-01",
  customerId: "c1",
  isExport: false,
  product: "HC FeMn",
  grade: "65/14",
  qtyMt: 100,
  expectedPrice: 1000,
  currencyCode: "INR",
  incoterms: null,
  port: null,
  status: "open",
  notes: null,
  createdBy: "u1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const baseOrd = (overrides: Partial<SalesOrder> = {}): SalesOrder => ({
  id: "o1",
  profitCenterId: "pc1",
  soNumber: "SO-2026-00001",
  orderDate: "2026-01-01",
  customerId: "c1",
  inquiryId: null,
  isExport: false,
  product: "HC FeMn",
  grade: "65/14",
  qtyMt: 100,
  pricePerMt: 100000,
  currencyCode: "INR",
  fxRate: null,
  incoterms: null,
  portOfLoading: null,
  portOfDischarge: null,
  status: "confirmed",
  totalValue: 100 * 100000,
  notes: null,
  createdBy: "u1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("aggregateSalesKpis", () => {
  it("handles empty arrays without NaN or division-by-zero", () => {
    const k = aggregateSalesKpis([], []);
    expect(k.openInquiries).toBe(0);
    expect(k.quotedInquiries).toBe(0);
    expect(k.totalBookingMt).toBe(0);
    expect(k.confirmedOrders).toBe(0);
    expect(k.dispatchedMt).toBe(0);
    expect(k.totalValueByCurrency).toEqual({});
    expect(k.domesticPctByValueInr).toBe(0);
    expect(k.exportPctByValueInr).toBe(0);
    expect(Number.isNaN(k.exportPctByValueInr)).toBe(false);
  });

  it("counts open vs quoted inquiries and ignores cancelled", () => {
    const k = aggregateSalesKpis(
      [
        baseInq({ id: "a", status: "open" }),
        baseInq({ id: "b", status: "open" }),
        baseInq({ id: "c", status: "quoted" }),
        baseInq({ id: "d", status: "won" }),
        baseInq({ id: "e", status: "cancelled" }),
      ],
      [],
    );
    expect(k.openInquiries).toBe(2);
    expect(k.quotedInquiries).toBe(1);
  });

  it("sums booking MT only across active orders and dispatched MT only across post-dispatch", () => {
    const k = aggregateSalesKpis([], [
      baseOrd({ id: "1", qtyMt: 100, status: "confirmed" }),
      baseOrd({ id: "2", qtyMt: 200, status: "dispatched" }),
      baseOrd({ id: "3", qtyMt: 300, status: "delivered" }),
      baseOrd({ id: "4", qtyMt: 999, status: "draft" }),       // excluded
      baseOrd({ id: "5", qtyMt: 999, status: "cancelled" }),   // excluded
    ]);
    expect(k.totalBookingMt).toBe(600);
    expect(k.confirmedOrders).toBe(3);
    expect(k.dispatchedMt).toBe(500); // 200 + 300
  });

  it("buckets total value by currency", () => {
    const k = aggregateSalesKpis([], [
      baseOrd({ id: "1", currencyCode: "INR", qtyMt: 1, pricePerMt: 100, totalValue: 100 }),
      baseOrd({ id: "2", currencyCode: "INR", qtyMt: 1, pricePerMt: 50, totalValue: 50 }),
      baseOrd({ id: "3", currencyCode: "USD", qtyMt: 1, pricePerMt: 1000, totalValue: 1000, isExport: true }),
    ]);
    expect(k.totalValueByCurrency).toEqual({ INR: 150, USD: 1000 });
  });

  it("computes INR-normalised domestic vs export mix using fx_rate", () => {
    const k = aggregateSalesKpis([], [
      // Domestic: 10,000 INR
      baseOrd({ id: "d", isExport: false, currencyCode: "INR", qtyMt: 1, pricePerMt: 10000, totalValue: 10000 }),
      // Export: 100 USD * 90 = 9,000 INR
      baseOrd({ id: "e", isExport: true, currencyCode: "USD", qtyMt: 1, pricePerMt: 100, totalValue: 100, fxRate: 90 }),
    ]);
    // total INR = 19,000 → domestic 10/19, export 9/19
    expect(k.domesticPctByValueInr).toBeCloseTo((10000 / 19000) * 100, 5);
    expect(k.exportPctByValueInr).toBeCloseTo((9000 / 19000) * 100, 5);
    expect(k.domesticPctByValueInr + k.exportPctByValueInr).toBeCloseTo(100, 5);
  });

  it("excludes foreign-currency orders without fx_rate from mix (no NaN, no inflation)", () => {
    const k = aggregateSalesKpis([], [
      baseOrd({ id: "d", isExport: false, currencyCode: "INR", qtyMt: 1, pricePerMt: 100, totalValue: 100 }),
      baseOrd({ id: "e", isExport: true, currencyCode: "USD", qtyMt: 1, pricePerMt: 50, totalValue: 50, fxRate: null }),
    ]);
    expect(k.domesticPctByValueInr).toBe(100);
    expect(k.exportPctByValueInr).toBe(0);
  });
});

describe("convertInquiryToOrder", () => {
  it("maps inquiry fields and locks the inquiry reference", () => {
    const inq = baseInq({
      id: "inq-x",
      isExport: true,
      product: "MC FeMn",
      grade: "85/2",
      qtyMt: 250,
      currencyCode: "USD",
      incoterms: "CIF",
      port: "Rotterdam",
      expectedPrice: 1100,
    });
    const out = convertInquiryToOrder(inq, { pricePerMt: 1150, createdBy: "u1", fxRate: 83.5 });
    expect(out.profitCenterId).toBe(inq.profitCenterId);
    expect(out.customerId).toBe(inq.customerId);
    expect(out.inquiryId).toBe("inq-x");
    expect(out.isExport).toBe(true);
    expect(out.product).toBe("MC FeMn");
    expect(out.grade).toBe("85/2");
    expect(out.qtyMt).toBe(250);
    expect(out.pricePerMt).toBe(1150);
    expect(out.currencyCode).toBe("USD");
    expect(out.fxRate).toBe(83.5);
    expect(out.incoterms).toBe("CIF");
    expect(out.portOfDischarge).toBe("Rotterdam");
    expect(out.status).toBe("confirmed");
    expect(out.createdBy).toBe("u1");
  });

  it("defaults fxRate to null when not provided", () => {
    const out = convertInquiryToOrder(baseInq(), { pricePerMt: 50000, createdBy: "u1" });
    expect(out.fxRate).toBeNull();
    expect(out.status).toBe("confirmed");
  });
});
