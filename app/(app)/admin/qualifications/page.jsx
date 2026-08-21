"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const EXPERIENCE_LEVELS = ["apprentice", "skilled", "supervisor", "manager"];

export default function QualificationsAdminPage() {
  const { isSuperAdmin } = useAuth();
  const [schemes, setSchemes] = useState([]);
  const [cardTypes, setCardTypes] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newSchemeName, setNewSchemeName] = useState("");
  const [newCardType, setNewCardType] = useState({ scheme_id: "", label: "", level_rank: 0 });
  const [newRequirement, setNewRequirement] = useState({ trade: "", experience_level: "apprentice", required_card_type_id: "" });
  const [declarationTemplates, setDeclarationTemplates] = useState([]);
  const [newTemplate, setNewTemplate] = useState({ role_type: "employee", declaration_text: "" });

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true);
    const [{ data: schemeData }, { data: cardTypeData }, { data: reqData }, { data: templateData }] = await Promise.all([
      supabase.from("qualification_schemes").select("*").order("name"),
      supabase.from("qualification_card_types").select("*, qualification_schemes(name)").order("level_rank"),
      supabase.from("trade_qualification_requirements").select("*, qualification_card_types(label, qualification_schemes(name))").order("trade"),
      supabase.from("declaration_templates").select("*").order("role_type"),
    ]);
    setSchemes(schemeData || []);
    setCardTypes(cardTypeData || []);
    setRequirements(reqData || []);
    setDeclarationTemplates(templateData || []);
    setLoading(false);
  }

  async function addScheme(e) {
    e.preventDefault();
    if (!newSchemeName.trim()) return;
    const { error } = await supabase.from("qualification_schemes").insert({ name: newSchemeName.trim() });
    if (error) return alert(error.message);
    setNewSchemeName("");
    load();
  }

  async function deleteScheme(id) {
    if (!confirm("Delete this scheme? This also removes its card types and any requirements using them.")) return;
    const { error } = await supabase.from("qualification_schemes").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  async function addCardType(e) {
    e.preventDefault();
    if (!newCardType.scheme_id || !newCardType.label.trim()) return;
    const { error } = await supabase.from("qualification_card_types").insert({
      scheme_id: newCardType.scheme_id,
      label: newCardType.label.trim(),
      level_rank: Number(newCardType.level_rank) || 0,
    });
    if (error) return alert(error.message);
    setNewCardType({ scheme_id: "", label: "", level_rank: 0 });
    load();
  }

  async function deleteCardType(id) {
    if (!confirm("Delete this card type? This also removes any trade requirements using it.")) return;
    const { error } = await supabase.from("qualification_card_types").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  async function addRequirement(e) {
    e.preventDefault();
    if (!newRequirement.trade.trim() || !newRequirement.required_card_type_id) return;
    const { error } = await supabase.from("trade_qualification_requirements").insert({
      trade: newRequirement.trade.trim(),
      experience_level: newRequirement.experience_level,
      required_card_type_id: newRequirement.required_card_type_id,
    });
    if (error) return alert(error.message);
    setNewRequirement({ trade: "", experience_level: "apprentice", required_card_type_id: "" });
    load();
  }

  async function deleteRequirement(id) {
    const { error } = await supabase.from("trade_qualification_requirements").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  async function addTemplate(e) {
    e.preventDefault();
    if (!newTemplate.declaration_text.trim()) return;
    const { error } = await supabase.from("declaration_templates").insert({
      role_type: newTemplate.role_type,
      declaration_text: newTemplate.declaration_text.trim(),
    });
    if (error) return alert(error.message);
    setNewTemplate({ role_type: "employee", declaration_text: "" });
    load();
  }

  async function deleteTemplate(id) {
    const { error } = await supabase.from("declaration_templates").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Qualifications & induction rules</h1>
        <p className="text-sm text-slate-500">
          Configure the card schemes, card types, and trade-based rules used by the site induction process.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          {/* Schemes */}
          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Qualification schemes</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 mb-3">
              {schemes.length === 0 && <p className="text-sm text-slate-400">No schemes yet.</p>}
              {schemes.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                  <span className="text-slate-800">{s.name}</span>
                  <button onClick={() => deleteScheme(s.id)} className="text-slate-400 hover:text-rose-600" aria-label="Delete scheme">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={addScheme} className="flex gap-2">
              <input
                placeholder="e.g. CSCS"
                value={newSchemeName}
                onChange={(e) => setNewSchemeName(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
                Add scheme
              </button>
            </form>
          </section>

          {/* Card types */}
          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Card types</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 mb-3">
              {cardTypes.length === 0 && <p className="text-sm text-slate-400">No card types yet.</p>}
              {cardTypes.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                  <span className="text-slate-800">
                    {c.qualification_schemes?.name} — {c.label}{" "}
                    <span className="text-xs text-slate-400">(level {c.level_rank})</span>
                  </span>
                  <button onClick={() => deleteCardType(c.id)} className="text-slate-400 hover:text-rose-600" aria-label="Delete card type">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={addCardType} className="flex flex-wrap gap-2">
              <select
                value={newCardType.scheme_id}
                onChange={(e) => setNewCardType((p) => ({ ...p, scheme_id: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Scheme...</option>
                {schemes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                placeholder="e.g. Gold - Supervisor"
                value={newCardType.label}
                onChange={(e) => setNewCardType((p) => ({ ...p, label: e.target.value }))}
                className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Level"
                value={newCardType.level_rank}
                onChange={(e) => setNewCardType((p) => ({ ...p, level_rank: e.target.value }))}
                className="w-20 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
                Add card type
              </button>
            </form>
          </section>

          {/* Trade requirements */}
          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Trade requirements</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 mb-3">
              {requirements.length === 0 && <p className="text-sm text-slate-400">No requirements yet.</p>}
              {requirements.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                  <span className="text-slate-800">
                    {r.trade} <span className="text-xs text-slate-400">({r.experience_level})</span> requires{" "}
                    <span className="font-medium">
                      {r.qualification_card_types?.qualification_schemes?.name} {r.qualification_card_types?.label}
                    </span>
                  </span>
                  <button onClick={() => deleteRequirement(r.id)} className="text-slate-400 hover:text-rose-600" aria-label="Delete requirement">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={addRequirement} className="flex flex-wrap gap-2">
              <input
                placeholder="Trade, e.g. Plasterer"
                value={newRequirement.trade}
                onChange={(e) => setNewRequirement((p) => ({ ...p, trade: e.target.value }))}
                className="flex-1 min-w-[140px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={newRequirement.experience_level}
                onChange={(e) => setNewRequirement((p) => ({ ...p, experience_level: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {EXPERIENCE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
              <select
                value={newRequirement.required_card_type_id}
                onChange={(e) => setNewRequirement((p) => ({ ...p, required_card_type_id: e.target.value }))}
                className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Required card type...</option>
                {cardTypes.map((c) => (
                  <option key={c.id} value={c.id}>{c.qualification_schemes?.name} — {c.label}</option>
                ))}
              </select>
              <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
                Add requirement
              </button>
            </form>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Declaration templates</h2>
            <p className="text-xs text-slate-400 mb-2">Standard wording, used by every site — sites choose which apply, they can't edit the text.</p>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 mb-3">
              {declarationTemplates.length === 0 && <p className="text-sm text-slate-400">No declaration templates yet.</p>}
              {declarationTemplates.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                  <span className="text-slate-800">
                    <span className="text-xs uppercase text-slate-400 mr-2">{t.role_type}</span>
                    {t.declaration_text}
                  </span>
                  <button onClick={() => deleteTemplate(t.id)} className="text-slate-400 hover:text-rose-600 shrink-0" aria-label="Delete template">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={addTemplate} className="space-y-2">
              <select
                value={newTemplate.role_type}
                onChange={(e) => setNewTemplate((p) => ({ ...p, role_type: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="employee">employee</option>
                <option value="supervisor">supervisor</option>
                <option value="plant_operator">plant_operator</option>
              </select>
              <textarea
                placeholder="e.g. I hereby declare that I am qualified and fit to operate plant and machinery, and I understand that I must complete my pre-use checks."
                value={newTemplate.declaration_text}
                onChange={(e) => setNewTemplate((p) => ({ ...p, declaration_text: e.target.value }))}
                rows={2}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
                Add declaration template
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
