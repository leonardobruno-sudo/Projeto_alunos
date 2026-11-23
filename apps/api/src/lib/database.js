/**
 * Papel de `database`: oferece recursos compartilhados ao servidor, como sessão, permissões, respostas e acesso ao banco.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Camada central de acesso ao SQLite: inicializa e migra o banco e atende
 * às rotas, à autenticação e aos scripts administrativos.
 * Também mantém compatibilidade com matérias legadas, snapshots de períodos
 * e consultas de alunos que respeitam o perfil e o curso da sessão.
 * As páginas React nunca usam este módulo diretamente: elas passam pela API.
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { subjects, periods } = require('./constants');
const {
  formatPhone,
  generateTemporaryStudentPassword,
  getInitialStudentPassword,
  hashPassword,
  normalizeMatricula,
  normalizeSubjectName,
  verifyPassword
} = require('./utils');
const { canAccessStudent } = require('./permissions');
const { setupAcademicLifeSchema } = require('../modules/academic-life/academicLifeSchema');
const { setupResearchSchema } = require('../modules/research/researchSchema');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', '..', '..', '..', 'database', 'escola.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir banco:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function ensureColumns(tableName, columns) {
  return allSql(`PRAGMA table_info(${tableName})`).then((rows) => {
    const existingColumns = new Set(rows.map((row) => row.name));
    const missingColumns = columns.filter((column) => !existingColumns.has(column.name));
    if (missingColumns.length === 0) return null;
    const statements = missingColumns.map((column) => `ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`);
    return new Promise((resolve, reject) => {
      db.exec(statements.join('; '), (err) => (err ? reject(err) : resolve()));
    });
  });
}

function buildSubjectEntriesFromStudent(student, fallbackSubjects = []) {
  const fallback = fallbackSubjects.length > 0 ? fallbackSubjects : subjects;
  const legacySubjects = fallback.map((name, index) => ({
    name: name || `Matéria ${index + 1}`,
    nota: Number(student?.[`materia${index + 1}`]) || 0,
    faltas: Number(student?.taxa_faltas) || 0,
    faltas_justificadas: Number(student?.faltas_justificadas) || 0,
    total_aulas: Number(student?.total_aulas) || 0
  }));

  if (student?.materias_json) {
    try {
      const parsed = JSON.parse(student.materias_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((entry) => ({
          name: entry.name || 'Matéria',
          nota: Number(entry.nota) || 0,
          faltas: Number(entry.faltas) || 0,
          faltas_justificadas: Number(entry.faltas_justificadas) || 0,
          total_aulas: Number(entry.total_aulas) || 0
        }));
      }
    } catch (error) {
      console.error('Erro ao ler matérias do aluno:', error.message);
    }
  }

  return legacySubjects;
}

function collectSubjectNames(alunos = []) {
  const names = new Set();
  alunos.forEach((student) => {
    const entries = Array.isArray(student?.subjects)
      ? student.subjects
      : buildSubjectEntriesFromStudent(student, subjects);
    entries.forEach((entry) => {
      if (entry.name) names.add(entry.name);
    });
  });
  return Array.from(names);
}

function limitStudentSubjectsByRole(student, user) {
  if (user?.role !== 'Professor') return student;

  const allowedSubject = normalizeSubjectName(user.disciplina);
  const entries = Array.isArray(student?.subjects)
    ? student.subjects
    : buildSubjectEntriesFromStudent(student, subjects);
  const visibleSubjects = allowedSubject
    ? entries.filter((entry) => normalizeSubjectName(entry?.name) === allowedSubject)
    : [];
  // O JSON bruto e as colunas antigas podem incluir todas as matérias. Remova
  // esses dados antes de responder ao professor e mantenha somente a disciplina
  // atribuída à conta dele.
  const {
    materias_json: _storedSubjects,
    materia1: _materia1,
    materia2: _materia2,
    materia3: _materia3,
    materia4: _materia4,
    materia5: _materia5,
    materia6: _materia6,
    materia7: _materia7,
    ...visibleStudent
  } = student;

  const assignedEntry = visibleSubjects[0];
  if (!assignedEntry) return { ...visibleStudent, subjects: [] };

  // O painel e as estatísticas do professor usam a matéria atribuída,
  // sem revelar valores consolidados das outras disciplinas do aluno.
  return {
    ...visibleStudent,
    nota_final: Number(assignedEntry.nota) || 0,
    taxa_faltas: Number(assignedEntry.percentual_faltas) || 0,
    risco_nota: assignedEntry.risco_nota === true,
    alerta_nota: assignedEntry.alerta_nota === true,
    risco_faltas: assignedEntry.risco_faltas === true,
    alerta_faltas: assignedEntry.alerta_faltas === true,
    situacao_risco: assignedEntry.situacao_risco || 'Regular',
    subjects: visibleSubjects
  };
}

function getMetricStatus(value, riskThreshold, alertDelta = 5) {
  const numericValue = Number(value) || 0;
  if (numericValue < riskThreshold) {
    return { status: 'Em Risco', isRisk: true, isAlert: false };
  }
  if (numericValue > riskThreshold && numericValue <= riskThreshold + alertDelta) {
    return { status: 'Alerta', isRisk: false, isAlert: true };
  }
  return { status: 'Regular', isRisk: false, isAlert: false };
}

function getAttendanceStatus(value, riskThreshold, alertDelta = 5) {
  const numericValue = Number(value) || 0;
  if (numericValue >= riskThreshold) {
    return { status: 'Em Risco', isRisk: true, isAlert: false };
  }
  if (numericValue >= riskThreshold - alertDelta) {
    return { status: 'Alerta', isRisk: false, isAlert: true };
  }
  return { status: 'Regular', isRisk: false, isAlert: false };
}

function getFiniteNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
}

/**
 * Converte campos antigos de frequência para inteiros não negativos, conforme
 * exige a API. Importações históricas geravam valores separadamente; por isso,
 * alguns registros têm mais faltas justificadas do que faltas totais.
 */
function normalizeAttendanceInteger(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.round(numericValue));
}

function isValidAttendanceInteger(value) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue >= 0;
}

function normalizeSubjectAttendanceEntry(entry) {
  const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  const justificadas = normalizeAttendanceInteger(source.faltas_justificadas);
  const faltas = Math.max(normalizeAttendanceInteger(source.faltas), justificadas);
  const totalAulas = Math.max(normalizeAttendanceInteger(source.total_aulas), faltas);

  return {
    ...source,
    faltas,
    faltas_justificadas: justificadas,
    total_aulas: totalAulas
  };
}

function readStoredSubjectEntries(student) {
  if (!student?.materias_json) return null;

  try {
    const parsed = typeof student.materias_json === 'string'
      ? JSON.parse(student.materias_json)
      : student.materias_json;
    return Array.isArray(parsed) ? parsed : null;
  } catch (_error) {
    // Um JSON antigo inválido deve permanecer intacto para correção manual;
    // esta migração corrige somente frequências que consegue interpretar.
    return null;
  }
}

function usesLegacySharedWorkload(student, subjectEntries) {
  const storedTotalAulas = normalizeAttendanceInteger(student?.total_aulas);
  return storedTotalAulas > 0 && subjectEntries.length > 1 &&
    subjectEntries.every((entry) => entry.total_aulas === storedTotalAulas);
}

function summaryFromSubjectAttendance(student, subjectEntries) {
  const faltas = subjectEntries.reduce((sum, entry) => sum + entry.faltas, 0);
  const justificadas = subjectEntries.reduce((sum, entry) => sum + entry.faltas_justificadas, 0);
  const totalAulas = usesLegacySharedWorkload(student, subjectEntries)
    ? normalizeAttendanceInteger(student.total_aulas)
    : subjectEntries.reduce((sum, entry) => sum + entry.total_aulas, 0);

  return { faltas, justificadas, totalAulas };
}

function hasInvalidAttendanceSummary(student) {
  const faltas = student?.taxa_faltas;
  const justificadas = student?.faltas_justificadas;
  const totalAulas = student?.total_aulas;

  return ![faltas, justificadas, totalAulas].every(isValidAttendanceInteger) ||
    Number(justificadas) > Number(faltas) || Number(faltas) > Number(totalAulas);
}

function hasAttendanceSummaryValues(student) {
  return [student?.taxa_faltas, student?.faltas_justificadas, student?.total_aulas]
    .some((value) => value !== null && value !== undefined && value !== '');
}

