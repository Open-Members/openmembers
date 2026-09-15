import { describe, expect, it } from 'vitest';
import {
  parseNotificationDescriptor,
  renderNotificationDescriptor,
  resolveNotificationContent,
  type NotificationDescriptor,
} from './messages';

const fixture: NotificationDescriptor = {
  key: 'content.lessonPublished',
  params: { courseTitle: 'Curso Ω', lessonTitle: 'Aula ç' },
};

describe('notification message registry', () => {
  const allDescriptors: NotificationDescriptor[] = [
    { key: 'enrollment.singleCourse', params: { levelName: 'Level', courseTitle: 'Course' } },
    { key: 'enrollment.dashboard', params: { levelName: 'Level' } },
    { key: 'content.coursePublished', params: { courseTitle: 'Course' } },
    { key: 'content.lessonPublished', params: { courseTitle: 'Course', lessonTitle: 'Lesson' } },
    { key: 'content.dripLesson', params: { courseTitle: 'Course', contentTitle: 'Lesson' } },
    { key: 'content.dripModule', params: { courseTitle: 'Course', contentTitle: 'Module' } },
    { key: 'content.dripCourse', params: { courseTitle: 'Course' } },
    { key: 'engagement.commentReply', params: { replierName: 'Student', excerpt: 'Reply' } },
    { key: 'engagement.commentReplyAnonymous', params: { excerpt: 'Reply' } },
    { key: 'engagement.certificateEarned', params: { courseTitle: 'Course' } },
  ];

  it.each(['en', 'pt', 'es'])('has complete templates for every descriptor in %s', (locale) => {
    for (const descriptor of allDescriptors) {
      const content = renderNotificationDescriptor(descriptor, locale);
      expect(content, descriptor.key).not.toBeNull();
      expect(content?.title, descriptor.key).not.toMatch(/\{[A-Za-z]/);
      expect(content?.message, descriptor.key).not.toMatch(/\{[A-Za-z]/);
    }
  });
  it.each([
    ['en', 'New lesson in Curso Ω', 'Aula ç just dropped. Tap to watch.'],
    ['pt', 'Nova aula em Curso Ω', 'Aula ç acaba de ser publicada. Toque para assistir.'],
    ['es', 'Nueva lección en Curso Ω', 'Aula ç acaba de publicarse. Toca para verla.'],
  ])('renders a validated descriptor in %s', (locale, title, message) => {
    expect(renderNotificationDescriptor(fixture, locale)).toEqual({ title, message });
  });

  it('uses English for an unsupported requested locale', () => {
    expect(renderNotificationDescriptor(fixture, 'de')).toEqual({
      title: 'New lesson in Curso Ω',
      message: 'Aula ç just dropped. Tap to watch.',
    });
  });

  it.each([
    ['unknown.key', {}],
    ['content.lessonPublished', null],
    ['content.lessonPublished', { courseTitle: 'Course' }],
    ['content.lessonPublished', { courseTitle: 'Course', lessonTitle: 3 }],
    ['content.lessonPublished', { courseTitle: 'Course', lessonTitle: 'Lesson', extra: 'x' }],
  ])('rejects an unknown or malformed descriptor: %s', (key, params) => {
    expect(parseNotificationDescriptor(key, params)).toBeNull();
  });

  it('preserves literal legacy/authored content for missing, unknown and invalid descriptors', () => {
    const literal = { title: 'Authored title', message: 'Authored message' };
    expect(resolveNotificationContent(literal, 'pt')).toEqual(literal);
    expect(resolveNotificationContent({ ...literal, messageKey: 'future.key', messageParams: {} }, 'es')).toEqual(literal);
    expect(resolveNotificationContent({ ...literal, messageKey: fixture.key, messageParams: { courseTitle: 'Missing lesson' } }, 'pt')).toEqual(literal);
  });

  it('does not interpolate tokens introduced by authored parameter values', () => {
    const result = renderNotificationDescriptor({
      key: 'content.coursePublished',
      params: { courseTitle: '{unexpected}' },
    }, 'en');
    expect(result).toEqual({
      title: 'New course: {unexpected}',
      message: '{unexpected} is live. Tap to jump in.',
    });
  });
});
