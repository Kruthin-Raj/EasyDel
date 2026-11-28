import Link from 'next/link';
import { Clock, HelpCircle, Mail, ShieldCheck } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import PublicShell from '@/components/PublicShell';
import ContactForm from '@/components/ContactForm';
import { Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Contact us — EasyDel',
  description: 'Get help with EasyDel route sharing, memorization mode, account issues, or feature feedback.',
};

const FAQS = [
  {
    q: 'How do I share my route with a new delivery person?',
    a: 'Open My routes or any route detail page and copy the 8-character share code or full share link. The recipient enters it under Join by code to save, memorize, and run it.',
  },
  {
    q: 'Does sharing a route expose my past delivery history?',
    a: 'No. Only the route stops, house photos, and entrance notes are shared. Delivery runs, issues, and saved personal locations stay strictly private to each user.',
  },
  {
    q: 'How do I make my own edits to someone else’s shared route?',
    a: 'Open the saved route and click “Make my own editable copy”. You get a fresh copy owned by you with its own unique share code.',
  },
];

export default async function ContactPage() {
  const user = await getSessionUser();
  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

  return (
    <PublicShell activePath="/contact">
      <PageHeader
        eyebrow="Support & Feedback"
        title="Contact us"
        subtitle="Questions about recording routes, sharing codes, or running deliveries? Send a note below and get a reference ticket right away."
        actions={
          <Link
            href="/about"
            className="rounded-lg bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            About EasyDel
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <Card
          title="Send a message"
          description="We use your email only to follow up on this request."
        >
          <div className="p-5">
            <ContactForm defaultName={fullName} defaultEmail={user?.email ?? ''} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Direct channels">
            <ul className="divide-y divide-line/70 text-sm">
              <li className="flex items-start gap-3 px-5 py-3.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <div>
                  <p className="font-medium text-ink">Email support</p>
                  <p className="text-ink-dim">Replies go straight to the address you enter in the form.</p>
                </div>
              </li>
              <li className="flex items-start gap-3 px-5 py-3.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
                <div>
                  <p className="font-medium text-ink">Response window</p>
                  <p className="text-ink-dim">Typically within 1 business day (urgent morning delivery bugs prioritised).</p>
                </div>
              </li>
              <li className="flex items-start gap-3 px-5 py-3.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                <div>
                  <p className="font-medium text-ink">Privacy first</p>
                  <p className="text-ink-dim">Customer addresses and route coordinates are never shared outside your routes.</p>
                </div>
              </li>
            </ul>
          </Card>

          <Card title="Quick answers">
            <ul className="divide-y divide-line/70">
              {FAQS.map((item) => (
                <li key={item.q} className="px-5 py-3.5">
                  <p className="flex items-start gap-2 text-sm font-medium text-ink">
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span>{item.q}</span>
                  </p>
                  <p className="mt-1.5 pl-6 text-xs leading-relaxed text-ink-dim">{item.a}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </PublicShell>
  );
}
