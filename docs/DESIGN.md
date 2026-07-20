# Direção visual do Covil

## Tese visual

Uma central de comunicação noturna, compacta e acolhedora, construída com superfícies grafite, tipografia precisa e um único acento laranja quente. A interface deve parecer um espaço particular do grupo, não uma reprodução do Discord.

## Plano de conteúdo

1. **Navegação:** nome do Covil, canais de texto, salas de voz, lista compacta de ocupantes e ações autorizadas.
2. **Área principal:** conversa ou compartilhamento de tela, nunca os dois disputando atenção.
3. **Contexto:** participantes e estado de voz em um painel recolhível.
4. **Ação persistente:** controles essenciais da chamada em uma barra inferior.
5. **Administração:** criação de canais, cargos e atribuições em diálogos focados.

## Tese de interação

- A entrada no aplicativo revela a estrutura por camadas, da navegação ao conteúdo.
- Selecionar uma sala de voz permite inspecionar seus ocupantes sem interromper a chamada mantida no dock; entrar nela é uma ação explícita.
- O contorno do avatar e uma pequena forma de onda entre a foto e o nome respondem somente enquanto o detector local identifica fala.
- O compartilhamento de tela expande a área principal e recolhe o contexto secundário.
- Mensagens, participantes, diálogos, abas e cargos entram com deslocamentos curtos e opacidade.
- Ações de editar ou excluir aparecem no hover e no foco da própria mensagem; menções são sugeridas acima do compositor e destacadas no fluxo da conversa.
- Cargos visuais aparecem como rótulos compactos junto aos nomes, sem sugerir uma permissão que não exista.
- Ícones ativos, botões e estados de hover usam escala ou deslocamento mínimo para confirmar a ação.

## Movimento, som e acessibilidade

As durações usam tokens entre 140 e 420 ms e uma curva de desaceleração comum.
Animações contínuas ficam restritas a estados vivos, como conexão, carregamento e
fala. `prefers-reduced-motion: reduce` reduz animações, transições e rolagem
suave a uma mudança praticamente instantânea.

Os efeitos de entrada, saída, mute, mensagem e compartilhamento são tons curtos
sintetizados com Web Audio, sem arquivos de áudio externos. A preferência de
liga/desliga fica somente no `localStorage` do navegador e pode ser alterada na
barra do usuário.

Diálogos usam `role="dialog"`, título associado, foco inicial, contenção de Tab,
fechamento por Escape e restauração do foco. Botões apenas com ícone têm nomes
acessíveis, seleções expõem `aria-pressed` ou `aria-selected` e erros usam regiões
de alerta.

## Sistema visual

| Papel | Valor |
| --- | --- |
| Fundo | `#0b0d12` |
| Navegação | `#0f1218` |
| Superfície | `#131720` |
| Superfície elevada | `#1a1f2a` |
| Destaque | `#ff7043` |
| Texto | `#f3f5f7` |
| Texto secundário | `#929aa8` |
| Conectado | `#55c98a` |

O produto usa Space Grotesk para marca e títulos, Inter para a interface e ícones lineares Lucide. Bordas aparecem apenas para separar regiões funcionais; cartões são reservados para elementos realmente interativos.
