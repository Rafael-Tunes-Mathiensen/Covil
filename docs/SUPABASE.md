# Supabase do Covil

O Supabase concentra autenticação, perfis, grupos privados, canais, mensagens e
sinalização em tempo real. Áudio e compartilhamento de tela continuam trafegando
entre os participantes por WebRTC; eles não são armazenados no banco.

## Preparar um projeto

1. Crie um projeto no painel do Supabase.
2. Em **Authentication > URL Configuration**, configure a URL publicada do app e
   os endereços locais usados no desenvolvimento, por exemplo
   `http://localhost:5173`.
   Quando a confirmação de e-mail estiver ativa, abra o link no mesmo navegador
   que iniciou o cadastro para que o verificador PKCE local esteja disponível.
3. Para desenvolvimento, copie `.env.example` para `.env.local` e preencha:

   ```dotenv
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
   ```

   Na hospedagem, não use o prefixo `VITE_`: configure `SUPABASE_URL` e
   `SUPABASE_ANON_KEY` no ambiente de execução do Sites. O Worker expõe apenas
   esses valores públicos ao cliente por `/config.js`.
4. Vincule o Supabase CLI, revise e aplique a migration:

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   npx supabase migration list
   ```

As migrations canônicas ficam em `supabase/migrations/`: a primeira cria o
modelo privado e a segunda adiciona o limite de seis membros e o console do
proprietário. Não execute trechos isolados no ambiente remoto: funções, grants,
triggers e policies foram projetados para entrar juntos.

Para um banco local já inicializado pelo Supabase CLI, `supabase db reset`
reaplica todas as migrations. Esse comando apaga os dados locais existentes.

## Auth para o piloto

O SMTP padrão do Supabase é restrito e não deve ser tratado como serviço de
entrega para os endereços dos amigos. Para o primeiro grupo de até seis
pessoas:

1. mantenha cadastro por e-mail habilitado;
2. deixe a confirmação de e-mail temporariamente desativada;
3. crie e valide todas as contas do grupo;
4. desabilite novos cadastros quando todos conseguirem entrar.

Não ative CAPTCHA ainda. O formulário atual não envia `captchaToken`, portanto
ativar essa exigência no painel bloquearia os cadastros. Antes de abrir o Covil
para mais pessoas, integre CAPTCHA no frontend, configure SMTP próprio e volte a
habilitar confirmação de e-mail.

## Modelo de dados

| Recurso | Finalidade | Regra principal |
| --- | --- | --- |
| `profiles` | Nome e avatar ligados a `auth.users` | Visível ao próprio usuário e a pessoas que compartilham um Covil |
| `covils` | Grupo privado e código de convite | Membros veem apenas os dados públicos; só o owner consulta ou renova o convite |
| `covil_members` | Participantes e papel `owner/member` | Visível aos membros do mesmo Covil |
| `channels` | Canais `text` e `voice` | Membros leem; owner administra |
| `messages` | Histórico dos canais de texto | Membros leem; cada autor escreve, edita ou exclui as próprias |

Ao cadastrar um usuário, o trigger `private.handle_new_user()` cria o perfil. A
migration também preenche perfis ausentes de usuários que já existiam.

## Operações esperadas pelo frontend

### Criar um Covil

Não insira diretamente em `covils` ou `covil_members`. Use a RPC atômica:

```ts
const { data: covil, error } = await supabase.rpc('create_covil', {
  p_name: 'Covil dos Amigos',
})
```

Ela valida o nome, gera um convite aleatório de 128 bits, registra o usuário atual como
`owner` e cria os canais `geral` (texto) e `Lobby` (voz).

### Entrar por convite

```ts
const { data: covil, error } = await supabase.rpc(
  'join_covil_by_invite',
  { p_invite_code: inviteCode },
)
```

A associação não é duplicada se o usuário já for membro. Cada código aceita uma
única entrada: ele é substituído atomicamente no primeiro uso, inclusive quando
duas tentativas chegam ao mesmo tempo. O código pode ser digitado em maiúsculas
ou minúsculas. O banco rejeita uma sétima associação mesmo sob tentativas
concorrentes.

### Console do proprietário

A conta allowlisted em `private.app_admins` consulta o status por
`is_app_admin()` e carrega `get_admin_overview()` e `get_admin_access()`. Essas
RPCs expõem contagens, tamanho do banco, contas e memberships, mas não retornam
o conteúdo das mensagens. `admin_remove_covil_member()` remove apenas membros
comuns; o fundador do Covil e a conta proprietária são protegidos.

Adicionar ou trocar um proprietário da aplicação é uma operação administrativa
de banco e deve ser feita por migration revisada. Nunca implemente essa decisão
por e-mail, metadado controlado pelo cliente ou botão escondido no frontend.

### Consultar ou renovar um convite

Somente o owner pode obter o convite atual ou invalidá-lo manualmente:

```ts
const { data: currentInvite } = await supabase.rpc('get_covil_invite', {
  p_covil_id: covilId,
})

const { data: renewedInvite } = await supabase.rpc('rotate_covil_invite', {
  p_covil_id: covilId,
})
```

O campo `invite_code` não é concedido para leitura direta pela Data API.

### Enviar uma mensagem

O cliente informa apenas o canal e o conteúdo. O banco obtém o autor do JWT e
controla os timestamps:

```ts
const { data: message, error } = await supabase
  .from('messages')
  .insert({ channel_id: channelId, content })
  .select()
  .single()
