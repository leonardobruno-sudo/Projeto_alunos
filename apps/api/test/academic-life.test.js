/**
 * Papel de `academic-life.test`: garante que um comportamento importante continue funcionando nos cenários descritos a seguir.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Testa o fluxo de persistência normalizado da Vida Acadêmica
 * e confirma que o serviço e a rota REST aplicam o escopo permitido
 * sem depender de filtros aplicados apenas no navegador.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-academic-life-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'escola.db');

const {
  db,
  fetchVisibleStudents,
  getSql,
  getVisibleStudentByMatricula,
  runSql,
  saveAcademicHistoryPeriod,
  setupDatabase
} = require('../src/lib/database');
const { ChatCommandController } = require('../src/modules/ai/commandController');
const academicLife = require('../src/modules/academic-life/academicLife.service');
const academicLifeRoutes = require('../src/routes/academicLife');

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

async function seedUser({ username, role, matricula = null, curso = '', disciplina = '', turma = '' }) {
  const result = await runSql(
    `INSERT INTO usuarios (username, password, role, matricula, nome, curso, disciplina, turma)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [username, 'hash-de-teste', role, matricula, username, curso, disciplina, turma]
  );
  return {
    id: result.lastID,
    username,
    role,
    matricula,
    curso,
    disciplina,
    turma,
    sessionVersion: 0
  };
}

async function seedStudent({ matricula, nome, curso = 'TADS', turma = '1A' }) {
  await runSql(
    `INSERT INTO alunos (matricula, nome, curso, turma, disciplina, materias_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      matricula,
      nome,
      curso,
      turma,
      'Matemática',
      JSON.stringify([{ name: 'Matemática', nota: 0, faltas: 0, faltas_justificadas: 0, total_aulas: 0 }])
    ]
  );
}

function assertAcademicError(error, { statusCode, code }) {
  assert.ok(error instanceof academicLife.AcademicLifeError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
  return true;
}

function startAcademicRouter(users) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const user = users[req.get('x-test-user')];
    req.session = { user };
    next();
  });
  app.use('/api/vida-academica', academicLifeRoutes);

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('Vida Acadêmica mantém aulas, frequência e avaliações restritas ao escopo do usuário', async (t) => {
  t.after(async () => {
    await closeDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await setupDatabase();
  const admin = await seedUser({ username: 'admin-academico', role: 'Admin' });
  const diretor = await seedUser({ username: 'diretor-tads', role: 'Diretor', curso: 'TADS' });
  const professor = await seedUser({
    username: 'professor-matematica',
    role: 'Professor',
    curso: 'TADS',
    turma: '1A',
    disciplina: 'Matemática'
  });
  const professorDaMesmaMateria = await seedUser({
    username: 'professor-matematica-paralelo',
    role: 'Professor',
    curso: 'TADS',
    turma: '1A',
    disciplina: 'Matemática'
  });
  const professorDeOutraMateria = await seedUser({
    username: 'professor-historia',
    role: 'Professor',
    curso: 'TADS',
    turma: '1A',
    disciplina: 'História'
  });
  const professorOutraTurma = await seedUser({
    username: 'professor-quimica-2b',
    role: 'Professor',
    curso: 'TADS',
    turma: '2B',
    disciplina: 'Química'
  });
  const aluno = await seedUser({ username: 'alu-001', role: 'Aluno', matricula: 'ALU-001', curso: 'TADS', turma: '1A' });
  const outroAluno = await seedUser({ username: 'alu-002', role: 'Aluno', matricula: 'ALU-002', curso: 'TADS', turma: '1A' });
  await seedStudent({ matricula: 'ALU-001', nome: 'Ana Aluna' });
  await seedStudent({ matricula: 'ALU-002', nome: 'Bruno Aluno' });
  await seedStudent({ matricula: 'ALU-003', nome: 'Caio Aluno', turma: '2B' });

  const calendar = await academicLife.createCalendar(admin, {
    titulo: 'Calendário letivo 2026.1',
    curso: 'TADS',
    turma: '1A',
    periodo: 0,
    inicioEm: '2026-02-01',
    fimEm: '2026-06-30'
  });
  const event = await academicLife.createCalendarEvent(diretor, calendar.id, {
    titulo: 'Avaliação diagnóstica',
    tipo: 'Avaliacao',
    inicioEm: '2026-03-10',
    fimEm: '2026-03-10',
    visivelParaAlunos: true
  });
  assert.equal(event.calendarioId, calendar.id);
  await assert.rejects(
    () => academicLife.updateCalendar(diretor, calendar.id, { turma: '1B' }),
    (error) => assertAcademicError(error, { statusCode: 409, code: 'academic_calendar_scope_locked' })
  );
  await assert.rejects(
    () => academicLife.updateCalendar(diretor, calendar.id, { inicioEm: '2026-04-01', fimEm: '2026-06-30' }),
    (error) => assertAcademicError(error, { statusCode: 400, code: 'invalid_academic_life_request' })
  );

  const diary = await academicLife.createDiary(diretor, {
    curso: 'TADS',
    turma: '1A',
    disciplina: 'Matemática',
    periodo: 0,
    professorUsuarioId: professor.id,
    matriculas: ['ALU-001']
  });
  assert.equal(diary.professorUsuarioId, professor.id);
  await assert.rejects(
    () => academicLife.enrollStudents(diretor, diary.id, ['ALU-002', 'MATRICULA-INEXISTENTE']),
    (error) => assertAcademicError(error, { statusCode: 404, code: 'academic_life_not_found' })
  );
  assert.deepEqual(
    (await academicLife.listDiaryEnrollments(diretor, diary.id)).map((item) => item.matricula),
    ['ALU-001']
  );

  await assert.rejects(
    () => academicLife.createDiary(diretor, {
      curso: 'TADS',
      turma: '2B',
      disciplina: 'Química',
      periodo: 0,
      professorUsuarioId: professorOutraTurma.id,
      matriculas: ['ALU-003', 'MATRICULA-INEXISTENTE']
    }),
    (error) => assertAcademicError(error, { statusCode: 404, code: 'academic_life_not_found' })
  );
  const partialDiary = await getSql(
    `SELECT id FROM diarios_turma
     WHERE lower(trim(curso)) = lower(trim(?))
       AND lower(trim(turma)) = lower(trim(?))
       AND lower(trim(disciplina)) = lower(trim(?)) AND periodo = ?`,
    ['TADS', '2B', 'Química', 0]
  );
  assert.equal(partialDiary, undefined);
  assert.deepEqual(
    (await academicLife.listAssignableProfessors(diretor)).map((item) => item.id).sort((left, right) => left - right),
    [professor.id, professorDaMesmaMateria.id, professorDeOutraMateria.id, professorOutraTurma.id]
      .sort((left, right) => left - right)
  );
  await assert.rejects(
    () => academicLife.createDiary(diretor, {
      curso: 'TADS', turma: '1A', disciplina: 'Química', periodo: 0
    }),
    (error) => assertAcademicError(error, { statusCode: 400, code: 'invalid_academic_life_request' })
  );

  const lesson = await academicLife.createLesson(professor, diary.id, {
    dataAula: '2026-03-10',
    titulo: 'Funções afins',
    conteudo: 'Resolução de problemas.',
    cargaHoraria: 2
  });
  const attendance = await academicLife.setAttendance(professor, lesson.id, 'ALU-001', {
    situacao: 'FALTA'
  });
  assert.equal(attendance.situacao, 'FALTA');
  const unrecordedLesson = await academicLife.createLesson(professor, diary.id, {
    dataAula: '2026-03-11',
    titulo: 'Aula aguardando chamada'
  });

  const assessment = await academicLife.createAssessment(professor, diary.id, {
    titulo: 'Atividade 1',
    dataAvaliacao: '2026-03-10',
    peso: 2,
    notaMaxima: 100
  });
  const grade = await academicLife.setGrade(professor, assessment.id, 'ALU-001', { nota: 84 });
  assert.equal(grade.nota, 84);
  const updatedGrade = await academicLife.setGrade(professor, assessment.id, 'ALU-001', { nota: 91, observacao: 'Correção revisada.' });
  assert.equal(updatedGrade.nota, 91);
  assert.equal(updatedGrade.observacao, 'Correção revisada.');
  const bulletinWithIncompleteAttendance = await getVisibleStudentByMatricula(admin, 'ALU-001', 0, { source: 'atual' });
  assert.equal(bulletinWithIncompleteAttendance.subjects[0].nota, 91);
  assert.equal(bulletinWithIncompleteAttendance.taxa_faltas, 0);
  const secondAttendance = await academicLife.setAttendance(professor, unrecordedLesson.id, 'ALU-001', {
    situacao: 'PRESENTE'
  });
  assert.equal(secondAttendance.situacao, 'PRESENTE');
  const currentBulletin = await getVisibleStudentByMatricula(admin, 'ALU-001', 0, { source: 'atual' });
  assert.equal(currentBulletin.subjects[0].nota, 91);
  assert.equal(currentBulletin.nota_final, 91);
  assert.equal(currentBulletin.taxa_faltas, 50);
  const currentDashboard = await fetchVisibleStudents({
    query: { periodo: 0, fonte: 'atual' },
    session: { user: admin }
  });
  assert.equal(currentDashboard.alunos[0].subjects[0].nota, 91);
  const savedHistory = await saveAcademicHistoryPeriod(0, admin.username);
  assert.equal(savedHistory.created, 3);
  const historicalBulletin = await getVisibleStudentByMatricula(admin, 'ALU-001', 0, { source: 'historico' });
  assert.equal(historicalBulletin.subjects[0].nota, 91);
  await assert.rejects(
    () => academicLife.setGrade(professor, assessment.id, 'ALU-001', { nota: 101 }),
    (error) => assertAcademicError(error, { statusCode: 400, code: 'invalid_academic_life_request' })
  );

  const request = await academicLife.createRequest(aluno, {
    tipo: 'DECLARACAO_MATRICULA',
    descricao: 'Solicito declaração atualizada.',
    periodo: 0
  });
  assert.equal(request.matricula, 'ALU-001');
  const requestToDelete = await academicLife.createRequest(aluno, {
    tipo: 'OUTRO',
    descricao: 'Requerimento de teste para exclusão.',
    periodo: 0
  });
  await academicLife.deleteRequest(diretor, requestToDelete.id);
  await assert.rejects(
    () => academicLife.deleteRequest(diretor, requestToDelete.id),
    (error) => assertAcademicError(error, { statusCode: 404, code: 'academic_life_not_found' })
  );
  const document = await academicLife.createDocument(admin, {
    matricula: 'ALU-001',
    tipo: 'BOLETIM',
    titulo: 'Boletim parcial',
    periodo: 0
  });
  assert.equal(document.matricula, 'ALU-001');

  const overview = await academicLife.getAcademicLifeOverview(aluno, { periodo: 0 });
  assert.equal(overview.subjects.length, 1);
  assert.equal(overview.subjects[0].nome, 'Matemática');
  assert.deepEqual(overview.calendarEvents.map((item) => item.id), [event.id]);
  assert.deepEqual(overview.classSessions.map((item) => item.id), [lesson.id, unrecordedLesson.id]);
  assert.deepEqual(overview.attendance.map((item) => item.aulaId), [lesson.id, unrecordedLesson.id]);
  assert.deepEqual(overview.grades.map((item) => item.nota), [91]);
  assert.deepEqual(overview.diaryEnrollments, [{ diarioId: diary.id, matricula: 'ALU-001', nome: 'Ana Aluna', ativa: true }]);
  assert.deepEqual(overview.attendanceSummaries, [{
    diarioId: diary.id,
    matricula: 'ALU-001',
    totalClasses: 2,
    registeredClasses: 2,
    attendedClasses: 1,
    missedClasses: 1,
    justifiedAbsences: 0,
    absencePercent: 50,
    status: 'risco'
  }]);
  assert.deepEqual(overview.requests.map((item) => item.id), [request.id]);
  assert.deepEqual(overview.documents.map((item) => item.id), [document.id]);

  const requestFromAnotherPeriod = await academicLife.createRequest(aluno, {
    tipo: 'HISTORICO_PARCIAL',
    descricao: 'Solicito histórico do próximo período.',
    periodo: 1
  });
  const documentFromAnotherPeriod = await academicLife.createDocument(admin, {
    matricula: 'ALU-001',
    tipo: 'BOLETIM',
    titulo: 'Boletim do período seguinte',
    periodo: 1
  });
  const nextPeriodOverview = await academicLife.getAcademicLifeOverview(aluno, { periodo: 1 });
  assert.deepEqual(nextPeriodOverview.requests.map((item) => item.id), [requestFromAnotherPeriod.id]);
  assert.deepEqual(nextPeriodOverview.documents.map((item) => item.id), [documentFromAnotherPeriod.id]);

  const otherOverview = await academicLife.getAcademicLifeOverview(outroAluno, { periodo: 0 });
  assert.equal(otherOverview.diaries.length, 0);
  assert.equal(otherOverview.attendance.length, 0);
  assert.equal(otherOverview.grades.length, 0);
  assert.equal(otherOverview.diaryEnrollments.length, 0);
  assert.equal(otherOverview.attendanceSummaries.length, 0);
  assert.equal(otherOverview.documents.length, 0);

  await assert.rejects(
    () => academicLife.createLesson(professorDeOutraMateria, diary.id, {
      dataAula: '2026-03-11',
      titulo: 'Tentativa indevida'
    }),
    (error) => assertAcademicError(error, { statusCode: 403, code: 'academic_life_forbidden' })
  );
  await assert.rejects(
    () => academicLife.createLesson(professorDaMesmaMateria, diary.id, {
      dataAula: '2026-03-11',
      titulo: 'Tentativa de professor não atribuído'
    }),
    (error) => assertAcademicError(error, { statusCode: 403, code: 'academic_life_forbidden' })
  );
  assert.equal((await academicLife.getAcademicLifeOverview(professorDaMesmaMateria, { periodo: 0 })).diaries.length, 0);
  await assert.rejects(
    () => academicLife.updateDiary(diretor, diary.id, { turma: '1B' }),
    (error) => assertAcademicError(error, { statusCode: 409, code: 'academic_diary_scope_locked' })
  );
  await assert.rejects(
    () => academicLife.createDiary(professor, {
      curso: 'TADS', turma: '1A', disciplina: 'Matemática', periodo: 0
    }),
    (error) => assertAcademicError(error, { statusCode: 403, code: 'academic_life_forbidden' })
  );
  await assert.rejects(
    () => academicLife.enrollStudents(professor, diary.id, ['ALU-002']),
    (error) => assertAcademicError(error, { statusCode: 403, code: 'academic_life_forbidden' })
  );
  await assert.rejects(
    () => academicLife.createCalendar(aluno, {
      titulo: 'Tentativa indevida', curso: 'TADS', periodo: 0, inicioEm: '2026-02-01', fimEm: '2026-02-02'
    }),
    (error) => assertAcademicError(error, { statusCode: 403, code: 'academic_life_forbidden' })
  );
  await assert.rejects(
    () => academicLife.getDiaryDetail(outroAluno, diary.id),
    (error) => assertAcademicError(error, { statusCode: 403, code: 'academic_life_forbidden' })
  );

  const router = await startAcademicRouter({ aluno, outroAluno, professor, diretor, admin });
  t.after(() => new Promise((resolve, reject) => router.close((error) => (error ? reject(error) : resolve()))));
  const address = router.address();
  const root = `http://127.0.0.1:${address.port}/api/vida-academica`;
  const response = await fetch(`${root}?periodo=0`, { headers: { 'x-test-user': 'aluno' } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.attendance.length, 2);

  const deniedResponse = await fetch(`${root}/calendarios`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-user': 'aluno' },
    body: JSON.stringify({
      titulo: 'Não autorizado', curso: 'TADS', periodo: 0, inicioEm: '2026-02-01', fimEm: '2026-02-02'
    })
  });
  const deniedBody = await deniedResponse.json();
  assert.equal(deniedResponse.status, 403);
  assert.equal(deniedBody.error.code, 'academic_life_forbidden');

  const deleteRequestResponse = await fetch(`${root}/requerimentos/${request.id}`, {
    method: 'DELETE',
    headers: { 'x-test-user': 'diretor' }
  });
  const deleteRequestBody = await deleteRequestResponse.json();
  assert.equal(deleteRequestResponse.status, 200);
  assert.equal(deleteRequestBody.success, true);

  for (const [index, dataAula] of ['2026-03-11', '2026-03-12', '2026-03-13'].entries()) {
    const extraLesson = await academicLife.createLesson(professor, diary.id, {
      dataAula,
      titulo: `Aula complementar ${index + 1}`
    });
    await academicLife.setAttendance(professor, extraLesson.id, 'ALU-001', { situacao: 'FALTA' });
  }
  const atRiskOverview = await academicLife.getAcademicLifeOverview(aluno, { periodo: 0 });
  assert.deepEqual(atRiskOverview.attendanceSummaries, [{
    diarioId: diary.id,
    matricula: 'ALU-001',
    totalClasses: 5,
    registeredClasses: 5,
    attendedClasses: 1,
    missedClasses: 4,
    justifiedAbsences: 0,
    absencePercent: 80,
    status: 'risco'
  }]);
  const currentBulletinAfterAttendance = await getVisibleStudentByMatricula(admin, 'ALU-001', 0, { source: 'atual' });
  assert.equal(currentBulletinAfterAttendance.taxa_faltas, 80);
  assert.equal(currentBulletinAfterAttendance.situacao_risco, 'Em Risco');
  const chatResult = await new ChatCommandController().execute(admin, 'Buscar por matrícula: ALU-001');
  assert.equal(chatResult.context.alunos[0].notaFinal, 91);
  assert.equal(chatResult.context.alunos[0].percentualFaltas, 80);

  const persistedTables = await getSql(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'frequencias_aula'`
  );
  assert.equal(persistedTables.name, 'frequencias_aula');
});
