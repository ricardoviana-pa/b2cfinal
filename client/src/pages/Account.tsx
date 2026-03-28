import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { MapPin, Gift, Users, User, LogOut, ChevronRight, Star, Copy, Check, Send, Calendar, Home as HomeIcon, Award, ArrowUpRight } from 'lucide-react';

type Tab = 'dashboard' | 'trips' | 'points' | 'referrals' | 'profile';

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    bronze: 'bg-[#CD7F32]/10 text-[#CD7F32]',
    silver: 'bg-[#9E9A90]/10 text-[#6B6860]',
    gold: 'bg-[#C4A87C]/15 text-[#8B7355]',
    platinum: 'bg-[#1A1A18]/10 text-[#1A1A18]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium tracking-[0.1em] uppercase ${colors[tier] || colors.bronze}`}>
      <Award size={11} /> {tier}
    </span>
  );
}

export default function Account() {
  const { t } = useTranslation();
  usePageMeta({ title: 'My Account', description: 'Manage your trips, loyalty points, and profile.' });
  const { user, loading: authLoading, logout, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [copiedCode, setCopiedCode] = useState(false);
  const [referralEmail, setReferralEmail] = useState('');

  const profileQuery = trpc.customer.getProfile.useQuery(undefined, { enabled: isAuthenticated });
  const tripsQuery = trpc.customer.getTrips.useQuery(undefined, { enabled: isAuthenticated });
  const pointsSummary = trpc.customer.getPointsSummary.useQuery(undefined, { enabled: isAuthenticated });
  const pointsLog = trpc.customer.getPointsLog.useQuery(undefined, { enabled: isAuthenticated && activeTab === 'points' });
  const referralsQuery = trpc.customer.getReferrals.useQuery(undefined, { enabled: isAuthenticated && activeTab === 'referrals' });
  const sendReferral = trpc.customer.sendReferral.useMutation();
  const updateProfile = trpc.customer.updateProfile.useMutation();

  if (!authLoading && !isAuthenticated) {
    navigate('/login');
    return null;
  }

  if (authLoading || !profileQuery.data) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />
        <div className="pt-32 pb-20 container max-w-[1100px]">
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-48 bg-[#F5F1EB] rounded-md" />
            <div className="h-4 w-72 bg-[#F5F1EB] rounded-md" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              {[1,2,3].map(i => <div key={i} className="h-32 bg-[#F5F1EB] rounded-lg" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const profile = profileQuery.data;
  const trips = tripsQuery.data || [];
  const upcomingTrips = trips.filter(t => t.isUpcoming);
  const pastTrips = trips.filter(t => t.isPast);
  const points = pointsSummary.data;

  const tabs: { id: Tab; label: string; icon: typeof MapPin }[] = [
    { id: 'dashboard', label: t('account.tabDashboard', 'Dashboard'), icon: HomeIcon },
    { id: 'trips', label: t('account.tabTrips', 'My Trips'), icon: MapPin },
    { id: 'points', label: t('account.tabPoints', 'Points'), icon: Gift },
    { id: 'referrals', label: t('account.tabReferrals', 'Refer a Friend'), icon: Users },
    { id: 'profile', label: t('account.tabProfile', 'Profile'), icon: User },
  ];

  const copyReferralCode = () => {
    if (profile.referralCode) {
      navigator.clipboard.writeText(profile.referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleSendReferral = async () => {
    if (!referralEmail) return;
    await sendReferral.mutateAsync({ email: referralEmail });
    setReferralEmail('');
  };

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero strip */}
      <section className="pt-28 pb-6 md:pt-36 md:pb-8 border-b border-[#E8E4DC]">
        <div className="container max-w-[1100px]">
          <div className="flex items-center gap-4">
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-[#E8E4DC]" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#8B7355] flex items-center justify-center text-white text-[18px] font-display">
                {(profile.name || 'G')[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="font-display text-[22px] md:text-[26px] font-light text-[#1A1A18]">
                {t('account.welcome', 'Welcome')}, {profile.name?.split(' ')[0] || t('account.guest', 'Guest')}
              </h1>
              <div className="flex items-center gap-3 mt-0.5">
                <TierBadge tier={profile.loyaltyTier} />
                <span className="text-[12px] text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                  {t('account.memberSince', 'Member since')} {new Date(profile.memberSince).getFullYear()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container max-w-[1100px]">
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 lg:gap-12">

            {/* Sidebar nav */}
            <nav className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar -mx-5 px-5 lg:mx-0 lg:px-0">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-md text-[13px] whitespace-nowrap transition-colors ${
                      activeTab === tab.id
                        ? 'bg-[#1A1A18] text-white'
                        : 'text-[#6B6860] hover:bg-[#F5F1EB]'
                    }`}
                    style={{ fontFamily: 'var(--font-body)', fontWeight: activeTab === tab.id ? 500 : 400 }}
                  >
                    <Icon size={15} />
                    {tab.label}
                  </button>
                );
              })}
              <button
                onClick={async () => { await logout(); navigate('/'); }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-md text-[13px] text-[#9E9A90] hover:bg-[#F5F1EB] transition-colors mt-2"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
              >
                <LogOut size={15} />
                {t('account.logout', 'Sign out')}
              </button>
            </nav>

            {/* Content */}
            <div className="min-w-0">

              {/* DASHBOARD */}
              {activeTab === 'dashboard' && (
                <div className="space-y-8">
                  {/* Stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: t('account.statPoints', 'Points'), value: points?.balance?.toLocaleString() || '0', accent: true },
                      { label: t('account.statStays', 'Total stays'), value: String(profile.totalStays) },
                      { label: t('account.statNights', 'Nights'), value: String(profile.totalNights) },
                      { label: t('account.statTier', 'Tier'), value: profile.loyaltyTier.charAt(0).toUpperCase() + profile.loyaltyTier.slice(1) },
                    ].map((s, i) => (
                      <div key={i} className="rounded-lg border border-[#E8E4DC] bg-white p-5">
                        <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#9E9A90] mb-2" style={{ fontFamily: 'var(--font-body)' }}>{s.label}</p>
                        <p className={`font-display text-[24px] font-light ${s.accent ? 'text-[#8B7355]' : 'text-[#1A1A18]'}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Upcoming trips */}
                  <div>
                    <h2 className="font-display text-[20px] font-light text-[#1A1A18] mb-4">{t('account.upcomingTrips', 'Upcoming trips')}</h2>
                    {upcomingTrips.length > 0 ? (
                      <div className="space-y-3">
                        {upcomingTrips.map(trip => (
                          <div key={trip.id} className="flex items-center gap-4 rounded-lg border border-[#E8E4DC] bg-white p-4">
                            {trip.propertyImage && <img src={trip.propertyImage} alt="" className="w-16 h-16 rounded-md object-cover shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] text-[#1A1A18] font-medium truncate">{trip.propertyName}</p>
                              <p className="text-[12px] text-[#9E9A90] mt-0.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                                {trip.checkIn} → {trip.checkOut} · {trip.nights} {t('account.nights', 'nights')}
                              </p>
                            </div>
                            <ChevronRight size={16} className="text-[#E8E4DC] shrink-0" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-[#E8E4DC] bg-white p-8 text-center">
                        <Calendar size={24} className="text-[#E8E4DC] mx-auto mb-3" />
                        <p className="text-[14px] text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                          {t('account.noUpcoming', 'No upcoming trips. Time to plan your next stay?')}
                        </p>
                        <a
                          href="/homes"
                          className="inline-flex items-center gap-1.5 mt-4 text-[12px] font-medium tracking-[0.1em] uppercase text-[#8B7355] hover:text-[#6B5A42] transition-colors"
                        >
                          {t('account.browseHomes', 'Browse homes')} <ArrowUpRight size={13} />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Quick referral */}
                  {profile.referralCode && (
                    <div className="rounded-lg border border-[#E8E4DC] bg-[#F5F1EB]/50 p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[14px] text-[#1A1A18] mb-1" style={{ fontWeight: 500 }}>{t('account.referQuick', 'Share your referral code')}</p>
                          <p className="text-[12px] text-[#6B6860]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                            {t('account.referQuickSub', 'Earn 500 points for every friend who books.')}
                          </p>
                        </div>
                        <button
                          onClick={copyReferralCode}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#E8E4DC] bg-white text-[12px] font-medium tracking-[0.08em] text-[#1A1A18] hover:border-[#8B7355] transition-colors"
                        >
                          {copiedCode ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                          {profile.referralCode}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TRIPS */}
              {activeTab === 'trips' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="font-display text-[20px] font-light text-[#1A1A18] mb-4">{t('account.upcomingTrips', 'Upcoming trips')}</h2>
                    {upcomingTrips.length > 0 ? (
                      <div className="space-y-3">
                        {upcomingTrips.map(trip => (
                          <TripCard key={trip.id} trip={trip} t={t} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={Calendar} message={t('account.noUpcoming', 'No upcoming trips. Time to plan your next stay?')} cta={t('account.browseHomes', 'Browse homes')} href="/homes" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-display text-[20px] font-light text-[#1A1A18] mb-4">{t('account.pastTrips', 'Past trips')}</h2>
                    {pastTrips.length > 0 ? (
                      <div className="space-y-3">
                        {pastTrips.map(trip => (
                          <TripCard key={trip.id} trip={trip} t={t} isPast />
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={MapPin} message={t('account.noPast', 'Your travel history will appear here after your first stay.')} />
                    )}
                  </div>
                </div>
              )}

              {/* POINTS */}
              {activeTab === 'points' && points && (
                <div className="space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label={t('account.balance', 'Balance')} value={points.balance.toLocaleString()} accent />
                    <StatCard label={t('account.totalEarned', 'Total earned')} value={points.totalEarned.toLocaleString()} />
                    <StatCard label={t('account.totalRedeemed', 'Redeemed')} value={points.totalRedeemed.toLocaleString()} />
                    <StatCard label={t('account.statTier', 'Tier')} value={points.tier.charAt(0).toUpperCase() + points.tier.slice(1)} />
                  </div>

                  {points.nextTier && points.pointsToNextTier > 0 && (
                    <div className="rounded-lg border border-[#E8E4DC] bg-white p-5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[13px] text-[#6B6860]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                          {t('account.nextTierProgress', { tier: points.nextTier.charAt(0).toUpperCase() + points.nextTier.slice(1), points: points.pointsToNextTier, defaultValue: `${points.pointsToNextTier} points to ${points.nextTier.charAt(0).toUpperCase() + points.nextTier.slice(1)}` })}
                        </p>
                        <TierBadge tier={points.nextTier} />
                      </div>
                      <div className="h-1.5 bg-[#F5F1EB] rounded-full overflow-hidden">
                        <div className="h-full bg-[#8B7355] rounded-full transition-all duration-500" style={{ width: `${Math.min(100, ((points.balance) / (points.balance + points.pointsToNextTier)) * 100)}%` }} />
                      </div>
                    </div>
                  )}

                  <div>
                    <h2 className="font-display text-[20px] font-light text-[#1A1A18] mb-4">{t('account.pointsHistory', 'Points history')}</h2>
                    {pointsLog.data && pointsLog.data.length > 0 ? (
                      <div className="rounded-lg border border-[#E8E4DC] bg-white overflow-hidden divide-y divide-[#E8E4DC]">
                        {pointsLog.data.map(entry => (
                          <div key={entry.id} className="flex items-center justify-between px-5 py-3.5">
                            <div>
                              <p className="text-[13px] text-[#1A1A18]" style={{ fontWeight: 500 }}>{entry.description}</p>
                              <p className="text-[11px] text-[#9E9A90] mt-0.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                                {new Date(entry.createdAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                            <span className={`text-[14px] font-medium tabular-nums ${entry.points > 0 ? 'text-green-700' : 'text-[#1A1A18]'}`}>
                              {entry.points > 0 ? '+' : ''}{entry.points}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={Gift} message={t('account.noPoints', 'Your points activity will appear here.')} />
                    )}
                  </div>

                  <div className="rounded-lg border border-[#E8E4DC] bg-white p-6">
                    <h3 className="font-display text-[18px] font-light text-[#1A1A18] mb-3">{t('account.howToEarn', 'How to earn points')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { pts: '100', desc: t('account.earnBooking', 'Per night booked') },
                        { pts: '500', desc: t('account.earnReferral', 'Per friend who books') },
                        { pts: '100', desc: t('account.earnWelcome', 'Welcome bonus') },
                      ].map((e, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-md bg-[#F5F1EB]/50">
                          <span className="text-[16px] font-display text-[#8B7355]">+{e.pts}</span>
                          <span className="text-[12px] text-[#6B6860]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{e.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* REFERRALS */}
              {activeTab === 'referrals' && (
                <div className="space-y-8">
                  <div className="rounded-lg border border-[#E8E4DC] bg-white p-8 text-center">
                    <Gift size={32} className="text-[#8B7355] mx-auto mb-4" />
                    <h2 className="font-display text-[22px] font-light text-[#1A1A18] mb-2">{t('account.referTitle', 'Refer a friend, earn 500 points')}</h2>
                    <p className="text-[14px] text-[#6B6860] max-w-md mx-auto mb-6" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                      {t('account.referBody', 'When your friend completes their first stay, you both earn 500 loyalty points towards future bookings.')}
                    </p>

                    {profile.referralCode && (
                      <div className="flex items-center justify-center gap-3 mb-6">
                        <div className="px-5 py-3 rounded-md bg-[#F5F1EB] text-[16px] font-medium tracking-[0.1em] text-[#1A1A18]">
                          {profile.referralCode}
                        </div>
                        <button
                          onClick={copyReferralCode}
                          className="flex h-[46px] w-[46px] items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] hover:border-[#8B7355] hover:text-[#8B7355] transition-colors"
                        >
                          {copiedCode ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2 max-w-sm mx-auto">
                      <input
                        type="email"
                        value={referralEmail}
                        onChange={e => setReferralEmail(e.target.value)}
                        placeholder={t('account.referEmailPlaceholder', "Friend's email")}
                        className="flex-1 h-[48px] rounded-md border border-[#E8E4DC] bg-[#FAFAF7] px-4 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355]"
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                      />
                      <button
                        onClick={handleSendReferral}
                        disabled={!referralEmail || sendReferral.isPending}
                        className="h-[48px] px-5 rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase hover:bg-[#333330] transition-colors disabled:opacity-40 flex items-center gap-2"
                      >
                        <Send size={13} /> {t('account.referSend', 'Send')}
                      </button>
                    </div>
                  </div>

                  {referralsQuery.data && referralsQuery.data.referrals.length > 0 && (
                    <div>
                      <h3 className="font-display text-[18px] font-light text-[#1A1A18] mb-4">{t('account.referHistory', 'Referral history')}</h3>
                      <div className="rounded-lg border border-[#E8E4DC] bg-white overflow-hidden divide-y divide-[#E8E4DC]">
                        {referralsQuery.data.referrals.map(ref => (
                          <div key={ref.id} className="flex items-center justify-between px-5 py-3.5">
                            <div>
                              <p className="text-[13px] text-[#1A1A18]">{ref.referredEmail}</p>
                              <p className="text-[11px] text-[#9E9A90] mt-0.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                                {new Date(ref.createdAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                            <span className={`text-[11px] font-medium tracking-[0.08em] uppercase px-2.5 py-1 ${
                              ref.status === 'completed' ? 'bg-green-50 text-green-700' :
                              ref.status === 'booked' ? 'bg-[#C4A87C]/15 text-[#8B7355]' :
                              ref.status === 'signed_up' ? 'bg-blue-50 text-blue-700' :
                              'bg-[#F5F1EB] text-[#9E9A90]'
                            }`}>
                              {ref.status.replace('_', ' ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PROFILE */}
              {activeTab === 'profile' && (
                <ProfileTab profile={profile} t={t} updateProfile={updateProfile} />
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}

function TripCard({ trip, t, isPast }: { trip: any; t: any; isPast?: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-[#E8E4DC] bg-white p-4">
      {trip.propertyImage ? (
        <img src={trip.propertyImage} alt="" className="w-20 h-20 rounded-md object-cover shrink-0" />
      ) : (
        <div className="w-20 h-20 rounded-md bg-[#F5F1EB] flex items-center justify-center shrink-0">
          <HomeIcon size={20} className="text-[#E8E4DC]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-[#1A1A18] truncate" style={{ fontWeight: 500 }}>{trip.propertyName}</p>
        {trip.destination && <p className="text-[12px] text-[#8B7355] capitalize mt-0.5">{trip.destination}</p>}
        <p className="text-[12px] text-[#9E9A90] mt-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          {trip.checkIn} → {trip.checkOut} · {trip.nights} {t('account.nights', 'nights')} · {trip.guests} {t('account.guests', 'guests')}
        </p>
        {trip.pointsEarned > 0 && (
          <p className="text-[11px] text-[#8B7355] mt-1">+{trip.pointsEarned} {t('account.pointsLabel', 'points')}</p>
        )}
      </div>
      {isPast && trip.status === 'completed' && !trip.rating && (
        <button className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#8B7355] hover:text-[#6B5A42] transition-colors whitespace-nowrap">
          <Star size={13} className="inline mr-1" />{t('account.leaveReview', 'Review')}
        </button>
      )}
      {trip.status === 'upcoming' && (
        <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-[#8B7355] bg-[#C4A87C]/10 px-2.5 py-1 whitespace-nowrap">
          {t('account.confirmed', 'Confirmed')}
        </span>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-5">
      <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#9E9A90] mb-2" style={{ fontFamily: 'var(--font-body)' }}>{label}</p>
      <p className={`font-display text-[24px] font-light ${accent ? 'text-[#8B7355]' : 'text-[#1A1A18]'}`}>{value}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, message, cta, href }: { icon: typeof MapPin; message: string; cta?: string; href?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#E8E4DC] bg-white p-8 text-center">
      <Icon size={24} className="text-[#E8E4DC] mx-auto mb-3" />
      <p className="text-[14px] text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{message}</p>
      {cta && href && (
        <a href={href} className="inline-flex items-center gap-1.5 mt-4 text-[12px] font-medium tracking-[0.1em] uppercase text-[#8B7355] hover:text-[#6B5A42] transition-colors">
          {cta} <ArrowUpRight size={13} />
        </a>
      )}
    </div>
  );
}

function ProfileTab({ profile, t, updateProfile }: { profile: any; t: any; updateProfile: any }) {
  const [name, setName] = useState(profile.name || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [nationality, setNationality] = useState(profile.nationality || '');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await updateProfile.mutateAsync({ name, phone, nationality });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-[#E8E4DC] bg-white p-6 md:p-8">
        <h2 className="font-display text-[20px] font-light text-[#1A1A18] mb-6">{t('account.profileInfo', 'Personal information')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block" style={{ fontFamily: 'var(--font-body)' }}>
              {t('account.profileName', 'Full name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-white px-4 text-[14px] text-[#1A1A18] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            />
          </div>
          <div>
            <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block" style={{ fontFamily: 'var(--font-body)' }}>
              {t('account.profileEmail', 'Email')}
            </label>
            <input
              type="email"
              value={profile.email || ''}
              disabled
              className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-[#F5F1EB]/50 px-4 text-[14px] text-[#9E9A90] cursor-not-allowed"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            />
          </div>
          <div>
            <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block" style={{ fontFamily: 'var(--font-body)' }}>
              {t('account.profilePhone', 'Phone')}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+351..."
              className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-white px-4 text-[14px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            />
          </div>
          <div>
            <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block" style={{ fontFamily: 'var(--font-body)' }}>
              {t('account.profileNationality', 'Nationality')}
            </label>
            <input
              type="text"
              value={nationality}
              onChange={e => setNationality(e.target.value)}
              placeholder="e.g. Portuguese"
              className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-white px-4 text-[14px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            />
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={updateProfile.isPending}
            className="rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 hover:bg-[#333330] transition-colors disabled:opacity-40 min-h-[48px] inline-flex items-center gap-2"
          >
            {saved ? <><Check size={14} /> {t('account.saved', 'Saved')}</> : t('account.saveChanges', 'Save changes')}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[#E8E4DC] bg-white p-6 md:p-8">
        <h2 className="font-display text-[20px] font-light text-[#1A1A18] mb-2">{t('account.loginMethod', 'Login method')}</h2>
        <div className="flex items-center gap-3 mt-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F1EB]">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div>
            <p className="text-[14px] text-[#1A1A18]" style={{ fontWeight: 500 }}>Google</p>
            <p className="text-[12px] text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{profile.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
