-- Multi-Covils: creation is exclusive to the application owner and each
-- Covil has its own configurable member limit.

alter table public.covils
  add column if not exists member_limit smallint not null default 6;

alter table public.covils
  drop constraint if exists covils_member_limit_check;

alter table public.covils
  add constraint covils_member_limit_check
  check (member_limit between 1 and 6);

create or replace function private.enforce_covil_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_member_limit smallint;
  v_member_count integer;
begin
  if exists (
    select 1
    from public.covil_members
    where covil_id = new.covil_id
      and user_id = new.user_id
  ) then
    return new;
  end if;

  select member_limit
  into v_member_limit
  from public.covils
  where id = new.covil_id
  for update;

  if v_member_limit is null then
    raise exception 'Covil nao encontrado.';
  end if;

  select count(*)
  into v_member_count
  from public.covil_members
  where covil_id = new.covil_id;

  if v_member_count >= v_member_limit then
    raise exception 'Este Covil atingiu o limite de % membros.', v_member_limit;
  end if;

  return new;
end;
$$;

create or replace function public.create_covil(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_covil public.covils;
  v_invite_code text;
  v_name text := btrim(p_name);
  v_attempt smallint;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao necessaria.';
  end if;

  if not private.is_app_admin() then
    raise exception 'Somente o proprietario da aplicacao pode criar Covils.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'O nome do Covil deve ter entre 2 e 60 caracteres.';
  end if;

  for v_attempt in 1..5 loop
    v_invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));

    begin
      insert into public.covils (name, owner_id, invite_code, member_limit)
      values (v_name, auth.uid(), v_invite_code, 6)
      returning * into v_covil;

      exit;
    exception
      when unique_violation then
        if v_attempt = 5 then
          raise exception 'Nao foi possivel gerar um convite unico.';
        end if;
    end;
  end loop;

  insert into public.covil_members (covil_id, user_id, role)
  values (v_covil.id, auth.uid(), 'owner');

  insert into public.channels (covil_id, name, kind, position)
  values
    (v_covil.id, 'geral', 'text', 0),
    (v_covil.id, 'Lobby', 'voice', 1);

  return v_covil.id;
end;
$$;

create or replace function public.create_covil_with_limit(
  p_name text,
  p_member_limit smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_covil_id uuid;
begin
  if p_member_limit is null or p_member_limit < 1 or p_member_limit > 6 then
    raise exception 'O limite deve estar entre 1 e 6 membros.';
  end if;

  v_covil_id := public.create_covil(p_name);

  update public.covils
  set member_limit = p_member_limit
  where id = v_covil_id;

  return v_covil_id;
end;
$$;

create or replace function public.update_covil_member_limit(
  p_covil_id uuid,
  p_member_limit smallint
)
returns smallint
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao necessaria.';
  end if;

  if not private.is_app_admin() then
    raise exception 'Somente o proprietario da aplicacao pode alterar o limite.';
  end if;

  if p_member_limit is null or p_member_limit < 1 or p_member_limit > 6 then
    raise exception 'O limite deve estar entre 1 e 6 membros.';
  end if;

  perform 1
  from public.covils
  where id = p_covil_id
  for update;

  if not found then
    raise exception 'Covil nao encontrado.';
  end if;

  select count(*)
  into v_member_count
  from public.covil_members
  where covil_id = p_covil_id;

  if p_member_limit < v_member_count then
    raise exception 'O limite nao pode ser menor que os % membros atuais.', v_member_count;
  end if;

  update public.covils
  set member_limit = p_member_limit
  where id = p_covil_id;

  return p_member_limit;
end;
$$;

grant select (member_limit) on public.covils to authenticated;

revoke all on function public.create_covil_with_limit(text, smallint) from public, anon, authenticated;
revoke all on function public.update_covil_member_limit(uuid, smallint) from public, anon, authenticated;
grant execute on function public.create_covil_with_limit(text, smallint) to authenticated;
grant execute on function public.update_covil_member_limit(uuid, smallint) to authenticated;

comment on column public.covils.member_limit is
  'Limite configuravel por Covil (1 a 6), alteravel somente pelo proprietario da aplicacao.';
comment on function public.create_covil_with_limit(text, smallint) is
  'Cria um Covil com limite proprio; autorizado exclusivamente para o proprietario da aplicacao.';
comment on function public.update_covil_member_limit(uuid, smallint) is
  'Altera o limite do Covil sem permitir valor abaixo da ocupacao atual.';
