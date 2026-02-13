import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  CompassRose,
  ShipIcon,
  AnchorIcon,
  WaveDecoration,
  Lighthouse,
  RopeKnot,
} from '@/components/nautical/NauticalIcons';

type GoalMode = 'music' | 'time_reduction' | 'strict' | 'cold_turkey';

interface OnboardingProps {
  onComplete: (settings: { goalMode: GoalMode; dailyGoalMinutes: number; restored?: boolean }) => void;
}

const STEPS = ['welcome', 'signin', 'goal', 'time', 'ready'] as const;
type Step = (typeof STEPS)[number];

const PORT_LABELS = ['Harbor', 'Beacon', 'Voyage', 'Charts', 'Open Sea'];

/* ------------------------------------------------------------------ */
/*  Format minutes as coordinate-style: 60'00"                         */
/* ------------------------------------------------------------------ */
function formatAsCoordinate(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}'`;
  }
  return `${mins}'00"`;
}

/* ------------------------------------------------------------------ */
/*  Star field background dots                                         */
/* ------------------------------------------------------------------ */
function StarField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-parchment"
          style={{
            width: `${1 + Math.random() * 2}px`,
            height: `${1 + Math.random() * 2}px`,
            top: `${Math.random() * 40}%`,
            left: `${Math.random() * 100}%`,
            opacity: 0.1 + Math.random() * 0.3,
            animation: `drift-pulse ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated wave footer                                               */
/* ------------------------------------------------------------------ */
function WaveFooter() {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none overflow-hidden">
      <div className="animate-wave-gentle">
        <WaveDecoration width={1200} className="text-teal/30 w-full" />
      </div>
      <div className="animate-wave-gentle" style={{ animationDelay: '1s', marginTop: '-4px' }}>
        <WaveDecoration width={1200} className="text-teal/20 w-full" />
      </div>
      <div className="animate-wave-gentle" style={{ animationDelay: '2s', marginTop: '-2px' }}>
        <WaveDecoration width={1200} className="text-teal-light/10 w-full" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ship's journey progress — 5 ports with dashed route                */
/* ------------------------------------------------------------------ */
function JourneyProgress({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center mb-8 px-4">
      <div className="relative flex items-center w-full max-w-sm">
        {STEPS.map((s, i) => {
          const isActive = i === currentIndex;
          const isPast = i < currentIndex;
          return (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              {/* Port circle */}
              <div className="relative flex flex-col items-center z-10">
                <div
                  className={`w-5 h-5 rounded-full border-2 transition-all duration-500 flex items-center justify-center ${
                    isPast
                      ? 'bg-gold border-gold'
                      : isActive
                        ? 'bg-gold/20 border-gold shadow-[0_0_12px_rgba(212,165,116,0.5)]'
                        : 'bg-navy-light border-gold/30'
                  }`}
                >
                  {isPast && (
                    <div className="w-2 h-2 rounded-full bg-ink" />
                  )}
                </div>
                {/* Ship icon on current port */}
                {isActive && (
                  <div className="absolute -top-7">
                    <ShipIcon drift={0.1} size={22} className="text-gold animate-ship-rock" />
                  </div>
                )}
                {/* Port label */}
                <span
                  className={`text-[9px] mt-1 font-body whitespace-nowrap transition-colors ${
                    isActive ? 'text-gold' : isPast ? 'text-gold/60' : 'text-gold/30'
                  }`}
                >
                  {PORT_LABELS[i]}
                </span>
              </div>

              {/* Dashed route line */}
              {i < STEPS.length - 1 && (
                <div className="flex-1 mx-1 relative">
                  <div
                    className={`h-0.5 border-t-2 border-dashed transition-colors duration-500 ${
                      i < currentIndex ? 'border-gold/60' : 'border-gold/20'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Onboarding component                                          */
/* ------------------------------------------------------------------ */
export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [goalMode, setGoalMode] = useState<GoalMode>('time_reduction');
  const [dailyGoal, setDailyGoal] = useState(60);
  const [authLoading, setAuthLoading] = useState(false);
  const [authUser, setAuthUser] = useState<{ email: string; picture: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const nextStep = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    }
  };

  const handleComplete = () => {
    onComplete({
      goalMode,
      dailyGoalMinutes: dailyGoal,
    });
  };

  const handleSignIn = () => {
    setAuthLoading(true);
    setAuthError(null);
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_IN' }, (response) => {
      if (response?.success && response.user) {
        setAuthUser({ email: response.user.email, picture: response.user.picture });
        // Immediately try to restore — this checks if the server has data
        chrome.runtime.sendMessage({ type: 'RESTORE_DATA', data: { userId: response.user.id } }, (restoreResp) => {
          setAuthLoading(false);
          if (restoreResp?.success && restoreResp.counts) {
            const total = Object.values(restoreResp.counts as Record<string, number>).reduce((a, b) => a + b, 0);
            if (total > 0) {
              // Server had data and it was restored — skip remaining steps
              onComplete({ goalMode: 'time_reduction', dailyGoalMinutes: 60, restored: true });
              return;
            }
          }
          // No existing data (or restore returned empty) — continue normal setup
        });
      } else {
        setAuthLoading(false);
        setAuthError(response?.error || 'Sign in failed');
      }
    });
  };

  /* Slider progress percentage for gold track fill */
  const sliderPercent = ((dailyGoal - 5) / (180 - 5)) * 100;

  return (
    <div className="min-h-screen bg-ocean-gradient flex items-center justify-center p-6 relative overflow-hidden">
      {/* Star constellation dots */}
      <StarField />

      {/* Animated waves at bottom */}
      <WaveFooter />

      <div className="max-w-md w-full relative z-10">
        {/* Ship's Journey Progress */}
        <JourneyProgress currentStep={step} />

        {/* ============================================================ */}
        {/*  Step 1: Prepare to Set Sail (welcome)                       */}
        {/* ============================================================ */}
        {step === 'welcome' && (
          <div className="bg-navy-light/90 backdrop-blur border border-gold/20 rounded-2xl p-8 text-center animate-parchment-unfurl">
            {/* Ship leaving harbor */}
            <div className="mb-6 flex justify-center">
              <div className="relative">
                <ShipIcon drift={0.2} size={96} className="text-gold animate-ship-rock" />
                {/* Subtle harbor silhouette behind ship */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-32 h-3 bg-gradient-to-t from-teal/10 to-transparent rounded-full" />
              </div>
            </div>

            <h1 className="text-3xl font-display text-parchment mb-3 tracking-tight">
              Prepare to Set Sail
            </h1>
            <RopeKnot className="text-gold/40 mx-auto mb-4" />
            <p className="text-parchment-dark/80 font-body mb-8 leading-relaxed text-sm">
              This isn't about abandoning the seas. It's about charting a better course — gradually.
            </p>

            <button
              onClick={nextStep}
              className="w-full py-3.5 bg-gradient-to-r from-gold to-gold-dark text-ink rounded-xl font-semibold font-body flex items-center justify-center gap-2.5 hover:brightness-110 transition-all active:scale-[0.98]"
            >
              <AnchorIcon size={18} className="text-ink" />
              Hoist the Anchor
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 2: The Lighthouse (signin)                              */}
        {/* ============================================================ */}
        {step === 'signin' && (
          <div className="bg-navy-light/90 backdrop-blur border border-gold/20 rounded-2xl p-8 text-center animate-parchment-unfurl">
            {/* Lighthouse with beacon */}
            <div className="mb-6 flex justify-center">
              <div className="relative">
                <Lighthouse size={96} beacon className="text-gold" />
                {/* Beacon glow */}
                <div
                  className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(212,165,116,0.2) 0%, transparent 70%)',
                    animation: 'beacon-rotate 3s linear infinite',
                  }}
                />
              </div>
            </div>

            <h2 className="text-2xl font-display text-parchment mb-3 tracking-tight">
              The Lighthouse
            </h2>
            <RopeKnot className="text-gold/40 mx-auto mb-4" />
            <p className="text-parchment-dark/80 font-body mb-8 leading-relaxed text-sm">
              Your beacon keeps your journey safe across storms and reinstalls.
            </p>

            {authUser ? (
              <div>
                <div className="inline-flex items-center gap-3 bg-navy/50 border border-gold/20 rounded-xl px-5 py-3 mb-6">
                  {authUser.picture && (
                    <img src={authUser.picture} alt="" className="w-8 h-8 rounded-full ring-2 ring-gold/40" />
                  )}
                  <span className="text-parchment font-body text-sm">{authUser.email}</span>
                  <svg className="w-5 h-5 text-seafoam" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>

                <button
                  onClick={nextStep}
                  className="w-full py-3.5 bg-gradient-to-r from-gold to-gold-dark text-ink rounded-xl font-semibold font-body flex items-center justify-center gap-2.5 hover:brightness-110 transition-all active:scale-[0.98]"
                >
                  Continue
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleSignIn}
                  disabled={authLoading}
                  className="w-full py-3.5 bg-navy/50 border-2 border-gold/40 text-parchment rounded-xl font-semibold font-body flex items-center justify-center gap-2.5 hover:border-gold/70 hover:bg-navy/70 transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  {authLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gold" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  Sign in with Google
                </button>
                {authError && (
                  <p className="text-storm-red text-sm mt-3 font-body">{authError}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 3: Choose Your Voyage (goal)                            */}
        {/* ============================================================ */}
        {step === 'goal' && (
          <div className="bg-navy-light/90 backdrop-blur border border-gold/20 rounded-2xl p-8 animate-parchment-unfurl">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-display text-parchment mb-2 tracking-tight">
                Choose Your Voyage
              </h2>
              <RopeKnot className="text-gold/40 mx-auto mb-1" />
              <p className="text-parchment-dark/60 font-body text-sm">
                We'll tailor the winds to your chosen route
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {([
                {
                  mode: 'music' as GoalMode,
                  title: 'Sea Shanty',
                  description: 'Music flows freely, other cargo is watched',
                  icon: (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  ),
                },
                {
                  mode: 'time_reduction' as GoalMode,
                  title: 'Trade Route',
                  description: 'Chart an efficient course, minimize time in port',
                  icon: <CompassRose score={75} size={24} />,
                },
                {
                  mode: 'strict' as GoalMode,
                  title: "Privateer's Code",
                  description: 'Swift drift, strict discipline (1.5x current)',
                  icon: (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                      <line x1="4" y1="22" x2="4" y2="15" />
                    </svg>
                  ),
                },
                {
                  mode: 'cold_turkey' as GoalMode,
                  title: 'Dry Dock',
                  description: 'Hard anchor when provisions run out',
                  icon: <AnchorIcon size={24} />,
                },
              ]).map(({ mode, title, description, icon }) => (
                <button
                  key={mode}
                  onClick={() => setGoalMode(mode)}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-4 group ${
                    goalMode === mode
                      ? 'bg-parchment/10 border-gold/60 shadow-[0_0_20px_rgba(212,165,116,0.15)]'
                      : 'border-gold/10 hover:border-gold/30 hover:bg-parchment/5'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                      goalMode === mode ? 'bg-gold/20 text-gold' : 'bg-parchment/5 text-parchment/50 group-hover:text-parchment/70'
                    }`}
                  >
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-display text-sm transition-colors ${goalMode === mode ? 'text-gold' : 'text-parchment'}`}>
                      {title}
                    </div>
                    <div className="text-xs text-parchment-dark/50 font-body mt-0.5">
                      {description}
                    </div>
                  </div>
                  {goalMode === mode && (
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="w-5 h-5 text-gold" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={nextStep}
              className="w-full py-3.5 bg-gradient-to-r from-gold to-gold-dark text-ink rounded-xl font-semibold font-body flex items-center justify-center gap-2.5 hover:brightness-110 transition-all active:scale-[0.98]"
            >
              Continue
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 4: Chart Your Course (time)                             */}
        {/* ============================================================ */}
        {step === 'time' && (
          <div className="bg-navy-light/90 backdrop-blur border border-gold/20 rounded-2xl p-8 animate-parchment-unfurl">
            <div className="text-center mb-2">
              <h2 className="text-2xl font-display text-parchment mb-2 tracking-tight">
                Chart Your Course
              </h2>
              <RopeKnot className="text-gold/40 mx-auto mb-1" />
              <p className="text-parchment-dark/60 font-body text-sm">
                How much time in port feels healthy?
              </p>
            </div>

            <div className="py-6">
              {/* Compass-style dial around the time value */}
              <div className="relative flex items-center justify-center mb-6">
                <div className="relative">
                  <CompassRose score={100 - sliderPercent} size={140} className="text-gold/40" />
                  {/* Time overlay centered on compass */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="coordinate-text text-3xl text-gold font-bold tracking-wider">
                      {formatAsCoordinate(dailyGoal)}
                    </div>
                    <div className="text-parchment/40 text-[10px] font-body mt-0.5 uppercase tracking-widest">
                      per day
                    </div>
                  </div>
                </div>
              </div>

              {/* Range slider with gold styling */}
              <div className="px-2">
                <input
                  type="range"
                  min={5}
                  max={180}
                  step={5}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #d4a574 0%, #d4a574 ${sliderPercent}%, rgba(212,165,116,0.15) ${sliderPercent}%, rgba(212,165,116,0.15) 100%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-parchment/30 mt-2 font-body">
                  <span>5 min</span>
                  <span>3 hours</span>
                </div>
              </div>
            </div>

            <p className="text-center text-parchment/30 text-xs mb-6 font-body">
              You can always adjust your heading later in the captain's log
            </p>

            <button
              onClick={nextStep}
              className="w-full py-3.5 bg-gradient-to-r from-gold to-gold-dark text-ink rounded-xl font-semibold font-body flex items-center justify-center gap-2.5 hover:brightness-110 transition-all active:scale-[0.98]"
            >
              Continue
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 5: All Hands on Deck (ready)                            */}
        {/* ============================================================ */}
        {step === 'ready' && (
          <div className="bg-navy-light/90 backdrop-blur border border-gold/20 rounded-2xl p-8 text-center animate-parchment-unfurl">
            {/* Large compass rose */}
            <div className="mb-6 flex justify-center">
              <CompassRose score={100} size={120} className="text-gold" />
            </div>

            <h2 className="text-2xl font-display text-parchment mb-3 tracking-tight">
              All Hands on Deck
            </h2>
            <RopeKnot className="text-gold/40 mx-auto mb-4" />
            <p className="text-parchment-dark/70 font-body mb-6 leading-relaxed text-sm">
              For the first 7 days, we'll chart these waters — observing your patterns before adjusting the sails.
            </p>

            {/* Observation info box */}
            <div className="flex items-center gap-3 mb-8 p-4 bg-teal/10 border border-teal/20 rounded-xl text-left">
              <div className="flex-shrink-0">
                <WaveDecoration width={28} className="text-teal-light" />
              </div>
              <span className="text-parchment/70 text-sm font-body leading-snug">
                The Drift system will activate after your observation voyage
              </span>
            </div>

            <button
              onClick={handleComplete}
              className="w-full py-3.5 bg-gradient-to-r from-gold to-gold-dark text-ink rounded-xl font-semibold font-body flex items-center justify-center gap-2.5 hover:brightness-110 transition-all active:scale-[0.98]"
            >
              <ShipIcon drift={0} size={20} className="text-ink" />
              Set Sail!
            </button>
          </div>
        )}
      </div>

      {/* Custom slider thumb styles */}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #d4a574, #b8956a);
          border: 2px solid #f5e6c8;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 12px rgba(212, 165, 116, 0.3);
          transition: transform 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        input[type="range"]::-webkit-slider-thumb:active {
          transform: scale(1.05);
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #d4a574, #b8956a);
          border: 2px solid #f5e6c8;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 12px rgba(212, 165, 116, 0.3);
        }
      `}</style>
    </div>
  );
}
