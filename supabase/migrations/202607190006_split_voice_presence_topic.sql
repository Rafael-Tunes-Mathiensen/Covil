-- Separa o roster de Presence dos sinais SDP/ICE. Assim, observar quem está em
-- uma sala não assina o Broadcast privado da chamada.

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
    where p_topic in (
        'voice:' || channel.id::text,
        'voice-presence:' || channel.id::text
      )
      and channel.kind = 'voice'
      and member.user_id = auth.uid()
  );
$$;

drop policy if exists covil_voice_realtime_select on realtime.messages;
create policy covil_voice_realtime_select
on realtime.messages
for select
to authenticated
using (
  private.can_access_voice_topic((select realtime.topic()))
  and (
    (
      realtime.messages.extension = 'broadcast'
      and (select realtime.topic()) like 'voice:%'
      and (select realtime.topic()) not like 'voice-presence:%'
    )
    or (
      realtime.messages.extension = 'presence'
      and (select realtime.topic()) like 'voice-presence:%'
    )
  )
);

drop policy if exists covil_voice_realtime_insert on realtime.messages;
create policy covil_voice_realtime_insert
on realtime.messages
for insert
to authenticated
with check (
  private.can_access_voice_topic((select realtime.topic()))
  and (
    (
      realtime.messages.extension = 'broadcast'
      and (select realtime.topic()) like 'voice:%'
      and (select realtime.topic()) not like 'voice-presence:%'
    )
    or (
      realtime.messages.extension = 'presence'
      and (select realtime.topic()) like 'voice-presence:%'
    )
  )
);
