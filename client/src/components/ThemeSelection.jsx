import { useState } from 'react';
import { Cpu, ChevronRight, Wifi, Leaf, Bot } from 'lucide-react';

const THEMES = [
  {
    id: 'redes_sociais',
    label: 'Impacto das Redes Sociais na Saúde Mental',
    icon: Wifi,
    color: 'var(--ice)',
    glow: 'var(--ice-glow)',
    hint: 'Vício, comparação social, algoritmos de engajamento e bem-estar digital.',
  },
  {
    id: 'clima',
    label: 'Mudanças Climáticas e Transição Energética',
    icon: Leaf,
    color: 'var(--acid)',
    glow: 'var(--acid-glow)',
    hint: 'Consenso científico, combustíveis fósseis, energias renováveis e custo da transição.',
  },
  {
    id: 'automacao',
    label: 'O Futuro do Trabalho e a Automação por IA',
    icon: Bot,
    color: 'var(--violet)',
    glow: 'rgba(166,77,255,0.2)',
    hint: 'Desemprego tecnológico, novos empregos, renda básica e regulação da IA.',
  },
];

export default function ThemeSelection({ onSelect }) {
  const [hovered, setHovered] = useState(null);
  const [chosen, setChosen]   = useState(null);

  const confirm = (theme) => {
    if (chosen) return;
    setChosen(theme.id);
    setTimeout(() => onSelect(theme), 500);
  };

  return (
    <div className="theme-sel-overlay">
      <div className="theme-sel-card">
        <div className="theme-sel-glow" />

        <div className="theme-sel-header">
          <Cpu size={22} strokeWidth={1.6} className="theme-sel-cpu" />
          <div>
            <p className="theme-sel-eyebrow">MECHA-LOGIC v7.0</p>
            <h2 className="theme-sel-title">SELECIONE O CAMPO DE BATALHA</h2>
            <p className="theme-sel-sub">O tema escolhido moldará todos os argumentos do duelo.</p>
          </div>
        </div>

        <div className="theme-sel-list">
          {THEMES.map((t) => {
            const Icon = t.icon;
            const active = hovered === t.id;
            const isChosen = chosen === t.id;
            return (
              <button
                key={t.id}
                className={`theme-btn ${active ? 'theme-btn-hover' : ''} ${isChosen ? 'theme-btn-chosen' : ''}`}
                style={{ '--t-color': t.color, '--t-glow': t.glow }}
                onMouseEnter={() => setHovered(t.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => confirm(t)}
                disabled={!!chosen}
              >
                <div className="theme-btn-icon">
                  <Icon size={24} strokeWidth={1.6} />
                </div>
                <div className="theme-btn-body">
                  <span className="theme-btn-label">{t.label}</span>
                  <span className="theme-btn-hint">{t.hint}</span>
                </div>
                <ChevronRight size={18} strokeWidth={2} className="theme-btn-arrow" />
              </button>
            );
          })}
        </div>

        <p className="theme-sel-footer">
          <span className="theme-sel-dot" /> SISTEMA PRONTO · AGUARDANDO SELEÇÃO
        </p>
      </div>
    </div>
  );
}
