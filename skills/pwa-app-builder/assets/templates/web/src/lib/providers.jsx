/**
 * سياقات التطبيق: الحساب، الإعدادات (اللغة/المظهر)، والتنبيهات السريعة (Toast).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { LOCALES, makeT } from './i18n';
import { syncStatusBarColor } from './pwa';

/* ------------------------------- الإعدادات -------------------------------- */
const SettingsContext = createContext(null);

function readInitialTheme() {
  const stored = localStorage.getItem('{{PREFIX}}_theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readInitialLocale() {
  const stored = localStorage.getItem('{{PREFIX}}_locale');
  if (stored && LOCALES[stored]) return stored;
  return 'ar'; // العربية هي الافتراضية
}

export function SettingsProvider({ children }) {
  const [theme, setTheme] = useState(readInitialTheme);
  const [locale, setLocale] = useState(readInitialLocale);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme !== 'dark');
    localStorage.setItem('{{PREFIX}}_theme', theme);
    syncStatusBarColor(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALES[locale].dir;
    localStorage.setItem('{{PREFIX}}_locale', locale);
  }, [locale]);

  const value = useMemo(
    () => ({
      theme,
      locale,
      dir: LOCALES[locale].dir,
      t: makeT(locale),
      toggleTheme: () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
      setTheme,
      setLocale,
    }),
    [theme, locale]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

/* -------------------------------- الحساب ---------------------------------- */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // مزامنة اللغة/المظهر مع الحساب بعد الدخول
  const { locale, theme } = useSettings();
  useEffect(() => {
    if (!user) return;
    const patch = {};
    if (user.locale !== locale) patch.locale = locale;
    if (user.theme !== theme) patch.theme = theme;
    if (Object.keys(patch).length) api.updateProfile(patch).catch(() => undefined);
  }, [user, locale, theme]);

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh,
      isGuest: user?.kind === 'guest',
      async login(payload) {
        const data = await api.login(payload);
        setUser(data.user);
        return data.user;
      },
      async register(payload) {
        const data = await api.register(payload);
        setUser(data.user);
        return data.user;
      },
      async guest() {
        const data = await api.guest();
        setUser(data.user);
        return data.user;
      },
      async upgrade(payload) {
        const data = await api.upgrade(payload);
        setUser(data.user);
        return data.user;
      },
      async logout() {
        await api.logout().catch(() => undefined);
        setUser(null);
      },
      setUser,
    }),
    [user, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/* --------------------------------- Toast --------------------------------- */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-8">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto animate-fade-up rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-pop ${
              item.type === 'error' ? 'bg-red-600' : item.type === 'info' ? 'bg-ink-800' : 'bg-emerald-600'
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** يجمع كل المزوّدات معاً. */
export function AppProviders({ children }) {
  return (
    <SettingsProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
