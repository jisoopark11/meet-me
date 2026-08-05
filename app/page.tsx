import BookingCalendar from "@/components/BookingCalendar";
import { SITE } from "@/config/availability";

export default function Home() {
  return (
    <main className="page">
      <header className="header">
        <h1>{SITE.title}</h1>
        <p className="muted">{SITE.intro}</p>
        <p className="muted small">약속 1건당 {SITE.durationLabel}</p>
      </header>
      <BookingCalendar siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""} />
    </main>
  );
}
