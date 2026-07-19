# Modelo de domínio do Covil

## Termos canônicos

- **Covil**: grupo privado de até seis pessoas, com canais, cargos e mensagens próprios.
- **Fundador**: único membro `owner` do Covil. Possui todas as permissões e não pode ser removido nem moderado por cargos delegados.
- **Membro**: pessoa autenticada que pertence ao Covil como `member`.
- **Cargo**: conjunto nomeado e reutilizável de permissões, criado e atribuído pelo Fundador. Um membro pode acumular vários cargos.
- **Permissão**: capacidade autorizada pelo banco. Os cargos podem conceder `manage_channels`, `moderate_voice` e `remove_members`.
- **Canal de texto**: espaço persistente para mensagens.
- **Canal de voz**: sala WebRTC independente para voz e compartilhamento de tela.
- **Sala observada**: canal de voz aberto na área principal apenas para consultar seus ocupantes, sem alterar a chamada ativa.
- **Moderação de voz**: comando autorizado para silenciar no servidor, liberar o silêncio ou desconectar um participante da sala.

## Regras do domínio

- Existe exatamente um Fundador por Covil e ele sempre possui todas as permissões.
- Somente o Fundador cria, exclui e atribui cargos; os cargos delegam ações operacionais, não o controle dos próprios cargos.
- As permissões efetivas de um membro são a união das permissões de todos os cargos atribuídos a ele.
- Nenhum cargo pode remover, silenciar ou desconectar o Fundador.
- Um silêncio imposto nunca liga o microfone de alguém. A ação de liberar apenas devolve ao participante o controle do próprio microfone.
- Selecionar uma sala apenas a observa. Somente a ação de entrar nela encerra a sessão WebRTC anterior e inicia a nova chamada.
- A interface pode ocultar controles sem permissão, mas toda ação sensível também é validada pelo banco.
- Em uma malha WebRTC entre navegadores, a moderação é aplicada de forma cooperativa pelos clientes oficiais. Garantia contra clientes modificados exigiria um servidor de mídia dedicado.
