import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || `${location.protocol}//${location.hostname}:4000`;

const pillars = [
  ['Social', 'Profiles, posts, stories, reels, explore, and live. Follow women and businesses across countries.'],
  ['AI', 'Basic includes standard captions, rewrites, hashtags, and ideas. Premium adds longer writing, more tones, and a higher daily limit.'],
  ['Businesses', 'A business profile is free. It is separate from your personal profile and does not require Premium or a Blue Tick.'],
  ['Appointments', 'Book a service, pay, and attend. Cyrelle keeps a 15% commission on eligible completed bookings.'],
  ['Safety', 'SOS, emergency contacts, and country-specific numbers. The app tells you what your phone can and cannot do.'],
  ['Global', 'Languages, currencies, time zones, taxes, and emergency numbers are configured per country. India is one market, not the template.'],
];

const faqs = [
  ['Is Cyrelle only for women?', 'Yes. Identity verification supports eligibility. Documents stay private and never appear on a profile.'],
  ['Do I need a phone number?', 'No. You join with email or Google. A phone number is never used to register, sign in, or reset a password. Emergency contacts may optionally include a phone number.'],
  ['Is there an 18+ gate?', 'There is no universal 18+ registration gate. If a country sets a minimum age, only that country’s rule applies.'],
  ['Does Premium remove ads?', 'No. Cyrelle contains advertisements for Basic and Premium. Premium is not an ad-free plan.'],
  ['What does Premium cost?', 'In India, Premium is ₹499 per month or ₹5,000 per year. Other countries use regional prices that administrators can change.'],
  ['Is a business profile free?', 'Yes. Creating and running a standard business profile is free. Business Blue Tick is a separate paid verification.'],
  ['Does Premium include Business Blue Tick?', 'No. A Premium member can run a standard business. A Basic member can subscribe to Business Blue Tick. Either combination is valid.'],
  ['Can I buy products?', 'No. Cyrelle is not a product marketplace. Businesses list services and take appointments.'],
];

type PlanResponse = {
  premium?: { monthly?: { amountMinor: number; currency: string } | null; yearly?: { amountMinor: number; currency: string } | null };
  businessBlueTick?: { monthly?: { amountMinor: number; currency: string } | null };
  commissionBps?: number;
};

export function App() {
  const [page, setPage] = useState(location.hash.replace('#', '') || 'home');
  const [plans, setPlans] = useState<PlanResponse | null>(null);
  const [legal, setLegal] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    const onHash = () => setPage(location.hash.replace('#', '') || 'home');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    fetch(`${API}/v1/plans?country=IN`).then((response) => response.json()).then(setPlans).catch(() => setPlans(null));
  }, []);

  useEffect(() => {
    if (!page.startsWith('legal-')) return;
    const slug = page.replace('legal-', '');
    fetch(`${API}/v1/legal/${slug}`).then((response) => response.json()).then(setLegal).catch(() => setLegal(null));
  }, [page]);

  return (
    <>
      <header className="nav">
        <a className="brand" href="#home"><img src="/logo.jpg" alt="" /> CYRELLE</a>
        <nav className="nav-links">
          <a href="#social">Social</a>
          <a href="#business">Business</a>
          <a href="#safety">Safety</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="btn" href="#pricing">See plans</a>
      </header>
      {page.startsWith('legal-') ? <Legal title={legal?.title || 'Legal'} body={legal?.body || 'Loading the current policy…'} /> : <Home plans={plans} />}
    </>
  );
}

