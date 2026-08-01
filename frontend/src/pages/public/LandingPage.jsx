import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  Mail,
  Phone,
  ChevronDown,
  X,
  LogIn,
  ArrowRight,
  UserPlus,
  GraduationCap,
  BookOpen,
  Shield,
} from "lucide-react";
import crest from "../../assets/maranatha-crest.png";
import {
  NAV_LINKS, STATS, FEATURES, HOW_STEPS, FAQ_DATA, ROLE_CARDS,
  fadeUp, staggerContainer, staggerChild,
  FlowDiagram, HeroIllustration,
} from "./landingData";

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const navigate = useNavigate();
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [faqOpenIndex, setFaqOpenIndex] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const openRegister = () => setShowRegisterModal(true);
  const closeRegister = () => setShowRegisterModal(false);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ============================================================ */}
      {/*  HEADER                                                       */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-50 bg-primary shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={crest} alt="Maranatha University Crest" className="w-9 h-9 object-contain" />
            <span className="text-white font-serif font-bold text-lg hidden sm:inline">
              Maranatha Risk System
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <button
                key={link.target}
                onClick={() => scrollTo(link.target)}
                className="text-white/80 hover:text-gold-400 text-sm font-medium transition-colors"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-1.5 border border-white text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <LogIn size={15} />
              Login
            </button>
            <button
              onClick={openRegister}
              className="flex items-center gap-1.5 bg-gold-400 text-primary font-bold text-sm px-4 py-2 rounded-lg hover:bg-yellow-400 transition-colors"
            >
              <UserPlus size={15} />
              Register
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/*  HERO SECTION                                                 */}
      {/* ============================================================ */}
      <section className="min-h-screen bg-gradient-to-b from-primary via-primary to-[#091428] flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 grid grid-cols-1 lg:grid-cols-5 gap-12 items-center w-full">
          <motion.div
            className="lg:col-span-3"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.p variants={staggerChild} className="inline-block bg-gold-400/15 border border-gold-400/30 text-gold-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-5 tracking-widest uppercase">
              Empowering Academic Success
            </motion.p>
            <motion.h1 variants={staggerChild} className="headline-mixed text-3xl sm:text-4xl lg:text-5xl leading-tight mb-4 text-white">
              Intelligent Academic<br/><em>Risk Detection</em> System
            </motion.h1>
            <motion.p variants={staggerChild} className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-lg mb-10">
              Identify at-risk students early with a 24-feature ML model, explain contributing
              factors with SHAP, and deliver personalised AI-powered interventions — all in real time.
            </motion.p>
            <motion.div variants={staggerChild} className="flex flex-wrap gap-4">
              <button
                onClick={openRegister}
                className="flex items-center gap-2 bg-gold-400 text-primary font-bold px-6 py-3 rounded-lg text-base hover:bg-yellow-400 transition-colors shadow-lg shadow-gold-400/20"
              >
                Get Started <ArrowRight size={18} />
              </button>
              <button
                onClick={() => scrollTo("about")}
                className="flex items-center gap-2 border-2 border-white text-white font-semibold px-6 py-3 rounded-lg text-base hover:bg-white/10 transition-colors"
              >
                Learn More
              </button>
            </motion.div>
          </motion.div>

          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <HeroIllustration />
          </motion.div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  STATS BAR                                                    */}
      {/* ============================================================ */}
      <section className="bg-white py-14 border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-8" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={staggerContainer}>
            {STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <motion.div key={stat.label} variants={staggerChild} className="flex flex-col items-center text-center">
                  <div className="icon-container mb-3"><Icon size={22} /></div>
                  <p className="text-2xl font-bold text-primary">{stat.value}</p>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                </motion.div>
              );
            })}
          </motion.div>
          <div className="mt-10 pt-8 border-t border-slate-100 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Trusted across the university</p>
            <p className="text-sm text-slate-500">4 Faculties &middot; 22 Departments &middot; Hundreds of Students</p>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  ABOUT SECTION                                                */}
      {/* ============================================================ */}
      <section id="about" className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={fadeUp} className="text-center mb-14">
            <span className="section-pill section-pill--gold mb-4 inline-flex">About</span>
            <h2 className="headline-mixed text-3xl sm:text-4xl mb-4">Why This System <em>Matters</em></h2>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerContainer} className="space-y-5 text-gray-600 leading-relaxed">
              <motion.p variants={staggerChild}>
                The Maranatha University Academic Risk Detection System uses machine learning to
                identify students who may be struggling academically — before they fall behind
                irreversibly. By monitoring key engagement indicators, the system provides lecturers
                and administrators with the insights they need to intervene early and effectively.
              </motion.p>
              <motion.p variants={staggerChild}>
                The platform tracks attendance, quiz performance, assignment completion and punctuality,
                login frequency, consecutive absences, weekly mood check-ins, and real SGPA. These data
                points are fed into an XGBoost classification model that computes a weekly risk score for
                every student in every enrolled course.
              </motion.p>
              <motion.p variants={staggerChild}>
                When a student is flagged as medium or high risk, the system automatically generates
                AI-powered intervention recommendations tailored to the individual&#39;s specific
                weaknesses. Lecturers receive actionable alerts and can monitor recovery progress in real time.
              </motion.p>
              <motion.p variants={staggerChild}>
                Built by the Department of Computer Science at Maranatha University, this system
                represents a commitment to data-driven academic support and student success.
              </motion.p>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-primary rounded-2xl p-8 flex items-center justify-center">
              <FlowDiagram direction="horizontal" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FEATURES SECTION                                             */}
      {/* ============================================================ */}
      <section id="features" className="bg-surface-bg py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={fadeUp} className="text-center mb-14">
            <span className="section-pill section-pill--gold mb-4 inline-flex">Features</span>
            <h2 className="headline-mixed text-3xl sm:text-4xl mb-4">What the System <em>Can Do</em></h2>
          </motion.div>

          <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={staggerContainer}>
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <motion.div key={feat.title} variants={staggerChild} whileHover={{ y: -4 }} className="bg-white rounded-2xl border border-slate-100 p-6 flex gap-5 shadow-premium-sm hover:shadow-premium hover:border-gold-400/40 transition-all card-lift">
                  <div className="icon-container--gold icon-container flex-shrink-0"><Icon size={22} /></div>
                  <div>
                    <h3 className="font-serif font-semibold text-primary text-lg mb-1">{feat.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed mb-2">{feat.desc}</p>
                    <button onClick={() => setActiveFeature(feat)} className="arrow-cta">Learn More <ArrowRight size={13} /></button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  HOW IT WORKS                                                 */}
      {/* ============================================================ */}
      <section className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={fadeUp} className="text-center mb-14">
            <span className="section-pill mb-4 inline-flex">Process</span>
            <h2 className="headline-mixed text-3xl sm:text-4xl mb-4">How It <em>Works</em></h2>
          </motion.div>

          <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerContainer}>
            {HOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div key={step.title} variants={staggerChild} className="relative flex flex-col items-center text-center">
                  {i > 0 && (
                    <div className="hidden lg:block absolute -left-3 top-8">
                      <ArrowRight size={20} className="text-gold-400" />
                    </div>
                  )}
                  <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-4 shadow-lg">
                    <Icon size={26} className="text-gold-400" />
                  </div>
                  <span className="text-xs font-bold text-accent uppercase tracking-wider mb-2">Step {i + 1}</span>
                  <h3 className="font-serif font-bold text-primary text-lg mb-2">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed max-w-[220px]">{step.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FAQ SECTION                                                  */}
      {/* ============================================================ */}
      <section id="faq" className="bg-surface-bg py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={fadeUp} className="text-center mb-14">
            <span className="section-pill mb-4 inline-flex">FAQ</span>
            <h2 className="headline-mixed text-3xl sm:text-4xl mb-4">Frequently Asked <em>Questions</em></h2>
          </motion.div>

          <motion.div className="space-y-3" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={staggerContainer}>
            {FAQ_DATA.map((item, i) => {
              const isOpen = faqOpenIndex === i;
              return (
                <motion.div key={i} variants={staggerChild} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <button onClick={() => setFaqOpenIndex(isOpen ? null : i)} className="w-full flex items-center justify-between px-6 py-5 text-left group">
                    <span className="font-semibold text-primary text-base pr-4">{item.q}</span>
                    <ChevronDown size={20} className={`text-accent flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }}>
                        <div className="px-6 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-50 pt-4">{item.a}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  CONTACT SECTION                                              */}
      {/* ============================================================ */}
      <section id="contact" className="bg-primary py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} className="text-center mb-14">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-white mb-4">Get in Touch</h2>
            <div className="w-16 h-1 bg-gold-400 mx-auto" />
          </motion.div>

          <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-8" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={staggerContainer}>
            <motion.div variants={staggerChild} className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-navy-500 flex items-center justify-center mb-4"><MapPin size={24} className="text-gold-400" /></div>
              <p className="text-white font-medium">Maranatha University</p>
              <p className="text-white/60 text-sm">Lagos, Nigeria</p>
            </motion.div>
            <motion.div variants={staggerChild} className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-navy-500 flex items-center justify-center mb-4"><Mail size={24} className="text-gold-400" /></div>
              <p className="text-white font-medium">admin@maranatha.edu.ng</p>
              <p className="text-white/60 text-sm">Email us anytime</p>
            </motion.div>
            <motion.div variants={staggerChild} className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-navy-500 flex items-center justify-center mb-4"><Phone size={24} className="text-gold-400" /></div>
              <p className="text-white font-medium">+234 801 234 5678</p>
              <p className="text-white/60 text-sm">Mon - Fri, 8am - 5pm</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOTER                                                       */}
      {/* ============================================================ */}
      <footer className="bg-[#091428] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-white/40 text-sm">
            &copy; 2026 Maranatha University Academic Risk Detection System. Built by Omeche Chimaobi Benedict.
          </p>
        </div>
      </footer>

      {/* ============================================================ */}
      {/*  REGISTER MODAL                                               */}
      {/* ============================================================ */}
      <AnimatePresence>
        {showRegisterModal && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeRegister} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 z-10" initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} transition={{ duration: 0.3, ease: "easeOut" }}>
              <button onClick={closeRegister} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                <X size={16} className="text-gray-500" />
              </button>
              <h3 className="font-serif text-2xl font-bold text-primary mb-2 text-center">Create Your Account</h3>
              <p className="text-gray-500 text-sm text-center mb-8">Select your role to get started</p>
              <div className="space-y-4">
                {ROLE_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <motion.button key={card.role} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { closeRegister(); navigate(card.path); }} className="w-full flex items-center gap-4 bg-primary rounded-xl p-5 text-left border-2 border-transparent hover:border-gold-400 transition-all group">
                      <div className="w-12 h-12 rounded-lg bg-navy-500 flex items-center justify-center flex-shrink-0 group-hover:bg-gold-400/20 transition-colors"><Icon size={24} className="text-gold-400" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-serif font-bold text-white text-base mb-0.5">{card.role}</p>
                        <p className="text-white/60 text-xs leading-relaxed">{card.desc}</p>
                      </div>
                      <span className="text-gold-400 text-sm font-semibold flex-shrink-0 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        Continue <ArrowRight size={14} />
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/*  FEATURE DETAIL MODAL                                        */}
      {/* ============================================================ */}
      <AnimatePresence>
        {activeFeature && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setActiveFeature(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* modal card */}
            <motion.div
              className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto z-10"
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {/* close button */}
              <button
                onClick={() => setActiveFeature(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors z-10"
              >
                <X size={16} className="text-gray-500" />
              </button>

              <div className="p-8">
                {/* header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="icon-container--gold icon-container flex-shrink-0">
                    {(() => {
                      const Icon = activeFeature.icon;
                      return <Icon size={22} />;
                    })()}
                  </div>
                  <h3 className="font-serif font-bold text-primary text-2xl">
                    {activeFeature.title}
                  </h3>
                </div>

                {/* what it does */}
                <div className="mb-5">
                  <h4 className="text-sm font-bold text-primary uppercase tracking-wide mb-2">
                    What It Does
                  </h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {activeFeature.details?.what}
                  </p>
                </div>

                {/* how it works */}
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-primary uppercase tracking-wide mb-2">
                    How It Works
                  </h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {activeFeature.details?.how}
                  </p>
                </div>

                {/* role cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* students */}
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <div className="flex items-center gap-2 mb-2">
                      <GraduationCap size={16} className="text-blue-600" />
                      <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                        For Students
                      </span>
                    </div>
                    <p className="text-gray-600 text-xs leading-relaxed">
                      {activeFeature.details?.for_students}
                    </p>
                  </div>

                  {/* lecturers */}
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen size={16} className="text-amber-600" />
                      <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                        For Lecturers
                      </span>
                    </div>
                    <p className="text-gray-600 text-xs leading-relaxed">
                      {activeFeature.details?.for_lecturers}
                    </p>
                  </div>

                  {/* admin */}
                  <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={16} className="text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                        For Admin
                      </span>
                    </div>
                    <p className="text-gray-600 text-xs leading-relaxed">
                      {activeFeature.details?.for_admin}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
