import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import { checkAuth } from './api';
import './index.css';

function FullPageSpinner() {
  return (
    <div className="spinner-container">
      <div className="spinner" />
      <p>Loading...</p>
    </div>
  );
}

function App() {
  const [authState, setAuthState] = useState('loading');
  // 'loading' | 'authenticated' | 'unauthenticated' | 'credentials_missing'

  useEffect(() => {
    checkAuth()
      .then((data) => {
        if (data.authenticated) {
          setAuthState('authenticated');
        } else {
          setAuthState('unauthenticated');
        }
      })
      .catch((err) => {
        if (err.message === 'CREDENTIALS_MISSING') {
          setAuthState('credentials_missing');
        } else {
          setAuthState('unauthenticated');
        }
      });
  }, []);

  if (authState === 'loading') {
    return <FullPageSpinner />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            authState === 'authenticated' ? (
              <Dashboard onLogout={() => setAuthState('unauthenticated')} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/login"
          element={
            authState === 'authenticated' ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage
                authState={authState}
                onLogin={() => setAuthState('authenticated')}
              />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
