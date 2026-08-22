"use client";

import { useEffect, useState } from "react";
import { Plus, Truck, Camera, ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const ASSET_TYPE_CATEGORIES = [
  { value: "vehicle", label: "Vehicle" },
  { value: "tools_equipment", label: "Tools & Equipment" },
];

// thorough_exam_cert_path stores a bare storage path now that the
// "evidence" bucket is private — resolve a signed, time-limited URL on
// demand for anything we display.
async function resolveSignedUrl(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from("evidence").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

function expiryStatus(asset) {
  if (!asset.asset_types?.requires_thorough_exam) return null;
  if (!asset.thorough_exam_expiry) return { label: "Cert missing", classes: "bg-rose-100 text-rose-700" };

  const days = Math.floor((new Date(asset.thorough_exam_expiry) - new Date()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Expired", classes: "bg-rose-100 text-rose-700" };
  if (days <= 30) return { label: `Expires in ${days}d`, classes: "bg-amber-100 text-amber-700" };
  return { label: "Valid", classes: "bg-emerald-100 text-emerald-700" };
}

export default function AssetsPage() {
  const { activeSiteId, activeMembership } = useAuth();
  const [assets, setAssets] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [addingAsset, setAddingAsset] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [assetTypeId, setAssetTypeId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [powerOutput, setPowerOutput] = useState("");
  const [thoroughExamExpiry, setThoroughExamExpiry] = useState("");
  const [certFile, setCertFile] = useState(null);

  const selectedType = assetTypes.find((t) => t.id === assetTypeId);
  const examRequired = !!selectedType?.requires_thorough_exam;

  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeCategory, setNewTypeCategory] = useState("vehicle");
  const [newTypeRequiresExam, setNewTypeRequiresExam] = useState(false);

  useEffect(() => {
    if (activeSiteId) load();
  }, [activeSiteId]);

  async function load() {
    setLoading(true);
    setError("");

    let query = supabase
      .from("assets")
      .select("id, reference_number, serial_number, thorough_exam_expiry, thorough_exam_cert_path, asset_types(id, name, requires_thorough_exam)")
      .eq("site_id", activeSiteId)
      .is("archived_at", null)
      .order("reference_number");

    if (activeMembership?.role === "company_manager" && activeMembership.company_id) {
      query = query.eq("company_id", activeMembership.company_id);
    }

    const [{ data: assetData, error: assetErr }, { data: typeData, error: typeErr }] = await Promise.all([
      query,
      supabase.from("asset_types").select("id, name, category, requires_thorough_exam").order("name"),
    ]);

    if (assetErr || typeErr) {
      setError(assetErr?.message || typeErr?.message);
    } else {
      const withUrls = await Promise.all(
        (assetData || []).map(async (a) => ({ ...a, certSignedUrl: await resolveSignedUrl(a.thorough_exam_cert_path) }))
      );
      setAssets(withUrls);
      setAssetTypes(typeData || []);
      if (!assetTypeId && typeData?.length > 0) setAssetTypeId(typeData[0].id);
    }
    setLoading(false);
  }

  async function handleAddType() {
    setFormError("");
    if (!newTypeName.trim()) {
      setFormError("Give the asset type a name.");
      return;
    }

    const { data, error: insertErr } = await supabase
      .from("asset_types")
      .insert({ name: newTypeName.trim(), category: newTypeCategory, requires_thorough_exam: newTypeRequiresExam })
      .select()
      .single();

    if (insertErr) {
      setFormError(insertErr.message);
      return;
    }

    setAssetTypes((types) => [...types, data]);
    setAssetTypeId(data.id);
    setNewTypeName("");
    setNewTypeRequiresExam(false);
    setAddingType(false);
  }

  async function handleAddAsset() {
    setFormError("");
    if (!assetTypeId) {
      setFormError("Choose an asset type.");
      return;
    }
    if (!referenceNumber.trim() || !serialNumber.trim()) {
      setFormError("Reference number and serial number are required.");
      return;
    }
    if (examRequired && !thoroughExamExpiry) {
      setFormError("This asset type requires a thorough exam expiry date.");
      return;
    }
    if (examRequired && !certFile) {
      setFormError("This asset type requires a thorough exam certificate to be uploaded.");
      return;
    }

    setSaving(true);

    let certPath = null;
    if (certFile) {
      const path = `${activeSiteId}/assets/${referenceNumber.trim()}-${Date.now()}-${certFile.name}`;
      const { error: uploadErr } = await supabase.storage.from("evidence").upload(path, certFile);
      // Don't silently drop the cert on a storage failure — that would let an
      // asset requiring a valid exam get registered as if it were compliant.
      if (uploadErr) {
        setSaving(false);
        setFormError(`Certificate upload failed: ${uploadErr.message}`);
        return;
      }
      certPath = path;
    }

    const { error: insertErr } = await supabase.from("assets").insert({
      asset_type_id: assetTypeId,
      company_id: activeMembership?.company_id || null,
      site_id: activeSiteId,
      reference_number: referenceNumber.trim(),
      serial_number: serialNumber.trim(),
      power_output: powerOutput.trim() || null,
      thorough_exam_expiry: thoroughExamExpiry || null,
      thorough_exam_cert_path: certPath,
    });

    setSaving(false);
    if (insertErr) {
      setFormError(insertErr.message);
      return;
    }

    setAddingAsset(false);
    setReferenceNumber("");
    setSerialNumber("");
    setPowerOutput("");
    setThoroughExamExpiry("");
    setCertFile(null);
    load();
  }

  if (!activeSiteId) {
    return <main className="p-6 text-sm text-slate-500">Select a site from the switcher above.</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Assets</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/assets/transfers"
            className="flex items-center gap-1 text-sm text-slate-600 border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50"
          >
            <ArrowRightLeft size={16} /> Transfers
          </Link>
          {!addingAsset && (
            <button
              onClick={() => setAddingAsset(true)}
              className="flex items-center gap-1 bg-slate-900 text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-800"
            >
              <Plus size={16} /> Add asset
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {addingAsset && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-2">
          {formError && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <div>
            <label className="text-xs font-medium text-slate-500">Asset type</label>
            {assetTypes.length > 0 && !addingType && (
              <select
                value={assetTypeId}
                onChange={(e) => setAssetTypeId(e.target.value)}
                className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {assetTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {!addingType && (
              <button
                onClick={() => setAddingType(true)}
                className="text-xs font-medium text-slate-600 hover:text-slate-800 mt-1"
              >
                + Add new asset type
              </button>
            )}
          </div>

          {addingType && (
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
              <input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g. Dumper Truck"
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              />
              <select
                value={newTypeCategory}
                onChange={(e) => setNewTypeCategory(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              >
                {ASSET_TYPE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={newTypeRequiresExam}
                  onChange={(e) => setNewTypeRequiresExam(e.target.checked)}
                />
                Requires a thorough examination certificate
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleAddType}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                >
                  Save type
                </button>
                <button
                  onClick={() => setAddingType(false)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400">Reference number</label>
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. WH-014"
                className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Serial number</label>
              <input
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Power output (optional)</label>
              <input
                value={powerOutput}
                onChange={(e) => setPowerOutput(e.target.value)}
                className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            {examRequired && (
              <div>
                <label className="text-xs text-slate-400">Thorough exam expiry</label>
                <input
                  type="date"
                  value={thoroughExamExpiry}
                  onChange={(e) => setThoroughExamExpiry(e.target.value)}
                  className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
            )}
          </div>

          {examRequired && (
            <div>
              <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer w-fit">
                <Camera size={14} />
                {certFile ? certFile.name : "Upload thorough exam certificate (required)"}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleAddAsset}
              disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save asset"}
            </button>
            <button
              onClick={() => {
                setAddingAsset(false);
                setFormError("");
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && assets.length === 0 && (
        <p className="text-sm text-slate-500">No assets registered for this site.</p>
      )}

      <div className="space-y-3">
        {assets.map((a) => {
          const status = expiryStatus(a);
          return (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
                  <Truck size={14} className="text-slate-400" />
                  {a.reference_number}
                  <span className="text-slate-400 font-normal">— {a.asset_types?.name || "Unknown type"}</span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Serial: {a.serial_number}</p>
                {a.certSignedUrl && (
                  <a
                    href={a.certSignedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-amber-700 hover:underline"
                  >
                    View certificate
                  </a>
                )}
              </div>
              {status && (
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${status.classes}`}>{status.label}</span>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
