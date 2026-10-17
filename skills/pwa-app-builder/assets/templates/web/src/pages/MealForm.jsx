/** شاشة إضافة/تعديل وجبة — الواجب: الاسم + فئة واحدة؛ وبقية التفاصيل اختيارية */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, mealCategories } from '../lib/api';
import { useSettings, useToast } from '../lib/providers';
import { CategoryMultiPicker, Icon, ImagePicker, Spinner } from '../components/ui';

const EMPTY = {
  name: '',
  categories: ['lunch'],
  description: '',
  ingredients: '',
  steps: '',
  tags: [],
  prepMinutes: '',
  servings: '',
  image: null,
};

export default function MealForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { t } = useSettings();
  const { toast } = useToast();

  const [form, setForm] = useState(EMPTY);
  const [existingImage, setExistingImage] = useState(null);
  const [dropImage, setDropImage] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [allTags, setAllTags] = useState([]);

  // التصنيفات الإضافية متاحة من كتالوجنا (نفس المفاتيح في الوجبة والكتالوج)
  useEffect(() => {
    api
      .catalogTags()
      .then(({ tags }) => setAllTags(tags))
      .catch(() => setAllTags([]));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .getMeal(id)
      .then(({ meal }) => {
        setForm({
          name: meal.name,
          categories: mealCategories(meal),
          description: meal.description || '',
          ingredients: (meal.ingredients || []).join('\n'),
          steps: (meal.steps || []).join('\n'),
          tags: meal.tags || [],
          prepMinutes: meal.prepMinutes ?? '',
          servings: meal.servings ?? '',
          image: null,
        });
        setExistingImage(meal.imageUrl);
        if (meal.description || meal.ingredients?.length || meal.steps?.length || meal.tags?.length || meal.prepMinutes) {
          setMoreOpen(true);
        }
      })
      .catch((err) => setError(err.message || t('err.generic')))
      .finally(() => setLoading(false));
  }, [id, isEdit, t]);

  function set(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError(t('err.nameRequired'));
      return;
    }
    if (!form.categories.length) {
      setError(t('err.categoriesRequired'));
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name,
      categories: form.categories,
      recipe: form.recipe || '',
      description: form.description,
      ingredients: form.ingredients,
      steps: form.steps,
      tags: form.tags,
      prepMinutes: form.prepMinutes,
      servings: form.servings,
    };
    try {
      if (isEdit) {
        if (form.image) payload.image = form.image;
        if (dropImage) payload.removeImage = true;
        const { meal } = await api.updateMeal(id, payload);
        toast(t('form.updated'));
        navigate(`/meals/${meal.id}`);
      } else {
        const { meal } = await api.createMeal({ ...payload, image: form.image });
        toast(t('form.added'));
        navigate(`/meals/${meal.id}`);
      }
    } catch (err) {
      setError(err.message || t('err.generic'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card space-y-3 p-5">
        <div className="skeleton h-5 w-1/3" />
        <div className="skeleton h-12 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost !p-2" onClick={() => navigate(-1)}>
          <Icon.Back className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-extrabold">{isEdit ? t('form.editTitle') : t('form.addTitle')}</h1>
      </div>

      <form onSubmit={submit} className="card space-y-5 p-5">
        <div>
          <label className="label" htmlFor="meal-name">
            {t('form.name')}
          </label>
          <input
            id="meal-name"
            className="input"
            placeholder={t('form.namePlaceholder')}
            value={form.name}
            onChange={set('name')}
            required
            autoFocus={!isEdit}
          />
        </div>

        <div>
          <span className="label">{t('form.category')}</span>
          <CategoryMultiPicker
            values={form.categories}
            onChange={(values) => setForm((prev) => ({ ...prev, categories: values }))}
          />
          <p className="mt-1.5 text-[11px] text-ink-400">{t('form.categoriesHint')}</p>
        </div>

        <ImagePicker value={form.image} onChange={(value) => setForm((prev) => ({ ...prev, image: value }))} />

        {isEdit && existingImage && !form.image && !dropImage && (
          <div className="flex items-center gap-3">
            <img src={existingImage} alt="" className="h-20 w-20 rounded-2xl object-cover" />
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setDropImage(true);
                setExistingImage(null);
              }}
            >
              {t('form.removeImage')}
            </button>
          </div>
        )}

        {/* التفاصيل الاختيارية: مطويّة لتسهيل الإضافة السريعة */}
        <div className="rounded-2xl border border-ink-200 dark:border-ink-700">
          <button
            type="button"
            className="flex w-full items-center gap-2 p-3 text-sm font-extrabold"
            onClick={() => setMoreOpen((prev) => !prev)}
          >
            <Icon.List className="h-4 w-4" />
            {t('form.moreDetails')}
            <Icon.Arrow className={`ms-auto h-4 w-4 transition ${moreOpen ? 'rotate-90' : ''}`} />
          </button>

          {moreOpen && (
            <div className="space-y-4 border-t border-ink-200 p-3 dark:border-ink-700">
              <p className="text-[11px] text-ink-400">{t('form.moreDetailsHint')}</p>

              <div>
                <label className="label" htmlFor="meal-description">
                  {t('form.description')}
                </label>
                <input
                  id="meal-description"
                  className="input"
                  placeholder={t('form.descriptionPlaceholder')}
                  value={form.description}
                  onChange={set('description')}
                />
              </div>

              <div>
                <label className="label" htmlFor="meal-ingredients">
                  {t('form.ingredients')}
                </label>
                <textarea
                  id="meal-ingredients"
                  className="input min-h-[90px] resize-y"
                  placeholder={t('form.ingredientsPlaceholder')}
                  value={form.ingredients}
                  onChange={set('ingredients')}
                />
              </div>

              <div>
                <label className="label" htmlFor="meal-steps">
                  {t('form.steps')}
                </label>
                <textarea
                  id="meal-steps"
                  className="input min-h-[90px] resize-y"
                  placeholder={t('form.stepsPlaceholder')}
                  value={form.steps}
                  onChange={set('steps')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="meal-prep">
                    {t('form.prepMinutes')}
                  </label>
                  <input
                    id="meal-prep"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    className="input"
                    value={form.prepMinutes}
                    onChange={set('prepMinutes')}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="meal-servings">
                    {t('form.servings')}
                  </label>
                  <input
                    id="meal-servings"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    className="input"
                    value={form.servings}
                    onChange={set('servings')}
                  />
                </div>
              </div>

              {allTags.length > 0 && (
                <div>
                  <span className="label">{t('form.tags')}</span>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => {
                      const active = form.tags.includes(tag.slug);
                      return (
                        <button
                          key={tag.slug}
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              tags: active ? prev.tags.filter((item) => item !== tag.slug) : [...prev.tags, tag.slug],
                            }))
                          }
                          className={`chip border transition ${
                            active
                              ? 'border-brand-500 bg-brand-500 text-white'
                              : 'border-ink-200 bg-white text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100'
                          }`}
                        >
                          {tag.emoji} {tag.name}
                          {active && <Icon.Check className="h-3.5 w-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="label" htmlFor="meal-recipe">
                  {t('form.recipe')}
                </label>
                <textarea
                  id="meal-recipe"
                  className="input min-h-[90px] resize-y"
                  placeholder={t('form.recipePlaceholder')}
                  value={form.recipe ?? ''}
                  onChange={set('recipe')}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-200">{error}</p>
        )}

        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1 !py-3" disabled={saving}>
            {saving ? <Spinner /> : <Icon.Check className="h-4 w-4" />}
            {saving ? t('form.saving') : isEdit ? t('form.save') : t('form.add')}
          </button>
          <Link to={isEdit ? `/meals/${id}` : '/meals'} className="btn-ghost !py-3">
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
