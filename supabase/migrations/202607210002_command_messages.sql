-- Command results are generated records: authors may delete them, but their
-- content and outcome must remain immutable after publication.

alter table public.messages
  drop constraint if exists messages_kind_valid;
alter table public.messages
  add constraint messages_kind_valid
  check (kind in ('text', 'poll', 'command'));

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
    or (
      kind = 'command'
      and jsonb_typeof(payload) = 'object'
      and payload ->> 'command' in ('dice', 'roulette')
    )
  );

-- Preserve the result of command messages created by previous application
-- versions as well.
update public.messages
set
  kind = 'command',
  payload = jsonb_build_object(
    'command',
    case when content like '🎲 Dado %' then 'dice' else 'roulette' end
  )
where kind = 'text'
  and (content like '🎲 Dado %' or content like '🎡 Roleta:%');

drop policy if exists messages_update_own_in_text_channel on public.messages;
create policy messages_update_own_in_text_channel
on public.messages
for update
to authenticated
using (
  author_id = auth.uid()
  and kind = 'text'
  and private.can_access_channel(channel_id, true)
)
with check (
  author_id = auth.uid()
  and kind = 'text'
  and private.can_access_channel(channel_id, true)
);

create or replace function public.create_covil_command_result(
  p_channel_id uuid,
  p_command text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_command text := lower(btrim(p_command));
  v_content text := btrim(p_content);
  v_message_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if not private.can_access_channel(p_channel_id, true) then
    raise exception 'Canal de texto indisponivel.' using errcode = '42501';
  end if;

  if v_command is null or v_command not in ('dice', 'roulette') then
    raise exception 'Comando invalido.' using errcode = '22023';
  end if;

  if v_content is null or char_length(v_content) not between 1 and 2000 then
    raise exception 'O resultado deve ter entre 1 e 2000 caracteres.'
      using errcode = '22023';
  end if;

  if (
    v_command = 'dice'
    and v_content not like '🎲 Dado %'
  ) or (
    v_command = 'roulette'
    and v_content not like '🎡 Roleta:%'
  ) then
    raise exception 'O resultado nao corresponde ao comando informado.'
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
    v_content,
    'command',
    jsonb_build_object('command', v_command)
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;

revoke all on function public.create_covil_command_result(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.create_covil_command_result(uuid, text, text)
to authenticated;

comment on function public.create_covil_command_result(uuid, text, text) is
  'Publica resultado imutavel de dado ou roleta em um canal de texto acessivel.';
comment on column public.messages.kind is
  'Tipo renderizavel: texto editavel, votacao ou resultado imutavel de comando.';
