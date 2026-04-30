// Admin-only: invite/create a new user via service role.
// Caller must hold 'admin' or 'super_admin'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  password?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller's role
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
    const callerId = userRes.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (roleErr) return json({ error: roleErr.message }, 500);
    const isAdmin = (roles ?? []).some((r) =>
      r.role === "admin" || r.role === "super_admin"
    );
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body?.email || typeof body.email !== "string") {
      return json({ error: "email_required" }, 400);
    }

    // Create auth user (auto-confirmed; admin invite flow)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password ?? crypto.randomUUID() + "Aa1!",
      email_confirm: true,
      user_metadata: { display_name: body.displayName ?? body.email.split("@")[0] },
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? "create_failed" }, 400);
    }

    // Trigger handle_new_user_profile creates profile + default role.
    // Patch optional profile fields.
    if (body.department || body.jobTitle || body.displayName) {
      await admin.from("profiles").update({
        display_name: body.displayName ?? null,
        department: body.department ?? null,
        job_title: body.jobTitle ?? null,
      }).eq("user_id", created.user.id);
    }

    await admin.from("audit_logs").insert({
      actor_user_id: callerId,
      entity_type: "user",
      entity_id: created.user.id,
      action: "user.created",
      change_summary: { email: body.email },
    });

    return json({ ok: true, userId: created.user.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
