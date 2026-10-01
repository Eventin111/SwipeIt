import { useEffect, useState } from 'react';

const readDraft = (key, fallback) => {
  try {
    const value = sessionStorage.getItem(key);
    const parsed = value === null ? fallback : JSON.parse(value);
    return typeof parsed === typeof fallback ? parsed : fallback;
  } catch (error) { return fallback; }
};

// Session storage isolates drafts between browser tabs; keys include the account and resource.
export const useDraft = (key, fallback = '') => {
  const [draft, setDraft] = useState(() => ({ key, value: readDraft(key, fallback) }));
  const value = draft.key === key ? draft.value : readDraft(key, fallback);
  const setValue = (next) => {
    const updated = typeof next === 'function' ? next(value) : next;
    try {
      if (updated === '') sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(updated));
    } catch (error) { /* Keep the draft in memory when browser storage is unavailable. */ }
    setDraft({ key, value: updated });
  };
  return [value, setValue];
};

export const useUnloadWarning = (dirty) => {
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
};
