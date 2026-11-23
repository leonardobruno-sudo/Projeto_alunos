/**
 * Papel de `academicLife`: recebe requisições HTTP, valida sessão e entrada, aplica permissões e encaminha os dados à regra de negócio ou ao banco.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Portas HTTP da Vida Acadêmica, montadas em `/api/vida-academica`.
 * A rota confirma que há uma sessão; em seguida, delega cada leitura ou gravação
 * ao serviço de domínio, que confere papel, curso e vínculo com diário/aluno.
 * Por fim, traduz o resultado para a resposta JSON esperada pela interface React.
 */
'use strict';

const express = require('express');
const { ensureAuth } = require('../lib/helpers');
const { apiCreated, apiServerError, apiSuccess } = require('../lib/apiResponse');
const academicLife = require('../modules/academic-life/academicLife.service');

const router = express.Router();

router.use(ensureAuth);

function sendAcademicError(res, error) {
  if (error instanceof academicLife.AcademicLifeError) {
    return res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message }
    });
  }
  console.error('Erro na Vida Acadêmica:', error.stack || error.message || error);
  return apiServerError(res, 'Não foi possível concluir a operação acadêmica.');
}

function withAcademicAction(action, { status = 200, message = 'OK' } = {}) {
  return async (req, res) => {
    try {
      const data = await action(req);
      return status === 201
        ? apiCreated(res, data, message)
        : apiSuccess(res, data, message, status);
    } catch (error) {
      return sendAcademicError(res, error);
    }
  };
}

/** Reúne dados autorizados em uma visão usada pela página React de Vida Acadêmica. */
router.get('/', withAcademicAction(
  (req) => academicLife.getAcademicLifeOverview(req.session.user, { periodo: req.query.periodo })
));

router.get('/calendarios', withAcademicAction(
  (req) => academicLife.listCalendars(req.session.user, { periodo: req.query.periodo })
));
router.post('/calendarios', withAcademicAction(
  (req) => academicLife.createCalendar(req.session.user, req.body),
  { status: 201, message: 'Calendário acadêmico criado com sucesso.' }
));
router.patch('/calendarios/:calendarId', withAcademicAction(
  (req) => academicLife.updateCalendar(req.session.user, req.params.calendarId, req.body),
  { message: 'Calendário acadêmico atualizado com sucesso.' }
));
router.delete('/calendarios/:calendarId', withAcademicAction(
  async (req) => {
    await academicLife.deleteCalendar(req.session.user, req.params.calendarId);
    return null;
  },
  { message: 'Calendário acadêmico removido com sucesso.' }
));

router.get('/calendarios/:calendarId/eventos', withAcademicAction(
  (req) => academicLife.listCalendarEvents(req.session.user, req.params.calendarId)
));
router.post('/calendarios/:calendarId/eventos', withAcademicAction(
  (req) => academicLife.createCalendarEvent(req.session.user, req.params.calendarId, req.body),
  { status: 201, message: 'Evento acadêmico criado com sucesso.' }
));
router.patch('/eventos/:eventId', withAcademicAction(
  (req) => academicLife.updateCalendarEvent(req.session.user, req.params.eventId, req.body),
  { message: 'Evento acadêmico atualizado com sucesso.' }
));
router.delete('/eventos/:eventId', withAcademicAction(
  async (req) => {
    await academicLife.deleteCalendarEvent(req.session.user, req.params.eventId);
    return null;
  },
  { message: 'Evento acadêmico removido com sucesso.' }
));

