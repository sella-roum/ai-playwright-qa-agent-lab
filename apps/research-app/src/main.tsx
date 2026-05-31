import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Status = '未着手' | '実行中' | '完了' | '保留' | '失敗';
type Priority = 'High' | 'Medium' | 'Low';
type Role = 'QA担当者' | '管理者' | '閲覧者';
type ResultStatus = 'Passed' | 'Failed' | 'Blocked' | 'Not Run';
type KnowledgeCategory = '仕様' | 'QA観点' | 'Playwright' | '不具合パターン' | '品質評価';
type ScenarioName = 'default' | 'empty' | 'large' | 'validation' | 'error' | 'slow';

type Scenario = {
  id: string;
  title: string;
  area: string;
  status: Status;
  priority: Priority;
  owner: string;
  updatedAt: string;
  description: string;
  risk: string;
  tags: string[];
  steps: string[];
  expectedResult: string;
};

type RunRecord = {
  id: string;
  scenarioId: string;
  assignee: string;
  result: ResultStatus;
  note: string;
  createdAt: string;
};

type KnowledgeItem = {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  source: string;
  updatedAt: string;
};

type Settings = {
  role: Role;
  slowMode: boolean;
  errorMode: boolean;
  scenario: ScenarioName;
};

type DraftScenario = {
  title: string;
  area: string;
  priority: Priority;
  owner: string;
  description: string;
  risk: string;
};

const DB_NAME = 'qa-scenario-lab-db';
const DB_VERSION = 1;
const STORE_SCENARIOS = 'scenarios';
const STORE_RUNS = 'runRecords';
const STORE_KNOWLEDGE = 'knowledgeItems';
const STORE_SETTINGS = 'settings';
const today = '2026-05-30';

const emptyDraft: DraftScenario = {
  title: '',
  area: '一覧',
  priority: 'Medium',
  owner: 'QA Agent',
  description: '',
  risk: ''
};

