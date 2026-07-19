-- Covil: cargos acumulaveis, permissoes operacionais e moderacao cooperativa
-- de voz. O papel owner continua sendo a unica fonte de propriedade do Covil;
-- cargos nunca criam ou transferem ownership.

create type public.covil_permission as enum (
  'manage_channels',
  'moderate_voice',
  'remove_members'
);

create table public.covil_roles (
  id uuid primary key default gen_random_uuid(),
  covil_id uuid not null references public.covils (id) on delete cascade,
  name text not null,
  color text,
  permissions public.covil_permission[] not null
    default array[]::public.covil_permission[],
  position smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint covil_roles_covil_id_id_unique unique (covil_id, id),
  constraint covil_roles_name_valid check (
    name = btrim(name)
    and char_length(name) between 1 and 32
  ),
  constraint covil_roles_color_valid check (
    color is null or color ~ '^#[0-9A-F]{6}$'
  ),
  constraint covil_roles_permissions_valid check (
    cardinality(permissions) <= 3
    and array_position(permissions, null) is null
  ),
  constraint covil_roles_position_nonnegative check (position >= 0)
);

create unique index covil_roles_name_per_covil_idx
  on public.covil_roles (covil_id, lower(name));

create index covil_roles_covil_created_at_idx
  on public.covil_roles (covil_id, position, created_at, id);

create table public.covil_member_roles (
  covil_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  assigned_by uuid not null references public.profiles (id),
  assigned_at timestamptz not null default now(),

  primary key (covil_id, user_id, role_id),
  constraint covil_member_roles_membership_fk
    foreign key (covil_id, user_id)
    references public.covil_members (covil_id, user_id)
    on delete cascade,
  constraint covil_member_roles_role_fk
    foreign key (covil_id, role_id)
    references public.covil_roles (covil_id, id)
    on delete cascade
);

create index covil_member_roles_role_id_idx
  on public.covil_member_roles (role_id, covil_id, user_id);

-- Permite que o estado de voz use uma FK composta que comprova estruturalmente
-- que o canal pertence ao mesmo Covil do participante moderado.
alter table public.channels
add constraint channels_covil_id_id_unique unique (covil_id, id);

create table public.voice_moderation_states (
  covil_id uuid not null,
  channel_id uuid not null,
  user_id uuid not null,
  server_muted boolean not null default false,
  disconnect_requested_at timestamptz,
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),

  primary key (channel_id, user_id),
  constraint voice_moderation_states_channel_fk
    foreign key (covil_id, channel_id)
    references public.channels (covil_id, id)
    on delete cascade,
  constraint voice_moderation_states_membership_fk
    foreign key (covil_id, user_id)
    references public.covil_members (covil_id, user_id)
    on delete cascade
);

create index voice_moderation_states_covil_user_idx
  on public.voice_moderation_states (covil_id, user_id);