/**
 * Padroniza a frequência sem descartar faltas já justificadas. Se um registro
 * indicar zero faltas e duas justificadas, o total passa a duas; se a carga
 * horária for insuficiente, ela aumenta para preservar o registro.
 */
function normalizeLegacyStudentAttendance(student) {
  const storedSubjects = readStoredSubjectEntries(student);

  if (!storedSubjects) {
    // Some old history fixtures contain only identity/profile fields. There is
    // no attendance information to repair, so leave those snapshots intact.
    if (!hasAttendanceSummaryValues(student)) {
      return { changed: false, subjectEntriesUpdated: 0, student };
    }
    const justificadas = normalizeAttendanceInteger(student?.faltas_justificadas);
    const faltas = Math.max(normalizeAttendanceInteger(student?.taxa_faltas), justificadas);
    const totalAulas = Math.max(normalizeAttendanceInteger(student?.total_aulas), faltas);
    const changed = hasInvalidAttendanceSummary(student);

    return {
      changed,
      subjectEntriesUpdated: 0,
      student: changed
        ? { ...student, taxa_faltas: faltas, faltas_justificadas: justificadas, total_aulas: totalAulas }
        : student
    };
  }

  const normalizedSubjects = storedSubjects.map(normalizeSubjectAttendanceEntry);
  const subjectEntriesUpdated = normalizedSubjects.reduce((count, entry, index) => (
    JSON.stringify(entry) === JSON.stringify(storedSubjects[index]) ? count : count + 1
  ), 0);
  const shouldSynchronizeSummary = subjectEntriesUpdated > 0 || hasInvalidAttendanceSummary(student);

  if (!shouldSynchronizeSummary) {
    return { changed: false, subjectEntriesUpdated: 0, student };
  }

  const summary = summaryFromSubjectAttendance(student, normalizedSubjects);
  return {
    changed: true,
    subjectEntriesUpdated,
    student: {
      ...student,
      materias_json: subjectEntriesUpdated > 0 ? JSON.stringify(normalizedSubjects) : student.materias_json,
      taxa_faltas: summary.faltas,
      faltas_justificadas: summary.justificadas,
      total_aulas: summary.totalAulas
    }
  };
}

function calculateRisk(student) {
  const subjectEntries = buildSubjectEntriesFromStudent(student, subjects).map((entry) => {
    const nota = Number(entry.nota) || 0;
    const faltas = Number(entry.faltas) || 0;
    const justificadas = Number(entry.faltas_justificadas) || 0;
    const totalAulas = Number(entry.total_aulas) || 0;
    const faltasNetas = Math.max(0, faltas - justificadas);
    const taxaFaltasPercent = totalAulas > 0 ? (faltasNetas / totalAulas) * 100 : 0;
    const notaStatus = getMetricStatus(nota, 70, 5);
    const faltasStatus = getAttendanceStatus(taxaFaltasPercent, 25, 5);
    return {
      ...entry,
      nota: Number(nota.toFixed(1)),
      percentual_faltas: Number(taxaFaltasPercent.toFixed(1)),
      risco_nota: notaStatus.isRisk,
      alerta_nota: notaStatus.isAlert,
      risco_faltas: faltasStatus.isRisk,
      alerta_faltas: faltasStatus.isAlert,
      situacao_risco: notaStatus.isRisk || faltasStatus.isRisk ? 'Em Risco' : (notaStatus.isAlert || faltasStatus.isAlert ? 'Alerta' : 'Regular')
    };
  });

  const subjectGrades = subjectEntries.map((entry) => Number(entry.nota.toFixed(1)));
  const subjectAverage = subjectGrades.length
    ? subjectGrades.reduce((sum, value) => sum + value, 0) / subjectGrades.length
    : null;
  const storedGrade = getFiniteNonNegativeNumber(student.nota_final);
  const average = storedGrade === null
    ? (subjectAverage ?? 0)
    : storedGrade;

  const subjectTotalAulas = subjectEntries.reduce((sum, entry) => sum + (Number(entry.total_aulas) || 0), 0);
  const subjectTotalFaltas = subjectEntries.reduce((sum, entry) => sum + (Number(entry.faltas) || 0), 0);
  const subjectTotalJustificadas = subjectEntries.reduce((sum, entry) => sum + (Number(entry.faltas_justificadas) || 0), 0);
  const storedTotalAulas = getFiniteNonNegativeNumber(student.total_aulas);
  const storedTotalFaltas = getFiniteNonNegativeNumber(student.taxa_faltas);
  const storedTotalJustificadas = getFiniteNonNegativeNumber(student.faltas_justificadas);

  // Cadastros antigos guardam um resumo de frequência por aluno. Use-o quando
  // estiver completo para que a repetição por matéria não reduza o percentual:
  // 24 faltas em 100 aulas devem continuar sendo 24%, e não 24 em 700.
  const hasStoredAttendanceSummary = storedTotalAulas > 0 &&
    storedTotalFaltas !== null && storedTotalJustificadas !== null;
  const totalAulas = hasStoredAttendanceSummary ? storedTotalAulas : subjectTotalAulas;
  const totalFaltas = hasStoredAttendanceSummary ? storedTotalFaltas : subjectTotalFaltas;
  const totalJustificadas = hasStoredAttendanceSummary ? storedTotalJustificadas : subjectTotalJustificadas;
  const faltasNetas = Math.max(0, totalFaltas - totalJustificadas);
  const taxaFaltasPercent = totalAulas > 0 ? (faltasNetas / totalAulas) * 100 : 0;
  const notaStatus = getMetricStatus(average, 70, 5);
  const faltasStatus = getAttendanceStatus(taxaFaltasPercent, 25, 5);
  // O painel exibe média geral e percentual de faltas. Os alertas gerais
  // devem ser calculados com esses mesmos valores, e não
  // from an unrelated subject. Individual subject flags stay on each entry
  // and are used by the Matérias view.
  const hasGradeRisk = notaStatus.isRisk;
  const hasGradeAlert = notaStatus.isAlert;
  const hasAbsenceRisk = faltasStatus.isRisk;
  const hasAbsenceAlert = faltasStatus.isAlert;
  const hasRisk = hasGradeRisk || hasAbsenceRisk;
  const hasAlert = hasGradeAlert || hasAbsenceAlert;

  return {
    ...student,
    nota_final: Number(average.toFixed(1)),
    telefone: formatPhone(student.telefone),
    situacao_risco: hasRisk ? 'Em Risco' : (hasAlert ? 'Alerta' : 'Regular'),
    risco_nota: hasGradeRisk,
    alerta_nota: hasGradeAlert,
    risco_faltas: hasAbsenceRisk,
    alerta_faltas: hasAbsenceAlert,
    subjectGrades,
    subjectAverage: Number(average.toFixed(1)),
    subjects: subjectEntries,
    taxa_faltas: Number(taxaFaltasPercent.toFixed(1))
  };
}

const ACADEMIC_PROJECTION_BATCH_SIZE = 400;

function academicProjectionKey(matricula, subject) {
  return `${normalizeMatricula(matricula)}\u0000${normalizeSubjectName(subject)}`;
}

function projectionForSubject(projections, matricula, subject) {
  const key = academicProjectionKey(matricula, subject);
  if (!projections.has(key)) {
    projections.set(key, {
      name: getTextValue(subject) || 'Matéria',
      weightedGrade: 0,
      gradeWeight: 0,
      totalClasses: 0,
      registeredClasses: 0,
      missedClasses: 0,
      justifiedAbsences: 0,
      incompleteAttendance: false
    });
  }
  return projections.get(key);
}

/**
 * Apresenta os registros normalizados de Vida Acadêmica no formato legado de aluno.
 * É uma projeção somente para leitura: os diários normalizados seguem como fonte
 * oficial e painel, boletim, estatísticas e chat compartilham o resultado.
 */
