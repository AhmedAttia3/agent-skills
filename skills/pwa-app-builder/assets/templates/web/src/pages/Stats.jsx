/** شاشة الإحصاءات: أرقام عامة + توزيع الفئات + الأعلى تقييماً + سجل الاقتراحات */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, CATEGORY_META, mealCategories } from '../lib/api';
import { useSettings, useToast } from '../lib/providers';
import { EmptyState, Icon, StarRating } from '../components/ui';
import { formatDate } from '../lib/i18n';

export default function Stats() {
  const { t, locale } = useSettings();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .stats()
      .then(setData)
      .catch((err) => toast(err.message || t('err.generic'), 'error'))
      .finally(() => setLoading(false));
  }, [toast, t]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  if (!data) return <EmptyState emoji="📊" title={t('stats.noData')} />;

  const { totals, byCategory, topRated, recentSuggestions } = data;
  const maxCategory = Math.max(1, ...Object.values(byCategory));

  const cards = [
    { key: 'stats.totalMeals', value: totals.meals, emoji: '🍽️', to: '/meals' },
    { key: 'stats.totalSuggestions', value: totals.suggestions, emoji: '🎲' },
    { key: 'stats.accepted', value: totals.accepted, emoji: '✅' },
    { key: 'stats.alarms', value: totals.alarms, emoji: '⏰', to: '/alarms' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold">{t('stats.title')}</h1>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => {
          const content = (
            <div className="card p-4">
              <div className="text-2xl">{card.emoji}</div>
              <div className="mt-1 text-2xl font-extrabold">{card.value}</div>
              <div className="text-xs font-bold text-ink-500 dark:text-ink-300">{t(card.key)}</div>
            </div>
          );
          return card.to ? (
            <Link key={card.key} to={card.to} className="transition hover:brightness-95">
              {content}
            </Link>
          ) : (
            <div key={card.key}>{content}</div>
          );
        })}
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-extrabold">{t('stats.byCategory')}</h2>
        <div className="space-y-2.5">
          {Object.entries(byCategory).map(([category, count]) => (
            <div key={category}>
              <div className="mb-1 flex items-center justify-between text-xs font-bold">
                <span>
                  {CATEGORY_META[category]?.emoji} {t(CATEGORY_META[category]?.key || 'cat.all')}
                </span>
                <span className="text-ink-500 dark:text-ink-300">{count}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-200/70 dark:bg-ink-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
                  style={{ width: `${Math.round((count / maxCategory) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-extrabold">{t('stats.topRated')}</h2>
        {topRated.length ? (
          <ul className="space-y-2">
            {topRated.map((meal) => (
              <li key={meal.id}>
                <Link to={`/meals/${meal.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-ink-100 dark:hover:bg-ink-700/60">
                  <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-50 dark:bg-ink-700">
                    {meal.imageUrl ? (
                      <img src={meal.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span>{CATEGORY_META[mealCategories(meal)[0]]?.emoji || '🍽️'}</span>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{meal.name}</span>
                  <StarRating value={Math.round(meal.avgStars || 0)} count={meal.starsCount} readOnly size={14} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-400">{t('stats.noData')}</p>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-extrabold">{t('stats.recent')}</h2>
        {recentSuggestions.length ? (
          <ul className="space-y-2">
            {recentSuggestions.map((item, index) => (
              <li key={index} className="flex items-center gap-3 text-xs">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-100 dark:bg-ink-700">
                  {CATEGORY_META[item.category]?.emoji || '🍽️'}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">{item.name || '—'}</span>
                <span className="shrink-0 text-ink-400">{formatDate(item.created_at, locale)}</span>
                {item.outcome === 'accepted' && <Icon.Check className="h-4 w-4 shrink-0 text-emerald-600" />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-400">{t('stats.noData')}</p>
        )}
      </section>
    </div>
  );
}
