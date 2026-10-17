/** صفحة عامة (بدون تسجيل) لعرض وجبة تمت مشاركتها عبر رابط /s/:token — مع إمكانية إضافتها لقائمة المستخدم */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, CATEGORY_META, mealCategories } from '../lib/api';
import { useAuth, useSettings, useToast } from '../lib/providers';
import { CategoryChips, Icon, Spinner, StarRating } from '../components/ui';

export default function PublicMeal() {
  const { token } = useParams();
  const { t } = useSettings();
  const { user, guest, refresh } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [meal, setMeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(null); // { id, duplicate }

  useEffect(() => {
    api
      .publicMeal(token)
      .then(({ meal: data }) => setMeal(data))
      .catch(() => setError(t('public.invalid')))
      .finally(() => setLoading(false));
  }, [token, t]);

  /**
   * إضافة الوجبة المشاركة إلى قائمة المستخدم.
   * إن لم يكن هناك حساب، يُنشأ حساب زائر تلقائياً ثم تُضاف الوجبة.
   */
  async function addToMyList() {
    setImporting(true);
    setError('');
    try {
      if (!user) {
        await guest();
        await refresh();
      }
      const data = await api.importSharedMeal(token);
      setImported({ id: data.meal.id, duplicate: data.duplicate });
      toast(data.duplicate ? t('public.alreadyHave') : t('public.added'));
    } catch (err) {
      toast(err.message || t('public.addError'), 'error');
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="app-bg grid min-h-full place-items-center p-6">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  if (error || !meal) {
    return (
      <div className="app-bg grid min-h-full place-items-center p-6">
        <div className="card max-w-md p-6 text-center">
          <div className="text-4xl">🔗</div>
          <p className="mt-2 text-sm font-bold text-ink-600 dark:text-ink-200">{error || t('common.error')}</p>
          <Link to="/" className="btn-primary mt-4">
            {t('public.openApp')}
          </Link>
        </div>
      </div>
    );
  }

  const categories = mealCategories(meal);
  const meta = CATEGORY_META[categories[0]] || { emoji: '🍽️', key: 'cat.all' };

  return (
    <div className="app-bg min-h-full px-4 py-8">
      <div className="mx-auto max-w-lg space-y-4">
        <header className="flex items-center gap-2">
          <img src="/icons/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
          <span className="text-base font-extrabold">{t('app.name')}</span>
        </header>

        <article className="card overflow-hidden">
          {meal.imageUrl ? (
            <img src={meal.imageUrl} alt={meal.name} className="h-56 w-full object-cover" />
          ) : (
            <div className="grid h-40 place-items-center bg-gradient-to-br from-brand-100 to-brand-200 dark:from-ink-700 dark:to-ink-800">
              <span className="text-6xl">{meta.emoji}</span>
            </div>
          )}
          <div className="space-y-3 p-5">
            <CategoryChips categories={categories} />
            <h1 className="text-xl font-extrabold">{meal.name}</h1>
            <StarRating value={Math.round(meal.avgStars || 0)} count={meal.starsCount} readOnly />
            {meal.recipe && (
              <p className="whitespace-pre-line rounded-2xl bg-ink-100/70 p-4 text-sm leading-relaxed dark:bg-ink-700/50">
                {meal.recipe}
              </p>
            )}
            <p className="text-[11px] font-bold text-ink-400">{t('public.sharedBy', { name: meal.ownerName })}</p>
          </div>
        </article>

        <section className="card space-y-3 p-5">
          {imported ? (
            <>
              <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                {imported.duplicate ? t('public.alreadyHave') : t('public.added')}
              </p>
              <Link to={`/meals/${imported.id}`} className="btn-primary w-full !py-3">
                <Icon.List className="h-5 w-5" />
                {t('public.viewMeal')}
              </Link>
              <Link to="/" className="btn-soft w-full !py-3">
                <Icon.Dice className="h-5 w-5" />
                {t('public.openApp')}
              </Link>
            </>
          ) : (
            <>
              <button type="button" className="btn-primary w-full !py-3" onClick={addToMyList} disabled={importing}>
                {importing ? <Spinner /> : <Icon.Plus className="h-5 w-5" />}
                {importing ? t('public.adding') : t('public.addToMyList')}
              </button>
              {!user && <p className="text-center text-[11px] text-ink-400">{t('public.guestNote')}</p>}
              <div className="text-center">
                <p className="mb-2 text-sm font-bold text-ink-500 dark:text-ink-300">{t('public.cta')}</p>
                <button type="button" className="btn-ghost" onClick={() => navigate('/login')}>
                  {t('public.loginToAdd')}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
