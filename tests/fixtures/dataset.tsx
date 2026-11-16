import { StrictMode, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import Galaxy from '../../src/Galaxy';
import type { GalaxyModel } from '../../src/galaxy-layout';
import '../../src/style.css';

const first: GalaxyModel[] = [{ id: 'first', name: 'First record', domain: '生态/植被', task: '模拟', year: null, interface_count: 0, reviewed: false }];
const second: GalaxyModel[] = [{ ...first[0], id: 'second', name: 'Second record', domain: '水文/洪水', task: '计算', year: null, interface_count: 0, reviewed: false }];
function Fixture(): ReactElement {
  const [models, setModels] = useState(first);
  const [selection, setSelection] = useState('none');
  return <>
    <button onClick={() => setModels(second)}>Replace dataset</button>
    <button onClick={() => setModels([])}>Empty dataset</button>
    <button onClick={() => setModels(first)}>Restore dataset</button>
    <output aria-label="Selection callback">{selection}</output>
    <Galaxy models={models} onSelectionChange={model => setSelection(model?.id ?? 'none')} />
  </>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<StrictMode><Fixture /></StrictMode>);
