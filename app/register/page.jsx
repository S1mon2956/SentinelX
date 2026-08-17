"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function RegisterPage() {
  const [step, setStep] = useState("account"); // 'account' | 'site' | 'done'
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sites, setSites] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only sites/companies the person can request access to are shown —
    // in production this query should exclude archived sites.
    supabase.from("sites").select("id, name").then(({ data }) => setSites(data || []));
    supabase.from("companies").select("id, name").then(({ data }) => setCompanies(data || []));
  }, []);

  async function handleCreateAccount(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    // The `users` table row is created via a Supabase database trigger on
    // auth.users insert (set that up in Supabase — not included in this
    // scaffold yet). For now we move straight to the site-request step.
    setStep("site");
  }

  async function handleRequestSite(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    // Without a confirmed session there's no auth.uid(), so the insert would
    // either be rejected by RLS or (under a permissive policy) silently create
    // an orphan row with user_id = null that shows up in the approvals queue
    // attached to nobody. Fail loudly instead.
    if (!userId) {
      setLoading(false);
      setError(
        "Your account isn't signed in yet — please confirm your email address, then sign in and request site access again."
      );
      return;
    }

    const { error } = await supabase.from("site_memberships").insert({
      user_id: userId,
      site_id: selectedSite,
      company_id: selectedCompany || null,
      role: "user",
      status: "pending",
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("done");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Create your account</h1>
        <p className="text-sm text-slate-500 mb-6">
          {step === "account" && "Step 1 of 2 — your details"}
          {step === "site" && "Step 2 of 2 — request site access"}
          {step === "done" && "You're all set"}
        </p>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        {step === "account" && (
          <form onSubmit={handleCreateAccount} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Full name</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Continue"}
            </button>
          </form>
        )}

        {step === "site" && (
          <form onSubmit={handleRequestSite} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Site</label>
              <select
                required
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select a site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Company (optional)</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">None / not sure</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-400">
              A site or company manager will need to approve this request before you can use the platform.
            </p>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Request access"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-600">
            Your request has been sent. You'll be able to sign in once a manager approves your
            access to that site. Check your email to confirm your address if prompted.
          </div>
        )}
      </div>
    </div>
  );
}
