-- Phase 47 (ATOMIC): ordinary guided-drafting questions, all three standards.
--
-- Rebuilt from the reviewed content. Single DO block = one statement, one
-- execution, one connection. Any RAISE EXCEPTION rolls back the whole block.
-- If it completes, it is committed. Do NOT add BEGIN/COMMIT. Run once, whole
-- file, nothing highlighted.
--
-- Steps inside the block:
--   1. Load all 146 rows into a temp table (auto-dropped).
--   2. Assert the loaded row counts: 45001=50, 9001=59, 14001=37.
--   3. Preflight: every (standard, clause_reference) in the rows must exist
--      in iso_clauses. Lists any that don't, then aborts.
--   4. Double-run guard: abort if any ordinary (non-stop-trigger) questions exist.
--   5. Insert, then assert 146 inserted and per-standard counts match.
-- Success is signalled by a NOTICE, which the SQL Editor may not display.
-- ALWAYS verify with the count query afterwards.

DO $phase47$
DECLARE
  v_loaded_45001 int;
  v_loaded_9001  int;
  v_loaded_14001 int;
  v_missing      text;
  v_existing     int;
  v_inserted     int;
  v_final_45001  int;
  v_final_9001   int;
  v_final_14001  int;
BEGIN
  CREATE TEMP TABLE _p47 (
    code             text NOT NULL,
    clause_reference text NOT NULL,
    prompt           text NOT NULL,
    help_text        text,
    input_type       text NOT NULL,
    sort_order       int  NOT NULL
  ) ON COMMIT DROP;

  -- ===================== 45001 =====================
  INSERT INTO _p47 (code, clause_reference, prompt, help_text, input_type, sort_order)
  SELECT '45001', v.clause_reference, v.prompt, v.help_text, v.input_type, v.sort_order
  FROM (VALUES
  ('4.1', 'What are the main external issues (legal, market, supply chain) that could affect your ability to prevent work-related injury and ill health?', NULL, 'textarea', 1),
  ('4.1', 'What internal issues (workforce turnover, site changes, culture) affect this?', NULL, 'textarea', 2),
  ('4.2', 'List the interested parties relevant to your OH&S performance (workers, contractors, regulators, insurers, clients, neighbours).', NULL, 'textarea', 1),
  ('4.2', 'Which of their expectations are legal requirements you must meet, versus ones you''ve chosen to commit to?', NULL, 'textarea', 2),
  ('4.3', 'Which sites, activities and people does this management system cover?', NULL, 'textarea', 1),
  ('4.3', 'Is there anything you''re deliberately excluding from scope? If so, why?', NULL, 'textarea', 2),
  ('4.4', 'Describe, in outline, the processes that make up your management system and how they connect.', NULL, 'textarea', 1),
  ('5.1', 'How does top management demonstrate visible commitment to health and safety (resourcing, communication, involvement)?', NULL, 'textarea', 1),
  ('5.1', 'How are workers protected from reprisal when they raise a concern?', NULL, 'textarea', 2),
  ('5.2', 'Paste or summarise your current health and safety policy.', NULL, 'textarea', 1),
  ('5.2', 'How and where is it communicated to workers and other interested parties?', NULL, 'text', 2),
  ('5.2', 'Does the policy commit to eliminating hazards and reducing risk (using the hierarchy of controls), complying with legal and other requirements, and continual improvement of the management system? Note any of these that aren''t covered.', NULL, 'textarea', 3),
  ('5.3', 'Who holds responsibility and authority for each part of the management system, and is this written down?', 'This records who the client says holds responsibility — it does not assign or confirm a duty holder appointment.', 'textarea', 1),
  ('5.4', 'How do non-managerial workers get involved in identifying hazards and choosing controls?', NULL, 'textarea', 1),
  ('5.4', 'What barriers to worker participation exist, and how are they addressed?', NULL, 'textarea', 2),
  ('6.1.1', 'What risks and opportunities did you identify that affect whether the management system achieves its aims?', NULL, 'textarea', 1),
  ('6.1.1', 'What potential emergency situations have you identified?', NULL, 'textarea', 2),
  ('6.1.2a', 'List the hazards you''ve identified. Does this cover routine work, non-routine/one-off work, past incidents, emergencies, hazards arising from how work is organised, and psychosocial hazards by name (workload, stress, bullying, violence)? Note any category you haven''t covered.', NULL, 'textarea', 1),
  ('6.1.2b', 'What method or criteria do you use to assess how risky each hazard is?', NULL, 'textarea', 1),
  ('6.1.2c', 'What opportunities to improve health and safety performance have you identified, separate from the risks?', NULL, 'textarea', 1),
  ('6.1.3', 'What''s your process for identifying and keeping track of the laws and regulations that apply to your hazards?', NULL, 'textarea', 1),
  ('6.1.3', 'List the current entries in your legal register.', NULL, 'textarea', 2),
  ('6.1.4', 'What actions have you planned to address the risks, opportunities and legal requirements identified above, and how will you know if they worked?', NULL, 'textarea', 1),
  ('6.2.1', 'List your health and safety objectives.', NULL, 'textarea', 1),
  ('6.2.1', 'For each objective, is it consistent with your policy, measurable, does it take account of your legal requirements and identified risks, and is it monitored and communicated? Note any objective missing one of these.', NULL, 'textarea', 2),
  ('6.2.2', 'For each objective: what will be done, who''s responsible, what resources are needed, and by when?', NULL, 'textarea', 1),
  ('7.1', 'What resources (people, equipment, time, budget) have you allocated to running the management system?', NULL, 'textarea', 1),
  ('7.2', 'How do you determine what competence workers need to identify hazards safely, and how do you evidence it (training records, qualifications, experience)?', NULL, 'textarea', 1),
  ('7.3', 'How do workers learn about the policy, their contribution to the system, and their right to remove themselves from imminent danger without reprisal?', NULL, 'textarea', 1),
  ('7.4.1', 'What''s your process for deciding what gets communicated about health and safety, to whom, and how?', NULL, 'textarea', 1),
  ('7.4.2', 'How is health and safety information shared between levels and teams, and how can workers feed back?', NULL, 'textarea', 1),
  ('7.4.3', 'What health and safety information do you communicate externally (to contractors, clients, principal designers, regulators)?', NULL, 'textarea', 1),
  ('7.5.1', 'Beyond what the standard requires, what other documents does your system rely on?', NULL, 'textarea', 1),
  ('7.5.2', 'Do your documents carry a title, date, author and reference number, and are they reviewed before use? Note any that don''t.', NULL, 'textarea', 1),
  ('7.5.3', 'How do you control access to documents, track versions, and protect them from loss or unauthorised change?', NULL, 'textarea', 1),
  ('8.1.1', 'How do you coordinate health and safety with other organisations working on the same site (e.g. other contractors)?', NULL, 'textarea', 1),
  ('8.1.1', 'What criteria or standards do you set for how work is carried out safely, and how do you check it''s actually being done that way?', NULL, 'textarea', 2),
  ('8.1.2', 'For your significant hazards, describe the controls in order: elimination, substitution, engineering, administrative, PPE. Note any hazard where you''ve gone straight to a lower-priority control without considering the ones above it.', NULL, 'textarea', 1),
  ('8.1.3', 'What''s your process for planning and controlling changes (new equipment, processes, legal changes) that could affect health and safety?', NULL, 'textarea', 1),
  ('8.1.4', 'How do you assess contractors before engaging them, and how do you make sure their workers meet your site''s health and safety standards?', NULL, 'textarea', 1),
  ('8.2', 'Describe your emergency response plan. When was it last tested or exercised, and what came out of that?', NULL, 'textarea', 1),
  ('9.1.1', 'What do you monitor and measure for health and safety performance, and how often?', NULL, 'textarea', 1),
  ('9.1.2', 'What''s your process and frequency for checking you''re meeting your legal requirements?', NULL, 'textarea', 1),
  ('9.2.1', 'How often do you conduct internal audits of the management system?', NULL, 'text', 1),
  ('9.2.2', 'How do you ensure impartiality when auditing your own management system as a sole practitioner?', NULL, 'textarea', 1),
  ('9.2.2', 'Who receives the audit findings, and how are they communicated to the workforce?', NULL, 'textarea', 2),
  ('9.3', 'When did you last review the management system''s performance, and what did that review cover (previous actions, changed risks, incidents, audit results, resource needs)? Note any of these you didn''t cover.', NULL, 'textarea', 1),
  ('10.1', 'What improvement opportunities have you identified, beyond fixing things that have already gone wrong?', NULL, 'textarea', 1),
  ('10.2', 'Describe the incident or nonconformity, the root cause you identified, the corrective action taken, and how you confirmed it worked.', NULL, 'textarea', 1),
  ('10.3', 'How has health and safety performance changed over time, and what''s driving that (culture, worker involvement, specific initiatives)?', NULL, 'textarea', 1)
  ) AS v(clause_reference, prompt, help_text, input_type, sort_order);

  -- ===================== 9001 =====================
  INSERT INTO _p47 (code, clause_reference, prompt, help_text, input_type, sort_order)
  SELECT '9001', v.clause_reference, v.prompt, v.help_text, v.input_type, v.sort_order
  FROM (VALUES
  ('4.1', 'What external and internal issues affect your ability to achieve the QMS''s intended results?', NULL, 'textarea', 1),
  ('4.2', 'List the interested parties relevant to your QMS and their requirements.', NULL, 'textarea', 1),
  ('4.3', 'What products, services, sites and functions does the QMS cover?', NULL, 'textarea', 1),
  ('4.3', 'Is anything excluded from scope, and why?', NULL, 'textarea', 2),
  ('4.4', 'Describe, in outline, the processes that make up your QMS and how they interact.', NULL, 'textarea', 1),
  ('5.1.1', 'How does top management demonstrate accountability for the QMS''s effectiveness?', NULL, 'textarea', 1),
  ('5.1.2', 'How do you ensure customer and legal requirements are determined, understood and consistently met?', NULL, 'textarea', 1),
  ('5.2.1', 'Paste or summarise your quality policy.', NULL, 'textarea', 1),
  ('5.2.1', 'Does it provide a framework for objectives, commit to satisfying requirements, and commit to continual improvement? Note any missing.', NULL, 'textarea', 2),
  ('5.2.2', 'How and where is the policy communicated internally and made available to interested parties?', NULL, 'text', 1),
  ('5.3', 'Who holds responsibility and authority for each part of the QMS, and is this written down?', NULL, 'textarea', 1),
  ('6.1', 'What risks and opportunities did you identify that affect the QMS''s ability to achieve its intended results?', NULL, 'textarea', 1),
  ('6.2', 'List your quality objectives.', NULL, 'textarea', 1),
  ('6.2', 'For each objective, is it consistent with the policy, measurable, relevant to conformity and customer satisfaction, monitored, communicated and updated? Note any missing.', NULL, 'textarea', 2),
  ('6.3', 'What''s your process for planning changes to the QMS, and what do you consider (purpose, consequences, resources, responsibilities)?', NULL, 'textarea', 1),
  ('7.1.1', 'What resources have you determined are needed to run the QMS, and what comes from external providers?', NULL, 'textarea', 1),
  ('7.1.2', 'How do you determine the people needed to operate the QMS effectively?', NULL, 'textarea', 1),
  ('7.1.3', 'What infrastructure (buildings, equipment, IT, transport) do you provide to achieve conforming products and services?', NULL, 'textarea', 1),
  ('7.1.4', 'What working environment factors (physical, social, psychological) do you manage to achieve conformity?', NULL, 'textarea', 1),
  ('7.1.5', 'What monitoring and measuring equipment do you use, and how do you ensure it''s calibrated or verified where traceability matters?', NULL, 'textarea', 1),
  ('7.1.6', 'What organisational knowledge is necessary for your processes, and how do you maintain and pass it on?', NULL, 'textarea', 1),
  ('7.2', 'How do you determine the competence needed for quality-critical roles, and how do you evidence it?', NULL, 'textarea', 1),
  ('7.3', 'How do people learn about the quality policy, relevant objectives, and the implications of not conforming?', NULL, 'textarea', 1),
  ('7.4', 'What''s your process for deciding what gets communicated about the QMS, to whom, and how?', NULL, 'textarea', 1),
  ('7.5.1', 'Beyond what the standard requires, what other documents does your QMS rely on?', NULL, 'textarea', 1),
  ('7.5.2', 'Do your documents carry a title, date, author and reference number, and are they reviewed and approved before use? Note any that don''t.', NULL, 'textarea', 1),
  ('7.5.3', 'How do you control access to documents, track versions, and protect records of conformity from unintended changes?', NULL, 'textarea', 1),
  ('8.1', 'How do you plan and control the processes needed to deliver conforming products and services?', NULL, 'textarea', 1),
  ('8.2.1', 'How do you communicate with customers (enquiries, orders, feedback, complaints)?', NULL, 'textarea', 1),
  ('8.2.2', 'How do you determine the statutory, regulatory and self-imposed requirements for what you offer, and confirm you can meet them?', NULL, 'textarea', 1),
  ('8.2.3', 'Before committing to supply, how do you review that requirements are defined and that you can meet them?', NULL, 'textarea', 1),
  ('8.2.4', 'When product or service requirements change, how do you update documentation and inform relevant people?', NULL, 'textarea', 1),
  ('8.3.1', 'Is design and development excluded from your scope under clause 4.3 (e.g. you deliver established processes rather than developing new products)? If not, describe your design and development process.', NULL, 'textarea', 1),
  ('8.3.2', 'What stages and controls does your design and development process include (reviews, verification, validation, responsibilities)?', NULL, 'textarea', 1),
  ('8.3.3', 'What requirements did you determine as essential inputs (functional/performance, prior experience, legal, standards, failure consequences)? Note any category not addressed.', NULL, 'textarea', 1),
  ('8.3.4', 'How do you review, verify and validate the design as it develops, and act on problems found?', NULL, 'textarea', 1),
  ('8.3.5', 'How do you confirm design outputs meet the original inputs before they''re used downstream?', NULL, 'textarea', 1),
  ('8.3.6', 'How do you identify, review and control changes made during or after design and development?', NULL, 'textarea', 1),
  ('8.4.1', 'How do you evaluate, select and monitor external providers (suppliers, subcontractors)?', NULL, 'textarea', 1),
  ('8.4.2', 'How do you decide how tightly to control a given supplier or subcontractor, based on the impact if they fail?', NULL, 'textarea', 1),
  ('8.4.3', 'What do you communicate to external providers about your requirements and how you''ll check on them?', NULL, 'textarea', 1),
  ('8.5.1', 'What controlled conditions govern your production or service delivery (documented characteristics, monitoring, competent people, error prevention)?', NULL, 'textarea', 1),
  ('8.5.2', 'Where it matters, how do you identify and track outputs through production (traceability)?', NULL, 'textarea', 1),
  ('8.5.3', 'How do you look after property belonging to customers or external providers while it''s in your care?', NULL, 'textarea', 1),
  ('8.5.4', 'How do you preserve outputs during production and delivery to prevent damage or degradation?', NULL, 'textarea', 1),
  ('8.5.5', 'What post-delivery activities (support, warranty, feedback handling) do you provide, and what drives what''s needed?', NULL, 'textarea', 1),
  ('8.5.6', 'How do you review and control changes to production or service delivery, and who authorises them?', NULL, 'textarea', 1),
  ('8.6', 'What checks happen before you release a product or service, and who can authorise release if those checks aren''t complete?', NULL, 'textarea', 1),
  ('8.7', 'How do you identify and control nonconforming outputs to prevent unintended use or delivery?', NULL, 'textarea', 1),
  ('9.1.1', 'What do you monitor and measure about the QMS''s performance, and how often?', NULL, 'textarea', 1),
  ('9.1.2', 'How do you obtain and review customers'' perceptions of whether their needs have been met?', NULL, 'textarea', 1),
  ('9.1.3', 'What does your analysis of this data show about conformity, customer satisfaction, and QMS performance?', NULL, 'textarea', 1),
  ('9.2', 'How often do you conduct internal audits of the QMS?', NULL, 'text', 1),
  ('9.3.1', 'When did you last review the QMS for continuing suitability, adequacy and effectiveness?', NULL, 'text', 1),
  ('9.3.2', 'What did that review cover — previous actions, changed issues, performance trends, nonconformities, audit results, resource adequacy? Note any of these you didn''t cover.', NULL, 'textarea', 1),
  ('9.3.3', 'What decisions or actions came out of the review (improvements, QMS changes, resource needs)?', NULL, 'textarea', 1),
  ('10.1', 'What improvement opportunities have you identified to better meet customer requirements and enhance satisfaction?', NULL, 'textarea', 1),
  ('10.2', 'Describe the nonconformity or complaint, the root cause you identified, the corrective action taken, and how you confirmed it worked.', NULL, 'textarea', 1),
  ('10.3', 'How has QMS performance changed over time, and what''s driving that?', NULL, 'textarea', 1)
  ) AS v(clause_reference, prompt, help_text, input_type, sort_order);

  -- ===================== 14001 =====================
  INSERT INTO _p47 (code, clause_reference, prompt, help_text, input_type, sort_order)
  SELECT '14001', v.clause_reference, v.prompt, v.help_text, v.input_type, v.sort_order
  FROM (VALUES
  ('4.1', 'What external and internal issues, including environmental conditions, affect your ability to achieve the EMS''s intended outcomes?', NULL, 'textarea', 1),
  ('4.2', 'List the interested parties relevant to your EMS, their requirements, and which become compliance obligations.', NULL, 'textarea', 1),
  ('4.3', 'What sites, activities, products and services does the EMS cover, and what''s within your control or influence?', NULL, 'textarea', 1),
  ('4.4', 'Describe, in outline, the processes that make up your EMS and how they interact.', NULL, 'textarea', 1),
  ('5.1', 'How does top management demonstrate accountability for the EMS''s effectiveness?', NULL, 'textarea', 1),
  ('5.2', 'Paste or summarise your environmental policy.', NULL, 'textarea', 1),
  ('5.2', 'Does it commit to protection of the environment (pollution prevention and any other relevant commitments), fulfilling compliance obligations, and continual improvement? Note any missing.', NULL, 'textarea', 2),
  ('5.3', 'Who holds responsibility and authority for each part of the EMS, and is this written down?', NULL, 'textarea', 1),
  ('6.1.1', 'What risks and opportunities, including potential emergency situations, did you identify for the EMS?', NULL, 'textarea', 1),
  ('6.1.2a', 'List the environmental aspects of your activities, products and services — what you control and what you can only influence. Does this cover the full life cycle (raw materials, production, transport/delivery, use, end-of-life)? Note any life-cycle stage you haven''t considered.', NULL, 'textarea', 1),
  ('6.1.2b', 'For each aspect, what''s the actual environmental impact it causes?', NULL, 'textarea', 1),
  ('6.1.2c', 'What criteria do you use to decide which aspects are significant?', 'This is your own judgement call — the standard doesn''t prescribe fixed criteria.', 'textarea', 1),
  ('6.1.3', 'What''s your process for identifying and keeping track of environmental permits, consents and regulations that apply?', NULL, 'textarea', 1),
  ('6.1.3', 'List the current entries in your compliance obligations register.', NULL, 'textarea', 2),
  ('6.1.4', 'What actions have you planned to address significant aspects, compliance obligations and identified risks?', NULL, 'textarea', 1),
  ('6.2.1', 'List your environmental objectives.', NULL, 'textarea', 1),
  ('6.2.1', 'For each objective, is it consistent with the policy, measurable, monitored and communicated, and does it take account of significant aspects and compliance obligations? Note any missing.', NULL, 'textarea', 2),
  ('6.2.2', 'For each objective: what will be done, who''s responsible, what resources are needed, and by when?', NULL, 'textarea', 1),
  ('7.1', 'What resources have you allocated to running the EMS?', NULL, 'textarea', 1),
  ('7.2', 'How do you determine the competence needed for roles affecting environmental performance, and how do you evidence it?', NULL, 'textarea', 1),
  ('7.3', 'How do people learn about the policy, the significant aspects of their own work, and the implications of not conforming?', NULL, 'textarea', 1),
  ('7.4.1', 'What''s your process for deciding what gets communicated about the EMS, to whom, and how?', NULL, 'textarea', 1),
  ('7.4.2', 'How is environmental information shared internally, and how can people feed back?', NULL, 'textarea', 1),
  ('7.4.3', 'What environmental information do you communicate externally, and what triggers it?', NULL, 'textarea', 1),
  ('7.5.1', 'Beyond what the standard requires, what other documents does your EMS rely on?', NULL, 'textarea', 1),
  ('7.5.2', 'Do your documents carry a title, date, author and reference number, and are they reviewed before use? Note any that don''t.', NULL, 'textarea', 1),
  ('7.5.3', 'How do you control access to documents, track versions, and protect them from loss or unauthorised change?', NULL, 'textarea', 1),
  ('8.1', 'How do you control processes and contractors to meet EMS requirements, and how do you consider life-cycle impact (design, procurement, transport, end-of-life)?', NULL, 'textarea', 1),
  ('8.2', 'Describe your emergency preparedness and response process. When was it last tested, and what came out of that?', NULL, 'textarea', 1),
  ('9.1.1', 'What do you monitor and measure for environmental performance, and how often?', NULL, 'textarea', 1),
  ('9.1.2', 'What''s your process and frequency for checking you''re meeting your compliance obligations?', NULL, 'textarea', 1),
  ('9.2.1', 'How often do you conduct internal audits of the EMS?', NULL, 'text', 1),
  ('9.2.2', 'How do you ensure impartiality when auditing your own EMS as a sole practitioner, and who receives the findings?', NULL, 'textarea', 1),
  ('9.3', 'When did you last review the EMS''s performance, and what did that review cover (previous actions, changed aspects, compliance status, audit results, complaints)? Note any of these you didn''t cover.', NULL, 'textarea', 1),
  ('10.1', 'What improvement opportunities have you identified for environmental performance, beyond fixing what''s already gone wrong?', NULL, 'textarea', 1),
  ('10.2', 'Describe the nonconformity, the root cause you identified, the corrective action taken, and how you confirmed it worked.', NULL, 'textarea', 1),
  ('10.3', 'How has environmental performance changed over time, and what''s driving that?', NULL, 'textarea', 1)
  ) AS v(clause_reference, prompt, help_text, input_type, sort_order);

  -- ---- Check 1: loaded row counts (catches transcription drift) ----
  SELECT count(*) FILTER (WHERE code = '45001'),
         count(*) FILTER (WHERE code = '9001'),
         count(*) FILTER (WHERE code = '14001')
    INTO v_loaded_45001, v_loaded_9001, v_loaded_14001
    FROM _p47;
  IF v_loaded_45001 <> 50 OR v_loaded_9001 <> 59 OR v_loaded_14001 <> 37 THEN
    RAISE EXCEPTION 'Phase 47 aborted: loaded rows 45001=% 9001=% 14001=% (expected 50/59/37). Nothing written.',
      v_loaded_45001, v_loaded_9001, v_loaded_14001;
  END IF;

  -- ---- Check 2: preflight. Every (standard, clause_reference) must exist ----
  SELECT string_agg(d.code || ' ' || d.clause_reference, ', ' ORDER BY d.code, d.clause_reference)
    INTO v_missing
    FROM (SELECT DISTINCT code, clause_reference FROM _p47) d
    LEFT JOIN public.iso_standards s ON s.code = d.code
    LEFT JOIN public.iso_clauses c
           ON c.standard_id = s.id AND c.clause_reference = d.clause_reference
   WHERE c.id IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 47 aborted: no matching iso_clauses row for: %. Nothing written.', v_missing;
  END IF;

  -- ---- Check 3: double-run guard ----
  SELECT count(*) INTO v_existing
    FROM public.iso_clause_questions
   WHERE is_stop_trigger = false;
  IF v_existing <> 0 THEN
    RAISE EXCEPTION 'Phase 47 aborted: % ordinary questions already exist. Nothing written.', v_existing;
  END IF;

  -- ---- Insert ----
  INSERT INTO public.iso_clause_questions
    (clause_id, prompt, help_text, input_type, is_stop_trigger, sort_order)
  SELECT c.id, p.prompt, p.help_text, p.input_type, false, p.sort_order
    FROM _p47 p
    JOIN public.iso_standards s ON s.code = p.code
    JOIN public.iso_clauses c
      ON c.standard_id = s.id AND c.clause_reference = p.clause_reference;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> 146 THEN
    RAISE EXCEPTION 'Phase 47 rolled back: inserted % rows, expected 146 (duplicate clause_reference in iso_clauses?).', v_inserted;
  END IF;

  -- ---- Check 4: per-standard counts in the table itself ----
  SELECT count(*) FILTER (WHERE s.code = '45001'),
         count(*) FILTER (WHERE s.code = '9001'),
         count(*) FILTER (WHERE s.code = '14001')
    INTO v_final_45001, v_final_9001, v_final_14001
    FROM public.iso_clause_questions q
    JOIN public.iso_clauses c ON c.id = q.clause_id
    JOIN public.iso_standards s ON s.id = c.standard_id
   WHERE q.is_stop_trigger = false;
  IF v_final_45001 <> 50 OR v_final_9001 <> 59 OR v_final_14001 <> 37 THEN
    RAISE EXCEPTION 'Phase 47 rolled back: per-standard counts 45001=% 9001=% 14001=% (expected 50/59/37).',
      v_final_45001, v_final_9001, v_final_14001;
  END IF;

  RAISE NOTICE 'Phase 47 succeeded: 146 ordinary questions inserted (45001=50, 9001=59, 14001=37).';
END
$phase47$;
