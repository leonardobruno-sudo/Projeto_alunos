/**
 * Papel de `academicLife.service`: implementa regras de negócio do domínio e conversa com os serviços compartilhados e o banco sem depender da interface.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Regras da Vida Acadêmica entre as rotas HTTP e o SQLite.
 * Recebe a identidade da sessão do servidor, valida curso, turma, diário e
 * matrícula, e então consulta ou grava calendário, frequência, avaliações,
 * requerimentos e documentos. Dados enviados pelo navegador nunca ampliam
 * por conta própria o escopo permitido à pessoa autenticada.
 */
'use strict';

const { allSql, getSql, runSql, withImmediateTransaction } = require('../../lib/database');
const { periods } = require('../../lib/constants');
const { normalizeMatricula, normalizeSubjectName } = require('../../lib/utils');

const EVENT_TYPES = new Set(['Academico', 'Avaliacao', 'Reuniao', 'Prazo', 'Outro']);
const ATTENDANCE_STATUSES = new Set(['PRESENTE', 'FALTA', 'JUSTIFICADA']);
const REQUEST_STATUSES = new Set(['ABERTO', 'EM_ANALISE', 'CONCLUIDO', 'INDEFERIDO']);
const DOCUMENT_STATUSES = new Set(['DISPONIVEL', 'ARQUIVADO']);
const DIARY_STATUSES = new Set(['aberto', 'fechado']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class AcademicLifeError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AcademicLifeError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function badRequest(message) {
  return new AcademicLifeError(400, 'invalid_academic_life_request', message);
}

function forbidden(message = 'Você não tem permissão para acessar este recurso acadêmico.') {
  return new AcademicLifeError(403, 'academic_life_forbidden', message);
}

function notFound(message = 'Recurso acadêmico não encontrado.') {
  return new AcademicLifeError(404, 'academic_life_not_found', message);
}

function now() {
  return new Date().toISOString();
}

function text(value, { field = 'Campo', required = false, maxLength = 500, allowEmpty = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${field} é obrigatório.`);
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw badRequest(`${field} é inválido.`);
  }
  const normalized = String(value).trim();
  if (required && !normalized) throw badRequest(`${field} é obrigatório.`);
  if (!allowEmpty && !normalized) return null;
  if (normalized.length > maxLength) throw badRequest(`${field} deve ter no máximo ${maxLength} caracteres.`);
  return normalized;
}

function integer(value, { field = 'Campo', min = 0, max = Number.MAX_SAFE_INTEGER, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${field} é obrigatório.`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw badRequest(`${field} é inválido.`);
  return parsed;
}

function decimal(value, { field = 'Campo', min = 0, max = Number.MAX_SAFE_INTEGER, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${field} é obrigatório.`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw badRequest(`${field} é inválido.`);
  return parsed;
}

function boolean(value, { field = 'Campo', fallback = null } = {}) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw badRequest(`${field} deve ser verdadeiro ou falso.`);
  return value;
}

function date(value, { field = 'Data', required = true } = {}) {
  const normalized = text(value, { field, required, maxLength: 10 });
  if (normalized === null) return null;
  if (!ISO_DATE.test(normalized)) throw badRequest(`${field} deve estar no formato AAAA-MM-DD.`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw badRequest(`${field} é inválida.`);
  }
  return normalized;
}

function dateRange(input, { startField = 'data de início', endField = 'data de término' } = {}) {
  const inicioEm = date(input?.inicioEm ?? input?.inicio_em, { field: startField });
  const fimEm = date(input?.fimEm ?? input?.fim_em, { field: endField });
  if (inicioEm > fimEm) throw badRequest(`${startField} não pode ser posterior a ${endField}.`);
  return { inicioEm, fimEm };
}

function sameValue(left, right) {
  const a = String(left || '').trim().toLocaleLowerCase('pt-BR');
  const b = String(right || '').trim().toLocaleLowerCase('pt-BR');
  return Boolean(a && b && a === b);
}

function sameOptionalValue(left, right) {
  const a = String(left || '').trim().toLocaleLowerCase('pt-BR');
  const b = String(right || '').trim().toLocaleLowerCase('pt-BR');
  return a === b;
}

function userId(user) {
  const id = Number(user?.id);
  if (!Number.isInteger(id) || id < 1) throw forbidden('Sessão acadêmica inválida.');
  return id;
}

function validatePeriod(value) {
  const period = integer(value, { field: 'Período', min: 0, max: periods.length - 1, required: true });
  return period;
}

function validateScopeInput(input, { allowBlankTurma = false } = {}) {
  const curso = text(input?.curso, { field: 'Curso', required: true, maxLength: 120 });
  const turma = text(input?.turma, { field: 'Turma', required: !allowBlankTurma, maxLength: 80 });
  const disciplina = text(input?.disciplina, { field: 'Disciplina', required: true, maxLength: 120 });
  const periodo = validatePeriod(input?.periodo);
  return { curso, turma, disciplina, periodo };
}

function scopeLabel(user) {
  if (user?.role === 'Admin') return 'Todos os cursos';
  if (isCourseManager(user)) return user.curso ? `Curso ${user.curso}` : 'Curso não configurado';
  if (user?.role === 'Professor') {
    return [user.curso, user.turma, user.disciplina].filter(Boolean).join(' · ') || 'Turma não configurada';
  }
  return 'Seus dados acadêmicos';
}

function toCalendarDto(row) {
  return {
    id: Number(row.id),
    titulo: row.titulo,
    curso: row.curso,
    turma: row.turma || null,
    periodo: Number(row.periodo),
    inicioEm: row.inicio_em,
    fimEm: row.fim_em,
    ativo: Number(row.ativo) === 1,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em
  };
}

function toEventDto(row) {
  return {
    id: Number(row.id),
    calendarioId: Number(row.calendario_id),
    titulo: row.titulo,
    descricao: row.descricao || null,
    tipo: row.tipo,
    inicioEm: row.inicio_em,
    fimEm: row.fim_em,
    visivelParaAlunos: Number(row.visivel_para_alunos) === 1,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em
  };
}

function toDiaryDto(row) {
  return {
    id: Number(row.id),
    curso: row.curso,
    turma: row.turma,
    disciplina: row.disciplina,
    periodo: Number(row.periodo),
    professorUsuarioId: row.professor_usuario_id === null || row.professor_usuario_id === undefined
      ? null
      : Number(row.professor_usuario_id),
    professorNome: row.professor_nome || null,
    status: row.status,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em
  };
}

function toLessonDto(row) {
  return {
    id: Number(row.id),
    diarioId: Number(row.diario_id),
    dataAula: row.data_aula,
    titulo: row.titulo,
    conteudo: row.conteudo || null,
    cargaHoraria: Number(row.carga_horaria),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em
  };
}

function toAttendanceDto(row) {
  return {
    id: Number(row.id),
    aulaId: Number(row.aula_id),
    matricula: row.matricula,
    situacao: row.situacao,
    observacao: row.observacao || null,
    registradoEm: row.registrado_em,
    atualizadoEm: row.atualizado_em
  };
}

function toAssessmentDto(row) {
  return {
    id: Number(row.id),
    diarioId: Number(row.diario_id),
    titulo: row.titulo,
    descricao: row.descricao || null,
    dataAvaliacao: row.data_avaliacao,
    peso: Number(row.peso),
    notaMaxima: Number(row.nota_maxima),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em
  };
}

function toGradeDto(row) {
  return {
    id: Number(row.id),
    avaliacaoId: Number(row.avaliacao_id),
    matricula: row.matricula,
    nota: Number(row.nota),
    observacao: row.observacao || null,
    lancadoEm: row.lancado_em,
    atualizadoEm: row.atualizado_em
  };
}

function toRequestDto(row) {
  return {
    id: Number(row.id),
    matricula: row.matricula,
    tipo: row.tipo,
    descricao: row.descricao || null,
    periodo: row.periodo === null || row.periodo === undefined ? null : Number(row.periodo),
    status: row.status,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em
  };
}

function toDocumentDto(row) {
  return {
    id: Number(row.id),
    matricula: row.matricula,
    tipo: row.tipo,
    titulo: row.titulo,
    descricao: row.descricao || null,
    periodo: row.periodo === null || row.periodo === undefined ? null : Number(row.periodo),
    referenciaExterna: row.referencia_externa || null,
    status: row.status,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em
  };
}

async function studentScope(user) {
  const matricula = normalizeMatricula(user?.matricula);
  if (!matricula) throw forbidden('A conta de aluno não possui matrícula configurada.');
  const student = await getSql(
    'SELECT matricula, nome, curso, turma FROM alunos WHERE lower(trim(matricula)) = lower(trim(?))',
    [matricula]
  );
  if (!student) throw forbidden('A matrícula desta conta não está mais ativa.');
  return student;
}

function isRole(user, role) {
  return user?.role === role;
}

function isStaff(user) {
  return ['Admin', 'Diretor', 'Coordenador', 'Professor'].includes(user?.role);
}

function isCourseManager(user) {
  return ['Diretor', 'Coordenador'].includes(user?.role);
}

function canReadCalendarScope(user, calendar, student) {
  if (isRole(user, 'Admin')) return true;
  if (isCourseManager(user)) return sameValue(user.curso, calendar.curso);
  if (isRole(user, 'Professor')) {
    return sameValue(user.curso, calendar.curso) && (!calendar.turma || sameValue(user.turma, calendar.turma));
  }
  if (isRole(user, 'Aluno')) {
    return sameValue(student?.curso, calendar.curso) && (!calendar.turma || sameValue(student?.turma, calendar.turma));
  }
  return false;
}

function canManageCalendarScope(user, scope) {
  if (isRole(user, 'Admin')) return true;
  return isCourseManager(user) && sameValue(user.curso, scope.curso);
}

function canManageDiaryScope(user, diary) {
  if (isRole(user, 'Admin')) return true;
  if (isCourseManager(user)) return sameValue(user.curso, diary.curso);
  if (isRole(user, 'Professor')) {
    // Course/class/subject alone are not an identity boundary: two teachers
    // can legitimately share that scope. A diary must name its professor so
    // notes and attendance can never be changed by a peer account.
    const assignedProfessorId = Number(diary.professor_usuario_id ?? diary.professorUsuarioId);
    return Number.isInteger(assignedProfessorId) && assignedProfessorId > 0 && assignedProfessorId === Number(user.id);
  }
  return false;
}

function canReadDiaryStaff(user, diary) {
  return canManageDiaryScope(user, diary);
}

async function isStudentEnrolled(diaryId, matricula) {
  const enrollment = await getSql(
    `SELECT id FROM matriculas_diario
     WHERE diario_id = ? AND lower(trim(matricula)) = lower(trim(?)) AND ativa = 1`,
    [diaryId, matricula]
  );
  return Boolean(enrollment);
}

async function canReadDiary(user, diary, student = null) {
  if (isStaff(user)) return canReadDiaryStaff(user, diary);
  if (!isRole(user, 'Aluno')) return false;
  const currentStudent = student || await studentScope(user);
  return isStudentEnrolled(diary.id, currentStudent.matricula);
}

async function getCalendar(calendarId) {
  const id = integer(calendarId, { field: 'Calendário', min: 1, required: true });
  const calendar = await getSql('SELECT * FROM calendarios_academicos WHERE id = ?', [id]);
  if (!calendar) throw notFound('Calendário acadêmico não encontrado.');
  return calendar;
}

async function getDiary(diaryId) {
  const id = integer(diaryId, { field: 'Diário', min: 1, required: true });
  const diary = await getSql(
    `SELECT d.*, u.nome AS professor_nome
     FROM diarios_turma d
     LEFT JOIN usuarios u ON u.id = d.professor_usuario_id
     WHERE d.id = ?`,
    [id]
  );
  if (!diary) throw notFound('Diário acadêmico não encontrado.');
  return diary;
}

async function getLesson(lessonId) {
  const id = integer(lessonId, { field: 'Aula', min: 1, required: true });
  const lesson = await getSql('SELECT * FROM aulas_diario WHERE id = ?', [id]);
  if (!lesson) throw notFound('Aula não encontrada.');
  return lesson;
}

async function getAssessment(assessmentId) {
  const id = integer(assessmentId, { field: 'Avaliação', min: 1, required: true });
  const assessment = await getSql('SELECT * FROM avaliacoes_diario WHERE id = ?', [id]);
  if (!assessment) throw notFound('Avaliação não encontrada.');
  return assessment;
}

async function getStudentByMatricula(matricula) {
  const normalized = normalizeMatricula(matricula);
  if (!normalized) throw badRequest('Matrícula inválida.');
  const student = await getSql(
    'SELECT matricula, nome, curso, turma FROM alunos WHERE lower(trim(matricula)) = lower(trim(?))',
    [normalized]
  );
  if (!student) throw notFound('Aluno não encontrado.');
  return student;
}

async function assertStudentMatchesDiary(matricula, diary) {
  const student = await getStudentByMatricula(matricula);
  if (!sameValue(student.curso, diary.curso) || !sameValue(student.turma, diary.turma)) {
    throw badRequest('O aluno não pertence ao curso e à turma deste diário.');
  }
  return student;
}

function normalizeEnrollmentMatriculas(inputMatriculas) {
  if (!Array.isArray(inputMatriculas) || inputMatriculas.length === 0 || inputMatriculas.length > 500) {
    throw badRequest('Informe entre 1 e 500 matrículas para o diário.');
  }
  const normalized = inputMatriculas.map((value) => normalizeMatricula(value));
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) {
    throw badRequest('A lista de matrículas contém valor inválido ou repetido.');
  }
  return normalized;
}

async function validateDiaryEnrollments(matriculas, diary) {
  const students = [];
  for (const matricula of matriculas) {
    students.push(await assertStudentMatchesDiary(matricula, diary));
  }
  return students;
}

async function insertDiaryEnrollments(user, diaryId, matriculas) {
  const timestamp = now();
  for (const matricula of matriculas) {
    await runSql(
      `INSERT INTO matriculas_diario (diario_id, matricula, ativa, matriculado_por, matriculado_em)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(diario_id, matricula) DO UPDATE SET
         ativa = 1,
         matriculado_por = excluded.matriculado_por,
         matriculado_em = excluded.matriculado_em`,
      [diaryId, matricula, userId(user), timestamp]
    );
  }
}

async function validateAssignedProfessor(professorUsuarioId, scope) {
  if (professorUsuarioId === undefined || professorUsuarioId === null || professorUsuarioId === '') return null;
  const id = integer(professorUsuarioId, { field: 'Professor responsável', min: 1, required: true });
  const professor = await getSql(
    `SELECT id, role, curso, turma, disciplina
     FROM usuarios WHERE id = ?`,
    [id]
  );
  if (!professor || professor.role !== 'Professor') {
    throw badRequest('Professor responsável não encontrado.');
  }
  if (!sameValue(professor.curso, scope.curso) ||
      !sameValue(professor.turma, scope.turma) ||
      normalizeSubjectName(professor.disciplina) !== normalizeSubjectName(scope.disciplina)) {
    throw badRequest('O professor responsável não pertence ao escopo do diário.');
  }
  return professor.id;
}

async function listAssignableProfessors(user) {
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) {
    throw forbidden('Somente Administração, Direção ou Coordenação pode consultar professores responsáveis.');
  }
  const courseClause = isCourseManager(user) ? ' AND lower(trim(curso)) = lower(trim(?))' : '';
  const rows = await allSql(
    `SELECT id, username, nome, curso, turma, disciplina
     FROM usuarios
     WHERE role = 'Professor'${courseClause}
     ORDER BY nome, username, id`,
    isCourseManager(user) ? [user.curso] : []
  );
  return rows.map((professor) => ({
    id: Number(professor.id),
    username: professor.username,
    nome: professor.nome || professor.username,
    curso: professor.curso || '',
    turma: professor.turma || '',
    disciplina: professor.disciplina || ''
  }));
}

async function listCalendars(user, { periodo } = {}) {
  const requestedPeriod = periodo === undefined || periodo === null || periodo === '' ? null : validatePeriod(periodo);
  const rows = requestedPeriod === null
    ? await allSql('SELECT * FROM calendarios_academicos ORDER BY inicio_em, id')
    : await allSql('SELECT * FROM calendarios_academicos WHERE periodo = ? ORDER BY inicio_em, id', [requestedPeriod]);
  const student = isRole(user, 'Aluno') ? await studentScope(user) : null;
  return rows
    .filter((calendar) => canReadCalendarScope(user, calendar, student))
    .map(toCalendarDto);
}

async function createCalendar(user, input) {
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) throw forbidden('Somente Administração, Direção ou Coordenação pode criar calendários.');
  const scope = {
    curso: text(input?.curso, { field: 'Curso', required: true, maxLength: 120 }),
    turma: text(input?.turma, { field: 'Turma', maxLength: 80 }),
    periodo: validatePeriod(input?.periodo)
  };
  if (!canManageCalendarScope(user, scope)) throw forbidden('Você só pode criar calendário no seu curso.');
  const title = text(input?.titulo, { field: 'Título', required: true, maxLength: 160 });
  const range = dateRange(input);
  const active = boolean(input?.ativo, { field: 'Ativo', fallback: true });
  const timestamp = now();
  const result = await runSql(
    `INSERT INTO calendarios_academicos
      (titulo, curso, turma, periodo, inicio_em, fim_em, ativo, criado_por, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, scope.curso, scope.turma, scope.periodo, range.inicioEm, range.fimEm, active ? 1 : 0, userId(user), timestamp, timestamp]
  );
  return toCalendarDto(await getCalendar(result.lastID));
}

function calendarScopeChanged(current, scope) {
  return !sameValue(current.curso, scope.curso) ||
    !sameOptionalValue(current.turma, scope.turma) ||
    Number(current.periodo) !== Number(scope.periodo);
}

async function updateCalendar(user, calendarId, input) {
  const current = await getCalendar(calendarId);
  if (!canManageCalendarScope(user, current)) throw forbidden('Você não pode alterar este calendário.');
  const merged = {
    curso: input?.curso === undefined ? current.curso : input.curso,
    turma: input?.turma === undefined ? current.turma : input.turma,
    periodo: input?.periodo === undefined ? current.periodo : input.periodo,
    titulo: input?.titulo === undefined ? current.titulo : input.titulo,
    inicioEm: input?.inicioEm ?? input?.inicio_em ?? current.inicio_em,
    fimEm: input?.fimEm ?? input?.fim_em ?? current.fim_em,
    ativo: input?.ativo === undefined ? Number(current.ativo) === 1 : input.ativo
  };
  const scope = {
    curso: text(merged.curso, { field: 'Curso', required: true, maxLength: 120 }),
    turma: text(merged.turma, { field: 'Turma', maxLength: 80 }),
    periodo: validatePeriod(merged.periodo)
  };
  if (!canManageCalendarScope(user, scope)) throw forbidden('Você só pode mover calendário dentro do seu curso.');
  const range = dateRange(merged);
  const linkedEvent = await getSql(
    `SELECT id, inicio_em, fim_em FROM eventos_academicos
     WHERE calendario_id = ? AND (inicio_em < ? OR fim_em > ?)
     LIMIT 1`,
    [current.id, range.inicioEm, range.fimEm]
  );
  if (linkedEvent) {
    throw badRequest('O novo intervalo do calendário excluiria eventos já cadastrados. Ajuste ou mova os eventos primeiro.');
  }
  if (calendarScopeChanged(current, scope)) {
    const event = await getSql('SELECT id FROM eventos_academicos WHERE calendario_id = ? LIMIT 1', [current.id]);
    if (event) {
      throw new AcademicLifeError(
        409,
        'academic_calendar_scope_locked',
        'Não é possível alterar curso, turma ou período de um calendário que já possui eventos. Crie outro calendário para o novo escopo.'
      );
    }
  }
  await runSql(
    `UPDATE calendarios_academicos
     SET titulo = ?, curso = ?, turma = ?, periodo = ?, inicio_em = ?, fim_em = ?, ativo = ?, atualizado_em = ?
     WHERE id = ?`,
    [text(merged.titulo, { field: 'Título', required: true, maxLength: 160 }), scope.curso, scope.turma,
      scope.periodo, range.inicioEm, range.fimEm,
      boolean(merged.ativo, { field: 'Ativo', fallback: true }) ? 1 : 0, now(), current.id]
  );
  return toCalendarDto(await getCalendar(current.id));
}

async function deleteCalendar(user, calendarId) {
  const calendar = await getCalendar(calendarId);
  if (!canManageCalendarScope(user, calendar)) throw forbidden('Você não pode excluir este calendário.');
  await runSql('DELETE FROM calendarios_academicos WHERE id = ?', [calendar.id]);
}

async function listCalendarEvents(user, calendarId) {
  const calendar = await getCalendar(calendarId);
  const student = isRole(user, 'Aluno') ? await studentScope(user) : null;
  if (!canReadCalendarScope(user, calendar, student)) throw forbidden('Você não pode acessar este calendário.');
  const rows = await allSql(
    `SELECT * FROM eventos_academicos WHERE calendario_id = ?
     ${isRole(user, 'Aluno') ? 'AND visivel_para_alunos = 1' : ''}
     ORDER BY inicio_em, id`,
    [calendar.id]
  );
  return rows.map(toEventDto);
}

async function createCalendarEvent(user, calendarId, input) {
  const calendar = await getCalendar(calendarId);
  if (!canManageCalendarScope(user, calendar)) throw forbidden('Você não pode criar eventos neste calendário.');
  const type = text(input?.tipo, { field: 'Tipo de evento', maxLength: 40 }) || 'Academico';
  if (!EVENT_TYPES.has(type)) throw badRequest('Tipo de evento inválido.');
  const range = dateRange(input);
  if (range.inicioEm < calendar.inicio_em || range.fimEm > calendar.fim_em) {
    throw badRequest('O evento deve estar dentro do intervalo do calendário.');
  }
  const timestamp = now();
  const result = await runSql(
    `INSERT INTO eventos_academicos
      (calendario_id, titulo, descricao, tipo, inicio_em, fim_em, visivel_para_alunos, criado_por, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [calendar.id, text(input?.titulo, { field: 'Título', required: true, maxLength: 160 }),
      text(input?.descricao, { field: 'Descrição', maxLength: 2000 }), type,
      range.inicioEm, range.fimEm,
      boolean(input?.visivelParaAlunos ?? input?.visivel_para_alunos, { field: 'Visível para alunos', fallback: true }) ? 1 : 0,
      userId(user), timestamp, timestamp]
  );
  return toEventDto(await getSql('SELECT * FROM eventos_academicos WHERE id = ?', [result.lastID]));
}

async function updateCalendarEvent(user, eventId, input) {
  const id = integer(eventId, { field: 'Evento', min: 1, required: true });
  const event = await getSql('SELECT * FROM eventos_academicos WHERE id = ?', [id]);
  if (!event) throw notFound('Evento acadêmico não encontrado.');
  const calendar = await getCalendar(event.calendario_id);
  if (!canManageCalendarScope(user, calendar)) throw forbidden('Você não pode alterar este evento.');
  const merged = {
    titulo: input?.titulo === undefined ? event.titulo : input.titulo,
    descricao: input?.descricao === undefined ? event.descricao : input.descricao,
    tipo: input?.tipo === undefined ? event.tipo : input.tipo,
    inicioEm: input?.inicioEm ?? input?.inicio_em ?? event.inicio_em,
    fimEm: input?.fimEm ?? input?.fim_em ?? event.fim_em,
    visivel: input?.visivelParaAlunos ?? input?.visivel_para_alunos ?? (Number(event.visivel_para_alunos) === 1)
  };
  const type = text(merged.tipo, { field: 'Tipo de evento', required: true, maxLength: 40 });
  if (!EVENT_TYPES.has(type)) throw badRequest('Tipo de evento inválido.');
  const range = dateRange(merged);
  if (range.inicioEm < calendar.inicio_em || range.fimEm > calendar.fim_em) {
    throw badRequest('O evento deve estar dentro do intervalo do calendário.');
  }
  await runSql(
    `UPDATE eventos_academicos
     SET titulo = ?, descricao = ?, tipo = ?, inicio_em = ?, fim_em = ?, visivel_para_alunos = ?, atualizado_em = ?
     WHERE id = ?`,
    [text(merged.titulo, { field: 'Título', required: true, maxLength: 160 }),
      text(merged.descricao, { field: 'Descrição', maxLength: 2000 }), type,
      range.inicioEm, range.fimEm,
      boolean(merged.visivel, { field: 'Visível para alunos', fallback: true }) ? 1 : 0,
      now(), id]
  );
  return toEventDto(await getSql('SELECT * FROM eventos_academicos WHERE id = ?', [id]));
}

async function deleteCalendarEvent(user, eventId) {
  const id = integer(eventId, { field: 'Evento', min: 1, required: true });
  const event = await getSql('SELECT * FROM eventos_academicos WHERE id = ?', [id]);
  if (!event) throw notFound('Evento acadêmico não encontrado.');
  const calendar = await getCalendar(event.calendario_id);
  if (!canManageCalendarScope(user, calendar)) throw forbidden('Você não pode excluir este evento.');
  await runSql('DELETE FROM eventos_academicos WHERE id = ?', [id]);
}

async function listDiaries(user, { periodo } = {}) {
  const requestedPeriod = periodo === undefined || periodo === null || periodo === '' ? null : validatePeriod(periodo);
  const rows = requestedPeriod === null
    ? await allSql(
      `SELECT d.*, u.nome AS professor_nome FROM diarios_turma d
       LEFT JOIN usuarios u ON u.id = d.professor_usuario_id
       ORDER BY d.periodo, d.disciplina, d.turma, d.id`
    )
    : await allSql(
      `SELECT d.*, u.nome AS professor_nome FROM diarios_turma d
       LEFT JOIN usuarios u ON u.id = d.professor_usuario_id
       WHERE d.periodo = ? ORDER BY d.disciplina, d.turma, d.id`,
      [requestedPeriod]
    );
  if (isStaff(user)) return rows.filter((diary) => canReadDiaryStaff(user, diary)).map(toDiaryDto);
  const student = await studentScope(user);
  const results = [];
  for (const diary of rows) {
    if (await isStudentEnrolled(diary.id, student.matricula)) results.push(toDiaryDto(diary));
  }
  return results;
}

async function createDiary(user, input) {
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) {
    throw forbidden('Somente Administração, Direção ou Coordenação pode criar diários.');
  }
  const scope = validateScopeInput(input);
  if (!canManageDiaryScope(user, scope)) throw forbidden('Você só pode criar diário dentro do seu escopo acadêmico.');
  const requestedProfessorId = input?.professorUsuarioId ?? input?.professor_usuario_id;
  if (requestedProfessorId === undefined || requestedProfessorId === null || requestedProfessorId === '') {
    throw badRequest('Selecione o professor responsável pelo diário.');
  }
  const status = text(input?.status, { field: 'Status', maxLength: 20 }) || 'aberto';
  if (!DIARY_STATUSES.has(status)) throw badRequest('Status de diário inválido.');
  const initialMatriculas = input?.matriculas === undefined
    ? []
    : normalizeEnrollmentMatriculas(input.matriculas);
  let diaryId;
  try {
    diaryId = await withImmediateTransaction(async () => {
      const professorUsuarioId = await validateAssignedProfessor(requestedProfessorId, scope);
      await validateDiaryEnrollments(initialMatriculas, scope);
      const timestamp = now();
      const result = await runSql(
        `INSERT INTO diarios_turma
          (curso, turma, disciplina, periodo, professor_usuario_id, status, criado_por, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [scope.curso, scope.turma, scope.disciplina, scope.periodo, professorUsuarioId,
          status, userId(user), timestamp, timestamp]
      );
      await insertDiaryEnrollments(user, result.lastID, initialMatriculas);
      return result.lastID;
    });
  } catch (error) {
    if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
      throw new AcademicLifeError(409, 'academic_diary_conflict', 'Já existe um diário para esta turma, disciplina e período.');
    }
    throw error;
  }
  return toDiaryDto(await getDiary(diaryId));
}

