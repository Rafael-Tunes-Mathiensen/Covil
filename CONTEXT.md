# Modelo de domínio do Covil

## Termos canônicos

- **Proprietário da aplicação**: conta global mantida na allowlist administrativa. É a única identidade que pode criar Covils e definir a capacidade de cada um.
- **Covil**: grupo privado com capacidade configurável de uma a seis pessoas, canais, cargos e mensagens próprios.
- **Covil ativo**: Covil selecionado no momento pela pessoa entre aqueles dos quais participa.
- **Fundador**: único membro `owner` do Covil. Possui todas as permissões e não pode ser removido nem moderado por cargos delegados.
- **Membro**: pessoa autenticada que pertence a um ou mais Covils como `member`.
- **Cargo**: identidade nomeada e reutilizável, com cor própria, criada e atribuída pelo Fundador. Pode ser apenas visual ou também conceder permissões; um membro pode acumular vários cargos.
- **Permissão**: capacidade operacional autorizada pelo banco. É opcional em um cargo e pode conceder `manage_channels`, `moderate_voice`, `remove_members` ou `manage_covil`.
- **Canal de texto**: espaço persistente para mensagens.
- **Canal de voz**: sala WebRTC independente para voz e compartilhamento de tela.
- **Transmissão assistida**: tela remota cujo vídeo e áudio só são reproduzidos depois que cada espectador escolhe assistir.
- **Sala observada**: canal de voz aberto na área principal apenas para consultar seus ocupantes, sem alterar a chamada ativa.
- **Moderação de voz**: comando autorizado e persistido pelo servidor para que o cliente oficial imponha silêncio, libere a restrição ou desconecte um participante da sala.

## Regras do domínio

- Existe exatamente um Fundador por Covil e ele sempre possui todas as permissões.
- Somente o Proprietário da aplicação pode criar Covils e alterar sua capacidade.
- A capacidade não pode ser reduzida abaixo da quantidade atual de membros nem ultrapassar seis.
- Alternar o Covil ativo muda o contexto de canais, mensagens, cargos e chamadas sem misturar dados entre Covils.
- Somente o Fundador cria, exclui e atribui cargos; os cargos delegam ações operacionais, não o controle dos próprios cargos.
- As permissões efetivas de um membro são a união das permissões de todos os cargos atribuídos a ele.
- Um cargo sem permissões continua válido e visível ao lado do nome do membro.
- `manage_covil` permite alterar configurações gerais, como o nome, mas não transfere a propriedade nem permite administrar cargos.
- `manage_channels` permite criar, renomear e reordenar canais de texto e voz, sem alterar seu tipo ou o Covil ao qual pertencem.
- Nenhum cargo pode remover, silenciar ou desconectar o Fundador.
- Um silêncio imposto nunca liga o microfone de alguém. A ação de liberar apenas devolve ao participante o controle do próprio microfone.
- Selecionar uma sala apenas a observa. Somente a ação de entrar nela encerra a sessão WebRTC anterior e inicia a nova chamada.
- Resultados gerados por `/dado` e `/roleta` podem ser excluídos pelo autor, mas nunca editados; o resultado publicado permanece autêntico.
- Receber uma transmissão não inicia sua reprodução. Cada espectador pode assistir ou parar de assistir sem sair da chamada, e o áudio compartilhado acompanha essa escolha.
- A interface pode ocultar controles sem permissão, mas toda ação sensível também é validada pelo banco.
- Em uma malha WebRTC entre navegadores, a moderação é aplicada de forma cooperativa pelos clientes oficiais. Garantia contra clientes modificados exigiria um servidor de mídia dedicado.
