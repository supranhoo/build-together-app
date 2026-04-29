/**
 * Cost Sheet (4-Bucket) Operational Page — Phase 11.
 *
 * Lets a user enter a single day's production parameters and view the
 * deterministic 4-bucket breakdown (variable / fixed / utility / credit)
 * computed by `calculateCostSheet` in `src/lib/costing.ts`.
 *
 * Inputs:
 *   - Date (defaults to today)
 *   - Metal produced (MT), slag (MT)
 *   - Power consumed (kWh), Oxygen (Nm3), days
 *   - Variable consumption lines (material + qty); rate sourced from
 *     `materials.std_cost` (inventory rate proxy)
 * Rates: pulled from `cost_rates` filtered to ACTIVE on the entered date.
 *
 * Pure presentation — calculation lives in `src/lib/costing.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Download } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { fetchCostRates, fetchMasterItems, type CostRate, type MasterItem } from "@/lib/master-data";
import {
  calculateCostSheet,
  type ConsumptionLine,
  type SheetRate,
} from "@/lib/costing";
import { exportRows } from "@/lib/excel-export";

interface ConsumptionRow {
  id: string;
  materialId: string;
  quantity: string;
}

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, { maximumFractionDigits: d });

const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function rateToSheetRate(r: CostRate): SheetRate {
  return {
    materialId: r.materialId,
    rate: r.rate,
    costType: r.costType,
    allocationBasis: r.allocationBasis,
    status: r.status,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
  };
}

export default function PortalCostSheet() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [items, setItems] = useState<MasterItem[]>([]);
  const [rates, setRates] = useState<CostRate[]>([]);
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(today);
  const [qtyMt, setQtyMt] = useState("");
  const [slagQty, setSlagQty] = useState("");
  const [powerKwh, setPowerKwh] = useState("");
  const [oxygenNm3, setOxygenNm3] = useState("");
  const [days, setDays] = useState("1");
  const [lines, setLines] = useState<ConsumptionRow[]>([
    { id: crypto.randomUUID(), materialId: "", quantity: "" },
  ]);

  useEffect(() => {
    if (!activeProfitCenter) return;
    setLoading(true);
    (async () => {
      try {
        const [m, r] = await Promise.all([
          fetchMasterItems(activeProfitCenter.id),
          fetchCostRates(activeProfitCenter.id),
        ]);
        setItems(m.filter((i) => i.isActive));
        setRates(r);
      } catch (e) {
        toast({
          title: "Failed to load cost sheet inputs",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [activeProfitCenter?.id, toast]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const variableItems = useMemo(
    () => items.filter((i) => i.type === "RM" || i.type === "Consumable"),
    [items],
  );

  const inventoryRates = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const i of items) map[i.id] = i.stdCost ?? 0;
    return map;
  }, [items]);

  const consumption = useMemo<ConsumptionLine[]>(
    () =>
      lines
        .filter((l) => l.materialId && num(l.quantity) > 0)
        .map((l) => ({ materialId: l.materialId, quantity: num(l.quantity) })),
    [lines],
  );

  const result = useMemo(
    () =>
      calculateCostSheet(
        {
          date,
          qtyMt: num(qtyMt),
          slagQty: num(slagQty),
          powerKwh: num(powerKwh),
          oxygenNm3: num(oxygenNm3),
          days: Math.max(1, num(days)),
        },
        consumption,
        rates.map(rateToSheetRate),
        inventoryRates,
      ),
    [date, qtyMt, slagQty, powerKwh, oxygenNm3, days, consumption, rates, inventoryRates],
  );

  const addLine = () =>
    setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", quantity: "" }]);
  const removeLine = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id));
  const updateLine = (id: string, patch: Partial<ConsumptionRow>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const handleExport = () => {
    const rows = [
      { metric: "Variable", value: result.variable },
      { metric: "Fixed", value: result.fixed },
      { metric: "Utility", value: result.utility },
      { metric: "Credit (slag)", value: result.credit },
      { metric: "Total Net Cost", value: result.total },
      { metric: "Cost / MT", value: result.costPerMt ?? 0 },
    ];
    exportRows(`cost-sheet-${date}`, rows);
  };

  if (!activeProfitCenter) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cost Sheet</h1>
        <p className="text-muted-foreground">
          Daily 4-bucket cost breakdown using active rates effective on the entry date.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Production Inputs</CardTitle>
          <CardDescription>Enter the day's production and utility totals.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor="cs-date">Date</Label>
            <Input id="cs-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cs-qty">Metal (MT)</Label>
            <Input id="cs-qty" type="number" min="0" step="0.001" value={qtyMt} onChange={(e) => setQtyMt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cs-slag">Slag (MT)</Label>
            <Input id="cs-slag" type="number" min="0" step="0.001" value={slagQty} onChange={(e) => setSlagQty(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cs-power">Power (kWh)</Label>
            <Input id="cs-power" type="number" min="0" step="1" value={powerKwh} onChange={(e) => setPowerKwh(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cs-o2">Oxygen (Nm³)</Label>
            <Input id="cs-o2" type="number" min="0" step="1" value={oxygenNm3} onChange={(e) => setOxygenNm3(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cs-days">Days</Label>
            <Input id="cs-days" type="number" min="1" step="1" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Variable Consumption</CardTitle>
            <CardDescription>
              Variable cost = Σ(qty × material std cost). Add one row per material consumed.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addLine} disabled={loading}>
            <Plus className="mr-2 h-4 w-4" /> Add Line
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="w-32">UOM</TableHead>
                <TableHead className="w-40">Quantity</TableHead>
                <TableHead className="w-32 text-right">Rate</TableHead>
                <TableHead className="w-32 text-right">Line Cost</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const item = line.materialId ? itemById.get(line.materialId) : null;
                const qty = num(line.quantity);
                const rate = item?.stdCost ?? 0;
                const lineCost = qty * rate;
                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Select
                        value={line.materialId}
                        onValueChange={(v) => updateLine(line.id, { materialId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select material" />
                        </SelectTrigger>
                        <SelectContent>
                          {variableItems.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.code} — {i.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item?.uom ?? "—"}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(lineCost)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(line.id)}
                        disabled={lines.length <= 1}
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Cost Breakdown</CardTitle>
            <CardDescription>
              Total = Variable + Fixed + Utility − Credit. Cost/MT divides by metal MT.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Bucket label="Variable" value={result.variable} />
            <Bucket label="Fixed" value={result.fixed} />
            <Bucket label="Utility" value={result.utility} />
            <Bucket label="Credit (Slag)" value={result.credit} accent="positive" />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Bucket label="Total Net Cost" value={result.total} large />
            <Bucket
              label="Cost / MT"
              value={result.costPerMt}
              large
              suffix=" /MT"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Bucket({
  label,
  value,
  large,
  suffix,
  accent,
}: {
  label: string;
  value: number | null;
  large?: boolean;
  suffix?: string;
  accent?: "positive";
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-1 tabular-nums font-semibold ${large ? "text-2xl" : "text-lg"} ${
          accent === "positive" ? "text-emerald-600" : ""
        }`}
      >
        {fmt(value)}
        {suffix && value !== null ? <span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
  );
}
