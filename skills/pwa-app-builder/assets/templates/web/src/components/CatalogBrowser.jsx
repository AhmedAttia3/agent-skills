/**
 * تبويب «استكشف»: تصفح كتالوج الوصفات العام (بحث + تصنيفات + إضافة إلى قائمتي).
 * التصنيفات تُعرض في صف أفقي قابل للتمرير لأنها كثيرة.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, CATEGORY_META, CATEGORIES } from '../lib/api';
import { useAuth, useSettings, useToast } from '../lib/providers';
import { EmptyState, Icon, Spinner } from './ui';

const SORTS = [
  { value: 'random', key: 'explore.sortRandom' },
  { value: 'recent', key: 'meals.sortRecent' },
  { value: 'name', key: 'meals.sortName' },
  { value: 'quick', key: 'explore.sortQuick' },
];

/** بذرة عشوائية جديدة: تُختار مرة عند فتح الصفحة فيأتي الترتيب مختلفاً كل زيارة. */
const newSeed = () => Math.floor(Math.random() * 999982) + 1;

export default function CatalogBrowser({ onCount }) {
  const { t } = useSettings();
  const { toast } = useToast();
  const { user, guest, refresh } = useAuth();

  const [tags, setTags] = useState([]);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('random');
  const [seed, setSeed] = useState(newSeed);
  const [adding, setAdding] = useState('');
  const [added, setAdded] = useState({}); // slug → { id, duplicate, canUpdate }

  const tagMeta = useMemo(() => new Map(tags.map((item) => [item.slug, item])), [tags]);

  useEffect(() => {
    api
      .catalogTags()
      .then((data) => setTags(data.tags))
      .catch(() => setTags([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listCatalog({ q, tag, category, sort, seed, limit: 100 });
      setMeals(data.meals);
      onCount?.(data.total);
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    } finally {
      setLoading(false);
    }
  }, [q, tag, category, sort, seed, toast, t, onCount]);

  useEffect(() => {
    const timeout = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timeout);
  }, [load, q]);

  /** إضافة طبق من الكتالوج إلى قائمتي (تُنشأ جلسة زائر تلقائياً عند الحاجة). */
  async function addToMyList(meal, updateId) {
    setAdding(meal.slug);
    try {
      if (!user) {
        await guest();
        await refresh();
      }
      const data = await api.addCatalogMeal(meal.slug, updateId ? { updateId } : {});
      setAdded((prev) => ({
        ...prev,
        [meal.slug]: { id: data.meal.id, duplicate: data.duplicate, canUpdate: data.canUpdate, updated: data.updated },
      }));
      toast(
        data.duplicate ? t('public.alreadyHave') : data.updated ? t('explore.updated') : t('explore.added', { name: meal.name })
      );
    } catch (err) {
      toast(err.message || t('public.addError'), 'error');
    } finally {
      setAdding('');
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-3">
        <div className="relative">
          <Icon.Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-5 w-5 text-ink-400" />
          <input
            className="input ps-10"
            placeholder={t('explore.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* صف التصنيفات: أفقي قابل للتمرير */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setTag('')}
            className={`chip shrink-0 border transition ${
              tag === ''
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-ink-200 bg-white text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100'
            }`}
          >
            ✨ {t('explore.all')}
          </button>
          {tags.map((item) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => setTag(tag === item.slug ? '' : item.slug)}
              className={`chip shrink-0 border transition ${
                tag === item.slug
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-ink-200 bg-white text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100'
              }`}
            >
              {item.emoji} {item.name}
              <span className="opacity-60">({item.count})</span>
            </button>
          ))}
        </div>

        {/* وقت الوجبة: تصفية ثانوية */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 no-scrollbar">
          {['all', ...CATEGORIES].map((key) => {
            const meta = CATEGORY_META[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={`chip shrink-0 transition ${
                  category === key ? 'bg-ink-800 text-white dark:bg-ink-100 dark:text-ink-900' : 'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-200'
                }`}
              >
                {meta ? `${meta.emoji} ${t(meta.key)}` : `🍽️ ${t('cat.all')}`}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-ink-500 dark:text-ink-300">
            {t('explore.count', { n: meals.length })}
          </label>
          <select
            className="input ms-auto !w-auto !py-2 text-xs"
            value={sort}
            onChange={(e) => {
              // اختيار «عشوائي» يدوياً يعطي ترتيباً جديداً
              if (e.target.value === 'random') setSeed(newSeed());
              setSort(e.target.value);
            }}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="card overflow-hidden">
              <div className="skeleton h-32 w-full" />
              <div className="space-y-2 p-3">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !meals.length && (
        <EmptyState emoji="🍽️" title={t('explore.empty')} description={t('explore.emptyDesc')} />
      )}

      {!loading && meals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {meals.map((meal) => {
            const result = added[meal.slug];
            return (
              <article key={meal.slug} className="card overflow-hidden">
                <Link to={`/catalog/${meal.slug}`} className="block">
                  {meal.imageUrl ? (
                    <img src={meal.imageUrl} alt={meal.name} loading="lazy" className="h-36 w-full object-cover" />
                  ) : (
                    <div className="grid h-36 place-items-center bg-gradient-to-br from-brand-100 to-brand-200 text-5xl dark:from-ink-700 dark:to-ink-800">
                      {meal.emoji}
                    </div>
                  )}
                </Link>
                <div className="space-y-2 p-3">
                  <Link to={`/catalog/${meal.slug}`} className="block">
                    <h3 className="truncate text-sm font-extrabold">{meal.name}</h3>
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-ink-500 dark:text-ink-300">
                      {meal.shortDesc}
                    </p>
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {meal.tags.slice(0, 3).map((slug) => (
                      <span key={slug} className="chip bg-brand-50 text-[10px] text-brand-700 dark:bg-ink-700 dark:text-brand-200">
                        {tagMeta.get(slug)?.emoji} {tagMeta.get(slug)?.name || slug}
                      </span>
                    ))}
                    {meal.prepMinutes ? (
                      <span className="chip bg-ink-100 text-[10px] text-ink-500 dark:bg-ink-700 dark:text-ink-300">
                        ⏱️ {t('explore.minutes', { n: meal.prepMinutes })}
                      </span>
                    ) : null}
                  </div>
                  {result ? (
                    <div className="space-y-2">
                      <Link to={`/meals/${result.id}`} className="btn-soft w-full !py-2 text-xs">
                        <Icon.Check className="h-4 w-4" />
                        {result.duplicate && !result.updated
                          ? t('public.alreadyHave')
                          : result.updated
                            ? t('explore.updated')
                            : t('public.viewMeal')}
                      </Link>
                      {result.duplicate && result.canUpdate && (
                        <button
                          type="button"
                          className="btn-primary w-full !py-2 text-xs"
                          onClick={() => addToMyList(meal, result.id)}
                          disabled={adding === meal.slug}
                        >
                          {adding === meal.slug ? <Spinner /> : <Icon.Edit className="h-4 w-4" />}
                          {t('explore.updateMine')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary w-full !py-2 text-xs"
                      onClick={() => addToMyList(meal)}
                      disabled={adding === meal.slug}
                    >
                      {adding === meal.slug ? <Spinner /> : <Icon.Plus className="h-4 w-4" />}
                      {t('explore.add')}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
