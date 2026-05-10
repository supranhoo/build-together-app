/**
 * CLU heat analysis (PR4).
 *
 * Calls Lovable AI Gateway (no external key needed) to summarise a heat:
 * recovery, deviations vs SOP, likely root causes, and operator suggestions.
 * Persists the result on `clu_heats.metadata.last_ai_analysis`.
 *
 * RLS is enforced by using the caller's JWT for both reads and the update;
 * the service role is never used.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";

interface Body {
  heatId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "ai_gateway_not_configured" }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.heatId || typeof body.heatId !== "string") {
      return json({ error: "heatId is required" }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);

    // Fetch heat + children via RLS-scoped client.
    const [heatRes, additionsRes, samplingRes, outputRes, blowingRes, delaysRes] =
      await Promise.all([
        userClient.from("clu_heats").select("*").eq("id", body.heatId).maybeSingle(),
        userClient.from("clu_additions").select("*").eq("heat_id", body.heatId),
        userClient.from("clu_sampling").select("*").eq("heat_id", body.heatId),
        userClient.from("clu_output").select("*").eq("heat_id", body.heatId).maybeSingle(),
        userClient.from("clu_blowing_data").select("*").eq("heat_id", body.heatId),
        userClient.from("clu_delays").select("*").eq("heat_id", body.heatId),
      ]);

    if (heatRes.error || !heatRes.data) {
      return json({ error: "heat_not_found" }, 404);
    }
    const heat = heatRes.data;

    const sopRes = await userClient
      .from("clu_sop_master")
      .select("*")
      .eq("profit_center_id", heat.profit_center_id)
      .eq("grade", heat.grade ?? "")
      .eq("is_active", true)
      .maybeSingle();

    const context = {
      heat: {
        heat_number: heat.heat_number,
        grade: heat.grade,
        heat_date: heat.heat_date,
        status: heat.status,
        powers: {
          tapping_mwh: heat.tapping_power_mwh,
          furnace_mwh: heat.furnace_power_mwh,
          aux_mwh: heat.auxiliary_power_mwh,
          pf: heat.avg_power_factor,
        },
      },
      sop: sopRes.data ?? null,
      additions: additionsRes.data ?? [],
      sampling: samplingRes.data ?? [],
      output: outputRes.data ?? null,
      blowing_ticks: (blowingRes.data ?? []).length,
      delays: delaysRes.data ?? [],
    };

    const aiRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a metallurgical process engineer for a Si-Mn / Fe-Mn CLU plant. " +
              "Given heat data (additions, sampling, output, SOP, delays, power), produce a concise report with: " +
              "1) Mn balance and recovery commentary, 2) deviations vs SOP, 3) likely root causes, " +
              "4) two or three operator actions for the next heat. Use short bullet points. Markdown only.",
          },
          { role: "user", content: JSON.stringify(context) },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ error: "rate_limited" }, 429);
    if (aiRes.status === 402) return json({ error: "ai_credits_exhausted" }, 402);
    if (!aiRes.ok) {
      const text = await aiRes.text();
      return json({ error: "ai_gateway_error", detail: text.slice(0, 500) }, 502);
    }

    const aiJson = await aiRes.json();
    const summary: string =
      aiJson?.choices?.[0]?.message?.content?.toString?.() ?? "";

    const nextMeta = {
      ...(heat.metadata ?? {}),
      last_ai_analysis: {
        summary,
        model: MODEL,
        generated_at: new Date().toISOString(),
        generated_by: userRes.user.id,
      },
    };

    const { error: upErr } = await userClient
      .from("clu_heats")
      .update({ metadata: nextMeta })
      .eq("id", body.heatId);
    if (upErr) return json({ error: "persist_failed", detail: upErr.message }, 500);

    return json({ summary, model: MODEL });
  } catch (e) {
    return json({ error: "internal", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
