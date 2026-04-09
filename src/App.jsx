import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Listenings from './pages/Listenings';
import Unit from './pages/Unit';
import ListeningScripts from './pages/ListeningScripts';
import ScriptUnit from './pages/ScriptUnit';
import AboutBook from './pages/AboutBook';
import AboutAuthor from './pages/AboutAuthor';
import { BOOK_TITLE, SITE_TITLE_SHORT } from './constants/bookMeta';
import StickyPlayer from './components/StickyPlayer';
import { PlayerProvider } from './player/PlayerContext';
import './App.css';

const NAV_ITEMS = [
  { to: '/listenings', label: 'Recordings', match: (p) => p === '/listenings' },
  { to: '/listening-scripts', label: 'Scripts', match: (p) => p === '/listening-scripts' || p.startsWith('/scripts/unit/') },
  { to: '/about/book', label: 'About the Book', match: (p) => p === '/about/book' },
  { to: '/about/author', label: 'About the Author', match: (p) => p === '/about/author' },
];

function App() {
  const location = useLocation();
  const path = location.pathname;
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((o) => !o), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close drawer when URL changes (back/forward, deep link)
    setMenuOpen(false);
  }, [path]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen, closeMenu]);

  const navLinks = (opts = {}) => {
    const { onLinkClick, className } = opts;
    return (
      <ul className={className} role="list">
        {NAV_ITEMS.map((item) => {
          const active = item.match(path);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={active ? 'active' : ''}
                aria-current={active ? 'page' : undefined}
                onClick={onLinkClick}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <PlayerProvider>
      <div className="app">
        <header className="header" role="banner">
        <nav className="nav" aria-label="Main navigation">
          <div className="nav-bar">
            <Link to="/" className="logo-link" aria-label="Home">
              <span className="flag-emoji" role="img" aria-label="British flag">🇬🇧</span>
              <h1 className="site-title">
                <span className="site-title__full">{BOOK_TITLE}</span>
                <span className="site-title__short">{SITE_TITLE_SHORT}</span>
              </h1>
            </Link>
            <button
              type="button"
              className={`nav-toggle ${menuOpen ? 'nav-toggle--open' : ''}`}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={toggleMenu}
            >
              <span className="nav-toggle__bars" aria-hidden="true">
                <span className="nav-toggle__bar" />
                <span className="nav-toggle__bar" />
                <span className="nav-toggle__bar" />
              </span>
            </button>
          </div>
          {navLinks({ className: 'nav-links nav-links--desktop' })}
        </nav>

        <div
          id="mobile-nav-drawer"
          className={`nav-mobile ${menuOpen ? 'nav-mobile--open' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-nav-label"
          inert={!menuOpen}
        >
          <button
            type="button"
            className="nav-mobile__backdrop"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={closeMenu}
          />
          <div className="nav-mobile__sheet">
            <div className="nav-mobile__head">
              <span className="nav-mobile__title" id="mobile-nav-label">
                Menu
              </span>
              <button
                type="button"
                className="nav-mobile__close"
                aria-label="Close menu"
                onClick={closeMenu}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {navLinks({
              className: 'nav-links nav-links--mobile',
              onLinkClick: closeMenu,
            })}
          </div>
        </div>
        </header>

        <main className="main-content" role="main">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/listenings" element={<Listenings />} />
            <Route path="/unit/:unitId" element={<Unit />} />
            <Route path="/listening-scripts" element={<ListeningScripts />} />
            <Route path="/scripts/unit/:unitId" element={<ScriptUnit />} />
            <Route path="/about" element={<Navigate to="/about/book" replace />} />
            <Route path="/about/book" element={<AboutBook />} />
            <Route path="/about/author" element={<AboutAuthor />} />
          </Routes>
        </main>

        <footer className="footer" role="contentinfo">
          <p>&copy; {new Date().getFullYear()} {BOOK_TITLE}</p>
        </footer>
        <StickyPlayer />
      </div>
    </PlayerProvider>
  );
}

export default App;
