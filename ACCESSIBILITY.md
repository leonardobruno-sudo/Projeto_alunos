# Acessibilidade

## Meta e limites

Use WCAG 2.2 nivel AA como meta de engenharia. WCAG define criterios verificaveis nos principios perceptivel, operavel, compreensivel e robusto. A implementacao de uma lista de tecnicas ou a aprovacao de um scanner automatico, isoladamente, nao demonstra conformidade: a avaliacao precisa incluir pessoas, tecnologias assistivas e fluxos reais.

## Verificacoes para cada mudanca

- Percorrer o fluxo inteiro apenas com teclado; confirmar ordem, foco visivel, ausencia de armadilha e operacao de dialogos por Escape.
- Conferir nomes, rotulos, titulos, mensagens de erro e anuncios de estado com leitor de tela.
- Verificar contraste de texto, estados que nao dependam apenas de cor, zoom de 200%, reflow em viewport estreita e preferencia por movimento reduzido.
- Usar HTML semantico primeiro. Adicionar ARIA apenas quando o HTML nativo nao expuser o nome, papel ou estado necessario.
- Combinar verificadores automatizados com revisao manual e teste com pessoas com deficiencia antes de declarar conformidade.

## Preferencias disponiveis

Em Configurações, é possível ativar contraste alto, texto ampliado e movimento reduzido. As preferências ficam no navegador e não são enviadas ao servidor; por isso, pessoas que compartilham o mesmo perfil de navegador também compartilham essas preferências. O movimento reduzido também respeita a preferência do sistema operacional.

## Assistente

O conhecimento de acessibilidade e as orientacoes do produto ficam em codigo versionado no servidor. A busca local recupera os trechos relevantes da pergunta; a assistente nao consulta dados de alunos para responder essas orientacoes, nao armazena historico e nao navega na web. Consultas academicas continuam em handlers deterministas com escopo derivado da sessao autenticada.

Essa arquitetura acompanha o padrao de intents e parametros descrito pela documentacao do [Google Dialogflow CX](https://docs.cloud.google.com/dialogflow/cx/docs/concept/intent), mas mantem corpus, regras, dados e autorizacao sob controle deste projeto, sem depender de um agente hospedado. A geracao opcional usa [Ollama](https://github.com/ollama/ollama/blob/main/docs/api.md) no loopback; nenhum endpoint externo e aceito pelo codigo.

## Referencias

- [WCAG 2.2 Quick Reference — W3C](https://www.w3.org/WAI/WCAG22/quickref/)
- [ARIA Authoring Practices Guide — W3C](https://www.w3.org/WAI/ARIA/apg/)
- [Google Dialogflow CX: Intents](https://docs.cloud.google.com/dialogflow/cx/docs/concept/intent)
- [Ollama: API local de chat](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [OWASP: LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)