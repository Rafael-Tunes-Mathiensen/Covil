-- Mantém a ordem dos canais sincronizada entre todos os membros do Covil.
-- A operação é atômica e reutiliza a permissão existente de gerenciar canais.
create or replace function public.reorder_covil_channels(
  p_covil_id uuid,
  p_kind public.channel_kind,
  p_channel_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_channel_count integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if not private.has_covil_permission(p_covil_id, 'manage_channels') then
    raise exception 'Permissao para gerenciar canais obrigatoria.'
      using errcode = '42501';
  end if;

  if p_kind is null or p_channel_ids is null or cardinality(p_channel_ids) > 25 then
    raise exception 'A ordem dos canais e invalida.' using errcode = '22023';
  end if;

  perform 1
  from public.covils
  where id = p_covil_id
  for update;

  if not found then
    raise exception 'Covil nao encontrado.' using errcode = 'P0002';
  end if;

  select count(*)
  into v_channel_count
  from public.channels
  where covil_id = p_covil_id
    and kind = p_kind;

  if cardinality(p_channel_ids) <> v_channel_count
    or (select count(distinct channel_id) from unnest(p_channel_ids) as ids(channel_id)) <> v_channel_count
    or exists (
      select 1
      from unnest(p_channel_ids) as ids(channel_id)
      left join public.channels as channel
        on channel.id = ids.channel_id
        and channel.covil_id = p_covil_id
        and channel.kind = p_kind
      where channel.id is null
    ) then
    raise exception 'A lista deve conter todos os canais desse tipo uma unica vez.'
      using errcode = '22023';
  end if;

  update public.channels as channel
  set position = (ordered.ordinality - 1)::smallint
  from unnest(p_channel_ids) with ordinality as ordered(channel_id, ordinality)
  where channel.id = ordered.channel_id
    and channel.covil_id = p_covil_id
    and channel.kind = p_kind;
end;
$$;

revoke all on function public.reorder_covil_channels(
  uuid,
  public.channel_kind,
  uuid[]
) from public, anon, authenticated;

grant execute on function public.reorder_covil_channels(
  uuid,
  public.channel_kind,
  uuid[]
) to authenticated;

comment on function public.reorder_covil_channels(uuid, public.channel_kind, uuid[]) is
  'Reordena atomicamente todos os canais de um tipo para quem possui manage_channels.';
