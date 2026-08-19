-- Normalize existing North American numbers while preserving non-10-digit values.
update public.officials
set phone = '(' || substring(regexp_replace(phone, '\D', '', 'g') from 1 for 3) || ') '
  || substring(regexp_replace(phone, '\D', '', 'g') from 4 for 3) || '-'
  || substring(regexp_replace(phone, '\D', '', 'g') from 7 for 4),
  updated_at = now()
where phone is not null
  and length(regexp_replace(phone, '\D', '', 'g')) = 10;

update public.officials
set phone = '(' || substring(regexp_replace(phone, '\D', '', 'g') from 2 for 3) || ') '
  || substring(regexp_replace(phone, '\D', '', 'g') from 5 for 3) || '-'
  || substring(regexp_replace(phone, '\D', '', 'g') from 8 for 4),
  updated_at = now()
where phone is not null
  and length(regexp_replace(phone, '\D', '', 'g')) = 11
  and regexp_replace(phone, '\D', '', 'g') like '1%';

update public.profiles
set phone = '(' || substring(regexp_replace(phone, '\D', '', 'g') from 1 for 3) || ') '
  || substring(regexp_replace(phone, '\D', '', 'g') from 4 for 3) || '-'
  || substring(regexp_replace(phone, '\D', '', 'g') from 7 for 4),
  updated_at = now()
where phone is not null
  and length(regexp_replace(phone, '\D', '', 'g')) = 10;

update public.profiles
set phone = '(' || substring(regexp_replace(phone, '\D', '', 'g') from 2 for 3) || ') '
  || substring(regexp_replace(phone, '\D', '', 'g') from 5 for 3) || '-'
  || substring(regexp_replace(phone, '\D', '', 'g') from 8 for 4),
  updated_at = now()
where phone is not null
  and length(regexp_replace(phone, '\D', '', 'g')) = 11
  and regexp_replace(phone, '\D', '', 'g') like '1%';
