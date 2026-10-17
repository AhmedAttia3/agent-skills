/** شاشة التنبيهات: قائمة التذكيرات + إضافة/تعديل/حذف + تفعيل الإشعارات */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSettings, useToast } from '../lib/providers';
import { ConfirmDialog, EmptyState, Icon, Modal, Spinner } from '../components/ui';
import { enablePush, ensurePushSubscription, notificationPermission, pushSupported } from '../lib/pwa';

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6];

const emptyForm = { id: null, title: '', time: '08:00', days: [], mealId: '' };

export default function Alarms() {
  const { t, locale } = useSettings();
  const { toast } = useToast();
  const [alarms, setAlarms] = useState([]);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [permission, setPermission] = useState(notificationPermission());
  const [notifyBusy, setNotifyBusy] = useState(false);

  const tzOffset = useMemo(() => -new Date().getTimezoneOffset(), []);

  useEffect(() => {
    Promise.all([api.listAlarms(), api.listMeals()])
      .then(([alarmData, mealData]) => {
        setAlarms(alarmData.alarms);
        setMeals(mealData.meals);
      })
      .catch((err) => toast(err.message || t('err.generic'), 'error'))
      .finally(() => setLoading(false));
  }, [toast, t]);

  function openCreate() {
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(alarm) {
    setForm({
      id: alarm.id,
      title: alarm.title,
      time: alarm.time,
      days: alarm.days,
      mealId: alarm.mealId ? String(alarm.mealId) : '',
    });
    setFormOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title,
      time: form.time,
      days: form.days,
      mealId: form.mealId ? Number(form.mealId) : null,
      tzOffset,
    };
    try {
      if (form.id) {
        const { alarm } = await api.updateAlarm(form.id, payload);
        setAlarms((prev) => prev.map((item) => (item.id === alarm.id ? alarm : item)));
      } else {
        const { alarm } = await api.createAlarm(payload);
        setAlarms((prev) => [...prev, alarm].sort((a, b) => a.time.localeCompare(b.time)));
      }
      toast(t('alarms.saved'));
      setFormOpen(false);
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(alarm) {
    try {
      const { alarm: updated } = await api.updateAlarm(alarm.id, { enabled: !alarm.enabled });
      setAlarms((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    try {
      await api.deleteAlarm(pendingDelete.id);
      setAlarms((prev) => prev.filter((item) => item.id !== pendingDelete.id));
      toast(t('alarms.deleted'));
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    } finally {
      setPendingDelete(null);
    }
  }

  async function askNotifications() {
    setNotifyBusy(true);
    try {
      const status = await enablePush(api.vapidKey, api.subscribePush);
      setPermission(notificationPermission());
      if (status === 'granted') toast(t('alarms.notificationsOn'));
      else if (status === 'denied') toast(t('alarms.notificationsBlocked'), 'error');
      else toast(t('alarms.iosHint'), 'info');
    } catch {
      toast(t('err.generic'), 'error');
    } finally {
      setNotifyBusy(false);
    }
  }

  async function sendTest() {
    try {
      await ensurePushSubscription(api.vapidKey, api.subscribePush); // إصلاح الاشتراك قبل الاختبار
      const data = await api.testPush();
      if (data.sent > 0) toast(t('alarms.testSent'), 'success');
      else if (!data.subscriptions) toast(t('alarms.enableNotifications'), 'info');
      else toast(`${t('alarms.testFailed')} (${data.failed?.[0]?.reason || data.failed?.[0]?.status || '—'})`, 'error');
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    }
  }

  const formatDays = (days) => (days.length ? days.map((day) => t(`day.${day}`)).join('، ') : t('alarms.everyDay'));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">{t('alarms.title')}</h1>
          <p className="text-xs text-ink-500 dark:text-ink-300">{t('alarms.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Icon.Plus className="h-4 w-4" />
          {t('alarms.add')}
        </button>
      </div>

      <section className="card space-y-2 p-4">
        <h2 className="text-sm font-extrabold">{t('alarms.notifications')}</h2>
        {permission === 'granted' ? (
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✅ {t('alarms.notificationsOn')}</p>
        ) : permission === 'denied' ? (
          <p className="text-xs font-bold text-red-600 dark:text-red-400">🚫 {t('alarms.notificationsBlocked')}</p>
        ) : (
          <p className="text-xs text-ink-500 dark:text-ink-300">{t('alarms.enableNotifications')}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {permission !== 'granted' && pushSupported() && (
            <button type="button" className="btn-soft" onClick={askNotifications} disabled={notifyBusy}>
              {notifyBusy ? <Spinner /> : <Icon.Bell className="h-4 w-4" />}
              {t('alarms.enableNotifications')}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={sendTest}>
            {t('alarms.testNotification')}
          </button>
        </div>
        <p className="text-[11px] text-ink-400">{t('alarms.iosHint')}</p>
      </section>

      {loading && (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="card space-y-2 p-4">
              <div className="skeleton h-5 w-1/3" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!loading && !alarms.length && (
        <EmptyState
          emoji="⏰"
          title={t('alarms.empty')}
          description={t('alarms.emptyDesc')}
          action={
            <button type="button" className="btn-primary" onClick={openCreate}>
              <Icon.Plus className="h-4 w-4" />
              {t('alarms.add')}
            </button>
          }
        />
      )}

      <div className="space-y-3">
        {alarms.map((alarm) => (
          <div key={alarm.id} className="card flex items-center gap-3 p-4">
            <div
              className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-extrabold ${
                alarm.enabled ? 'bg-brand-500 text-white' : 'bg-ink-200 text-ink-500 dark:bg-ink-700 dark:text-ink-300'
              }`}
            >
              {alarm.time}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold">
                {alarm.title || alarm.mealName || t('alarms.title')}
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-ink-500 dark:text-ink-300">
                {formatDays(alarm.days)}
                {alarm.mealName ? ` • ${alarm.mealName}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-ink-400">
                {alarm.enabled ? t('alarms.enabled') : t('alarms.disabled')}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => toggle(alarm)}
                className={`btn !px-3 !py-2 text-xs ${alarm.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200' : 'btn-soft'}`}
              >
                {alarm.enabled ? t('common.on') : t('common.off')}
              </button>
              <button type="button" className="btn-ghost !p-2" onClick={() => openEdit(alarm)}>
                <Icon.Edit className="h-4 w-4" />
              </button>
              <button type="button" className="btn-ghost !p-2 text-red-600" onClick={() => setPendingDelete(alarm)}>
                <Icon.Trash className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={formOpen}
        title={form.id ? t('alarms.edit') : t('alarms.add')}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setFormOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="submit" form="alarm-form" className="btn-primary" disabled={saving}>
              {saving ? <Spinner /> : <Icon.Check className="h-4 w-4" />}
              {t('common.save')}
            </button>
          </>
        }
      >
        <form id="alarm-form" onSubmit={save} className="space-y-4">
          <div>
            <label className="label" htmlFor="alarm-time">
              {t('alarms.time')}
            </label>
            <input
              id="alarm-time"
              type="time"
              className="input"
              value={form.time}
              onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
              required
            />
          </div>

          <div>
            <span className="label">{t('alarms.days')}</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, days: [] }))}
                className={`chip border ${!form.days.length ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-200 dark:border-ink-700'}`}
              >
                {t('alarms.everyDay')}
              </button>
              {DAY_KEYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day].sort(),
                    }))
                  }
                  className={`chip border ${
                    form.days.includes(day) ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-200 dark:border-ink-700'
                  }`}
                >
                  {t(`day.${day}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="alarm-title">
              {t('alarms.titleField')}
            </label>
            <input
              id="alarm-title"
              className="input"
              placeholder={t('alarms.titlePlaceholder')}
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="alarm-meal">
              {t('alarms.mealOptional')}
            </label>
            <select
              id="alarm-meal"
              className="input"
              value={form.mealId}
              onChange={(e) => setForm((prev) => ({ ...prev, mealId: e.target.value }))}
            >
              <option value="">{t('alarms.none')}</option>
              {meals.map((meal) => (
                <option key={meal.id} value={meal.id}>
                  {meal.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-ink-400">
            {locale === 'ar' ? `التوقيت المحلي (UTC${tzOffset >= 0 ? '+' : ''}${tzOffset / 60})` : `Local time (UTC${tzOffset >= 0 ? '+' : ''}${tzOffset / 60})`}
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        message={t('meals.confirmDelete', { name: pendingDelete?.title || pendingDelete?.time || '' })}
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
