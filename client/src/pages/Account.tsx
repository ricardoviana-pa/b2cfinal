import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import productsData from '@/data/products.json';
import {
  MapPin, Gift, Users, User, LogOut, ChevronRight, Star, Copy, Check, Send,
  Calendar, Home as HomeIcon, Award, ArrowUpRight, Building2, Euro,
  Phone, Mail, MapPinned, BedDouble, FileText, Sparkles, Clock, CheckCircle2,
  XCircle, MessageSquare, ChevronDown
} from 'lucide-react';

type Tab = 'dashboard' | 'trips' | 'points' | 'refer-friend' | 'refer-property' | 'profile';

/* ================================================================
   TIER BADGE
   ================================================================ */
function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    bronze: 'bg-[#CD7F32]/10 text-[#CD7F32] border-[#CD7F32]/20',
    silver: 'bg-[#9E9A90]/10 text-[#6B6860] border-[#9E9A90]/20',
    gold: 'bg-[#C4A87C]/15 text-[#8B7355] border-[#C4A87C]/30',
    platinum: 'bg-[#1A1A18]/8 text-[#1A1A18] border-[#1A1A18]/15',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium tracking-[0.12em] uppercase rounded-full border ${colors[tier] || colors.bronze}`}>
      <Award size={11} /> {tier}
    </span>
  );
}

/* ================================================================
   STATUS BADGE
   ================================================================ */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
    submitted: { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-700', icon: Clock },
    contacted: { bg: 'bg-amber-50 border-amber-100', text: 'text-amber-700', icon: Phone },
    under_review: { bg: 'bg-purple-50 border-purple-100', text: 'text-purple-700', icon: FileText },
    signed: { bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
    rejected: { bg: 'bg-red-50 border-red-100', text: 'text-red-700', icon: XCircle },
    pending: { bg: 'bg-[#F5F1EB] border-[#E8E4DC]', text: 'text-[#9E9A90]', icon: Clock },
    signed_up: { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-700', icon: CheckCircle2 },
    booked: { bg: 'bg-[#C4A87C]/15 border-[#C4A87C]/30', text: 'text-[#8B7355]', icon: CheckCircle2 },
    completed: { bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] uppercase rounded-full border ${c.bg} ${c.text}`}>
      <Icon size={10} /> {label}
    </span>
  );
}

/* ================================================================
   MAIN ACCOUNT PAGE
   ================================================================ */
