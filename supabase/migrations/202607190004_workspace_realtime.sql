-- Mantém mensagens, participantes e informações do Covil sincronizados entre
-- navegadores conectados. A migration também reafirma a publicação de messages
-- para projetos em que a configuração inicial do Realtime tenha sido alterada.
alter table public.covil_members replica identity full;

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
    'channels',
    'covil_members',
    'covils',
    'messages',
    'profiles'
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
