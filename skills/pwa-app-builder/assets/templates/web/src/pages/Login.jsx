/** شاشة البداية: تسجيل الدخول (بريد + كلمة مرور فقط) / إنشاء حساب / الدخول كزائر */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useSettings, useToast } from '../lib/providers';
import { normalizeEmail, normalizePassword } from '../lib/normalize';
import { Icon, Spinner } from '../components/ui';

const ERROR_KEYS = {
  EMAIL_TAKEN: 'err.emailTaken',
  BAD_CREDENTIALS: 'err.credentials',
  VALIDATION: null,
};

export default function Login() {
  const { t } = useSettings();
  const { login, register, guest, upgrade, isGuest } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // null = التبويب الافتراضي حسب نوع الجلسة
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // الافتراضي: ترقية الحساب للزائر، وتسجيل الدخول لغيره.
  const current = mode ?? (isGuest ? 'upgrade' : 'login');
  const isRegister = current === 'register';
  // الاسم مطلوب في التسجيل والترقية فقط — تسجيل الدخول بالبريد وكلمة المرور فقط.
  const needsName = current !== 'login';
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const cleanEmailField = () => setForm((prev) => ({ ...prev, email: normalizeEmail(prev.email) }));

  const tabs = isGuest
    ? [
        { key: 'login', label: t('auth.login') },
        { key: 'upgrade', label: t('auth.upgradeTab') },
      ]
    : [
        { key: 'login', label: t('auth.login') },
        { key: 'register', label: t('auth.register') },
      ];

  const title = current === 'upgrade' ? t('auth.upgradeTitle') : isRegister ? t('auth.createAccount') : t('auth.welcomeBack');
  const cta = current === 'upgrade' ? t('auth.upgradeCta') : isRegister ? t('auth.register') : t('auth.login');

  function localizedError(err) {
    if (ERROR_KEYS[err.code] === null) return err.message;
    return ERROR_KEYS[err.code] ? t(ERROR_KEYS[err.code]) : err.message || t('err.generic');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    // حماية من إنشاء حساب بكلمة مرور غير تلك التي يتذكّرها المستخدم
    if (current !== 'login' && normalizePassword(form.password) !== normalizePassword(form.confirm)) {
      setError(t('err.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      if (current === 'upgrade') {
        // الزائر: ترقية الحساب مع الحفاظ على بياناته
        await upgrade(form);
        toast(t('settings.saved'));
      } else if (isRegister) {
        await register(form);
        toast(t('auth.createAccount'));
      } else {
        await login({ email: form.email, password: form.password });
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(localizedError(err));
    } finally {
      setBusy(false);
    }
  }

  async function startGuest() {
    setBusy(true);
    setError('');
    try {
      if (isGuest) {
        navigate('/', { replace: true });
        return;
      }
      await guest();
      navigate('/', { replace: true });
    } catch (err) {
      setError(localizedError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-bg flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-pop">
            <span className="text-4xl">🍽️</span>
          </div>
          <h1 className="text-2xl font-extrabold">{t('app.name')}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">{t('app.tagline')}</p>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-2 border-b border-ink-200 dark:border-ink-700">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setMode(tab.key);
                  setForm((prev) => ({ ...prev, password: '', confirm: '' }));
                  setError('');
                }}
                className={`py-3 text-sm font-extrabold transition ${
                  current === tab.key
                    ? 'border-b-2 border-brand-500 text-brand-600 dark:text-brand-300'
                    : 'text-ink-500 dark:text-ink-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4 p-5">
            <h2 className="text-base font-extrabold">{title}</h2>

            {current === 'upgrade' && (
              <p className="rounded-xl bg-brand-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-brand-700 dark:bg-ink-700/60 dark:text-brand-200">
                {t('auth.guestBanner')}
              </p>
            )}

            {isGuest && current === 'login' && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                {t('auth.guestLoginHint')}
              </p>
            )}

            {needsName && (
              <div>
                <label className="label" htmlFor="name">
                  {t('auth.name')}
                </label>
                <input id="name" className="input" value={form.name} onChange={set('name')} autoComplete="name" />
              </div>
            )}

            <div>
              <label className="label" htmlFor="email">
                {t('auth.email')}
              </label>
              <input
                id="email"
                type="email"
                required
                className="input"
                value={form.email}
                onChange={set('email')}
                onBlur={cleanEmailField}
                autoComplete={current === 'login' ? 'username' : 'email'}
                dir="ltr"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  className="input pr-12"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete={current === 'login' ? 'current-password' : 'new-password'}
                  dir="ltr"
                  placeholder="••••••"
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

            {needsName && (
              <div>
                <label className="label" htmlFor="confirm">
                  {t('auth.confirmPassword')}
                </label>
                <input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  className="input"
                  value={form.confirm}
                  onChange={set('confirm')}
                  autoComplete="new-password"
                  dir="ltr"
                  placeholder="••••••"
                />
              </div>
            )}

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-200">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full !py-3" disabled={busy}>
              {busy ? <Spinner /> : <Icon.Check className="h-4 w-4" />}
              {cta}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
              <span className="text-[11px] font-bold text-ink-400">{t('common.optional')}</span>
              <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
            </div>

            <button type="button" className="btn-soft w-full !py-3" onClick={startGuest} disabled={busy}>
              <span>👤</span>
              {isGuest ? t('auth.alreadyGuest') : t('auth.continueAsGuest')}
            </button>
            {!isGuest && <p className="text-center text-[11px] leading-relaxed text-ink-400">{t('auth.guestNotice')}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
