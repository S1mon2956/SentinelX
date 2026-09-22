-- Phase 46: prevent duplicate answers per document/question pair
ALTER TABLE public.iso_document_answers
  ADD CONSTRAINT iso_document_answers_unique_per_question
  UNIQUE (iso_document_id, clause_question_id);