function makeScenarios(scenario: ScenarioName = 'default'): Scenario[] {
  if (scenario === 'empty') return [];

  const base: Scenario[] = [
    {
      id: 'SCN-001',
      title: 'テストケース一覧を検索できる',
      area: '一覧',
      status: '完了',
      priority: 'High',
      owner: 'QA Agent',
      updatedAt: today,
      description: 'キーワード入力により、テストケース一覧の表示対象を絞り込めることを確認する。',
      risk: '検索条件と一覧表示の不整合により、対象テストケースの見落としが発生する。',
      tags: ['search', 'list', 'smoke'],
      steps: ['一覧画面を開く', '検索欄に「検索」と入力する', '該当するテストケースのみ表示されることを確認する'],
      expectedResult: '検索語を含むシナリオだけが一覧に表示される。'
    },
    {
      id: 'SCN-002',
      title: 'ステータスで絞り込める',
      area: '一覧',
      status: '実行中',
      priority: 'Medium',
      owner: 'QA Agent',
      updatedAt: today,
      description: 'ステータスフィルタにより、対象の状態だけが一覧に残ることを確認する。',
      risk: 'フィルタ条件が複数画面でずれると、回帰確認対象を誤って判断する。',
      tags: ['filter', 'state'],
      steps: ['ステータスフィルタを開く', '実行中を選ぶ', '実行中の行だけ表示されることを確認する'],
      expectedResult: '選択したステータスのシナリオだけが表示される。'
    },
    {
      id: 'SCN-003',
      title: '詳細モーダルを表示できる',
      area: '詳細',
      status: '未着手',
      priority: 'High',
      owner: 'QA Agent',
      updatedAt: '2026-05-29',
      description: '一覧から詳細ボタンを押すと、対象テストケースの詳細情報がモーダル表示される。',
      risk: '詳細表示の情報不足により、QA観点や期待結果を誤って理解する。',
      tags: ['modal', 'detail', 'accessibility'],
      steps: ['一覧から詳細ボタンを押す', 'モーダルのタイトルと手順を確認する', '閉じるボタンで戻る'],
      expectedResult: '対象シナリオの説明、手順、期待結果、リスクが表示される。'
    },
    {
      id: 'SCN-004',
      title: '実行結果を登録できる',
      area: '登録',
      status: '保留',
      priority: 'Low',
      owner: 'QA Agent',
      updatedAt: '2026-05-28',
      description: '実行結果フォームで必須項目を入力すると、登録履歴に保存される。',
      risk: '実行結果が残らないと、品質判断の根拠を追えなくなる。',
      tags: ['form', 'validation', 'indexeddb'],
      steps: ['実行結果フォームを開く', 'シナリオ、担当者、結果、メモを入力する', '登録ボタンを押す'],
      expectedResult: 'IndexedDBに実行履歴が保存され、最近の登録に表示される。'
    },
    {
      id: 'SCN-005',
      title: '削除前に確認できる',
      area: '削除',
      status: '未着手',
      priority: 'Medium',
      owner: 'QA Agent',
      updatedAt: '2026-05-27',
      description: 'シナリオ削除時は確認ダイアログを表示し、誤削除を防ぐ。',
      risk: '確認なし削除により、検証データが意図せず失われる。',
      tags: ['delete', 'confirm'],
      steps: ['削除ボタンを押す', '確認ダイアログを確認する', 'キャンセルまたは削除を選ぶ'],
      expectedResult: '削除確認後にのみ対象シナリオが削除される。'
    },
    {
      id: 'SCN-006',
      title: '疑似ロールで操作可否が変わる',
      area: '権限風UI',
      status: '実行中',
      priority: 'High',
      owner: 'QA Agent',
      updatedAt: '2026-05-26',
      description: 'ログインを使わず、画面上の疑似ロール切替により操作可否を検証できる。',
      risk: 'ロール差分を見落とすと、権限別のQA観点が不足する。',
      tags: ['role', 'permission', 'no-auth'],
      steps: [
        '閲覧者ロールに切り替える',
        '作成・編集・削除が無効になることを確認する',
        '管理者に戻して操作できることを確認する'
      ],
      expectedResult: '閲覧者では更新系操作が無効になる。'
    }
  ];

  if (scenario === 'validation') {
    return base.map((item, index) => ({ ...item, status: index % 2 === 0 ? '未着手' : '保留' }));
  }
  if (scenario === 'error') {
    return base.map((item, index) => ({ ...item, status: index === 1 ? '失敗' : item.status }));
  }
  if (scenario === 'slow') {
    return base.map((item) => ({ ...item, tags: [...item.tags, 'slow-mode'] }));
  }
  if (scenario === 'large') {
    const extra = Array.from({ length: 18 }, (_, index): Scenario => {
      const n = index + 7;
      return {
        id: `SCN-${String(n).padStart(3, '0')}`,
        title: `大量データ検証シナリオ ${n}`,
        area: index % 3 === 0 ? '一覧' : index % 3 === 1 ? '登録' : '品質評価',
        status: ['未着手', '実行中', '完了', '保留'][index % 4] as Status,
        priority: ['High', 'Medium', 'Low'][index % 3] as Priority,
        owner: 'QA Agent',
        updatedAt: today,
        description: 'ページング、検索、フィルタ、表示件数の観点を増やすための大量データです。',
        risk: '一覧件数が増えたときに、表示順や検索結果が不安定になる。',
        tags: ['large', 'pagination', `case-${n}`],
        steps: ['大量データを投入する', '検索とフィルタを切り替える', '対象行が残ることを確認する'],
        expectedResult: '大量データでも一覧の操作が安定する。'
      };
    });
    return [...base, ...extra];
  }
  return base;
}

const seedKnowledge: KnowledgeItem[] = [
  {
    id: 'KNW-001',
    category: 'QA観点',
    title: '確認済み仕様と推測仕様を分ける',
    content:
      'AIエージェントは観測していない仕様を補完しやすいため、クリック探索で確認できた事実だけを仕様カタログの確認済み欄に入れる。',
    source: 'initial-seed',
    updatedAt: today
  },
  {
    id: 'KNW-002',
    category: 'Playwright',
    title: 'Locatorはユーザー視点を優先する',
    content: 'getByRole、getByLabel、getByTextを優先し、CSS selectorは最後の手段にする。XPathは原則使わない。',
    source: 'initial-seed',
    updatedAt: today
  },
  {
    id: 'KNW-003',
    category: '不具合パターン',
    title: 'IndexedDBの残存データはテストを不安定にする',
    content: 'テスト開始時にIndexedDBを初期化し、シナリオ別のデータを明示的に投入する。',
    source: 'initial-seed',
    updatedAt: today
  }
];

