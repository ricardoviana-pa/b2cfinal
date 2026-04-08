/* ==========================================================================
   EXPERIENCE DETAIL — Individual activity page (PDP)
   Shows full details, gallery, booking inquiry, related activities
   ========================================================================== */

import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import {
  MapPin, Clock, Users, ChevronLeft, ChevronRight,
  Check, ArrowRight, MessageCircle, Phone, X
} from 'lucide-react';
import activitiesData from '@/data/activities.json';
import { useSEO } from '@/hooks/useSEO';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

interface Activity {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  shortDescription: string;
  duration: string;
  priceFrom: number;
  currency: string;
  location: string;
  region: string;
  regions: string[];
  images: string[];
  included: string[];
  whatToBring: string[];
  meetingPoint: string;
  difficulty: string;
  minAge: number | null;
  maxParticipants: number;
  cancellationPolicy: string;
  bookingType: string;
  bookingUrl: string | null;
}

const activities = activitiesData as Activity[];

const WHATSAPP_NUMBER = '351927161771';

export default function ExperienceDetail() {
  const params = useParams<{ slug: string }>();
  const activity = activities.find(a => a.slug === params.slug);
  const [currentImage, setCurrentImage] = useState(0);
  const [showInquiry, setShowInquiry] = useState(false);

  useSEO({
    title: activity ? `${activity.title} — Experience` : 'Experience Not Found',
    description: activity?.shortDescription || 'Discover unique activities and adventures in Portugal with Portugal Active.',
    canonical: activity ? `/experiences/${activity.slug}` : '/experiences',
    ogImage: activity?.images?.[0],
    jsonLd: activity ? {
      '@context': 'https://schema.org',
      '@type': 'TouristAttraction',
      name: activity.title,
      description: activity.description,
      url: `https://www.portugalactive.com/experiences/${activity.slug}`,
      image: activity.images?.[0],
      address: {
        '@type': 'PostalAddress',
        addressLocality: activity.location,
        addressCountry: 'PT',
      },
      ...(activity.priceFrom > 0 && {
        offers: {
          '@type': 'Offer',
          priceCurrency: 'EUR',
          price: activity.priceFrom,
          availability: 'https://schema.org/InStock',
        },
      }),
    } : undefined,
  });

  const related = useMemo(() => {
    if (!activity) return [];
    return activities
      .filter(a => a.id !== activity.id && (a.category === activity.category || a.regions.some(r => activity.regions.includes(r))))
      .slice(0, 3);
  }, [activity]);

  if (!activity) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />
        <div className="container py-32 text-center">
          <h1 className="headline-lg text-[#1A1A18] mb-4">Experience not found</h1>
          <Link href="/experiences" className="inline-flex items-center gap-2 text-[#8B7355] font-medium">
            <ChevronLeft className="w-4 h-4" /> Back to Experiences
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const waMsg = encodeURIComponent(`Hi, I'd like to book ${activity.title} on [date]. We are [X] people.`);

  const nextImage = () => setCurrentImage(i => (i + 1) % activity.images.length);
  const prevImage = () => setCurrentImage(i => (i - 1 + activity.images.length) % activity.images.length);

  const categoryLabel = activity.category.charAt(0).toUpperCase() + activity.category.slice(1);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Breadcrumb */}
      <div className="container pt-6 pb-2">
        <nav className="flex items-center gap-2 text-[13px] text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)' }}>
          <Link href="/experiences" className="hover:text-[#1A1A18] transition-colors">Experiences</Link>
          <span>/</span>
          <span className="capitalize">{categoryLabel}</span>
          <span>/</span>
          <span className="text-[#6B6860]">{activity.title}</span>
        </nav>
      </div>

      {/* Image Gallery */}
      <section className="container pb-8">
        <div className="relative overflow-hidden bg-[#E8E4DC]" style={{ aspectRatio: '16/7' }}>
          <img
            src={activity.images[currentImage]}
            alt={`${activity.title} — image ${currentImage + 1}`}
            className="w-full h-full object-cover"
          />
          {activity.images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors"
                aria-label="Previous image"
              >
                <ChevronLeft className="w-5 h-5 text-[#1A1A18]" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors"
                aria-label="Next image"
              >
                <ChevronRight className="w-5 h-5 text-[#1A1A18]" />
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {activity.images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImage(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${i === currentImage ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="container pb-16 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16">
          {/* Left column — 60% */}
          <div className="lg:col-span-3">
            <h1 className="font-display text-[36px] leading-tight text-[#1A1A18] mb-4">{activity.title}</h1>

            {/* Meta line */}
            <div className="flex flex-wrap items-center gap-4 text-[14px] text-[#6B6860] mb-4">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#9E9A90]" /> {activity.location}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#9E9A90]" /> {activity.duration}
              </span>
              {activity.difficulty && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#9E9A90]" /> {activity.difficulty}
                </span>
              )}
            </div>

            {/* Category badge */}
            <span className="inline-block bg-[#1A1A18] text-white text-[10px] tracking-[0.04em] font-medium px-3 py-1 mb-8 capitalize">
              {activity.category}
            </span>

            {/* Description */}
            <div className="text-[16px] text-[#1A1A18] leading-[1.7] mb-10" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
              {activity.description}
            </div>

            {/* What is included */}
            {activity.included.length > 0 && (
              <div className="mb-8">
                <h3 className="text-[18px] font-medium text-[#1A1A18] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                  What is included
                </h3>
                <ul className="space-y-2">
                  {activity.included.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[14px] text-[#1A1A18]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* What to bring */}
            {activity.whatToBring.length > 0 && (
              <div className="mb-8">
                <h3 className="text-[18px] font-medium text-[#1A1A18] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                  What to bring
                </h3>
                <ul className="space-y-2">
                  {activity.whatToBring.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[14px] text-[#6B6860]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                      <span className="w-1.5 h-1.5 bg-[#9E9A90] rounded-full shrink-0 mt-2" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Meeting point */}
            {activity.meetingPoint && (
              <div className="mb-8">
                <h3 className="text-[18px] font-medium text-[#1A1A18] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                  Meeting point
                </h3>
                <p className="text-[14px] text-[#6B6860] flex items-start gap-2" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                  <MapPin className="w-4 h-4 text-[#9E9A90] shrink-0 mt-0.5" />
                  {activity.meetingPoint}
                </p>
              </div>
            )}

            {/* Good to know */}
            <div className="mb-8">
              <h3 className="text-[18px] font-medium text-[#1A1A18] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                Good to know
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activity.difficulty && (
                  <div className="text-[14px]">
                    <span className="text-[#9E9A90] font-medium block text-[12px] tracking-[0.04em] mb-0.5">DIFFICULTY</span>
                    <span className="text-[#1A1A18]" style={{ fontWeight: 300 }}>{activity.difficulty}</span>
                  </div>
                )}
                {activity.minAge && (
                  <div className="text-[14px]">
                    <span className="text-[#9E9A90] font-medium block text-[12px] tracking-[0.04em] mb-0.5">MINIMUM AGE</span>
                    <span className="text-[#1A1A18]" style={{ fontWeight: 300 }}>{activity.minAge} years</span>
                  </div>
                )}
                {activity.maxParticipants && (
                  <div className="text-[14px]">
                    <span className="text-[#9E9A90] font-medium block text-[12px] tracking-[0.04em] mb-0.5">MAX PARTICIPANTS</span>
                    <span className="text-[#1A1A18]" style={{ fontWeight: 300 }}>{activity.maxParticipants} people</span>
                  </div>
                )}
                {activity.cancellationPolicy && (
                  <div className="text-[14px]">
                    <span className="text-[#9E9A90] font-medium block text-[12px] tracking-[0.04em] mb-0.5">CANCELLATION</span>
                    <span className="text-[#1A1A18]" style={{ fontWeight: 300 }}>{activity.cancellationPolicy}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column — Booking card (40%, sticky) */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-28 bg-white border border-[#E8E4DC] p-8">
              <p className="font-display text-[28px] text-[#1A1A18] mb-1">
                From {activity.priceFrom} €
              </p>
              <p className="text-[14px] text-[#9E9A90] mb-4">per person</p>

              <p className="text-[14px] text-[#6B6860] mb-6 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#9E9A90]" /> {activity.duration}
              </p>

              <div className="border-t border-[#E8E4DC] mb-6" />

              {/* TODO: Replace inquiry form with Bokun booking widget when integrated */}
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-[#1A1A18] text-white text-[12px] tracking-[0.08em] font-medium py-4 hover:bg-[#333330] transition-colors mb-3"
              >
                <MessageCircle className="w-4 h-4" /> REQUEST BOOKING
              </a>

              <button
                onClick={() => setShowInquiry(true)}
                className="w-full flex items-center justify-center gap-2 border border-[#E8E4DC] text-[#6B6860] text-[12px] tracking-[0.08em] font-medium py-4 hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors mb-6"
              >
                SEND INQUIRY
              </button>

              <p className="text-[13px] text-[#9E9A90] text-center mb-2 flex items-center justify-center gap-2">
                <Phone className="w-3.5 h-3.5" /> +351 927 161 771
              </p>
              <p className="text-[12px] text-[#9E9A90] text-center">
                {activity.cancellationPolicy}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Related Activities */}
      {related.length > 0 && (
        <section className="section-padding bg-[#F5F1EB]">
          <div className="container">
            <h2 className="headline-md text-[#1A1A18] mb-8">You might also enjoy</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map(r => (
                <Link
                  key={r.id}
                  href={`/experiences/${r.slug}`}
                  className="bg-white border border-[#E8E4DC] overflow-hidden group block"
                >
                  <div className="relative overflow-hidden" style={{ aspectRatio: '4/3' }}>
                    <img src={r.images[0]} alt={r.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                    <span className="absolute top-3 left-3 bg-[#1A1A18]/80 backdrop-blur-sm text-white text-[10px] tracking-[0.04em] font-medium px-2.5 py-1 capitalize">
                      {r.category}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-lg text-[#1A1A18] mb-1 group-hover:text-[#8B7355] transition-colors">{r.title}</h3>
                    <p className="text-[13px] text-[#6B6860] font-light mb-2 line-clamp-2">{r.shortDescription}</p>
                    <p className="text-[13px] text-[#1A1A18] font-medium">
                      {r.duration} · From {r.priceFrom} €
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Inquiry Modal */}
      {showInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md p-8 relative">
            <button onClick={() => setShowInquiry(false)} className="absolute top-4 right-4 text-[#9E9A90] hover:text-[#1A1A18]">
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-display text-xl text-[#1A1A18] mb-2">Inquire about {activity.title}</h3>
            <p className="text-[13px] text-[#9E9A90] mb-6">Fill in the details and our team will get back to you within 24 hours.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const data = new FormData(form);
                const msg = encodeURIComponent(
                  `Hi, I'd like to book ${activity.title}.\n\nName: ${data.get('name')}\nEmail: ${data.get('email')}\nDate: ${data.get('date')}\nParticipants: ${data.get('participants')}\nMessage: ${data.get('message')}`
                );
                window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
                setShowInquiry(false);
              }}
              className="space-y-4"
            >
              <input name="name" required placeholder="Your name" className="w-full border border-[#E8E4DC] px-4 py-3 text-[14px] focus:border-[#1A1A18] outline-none transition-colors" />
              <input name="email" type="email" required placeholder="Email address" className="w-full border border-[#E8E4DC] px-4 py-3 text-[14px] focus:border-[#1A1A18] outline-none transition-colors" />
              <input name="date" type="date" required className="w-full border border-[#E8E4DC] px-4 py-3 text-[14px] focus:border-[#1A1A18] outline-none transition-colors" />
              <input name="participants" type="number" min="1" required placeholder="Number of participants" className="w-full border border-[#E8E4DC] px-4 py-3 text-[14px] focus:border-[#1A1A18] outline-none transition-colors" />
              <textarea name="message" rows={3} placeholder="Any special requests?" className="w-full border border-[#E8E4DC] px-4 py-3 text-[14px] focus:border-[#1A1A18] outline-none transition-colors resize-none" />
              <button type="submit" className="w-full bg-[#1A1A18] text-white text-[12px] tracking-[0.08em] font-medium py-4 hover:bg-[#333330] transition-colors">
                SEND INQUIRY
              </button>
            </form>
          </div>
        </div>
      )}

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
