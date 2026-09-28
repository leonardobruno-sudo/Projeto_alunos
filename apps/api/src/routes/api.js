/**
 * Protected JSON API for students, academic data, user administration,
 * backups and CSV imports. It applies authentication, role scope and input
 * validation before changing the SQLite database.
 */
const express = require('express');
const multer = require('multer');
const { parse: parseCsv } = require('csv-parse/sync');
const router = express.Router();
const {
  allSql,
  getSql,
  runSql,
  fetchVisibleStudents,
  fetchHistoricalStudents,
  collectSubjectNames,
  backupDatabase,
  getStudentByMatricula,
  getVisibleStudentByMatricula,
  saveAcademicHistoryPeriod,
  createStudentWithAccount,
  deleteStudentByMatricula,
  updateStudentFields
} = require('../lib/database');
const { canEditStudent } = require('../lib/permissions');
const { hashPassword, normalizeMatricula, normalizeSubjectName } = require('../lib/utils');
const { periods, manageRoles } = require('../lib/constants');
const { ensureAuth } = require('../lib/helpers');
const {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiConflict,
  apiServerError
} = require('../lib/apiResponse');

const CSV_IMPORT_COLUMNS = [
  'matricula',
  'nome',
  'telefone',
  'curso',
  'disciplina',
  'categoria',
  'turma',
  'tipo_cota',
  'descricao'
];
const MAX_IMPORT_FILE_SIZE = 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMPORT_FILE_SIZE,
    files: 1,
    fields: 0
  }
});

function hasStudentManagementAccess(user) {
  return manageRoles.includes(user?.role);
}

function getText(value) {
  return String(value ?? '').trim();
}

function getNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function parsePeriod(value) {
  if (value === undefined || value === '') return 0;
  const periodIndex = Number(value);
  return Number.isInteger(periodIndex) && periodIndex >= 0 && periodIndex < periods.length
    ? periodIndex
    : null;
}

const STATISTICS_FILTER_LIMITS = {
  curso: 120,
  turma: 80,
  categoria: 120,
  cota: 20
};

// The selector in React sends one of these stable storage codes. Keeping the
// validation here also prevents arbitrary values from being treated as a
// quota modality by API consumers.
const QUOTA_FILTER_CODES = new Set([
  'AC', 'PCD_AC', 'L1', 'L2', 'L5', 'L6', 'L9', 'L10', 'L13', 'L14'
]);

function parseStatisticsFilters(query = {}) {
  const filters = {};

  for (const [field, maxLength] of Object.entries(STATISTICS_FILTER_LIMITS)) {
    const rawValue = query[field];
    if (rawValue === undefined || rawValue === '') {
      filters[field] = '';
      continue;
    }
    if (Array.isArray(rawValue) || (typeof rawValue !== 'string' && typeof rawValue !== 'number')) {
      return { error: `Filtro de ${field} inválido.` };
    }

    const value = getText(rawValue);
    if (value.length > maxLength) {
      return { error: `O filtro de ${field} deve ter no máximo ${maxLength} caracteres.` };
    }
    if (field === 'cota') {
      const quotaCode = value.toUpperCase();
      if (quotaCode && !QUOTA_FILTER_CODES.has(quotaCode)) {
        return { error: 'Modalidade de cota inválida.' };
      }
      filters[field] = quotaCode;
      continue;
    }
    filters[field] = value;
  }

  return { filters };
}

function getRiskStatus(record) {
  const status = getText(record?.situacao_risco).toLowerCase();
  if (status.includes('risco') || record?.risco_nota || record?.risco_faltas) return 'Em Risco';
  if (status.includes('alerta') || record?.alerta_nota || record?.alerta_faltas) return 'Alerta';
  return 'Regular';
}

function roundStatistic(value) {
  return Number(value.toFixed(1));
}

function getStatisticsScope(user) {
  if (user.role === 'Aluno') return { role: user.role, label: 'Seu desempenho' };
  if (user.role === 'Professor') return { role: user.role, label: `Turma ${user.turma}` };
  if (user.role === 'Diretor') return { role: user.role, label: `Curso ${user.curso}` };
  return { role: user.role, label: 'Todos os alunos' };
}

