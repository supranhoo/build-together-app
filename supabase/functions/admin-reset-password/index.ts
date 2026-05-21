// Admin-only: reset another user's password via service role.
// Caller must hold 'admin' or 'super_admin'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  userId: string;
  password: string;
}

// Mirrors src/lib/auth.ts validatePasswordStrength — server-side enforcement.
function validatePassword(pw: unknown): string | null {
  if (typeof pw !== "string") return "password_required";
  if (pw.length < 8) return "password_too_short";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "password_needs_letter_and_digit";
  if (pw.length > 72) return "password_too_long";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
    const callerId = userRes.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles, error: roleErr } = await admin
      .from("user_roles").select("role").eq("user_id", callerId);
    if (roleErr) return json({ error: roleErr.message }, 500);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body?.userId || typeof body.userId !== "string") {
      return json({ error: "userId_required" }, 400);
    }
    const pwErr = validatePassword(body.password);
    if (pwErr) return json({ error: pwErr }, 400);

    const { error: updateErr } = await admin.auth.admin.updateUserById(body.userId, {
      password: body.password,
    });
    if (updateErr) return json({ error: updateErr.message }, 400);

    await admin.from("audit_logs").insert({
      actor_user_id: callerId,
      entity_type: "user",
      entity_id: body.userId,
      action: "user.password_reset",
      change_summary: { userId: body.userId }, // never log the password itself
    });

    return json({ ok: true });
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
