alter table notification_preferences add column if not exists email_enabled boolean not null default true;
