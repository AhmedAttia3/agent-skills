/** شاشة تفاصيل وجبتي: عرض موحّد + التقييم والإعجاب + المشاركة + تعديل/حذف */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, mealCategories } from '../lib/api';
import { useSettings, useToast } from '../lib/providers';
import { ConfirmDialog, Icon, StarRating } from '../components/ui';
import MealContent from '../components/MealContent';
import ShareSheet from '../components/ShareSheet';

export default function MealDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useSettings();
  const { toast } = useToast();
  const [meal, setMeal] = useState(null);
  const [tagMeta, setTagMeta] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    api
      .getMeal(id)
      .then(({ meal: data }) => setMeal(data))
      .catch((err) => setError(err.message || t('err.generic')))
      .finally(() => setLoading(false));
    api
      .catalogTags()
      .then(({ tags }) => setTagMeta(new Map(tags.map((tag) => [tag.slug, tag]))))
      .catch(() => setTagMeta(new Map()));
  }, [id, t]);

  async function rate(payload) {
    try {
      const { meal: updated } = await api.rateMeal(id, payload);
      setMeal(updated);
      toast(t('meal.rateThanks'), 'info');
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    }
  }

  async function remove() {
    try {
      await api.deleteMeal(id);
      toast(t('meals.deleted'));
      navigate('/meals', { replace: true });
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
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
      <div className="card p-6 text-center">
        <p className="mb-3 text-sm font-bold text-red-600">{error || t('common.error')}</p>
        <Link to="/meals" className="btn-soft">
          {t('nav.meals')}
        </Link>
      </div>
    );
  }

  const categories = mealCategories(meal);
  const liked = meal.myRating?.liked;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost !p-2" onClick={() => navigate(-1)}>
          <Icon.Back className="h-5 w-5" />
        </button>
        <h1 className="truncate text-lg font-extrabold">{meal.name}</h1>
        <div className="ms-auto flex gap-1">
          <Link to={`/meals/${meal.id}/edit`} className="btn-ghost !p-2" title={t('meal.edit')}>
            <Icon.Edit className="h-5 w-5" />
          </Link>
          <button type="button" className="btn-ghost !p-2 text-red-600" onClick={() => setConfirmOpen(true)} title={t('meal.delete')}>
            <Icon.Trash className="h-5 w-5" />
          </button>
        </div>
      </div>

      <MealContent
        meal={meal}
        categories={categories}
        tagMeta={tagMeta}
        chipsExtra={
          <span className="chip bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-200">
            {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium' }).format(
              new Date(`${meal.createdAt.replace(' ', 'T')}Z`)
            )}
          </span>
        }
      >
        <div className="h-px bg-ink-200 dark:bg-ink-700" />

        <div>
          <h2 className="label">{t('meal.rating')}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <StarRating value={meal.myRating?.stars || 0} onChange={(stars) => rate({ stars })} />
            {meal.avgStars ? (
              <span className="text-xs font-bold text-ink-500 dark:text-ink-300">
                {t('meal.rating')}: {meal.avgStars} ★ ({meal.starsCount})
              </span>
            ) : (
              <span className="text-xs text-ink-400">{t('meal.noRating')}</span>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => rate({ liked: liked === 1 ? 0 : 1 })}
              className={`btn ${liked === 1 ? 'bg-emerald-600 text-white' : 'btn-soft'}`}
            >
              <Icon.Heart filled={liked === 1} className="h-4 w-4" />
              {t('meal.like')} {meal.likes ? `(${meal.likes})` : ''}
            </button>
            <button
              type="button"
              onClick={() => rate({ liked: liked === -1 ? 0 : -1 })}
              className={`btn ${liked === -1 ? 'bg-red-600 text-white' : 'btn-soft'}`}
            >
              👎 {t('meal.dislike')} {meal.dislikes ? `(${meal.dislikes})` : ''}
            </button>
          </div>
        </div>

        <button type="button" className="btn-primary w-full !py-3" onClick={() => setShareOpen(true)}>
          <Icon.Share className="h-4 w-4" />
          {t('meal.share')}
        </button>
      </MealContent>

      <ConfirmDialog
        open={confirmOpen}
        message={t('meals.confirmDelete', { name: meal.name })}
        onConfirm={remove}
        onCancel={() => setConfirmOpen(false)}
      />
      <ShareSheet meal={meal} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
