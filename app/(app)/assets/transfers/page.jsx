"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function AssetTransfersPage() {
  const { profile, activeSiteId, memberships } = useAuth();

  const [assets, setAssets] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [assetId, setAssetId] = useState("");
  const [destinationSiteId, setDestinationSiteId] = useState("");
  const [newReferenceNumber, setNewReferenceNumber] = useState("");
  const [requesting, setRequesting] = useState(false);

  const [decidingId, setDecidingId] = useState(null);
  const [comment, setComment] = useState("");

  // Other sites this person is approved on — you can only request a
  // transfer to somewhere you're actually registered, same rule as
  // observation reassignment.
  const otherSites = memberships.filter((m) => m.site_id !== activeSiteId);

  useEffect(() => {
    if (activeSiteId) load();
  }, [activeSiteId]);

  async function load() {
    setLoading(true);
    setError("");

    const [{ data: assetData }, { data: incomingData }, { data: outgoingData }] = await Promise.all([
      supabase
        .from("assets")
        .select("id, reference_number, serial_number, asset_types(name)")
        .eq("site_id", activeSiteId)
        .is("archived_at", null),
      supabase
        .from("asset_transfers")
        .select(
          "id, new_reference_number, created_at, requested_by, assets(reference_number, serial_number, asset_types(name)), from_site:sites!from_site_id(name), users:requested_by(full_name, email)"
        )
        .eq("to_site_id", activeSiteId)
        .eq("status", "pending"),
      supabase
        .from("asset_transfers")
        .select(
          "id, status, created_at, reviewer_comment, assets(reference_number, serial_number), to_site:sites!to_site_id(name)"
        )
        .eq("from_site_id", activeSiteId)
        .order("created_at", { ascending: false }),
    ]);

    setAssets(assetData || []);
    setIncoming(incomingData || []);
    setOutgoing(outgoingData || []);
    setLoading(false);
  }

  async function handleRequest() {
    setError("");
    if (!assetId || !destinationSiteId) {
      setError("Choose an asset and a destination site.");
      return;
    }
    setRequesting(true);
    const { error: insertErr } = await supabase.from("asset_transfers").insert({
      asset_id: assetId,
      from_site_id: activeSiteId,
      to_site_id: destinationSiteId,
      new_reference_number: newReferenceNumber.trim() || null,
      requested_by: profile.id,
      status: "pending",
    });
    setRequesting(false);

    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setAssetId("");
    setDestinationSiteId("");
    setNewReferenceNumber("");
    load();
  }

  async function handleDecision(transferId, decision) {
    setError("");
    const { error: rpcErr } = await supabase.rpc("decide_asset_transfer", {
      transfer_id: transferId,
      decision,
      comment: comment.trim() || null,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setDecidingId(null);
    setComment("");
    load();
  }

  if (!activeSiteId) {
    return <main className="p-6 text-sm text-slate-500">Select a site from the switcher above.</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Asset transfers</h1>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Request a new transfer */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Request a transfer</h2>
        {otherSites.length === 0 ? (
          <p className="text-xs text-slate-400">
            You're not approved on any other site, so there's nowhere to transfer an asset to yet.
          </p>
        ) : (
          <div className="grid sm:grid-cols-3 gap-2">
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">Select an asset</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.reference_number} — {a.asset_types?.name}
                </option>
              ))}
            </select>
            <select
              value={destinationSiteId}
              onChange={(e) => setDestinationSiteId(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">Destination site</option>
              {otherSites.map((m) => (
                <option key={m.site_id} value={m.site_id}>{m.site_name}</option>
              ))}
            </select>
            <input
              value={newReferenceNumber}
              onChange={(e) => setNewReferenceNumber(e.target.value)}
              placeholder="New ref. number (optional)"
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
        )}
        {otherSites.length > 0 && (
          <button
            onClick={handleRequest}
            disabled={requesting}
            className="mt-3 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {requesting ? "Requesting..." : "Request transfer"}
          </button>
        )}
      </section>

      {/* Incoming — needs my decision */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Incoming requests awaiting your review</h2>
        {!loading && incoming.length === 0 && <p className="text-xs text-slate-400">Nothing pending.</p>}
        <div className="space-y-3">
          {incoming.map((t) => (
            <div key={t.id} className="border border-slate-100 rounded-lg p-3">
              <p className="text-sm font-medium text-slate-800 flex items-center gap-1 flex-wrap">
                {t.assets?.reference_number} ({t.assets?.asset_types?.name})
                <span className="text-slate-400 flex items-center gap-1">
                  <ArrowRight size={12} /> {t.from_site?.name}
                </span>
              </p>
              <p className="text-xs text-slate-500 mb-2">
                Requested by {t.users?.full_name || t.users?.email}
                {t.new_reference_number && ` · new ref: ${t.new_reference_number}`}
              </p>

              {decidingId === t.id ? (
                <div className="space-y-2">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Optional comment"
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecision(t.id, "accepted")}
                      className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Check size={13} /> Accept
                    </button>
                    <button
                      onClick={() => handleDecision(t.id, "rejected")}
                      className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                    >
                      <X size={13} /> Reject
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setDecidingId(t.id)}
                  className="text-xs font-medium text-amber-700 hover:text-amber-800"
                >
                  Review
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Outgoing — my own requests, any status */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Your outgoing requests</h2>
        {!loading && outgoing.length === 0 && <p className="text-xs text-slate-400">No transfer requests yet.</p>}
        <div className="space-y-2">
          {outgoing.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
              <span>
                {t.assets?.reference_number} <ArrowRight size={11} className="inline text-slate-400 mx-1" /> {t.to_site?.name}
              </span>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  t.status === "pending"
                    ? "bg-amber-100 text-amber-700"
                    : t.status === "accepted"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                {t.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
