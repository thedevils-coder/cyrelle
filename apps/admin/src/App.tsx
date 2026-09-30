import { FormEvent, useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || `${location.protocol}//${location.hostname}:4000`;
const sections = ['overview', 'users', 'verifications', 'content', 'premium', 'businesses', 'appointments', 'commissions', 'ads', 'flags', 'countries', 'legal', 'audit', 'analytics'] as const;
type Section = (typeof sections)[number];

export function App() {
  const [token, setToken] = useState(localStorage.getItem('cyrelle_admin') || '');
  const [section, setSection] = useState<Section>('overview');
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState('');

  async function load(next = section, auth = token) {
    const path: Record<Section, string> = {
      overview: '/v1/admin/overview',
      users: '/v1/admin/users',
      verifications: '/v1/admin/verifications',
      content: '/v1/admin/content',
      premium: '/v1/admin/premium',
      businesses: '/v1/admin/businesses',
      appointments: '/v1/admin/appointments',
      commissions: '/v1/admin/commissions',
      ads: '/v1/admin/ads',
      flags: '/v1/admin/feature-flags',
      countries: '/v1/admin/countries',
      legal: '/v1/admin/legal',
      audit: '/v1/admin/audit-logs',
      analytics: '/v1/admin/analytics',
    };
    const response = await fetch(`${API}${path[next]}`, { headers: { Authorization: `Bearer ${auth}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || 'Could not load this section');
    setData(body);
  }

  useEffect(() => {
    if (!token) return;
    load().catch((reason: Error) => setError(reason.message));
  }, [section, token]);

  if (!token) return <Login onToken={(value) => { localStorage.setItem('cyrelle_admin', value); setToken(value); }} />;

  return (
    <div className="shell">
      <aside>
        <div className="brand">Cyrelle</div>
        <p className="muted">Platform admin</p>
        {sections.map((item) => (
          <button key={item} className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
        <button onClick={() => { localStorage.removeItem('cyrelle_admin'); setToken(''); }}>Sign out</button>
      </aside>
      <main>
        <h1>{section}</h1>
        {error && <p>{error}</p>}
        {section === 'overview' && <Overview data={data} />}
        {section === 'users' && <Users data={data} token={token} reload={() => load()} />}
        {section === 'verifications' && <Verifications token={token} reload={() => load()} />}
        {section === 'commissions' && <Commissions data={data} />}
        {section === 'flags' && <Flags data={data} token={token} reload={() => load()} />}
        {section === 'ads' && <Ads data={data} token={token} reload={() => load()} />}
        {!['overview', 'users', 'verifications', 'commissions', 'flags', 'ads'].includes(section) && <pre>{JSON.stringify(data, null, 2)}</pre>}
      </main>
    </div>
  );
}

function Login({ onToken }: { onToken: (token: string) => void }) {
  const [email, setEmail] = useState('admin@cyrelle.test');
  const [password, setPassword] = useState('CyrelleTest!2026');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const body = await response.json();
    if (!response.ok) return setError(body.error?.message || 'Sign-in failed');
    onToken(body.accessToken);
  }
  return (
    <form className="login card" onSubmit={submit}>
      <img src="/logo.jpg" alt="" width={88} />
      <h1>Admin</h1>
      <p className="muted">Email sign-in. No phone authentication.</p>
      <div className="row"><input aria-label="Email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <div className="row"><input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      {error && <p>{error}</p>}
      <button className="primary" type="submit">Sign in</button>
    </form>
  );
}

function Overview({ data }: { data: unknown }) {
  const overview = (data || {}) as Record<string, number>;
  const cards = [
    ['Members', overview.users],
    ['Premium', overview.premium],
    ['Businesses', overview.businesses],
    ['Completed visits', overview.completedAppointments],
    ['Commission minor', overview.commissionMinor],
    ['Open reports', overview.openReports],
    ['Active ads', overview.activeAds],
    ['Active SOS', overview.activeEmergencies],
  ];
  return <div className="cards">{cards.map(([label, value]) => <article className="card" key={String(label)}><span className="muted">{label}</span><b>{value ?? '—'}</b></article>)}</div>;
}

function Users({ data, token, reload }: { data: unknown; token: string; reload: () => void }) {
  const rows = Array.isArray(data) ? data as Array<{ id: string; email: string; accountStatus: string; profile?: { username?: string; countryCode?: string } }> : [];
  async function setStatus(id: string, status: string) {
    await fetch(`${API}/v1/admin/users/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    reload();
  }
  return (
    <table>
      <thead><tr><th>Member</th><th>Email</th><th>Country</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>@{row.profile?.username}</td>
            <td>{row.email}</td>
            <td>{row.profile?.countryCode}</td>
            <td>{row.accountStatus}</td>
            <td className="row">
              <button onClick={() => setStatus(row.id, 'RESTRICTED')}>Restrict</button>
              <button onClick={() => setStatus(row.id, 'SUSPENDED')}>Suspend</button>
              <button onClick={() => setStatus(row.id, 'ACTIVE')}>Restore</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const verificationFilters = ['', 'PENDING', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'FAILED', 'MANUAL_REVIEW', 'RESTRICTED'] as const;

function Verifications({ token, reload }: { token: string; reload: () => void }) {
  const [filter, setFilter] = useState<(typeof verificationFilters)[number]>('');
  const [rows, setRows] = useState<Array<{ id: string; userId: string; username?: string | null; status: string; provider: string; providerApplicantId?: string | null; failureReason?: string | null; reviewReason?: string | null; updatedAt?: string }>>([]);
  const [detail, setDetail] = useState<string>('');

  async function loadRows(next = filter) {
    const query = next ? `?status=${next}` : '';
    const response = await fetch(`${API}/v1/admin/verifications${query}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (response.ok) setRows(body);
  }

  useEffect(() => { loadRows().catch(() => setRows([])); }, [filter, token]);

  async function decide(id: string, status: 'MANUAL_REVIEW' | 'RESTRICTED' | 'FAILED' | 'VERIFIED') {
    await fetch(`${API}/v1/admin/verifications/${id}/decision`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await loadRows();
    reload();
  }

  async function history(id: string) {
    const response = await fetch(`${API}/v1/admin/verifications/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    setDetail(JSON.stringify(body, null, 2));
  }

  return (
    <>
      <p className="muted">Identity documents stay with the verification provider. This list shows status, provider reference, and safe review reasons only.</p>
      <div className="row">
        {verificationFilters.map((item) => (
          <button key={item || 'all'} className={item === filter ? 'primary' : ''} onClick={() => setFilter(item)}>{item || 'All'}</button>
        ))}
      </div>
      {!rows.length && <p className="muted">No verification records for this filter.</p>}
      <table>
        <thead><tr><th>Member</th><th>Status</th><th>Provider</th><th>Reference</th><th>Reason</th><th></th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>@{row.username || row.userId}</td>
              <td>{row.status}</td>
              <td>{row.provider}</td>
              <td>{row.providerApplicantId || '—'}</td>
              <td>{row.failureReason || row.reviewReason || '—'}</td>
              <td className="row">
                <button onClick={() => history(row.id)}>History</button>
                <button onClick={() => decide(row.id, 'MANUAL_REVIEW')}>Manual review</button>
                <button onClick={() => decide(row.id, 'RESTRICTED')}>Restrict</button>
                {row.provider !== 'sumsub' && row.status !== 'VERIFIED' && <button className="primary" onClick={() => decide(row.id, 'VERIFIED')}>Verify</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail && <pre>{detail}</pre>}
    </>
  );
}

function Commissions({ data }: { data: unknown }) {
  const rows = Array.isArray(data) ? data as Array<{ id: string; currency: string; grossMinor: number; commissionMinor: number; businessMinor: number; commissionBps: number; commissionStatus: string; appointment?: { business?: { name?: string } } }> : [];
  return (
    <>
      <p className="muted">Commission is stored from the server calculation. A ₹1,000 booking is 100000 minor units, 15000 commission, 85000 to the business.</p>
      <table>
        <thead><tr><th>Business</th><th>Gross</th><th>Rate</th><th>Cyrelle</th><th>Business</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.appointment?.business?.name}</td>
              <td>{row.grossMinor} {row.currency}</td>
              <td>{row.commissionBps / 100}%</td>
              <td>{row.commissionMinor}</td>
              <td>{row.businessMinor}</td>
              <td>{row.commissionStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Flags({ data, token, reload }: { data: unknown; token: string; reload: () => void }) {
  const rows = Array.isArray(data) ? data as Array<{ key: string; description: string; enabled: boolean; premiumLaunchAt?: string; basicLaunchAt?: string; rolloutPercent: number }> : [];
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{row.key}<div className="muted">{row.description}</div></td>
            <td>{row.enabled ? 'On' : 'Off'}</td>
            <td>Premium {row.premiumLaunchAt?.slice(0, 10)} · Basic {row.basicLaunchAt?.slice(0, 10)} · {row.rolloutPercent}%</td>
            <td><button onClick={async () => { await fetch(`${API}/v1/admin/feature-flags/${row.key}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...row, enabled: !row.enabled }) }); reload(); }}>{row.enabled ? 'Disable' : 'Enable'}</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Ads({ data, token, reload }: { data: unknown; token: string; reload: () => void }) {
  const rows = Array.isArray(data) ? data as Array<{ id: string; title: string; label: string; status: string }> : [];
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.label}</td>
            <td>{row.title}</td>
            <td>{row.status}</td>
            <td><button onClick={async () => { await fetch(`${API}/v1/admin/ads/${row.id}/decision`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: row.status === 'ACTIVE' ? 'PAUSED' : 'APPROVED' }) }); reload(); }}>{row.status === 'ACTIVE' ? 'Pause' : 'Approve'}</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