async function projectNormalizedAcademicLife(students, periodIndex) {
  if (!Array.isArray(students) || students.length === 0) return students || [];

  const studentsByMatricula = new Map();
  for (const student of students) {
    const matricula = normalizeMatricula(student?.matricula);
    if (matricula) studentsByMatricula.set(matricula, student);
  }
  if (studentsByMatricula.size === 0) return students;

  const projections = new Map();
  const matriculas = [...studentsByMatricula.keys()];

  for (let offset = 0; offset < matriculas.length; offset += ACADEMIC_PROJECTION_BATCH_SIZE) {
    const batch = matriculas.slice(offset, offset + ACADEMIC_PROJECTION_BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(', ');
    const normalizedBatch = batch.map((matricula) => matricula.toLocaleLowerCase('pt-BR'));
    const queryParams = [periodIndex, ...normalizedBatch];
    const enrollmentRows = await allSql(
      `SELECT d.disciplina, md.matricula
       FROM diarios_turma d
       JOIN matriculas_diario md ON md.diario_id = d.id AND md.ativa = 1
       WHERE d.periodo = ? AND lower(trim(md.matricula)) IN (${placeholders})`,
      queryParams
    );

    for (const enrollment of enrollmentRows) {
      projectionForSubject(projections, enrollment.matricula, enrollment.disciplina);
    }

    const gradeRows = await allSql(
      `SELECT d.disciplina, md.matricula, a.peso, n.nota
       FROM diarios_turma d
       JOIN matriculas_diario md ON md.diario_id = d.id AND md.ativa = 1
       JOIN avaliacoes_diario a ON a.diario_id = d.id
       JOIN notas_avaliacao n ON n.avaliacao_id = a.id
         AND lower(trim(n.matricula)) = lower(trim(md.matricula))
       WHERE d.periodo = ? AND lower(trim(md.matricula)) IN (${placeholders})`,
      queryParams
    );

    for (const grade of gradeRows) {
      const value = Number(grade.nota);
      const weight = Number(grade.peso);
      if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
      const projection = projectionForSubject(projections, grade.matricula, grade.disciplina);
      projection.weightedGrade += value * weight;
      projection.gradeWeight += weight;
    }

    const attendanceRows = await allSql(
      `SELECT d.disciplina, md.matricula,
         COUNT(DISTINCT aula.id) AS total_classes,
         COUNT(DISTINCT frequencia.aula_id) AS registered_classes,
         COUNT(DISTINCT CASE WHEN frequencia.situacao = 'FALTA' THEN frequencia.aula_id END) AS missed_classes,
         COUNT(DISTINCT CASE WHEN frequencia.situacao = 'JUSTIFICADA' THEN frequencia.aula_id END) AS justified_absences
       FROM diarios_turma d
       JOIN matriculas_diario md ON md.diario_id = d.id AND md.ativa = 1
       LEFT JOIN aulas_diario aula ON aula.diario_id = d.id
       LEFT JOIN frequencias_aula frequencia ON frequencia.aula_id = aula.id
         AND lower(trim(frequencia.matricula)) = lower(trim(md.matricula))
       WHERE d.periodo = ? AND lower(trim(md.matricula)) IN (${placeholders})
       GROUP BY d.id, d.disciplina, md.matricula`,
      queryParams
    );

    for (const attendance of attendanceRows) {
      const projection = projectionForSubject(projections, attendance.matricula, attendance.disciplina);
      projection.totalClasses += Number(attendance.total_classes) || 0;
      projection.registeredClasses += Number(attendance.registered_classes) || 0;
      projection.missedClasses += Number(attendance.missed_classes) || 0;
      projection.justifiedAbsences += Number(attendance.justified_absences) || 0;
      if (Number(attendance.total_classes) > 0 &&
          Number(attendance.registered_classes) < Number(attendance.total_classes)) {
        projection.incompleteAttendance = true;
      }
    }
  }

  const projectionsByMatricula = new Map();
  for (const [key, projection] of projections) {
    const [matricula] = key.split('\u0000');
    if (!projectionsByMatricula.has(matricula)) projectionsByMatricula.set(matricula, []);
    projectionsByMatricula.get(matricula).push(projection);
  }

  return students.map((student) => {
    const studentProjections = projectionsByMatricula.get(normalizeMatricula(student?.matricula));
    if (!studentProjections?.length) return student;

    const subjectEntries = buildSubjectEntriesFromStudent(student, subjects).map((entry) => ({ ...entry }));
    const subjectIndexes = new Map();
    subjectEntries.forEach((entry, index) => {
      const key = normalizeSubjectName(entry.name);
      if (!subjectIndexes.has(key)) subjectIndexes.set(key, []);
      subjectIndexes.get(key).push(index);
    });

    let hasNormalizedGrade = false;
    let hasNormalizedAttendance = false;
    for (const projection of studentProjections) {
      const key = normalizeSubjectName(projection.name);
      let indexes = subjectIndexes.get(key) || [];
      const hasGrade = projection.gradeWeight > 0;
      const hasAttendance = projection.totalClasses > 0 &&
        projection.registeredClasses > 0 &&
        !projection.incompleteAttendance;
      if (indexes.length === 0 && !hasGrade && !hasAttendance) continue;
      if (indexes.length === 0) {
        indexes = [subjectEntries.length];
        subjectIndexes.set(key, indexes);
        subjectEntries.push({
          name: projection.name,
          nota: hasGrade ? projection.weightedGrade / projection.gradeWeight : 0,
          faltas: 0,
          faltas_justificadas: 0,
          total_aulas: 0
        });
      }

      for (const index of indexes) {
        if (hasGrade) subjectEntries[index].nota = projection.weightedGrade / projection.gradeWeight;
        if (hasAttendance) {
          subjectEntries[index].faltas = projection.missedClasses;
          subjectEntries[index].faltas_justificadas = projection.justifiedAbsences;
          subjectEntries[index].total_aulas = projection.totalClasses;
        }
      }
      hasNormalizedGrade ||= hasGrade;
      hasNormalizedAttendance ||= hasAttendance;
    }

    if (!hasNormalizedGrade && !hasNormalizedAttendance) return student;

    const attendanceSummary = hasNormalizedAttendance
      ? summaryFromSubjectAttendance(student, subjectEntries)
      : null;
    return {
      ...student,
      materias_json: JSON.stringify(subjectEntries),
      nota_final: hasNormalizedGrade ? null : student.nota_final,
      ...(attendanceSummary ? {
        taxa_faltas: attendanceSummary.faltas,
        faltas_justificadas: attendanceSummary.justificadas,
        total_aulas: attendanceSummary.totalAulas
      } : {}),
      subjects: subjectEntries
    };
  });
}

const HISTORY_STUDENT_FIELDS = [
  'matricula', 'nome', 'telefone', 'cotista', 'cota_detalhada', 'categoria',
  'nota_final', 'taxa_faltas', 'faltas_justificadas', 'total_aulas', 'curso',
  'disciplina', 'turma', 'descricao', 'materias_json', 'materia1', 'materia2',
  'materia3', 'materia4', 'materia5', 'materia6', 'materia7'
];

function copyHistoryStudentFields(student) {
  return Object.fromEntries(HISTORY_STUDENT_FIELDS.map((field) => [field, student[field] ?? null]));
}

function buildAcademicHistorySnapshot(student, periodIndex) {
  const source = copyHistoryStudentFields(student);
  return {
    version: 2,
    periodIndex,
    capturedAt: new Date().toISOString(),
    // Os valores de origem compõem o histórico imutável. A situação é recalculada
    // na leitura para que mudanças na regra de risco não deixem notas ou rótulos
    // antigos inconsistentes no snapshot.
    student: source
  };
}

function readAcademicHistorySnapshot(row, periodIndex) {
  if (!row?.snapshot_json) return null;

  try {
    const snapshot = JSON.parse(row.snapshot_json);
    if (!snapshot?.student || Number(snapshot.periodIndex) !== periodIndex) return null;
    if (!getTextValue(snapshot.student.matricula)) return null;

    // Older snapshots may contain a calculated block produced by a previous
    // rule. Recalculate from their immutable source values to keep the grade,
    // absences and risk label coherent in every period.
    const student = calculateRisk(snapshot.student);
    return {
      student,
      capturedAt: row.salvo_em || snapshot.capturedAt || null
    };
  } catch (error) {
    console.error('Erro ao ler histórico acadêmico:', error.message);
    return null;
  }
}

function getTextValue(value) {
  return String(value ?? '').trim();
}

function getStudentByMatricula(matricula) {
  const normalizedMatricula = normalizeMatricula(matricula);
  if (!normalizedMatricula) return Promise.resolve(undefined);
  return getSql(
    'SELECT * FROM alunos WHERE lower(trim(matricula)) = lower(trim(?))',
    [normalizedMatricula]
  );
}

async function getHistoryByPeriod(periodIndex) {
  const rows = await allSql(
    'SELECT matricula, snapshot_json, salvo_em FROM historico_academico WHERE periodo = ?',
    [periodIndex]
  );
  const history = new Map();

  for (const row of rows) {
    const snapshot = readAcademicHistorySnapshot(row, periodIndex);
    if (snapshot) history.set(normalizeMatricula(row.matricula), snapshot);
  }

  return history;
}

function getLatestSnapshotAt(historyByMatricula) {
  let latest = null;

  for (const history of historyByMatricula.values()) {
    const capturedAt = getTextValue(history?.capturedAt);
    if (capturedAt && (!latest || capturedAt > latest)) latest = capturedAt;
  }

  return latest;
}

async function saveAcademicHistoryPeriod(periodIndex, savedBy, { overwrite = false } = {}) {
  const requestedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let totalStudents = 0;
  let periodAlreadySaved = false;
  let savedAt = null;

  await runSql('BEGIN IMMEDIATE');
  try {
    const students = await allSql('SELECT * FROM alunos ORDER BY matricula');
    const existingRows = await allSql(
      'SELECT matricula FROM historico_academico WHERE periodo = ?',
      [periodIndex]
    );
    const existingMatriculas = new Set(
      existingRows.map((row) => normalizeMatricula(row.matricula))
    );
    totalStudents = students.length;
    periodAlreadySaved = existingRows.length > 0;

    // O snapshot fecha a lista de alunos daquele período. Novos cadastros atuais
    // não aparecem em um período já salvo, a menos que o Admin
    // confirme explicitamente a substituição.
    if (periodAlreadySaved && !overwrite) {
      unchanged = existingRows.length;
    } else {
      savedAt = requestedAt;
      const projectedStudents = await projectNormalizedAcademicLife(students, periodIndex);
      for (const student of projectedStudents) {
        const key = normalizeMatricula(student.matricula);
        const snapshot = JSON.stringify(buildAcademicHistorySnapshot(student, periodIndex));
        await runSql(
          `INSERT INTO historico_academico (matricula, periodo, snapshot_json, salvo_em, salvo_por)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(matricula, periodo) DO UPDATE SET
             snapshot_json = excluded.snapshot_json,
             salvo_em = excluded.salvo_em,
             salvo_por = excluded.salvo_por`,
          [student.matricula, periodIndex, snapshot, savedAt, getTextValue(savedBy) || null]
        );
        if (existingMatriculas.has(key)) updated += 1;
        else created += 1;
      }
    }
    await runSql('COMMIT');
  } catch (error) {
    try {
      await runSql('ROLLBACK');
    } catch (_rollbackError) {
      // A mensagem original do banco é mais útil para quem chamou esta função.
    }
    throw error;
  }

  return {
    periodIndex,
    totalStudents,
    created,
    updated,
    unchanged,
    savedAt,
    periodAlreadySaved,
    requiresOverwrite: periodAlreadySaved && !overwrite
  };
}

function deleteStudentByMatricula(matricula) {
  const normalizedMatricula = normalizeMatricula(matricula);
  if (!normalizedMatricula) return Promise.resolve(null);
  return runSql(
    'DELETE FROM alunos WHERE lower(trim(matricula)) = lower(trim(?))',
    [normalizedMatricula]
  );
}

function updateStudentFields(matricula, updates) {
  const allowedColumns = new Set([
    'nome', 'telefone', 'cotista', 'cota_detalhada', 'categoria', 'nota_final',
    'taxa_faltas', 'faltas_justificadas', 'total_aulas', 'curso',
    'disciplina', 'turma', 'descricao', 'materias_json', 'materia1',
    'materia2', 'materia3', 'materia4', 'materia5', 'materia6', 'materia7'
  ]);
  const columns = Object.keys(updates).filter((column) => allowedColumns.has(column));
  if (columns.length === 0) return Promise.resolve(null);
  const setClause = columns.map((column) => `${column} = ?`).join(', ');
  const normalizedMatricula = normalizeMatricula(matricula);
  if (!normalizedMatricula) return Promise.resolve(null);
  const params = columns.map((column) => updates[column]).concat(normalizedMatricula);
  return runSql(
    `UPDATE alunos SET ${setClause} WHERE lower(trim(matricula)) = lower(trim(?))`,
    params
  );
}

function insertStudent(student) {
  const {
    matricula, nome, telefone, cotista, cota_detalhada, categoria,
    nota_final, taxa_faltas, faltas_justificadas, total_aulas,
    curso, disciplina, turma, descricao, materias_json,
    materia1, materia2, materia3, materia4, materia5, materia6, materia7
  } = student;
  const normalizedMatricula = normalizeMatricula(matricula);

  return runSql(`INSERT INTO alunos (
      matricula, nome, telefone, cotista, cota_detalhada,
      categoria, nota_final, taxa_faltas, faltas_justificadas, total_aulas,
      curso, disciplina, turma, descricao, materias_json,
      materia1, materia2, materia3, materia4, materia5, materia6, materia7
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    normalizedMatricula, nome, telefone, cotista, cota_detalhada,
    categoria, nota_final, taxa_faltas, faltas_justificadas, total_aulas,
    curso, disciplina, turma, descricao, materias_json,
    materia1, materia2, materia3, materia4, materia5, materia6, materia7
  ]);
}

const STUDENT_ACCOUNT_IDENTIFIER_CONFLICT = 'student_account_identifier_conflict';

function studentAccountProvisionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Monta o perfil oficial, sem segredos, compartilhado pelo cadastro e pela conta.
// Separar esses dados da senha permite corrigir informações antigas na inicialização
// sem substituir a credencial.
function getStudentAccountIdentityProfile(student) {
  const matricula = normalizeMatricula(student?.matricula);
  if (!matricula) {
    throw studentAccountProvisionError(
      STUDENT_ACCOUNT_IDENTIFIER_CONFLICT,
      'A matrícula é necessária para criar a conta do aluno.'
    );
  }

  return {
    username: matricula,
    role: 'Aluno',
    matricula,
    nome: student?.nome || '',
    curso: student?.curso || '',
    disciplina: student?.disciplina || '',
    turma: student?.turma || ''
  };
}

function getStudentAccountProfile(student) {
  const profile = getStudentAccountIdentityProfile(student);
  const temporaryPassword = generateTemporaryStudentPassword();

  return {
    ...profile,
    password: hashPassword(temporaryPassword),
    mustChangePassword: true,
    // This secret exists only while the authorized creation/reset response is
    // being built. It is never written to SQLite or returned by a read API.
    temporaryPassword
  };
}

function normalizedProfileValue(value) {
  return String(value ?? '').trim();
}

function getStudentAccountProfileDifferences(account, profile) {
  return ['nome', 'curso', 'disciplina', 'turma'].filter((field) => (
    normalizedProfileValue(account?.[field]) !== normalizedProfileValue(profile[field])
  ));
}

// O cadastro é a fonte oficial dos dados de perfil. Esta correção
// altera somente campos que não são secretos. Mudar o nome nunca pode
// gerar outra senha para o aluno, especialmente agora que as credenciais
// iniciais são aleatórias e exibidas uma única vez.
async function synchronizeStudentAccountProfile(account, profile) {
  const changedFields = getStudentAccountProfileDifferences(account, profile);
  if (changedFields.length === 0) {
    return { created: false, synchronized: false, passwordReset: false, userId: account.id, changedFields };
  }

  const result = await runSql(
    `UPDATE usuarios
     SET nome = ?, curso = ?, disciplina = ?, turma = ?
     WHERE id = ? AND role = ?`,
    [profile.nome, profile.curso, profile.disciplina, profile.turma, account.id, 'Aluno']
  );
  return {
    created: false,
    synchronized: result.changes === 1,
    passwordReset: false,
    userId: account.id,
    changedFields
  };
}

// Cria uma conta somente quando o aluno ainda não possui uma. A conciliação na inicialização
// usa `provisionIfMissing=false`: gerar uma senha sem um canal
// de entrega autorizado impediria que o aluno a recebesse.
async function createStudentAccountIfMissing(student, { provisionIfMissing = true } = {}) {
  const matricula = normalizeMatricula(student?.matricula);
  const existingStudentAccount = await getSql(
    `SELECT id, password, matricula, nome, curso, disciplina, turma FROM usuarios
     WHERE role = ? AND lower(trim(matricula)) = lower(trim(?))`,
    ['Aluno', matricula]
  );
  if (existingStudentAccount) {
    return synchronizeStudentAccountProfile(
      existingStudentAccount,
      getStudentAccountIdentityProfile(student)
    );
  }

  if (!provisionIfMissing) {
    return { created: false, missing: true, synchronized: false, passwordReset: false };
  }

  const profile = getStudentAccountProfile(student);

  const usernameOwner = await getSql(
    'SELECT id FROM usuarios WHERE lower(trim(username)) = lower(trim(?))',
    [profile.username]
  );
  if (usernameOwner) {
    throw studentAccountProvisionError(
      STUDENT_ACCOUNT_IDENTIFIER_CONFLICT,
      'A matrícula do aluno já é usada como nome de usuário por outra conta.'
    );
  }

  const result = await runSql(
    `INSERT INTO usuarios (
       username, password, role, matricula, nome, curso, disciplina, turma, must_change_password
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profile.username,
      profile.password,
      profile.role,
      profile.matricula,
      profile.nome,
      profile.curso,
      profile.disciplina,
      profile.turma,
      profile.mustChangePassword ? 1 : 0
    ]
  );
  return {
    created: true,
    userId: result.lastID,
    username: profile.username,
    temporaryPassword: profile.temporaryPassword,
    mustChangePassword: profile.mustChangePassword
  };
}

// Gera uma nova credencial de uso único para a conta ativa do aluno.
// Quem chama esta função deve verificar se a pessoa da equipe tem permissão
// antes da chamada. A função não revela a senha antiga nem seu hash.
async function resetStudentTemporaryPassword(matricula) {
  const normalizedMatricula = normalizeMatricula(matricula);
  if (!normalizedMatricula) return null;

  return withImmediateTransaction(async () => {
    const student = await getStudentByMatricula(normalizedMatricula);
    if (!student) return null;
    const account = await getSql(
      `SELECT id, username
       FROM usuarios
       WHERE role = ? AND lower(trim(matricula)) = lower(trim(?))`,
      ['Aluno', normalizedMatricula]
    );
    if (!account) {
      // Este fluxo cria uma conta para um cadastro antigo que ainda não a possui.
      // Diferentemente da inicialização automática, quem chamou recebe a senha
      // temporária e pode entregá-la ao aluno.
      return createStudentAccountIfMissing(student);
    }

    const temporaryPassword = generateTemporaryStudentPassword();
    const result = await runSql(
      `UPDATE usuarios
       SET password = ?,
           must_change_password = 1,
           session_version = COALESCE(session_version, 0) + 1
       WHERE id = ? AND role = ?`,
      [hashPassword(temporaryPassword), account.id, 'Aluno']
    );
    if (result.changes !== 1) return null;

    return {
      userId: account.id,
      username: account.username,
      temporaryPassword,
      mustChangePassword: true
    };
  });
}

function hasLegacyInitialStudentPassword(account) {
  const legacyPassword = getInitialStudentPassword(account?.matricula, account?.nome);
  return Buffer.byteLength(legacyPassword, 'utf8') <= 72 &&
    verifyPassword(legacyPassword, account?.password);
}

// Versões anteriores usavam matrícula e primeiro nome para criar a senha inicial.
// Não redefinimos essas contas sem aviso, pois não há um meio seguro
// exists to deliver a new secret, so they remain login-compatible but are
// e a próxima operação autenticada exige que a senha seja trocada.
async function markLegacyStudentAccountsForPasswordChange() {
  const accounts = await allSql(
    `SELECT id, password, matricula, nome, must_change_password
     FROM usuarios
     WHERE role = ? AND COALESCE(must_change_password, 0) = 0`,
    ['Aluno']
  );
  let marked = 0;

  for (const account of accounts) {
    if (!hasLegacyInitialStudentPassword(account)) continue;
    const result = await runSql(
      `UPDATE usuarios
       SET must_change_password = 1,
           session_version = COALESCE(session_version, 0) + 1
       WHERE id = ? AND role = ? AND COALESCE(must_change_password, 0) = 0`,
      [account.id, 'Aluno']
    );
    marked += result.changes;
  }

  return marked;
}

async function rollbackTransaction() {
  try {
    await runSql('ROLLBACK');
  } catch (_error) {
    // Uma falha na confirmação pode já ter encerrado a transação.
  }
}

async function withImmediateTransaction(action) {
  await runSql('BEGIN IMMEDIATE');
  try {
    const result = await action();
    await runSql('COMMIT');
    return result;
  } catch (error) {
    await rollbackTransaction();
    throw error;
  }
}

/**
 * Corrige frequências importadas com valores aleatórios em versões antigas.
 * A operação pode ser repetida: não altera registros válidos e não produz
 * novas mudanças quando executada novamente após a correção.
 */
async function normalizeLegacyAcademicAttendanceData() {
  return withImmediateTransaction(async () => {
    const result = {
      studentsUpdated: 0,
      subjectEntriesUpdated: 0,
      historicalSnapshotsUpdated: 0,
      historicalSubjectEntriesUpdated: 0
    };
    const students = await allSql(
      `SELECT matricula, taxa_faltas, faltas_justificadas, total_aulas, materias_json
       FROM alunos`
    );

    for (const student of students) {
      const normalized = normalizeLegacyStudentAttendance(student);
      if (!normalized.changed) continue;

      await runSql(
        `UPDATE alunos
         SET taxa_faltas = ?, faltas_justificadas = ?, total_aulas = ?, materias_json = ?
         WHERE matricula = ?`,
        [
          normalized.student.taxa_faltas,
          normalized.student.faltas_justificadas,
          normalized.student.total_aulas,
          normalized.student.materias_json,
          student.matricula
        ]
      );
      result.studentsUpdated += 1;
      result.subjectEntriesUpdated += normalized.subjectEntriesUpdated;
    }

    const snapshots = await allSql(
      'SELECT matricula, periodo, snapshot_json FROM historico_academico'
    );
    for (const snapshotRow of snapshots) {
      let snapshot;
      try {
        snapshot = JSON.parse(snapshotRow.snapshot_json);
      } catch (_error) {
        // Preserva o conteúdo histórico inválido para permitir recuperação manual.
        continue;
      }
      if (!snapshot?.student || typeof snapshot.student !== 'object') continue;

      const normalized = normalizeLegacyStudentAttendance(snapshot.student);
      if (!normalized.changed) continue;

      snapshot.student = normalized.student;
      await runSql(
        `UPDATE historico_academico
         SET snapshot_json = ?
         WHERE matricula = ? AND periodo = ?`,
        [JSON.stringify(snapshot), snapshotRow.matricula, snapshotRow.periodo]
      );
      result.historicalSnapshotsUpdated += 1;
      result.historicalSubjectEntriesUpdated += normalized.subjectEntriesUpdated;
    }

    return result;
  });
}

function getEmptyStudentAccountCleanupResult() {
  return { deletedAccounts: 0, deletedSessions: 0 };
}

function getSessionUserId(serializedSession) {
  try {
    const userId = Number(JSON.parse(serializedSession)?.user?.id);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
  } catch (_error) {
    // O armazenamento de sessão trata registros inválidos quando os consulta.
    // This cleanup is intentionally limited to sessions proven to belong to a
    // deleted student account.
    return null;
  }
}

async function deleteSessionsByIds(sessionIds) {
  // O SQLite costuma limitar cada instrução a 999 parâmetros. Dividir a operação
  // cleanup safe even if a large set of old accounts has active sessions.
  for (let index = 0; index < sessionIds.length; index += 500) {
    const chunk = sessionIds.slice(index, index + 500);
    const placeholders = chunk.map(() => '?').join(', ');
    await runSql(`DELETE FROM sessoes WHERE sid IN (${placeholders})`, chunk);
  }
}

// Contas da equipe são diferentes das contas automáticas de alunos. Esta função
// é usada somente pela tela de permissões do Admin e não permite excluir
// contas de Admin ou de aluno.
async function deleteStaffUserById(userId) {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId < 1) return null;

  return withImmediateTransaction(async () => {
    const user = await getSql(
      'SELECT id, username, role, matricula, nome, curso, disciplina, turma FROM usuarios WHERE id = ?',
      [normalizedUserId]
    );
    if (!user) return { deleted: false, reason: 'not_found' };
    if (!['Professor', 'Coordenador', 'Diretor'].includes(user.role)) {
      return { deleted: false, reason: 'protected' };
    }

    const result = await runSql(
      'DELETE FROM usuarios WHERE id = ? AND role IN (?, ?, ?)',
      [normalizedUserId, 'Professor', 'Coordenador', 'Diretor']
    );
    if (result.changes !== 1) return { deleted: false, reason: 'not_found' };

    const sessionRows = await allSql('SELECT sid, sess FROM sessoes');
    const sessionIds = sessionRows
      .filter((row) => getSessionUserId(row.sess) === normalizedUserId)
      .map((row) => row.sid);
    if (sessionIds.length > 0) await deleteSessionsByIds(sessionIds);

    return { deleted: true, user, deletedSessions: sessionIds.length };
  });
}

