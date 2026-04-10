import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="mf-nav">
      <div className="mf-nav__inner">
        <Link to="/" className="mf-brand">
          <span className="mf-brand__title">Milestone Fund</span>
          <span className="mf-brand__tag">Milestone-based crowdfunding</span>
        </Link>
        <nav className="mf-nav__links" aria-label="Primary">
          <Link to="/" className="mf-link">
            Campaigns
          </Link>
          <Link to="/create" className="mf-btn mf-btn--primary">
            New campaign
          </Link>
        </nav>
      </div>
    </header>
  );
}
