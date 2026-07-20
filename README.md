<div align="center">
  <img src="public/favicon.svg" width="84" alt="Símbolo do Covil" />
  <h1>Covil</h1>
  <p><strong>Toda call merece um Covil.</strong></p>
  <p>Um espaço privado de voz, mensagens e compartilhamento de tela para grupos pequenos.</p>

  [![Qualidade](https://github.com/Rafael-Tunes-Mathiensen/Covil/actions/workflows/ci.yml/badge.svg)](https://github.com/Rafael-Tunes-Mathiensen/Covil/actions/workflows/ci.yml)
  ![Versão](https://img.shields.io/badge/versão-0.2.1-ff7043)
  ![Licença](https://img.shields.io/badge/licença-MIT-929aa8)
</div>

---

O Covil é uma PWA desktop-first criada para grupos de até seis pessoas. O frontend roda no navegador, Supabase cuida de autenticação e chat, e WebRTC conecta os participantes diretamente para voz e tela compartilhada.

O projeto abre em **modo de demonstração** quando não encontra credenciais do Supabase. Isso permite explorar a interface, enviar mensagens locais e testar o próprio microfone ou tela antes de configurar qualquer serviço externo.

## O que já funciona

- identidade visual responsiva e instalável como PWA;
- cadastro e login por e-mail com Supabase Auth;
- criação de grupo privado e entrada por convite de uso único;
- mensagens em tempo real com menções notificadas, edição, exclusão, votações, roleta e dado;
- perfis com nome, foto, descrição e troca de senha, visíveis apenas entre membros do mesmo Covil;
- canais de texto e salas de voz criados pelo owner ou por cargos autorizados, até o limite de 25 canais;
- chamadas mesh para até seis participantes, com ocupantes visíveis por sala e inspeção sem abandonar a chamada atual;
- indicador local de quem está falando, mute, limpeza de mídia, ICE restart e recriação automática de peers;
- compartilhamento de tela em 720p/30 fps, áudio quando permitido pelo navegador e foco alternável sem esconder os participantes;
- chamada minimizável e moderação disponível tanto na sala quanto no painel lateral;
- até 12 cargos acumuláveis e editáveis, inclusive cargos apenas visuais e autoatribuição pelo owner, com permissões opcionais para criar canais, moderar voz ou remover membros;
- mute persistente e desconexão cooperativa da chamada, sem permitir moderar o fundador;
- políticas RLS e RPCs autorizadas no PostgreSQL;
- animações responsivas, diálogos acessíveis e efeitos sonoros sintetizados que podem ser desativados;
- console exclusivo do proprietário para acessos, uso do banco e diagnóstico WebRTC;
- modo de demonstração sem conta ou backend;
- testes, lint, build e CI no GitHub Actions.

## Começar em dois minutos

Requisitos: Node.js 22 ou superior e npm.

```bash
git clone https://github.com/Rafael-Tunes-Mathiensen/Covil.git
cd covil
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite. Sem `.env.local`, a interface usa dados locais de demonstração.

### Conectar ao Supabase

1. Copie `.env.example` para `.env.local`.
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Vincule o projeto com o Supabase CLI e aplique as migrations com `npx supabase db push`.
4. Reinicie `npm run dev`.

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica-anon
VITE_ICE_SERVERS=stun:stun.l.google.com:19302
```

`VITE_ICE_SERVERS` também aceita um array JSON de objetos `RTCIceServer` quando
for necessário informar `username` e `credential` para TURN. Não coloque
`service_role`, senha do banco ou credenciais TURN permanentes em variáveis
`VITE_*`: tudo que começa com `VITE_` é incluído no bundle público.

Na versão hospedada, o Worker entrega a configuração em tempo de execução. As
variáveis equivalentes no Sites são `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`ICE_SERVERS`, sem o prefixo `VITE_`.

## Como funciona

```mermaid
flowchart LR
    A["Amigo A"] <-->|"Voz e tela · WebRTC"| B["Amigo B"]
    A <-->|"Voz e tela · WebRTC"| C["Amigo C"]
    B <-->|"Voz e tela · WebRTC"| C
    A & B & C <-->|"Login, chat e sinais"| S["Supabase"]
    P["Sites · Cloudflare Workers"] -->|"Entrega a PWA"| A & B & C
```

Áudio e vídeo não passam pelo banco. Cada navegador envia sua mídia diretamente aos outros participantes. A configuração padrão usa somente STUN, que ajuda a descobrir rotas diretas, mas não retransmite mídia. Por isso, chat e lista de ocupantes podem funcionar enquanto áudio ou tela falham em redes com CGNAT, NAT simétrico ou firewall; nesses casos é necessário configurar TURN com credenciais efêmeras. No compartilhamento, o áudio depende de escolher uma aba ou janela compatível e marcar **Compartilhar áudio** na janela do navegador.

Leia a [arquitetura completa](docs/ARCHITECTURE.md) para conhecer as fronteiras e decisões do MVP.

## Organização

```text
covil/
├── .github/workflows/       # integração contínua
├── .openai/hosting.json     # vínculo com o projeto no Sites
├── docs/                    # design, arquitetura e publicação
├── public/                  # ícone e recursos estáticos
├── worker/                  # configuração pública em tempo de execução
├── src/
│   ├── components/          # superfícies da interface
│   ├── data/                # conteúdo de demonstração
│   ├── features/
│   │   ├── auth/            # sessão e acesso
│   │   ├── covil/           # grupos, canais e chat
│   │   ├── onboarding/      # criação e convite
│   │   ├── sound/           # efeitos sonoros sintetizados
│   │   └── voice/           # WebRTC, fala e sinalização
│   ├── lib/                 # configuração e utilitários
│   ├── styles/              # sistema visual
│   └── types/               # modelo de domínio
├── supabase/migrations/     # banco e autorização
└── wrangler.jsonc           # Worker e entrega da SPA
```

## Comandos

| Comando | Resultado |
| --- | --- |
| `npm run dev` | inicia o ambiente local com recarregamento |
| `npm run lint` | verifica padrões e problemas estáticos |
| `npm test` | executa os testes uma vez |
| `npm run test:watch` | acompanha os testes durante o desenvolvimento |
| `npm run build` | valida TypeScript e gera `dist/` |
| `npm run preview` | abre localmente a versão gerada |

## Documentação

- [Direção visual](docs/DESIGN.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Configuração do Supabase](docs/SUPABASE.md)
- [Publicação gratuita](docs/DEPLOYMENT.md)
- [Política de segurança](SECURITY.md)

## Estado e próximos passos

A versão 0.2.1 reúne o núcleo funcional do MVP e reforça chamadas com três ou mais participantes, presença por sala e recuperação de conexão. Os riscos restantes concentram-se na validação com seis contas simultâneas e na conectividade de redes restritivas.

- [x] Chat, autenticação e grupos privados
- [x] Motor WebRTC mesh e compartilhamento de tela
- [x] Canais múltiplos, cargos acumuláveis e moderação cooperativa
- [x] Indicador de fala, efeitos sonoros e animações acessíveis
- [x] PWA, documentação e CI
- [ ] Teste ponta a ponta com seis contas reais
- [ ] Credenciais TURN efêmeras para redes restritas
- [ ] Seleção de dispositivos e volume individual
- [x] Notificações claras de menções
- [ ] Aplicativo desktop para push-to-talk global

## Licença

Distribuído sob a licença [MIT](LICENSE).
