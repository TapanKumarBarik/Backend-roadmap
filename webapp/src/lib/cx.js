/** Joins class names, skipping anything falsy: cx('ui-btn', loading && 'is-loading') */
export const cx = (...parts) => parts.filter(Boolean).join(' ');
