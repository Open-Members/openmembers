'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Mail, Lock, Trash2, Check, AlertTriangle, ChevronRight, User, LogOut, Play, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/core/i18n/routing';
import { useUser } from '@/core/supabase/UserProvider';
import { createClient } from '@/core/supabase/client';
import {
  saveAvatarUrl,
  updateDisplayName,
  requestEmailChange,
  changePassword,
  updateAutoplayPreference,
  updatePreferredLanguage,
  deleteAccount,
} from '../actions';
import { appToast } from '@/shared/lib/toast';

type Locale = 'en' | 'pt' | 'es';
const LANGUAGE_OPTIONS: Array<{ code: Locale; native: string }> = [
  { code: 'en', native: 'English' },
  { code: 'pt', native: 'Português' },
  { code: 'es', native: 'Español' },
];

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

/** Resize an image file to fit within maxSize×maxSize, returns a Blob. */
function resizeImage(file: File, maxSize: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
        'image/webp',
        0.85,
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function Section({
  eyebrow,
  heading,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  heading: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <motion.section variants={fadeUp} className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] shrink-0">
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
            {eyebrow}
          </p>
          <h2 className="font-display text-xl md:text-2xl font-medium leading-tight tracking-tight text-[var(--color-foreground)]">
            {heading}
          </h2>
        </div>
      </header>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 flex flex-col gap-5 transition-colors hover:border-[var(--color-primary)]/30">
        {children}
      </div>
    </motion.section>
  );
}