```

Enviar `author_id`, `created_at` ou `updated_at` pelo cliente é bloqueado pelos
grants de coluna. Mensagens vazias, acima de 4.000 caracteres ou destinadas a
um canal de voz também são rejeitadas.

### Ouvir atualizações do Covil

`messages`, `covil_members`, `profiles`, `channels` e `covils` são adicionadas à
publicação `supabase_realtime`. Mensagens usam o filtro do canal atual:

```ts
const subscription = supabase
  .channel(`messages:${channelId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `channel_id=eq.${channelId}`,
    },
    handleMessageChange,
  )
  .subscribe()
```

O hook `useCovilWorkspace` mantém outra assinatura para o Covil atual. Mudanças
em participantes, perfis, canais ou dados do grupo fazem o cliente buscar
novamente apenas os registros permitidos pelas policies RLS. Assim, entradas,
remoções e alterações aparecem nos navegadores conectados sem recarregar a
página.

Remova cada canal Realtime ao trocar de tela ou sair:

```ts
await supabase.removeChannel(subscription)
```

Presença em sala e ofertas ICE/SDP do WebRTC usam o tópico privado
`voice:<channel_uuid>` com Broadcast/Presence, nunca `messages`. A migration
cria policies em `realtime.messages` que autorizam somente membros do Covil
correspondente. O transporte atualiza o JWT do Realtime antes de assinar o
canal. Não grave SDP ou candidatos ICE no histórico do chat.

No painel do Supabase, abra **Realtime > Settings**, mantenha o serviço ativo e
desative **Allow public access to channels**. Os canais de voz usam
`private: true`, portanto Broadcast e Presence continuam disponíveis apenas
para usuários autenticados que passam pelas policies acima.

## Matriz de autorização

| Ação | Regra de RLS/grant |
| --- | --- |
| Ler perfil | Próprio perfil ou usuário com Covil compartilhado |
| Atualizar perfil | Próprio usuário; somente `display_name` e `avatar_url` |
| Criar Covil | Somente pela RPC `create_covil` autenticada |
| Entrar em Covil | Somente pela RPC autenticada e com convite válido |
| Lotação do Covil | Máximo de 6 memberships, garantido por trigger transacional |
| Consultar/renovar convite | Somente o owner, pelas RPCs dedicadas |
| Atualizar/excluir Covil | Owner; apenas `name` pode ser atualizado |
| Sair/remover membro | Membro pode remover a si próprio; owner pode remover membros, nunca o registro owner |
| Criar/editar/excluir canal | Owner do Covil |
| Ler mensagem | Membro atual do canal/Covil |
| Criar/editar/excluir mensagem | Autor autenticado e membro atual; canal deve ser de texto |
| Sinalizar e anunciar presença na voz | Membro autenticado do Covil associado ao canal privado |
| Ver console operacional | Somente UUID allowlisted em `private.app_admins`; sem leitura global de mensagens |
| Remover acesso pelo console | Administrador global pode remover membro comum; fundador e proprietário são protegidos |
| Acesso anônimo | Nenhum acesso às tabelas ou RPCs |

As tabelas usam `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`. As
funções `SECURITY DEFINER` têm `search_path` vazio e recebem a identidade de
`auth.uid()`, reduzindo risco de personificação e de sequestro de objetos SQL.

## Cuidados operacionais

- Nunca coloque a `service_role` no navegador, no repositório, em variáveis
  `VITE_*` ou no ambiente de configuração pública do Sites. Ela ignora RLS. O
  frontend usa somente a chave pública `anon` junto ao JWT do usuário.
- O convite tem 128 bits, é visível apenas ao owner e muda após cada entrada.
  Ainda assim, compartilhe-o somente em canais privados; o owner pode invalidar
  o código atual pelo botão de renovação.
- Excluir o owner exclui seu perfil e, por cascata, os Covils que ele possui.
  Exclusões administrativas de usuários devem ser tratadas como destrutivas.
- RLS controla autorização, não volume. A URL hospedada pode ser pública para que
  os amigos abram a interface, mas tabelas e RPCs continuam exigindo Auth e as
  policies limitam os dados aos membros do Covil. Antes de ampliar o grupo de
  usuários, acrescente proteção contra spam e rate limiting.
- Para o piloto, siga a sequência da seção **Auth para o piloto** e nunca habilite
  login anônimo. Só ative CAPTCHA depois que o frontend estiver integrado ao
  provedor escolhido.
- Em Postgres Changes, eventos `DELETE` têm limitações de filtragem/RLS porque a
  linha já não existe. O cliente não deve depender do payload antigo completo;
  revalide a lista quando precisar refletir exclusões remotas.
- Não exponha o schema `private` na configuração de schemas da Data API.

## Verificação manual mínima

Teste com dois usuários autenticados e um terceiro sem associação:

1. O usuário A cria um Covil e recebe os dois canais padrão.
2. O usuário B entra com o convite, passa a ver o Covil, os canais e o perfil
   de A; reutilizar o código anterior falha.
3. O usuário C não consegue ler nenhum desses registros.
4. B envia uma mensagem em `geral`; A a recebe pelo Realtime.
5. B não consegue criar um canal, mudar o Covil nem publicar em `Lobby`.
6. B sai removendo sua associação e deixa imediatamente de ler mensagens.
7. A consegue remover membros e excluir o Covil, mas ninguém consegue alterar
   `owner_id`, `role`, autores ou timestamps pelo cliente.
