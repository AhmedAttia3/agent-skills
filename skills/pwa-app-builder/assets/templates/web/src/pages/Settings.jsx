/** شاشة الإعدادات: الحساب، اللغة، المظهر، الإشعارات، التثبيت، حذف الحساب */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { normalizePassword } from '../lib/normalize';
import { useAuth, useSettings, useToast } from '../lib/providers';
import { ConfirmDialog, Icon, Spinner } from '../components/ui';
import InstallGuide from '../components/InstallGuide';
import { pushSupported, enablePush, notificationPermission } from '../lib/pwa';

export default function Settings() {
  const { t, locale, setLocale, theme, setTheme } = useSettings();
  const { user, isGuest, upgrade, logout, setUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [upgradeForm, setUpgradeForm] = useState({ email: '', password: '', confirm: '' });
  const [upgrading, setUpgrading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [permission, setPermission] = useState(notificationPermission());

  async function saveName() {
    setSavingName(true);
    try {
      const data = await api.updateProfile({ name });
      setUser(data.user);
      toast(t('settings.saved'));
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    } finally {
      setSavingName(false);
    }
  }

  async function doUpgrade(event) {
    event.preventDefault();
    if (normalizePassword(upgradeForm.password) !== normalizePassword(upgradeForm.confirm)) {
      toast(t('err.passwordMismatch'), 'error');
      return;
    }
    setUpgrading(true);
    try {
      await upgrade({ ...upgradeForm, name: name || undefined });
      toast(t('settings.saved'));
    } catch (err) {
      toast(err.code === 'EMAIL_TAKEN' ? t('err.emailTaken') : err.message || t('err.generic'), 'error');
    } finally {
      setUpgrading(false);
    }
  }

  async function doChangePassword(event) {
    event.preventDefault();
    if (normalizePassword(passwordForm.newPassword) !== normalizePassword(passwordForm.confirm)) {
      toast(t('err.passwordMismatch'), 'error');
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast(t('settings.passwordChanged'));
    } catch (err) {
      toast(err.code === 'BAD_CREDENTIALS' ? t('err.currentPassword') : err.message || t('err.generic'), 'error');
    } finally {
      setChangingPassword(false);
    }
  }

  async function doDelete() {
    try {
      await api.deleteAccount();
      setUser(null);
      toast(t('settings.deleted'));
      navigate('/login', { replace: true });
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    }
  }

  async function doEnableNotifications() {
    const status = await enablePush(api.vapidKey, api.subscribePush);
    setPermission(notificationPermission());
    toast(status === 'granted' ? t('alarms.notificationsOn') : t('alarms.iosHint'), status === 'granted' ? 'success' : 'info');
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold">{t('settings.title')}</h1>

      {/* الحساب */}
      <section className="card space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-100 text-xl dark:bg-ink-700">👤</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold">{user?.name || t('auth.guest')}</div>
            <div className="truncate text-xs text-ink-500 dark:text-ink-300" dir="ltr">
              {user?.email || t('settings.guestAccount')}
            </div>
          </div>
          {isGuest && <span className="chip ms-auto bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">{t('auth.guest')}</span>}
        </div>

        <div>
          <label className="label" htmlFor="profile-name">
            {t('settings.name')}
          </label>
          <div className="flex gap-2">
            <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="button" className="btn-primary shrink-0" onClick={saveName} disabled={savingName || !name.trim()}>
              {savingName ? <Spinner /> : <Icon.Check className="h-4 w-4" />}
              {t('settings.save')}
            </button>
          </div>
        </div>
      </section>

      {/* ترقية حساب الزائر */}
      {isGuest && (
        <section className="card space-y-3 border-2 border-brand-200 p-5 dark:border-brand-800">
          <h2 className="text-sm font-extrabold">{t('auth.upgradeTitle')}</h2>
          <p className="text-xs text-ink-500 dark:text-ink-300">{t('auth.upgradeDesc')}</p>
          <form onSubmit={doUpgrade} className="space-y-3">
            <input
              className="input"
              type="email"
              required
              dir="ltr"
              placeholder="you@example.com"
              value={upgradeForm.email}
              onChange={(e) => setUpgradeForm((prev) => ({ ...prev, email: e.target.value }))}
            />
            <input
              className="input"
              type="password"
              required
              minLength={6}
              dir="ltr"
              placeholder="••••••"
              value={upgradeForm.password}
              onChange={(e) => setUpgradeForm((prev) => ({ ...prev, password: e.target.value }))}
            />
            <input
              className="input"
              type="password"
              required
              minLength={6}
              dir="ltr"
              placeholder={t('auth.confirmPassword')}
              value={upgradeForm.confirm}
              onChange={(e) => setUpgradeForm((prev) => ({ ...prev, confirm: e.target.value }))}
            />
            <button type="submit" className="btn-primary w-full" disabled={upgrading}>
              {upgrading ? <Spinner /> : <Icon.Check className="h-4 w-4" />}
              {t('auth.upgradeCta')}
            </button>
          </form>
        </section>
      )}

      {/* كلمة المرور (الحسابات الدائمة فقط) */}
      {!isGuest && (
        <section className="card space-y-3 p-5">
          <h2 className="flex items-center gap-2 text-sm font-extrabold">
            <Icon.Cog className="h-4 w-4" />
            {t('settings.changePassword')}
          </h2>
          <form onSubmit={doChangePassword} className="space-y-3">
            <div>
              <label className="label" htmlFor="current-password">
                {t('settings.currentPassword')}
              </label>
              <input
                id="current-password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                dir="ltr"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-password">
                {t('settings.newPassword')}
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  className="input pr-12"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  dir="ltr"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute inset-y-0 right-3 grid place-items-center text-ink-400 hover:text-ink-600 dark:hover:text-ink-200"
                >
                  {showPassword ? <Icon.EyeOff className="h-5 w-5" /> : <Icon.Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="confirm-password">
                {t('auth.confirmPassword')}
              </label>
              <input
                id="confirm-password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="new-password"
                dir="ltr"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={changingPassword}>
              {changingPassword ? <Spinner /> : <Icon.Check className="h-4 w-4" />}
              {t('settings.save')}
            </button>
          </form>
        </section>
      )}

      {/* اللغة */}
      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-extrabold">
          <Icon.Globe className="h-4 w-4" />
          {t('settings.language')}
        </h2>
        <div className="flex gap-2">
          {[
            { code: 'ar', label: 'العربية' },
            { code: 'en', label: 'English' },
          ].map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => setLocale(option.code)}
              className={`btn flex-1 ${locale === option.code ? 'bg-brand-600 text-white' : 'btn-soft'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {/* المظهر */}
      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-extrabold">
          {theme === 'dark' ? <Icon.Moon className="h-4 w-4" /> : <Icon.Sun className="h-4 w-4" />}
          {t('settings.appearance')}
        </h2>
        <div className="flex gap-2">
          {[
            { code: 'light', label: t('settings.themeLight'), emoji: '☀️' },
            { code: 'dark', label: t('settings.themeDark'), emoji: '🌙' },
          ].map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => setTheme(option.code)}
              className={`btn flex-1 ${theme === option.code ? 'bg-brand-600 text-white' : 'btn-soft'}`}
            >
              {option.emoji} {option.label}
            </button>
          ))}
        </div>
      </section>

      {/* الإشعارات والتثبيت */}
      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-extrabold">
          <Icon.Bell className="h-4 w-4" />
          {t('alarms.notifications')}
        </h2>
        {permission === 'granted' ? (
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✅ {t('alarms.notificationsOn')}</p>
        ) : (
          <button type="button" className="btn-soft w-full" onClick={doEnableNotifications} disabled={!pushSupported()}>
            {t('alarms.enableNotifications')}
          </button>
        )}

        <div className="h-px bg-ink-200 dark:bg-ink-700" />

        <h2 className="flex items-center gap-2 text-sm font-extrabold">
          <Icon.Download className="h-4 w-4" />
          {t('settings.install')}
        </h2>
        <InstallGuide />
      </section>

      {/* عن التطبيق + منطقة الخطر */}
      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-extrabold">{t('settings.about')}</h2>
        <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-300">
          {t('app.name')} — {t('app.tagline')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/stats" className="btn-ghost">
            <Icon.Chart className="h-4 w-4" />
            {t('nav.stats')}
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <Icon.Logout className="h-4 w-4" />
            {t('nav.logout')}
          </button>
          <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
            <Icon.Trash className="h-4 w-4" />
            {t('settings.deleteAccount')}
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        message={t('settings.deleteConfirm')}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