// This function must run inside an already-open immediate transaction. It
// removes only accounts whose explicit student matrícula no longer matches an
// active enrollment, case-insensitively. Academic history is deliberately not
// queried, changed or deleted: historical snapshots outlive enrollments.
async function cleanupOrphanStudentAccountsInTransaction() {
  const orphanAccounts = await allSql(
    `SELECT account.id
     FROM usuarios AS account
     WHERE account.role = ?
       AND NOT EXISTS (
         SELECT 1
         FROM alunos AS aluno
         WHERE lower(trim(aluno.matricula)) = lower(trim(COALESCE(account.matricula, '')))
       )`,
    ['Aluno']
  );
  if (orphanAccounts.length === 0) return getEmptyStudentAccountCleanupResult();

  const deletedAccountIds = [];
  for (const account of orphanAccounts) {
    // Recheck the role and matrícula condition at deletion time. The
    // immediate transaction prevents concurrent writers, and the predicate
    // makes this operation safe if the function is ever reused differently.
    const result = await runSql(
      `DELETE FROM usuarios
       WHERE id = ?
         AND role = ?
         AND NOT EXISTS (
           SELECT 1
           FROM alunos
           WHERE lower(trim(alunos.matricula)) = lower(trim(COALESCE(
             (SELECT matricula FROM usuarios WHERE id = ?),
             ''
           )))
         )`,
      [account.id, 'Aluno', account.id]
    );
    if (result.changes === 1) deletedAccountIds.push(account.id);
  }

  if (deletedAccountIds.length === 0) return getEmptyStudentAccountCleanupResult();

  const deletedAccountIdSet = new Set(deletedAccountIds);
  const sessionRows = await allSql('SELECT sid, sess FROM sessoes');
  const sessionIds = sessionRows
    .filter((row) => deletedAccountIdSet.has(getSessionUserId(row.sess)))
    .map((row) => row.sid);
  if (sessionIds.length > 0) await deleteSessionsByIds(sessionIds);

  return {
    deletedAccounts: deletedAccountIds.length,
    deletedSessions: sessionIds.length
  };
}