-- O owner possui todas as permissoes implicitamente. Para membros, a permissao
-- efetiva e a uniao dos arrays de todos os cargos atribuidos.
create or replace function private.has_covil_permission(
  p_covil_id uuid,
  p_permission public.covil_permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select
    private.is_covil_owner(p_covil_id)
    or exists (
      select 1
      from public.covil_member_roles as assignment
      join public.covil_roles as role
        on role.covil_id = assignment.covil_id
       and role.id = assignment.role_id
      where assignment.covil_id = p_covil_id
        and assignment.user_id = auth.uid()
        and p_permission = any(role.permissions)
    );
$$;

-- Serializa a contagem no proprio Covil para que duas criacoes concorrentes nao
-- ultrapassem o limite de 25 canais.
create or replace function public.create_covil_channel(
  p_covil_id uuid,
  p_name text,
  p_kind public.channel_kind
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_name text := btrim(p_name);
  v_channel_id uuid;
  v_position smallint;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if not private.has_covil_permission(p_covil_id, 'manage_channels') then
    raise exception 'Permissao para gerenciar canais obrigatoria.'
      using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception 'O nome do canal deve ter entre 1 e 40 caracteres.'
      using errcode = '22023';
  end if;

  if p_kind is null then
    raise exception 'O tipo do canal e obrigatorio.' using errcode = '22023';
  end if;

  perform 1
  from public.covils
  where id = p_covil_id
  for update;

  if not found then
    raise exception 'Covil nao encontrado.' using errcode = 'P0002';
  end if;

  if (
    select count(*)
    from public.channels
    where covil_id = p_covil_id
  ) >= 25 then
    raise exception 'O Covil ja atingiu o limite de 25 canais.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.channels
    where covil_id = p_covil_id
      and kind = p_kind
      and lower(name) = lower(v_name)
  ) then
    raise exception 'Ja existe um canal desse tipo com esse nome.'
      using errcode = '23505';
  end if;

  select coalesce(max(position), -1) + 1
  into v_position
  from public.channels
  where covil_id = p_covil_id;

  insert into public.channels (covil_id, name, kind, position)
  values (p_covil_id, v_name, p_kind, v_position)
  returning id into v_channel_id;

  return v_channel_id;
end;
$$;

-- Somente o fundador administra cargos. As permissoes recebidas sao
-- normalizadas para remover nulos e repeticoes antes da persistencia.
create or replace function public.create_covil_role(
  p_covil_id uuid,
  p_name text,
  p_color text,
  p_permissions public.covil_permission[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_name text := btrim(p_name);
  v_color text := upper(btrim(p_color));
  v_permissions public.covil_permission[];
  v_role_id uuid;
  v_position smallint;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if not private.is_covil_owner(p_covil_id) then
    raise exception 'Somente o owner pode criar cargos.' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) not between 1 and 32 then
    raise exception 'O nome do cargo deve ter entre 1 e 32 caracteres.'
      using errcode = '22023';
  end if;

  if v_color = '' then
    v_color := null;
  end if;

  if v_color is not null and v_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'A cor do cargo deve usar o formato #RRGGBB.'
      using errcode = '22023';
  end if;

  select coalesce(
    array_agg(distinct requested.permission order by requested.permission),
    array[]::public.covil_permission[]
  )
  into v_permissions
  from unnest(
    coalesce(p_permissions, array[]::public.covil_permission[])
  ) as requested(permission)
  where requested.permission is not null;

  perform 1
  from public.covils
  where id = p_covil_id
  for update;

  if not found then
    raise exception 'Covil nao encontrado.' using errcode = 'P0002';
  end if;

  if (
    select count(*)
    from public.covil_roles
    where covil_id = p_covil_id
  ) >= 12 then
    raise exception 'O Covil ja atingiu o limite de 12 cargos.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.covil_roles
    where covil_id = p_covil_id
      and lower(name) = lower(v_name)
  ) then
    raise exception 'Ja existe um cargo com esse nome.' using errcode = '23505';
  end if;

  select coalesce(max(position), -1) + 1
  into v_position
  from public.covil_roles
  where covil_id = p_covil_id;

  insert into public.covil_roles (
    covil_id,
    name,
    color,
    permissions,
    position
  )
  values (p_covil_id, v_name, v_color, v_permissions, v_position)
  returning id into v_role_id;

  return v_role_id;
end;
$$;

create or replace function public.delete_covil_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_covil_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  select covil_id
  into v_covil_id
  from public.covil_roles
  where id = p_role_id
  for update;

  if not found or not private.is_covil_owner(v_covil_id) then
    raise exception 'Somente o owner pode excluir cargos.' using errcode = '42501';
  end if;

  delete from public.covil_roles
  where id = p_role_id
    and covil_id = v_covil_id;
end;
$$;

create or replace function public.set_covil_member_role(
  p_covil_id uuid,
  p_user_id uuid,
  p_role_id uuid,
  p_assigned boolean
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_member_role public.covil_member_role;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if not private.is_covil_owner(p_covil_id) then
    raise exception 'Somente o owner pode atribuir cargos.' using errcode = '42501';
  end if;

  if p_assigned is null then
    raise exception 'O estado da atribuicao e obrigatorio.' using errcode = '22023';
  end if;

  select role
  into v_member_role
  from public.covil_members
  where covil_id = p_covil_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Membro nao encontrado.' using errcode = 'P0002';
  end if;

  if v_member_role = 'owner' then
    raise exception 'O fundador nao pode receber cargos delegados.'
      using errcode = '42501';
  end if;

  perform 1
  from public.covil_roles
  where covil_id = p_covil_id
    and id = p_role_id
  for key share;

  if not found then
    raise exception 'Cargo nao encontrado neste Covil.' using errcode = 'P0002';
  end if;

  if p_assigned then
    insert into public.covil_member_roles (
      covil_id,
      user_id,
      role_id,
      assigned_by
    )
    values (p_covil_id, p_user_id, p_role_id, auth.uid())
    on conflict (covil_id, user_id, role_id) do nothing;
  else
    delete from public.covil_member_roles
    where covil_id = p_covil_id
      and user_id = p_user_id
      and role_id = p_role_id;
  end if;
end;
$$;

create or replace function public.remove_covil_member(
  p_covil_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_member_role public.covil_member_role;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if p_user_id <> auth.uid()
     and not private.has_covil_permission(p_covil_id, 'remove_members') then
    raise exception 'Permissao para remover membros obrigatoria.'
      using errcode = '42501';
  end if;

  select role
  into v_member_role
  from public.covil_members
  where covil_id = p_covil_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Membro nao encontrado.' using errcode = 'P0002';
  end if;

  if v_member_role = 'owner' then
    raise exception 'O fundador do Covil nao pode ser removido.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from private.app_admins
    where user_id = p_user_id
  ) then
    raise exception 'A conta proprietaria da aplicacao nao pode ser removida.'
      using errcode = '42501';
  end if;

  delete from public.covil_members
  where covil_id = p_covil_id
    and user_id = p_user_id
    and role = 'member';
end;
$$;

create or replace function public.moderate_covil_voice(
  p_channel_id uuid,
  p_user_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_action text := lower(btrim(p_action));
  v_covil_id uuid;
  v_member_role public.covil_member_role;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if v_action is null or v_action not in ('mute', 'unmute', 'disconnect') then
    raise exception 'Acao de moderacao invalida.' using errcode = '22023';
  end if;

  select covil_id
  into v_covil_id
  from public.channels
  where id = p_channel_id
    and kind = 'voice'
  for key share;

  if not found then
    raise exception 'Canal de voz nao encontrado.' using errcode = 'P0002';
  end if;

  if not private.has_covil_permission(v_covil_id, 'moderate_voice') then
    raise exception 'Permissao para moderar voz obrigatoria.'
      using errcode = '42501';
  end if;

  select role
  into v_member_role
  from public.covil_members
  where covil_id = v_covil_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Membro nao encontrado.' using errcode = 'P0002';
  end if;

  if v_member_role = 'owner' then
    raise exception 'O fundador nao pode ser alvo de moderacao.'
      using errcode = '42501';
  end if;

  insert into public.voice_moderation_states as current_state (
    covil_id,
    channel_id,
    user_id,
    server_muted,
    disconnect_requested_at,
    updated_by,
    updated_at
  )
  values (
    v_covil_id,
    p_channel_id,
    p_user_id,
    v_action = 'mute',
    case when v_action = 'disconnect' then statement_timestamp() end,
    auth.uid(),
    statement_timestamp()
  )
  on conflict (channel_id, user_id) do update
  set server_muted = case
        when v_action = 'mute' then true
        when v_action = 'unmute' then false
        else current_state.server_muted
      end,
      disconnect_requested_at = case
        when v_action = 'disconnect' then statement_timestamp()
        else current_state.disconnect_requested_at
      end,
      updated_by = auth.uid(),
      updated_at = statement_timestamp();
end;
$$;

alter table public.covil_roles enable row level security;
alter table public.covil_roles force row level security;
alter table public.covil_member_roles enable row level security;
alter table public.covil_member_roles force row level security;
alter table public.voice_moderation_states enable row level security;
alter table public.voice_moderation_states force row level security;

create policy covil_roles_select_members
on public.covil_roles
for select
to authenticated
using (private.is_covil_member(covil_id));

create policy covil_member_roles_select_members
on public.covil_member_roles
for select
to authenticated
using (private.is_covil_member(covil_id));

create policy voice_moderation_states_select_members
on public.voice_moderation_states
for select
to authenticated
using (private.is_covil_member(covil_id));

-- A policy continua sendo defesa em profundidade, embora INSERT direto seja
-- revogado e a criacao normal passe pela RPC com limite e serializacao.
drop policy if exists channels_insert_owner on public.channels;
create policy channels_insert_manage_permission
on public.channels
for insert
to authenticated
with check (private.has_covil_permission(covil_id, 'manage_channels'));

-- Remocao direta nao consegue aplicar as protecoes do fundador e do app admin.
-- A RPC remove_covil_member passa a ser o unico caminho para authenticated.
drop policy if exists covil_members_delete_member_or_owner
on public.covil_members;

revoke all on table
  public.covil_roles,
  public.covil_member_roles,
  public.voice_moderation_states
from public, anon, authenticated;

grant select on table
  public.covil_roles,
  public.covil_member_roles,
  public.voice_moderation_states
to authenticated;

revoke insert on table public.channels from authenticated;
revoke delete on table public.covil_members from authenticated;

revoke all on type public.covil_permission from public, anon, authenticated;
grant usage on type public.covil_permission to authenticated;

revoke all on function
  private.has_covil_permission(uuid, public.covil_permission)
from public, anon, authenticated;

grant execute on function
  private.has_covil_permission(uuid, public.covil_permission)
to authenticated;

revoke all on function public.create_covil_channel(
  uuid,
  text,
  public.channel_kind
) from public, anon, authenticated;
revoke all on function public.create_covil_role(
  uuid,
  text,
  text,
  public.covil_permission[]
) from public, anon, authenticated;
revoke all on function public.delete_covil_role(uuid)
from public, anon, authenticated;
revoke all on function public.set_covil_member_role(uuid, uuid, uuid, boolean)
from public, anon, authenticated;
revoke all on function public.remove_covil_member(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.moderate_covil_voice(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.create_covil_channel(
  uuid,
  text,
  public.channel_kind
) to authenticated;
grant execute on function public.create_covil_role(
  uuid,
  text,
  text,
  public.covil_permission[]
) to authenticated;
grant execute on function public.delete_covil_role(uuid) to authenticated;
grant execute on function public.set_covil_member_role(
  uuid,
  uuid,
  uuid,
  boolean
) to authenticated;
grant execute on function public.remove_covil_member(uuid, uuid) to authenticated;
grant execute on function public.moderate_covil_voice(
  uuid,
  uuid,
  text
) to authenticated;

alter table public.covil_roles replica identity full;
alter table public.covil_member_roles replica identity full;
alter table public.voice_moderation_states replica identity full;

do $$
declare
  v_table_name text;
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  foreach v_table_name in array array[
    'covil_roles',
    'covil_member_roles',
    'voice_moderation_states'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table_name
      );
    end if;
  end loop;
end;
$$;

comment on type public.covil_permission is
  'Permissoes operacionais acumuladas pelos cargos de um membro.';
comment on table public.covil_roles is
  'Cargos personalizados criados exclusivamente pelo fundador do Covil.';
comment on table public.covil_member_roles is
  'Atribuicoes acumulaveis de cargos a membros comuns do mesmo Covil.';
comment on table public.voice_moderation_states is
  'Estado cooperativo de mute e pedidos de desconexao por canal de voz.';
comment on function private.has_covil_permission(uuid, public.covil_permission) is
  'Autoriza o owner implicitamente ou agrega permissoes dos cargos do usuario.';
comment on function public.create_covil_channel(uuid, text, public.channel_kind) is
  'Cria canal para quem possui manage_channels, respeitando o limite do Covil.';
comment on function public.create_covil_role(
  uuid,
  text,
  text,
  public.covil_permission[]
) is 'Cria cargo; operacao exclusiva do fundador.';
comment on function public.set_covil_member_role(uuid, uuid, uuid, boolean) is
  'Atribui ou remove cargo de membro comum; operacao exclusiva do fundador.';
comment on function public.remove_covil_member(uuid, uuid) is
  'Remove membro com protecoes para fundador e proprietario da aplicacao.';
comment on function public.moderate_covil_voice(uuid, uuid, text) is
  'Registra mute, unmute ou disconnect para aplicacao cooperativa pelos clientes.';
