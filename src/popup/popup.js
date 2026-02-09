/**
 * YouTube Detox - Popup Script
 */

(function() {
  'use strict';
  
  document.addEventListener('DOMContentLoaded', init);
  
  async function init() {
    await loadStats();
    setupExport();
    setInterval(updateSessionTimer, 1000);
  }
  
  async function loadStats() {
    try {
      const stats = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_STATS' }, resolve);
      });
      
      if (!stats) return;
      
      const today = stats.today || {};
      document.getElementById('todayMinutes').textContent = 
        Math.round((today.totalSeconds || 0) / 60);
      document.getElementById('todayVideos').textContent = 
        today.videoCount || 0;
      document.getElementById('todayShorts').textContent = 
        today.shortsCount || 0;
      
      if (stats.currentSession) {
        document.getElementById('sessionSection').style.display = 'block';
        updateSessionDisplay(stats.currentSession.durationSeconds);
      }
      
      renderWeekChart(stats.last7Days);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }
  
  function renderWeekChart(days) {
    const chart = document.getElementById('weekChart');
    chart.innerHTML = '';
    
    const maxMinutes = Math.max(
      ...days.map(d => Math.round((d.totalSeconds || 0) / 60)),
      1
    );
    
    const orderedDays = [...days].reverse();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    orderedDays.forEach(day => {
      const minutes = Math.round((day.totalSeconds || 0) / 60);
      const height = Math.max((minutes / maxMinutes) * 100, 4);
      const dayOfWeek = new Date(day.date).getDay();
      
      const bar = document.createElement('div');
      bar.className = 'week-bar';
      bar.innerHTML = `
        <div class="bar-fill" style="height: ${height}%"></div>
        <span class="bar-label">${dayNames[dayOfWeek]}</span>
      `;
      bar.title = `${day.date}: ${minutes} min`;
      chart.appendChild(bar);
    });
  }
  
  function updateSessionTimer() {
    chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (session) => {
      if (chrome.runtime.lastError) return;
      
      if (session) {
        const seconds = Math.round((Date.now() - session.startedAt) / 1000);
        document.getElementById('sessionSection').style.display = 'block';
        updateSessionDisplay(seconds);
      } else {
        document.getElementById('sessionSection').style.display = 'none';
      }
    });
  }
  
  function updateSessionDisplay(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    document.getElementById('sessionDuration').textContent = 
      `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  
  function setupExport() {
    document.getElementById('exportBtn').addEventListener('click', async () => {
      chrome.storage.local.get(null, (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `youtube-detox-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
      });
    });
  }
})();
