import { useState, useEffect } from 'react';
import Widget from '../components/widget/Widget';
import ErrorBoundary from './ErrorBoundary';

function AuthGateBar(): JSX.Element {
  const handleOpenOptions = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_TAB', data: { url: chrome.runtime.getURL('options.html') } });
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        height: '36px',
        width: '100%',
        background: 'linear-gradient(to right, #1a2744, #0a1628)',
        borderBottom: '1px solid rgba(212,165,116,0.3)',
        fontFamily: "'Source Sans 3', sans-serif",
        fontSize: '13px',
        color: '#f5e6c8',
        pointerEvents: 'auto',
      }}
    >
      <span style={{ opacity: 0.7 }}>Sign in to YouTube Detox</span>
      <button
        onClick={handleOpenOptions}
        style={{
          background: 'linear-gradient(to right, #b8956a, #d4a574)',
          color: '#2c1810',
          border: 'none',
          borderRadius: '6px',
          padding: '2px 10px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Sign in
      </button>
    </div>
  );
}

export default function App(): JSX.Element {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'AUTH_GET_STATE' }, (resp) => {
      setAuthed(!!resp?.user);
    });

    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.authState) {
        setAuthed(!!changes.authState.newValue?.user);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  if (authed === null) return <></>;

  if (!authed) return <AuthGateBar />;

  return (
    <ErrorBoundary resetKey={location.href}>
      <Widget />
    </ErrorBoundary>
  );
}
