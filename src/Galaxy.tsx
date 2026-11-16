import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Search, Plus, Minus, RotateCcw, Orbit, Move, Focus, X, Maximize2, Minimize2, Eye, EyeOff, Pause, Play } from 'lucide-react';
import { buildGalaxy, buildFunctionGalaxy, galaxyGroup, type GalaxyModel, type GalaxyStar, type GalaxyTaxonomy } from './galaxy-layout';
import { GalaxyRenderer } from './galaxy-renderer';
import AmbientBackground from './components/AmbientBackground';
import './galaxy.css';

export interface GalaxyProps {
  /** Validated records with stable, unique IDs. See parseModels for JSON input. */
  models: readonly GalaxyModel[];
  onSelectionChange?: (model: GalaxyModel | null) => void;
}

export default function Galaxy({ models, onSelectionChange }: GalaxyProps): ReactElement {
  const [taxonomy, setTaxonomy] = useState<GalaxyTaxonomy>('domain');
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [labels, setLabels] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLDetailsElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const rendererRef = useRef<GalaxyRenderer | null>(null);
  const layouts = useMemo(() => ({ domain: buildGalaxy(models), function: buildFunctionGalaxy(models) }), [models]);
  const layout = layouts[taxonomy];
  const selected = models.find(model => model.id === selectedId);
  const matches = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return text ? layout.stars.filter(star => `${star.name} ${star.id} ${star.domain} ${star.task}`.toLocaleLowerCase().includes(text)) : [];
  }, [query, layout]);
  const matchIds = useMemo(() => new Set(matches.map(star => star.id)), [matches]);

  function reset(): void {
    setSelectedId(null); setActiveGroup(''); setQuery('');
    onSelectionChange?.(null);
    rendererRef.current?.reset();
  }
  function selectStar(star: GalaxyStar, focus = true): void {
    setSelectedId(star.id); setQuery(''); setActiveGroup(galaxyGroup(star, taxonomy));
    onSelectionChange?.(star);
    if (searchRef.current) searchRef.current.open = false;
    if (focus) rendererRef.current?.focus(star, 7);
  }
  function selectGroup(name: string): void {
    const group = layout.clusters.find(cluster => cluster.name === name);
    if (!group) return;
    setSelectedId(null); setQuery(''); setActiveGroup(name);
    onSelectionChange?.(null);
    rendererRef.current?.focus(group, Math.min(5, (taxonomy === 'function' ? 440 : 520) / group.radius));
  }
  function switchTaxonomy(next: GalaxyTaxonomy): void {
    setTaxonomy(next);
    setActiveGroup('');
  }
  const handlers = useRef({ selectStar, selectGroup, reset });
  useEffect(() => { handlers.current = { selectStar, selectGroup, reset }; });
  useEffect(() => {
    const canvas = canvasRef.current, host = hostRef.current;
    if (!canvas || !host || !models.length) return;
    setError('');
    try {
      const renderer = new GalaxyRenderer(canvas, host, layouts.domain, {
        selectStar: star => handlers.current.selectStar(star, false),
        selectCluster: name => handlers.current.selectGroup(name),
        reset: () => handlers.current.reset(), zoomChanged: setZoom,
      });
      rendererRef.current = renderer;
      return () => { renderer.dispose(); rendererRef.current = null; };
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法创建星图画布。');
    }
  }, [layouts, models.length]);
  useEffect(() => { rendererRef.current?.setLayout(layout, taxonomy); }, [layout, taxonomy]);
  useEffect(() => {
    rendererRef.current?.setAppearance({ paused, labels, domain: activeGroup, matchIds, searching: !!query.trim(), selectedId: selectedId ?? '', recommendations: new Map() });
  }, [layout, paused, labels, activeGroup, matchIds, query, selectedId]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = (): void => {
      const detail = detailRef.current;
      const floating = detail && getComputedStyle(detail).position === 'absolute';
      rendererRef.current?.setInsets({ left: 0, top: host.clientWidth < 600 ? 150 : 12, right: floating ? detail.getBoundingClientRect().width + 28 : 0, bottom: host.clientWidth < 600 ? 100 : 20 });
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    if (detailRef.current) observer.observe(detailRef.current);
    update();
    return () => observer.disconnect();
  }, [layouts, selectedId, expanded]);
  useEffect(() => {
    if (selectedId && detailRef.current && getComputedStyle(detailRef.current).position === 'static') {
      detailRef.current.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [selectedId]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = (event: MediaQueryListEvent): void => setPaused(event.matches);
    preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape); expandButtonRef.current?.focus(); };
  }, [expanded]);

  const activeCluster = layout.clusters.find(cluster => cluster.name === activeGroup);
  return <section className={'galaxy-section' + (expanded ? ' galaxy-expanded' : '')} aria-label="交互式星图">
    <div className={'galaxy-frame' + (selected ? ' has-detail' : '')} data-taxonomy={taxonomy} data-model-count={models.length} data-selected-model={selectedId ?? ''}>
      <div className="galaxy-workbench">
        <div className="galaxy-viewport" ref={hostRef}>
          <AmbientBackground paused={paused} />
          <canvas className="galaxy-star-canvas" ref={canvasRef} tabIndex={0} aria-label="三维星图。拖动旋转，Shift加拖动或右键拖动平移，滚轮或双指缩放。方向键旋转，加减键缩放，Home恢复全景。可通过搜索和分类按钮选择模型。" />
          <div className="galaxy-intro"><span>EXPLORE THE MODEL UNIVERSE</span><p>每一颗星，都是一条记录。</p><small>在星系与星环之间，探索数据的两种组织方式。</small></div>
          <div className="galaxy-taxonomy" role="group" aria-label="星图分类体系">
            <span className="galaxy-taxonomy-thumb" aria-hidden="true" />
            <button aria-pressed={taxonomy === 'domain'} onClick={() => switchTaxonomy('domain')}><span className="taxonomy-spiral" aria-hidden="true">✧</span>领域星系</button>
            <button aria-pressed={taxonomy === 'function'} onClick={() => switchTaxonomy('function')}><Orbit size={14} />功能星环</button>
          </div>
          <div className="galaxy-toolbar">
            <details className="galaxy-local-search" ref={searchRef} onToggle={event => { if (event.currentTarget.open) event.currentTarget.querySelector('input')?.focus(); }}>
              <summary aria-label="搜索模型" title="搜索模型"><Search size={16} /><span>搜索模型</span></summary>
              <div className="galaxy-search">
                <input aria-label="搜索并定位模型星" placeholder="输入名称、ID、领域或功能…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
                  if (event.key === 'Enter' && matches[0]) selectStar(matches[0]);
                  if (event.key === 'Escape') { setQuery(''); if (searchRef.current) searchRef.current.open = false; }
                }} />
                {query && <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={15} /></button>}
                {query.trim() && <div className="galaxy-search-results" aria-live="polite">
                  <div>{matches.length ? `找到 ${matches.length} 颗模型星` : '没有找到匹配模型'}</div>
                  {matches.slice(0, 8).map(star => <button key={star.id} onClick={() => selectStar(star)}><span className="galaxy-color-dot" style={{ background: star.color }} /><span>{star.name}<small>{star.domain} · {star.task}</small></span><Focus size={12} /></button>)}
                  {matches.length > 8 && <small>显示前 8 项，请细化关键词。</small>}
                </div>}
              </div>
            </details>
            <div className="galaxy-toolbar-actions">
              <button aria-label={paused ? '开启动效' : '暂停动效'} title={paused ? '开启动效' : '暂停动效'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
              <button aria-label={labels ? '隐藏标签' : '显示标签'} title={labels ? '隐藏标签' : '显示标签'} onClick={() => setLabels(value => !value)}>{labels ? <Eye size={16} /> : <EyeOff size={16} />}</button>
              <button ref={expandButtonRef} aria-label={expanded ? '退出展开星图' : '展开星图'} title={expanded ? '退出展开星图' : '展开星图'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            </div>
          </div>
          {(error || !models.length) && <div className="galaxy-loading" role="alert">{error || '暂无记录。'}</div>}
          <div className="galaxy-view-caption"><span className="galaxy-live-dot" />{activeGroup || (taxonomy === 'domain' ? '领域星系' : '功能星环')}<small>{(activeCluster?.count ?? models.length).toLocaleString()} 颗模型星</small></div>
          <div className="galaxy-navigation"><div className="galaxy-navigation-row">
            <div className="galaxy-controls">
              <button aria-label="放大星图" onClick={() => rendererRef.current?.zoomBy(1.4)}><Plus size={17} /></button>
              <output aria-label="星图缩放比例">{Math.round(zoom * 100)}%</output>
              <button aria-label="缩小星图" onClick={() => rendererRef.current?.zoomBy(1 / 1.4)}><Minus size={17} /></button><span />
              <button aria-label="恢复星图全景" onClick={reset}><RotateCcw size={16} /></button>
            </div>
            <div className="galaxy-gesture"><Move size={12} />悬停暂停 · 拖动旋转 · 滚轮缩放</div>
          </div></div>
          <div className="galaxy-domain-strip" aria-label="按分组定位">
            <button className={!activeGroup ? 'active' : ''} onClick={reset}><span className="galaxy-color-dot" style={{ background: 'var(--accent)' }} />{taxonomy === 'domain' ? '全部星系' : '全部星环'}</button>
            {layout.clusters.map(cluster => <button className={activeGroup === cluster.name ? 'active' : ''} key={cluster.name} onClick={() => selectGroup(cluster.name)}><span className="galaxy-color-dot" style={{ background: cluster.color }} />{cluster.name}<small>{cluster.count}</small></button>)}
          </div>
        </div>
        {selected && <aside className="galaxy-detail-rail" aria-label="模型详情" ref={detailRef}>
          <div className="galaxy-detail-rail-heading"><span>模型详情</span><button aria-label="关闭模型详情" onClick={() => { setSelectedId(null); onSelectionChange?.(null); }}><X size={15} /></button></div>
          <h2>{selected.name}</h2><p className="model-id">{selected.id}</p>
          <dl className="model-fields"><dt>研究领域</dt><dd>{selected.domain}</dd><dt>模型功能</dt><dd>{selected.task}</dd><dt>记录年份</dt><dd>{selected.year ?? '未标注'}</dd><dt>接口数量</dt><dd>{selected.interface_count}</dd><dt>审核标记</dt><dd>{selected.reviewed ? '已标记' : '未标记'}</dd></dl>
        </aside>}
      </div>
      <div className="galaxy-footnote"><span>一星一记录 · 颜色区分{taxonomy === 'domain' ? '领域' : '功能'} · 当前演示使用合成数据</span><span>空间位置用于浏览布局，星点距离不表示模型相似度。</span></div>
    </div>
  </section>;
}
