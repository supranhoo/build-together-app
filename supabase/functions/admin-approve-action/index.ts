// Approve or reject a pending_approvals row and execute its payload server-side.
// Caller must be admin/super_admin AND not the original requester.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  approvalId: string;
  decision: "approve" | "reject";
  note?: string;
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
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "unauthorized" }, 401);
    const callerId = userRes.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
    const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
    const isAdmin = isSuper || (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body?.approvalId || (body.decision !== "approve" && body.decision !== "reject")) {
      return json({ error: "bad_request" }, 400);
    }

    const { data: row, error: rowErr } = await admin
      .from("pending_approvals")
      .select("*")
      .eq("id", body.approvalId)
      .single();
    if (rowErr || !row) return json({ error: "not_found" }, 404);
    if (row.requested_by === callerId) return json({ error: "self_approval_forbidden" }, 403);
    if (row.status !== "pending") return json({ error: "already_decided" }, 409);

    if (body.decision === "reject") {
      await admin.from("pending_approvals").update({
        status: "rejected",
        decided_by: callerId,
        decided_at: new Date().toISOString(),
        decision_note: body.note ?? null,
      }).eq("id", row.id);
      await audit(admin, callerId, row, "rejected", body.note);
      return json({ ok: true, status: "rejected" });
    }

    // Execute approved action
    const payload = row.payload as Record<string, unknown>;
    let execError: string | null = null;
    try {
      switch (row.action_type) {
        case "user.create": {
          const { error } = await admin.auth.admin.createUser({
            email: String(payload.email),
            password: String(payload.password ?? crypto.randomUUID() + "Aa1!"),
            email_confirm: true,
            user_metadata: { display_name: payload.displayName ?? null },
          });
          if (error) execError = error.message;
          break;
        }
        case "user.delete": {
          const userId = String(payload.userId);
          await admin.from("profiles").update({ is_active: false }).eq("user_id", userId);
          await admin.from("user_profit_centers").update({ is_active: false }).eq("user_id", userId);
          await admin.from("user_roles").delete().eq("user_id", userId);
          break;
        }
        case "role.grant": {
          const userId = String(payload.userId);
          const role = String(payload.role);
          // Privileged grants only by super_admin
          if ((role === "admin" || role === "super_admin") && !isSuper) {
            execError = "super_admin_required";
            break;
          }
          const { error } = await admin.from("user_roles").insert({ user_id: userId, role });
          if (error && !error.message.includes("duplicate")) execError = error.message;
          break;
        }
        case "role.revoke": {
          const userId = String(payload.userId);
          const role = String(payload.role);
          if ((role === "admin" || role === "super_admin") && !isSuper) {
            execError = "super_admin_required";
            break;
          }
          const { error } = await admin.from("user_roles").delete().eq("user_id", userId).eq("role", role);
          if (error) execError = error.message;
          break;
        }
        case "module.bulk_set": {
          const pcId = String(payload.profitCenterId);
          const updates = (payload.updates ?? []) as Array<{ moduleId: string; isEnabled: boolean }>;
          for (const u of updates) {
            const { error } = await admin.from("profit_center_modules").upsert(
              {
                profit_center_id: pcId,
                module_id: u.moduleId,
                is_enabled: u.isEnabled,
                sort_order: 0,
                is_default_entry: false,
              },
              { onConflict: "profit_center_id,module_id" },
            );
            if (error) { execError = error.message; break; }
          }
          break;
        }
        default:
          execError = "unknown_action";
      }
    } catch (e) {
      execError = (e as Error).message;
    }

    await admin.from("pending_approvals").update({
      status: execError ? "failed" : "executed",
      decided_by: callerId,
      decided_at: new Date().toISOString(),
      decision_note: execError ? `Failed: ${execError}` : (body.note ?? null),
    }).eq("id", row.id);

    await audit(admin, callerId, row, execError ? "execute_failed" : "executed", execError ?? body.note);

    if (execError) return json({ error: execError }, 400);
    return json({ ok: true, status: "executed" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function audit(admin: any, callerId: string, row: any, action: string, note?: string | null) {
  await admin.from("audit_logs").insert({
    actor_user_id: callerId,
    profit_center_id: row.profit_center_id ?? null,
    entity_type: "pending_approval",
    entity_id: row.id,
    action: `approval.${action}`,
    change_summary: { action_type: row.action_type, payload: row.payload, note: note ?? null },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
