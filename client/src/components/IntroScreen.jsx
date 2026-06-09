import { useState, useEffect } from 'react';
import { Swords, Cpu, BarChart3, AlertTriangle, Trophy } from 'lucide-react';

const TITLE_TEXT = 'CHATBOSS';

export default function IntroScreen({ onStart }) {
  const [displayed, setDisplayed] = useState('');
  const [showSub, setShowSub] = useState(false);
  const [showButtons, setShowButtons] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(TITLE_TEXT.slice(0, i + 1));
      i++;
      if (i >= TITLE_TEXT.length) {
        clearInterval(interval);
        setTimeout(() => setShowSub(true), 200);
        setTimeout(() => setShowButtons(true), 600);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="intro-screen">
      <div className="intro-grid" />
      <div className="intro-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <span key={i} className="particle" style={{ '--i': i }} />
        ))}
      </div>
      <div className="intro-vignette" />

      <div className="intro-content">
        <div className="intro-mark"><Cpu size={32} strokeWidth={1.5} /></div>
        <div className="intro-logo">
          <h1 className="intro-title" data-text={TITLE_TEXT}>
            {displayed}
            <span className="cursor">_</span>
          </h1>
          <p className="intro-version">MECHA-LOGIC · v7.0 · SCIENTIFIC MODE</p>
        </div>

        {showSub && (
          <p className="intro-subtitle fade-in">
            Você consegue vencer uma IA em lógica?
          </p>
        )}

        {showButtons && (
          <div className="intro-buttons fade-in">
            <button className="btn-primary pulse" onClick={onStart}>
              <Swords size={16} strokeWidth={2.2} /> INICIAR DUELO
            </button>
          </div>
        )}

        {showButtons && (
          <div className="intro-tags fade-in">
            <span className="tag"><BarChart3 size={11} /> Modelo Toulmin</span>
            <span className="tag"><AlertTriangle size={11} /> Detecção de Falácias</span>
            <span className="tag"><Trophy size={11} /> Sistema de Títulos</span>
            <span className="tag"><Cpu size={11} /> Ranking Global</span>
          </div>
        )}
      </div>

      <div className="intro-boss-silhouette" />
    </div>
  );
}
