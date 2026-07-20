# Segurança

Este projeto está em desenvolvimento e ainda não deve ser tratado como um serviço público de grande escala.

## Segredos

- Nunca versione `.env` ou `.env.local`.
- A chave `anon` do Supabase pode aparecer no navegador porque a proteção real é feita por RLS.
- Nunca exponha `service_role`, senha de banco ou credenciais TURN permanentes no frontend.

## Controles atuais

- autenticação gerenciada pelo Supabase;
- retorno de autenticação vinculado ao navegador por PKCE;
- RLS baseada na associação ao Covil;
- canais privados de voz com autorização em `realtime.messages`;
- RPCs com `search_path` vazio e privilégios restritos;
- mensagens renderizadas como texto pelo React;
- edição e exclusão de mensagens limitadas ao próprio autor por RLS e grants de coluna;
- limites de tamanho no navegador e no banco;
- workflow sem permissões de escrita no GitHub.

## Limite de revogação no MVP

Remover uma associação bloqueia novas leituras e novas sinalizações, mas não
derruba uma conexão WebRTC P2P que já estava estabelecida. Em um grupo confiável,
encerre e reabra a sala depois de remover alguém. Antes de oferecer moderação
pública, a sessão de voz deverá ganhar uma versão rotativa para forçar a
renegociação de todos os participantes autorizados.

## Modelo de confiança

O piloto pressupõe de duas a quatro pessoas conhecidas. Um membro autenticado
ainda controla os dados de Presence e sinalização enviados pelo próprio cliente;
não há moderação nem rate limiting de aplicação. Não abra o cadastro ao público
antes de validar integralmente esses payloads, limitar peers/candidatos e ligar a
identidade anunciada ao JWT no servidor.

Para relatar uma vulnerabilidade, abra uma conversa privada com o proprietário do repositório. Não publique credenciais, dados pessoais ou uma exploração funcional em uma issue pública.
