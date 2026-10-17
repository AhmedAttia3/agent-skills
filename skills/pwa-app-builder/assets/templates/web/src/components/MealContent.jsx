/**
 * مكوّن عرض موحّد لتفاصيل الطبق — يُستخدم في صفحة وجبتي وفي صفحة طبق الكتالوج،
 * فيبقى التصميم واحداً في المكانين وأي تعديل مستقبلي يسري على الاثنين.
 */
import { CATEGORY_META } from '../lib/api';
import { useSettings } from '../lib/providers';
import { CategoryChips, Icon } from './ui';

export default function MealContent({ meal, categories = [], tagMeta = new Map(), chipsExtra = null, credit = null, children = null }) {
  const { t } = useSettings();
  const meta = CATEGORY_META[categories[0]] || { emoji: '🍽️', key: 'cat.all' };
  const ingredients = meal.ingredients || [];
  const steps = meal.steps || [];
  const tags = meal.tags || [];

  return (
    <section className="card overflow-hidden">
      {meal.imageUrl ? (
        <img src={meal.imageUrl} alt={meal.name} className="h-56 w-full object-cover" />
      ) : (
        <div className="grid h-44 w-full place-items-center bg-gradient-to-br from-brand-100 to-brand-200 dark:from-ink-700 dark:to-ink-800">
          <span className="text-6xl">{meta.emoji}</span>
        </div>
      )}

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChips categories={categories} />
          {tags.map((slug) => (
            <span key={slug} className="chip bg-brand-50 text-brand-700 dark:bg-ink-700 dark:text-brand-200">
              {tagMeta.get(slug)?.emoji} {tagMeta.get(slug)?.name || slug}
            </span>
          ))}
          {meal.prepMinutes ? (
            <span className="chip bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-200">
              ⏱️ {t('explore.minutes', { n: meal.prepMinutes })}
            </span>
          ) : null}
          {meal.servings ? (
            <span className="chip bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-200">
              🍽️ {t('meal.servingsCount', { n: meal.servings })}
            </span>
          ) : null}
          {chipsExtra}
        </div>

        {meal.description ? (
          <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-200">{meal.description}</p>
        ) : null}

        {ingredients.length > 0 && (
          <div>
            <h2 className="label">{t('meal.ingredients')}</h2>
            <ul className="space-y-1.5 rounded-2xl bg-ink-100/70 p-4 dark:bg-ink-700/50">
              {ingredients.map((item, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed">
                  <span className="text-brand-500">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {steps.length > 0 && (
          <div>
            <h2 className="label">{t('meal.steps')}</h2>
            <ol className="space-y-2.5 rounded-2xl bg-ink-100/70 p-4 dark:bg-ink-700/50">
              {steps.map((step, index) => (
                <li key={index} className="flex gap-3 text-sm leading-relaxed">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[11px] font-extrabold text-brand-700 dark:bg-ink-800 dark:text-brand-200">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {!ingredients.length && !steps.length && (
          <div>
            <h2 className="label">{t('meal.recipe')}</h2>
            {meal.recipe ? (
              <p className="whitespace-pre-line rounded-2xl bg-ink-100/70 p-4 text-sm leading-relaxed dark:bg-ink-700/50">
                {meal.recipe}
              </p>
            ) : (
              <p className="text-sm text-ink-400">{t('meal.noRecipe')}</p>
            )}
          </div>
        )}

        {meal.imageSource || credit ? (
          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-400">
            <Icon.Image className="mt-px h-3 w-3 shrink-0" />
            <span>
              {credit ||
                t('explore.imageCredit', { credit: meal.imageCredit || '—', license: meal.imageLicense || '—' })}
              {meal.imageSource ? (
                <>
                  {' · '}
                  <a href={meal.imageSource} target="_blank" rel="noreferrer noopener" className="underline">
                    {t('meal.source')}
                  </a>
                </>
              ) : null}
            </span>
          </p>
        ) : null}

        {children}
      </div>
    </section>
  );
}
