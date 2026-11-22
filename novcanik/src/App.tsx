import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import './style.css';
import './accounts.css';

type Kind = 'expense' | 'income';
type Entry = { id: string; title: string; category: string; amount: number; date: string; kind: Kind; account?: string; repeat?: boolean; shared?: boolean; source?: string };
type Goal = { name: string; saved: number; target: number };
type Stored = { entries: Entry[]; budgets: Record<string, number>; goals: Goal[]; accounts: { name: string; balance: number }[] };

const KEY = 'novcanik-v1';
const categories = ['Hrana', 'Stanovanje', 'Prijevoz', 'Pretplate', 'Zabava', 'Zdravlje', 'Plaća', 'Ostalo'];
const today = new Date().toISOString().slice(0, 10);
const seed: Stored = {
  accounts: [{ name: 'Tekući račun', balance: 2420 }, { name: 'Gotovina', balance: 140 }, { name: 'Štednja', balance: 280 }],
  entries: [
    { id: '1', title: 'Plaća', category: 'Plaća', amount: 1850, date: today, kind: 'income', account: 'Tekući račun' },
    { id: '2', title: 'Konzum', category: 'Hrana', amount: 42.8, date: today, kind: 'expense', account: 'Tekući račun', shared: true },
    { id: '3', title: 'Najam stana', category: 'Stanovanje', amount: 620, date: today, kind: 'expense', account: 'Tekući račun', repeat: true },
    { id: '4', title: 'Spotify', category: 'Pretplate', amount: 10.99, date: today, kind: 'expense', account: 'Tekući račun', repeat: true },
    { id: '5', title: 'ZET mjesečna', category: 'Prijevoz', amount: 53, date: today, kind: 'expense', account: 'Gotovina' },
  ],
  budgets: { Hrana: 320, Stanovanje: 700, Prijevoz: 100, Pretplate: 45, Zabava: 120 },
  goals: [{ name: 'Putovanje u Portugal', saved: 640, target: 1200 }],
};
const money = (amount: number) => new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(amount);
const icon = (symbol: string) => <span className="wallet-icon" aria-hidden="true">{symbol}</span>;

function readData(): Stored {
  try {
    const saved = localStorage.getItem(KEY);
    const data = saved ? { ...seed, ...JSON.parse(saved) as Partial<Stored> } : seed;
    const thisMonth = today.slice(0, 7);
    const entries = [...data.entries];
    for (const recurring of data.entries.filter(item => item.repeat && item.date.slice(0, 7) !== thisMonth)) {
      if (entries.some(item => item.repeat && item.title === recurring.title && item.date.slice(0, 7) === thisMonth)) continue;
      const day = Math.min(Number(recurring.date.slice(8, 10)), new Date(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5)), 0).getDate());
      entries.push({ ...recurring, id: crypto.randomUUID(), date: `${thisMonth}-${String(day).padStart(2, '0')}` });
    }
    return { ...data, entries };
  } catch { return seed; }
}

