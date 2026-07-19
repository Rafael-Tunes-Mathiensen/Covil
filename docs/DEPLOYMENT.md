# Publicação gratuita

O resultado é uma PWA estática. A forma mais simples de compartilhá-la é usar Supabase para o backend e Cloudflare Pages para o frontend.

## 1. Preparar o Supabase

1. Crie um projeto no painel do Supabase.
2. Abra **SQL Editor** e execute `supabase/migrations/202607190001_initial.sql`.
3. Em **Authentication → URL Configuration**, registre a URL local e a futura URL do Cloudflare.
4. Copie a URL do projeto e a chave pública `anon`.
5. Crie `.env.local` a partir de `.env.example` e teste localmente.
6. Para este piloto, habilite confirmação de e-mail e proteção anti-bot no Auth.
   Crie as contas dos amigos e desative novos cadastros depois que todos entrarem,
   evitando que robôs consumam a cota gratuita.

As instruções e os cuidados de segurança estão em [SUPABASE.md](./SUPABASE.md).

## 2. Publicar no Cloudflare Pages

1. No painel da Cloudflare, crie um projeto Pages conectado a este repositório.
2. Escolha o preset **Vite**.
3. Use `npm run build` como comando de build e `dist` como diretório de saída.
4. Cadastre estas variáveis no projeto:

   ```text
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   VITE_ICE_SERVERS
   ```

5. Faça o primeiro deploy e copie o endereço `*.pages.dev`.
6. Volte ao Supabase e adicione esse endereço às URLs permitidas do Auth.

Cada push na branch `main` gera uma nova publicação. Um domínio próprio é opcional.
O arquivo `public/_headers` adiciona CSP e políticas de permissão no Cloudflare
Pages. Caso use um domínio personalizado para o Supabase, inclua esse host em
`connect-src` antes do deploy.

## 3. Validar antes de convidar

- crie duas contas em navegadores ou perfis diferentes;
- entre no mesmo Covil usando o código de convite e confirme que ele muda;
- confirme envio e recebimento de mensagens;
- permita o microfone e teste entrada/saída da sala;
- compartilhe uma janela em 720p;
- teste em redes diferentes para descobrir se será necessário TURN.

Sem TURN, algumas combinações de operadora, firewall ou CGNAT podem impedir a mídia mesmo que o chat funcione. Esse é o principal risco de conectividade restante.
