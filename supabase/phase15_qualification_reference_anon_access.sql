-- Phase 15: anonymous read access for qualification card type/scheme
-- names, needed so the /join flow's "this role requires..." banner can
-- actually show the card name to a visitor who isn't logged in yet.

create policy "Anyone can view qualification card types" on qualification_card_types
  for select using (true);

create policy "Anyone can view qualification schemes" on qualification_schemes
  for select using (true);
