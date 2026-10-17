/**
 * إرشاد التثبيت: يشرح الطريقة المناسبة حسب الجهاز.
 * - Chrome/Edge/Android: زر تثبيت مباشر (beforeinstallprompt).
 * - iPhone/iPad (Safari): خطوات "إضافة إلى الشاشة الرئيسية" لأن iOS لا يدعم الزر التلقائي.
 * - غير ذلك: إرشاد عام من قائمة المتصفح.
 */
import { useEffect, useState } from 'react';
import { Icon, Spinner } from './ui';
import { useSettings, useToast } from '../lib/providers';
import { canInstall, installState, promptInstall } from '../lib/pwa';

export default function InstallGuide({ compact = false }) {
  const { t } = useSettings();
  const { toast } = useToast();
  const [state, setState] = useState(installState());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handler = () => setState(installState());
    window.addEventListener('ew:installable', handler);
    return () => window.removeEventListener('ew:installable', handler);
  }, []);

  async function install() {
    setBusy(true);
    try {
      const accepted = await promptInstall();
      if (accepted) toast(t('settings.installed'));
      setState(installState());
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast(t('share.copied'));
    } catch {
      window.prompt(t('install.copyLink'), window.location.origin);
    }
  }

  if (state === 'installed') {
    return (
      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✅ {t('settings.installed')}</p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500 dark:text-ink-300">{t('settings.installHint')}</p>

      {state === 'prompt' && (
        <button type="button" className="btn-primary w-full" onClick={install} disabled={busy}>
          {busy ? <Spinner /> : <Icon.Download className="h-4 w-4" />}
          {t('settings.installNow')}
        </button>
      )}

      {state === 'ios' && (
        <ol className="space-y-2 rounded-2xl bg-brand-50 p-3 text-xs leading-relaxed dark:bg-ink-700/50">
          <li className="font-extrabold text-brand-700 dark:text-brand-200">{t('install.iosTitle')}</li>
          {['install.iosStep1', 'install.iosStep2', 'install.iosStep3', 'install.iosStep4'].map((key) => (
            <li key={key} className="flex gap-2">
              <span className="text-brand-500">•</span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
      )}

      {state === 'manual' && (
        <p className="rounded-2xl bg-brand-50 p-3 text-xs leading-relaxed dark:bg-ink-700/50">
          {navigator.userAgent.includes('Mac') ? t('install.safariMacStep') : t('install.androidStep')}
          <br />
          {t('install.desktopStep')}
        </p>
      )}

      {!compact && <p className="text-[11px] text-ink-400">{t('install.why')}</p>}

      {state !== 'prompt' && (
        <button type="button" className="btn-ghost w-full" onClick={copyLink}>
          <Icon.Share className="h-4 w-4" />
          {t('install.copyLink')}
        </button>
      )}
    </div>
  );
}

export { canInstall };
