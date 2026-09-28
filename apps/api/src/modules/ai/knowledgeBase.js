'use strict';

const STOP_WORDS = new Set([
  'a', 'as', 'ao', 'aos', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e',
  'em', 'eu', 'me', 'meu', 'minha', 'o', 'os', 'para', 'por', 'que', 'sem',
  'sistema', 'sobre', 'um', 'uma', 'no', 'na', 'nos', 'nas', 'quero', 'posso'
]);

const KNOWLEDGE_ARTICLES = Object.freeze([
  {
    id: 'accessibility-preferences',
    title: 'Preferências de acessibilidade no SGAC',
    keywords: ['acessibilidade', 'ativar', 'ativo', 'preferencias', 'configuracoes', 'configuracao', 'alto contraste', 'texto ampliado', 'aumentar texto', 'reduzir animacoes', 'movimento reduzido'],
    answer: 'Abra Configurações e procure a seção Acessibilidade. Lá você pode ativar alto contraste, ampliar o texto e reduzir animações. As opções ficam salvas no navegador e não alteram os dados acadêmicos da sua conta.',
    source: 'Configurações do SGAC',
    url: null
  },
  {
    id: 'accessibility-basics',
    title: 'Acessibilidade no SGAC',
    keywords: ['acessibilidade', 'wcag', 'norma', 'inclusao', 'acessivel', 'barreira', 'deficiencia'],
    answer: 'A meta recomendada para o SGAC é WCAG 2.2 nível AA. Ela organiza os requisitos em quatro princípios: perceptível, operável, compreensível e robusto. Para evoluir com segurança, combine verificação automática, teste completo por teclado, leitor de tela e avaliação com pessoas com deficiência. Um resultado automatizado sozinho não comprova conformidade.',
    source: 'WCAG 2.2 Quick Reference — W3C',
    url: 'https://www.w3.org/WAI/WCAG22/quickref/'
  },
  {
    id: 'keyboard-navigation',
    title: 'Navegacao por teclado',
    keywords: ['teclado', 'tab', 'shift', 'enter', 'escape', 'foco', 'navegar', 'mouse', 'atalho'],
    answer: 'Use Tab e Shift+Tab para percorrer os controles, Enter ou Espaço para acionar botões e Escape para fechar o assistente. O foco deve permanecer visível e seguir a ordem do conteúdo. Em diálogos, o foco entra no diálogo, não escapa enquanto ele está aberto e retorna ao controle que o abriu ao fechar.',
    source: 'Keyboard — WCAG 2.2 — W3C',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html'
  },
  {
    id: 'screen-readers',
    title: 'Leitores de tela e estrutura',
    keywords: ['leitor', 'tela', 'nvda', 'voiceover', 'talkback', 'aria', 'rotulo', 'label', 'semantica', 'anunciar'],
    answer: 'O SGAC deve usar elementos HTML semânticos, títulos em ordem, nomes acessíveis nos controles e mensagens de estado que leitores de tela possam anunciar sem mover o foco. Prefira HTML nativo; ARIA só deve complementar uma semântica que HTML não ofereça. Gráficos precisam de uma descrição textual equivalente.',
    source: 'ARIA Authoring Practices Guide — W3C',
    url: 'https://www.w3.org/WAI/ARIA/apg/'
  },
  {
    id: 'visual-accessibility',
    title: 'Contraste, ampliacao e movimento',
    keywords: ['contraste', 'visao', 'baixa', 'daltonismo', 'cor', 'cores', 'zoom', 'ampliar', 'fonte', 'texto', 'movimento', 'animacao', 'animacao', 'refluxo'],
    answer: 'Para texto comum, WCAG AA pede contraste mínimo de 4,5:1; para texto grande, 3:1. Não dependa apenas de cores para indicar risco ou estado. A interface deve continuar funcional com zoom de 200%, sem rolagem horizontal desnecessária, e respeitar a preferência do sistema por movimento reduzido.',
    source: 'Contrast Minimum — WCAG 2.2 — W3C',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html'
  },
  {
    id: 'accessible-forms',
    title: 'Formularios e mensagens de erro',
    keywords: ['formulario', 'form', 'campo', 'erro', 'senha', 'validacao', 'preencher', 'instrucoes'],
    answer: 'Associe cada campo a um rótulo visível, explique o formato esperado antes do envio e identifique erros em texto junto ao campo. Quando souber como corrigir, ofereça uma sugestão. Mantenha o foco e os valores preenchidos após um erro sempre que possível.',
    source: 'Input Assistance — WCAG 2.2 — W3C',
    url: 'https://www.w3.org/WAI/WCAG22/quickref/#input-assistance'
  },
  {
    id: 'assistant-usage',
    title: 'Como usar o assistente',
    keywords: ['assistente', 'ajuda', 'chat', 'perguntar', 'pergunta', 'consultar', 'comando', 'funciona'],
    answer: 'Você pode escrever a pergunta com suas palavras. O assistente responde orientações do SGAC e de acessibilidade a partir de conteúdo mantido no código. Consultas acadêmicas são somente de leitura e limitadas ao seu perfil autenticado. Não envie senhas nem dados pessoais desnecessários.',
    source: 'Guia de contribuicao do SGAC',
    url: null
  },
  {
    id: 'privacy-and-data',
    title: 'Privacidade das consultas',
    keywords: ['privacidade', 'dados', 'seguranca', 'seguro', 'permissao', 'permissoes', 'perfil', 'armazenar', 'historico', 'banco'],
    answer: 'O assistente não guarda histórico de conversa. A identidade e as permissões vêm da sessão do servidor, não do texto enviado. Consultas acadêmicas usam somente leitura e os campos autorizados para o perfil; perguntas de orientação usam a base local do projeto.',
    source: 'Implementacao do assistente SGAC',
    url: null
  }
]);

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function tokenize(value) {
  return new Set(normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function searchKnowledgeBase(query, { limit = 2 } = {}) {
  const queryTokens = tokenize(query);
  if (!queryTokens.size) return [];

  return KNOWLEDGE_ARTICLES
    .map((article) => {
      const keywords = article.keywords.flatMap((keyword) => [...tokenize(keyword)]);
      const matchedTokens = [...new Set(keywords)].filter((token) => queryTokens.has(token));
      return { article, score: matchedTokens.length, matchedTokens };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.article.id.localeCompare(right.article.id))
    .slice(0, limit)
    .map(({ article, score, matchedTokens }) => ({
      id: article.id,
      title: article.title,
      answer: article.answer,
      source: article.source,
      url: article.url,
      score,
      matchedTokens
    }));
}

module.exports = { KNOWLEDGE_ARTICLES, searchKnowledgeBase };