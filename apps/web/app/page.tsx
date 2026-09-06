import { LandingHeader } from "@/components/marketing/landing-header";
import { LandingHero } from "@/components/marketing/landing-hero";
import { LandingFeatures } from "@/components/marketing/landing-features";
import { LandingHowItWorks } from "@/components/marketing/landing-how-it-works";
import { LandingTrustStrip } from "@/components/marketing/landing-trust-strip";
import { LandingFooter } from "@/components/marketing/landing-footer";

export default function LandingPage() {
  return (
    <div className="bg-[var(--surface-page)]">
      <LandingHeader />
      <LandingHero />
      <LandingFeatures />
      <LandingHowItWorks />
      <LandingTrustStrip />
      <LandingFooter />
    </div>
  );
}
