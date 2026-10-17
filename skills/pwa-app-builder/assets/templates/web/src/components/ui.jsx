/** مكوّنات واجهة عامة قابلة لإعادة الاستخدام: أيقونات، تقييم، نوافذ، بطاقة وجبة… */
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_META, CATEGORIES, compressImage, mealCategories } from '../lib/api';
import { useSettings } from '../lib/providers';

/* --------------------------------- أيقونات -------------------------------- */
export const Icon = {
  Dice: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  Home: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" strokeLinecap="round" />
    </svg>
  ),
  List: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" />
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  ),
  Bell: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" strokeLinejoin="round" />
      <path d="M10 18a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  ),
  Chart: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  ),
  Cog: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.06-.06A2 2 0 1 1 7.37 4.1l.06.06A1.7 1.7 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 2Z"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Share: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.6 6.8-4M8.6 13.4l6.8 4" strokeLinecap="round" />
    </svg>
  ),
  Trash: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Edit: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" strokeLinejoin="round" />
      <path d="m14 6 4 4" strokeLinecap="round" />
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" strokeLinecap="round" />
    </svg>
  ),
  Close: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}>
      <path d="m5 13 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Arrow: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M14 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Back: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Sun: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" strokeLinecap="round" />
    </svg>
  ),
  Moon: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
    </svg>
  ),
  Globe: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3Z" />
    </svg>
  ),
  Star: ({ filled, ...p }) => (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" {...p}>
      <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.8l5.9-.9L12 3.6Z" strokeLinejoin="round" />
    </svg>
  ),
  Heart: ({ filled, ...p }) => (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" {...p}>
      <path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7.9 4.2 4.2 0 0 1 19 10.7C19 15.6 12 20 12 20Z" strokeLinejoin="round" />
    </svg>
  ),
  Image: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 18 5-5 3 3 3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Menu: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  ),
  Logout: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" strokeLinecap="round" />
      <path d="M10 8l-4 4 4 4M6 12h9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Login: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" strokeLinecap="round" />
      <path d="M14 8l4 4-4 4M18 12h-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Download: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Eye: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  ),
  EyeOff: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 4l16 16" strokeLinecap="round" />
      <path d="M9.6 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4.1M6.4 8.2A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 1.9-.2 2.7-.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/* --------------------------------- تقييم ---------------------------------- */
export function StarRating({ value = 0, count = 0, onChange, size = 20, readOnly = false }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  return (
    <div className="flex items-center gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readOnly && setHover(star)}
          onMouseLeave={() => !readOnly && setHover(0)}
          className={`no-tap-highlight transition ${readOnly ? 'cursor-default' : 'hover:scale-110'}`}
          aria-label={`${star}`}
        >
          <Icon.Star filled={star <= shown} style={{ width: size, height: size }} className="text-amber-400" />
        </button>
      ))}
      {count > 0 && <span className="ms-1 text-xs font-bold text-ink-500 dark:text-ink-300">({count})</span>}
    </div>
  );
}

/* ------------------------------- التصنيفات -------------------------------- */
export function CategoryChip({ category, active, onClick, includeAll = false }) {
  const { t } = useSettings();
  const meta = includeAll && category === 'all' ? { key: 'cat.all', emoji: '🍽️' } : CATEGORY_META[category];
  if (!meta) return null;
  return (
    <button
      type="button"
      onClick={() => onClick?.(category)}
      className={`chip no-tap-highlight border transition ${
        active
          ? 'border-brand-500 bg-brand-500 text-white shadow'
          : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100'
      }`}
    >
      <span>{meta.emoji}</span>
      <span>{t(meta.key)}</span>
    </button>
  );
}

export function CategoryPicker({ value, onChange, includeAll = false }) {
  const options = includeAll ? ['all', ...CATEGORIES] : CATEGORIES;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((category) => (
        <CategoryChip
          key={category}
          category={category}
          includeAll={includeAll}
          active={value === category}
          onClick={onChange}
        />
      ))}
    </div>
  );
}

