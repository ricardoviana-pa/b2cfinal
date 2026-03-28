import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useAuth } from '@/_core/hooks/useAuth';
import { Shield, Gift, MapPin, Star } from 'lucide-react';

export default function Login() {
  const { t } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  if (!loading && isAuthenticated) {
    navigate('/account');
    return null;
  }

  const benefits = [
    { icon: MapPin, title: t('login.benefitTrips', 'Manage your trips'), sub: t('login.benefitTripsSub', 'View upcoming stays and past travel history in one place.') },
    { icon: Gift, title: t('login.benefitPoints', 'Earn loyalty points'), sub: t('login.benefitPointsSub', 'Every booking earns points towards future stays and upgrades.') },
    { icon: Star, title: t('login.benefitRefer', 'Refer & earn'), sub: t('login.benefitReferSub', 'Invite friends and earn bonus points when they book.') },
    { icon: Shield, title: t('login.benefitExclusive', 'Exclusive access'), sub: t('login.benefitExclusiveSub', 'Early access to new homes, seasonal offers, and member rates.') },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      <section className="pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="container max-w-[960px]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-start">

            {/* Left — sign-in */}
            <div>
              <p
                className="text-[11px] font-medium tracking-[0.14em] uppercase text-[#8B7355] mb-4"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {t('login.overline', 'MY PORTUGAL ACTIVE')}
              </p>
              <h1 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-light leading-[1.1] text-[#1A1A18] mb-3">
                {t('login.title', 'Welcome back.')}
              </h1>
              <p
                className="text-[15px] text-[#6B6860] mb-10 leading-relaxed"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
              >
                {t('login.subtitle', 'Sign in to manage your stays, earn loyalty points, and access exclusive member benefits.')}
              </p>

              <a
                href="/api/auth/google"
                className="inline-flex items-center justify-center gap-3 w-full rounded-full border border-[#E8E4DC] bg-white px-6 py-4 text-[14px] text-[#1A1A18] hover:border-[#C4A87C] hover:shadow-md transition-all duration-200 min-h-[56px]"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {t('login.googleButton', 'Continue with Google')}
              </a>

              <p
                className="text-[12px] text-[#9E9A90] mt-5 text-center leading-relaxed"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
              >
                {t('login.terms', 'By signing in you agree to our Privacy Policy and Terms of Service.')}
              </p>
            </div>

            {/* Right — benefits */}
            <div className="rounded-lg border border-[#E8E4DC] bg-white p-8 lg:p-10">
              <h2
                className="font-display text-[20px] font-light text-[#1A1A18] mb-6"
              >
                {t('login.benefitsTitle', 'Member benefits')}
              </h2>
              <div className="flex flex-col gap-6">
                {benefits.map((b, i) => {
                  const Icon = b.icon;
                  return (
                    <div key={i} className="flex gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F5F1EB]">
                        <Icon size={16} className="text-[#8B7355]" />
                      </div>
                      <div>
                        <p className="text-[14px] text-[#1A1A18] mb-0.5" style={{ fontWeight: 500 }}>{b.title}</p>
                        <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{b.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
