/**
 * src/lib/permissions.js
 *
 * Role-based authorization helpers for student visibility and edits.
 *
 * Used by:
 *   - src/lib/database.js
 *   - src/routes/api.js
 */
const { normalizeMatricula } = require('./utils');

function hasSameScope(studentValue, userValue) {
  const studentScope = String(studentValue || '').trim().toLowerCase();
  const userScope = String(userValue || '').trim().toLowerCase();
  return Boolean(studentScope && userScope && studentScope === userScope);
}

function canAccessStudent(user, student) {
  if (!user || !student) return false;
  if (user.role === 'Admin') return true;
  if (user.role === 'Aluno') {
    return normalizeMatricula(student.matricula) === normalizeMatricula(user.matricula);
  }
  if (user.role === 'Diretor') {
    return hasSameScope(student.curso, user.curso);
  }
  if (user.role === 'Professor') {
    return hasSameScope(student.curso, user.curso) &&
      hasSameScope(student.disciplina, user.disciplina) &&
      hasSameScope(student.turma, user.turma);
  }
  return false;
}

function canEditStudent(user, student) {
  if (!user || !student) return false;
  if (user.role === 'Admin') return true;
  if (user.role === 'Diretor') {
    return hasSameScope(student.curso, user.curso);
  }
  if (user.role === 'Professor') {
    return hasSameScope(student.curso, user.curso) &&
      hasSameScope(student.disciplina, user.disciplina) &&
      hasSameScope(student.turma, user.turma);
  }
  return false;
}

function filterStudentsByAccess(allStudents, user) {
  if (!user) return [];
  return allStudents.filter((student) => canAccessStudent(user, student));
}

module.exports = {
  canAccessStudent,
  canEditStudent,
  filterStudentsByAccess
};