export default function Account() {
  const { t } = useTranslation();
  usePageMeta({
    title: 'My Account | Trips, Preferences & Profile',
    description: 'View your trip history, manage your stay preferences, referrals, and update your profile with Portugal Active.',
    url: '/account',
  });
  const { user, loading: authLoading, logout, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [copiedCode, setCopiedCode] = useState(false);
  const [referralEmail, setReferralEmail] = useState('');

  const profileQuery = trpc.customer.getProfile.useQuery(undefined, { enabled: isAuthenticated });
  const tripsQuery = trpc.customer.getTrips.useQuery(undefined, { enabled: isAuthenticated });
  const pointsSummary = trpc.customer.getPointsSummary.useQuery(undefined, { enabled: isAuthenticated });
  const pointsLog = trpc.customer.getPointsLog.useQuery(undefined, { enabled: isAuthenticated && activeTab === 'points' });
  const referralsQuery = trpc.customer.getReferrals.useQuery(undefined, { enabled: isAuthenticated && activeTab === 'refer-friend' });
  const propertyReferralsQuery = trpc.customer.getPropertyReferrals.useQuery(undefined, { enabled: isAuthenticated && (activeTab === 'refer-property' || activeTab === 'dashboard') });
  const sendReferral = trpc.customer.sendReferral.useMutation();
  const updateProfile = trpc.customer.updateProfile.useMutation();
  const submitPropertyReferral = trpc.customer.submitPropertyReferral.useMutation({
    onSuccess: () => { propertyReferralsQuery.refetch(); },
  });

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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
              {[1,2,3,4].map(i => <div key={i} className="h-28 bg-[#F5F1EB] rounded-lg" />)}
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
  const propRefs = propertyReferralsQuery.data;

  const tabs: { id: Tab; label: string; icon: typeof MapPin; badge?: number }[] = [
    { id: 'dashboard', label: t('account.tabDashboard', 'Dashboard'), icon: HomeIcon },
    { id: 'trips', label: t('account.tabTrips', 'My Trips'), icon: MapPin, badge: upcomingTrips.length || undefined },
    { id: 'points', label: t('account.tabPreferences', 'My Preferences'), icon: Gift },
    { id: 'refer-friend', label: t('account.tabReferFriend', 'Refer a Friend'), icon: Users },
    { id: 'refer-property', label: t('account.tabReferProperty', 'Refer a Property'), icon: Building2 },
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
              <img src={profile.avatar} alt={`${profile.name || 'Guest'} profile photo`} className="w-14 h-14 rounded-full object-cover border-2 border-[#E8E4DC] shadow-sm" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#8B7355] to-[#6B5A42] flex items-center justify-center text-white text-[20px] font-display shadow-sm">
                {(profile.name || 'G')[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="font-display text-[22px] md:text-[28px] font-light text-[#1A1A18] tracking-tight">
                {t('account.welcome', 'Welcome')}, {profile.name?.split(' ')[0] || t('account.guest', 'Guest')}
              </h1>
              <span className="text-[12px] text-[#9E9A90] mt-1 block" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                {t('account.memberSince', 'Member since')} {new Date(profile.memberSince).getFullYear()}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container max-w-[1100px]">
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 lg:gap-12">

            {/* Sidebar nav */}
            <nav className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar -mx-5 px-5 lg:mx-0 lg:px-0">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-[13px] whitespace-nowrap transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-[#1A1A18] text-white shadow-sm'
                        : 'text-[#6B6860] hover:bg-[#F5F1EB]/80'
                    }`}
                    style={{ fontFamily: 'var(--font-body)', fontWeight: activeTab === tab.id ? 500 : 400 }}
                  >
                    <Icon size={15} />
                    {tab.label}
                    {tab.badge ? (
                      <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-[#8B7355]/10 text-[#8B7355]'
                      }`}>{tab.badge}</span>
                    ) : null}
                  </button>
                );
              })}
              <div className="mt-4 pt-4 border-t border-[#E8E4DC] lg:border-t lg:mt-4 lg:pt-4">
                <button
                  onClick={async () => { await logout(); navigate('/'); }}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-[13px] text-[#9E9A90] hover:bg-red-50 hover:text-red-600 transition-all duration-200 w-full"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
                >
                  <LogOut size={15} />
                  {t('account.logout', 'Sign out')}
                </button>
              </div>
            </nav>

            {/* Content area */}
            <div className="min-w-0">

              {/* ============================================================
                  DASHBOARD
                  ============================================================ */}
              {activeTab === 'dashboard' && (
                <div className="space-y-8">
                  {/* Stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: t('account.statStays', 'Total stays'), value: String(profile.totalStays), accent: true, icon: HomeIcon },
                      { label: t('account.statNights', 'Nights'), value: String(profile.totalNights), icon: Calendar },
                      { label: t('account.statMember', 'Member since'), value: new Date(profile.memberSince).getFullYear().toString(), icon: Award },
                    ].map((s, i) => {
                      const Icon = s.icon;
                      return (
                        <div key={i} className="rounded-xl border border-[#E8E4DC] bg-white p-5 hover:shadow-sm transition-shadow duration-200">
                          <div className="flex items-center gap-2 mb-3">
                            <Icon size={14} className="text-[#9E9A90]" />
                            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)' }}>{s.label}</p>
                          </div>
                          <p className={`font-display text-[26px] font-light tracking-tight ${s.accent ? 'text-[#8B7355]' : 'text-[#1A1A18]'}`}>{s.value}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Upcoming trips */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-display text-[20px] font-light text-[#1A1A18]">{t('account.upcomingTrips', 'Upcoming trips')}</h2>
                      {upcomingTrips.length > 0 && (
                        <button onClick={() => setActiveTab('trips')} className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#8B7355] hover:text-[#6B5A42] transition-colors flex items-center gap-1">
                          {t('account.viewAll', 'View all')} <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                    {upcomingTrips.length > 0 ? (
                      <div className="space-y-3">
                        {upcomingTrips.slice(0, 3).map(trip => (
                          <TripCard key={trip.id} trip={trip} t={t} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={Calendar} message={t('account.noUpcoming', 'No upcoming trips. Time to plan your next stay?')} cta={t('account.browseHomes', 'Browse homes')} href="/homes" />
                    )}
                  </div>

                  {/* Quick actions row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Friend referral card */}
                    {profile.referralCode && (
                      <div className="rounded-xl border border-[#E8E4DC] bg-gradient-to-br from-white to-[#F5F1EB]/30 p-6">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-9 h-9 rounded-lg bg-[#8B7355]/10 flex items-center justify-center shrink-0">
                            <Users size={16} className="text-[#8B7355]" />
                          </div>
                          <div>
                            <p className="text-[14px] text-[#1A1A18]" style={{ fontWeight: 500 }}>{t('account.referQuick', 'Refer a friend')}</p>
                            <p className="text-[12px] text-[#6B6860] mt-0.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                              {t('account.referQuickSub', 'Earn 500 points for every friend who books.')}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={copyReferralCode}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#E8E4DC] bg-white text-[12px] font-medium tracking-[0.08em] text-[#1A1A18] hover:border-[#8B7355] transition-colors w-full justify-center"
                        >
                          {copiedCode ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                          {copiedCode ? t('account.copied', 'Copied!') : profile.referralCode}
                        </button>
                      </div>
                    )}

                    {/* Property referral card */}
                    <div className="rounded-xl border border-[#E8E4DC] bg-gradient-to-br from-white to-[#F5F1EB]/30 p-6">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-[#C4A87C]/15 flex items-center justify-center shrink-0">
                          <Building2 size={16} className="text-[#8B7355]" />
                        </div>
                        <div>
                          <p className="text-[14px] text-[#1A1A18]" style={{ fontWeight: 500 }}>{t('account.propertyReferQuick', 'Know a property owner?')}</p>
                          <p className="text-[12px] text-[#6B6860] mt-0.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                            {t('account.propertyReferQuickSub', 'Earn up to \u20AC1,000 for every property that joins our portfolio.')}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab('refer-property')}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1A1A18] text-white text-[12px] font-medium tracking-[0.08em] hover:bg-[#333330] transition-colors w-full justify-center"
                      >
                        <Building2 size={13} /> {t('account.referPropertyCTA', 'Refer a property')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================
                  MY TRIPS
                  ============================================================ */}
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

              {/* ============================================================
                  RETURNING GUEST PROGRAMME (replaces Points & Loyalty)
                  ============================================================ */}
              {activeTab === 'points' && <ReturningGuestTab profile={profile} />}

              {/* ============================================================
                  REFER A FRIEND
                  ============================================================ */}
              {activeTab === 'refer-friend' && (
                <div className="space-y-8">
                  <div className="rounded-xl border border-[#E8E4DC] bg-white p-8 md:p-10 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[#8B7355]/10 flex items-center justify-center mx-auto mb-5">
                      <Gift size={24} className="text-[#8B7355]" />
                    </div>
                    <h2 className="font-display text-[24px] font-light text-[#1A1A18] mb-2 tracking-tight">{t('account.referTitle', 'Refer a friend, earn 500 points')}</h2>
                    <p className="text-[14px] text-[#6B6860] max-w-md mx-auto mb-8" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                      {t('account.referBody', 'When your friend completes their first stay, you both earn 500 loyalty points towards future bookings.')}
                    </p>

                    {profile.referralCode && (
                      <div className="flex items-center justify-center gap-3 mb-8">
                        <div className="px-6 py-3.5 rounded-lg bg-[#FAFAF7] border border-[#E8E4DC] text-[17px] font-medium tracking-[0.12em] text-[#1A1A18]">
                          {profile.referralCode}
                        </div>
                        <button
                          onClick={copyReferralCode}
                          className="flex h-[50px] w-[50px] items-center justify-center rounded-xl border border-[#E8E4DC] text-[#9E9A90] hover:border-[#8B7355] hover:text-[#8B7355] transition-all duration-200"
                        >
                          {copiedCode ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2 max-w-sm mx-auto">
                      <input
                        type="email"
                        value={referralEmail}
                        onChange={e => setReferralEmail(e.target.value)}
                        placeholder={t('account.referEmailPlaceholder', "Friend's email")}
                        className="flex-1 h-[50px] rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200"
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                      />
                      <button
                        onClick={handleSendReferral}
                        disabled={!referralEmail || sendReferral.isPending}
                        className="h-[50px] px-6 rounded-lg bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase hover:bg-[#333330] transition-all duration-200 disabled:opacity-40 flex items-center gap-2"
                      >
                        <Send size={13} /> {t('account.referSend', 'Send')}
                      </button>
                    </div>
                  </div>

                  {referralsQuery.data && referralsQuery.data.referrals.length > 0 && (
                    <div>
                      <h3 className="font-display text-[18px] font-light text-[#1A1A18] mb-4">{t('account.referHistory', 'Referral history')}</h3>
                      <div className="rounded-xl border border-[#E8E4DC] bg-white overflow-hidden divide-y divide-[#E8E4DC]/60">
                        {referralsQuery.data.referrals.map(ref => (
                          <div key={ref.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#FAFAF7]/50 transition-colors">
                            <div>
                              <p className="text-[13px] text-[#1A1A18]">{ref.referredEmail}</p>
                              <p className="text-[11px] text-[#9E9A90] mt-0.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                                {new Date(ref.createdAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                            <StatusBadge status={ref.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================
                  REFER A PROPERTY
                  ============================================================ */}
              {activeTab === 'refer-property' && (
                <PropertyReferralTab
                  t={t}
                  propRefs={propRefs}
                  submitPropertyReferral={submitPropertyReferral}
                />
              )}

              {/* ============================================================
                  PROFILE
                  ============================================================ */}
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

/* ================================================================
   PROPERTY REFERRAL TAB
   ================================================================ */
function PropertyReferralTab({ t, propRefs, submitPropertyReferral }: {
  t: any;
  propRefs: any;
  submitPropertyReferral: any;
}) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    propertyAddress: '',
    propertyCity: '',
    propertyRegion: '',
    propertyBedrooms: '',
    propertyType: '',
    propertyDescription: '',
    notes: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!formData.ownerName) return;
    await submitPropertyReferral.mutateAsync({
      ...formData,
      propertyBedrooms: formData.propertyBedrooms ? parseInt(formData.propertyBedrooms) : undefined,
    });
    setSubmitted(true);
    setFormData({
      ownerName: '', ownerEmail: '', ownerPhone: '', propertyAddress: '',
      propertyCity: '', propertyRegion: '', propertyBedrooms: '', propertyType: '',
      propertyDescription: '', notes: '',
    });
    setTimeout(() => {
      setSubmitted(false);
      setShowForm(false);
    }, 3000);
  };

  const updateField = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-8">
      {/* Hero section */}
      <div className="rounded-xl border border-[#E8E4DC] bg-white overflow-hidden">
        <div className="bg-gradient-to-br from-[#1A1A18] to-[#333330] p-8 md:p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-5 backdrop-blur-sm">
            <Building2 size={24} className="text-[#C4A87C]" />
          </div>
          <h2 className="font-display text-[26px] md:text-[30px] font-light text-white mb-3 tracking-tight">
            {t('account.propRefTitle', 'Refer a Property')}
          </h2>
          <p className="text-[14px] text-white/70 max-w-lg mx-auto mb-6" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
            {t('account.propRefBody', 'Know a stunning property that deserves the Portugal Active experience? Refer the owner and earn a generous reward when the property joins our curated portfolio.')}
          </p>

          {/* Reward tiers */}
          <div className="flex items-center justify-center gap-4 md:gap-6 mb-6">
            <div className="px-6 py-4 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-center min-w-[140px]">
              <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-white/50 mb-1">Select</p>
              <p className="font-display text-[28px] font-light text-[#C4A87C]">{'\u20AC'}500</p>
              <p className="text-[11px] text-white/40 mt-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>per property</p>
            </div>
            <div className="px-6 py-4 rounded-xl bg-white/10 backdrop-blur-sm border border-[#C4A87C]/30 text-center min-w-[140px]">
              <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#C4A87C] mb-1">Luxury</p>
              <p className="font-display text-[28px] font-light text-[#C4A87C]">{'\u20AC'}1,000</p>
              <p className="text-[11px] text-white/40 mt-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>per property</p>
            </div>
          </div>

          {!showForm && !submitted && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-[#C4A87C] text-[#1A1A18] text-[12px] font-medium tracking-[0.1em] uppercase hover:bg-[#D4B88C] transition-all duration-200"
            >
              <Building2 size={14} /> {t('account.propRefCTA', 'Refer a property now')}
            </button>
          )}
        </div>

        {/* How it works */}
        <div className="px-8 py-6 border-t border-[#E8E4DC]">
          <h3 className="text-[12px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
            {t('account.propRefHowItWorks', 'How it works')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: '01', title: t('account.propRefStep1', 'Submit'), desc: t('account.propRefStep1Desc', 'Share the property owner\'s contact details') },
              { step: '02', title: t('account.propRefStep2', 'We reach out'), desc: t('account.propRefStep2Desc', 'Our team contacts the owner directly') },
              { step: '03', title: t('account.propRefStep3', 'Evaluation'), desc: t('account.propRefStep3Desc', 'Property is reviewed for our standards') },
              { step: '04', title: t('account.propRefStep4', 'You earn'), desc: t('account.propRefStep4Desc', 'Receive your reward when the property signs') },
            ].map((s, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-[22px] font-display font-light text-[#E8E4DC]">{s.step}</span>
                <div>
                  <p className="text-[13px] text-[#1A1A18]" style={{ fontWeight: 500 }}>{s.title}</p>
                  <p className="text-[12px] text-[#9E9A90] mt-0.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Submission form */}
      {showForm && !submitted && (
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-6 md:p-8">
          <h3 className="font-display text-[20px] font-light text-[#1A1A18] mb-6">
            {t('account.propRefFormTitle', 'Property referral details')}
          </h3>

          <div className="space-y-5">
            {/* Owner info section */}
            <div>
              <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-3" style={{ fontFamily: 'var(--font-body)' }}>
                {t('account.propRefOwnerSection', 'Property owner')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField icon={User} label={t('account.propRefOwnerName', 'Owner name')} value={formData.ownerName} onChange={v => updateField('ownerName', v)} required />
                <FormField icon={Mail} label={t('account.propRefOwnerEmail', 'Email')} value={formData.ownerEmail} onChange={v => updateField('ownerEmail', v)} type="email" />
                <FormField icon={Phone} label={t('account.propRefOwnerPhone', 'Phone')} value={formData.ownerPhone} onChange={v => updateField('ownerPhone', v)} type="tel" />
              </div>
            </div>

            {/* Property info section */}
            <div>
              <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-3" style={{ fontFamily: 'var(--font-body)' }}>
                {t('account.propRefPropertySection', 'Property details')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField icon={MapPinned} label={t('account.propRefAddress', 'Address or location')} value={formData.propertyAddress} onChange={v => updateField('propertyAddress', v)} />
                <FormField icon={MapPin} label={t('account.propRefCity', 'City')} value={formData.propertyCity} onChange={v => updateField('propertyCity', v)} />
                <FormField icon={MapPin} label={t('account.propRefRegion', 'Region')} value={formData.propertyRegion} onChange={v => updateField('propertyRegion', v)} />
                <FormField icon={BedDouble} label={t('account.propRefBedrooms', 'Bedrooms')} value={formData.propertyBedrooms} onChange={v => updateField('propertyBedrooms', v)} type="number" />
              </div>
              <div className="grid grid-cols-1 gap-4 mt-4">
                <div>
                  <label className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#9E9A90] mb-1.5 block" style={{ fontFamily: 'var(--font-body)' }}>
                    {t('account.propRefType', 'Property type')}
                  </label>
                  <select
                    value={formData.propertyType}
                    onChange={e => updateField('propertyType', e.target.value)}
                    className="w-full h-[46px] rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 text-[13px] text-[#1A1A18] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200 appearance-none"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  >
                    <option value="">{t('account.propRefSelectType', 'Select type...')}</option>
                    <option value="villa">Villa</option>
                    <option value="townhouse">Townhouse</option>
                    <option value="apartment">Apartment</option>
                    <option value="farmhouse">Farmhouse / Quinta</option>
                    <option value="manor">Manor House</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#9E9A90] mb-1.5 block" style={{ fontFamily: 'var(--font-body)' }}>
                    {t('account.propRefDescription', 'Brief description')}
                  </label>
                  <textarea
                    value={formData.propertyDescription}
                    onChange={e => updateField('propertyDescription', e.target.value)}
                    placeholder={t('account.propRefDescPlaceholder', 'What makes this property special? Pool, views, location...')}
                    rows={3}
                    className="w-full rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 py-3 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200 resize-none"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#9E9A90] mb-1.5 block" style={{ fontFamily: 'var(--font-body)' }}>
                    {t('account.propRefNotes', 'Additional notes')}
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={e => updateField('notes', e.target.value)}
                    placeholder={t('account.propRefNotesPlaceholder', 'How do you know the owner? Any context for our team...')}
                    rows={2}
                    className="w-full rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 py-3 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200 resize-none"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={!formData.ownerName || submitPropertyReferral.isPending}
                className="h-[48px] px-8 rounded-lg bg-[#1A1A18] text-[#FAFAF7] text-[12px] font-medium tracking-[0.1em] uppercase hover:bg-[#333330] transition-all duration-200 disabled:opacity-40 flex items-center gap-2"
              >
                {submitPropertyReferral.isPending ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                {t('account.propRefSubmit', 'Submit referral')}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="h-[48px] px-6 rounded-lg border border-[#E8E4DC] text-[12px] font-medium tracking-[0.1em] uppercase text-[#6B6860] hover:bg-[#F5F1EB] transition-all duration-200"
              >
                {t('account.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {submitted && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 size={32} className="text-emerald-600 mx-auto mb-3" />
          <h3 className="font-display text-[18px] font-light text-emerald-800 mb-1">
            {t('account.propRefSuccess', 'Referral submitted successfully!')}
          </h3>
          <p className="text-[13px] text-emerald-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
            {t('account.propRefSuccessBody', 'Our team will review and contact the property owner. You\'ll be notified of any updates.')}
          </p>
        </div>
      )}

      {/* Referral history */}
      {propRefs && propRefs.referrals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-[18px] font-light text-[#1A1A18]">{t('account.propRefHistory', 'Your property referrals')}</h3>
            {propRefs.totalSigned > 0 && (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{t('account.propRefTotalEarned', 'Total earned')}:</span>
                <span className="font-display text-[#8B7355] text-[15px]">{'\u20AC'}{propRefs.totalReward.toLocaleString()}</span>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-[#E8E4DC] bg-white overflow-hidden divide-y divide-[#E8E4DC]/60">
            {propRefs.referrals.map((ref: any) => (
              <div key={ref.id} className="px-5 py-4 hover:bg-[#FAFAF7]/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] text-[#1A1A18] truncate" style={{ fontWeight: 500 }}>
                        {ref.ownerName}
                      </p>
                      {ref.tier && (
                        <span className={`text-[9px] font-medium tracking-[0.1em] uppercase px-2 py-0.5 rounded-full ${
                          ref.tier === 'luxury' ? 'bg-[#C4A87C]/15 text-[#8B7355] border border-[#C4A87C]/30' : 'bg-[#F5F1EB] text-[#6B6860] border border-[#E8E4DC]'
                        }`}>
                          {ref.tier}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#9E9A90] mt-0.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                      {[ref.propertyCity, ref.propertyRegion].filter(Boolean).join(', ') || 'Portugal'} · {new Date(ref.createdAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {ref.rewardAmount > 0 && (
                      <span className="text-[14px] font-display text-[#8B7355]">
                        {'\u20AC'}{ref.rewardAmount}
                        {ref.rewardPaid && <CheckCircle2 size={12} className="inline ml-1 text-emerald-500" />}
                      </span>
                    )}
                    <StatusBadge status={ref.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   FORM FIELD COMPONENT
   ================================================================ */
function FormField({ icon: Icon, label, value, onChange, type = 'text', required }: {
  icon: typeof User;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#9E9A90] mb-1.5 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-body)' }}>
        <Icon size={12} /> {label} {required && <span className="text-[#C4A87C]">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-[46px] rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200"
        style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
      />
    </div>
  );
}

/* ================================================================
   TRIP CARD
   ================================================================ */
function TripCard({ trip, t, isPast }: { trip: any; t: any; isPast?: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#E8E4DC] bg-white p-4 hover:shadow-sm transition-all duration-200">
      {trip.propertyImage ? (
        <img src={trip.propertyImage} alt={`${trip.propertyName || 'Property'} – Portugal Active`} className="w-20 h-20 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-[#F5F1EB] to-[#E8E4DC] flex items-center justify-center shrink-0">
          <HomeIcon size={22} className="text-[#C4A87C]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-[#1A1A18] truncate" style={{ fontWeight: 500 }}>{trip.propertyName}</p>
        {trip.destination && <p className="text-[12px] text-[#8B7355] capitalize mt-0.5">{trip.destination}</p>}
        <p className="text-[12px] text-[#9E9A90] mt-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          {trip.checkIn} → {trip.checkOut} · {trip.nights} {t('account.nights', 'nights')} · {trip.guests} {t('account.guests', 'guests')}
        </p>
        {trip.pointsEarned > 0 && (
          <p className="text-[11px] text-[#8B7355] mt-1 flex items-center gap-1">
            <Sparkles size={10} /> +{trip.pointsEarned} {t('account.pointsLabel', 'points')}
          </p>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-2">
        {isPast && trip.status === 'completed' && !trip.rating && (
          <button className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#8B7355] hover:text-[#6B5A42] transition-colors whitespace-nowrap flex items-center gap-1">
            <Star size={12} />{t('account.leaveReview', 'Review')}
          </button>
        )}
        {trip.status === 'upcoming' && (
          <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-[#8B7355] bg-[#C4A87C]/10 px-3 py-1.5 rounded-full whitespace-nowrap border border-[#C4A87C]/20">
            {t('account.confirmed', 'Confirmed')}
          </span>
        )}
        {trip.totalPrice > 0 && (
          <span className="text-[13px] font-display text-[#1A1A18]">
            {'\u20AC'}{trip.totalPrice.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   RETURNING GUEST TAB — Preferences
   ================================================================ */
function ReturningGuestTab({ profile }: { profile: any }) {
  const preferencesQuery = trpc.customer.getPreferences.useQuery();
  const updatePrefs = trpc.customer.updatePreferences.useMutation();
  const adventures = (productsData as any[]).filter((p: any) => p.type === 'adventure' && p.isActive);

  const [pillow, setPillow] = useState('');
  const [dietary, setDietary] = useState('');
  const [checkinTime, setCheckinTime] = useState('');
  const [favouriteActivities, setFavouriteActivities] = useState<string[]>([]);
  const [wine, setWine] = useState('');
  const [teamNotes, setTeamNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (preferencesQuery.data && !loaded) {
      const p = preferencesQuery.data as any;
      setPillow(p.pillow || '');
      setDietary(p.dietary || '');
      setCheckinTime(p.checkinTime || '');
      setFavouriteActivities(p.favouriteActivities || []);
      setWine(p.wine || '');
      setTeamNotes(p.teamNotes || '');
      setLoaded(true);
    }
  }, [preferencesQuery.data, loaded]);

  const handleSave = async () => {
    await updatePrefs.mutateAsync({
      preferences: JSON.stringify({ pillow, dietary, checkinTime, favouriteActivities, wine, teamNotes }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const toggleActivity = (name: string) => {
    setFavouriteActivities(prev =>
      prev.includes(name) ? prev.filter(a => a !== name) : [...prev, name]
    );
  };

  const inputClass = "w-full h-[48px] rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 text-[14px] text-[#1A1A18] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200";
  const labelClass = "text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block";

  return (
    <div className="space-y-8">
      {/* Welcome message */}
      <div className="rounded-xl border border-[#E8E4DC] bg-white p-6 md:p-8">
        <h2 className="font-display text-[22px] font-light text-[#1A1A18] mb-2 tracking-tight">
          Welcome back, {profile.name?.split(' ')[0] || 'Guest'}.
        </h2>
        <p className="text-[14px] text-[#6B6860]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          You have stayed with us {profile.totalStays || 0} {profile.totalStays === 1 ? 'time' : 'times'} across {profile.totalNights || 0} nights.
        </p>
      </div>

      {/* Preferences form */}
      <div className="rounded-xl border border-[#E8E4DC] bg-white p-6 md:p-8">
        <h3 className="font-display text-[18px] font-light text-[#1A1A18] mb-6">Your preferences</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Pillow preference</label>
            <select value={pillow} onChange={e => setPillow(e.target.value)} className={inputClass} style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
              <option value="">No preference</option>
              <option value="soft">Soft</option>
              <option value="firm">Firm</option>
              <option value="hypoallergenic">Hypoallergenic</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Preferred check-in time</label>
            <select value={checkinTime} onChange={e => setCheckinTime(e.target.value)} className={inputClass} style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
              <option value="">No preference</option>
              <option value="early">Early morning (before 12:00)</option>
              <option value="afternoon">Afternoon (12:00–16:00)</option>
              <option value="evening">Evening (after 16:00)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Dietary requirements</label>
            <textarea
              value={dietary}
              onChange={e => setDietary(e.target.value)}
              placeholder="e.g., vegetarian, gluten-free, nut allergy"
              rows={2}
              className="w-full rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 py-3 text-[14px] text-[#1A1A18] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200 resize-none"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Favourite activities</label>
            <div className="flex flex-wrap gap-2">
              {adventures.map((a: any) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleActivity(a.name)}
                  className={`px-3 py-2 text-[12px] font-medium border transition-all ${
                    favouriteActivities.includes(a.name)
                      ? 'bg-[#1A1A18] text-white border-[#1A1A18]'
                      : 'bg-transparent text-[#6B6860] border-[#E8E4DC] hover:border-[#1A1A18]'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>Wine preference</label>
            <input
              type="text"
              value={wine}
              onChange={e => setWine(e.target.value)}
              placeholder="e.g., Alvarinho, Douro reds"
              className={inputClass}
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Notes for our team</label>
            <textarea
              value={teamNotes}
              onChange={e => setTeamNotes(e.target.value)}
              placeholder="Anything else for your next stay"
              rows={3}
              className="w-full rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 py-3 text-[14px] text-[#1A1A18] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200 resize-none"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={updatePrefs.isPending}
          className="mt-6 inline-flex items-center gap-2 bg-[#8B7355] text-white text-[11px] tracking-[0.12em] font-medium px-8 py-3.5 hover:bg-[#7A6548] transition-colors disabled:opacity-50"
        >
          {saved ? <><Check size={14} /> Saved</> : updatePrefs.isPending ? 'Saving...' : 'Save preferences'}
        </button>
      </div>

      {/* Concierge note */}
      <div className="rounded-xl border border-[#E8E4DC] bg-[#FAFAF7] p-6 md:p-8">
        <p className="text-[14px] text-[#6B6860] italic leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          Before every stay, our concierge reviews your preferences and prepares your home accordingly. You never need to ask twice.
        </p>
      </div>
    </div>
  );
}

/* ================================================================
   STAT CARD
   ================================================================ */
function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-white p-5 hover:shadow-sm transition-shadow duration-200">
      <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2" style={{ fontFamily: 'var(--font-body)' }}>{label}</p>
      <p className={`font-display text-[26px] font-light tracking-tight ${accent ? 'text-[#8B7355]' : 'text-[#1A1A18]'}`}>{value}</p>
    </div>
  );
}

/* ================================================================
   EMPTY STATE
   ================================================================ */
function EmptyState({ icon: Icon, message, cta, href }: { icon: typeof MapPin; message: string; cta?: string; href?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#E8E4DC] bg-white p-10 text-center">
      <div className="w-12 h-12 rounded-xl bg-[#F5F1EB] flex items-center justify-center mx-auto mb-4">
        <Icon size={20} className="text-[#C4A87C]" />
      </div>
      <p className="text-[14px] text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{message}</p>
      {cta && href && (
        <a href={href} className="inline-flex items-center gap-1.5 mt-5 text-[12px] font-medium tracking-[0.1em] uppercase text-[#8B7355] hover:text-[#6B5A42] transition-colors">
          {cta} <ArrowUpRight size={13} />
        </a>
      )}
    </div>
  );
}

/* ================================================================
   PROFILE TAB
   ================================================================ */
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
      <div className="rounded-xl border border-[#E8E4DC] bg-white p-6 md:p-8">
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
              className="w-full h-[48px] rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 text-[14px] text-[#1A1A18] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200"
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
              className="w-full h-[48px] rounded-lg border border-[#E8E4DC] bg-[#F5F1EB] px-4 text-[14px] text-[#9E9A90] cursor-not-allowed"
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
              placeholder="+351 ..."
              className="w-full h-[48px] rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 text-[14px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200"
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
              placeholder="Portuguese, British, German..."
              className="w-full h-[48px] rounded-lg border border-[#E8E4DC] bg-[#FAFAF7] px-4 text-[14px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:ring-2 focus:ring-[#8B7355]/20 focus:border-[#8B7355] transition-all duration-200"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={updateProfile.isPending}
            className="h-[48px] px-8 rounded-lg bg-[#1A1A18] text-[#FAFAF7] text-[12px] font-medium tracking-[0.1em] uppercase hover:bg-[#333330] transition-all duration-200 disabled:opacity-40 flex items-center gap-2"
          >
            {updateProfile.isPending ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : saved ? (
              <Check size={14} className="text-emerald-400" />
            ) : null}
            {saved ? t('account.saved', 'Saved') : t('account.saveChanges', 'Save changes')}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#E8E4DC] bg-white p-6 md:p-8">
        <h2 className="font-display text-[20px] font-light text-[#1A1A18] mb-4">{t('account.accountInfo', 'Account details')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#FAFAF7] border border-[#E8E4DC]/50">
            <span className="text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{t('account.loginMethod', 'Login method')}:</span>
            <span className="text-[#1A1A18] capitalize" style={{ fontWeight: 500 }}>{profile.loginMethod || 'Google'}</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#FAFAF7] border border-[#E8E4DC]/50">
            <span className="text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{t('account.referCode', 'Referral code')}:</span>
            <span className="text-[#1A1A18] font-medium tracking-[0.08em]">{profile.referralCode || 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
