'use client';

import { useEffect, useState } from 'react';

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Article {
  id: string;
  article_id: string;
  title: string;
  url: string;
  score: number;
  why_matters: string;
  category: string;
  category_summary: string;
  display_order: number;
  included: boolean;
}

interface Issue {
  id: string;
  issue_number: number;
  period_start: string;
  period_end: string;
  status: 'draft' | 'ready' | 'sent';
  subject: string;
  intro_text: string;
  sent_at: string | null;
  articles: Article[];
}

const CATEGORIES = [
  'Pijnpunten en kansen',
  'Nieuws EU AI Act',
  'Belangrijkste nieuwsfeiten',
  'Internationale lessen',
  'Technologische ontwikkelingen',
  'Governance en compliance',
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Concept',
  ready: 'Klaar',
  sent: 'Verzonden',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  ready: 'bg-blue-100 text-blue-800',
  sent: 'bg-green-100 text-green-800',
};

// ─── PASSWORD GATE ────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);

  const check = () => {
    fetch('/api/newsletter/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          sessionStorage.setItem('review_auth', pw);
          onUnlock();
        } else {
          setError(true);
        }
      });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Nieuwsbrief Review</h1>
        <p className="text-sm text-gray-500 mb-6">Digidactics · Alleen voor intern gebruik</p>
        <input
          type="password"
          placeholder="Wachtwoord"
          value={pw}
          onChange={e => { setPw(e.target.value); setError(false); }}
          onKeyDown={e => e.key === 'Enter' && check()}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-red-500 text-xs mb-3">Onjuist wachtwoord</p>}
        <button
          onClick={check}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          Inloggen
        </button>
      </div>
    </div>
  );
}

