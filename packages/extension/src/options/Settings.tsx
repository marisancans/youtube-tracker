import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Cloud, 
  Settings as SettingsIcon, 
  BarChart3,
  Clock,
  Video,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';

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
}

interface TodayStats {
  totalSeconds: number;
  videoCount: number;
  sessionCount: number;
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
};

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    // Load settings from storage
    chrome.storage.local.get(['settings', 'todayStats'], (result) => {
      if (result.settings) {
        setSettings({ ...defaultSettings, ...result.settings });
      }
      if (result.todayStats) {
        setTodayStats(result.todayStats);
      }
    });
  }, []);

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

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const goalProgress = todayStats 
    ? Math.min(100, (todayStats.totalSeconds / 60 / settings.dailyGoalMinutes) * 100)
    : 0;

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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Today
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-500" />
                  Today's Progress
                </CardTitle>
                <CardDescription>
                  {todayStats ? `${formatTime(todayStats.totalSeconds)} of ${settings.dailyGoalMinutes}m goal` : 'No data yet'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Daily Goal</span>
                    <span className={goalProgress >= 100 ? 'text-red-500 font-medium' : 'text-green-500'}>
                      {goalProgress.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={goalProgress} className={goalProgress >= 100 ? '[&>div]:bg-red-500' : ''} />
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4">
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <Clock className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                    <div className="text-2xl font-bold">{todayStats ? formatTime(todayStats.totalSeconds) : '0m'}</div>
                    <div className="text-xs text-muted-foreground">Watch Time</div>
                  </div>
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <Video className="w-5 h-5 mx-auto mb-1 text-purple-500" />
                    <div className="text-2xl font-bold">{todayStats?.videoCount ?? 0}</div>
                    <div className="text-xs text-muted-foreground">Videos</div>
                  </div>
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <TrendingDown className="w-5 h-5 mx-auto mb-1 text-green-500" />
                    <div className="text-2xl font-bold">{todayStats?.sessionCount ?? 0}</div>
                    <div className="text-xs text-muted-foreground">Sessions</div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="w-5 h-5" />
                  Backend Sync
                </CardTitle>
                <CardDescription>
                  Sync your data to a personal backend for advanced analytics
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

                <div className="space-y-2">
                  <Label htmlFor="userId">User ID</Label>
                  <Input
                    id="userId"
                    type="text"
                    placeholder="your-unique-id"
                    value={settings.backend.userId}
                    onChange={(e) => updateBackend('userId', e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">A unique identifier for your data</p>
                </div>

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