function diaryScopeChanged(current, scope) {
  return !sameValue(current.curso, scope.curso) ||
    !sameValue(current.turma, scope.turma) ||
    normalizeSubjectName(current.disciplina) !== normalizeSubjectName(scope.disciplina) ||
    Number(current.periodo) !== Number(scope.periodo);
}

async function diaryHasDependentRecords(diaryId) {
  const records = await getSql(
    `SELECT
       EXISTS(SELECT 1 FROM matriculas_diario WHERE diario_id = ?) AS has_matriculas,
       EXISTS(SELECT 1 FROM aulas_diario WHERE diario_id = ?) AS has_aulas,
       EXISTS(SELECT 1 FROM avaliacoes_diario WHERE diario_id = ?) AS has_avaliacoes`,
    [diaryId, diaryId, diaryId]
  );
  return Number(records?.has_matriculas) === 1 ||
    Number(records?.has_aulas) === 1 ||
    Number(records?.has_avaliacoes) === 1;
}

async function updateDiary(user, diaryId, input) {
  const current = await getDiary(diaryId);
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) {
    throw forbidden('Somente Administração, Direção ou Coordenação pode alterar a configuração do diário.');
  }
  if (!canManageDiaryScope(user, current)) throw forbidden('Você não pode alterar este diário.');
  const merged = {
    curso: input?.curso === undefined ? current.curso : input.curso,
    turma: input?.turma === undefined ? current.turma : input.turma,
    disciplina: input?.disciplina === undefined ? current.disciplina : input.disciplina,
    periodo: input?.periodo === undefined ? current.periodo : input.periodo,
    status: input?.status === undefined ? current.status : input.status,
    professorUsuarioId: input?.professorUsuarioId ?? input?.professor_usuario_id ?? current.professor_usuario_id
  };
  const scope = validateScopeInput(merged);
  if (!canManageDiaryScope(user, scope)) throw forbidden('Você não pode mover diário para outro escopo.');
  if (diaryScopeChanged(current, scope) && await diaryHasDependentRecords(current.id)) {
    throw new AcademicLifeError(
      409,
      'academic_diary_scope_locked',
      'Não é possível alterar curso, turma, matéria ou período de um diário que já possui matrículas ou lançamentos. Crie outro diário para o novo escopo.'
    );
  }
  const status = text(merged.status, { field: 'Status', required: true, maxLength: 20 });
  if (!DIARY_STATUSES.has(status)) throw badRequest('Status de diário inválido.');
  const professorUsuarioId = await validateAssignedProfessor(merged.professorUsuarioId, scope);
  try {
    await runSql(
      `UPDATE diarios_turma
       SET curso = ?, turma = ?, disciplina = ?, periodo = ?, professor_usuario_id = ?, status = ?, atualizado_em = ?
       WHERE id = ?`,
      [scope.curso, scope.turma, scope.disciplina, scope.periodo, professorUsuarioId, status, now(), current.id]
    );
  } catch (error) {
    if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
      throw new AcademicLifeError(409, 'academic_diary_conflict', 'Já existe um diário para esta turma, disciplina e período.');
    }
    throw error;
  }
  return toDiaryDto(await getDiary(current.id));
}

