-- Atualiza configurações gerais sem depender de escrita direta na tabela.
-- Owner sempre passa por has_covil_permission; membros precisam de manage_covil.

create or replace function public.update_covil_settings(
  p_covil_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_name text := btrim(p_name);
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if not private.has_covil_permission(p_covil_id, 'manage_covil') then
    raise exception 'Voce nao tem permissao para administrar este Covil.'
      using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) not between 2 and 60 then
    raise exception 'O nome do Covil deve ter entre 2 e 60 caracteres.'
      using errcode = '22023';
  end if;

  update public.covils
  set name = v_name
  where id = p_covil_id;

  if not found then
    raise exception 'Covil nao encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_covil_settings(uuid, text)
from public, anon, authenticated;

grant execute on function public.update_covil_settings(uuid, text)
to authenticated;

comment on function public.update_covil_settings(uuid, text) is
  'Altera configuracoes gerais para owner ou membro com manage_covil.';