function logStudentAccountCleanup(result, context) {
  if (!result.deletedAccounts) return;
  console.warn(
    `Limpeza de contas de alunos (${context}): ${result.deletedAccounts} conta(s) antiga(s) removida(s)` +
    `${result.deletedSessions ? ` e ${result.deletedSessions} sess\u00e3o(\u00f5es) vinculada(s) encerrada(s)` : ''}.`
  );
}

// Public wrapper used during startup and by controlled maintenance commands.
// It is intentionally unable to delete Admin, Coordenador, Diretor or Professor accounts.
async function cleanupOrphanStudentAccounts(context = 'inicializa\u00e7\u00e3o') {
  const result = await withImmediateTransaction(cleanupOrphanStudentAccountsInTransaction);
  logStudentAccountCleanup(result, context);
  return result;
}

// Student data and its initial access account must be saved together so a
// successful registration always gives the student a usable login.
async function createStudentWithAccount(student) {
  const normalizedStudent = { ...student, matricula: normalizeMatricula(student?.matricula) };
  const transactionResult = await withImmediateTransaction(async () => {
    // Run before inserting the enrollment. Otherwise an old account using the
    // same matrícula could look active after the insert and retain a stale
    // profile or custom password instead of being replaced for the new aluno.
    const cleanup = await cleanupOrphanStudentAccountsInTransaction();
    await insertStudent(normalizedStudent);
    const account = await createStudentAccountIfMissing(normalizedStudent);
    return { cleanup, account };
  });
  logStudentAccountCleanup(transactionResult.cleanup, 'cria\u00e7\u00e3o de aluno');
  return transactionResult.account;
}

