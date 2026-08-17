"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Plus, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { notify } from "@/lib/notify";
import { getLocation } from "@/lib/geolocation";

export default function ObservationsPage() {
  const { profile, activeSiteId, activeMembership, isSuperAdmin } = useAuth();
  const [observations, setObservations] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newPhotoFile, setNewPhotoFile] = useState(null);
  const [raiseError, setRaiseError] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (activeSiteId) load();
  }, [activeSiteId]);

  async function load() {
    setLoading(true);

    let query = supabase
      .from("observations")
      .select(
        "id, status, assigned_to, due_date, closed_at, closed_description, closed_photo_url, description, photo_url, answer_id, answers(notes, template_items(question)), users:assigned_to(full_name, email)"
      )
      .eq("site_id", activeSiteId)
      .order("created_at", { ascending: false });

    if (activeMembership?.role === "company_manager" && activeMembership.company_id) {
      query = query.eq("company_id", activeMembership.company_id);
    }

    const { data } = await query;
    setObservations(data || []);

    const { data: members } = await supabase
      .from("site_memberships")
      .select("user_id, users(full_name, email)")
      .eq("site_id", activeSiteId)
      .eq("status", "approved");

    let assignable = members || [];
    // Super admin access is synthetic (granted in AuthContext, not a real
    // site_memberships row), so add self here or the dropdown stays empty
    // for a super admin who hasn't separately requested/been granted this site.
    if (isSuperAdmin && profile && !assignable.some((m) => m.user_id === profile.id)) {
      assignable = [
        { user_id: profile.id, users: { full_name: profile.full_name, email: profile.email } },
        ...assignable,
      ];
    }
    setAssignableUsers(assignable);

    setLoading(false);
  }

  async function handleAssign(obsId, userId, dueDate) {
    setActionError("");
    const { error } = await supabase
      .from("observations")
      .update({ assigned_to: userId || null, due_date: dueDate || null })
      .eq("id", obsId);
    if (error) {
      setActionError(error.message);
      return;
    }
    if (userId) {
      notify({
        userId,
        type: "observation_assigned",
        title: "You've been assigned an observation",
        body: "Check what's needed and close it out.",
        link: "/observations",
      });
    }
    load();
  }

  async function uploadEvidencePhoto(path, file) {
    const { error: uploadErr } = await supabase.storage.from("evidence").upload(path, file);
    // Don't silently drop the photo on a storage failure — that would let an
    // observation get raised/closed "successfully" with its evidence missing.
    if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`);
    const { data: urlData } = supabase.storage.from("evidence").getPublicUrl(path);
    return urlData.publicUrl;
  }

  async function handleRaise() {
    setRaiseError("");
    if (!newDescription.trim()) {
      setRaiseError("Describe the observation.");
      return;
    }

    let photoUrl = null;
    try {
      if (newPhotoFile) {
        photoUrl = await uploadEvidencePhoto(`observations/new-${Date.now()}-${newPhotoFile.name}`, newPhotoFile);
      }
    } catch (e) {
      setRaiseError(e.message);
      return;
    }

    const { error } = await supabase.from("observations").insert({
      site_id: activeSiteId,
      company_id: activeMembership?.company_id || null,
      status: "open",
      description: newDescription.trim(),
      photo_url: photoUrl,
    });

    if (error) {
      setRaiseError(error.message);
      return;
    }

    setRaising(false);
    setNewDescription("");
    setNewPhotoFile(null);
    load();
  }

  async function handleClose(obsId, description, photoFile, includeLocation) {
    setActionError("");
    let photoUrl = null;
    try {
      if (photoFile) {
        photoUrl = await uploadEvidencePhoto(`observations/${obsId}-${photoFile.name}`, photoFile);
      }
    } catch (e) {
      setActionError(e.message);
      return;
    }

    const location = includeLocation ? await getLocation() : null;

    const { error } = await supabase
      .from("observations")
      .update({
        status: "closed",
        closed_description: description,
        closed_photo_url: photoUrl,
        closed_at: new Date().toISOString(),
        closed_latitude: location?.latitude ?? null,
        closed_longitude: location?.longitude ?? null,
      })
      .eq("id", obsId);
    if (error) {
      setActionError(error.message);
      return;
    }
    load();
  }

  if (!activeSiteId) {
    return <main className="p-6 text-sm text-slate-500">Select a site from the switcher above.</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Observations</h1>
        {!raising && (
          <button
            onClick={() => setRaising(true)}
            className="flex items-center gap-1 bg-slate-900 text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-800"
          >
            <Plus size={16} /> Raise observation
          </button>
        )}
      </div>

      {actionError && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">
          {actionError}
        </p>
      )}

      {raising && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-2">
          {raiseError && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {raiseError}
            </p>
          )}
          <textarea
            placeholder="What did you observe?"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer w-fit">
            <Camera size={14} />
            {newPhotoFile ? newPhotoFile.name : "Attach photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setNewPhotoFile(e.target.files?.[0] || null)}
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleRaise}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              Submit observation
            </button>
            <button
              onClick={() => {
                setRaising(false);
                setRaiseError("");
                setNewDescription("");
                setNewPhotoFile(null);
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && observations.length === 0 && (
        <p className="text-sm text-slate-500">No observations for this site.</p>
      )}

      <div className="space-y-3">
        {observations.map((o) => (
          <ObservationCard
            key={o.id}
            observation={o}
            assignableUsers={assignableUsers}
            currentUserId={profile?.id}
            onAssign={handleAssign}
            onClose={handleClose}
          />
        ))}
      </div>
    </main>
  );
}

function ObservationCard({ observation: o, assignableUsers, currentUserId, onAssign, onClose }) {
  const [assignee, setAssignee] = useState(o.assigned_to || "");
  const [dueDate, setDueDate] = useState(o.due_date || "");
  const [closing, setClosing] = useState(false);
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [includeLocation, setIncludeLocation] = useState(false);

  const isMine = o.assigned_to === currentUserId;
  const question = o.answers?.template_items?.question || "Standalone observation";
  const notes = o.description || o.answers?.notes;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
            {o.status === "open" && <AlertTriangle size={14} className="text-amber-500" />}
            {o.status === "closed" && <CheckCircle2 size={14} className="text-emerald-600" />}
            {question}
          </p>
          {notes && <p className="text-xs text-slate-500 mt-0.5">{notes}</p>}
          {o.photo_url && (
            <a href={o.photo_url} target="_blank" rel="noreferrer" className="text-xs text-amber-700 hover:underline">
              View photo
            </a>
          )}
        </div>
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full ${
            o.status === "open" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {o.status}
        </span>
      </div>

      {o.status === "open" && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="">Unassigned</option>
            {assignableUsers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.users?.full_name || m.users?.email}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
          />
          <button
            onClick={() => onAssign(o.id, assignee, dueDate)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            Save assignment
          </button>

          {isMine && !closing && (
            <button
              onClick={() => setClosing(true)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 ml-auto"
            >
              Close out
            </button>
          )}
        </div>
      )}

      {closing && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          <textarea
            placeholder="What did you do to close this out?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer w-fit">
            <Camera size={14} />
            {photoFile ? photoFile.name : "Attach photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer w-fit">
            <input type="checkbox" checked={includeLocation} onChange={(e) => setIncludeLocation(e.target.checked)} />
            <MapPin size={13} /> Include my current location
          </label>
          <button
            onClick={() => onClose(o.id, description, photoFile, includeLocation)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Submit and close
          </button>
        </div>
      )}

      {o.status === "closed" && (
        <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          {o.closed_description}
          {o.closed_photo_url && (
            <a href={o.closed_photo_url} target="_blank" rel="noreferrer" className="text-amber-700 ml-2 hover:underline">
              View photo
            </a>
          )}
        </div>
      )}
    </div>
  );
}
