import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Cloud, 
  Settings as SettingsIcon, 
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  User,
  Waves,
  Eye,
  MessageSquare,
  Sidebar,
  Play,
  Plus,
  X,
} from 'lucide-react';
import Dashboard from './Dashboard';

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

type GoalMode = 'music' | 'time_reduction' | 'strict' | 'cold_turkey';
type ChallengeTier = 'casual' | 'focused' | 'disciplined' | 'monk' | 'ascetic';

interface FrictionEnabled {
  thumbnails: boolean;
  sidebar: boolean;
  comments: boolean;
  player: boolean;
  autoplay: boolean;
}

interface SettingsState {
  trackingEnabled: boolean;
  dailyGoalMinutes: number;
  productivityPrompts: boolean;
  promptChance: number;
  weeklyReports: boolean;
  backend: {
    enabled: boolean;
    url: string;
    userId: string;
  };
  goalMode: GoalMode;
  challengeTier: ChallengeTier;
  frictionEnabled: FrictionEnabled;
  whitelistedChannels: string[];
}

const defaultSettings: SettingsState = {
  trackingEnabled: true,
  dailyGoalMinutes: 60,
  productivityPrompts: true,
  promptChance: 30,
  weeklyReports: true,
  backend: {
    enabled: false,
    url: 'http://localhost:8000',
    userId: '',
  },
  goalMode: 'time_reduction',
  challengeTier: 'casual',
  frictionEnabled: {
    thumbnails: true,
    sidebar: true,
    comments: true,
    player: false,
    autoplay: true,
  },
  whitelistedChannels: [],
};

const CHALLENGE_TIERS: Record<ChallengeTier, { goalMinutes: number; xpMultiplier: number; icon: string; label: string }> = {
  casual: { goalMinutes: 60, xpMultiplier: 1.0, icon: '🌱', label: 'Casual' },
  focused: { goalMinutes: 45, xpMultiplier: 1.5, icon: '🎯', label: 'Focused' },
  disciplined: { goalMinutes: 30, xpMultiplier: 2.0, icon: '⚡', label: 'Disciplined' },
  monk: { goalMinutes: 15, xpMultiplier: 3.0, icon: '🔥', label: 'Monk' },
  ascetic: { goalMinutes: 5, xpMultiplier: 5.0, icon: '💎', label: 'Ascetic' },
};

