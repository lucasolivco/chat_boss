import { Trophy, Skull, X, Sparkles, AlertTriangle, Target, TrendingUp, Brain, FlaskConical, Crosshair, Zap } from 'lucide-react';
import { ARCHETYPES } from '../lib/personality';

const ARCHETYPE_ICONS = {
  logician:   Brain,
  empirical:  FlaskConical,
  rhetorical: Target,
  aggressive: Crosshair,
  chaotic:    Zap,
};

export default function BattleReport({ report, onClose, onRestart }) {
  const { archetype, norm, avgWarrant, avgData, avgClaim, turns, critical_hits, insights, weaknesses, fallacies, won } = report;
  const ArchIcon = ARCHETYPE_ICONS[archetype.key];

  return (
    <div className="modal-overlay report-overlay">
      <div className="modal-box report-box">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>

        {/* Hero */}
        <div className={`report-hero ${won ? 'hero-win' : 'hero-loss'}`}>
          <div className="hero-bg" />
          <div className="hero-icon">
            {won ? <Trophy size={40} strokeWidth={1.5} /> : <Skull size={40} strokeWidth={1.5} />}
          </div>
          <h2 className="hero-title">{won ? 'VITÓRIA LÓGICA' : 'DERROTA TÁTICA'}</h2>
          <p className="hero-sub">{won ? 'MECHA-LOGIC foi desmantelado pela sua argumentação.' : 'A IA expôs as falhas no seu raciocínio.'}</p>
        </div>

        {/* Archetype */}
        <div className="report-section archetype-section" style={{ '--arch-color': archetype.color }}>
          <div className="archetype-header">
            <span className="section-eyebrow">SEU ESTILO ARGUMENTATIVO</span>
            <div className="archetype-badge">
              <ArchIcon size={36} strokeWidth={1.5} />
              <div>
                <h3 className="archetype-name">{archetype.name}</h3>
                <p className="archetype-trait">{archetype.trait}</p>
              </div>
            </div>
            <p className="archetype-desc">{archetype.description}</p>
          </div>
        </div>

        {/* Personality breakdown */}
        <div className="report-section">
          <span className="section-eyebrow">DISTRIBUIÇÃO DE TRAÇOS</span>
          <div className="personality-bars">
            {Object.values(ARCHETYPES).map(a => {
              const Icon = ARCHETYPE_ICONS[a.key];
              const value = norm[a.key];
              return (
                <div key={a.key} className="pbar-row" style={{ '--bar-color': a.color }}>
                  <div className="pbar-head">
                    <Icon size={14} strokeWidth={2} />
                    <span className="pbar-name">{a.name}</span>
                    <span className="pbar-val">{value}</span>
                  </div>
                  <div className="pbar-track">
                    <div className="pbar-fill" style={{ width: `${value}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Metrics grid */}
        <div className="report-section">
          <span className="section-eyebrow">MÉTRICAS DA BATALHA</span>
          <div className="metrics-grid">
            <div className="metric-cell"><span className="metric-val">{turns}</span><span className="metric-label">Turnos</span></div>
            <div className="metric-cell"><span className="metric-val">{critical_hits}</span><span className="metric-label">Críticos</span></div>
            <div className="metric-cell"><span className="metric-val">{avgClaim}<span className="metric-max">/3</span></span><span className="metric-label">Tese</span></div>
            <div className="metric-cell"><span className="metric-val">{avgData}<span className="metric-max">/3</span></span><span className="metric-label">Dados</span></div>
            <div className="metric-cell"><span className="metric-val">{avgWarrant}<span className="metric-max">/3</span></span><span className="metric-label">Garantia</span></div>
            <div className="metric-cell"><span className="metric-val">{fallacies.reduce((s, [, n]) => s + n, 0)}</span><span className="metric-label">Falácias</span></div>
          </div>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="report-section">
            <span className="section-eyebrow"><Sparkles size={11} /> PONTOS FORTES</span>
            <ul className="insight-list">
              {insights.map((t, i) => <li key={i} className="insight-item insight-good"><TrendingUp size={13} />{t}</li>)}
            </ul>
          </div>
        )}

        {/* Weaknesses */}
        {weaknesses.length > 0 && (
          <div className="report-section">
            <span className="section-eyebrow"><AlertTriangle size={11} /> ÁREAS A MELHORAR</span>
            <ul className="insight-list">
              {weaknesses.map((t, i) => <li key={i} className="insight-item insight-warn"><AlertTriangle size={13} />{t}</li>)}
            </ul>
          </div>
        )}

        {/* Fallacies */}
        {fallacies.length > 0 && (
          <div className="report-section">
            <span className="section-eyebrow">FALÁCIAS DETECTADAS</span>
            <div className="fallacy-list">
              {fallacies.map(([name, count]) => (
                <div key={name} className="fallacy-tag">
                  <span>{name}</span>
                  <span className="fallacy-count">×{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="report-actions">
          <button className="btn-primary" onClick={onRestart}>Novo Duelo</button>
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
