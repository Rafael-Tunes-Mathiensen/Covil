# Publicação gratuita

O Covil é uma PWA servida por um Worker pequeno. A configuração adotada usa
Supabase como backend e Sites, sobre Cloudflare Workers, para hospedar a
interface e fornecer a configuração pública em tempo de execução.

## 1. Preparar o Supabase

1. Crie um projeto no painel do Supabase.
2. Em **Authentication → URL Configuration**, registre `http://localhost:5173`;
   a URL publicada será adicionada depois do primeiro deploy.
3. Copie a URL do projeto e a chave pública `anon`.
4. Vincule o projeto e aplique a migration com o Supabase CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   npx supabase migration list
   ```

5. Crie `.env.local` a partir de `.env.example` e teste localmente.
6. Para o piloto com até seis pessoas, mantenha novos cadastros habilitados
   e deixe a confirmação de e-mail temporariamente desativada. O SMTP padrão do
   Supabase é restrito e não é apropriado para entregar confirmações aos amigos.
   Crie as contas, confirme o acesso de todos e então desabilite novos cadastros.
7. Não ative CAPTCHA nesta etapa: o frontend ainda não envia um token de CAPTCHA.
   Integre o provedor no cliente antes de ativar essa exigência no Auth.

Quando houver SMTP próprio, reative a confirmação de e-mail antes de ampliar o
acesso. Não habilite login anônimo.

As instruções e os cuidados de segurança estão em [SUPABASE.md](./SUPABASE.md).

## 2. Gerar o pacote do Sites

O `@cloudflare/vite-plugin` usa `wrangler.jsonc` para gerar dois artefatos:

- `dist/client`, com a PWA e os recursos estáticos;
- `dist/server/index.js`, com o Worker que serve a SPA e `/config.js`.

Antes de publicar, valide o mesmo código que será empacotado:

```bash
npm ci
npm run lint
npm test
npm run build
```

O arquivo `.openai/hosting.json` associa o repositório ao projeto no Sites. Ele
é criado uma única vez pelo fluxo de hospedagem e não deve receber IDs copiados
de outro site.

## 3. Publicar no Sites

1. Crie ou selecione o site **Covil** na integração Sites.
2. Cadastre estas variáveis de ambiente em tempo de execução:

   ```text
   SUPABASE_URL
   SUPABASE_ANON_KEY
   ICE_SERVERS
   ```

3. Empacote `dist`, salve uma versão e publique-a.
4. Copie a URL resultante e registre-a como **Site URL** e redirect permitido em
   **Authentication → URL Configuration** no Supabase.
5. Abra uma nova sessão pela URL publicada para validar que `/config.js` carregou
   as coordenadas do backend e que a tela de login aparece.

`SUPABASE_ANON_KEY` é uma chave pública, não um segredo administrativo. O mesmo
vale para qualquer configuração ICE entregue ao navegador. Nunca cadastre
`service_role`, senha do banco ou credencial TURN permanente nesse fluxo.

`ICE_SERVERS` aceita tanto uma lista simples separada por vírgulas:

```text
stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478
```

quanto um array JSON completo de `RTCIceServer`:

```json
[
  { "urls": "stun:stun.example.net:3478" },
  {
    "urls": ["turn:turn.example.net:3478?transport=udp"],
    "username": "usuario-efemero",
    "credential": "credencial-efemera"
  }
]
```

A URL do site precisa ser acessível aos amigos, portanto a interface publicada
pode ser pública. Isso não torna os dados públicos: o Supabase exige login, e as
políticas RLS limitam grupos, canais e mensagens aos membros autorizados. O
convite do Covil também deve continuar sendo compartilhado em canal privado.

Cada nova versão exige build, empacotamento, salvamento e deploy no Sites; o push
no GitHub mantém o código versionado e executa o CI, mas não publica sozinho. Um
domínio próprio é opcional. O arquivo `public/_headers` adiciona CSP e políticas
de permissão aos recursos estáticos. Caso use um domínio personalizado para o
Supabase, inclua esse host em `connect-src` antes do deploy.

## 4. Validar antes de convidar

- crie três contas em navegadores ou perfis diferentes;
- entre no mesmo Covil usando o código de convite e confirme que ele muda;
- confirme envio e recebimento de mensagens;
- permita o microfone e teste entrada/saída da sala;
- com três contas, deixe duas pessoas em salas diferentes e confirme que a lista de ocupantes aparece sem entrar; depois use **Entrar nesta sala** para trocar explicitamente;
- compartilhe uma janela em 720p;
- teste em redes diferentes para descobrir se será necessário TURN.

O padrão atual usa somente STUN, que não retransmite mídia. Sem TURN, algumas combinações de operadora, firewall, NAT simétrico ou CGNAT podem manter login, chat e roster funcionando, mas impedir áudio ou tela. Esse é o principal risco de conectividade restante e deve ser resolvido com credenciais TURN efêmeras.
