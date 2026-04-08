/* ==========================================================================
   CONCIERGE — Guest services page
   Services available exclusively to Portugal Active guests
   ========================================================================== */

import { Link } from 'wouter';
import {
  ChefHat, Sparkles, Home, Car, Baby, Dumbbell, ShoppingBag,
  Shirt, BedDouble, PartyPopper, ArrowRight, MessageCircle
} from 'lucide-react';
import conciergeData from '@/data/concierge-services.json';
import { useSEO } from '@/hooks/useSEO';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

interface ConciergeService {
  id: string;
  title: string;
  icon: string;
  description: string;
  shortDescription: string;
  priceNote: string;
  leadTime: string;
  availableInAllProperties: boolean;
}

const services = conciergeData as ConciergeService[];

const ICON_MAP: Record<string, React.ReactNode> = {
  'chef-hat': <ChefHat className="w-6 h-6" />,
  'sparkles': <Sparkles className="w-6 h-6" />,
  'home': <Home className="w-6 h-6" />,
  'car': <Car className="w-6 h-6" />,
  'baby': <Baby className="w-6 h-6" />,
  'dumbbell': <Dumbbell className="w-6 h-6" />,
  'shopping-bag': <ShoppingBag className="w-6 h-6" />,
  'shirt': <Shirt className="w-6 h-6" />,
  'bed': <BedDouble className="w-6 h-6" />,
  'party-popper': <PartyPopper className="w-6 h-6" />,
};

const WHATSAPP_BASE = 'https://wa.me/351927161771?text=';

export default function Concierge() {
  useSEO({
    title: 'Concierge Services',
    description: 'Every Portugal Active guest has access to a dedicated concierge. Private chef, in-villa spa, airport transfers, housekeeping and more. One message arranges everything.',
    canonical: '/concierge',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Portugal Active Concierge',
      description: 'Dedicated concierge services for every Portugal Active guest. Private chef, spa, transfers, housekeeping and more.',
      url: 'https://www.portugalactive.com/concierge',
      provider: {
        '@type': 'Organization',
        name: 'Portugal Active',
        url: 'https://www.portugalactive.com',
      },
      areaServed: {
        '@type': 'Country',
        name: 'Portugal',
      },
    },
  });

  const waConciergeMsg = encodeURIComponent("Hi, I'd like to learn more about your concierge services for my upcoming stay.");

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1400&q=80"
          alt="Portugal Active concierge services"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/10" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <p className="text-[11px] font-medium text-white/60 mb-3" style={{ letterSpacing: '0.08em' }}>
            FOR OUR GUESTS
          </p>
          <h1 className="headline-xl text-white mb-4">Your concierge. Your stay. Your rules.</h1>
          <p className="body-lg max-w-xl" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Every Portugal Active guest has access to a dedicated concierge team. One message arranges everything.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="section-padding bg-white">
        <div className="container">
          <p className="text-[12px] font-medium text-[#8B7355] mb-3 text-center" style={{ letterSpacing: '0.08em' }}>
            HOW IT WORKS
          </p>
          <h2 className="headline-lg text-[#1A1A18] mb-12 text-center">Three steps. Zero friction.</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-4xl mx-auto">
            {[
              {
                step: '01',
                title: 'You book a home',
                body: 'Choose from our curated collection of private villas and apartments across Portugal.',
              },
              {
                step: '02',
                title: 'Your concierge contacts you before arrival',
                body: 'Within 48 hours of booking, your dedicated concierge reaches out to understand your preferences.',
              },
              {
                step: '03',
                title: 'One message arranges anything you need',
                body: 'Private chef, spa, transfers, restaurant reservations, activity bookings. Send a message and consider it done.',
              },
            ].map(item => (
              <div key={item.step} className="text-center md:text-left">
                <span className="text-[48px] font-display text-[#E8E4DC] leading-none block mb-4">{item.step}</span>
                <h3 className="text-[17px] font-medium text-[#1A1A18] mb-2" style={{ fontFamily: 'var(--font-body)' }}>
                  {item.title}
                </h3>
                <p className="text-[14px] text-[#6B6860] leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="section-padding bg-[#FAFAF7]">
        <div className="container">
          <p className="text-[12px] font-medium text-[#8B7355] mb-3" style={{ letterSpacing: '0.08em' }}>
            SERVICES
          </p>
          <h2 className="headline-lg text-[#1A1A18] mb-10">Everything at your fingertips</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map(service => (
              <div key={service.id} className="bg-white border border-[#E8E4DC] p-6">
                <div className="w-12 h-12 bg-[#F5F1EB] flex items-center justify-center text-[#8B7355] mb-4">
                  {ICON_MAP[service.icon] || <Sparkles className="w-6 h-6" />}
                </div>
                <h3 className="text-[17px] font-medium text-[#1A1A18] mb-2" style={{ fontFamily: 'var(--font-body)' }}>
                  {service.title}
                </h3>
                <p className="text-[14px] text-[#6B6860] font-light mb-3 leading-relaxed">
                  {service.shortDescription}
                </p>
                {service.priceNote && (
                  <p className="text-[13px] text-[#8B7355] font-medium mb-1">{service.priceNote}</p>
                )}
                {service.leadTime && (
                  <p className="text-[12px] text-[#9E9A90]">{service.leadTime}</p>
                )}
              </div>
            ))}
          </div>

          {/* Important note */}
          <div className="max-w-3xl mx-auto mt-12 text-center">
            <p className="text-[14px] text-[#6B6860] leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
              Concierge services are available to every Portugal Active guest. There is no subscription or membership.
              Some services carry individual costs. Your concierge provides transparent pricing before you confirm anything.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-[#1A1A18]">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="headline-lg text-white mb-4">Ready to experience it?</h2>
          <p className="body-lg mb-8" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Browse our collection of private homes or speak to our concierge team about your upcoming stay.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/homes"
              className="inline-flex items-center justify-center gap-2 bg-white text-[#1A1A18] text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#F5F1EB] transition-colors"
            >
              EXPLORE OUR HOMES <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={`${WHATSAPP_BASE}${waConciergeMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-white/30 text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-white/10 transition-colors"
            >
              <MessageCircle className="w-4 h-4" /> CONTACT OUR CONCIERGE
            </a>
          </div>
        </div>
      </section>

      {/* Bridge to Experiences */}
      <section className="section-padding bg-[#F5F1EB]">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="headline-md text-[#1A1A18] mb-4">Looking for activities?</h2>
          <p className="body-md mb-8" style={{ color: '#6B6860' }}>
            Our adventure experiences, wine tastings, and guided tours are open to everyone. Browse and book online.
          </p>
          <Link
            href="/experiences"
            className="inline-flex items-center gap-2 bg-[#1A1A18] text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#333330] transition-colors"
          >
            EXPLORE EXPERIENCES <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
