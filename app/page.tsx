import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="card bg-gradient-to-r from-primary/40 to-accent/30 text-white">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Bookings and payments that keep your hustle moving.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-100/90">
          Book-N-Pay helps Jamaican service providers get discovered, manage their calendar,
          and collect payments with no monthly fees.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link className="btn" href="/signup">
            Get started
          </Link>
          <Link
            className="inline-flex items-center text-sm font-semibold text-accent hover:text-accent/80"
            href="/#features"
          >
            See how it works
          </Link>
        </div>
      </section>

      <section id="features" className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: "Fast onboarding",
            body: "Spin up your public booking page in minutes with curated services and availability.",
          },
          {
            title: "WhatsApp + email confirmations",
            body: "Automated reminders keep your clients in the loop without the back-and-forth.",
          },
          {
            title: "Only pay when you earn",
            body: "Buy credits up front or pay per booking—no contracts, no hidden fees.",
          },
        ].map((feature) => (
          <article key={feature.title} className="card h-full">
            <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
            <p className="mt-2 text-sm text-slate-300">{feature.body}</p>
          </article>
        ))}
      </section>

      <section id="pricing" className="card">
        <h2 className="text-2xl font-semibold text-white">Pricing built for hustlers</h2>
        <ul className="mt-4 space-y-3 text-sm text-slate-300">
          <li>• $0 monthly subscription</li>
          <li>• $500 JMD per booking credit</li>
          <li>• Pay-per-booking fallback with secure checkout</li>
        </ul>
      </section>

      <section id="contact" className="card">
        <h2 className="text-2xl font-semibold text-white">Need help getting started?</h2>
        <p className="mt-3 text-sm text-slate-300">
          Email <a className="text-accent" href="mailto:hello@booknpay.com">hello@booknpay.com</a> or send us a WhatsApp message at
          <a className="ml-1 text-accent" href="https://wa.me/18765551234">(876) 555-1234</a>.
        </p>
      </section>
    </div>
  );
}
