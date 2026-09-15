import { demoUsers, demoPassword, ids } from './demo-fixtures.mjs';

// The entrypoint must validate the isolated destination before creating this client.
export async function provisionDemoData(admin) {
  async function upsert(table, rows, onConflict = 'id') {
    const { error } = await admin.from(table).upsert(rows, { onConflict, defaultToNull: false });
    if (error) throw new Error(`Seed ${table}: ${error.message}`);
  }

  for (const user of demoUsers) {
    const { data: found, error: lookupError } = await admin.auth.admin.getUserById(user.id);
    if (lookupError && lookupError.status !== 404) throw lookupError;
    if (found.user && (found.user.email !== user.email || !found.user.user_metadata?.openmembers_fixture)) {
      throw new Error('Refusing to overwrite an account that is not an Open Members demo fixture.');
    }
    const attributes = { password: demoPassword, email_confirm: true, user_metadata: { display_name: user.name, openmembers_fixture: true } };
    const { error } = found.user
      ? await admin.auth.admin.updateUserById(user.id, attributes)
      : await admin.auth.admin.createUser({ ...attributes, id: user.id, email: user.email });
    if (error) throw new Error(`Demo account setup failed: ${error.message}`);
    const { data: profile, error: profileError } = await admin.from('profiles').update({
      display_name: user.name, role: user.role, status: user.status ?? 'active', must_change_password: false,
    }).eq('id', user.id).select('id').single();
    if (profileError || !profile) throw new Error('Auth must create a profile before demo provisioning.');
  }

  await upsert('courses', [
    { id: ids.course, slug: 'open-members-demo', title: 'Open Members Demo', description: 'A fictitious course for an independent installation.', is_published: true, is_featured: true },
    { id: ids.draftCourse, slug: 'draft-demo', title: 'Unpublished Demo', is_published: false },
  ]);
  await upsert('modules', [{ id: ids.module, course_id: ids.course, title: 'Getting started', is_published: true }]);
  await upsert('lessons', [
    { id: ids.lesson, module_id: ids.module, slug: 'welcome', title: 'Welcome to the demo', content_type: 'text', text_content: 'Your first lesson\n\nE2 PRIVATE LESSON BODY — available to enrolled members.', is_published: true, sort_order: 1 },
    { id: ids.lockedLesson, module_id: ids.module, slug: 'future-lesson', title: 'A future lesson', content_type: 'text', text_content: 'E2 LOCKED LESSON BODY — not released yet.', is_published: true, sort_order: 2 },
    { id: ids.draftLesson, module_id: ids.module, slug: 'draft-lesson', title: 'Unpublished lesson', content_type: 'text', text_content: 'E2 DRAFT LESSON BODY.', is_published: false, sort_order: 3 },
    { id: ids.previewLesson, module_id: ids.module, slug: 'preview', title: 'Preview lesson', content_type: 'text', text_content: 'A free preview for signed-in learners.', is_published: true, is_free_preview: true, sort_order: 0 },
  ]);
  await upsert('access_levels', [{ id: ids.level, name: 'Demo Membership', slug: 'demo-membership' }]);
  await upsert('access_level_courses', [{ access_level_id: ids.level, course_id: ids.course }], 'access_level_id,course_id');
  await upsert('enrollments', [1, 3, 4].map(index => ({
    user_id: demoUsers[index].id, access_level_id: ids.level, source: 'manual', is_active: true,
    enrolled_at: '2020-01-01T00:00:00Z', expires_at: index === 3 ? '2021-01-01T00:00:00Z' : null,
  })), 'user_id,access_level_id');
  await upsert('drip_rules', [{ id: ids.drip, course_id: ids.course, lesson_id: ids.lockedLesson, rule_type: 'fixed_date', fixed_date: '2099-01-01T00:00:00Z' }]);
  await upsert('collections', [{ id: '80000000-0000-4000-8000-000000000001', row_type: 'manual', title: 'Demo courses', is_enabled: true, sort_order: 1 }]);
  await upsert('collection_courses', [{ collection_id: '80000000-0000-4000-8000-000000000001', course_id: ids.course }], 'collection_id,course_id');

  for (const [id, lessonId, name] of [[ids.attachment, ids.lesson, 'demo-notes.txt'], [ids.lockedAttachment, ids.lockedLesson, 'future-notes.txt']]) {
    const storagePath = `lessons/${lessonId}/${name}`;
    const bytes = Buffer.from(`Private Open Members demo attachment for ${lessonId}.\n`);
    const { error } = await admin.storage.from('lesson-materials').upload(storagePath, bytes, { contentType: 'text/plain', upsert: true });
    if (error) throw new Error(`Demo storage: ${error.message}`);
    await upsert('lesson_attachments', [{ id, lesson_id: lessonId, file_name: name, file_url: storagePath, file_type: 'text/plain', file_size_bytes: bytes.length }]);
  }
}
