-- O Realtime exige permissao de leitura para Broadcast ao entrar em qualquer
-- canal privado, inclusive em um canal usado somente por Presence. Autoriza
-- essa leitura de handshake no roster sem permitir enviar Broadcast nele.

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
      and (
        (
          (select realtime.topic()) like 'voice:%'
          and (select realtime.topic()) not like 'voice-presence:%'
        )
        or (select realtime.topic()) like 'voice-presence:%'
      )
    )
    or (
      realtime.messages.extension = 'presence'
      and (select realtime.topic()) like 'voice-presence:%'
    )
  )
);
