import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Header.css';

export default function Header() {
  const location = useLocation();

  return (
    <header className="app-header">
      <div className="header-container">
        <div className="logo-area">
          <div className="logo-icon">🔒</div>
          <span className="logo-name">DriveSecure</span>
        </div>
        <nav className="header-nav">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            Accueil
          </Link>
          <Link to="/login" className={location.pathname === '/login' ? 'active' : ''}>
            Connexion
          </Link>
          <Link to="/register" className={location.pathname === '/register' ? 'active' : ''}>
            Inscription
          </Link>
        </nav>
      </div>
    </header>
  );
}