async function enrollStudents(user, diaryId, inputMatriculas) {
  const normalized = normalizeEnrollmentMatriculas(inputMatriculas);
  const normalizedDiaryId = await withImmediateTransaction(async () => {
    const diary = await getDiary(diaryId);
    if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) {
      throw forbidden('Somente Administração, Direção ou Coordenação pode alterar matrículas do diário.');
    }
    if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode matricular alunos neste diário.');
    await validateDiaryEnrollments(normalized, diary);
    await insertDiaryEnrollments(user, diary.id, normalized);
    return diary.id;
  });
  return listDiaryEnrollments(user, normalizedDiaryId);
}

async function setDiaryEnrollmentActive(user, diaryId, matriculaInput, active) {
  const diary = await getDiary(diaryId);
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) {
    throw forbidden('Somente Administração, Direção ou Coordenação pode alterar matrículas do diário.');
  }
  if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode alterar matrículas deste diário.');
  const matricula = normalizeMatricula(matriculaInput);
  if (!matricula) throw badRequest('Matrícula inválida.');
  if (active) await assertStudentMatchesDiary(matricula, diary);
  const result = await runSql(
    `UPDATE matriculas_diario SET ativa = ?, matriculado_por = ?, matriculado_em = ?
     WHERE diario_id = ? AND lower(trim(matricula)) = lower(trim(?))`,
    [active ? 1 : 0, userId(user), now(), diary.id, matricula]
  );
  if (result.changes !== 1) throw notFound('Matrícula deste diário não encontrada.');
  return listDiaryEnrollments(user, diary.id);
}

