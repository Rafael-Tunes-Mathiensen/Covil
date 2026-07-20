-- Perfis completos, votacoes e edicao segura de cargos.

alter table public.profiles
  add column if not exists bio text;

alter table public.profiles
  drop constraint if exists profiles_bio_valid;
alter table public.profiles
  add constraint profiles_bio_valid check (
    bio is null
    or (
      bio = btrim(bio)
      and char_length(bio) <= 240
    )
  );

grant update (bio) on public.profiles to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_select_authenticated on storage.objects;
create policy avatars_select_authenticated
on storage.objects
for select
to authenticated
using (bucket_id = 'avatars');

drop policy if exists avatars_insert_self on storage.objects;
create policy avatars_insert_self
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_update_self on storage.objects;
create policy avatars_update_self
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_delete_self on storage.objects;
create policy avatars_delete_self
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

alter table public.messages
  add column if not exists kind text not null default 'text',
  add column if not exists payload jsonb;

alter table public.messages
  drop constraint if exists messages_kind_valid;
alter table public.messages
  add constraint messages_kind_valid check (kind in ('text', 'poll'));

alter table public.messages
  drop constraint if exists messages_payload_valid;
alter table public.messages
  add constraint messages_payload_valid check (
    (
      kind = 'text'
      and payload is null
    )
    or (
      kind = 'poll'
      and jsonb_typeof(payload) = 'object'
      and jsonb_typeof(payload -> 'options') = 'array'
      and jsonb_array_length(payload -> 'options') between 2 and 10
    )
  );

create table if not exists public.poll_votes (
  message_id uuid not null
    references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  option_index smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (message_id, user_id),
  constraint poll_votes_option_nonnegative check (option_index >= 0)
);

create index if not exists poll_votes_message_option_idx
  on public.poll_votes (message_id, option_index);

drop trigger if exists poll_votes_set_updated_at on public.poll_votes;
create trigger poll_votes_set_updated_at
before update on public.poll_votes
for each row execute function private.set_updated_at();

alter table public.poll_votes enable row level security;
alter table public.poll_votes force row level security;

drop policy if exists poll_votes_select_channel_members on public.poll_votes;
create policy poll_votes_select_channel_members
on public.poll_votes
for select
to authenticated
using (
  exists (
    select 1
    from public.messages as message
    where message.id = poll_votes.message_id
      and private.can_access_channel(message.channel_id, true)
  )
);

revoke all on table public.poll_votes from public, anon, authenticated;
grant select on table public.poll_votes to authenticated;

create or replace function public.create_covil_poll(
  p_channel_id uuid,
  p_question text,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_question text := btrim(p_question);
  v_options text[];
  v_message_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if not private.can_access_channel(p_channel_id, true) then
    raise exception 'Canal de texto indisponivel.' using errcode = '42501';
  end if;

  if v_question is null or char_length(v_question) not between 1 and 200 then
    raise exception 'A pergunta deve ter entre 1 e 200 caracteres.'
      using errcode = '22023';
  end if;

  select array_agg(btrim(item.option) order by item.ordinality)
  into v_options
  from unnest(coalesce(p_options, array[]::text[]))
    with ordinality as item(option, ordinality)
  where item.option is not null
    and btrim(item.option) <> '';

  if cardinality(v_options) not between 2 and 10 then
    raise exception 'A votacao precisa ter entre 2 e 10 opcoes.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_options) as option(value)
    where char_length(option.value) > 80
  ) then
    raise exception 'Cada opcao pode ter no maximo 80 caracteres.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct lower(option.value))
    from unnest(v_options) as option(value)
  ) <> cardinality(v_options) then
    raise exception 'As opcoes da votacao devem ser diferentes.'
      using errcode = '22023';
  end if;

  insert into public.messages (
    channel_id,
    author_id,
    content,
    kind,
    payload
  )
  values (
    p_channel_id,
    auth.uid(),
    v_question,
    'poll',
    jsonb_build_object('options', to_jsonb(v_options))
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;

create or replace function public.vote_covil_poll(
  p_message_id uuid,
  p_option_index integer
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_channel_id uuid;
  v_kind text;
  v_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  select channel_id, kind, payload
  into v_channel_id, v_kind, v_payload
  from public.messages
  where id = p_message_id
  for key share;

  if not found or v_kind <> 'poll' then
    raise exception 'Votacao nao encontrada.' using errcode = 'P0002';
  end if;

  if not private.can_access_channel(v_channel_id, true) then
    raise exception 'Votacao indisponivel.' using errcode = '42501';
  end if;

  if (
    p_option_index is null
    or p_option_index < 0
    or p_option_index >= jsonb_array_length(v_payload -> 'options')
  ) then
    raise exception 'Opcao de voto invalida.' using errcode = '22023';
  end if;

  insert into public.poll_votes (message_id, user_id, option_index)
  values (p_message_id, auth.uid(), p_option_index)
  on conflict (message_id, user_id) do update
  set option_index = excluded.option_index;
end;
$$;

create or replace function public.update_covil_role(
  p_role_id uuid,
  p_name text,
  p_color text,
  p_permissions public.covil_permission[]
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_covil_id uuid;
  v_name text := btrim(p_name);
  v_color text := upper(btrim(p_color));
  v_permissions public.covil_permission[];
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
    raise exception 'Somente o owner pode editar cargos.' using errcode = '42501';
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

  if exists (
    select 1
    from public.covil_roles
    where covil_id = v_covil_id
      and id <> p_role_id
      and lower(name) = lower(v_name)
  ) then
    raise exception 'Ja existe um cargo com esse nome.' using errcode = '23505';
  end if;

  update public.covil_roles
  set
    name = v_name,
    color = v_color,
    permissions = v_permissions
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

  perform 1
  from public.covil_members
  where covil_id = p_covil_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Membro nao encontrado.' using errcode = 'P0002';
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

revoke all on function public.create_covil_poll(uuid, text, text[])
from public, anon, authenticated;
revoke all on function public.vote_covil_poll(uuid, integer)
from public, anon, authenticated;
revoke all on function public.update_covil_role(
  uuid,
  text,
  text,
  public.covil_permission[]
) from public, anon, authenticated;

grant execute on function public.create_covil_poll(uuid, text, text[])
to authenticated;
grant execute on function public.vote_covil_poll(uuid, integer)
to authenticated;
grant execute on function public.update_covil_role(
  uuid,
  text,
  text,
  public.covil_permission[]
) to authenticated;

alter table public.poll_votes replica identity full;

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
      and tablename = 'poll_votes'
  ) then
    alter publication supabase_realtime add table public.poll_votes;
  end if;
end;
$$;

comment on column public.profiles.bio is
  'Descricao curta visivel apenas para usuarios que compartilham um Covil.';
comment on column public.messages.kind is
  'Tipo renderizavel da mensagem: texto comum ou votacao.';
comment on column public.messages.payload is
  'Dados estruturados validados para mensagens interativas.';
comment on table public.poll_votes is
  'Um voto atual por membro e por mensagem de votacao.';
comment on function public.update_covil_role(
  uuid,
  text,
  text,
  public.covil_permission[]
) is
  'Permite ao fundador alterar nome, cor e permissoes de um cargo existente.';
