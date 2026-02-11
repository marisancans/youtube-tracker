import Widget from '../components/widget/Widget';
import ErrorBoundary from './ErrorBoundary';

export default function App(): JSX.Element {
  return (
    <ErrorBoundary resetKey={location.href}>
      <Widget />
    </ErrorBoundary>
  );
}