// ─── ISSUE LIST ───────────────────────────────────────────────────────────────
function IssueList({ issues, onSelect }: { issues: Issue[]; onSelect: (i: Issue) => void }) {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nieuwsbrief Review</h1>
            <p className="text-sm text-gray-500 mt-1">Digidactics AI Governance Update</p>
          </div>
          <span className="text-sm text-gray-400">{issues.length} edities</span>
        </div>

        {issues.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500 text-sm">Nog geen edities gegenereerd.</p>
            <p className="text-gray-400 text-xs mt-2">De cron draait elke maandag om 07:00.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map(issue => (
              <button
                key={issue.id}
                onClick={() => onSelect(issue)}
                className="w-full bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900">Editie #{issue.issue_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[issue.status]}`}>
                        {STATUS_LABELS[issue.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(issue.period_start).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} –{' '}
                      {new Date(issue.period_end).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-sm text-gray-700 mt-1 truncate">{issue.subject}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-2xl font-bold text-gray-900">{issue.articles?.length || 0}</p>
                    <p className="text-xs text-gray-400">artikelen</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ISSUE EDITOR ─────────────────────────────────────────────────────────────
function IssueEditor({
  issue: initialIssue,
  onBack,
  password,
}: {
  issue: Issue;
  onBack: () => void;
  password: string;
}) {
  const [issue, setIssue] = useState<Issue>(initialIssue);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const authHeaders = {
    'Content-Type': 'application/json',
    'x-review-password': password,
  };

  // Toggle artikel in/uit
  const toggleArticle = (articleId: string) => {
    setIssue(prev => ({
      ...prev,
      articles: prev.articles.map(a =>
        a.id === articleId ? { ...a, included: !a.included } : a
      ),
    }));
  };

  // Opslaan
  const save = async (newStatus?: string) => {
    setSaving(true);
    const body = {
      subject: issue.subject,
      intro_text: issue.intro_text,
      status: newStatus || issue.status,
      articles: issue.articles.map(a => ({ id: a.id, included: a.included })),
    };
    await fetch(`/api/newsletter/issue/${issue.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(body),
    });
    if (newStatus) setIssue(prev => ({ ...prev, status: newStatus as Issue['status'] }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Versturen
  const send = async () => {
    if (!confirm('Weet je zeker dat je deze editie wilt versturen naar alle abonnees?')) return;
    setSending(true);
    setSendResult(null);
    await save('ready');
    const res = await fetch(`/api/newsletter/send/${issue.id}`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.ok) {
      setSendResult('✅ Nieuwsbrief verstuurd!');
      setIssue(prev => ({ ...prev, status: 'sent' }));
    } else {
      setSendResult(`❌ Fout: ${data.error}`);
    }
    setSending(false);
  };

  const includedArticles = issue.articles.filter(a => a.included);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← Terug</button>
            <div>
              <span className="font-semibold text-gray-900">Editie #{issue.issue_number}</span>
              <span className={`ml-3 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[issue.status]}`}>
                {STATUS_LABELS[issue.status]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPreview(!preview)}
              className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 transition-colors"
            >
              {preview ? 'Editor' : 'Preview'}
            </button>
            <button
              onClick={() => save()}
              disabled={saving}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-3 py-1.5 transition-colors"
            >
              {saved ? '✓ Opgeslagen' : saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button
              onClick={send}
              disabled={sending || issue.status === 'sent'}
              className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-1.5 font-medium transition-colors"
            >
              {issue.status === 'sent' ? '✓ Verstuurd' : sending ? 'Versturen...' : `Verstuur (${includedArticles.length} artikelen)`}
            </button>
          </div>
        </div>
        {sendResult && (
          <div className={`mx-6 mb-3 text-sm px-4 py-2 rounded-lg ${sendResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {sendResult}
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Meta */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Onderwerpregel</label>
            <input
              value={issue.subject}
              onChange={e => setIssue(prev => ({ ...prev, subject: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
              Intro tekst
            </label>
            <textarea
              value={issue.intro_text}
              onChange={e => setIssue(prev => ({ ...prev, intro_text: e.target.value }))}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex gap-4 text-xs text-gray-400 pt-1">
            <span>Periode: {new Date(issue.period_start).toLocaleDateString('nl-NL')} – {new Date(issue.period_end).toLocaleDateString('nl-NL')}</span>
            <span>·</span>
            <span>{includedArticles.length} artikelen geselecteerd</span>
          </div>
        </div>

        {preview ? (
          // PREVIEW MODE
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
              <h1 style={{ color: '#1a202c', borderBottom: '2px solid #4299e1', paddingBottom: '10px', fontSize: '22px' }}>
                🤖 AI Governance Update #{issue.issue_number}
              </h1>
              <p style={{ color: '#4a5568', fontSize: '13px' }}>
                {new Date(issue.period_start).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} –{' '}
                {new Date(issue.period_end).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p style={{ color: '#2d3748', lineHeight: '1.6', marginTop: '16px' }}>{issue.intro_text}</p>
              <hr style={{ border: '1px solid #e2e8f0', margin: '24px 0' }} />
              {CATEGORIES.map(cat => {
                const catArticles = includedArticles.filter(a => a.category === cat);
                if (catArticles.length === 0) return null;
                const summary = catArticles[0]?.category_summary;
                return (
                  <div key={cat} style={{ marginBottom: '28px' }}>
                    <h2 style={{ color: '#1a202c', fontSize: '16px', borderLeft: '3px solid #4299e1', paddingLeft: '10px' }}>{cat}</h2>
                    {summary && <p style={{ color: '#4a5568', fontSize: '13px', lineHeight: '1.6' }}>{summary}</p>}
                    <ul style={{ paddingLeft: '20px' }}>
                      {catArticles.map(a => (
                        <li key={a.id} style={{ marginBottom: '8px' }}>
                          <a href={a.url} style={{ color: '#4299e1', fontSize: '14px' }}>{a.title}</a>
                          <p style={{ color: '#718096', fontSize: '12px', margin: '2px 0 0 0' }}>{a.why_matters}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // EDITOR MODE — artikelen per categorie
          CATEGORIES.map(cat => {
            const catArticles = issue.articles
              .filter(a => a.category === cat)
              .sort((a, b) => a.display_order - b.display_order);
            if (catArticles.length === 0) return null;
            const summary = catArticles[0]?.category_summary;
            const includedCount = catArticles.filter(a => a.included).length;

            return (
              <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{cat}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{includedCount} van {catArticles.length} geselecteerd</p>
                  </div>
                </div>
                {summary && (
                  <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
                    <p className="text-sm text-blue-800 italic">{summary}</p>
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  {catArticles.map(article => (
                    <div
                      key={article.id}
                      className={`px-6 py-4 flex gap-4 transition-colors ${article.included ? '' : 'opacity-40 bg-gray-50'}`}
                    >
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          checked={article.included}
                          onChange={() => toggleArticle(article.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 leading-snug"
                          >
                            {article.title}
                          </a>
                          <span className="shrink-0 text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-medium">
                            {article.score}/10
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{article.why_matters}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function ReviewPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('review_auth');
    if (stored) { setPassword(stored); setUnlocked(true); }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    fetch('/api/newsletter/issues', {
      headers: { 'x-review-password': password },
    })
      .then(r => r.json())
      .then(d => { setIssues(d.issues || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [unlocked, password]);

  if (!unlocked) {
    return <PasswordGate onUnlock={() => { setPassword(sessionStorage.getItem('review_auth') || ''); setUnlocked(true); }} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Laden...</p>
      </div>
    );
  }

  if (selected) {
    return (
      <IssueEditor
        issue={selected}
        onBack={() => setSelected(null)}
        password={password}
      />
    );
  }

  return <IssueList issues={issues} onSelect={setSelected} />;
}
