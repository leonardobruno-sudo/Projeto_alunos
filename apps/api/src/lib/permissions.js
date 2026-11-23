/**
 * Papel de `permissions`: oferece recursos compartilhados ao servidor, como sessão, permissões, respostas e acesso ao banco.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * src/lib/permissions.js
 *
 * Regras de autorização que limitam a consulta e a edição de alunos por perfil.
 *
 * Used by:
 *   - src/lib/database.js
 *   - src/routes/api.js
 */
const { normalizeMatricula, normalizeSubjectName } = require('./utils');

function hasSameScope(studentValue, userValue) {
  const studentScope = String(studentValue || '').trim().toLowerCase();
  const userScope = String(userValue || '').trim().toLowerCase();
  return Boolean(studentScope && userScope && studentScope === userScope);
}

function subjectEntriesForAccess(student) {
  if (Array.isArray(student?.subjects)) return student.subjects;
  if (Array.isArray(student?.materias_json)) return student.materias_json;

  if (typeof student?.materias_json === 'string') {
    try {
      const parsed = JSON.parse(student.materias_json);
      if (Array.isArray(parsed)) return parsed;
    } catch (_error) {
      // Para registros antigos, usamos abaixo a única disciplina disponível.
    }
  }

  return student?.disciplina ? [{ name: student.disciplina }] : [];
}

function teacherHasSubjectAccess(user, student) {
  const allowedSubject = normalizeSubjectName(user?.disciplina);
  if (!allowedSubject) return false;

  return subjectEntriesForAccess(student).some((subject) => (
    normalizeSubjectName(subject?.name) === allowedSubject
  ));
}

function canAccessStudent(user, student) {
  if (!user || !student) return false;
  if (user.role === 'Admin') return true;
  if (user.role === 'Aluno') {
    return normalizeMatricula(student.matricula) === normalizeMatricula(user.matricula);
  }
  if (user.role === 'Diretor' || user.role === 'Coordenador') {
    return hasSameScope(student.curso, user.curso);
  }
  if (user.role === 'Professor') {
    return hasSameScope(student.curso, user.curso) &&
      hasSameScope(student.turma, user.turma) &&
      teacherHasSubjectAccess(user, student);
  }
  return false;
}

function canEditStudent(user, student) {
  if (!user || !student) return false;
  if (user.role === 'Admin') return true;
  if (user.role === 'Diretor' || user.role === 'Coordenador') {
    return hasSameScope(student.curso, user.curso);
  }
  if (user.role === 'Professor') {
    return canAccessStudent(user, student);
  }
  return false;
}

function filterStudentsByAccess(allStudents, user) {
  if (!user) return [];
  return allStudents.filter((student) => canAccessStudent(user, student));
}

function canRegisterStudents(user) {
  return user?.role === 'Admin' || user?.role === 'Diretor';
}

function canDeleteStudents(user) {
  return canRegisterStudents(user);
}

function canExportCsv(user) {
  return user?.role === 'Admin';
}

function canEditOwnSubject(user) {
  return user?.role === 'Professor' && Boolean(normalizeSubjectName(user.disciplina));
}

module.exports = {
  canAccessStudent,
  canEditStudent,
  filterStudentsByAccess,
  canRegisterStudents,
  canDeleteStudents,
  canExportCsv,
  canEditOwnSubject
};
