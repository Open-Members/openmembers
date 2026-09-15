// Deliberately public, fictitious credentials. The demo scripts reject remote services.
export const demoPassword = 'OpenMembers-local-2026!';
export const demoUsers = [
  { id: '10000000-0000-4000-8000-000000000001', email: 'admin@example.test', name: 'Demo Administrator', role: 'super_admin' },
  { id: '10000000-0000-4000-8000-000000000002', email: 'student@example.test', name: 'Demo Student', role: 'user' },
  { id: '10000000-0000-4000-8000-000000000003', email: 'visitor@example.test', name: 'Demo Visitor', role: 'user' },
  { id: '10000000-0000-4000-8000-000000000004', email: 'expired@example.test', name: 'Expired Student', role: 'user' },
  { id: '10000000-0000-4000-8000-000000000005', email: 'suspended@example.test', name: 'Suspended Student', role: 'user', status: 'suspended' },
  { id: '10000000-0000-4000-8000-000000000006', email: 'staff@example.test', name: 'Demo Staff', role: 'admin' },
];
export const ids = {
  course: '20000000-0000-4000-8000-000000000001',
  draftCourse: '20000000-0000-4000-8000-000000000002',
  module: '30000000-0000-4000-8000-000000000001',
  lesson: '40000000-0000-4000-8000-000000000001',
  lockedLesson: '40000000-0000-4000-8000-000000000002',
  draftLesson: '40000000-0000-4000-8000-000000000003',
  previewLesson: '40000000-0000-4000-8000-000000000004',
  level: '50000000-0000-4000-8000-000000000001',
  attachment: '60000000-0000-4000-8000-000000000001',
  lockedAttachment: '60000000-0000-4000-8000-000000000002',
  drip: '70000000-0000-4000-8000-000000000001',
};
