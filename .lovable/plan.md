## Phase 11 — Seasonality, Multi-Horizon Forecasting & Accuracy Backtests

Phase 9 shipped a 7-day linear projection as deliberate "groundwork." Phase 11 turns that into something a shift manager can actually trust: weekly seasonality (the dominant pattern in shift-based plant data), selectable horizons, and an honest accuracy readout via walk-forward backtests.

This is **strictly additive and display-only**. Phase 9's Forecast Display Governance (POLICY.md) still applies verbatim: no persistence, no audit, no digest payloads, no CSV-of-series leakage, fail-closed on degenerate inputs.

### Open Decisions (please confirm or say "use defaults")

1. **Seasonality period** — *default: weekly (period=7) only.*
   - 1a (default): Weekly only. Captures shift/weekend cycles, needs ≥14 points to engage.
   - 1b: Weekly + monthly (period=30). Needs ≥60 points; most series in the current 30-day default window won't qualify, so monthly will silently be unavailable for almost everyone. Adds code without much real-world payoff yet.

2. **Horizons offered** — *default: 7 / 14 / 30 days.*
   - 2a (default): 7, 14, 30. Single-select, default 7.
   - 2b: 7 / 14 only. More conservative; 30-day projections from 30-day input series are statistically dubious.
   - 2c: Free numeric input (1–60). Maximum flexibility, easier to misuse.

3. **Backtest readout** — *default: MAPE + MAE on the last 7 actual days, recomputed whenever horizon or seasonality changes.*
   - 3a (default): Single hold-out (last 7 points), report MAPE % and MAE in series unit. Cheap, honest enough.
   - 3b: Rolling-origin walk-forward (5 folds × 1-day step). More robust, ~5× the compute, still trivial client-side.
   - 3c: Skip backtests entirely. Rejected by me — shipping a seasonal model without an accuracy readout is exactly the "linear-trend toy bolted with features" failure mode I flagged when Phase 9 was scoped.

4. **UI surface** — *default: extend the existing Trend tab in `KpiDetailDrawer`.*
   - 4a (default): Same drawer tab. Add a horizon selector + seasonality toggle + accuracy badge. Zero new routes.
   - 4b: New "Forecast" tab next to Trend. Cleaner separation, but Trend already shows the chart; splitting feels artificial.

---

### What gets built

**1. Pure helpers in `src/lib/reporting.ts`** (no schema, no DB, no new deps)

- `forecastSeasonal(series, horizonDays, opts)` — returns projected `KpiSeriesPoint[]`. Algorithm: detrend with linear regression → if `series.length >= 2 * period` (default period=7), compute mean residual per weekday → project as `trend(future_x) + seasonal_index(future_weekday)`. Falls back to `forecastLinear` when seasonality cannot engage. Fails closed on the same conditions as `forecastLinear` (NaN, degenerate slope, <2 usable points).
- `backtestForecast(series, horizonDays, opts)` — holds out the last `min(7, floor(series.length / 3))` points, runs `forecastSeasonal` on the prefix, returns `{ mape: number | null, mae: number | null, holdoutCount: number, method: "seasonal" | "linear" | "none" }`. Returns `mape: null` when any actual is 0 (avoid divide-by-zero) and falls back to MAE only.
- Existing `forecastLinear` stays untouched and exported — `forecastSeasonal` calls it internally for the trend component and as the fallback.

**2. UI changes — `src/components/KpiDetailDrawer.tsx` only**

The Trend tab gets three new controls above the chart, replacing the current single Switch:

```text
┌───────────────────────────────────────────────────────────────┐
│  Show forecast  [Switch]                                      │
│  Horizon: [7d] [14d] [30d]    Seasonality: [Auto ▼]           │
│  Accuracy (last 7d holdout): MAPE 8.2% · MAE 1.4 mt · weekly  │
└───────────────────────────────────────────────────────────────┘
```

