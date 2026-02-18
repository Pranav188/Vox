import React, { useState } from 'react';

const LandingPage = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  return (
    <div 
      className="min-h-screen bg-dvs-bg text-dvs-text bg-grid-pattern relative overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      
      <div 
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(30, 64, 175, 0.12), transparent 40%)`
        }}
      />

      {/* Static Top Glow */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-dvs-primary/10 blur-[120px] rounded-full pointer-events-none z-0"></div>

      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-dvs-border relative z-10 backdrop-blur-md bg-white/70">
        <div className="flex items-center gap-8">
          
          {/* Logo - Kept in the YC Serif Font */}
          <div className="flex items-center gap-2 text-dvs-primary font-bold text-2xl font-serif italic tracking-tight">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            Vox
          </div>
          
          {/* Links - Kept in Inter */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-dvs-muted tracking-wide">
            <a href="#" className="hover:text-dvs-text transition-colors">Polls</a>
            <a href="#" className="hover:text-dvs-text transition-colors">My Votes</a>
            <a href="#" className="hover:text-dvs-text transition-colors">Admin</a>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Pills - Kept in Inter */}
          <div className="flex items-center gap-2 bg-dvs-surface border border-dvs-border px-3 py-1.5 rounded-full text-sm font-medium text-dvs-text shadow-sm">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Sepolia
          </div>
          <div className="bg-dvs-surface border border-dvs-border px-4 py-1.5 rounded-full text-sm font-medium text-dvs-text shadow-sm">
            0.039 ETH
          </div>
          <button className="bg-dvs-surface hover:bg-gray-50 border border-dvs-border px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2 shadow-sm text-dvs-text">
            <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-400 to-emerald-400"></div>
            0x1C...3C7b
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex flex-col items-center justify-center text-center px-4 pt-32 pb-24 relative z-10">
        
        {/* Powered By Badge */}
        <div className="mb-8 px-4 py-1.5 rounded-full border border-dvs-border bg-dvs-surface text-xs font-semibold tracking-wide text-dvs-muted uppercase shadow-sm cursor-default">
          Powered by Ethereum
        </div>

        {/* The YC-Style Headline */}
        <h1 className="max-w-4xl text-6xl md:text-8xl font-serif italic font-medium tracking-tight mb-6 text-dvs-text">
          Decentralized Voting <br />
          <span className="text-dvs-primary">Made Simple.</span>
        </h1>

        <p className="max-w-2xl text-lg md:text-xl text-dvs-muted font-medium mb-10 leading-relaxed">
          A privacy-preserving voting platform using commit-reveal mechanism. 
          Create transparent, immutable, and verifiable elections on the blockchain.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button className="bg-dvs-primary hover:bg-dvs-primary-hover text-white px-8 py-3.5 rounded-lg font-semibold text-lg transition-all shadow-lg shadow-blue-500/30 flex items-center gap-2">
            Browse Polls
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </button>
          
          <button className="bg-dvs-surface hover:bg-gray-50 border border-dvs-border text-dvs-text px-8 py-3.5 rounded-lg font-semibold text-lg transition-all shadow-sm">
            Admin Dashboard
          </button>
        </div>
      </main>

    </div>
  );
};

export default LandingPage;