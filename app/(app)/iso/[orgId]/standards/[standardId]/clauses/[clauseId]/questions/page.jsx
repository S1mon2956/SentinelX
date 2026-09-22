"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoDisclaimer from "@/components/IsoDisclaimer";
import IsoLoading from "@/components/IsoLoading";
import IsoBackLink from "@/components/IsoBackLink";
import { describeClauseTagError } from "@/lib/isoErrors";

// Placeholder only — Simon is providing the exact copy for what a client
// sees when a stop-trigger question halts the flow. Deliberately generic:
// no "we'll be in touch" or anything implying a consultant relationship
// is now active, since the tool has no way to know that's true.
const STOP_TRIGGER_MESSAGE =
  "This needs to be handled outside this tool before continuing here. Your answers so far have been saved.";

// Stop-trigger questions always come first, regardless of stored
// sort_order — the stop check has to happen before anything else in the
// clause is answerable. Within each group, ordinary sort_order applies.
function orderQuestions(questions) {
  return [...questions].sort((a, b) => {
    if (a.is_stop_trigger !== b.is_stop_trigger) return a.is_stop_trigger ? -1 : 1;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });
}

export default function IsoClauseQuestionsPage() {
  const { orgId, standardId, clauseId } = useParams();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clause, setClause] = useState(null);
  const [clauseActive, setClauseActive] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [documentId, setDocumentId] = useState(null);
  const [answers, setAnswers] = useState({}); // clause_question_id -> answer_text
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [orgId, clauseId]);

  async function load() {
    setLoading(true);
    const [
      { data: clauseData, error: clauseError },
      { data: questionData, error: questionError },
      { data: orgClauseData, error: orgClauseError },
    ] = await Promise.all([
      supabase.from("iso_clauses").select("*").eq("id", clauseId).single(),
      supabase.from("iso_clause_questions").select("*").eq("clause_id", clauseId),
      supabase
        .from("iso_organization_clauses")
        .select("is_active")
        .eq("iso_organization_id", orgId)
        .eq("clause_id", clauseId)
        .maybeSingle(),
    ]);
    const loadError = clauseError || questionError || orgClauseError;
    if (loadError) {
      console.error("Failed to load questions:", loadError.message);
      setError(loadError.message);
      setLoading(false);
      return;
    }
    setClause(clauseData || null);
    setClauseActive(!!orgClauseData?.is_active);
    setQuestions(orderQuestions(questionData || []));

    // Resume an existing in-progress draft for this clause, if one exists,
    // rather than starting a fresh one every visit.
    const { data: existingLinks } = await supabase
      .from("iso_document_clauses")
      .select("iso_documents(id, source, iso_organization_id)")
      .eq("clause_id", clauseId);
    const existingDoc = (existingLinks || [])
      .map((r) => r.iso_documents)
      .find((d) => d && d.source === "ai_draft" && d.iso_organization_id === orgId);

    if (existingDoc) {
      setDocumentId(existingDoc.id);
      const { data: answerRows } = await supabase
        .from("iso_document_answers")
        .select("clause_question_id, answer_text")
        .eq("iso_document_id", existingDoc.id);
      const map = {};
      (answerRows || []).forEach((a) => {
        map[a.clause_question_id] = a.answer_text;
      });
      setAnswers(map);
    }

    setLoading(false);
  }

  async function ensureDocument() {
    if (documentId) return documentId;

    const newDocId = crypto.randomUUID();
    const { error: insertError } = await supabase.from("iso_documents").insert({
      id: newDocId,
      iso_organization_id: orgId,
      title: `Guided answers — ${clause.clause_reference}`,
      document_type: "record",
      source: "ai_draft",
      uploaded_by: profile.id,
    });
    if (insertError) throw new Error(insertError.message);

    const { error: tagError } = await supabase
      .from("iso_document_clauses")
      .insert({ iso_document_id: newDocId, clause_id: clauseId });
    if (tagError) {
      await supabase.from("iso_documents").delete().eq("id", newDocId);
      throw new Error(describeClauseTagError(tagError));
    }

    setDocumentId(newDocId);
    return newDocId;
  }

  async function answerQuestion(question, value) {
    if (!profile?.id) return alert("Your profile hasn't finished loading yet — try again in a moment.");
    setSaving(true);
    try {
      const docId = await ensureDocument();

      const { data: existingAnswer } = await supabase
        .from("iso_document_answers")
        .select("id")
        .eq("iso_document_id", docId)
        .eq("clause_question_id", question.id)
        .maybeSingle();

      const { error: saveError } = existingAnswer
        ? await supabase.from("iso_document_answers").update({ answer_text: value }).eq("id", existingAnswer.id)
        : await supabase.from("iso_document_answers").insert({
            iso_document_id: docId,
            clause_question_id: question.id,
            answer_text: value,
          });
      if (saveError) throw new Error(saveError.message);

      setAnswers((prev) => ({ ...prev, [question.id]: value }));
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <IsoLoading />;
  if (error) return <main className="p-6 text-sm text-rose-600">Couldn't load questions: {error}</main>;

  const halted = questions.some((q) => q.is_stop_trigger && answers[q.id] === "yes");
  const currentQuestion = halted ? null : questions.find((q) => answers[q.id] === undefined);

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <IsoBackLink href={`/iso/${orgId}/standards/${standardId}/clauses/${clauseId}`}>Back to clause</IsoBackLink>
        <h1 className="text-xl font-semibold text-slate-800 mt-1">
          Guided questions — {clause?.clause_reference} {clause?.title}
        </h1>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        {!clauseActive && (
          <p className="text-sm text-slate-400">This clause isn't currently enrolled for your organisation.</p>
        )}

        {clauseActive && questions.length === 0 && (
          <p className="text-sm text-slate-400">No questions for this clause yet — check back later.</p>
        )}

        {clauseActive && questions.length > 0 && halted && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-rose-700">Stopped</p>
            <p className="text-sm text-slate-700">{STOP_TRIGGER_MESSAGE}</p>
          </div>
        )}

        {clauseActive && questions.length > 0 && !halted && currentQuestion && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-800">{currentQuestion.prompt}</p>
            {currentQuestion.help_text && <p className="text-xs text-slate-500">{currentQuestion.help_text}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => answerQuestion(currentQuestion, "yes")}
                disabled={saving}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Yes
              </button>
              <button
                onClick={() => answerQuestion(currentQuestion, "no")}
                disabled={saving}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                No
              </button>
            </div>
          </div>
        )}

        {clauseActive && questions.length > 0 && !halted && !currentQuestion && (
          <p className="text-sm text-slate-500">
            You've answered everything available for this clause so far. There aren't more questions to answer yet —
            check back as more are added.
          </p>
        )}
      </div>

      <IsoDisclaimer />
    </main>
  );
}