/** Builds chart-ready aggregates without exposing students outside the current role scope. */
function buildStatistics(alunos) {
  const statusCounts = [
    { label: 'Em Risco', value: 0 },
    { label: 'Alerta', value: 0 },
    { label: 'Regular', value: 0 }
  ];
  const statusCountByLabel = new Map(statusCounts.map((entry) => [entry.label, entry]));
  const gradeDistribution = [
    { label: '0–59', value: 0 },
    { label: '60–69', value: 0 },
    { label: '70–79', value: 0 },
    { label: '80–89', value: 0 },
    { label: '90–100', value: 0 }
  ];
  const attendanceDistribution = [
    { label: '0–9%', value: 0 },
    { label: '10–19%', value: 0 },
    { label: '20–24%', value: 0 },
    { label: '25% ou mais', value: 0 }
  ];
  const subjects = new Map();
  let gradeTotal = 0;
  let attendanceTotal = 0;
  let subjectRecords = 0;

  for (const aluno of alunos) {
    const status = getRiskStatus(aluno);
    statusCountByLabel.get(status).value += 1;

    const grade = Number(aluno.nota_final) || 0;
    gradeTotal += grade;
    if (grade < 60) gradeDistribution[0].value += 1;
    else if (grade < 70) gradeDistribution[1].value += 1;
    else if (grade < 80) gradeDistribution[2].value += 1;
    else if (grade < 90) gradeDistribution[3].value += 1;
    else gradeDistribution[4].value += 1;

    const attendance = Number(aluno.taxa_faltas) || 0;
    attendanceTotal += attendance;
    if (attendance < 10) attendanceDistribution[0].value += 1;
    else if (attendance < 20) attendanceDistribution[1].value += 1;
    else if (attendance < 25) attendanceDistribution[2].value += 1;
    else attendanceDistribution[3].value += 1;

    for (const subject of aluno.subjects || []) {
      const name = getText(subject.name) || 'Matéria sem nome';
      const key = normalizeSubjectName(name) || name.toLowerCase();
      const aggregate = subjects.get(key) || {
        subject: name,
        studentCount: 0,
        gradeTotal: 0,
        attendanceTotal: 0,
        atRisk: 0,
        alert: 0,
        regular: 0
      };
      const subjectStatus = getRiskStatus(subject);
      aggregate.studentCount += 1;
      aggregate.gradeTotal += Number(subject.nota) || 0;
      aggregate.attendanceTotal += Number(subject.percentual_faltas) || 0;
      if (subjectStatus === 'Em Risco') aggregate.atRisk += 1;
      else if (subjectStatus === 'Alerta') aggregate.alert += 1;
      else aggregate.regular += 1;
      subjects.set(key, aggregate);
      subjectRecords += 1;
    }
  }

  const studentCount = alunos.length;
  const subjectAverages = Array.from(subjects.values())
    .map((subject) => ({
      subject: subject.subject,
      studentCount: subject.studentCount,
      averageGrade: roundStatistic(subject.gradeTotal / subject.studentCount),
      averageAttendancePercent: roundStatistic(subject.attendanceTotal / subject.studentCount),
      atRisk: subject.atRisk,
      alert: subject.alert,
      regular: subject.regular
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject, 'pt-BR'));

  return {
    totals: {
      students: studentCount,
      subjectRecords,
      averageGrade: studentCount ? roundStatistic(gradeTotal / studentCount) : 0,
      averageAttendancePercent: studentCount ? roundStatistic(attendanceTotal / studentCount) : 0,
      atRisk: statusCountByLabel.get('Em Risco').value,
      alert: statusCountByLabel.get('Alerta').value,
      regular: statusCountByLabel.get('Regular').value
    },
    statusCounts,
    gradeDistribution,
    attendanceDistribution,
    subjectAverages
  };
}

async function buildHistoryEvolution(session, filters) {
  const periodData = await Promise.all(periods.map((_, periodIndex) => (
    fetchHistoricalStudents({ query: filters, session }, periodIndex)
  )));

  return periodData.map((data, periodIndex) => {
    const statistics = data.hasVisibleRecords ? buildStatistics(data.alunos) : null;
    return {
      periodIndex,
      label: periods[periodIndex],
      available: data.periodSaved,
      hasVisibleRecords: data.hasVisibleRecords,
      students: statistics?.totals.students || 0,
      averageGrade: statistics?.totals.averageGrade || 0,
      averageAttendancePercent: statistics?.totals.averageAttendancePercent || 0,
      atRisk: statistics?.totals.atRisk || 0,
      alert: statistics?.totals.alert || 0,
      regular: statistics?.totals.regular || 0
    };
  });
}

function validateSubjects(rawSubjects) {
  if (rawSubjects === undefined) return { subjects: null };
  if (!Array.isArray(rawSubjects) || rawSubjects.length > 20) {
    return { error: 'Informe uma lista com no máximo 20 matérias.' };
  }

  const knownSubjects = new Set();
  const subjects = [];

  for (const rawSubject of rawSubjects) {
    const name = getText(rawSubject?.name);
    const normalizedName = normalizeSubjectName(name);
    const nota = getNumber(rawSubject?.nota);
    const faltas = getNumber(rawSubject?.faltas);
    const faltasJustificadas = getNumber(rawSubject?.faltas_justificadas ?? rawSubject?.faltasJustificadas);
    const totalAulas = getNumber(rawSubject?.total_aulas ?? rawSubject?.totalAulas);

    if (!name || name.length > 80 || knownSubjects.has(normalizedName)) {
      return { error: 'Cada matéria deve ter um nome único de até 80 caracteres.' };
    }
    if (!Number.isFinite(nota) || nota < 0 || nota > 100) {
      return { error: `A nota de ${name} deve estar entre 0 e 100.` };
    }
    if (![faltas, faltasJustificadas, totalAulas].every(Number.isInteger) || faltas < 0 || faltasJustificadas < 0 || totalAulas < 0) {
      return { error: `Faltas e aulas de ${name} devem ser números inteiros não negativos.` };
    }
    knownSubjects.add(normalizedName);
    subjects.push({
      name,
      nota,
      faltas,
      faltas_justificadas: faltasJustificadas,
      total_aulas: totalAulas
    });
  }

  return { subjects };
}

function getStudentMetrics(subjects, currentStudent = null) {
  if (subjects.length === 0) {
    return { nota_final: 0, taxa_faltas: 0, faltas_justificadas: 0, total_aulas: 0 };
  }

  const totalAulas = subjects.reduce((sum, subject) => sum + subject.total_aulas, 0);
  const storedTotalAulas = getNumber(currentStudent?.total_aulas, NaN);
  const usesLegacySharedWorkload = Number.isInteger(storedTotalAulas) && storedTotalAulas > 0 &&
    subjects.length > 1 && subjects.every((subject) => subject.total_aulas === storedTotalAulas);

  return {
    nota_final: Number((subjects.reduce((sum, subject) => sum + subject.nota, 0) / subjects.length).toFixed(1)),
    taxa_faltas: subjects.reduce((sum, subject) => sum + subject.faltas, 0),
    faltas_justificadas: subjects.reduce((sum, subject) => sum + subject.faltas_justificadas, 0),
    // Legacy records store a single workload total even though each subject
    // repeats it. Keep that denominator when editing such a record.
    total_aulas: usesLegacySharedWorkload ? storedTotalAulas : totalAulas
  };
}

function getStoredSubjects(student) {
  if (!student?.materias_json) return [];
  try {
    const parsed = JSON.parse(student.materias_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function buildStudentFields(body, currentStudent = null) {
  const pick = (field, fallback = '') => (body[field] === undefined ? fallback : getText(body[field]));
  const subjectValidation = validateSubjects(body.subjects);
  if (subjectValidation.error) return { error: subjectValidation.error };

  const subjects = subjectValidation.subjects ?? getStoredSubjects(currentStudent);
  const metrics = getStudentMetrics(subjects, currentStudent);
  const tipoCota = pick('tipo_cota', currentStudent?.cota_detalhada || '');

  return {
    fields: {
      nome: pick('nome', currentStudent?.nome || ''),
      telefone: pick('telefone', currentStudent?.telefone || ''),
      cotista: pick('cotista', tipoCota === 'AC' ? 'Não' : currentStudent?.cotista || 'Sim'),
      cota_detalhada: pick('cota_detalhada', tipoCota),
      categoria: pick('categoria', currentStudent?.categoria || ''),
      curso: pick('curso', currentStudent?.curso || ''),
      disciplina: pick('disciplina', currentStudent?.disciplina || ''),
      turma: pick('turma', currentStudent?.turma || ''),
      descricao: pick('descricao', currentStudent?.descricao || ''),
      materias_json: JSON.stringify(subjects),
      materia1: subjects[0]?.nota || 0,
      materia2: subjects[1]?.nota || 0,
      materia3: subjects[2]?.nota || 0,
      materia4: subjects[3]?.nota || 0,
      materia5: subjects[4]?.nota || 0,
      materia6: subjects[5]?.nota || 0,
      materia7: subjects[6]?.nota || 0,
      ...metrics
    },
    subjects
  };
}

function scopeStudentFields(fields, user) {
  if (user.role === 'Admin') return fields;
  if (user.role === 'Diretor') {
    if (!user.curso) return null;
    return { ...fields, curso: user.curso };
  }
  if (user.role === 'Professor') {
    if (!user.curso || !user.disciplina || !user.turma) return null;
    return { ...fields, curso: user.curso, disciplina: user.disciplina, turma: user.turma };
  }
  return null;
}

function isConstraintError(error) {
  return error?.code === 'SQLITE_CONSTRAINT' || String(error?.message || '').includes('SQLITE_CONSTRAINT');
}

function getStudentAccountProvisionError(error) {
  if (error?.code === 'student_account_identifier_conflict') {
    return {
      status: 'conflict',
      message: 'Não foi possível criar a conta do aluno porque esta matrícula já é usada como usuário por outra conta.'
    };
  }
  if (error?.code === 'student_initial_password_too_long') {
    return {
      status: 'bad_request',
      message: 'A matrícula e o primeiro nome ultrapassam o tamanho aceito para a senha inicial do aluno.'
    };
  }
  return null;
}

function hasSameText(left, right) {
  return getText(left).toLowerCase() === getText(right).toLowerCase();
}

function getNewStudentData(body, user) {
  const matricula = normalizeMatricula(body?.matricula);
  const built = buildStudentFields(body || {});
  if (built.error) return { error: built.error };
  if (!matricula || matricula.length > 40 || !built.fields?.nome || !built.fields?.turma) {
    return { error: 'Matrícula, nome e turma são obrigatórios.' };
  }

  const fields = scopeStudentFields(built.fields, user);
  if (!fields) return { error: 'Seu perfil não possui escopo acadêmico configurado.', forbidden: true };

  return { matricula, fields };
}

function getImportScopeError(row, user) {
  if (user.role === 'Diretor' && getText(row.curso) && !hasSameText(row.curso, user.curso)) {
    return 'O curso informado não pertence ao seu escopo.';
  }

  if (user.role === 'Professor') {
    const scopeFields = [
      ['curso', 'curso'],
      ['disciplina', 'disciplina'],
      ['turma', 'turma']
    ];
    for (const [field, label] of scopeFields) {
      if (getText(row[field]) && !hasSameText(row[field], user[field])) {
        return `A ${label} informada não pertence ao seu escopo.`;
      }
    }
  }

  return null;
}

function parseImportedCsv(fileBuffer) {
  const text = fileBuffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(fileBuffer)) {
    return { error: 'O arquivo deve estar codificado em UTF-8.' };
  }

  let rows;
  try {
    rows = parseCsv(text, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 10000
    });
  } catch (_error) {
    return { error: 'O CSV não está no formato esperado. Verifique aspas, vírgulas e colunas.' };
  }

  if (rows.length === 0) return { error: 'O CSV está vazio.' };

  const header = rows.shift().map((value) => getText(value).toLowerCase());
  const hasExpectedHeader = header.length === CSV_IMPORT_COLUMNS.length &&
    header.every((value, index) => value === CSV_IMPORT_COLUMNS[index]);
  if (!hasExpectedHeader) {
    return { error: `Use exatamente as colunas: ${CSV_IMPORT_COLUMNS.join(', ')}.` };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: `O CSV pode ter no máximo ${MAX_IMPORT_ROWS} alunos por importação.` };
  }

  return {
    rows: rows.map((values, index) => ({
      line: index + 2,
      data: Object.fromEntries(CSV_IMPORT_COLUMNS.map((column, columnIndex) => [column, values[columnIndex]]))
    }))
  };
}

function uploadStudentCsv(req, res, next) {
  importUpload.single('arquivo')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return apiBadRequest(res, `O arquivo CSV pode ter no máximo ${MAX_IMPORT_FILE_SIZE / 1024 / 1024} MB.`);
      }
      return apiBadRequest(res, 'Envie somente um arquivo CSV no campo "arquivo".');
    }

    return apiBadRequest(res, 'Não foi possível receber o arquivo CSV.');
  });
}

