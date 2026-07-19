-- Covil: modelo inicial de dados, autorizacao e realtime.
-- Esta migration parte de um projeto Supabase, no qual auth.users e
-- a publicacao supabase_realtime ja sao provisionados pela plataforma.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.covil_member_role as enum ('owner', 'member');
create type public.channel_kind as enum ('text', 'voice');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_display_name_valid check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 40
  ),
  constraint profiles_avatar_url_length check (
    avatar_url is null or char_length(avatar_url) <= 2048
  )
);

create table public.covils (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint covils_name_valid check (
    name = btrim(name)
    and char_length(name) between 2 and 60
  ),
  constraint covils_invite_code_format check (
    invite_code ~ '^[0-9A-F]{32}$'
  )
);

create table public.covil_members (
  covil_id uuid not null references public.covils (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.covil_member_role not null default 'member',
  joined_at timestamptz not null default now(),

  primary key (covil_id, user_id)
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  covil_id uuid not null references public.covils (id) on delete cascade,
  name text not null,
  kind public.channel_kind not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint channels_name_valid check (
    name = btrim(name)
    and char_length(name) between 1 and 40
  ),
  constraint channels_position_nonnegative check (position >= 0)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint messages_content_valid check (
    char_length(content) between 1 and 4000
    and btrim(content) <> ''
  )
);

create unique index covil_members_one_owner_per_covil
  on public.covil_members (covil_id)
  where role = 'owner';

create index covils_owner_id_idx
  on public.covils (owner_id);

create index covil_members_user_id_idx
  on public.covil_members (user_id, covil_id);

create unique index channels_name_per_kind_idx
  on public.channels (covil_id, kind, lower(name));

create index channels_covil_position_idx
  on public.channels (covil_id, position, created_at);

create index messages_channel_created_at_idx
  on public.messages (channel_id, created_at desc);

create index messages_author_id_idx
  on public.messages (author_id);

-- Mantem updated_at sob controle do banco, inclusive em updates via PostgREST.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger covils_set_updated_at
before update on public.covils
for each row execute function private.set_updated_at();

create trigger messages_set_updated_at
before update on public.messages
for each row execute function private.set_updated_at();

-- Cria um profile para cada novo usuario cadastrado pelo Supabase Auth.
-- O search_path vazio evita sequestro de objetos em funcoes SECURITY DEFINER.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_display_name text;
begin
  v_display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Usuario'
    ),
    40
  );

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Garante profiles para usuarios que ja existam quando a migration for aplicada.
insert into public.profiles (id, display_name)
select
  users.id,
  left(
    coalesce(
      nullif(btrim(users.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(split_part(coalesce(users.email, ''), '@', 1)), ''),
      'Usuario'
    ),
    40
  )
from auth.users as users
on conflict (id) do nothing;

-- Helpers privados usados pelas policies. Eles recebem a identidade apenas de
-- auth.uid(), portanto o cliente nao consegue consultar como se fosse outro usuario.
create or replace function private.is_covil_member(p_covil_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.covil_members as member
    where member.covil_id = p_covil_id
      and member.user_id = auth.uid()
  );
$$;

create or replace function private.is_covil_owner(p_covil_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.covils as covil
    where covil.id = p_covil_id
      and covil.owner_id = auth.uid()
  );
$$;

create or replace function private.shares_covil(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.covil_members as mine
    join public.covil_members as theirs
      on theirs.covil_id = mine.covil_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_other_user_id
  );
$$;

create or replace function private.can_access_channel(
  p_channel_id uuid,
  p_text_only boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.channels as channel
    join public.covil_members as member
      on member.covil_id = channel.covil_id
    where channel.id = p_channel_id
      and member.user_id = auth.uid()
      and (not p_text_only or channel.kind = 'text')
  );
$$;

-- Autoriza os topicos privados `voice:<channel_uuid>` usados por Broadcast e
-- Presence. A comparacao textual evita casts que poderiam falhar para topicos
-- arbitrarios enviados por um cliente hostil.
create or replace function private.can_access_voice_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.channels as channel
    join public.covil_members as member
      on member.covil_id = channel.covil_id
    where p_topic = 'voice:' || channel.id::text
      and channel.kind = 'voice'
      and member.user_id = auth.uid()
  );
$$;