const defaultSettings: Settings = {
  role: 'QA担当者',
  slowMode: false,
  errorMode: false,
  scenario: 'default'
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SCENARIOS)) db.createObjectStore(STORE_SCENARIOS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_RUNS)) db.createObjectStore(STORE_RUNS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_KNOWLEDGE)) db.createObjectStore(STORE_KNOWLEDGE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    let value: T | undefined;
    if (request) {
      request.onsuccess = () => {
        value = request.result;
      };
      request.onerror = () => reject(request.error);
    }
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  return (await withStore<T[]>(storeName, 'readonly', (store) => store.getAll())) || [];
}

async function putAll<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => {
    for (const item of items) store.put(item);
  });
}

async function putItem<T extends { id: string }>(storeName: string, item: T): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.put(item));
}

async function deleteItem(storeName: string, id: string): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.delete(id));
}

async function clearStore(storeName: string): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.clear());
}

async function resetDatabase(scenario: ScenarioName): Promise<void> {
  await clearStore(STORE_SCENARIOS);
  await clearStore(STORE_RUNS);
  await clearStore(STORE_KNOWLEDGE);
  await putAll(STORE_SCENARIOS, makeScenarios(scenario));
  await putAll(STORE_KNOWLEDGE, seedKnowledge);
  await putItem(STORE_SETTINGS, { id: 'app-settings', ...defaultSettings, scenario });
}

async function readSettings(): Promise<Settings> {
  const stored = await withStore<Settings & { id: string }>(STORE_SETTINGS, 'readonly', (store) =>
    store.get('app-settings')
  );
  if (!stored) return defaultSettings;
  const { id: _id, ...settings } = stored;
  return { ...defaultSettings, ...settings };
}

