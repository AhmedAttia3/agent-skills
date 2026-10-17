/** نافذة المشاركة: رابط عام + واتساب/فيسبوك/تلجرام + مشاركة نظام التشغيل. */
import { useState } from 'react';
import { api } from '../lib/api';
import { Icon, Modal, Spinner } from './ui';
import { useSettings, useToast } from '../lib/providers';

export default function ShareSheet({ meal, open, onClose, url = '', title = '' }) {
  const { t } = useSettings();
  const { toast } = useToast();
  // وضعان: رابط جاهز (صفحة طبق في الكتالوج) أو رابط مشاركة عام يُنشأ للوجبة.
  const initial = url || (meal?.shareToken ? `${window.location.origin}/s/${meal.shareToken}` : '');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(initial);

  const text = `${title || meal?.name || ''} — ${t('app.name')}`;

  async function ensureLink() {
    if (link) return link;
    if (url) return url;
    setBusy(true);
    try {
      const { path } = await api.shareMeal(meal.id);
      const url = `${window.location.origin}${path}`;
      setLink(url);
      return url;
    } catch (err) {
      toast(err.message || t('err.generic'), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const url = await ensureLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('share.copied'));
    } catch {
      window.prompt(text, url);
    }
  }

  async function shareTo(network) {
    const url = await ensureLink();
    if (!url) return;
    const encoded = encodeURIComponent(`${text}\n${url}`);
    const targets = {
      whatsapp: `https://wa.me/?text=${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    };
    window.open(targets[network], '_blank', 'noopener');
  }

  async function nativeShare() {
    const url = await ensureLink();
    if (!url) return;
    if (navigator.share) {
      await navigator.share({ title: t('app.name'), text, url }).catch(() => undefined);
    } else {
      await copy();
    }
  }

  const options = [
    { key: 'whatsapp', label: t('share.whatsapp'), emoji: '💬', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200' },
    { key: 'facebook', label: t('share.facebook'), emoji: '📘', className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' },
    { key: 'telegram', label: t('share.telegram'), emoji: '✈️', className: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200' },
  ];

  return (
    <Modal open={open} title={t('share.title')} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-ink-100/70 p-3 dark:bg-ink-700/50">
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold">{title || meal?.name}</div>
            <div className="text-[11px] text-ink-500 dark:text-ink-300">{t('app.tagline')}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <input className="input" readOnly value={link || (busy ? t('share.creating') : '')} dir="ltr" placeholder="https://…" />
          <button type="button" className="btn-primary shrink-0" onClick={copy} disabled={busy}>
            {busy ? <Spinner /> : <Icon.Share className="h-4 w-4" />}
            {t('share.copy')}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => shareTo(option.key)}
              className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-xs font-bold transition hover:brightness-95 ${option.className}`}
            >
              <span className="text-xl">{option.emoji}</span>
              {option.label}
            </button>
          ))}
        </div>

        {'share' in navigator && (
          <button type="button" className="btn-soft w-full" onClick={nativeShare}>
            <Icon.Share className="h-4 w-4" />
            {t('share.native')}
          </button>
        )}
      </div>
    </Modal>
  );
}