async function listDiaryEnrollments(user, diaryId) {
  const diary = await getDiary(diaryId);
  const student = isRole(user, 'Aluno') ? await studentScope(user) : null;
  if (isRole(user, 'Aluno')) {
    if (!await isStudentEnrolled(diary.id, student.matricula)) throw forbidden('Você não pode acessar este diário.');
    return [{ matricula: student.matricula, nome: student.nome, ativa: true }];
  }
  if (!canReadDiaryStaff(user, diary)) throw forbidden('Você não pode acessar este diário.');
  const rows = await allSql(
    `SELECT md.matricula, md.ativa, a.nome
     FROM matriculas_diario md
     JOIN alunos a ON lower(trim(a.matricula)) = lower(trim(md.matricula))
     WHERE md.diario_id = ? ORDER BY a.nome, a.matricula`,
    [diary.id]
  );
  return rows.map((row) => ({ matricula: row.matricula, nome: row.nome, ativa: Number(row.ativa) === 1 }));
}

async function createLesson(user, diaryId, input) {
  const diary = await getDiary(diaryId);
  if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode lançar aulas neste diário.');
  if (diary.status !== 'aberto') throw badRequest('Não é possível lançar aula em diário fechado.');
  const timestamp = now();
  const result = await runSql(
    `INSERT INTO aulas_diario
      (diario_id, data_aula, titulo, conteudo, carga_horaria, criado_por, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [diary.id, date(input?.dataAula ?? input?.data_aula, { field: 'Data da aula' }),
      text(input?.titulo, { field: 'Título', required: true, maxLength: 160 }),
      text(input?.conteudo, { field: 'Conteúdo', maxLength: 4000 }),
      decimal(input?.cargaHoraria ?? input?.carga_horaria, { field: 'Carga horária', min: 0.1, max: 24 }) ?? 1,
      userId(user), timestamp, timestamp]
  );
  return toLessonDto(await getLesson(result.lastID));
}

async function updateLesson(user, lessonId, input) {
  const current = await getLesson(lessonId);
  const diary = await getDiary(current.diario_id);
  if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode alterar esta aula.');
  if (diary.status !== 'aberto') throw badRequest('Não é possível alterar aula em diário fechado.');
  await runSql(
    `UPDATE aulas_diario
     SET data_aula = ?, titulo = ?, conteudo = ?, carga_horaria = ?, atualizado_em = ? WHERE id = ?`,
    [date(input?.dataAula ?? input?.data_aula ?? current.data_aula, { field: 'Data da aula' }),
      text(input?.titulo ?? current.titulo, { field: 'Título', required: true, maxLength: 160 }),
      text(input?.conteudo === undefined ? current.conteudo : input.conteudo, { field: 'Conteúdo', maxLength: 4000 }),
      decimal(input?.cargaHoraria ?? input?.carga_horaria ?? current.carga_horaria, { field: 'Carga horária', min: 0.1, max: 24, required: true }),
      now(), current.id]
  );
  return toLessonDto(await getLesson(current.id));
}

async function deleteLesson(user, lessonId) {
  const lesson = await getLesson(lessonId);
  const diary = await getDiary(lesson.diario_id);
  if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode excluir esta aula.');
  if (diary.status !== 'aberto') throw badRequest('Não é possível excluir aula em diário fechado.');
  await runSql('DELETE FROM aulas_diario WHERE id = ?', [lesson.id]);
}

async function setAttendance(user, lessonId, matriculaInput, input) {
  const lesson = await getLesson(lessonId);
  const diary = await getDiary(lesson.diario_id);
  if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode lançar frequência nesta aula.');
  if (diary.status !== 'aberto') throw badRequest('Não é possível lançar frequência em diário fechado.');
  const matricula = normalizeMatricula(matriculaInput);
  if (!matricula || !await isStudentEnrolled(diary.id, matricula)) {
    throw badRequest('O aluno não possui matrícula ativa neste diário.');
  }
  const situacao = text(input?.situacao, { field: 'Situação de frequência', required: true, maxLength: 20 })?.toUpperCase();
  if (!ATTENDANCE_STATUSES.has(situacao)) throw badRequest('Situação de frequência inválida.');
  const timestamp = now();
  await runSql(
    `INSERT INTO frequencias_aula
      (aula_id, matricula, situacao, observacao, registrado_por, registrado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(aula_id, matricula) DO UPDATE SET
       situacao = excluded.situacao,
       observacao = excluded.observacao,
       registrado_por = excluded.registrado_por,
       atualizado_em = excluded.atualizado_em`,
    [lesson.id, matricula, situacao,
      text(input?.observacao, { field: 'Observação', maxLength: 1000 }),
      userId(user), timestamp, timestamp]
  );
  const row = await getSql(
    `SELECT * FROM frequencias_aula
     WHERE aula_id = ? AND lower(trim(matricula)) = lower(trim(?))`,
    [lesson.id, matricula]
  );
  return toAttendanceDto(row);
}

async function createAssessment(user, diaryId, input) {
  const diary = await getDiary(diaryId);
  if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode lançar avaliações neste diário.');
  if (diary.status !== 'aberto') throw badRequest('Não é possível lançar avaliação em diário fechado.');
  const timestamp = now();
  const result = await runSql(
    `INSERT INTO avaliacoes_diario
      (diario_id, titulo, descricao, data_avaliacao, peso, nota_maxima, criado_por, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [diary.id, text(input?.titulo, { field: 'Título', required: true, maxLength: 160 }),
      text(input?.descricao, { field: 'Descrição', maxLength: 2000 }),
      date(input?.dataAvaliacao ?? input?.data_avaliacao, { field: 'Data da avaliação' }),
      decimal(input?.peso, { field: 'Peso', min: 0.01, max: 100 }) ?? 1,
      decimal(input?.notaMaxima ?? input?.nota_maxima, { field: 'Nota máxima', min: 0.01, max: 1000 }) ?? 100,
      userId(user), timestamp, timestamp]
  );
  return toAssessmentDto(await getAssessment(result.lastID));
}

async function updateAssessment(user, assessmentId, input) {
  const current = await getAssessment(assessmentId);
  const diary = await getDiary(current.diario_id);
  if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode alterar esta avaliação.');
  if (diary.status !== 'aberto') throw badRequest('Não é possível alterar avaliação em diário fechado.');
  await runSql(
    `UPDATE avaliacoes_diario
     SET titulo = ?, descricao = ?, data_avaliacao = ?, peso = ?, nota_maxima = ?, atualizado_em = ? WHERE id = ?`,
    [text(input?.titulo ?? current.titulo, { field: 'Título', required: true, maxLength: 160 }),
      text(input?.descricao === undefined ? current.descricao : input.descricao, { field: 'Descrição', maxLength: 2000 }),
      date(input?.dataAvaliacao ?? input?.data_avaliacao ?? current.data_avaliacao, { field: 'Data da avaliação' }),
      decimal(input?.peso ?? current.peso, { field: 'Peso', min: 0.01, max: 100, required: true }),
      decimal(input?.notaMaxima ?? input?.nota_maxima ?? current.nota_maxima, { field: 'Nota máxima', min: 0.01, max: 1000, required: true }),
      now(), current.id]
  );
  return toAssessmentDto(await getAssessment(current.id));
}

async function deleteAssessment(user, assessmentId) {
  const assessment = await getAssessment(assessmentId);
  const diary = await getDiary(assessment.diario_id);
  if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode excluir esta avaliação.');
  if (diary.status !== 'aberto') throw badRequest('Não é possível excluir avaliação em diário fechado.');
  await runSql('DELETE FROM avaliacoes_diario WHERE id = ?', [assessment.id]);
}

async function setGrade(user, assessmentId, matriculaInput, input) {
  const assessment = await getAssessment(assessmentId);
  const diary = await getDiary(assessment.diario_id);
  if (!canManageDiaryScope(user, diary)) throw forbidden('Você não pode lançar nota nesta avaliação.');
  if (diary.status !== 'aberto') throw badRequest('Não é possível lançar nota em diário fechado.');
  const matricula = normalizeMatricula(matriculaInput);
  if (!matricula || !await isStudentEnrolled(diary.id, matricula)) {
    throw badRequest('O aluno não possui matrícula ativa neste diário.');
  }
  const nota = decimal(input?.nota, { field: 'Nota', min: 0, max: Number(assessment.nota_maxima), required: true });
  const timestamp = now();
  await runSql(
    `INSERT INTO notas_avaliacao
      (avaliacao_id, matricula, nota, observacao, lancado_por, lancado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(avaliacao_id, matricula) DO UPDATE SET
       nota = excluded.nota,
       observacao = excluded.observacao,
       lancado_por = excluded.lancado_por,
       atualizado_em = excluded.atualizado_em`,
    [assessment.id, matricula, nota,
      text(input?.observacao, { field: 'Observação', maxLength: 1000 }),
      userId(user), timestamp, timestamp]
  );
  const row = await getSql(
    `SELECT * FROM notas_avaliacao
     WHERE avaliacao_id = ? AND lower(trim(matricula)) = lower(trim(?))`,
    [assessment.id, matricula]
  );
  return toGradeDto(row);
}

async function getDiaryDetail(user, diaryId) {
  const diary = await getDiary(diaryId);
  const student = isRole(user, 'Aluno') ? await studentScope(user) : null;
  if (!await canReadDiary(user, diary, student)) throw forbidden('Você não pode acessar este diário.');
  const [lessons, assessments, enrollments] = await Promise.all([
    allSql('SELECT * FROM aulas_diario WHERE diario_id = ? ORDER BY data_aula, id', [diary.id]),
    allSql('SELECT * FROM avaliacoes_diario WHERE diario_id = ? ORDER BY data_avaliacao, id', [diary.id]),
    listDiaryEnrollments(user, diary.id)
  ]);
  const lessonIds = lessons.map((lesson) => lesson.id);
  const assessmentIds = assessments.map((assessment) => assessment.id);
  const studentFilter = isRole(user, 'Aluno') ? student.matricula : null;
  const attendance = await listAttendance(lessonIds, studentFilter);
  const grades = await listGrades(assessmentIds, studentFilter);
  return {
    diario: toDiaryDto(diary),
    matriculas: enrollments,
    aulas: lessons.map(toLessonDto),
    frequencias: attendance.map(toAttendanceDto),
    avaliacoes: assessments.map(toAssessmentDto),
    notas: grades.map(toGradeDto)
  };
}

async function listAttendance(lessonIds, matricula = null) {
  if (!lessonIds.length) return [];
  const placeholders = lessonIds.map(() => '?').join(', ');
  const params = [...lessonIds];
  let sql = `SELECT * FROM frequencias_aula WHERE aula_id IN (${placeholders})`;
  if (matricula) {
    sql += ' AND lower(trim(matricula)) = lower(trim(?))';
    params.push(matricula);
  }
  sql += ' ORDER BY aula_id, matricula';
  return allSql(sql, params);
}

async function listGrades(assessmentIds, matricula = null) {
  if (!assessmentIds.length) return [];
  const placeholders = assessmentIds.map(() => '?').join(', ');
  const params = [...assessmentIds];
  let sql = `SELECT * FROM notas_avaliacao WHERE avaliacao_id IN (${placeholders})`;
  if (matricula) {
    sql += ' AND lower(trim(matricula)) = lower(trim(?))';
    params.push(matricula);
  }
  sql += ' ORDER BY avaliacao_id, matricula';
  return allSql(sql, params);
}

/**
 * A frequência é um indicador acadêmico calculado pelo servidor. Um registro vazio não pode
 * ser interpretado como presença: se alguma aula ministrada ainda não tiver
 * registro, o percentual continua disponível para auditoria, mas sua
 * situação é indicada como indisponível.
 */
function attendanceSummaryStatus({ totalClasses, registeredClasses, absencePercent }) {
  if (!totalClasses || registeredClasses < totalClasses) return 'indisponivel';
  if (absencePercent >= 25) return 'risco';
  if (absencePercent >= 20) return 'alerta';
  return 'regular';
}

function buildAttendanceSummaries(details) {
  return details.flatMap((detail) => {
    const totalClasses = detail.aulas.length;
    const attendanceByMatricula = new Map();
    for (const record of detail.frequencias) {
      const key = normalizeMatricula(record.matricula);
      if (!key) continue;
      const records = attendanceByMatricula.get(key) || [];
      records.push(record);
      attendanceByMatricula.set(key, records);
    }

    return detail.matriculas
      .filter((enrollment) => enrollment.ativa)
      .map((enrollment) => {
        const records = attendanceByMatricula.get(normalizeMatricula(enrollment.matricula)) || [];
        const attendedClasses = records.filter((record) => record.situacao === 'PRESENTE').length;
        const missedClasses = records.filter((record) => record.situacao === 'FALTA').length;
        const justifiedAbsences = records.filter((record) => record.situacao === 'JUSTIFICADA').length;
        const registeredClasses = records.length;
        const absencePercent = totalClasses > 0
          ? Number(((missedClasses / totalClasses) * 100).toFixed(1))
          : null;

        return {
          diarioId: detail.diario.id,
          matricula: enrollment.matricula,
          totalClasses,
          registeredClasses,
          attendedClasses,
          missedClasses,
          justifiedAbsences,
          absencePercent,
          status: attendanceSummaryStatus({ totalClasses, registeredClasses, absencePercent: absencePercent ?? 0 })
        };
      });
  });
}

async function listRequests(user, { periodo } = {}) {
  if (isRole(user, 'Professor')) return [];
  const requestedPeriod = periodo === undefined || periodo === null || periodo === '' ? null : validatePeriod(periodo);
  const periodClause = requestedPeriod === null ? '' : ' AND (periodo IS NULL OR periodo = ?)';
  if (isRole(user, 'Aluno')) {
    const student = await studentScope(user);
    const rows = await allSql(
      `SELECT * FROM requerimentos_academicos
       WHERE lower(trim(matricula)) = lower(trim(?))${periodClause}
       ORDER BY criado_em DESC, id DESC`,
      requestedPeriod === null ? [student.matricula] : [student.matricula, requestedPeriod]
    );
    return rows.map(toRequestDto);
  }
  const where = [];
  const params = [];
  if (isCourseManager(user)) {
    where.push('lower(trim(a.curso)) = lower(trim(?))');
    params.push(user.curso);
  }
  if (requestedPeriod !== null) {
    where.push('(r.periodo IS NULL OR r.periodo = ?)');
    params.push(requestedPeriod);
  }
  const rows = await allSql(
    `SELECT r.* FROM requerimentos_academicos r
     JOIN alunos a ON lower(trim(a.matricula)) = lower(trim(r.matricula))
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.criado_em DESC, r.id DESC`,
    params
  );
  return rows.map(toRequestDto);
}

async function createRequest(user, input) {
  let matricula;
  if (isRole(user, 'Aluno')) {
    matricula = (await studentScope(user)).matricula;
  } else if (['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) {
    const student = await getStudentByMatricula(input?.matricula);
    if (isCourseManager(user) && !sameValue(user.curso, student.curso)) throw forbidden('Você só pode criar requerimentos no seu curso.');
    matricula = student.matricula;
  } else {
    throw forbidden('Professor não pode criar requerimentos em nome de aluno.');
  }
  const period = input?.periodo === undefined || input?.periodo === null || input?.periodo === ''
    ? null
    : validatePeriod(input.periodo);
  const timestamp = now();
  const result = await runSql(
    `INSERT INTO requerimentos_academicos
      (matricula, tipo, descricao, periodo, status, criado_em, atualizado_em, atualizado_por)
     VALUES (?, ?, ?, ?, 'ABERTO', ?, ?, ?)`,
    [matricula, text(input?.tipo, { field: 'Tipo de requerimento', required: true, maxLength: 120 }),
      text(input?.descricao, { field: 'Descrição', maxLength: 2000 }), period, timestamp, timestamp, userId(user)]
  );
  return toRequestDto(await getSql('SELECT * FROM requerimentos_academicos WHERE id = ?', [result.lastID]));
}

async function updateRequest(user, requestId, input) {
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) throw forbidden('Somente Administração, Direção ou Coordenação pode atualizar requerimentos.');
  const id = integer(requestId, { field: 'Requerimento', min: 1, required: true });
  const request = await getSql('SELECT * FROM requerimentos_academicos WHERE id = ?', [id]);
  if (!request) throw notFound('Requerimento acadêmico não encontrado.');
  const student = await getStudentByMatricula(request.matricula);
  if (isCourseManager(user) && !sameValue(user.curso, student.curso)) throw forbidden('Você não pode atualizar requerimento de outro curso.');
  const status = text(input?.status ?? request.status, { field: 'Status', required: true, maxLength: 20 })?.toUpperCase();
  if (!REQUEST_STATUSES.has(status)) throw badRequest('Status de requerimento inválido.');
  await runSql(
    `UPDATE requerimentos_academicos SET status = ?, descricao = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?`,
    [status, text(input?.descricao === undefined ? request.descricao : input.descricao, { field: 'Descrição', maxLength: 2000 }),
      now(), userId(user), id]
  );
  return toRequestDto(await getSql('SELECT * FROM requerimentos_academicos WHERE id = ?', [id]));
}

async function deleteRequest(user, requestId) {
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) {
    throw forbidden('Somente Administração, Direção ou Coordenação pode excluir requerimentos.');
  }
  const id = integer(requestId, { field: 'Requerimento', min: 1, required: true });
  const request = await getSql('SELECT * FROM requerimentos_academicos WHERE id = ?', [id]);
  if (!request) throw notFound('Requerimento acadêmico não encontrado.');
  const student = await getStudentByMatricula(request.matricula);
  if (isCourseManager(user) && !sameValue(user.curso, student.curso)) {
    throw forbidden('Você não pode excluir requerimento de outro curso.');
  }
  await runSql('DELETE FROM requerimentos_academicos WHERE id = ?', [id]);
}

async function listDocuments(user, { periodo } = {}) {
  if (isRole(user, 'Professor')) return [];
  const requestedPeriod = periodo === undefined || periodo === null || periodo === '' ? null : validatePeriod(periodo);
  const periodClause = requestedPeriod === null ? '' : ' AND (periodo IS NULL OR periodo = ?)';
  if (isRole(user, 'Aluno')) {
    const student = await studentScope(user);
    const rows = await allSql(
      `SELECT * FROM documentos_academicos
       WHERE lower(trim(matricula)) = lower(trim(?)) AND status = ?${periodClause}
       ORDER BY criado_em DESC, id DESC`,
      requestedPeriod === null ? [student.matricula, 'DISPONIVEL'] : [student.matricula, 'DISPONIVEL', requestedPeriod]
    );
    return rows.map(toDocumentDto);
  }
  const where = [];
  const params = [];
  if (isCourseManager(user)) {
    where.push('lower(trim(a.curso)) = lower(trim(?))');
    params.push(user.curso);
  }
  if (requestedPeriod !== null) {
    where.push('(d.periodo IS NULL OR d.periodo = ?)');
    params.push(requestedPeriod);
  }
  const rows = await allSql(
    `SELECT d.* FROM documentos_academicos d
     JOIN alunos a ON lower(trim(a.matricula)) = lower(trim(d.matricula))
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY d.criado_em DESC, d.id DESC`,
    params
  );
  return rows.map(toDocumentDto);
}

async function createDocument(user, input) {
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) throw forbidden('Somente Administração, Direção ou Coordenação pode registrar documentos.');
  const student = await getStudentByMatricula(input?.matricula);
  if (isCourseManager(user) && !sameValue(user.curso, student.curso)) throw forbidden('Você só pode registrar documentos no seu curso.');
  const period = input?.periodo === undefined || input?.periodo === null || input?.periodo === '' ? null : validatePeriod(input.periodo);
  const timestamp = now();
  const result = await runSql(
    `INSERT INTO documentos_academicos
      (matricula, tipo, titulo, descricao, periodo, referencia_externa, status, criado_por, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, 'DISPONIVEL', ?, ?, ?)`,
    [student.matricula,
      text(input?.tipo, { field: 'Tipo de documento', required: true, maxLength: 120 }),
      text(input?.titulo, { field: 'Título', required: true, maxLength: 160 }),
      text(input?.descricao, { field: 'Descrição', maxLength: 2000 }),
      period,
      text(input?.referenciaExterna ?? input?.referencia_externa, { field: 'Referência externa', maxLength: 2048 }),
      userId(user), timestamp, timestamp]
  );
  return toDocumentDto(await getSql('SELECT * FROM documentos_academicos WHERE id = ?', [result.lastID]));
}

