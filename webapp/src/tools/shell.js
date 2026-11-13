// What every tool page shares: the design tokens, the tool stylesheet, and the theme the reader chose in the app (if any). Import it first.
import '../styles/tokens.css';
import '../styles/tool-page.css';
import { STORAGE } from '../config/index.js';
import { readStored } from '../lib/storage.js';

const saved = readStored(STORAGE.theme);
if (['auto', 'light', 'dark'].includes(saved)) document.documentElement.dataset.theme = saved;
