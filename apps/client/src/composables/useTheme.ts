import { ref, onMounted } from 'vue';

export type ThemeMode = 'auto' | 'light' | 'dark';
const STORAGE_KEY = 'atlas.theme';
const ORDER: ThemeMode[] = ['auto', 'light', 'dark'];

const mode = ref<ThemeMode>('auto');

function apply(m: ThemeMode) {
  document.documentElement.setAttribute('data-theme', m);
}

function load(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'auto' || v === 'light' || v === 'dark') return v;
  } catch {/* ignore */}
  return 'auto';
}

function set(m: ThemeMode) {
  mode.value = m;
  apply(m);
  try { localStorage.setItem(STORAGE_KEY, m); } catch {/* ignore */}
}

function cycle() {
  const i = ORDER.indexOf(mode.value);
  const next = ORDER[(i + 1) % ORDER.length];
  set(next);
}

export function useTheme() {
  onMounted(() => {
    const initial = load();
    set(initial);
  });
  return { mode, set, cycle };
}