function userResponse(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    matricula: user.matricula,
    nome: user.nome,
    curso: user.curso,
    disciplina: user.disciplina,
    turma: user.turma
  };
}

const validRoles = new Set(['Admin', 'Diretor', 'Professor', 'Aluno']);
const managedRoles = new Set(['Admin', 'Diretor', 'Professor']);
const STUDENT_ACCOUNT_MANAGEMENT_MESSAGE =
  'Contas de aluno são criadas e vinculadas automaticamente pelo cadastro ou pela importação. Gerencie os dados do aluno na tela Cadastro.';

function getPasswordValidationError(password) {
  if (password.length < 8) return 'A senha deve ter ao menos 8 caracteres.';
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'A senha deve ter no máximo 72 bytes.';
  }
  return null;
}

async function buildUserProfile(role, source) {
  const nome = getText(source?.nome);
  const matricula = '';
  const curso = getText(source?.curso);
  const disciplina = getText(source?.disciplina);
  const turma = getText(source?.turma);

  if (!managedRoles.has(role)) return { error: STUDENT_ACCOUNT_MANAGEMENT_MESSAGE };

  if (!nome || nome.length > 120) {
    return { error: 'Informe um nome de até 120 caracteres.' };
  }

  if (role === 'Diretor') {
    if (!curso || curso.length > 120) return { error: 'Diretor precisa ter um curso válido.' };
    return { profile: { matricula, nome, curso, disciplina: '', turma: '' } };
  }

  if (role === 'Professor') {
    if (!curso || !disciplina || !turma || curso.length > 120 || disciplina.length > 120 || turma.length > 80) {
      return { error: 'Professor precisa ter curso, disciplina e turma válidos.' };
    }
    return { profile: { matricula, nome, curso, disciplina, turma } };
  }

  return { profile: { matricula, nome, curso: '', disciplina: '', turma: '' } };
}