async function updateDocument(user, documentId, input) {
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) throw forbidden('Somente Administração, Direção ou Coordenação pode atualizar documentos.');
  const id = integer(documentId, { field: 'Documento', min: 1, required: true });
  const document = await getSql('SELECT * FROM documentos_academicos WHERE id = ?', [id]);
  if (!document) throw notFound('Documento acadêmico não encontrado.');
  const student = await getStudentByMatricula(document.matricula);
  if (isCourseManager(user) && !sameValue(user.curso, student.curso)) throw forbidden('Você não pode atualizar documento de outro curso.');
  const status = text(input?.status ?? document.status, { field: 'Status', required: true, maxLength: 20 })?.toUpperCase();
  if (!DOCUMENT_STATUSES.has(status)) throw badRequest('Status de documento inválido.');
  const periodValue = input?.periodo === undefined ? document.periodo : input.periodo;
  const period = periodValue === null || periodValue === '' ? null : validatePeriod(periodValue);
  await runSql(
    `UPDATE documentos_academicos
     SET tipo = ?, titulo = ?, descricao = ?, periodo = ?, referencia_externa = ?, status = ?, atualizado_em = ?
     WHERE id = ?`,
    [text(input?.tipo ?? document.tipo, { field: 'Tipo de documento', required: true, maxLength: 120 }),
      text(input?.titulo ?? document.titulo, { field: 'Título', required: true, maxLength: 160 }),
      text(input?.descricao === undefined ? document.descricao : input.descricao, { field: 'Descrição', maxLength: 2000 }),
      period,
      text(input?.referenciaExterna ?? input?.referencia_externa ?? document.referencia_externa, { field: 'Referência externa', maxLength: 2048 }),
      status, now(), id]
  );
  return toDocumentDto(await getSql('SELECT * FROM documentos_academicos WHERE id = ?', [id]));
}

