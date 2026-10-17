/** صفحة طبق من الكتالوج — نفس تصميم صفحة وجبتي مع إضافة المشاركة وزر الإضافة إلى قائمتي */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, useSettings, useToast } from '../lib/providers';
import { Icon, Spinner } from '../components/ui';
import MealContent from '../components/MealContent';
import ShareSheet from '../components/ShareSheet';

export default function CatalogMeal() {
  const { slug } = useParams();
  const { t } = useSettings();
  const { toast } = useToast();
  const { user, guest, refresh } = useAuth();
  const navigate = useNavigate();

  const [meal, setMeal] = useState(null);
  const [tagMeta, setTagMeta] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState(null); // { id, duplicate, canUpdate }
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .catalogMeal(slug)
      .then(({ meal: data }) => setMeal(data))
      .catch((err) => setError(err.code === 'NOT_FOUND' ? t('explore.empty') : err.message || t('err.generic')))
      .finally(() => setLoading(false));
    api
      .catalogTags()
      .then(({ tags }) => setTagMeta(new Map(tags.map((tag) => [tag.slug, tag]))))
      .catch(() => setTagMeta(new Map()));
  }, [slug, t]);

  /** إضافة الطبق إلى قائمتي (أو تحديث نسختي الناقصة بنفس الاسم عند وجودها). */
  async function addToMyList(updateId) {
    setAdding(true);
    try {
      if (!user) {
        await guest();
        await refresh();
      }
      const data = await api.addCatalogMeal(slug, updateId ? { updateId } : {});
      if (data.duplicate) {
        setResult({ id: data.meal.id, duplicate: true, canUpdate: data.canUpdate });
        toast(t('public.alreadyHave'));
      } else {
        setResult({ id: data.meal.id, duplicate: false, updated: Boolean(data.updated) });
        toast(t('explore.added', { name: meal.name }));
      }
    } catch (err) {
      toast(err.message || t('public.addError'), 'error');
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="card space-y-3 p-5">
        <div className="skeleton h-40 w-full" />
        <div className="skeleton h-5 w-1/3" />
        <div className="skeleton h-16 w-full" />
      </div>
    );
  }

  if (error || !meal) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <div className="text-4xl">🍽️</div>
        <p className="text-sm font-bold">{error || t('common.error')}</p>
        <Link to="/meals?tab=explore" className="btn-primary mx-auto">
          {t('explore.backToCatalog')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost !p-2" onClick={() => navigate('/meals?tab=explore')}>
          <Icon.Back className="h-5 w-5" />
        </button>
        <h1 className="truncate text-lg font-extrabold">{meal.name}</h1>
        <div className="ms-auto flex gap-1">
          <button type="button" className="btn-ghost !p-2" onClick={() => setShareOpen(true)} title={t('meal.share')}>
            <Icon.Share className="h-5 w-5" />
          </button>
        </div>
      </div>

      <MealContent meal={meal} categories={meal.mealTimes} tagMeta={tagMeta}>
        {result ? (
          <div className="space-y-3">
            <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
              {result.duplicate && !result.updated
                ? t('public.alreadyHave')
                : result.updated
                  ? t('explore.updated')
                  : t('public.added')}
            </p>

            {result.duplicate && result.canUpdate ? (
              <>
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                  {t('explore.canUpdateHint')}
                </p>
                <button
                  type="button"
                  className="btn-primary w-full !py-3"
                  onClick={() => addToMyList(result.id)}
                  disabled={adding}
                >
                  {adding ? <Spinner /> : <Icon.Edit className="h-5 w-5" />}
                  {t('explore.updateMine')}
                </button>
              </>
            ) : null}

            <Link to={`/meals/${result.id}`} className="btn-soft w-full !py-3">
              <Icon.List className="h-5 w-5" />
              {t('public.viewMeal')}
            </Link>
          </div>
        ) : (
          <button type="button" className="btn-primary w-full !py-3" onClick={() => addToMyList()} disabled={adding}>
            {adding ? <Spinner /> : <Icon.Plus className="h-5 w-5" />}
            {adding ? t('public.adding') : t('explore.add')}
          </button>
        )}
      </MealContent>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={`${window.location.origin}/catalog/${meal.slug}`}
        title={meal.name}
        meal={meal}
      />
    </div>
  );
}
