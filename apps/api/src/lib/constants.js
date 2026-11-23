/**
 * Papel de `constants`: oferece recursos compartilhados ao servidor, como sessão, permissões, respostas e acesso ao banco.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Reúne constantes acadêmicas usadas na validação da API e nas telas de risco.
 */
const subjects = ['Matéria 1', 'Matéria 2', 'Matéria 3', 'Matéria 4', 'Matéria 5', 'Matéria 6', 'Matéria 7'];
const periods = ['Bimestre 1', 'Bimestre 2', 'Bimestre 3', 'Bimestre 4', 'Semestre 1', 'Semestre 2'];
// Coordenador gerencia atividades acadêmicas apenas no próprio curso.
// A criação e a exclusão de cadastros seguem permissões separadas em
// `permissions.js` e não são concedidas por incluir o perfil nesta lista.
const manageRoles = ['Professor', 'Coordenador', 'Diretor', 'Admin'];

module.exports = {
  subjects,
  periods,
  manageRoles
};
