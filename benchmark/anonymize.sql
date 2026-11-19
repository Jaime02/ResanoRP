-- Run by `stack.sh dump` on a throwaway copy of the database. The salt and the date shift are random and dropped
-- with the session, so the output cannot be mapped back. Kept as they were: ids, quantities, dimensions, VAT and shape
-- names (ShapeIcon reads them); row counts, statuses and lengths stay, so pages show the same rows.
\set ON_ERROR_STOP on
begin;
set session_replication_role = replica;

create temp table anon_key as
select
  gen_random_uuid()::text as salt,
  (7 * (5 + floor(random() * 48)))::int as shift_days,
  -- Coprime with 10, so x -> (a * x + b) mod 10^n is a bijection
  (10 * floor(random() * 100000) + (array[1, 3, 7, 9])[1 + floor(random() * 4)::int])::numeric as a,
  floor(random() * 1e15)::numeric as b;

-- Same length, case and punctuation, every letter and digit replaced, and never two values into one, which the unique
-- indexes need (sequential references of one client, `90/65` and `90/66`, would collide if hashed). The digits are
-- permuted together as one number. The letters are hashed from the lowercase value without its digits, so values that
-- share their letters differ in their digits
create function pg_temp.anon_text(v text) returns text language plpgsql as $$
declare
  key anon_key := (select anon_key from anon_key);
  letters text := lower(regexp_replace(v, '[0-9]', '', 'g'));
  digits text := regexp_replace(v, '[^0-9]', '', 'g');
  hash bytea := ''::bytea;
  result text := '';
  digit int := 0;
  c text;
  b int;
begin
  if digits <> '' then
    digits := lpad(((key.a * digits::numeric + key.b) % ('1' || repeat('0', length(digits)))::numeric)::text,
      length(digits), '0');
  end if;
  while length(hash) < char_length(v) loop
    hash := hash || decode(md5(key.salt || letters || length(hash)), 'hex');
  end loop;
  for i in 1..char_length(v) loop
    c := substr(v, i, 1);
    b := get_byte(hash, i - 1);
    if c ~ '[0-9]' then
      digit := digit + 1;
      c := substr(digits, digit, 1);
    elsif lower(c) <> upper(c) then
      c := case when c = lower(c) then chr(97 + b % 26) else chr(65 + b % 26) end;
    end if;
    result := result || c;
  end loop;
  return result;
end $$;

-- 0.5x to 1.5x, the same factor for equal amounts, so a line's price still matches its part's price
create function pg_temp.anon_amount(v numeric) returns numeric language sql as $$
  select round(v * (0.5 + get_byte(decode(md5((select salt from anon_key) || trim_scale(v)::text), 'hex'), 0) / 255.0),
    scale(v))
$$;

create temp table original_text (value text);

-- Checked row by row, a new value could clash with an old one not updated yet: recreated at the end
create temp table unique_indexes as
select indexname, indexdef from pg_indexes
where schemaname = 'public' and indexdef like 'CREATE UNIQUE INDEX%' and indexname not like '%\_pkey';
do $$
declare
  index record;
begin
  for index in select indexname from unique_indexes loop
    execute format('drop index %I', index.indexname);
  end loop;
end $$;

do $$
declare
  col record;
  left_count int;
begin
  for col in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and (c.data_type in ('text', 'character varying', 'date') or c.data_type like 'timestamp%')
      and not (c.table_name = 'shape' and c.column_name = 'name')
  loop
    if col.data_type in ('text', 'character varying') then
      execute format('insert into original_text select %2$I from %1$I where char_length(%2$I) >= 8 and %2$I ~ ''[[:alpha:]]''',
        col.table_name, col.column_name);
      execute format('update %1$I set %2$I = pg_temp.anon_text(%2$I) where %2$I is not null', col.table_name, col.column_name);
    else
      execute format('update %1$I set %2$I = %2$I - make_interval(days => (select shift_days from anon_key))',
        col.table_name, col.column_name);
    end if;
  end loop;

  -- Self-check that no text column was left as it was. A few new values equal another row's original by chance, among
  -- thousands of the same pattern (`L=xxx mm`), so only more than 1% of a column fails
  for col in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.data_type in ('text', 'character varying')
      and not (c.table_name = 'shape' and c.column_name = 'name')
  loop
    execute format(
      'select count(*) filter (where %2$I in (select value from original_text))
        - count(*) filter (where char_length(%2$I) >= 8 and %2$I ~ ''[[:alpha:]]'') / 100 from %1$I',
      col.table_name, col.column_name) into left_count;
    if left_count > 0 then
      raise exception 'original values left in %.%', col.table_name, col.column_name;
    end if;
  end loop;
end $$;

update part_price set price = pg_temp.anon_amount(price);
update sell_order_line set "partPrice" = pg_temp.anon_amount("partPrice");
update delivery_note_line set "unitPrice" = pg_temp.anon_amount("unitPrice");
update raw_material set price = pg_temp.anon_amount(price);
update part_price_estimator set
  "materialCost" = pg_temp.anon_amount("materialCost"),
  "coatingCost" = pg_temp.anon_amount("coatingCost"),
  "otherCost" = pg_temp.anon_amount("otherCost"),
  "secondOperationCost" = pg_temp.anon_amount("secondOperationCost"),
  "machinePricePerHour" = pg_temp.anon_amount("machinePricePerHour");

do $$
declare
  index record;
begin
  for index in select indexdef from unique_indexes loop
    execute index.indexdef;
  end loop;
end $$;

commit;
