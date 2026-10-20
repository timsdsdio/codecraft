import { createRoot } from 'react-dom/client';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './ui/styles.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);
