import { StrictMode, useEffect, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import Galaxy from './Galaxy';
import { parseModels } from './data/models';
import type { GalaxyModel } from './galaxy-layout';
import './style.css';

function App(): ReactElement {
  const [models, setModels] = useState<GalaxyModel[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load(): Promise<void> {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}models.json`, { signal: controller.signal });
        if (!response.ok) throw new Error(`数据加载失败（HTTP ${response.status}）。`);
        const value: unknown = await response.json();
        const data = parseModels(value);
        if (!controller.signal.aborted) setModels(data);
      } catch (reason: unknown) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '数据加载失败。');
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return <>
    <header className="demo-header"><h1>Galaxy UI <span>星系与星环</span></h1><span>交互式粒子图谱</span></header>
    <main>
      {error ? <div className="demo-status" role="alert"><h2>无法加载星图</h2><p>{error}</p><p>检查 public/models.json 中的数据格式。</p><button onClick={() => window.location.reload()}>重新加载</button></div>
        : models ? <Galaxy models={models} /> : <p className="demo-status" role="status">正在汇聚示例群星…</p>}
    </main>
  </>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');
createRoot(root).render(<StrictMode><App /></StrictMode>);