export default function FinanceApp() {
  const [data, setData] = useState<Stored>(readData);
  const [page, setPage] = useState<'Pregled' | 'Transakcije' | 'Računi' | 'Plan'>('Pregled');
  const [modal, setModal] = useState(false);
  const [kind, setKind] = useState<Kind>('expense');
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [toast, setToast] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('0');
  const [scanner, setScanner] = useState(false);
  const [qr, setQr] = useState('');
  const [scanError, setScanError] = useState('');
  const [form, setForm] = useState({ title: '', amount: '', category: 'Hrana', date: today, account: 'Tekući račun', repeat: false, shared: false });
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(data)); }, [data]);
  useEffect(() => () => controlsRef.current?.stop(), []);
  useEffect(() => {
    if (!scanner) return;
    let active = true;
    void import('@zxing/browser').then(({ BrowserQRCodeReader }) => {
      if (!active) return;
      const reader = readerRef.current ?? new BrowserQRCodeReader();
      readerRef.current = reader;
      return reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, result => {
        if (active && result) { setQr(result.getText()); closeScanner(); }
      }).then(controls => {
        if (active) controlsRef.current = controls; else controls.stop();
      });
    }).catch(() => { if (active) setScanError('Kamera nije dostupna ili joj pristup nije dopušten. Učitaj fotografiju računa ili unesi podatke ručno.'); });
    return () => { active = false; controlsRef.current?.stop(); controlsRef.current = null; };
  }, [scanner]);

  const monthEntries = useMemo(() => data.entries.filter(item => item.date.slice(0, 7) === month), [data.entries, month]);
  const accountBalance = data.accounts.reduce((sum, account) => sum + account.balance, 0);
  const expenses = monthEntries.filter(item => item.kind === 'expense').reduce((sum, item) => sum + item.amount, 0);
  const income = monthEntries.filter(item => item.kind === 'income').reduce((sum, item) => sum + item.amount, 0);
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const isCurrentMonth = month === today.slice(0, 7);
  const remaining = isCurrentMonth ? Math.max(0, daysInMonth - new Date().getDate()) : 0;
  const elapsed = isCurrentMonth ? Math.max(1, daysInMonth - remaining) : daysInMonth;
  const forecast = Math.max(0, accountBalance + income - expenses - (expenses / elapsed) * remaining);
  const visibleEntries = monthEntries.filter(item => `${item.title} ${item.category}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  const budgetSpent = (category: string) => monthEntries.filter(item => item.kind === 'expense' && item.category === category).reduce((sum, item) => sum + item.amount, 0);
  const chartMax = Math.max(1, ...(['income', 'expense'] as const).flatMap(kind => [1, 5, 10, 15, 20, 25, daysInMonth].map(day => monthEntries.filter(item => item.kind === kind && Number(item.date.slice(8, 10)) <= day).reduce((sum, item) => sum + item.amount, 0))));
  const chartPath = (kind: Kind) => [1, 5, 10, 15, 20, 25, daysInMonth].map((day, i) => {
    const value = monthEntries.filter(item => item.kind === kind && Number(item.date.slice(8, 10)) <= day).reduce((sum, item) => sum + item.amount, 0);
    return `${i ? 'L' : 'M'}${i * 100} ${176 - value / chartMax * 155}`;
  }).join(' ');

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 2600); }
  function closeScanner() { controlsRef.current?.stop(); controlsRef.current = null; setScanner(false); }
  function openScanner() { setScanError(''); setQr(''); setScanner(true); }
  async function decodeImage(file?: File) {
    if (!file) return;
    setScanError(''); setQr('');
    const imageUrl = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = readerRef.current ?? new BrowserQRCodeReader();
      readerRef.current = reader;
      const result = await reader.decodeFromImageUrl(imageUrl);
      setQr(result.getText());
    } catch { setScanError('Nije moguće pročitati fotografiju. Pokušaj ponovno ili unesi račun ručno.'); }
    finally { URL.revokeObjectURL(imageUrl); }
  }
  function saveEntry(event: FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount.replace(',', '.'));
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setData(current => ({ ...current, entries: [{ id: crypto.randomUUID(), title: form.title.trim(), amount, category: form.category, date: form.date, account: form.account, kind, repeat: form.repeat, shared: form.shared, source: qr ? 'QR pregledan' : undefined }, ...current.entries] }));
    setModal(false); closeScanner(); setQr(''); setForm({ title: '', amount: '', category: kind === 'income' ? 'Plaća' : 'Hrana', date: today, account: data.accounts[0]?.name ?? '', repeat: false, shared: false }); notify('Transakcija je spremljena na ovom uređaju.');
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'novcanik-podaci.json'; link.click(); URL.revokeObjectURL(link.href); notify('Podaci su izvezeni.');
  }
  function resetDemo() {
    if (!window.confirm('Vratiti demo podatke? Trenutne lokalne promjene bit će zamijenjene.')) return;
    setData(seed); notify('Demo podaci su vraćeni.');
  }

  return <div className="wallet-app">
    <aside className="wallet-sidebar">
      <a className="wallet-brand" href="/finance">{icon('◈')}<span>novčanik<small>osobne financije</small></span></a>
      <div className="wallet-profile"><span className="wallet-avatar">M</span><span><b>Moj novčanik</b><small>Osobni račun</small></span><span className="wallet-dots">•••</span></div>
      <span className="wallet-label">IZBORNIK</span>
      <nav>{(['Pregled', 'Transakcije', 'Računi', 'Plan'] as const).map((name, i) => <button key={name} className={page === name ? 'active' : ''} onClick={() => setPage(name)}>{icon(['⌂', '↕', '▤', '◷'][i])}{name}</button>)}</nav>
      <div className="wallet-sidebar-bottom"><div className="wallet-privacy">{icon('♧')}<div><b>Vaši podaci ostaju vaši</b><small>Spremaju se samo u ovom pregledniku.</small></div></div><button className="wallet-export" onClick={exportData}>↗ Izvezi moje podatke</button></div>
    </aside>
    <main className="wallet-main">
      <header className="wallet-topbar"><div className="wallet-breadcrumb">Moj novčanik <span>/</span> <b>{page}</b></div><div className="wallet-top-actions"><button className="wallet-icon-button" onClick={() => notify('Sve je ažurirano.')}>♧</button><span className="wallet-top-avatar">M</span></div></header>
      <div className="wallet-content">
        <section className="wallet-heading"><div><div className="wallet-eyebrow">{new Intl.DateTimeFormat('hr-HR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()}</div><h1>{page === 'Pregled' ? 'Dobar dan, Martina 👋' : page}</h1><p>{page === 'Pregled' ? 'Evo kako stoje tvoje financije ovaj mjesec.' : page === 'Transakcije' ? 'Pregledaj i pronađi svoje prihode i troškove.' : page === 'Računi' ? 'Prati stanje na svojim računima i novčanicima.' : 'Postavi granice i prati što ti je važno.'}</p></div><div className="wallet-heading-actions"><label className="wallet-month">▦ <input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label><button className="wallet-primary" onClick={() => { setKind('expense'); setModal(true); }}>＋ <span>Dodaj trošak</span></button></div></section>
        <div className="wallet-demo-notice">Demo podaci su izmišljeni. Uneseni podaci ostaju spremljeni u ovom pregledniku.</div>
        {page === 'Pregled' && <>
          <div className="wallet-cards">
            <article className="wallet-balance"><div className="wallet-card-top"><span>Ukupno stanje</span><span className="wallet-card-glyph">◉</span></div><strong>{money(accountBalance + income - expenses)}</strong><div className="wallet-balance-foot"><span>↗ {income ? `${Math.round((income - expenses) / Math.max(income, 1) * 100)}%` : '0%'} ovaj mjesec</span><span>na svim računima</span></div><div className="wallet-spark"><svg viewBox="0 0 330 55" preserveAspectRatio="none"><path d="M0 45 C30 40 35 15 70 25 S120 40 145 20 S180 45 215 18 S270 35 300 7 S320 18 330 4" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2"/></svg></div></article>
            <article className="wallet-stat"><div className="wallet-card-top"><span>Prihodi</span><span className="wallet-round-icon income">↙</span></div><strong>{money(income)}</strong><div className="wallet-stat-foot"><span className="wallet-tag green">↑ {income ? 'redovni' : 'nema'}</span><small>u ovom mjesecu</small></div><div className="wallet-mini-bars"><i style={{height:'45%'}}/><i style={{height:'60%'}}/><i style={{height:'40%'}}/><i style={{height:'76%'}}/><i style={{height:'55%'}}/><i style={{height:'88%'}}/><i style={{height:'70%'}}/></div></article>
            <article className="wallet-stat"><div className="wallet-card-top"><span>Troškovi</span><span className="wallet-round-icon expense">↗</span></div><strong>{money(expenses)}</strong><div className="wallet-stat-foot"><span className="wallet-tag orange">{income ? `${Math.round(expenses / income * 100)}% prihoda` : '—'}</span><small>u ovom mjesecu</small></div><div className="wallet-mini-bars rose"><i style={{height:'55%'}}/><i style={{height:'35%'}}/><i style={{height:'72%'}}/><i style={{height:'50%'}}/><i style={{height:'82%'}}/><i style={{height:'60%'}}/><i style={{height:'44%'}}/></div></article>
          </div>
          <div className="wallet-forecast">{icon('✳')}<p><b>Procjena do kraja mjeseca</b><span>Ako nastaviš trošiti ovim tempom, ostat će ti približno <strong>{money(forecast)}</strong>. Računamo prema trenutačno unesenim transakcijama.</span></p><span className="wallet-forecast-note">{remaining} dana preostalo</span></div>
          <div className="wallet-grid">
            <section className="wallet-panel wallet-flow"><div className="wallet-panel-head"><div><h2>Novčani tok</h2><p>Prihodi i troškovi kroz mjesec</p></div><button onClick={() => setPage('Transakcije')}>Ovaj mjesec⌄</button></div><div className="wallet-chart-legend"><span><i className="income-dot"/>Prihodi</span><span><i className="expense-dot"/>Troškovi</span></div><div className="wallet-chart"><div className="wallet-ylabels"><span>{money(chartMax)}</span><span>{money(chartMax * .75)}</span><span>{money(chartMax * .5)}</span><span>{money(chartMax * .25)}</span><span>0 €</span></div><svg viewBox="0 0 600 190" preserveAspectRatio="none" aria-label="Kumulativni novčani tok prema unesenim transakcijama"><path d={chartPath('income')} fill="none" stroke="#35a886" strokeWidth="3"/><path d={chartPath('expense')} fill="none" stroke="#f08b6d" strokeWidth="3"/></svg><div className="wallet-xlabels"><span>1.</span><span>5.</span><span>10.</span><span>15.</span><span>20.</span><span>25.</span><span>{daysInMonth}.</span></div></div></section>
            <section className="wallet-panel wallet-budget"><div className="wallet-panel-head"><div><h2>Mjesečni budžet</h2><p>Potrošnja po kategorijama</p></div><button onClick={() => setPage('Plan')}>Uredi</button></div>{Object.entries(data.budgets).slice(0, 4).map(([category, limit], i) => { const spent = budgetSpent(category); const pct = Math.min(100, spent / limit * 100); return <div className="wallet-budget-row" key={category}><div className="wallet-budget-title"><span className={`wallet-budget-icon c${i}`}>{['⌂','⌂','↗','◉'][i]}</span><b>{category}</b><small>{money(spent)} <em>/ {money(limit)}</em></small></div><div className="wallet-progress"><i className={`p${i}`} style={{ width: `${pct}%` }}/></div></div>; })}<button className="wallet-link" onClick={() => setPage('Plan')}>Prikaži sve kategorije →</button></section>
          </div>
          <div className="wallet-grid wallet-lower">
            <section className="wallet-panel wallet-transactions"><div className="wallet-panel-head"><div><h2>Nedavne transakcije</h2><p>Tvoje posljednje aktivnosti</p></div><button onClick={() => setPage('Transakcije')}>Sve transakcije →</button></div><EntryList entries={visibleEntries.slice(0, 5)} /></section>
            <section className="wallet-panel wallet-goals"><div className="wallet-panel-head"><div><h2>Ciljevi štednje</h2><p>Mali koraci, veliki planovi</p></div><button onClick={() => setPage('Plan')}>＋</button></div>{data.goals.map(goal => <div className="wallet-goal" key={goal.name}><div className="wallet-goal-pic">✈</div><b>{goal.name}</b><div className="wallet-goal-amount"><strong>{money(goal.saved)}</strong><span>od {money(goal.target)}</span></div><div className="wallet-progress"><i className="goal-progress" style={{ width: `${Math.min(100, goal.saved / goal.target * 100)}%` }}/></div><small>Još {money(Math.max(0, goal.target - goal.saved))} do cilja</small></div>)}</section>
          </div>
        </>}
        {page === 'Transakcije' && <section className="wallet-panel wallet-transactions-page"><div className="wallet-panel-head"><div><h2>Sve transakcije</h2><p>{visibleEntries.length} zapisa za odabrani mjesec</p></div><label className="wallet-search">⌕ <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pretraži transakcije..." /></label></div><EntryList entries={visibleEntries} onDelete={id => setData(v => ({ ...v, entries: v.entries.filter(entry => entry.id !== id) }))} /></section>}
        {page === 'Računi' && <section className="wallet-panel"><div className="wallet-panel-head"><div><h2>Moji računi</h2><p>Stanja su početni iznosi i ažuriraju se prema unesenim transakcijama.</p></div></div><div className="wallet-account-list">{data.accounts.map((account, i) => <div className="wallet-account-row" key={`${account.name}-${i}`}><span className={`wallet-entry-icon e${i % 5}`}>▤</span><b>{account.name}</b><strong>{money(account.balance)}</strong><button className="wallet-delete" aria-label={`Ukloni račun ${account.name}`} onClick={() => setData(v => ({ ...v, accounts: v.accounts.filter((_, n) => n !== i) }))}>×</button></div>)}</div><form className="wallet-add-account" onSubmit={e => { e.preventDefault(); if (!newAccount.trim()) return; setData(v => ({ ...v, accounts: [...v.accounts, { name: newAccount.trim(), balance: Number(newAccountBalance.replace(',', '.')) || 0 }] })); setForm(v => ({ ...v, account: newAccount.trim() })); setNewAccount(''); setNewAccountBalance('0'); }}><input value={newAccount} onChange={e => setNewAccount(e.target.value)} placeholder="Naziv računa" aria-label="Naziv računa" required/><input value={newAccountBalance} onChange={e => setNewAccountBalance(e.target.value)} type="number" step="0.01" aria-label="Početno stanje"/><button className="wallet-primary">＋ Dodaj račun</button></form></section>}
        {page === 'Plan' && <div className="wallet-plan-grid"><section className="wallet-panel"><div className="wallet-panel-head"><div><h2>Budžeti po kategorijama</h2><p>Postavi mjesečnu granicu potrošnje</p></div></div>{Object.entries(data.budgets).map(([category, limit]) => <label className="wallet-edit-row" key={category}><span>{category}<small>Potrošeno {money(budgetSpent(category))}</small></span><span className="wallet-edit-input"><input type="number" min="0" value={limit} onChange={e => setData(v => ({ ...v, budgets: { ...v.budgets, [category]: Number(e.target.value) } }))}/> €</span></label>)}</section><section className="wallet-panel"><div className="wallet-panel-head"><div><h2>Ciljevi štednje</h2><p>Prati napredak prema svojim planovima</p></div></div>{data.goals.map((goal, i) => <div className="wallet-goal-card" key={goal.name}><b>✧ {goal.name}</b><small>{money(goal.saved)} od {money(goal.target)}</small><input aria-label={`Ušteđeno za ${goal.name}`} type="range" min="0" max={goal.target} value={goal.saved} onChange={e => setData(v => ({ ...v, goals: v.goals.map((g, n) => n === i ? { ...g, saved: Number(e.target.value) } : g) }))}/></div>)}<button className="wallet-primary" onClick={() => setData(v => ({ ...v, goals: [...v.goals, { name: 'Novi cilj', saved: 0, target: 500 }] }))}>＋ Dodaj cilj</button><button className="wallet-export wallet-reset" onClick={resetDemo}>Vrati demo podatke</button><button className="wallet-delete-all" onClick={() => { if (window.confirm('Obrisati sve lokalno spremljene podatke? Ova se radnja ne može poništiti.')) setData({ accounts: [], entries: [], budgets: {}, goals: [] }); }}>Obriši sve moje podatke</button></section></div>}
        <footer className="wallet-footer">Novčanik sprema podatke lokalno na ovom uređaju <span>·</span> Nema bankovnih povezivanja <button onClick={exportData}>Izvoz podataka</button></footer>
      </div>
    </main>
      <nav className="wallet-mobile-nav">{(['Pregled', 'Transakcije', 'Računi', 'Plan'] as const).map((name, i) => <button key={name} className={page === name ? 'active' : ''} onClick={() => setPage(name)}>{icon(['⌂','↕','▤','◷'][i])}{name}</button>)}</nav>
    {modal && <div className="wallet-overlay" onMouseDown={e => { if (e.target === e.currentTarget) { setModal(false); closeScanner(); } }}><section className="wallet-modal"><div className="wallet-modal-head"><div><h2>Nova transakcija</h2><p>Unesi podatke ili skeniraj račun.</p></div><button onClick={() => { setModal(false); closeScanner(); }}>×</button></div><div className="wallet-kind-tabs"><button className={kind === 'expense' ? 'selected' : ''} onClick={() => { setKind('expense'); setForm(v => ({ ...v, category: 'Hrana' })); }}>Trošak</button><button className={kind === 'income' ? 'selected' : ''} onClick={() => { setKind('income'); setForm(v => ({ ...v, category: 'Plaća' })); }}>Prihod</button></div>
      <button className="wallet-scan-button" onClick={() => scanner ? closeScanner() : void openScanner()}>{icon('▦')} Skeniraj QR s računa <span>{scanner ? 'Zatvori kameru' : 'Otvori kameru'}</span></button>
      {scanner && <div className="wallet-scanner"><video ref={videoRef} playsInline muted/><label className="wallet-upload">Učitaj fotografiju računa<input type="file" accept="image/*" capture="environment" onChange={e => void decodeImage(e.target.files?.[0])}/></label>{scanError && <p role="status">{scanError}</p>}</div>}
      {qr && <div className="wallet-qr-result"><b>QR kod je očitan</b><p>Fiskalni QR služi za provjeru računa. Sam po sebi ne potvrđuje artikle ni ukupan iznos. Provjeri iznos i naziv na papiru pa ih unesi ispod.</p><code>{qr.slice(0, 100)}{qr.length > 100 ? '…' : ''}</code></div>}
      <form onSubmit={saveEntry} className="wallet-form"><label>Iznos (€)<input autoFocus required inputMode="decimal" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} placeholder="0,00"/></label><label>Opis<input required value={form.title} onChange={e => setForm(v => ({ ...v, title: e.target.value }))} placeholder="npr. Namirnice"/></label><div className="wallet-form-row"><label>Kategorija<select value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}>{categories.filter(c => kind === 'income' ? ['Plaća','Ostalo'].includes(c) : c !== 'Plaća').map(c => <option key={c}>{c}</option>)}</select></label><label>Račun<select value={form.account} onChange={e => setForm(v => ({ ...v, account: e.target.value }))}>{data.accounts.map(account => <option key={account.name}>{account.name}</option>)}</select></label></div><label>Datum<input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))}/></label><label className="wallet-check"><input type="checkbox" checked={form.repeat} onChange={e => setForm(v => ({ ...v, repeat: e.target.checked }))}/> Ponavlja se svaki mjesec</label><label className="wallet-check"><input type="checkbox" checked={form.shared} onChange={e => setForm(v => ({ ...v, shared: e.target.checked }))}/> Zajednički trošak</label><p className="wallet-form-note">QR kod može sadržavati samo podatke za provjeru fiskalizacije. Stavke računa moraš unijeti sam.</p><button className="wallet-primary wallet-save" type="submit">Spremi transakciju</button></form></section></div>}
    {toast && <div className="wallet-toast" role="status">✓ {toast}</div>}
  </div>;
}

function EntryList({ entries, onDelete }: { entries: Entry[]; onDelete?: (id: string) => void }) {
  if (!entries.length) return <p className="wallet-empty">Nema transakcija za ovaj mjesec.</p>;
  return <div className="wallet-entry-list">{entries.map((entry, i) => <div className="wallet-entry" key={entry.id}><span className={`wallet-entry-icon e${i % 5}`}>{['⌂','◉','↗','✿','▦'][i % 5]}</span><span className="wallet-entry-name"><b>{entry.title}</b><small>{entry.category}{entry.account ? ` · ${entry.account}` : ''}{entry.repeat ? ' · Ponavljajuće' : ''}{entry.shared ? ' · Zajedničko' : ''}</small></span><span className="wallet-entry-date">{new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'short' }).format(new Date(`${entry.date}T12:00:00`))}</span><strong className={entry.kind === 'income' ? 'positive' : ''}>{entry.kind === 'income' ? '+' : '−'}{money(entry.amount)}</strong>{onDelete && <button className="wallet-delete" aria-label={`Obriši ${entry.title}`} onClick={() => onDelete(entry.id)}>×</button>}</div>)}</div>;
}