router.get('/periodos', ensureAuth, (_req, res) => {
  return apiSuccess(res, { periodOptions: periods });
});

router.get('/estatisticas', ensureAuth, async (req, res) => {
  const periodIndex = parsePeriod(req.query.periodo);
  if (periodIndex === null) return apiBadRequest(res, 'Período inválido.');
  const filterResult = parseStatisticsFilters(req.query);
  if (filterResult.error) return apiBadRequest(res, filterResult.error);

  // Extra filters are an Admin convenience only. Other profiles always use
  // their server-side scope and cannot narrow or widen it through this route.
  const adminFilters = req.session.user.role === 'Admin' ? filterResult.filters : {};

  try {
    const statisticsQuery = { periodo: periodIndex, ...adminFilters };
    const [data, evolution] = await Promise.all([
      fetchVisibleStudents({ query: statisticsQuery, session: req.session }),
      buildHistoryEvolution(req.session, adminFilters)
    ]);
    return apiSuccess(res, {
      periodIndex: data.periodIndex,
      currentPeriodName: data.currentPeriodName,
      periodOptions: data.periodOptions,
      scope: getStatisticsScope(req.session.user),
      filters: adminFilters,
      historyAvailable: data.historyAvailable,
      hasPeriodSnapshot: data.hasPeriodSnapshot,
      dataSource: data.dataSource,
      history: data.history,
      evolution,
      ...buildStatistics(data.alunos)
    });
  } catch (error) {
    console.error('Erro ao gerar estatísticas:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível gerar as estatísticas.');
  }
});

