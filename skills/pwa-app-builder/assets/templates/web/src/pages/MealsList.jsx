/** شاشة «قائمة الوجبات» بتبويبين: قائمتي (افتراضي) + استكشف (كتالوج الوصفات العام). */
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useSettings, useToast } from '../lib/providers';
import { CategoryPicker, ConfirmDialog, EmptyState, Icon, MealCard } from '../components/ui';
import CatalogBrowser from '../components/CatalogBrowser';

const SORTS = [
  { value: 'recent', key: 'meals.sortRecent' },
  { value: 'name', key: 'meals.sortName' },
  { value: 'rating', key: 'meals.sortRating' },
];

/** تبويب «قائمتي»: ما كان موجوداً سابقاً بدون تغيير في السلوك. */
function MyMeals() {
  const { t } = useSettings();
  const { toast } = useToast();
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('recent');
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listMeals({ q, category, sort });
      setMeals(data.meals);
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    } finally {
      setLoading(false);
    }
  }, [q, category, sort, toast, t]);

  // بحث بتأخير بسيط لتقليل الطلبات
  useEffect(() => {
    const timeout = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timeout);
  }, [load, q]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await api.deleteMeal(pendingDelete.id);
      toast(t('meals.deleted'));
      setMeals((prev) => prev.filter((meal) => meal.id !== pendingDelete.id));
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-3">
        <div className="relative">
          <Icon.Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-5 w-5 text-ink-400" />
          <input className="input ps-10" placeholder={t('meals.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <CategoryPicker value={category} onChange={setCategory} includeAll />
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-ink-500 dark:text-ink-300">{t('meals.count', { n: meals.length })}</label>
          <select className="input ms-auto !w-auto !py-2 text-xs" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="card flex gap-3 p-3">
              <div className="skeleton h-20 w-20" />
              <div className="flex-1 space-y-2 py-1">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !meals.length && (
        <EmptyState
          emoji="🔍"
          title={q || category !== 'all' ? t('meals.empty') : t('home.noMeals')}
          description={q || category !== 'all' ? t('meals.search') : t('home.noMealsDesc')}
          action={
            <Link to="/meals/new" className="btn-primary">
              <Icon.Plus className="h-4 w-4" />
              {t('meals.addFirst')}
            </Link>
          }
        />
      )}

      <div className="space-y-3">
        {meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            actions={
              <>
                <Link to={`/meals/${meal.id}/edit`} className="btn-ghost !p-2" title={t('meal.edit')}>
                  <Icon.Edit className="h-4 w-4" />
                </Link>
                <button type="button" className="btn-ghost !p-2 text-red-600" onClick={() => setPendingDelete(meal)} title={t('meal.delete')}>
                  <Icon.Trash className="h-4 w-4" />
                </button>
              </>
            }
          />
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        message={t('meals.confirmDelete', { name: pendingDelete?.name || '' })}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default function MealsList() {
  const { t } = useSettings();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'explore' ? 'explore' : 'mine';
  const [exploreCount, setExploreCount] = useState(null);

  const goTo = (next) => {
    const nextParams = new URLSearchParams(params);
    if (next === 'mine') nextParams.delete('tab');
    else nextParams.set('tab', 'explore');
    setParams(nextParams, { replace: true });
  };

  const TABS = [
    { key: 'mine', label: t('meals.tabMine'), icon: <Icon.List className="h-4 w-4" /> },
    { key: 'explore', label: t('meals.tabExplore'), icon: <Icon.Globe className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-extrabold">{t('meals.title')}</h1>
        {tab === 'mine' ? (
          <Link to="/meals/new" className="btn-primary">
            <Icon.Plus className="h-4 w-4" />
            {t('nav.addMeal')}
          </Link>
        ) : (
          <span className="text-xs font-bold text-ink-400">
            {exploreCount === null ? t('explore.title') : t('explore.count', { n: exploreCount })}
          </span>
        )}
      </div>

      <div className="card grid grid-cols-2 gap-1 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => goTo(item.key)}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-extrabold transition ${
              tab === item.key
                ? 'bg-brand-500 text-white shadow'
                : 'text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-700/60'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'mine' ? <MyMeals /> : <CatalogBrowser onCount={setExploreCount} />}
    </div>
  );
}