- Horizon segmented control (default 7).
- Seasonality select: `Auto` (default — engages when data allows) / `Off` (linear only).
- Accuracy badge: shows MAPE/MAE, the method actually used (`seasonal`/`linear`/`none`), and the holdout size. Greyed-out with "Insufficient data" text when fewer than 6 points exist.
- Dashed forecast line on the chart — same styling as today, just longer when 14/30 selected.
- Tooltip on the accuracy badge: "Computed by holding out the last N actual days and comparing the model's prediction. Display-only; never persisted."

No changes to `PortalOverview.tsx`, `PortalReports.tsx`, or any export/CSV/digest path.

**3. Tests** (`src/test/example.test.tsx`)

Add a `describe("Seasonal forecast helper (Phase 11)")` block covering:
- Returns linear-only when series < 14 points.
- Engages weekly seasonality at exactly 14 points.
- Reproduces a synthetic `trend + sin(2π·weekday/7)` signal within tight tolerance.
- Fails closed (`[]`) on all-null, single-point, NaN, and zero-variance series.
- `backtestForecast` returns `{ mape: null, mae: number, holdoutCount: 0, method: "none" }` on tiny series and never throws.
- Backtest MAPE on a known synthetic series matches a hand-computed expected value.

Target: 6 new tests, total 47 passing.

**4. Documentation & policy updates (atomic, same response as code)**

- `DOCUMENTATION.md` — append Phase 11 section describing helpers, UI, holdout convention, and the unchanged "no schema, no persistence" boundary. Add Version History entry.
- `POLICY.md` — extend the existing Phase 9 "Forecast Display Governance" with one paragraph for Phase 11: backtest accuracy figures (MAPE/MAE) are themselves display-only artifacts, MUST NOT be persisted to `kpi_definitions`, `report_deliveries`, or audit logs, and MUST NOT appear in CSV-of-series exports. Add Policy Change Log entry.

### Pre-Implementation Risk & Impact Report

- **Data Impact**: None. No schema changes, no migrations, no new tables, no RLS edits. `kpi_pins`, `kpi_definitions`, `report_deliveries`, `audit_logs` all untouched.
- **Workflow Impact**: None. Permissions, roles, RPCs, edge functions unchanged. Forecast UI is visible to anyone who can already open the drawer.
- **UI/UX Impact**: One existing tab gains controls. No new routes, no nav changes. Same dashed-line styling on the chart.
- **Regression Risk**: Low and contained.
  - `KpiDetailDrawer` rerenders when horizon/seasonality changes — both `forecastSeasonal` and `backtestForecast` are wrapped in `useMemo` keyed on `[series, horizon, seasonalityMode]`, matching the existing `forecastPoints` pattern.
  - `forecastLinear` is unchanged and re-exported, so all 41 existing tests still pass.
  - Recharts handles longer dashed lines fine; no library bump.
- **Mitigation**: New tests cover the new helpers; manual QA flow is "open drawer → switch horizons → confirm chart redraws and accuracy badge updates."

### Out of Scope (deferred — call out explicitly)

- Server-side forecasting in `compute_kpi` (would violate the display-only boundary).
- Forecasts in scheduled digests / `report_deliveries`.
- Confidence intervals / prediction bands (Recharts Area overlay is doable but adds visual noise; defer until users ask).
- Anomaly detection (separate feature, separate phase).
- Holt-Winters / ARIMA / Prophet (overkill for daily plant data without a real forecasting need that the simple seasonal-naive model can't serve).
- Per-shift (intra-day) seasonality — current series are already daily-bucketed by `compute_kpi`; intra-day would require new RPCs.

### Pushback I want on the record

- **Decision 1b (monthly seasonality)** I recommend against right now. With the default 30-day window in `compute_kpi` callers, almost no series will hit the 60-point engagement threshold, so the code path will exist but never run for real users. Add it the day we add 90-day windows.
- **Decision 3c (skip backtests)** I refuse to build silently. If you genuinely don't want them, say so explicitly and I'll add a one-line POLICY.md entry stating "no accuracy readout is shown" so the omission is intentional rather than accidental.
- **Decision 2c (free numeric horizon)** I'd push back on. `forecastSeasonal` for `horizonDays > series.length` produces a number, but it's a number you should not show a shift manager. The 7/14/30 chips bound the foot-gun.

**Please confirm the 4 decisions above (or say "use defaults") before I proceed.**