router.post('/periodos/:periodo/historico', ensureAuth, async (req, res) => {
  if (req.session.user.role !== 'Admin') {
    return apiForbidden(res, 'Somente administradores podem salvar históricos acadêmicos.');
  }

  const periodIndex = parsePeriod(req.params.periodo);
  if (periodIndex === null) return apiBadRequest(res, 'Período inválido.');
  if (req.body?.overwrite !== undefined && typeof req.body.overwrite !== 'boolean') {
    return apiBadRequest(res, 'O campo overwrite deve ser verdadeiro ou falso.');
  }

  try {
    const history = await saveAcademicHistoryPeriod(
      periodIndex,
      req.session.user.username,
      { overwrite: req.body?.overwrite === true }
    );
    const message = history.requiresOverwrite
      ? `O histórico de ${periods[periodIndex]} já está salvo. Confirme a sobrescrita para alterá-lo.`
      : `Histórico de ${periods[periodIndex]} ${history.updated > 0 ? 'atualizado' : 'salvo'} com sucesso.`;
    return apiSuccess(res, {
      ...history,
      currentPeriodName: periods[periodIndex],
      overwrite: req.body?.overwrite === true
    }, message);
  } catch (error) {
    console.error('Erro ao salvar histórico acadêmico:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível salvar o histórico acadêmico.');
  }
});

router.get('/alunos', ensureAuth, async (req, res) => {
  const periodIndex = parsePeriod(req.query.periodo);
  if (periodIndex === null) return apiBadRequest(res, 'Período inválido.');

  try {
    const data = await fetchVisibleStudents({
      query: { ...req.query, periodo: periodIndex },
      session: req.session
    });
    return apiSuccess(res, data);
  } catch (error) {
    console.error('Erro ao buscar alunos:', error.stack || error.message || error);
    return apiServerError(res, 'Erro ao buscar alunos.');
  }
});

router.get('/alunos/modelo.csv', ensureAuth, (req, res) => {
  if (!hasStudentManagementAccess(req.session.user)) {
    return apiForbidden(res, 'Você não tem permissão para baixar o modelo de importação.');
  }

  res
    .status(200)
    .type('text/csv; charset=utf-8')
    .attachment('modelo-importacao-alunos.csv')
    .send(`\ufeff${CSV_IMPORT_COLUMNS.join(',')}\r\n`);
});

router.post('/alunos/importar', ensureAuth, uploadStudentCsv, async (req, res) => {
  if (!hasStudentManagementAccess(req.session.user)) {
    return apiForbidden(res, 'Você não tem permissão para importar alunos.');
  }
  if (!req.file) return apiBadRequest(res, 'Envie um arquivo CSV no campo "arquivo".');
  if (!/\.csv$/i.test(req.file.originalname || '')) {
    return apiBadRequest(res, 'O arquivo enviado deve ter a extensão .csv.');
  }

  const parsed = parseImportedCsv(req.file.buffer);
  if (parsed.error) return apiBadRequest(res, parsed.error);

  const report = { imported: [], skipped: [], errors: [] };
  const importedMatriculas = new Set();

  for (const row of parsed.rows) {
    const rowData = row.data;
    const scopeError = getImportScopeError(rowData, req.session.user);
    if (scopeError) {
      report.errors.push({ line: row.line, matricula: getText(rowData.matricula) || null, message: scopeError });
      continue;
    }

    const studentData = getNewStudentData({ ...rowData, subjects: [] }, req.session.user);
    if (studentData.error) {
      report.errors.push({ line: row.line, matricula: getText(rowData.matricula) || null, message: studentData.error });
      continue;
    }

    const normalizedMatricula = normalizeMatricula(studentData.matricula);
    if (importedMatriculas.has(normalizedMatricula)) {
      report.skipped.push({ line: row.line, matricula: studentData.matricula, reason: 'Matrícula repetida no próprio arquivo.' });
      continue;
    }

    try {
      const existingStudent = await getSql(
        'SELECT matricula FROM alunos WHERE lower(trim(matricula)) = lower(trim(?))',
        [studentData.matricula]
      );
      if (existingStudent) {
        report.skipped.push({ line: row.line, matricula: studentData.matricula, reason: 'Já existe um aluno com esta matrícula.' });
        continue;
      }

      await createStudentWithAccount({ matricula: studentData.matricula, ...studentData.fields });
      importedMatriculas.add(normalizedMatricula);
      report.imported.push({ line: row.line, matricula: studentData.matricula });
    } catch (error) {
      const accountError = getStudentAccountProvisionError(error);
      if (accountError) {
        report.errors.push({ line: row.line, matricula: studentData.matricula, message: accountError.message });
        continue;
      }
      if (isConstraintError(error)) {
        report.skipped.push({ line: row.line, matricula: studentData.matricula, reason: 'Já existe um aluno com esta matrícula.' });
        continue;
      }
      console.error(`Erro ao importar aluno na linha ${row.line}:`, error.stack || error.message || error);
      report.errors.push({ line: row.line, matricula: studentData.matricula, message: 'Não foi possível salvar esta linha.' });
    }
  }

  const summary = {
    imported: report.imported.length,
    skipped: report.skipped.length,
    errors: report.errors.length
  };
  return apiSuccess(res, { ...report, summary },
    `Importação concluída: ${summary.imported} importado(s), ${summary.skipped} ignorado(s) e ${summary.errors} com erro.`);
});

