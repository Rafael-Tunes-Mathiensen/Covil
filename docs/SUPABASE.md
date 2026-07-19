# Supabase do Covil

O Supabase concentra autenticação, perfis, grupos privados, canais, cargos,
mensagens, autorização e sinalização em tempo real. Áudio, tela e amostras usadas
para detectar fala trafegam ou são analisados nos navegadores e não são
armazenados no banco.

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

As seis migrations canônicas ficam em `supabase/migrations/`. Elas aplicam, em
ordem, o modelo privado, o limite de seis membros e console do proprietário, o
ajuste de métricas, o Realtime do workspace e, na migration 005, cargos, criação
controlada de canais e moderação cooperativa de voz. A migration 006 separa os
tópicos privados de sinalização e Presence. Não execute trechos
isolados: funções, grants, triggers e policies foram projetados para entrar
juntos.

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
| `channels` | Canais `text` e `voice` | Membros leem; criação usa RPC e permissão; owner edita ou exclui |
| `covil_roles` | Cargos com cor e permissões | Membros leem; só o owner cria ou exclui |
| `covil_member_roles` | Atribuições acumuláveis de cargos | Membros leem; só o owner atribui ou remove |
| `voice_moderation_states` | Mute persistente e pedidos de desconexão por sala | Membros leem; escrita somente pela RPC autorizada |
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

### Criar canais

Owner e membros com `manage_channels` criam canais pela RPC; `INSERT` direto é
revogado. A função trava a linha do Covil para respeitar o limite de 25 mesmo em
requisições concorrentes.

```ts
const { data: channelId, error } = await supabase.rpc('create_covil_channel', {
  p_covil_id: covilId,
  p_name: 'estratégias',
  p_kind: 'text', // ou 'voice'
})
```

### Criar e atribuir cargos

Somente o owner administra os até 12 cargos do Covil. Um membro comum pode
receber vários cargos, e sua permissão efetiva é a união de `manage_channels`,
`moderate_voice` e `remove_members` presentes neles.

```ts
const { data: roleId } = await supabase.rpc('create_covil_role', {
  p_covil_id: covilId,
  p_name: 'Guardião da call',
  p_color: '#FF7043',
  p_permissions: ['moderate_voice'],
})

await supabase.rpc('set_covil_member_role', {
  p_covil_id: covilId,
  p_user_id: memberId,
  p_role_id: roleId,
  p_assigned: true,
})
```

`delete_covil_role()` exclui o cargo e suas atribuições. O registro `owner` é a
fonte exclusiva de propriedade: cargos não transferem ownership e não são
atribuídos ao fundador.

### Moderar voz e remover membros

Owner e cargos autorizados usam RPCs em vez de escrever diretamente nas tabelas:

```ts
await supabase.rpc('moderate_covil_voice', {
  p_channel_id: voiceChannelId,
  p_user_id: memberId,
  p_action: 'mute', // 'unmute' ou 'disconnect'
})

await supabase.rpc('remove_covil_member', {
  p_covil_id: covilId,
  p_user_id: memberId,
})
```

`moderate_covil_voice()` exige `moderate_voice` e protege o fundador;
`remove_covil_member()` aceita a própria saída ou `remove_members` e protege o
fundador e a conta proprietária da aplicação. O mute e o pedido de desconexão
são estados persistidos e entregues pelo Realtime, mas aplicados pelo cliente.
Sem uma SFU, um cliente adulterado pode ignorá-los; não trate o recurso como
contenção contra um participante malicioso.

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

`messages`, `covil_members`, `profiles`, `channels`, `covils`, `covil_roles`,
`covil_member_roles` e `voice_moderation_states` integram a publicação
`supabase_realtime`. Mensagens usam o filtro do canal atual:

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
em participantes, perfis, canais, cargos, atribuições, moderação ou dados do
grupo fazem o cliente buscar novamente apenas os registros permitidos pelas
policies RLS. Assim, entradas, remoções e alterações aparecem nos navegadores
conectados sem recarregar a página.

Remova cada canal Realtime quando a assinatura deixar de ser necessária:

```ts
await supabase.removeChannel(subscription)
```

Ofertas ICE/SDP usam Broadcast no tópico privado `voice:<channel_uuid>`.
O roster usa Presence em `voice-presence:<channel_uuid>`: observar uma sala não
publica o usuário como participante, enquanto entrar nela executa `track`. A
migration cria policies em `realtime.messages` que combinam membership,
prefixo do tópico e extensão correta. No tópico de roster, a leitura de
Broadcast também é autorizada porque faz parte do handshake exigido pelo
Realtime para canais privados; o envio de Broadcast continua bloqueado nesse
tópico. O transporte atualiza o JWT antes de assinar e compartilha a assinatura
de Presence da sala entre roster e chamada.
Não grave SDP ou candidatos ICE no histórico do chat; os detalhes de filas e
recuperação estão em [ARCHITECTURE.md](./ARCHITECTURE.md#chamada-de-voz).

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
| Sair/remover membro | Pela RPC: própria saída ou `remove_members`; fundador e app owner são protegidos |
| Criar canal | Pela RPC: owner ou cargo com `manage_channels`; máximo de 25 por Covil |
| Editar/excluir canal | Owner do Covil |
| Ler cargos e atribuições | Membro do mesmo Covil |
| Criar/excluir/atribuir cargo | Somente owner, pelas RPCs; máximo de 12 cargos acumuláveis |
| Ler mensagem | Membro atual do canal/Covil |
| Criar/editar/excluir mensagem | Autor autenticado e membro atual; canal deve ser de texto |
| Observar ou anunciar Presence na voz | Membro autenticado do Covil; somente no tópico `voice-presence:<channel_uuid>` |
| Publicar ou receber sinais WebRTC | Membro autenticado do Covil; somente no tópico `voice:<channel_uuid>` e enquanto assina a chamada |
| Moderar voz | Owner ou cargo com `moderate_voice`; fundador protegido; aplicação cooperativa no cliente |
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
- `voice_moderation_states` autoriza e sincroniza a intenção de moderação, mas
  não intercepta mídia P2P. Mute e desconexão são garantidos apenas no cliente
  oficial; enforcement resistente a cliente adulterado exige uma SFU controlada.
- Não exponha o schema `private` na configuração de schemas da Data API.

## Verificação manual mínima

Teste com três membros autenticados e um quarto usuário sem associação:

1. O usuário A cria um Covil e recebe os dois canais padrão.
2. B e C entram, cada um com o convite vigente; reutilizar um código anterior
   falha.
3. O quarto usuário não consegue ler nenhum registro do Covil.
4. B envia uma mensagem em `geral`; A e C a recebem pelo Realtime.
5. Sem cargo, B não consegue criar canal, moderar voz, remover A nem administrar
   cargos.
6. A cria e atribui a B cargos com `manage_channels` e `moderate_voice`; B cria
   um novo canal e modera C, mas continua sem administrar cargos nem
   moderar o fundador.
7. Selecionar outra sala mostra seus ocupantes sem sair da chamada. Ao clicar em
   **Entrar nesta sala**, o cliente encerra a anterior e conecta à nova; mute e
   disconnect chegam pelo Realtime ao alvo.
8. A RPC rejeita o 26º canal e o 13º cargo, inclusive sob concorrência.
9. B sai pela RPC e deixa de ler mensagens. A pode remover membros comuns, mas
   ninguém altera `owner_id`, `role`, autores ou timestamps pelo cliente.