function Home({ plans }: { plans: PlanResponse | null }) {
  const monthly = plans?.premium?.monthly ? money(plans.premium.monthly.amountMinor, plans.premium.monthly.currency) : '₹499';
  const yearly = plans?.premium?.yearly ? money(plans.premium.yearly.amountMinor, plans.premium.yearly.currency) : '₹5,000';
  const blue = plans?.businessBlueTick?.monthly ? money(plans.businessBlueTick.monthly.amountMinor, plans.businessBlueTick.monthly.currency) : 'Paid separately';
  return (
    <main>
      <section className="hero">
        <div>
          <div className="kicker">Global · Women · Community</div>
          <h1>A global home for women to connect, create, and grow.</h1>
          <p className="lede">Social profiles, free business profiles, appointments, AI, messaging, live, and a safety hub — in your language, currency, and time zone.</p>
          <div className="hero-actions">
            <a className="btn" href="#pricing">Get started</a>
            <a className="btn ghost" href="#business">Discover businesses</a>
          </div>
          <p className="note">Cyrelle contains advertisements. Premium is not an ad-free plan.</p>
          <p className="lede">Join with email or Google. A phone number is never required.</p>
        </div>
        <div className="mark"><img src="/logo.jpg" alt="Cyrelle logo, a silver crescent and profile, with the words Connect Create Grow and Beauty Strength Confidence" /></div>
      </section>

      <section className="section" id="social">
        <h2>What is Cyrelle?</h2>
        <p className="lede">A women-only global community. Personal profiles are free. Business profiles are free. Premium and Business Blue Tick are optional, and they do not grant each other.</p>
        <div className="grid">
          {pillars.map(([title, body]) => (
            <article className="card" key={title} id={title.toLowerCase()}><strong>{title}</strong><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="section" id="pricing">
        <h2>Plans</h2>
        <p className="lede">India’s Premium price is the reference price. Regional prices are configured, not hard-coded.</p>
        <div className="grid">
          <article className="card"><span className="tag">Personal</span><strong>Basic</strong><div className="price">Free</div><p>The complete core experience: profile, feed, posts, stories, reels, messages, groups, live, explore, AI tools, booking, and Safety Hub. Advertisements included.</p></article>
          <article className="card"><span className="tag">Personal</span><strong>Premium</strong><div className="price">{monthly} / month</div><p>{yearly} / year in India. Adds Premium Blue Tick after verification, enhanced AI, advanced analytics, customization, and early access. Advertisements still apply.</p></article>
          <article className="card"><span className="tag">Business</span><strong>Business profile</strong><div className="price">Free</div><p>Profile, services, prices, availability, appointments, content, reviews, and standard analytics. No Premium and no Blue Tick required.</p></article>
          <article className="card"><span className="tag">Business</span><strong>Business Blue Tick</strong><div className="price">{blue}</div><p>Optional paid badge after business verification. Advanced analytics and enhanced discovery. Billed separately from Premium.</p></article>
          <article className="card"><span className="tag">Appointments</span><strong>15% commission</strong><div className="price">On completion</div><p>A ₹1,000 completed booking keeps ₹150 for Cyrelle and ₹850 for the business before other fees or taxes. The server calculates it.</p></article>
          <article className="card"><span className="tag">Ads</span><strong>Advertising</strong><div className="price">Labeled</div><p>Sponsored, Advertisement, or Promoted. Businesses can advertise profiles and services. Ads are not private messages.</p></article>
        </div>
      </section>

      <section className="section" id="faq">
        <h2>FAQ</h2>
        <div className="faq">
          {faqs.map(([question, answer]) => (
            <details key={question}><summary>{question}</summary><p>{answer}</p></details>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div>Beauty · Strength · Confidence<br />Connect. Create. Grow.</div>
        <nav>
          {['privacy', 'terms', 'community-guidelines', 'safety-policy', 'premium-terms', 'business-terms', 'appointment-terms', 'advertising-policy', 'verification-policy'].map((slug) => (
            <a key={slug} href={`#legal-${slug}`}>{slug.replaceAll('-', ' ')}</a>
          ))}
        </nav>
      </footer>
    </main>
  );
}

function Legal({ title, body }: { title: string; body: string }) {
  return (
    <article className="legal">
      <a href="#home">Back</a>
      <h1>{title}</h1>
      <p>{body}</p>
    </article>
  );
}

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: currency === 'JPY' ? 0 : 2 }).format(amountMinor / (currency === 'JPY' ? 1 : 100));
}
