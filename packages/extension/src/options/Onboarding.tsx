import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, CheckCircle2, Waves, Music, Clock, Lock, Snowflake } from 'lucide-react';

type GoalMode = 'music' | 'time_reduction' | 'strict' | 'cold_turkey';

interface OnboardingProps {
  onComplete: (settings: { goalMode: GoalMode; dailyGoalMinutes: number }) => void;
}

const STEPS = ['welcome', 'goal', 'time', 'ready'] as const;
type Step = (typeof STEPS)[number];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [goalMode, setGoalMode] = useState<GoalMode>('time_reduction');
  const [dailyGoal, setDailyGoal] = useState(60);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Progress Dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                STEPS.indexOf(step) >= i ? 'bg-white' : 'bg-white/30'
              }`}
            />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="pt-8 pb-6 text-center">
              <div className="text-6xl mb-6">🧘</div>
              <h1 className="text-3xl font-bold text-white mb-4">Welcome to YouTube Detox</h1>
              <p className="text-white/70 mb-8 leading-relaxed">
                This isn't about blocking YouTube completely. It's about building healthier viewing habits — gradually.
              </p>
              <button
                onClick={nextStep}
                className="w-full py-3 bg-white text-slate-900 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-white/90 transition-colors"
              >
                Get Started
                <ArrowRight className="w-5 h-5" />
              </button>
            </CardContent>
          </Card>
        )}

        {/* Step: Goal Mode */}
        {step === 'goal' && (
          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-white">What's your goal?</CardTitle>
              <CardDescription className="text-white/60">We'll customize your experience based on this</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  mode: 'music' as GoalMode,
                  icon: <Music className="w-6 h-6" />,
                  title: 'Music Mode',
                  description: 'I use YouTube for music, want to reduce other content',
                  color: 'from-green-500/20 to-emerald-500/20',
                },
                {
                  mode: 'time_reduction' as GoalMode,
                  icon: <Clock className="w-6 h-6" />,
                  title: 'Time Reduction',
                  description: 'I want to spend less time overall on YouTube',
                  color: 'from-blue-500/20 to-cyan-500/20',
                },
                {
                  mode: 'strict' as GoalMode,
                  icon: <Lock className="w-6 h-6" />,
                  title: 'Strict Mode',
                  description: 'I need strong limits, I struggle with self-control',
                  color: 'from-orange-500/20 to-red-500/20',
                },
                {
                  mode: 'cold_turkey' as GoalMode,
                  icon: <Snowflake className="w-6 h-6" />,
                  title: 'Cold Turkey',
                  description: 'Just block me after my daily limit',
                  color: 'from-purple-500/20 to-pink-500/20',
                },
              ].map(({ mode, icon, title, description, color }) => (
                <button
                  key={mode}
                  onClick={() => setGoalMode(mode)}
                  className={`w-full p-4 rounded-xl border transition-all text-left flex items-start gap-4 ${
                    goalMode === mode
                      ? `bg-gradient-to-r ${color} border-white/40`
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${goalMode === mode ? 'bg-white/20' : 'bg-white/10'}`}>
                    <span className="text-white">{icon}</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white">{title}</div>
                    <div className="text-sm text-white/60">{description}</div>
                  </div>
                  {goalMode === mode && <CheckCircle2 className="w-6 h-6 text-white mt-1" />}
                </button>
              ))}

              <button
                onClick={nextStep}
                className="w-full py-3 bg-white text-slate-900 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-white/90 transition-colors mt-4"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </CardContent>
          </Card>
        )}

        {/* Step: Daily Goal */}
        {step === 'time' && (
          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-white">Daily time goal</CardTitle>
              <CardDescription className="text-white/60">How much YouTube per day feels healthy?</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8">
                <div className="text-6xl font-bold text-white text-center mb-2">{dailyGoal}</div>
                <div className="text-white/60 text-center mb-8">minutes per day</div>

                <input
                  type="range"
                  min={5}
                  max={180}
                  step={5}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(parseInt(e.target.value))}
                  className="w-full h-3 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(dailyGoal / 180) * 100}%, rgba(255,255,255,0.2) ${(dailyGoal / 180) * 100}%, rgba(255,255,255,0.2) 100%)`,
                  }}
                />

                <div className="flex justify-between text-sm text-white/40 mt-2">
                  <span>5 min</span>
                  <span>3 hours</span>
                </div>
              </div>

              <p className="text-center text-white/50 text-sm mb-6">You can always change this later in settings</p>

              <button
                onClick={nextStep}
                className="w-full py-3 bg-white text-slate-900 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-white/90 transition-colors"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </CardContent>
          </Card>
        )}

        {/* Step: Ready */}
        {step === 'ready' && (
          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="pt-8 pb-6 text-center">
              <div className="text-6xl mb-6">📊</div>
              <h2 className="text-2xl font-bold text-white mb-4">Observation Week</h2>
              <p className="text-white/70 mb-6 leading-relaxed">
                For the first 7 days, we'll just observe your habits.
                <br />
                <br />
                <strong className="text-white">No friction yet</strong> — just tracking to understand your baseline.
                After that, we'll start applying gentle friction based on what we learn.
              </p>

              <div className="flex items-center justify-center gap-3 mb-8 p-4 bg-white/5 rounded-xl">
                <Waves className="w-5 h-5 text-blue-400" />
                <span className="text-white/80">Drift system will activate after observation</span>
              </div>

              <button
                onClick={handleComplete}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                Start My Journey
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