// Startup reconciliation aligns existing account profiles but intentionally
// does not create missing accounts: a cryptographically random password must
// be delivered in the same authorized request that provisions it.
async function backfillStudentAccounts() {
  const students = await allSql(
    'SELECT * FROM alunos ORDER BY matricula'
  );
  let created = 0;
  let synchronized = 0;
  let passwordResets = 0;
  let pendingCredentials = 0;
  let skipped = 0;

  for (const student of students) {
    try {
      const result = await withImmediateTransaction(() => createStudentAccountIfMissing(
        student,
        { provisionIfMissing: false }
      ));
      if (result.missing) {
        pendingCredentials += 1;
        continue;
      }
      if (result.created) created += 1;
      if (result.synchronized) synchronized += 1;
      if (result.passwordReset) passwordResets += 1;
    } catch (error) {
      if (
        error?.code === STUDENT_ACCOUNT_IDENTIFIER_CONFLICT
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  if (created > 0) console.log(`${created} conta(s) de aluno criada(s) automaticamente.`);
  if (synchronized > 0) console.warn(`${synchronized} perfil(is) de conta de aluno foram sincronizados com o cadastro.`);
  if (passwordResets > 0) console.warn(`${passwordResets} senha(s) inicial(is) de perfil desatualizado foram redefinida(s) com segurança.`);
  if (pendingCredentials > 0) {
    console.warn(`${pendingCredentials} aluno(s) sem conta aguardam emissão segura de senha temporária por um gestor autorizado.`);
  }
  if (skipped > 0) console.warn(`${skipped} conta(s) de aluno não puderam ser criadas automaticamente por conflito de identificador.`);
  return { created, synchronized, passwordResets, pendingCredentials, skipped };
}

function normalizeSearchText(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function includesSearchText(value, searchTerm) {
  return !searchTerm || normalizeSearchText(value).includes(searchTerm);
}

function matchesExactSearchText(value, expectedValue) {
  return !expectedValue || normalizeSearchText(value) === expectedValue;
}

function matchesAdminFilters(student, filters) {
  return includesSearchText(student.curso, filters.curso) &&
    includesSearchText(student.turma, filters.turma) &&
    includesSearchText(student.categoria, filters.categoria) &&
    matchesExactSearchText(student.cota_detalhada, filters.cota);
}

function matchesRiskFilter(student, filter) {
  if (!filter) return true;
  const status = normalizeSearchText(student.situacao_risco);
  if (filter === 'risco') return status.includes('risco');
  if (filter === 'alerta') return status.includes('alerta');
  if (filter === 'regular') return status.includes('regular');
  return false;
}

function scopeSqlForUser(user) {
  const role = getTextValue(user?.role);
  if (role === 'Admin') return { where: '', params: [] };

  const normalizedMatricula = getTextValue(user?.matricula);
  const normalizedCurso = getTextValue(user?.curso);
  const normalizedDisciplina = getTextValue(user?.disciplina);
  const normalizedTurma = getTextValue(user?.turma);
  if (role === 'Aluno' && normalizedMatricula) {
    return {
      where: ' WHERE lower(trim(matricula)) = lower(trim(?))',
      params: [normalizedMatricula]
    };
  }
  if ((role === 'Diretor' || role === 'Coordenador') && normalizedCurso) {
    return {
      where: ' WHERE lower(trim(curso)) = lower(trim(?))',
      params: [normalizedCurso]
    };
  }
  if (role === 'Professor' && normalizedCurso && normalizedDisciplina && normalizedTurma) {
    return {
      where: ` WHERE lower(trim(curso)) = lower(trim(?))
        AND lower(trim(turma)) = lower(trim(?))`,
      params: [normalizedCurso, normalizedTurma]
    };
  }
  return { where: ' WHERE 1 = 0', params: [] };
}

async function fetchCurrentStudentsForScope(user) {
  const scope = scopeSqlForUser(user);
  return allSql(`SELECT * FROM alunos${scope.where}`, scope.params);
}

function listOptions(query = {}) {
  const page = Number(query.page);
  const pageSize = Number(query.pageSize);
  const requestedSort = getTextValue(query.sort);
  const sort = ['nome', 'matricula', 'nota_final', 'taxa_faltas', 'situacao_risco'].includes(requestedSort)
    ? requestedSort
    : 'nome';
  const requestedDirection = getTextValue(query.direction).toLowerCase();
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 50 ? pageSize : 20,
    sort,
    direction: requestedDirection === 'desc' ? 'desc' : 'asc'
  };
}

function compareStudents(left, right, sort, direction) {
  const factor = direction === 'desc' ? -1 : 1;
  const leftValue = left?.[sort];
  const rightValue = right?.[sort];
  const numericSort = sort === 'nota_final' || sort === 'taxa_faltas';
  const comparison = numericSort
    ? (Number(leftValue) || 0) - (Number(rightValue) || 0)
    : getTextValue(leftValue).localeCompare(getTextValue(rightValue), 'pt-BR', { sensitivity: 'base' });
  if (comparison !== 0) return comparison * factor;
  return getTextValue(left?.matricula).localeCompare(getTextValue(right?.matricula), 'pt-BR', { sensitivity: 'base' });
}

async function fetchVisibleStudents(req, { paginate = false } = {}) {
  const query = req.query || {};
  const requestedPeriod = Number(query.periodo);
  const periodIndex = Number.isInteger(requestedPeriod) && requestedPeriod >= 0 && requestedPeriod < periods.length
    ? requestedPeriod
    : 0;
  const search = normalizeSearchText(query.q);
  const buscaMatricula = normalizeSearchText(query.busca_matricula);
  const buscaNome = normalizeSearchText(query.busca_nome);
  const riskFilter = normalizeSearchText(query.situacao);
  const useCurrentSource = getTextValue(query.fonte).toLocaleLowerCase('pt-BR') === 'atual';
  const pagination = listOptions(query);
  const isAdmin = req.session?.user?.role === 'Admin';
  const adminFilters = isAdmin
    ? {
      curso: normalizeSearchText(query.curso),
      turma: normalizeSearchText(query.turma),
      categoria: normalizeSearchText(query.categoria),
      cota: normalizeSearchText(query.cota)
    }
    : { curso: '', turma: '', categoria: '', cota: '' };

  const historyByMatricula = await getHistoryByPeriod(periodIndex);
  const periodSaved = historyByMatricula.size > 0;
  const snapshotAt = getLatestSnapshotAt(historyByMatricula);
  let studentsWithSource;
  if (!useCurrentSource && periodSaved) {
    studentsWithSource = Array.from(historyByMatricula.values()).map((historical) => ({
      student: historical.student,
      source: 'historico',
      capturedAt: historical.capturedAt
    }));
  } else {
    const students = await fetchCurrentStudentsForScope(req.session.user);
    const projectedStudents = await projectNormalizedAcademicLife(students, periodIndex);
    studentsWithSource = projectedStudents.map((student) => ({
      student: calculateRisk(student),
      source: 'atual',
      capturedAt: null
    }));
  }
  const visibleEntries = studentsWithSource.filter(({ student }) => (
    canAccessStudent(req.session.user, student) &&
    (!search || includesSearchText(student.matricula, search) || includesSearchText(student.nome, search)) &&
    includesSearchText(student.matricula, buscaMatricula) &&
    includesSearchText(student.nome, buscaNome) &&
    matchesAdminFilters(student, adminFilters)
  ));
  const projectedEntries = visibleEntries.map((entry) => ({
    ...entry,
    student: limitStudentSubjectsByRole(entry.student, req.session.user)
  })).filter(({ student }) => matchesRiskFilter(student, riskFilter));
  const orderedEntries = projectedEntries.toSorted((left, right) => (
    compareStudents(left.student, right.student, pagination.sort, pagination.direction)
  ));
  // Mantém cada linha compacta, mas fornece a lista completa de matérias
  // do conjunto autorizado. Calculá-la antes da paginação garante que
  // a tela Matérias não perca uma disciplina que apareça somente
  // em uma página seguinte dos resultados.
  const subjectNames = collectSubjectNames(orderedEntries.map((entry) => entry.student));
  const total = orderedEntries.length;
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const page = Math.min(pagination.page, totalPages);
  const pagedEntries = paginate
    ? orderedEntries.slice((page - 1) * pagination.pageSize, page * pagination.pageSize)
    : orderedEntries;
  const historicalStudents = projectedEntries.filter((entry) => entry.source === 'historico').length;
  const liveStudents = projectedEntries.length - historicalStudents;
  const dataSource = !useCurrentSource && periodSaved ? 'historico' : 'atual';

  return {
    alunos: pagedEntries.map((entry) => entry.student),
    total,
    page: paginate ? page : 1,
    pageSize: paginate ? pagination.pageSize : total,
    totalPages: paginate ? totalPages : 1,
    hasPreviousPage: paginate && page > 1,
    hasNextPage: paginate && page < totalPages,
    sort: pagination.sort,
    direction: pagination.direction,
    filters: {
      q: getTextValue(query.q),
      situacao: getTextValue(query.situacao),
      curso: getTextValue(query.curso),
      turma: getTextValue(query.turma),
      categoria: getTextValue(query.categoria),
      cota: getTextValue(query.cota)
    },
    subjectNames,
    busca_matricula: getTextValue(query.busca_matricula),
    busca_nome: getTextValue(query.busca_nome),
    periodIndex,
    currentPeriodName: periods[periodIndex],
    periodOptions: periods,
    historyAvailable: historicalStudents > 0,
    hasPeriodSnapshot: periodSaved,
    dataSource,
    snapshotAt,
    history: {
      periodSaved,
      historicalStudents,
      liveStudents,
      dataSource,
      snapshotAt
    },
    currentTimestamp: new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  };
}

async function fetchHistoricalStudents(req, periodIndex) {
  const query = req.query || {};
  const buscaMatricula = normalizeSearchText(query.busca_matricula);
  const buscaNome = normalizeSearchText(query.busca_nome);
  const isAdmin = req.session?.user?.role === 'Admin';
  const adminFilters = isAdmin
    ? {
      curso: normalizeSearchText(query.curso),
      turma: normalizeSearchText(query.turma),
      categoria: normalizeSearchText(query.categoria),
      cota: normalizeSearchText(query.cota)
    }
    : { curso: '', turma: '', categoria: '', cota: '' };
  const historyByMatricula = await getHistoryByPeriod(periodIndex);
  const alunos = Array.from(historyByMatricula.values())
    .map((entry) => entry.student)
    .filter((student) => (
      canAccessStudent(req.session.user, student) &&
      includesSearchText(student.matricula, buscaMatricula) &&
      includesSearchText(student.nome, buscaNome) &&
      matchesAdminFilters(student, adminFilters)
    ))
    .map((student) => limitStudentSubjectsByRole(student, req.session.user));

  return {
    alunos,
    periodSaved: historyByMatricula.size > 0,
    hasVisibleRecords: alunos.length > 0,
    periodIndex,
    currentPeriodName: periods[periodIndex]
  };
}

async function setupDatabase() {
  await setupResearchSchema(runSql);
  await runSql(`CREATE TABLE IF NOT EXISTS alunos (
      matricula TEXT PRIMARY KEY,
      nome TEXT,
      telefone TEXT,
      cotista TEXT,
      cota_detalhada TEXT,
      categoria TEXT,
      nota_final REAL,
      taxa_faltas INTEGER,
      faltas_justificadas INTEGER,
      total_aulas INTEGER DEFAULT 100,
      curso TEXT,
      disciplina TEXT,
      turma TEXT,
      descricao TEXT,
      materias_json TEXT,
      materia1 REAL,
      materia2 REAL,
      materia3 REAL,
      materia4 REAL,
      materia5 REAL,
      materia6 REAL,
      materia7 REAL
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      matricula TEXT,
      nome TEXT,
      curso TEXT,
      disciplina TEXT,
      turma TEXT,
      session_version INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      foto_perfil BLOB,
      foto_perfil_tipo TEXT,
      foto_perfil_versao INTEGER NOT NULL DEFAULT 0
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      setor TEXT,
      descricao TEXT,
      usuario TEXT,
      timestamp TEXT
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS sessoes (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS historico_academico (
      matricula TEXT NOT NULL,
      periodo INTEGER NOT NULL CHECK (periodo >= 0 AND periodo < 6),
      snapshot_json TEXT NOT NULL,
      salvo_em TEXT NOT NULL,
      salvo_por TEXT,
      PRIMARY KEY (matricula, periodo)
    )`);

  await ensureColumns('historico_academico', [
    { name: 'salvo_em', definition: 'TEXT' },
    { name: 'salvo_por', definition: 'TEXT' }
  ]);

  await runSql(`CREATE INDEX IF NOT EXISTS historico_academico_periodo_idx
    ON historico_academico (periodo)`);

  await runSql('DROP TRIGGER IF EXISTS delete_student_account_after_student_delete');
  await runSql(`CREATE TRIGGER delete_student_account_after_student_delete
    AFTER DELETE ON alunos
    BEGIN
      DELETE FROM usuarios
      WHERE role = 'Aluno' AND lower(trim(matricula)) = lower(trim(OLD.matricula));
    END`);

  // Registros históricos continuam existindo após o encerramento do cadastro. Remova
  // o gatilho de uma versão anterior caso este banco tenha sido inicializado
  // antes da correção dessa regra.
  await runSql('DROP TRIGGER IF EXISTS delete_student_history_after_student_delete');

  await ensureColumns('alunos', [
      { name: 'curso', definition: 'TEXT' },
      { name: 'disciplina', definition: 'TEXT' },
      { name: 'turma', definition: 'TEXT' },
      { name: 'descricao', definition: 'TEXT' },
      { name: 'materias_json', definition: 'TEXT' },
      { name: 'materia1', definition: 'REAL' },
      { name: 'materia2', definition: 'REAL' },
      { name: 'materia3', definition: 'REAL' },
      { name: 'materia4', definition: 'REAL' },
      { name: 'materia5', definition: 'REAL' },
      { name: 'materia6', definition: 'REAL' },
      { name: 'materia7', definition: 'REAL' }
  ]);

  await ensureColumns('usuarios', [
      { name: 'curso', definition: 'TEXT' },
      { name: 'disciplina', definition: 'TEXT' },
      { name: 'turma', definition: 'TEXT' },
      { name: 'session_version', definition: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'must_change_password', definition: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'foto_perfil', definition: 'BLOB' },
      { name: 'foto_perfil_tipo', definition: 'TEXT' },
      { name: 'foto_perfil_versao', definition: 'INTEGER NOT NULL DEFAULT 0' }
  ]);

  const normalizedAcademicData = await normalizeLegacyAcademicAttendanceData();
  if (normalizedAcademicData.studentsUpdated > 0 || normalizedAcademicData.historicalSnapshotsUpdated > 0) {
    console.warn(
      `Normalização acadêmica: ${normalizedAcademicData.studentsUpdated} aluno(s), ` +
      `${normalizedAcademicData.subjectEntriesUpdated} matéria(s) e ` +
      `${normalizedAcademicData.historicalSnapshotsUpdated} histórico(s) ajustado(s).`
    );
  }

  const legacyPasswordsMarked = await markLegacyStudentAccountsForPasswordChange();
  if (legacyPasswordsMarked > 0) {
    console.warn(`${legacyPasswordsMarked} conta(s) de aluno com senha inicial legada exigirão troca de senha no próximo acesso.`);
  }

  // Remove somente contas de aluno sem cadastro ativo antes de
  // aplicar índices ou provisionar contas ausentes. Assim, permanecem intactos
  // as contas da equipe e os snapshots acadêmicos.
  await cleanupOrphanStudentAccounts();

  // A chave primária diferencia `A1` de `a1`. Este índice
  // mantém a compatibilidade com buscas antigas e evita essa
  // ambiguidade em novos cadastros e importações CSV.
  await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS unique_alunos_matricula_normalizada
    ON alunos (lower(trim(matricula)))`);

  // Estes índices aceleram as verificações de escopo usadas na listagem,
  // nas estatísticas e no chat, sem expor a tabela inteira de alunos
  // a narrower profile.
  await runSql(`CREATE INDEX IF NOT EXISTS alunos_escopo_academico_idx
    ON alunos (lower(trim(curso)), lower(trim(disciplina)), lower(trim(turma)))`);
  await runSql(`CREATE INDEX IF NOT EXISTS alunos_nome_normalizado_idx
    ON alunos (lower(trim(nome)))`);

  await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS unique_student_account_matricula
    ON usuarios (lower(trim(matricula)))
    WHERE role = 'Aluno' AND trim(COALESCE(matricula, '')) <> ''`);

  // Mantém o login por nome e o escopo acadêmico atualizados quando o Admin
  // altera o cadastro do aluno. As senhas não são modificadas.
  await runSql('DROP TRIGGER IF EXISTS sync_student_account_after_student_update');
  await runSql(`CREATE TRIGGER sync_student_account_after_student_update
    AFTER UPDATE OF nome, curso, disciplina, turma ON alunos
    BEGIN
      UPDATE usuarios
      SET nome = NEW.nome,
          curso = NEW.curso,
          disciplina = NEW.disciplina,
          turma = NEW.turma
      WHERE role = 'Aluno' AND lower(trim(matricula)) = lower(trim(NEW.matricula));
    END`);

  await backfillStudentAccounts();

  // The Vida Acadêmica domain is intentionally additive: it does not rewrite
  // os campos consolidados legados de matérias usados nos painéis existentes.
  await setupAcademicLifeSchema(runSql, allSql);

}

async function getVisibleStudentDataByMatricula(user, matricula, periodIndex = 0, { source = 'periodo' } = {}) {
  const student = await getStudentByMatricula(matricula);
  const [historyRow, periodSnapshot] = await Promise.all([
    getSql(
      `SELECT matricula, snapshot_json, salvo_em
       FROM historico_academico
       WHERE lower(trim(matricula)) = lower(trim(?)) AND periodo = ?`,
      [student?.matricula || matricula, periodIndex]
    ),
    getSql('SELECT 1 AS saved FROM historico_academico WHERE periodo = ? LIMIT 1', [periodIndex])
  ]);
  const snapshot = readAcademicHistorySnapshot(historyRow, periodIndex);
  const useCurrentSource = source === 'atual';
  const currentStudent = student
    ? (await projectNormalizedAcademicLife([student], periodIndex))[0]
    : null;
  // Depois de encerrar a lista do período, cadastros atuais ausentes nela não podem
  // aparecer nas consultas históricas. Ainda é possível consultar os dados
  // preservados no snapshot de um aluno removido.
  const visibleStudent = useCurrentSource
    ? (currentStudent ? calculateRisk(currentStudent) : null)
    : (snapshot?.student || (!periodSnapshot && currentStudent ? calculateRisk(currentStudent) : null));
  if (!visibleStudent) return null;
  if (!canAccessStudent(user, visibleStudent)) return null;

  return {
    student: limitStudentSubjectsByRole(visibleStudent, user),
    dataSource: useCurrentSource || !snapshot ? 'atual' : 'historico',
    hasPeriodSnapshot: Boolean(periodSnapshot),
    snapshotAt: snapshot?.capturedAt || null
  };
}

async function getVisibleStudentByMatricula(user, matricula, periodIndex = 0, options = {}) {
  const data = await getVisibleStudentDataByMatricula(user, matricula, periodIndex, options);
  return data?.student || null;
}

function backupDatabase(callback) {
  const backupPath = `${dbPath}.backup`;
  fs.copyFile(dbPath, backupPath, (err) => {
    if (err) {
      console.error('Erro ao criar backup do banco de dados:', err.message);
    } else {
      console.log('Backup do banco de dados criado em', backupPath);
    }
    if (callback) callback(err);
  });
}

module.exports = {
  db,
  runSql,
  getSql,
  allSql,
  withImmediateTransaction,
  setupDatabase,
  backupDatabase,
  buildSubjectEntriesFromStudent,
  calculateRisk,
  collectSubjectNames,
  fetchVisibleStudents,
  fetchHistoricalStudents,
  projectNormalizedAcademicLife,
  getVisibleStudentDataByMatricula,
  getVisibleStudentByMatricula,
  getStudentByMatricula,
  saveAcademicHistoryPeriod,
  deleteStudentByMatricula,
  deleteStaffUserById,
  cleanupOrphanStudentAccounts,
  normalizeLegacyAcademicAttendanceData,
  createStudentWithAccount,
  resetStudentTemporaryPassword,
  updateStudentFields,
  setupAcademicLifeSchema
};
