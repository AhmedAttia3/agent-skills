/** الهيكل العام: شريط علوي + قائمة جانبية (Drawer) + شريط تنقل سفلي للجوال. */
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './ui';
import { useAuth, useSettings, useToast } from '../lib/providers';
import { installState, promptInstall } from '../lib/pwa';

const NAV_ITEMS = [
  { to: '/', key: 'nav.home', icon: Icon.Home, end: true },
  { to: '/meals', key: 'nav.meals', icon: Icon.List },
  { to: '/meals/new', key: 'nav.addMeal', icon: Icon.Plus },
  { to: '/alarms', key: 'nav.alarms', icon: Icon.Bell },
  { to: '/stats', key: 'nav.stats', icon: Icon.Chart },
  { to: '/settings', key: 'nav.settings', icon: Icon.Cog },
];

const MOBILE_ITEMS = NAV_ITEMS.filter((item) => ['/', '/meals', '/meals/new', '/alarms'].includes(item.to));

function LangThemeButtons() {
  const { theme, toggleTheme, locale, setLocale, t } = useSettings();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
        className="btn-ghost !px-2 !py-2"
        title={t('settings.language')}
      >
        <Icon.Globe className="h-5 w-5" />
        <span className="text-xs font-extrabold uppercase">{locale === 'ar' ? 'EN' : 'ع'}</span>
      </button>
      <button type="button" onClick={toggleTheme} className="btn-ghost !px-2 !py-2" title={t('settings.appearance')}>
        {theme === 'dark' ? <Icon.Sun className="h-5 w-5" /> : <Icon.Moon className="h-5 w-5" />}
      </button>
    </div>
  );
}

export default function AppShell({ children }) {
  const { t } = useSettings();
  const { user, logout, isGuest } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pwaState, setPwaState] = useState(installState());

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    const handler = () => setPwaState(installState());
    window.addEventListener('ew:installable', handler);
    return () => window.removeEventListener('ew:installable', handler);
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  /** زر التثبيت: تثبيت مباشر إن كان مدعوماً، وإلا ننتقل لشاشة الإعدادات لشرح خطوات iOS/سطح المكتب. */
  async function handleInstall() {
    if (pwaState === 'prompt') {
      const accepted = await promptInstall();
      if (accepted) toast(t('settings.installed'));
      setPwaState(installState());
      return;
    }
    navigate('/settings');
  }

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
      isActive
        ? 'bg-brand-500 text-white shadow'
        : 'text-ink-700 hover:bg-ink-100 dark:text-ink-100 dark:hover:bg-ink-700/60'
    }`;

  return (
    <div className="app-bg flex min-h-full flex-col">
      {/* الشريط العلوي */}
      <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/85 backdrop-blur dark:border-ink-700/70 dark:bg-ink-900/80">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5">
          <button type="button" className="btn-ghost !px-2 !py-2 lg:hidden" onClick={() => setDrawerOpen(true)} aria-label={t('nav.menu')}>
            <Icon.Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded-xl" />
            <span className="truncate text-base font-extrabold">{t('app.name')}</span>
          </Link>
          <div className="ms-auto flex items-center gap-1">
            {pwaState !== 'installed' && (
              <button type="button" className="btn-soft !px-2.5 !py-2" onClick={handleInstall} title={t('settings.install')}>
                <Icon.Download className="h-4 w-4" />
                <span className="hidden sm:inline">{t('settings.installNow')}</span>
              </button>
            )}
            <LangThemeButtons />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 gap-6 px-3 pb-24 pt-4 lg:pb-8">
        {/* القائمة الجانبية الثابتة على الشاشات الكبيرة */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <nav className="card sticky top-20 flex flex-col gap-1 p-3">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                <item.icon className="h-5 w-5" />
                {t(item.key)}
              </NavLink>
            ))}
            <div className="my-2 h-px bg-ink-200 dark:bg-ink-700" />
            {isGuest ? (
              <Link
                to="/login"
                className="mx-1 mb-1 flex items-start gap-2 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 p-3 text-white shadow transition hover:brightness-105"
              >
                <Icon.Login className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold">{t('auth.signInOrRegister')}</span>
                  <span className="block text-[11px] leading-snug opacity-90">{t('auth.guestBadgeHint')}</span>
                </span>
              </Link>
            ) : (
              <div className="px-3 pb-1 text-xs font-bold text-ink-500 dark:text-ink-300">{user?.name}</div>
            )}
            <button type="button" onClick={handleLogout} className={navLinkClass({ isActive: false })}>
              <Icon.Logout className="h-5 w-5" />
              {t('nav.logout')}
            </button>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* القائمة الجانبية المنبثقة للجوال */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <nav
            className="absolute inset-y-0 start-0 flex w-72 animate-slide-in flex-col gap-1 bg-white p-4 shadow-pop dark:bg-ink-800"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <img src="/icons/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
              <div>
                <div className="text-sm font-extrabold">{t('app.name')}</div>
                <div className="text-[11px] text-ink-500 dark:text-ink-300">{user?.name || t('auth.guest')}</div>
              </div>
            </div>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                <item.icon className="h-5 w-5" />
                {t(item.key)}
              </NavLink>
            ))}
            <div className="my-2 h-px bg-ink-200 dark:bg-ink-700" />
            {isGuest ? (
              <Link
                to="/login"
                className="mx-1 mb-1 flex items-start gap-2 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 p-3 text-white shadow"
              >
                <Icon.Login className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold">{t('auth.signInOrRegister')}</span>
                  <span className="block text-[11px] leading-snug opacity-90">{t('auth.guestBadgeHint')}</span>
                </span>
              </Link>
            ) : (
              <div className="px-3 pb-1 text-xs font-bold text-ink-500 dark:text-ink-300">{user?.name}</div>
            )}
            <button type="button" onClick={handleLogout} className={navLinkClass({ isActive: false })}>
              <Icon.Logout className="h-5 w-5" />
              {t('nav.logout')}
            </button>
          </nav>
        </div>
      )}

      {/* شريط التنقل السفلي للجوال */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200/70 bg-white/95 pb-[var(--safe-bottom)] backdrop-blur dark:border-ink-700/70 dark:bg-ink-900/90 lg:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 py-2">
          {MOBILE_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `no-tap-highlight flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold transition ${
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-ink-500 dark:text-ink-300'
                }`
              }
            >
              <item.icon className="h-6 w-6" />
              {t(item.key)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
