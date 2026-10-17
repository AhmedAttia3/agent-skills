/** المسارات + حماية الصفحات + مراقبة التنبيهات أثناء فتح التطبيق */
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import Home from './pages/Home';
import MealsList from './pages/MealsList';
import MealForm from './pages/MealForm';
import MealDetails from './pages/MealDetails';
import Alarms from './pages/Alarms';
import Stats from './pages/Stats';
import Settings from './pages/Settings';
import PublicMeal from './pages/PublicMeal';
import CatalogMeal from './pages/CatalogMeal';
import { useAuth, useSettings, useToast } from './lib/providers';
import { Spinner } from './components/ui';
import { api } from './lib/api';
import { notificationPermission, pushSupported, showLocalNotification, ensurePushSubscription } from './lib/pwa';

/**
 * مراقب التنبيهات داخل التطبيق: يعمل كخطة بديلة عندما لا يكون Web Push مفعّلاً
 * (أو على أجهزة لا تدعمه) — يفحص كل 60 ثانية ويعرض إشعاراً محلياً عند الاستحقاق.
 */
function useAlarmWatcher() {
  const { user } = useAuth();
  const { t } = useSettings();
  useEffect(() => {
    if (!user) return undefined;
    let fired = JSON.parse(localStorage.getItem('{{PREFIX}}_fired_alarms') || '{}');

    const check = async () => {
      if (notificationPermission() !== 'granted') return;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const key = `${now.toDateString()} ${time}`;
      try {
        const { alarms } = await api.listAlarms();
        for (const alarm of alarms) {
          if (!alarm.enabled || alarm.time !== time) continue;
          if (alarm.days.length && !alarm.days.includes(now.getDay())) continue;
          const id = `${alarm.id}-${key}`;
          if (fired[id]) continue;
          fired[id] = true;
          showLocalNotification(alarm.title || t('app.name'), alarm.mealName || t('alarms.title'), alarm.mealId ? `/meals/${alarm.mealId}` : '/alarms');
        }
        localStorage.setItem('{{PREFIX}}_fired_alarms', JSON.stringify(fired));
      } catch {
        /* تجاهل أخطاء الشبكة */
      }
    };

    check();
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, [user, t]);
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-full place-items-center">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const { user, loading, isGuest } = useAuth();
  const { toast } = useToast();
  const { t } = useSettings();
  useAlarmWatcher();

  // إصلاح ذاتي لاشتراك الإشعارات: إن تغيّر مفتاح VAPID في السيرفر (أو انتهى الاشتراك)
  // يُعاد تسجيل هذا الجهاز تلقائياً بدل بقائه على اشتراك لا تعمل معه الإشعارات.
  useEffect(() => {
    if (!user) return;
    ensurePushSubscription(api.vapidKey, api.subscribePush).catch(() => undefined);
  }, [user]);

  // إشعار المستخدم عند انقطاع الاتصال
  useEffect(() => {
    const offline = () => toast(t('err.offline'), 'info');
    window.addEventListener('offline', offline);
    return () => window.removeEventListener('offline', offline);
  }, [toast, t]);

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/s/:token" element={<PublicMeal />} />
      <Route path="/login" element={user && !isGuest ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Home />
          </Protected>
        }
      />
      <Route
        path="/meals"
        element={
          <Protected>
            <MealsList />
          </Protected>
        }
      />
      <Route
        path="/catalog/:slug"
        element={
          <Protected>
            <CatalogMeal />
          </Protected>
        }
      />
      <Route
        path="/meals/new"
        element={
          <Protected>
            <MealForm />
          </Protected>
        }
      />
      <Route
        path="/meals/:id"
        element={
          <Protected>
            <MealDetails />
          </Protected>
        }
      />
      <Route
        path="/meals/:id/edit"
        element={
          <Protected>
            <MealForm />
          </Protected>
        }
      />
      <Route
        path="/alarms"
        element={
          <Protected>
            <Alarms />
          </Protected>
        }
      />
      <Route
        path="/stats"
        element={
          <Protected>
            <Stats />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <Settings />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
