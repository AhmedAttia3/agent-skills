/** الصفحة الرئيسية: اختيار الفئة + زر "اقترح لي وجبة" مع أنيميشن تدوير ثم عرض النتيجة */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, CATEGORY_META, mealCategories } from '../lib/api';
import { useAuth, useSettings, useToast } from '../lib/providers';
import { CategoryPicker, CategoryChips, Icon, Spinner, StarRating, EmptyState } from '../components/ui';

const SPIN_DURATION = 1500;
const SPIN_STEP = 90;

/** وجبات جاهزة تُضاف بضغطة واحدة لمن لا يريد البدء بقائمة فارغة. */
const DEMO_MEALS = [
  { name: 'فول وطعمية', categories: ['breakfast'], recipe: 'فول مدمس بزيت الزيتون + طعمية ساخنة + خبز بلدي' },
  { name: 'كشري', categories: ['lunch', 'dinner'], recipe: 'أرز + عدس + مكرونة + صلصة طماطم + بصل مقرمش' },
  { name: 'شوربة عدس', categories: ['dinner'], recipe: 'عدس أصفر + جزر + بصل + كمون، تُخفق وتُقدّم مع ليمون' },
  { name: 'سلطة فواكه', categories: ['snack', 'breakfast'], recipe: 'موز + تفاح + برتقال + عسل أبيض' },
];

