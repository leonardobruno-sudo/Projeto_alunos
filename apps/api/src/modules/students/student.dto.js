/**
 * Runtime DTO validation for the public student-search endpoint.
 *
 * TypeScript contracts in the web app are useful for development, but this
 * module is the trusted boundary: query strings are untyped at runtime.
 */
const { periods } = require('../../lib/constants');

const SORT_FIELDS = new Set(['nome', 'matricula', 'nota_final', 'taxa_faltas', 'situacao_risco']);
const DIRECTIONS = new Set(['asc', 'desc']);
const RISK_FILTERS = new Set(['', 'risco', 'alerta', 'regular']);
const QUOTA_FILTERS = new Set(['', 'AC', 'PCD_AC', 'L1', 'L2', 'L5', 'L6', 'L9', 'L10', 'L13', 'L14']);
const ACADEMIC_DATA_SOURCES = new Set(['', 'atual', 'historico']);

function text(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return { value: '' };
  if (Array.isArray(value) || (typeof value !== 'string' && typeof value !== 'number')) {
    return { error: `O campo ${field} é inválido.` };
  }
  const normalized = String(value).trim();
  if (normalized.length > maxLength) {
    return { error: `O campo ${field} deve ter no máximo ${maxLength} caracteres.` };
  }
  return { value: normalized };
}

function positiveInteger(value, field, fallback, maximum) {
  if (value === undefined || value === null || value === '') return { value: fallback };
  if (Array.isArray(value) || !/^\d+$/.test(String(value))) return { error: `O campo ${field} é inválido.` };
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return { error: `O campo ${field} está fora do limite permitido.` };
  }
  return { value: parsed };
}

function parseStudentSearchQuery(query = {}) {
  const fields = {
    q: text(query.q, 'q', 120),
    busca_matricula: text(query.busca_matricula, 'busca_matricula', 80),
    busca_nome: text(query.busca_nome, 'busca_nome', 120),
    curso: text(query.curso, 'curso', 120),
    turma: text(query.turma, 'turma', 80),
    categoria: text(query.categoria, 'categoria', 120),
    cota: text(query.cota, 'cota', 20),
    situacao: text(query.situacao, 'situacao', 20),
    fonte: text(query.fonte, 'fonte', 20),
    sort: text(query.sort, 'sort', 40),
    direction: text(query.direction, 'direction', 10),
    page: positiveInteger(query.page, 'page', 1, 100000),
    pageSize: positiveInteger(query.pageSize, 'pageSize', 20, 50)
  };
  const invalid = Object.values(fields).find((field) => field.error);
  if (invalid) return invalid;

  const periodo = query.periodo === undefined || query.periodo === '' ? 0 : Number(query.periodo);
  if (Array.isArray(query.periodo) || !Number.isInteger(periodo) || periodo < 0 || periodo >= periods.length) {
    return { error: 'Período inválido.' };
  }

  const cota = fields.cota.value.toUpperCase();
  const situacao = fields.situacao.value.toLocaleLowerCase('pt-BR');
  const sort = fields.sort.value || 'nome';
  const direction = fields.direction.value.toLocaleLowerCase('pt-BR') || 'asc';
  const fonte = fields.fonte.value.toLocaleLowerCase('pt-BR');
  if (!QUOTA_FILTERS.has(cota)) return { error: 'Modalidade de cota inválida.' };
  if (!RISK_FILTERS.has(situacao)) return { error: 'Filtro de situação inválido.' };
  if (!ACADEMIC_DATA_SOURCES.has(fonte)) return { error: 'Fonte de dados inválida.' };
  if (!SORT_FIELDS.has(sort)) return { error: 'Campo de ordenação inválido.' };
  if (!DIRECTIONS.has(direction)) return { error: 'Direção de ordenação inválida.' };

  return {
    data: {
      q: fields.q.value,
      busca_matricula: fields.busca_matricula.value,
      busca_nome: fields.busca_nome.value,
      curso: fields.curso.value,
      turma: fields.turma.value,
      categoria: fields.categoria.value,
      cota,
      situacao,
      fonte,
      sort,
      direction,
      page: fields.page.value,
      pageSize: fields.pageSize.value,
      periodo
    }
  };
}

module.exports = {
  parseStudentSearchQuery
};
