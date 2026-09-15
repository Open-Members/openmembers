/** Student profiles counted by both administrative dashboards.
 * `student` preserves compatibility with older installations; the current
 * schema creates student accounts with the `user` role.
 */
export const STUDENT_ROLES = ['user', 'student'] as const;