router.get('/alunos/:matricula', ensureAuth, async (req, res) => {
  const periodIndex = parsePeriod(req.query.periodo);
  if (periodIndex === null) return apiBadRequest(res, 'Período inválido.');

  try {
    const aluno = await getVisibleStudentByMatricula(req.session.user, getText(req.params.matricula), periodIndex);
    if (!aluno) return apiNotFound(res, 'Aluno não encontrado.');
    return apiSuccess(res, { aluno });
  } catch (error) {
    console.error('Erro ao buscar aluno:', error.stack || error.message || error);
    return apiServerError(res, 'Erro ao buscar aluno.');
  }
});

router.post('/alunos', ensureAuth, async (req, res) => {
  if (!hasStudentManagementAccess(req.session.user)) {
    return apiForbidden(res, 'Você não tem permissão para cadastrar alunos.');
  }

  const studentData = getNewStudentData(req.body || {}, req.session.user);
  if (studentData.error) {
    return studentData.forbidden
      ? apiForbidden(res, studentData.error)
      : apiBadRequest(res, studentData.error);
  }

  try {
    const existingStudent = await getStudentByMatricula(studentData.matricula);
    if (existingStudent) return apiConflict(res, 'Já existe um aluno com esta matrícula.');

    await createStudentWithAccount({ matricula: studentData.matricula, ...studentData.fields });
    const aluno = await getVisibleStudentByMatricula(req.session.user, studentData.matricula);
    return apiCreated(res, { aluno }, 'Aluno e conta de acesso cadastrados com sucesso.');
  } catch (error) {
    const accountError = getStudentAccountProvisionError(error);
    if (accountError?.status === 'conflict') return apiConflict(res, accountError.message);
    if (accountError?.status === 'bad_request') return apiBadRequest(res, accountError.message);
    if (isConstraintError(error)) return apiConflict(res, 'Já existe um aluno com esta matrícula.');
    console.error('Erro ao cadastrar aluno:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível cadastrar o aluno.');
  }
});

async function updateStudent(req, res) {
  if (!hasStudentManagementAccess(req.session.user)) {
    return apiForbidden(res, 'Você não tem permissão para editar alunos.');
  }

  const matricula = getText(req.params.matricula);
  try {
    const currentStudent = await getStudentByMatricula(matricula);
    if (!currentStudent) return apiNotFound(res, 'Aluno não encontrado.');
    if (!canEditStudent(req.session.user, currentStudent)) return apiForbidden(res, 'Você não pode editar este aluno.');

    const built = buildStudentFields(req.body || {}, currentStudent);
    if (built.error) return apiBadRequest(res, built.error);
    const fields = scopeStudentFields(built.fields, req.session.user);
    if (!fields) return apiForbidden(res, 'Seu perfil não possui escopo acadêmico configurado.');

    await updateStudentFields(matricula, fields);
    const aluno = await getVisibleStudentByMatricula(req.session.user, matricula);
    return apiSuccess(res, { aluno }, 'Aluno atualizado com sucesso.');
  } catch (error) {
    console.error('Erro ao atualizar aluno:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível atualizar o aluno.');
  }
}

router.patch('/alunos/:matricula', ensureAuth, updateStudent);
router.put('/alunos/:matricula', ensureAuth, updateStudent);

router.delete('/alunos/:matricula', ensureAuth, async (req, res) => {
  if (!hasStudentManagementAccess(req.session.user)) {
    return apiForbidden(res, 'Você não tem permissão para excluir alunos.');
  }

  const matricula = getText(req.params.matricula);
  try {
    const student = await getStudentByMatricula(matricula);
    if (!student) return apiNotFound(res, 'Aluno não encontrado.');
    if (!canEditStudent(req.session.user, student)) return apiForbidden(res, 'Você não pode excluir este aluno.');

    await deleteStudentByMatricula(matricula);
    return apiSuccess(res, null, 'Aluno removido com sucesso. A conta estudantil vinculada foi revogada.');
  } catch (error) {
    console.error('Erro ao remover aluno:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível remover o aluno.');
  }
});