const GOAL_MODES: Record<GoalMode, { icon: string; label: string; description: string }> = {
  music: { icon: '🎵', label: 'Music Mode', description: 'Music content exempt from drift' },
  time_reduction: { icon: '⏱️', label: 'Time Reduction', description: 'Reduce overall watch time' },
  strict: { icon: '🔒', label: 'Strict Mode', description: '1.5x faster drift buildup' },
  cold_turkey: { icon: '🧊', label: 'Cold Turkey', description: 'Hard block after limit' },
};

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [authUser, setAuthUser] = useState<GoogleUser | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    // Load settings from storage
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        setSettings({ ...defaultSettings, ...result.settings });
      }
    });
    
    // Load auth state
    chrome.runtime.sendMessage({ type: 'AUTH_GET_STATE' }, (response) => {
      if (response?.user) {
        setAuthUser(response.user);
      }
    });
  }, []);

  const handleSignIn = async () => {
    setAuthLoading(true);
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_IN' }, (response) => {
      setAuthLoading(false);
      if (response?.success && response.user) {
        setAuthUser(response.user);
        // Auto-fill user ID and enable sync
        setSettings(prev => ({
          ...prev,
          backend: {
            ...prev.backend,
            userId: response.user.id,
            enabled: true,
          }
        }));
      } else {
        setSyncMessage(response?.error || 'Sign in failed');
        setSyncStatus('error');
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    });
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_OUT' }, (response) => {
      setAuthLoading(false);
      if (response?.success) {
        setAuthUser(null);
        setSettings(prev => ({
          ...prev,
          backend: {
            ...prev.backend,
            userId: '',
            enabled: false,
          }
        }));
      }
    });
  };

  const saveSettings = async () => {
    setSaveStatus('saving');
    try {
      await chrome.storage.local.set({ settings });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const testConnection = async () => {
    if (!settings.backend.url) return;
    
    setSyncStatus('syncing');
    setSyncMessage('Testing connection...');
    
    try {
      const response = await fetch(`${settings.backend.url}/health`);
      if (response.ok) {
        setSyncStatus('success');
        setSyncMessage('Connected successfully!');
      } else {
        throw new Error('Server returned error');
      }
    } catch (e) {
      setSyncStatus('error');
      setSyncMessage('Connection failed. Check URL and server.');
    }
    
    setTimeout(() => {
      setSyncStatus('idle');
      setSyncMessage('');
    }, 3000);
  };

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateBackend = (key: keyof SettingsState['backend'], value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      backend: { ...prev.backend, [key]: value }
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            🧘 YouTube Detox
          </h1>
          <p className="text-muted-foreground">
            Take control of your viewing habits
          </p>
        </div>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Today
            </TabsTrigger>
            <TabsTrigger value="drift" className="flex items-center gap-2">
              <Waves className="w-4 h-4" />
              Drift
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <SettingsIcon className="w-4 h-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="sync" className="flex items-center gap-2">
              <Cloud className="w-4 h-4" />
              Sync
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-4">
            <Dashboard backend={settings.backend} dailyGoalMinutes={settings.dailyGoalMinutes} />
          </TabsContent>

          {/* Drift Settings Tab */}
          <TabsContent value="drift" className="space-y-4">
            {/* Goal Mode */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Waves className="w-5 h-5 text-blue-500" />
                  Goal Mode
                </CardTitle>
                <CardDescription>
                  Choose how drift affects your experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(Object.entries(GOAL_MODES) as [GoalMode, typeof GOAL_MODES[GoalMode]][]).map(([mode, config]) => (
                  <label
                    key={mode}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      settings.goalMode === mode
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="goalMode"
                      value={mode}
                      checked={settings.goalMode === mode}
                      onChange={() => {
                        updateSetting('goalMode', mode);
                        chrome.runtime.sendMessage({ type: 'SET_GOAL_MODE', data: { mode } });
                      }}
                      className="sr-only"
                    />
                    <span className="text-2xl">{config.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium">{config.label}</div>
                      <div className="text-xs text-muted-foreground">{config.description}</div>
                    </div>
                    {settings.goalMode === mode && (
                      <CheckCircle2 className="w-5 h-5 text-blue-500" />
                    )}
                  </label>
                ))}
              </CardContent>
            </Card>

            {/* Challenge Tier */}
            <Card>
              <CardHeader>
                <CardTitle>Challenge Tier</CardTitle>
                <CardDescription>
                  Higher tiers = harder goals, more XP
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(Object.entries(CHALLENGE_TIERS) as [ChallengeTier, typeof CHALLENGE_TIERS[ChallengeTier]][]).map(([tier, config]) => (
                  <label
                    key={tier}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      settings.challengeTier === tier
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="challengeTier"
                      value={tier}
                      checked={settings.challengeTier === tier}
                      onChange={() => {
                        updateSetting('challengeTier', tier);
                        updateSetting('dailyGoalMinutes', config.goalMinutes);
                        chrome.runtime.sendMessage({ type: 'SET_CHALLENGE_TIER', data: { tier } });
                      }}
                      className="sr-only"
                    />
                    <span className="text-2xl">{config.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium">{config.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {config.goalMinutes} min/day • {config.xpMultiplier}x XP
                      </div>
                    </div>
                    {settings.challengeTier === tier && (
                      <CheckCircle2 className="w-5 h-5 text-purple-500" />
                    )}
                  </label>
                ))}
              </CardContent>
            </Card>

            {/* Friction Effects */}
            <Card>
              <CardHeader>
                <CardTitle>Friction Effects</CardTitle>
                <CardDescription>
                  Choose which effects apply when drift is high
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Blur Thumbnails</div>
                      <div className="text-xs text-muted-foreground">Gradually blur video thumbnails</div>
                    </div>
                  </div>
                  <Switch
                    checked={settings.frictionEnabled.thumbnails}
                    onCheckedChange={(v) => updateSetting('frictionEnabled', { ...settings.frictionEnabled, thumbnails: v })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Sidebar className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Simplify Sidebar</div>
                      <div className="text-xs text-muted-foreground">Hide/reduce recommendations</div>
                    </div>
                  </div>
                  <Switch
                    checked={settings.frictionEnabled.sidebar}
                    onCheckedChange={(v) => updateSetting('frictionEnabled', { ...settings.frictionEnabled, sidebar: v })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Reduce Comments</div>
                      <div className="text-xs text-muted-foreground">Smaller/hidden comment section</div>
                    </div>
                  </div>
                  <Switch
                    checked={settings.frictionEnabled.comments}
                    onCheckedChange={(v) => updateSetting('frictionEnabled', { ...settings.frictionEnabled, comments: v })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Play className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Control Autoplay</div>
                      <div className="text-xs text-muted-foreground">Delay or disable autoplay</div>
                    </div>
                  </div>
                  <Switch
                    checked={settings.frictionEnabled.autoplay}
                    onCheckedChange={(v) => updateSetting('frictionEnabled', { ...settings.frictionEnabled, autoplay: v })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Whitelisted Channels */}
            <Card>
              <CardHeader>
                <CardTitle>Whitelisted Channels</CardTitle>
                <CardDescription>
                  These channels won't trigger drift effects
                </CardDescription>
              </CardHeader>
              <CardContent>
                {settings.whitelistedChannels.length > 0 ? (
                  <div className="space-y-2 mb-3">
                    {settings.whitelistedChannels.map((channel, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <span className="text-sm">{channel}</span>
                        <button
                          onClick={() => {
                            const newChannels = settings.whitelistedChannels.filter((_, idx) => idx !== i);
                            updateSetting('whitelistedChannels', newChannels);
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-3">No channels whitelisted yet</p>
                )}
                <button
                  onClick={() => {
                    const channel = prompt('Enter channel name:');
                    if (channel && !settings.whitelistedChannels.includes(channel)) {
                      updateSetting('whitelistedChannels', [...settings.whitelistedChannels, channel]);
                    }
                  }}
                  className="w-full py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm text-muted-foreground hover:border-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Channel
                </button>
              </CardContent>
            </Card>

            <button
              onClick={saveSettings}
              disabled={saveStatus === 'saving'}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
              {saveStatus === 'saved' && <CheckCircle2 className="w-4 h-4" />}
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Settings'}
            </button>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>General</CardTitle>
                <CardDescription>Configure your tracking preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="tracking">Enable Tracking</Label>
                    <p className="text-sm text-muted-foreground">Track your YouTube usage</p>
                  </div>
                  <Switch
                    id="tracking"
                    checked={settings.trackingEnabled}
                    onCheckedChange={(v) => updateSetting('trackingEnabled', v)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dailyGoal">Daily Goal (minutes)</Label>
                  <Input
                    id="dailyGoal"
                    type="number"
                    min={1}
                    max={480}
                    value={settings.dailyGoalMinutes}
                    onChange={(e) => updateSetting('dailyGoalMinutes', parseInt(e.target.value) || 60)}
                  />
                  <p className="text-sm text-muted-foreground">Get alerted when you exceed this</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Interventions</CardTitle>
                <CardDescription>Customize how we help you stay focused</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="prompts">Productivity Prompts</Label>
                    <p className="text-sm text-muted-foreground">Ask if videos were productive</p>
                  </div>
                  <Switch
                    id="prompts"
                    checked={settings.productivityPrompts}
                    onCheckedChange={(v) => updateSetting('productivityPrompts', v)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Prompt Frequency</Label>
                    <span className="text-sm text-muted-foreground">{settings.promptChance}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.promptChance}
                    onChange={(e) => updateSetting('promptChance', parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="weekly">Weekly Reports</Label>
                    <p className="text-sm text-muted-foreground">Get weekly usage summaries</p>
                  </div>
                  <Switch
                    id="weekly"
                    checked={settings.weeklyReports}
                    onCheckedChange={(v) => updateSetting('weeklyReports', v)}
                  />
                </div>
              </CardContent>
            </Card>

            <button
              onClick={saveSettings}
              disabled={saveStatus === 'saving'}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
              {saveStatus === 'saved' && <CheckCircle2 className="w-4 h-4" />}
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Settings'}
            </button>
          </TabsContent>

          {/* Sync Tab */}
          <TabsContent value="sync" className="space-y-4">
            {/* Google Sign In Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Account
                </CardTitle>
                <CardDescription>
                  Sign in with Google to sync across devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                {authUser ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      {authUser.picture && (
                        <img 
                          src={authUser.picture} 
                          alt={authUser.name}
                          className="w-10 h-10 rounded-full"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{authUser.name}</div>
                        <div className="text-sm text-muted-foreground truncate">{authUser.email}</div>
                      </div>
                      <button
                        onClick={handleSignOut}
                        disabled={authLoading}
                        className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      Signed in — your data syncs automatically
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleSignIn}
                    disabled={authLoading}
                    className="w-full py-3 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-3"
                  >
                    {authLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign in with Google
                      </>
                    )}
                  </button>
                )}
              </CardContent>
            </Card>

            {/* Backend Settings Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="w-5 h-5" />
                  Backend Sync
                </CardTitle>
                <CardDescription>
                  {authUser ? 'Your data syncs to your personal backend' : 'Sign in above to enable sync'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="backendEnabled">Enable Sync</Label>
                    <p className="text-sm text-muted-foreground">Send data to your backend</p>
                  </div>
                  <Switch
                    id="backendEnabled"
                    checked={settings.backend.enabled}
                    onCheckedChange={(v) => updateBackend('enabled', v)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backendUrl">Backend URL</Label>
                  <Input
                    id="backendUrl"
                    type="url"
                    placeholder="http://localhost:8000"
                    value={settings.backend.url}
                    onChange={(e) => updateBackend('url', e.target.value)}
                  />
                </div>

                {!authUser && (
                  <div className="space-y-2">
                    <Label htmlFor="userId">User ID (manual)</Label>
                    <Input
                      id="userId"
                      type="text"
                      placeholder="your-unique-id"
                      value={settings.backend.userId}
                      onChange={(e) => updateBackend('userId', e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">Or sign in with Google above</p>
                  </div>
                )}

                <button
                  onClick={testConnection}
                  disabled={syncStatus === 'syncing' || !settings.backend.url}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {syncStatus === 'syncing' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {syncStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  {syncStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                  Test Connection
                </button>

                {syncMessage && (
                  <p className={`text-sm text-center ${
                    syncStatus === 'success' ? 'text-green-600' : 
                    syncStatus === 'error' ? 'text-red-600' : 'text-muted-foreground'
                  }`}>
                    {syncMessage}
                  </p>
                )}
              </CardContent>
            </Card>

            <button
              onClick={saveSettings}
              disabled={saveStatus === 'saving'}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
              {saveStatus === 'saved' && <CheckCircle2 className="w-4 h-4" />}
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Settings'}
            </button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