-- Cria o grupo, associa o dono e provisiona os dois canais iniciais em uma
-- unica transacao. Insercoes diretas nessas tabelas permanecem bloqueadas.
create or replace function public.create_covil(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_name text := btrim(p_name);
  v_covil public.covils;
  v_invite_code text;
  v_attempt smallint;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) not between 2 and 60 then
    raise exception 'O nome do Covil deve ter entre 2 e 60 caracteres.'
      using errcode = '22023';
  end if;

  for v_attempt in 1..5 loop
    v_invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));

    begin
      insert into public.covils (name, owner_id, invite_code)
      values (v_name, auth.uid(), v_invite_code)
      returning * into v_covil;

      exit;
    exception
      when unique_violation then
        if v_attempt = 5 then
          raise exception 'Nao foi possivel gerar um convite unico.'
            using errcode = '55000';
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

-- Um codigo valido e suficiente para entrar. A resposta de erro nao revela
-- se o codigo existiu anteriormente nem dados de um Covil ao qual nao se entrou.
create or replace function public.join_covil_by_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_invite_code text := upper(btrim(p_invite_code));
  v_next_invite_code text;
  v_covil public.covils;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if v_invite_code is null or v_invite_code !~ '^[0-9A-F]{32}$' then
    raise exception 'Convite invalido.' using errcode = '22023';
  end if;

  -- Reivindica e substitui o convite atomicamente. Duas tentativas concorrentes
  -- nao conseguem consumir o mesmo codigo.
  v_next_invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  update public.covils
  set invite_code = v_next_invite_code
  where invite_code = v_invite_code
  returning * into v_covil;

  if not found then
    raise exception 'Convite invalido.' using errcode = '22023';
  end if;

  insert into public.covil_members (covil_id, user_id, role)
  values (v_covil.id, auth.uid(), 'member')
  on conflict (covil_id, user_id) do nothing;

  return v_covil.id;
end;
$$;