function StatusMsg({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <AnimatePresence>
      <motion.p
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className={`text-sm font-semibold flex items-center gap-1.5 ${type === 'success' ? 'text-[var(--color-score-excellent)]' : 'text-[var(--color-accent)]'}`}
      >
        {type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        {msg}
      </motion.p>
    </AnimatePresence>
  );
}

export function SettingsPage() {
  const t = useTranslations('settings');
  const router = useRouter();
  const { user, avatarUrl, refreshAvatar } = useUser();
  const translateError = useCallback((code: string) => (
    t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.unexpected')
  ), [t]);

  // ── Display name ──
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name ?? '');
  const [nameStatus, setNameStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [savingName, setSavingName] = useState(false);

  // UserProvider loads async — hydrate the input from metadata once user
  // arrives. Only fills when the field is still empty so we don't clobber
  // what the user typed mid-edit.
  const metaName = user?.user_metadata?.display_name as string | undefined;
  useEffect(() => {
    if (metaName) setDisplayName((curr: string) => (curr ? curr : metaName));
  }, [metaName]);

  // ── Avatar ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarStatus, setAvatarStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(avatarUrl ?? null);

  // ── Email ──
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  // ── Password ──
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // ── Language ──
  const currentLocale = useLocale() as Locale;
  const [selectedLocale, setSelectedLocale] = useState<Locale>(currentLocale);
  const [savingLocale, setSavingLocale] = useState(false);

  // ── Video preferences ──
  const [autoplayNext, setAutoplayNext] = useState(false);
  const [autoplayLoaded, setAutoplayLoaded] = useState(false);
  const [savingAutoplay, setSavingAutoplay] = useState(false);

  // ── Delete account ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Load current autoplay preference from profile on mount.
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('autoplay_next_lesson')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setAutoplayNext(data?.autoplay_next_lesson ?? false);
        setAutoplayLoaded(true);
      });
  }, [user?.id]);

  async function handleLocaleChange(next: Locale) {
    if (savingLocale) return;
    setSelectedLocale(next);
    setSavingLocale(true);
    const result = await updatePreferredLanguage(next);
    setSavingLocale(false);
    if (result?.error) {
      setSelectedLocale(currentLocale);
      appToast.danger(translateError(result.error));
      return;
    }
    // Reload after saving the account preference so every translated surface
    // resolves with the same locale, including the document language.
    window.location.reload();
  }

  async function handleAutoplayToggle(next: boolean) {
    setAutoplayNext(next); // optimistic
    setSavingAutoplay(true);
    const result = await updateAutoplayPreference(next);
    setSavingAutoplay(false);
    if (result?.error) {
      setAutoplayNext(!next); // revert on failure
      appToast.danger(translateError(result.error));
    }
  }

  // ── Handlers ──

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarStatus({ type: 'error', msg: t('errors.imageFile') });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAvatarStatus({ type: 'error', msg: t('errors.imageTooLarge', { maxSize: 10 }) });
      return;
    }

    setUploadingAvatar(true);
    setAvatarStatus(null);

    try {
      // 1. Resize image client-side (max 512x512) to keep uploads small & fast
      const resized = await resizeImage(file, 512);

      // Show instant preview
      setLocalAvatar(URL.createObjectURL(resized));

      // 2. Upload directly to Supabase Storage from the browser
      const supabase = createClient();
      const ext = resized.type === 'image/png' ? 'png' : resized.type === 'image/webp' ? 'webp' : 'jpg';
      const fileName = `${user!.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, resized, { contentType: resized.type, upsert: true });

      if (uploadError) {
        setAvatarStatus({ type: 'error', msg: t('errors.uploadImage') });
        setLocalAvatar(avatarUrl ?? null);
        return;
      }

      // 3. Build public URL with cache-bust
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // 4. Save URL to profiles via lightweight server action
      const result = await saveAvatarUrl(publicUrl);
      if (result.error) {
        setAvatarStatus({ type: 'error', msg: translateError(result.error) });
        setLocalAvatar(avatarUrl ?? null);
        return;
      }

      appToast.success(t('status.photoUpdated'));
      await refreshAvatar();
    } catch {
      setAvatarStatus({ type: 'error', msg: t('errors.unexpected') });
      setLocalAvatar(avatarUrl ?? null);
    } finally {
      setUploadingAvatar(false);
    }
  }, [user, avatarUrl, refreshAvatar, t, translateError]);

  const handleSaveName = async () => {
    setSavingName(true);
    setNameStatus(null);
    const result = await updateDisplayName(displayName.trim());
    if (result.error) {
      setNameStatus({ type: 'error', msg: translateError(result.error) });
    } else {
      setNameStatus(null);
      appToast.success(t('status.nameUpdated'));
    }
    setSavingName(false);
  };

  const handleEmailChange = async () => {
    setSavingEmail(true);
    setEmailStatus(null);
    const result = await requestEmailChange(newEmail.trim());
    if (result.error) {
      setEmailStatus({ type: 'error', msg: translateError(result.error) });
    } else {
      setEmailStatus(null);
      appToast.success(t('status.emailSent'), t('status.emailSentDescription'));
      setShowEmailForm(false);
      setNewEmail('');
    }
    setSavingEmail(false);
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', msg: t('errors.passwordMismatch') });
      return;
    }
    setSavingPassword(true);
    setPasswordStatus(null);
    const result = await changePassword(newPassword);
    if (result.error) {
      setPasswordStatus({ type: 'error', msg: translateError(result.error) });
    } else {
      setPasswordStatus(null);
      appToast.success(t('status.passwordUpdated'));
      setShowPasswordForm(false);
      setNewPassword('');
      setConfirmPassword('');
    }
    setSavingPassword(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteStatus(null);
    const result = await deleteAccount();
    if (result.error) {
      setDeleteStatus({ type: 'error', msg: translateError(result.error) });
      setDeleting(false);
    } else {
      // Sign out + redirect
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
    }
  };

  const inputClass = 'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5 text-sm font-medium text-[var(--color-foreground)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15';
  const btnPrimary = 'inline-flex items-center justify-center rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed';
  const btnGhost = 'inline-flex items-center justify-center rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-primary)]/40 hover:text-[var(--color-foreground)]';

  return (
    <div className="max-w-3xl w-full mx-auto">
      <motion.div
        className="flex flex-col gap-10 md:gap-12"
        initial="initial"
        animate="animate"
        variants={{ animate: { transition: { staggerChildren: 0.06 } } }}
      >
        {/* ── Profile Photo + Name ── */}
        <Section eyebrow={t('profile.eyebrow')} heading={t('profile.heading')} icon={User}>
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <button
                onClick={handleAvatarClick}
                disabled={uploadingAvatar}
                aria-label={t('profile.changePhoto')}
                className="relative w-20 h-20 rounded-full overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-primary)]/60 transition-colors group"
              >
                {localAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={localAvatar} alt={t('profile.photo')} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[var(--color-muted)] flex items-center justify-center">
                    <User className="w-8 h-8 text-[var(--color-muted-foreground)]" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </button>
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-[var(--color-card)]/70 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-[var(--color-foreground)]">{t('profile.photo')}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">{t('profile.photoHelp', { maxSize: 10 })}</p>
              <button onClick={handleAvatarClick} className="text-xs font-semibold text-[var(--color-primary)] hover:underline mt-1 self-start">
                {t('profile.changePhoto')}
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" aria-label={t('profile.photo')} className="hidden" onChange={handleAvatarChange} />
          </div>
          {avatarStatus && <StatusMsg {...avatarStatus} />}

          {/* Display name */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border)]">
            <label htmlFor="settings-display-name" className="text-sm font-semibold text-[var(--color-foreground)] mt-3">{t('profile.displayName')}</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="settings-display-name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder={t('profile.namePlaceholder')}
                className={inputClass}
              />
              <button onClick={handleSaveName} disabled={savingName || !displayName.trim()} className={btnPrimary}>
                {savingName ? t('actions.saving') : t('actions.save')}
              </button>
            </div>
            {nameStatus && <StatusMsg {...nameStatus} />}
          </div>
        </Section>

        {/* ── Email ── */}
        <Section eyebrow={t('email.eyebrow')} heading={t('email.heading')} icon={Mail}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-foreground)]">{user?.email}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{t('email.currentAddress')}</p>
            </div>
            <button
              onClick={() => setShowEmailForm(v => !v)}
              className="flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline shrink-0"
            >
              {t('actions.change')} <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <AnimatePresence>
            {showEmailForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-3 overflow-hidden"
              >
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  aria-label={t('email.newAddress')}
                  placeholder={t('email.newAddress')}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button onClick={handleEmailChange} disabled={savingEmail || !newEmail.trim()} className={btnPrimary}>
                    {savingEmail ? t('actions.sending') : t('email.sendConfirmation')}
                  </button>
                  <button onClick={() => setShowEmailForm(false)} className={btnGhost}>{t('actions.cancel')}</button>
                </div>
                {emailStatus && <StatusMsg {...emailStatus} />}
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        {/* ── Password ── */}
        <Section eyebrow={t('password.eyebrow')} heading={t('password.heading')} icon={Lock}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-foreground)]">{t('password.label')}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{t('password.description')}</p>
            </div>
            <button
              onClick={() => setShowPasswordForm(v => !v)}
              className="flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline shrink-0"
            >
              {t('actions.change')} <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <AnimatePresence>
            {showPasswordForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-3 overflow-hidden"
              >
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  aria-label={t('password.newPassword', { minLength: 8 })}
                  placeholder={t('password.newPassword', { minLength: 8 })}
                  className={inputClass}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  aria-label={t('password.confirmPassword')}
                  placeholder={t('password.confirmPassword')}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button onClick={handlePasswordChange} disabled={savingPassword || !newPassword || !confirmPassword} className={btnPrimary}>
                    {savingPassword ? t('actions.updating') : t('password.update')}
                  </button>
                  <button onClick={() => setShowPasswordForm(false)} className={btnGhost}>{t('actions.cancel')}</button>
                </div>
                {passwordStatus && <StatusMsg {...passwordStatus} />}
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        {/* ── Language ── */}
        <Section eyebrow={t('language.eyebrow')} heading={t('language.heading')} icon={Globe}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('language.description')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {LANGUAGE_OPTIONS.map((opt) => {
                const active = selectedLocale === opt.code;
                return (
                  <button
                    key={opt.code}
                    onClick={() => handleLocaleChange(opt.code)}
                    disabled={savingLocale}
                    aria-pressed={active}
                    style={
                      active
                        ? {
                            borderColor: 'var(--color-primary)',
                            backgroundColor: 'color-mix(in oklab, var(--color-primary) 10%, transparent)',
                          }
                        : undefined
                    }
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                      active ? '' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/40'
                    }`}
                  >
                    <p lang={opt.code} className="text-sm font-semibold text-[var(--color-foreground)]">{opt.native}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">{t(`language.options.${opt.code}`)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {/* ── Video preferences ── */}
        <Section eyebrow={t('playback.eyebrow')} heading={t('playback.heading')} icon={Play}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--color-foreground)]">{t('playback.autoplay')}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5 max-w-sm">
                {t('playback.description')}
              </p>
            </div>
            <button
              role="switch"
              aria-label={t('playback.autoplay')}
              aria-checked={autoplayNext}
              disabled={!autoplayLoaded || savingAutoplay}
              onClick={() => handleAutoplayToggle(!autoplayNext)}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                autoplayNext ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  autoplayNext ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </Section>

        {/* ── Log out ── */}
        <Section eyebrow={t('session.eyebrow')} heading={t('session.heading')} icon={LogOut}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-foreground)]">{t('session.signOut')}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{t('session.description')}</p>
            </div>
            <button
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                router.push('/login');
              }}
              className={btnGhost}
            >
              {t('session.signOut')}
            </button>
          </div>
        </Section>

        {/* ── Danger zone ── */}
        <Section eyebrow={t('danger.eyebrow')} heading={t('danger.heading')} icon={AlertTriangle}>
          {!showDeleteConfirm ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-foreground)]">{t('danger.deleteAccount')}</p>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                  {t('danger.description')}
                </p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)]/40 px-5 py-2.5 text-sm font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                {t('danger.delete')}
              </button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-4"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-[var(--color-accent)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[var(--color-accent)]">{t('danger.irreversible')}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    {t.rich('danger.confirmDescription', {
                      word: t('danger.confirmWord'),
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                </div>
              </div>
              <input
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                aria-label={t('danger.confirmPlaceholder', { word: t('danger.confirmWord') })}
                placeholder={t('danger.confirmPlaceholder', { word: t('danger.confirmWord') })}
                className={inputClass}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteInput !== t('danger.confirmWord')}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleting ? t('danger.deleting') : t('danger.deleteAccount')}
                </button>
                <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }} className={btnGhost}>
                  {t('actions.cancel')}
                </button>
              </div>
              {deleteStatus && <StatusMsg {...deleteStatus} />}
            </motion.div>
          )}
        </Section>
      </motion.div>
    </div>
  );
}