/** اختيار أكثر من فئة لنفس الوجبة (مثال: فطور + عشاء). */
export function CategoryMultiPicker({ values = [], onChange }) {
  const { t } = useSettings();
  const toggle = (category) => {
    onChange(values.includes(category) ? values.filter((c) => c !== category) : [...values, category]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((category) => {
        const active = values.includes(category);
        const meta = CATEGORY_META[category];
        return (
          <button
            key={category}
            type="button"
            onClick={() => toggle(category)}
            aria-pressed={active}
            className={`chip no-tap-highlight border transition ${
              active
                ? 'border-brand-500 bg-brand-500 text-white shadow'
                : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100'
            }`}
          >
            <span>{meta.emoji}</span>
            <span>{t(meta.key)}</span>
            {active && <Icon.Check className="h-3.5 w-3.5" />}
          </button>
        );
      })}
    </div>
  );
}

/** يعرض كل فئات الوجبة كشرائح صغيرة. */
export function CategoryChips({ categories = [], className = '' }) {
  const { t } = useSettings();
  if (!categories.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {categories.map((category) => {
        const meta = CATEGORY_META[category];
        if (!meta) return null;
        return (
          <span key={category} className="chip bg-brand-50 text-brand-700 dark:bg-ink-700 dark:text-brand-200">
            {meta.emoji} {t(meta.key)}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------- عناصر عامة ------------------------------- */
export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function EmptyState({ emoji = '🍽️', title, description, action }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <span className="text-4xl">{emoji}</span>
      <h3 className="text-lg font-extrabold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-ink-500 dark:text-ink-300">{description}</p>}
      {action}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg animate-pop rounded-t-3xl bg-white p-5 shadow-pop dark:bg-ink-800 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <h3 className="text-base font-extrabold">{title}</h3>
          <button type="button" onClick={onClose} className="btn-ghost !p-2" aria-label="close">
            <Icon.Close className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }) {
  const { t } = useSettings();
  return (
    <Modal
      open={open}
      title={title || t('common.confirm')}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            {confirmLabel || t('common.delete')}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-600 dark:text-ink-200">{message}</p>
    </Modal>
  );
}

/* ------------------------------ اختيار صورة ------------------------------- */
export function ImagePicker({ value, onChange }) {
  const { t } = useSettings();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressImage(file);
      onChange(dataUrl);
    } catch {
      onChange(null);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  return (
    <div>
      <span className="label">{t('form.image')}</span>
      <div className="flex items-center gap-3">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink-100 dark:bg-ink-700">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon.Image className="h-7 w-7 text-ink-400" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-soft" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Spinner /> : <Icon.Image className="h-4 w-4" />}
            {value ? t('form.changeImage') : t('form.chooseImage')}
          </button>
          {value && (
            <button type="button" className="btn-ghost" onClick={() => onChange(null)}>
              {t('form.removeImage')}
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-400">{t('form.imageHint')}</p>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
    </div>
  );
}

/* ------------------------------ بطاقة وجبة -------------------------------- */
export function MealCard({ meal, actions }) {
  const { t } = useSettings();
  const categories = mealCategories(meal);
  const meta = CATEGORY_META[categories[0]] || { emoji: '🍽️', key: 'cat.all' };
  return (
    <div className="card flex gap-3 overflow-hidden p-3">
      <Link to={`/meals/${meal.id}`} className="shrink-0">
        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-ink-700 dark:to-ink-700">
          {meal.imageUrl ? (
            <img src={meal.imageUrl} alt={meal.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="text-3xl">{meta.emoji}</span>
          )}
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/meals/${meal.id}`} className="min-w-0">
            <h3 className="truncate text-sm font-extrabold">{meal.name}</h3>
            <span className="mt-0.5 inline-flex flex-wrap items-center gap-1 text-[11px] font-bold text-ink-500 dark:text-ink-300">
              {categories.map((category) => (
                <span key={category}>
                  {CATEGORY_META[category]?.emoji} {t(CATEGORY_META[category]?.key || 'cat.all')}
                </span>
              ))}
            </span>
          </Link>
          {actions && <div className="flex shrink-0 gap-1">{actions}</div>}
        </div>
        {meal.recipe && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500 dark:text-ink-300">{meal.recipe}</p>
        )}
        <div className="mt-1.5">
          <StarRating value={Math.round(meal.avgStars || 0)} count={meal.starsCount} readOnly size={14} />
        </div>
      </div>
    </div>
  );
}