create or replace function public.get_covil_invite(p_covil_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_invite_code text;
begin
  if not private.is_covil_owner(p_covil_id) then
    raise exception 'Somente o owner pode consultar o convite.'
      using errcode = '42501';
  end if;

  select invite_code into strict v_invite_code
  from public.covils
  where id = p_covil_id;

  return v_invite_code;
end;
$$;

create or replace function public.rotate_covil_invite(p_covil_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_invite_code text;
  v_attempt smallint;
begin
  if not private.is_covil_owner(p_covil_id) then
    raise exception 'Somente o owner pode renovar o convite.'
      using errcode = '42501';
  end if;

  for v_attempt in 1..5 loop
    v_invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
    begin
      update public.covils
      set invite_code = v_invite_code
      where id = p_covil_id;
      return v_invite_code;
    exception
      when unique_violation then
        if v_attempt = 5 then
          raise exception 'Nao foi possivel gerar um convite unico.'
            using errcode = '55000';
        end if;
    end;
  end loop;

  raise exception 'Nao foi possivel renovar o convite.' using errcode = '55000';
end;
$$;

-- RLS e FORCE RLS deixam as tabelas fechadas ate uma policy permitir o acesso.
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.covils enable row level security;
alter table public.covils force row level security;
alter table public.covil_members enable row level security;
alter table public.covil_members force row level security;
alter table public.channels enable row level security;
alter table public.channels force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;

-- Broadcast e Presence de voz usam canais privados. Somente membros do Covil
-- ao qual o canal pertence podem assinar, publicar sinais e anunciar presenca.
alter table realtime.messages enable row level security;

create policy covil_voice_realtime_select
on realtime.messages
for select
to authenticated
using (
  private.can_access_voice_topic((select realtime.topic()))
  and realtime.messages.extension in ('broadcast', 'presence')
);

create policy covil_voice_realtime_insert
on realtime.messages
for insert
to authenticated
with check (
  private.can_access_voice_topic((select realtime.topic()))
  and realtime.messages.extension in ('broadcast', 'presence')
);

create policy profiles_select_shared_covils
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or private.shares_covil(id)
);

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy covils_select_members
on public.covils
for select
to authenticated
using (private.is_covil_member(id));

create policy covils_update_owner
on public.covils
for update
to authenticated
using (private.is_covil_owner(id))
with check (private.is_covil_owner(id));

create policy covils_delete_owner
on public.covils
for delete
to authenticated
using (private.is_covil_owner(id));

create policy covil_members_select_members
on public.covil_members
for select
to authenticated
using (private.is_covil_member(covil_id));

create policy covil_members_delete_member_or_owner
on public.covil_members
for delete
to authenticated
using (
  role = 'member'
  and (
    user_id = auth.uid()
    or private.is_covil_owner(covil_id)
  )
);

create policy channels_select_members
on public.channels
for select
to authenticated
using (private.is_covil_member(covil_id));

create policy channels_insert_owner
on public.channels
for insert
to authenticated
with check (private.is_covil_owner(covil_id));

create policy channels_update_owner
on public.channels
for update
to authenticated
using (private.is_covil_owner(covil_id))
with check (private.is_covil_owner(covil_id));

create policy channels_delete_owner
on public.channels
for delete
to authenticated
using (private.is_covil_owner(covil_id));

create policy messages_select_channel_members
on public.messages
for select
to authenticated
using (private.can_access_channel(channel_id));

create policy messages_insert_author_in_text_channel
on public.messages
for insert
to authenticated
with check (
  author_id = auth.uid()
  and private.can_access_channel(channel_id, true)
);

create policy messages_update_own_in_text_channel
on public.messages
for update
to authenticated
using (
  author_id = auth.uid()
  and private.can_access_channel(channel_id, true)
)
with check (
  author_id = auth.uid()
  and private.can_access_channel(channel_id, true)
);

create policy messages_delete_own_in_text_channel
on public.messages
for delete
to authenticated
using (
  author_id = auth.uid()
  and private.can_access_channel(channel_id, true)
);

-- Remove grants implicitos da instalacao e concede somente as operacoes/colunas
-- previstas pelo MVP. Campos de identidade e timestamps ficam imutaveis no cliente.
revoke all on table
  public.profiles,
  public.covils,
  public.covil_members,
  public.channels,
  public.messages
from public, anon, authenticated;

grant select on table
  public.profiles,
  public.covil_members,
  public.channels,
  public.messages
to authenticated;

-- O codigo de convite nao e uma coluna publica. Nem membros comuns nem o
-- cliente owner o leem pela tabela; o owner usa get_covil_invite().
grant select (id, name, owner_id, created_at, updated_at)
on public.covils to authenticated;

grant update (display_name, avatar_url)
on public.profiles to authenticated;

grant update (name)
on public.covils to authenticated;

grant delete
on public.covils to authenticated;

grant delete
on public.covil_members to authenticated;

grant insert (covil_id, name, kind, position)
on public.channels to authenticated;

grant update (name, position)
on public.channels to authenticated;

grant delete
on public.channels to authenticated;

grant insert (channel_id, content)
on public.messages to authenticated;

grant update (content)
on public.messages to authenticated;

grant delete
on public.messages to authenticated;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.is_covil_member(uuid) from public, anon, authenticated;
revoke all on function private.is_covil_owner(uuid) from public, anon, authenticated;
revoke all on function private.shares_covil(uuid) from public, anon, authenticated;
revoke all on function private.can_access_channel(uuid, boolean) from public, anon, authenticated;
revoke all on function private.can_access_voice_topic(text) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_covil_member(uuid) to authenticated;
grant execute on function private.is_covil_owner(uuid) to authenticated;
grant execute on function private.shares_covil(uuid) to authenticated;
grant execute on function private.can_access_channel(uuid, boolean) to authenticated;
grant execute on function private.can_access_voice_topic(text) to authenticated;

revoke all on function public.create_covil(text) from public, anon, authenticated;
revoke all on function public.join_covil_by_invite(text) from public, anon, authenticated;
revoke all on function public.get_covil_invite(uuid) from public, anon, authenticated;
revoke all on function public.rotate_covil_invite(uuid) from public, anon, authenticated;
grant execute on function public.create_covil(text) to authenticated;
grant execute on function public.join_covil_by_invite(text) to authenticated;
grant execute on function public.get_covil_invite(uuid) to authenticated;
grant execute on function public.rotate_covil_invite(uuid) to authenticated;

-- Mensagens sao o unico recurso persistente publicado no Realtime neste MVP.
alter table public.messages replica identity full;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

comment on schema private is
  'Funcoes internas do banco; nao deve ser exposto pela Data API.';

comment on type public.covil_member_role is
  'Papel imutavel de um participante dentro de um Covil.';
comment on type public.channel_kind is
  'Tipo de canal: mensagens persistentes ou sala de voz WebRTC.';

comment on table public.profiles is
  'Perfil publico somente para usuarios que compartilham ao menos um Covil.';
comment on column public.profiles.id is
  'Mesmo UUID de auth.users; criado automaticamente por trigger.';

comment on table public.covils is
  'Grupo privado acessivel apenas aos seus membros.';
comment on column public.covils.invite_code is
  'Convite aleatorio de 128 bits, visivel ao owner e substituido apos cada uso.';

comment on table public.covil_members is
  'Associacao entre perfis e Covils; owner e unico por indice parcial.';
comment on table public.channels is
  'Canais de texto e voz pertencentes a um Covil.';
comment on table public.messages is
  'Mensagens persistentes permitidas somente em canais de texto.';

comment on function public.create_covil(text) is
  'Cria um Covil, associa o usuario autenticado como owner e cria geral/Lobby.';
comment on function public.join_covil_by_invite(text) is
  'Associa o usuario autenticado ao Covil identificado por um convite valido.';
