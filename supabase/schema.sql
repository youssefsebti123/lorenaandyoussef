-- Lorena & Youssef — RSVP database (Supabase / Postgres).
-- Run in the Supabase SQL editor. Safe to re-run: it only adds what's missing and replaces functions/views.
--
-- Security model: the website only holds the public "publishable" key. Tables have RLS on with no policies and no
-- grants, so that key can't read or write them. The site can only call the functions granted at the bottom
-- (search_guests, guest_extras, guest_invite, submit_rsvp), which run with the owner's rights and expose nothing else.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_net;

/* ───────── Tables ───────── */

-- You edit this one (Table editor → guests).
--   plus_ones: 0 = none, 1 = a plus-one, 2+ = up to that many unnamed extra guests.
--   party:     invitation number — people with the same number are on the same invitation (from Joy).
create table if not exists public.guests (
  id        bigint generated always as identity primary key,
  first     text not null,
  last      text not null,
  plus_ones int  not null default 0 check (plus_ones between 0 and 10),
  notes     text not null default '',
  party     int
);
alter table public.guests add column if not exists party int;

-- One row per person coming (or not). Listed guests are matched on guest_id; anyone else on first + last + email.
-- Sending the form again updates the row. People ticked under "Who's coming with you?" get their own row.
create table if not exists public.rsvps (
  id                bigint generated always as identity primary key,
  submitted_at      timestamptz not null default now(),
  updated_at        timestamptz,
  first             text not null,
  last              text not null,
  email             text not null,
  thursday          text not null,
  friday            text not null,
  saturday          text not null,
  extra_guests      int,             -- null = this guest wasn't offered any
  guest_names       text not null default '',
  also_replying_for text not null default ''
);
alter table public.rsvps add column if not exists guest_id   bigint references public.guests (id) on delete set null;
alter table public.rsvps add column if not exists replied_by bigint references public.guests (id) on delete set null;
alter table public.rsvps add column if not exists added_by   text not null default ''; -- "Habib El Amrani" if he answered for this person
alter table public.rsvps drop column if exists dietary, drop column if exists thursday_notes; -- removed from the form
drop index if exists public.rsvps_person;
create unique index if not exists rsvps_guest on public.rsvps (guest_id) where guest_id is not null;

-- Every submission ever received, so nothing is lost when a reply is edited.
create table if not exists public.log (
  id                bigint generated always as identity primary key,
  received_at       timestamptz not null default now(),
  first text, last text, email text, thursday text, friday text, saturday text,
  extra_guests int, guest_names text, also_replying_for text
);
alter table public.log drop column if exists dietary, drop column if exists thursday_notes;
alter table public.log add column if not exists guest_id   bigint;
alter table public.log add column if not exists companions text;

alter table public.guests enable row level security;
alter table public.rsvps  enable row level security;
alter table public.log    enable row level security;
revoke all on public.guests, public.rsvps, public.log from anon, authenticated;

/* ───────── Headcount (Table editor → headcount / overview) ───────── */

create or replace view public.headcount with (security_invoker = on) as
  select 1 as sort, 'Thursday 6 May' as day,
         count(*) filter (where thursday = 'Attending') as guests,
         coalesce(sum(extra_guests) filter (where thursday = 'Attending'), 0) as extra_guests,
         count(*) filter (where thursday = 'Attending') + coalesce(sum(extra_guests) filter (where thursday = 'Attending'), 0) as total,
         count(*) filter (where thursday = 'Not attending') as not_attending
  from public.rsvps
  union all
  select 2, 'Friday 7 May',
         count(*) filter (where friday = 'Attending'),
         coalesce(sum(extra_guests) filter (where friday = 'Attending'), 0),
         count(*) filter (where friday = 'Attending') + coalesce(sum(extra_guests) filter (where friday = 'Attending'), 0),
         count(*) filter (where friday = 'Not attending')
  from public.rsvps
  union all
  select 3, 'Saturday 8 May',
         count(*) filter (where saturday = 'Attending'),
         coalesce(sum(extra_guests) filter (where saturday = 'Attending'), 0),
         count(*) filter (where saturday = 'Attending') + coalesce(sum(extra_guests) filter (where saturday = 'Attending'), 0),
         count(*) filter (where saturday = 'Not attending')
  from public.rsvps;