export default function Home() {
  const { t } = useSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [meals, setMeals] = useState([]);
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [category, setCategory] = useState('all');
  const [spinning, setSpinning] = useState(false);
  const [preview, setPreview] = useState(null); // الوجبة المعروضة أثناء التدوير
  const [result, setResult] = useState(null);
  const [candidates, setCandidates] = useState(0);
  const [error, setError] = useState('');
  const timers = useRef([]);

  const loadMeals = useCallback(async () => {
    try {
      const data = await api.listMeals({ sort: 'recent' });
      setMeals(data.meals);
    } catch {
      setMeals([]);
    } finally {
      setLoadingMeals(false);
    }
  }, []);

  useEffect(() => {
    loadMeals();
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current.forEach(clearInterval);
    };
  }, [loadMeals]);

  const pool = useMemo(
    () => (category === 'all' ? meals : meals.filter((meal) => meal.category === category)),
    [meals, category]
  );

  const spin = useCallback(async () => {
    if (spinning) return;
    setError('');
    setResult(null);

    if (!pool.length) {
      setError(category === 'all' ? t('err.noMeals') : t('err.noMealsCategory'));
      return;
    }

    setSpinning(true);
    // أنيميشن تدوير سريع بين وجبات المستخدم لمدة 1.5 ثانية
    const interval = setInterval(() => {
      setPreview(pool[Math.floor(Math.random() * pool.length)]);
    }, SPIN_STEP);
    timers.current.push(interval);

    const timeout = setTimeout(async () => {
      clearInterval(interval);
      try {
        const data = await api.suggest({ category, excludeLast: true });
        setResult(data.meal);
        setCandidates(data.candidates);
      } catch (err) {
        setError(err.code === 'NO_MEALS' ? (category === 'all' ? t('err.noMeals') : t('err.noMealsCategory')) : err.message);
      } finally {
        setSpinning(false);
        setPreview(null);
      }
    }, SPIN_DURATION);
    timers.current.push(timeout);
  }, [category, pool, spinning, t]);

  // دعم اختصار التطبيق /?spin=1
  useEffect(() => {
    if (searchParams.get('spin') === '1' && !loadingMeals && meals.length && !result && !spinning) {
      spin();
      navigate('/', { replace: true });
    }
  }, [searchParams, loadingMeals, meals.length, result, spinning, spin, navigate]);

  /** إضافة وجبات جاهزة بضغطة واحدة (لتفادي الشاشة الفارغة في أول استخدام). */
  async function seedDemo() {
    setError('');
    try {
      for (const meal of DEMO_MEALS) {
        await api.createMeal(meal);
      }
      await loadMeals();
      toast(t('home.demoAdded'));
    } catch (err) {
      setError(err.message || t('err.generic'));
    }
  }

  async function accept() {    if (!result) return;
    try {
      await api.suggestOutcome({ mealId: result.id, outcome: 'accepted' });
    } catch {
      /* لا نعطّل التجربة إن فشل التسجيل */
    }
    toast(t('home.accepted'));
  }

  const shown = result || preview;
  const shownCategories = mealCategories(shown);

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white">
          <p className="text-xs font-bold opacity-90">{t('app.tagline')}</p>
          <h1 className="mt-1 text-xl font-extrabold">
            {user?.name ? `${user.name} — ` : ''}
            {t('home.chooseCategory')}
          </h1>
          <div className="mt-4">
            <CategoryPicker value={category} onChange={setCategory} includeAll />
          </div>
          <button
            type="button"
            onClick={spin}
            disabled={spinning || (!loadingMeals && !pool.length)}
            className="btn mt-5 w-full bg-white !py-4 text-base !font-extrabold text-brand-700 shadow-pop hover:bg-brand-50"
          >
            {spinning ? <Spinner className="text-brand-700" /> : <Icon.Dice className="h-6 w-6" />}
            {spinning ? t('home.spinning') : t('home.spin')}
          </button>
          <p className="mt-2 text-center text-[11px] font-bold opacity-90">
            {category === 'all' ? t('home.fromAll') : `${CATEGORY_META[category].emoji} ${t(CATEGORY_META[category].key)}`}
          </p>
        </div>
      </section>

      {loadingMeals && (
        <div className="card space-y-3 p-5">
          <div className="skeleton h-5 w-1/3" />
          <div className="skeleton h-24 w-full" />
        </div>
      )}

      {!loadingMeals && !meals.length && (
        <EmptyState
          emoji="🍳"
          title={t('home.noMeals')}
          description={t('home.noMealsDesc')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/meals/new" className="btn-primary">
                <Icon.Plus className="h-4 w-4" />
                {t('home.addFirst')}
              </Link>
              <button type="button" className="btn-soft" onClick={seedDemo}>
                <Icon.Dice className="h-4 w-4" />
                {t('home.tryDemo')}
              </button>
            </div>
          }
        />
      )}

      {error && (
        <p className="card bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-100">{error}</p>
      )}

      {shown && (
        <section
          key={shown.id + (spinning ? '-spin' : '-final')}
          className={`card overflow-hidden ${spinning ? 'opacity-90' : 'animate-pop'}`}
        >
          {/* مساحة الصورة: بارتفاع ثابت دائماً — والصورة الافتراضية (إيموجي) عند غيابها،
              حتى لا يتغيّر حجم البطاقة أثناء الاقتراح العشوائي */}
          <div className="h-44 w-full overflow-hidden bg-gradient-to-br from-brand-100 to-brand-200 dark:from-ink-700 dark:to-ink-800">
            {shown.imageUrl ? (
              <img src={shown.imageUrl} alt={shown.name} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-6xl">
                {CATEGORY_META[shownCategories[0]]?.emoji || '🍽️'}
              </div>
            )}
          </div>

          <div className={`space-y-3 p-5 ${spinning ? 'slot-flip' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="h-6 overflow-hidden">
                  <CategoryChips categories={shownCategories.slice(0, 3)} />
                </div>
                <h2 className="mt-2 line-clamp-2 min-h-[3.4rem] text-lg font-extrabold leading-snug">{shown.name}</h2>
              </div>
              <div className="h-6 shrink-0">
                <StarRating value={Math.round(shown.avgStars || 0)} count={shown.starsCount} readOnly />
              </div>
            </div>

            <p className="line-clamp-2 min-h-[2.6rem] text-sm leading-relaxed text-ink-600 dark:text-ink-200">
              {shown.description || (shown.recipe || '').split('\n')[0] || t('meal.noRecipe')}
            </p>

            <p className="text-[11px] font-bold text-ink-400">{t('home.candidates', { n: candidates })}</p>

            {/* الأزرار تظهر فقط مع الاقتراح النهائي — وأثناء التدوير تُحفظ المساحة (invisible) فلا يتغيّر الحجم */}
            <div className="relative">
              <div className={`flex flex-wrap gap-2 ${spinning ? 'invisible' : ''}`}>
                <button type="button" className="btn-primary flex-1" onClick={accept}>
                  <Icon.Check className="h-4 w-4" />
                  {t('home.accept')}
                </button>
                <button type="button" className="btn-soft flex-1" onClick={spin}>
                  <Icon.Dice className="h-4 w-4" />
                  {t('home.again')}
                </button>
                <Link to={`/meals/${shown.id}`} className="btn-ghost">
                  {t('meal.recipe')}
                </Link>
              </div>
              {spinning && (
                <div className="absolute inset-0 grid place-items-center gap-2 rounded-xl bg-ink-100 dark:bg-ink-700/50">
                  <span className="flex items-center gap-2 text-xs font-extrabold text-ink-500 dark:text-ink-300">
                    <Spinner />
                    {t('home.spinning')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {!result && meals.length > 0 && !spinning && !preview && (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-extrabold text-ink-500 dark:text-ink-300">{t('nav.meals')}</h2>
          <div className="flex flex-wrap gap-2">
            {meals.slice(0, 8).map((meal) => (
              <Link
                key={meal.id}
                to={`/meals/${meal.id}`}
                className="chip bg-ink-100 text-ink-700 hover:bg-brand-100 dark:bg-ink-700 dark:text-ink-100"
              >
                {CATEGORY_META[mealCategories(meal)[0]]?.emoji} {meal.name}
              </Link>
            ))}
            {meals.length > 8 && (
              <Link to="/meals" className="chip bg-brand-50 text-brand-700 dark:bg-ink-700 dark:text-brand-200">
                +{meals.length - 8}
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