async function saveSettings(settings: Settings): Promise<void> {
  await putItem(STORE_SETTINGS, { id: 'app-settings', ...settings });
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function App() {
  const [booting, setBooting] = useState(true);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'すべて' | Status>('すべて');
  const [priority, setPriority] = useState<'すべて' | Priority>('すべて');
  const [sortKey, setSortKey] = useState<'updatedAt' | 'priority' | 'id'>('id');
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [draft, setDraft] = useState<DraftScenario>(emptyDraft);
  const [runScenarioId, setRunScenarioId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [result, setResult] = useState<ResultStatus>('Passed');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'scenarios' | 'runs' | 'knowledge' | 'settings'>('scenarios');

  const canEdit = settings.role !== '閲覧者';

  const loadAll = async () => {
    const [nextSettings, nextScenarios, nextRuns, nextKnowledge] = await Promise.all([
      readSettings(),
      getAll<Scenario>(STORE_SCENARIOS),
      getAll<RunRecord>(STORE_RUNS),
      getAll<KnowledgeItem>(STORE_KNOWLEDGE)
    ]);
    setSettings(nextSettings);
    setScenarios(nextScenarios);
    setRuns(nextRuns.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setKnowledge(nextKnowledge.sort((a, b) => a.id.localeCompare(b.id)));
    if (!runScenarioId && nextScenarios[0]) setRunScenarioId(nextScenarios[0].id);
  };

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const scenario = (params.get('scenario') || 'default') as ScenarioName;
      const shouldReset = params.get('reset') === '1';
      const existingScenarios = await getAll<Scenario>(STORE_SCENARIOS);
      if (shouldReset || existingScenarios.length === 0) await resetDatabase(scenario);
      await loadAll();
      setBooting(false);
    })().catch((error) => {
      setErrors([`初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`]);
      setBooting(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const rank: Record<Priority, number> = { High: 1, Medium: 2, Low: 3 };
    return scenarios
      .filter((scenario) => {
        const matchesQuery = [scenario.id, scenario.title, scenario.area, scenario.owner, scenario.tags.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesStatus = status === 'すべて' || scenario.status === status;
        const matchesPriority = priority === 'すべて' || scenario.priority === priority;
        return matchesQuery && matchesStatus && matchesPriority;
      })
      .sort((a, b) => {
        if (sortKey === 'priority') return rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id);
        if (sortKey === 'updatedAt') return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
        return a.id.localeCompare(b.id);
      });
  }, [scenarios, query, status, priority, sortKey]);

  const saveScenario = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: string[] = [];
    if (!canEdit) nextErrors.push('閲覧者ロールではシナリオを保存できません');
    if (!draft.title.trim()) nextErrors.push('タイトルは必須です');
    if (!draft.description.trim()) nextErrors.push('説明は必須です');
    if (settings.errorMode) nextErrors.push('エラー注入が有効なため保存に失敗しました');
    if (nextErrors.length) {
      setErrors(nextErrors);
      setMessage('');
      return;
    }
    if (settings.slowMode) await delay(600);
    const scenario: Scenario = {
      id: editing?.id || makeId('SCN'),
      title: draft.title,
      area: draft.area,
      status: editing?.status || '未着手',
      priority: draft.priority,
      owner: draft.owner,
      updatedAt: today,
      description: draft.description,
      risk: draft.risk || '未評価',
      tags: editing?.tags || ['ai-generated'],
      steps: editing?.steps || ['事前条件を確認する', '対象操作を実行する', '期待結果を確認する'],
      expectedResult: editing?.expectedResult || '仕様どおりに画面状態が変化する。'
    };
    await putItem(STORE_SCENARIOS, scenario);
    setDraft(emptyDraft);
    setEditing(null);
    setErrors([]);
    setMessage(editing ? 'シナリオを更新しました' : 'シナリオを作成しました');
    await loadAll();
  };

  const editScenario = (scenario: Scenario) => {
    setEditing(scenario);
    setDraft({
      title: scenario.title,
      area: scenario.area,
      priority: scenario.priority,
      owner: scenario.owner,
      description: scenario.description,
      risk: scenario.risk
    });
    setActiveTab('scenarios');
  };

  const removeScenario = async (scenario: Scenario) => {
    if (!canEdit) {
      setErrors(['閲覧者ロールではシナリオを削除できません']);
      return;
    }
    if (!window.confirm(`${scenario.id} を削除しますか？`)) return;
    await deleteItem(STORE_SCENARIOS, scenario.id);
    setMessage(`${scenario.id} を削除しました`);
    await loadAll();
  };

  const saveRun = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: string[] = [];
    if (!runScenarioId) nextErrors.push('対象シナリオは必須です');
    if (!assignee.trim()) nextErrors.push('担当者は必須です');
    if (!note.trim()) nextErrors.push('実行メモは必須です');
    if (settings.errorMode) nextErrors.push('エラー注入が有効なため実行結果の保存に失敗しました');
    if (nextErrors.length) {
      setErrors(nextErrors);
      setMessage('');
      return;
    }
    if (settings.slowMode) await delay(600);
    await putItem(STORE_RUNS, {
      id: makeId('RUN'),
      scenarioId: runScenarioId,
      assignee,
      result,
      note,
      createdAt: new Date().toISOString()
    });
    setErrors([]);
    setMessage('実行結果をIndexedDBに登録しました');
    setAssignee('');
    setNote('');
    await loadAll();
  };

  const updateSettings = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    await saveSettings(next);
    setSettings(next);
  };

  const resetScenario = async (scenario: ScenarioName) => {
    await resetDatabase(scenario);
    setMessage(`${scenario} データセットを投入しました`);
    setErrors([]);
    await loadAll();
  };

  if (booting) {
    return (
      <main className="shell">
        <p role="status" className="loading">
          IndexedDBを初期化しています。
        </p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">AI Playwright QA Agent Lab</p>
        <h1>QA Scenario Lab</h1>
        <p>
          AIエージェントがブラウザ探索、仕様化、Playwright実装、失敗修復を練習し、QA知見を蓄積するための研究用アプリです。
        </p>
        <div className="heroActions" aria-label="現在の検証設定">
          <span>DB: IndexedDB</span>
          <span>認証: なし</span>
          <span>疑似ロール: {settings.role}</span>
          {settings.slowMode && <span>遅延注入: 有効</span>}
          {settings.errorMode && <span>エラー注入: 有効</span>}
        </div>
      </header>

      <section className="grid" aria-label="ダッシュボード">
        <article className="card">
          <span className="metric">{scenarios.length}</span>
          <span>総シナリオ数</span>
        </article>
        <article className="card">
          <span className="metric">{scenarios.filter((s) => s.priority === 'High').length}</span>
          <span>High優先度</span>
        </article>
        <article className="card">
          <span className="metric">{runs.length}</span>
          <span>実行履歴</span>
        </article>
        <article className="card">
          <span className="metric">{knowledge.length}</span>
          <span>QA知見</span>
        </article>
      </section>

      <nav className="tabs" aria-label="研究用アプリの機能切替">
        <button
          type="button"
          className={activeTab === 'scenarios' ? 'active' : ''}
          onClick={() => setActiveTab('scenarios')}
        >
          シナリオ管理
        </button>
        <button type="button" className={activeTab === 'runs' ? 'active' : ''} onClick={() => setActiveTab('runs')}>
          実行結果
        </button>
        <button
          type="button"
          className={activeTab === 'knowledge' ? 'active' : ''}
          onClick={() => setActiveTab('knowledge')}
        >
          QA知見
        </button>
        <button
          type="button"
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          検証設定
        </button>
      </nav>

      {errors.length > 0 && (
        <div role="alert" className="errorBox">
          <strong>確認してください</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {message && (
        <p role="status" className="successBox">
          {message}
        </p>
      )}

      {activeTab === 'scenarios' && (
        <>
          <section className="panel" aria-labelledby="scenario-list-heading">
            <div className="panelHeader">
              <div>
                <h2 id="scenario-list-heading">テストケース一覧</h2>
                <p>IndexedDBに保存されたシナリオを検索、絞り込み、編集、削除できます。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatus('すべて');
                  setPriority('すべて');
                }}
                className="secondaryButton"
              >
                条件をクリア
              </button>
            </div>

            <div className="filters" role="search">
              <label>
                検索キーワード
                <input
                  aria-label="検索キーワード"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ID、タイトル、領域、タグで検索"
                />
              </label>
              <label>
                ステータス
                <select
                  aria-label="ステータス"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as 'すべて' | Status)}
                >
                  <option>すべて</option>
                  <option>未着手</option>
                  <option>実行中</option>
                  <option>完了</option>
                  <option>保留</option>
                  <option>失敗</option>
                </select>
              </label>
              <label>
                優先度
                <select
                  aria-label="優先度"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as 'すべて' | Priority)}
                >
                  <option>すべて</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </label>
              <label>
                並び順
                <select
                  aria-label="並び順"
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as 'updatedAt' | 'priority' | 'id')}
                >
                  <option value="id">ID</option>
                  <option value="priority">優先度</option>
                  <option value="updatedAt">更新日</option>
                </select>
              </label>
            </div>

            {filtered.length === 0 ? (
              <p role="status" className="empty">
                条件に一致するテストケースはありません。
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>タイトル</th>
                    <th>領域</th>
                    <th>ステータス</th>
                    <th>優先度</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((scenario) => (
                    <tr key={scenario.id}>
                      <td>{scenario.id}</td>
                      <td>{scenario.title}</td>
                      <td>{scenario.area}</td>
                      <td>
                        <span className="badge">{scenario.status}</span>
                      </td>
                      <td>{scenario.priority}</td>
                      <td className="actions">
                        <button
                          type="button"
                          onClick={() => setSelected(scenario)}
                          aria-label={`${scenario.id} の詳細を開く`}
                        >
                          詳細
                        </button>
                        <button
                          type="button"
                          className="secondaryButton"
                          disabled={!canEdit}
                          onClick={() => editScenario(scenario)}
                          aria-label={`${scenario.id} を編集する`}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="dangerButton"
                          disabled={!canEdit}
                          onClick={() => removeScenario(scenario)}
                          aria-label={`${scenario.id} を削除する`}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel" aria-labelledby="scenario-form-heading">
            <h2 id="scenario-form-heading">{editing ? 'シナリオ編集' : 'シナリオ作成'}</h2>
            <form onSubmit={saveScenario} noValidate>
              <label>
                タイトル
                <input
                  aria-label="シナリオタイトル"
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </label>
              <label>
                領域
                <input
                  aria-label="領域"
                  value={draft.area}
                  onChange={(event) => setDraft({ ...draft, area: event.target.value })}
                />
              </label>
              <label>
                優先度
                <select
                  aria-label="作成フォーム優先度"
                  value={draft.priority}
                  onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}
                >
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </label>
              <label>
                担当者
                <input
                  aria-label="シナリオ担当者"
                  value={draft.owner}
                  onChange={(event) => setDraft({ ...draft, owner: event.target.value })}
                />
              </label>
              <label>
                説明
                <textarea
                  aria-label="シナリオ説明"
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              <label>
                リスク
                <textarea
                  aria-label="シナリオリスク"
                  value={draft.risk}
                  onChange={(event) => setDraft({ ...draft, risk: event.target.value })}
                />
              </label>
              <div className="formActions">
                <button type="submit" disabled={!canEdit}>
                  {editing ? '更新' : '作成'}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => {
                      setEditing(null);
                      setDraft(emptyDraft);
                    }}
                  >
                    キャンセル
                  </button>
                )}
              </div>
            </form>
          </section>
        </>
      )}

      {activeTab === 'runs' && (
        <section className="panel" aria-labelledby="run-form-heading">
          <h2 id="run-form-heading">実行結果登録</h2>
          <form onSubmit={saveRun} noValidate>
            <label>
              対象シナリオ
              <select
                aria-label="対象シナリオ"
                value={runScenarioId}
                onChange={(event) => setRunScenarioId(event.target.value)}
              >
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.id} {scenario.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              担当者
              <input value={assignee} onChange={(event) => setAssignee(event.target.value)} aria-label="担当者" />
            </label>
            <label>
              結果
              <select
                aria-label="実行結果"
                value={result}
                onChange={(event) => setResult(event.target.value as ResultStatus)}
              >
                <option>Passed</option>
                <option>Failed</option>
                <option>Blocked</option>
                <option>Not Run</option>
              </select>
            </label>
            <label>
              実行メモ
              <textarea value={note} onChange={(event) => setNote(event.target.value)} aria-label="実行メモ" />
            </label>
            <button type="submit">登録</button>
          </form>
          <div className="history">
            <h3>最近の登録</h3>
            {runs.length === 0 ? (
              <p className="empty">実行履歴はまだありません。</p>
            ) : (
              <ul>
                {runs.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <strong>{item.result}</strong> {item.scenarioId} / {item.assignee} / {item.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {activeTab === 'knowledge' && (
        <section className="panel" aria-labelledby="knowledge-heading">
          <h2 id="knowledge-heading">QA知見ライブラリ</h2>
          <p>
            アプリ仕様、QA観点、Playwright実装、失敗修復の知見を蓄積するための表示です。永続的な研究ログはGitHub側の
            qa-knowledge/ に保存します。
          </p>
          <div className="knowledgeGrid">
            {knowledge.map((item) => (
              <article className="knowledgeCard" key={item.id}>
                <p className="eyebrow">{item.category}</p>
                <h3>{item.title}</h3>
                <p>{item.content}</p>
                <small>
                  {item.source} / {item.updatedAt}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'settings' && (
        <section className="panel" aria-labelledby="settings-heading">
          <h2 id="settings-heading">検証設定</h2>
          <div className="settingsGrid">
            <label>
              疑似ロール
              <select
                aria-label="疑似ロール"
                value={settings.role}
                onChange={(event) => updateSettings({ role: event.target.value as Role })}
              >
                <option>QA担当者</option>
                <option>管理者</option>
                <option>閲覧者</option>
              </select>
            </label>
            <label>
              データセット
              <select
                aria-label="データセット"
                value={settings.scenario}
                onChange={(event) => resetScenario(event.target.value as ScenarioName)}
              >
                <option value="default">default</option>
                <option value="empty">empty</option>
                <option value="large">large</option>
                <option value="validation">validation</option>
                <option value="error">error</option>
                <option value="slow">slow</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.slowMode}
                onChange={(event) => updateSettings({ slowMode: event.target.checked })}
              />{' '}
              遅延注入を有効にする
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.errorMode}
                onChange={(event) => updateSettings({ errorMode: event.target.checked })}
              />{' '}
              エラー注入を有効にする
            </label>
          </div>
          <button type="button" className="dangerButton" onClick={() => resetScenario(settings.scenario)}>
            IndexedDBを初期化して再投入
          </button>
        </section>
      )}

      {selected && (
        <div role="dialog" aria-modal="true" aria-labelledby="scenario-dialog-title" className="modalBackdrop">
          <section className="modal">
            <div className="modalHeader">
              <div>
                <p className="eyebrow">{selected.id}</p>
                <h2 id="scenario-dialog-title">{selected.title}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="詳細モーダルを閉じる">
                閉じる
              </button>
            </div>
            <p>{selected.description}</p>
            <h3>確認手順</h3>
            <ol>
              {selected.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <h3>期待結果</h3>
            <p>{selected.expectedResult}</p>
            <h3>リスク</h3>
            <p>{selected.risk}</p>
            <dl className="details">
              <div>
                <dt>領域</dt>
                <dd>{selected.area}</dd>
              </div>
              <div>
                <dt>ステータス</dt>
                <dd>{selected.status}</dd>
              </div>
              <div>
                <dt>優先度</dt>
                <dd>{selected.priority}</dd>
              </div>
              <div>
                <dt>更新日</dt>
                <dd>{selected.updatedAt}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