router.patch('/alunos/:matricula/movimentacao', ensureAuth, async (req, res) => {
  if (!hasStudentManagementAccess(req.session.user)) {
    return apiForbidden(res, 'Você não tem permissão para movimentar alunos.');
  }

  const matricula = getText(req.params.matricula);
  try {
    const student = await getStudentByMatricula(matricula);
    if (!student) return apiNotFound(res, 'Aluno não encontrado.');
    if (!canEditStudent(req.session.user, student)) return apiForbidden(res, 'Você não pode movimentar este aluno.');

    const requestedFields = {
      disciplina: getText(req.body?.disciplina ?? req.body?.nova_disciplina ?? student.disciplina),
      categoria: getText(req.body?.categoria ?? req.body?.nova_categoria ?? student.categoria),
      turma: getText(req.body?.turma ?? req.body?.nova_turma ?? student.turma),
      curso: getText(req.body?.curso ?? student.curso)
    };
    const fields = scopeStudentFields(requestedFields, req.session.user);
    if (!fields) return apiForbidden(res, 'Seu perfil não possui escopo acadêmico configurado.');

    await updateStudentFields(matricula, fields);
    const aluno = await getVisibleStudentByMatricula(req.session.user, matricula);
    return apiSuccess(res, { aluno }, 'Aluno movimentado com sucesso.');
  } catch (error) {
    console.error('Erro ao movimentar aluno:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível movimentar o aluno.');
  }
});

router.get('/turma-materias', ensureAuth, async (req, res) => {
  const turma = getText(req.query.turma);
  if (!turma) return apiBadRequest(res, 'Informe a turma.');

  try {
    const data = await fetchVisibleStudents({ query: {}, session: req.session });
    const alunosDaTurma = data.alunos.filter((aluno) => aluno.turma === turma);
    return apiSuccess(res, collectSubjectNames(alunosDaTurma));
  } catch (error) {
    console.error('Erro ao buscar matérias da turma:', error.stack || error.message || error);
    return apiServerError(res, 'Erro ao buscar matérias da turma.');
  }
});

router.get('/materia/:index', ensureAuth, async (req, res) => {
  const periodIndex = parsePeriod(req.query.periodo);
  if (periodIndex === null) return apiBadRequest(res, 'Período inválido.');

  try {
    const data = await fetchVisibleStudents({
      query: { ...req.query, periodo: periodIndex },
      session: req.session
    });
    const viewSubjects = collectSubjectNames(data.alunos);
    const subjectIndex = Number(req.params.index);
    if (!Number.isInteger(subjectIndex) || subjectIndex < 0 || subjectIndex >= viewSubjects.length) {
      return apiBadRequest(res, 'Matéria inválida.');
    }

    const subject = viewSubjects[subjectIndex];
    const normalizedSubject = normalizeSubjectName(subject);
    const students = data.alunos.map((aluno) => {
      const subjectEntry = aluno.subjects.find((entry) => normalizeSubjectName(entry.name) === normalizedSubject);
      if (!subjectEntry) return null;
      return {
        ...aluno,
        nota_final: subjectEntry.nota,
        taxa_faltas: subjectEntry.faltas,
        justificadas: subjectEntry.faltas_justificadas,
        total_aulas: subjectEntry.total_aulas,
        risco_nota: subjectEntry.risco_nota,
        alerta_nota: subjectEntry.alerta_nota,
        risco_faltas: subjectEntry.risco_faltas,
        alerta_faltas: subjectEntry.alerta_faltas,
        situacao_risco: subjectEntry.situacao_risco
      };
    }).filter(Boolean);

    return apiSuccess(res, {
      subject,
      subjectIndex,
      students,
      canManageStudents: hasStudentManagementAccess(req.session.user),
      currentPeriodName: data.currentPeriodName,
      periodIndex: data.periodIndex,
      periodOptions: data.periodOptions
    });
  } catch (error) {
    console.error('Erro ao carregar matéria:', error.stack || error.message || error);
    return apiServerError(res, 'Erro ao carregar dados da matéria.');
  }
});

router.post('/usuarios', ensureAuth, async (req, res) => {
  if (req.session.user.role !== 'Admin') return apiForbidden(res, 'Permissão negada.');

  const username = getText(req.body?.username).toLowerCase();
  const password = String(req.body?.password || '');
  const role = getText(req.body?.role);

  if (!/^[a-z0-9][a-z0-9._-]{2,59}$/.test(username)) {
    return apiBadRequest(res, 'O usuário deve ter de 3 a 60 caracteres: letras, números, ponto, hífen ou sublinhado.');
  }
  if (!validRoles.has(role)) return apiBadRequest(res, 'Perfil de usuário inválido.');

  if (!managedRoles.has(role)) return apiBadRequest(res, STUDENT_ACCOUNT_MANAGEMENT_MESSAGE);

  const passwordError = getPasswordValidationError(password);
  if (passwordError) return apiBadRequest(res, passwordError);

  try {
    // Authentication checks username before matrícula. Reserving each active
    // matrícula avoids resolving a student login to a staff account.
    const studentWithSameIdentifier = await getStudentByMatricula(username);
    if (studentWithSameIdentifier) {
      return apiConflict(res, 'Este usuário coincide com a matrícula de um aluno cadastrado e está reservado para a conta estudantil.');
    }

    const profileResult = await buildUserProfile(role, req.body || {});
    if (profileResult.error) {
      return profileResult.notFound
        ? apiNotFound(res, profileResult.error)
        : apiBadRequest(res, profileResult.error);
    }

    const existingIdentifier = await getSql(
      "SELECT id FROM usuarios WHERE lower(trim(username)) = ? OR lower(trim(COALESCE(matricula, ''))) = ?",
      [username, username]
    );
    if (existingIdentifier) return apiConflict(res, 'Este usuário ou matrícula já está em uso.');

    const result = await runSql(
      'INSERT INTO usuarios (username, password, role, matricula, nome, curso, disciplina, turma) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        username,
        hashPassword(password),
        role,
        profileResult.profile.matricula,
        profileResult.profile.nome,
        profileResult.profile.curso,
        profileResult.profile.disciplina,
        profileResult.profile.turma
      ]
    );
    const user = await getSql(
      'SELECT id, username, role, matricula, nome, curso, disciplina, turma FROM usuarios WHERE id = ?',
      [result.lastID]
    );
    return apiCreated(res, { user: userResponse(user) }, 'Conta criada com sucesso.');
  } catch (error) {
    if (isConstraintError(error)) return apiConflict(res, 'Não foi possível criar a conta com os dados informados.');
    console.error('Erro ao criar usuário:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível criar a conta.');
  }
});

