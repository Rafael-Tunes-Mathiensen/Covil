-- Renomeia canais com a mesma permissão usada para criá-los e reordená-los.
-- A RPC centraliza validação, unicidade por tipo e autorização.
create or replace function public.rename_covil_channel(
  p_channel_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_covil_id uuid;
  v_kind public.channel_kind;
  v_name text := btrim(p_name);
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception 'O nome do canal deve ter entre 1 e 40 caracteres.'
      using errcode = '22023';
  end if;

  select channel.covil_id, channel.kind
  into v_covil_id, v_kind
  from public.channels as channel
  where channel.id = p_channel_id
    and private.has_covil_permission(channel.covil_id, 'manage_channels');

  if not found then
    raise exception 'Canal indisponivel ou permissao para gerenciar canais ausente.'
      using errcode = '42501';
  end if;

  perform 1
  from public.covils
  where id = v_covil_id
  for update;

  if exists (
    select 1
    from public.channels as channel
    where channel.covil_id = v_covil_id
      and channel.kind = v_kind
      and channel.id <> p_channel_id
      and lower(channel.name) = lower(v_name)
  ) then
    raise exception 'Ja existe um canal desse tipo com esse nome.'
      using errcode = '23505';
  end if;

  update public.channels
  set name = v_name
  where id = p_channel_id
    and covil_id = v_covil_id;
end;
$$;

-- O cliente passa a atualizar nomes e posições somente pelas RPCs validadas.
drop policy if exists channels_update_owner on public.channels;
revoke update (name, position) on public.channels from authenticated;

revoke all on function public.rename_covil_channel(uuid, text)
from public, anon, authenticated;
grant execute on function public.rename_covil_channel(uuid, text)
to authenticated;

comment on function public.rename_covil_channel(uuid, text) is
  'Renomeia um canal para quem possui manage_channels, preservando tipo e posicao.';
