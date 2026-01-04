import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import 'molstar/build/viewer/molstar.css';
import "molstar/lib/mol-plugin-ui/skin/light.scss";
import './index.css'


createRoot(document.getElementById('root')!).render(
    <App />
)

window.addEventListener("error", (e) => {
  const el = document.getElementById("fatal");
  if (el) el.textContent = String(e.error ?? e.message ?? e);
});

window.addEventListener("unhandledrejection", (e) => {
  const el = document.getElementById("fatal");
  if (el) el.textContent = String((e as PromiseRejectionEvent).reason);
});
