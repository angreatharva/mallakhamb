import { Link } from 'react-router-dom';
import { Users, UserCheck, Trophy, Calendar, Camera, Menu, X, MapPin, Phone, Mail } from 'lucide-react';
import { useState, useEffect } from 'react';
import TextReveal from '../components/magicui/TextReveal';
import { BentoGrid, BentoGridItem } from '../components/magicui/BentoGrid';
import PixelImage from '../components/magicui/PixelImage';
import { ResponsiveImage, ResponsiveHeroImage } from '../components/responsive/ResponsiveImage';
import { ResponsiveContainer, ResponsiveSectionContainer } from '../components/responsive/ResponsiveContainer';
import { 
  ResponsiveHeading, 
  ResponsiveHeroText, 
  ResponsiveText, 
  ResponsiveLink,
  ResponsiveNavText 
} from '../components/responsive/ResponsiveTypography';
import MainHomeImg from '../assets/main-home.jpg';
import TextRevealBg from '../assets/Mallakhamb.png';
import BHALogo from '../assets/BHA.png';

const Home = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  // Close mobile menu on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const closeMobileMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-orange-100">
      {/* Professional Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
        <ResponsiveContainer maxWidth="full" padding="responsive">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="relative">
                <ResponsiveImage 
                  src={BHALogo} 
                  alt="BHA Logo" 
                  className="h-12 md:h-16 w-auto object-contain" 
                  objectFit="contain"
                  lazy={false}
                />
              </div>
              <div className="hidden sm:block">
                <ResponsiveHeading level={1} className="text-white drop-shadow-lg">
                  <span className="text-orange-500 block">Bhausaheb Ranade</span>
                  <span>Mallakhamb Competition</span>
                </ResponsiveHeading>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <Link
                to="/"
                className="text-white hover:text-orange-400 font-medium transition-colors duration-200 relative group drop-shadow-lg"
              >
                <ResponsiveNavText className="text-white hover:text-orange-400 drop-shadow-lg">
                  HOME
                </ResponsiveNavText>
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-orange-500 transition-all duration-200 group-hover:w-full"></span>
              </Link>
              <Link
                to="/about"
                className="text-white hover:text-orange-400 font-medium transition-colors duration-200 relative group drop-shadow-lg"
              >
                <ResponsiveNavText className="text-white hover:text-orange-400 drop-shadow-lg">
                  ABOUT
                </ResponsiveNavText>
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-orange-500 transition-all duration-200 group-hover:w-full"></span>
              </Link>
              <Link
                to="/gallery"
                className="text-white hover:text-orange-400 font-medium transition-colors duration-200 relative group drop-shadow-lg"
              >
                <ResponsiveNavText className="text-white hover:text-orange-400 drop-shadow-lg">
                  GALLERY
                </ResponsiveNavText>
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-orange-500 transition-all duration-200 group-hover:w-full"></span>
              </Link>
              <Link
                to="/contact"
                className="text-white hover:text-orange-400 font-medium transition-colors duration-200 relative group drop-shadow-lg"
              >
                <ResponsiveNavText className="text-white hover:text-orange-400 drop-shadow-lg">
                  CONTACT US
                </ResponsiveNavText>
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-orange-500 transition-all duration-200 group-hover:w-full"></span>
              </Link>
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg text-white hover:bg-white/10 transition-colors drop-shadow-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Toggle mobile menu"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <div 
              className="md:hidden py-4 bg-black/80 backdrop-blur-md rounded-lg mt-2 border-t border-white/10 relative z-50"
            >
              <div className="flex flex-col space-y-4">
                <Link
                  to="/"
                  className="text-white hover:text-orange-400 font-medium transition-colors drop-shadow-lg min-h-[44px] px-3 py-2 flex items-center"
                  onClick={closeMobileMenu}
                >
                  <ResponsiveNavText className="text-white hover:text-orange-400 drop-shadow-lg">
                    HOME
                  </ResponsiveNavText>
                </Link>
                <Link
                  to="/about"
                  className="text-white hover:text-orange-400 font-medium transition-colors drop-shadow-lg min-h-[44px] px-3 py-2 flex items-center"
                  onClick={closeMobileMenu}
                >
                  <ResponsiveNavText className="text-white hover:text-orange-400 drop-shadow-lg">
                    ABOUT
                  </ResponsiveNavText>
                </Link>
                <Link
                  to="/gallery"
                  className="text-white hover:text-orange-400 font-medium transition-colors drop-shadow-lg min-h-[44px] px-3 py-2 flex items-center"
                  onClick={closeMobileMenu}
                >
                  <ResponsiveNavText className="text-white hover:text-orange-400 drop-shadow-lg">
                    GALLERY
                  </ResponsiveNavText>
                </Link>
                <Link
                  to="/contact"
                  className="text-white hover:text-orange-400 font-medium transition-colors drop-shadow-lg min-h-[44px] px-3 py-2 flex items-center"
                  onClick={closeMobileMenu}
                >
                  <ResponsiveNavText className="text-white hover:text-orange-400 drop-shadow-lg">
                    CONTACT US
                  </ResponsiveNavText>
                </Link>
                <Link
                  to="/login"
                  className="px-6 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-full font-semibold text-center min-h-[44px] flex items-center justify-center"
                  onClick={closeMobileMenu}
                >
                  Login
                </Link>
              </div>
            </div>
          )}
        </ResponsiveContainer>
      </header>

      {/* Hero Section */}
      <div className="relative h-screen overflow-hidden">
        {/* Background Image Layer (Bottom) */}
        <ResponsiveHeroImage
          src={MainHomeImg}
          alt="Mallakhamb Competition Background"
          overlay={true}
          overlayOpacity={0.7}
          className="absolute inset-0 w-full h-full z-0"
        />

        {/* Content Layer (Top) */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
          <ResponsiveContainer className="text-center px-4 max-w-6xl">
            {/* Main Title - Bhausaheb Ranade */}
            <div className="mb-8">
              <ResponsiveHeroText className="text-white mb-4 drop-shadow-2xl font-bold tracking-tight">
                Bhausaheb Ranade
              </ResponsiveHeroText>
              <ResponsiveHeading level={1} className="text-orange-400 font-bold mb-2 drop-shadow-xl text-2xl md:text-4xl lg:text-5xl">
                Mallakhamb Competition
              </ResponsiveHeading>
            </div>

            {/* Subtitle */}
            <ResponsiveHeading level={2} className="font-light text-gray-100 mb-12 drop-shadow-lg text-lg md:text-xl lg:text-2xl max-w-4xl mx-auto">
              The Ultimate Traditional Sports Competition Platform
            </ResponsiveHeading>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <Link
                to="/player/register"
                className="group px-8 md:px-10 py-4 md:py-5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-full font-bold hover:from-orange-600 hover:to-orange-700 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 shadow-2xl hover:shadow-orange-500/30 flex items-center justify-center gap-3 border-2 border-orange-400/50 min-h-[56px] backdrop-blur-sm"
              >
                <Users className="w-5 h-5 md:w-6 md:h-6 group-hover:scale-110 transition-transform" />
                <span className="text-base md:text-lg font-bold tracking-wide">
                  PLAYER LOGIN / REGISTER
                </span>
              </Link>
              <Link
                to="/coach/login"
                className="group px-8 md:px-10 py-4 md:py-5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full font-bold hover:from-green-600 hover:to-green-700 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 shadow-2xl hover:shadow-green-500/30 flex items-center justify-center gap-3 border-2 border-green-400/50 min-h-[56px] backdrop-blur-sm"
              >
                <UserCheck className="w-5 h-5 md:w-6 md:h-6 group-hover:scale-110 transition-transform" />
                <span className="text-base md:text-lg font-bold tracking-wide">
                  TEAM COACH LOGIN / REGISTER
                </span>
              </Link>
            </div>

            {/* Additional Info */}
            <div className="mt-12 text-center">
              <ResponsiveText className="text-gray-200 drop-shadow-md text-sm md:text-base">
                Celebrating Traditional Indian Sports Since 1984
              </ResponsiveText>
            </div>
          </ResponsiveContainer>
        </div>

        {/* Decorative Elements Layer (Middle) */}
        <div className="absolute inset-0 z-10">
          {/* Bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/20 to-transparent"></div>
          
          {/* Floating decorative elements */}
          <div className="absolute top-1/4 left-10 w-20 h-20 bg-orange-500/20 rounded-full blur-xl animate-pulse"></div>
          <div className="absolute top-1/3 right-10 w-16 h-16 bg-green-500/20 rounded-full blur-xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-1/4 left-1/4 w-12 h-12 bg-blue-500/20 rounded-full blur-xl animate-pulse delay-500"></div>
        </div>
      </div>

      {/* Text Reveal Section */}
      <ResponsiveSectionContainer className="bg-white">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-16 items-center min-h-[60vh] lg:min-h-[80vh]">
          {/* Image on the left - takes 2 columns */}
          <div className="relative lg:col-span-2 order-2 lg:order-1">
            <div className="aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl ml-0 lg:-ml-8">
              <ResponsiveImage
                src={TextRevealBg}
                alt="Mallakhamb Sport"
                aspectRatio="4/5"
                objectFit="cover"
                objectPosition="center"
                className="w-full h-full"
              />
            </div>
            {/* Decorative elements */}
            <div className="absolute -top-4 -left-4 w-16 h-16 lg:w-24 lg:h-24 bg-blue-500/20 rounded-full blur-xl"></div>
            <div className="absolute -bottom-6 -right-6 w-20 h-20 lg:w-32 lg:h-32 bg-green-500/20 rounded-full blur-xl"></div>
          </div>

          {/* Text on the right - takes 3 columns */}
          <div className="space-y-6 lg:space-y-8 lg:col-span-3 w-full max-w-none order-1 lg:order-2">
            <div className="w-full pr-0 lg:pr-8">
              <TextReveal
                text="Mallakhamb is a traditional sport, originating from the Indian subcontinent, in which a gymnast performs aerial yoga or gymnastic postures and wrestling grips in concert with a vertical stationary or hanging wooden pole, cane, or rope."
                className="text-gray-700 leading-relaxed w-full text-responsive-body"
              />
            </div>
          </div>
        </div>
      </ResponsiveSectionContainer>

      {/* Features Bento Grid */}
      <ResponsiveSectionContainer className="bg-gray-50">
        <ResponsiveHeading level={3} className="text-center mb-8 lg:mb-16 text-gray-900">
          Explore the Competition
        </ResponsiveHeading>
        <BentoGrid className="max-w-6xl mx-auto">
          {items.map((item, i) => (
            <BentoGridItem
              key={i}
              title={item.title}
              description={item.description}
              header={item.header}
              icon={item.icon}
              href={item.href}
              className={i === 0 || i === 3 ? "md:col-span-2" : ""}
            />
          ))}
        </BentoGrid>
      </ResponsiveSectionContainer>

      {/* Comprehensive Footer */}
      <footer className="bg-black text-white">
        {/* Red accent bar */}
        <div className="h-1 bg-red-600"></div>

        <ResponsiveContainer maxWidth="full" padding="responsive" className="py-8 lg:py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {/* Company Info Section */}
            <div className="space-y-4">
              <ResponsiveHeading level={3} className="text-white mb-4">
                Bhausaheb Ranade Navodit<br />
                Mallakhamb Competition 2025
              </ResponsiveHeading>
              <ResponsiveText size="sm" className="text-gray-300 leading-relaxed">
                Bhausaheb Ranade Navodit Mallakhamb Competition is a Sports Event, started in 1984 and produced many award winning and national player.
              </ResponsiveText>
              {/* Social Media Icons */}
              <div className="flex space-x-3 pt-4">
                <a
                  href="#"
                  className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                  aria-label="Twitter"
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                  </svg>
                </a>
                <a
                  href="https://www.facebook.com/bhausahebranade/"
                  className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                  aria-label="Facebook"
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                  aria-label="Instagram"
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 6.62 5.367 11.987 11.988 11.987 6.62 0 11.987-5.367 11.987-11.987C24.014 5.367 18.637.001 12.017.001zM8.449 16.988c-1.297 0-2.448-.49-3.323-1.297C4.198 14.895 3.708 13.744 3.708 12.447s.49-2.448 1.297-3.323C5.902 8.198 7.053 7.708 8.35 7.708s2.448.49 3.323 1.297c.897.875 1.387 2.026 1.387 3.323s-.49 2.448-1.297 3.323c-.875.897-2.026 1.387-3.323 1.387zm7.718 0c-1.297 0-2.448-.49-3.323-1.297-.897-.875-1.387-2.026-1.387-3.323s.49-2.448 1.297-3.323c.875-.897 2.026-1.387 3.323-1.387s2.448.49 3.323 1.297c.897.875 1.387 2.026 1.387 3.323s-.49 2.448-1.297 3.323c-.875.897-2.026 1.387-3.323 1.387z"/>
                  </svg>
                </a>
              </div>
            </div>

            {/* About Us Section */}
            <div className="space-y-4">
              <ResponsiveHeading level={3} className="text-white mb-4">About Us</ResponsiveHeading>
              <ul className="space-y-3">
                <li>
                  <ResponsiveLink
                    to="/about"
                    variant="secondary"
                    className="text-gray-300 hover:text-orange-400 transition-colors flex items-center"
                  >
                    <span className="mr-2">→</span>
                    Our Story
                  </ResponsiveLink>
                </li>
                <li>
                  <ResponsiveLink
                    to="/team"
                    variant="secondary"
                    className="text-gray-300 hover:text-orange-400 transition-colors flex items-center"
                  >
                    <span className="mr-2">→</span>
                    Meet the team
                  </ResponsiveLink>
                </li>
                <li>
                  <ResponsiveLink
                    to="/coach"
                    variant="secondary"
                    className="text-gray-300 hover:text-orange-400 transition-colors flex items-center"
                  >
                    <span className="mr-2">→</span>
                    Coach
                  </ResponsiveLink>
                </li>
              </ul>
            </div>

            {/* BRMC Section */}
            <div className="space-y-4">
              <ResponsiveHeading level={3} className="text-white mb-4">BRMC</ResponsiveHeading>
              <ul className="space-y-3">
                <li>
                  <ResponsiveLink
                    to="/privacy"
                    variant="secondary"
                    className="text-gray-300 hover:text-orange-400 transition-colors flex items-center"
                  >
                    <span className="mr-2">→</span>
                    Privacy Policy
                  </ResponsiveLink>
                </li>
                <li>
                  <ResponsiveLink
                    to="/terms"
                    variant="secondary"
                    className="text-gray-300 hover:text-orange-400 transition-colors flex items-center"
                  >
                    <span className="mr-2">→</span>
                    Terms & Conditions
                  </ResponsiveLink>
                </li>
                <li>
                  <ResponsiveLink
                    to="/refund"
                    variant="secondary"
                    className="text-gray-300 hover:text-orange-400 transition-colors flex items-center"
                  >
                    <span className="mr-2">→</span>
                    Cancellation & Refund Policy
                  </ResponsiveLink>
                </li>
              </ul>
            </div>

            {/* Contact Section */}
            <div className="space-y-4">
              <ResponsiveHeading level={3} className="text-white mb-4">Have a Questions?</ResponsiveHeading>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <MapPin className="w-5 h-5 text-orange-400 mt-1 flex-shrink-0" />
                  <ResponsiveText size="sm" className="text-gray-300">
                    Sane Guruji Vidya Mandir, Santacruz(E),<br />
                    Mumbai.
                  </ResponsiveText>
                </div>
                <div className="flex items-center space-x-3">
                  <Phone className="w-5 h-5 text-orange-400 flex-shrink-0" />
                  <ResponsiveLink
                    href="tel:+919820688420"
                    variant="secondary"
                    className="text-gray-300 hover:text-orange-400 transition-colors"
                  >
                    +91 982 068 8420
                  </ResponsiveLink>
                </div>
                <div className="flex items-center space-x-3">
                  <Mail className="w-5 h-5 text-orange-400 flex-shrink-0" />
                  <ResponsiveLink
                    href="mailto:mallakhambindia@gmail.com"
                    variant="secondary"
                    className="text-gray-300 hover:text-orange-400 transition-colors"
                  >
                    mallakhambindia@gmail.com
                  </ResponsiveLink>
                </div>
              </div>
            </div>
          </div>
        </ResponsiveContainer>

        {/* Copyright Section */}
        <div className="border-t border-gray-800 py-4 lg:py-6">
          <ResponsiveContainer maxWidth="full" padding="responsive" className="text-center">
            <ResponsiveText size="xs" className="text-gray-400">
              Copyright © 2025 All rights reserved for Bhausaheb Ranade Mallakhamb & Gymnastics Competition.
            </ResponsiveText>
          </ResponsiveContainer>
        </div>
      </footer>
    </div>
  );
};

const items = [
  {
    title: "Live Scoring",
    description: "Real-time updates of scores as they happen.",
    header: <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-200 to-neutral-100"></div>,
    icon: <Trophy className="h-4 w-4 text-neutral-500" />,
    href: "/judge",
  },
  {
    title: "Team Management",
    description: "Manage your squad, assign roles, and track performance.",
    header: <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-200 to-neutral-100"></div>,
    icon: <Users className="h-4 w-4 text-neutral-500" />,
    href: "/coach",
  },
  {
    title: "Event Gallery",
    description: "Capture and view moments from the competition.",
    header: <PixelImage 
      src="https://images.unsplash.com/photo-1517649763962-0c623066013b?q=80&w=2070&auto=format&fit=crop" 
      className="rounded-xl flex-1 w-full object-cover min-h-0" 
      aspectRatio="16/10"
      objectFit="cover"
    />,
    icon: <Camera className="h-4 w-4 text-neutral-500" />,
    href: "/gallery",
  },
  {
    title: "Schedule & Rules",
    description: "Stay updated with the latest schedule and competition rules.",
    header: <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-200 to-neutral-100"></div>,
    icon: <Calendar className="h-4 w-4 text-neutral-500" />,
    href: "/schedule",
  },
];

export default Home;