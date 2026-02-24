"use client";

import { SignInButton } from "@clerk/nextjs";
import { Radar, GitCommit, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-logo">
          <span className="landing-logo-icon">
            <Radar className="h-4 w-4" />
          </span>
          <span className="landing-logo-text">CommitPulse</span>
        </div>
        <SignInButton>
          <button className="btn btn-sm btn-accent">Sign in</button>
        </SignInButton>
      </nav>

      <section className="landing-hero">
        <div className="landing-badge fade-up">
          <span className="badge-dot" />
          Realtime commit tracking
        </div>

        <h1 className="landing-h1 fade-up stagger-1">
          Track your commits.
          <br />
          Build <span className="gradient-text">momentum</span>.
        </h1>

        <p className="landing-subtitle fade-up stagger-2">
          Connect GitHub, set daily goals, and get intelligent Telegram
          reminders that nudge you at the right time. Know your rhythm,
          keep your streak.
        </p>

        <div className="landing-cta-group fade-up stagger-3">
          <SignInButton>
            <button className="landing-cta">
              Get started
              <ArrowRight className="h-4 w-4" />
            </button>
          </SignInButton>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="landing-cta-secondary"
          >
            <GitCommit className="h-4 w-4" />
            View on GitHub
          </a>
        </div>
      </section>

      <section className="how-it-works fade-up stagger-4">
        <p className="section-label">How it works</p>
        <div className="steps">
          <div className="step">
            <span className="step-num">01</span>
            <p className="step-title">Connect GitHub</p>
            <p className="step-desc">
              Install the GitHub App in one click. We use webhooks, not
              tokens — your code stays yours.
            </p>
          </div>
          <div className="step-divider" />
          <div className="step">
            <span className="step-num">02</span>
            <p className="step-title">Set your goals</p>
            <p className="step-desc">
              Define daily commit and LOC targets. We track progress in
              real time across all your repos.
            </p>
          </div>
          <div className="step-divider" />
          <div className="step">
            <span className="step-num">03</span>
            <p className="step-title">Stay on track</p>
            <p className="step-desc">
              Get Telegram nudges when you are falling behind. Respects
              quiet hours — no spam, just signal.
            </p>
          </div>
        </div>
      </section>

      <div className="capabilities fade-up stagger-5">
        <span>Webhook sync</span>
        <span className="cap-dot" />
        <span>Streak tracking</span>
        <span className="cap-dot" />
        <span>Commit sizing</span>
        <span className="cap-dot" />
        <span>Quiet hours</span>
        <span className="cap-dot" />
        <span>Repo-scoped permissions</span>
      </div>

      <footer className="landing-footer">
        CommitPulse &middot; Track daily commits, push rhythms, and build
        momentum.
      </footer>
    </div>
  );
}