async function deleteDocument(user, documentId) {
  if (!['Admin', 'Diretor', 'Coordenador'].includes(user?.role)) throw forbidden('Somente Administração, Direção ou Coordenação pode arquivar documentos.');
  const id = integer(documentId, { field: 'Documento', min: 1, required: true });
  const document = await getSql('SELECT * FROM documentos_academicos WHERE id = ?', [id]);
  if (!document) throw notFound('Documento acadêmico não encontrado.');
  const student = await getStudentByMatricula(document.matricula);
  if (isCourseManager(user) && !sameValue(user.curso, student.curso)) throw forbidden('Você não pode arquivar documento de outro curso.');
  await runSql('UPDATE documentos_academicos SET status = ?, atualizado_em = ? WHERE id = ?', ['ARQUIVADO', now(), id]);
}

async function getAcademicLifeOverview(user, { periodo } = {}) {
  const period = periodo === undefined || periodo === null || periodo === '' ? 0 : validatePeriod(periodo);
  const [calendars, diaries, requests, documents] = await Promise.all([
    listCalendars(user, { periodo: period }),
    listDiaries(user, { periodo: period }),
    listRequests(user, { periodo: period }),
    listDocuments(user, { periodo: period })
  ]);
  const eventsByCalendar = await Promise.all(calendars.map((calendar) => listCalendarEvents(user, calendar.id)));
  const details = await Promise.all(diaries.map((diary) => getDiaryDetail(user, diary.id)));
  const isStudent = isRole(user, 'Aluno');
  const attendanceSummaries = buildAttendanceSummaries(details);

  return {
    period,
    currentPeriodName: periods[period],
    periodOptions: periods,
    scopeLabel: scopeLabel(user),
    subjects: diaries.map((diary) => ({
      diarioId: diary.id,
      nome: diary.disciplina,
      curso: diary.curso,
      turma: diary.turma,
      status: diary.status
    })),
    calendars,
    calendarEvents: eventsByCalendar.flat(),
    diaries,
    diaryEnrollments: details.flatMap((detail) => detail.matriculas.map((enrollment) => ({
      diarioId: detail.diario.id,
      ...enrollment
    }))),
    classSessions: details.flatMap((detail) => detail.aulas),
    attendance: details.flatMap((detail) => detail.frequencias),
    attendanceSummaries,
    assessments: details.flatMap((detail) => detail.avaliacoes),
    grades: details.flatMap((detail) => detail.notas),
    documents,
    requests,
    privacy: isStudent
      ? 'Somente seus registros de frequência, notas, documentos e requerimentos são retornados.'
      : 'Os dados retornados são limitados ao escopo acadêmico do perfil autenticado.'
  };
}

module.exports = {
  AcademicLifeError,
  EVENT_TYPES,
  ATTENDANCE_STATUSES,
  REQUEST_STATUSES,
  DOCUMENT_STATUSES,
  getAcademicLifeOverview,
  listCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listAssignableProfessors,
  listDiaries,
  createDiary,
  updateDiary,
  getDiaryDetail,
  listDiaryEnrollments,
  enrollStudents,
  setDiaryEnrollmentActive,
  createLesson,
  updateLesson,
  deleteLesson,
  setAttendance,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  setGrade,
  listRequests,
  createRequest,
  updateRequest,
  deleteRequest,
  listDocuments,
  createDocument,
  updateDocument,
  deleteDocument
};
