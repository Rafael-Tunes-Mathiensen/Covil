-- A permissão de administrar o Covil é separada das ações operacionais.
-- Ela pode ser delegada por cargo sem transferir a propriedade do grupo.

alter type public.covil_permission
add value if not exists 'manage_covil';

alter table public.covil_roles
drop constraint covil_roles_permissions_valid;

alter table public.covil_roles
add constraint covil_roles_permissions_valid check (
  cardinality(permissions) <= 4
  and array_position(permissions, null) is null
);
