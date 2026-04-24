// Scheduled report digest: invoked by pg_cron. Iterates active KPI subscriptions,
// computes the KPI for the appropriate window, sends a Resend email, and writes
// an immutable row to report_deliveries. Idempotent per (sub, cadence, day).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubRow {
  id: string;
  user_id: string;
  profit_center_id: string;
  kpi_definition_id: string;
  cadence: "daily" | "weekly";
}

interface KpiDef {
  id: string;
  key: string;
  display_name: string;
  unit: string;
}

function rangeFor(cadence: "daily" | "weekly", now: Date) {
  const to = new Date(now);
  const from = new Date(now);
  if (cadence === "daily") from.setUTCHours(from.getUTCHours() - 24);
  else from.setUTCDate(from.getUTCDate() - 7);
  return { from, to };
}

async function getRecipientEmail(admin: any, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return null;
  return data?.user?.email ?? null;
}

async function alreadySentToday(admin: any, sub: SubRow, today: string): Promise<boolean> {
  const { data, error } = await admin
    .from("report_deliveries")
    .select("id")
    .eq("user_id", sub.user_id)
    .eq("kpi_definition_id", sub.kpi_definition_id)
    .eq("cadence", sub.cadence)
    .eq("status", "sent")
    .gte("delivered_at", `${today}T00:00:00Z`)
    .lt("delivered_at", `${today}T23:59:59Z`)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_ADDRESS = Deno.env.get("REPORT_DIGEST_FROM") ?? "reports@onboarding.resend.dev";

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dow = now.getUTCDay(); // 1 = Monday

  // Today's cadences: daily always; weekly only on Monday.
  const cadences: Array<"daily" | "weekly"> = dow === 1 ? ["daily", "weekly"] : ["daily"];

  const { data: subs, error: subsErr } = await admin
    .from("kpi_subscriptions")
    .select("id,user_id,profit_center_id,kpi_definition_id,cadence")
    .in("cadence", cadences)
    .eq("is_active", true);

  if (subsErr) {
    return new Response(JSON.stringify({ error: subsErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const summary = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  for (const sub of (subs ?? []) as SubRow[]) {
    summary.processed++;

    if (await alreadySentToday(admin, sub, today)) {
      summary.skipped++;
      await admin.from("report_deliveries").insert({
        profit_center_id: sub.profit_center_id, user_id: sub.user_id,
        kpi_definition_id: sub.kpi_definition_id, cadence: sub.cadence,
        status: "skipped", payload: { reason: "duplicate_today" },
      });
      continue;
    }

    const { data: defRow } = await admin
      .from("kpi_definitions").select("id,key,display_name,unit").eq("id", sub.kpi_definition_id).maybeSingle();
    const def = defRow as KpiDef | null;
    if (!def) {
      summary.failed++;
      await admin.from("report_deliveries").insert({
        profit_center_id: sub.profit_center_id, user_id: sub.user_id,
        kpi_definition_id: sub.kpi_definition_id, cadence: sub.cadence,
        status: "failed", error_message: "kpi_definition_missing", payload: {},
      });
      continue;
    }

    const range = rangeFor(sub.cadence, now);
    const { data: kpiData, error: kpiErr } = await admin.rpc("compute_kpi", {
      _profit_center_id: sub.profit_center_id, _key: def.key,
      _from: range.from.toISOString(), _to: range.to.toISOString(),
    });
    if (kpiErr) {
      summary.failed++;
      await admin.from("report_deliveries").insert({
        profit_center_id: sub.profit_center_id, user_id: sub.user_id,
        kpi_definition_id: sub.kpi_definition_id, cadence: sub.cadence,
        status: "failed", error_message: kpiErr.message, payload: { key: def.key },
      });
      continue;
    }

    const value = (kpiData as any)?.value;
    const email = await getRecipientEmail(admin, sub.user_id);
    if (!email) {
      summary.failed++;
      await admin.from("report_deliveries").insert({
        profit_center_id: sub.profit_center_id, user_id: sub.user_id,
        kpi_definition_id: sub.kpi_definition_id, cadence: sub.cadence,
        status: "failed", error_message: "no_recipient_email", payload: { key: def.key, value },
      });
      continue;
    }

    if (!RESEND_API_KEY) {
      // No mailer configured — log as failed so it's visible to admins, but don't crash the loop.
      summary.failed++;
      await admin.from("report_deliveries").insert({
        profit_center_id: sub.profit_center_id, user_id: sub.user_id,
        kpi_definition_id: sub.kpi_definition_id, cadence: sub.cadence,
        status: "failed", error_message: "RESEND_API_KEY not configured",
        payload: { key: def.key, value, unit: def.unit },
      });
      continue;
    }

    const subject = `${def.display_name}: ${value ?? "—"}${def.unit ? " " + def.unit : ""} (${sub.cadence})`;
    const html = `<h2>${def.display_name}</h2>
      <p>Window: ${range.from.toISOString()} → ${range.to.toISOString()}</p>
      <p style="font-size:28px;font-weight:600">${value ?? "—"}${def.unit ? " " + def.unit : ""}</p>
      <p style="color:#666;font-size:12px">SteelFlow ERP scheduled digest</p>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [email], subject, html }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      summary.failed++;
      await admin.from("report_deliveries").insert({
        profit_center_id: sub.profit_center_id, user_id: sub.user_id,
        kpi_definition_id: sub.kpi_definition_id, cadence: sub.cadence,
        status: "failed", error_message: `resend_${resp.status}: ${errText.slice(0, 200)}`,
        payload: { key: def.key, value, unit: def.unit },
      });
      continue;
    }

    await resp.text();
    summary.sent++;
    await admin.from("report_deliveries").insert({
      profit_center_id: sub.profit_center_id, user_id: sub.user_id,
      kpi_definition_id: sub.kpi_definition_id, cadence: sub.cadence,
      status: "sent", payload: { key: def.key, value, unit: def.unit, to: email },
    });
  }

  return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
