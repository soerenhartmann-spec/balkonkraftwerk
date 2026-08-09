-- Tabelle für Balkonkraftwerk Tracker
-- In Supabase: SQL Editor → New Query → ausführen → "Run without RLS"

create table if not exists bkw_monate (
  id              bigint generated always as identity primary key,
  jahr            integer not null,
  monat           integer not null,
  zaehler_start   numeric(10,2),
  zaehler_ende    numeric(10,2) not null,
  einsp_start     numeric(10,2),
  einsp_ende      numeric(10,2) not null,
  produziert      numeric(8,2) not null,
  ins_haus        numeric(8,2) not null,
  zum_speicher    numeric(8,2) default 0,
  strompreis      numeric(6,4) not null,
  kommentar       text default '',
  created_at      timestamptz default now(),
  unique(jahr, monat)
);

alter table bkw_monate disable row level security;