drop view if exists public.overview;
create view public.overview with (security_invoker = on) as
  select (select count(*) from public.rsvps)                     as replies_received,
         (select count(*) from public.guests)                    as guests_on_the_list,
         (select count(distinct party) from public.guests)       as invitations,
         (select coalesce(sum(plus_ones), 0) from public.guests) as extra_guests_offered,
         (select count(*) from public.guests g
           where not exists (select 1 from public.rsvps r where r.guest_id = g.id)) as not_replied_yet;

revoke all on public.headcount, public.overview from anon, authenticated;

/* ───────── Helpers (not callable from the website) ───────── */

-- "José  Pérez " → "jose perez"
create or replace function public.norm(s text) returns text
language sql stable set search_path = '' as $$
  select lower(regexp_replace(btrim(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(s, ''))), '\s+', ' ', 'g'))
$$;

create or replace function public.tidy(s text, max_len int) returns text
language sql immutable set search_path = '' as $$
  select left(regexp_replace(btrim(coalesce(s, '')), '\s+', ' ', 'g'), max_len)
$$;

revoke execute on function public.norm(text), public.tidy(text, int) from public, anon, authenticated;

/* ───────── What the website calls ───────── */

-- "Find your name": every word typed must start a word of the name ("lor magg" → Lorena Maggiorani).
-- Names only, max 10, and only once 3+ letters are typed.
create or replace function public.search_guests(q text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  words text[] := array_remove(string_to_array(public.norm(left(q, 80)), ' '), '');
  found json;
  n int;
begin
  if coalesce(length(array_to_string(words, '')), 0) < 3 then
    return json_build_object('matches', '[]'::json, 'more', false);
  end if;
  with hits as (
    select distinct on (public.norm(g.first || ' ' || g.last)) g.id, g.first, g.last
    from public.guests g
    where (select bool_and(exists (
             select 1 from unnest(string_to_array(public.norm(g.first || ' ' || g.last), ' ')) part
             where starts_with(part, w)))
           from unnest(words) w)
    order by public.norm(g.first || ' ' || g.last), g.id
  ), first11 as (select * from hits order by id limit 11)
  select coalesce(json_agg(json_build_object('first', f.first, 'last', f.last) order by f.id)
                    filter (where f.rn <= 10), '[]'::json),
         count(*)
    into found, n
  from (select *, row_number() over (order by id) rn from first11) f;
  return json_build_object('matches', found, 'more', n > 10);
end $$;

-- How many unnamed extra guests this name may bring (0 if not on the list).
create or replace function public.guest_extras(first text, last text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(max(g.plus_ones), 0) from public.guests g
  where public.norm(g.first || ' ' || g.last) = public.norm(guest_extras.first || ' ' || guest_extras.last)
    and public.norm(guest_extras.first) <> '' and public.norm(guest_extras.last) <> ''
$$;

-- For an exact listed name: their extra-guest allowance and the other named people on the same invitation.
create or replace function public.guest_invite(first text, last text) returns json
language sql stable security definer set search_path = '' as $$
  with me as (
    select g.id, g.party from public.guests g
    where public.norm(g.first || ' ' || g.last) = public.norm(guest_invite.first || ' ' || guest_invite.last)
      and public.norm(guest_invite.first) <> '' and public.norm(guest_invite.last) <> ''
    order by g.id limit 1)
  select json_build_object(
    'extras', public.guest_extras(guest_invite.first, guest_invite.last),
    'members', coalesce((select json_agg(json_build_object('first', o.first, 'last', o.last) order by o.id)
                         from public.guests o join me on o.party = me.party and o.id <> me.id), '[]'::json))
$$;

-- Save a reply. r = the form as JSON. Returns {ok, emailed, extrasAllowed, companions} or {ok:false, error}.
create or replace function public.submit_rsvp(r json) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_first text := public.tidy(r->>'first', 80);
  v_last  text := public.tidy(r->>'last', 80);
  v_email text := lower(public.tidy(r->>'email', 200));
  v_thu   text := r->>'thursday';
  v_fri   text := r->>'friday';
  v_sat   text := r->>'saturday';
  v_party text := public.tidy(r->>'party', 300);
  me public.guests;
  allowed int;
  v_extras int;
  v_names text[] := '{}';
  companion_ids bigint[] := '{}';
  companions_out jsonb := '[]';
  rec record;
  c_coming boolean;
  c_thu text;
  c_fri text;
  c_sat text;
  existing_id bigint;
  key text;
  summary text;
  emailed boolean := false;
begin
  if coalesce(r->>'website', '') <> '' then return json_build_object('ok', true); end if; -- honeypot
  if v_first = '' or v_last = '' then return json_build_object('ok', false, 'error', 'name'); end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return json_build_object('ok', false, 'error', 'email'); end if;
  if not (v_thu in ('Attending', 'Not attending') and v_fri in ('Attending', 'Not attending')
          and v_sat in ('Attending', 'Not attending')) then
    return json_build_object('ok', false, 'error', 'answers');
  end if;

  select g.* into me from public.guests g
  where public.norm(g.first || ' ' || g.last) = public.norm(v_first || ' ' || v_last)
  order by g.id limit 1;

  -- Unnamed extra guests: only up to what the guests table allows this person.
  allowed := public.guest_extras(v_first, v_last);
  if allowed > 0 then
    v_extras := greatest(0, least(allowed, coalesce(nullif(r->>'extras', '')::int, 0)));
    if json_typeof(r->'guestNames') = 'array' then
      select coalesce(array_agg(n order by i), '{}') into v_names
      from (select public.tidy(x, 160) n, i from json_array_elements_text(r->'guestNames') with ordinality t(x, i)) s
      where i <= v_extras and n <> '';
    end if;
  end if;

  -- This person's own row.
  if me.id is not null then
    select id into existing_id from public.rsvps where guest_id = me.id;
  else
    select id into existing_id from public.rsvps
    where guest_id is null and lower(first) = lower(v_first) and lower(last) = lower(v_last) and email = v_email
    limit 1;
  end if;
  if existing_id is not null then
    update public.rsvps set
      updated_at = now(), replied_by = me.id, added_by = '',
      first = coalesce(me.first, v_first), last = coalesce(me.last, v_last), email = v_email,
      thursday = v_thu, friday = v_fri, saturday = v_sat,
      extra_guests = v_extras, guest_names = array_to_string(v_names, ', '),
      also_replying_for = v_party
    where id = existing_id;
  else
    insert into public.rsvps (guest_id, replied_by, first, last, email, thursday, friday, saturday, extra_guests,
                              guest_names, also_replying_for)
    values (me.id, me.id, coalesce(me.first, v_first), coalesce(me.last, v_last), v_email, v_thu, v_fri, v_sat,
            v_extras, array_to_string(v_names, ', '), v_party);
  end if;

  -- The other people on this invitation, answered by this person: {first, last, coming, thursday, friday, saturday}.
  -- Only people really on the same invitation are kept. "coming": false = not attending any day; day answers
  -- that aren't valid fall back to this person's own answer.
  if me.id is not null and me.party is not null and json_typeof(r->'companions') = 'array' then
    for rec in
      select distinct on (g.id) g.id, g.first, g.last, e.c
      from (select t.c from json_array_elements(r->'companions') with ordinality t(c, i)
            where t.i <= 20 and json_typeof(t.c) = 'object') e
      join public.guests g on g.party = me.party and g.id <> me.id
       and public.norm(g.first || ' ' || g.last) =
           public.norm(public.tidy(e.c->>'first', 80) || ' ' || public.tidy(e.c->>'last', 80))
      order by g.id
    loop
      c_coming := coalesce(lower(rec.c->>'coming') not in ('false', 'no'), true);
      c_thu := case when not c_coming then 'Not attending'
                    when rec.c->>'thursday' in ('Attending', 'Not attending') then rec.c->>'thursday' else v_thu end;
      c_fri := case when not c_coming then 'Not attending'
                    when rec.c->>'friday' in ('Attending', 'Not attending') then rec.c->>'friday' else v_fri end;
      c_sat := case when not c_coming then 'Not attending'
                    when rec.c->>'saturday' in ('Attending', 'Not attending') then rec.c->>'saturday' else v_sat end;

      insert into public.rsvps (guest_id, replied_by, added_by, first, last, email, thursday, friday, saturday)
      values (rec.id, me.id, me.first || ' ' || me.last, rec.first, rec.last, v_email, c_thu, c_fri, c_sat)
      on conflict (guest_id) where guest_id is not null do update set
        updated_at = now(), replied_by = excluded.replied_by, added_by = excluded.added_by, email = excluded.email,
        thursday = excluded.thursday, friday = excluded.friday, saturday = excluded.saturday;

      companion_ids := companion_ids || rec.id;
      companions_out := companions_out || jsonb_build_array(jsonb_build_object(
        'name', rec.first || ' ' || rec.last, 'thursday', c_thu, 'friday', c_fri, 'saturday', c_sat));
    end loop;
  end if;

  -- Drop anyone this person answered for before but not now (unless they've since replied themselves).
  -- Only when the form actually sent the invitation list, so a page that couldn't load it never wipes answers.
  if me.id is not null and json_typeof(r->'companions') = 'array' then
    delete from public.rsvps
    where replied_by = me.id and guest_id <> me.id and not (guest_id = any(companion_ids));
  end if;

  insert into public.log (guest_id, first, last, email, thursday, friday, saturday, extra_guests, guest_names,
                          also_replying_for, companions)
  values (me.id, v_first, v_last, v_email, v_thu, v_fri, v_sat, v_extras, array_to_string(v_names, ', '),
          v_party, case when companions_out = '[]' then '' else companions_out::text end);

  -- Confirmation email via Resend (only if a key is stored in Vault as "resend_api_key"). Sent in the background.
  select decrypted_secret into key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if key is not null then
    summary := 'Thursday 6 May · Marrakech day: ' || v_thu || E'\n' ||
               'Friday 7 May · Welcome drinks: '   || v_fri || E'\n' ||
               'Saturday 8 May · The wedding: '    || v_sat;
    for rec in select value as c from jsonb_array_elements(companions_out) loop
      summary := summary || E'\n' || (rec.c->>'name') || ': ' ||
        case when rec.c->>'thursday' = 'Not attending' and rec.c->>'friday' = 'Not attending'
                  and rec.c->>'saturday' = 'Not attending' then 'not coming'
             else 'Thu ' || (rec.c->>'thursday') || ' · Fri ' || (rec.c->>'friday') || ' · Sat ' || (rec.c->>'saturday') end;
    end loop;
    if allowed = 1 then
      summary := summary || E'\nPlus-one: ' || case when v_extras > 0 then coalesce(v_names[1], '1') else 'not bringing one' end;
    elsif allowed > 1 then
      summary := summary || E'\nGuests with you: ' ||
                 case when v_extras > 0 then coalesce(nullif(array_to_string(v_names, ', '), ''), v_extras::text) else 'none' end;
    end if;
    perform net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'from', 'Lorena & Youssef <rsvp@lorenaandyoussef.com>',
        'to', jsonb_build_array(v_email),
        'subject', 'Your RSVP · Lorena & Youssef · 8 May 2027',
        'text', 'Dear ' || v_first || E',\n\nThank you for your reply. Here is what we have:\n\n' || summary ||
                case when v_party <> '' then E'\n\nAlso replying for: ' || v_party else '' end ||
                E'\n\nNeed to change something? Just send the form again with the same name and email.\n\nWith love,\nLorena & Youssef'));
    emailed := true;
  end if;

  return json_build_object('ok', true, 'emailed', emailed, 'extrasAllowed', allowed, 'companions', companions_out);
end $$;

revoke execute on function public.search_guests(text), public.guest_extras(text, text), public.guest_invite(text, text),
  public.submit_rsvp(json) from public;
grant  execute on function public.search_guests(text), public.guest_extras(text, text), public.guest_invite(text, text),
  public.submit_rsvp(json) to anon, authenticated;
