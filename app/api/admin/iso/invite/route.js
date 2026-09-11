// FIRST IDENTITY-VERIFIED, PRIVILEGED ROUTE IN THIS CODEBASE — every other
// route under app/api/ is either public (gated only by possessing a server
// secret) or safe-to-fail-open (an AI suggestion, a notification email).
// This one creates/grants access to real user accounts, so it verifies the
// caller's Supabase session server-side (Authorization: Bearer <access_token>)
// and re-checks is_super_admin against the database via the service-role
// client — it never trusts anything the client claims about who it is or
// what it's allowed to do. SUPABASE_SERVICE_ROLE_KEY is server-only (no
// NEXT_PUBLIC_ prefix) and must never be referenced outside this file.

import { createClient } from "@supabase/supabase-js";

const VALID_ROLES = ["member", "restricted"];
const VALID_SECTIONS = ["documents", "audits", "actions", "risks", "contractors", "equipment", "meetings", "reports"];

export async function POST(request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set — refusing to process an invite.");
    return Response.json({ error: "Server is not configured for invites (missing service role key)." }, { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("NEXT_PUBLIC_SUPABASE_URL is not set.");
    return Response.json({ error: "Server is not configured (missing Supabase URL)." }, { status: 500 });
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Authenticate the caller ──────────────────────────────────────────
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return Response.json({ error: "Missing or invalid Authorization header." }, { status: 401 });
  }

  const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  const caller = callerData?.user;
  if (callerErr || !caller) {
    return Response.json({ error: "Your session is invalid or has expired. Please sign in again." }, { status: 401 });
  }

  // ── 2. Authorize: caller must be a super admin, checked server-side
  // against the database — never trust a client-supplied flag ────────────
  const { data: callerProfile, error: profileErr } = await supabaseAdmin
    .from("users")
    .select("is_super_admin")
    .eq("id", caller.id)
    .single();
  if (profileErr || !callerProfile?.is_super_admin) {
    return Response.json({ error: "Only Super Admins can invite ISO Excellence members." }, { status: 403 });
  }

  // ── 3. Validate input ────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { email, iso_organization_id, role, scopes } = body || {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return Response.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!iso_organization_id) {
    return Response.json({ error: "iso_organization_id is required." }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return Response.json({ error: `role must be one of: ${VALID_ROLES.join(", ")}.` }, { status: 400 });
  }
  const requestedScopes = Array.isArray(scopes) ? scopes : [];
  if (role === "restricted") {
    if (requestedScopes.length === 0) {
      return Response.json({ error: "At least one section is required for a restricted member." }, { status: 400 });
    }
    const invalidScopes = requestedScopes.filter((s) => !VALID_SECTIONS.includes(s));
    if (invalidScopes.length > 0) {
      return Response.json({ error: `Invalid section(s): ${invalidScopes.join(", ")}.` }, { status: 400 });
    }
  }

  const normalizedEmail = email.trim().toLowerCase();

  // ── 4. Find the existing public.users row for this email, or invite ────
  let targetUserId;
  try {
    const { data: existingUser, error: lookupErr } = await supabaseAdmin
      .from("users")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    if (lookupErr) throw lookupErr;

    if (existingUser) {
      targetUserId = existingUser.id;
    } else {
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail);
      if (inviteErr) throw inviteErr;
      targetUserId = inviteData?.user?.id;
      if (!targetUserId) throw new Error("Invite succeeded but no user id was returned.");
    }
  } catch (err) {
    console.error("ISO invite — user lookup/invite step failed:", err);
    return Response.json({ error: `Could not find or invite that user: ${err.message}` }, { status: 502 });
  }

  // ── 5. Insert the membership row ────────────────────────────────────────
  let membershipId;
  try {
    const { data: membership, error: membershipErr } = await supabaseAdmin
      .from("iso_organization_memberships")
      .insert({
        user_id: targetUserId,
        iso_organization_id,
        role,
        status: "approved",
        approved_by: caller.id,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (membershipErr) throw membershipErr;
    membershipId = membership.id;
  } catch (err) {
    console.error("ISO invite — membership insert step failed:", err);
    // A unique-constraint hit here almost always means this user already
    // has a membership row for this org — worth telling the caller that
    // specifically rather than a generic insert failure.
    const alreadyMember = err.code === "23505" || /duplicate key|unique constraint/i.test(err.message || "");
    return Response.json(
      {
        error: alreadyMember
          ? "This user already has a membership for this organization."
          : `The user account was found/created, but adding their membership failed: ${err.message}`,
      },
      { status: alreadyMember ? 409 : 502 }
    );
  }

  // ── 6. Insert scope rows (restricted role only) ─────────────────────────
  if (role === "restricted") {
    try {
      const { error: scopeErr } = await supabaseAdmin
        .from("iso_membership_scopes")
        .insert(requestedScopes.map((section) => ({ membership_id: membershipId, section })));
      if (scopeErr) throw scopeErr;
    } catch (err) {
      console.error("ISO invite — scope insert step failed:", err);
      return Response.json(
        {
          error: `The membership was created, but setting section access failed: ${err.message}. The member now has no section access — edit their scopes manually or remove and re-invite them.`,
        },
        { status: 502 }
      );
    }
  }

  return Response.json({ success: true, user_id: targetUserId, membership_id: membershipId });
}