router.get('/diarios', withAcademicAction(
  (req) => academicLife.listDiaries(req.session.user, { periodo: req.query.periodo })
));
router.get('/professores', withAcademicAction(
  (req) => academicLife.listAssignableProfessors(req.session.user)
));
router.post('/diarios', withAcademicAction(
  (req) => academicLife.createDiary(req.session.user, req.body),
  { status: 201, message: 'Diário criado com sucesso.' }
));
router.get('/diarios/:diaryId', withAcademicAction(
  (req) => academicLife.getDiaryDetail(req.session.user, req.params.diaryId)
));
router.patch('/diarios/:diaryId', withAcademicAction(
  (req) => academicLife.updateDiary(req.session.user, req.params.diaryId, req.body),
  { message: 'Diário atualizado com sucesso.' }
));
router.get('/diarios/:diaryId/matriculas', withAcademicAction(
  (req) => academicLife.listDiaryEnrollments(req.session.user, req.params.diaryId)
));
router.post('/diarios/:diaryId/matriculas', withAcademicAction(
  (req) => academicLife.enrollStudents(req.session.user, req.params.diaryId, req.body?.matriculas),
  { message: 'Matrículas do diário atualizadas com sucesso.' }
));
router.patch('/diarios/:diaryId/matriculas/:matricula', withAcademicAction(
  (req) => academicLife.setDiaryEnrollmentActive(
    req.session.user,
    req.params.diaryId,
    req.params.matricula,
    req.body?.ativa
  ),
  { message: 'Situação da matrícula atualizada com sucesso.' }
));
router.post('/diarios/:diaryId/aulas', withAcademicAction(
  (req) => academicLife.createLesson(req.session.user, req.params.diaryId, req.body),
  { status: 201, message: 'Aula lançada com sucesso.' }
));
router.patch('/aulas/:lessonId', withAcademicAction(
  (req) => academicLife.updateLesson(req.session.user, req.params.lessonId, req.body),
  { message: 'Aula atualizada com sucesso.' }
));
router.delete('/aulas/:lessonId', withAcademicAction(
  async (req) => {
    await academicLife.deleteLesson(req.session.user, req.params.lessonId);
    return null;
  },
  { message: 'Aula removida com sucesso.' }
));
router.put('/aulas/:lessonId/frequencias/:matricula', withAcademicAction(
  (req) => academicLife.setAttendance(req.session.user, req.params.lessonId, req.params.matricula, req.body),
  { message: 'Frequência lançada com sucesso.' }
));
router.post('/diarios/:diaryId/avaliacoes', withAcademicAction(
  (req) => academicLife.createAssessment(req.session.user, req.params.diaryId, req.body),
  { status: 201, message: 'Avaliação lançada com sucesso.' }
));
router.patch('/avaliacoes/:assessmentId', withAcademicAction(
  (req) => academicLife.updateAssessment(req.session.user, req.params.assessmentId, req.body),
  { message: 'Avaliação atualizada com sucesso.' }
));
router.delete('/avaliacoes/:assessmentId', withAcademicAction(
  async (req) => {
    await academicLife.deleteAssessment(req.session.user, req.params.assessmentId);
    return null;
  },
  { message: 'Avaliação removida com sucesso.' }
));
router.put('/avaliacoes/:assessmentId/notas/:matricula', withAcademicAction(
  (req) => academicLife.setGrade(req.session.user, req.params.assessmentId, req.params.matricula, req.body),
  { message: 'Nota lançada com sucesso.' }
));

router.get('/requerimentos', withAcademicAction(
  (req) => academicLife.listRequests(req.session.user, { periodo: req.query.periodo })
));
router.post('/requerimentos', withAcademicAction(
  (req) => academicLife.createRequest(req.session.user, req.body),
  { status: 201, message: 'Requerimento criado com sucesso.' }
));
router.patch('/requerimentos/:requestId', withAcademicAction(
  (req) => academicLife.updateRequest(req.session.user, req.params.requestId, req.body),
  { message: 'Requerimento atualizado com sucesso.' }
));
router.delete('/requerimentos/:requestId', withAcademicAction(
  async (req) => {
    await academicLife.deleteRequest(req.session.user, req.params.requestId);
    return null;
  },
  { message: 'Requerimento removido com sucesso.' }
));

router.get('/documentos', withAcademicAction(
  (req) => academicLife.listDocuments(req.session.user, { periodo: req.query.periodo })
));
router.post('/documentos', withAcademicAction(
  (req) => academicLife.createDocument(req.session.user, req.body),
  { status: 201, message: 'Documento acadêmico registrado com sucesso.' }
));
router.patch('/documentos/:documentId', withAcademicAction(
  (req) => academicLife.updateDocument(req.session.user, req.params.documentId, req.body),
  { message: 'Documento acadêmico atualizado com sucesso.' }
));
router.delete('/documentos/:documentId', withAcademicAction(
  async (req) => {
    await academicLife.deleteDocument(req.session.user, req.params.documentId);
    return null;
  },
  { message: 'Documento arquivado com sucesso.' }
));

module.exports = router;