router.get('/usuarios', ensureAuth, async (req, res) => {
  if (req.session.user.role !== 'Admin') return apiForbidden(res, 'Permissão negada.');

  try {
    const users = await allSql(
      'SELECT id, username, role, matricula, nome, curso, disciplina, turma FROM usuarios ORDER BY role, username'
    );
    return apiSuccess(res, { users });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error.stack || error.message || error);
    return apiServerError(res, 'Erro ao buscar usuários.');
  }
});

router.put('/usuarios/:id', ensureAuth, async (req, res) => {
  if (req.session.user.role !== 'Admin') return apiForbidden(res, 'Permissão negada.');

  const userId = Number(req.params.id);
  const role = getText(req.body?.role);
  if (!Number.isInteger(userId) || userId < 1 || !validRoles.has(role)) {
    return apiBadRequest(res, 'Dados de permissão inválidos.');
  }
  if (!managedRoles.has(role)) return apiBadRequest(res, STUDENT_ACCOUNT_MANAGEMENT_MESSAGE);
  if (userId === req.session.user.id && role !== 'Admin') {
    return apiBadRequest(res, 'Você não pode remover seu próprio acesso de administrador.');
  }

  try {
    const currentUser = await getSql(
      'SELECT id, username, role, matricula, nome, curso, disciplina, turma FROM usuarios WHERE id = ?',
      [userId]
    );
    if (!currentUser) return apiNotFound(res, 'Usuário não encontrado.');

    // Student credentials are tied to the enrollment and may not be reused as
    // staff credentials. This prevents a password from moving to another
    // identity or permission scope through the generic user editor.
    if (currentUser.role === 'Aluno') {
      return apiBadRequest(res, STUDENT_ACCOUNT_MANAGEMENT_MESSAGE);
    }

    const studentWithSameIdentifier = await getStudentByMatricula(currentUser.username);
    if (studentWithSameIdentifier) {
      return apiConflict(res, 'O usuário desta conta coincide com a matrícula de um aluno cadastrado. Corrija a conta antes de alterar suas permissões.');
    }

    const profileResult = await buildUserProfile(role, {
      ...currentUser,
      nome: currentUser.nome || currentUser.username,
      curso: req.body?.curso ?? currentUser.curso,
      disciplina: req.body?.disciplina ?? currentUser.disciplina,
      turma: req.body?.turma ?? currentUser.turma
    });
    if (profileResult.error) {
      return profileResult.notFound
        ? apiNotFound(res, profileResult.error)
        : apiBadRequest(res, profileResult.error);
    }
    await runSql(
      'UPDATE usuarios SET role = ?, matricula = ?, nome = ?, curso = ?, disciplina = ?, turma = ? WHERE id = ?',
      [
        role,
        profileResult.profile.matricula,
        profileResult.profile.nome,
        profileResult.profile.curso,
        profileResult.profile.disciplina,
        profileResult.profile.turma,
        userId
      ]
    );
    const updatedUser = await getSql(
      'SELECT id, username, role, matricula, nome, curso, disciplina, turma FROM usuarios WHERE id = ?',
      [userId]
    );
    return apiSuccess(res, { user: updatedUser }, 'Permissões atualizadas com sucesso.');
  } catch (error) {
    console.error('Erro ao atualizar permissões:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível atualizar as permissões.');
  }
});

router.post('/backup', ensureAuth, async (req, res) => {
  if (req.session.user.role !== 'Admin') return apiForbidden(res, 'Permissão negada.');

  try {
    await new Promise((resolve, reject) => {
      backupDatabase((error) => (error ? reject(error) : resolve()));
    });
    return apiSuccess(res, null, 'Backup gerado com sucesso.');
  } catch (error) {
    console.error('Erro ao gerar backup:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível gerar backup.');
  }
});

module.exports = router;
