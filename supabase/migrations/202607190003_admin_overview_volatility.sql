-- A leitura inclui o horario da propria instrucao, portanto nao deve ser marcada
-- como STABLE pelo otimizador.
alter function public.get_admin_overview() volatile;
