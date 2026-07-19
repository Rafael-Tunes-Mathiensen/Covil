-- Covil: limite de membros e console operacional do proprietario da aplicacao.
-- O administrador global gerencia acessos e metadados, mas nao recebe permissao
-- para consultar o conteudo das mensagens fora dos Covils dos quais participa.

create table private.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

revoke all on table private.app_admins from public, anon, authenticated;

-- Conta proprietaria confirmada no Auth antes da aplicacao desta migration.
insert into private.app_admins (user_id)
select id
from auth.users
where id = 'b912a6f7-ee82-4a47-962d-2e5e7c6adcb4'::uuid
on conflict (user_id) do nothing;

create or replace function private.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from private.app_admins as admin
    where admin.user_id = auth.uid()
  );
$$;

-- A trava na linha do Covil serializa entradas concorrentes. Assim, duas pessoas
-- nao conseguem ocupar simultaneamente a sexta vaga.
create or replace function private.enforce_covil_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if exists (
    select 1
    from public.covil_members
    where covil_id = new.covil_id
      and user_id = new.user_id
  ) then
    return new;
  end if;

  perform 1
  from public.covils
  where id = new.covil_id
  for update;

  if (
    select count(*)
    from public.covil_members
    where covil_id = new.covil_id
  ) >= 6 then
    raise exception 'O Covil ja atingiu o limite de 6 membros.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger covil_members_enforce_limit
before insert on public.covil_members
for each row execute function private.enforce_covil_member_limit();

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select private.is_app_admin();
$$;

create or replace function public.get_admin_overview()
returns table (
  registered_users bigint,
  covils_count bigint,
  active_memberships bigint,
  channels_count bigint,
  messages_count bigint,
  database_size_bytes bigint,
  messages_size_bytes bigint,
  member_limit smallint,
  generated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not private.is_app_admin() then
    raise exception 'Acesso administrativo obrigatorio.' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from auth.users),
    (select count(*) from public.covils),
    (select count(*) from public.covil_members),
    (select count(*) from public.channels),
    (select count(*) from public.messages),
    pg_database_size(current_database()),
    pg_total_relation_size('public.messages'::regclass),
    6::smallint,
    statement_timestamp();
end;
$$;

create or replace function public.get_admin_access()
returns table (
  user_id uuid,
  display_name text,
  email text,
  user_created_at timestamptz,
  last_sign_in_at timestamptz,
  covil_id uuid,
  covil_name text,
  membership_role text,
  joined_at timestamptz,
  is_app_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not private.is_app_admin() then
    raise exception 'Acesso administrativo obrigatorio.' using errcode = '42501';
  end if;

  return query
  select
    users.id,
    coalesce(profile.display_name, split_part(coalesce(users.email, ''), '@', 1), 'Usuario'),
    users.email::text,
    users.created_at,
    users.last_sign_in_at,
    membership.covil_id,
    covil.name,
    membership.role::text,
    membership.joined_at,
    admin.user_id is not null
  from auth.users as users
  left join public.profiles as profile on profile.id = users.id
  left join public.covil_members as membership on membership.user_id = users.id
  left join public.covils as covil on covil.id = membership.covil_id
  left join private.app_admins as admin on admin.user_id = users.id
  order by admin.user_id is not null desc, users.created_at, membership.joined_at;
end;
$$;

create or replace function public.admin_remove_covil_member(
  p_covil_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not private.is_app_admin() then
    raise exception 'Acesso administrativo obrigatorio.' using errcode = '42501';
  end if;

  if exists (
    select 1 from private.app_admins where user_id = p_user_id
  ) then
    raise exception 'A conta proprietaria nao pode ser removida.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.covils
    where id = p_covil_id and owner_id = p_user_id
  ) then
    raise exception 'O fundador do Covil nao pode ser removido.' using errcode = '42501';
  end if;

  delete from public.covil_members
  where covil_id = p_covil_id
    and user_id = p_user_id
    and role = 'member';
end;
$$;

revoke all on function private.is_app_admin() from public, anon, authenticated;
revoke all on function private.enforce_covil_member_limit() from public, anon, authenticated;
revoke all on function public.is_app_admin() from public, anon, authenticated;
revoke all on function public.get_admin_overview() from public, anon, authenticated;
revoke all on function public.get_admin_access() from public, anon, authenticated;
revoke all on function public.admin_remove_covil_member(uuid, uuid) from public, anon, authenticated;

grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.get_admin_overview() to authenticated;
grant execute on function public.get_admin_access() to authenticated;
grant execute on function public.admin_remove_covil_member(uuid, uuid) to authenticated;

comment on table private.app_admins is
  'Allowlist server-side dos administradores globais da aplicacao.';
comment on function public.get_admin_overview() is
  'Retorna somente metricas operacionais agregadas para administradores globais.';
comment on function public.get_admin_access() is
  'Lista contas e memberships, sem expor conteudo de mensagens.';
