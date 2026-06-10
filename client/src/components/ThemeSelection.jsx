import { useState, useEffect, useRef } from 'react';
import { Cpu, Swords, Sparkles, AlertTriangle, Wifi, Leaf, Bot } from 'lucide-react';

const API = '';

// Sugestões clicáveis — só atalhos de preenchimento; o jogador pode digitar QUALQUER tema.
const SUGGESTIONS = [
  { label: 'Redes Sociais', icon: Wifi },
  { label: 'Mudanças Climáticas', icon: Leaf },
  { label: 'Automação e IA', icon: Bot },
  { label: 'Futebol', icon: Sparkles },
  { label: 'Pokémon', icon: Sparkles },
  { label: 'Cinema', icon: Sparkles },
];

// Mensagens cicladas durante a geração (Pre-Generation Hack).
const LOADING_STEPS = (t) => [
  `MECHA-LOGIC absorvendo dados sobre "${t}"...`,
  'Mapeando vetores de falácia do domínio...',
  'Reestruturando lógica de combate...',
  'Compilando 9 turnos táticos...',
  'Calibrando sarcasmo pedagógico...',
  'Arena de duelo quase pronta...',
];

export default function ThemeSelection({ user, onSelect }) {
  const [themeText, setThemeText] = useState('');
  const [stage, setStage]   = useState('input');   // 'input' | 'generating' | 'error'
  const [stepIdx, setStepIdx] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Cicla as mensagens enquanto gera.
  useEffect(() => {
    if (stage !== 'generating') return;
    const steps = LOADING_STEPS(themeText.trim());
    const id = setInterval(() => setStepIdx(i => Math.min(i + 1, steps.length - 1)), 1100);
    return () => clearInterval(id);
  }, [stage, themeText]);

  const generate = async () => {
    const t = themeText.trim();
    if (t.length < 2 || stage === 'generating') return;
    setStage('generating');
    setStepIdx(0);
    setErrMsg('');
    try {
      const r = await fetch(`${API}/api/battle/generate-arena`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_text: t, user_id: user?.user_id ?? null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Falha na geração.');
      // Arena pronta no servidor → libera o jogo. theme.label = texto digitado.
      onSelect({ id: t, label: t });
    } catch (e) {
      setErrMsg(e.message || 'Erro ao gerar a arena. Tente novamente.');
      setStage('error');
    }
  };

  // ── Tela de geração imersiva (data matrix) ──────────────────────────────────
  if (stage === 'generating') {
    const steps = LOADING_STEPS(themeText.trim());
    return (
      <div className="theme-sel-overlay">
        <div className="arena-gen">
          <div className="arena-gen-matrix" aria-hidden>
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} className="gen-col" style={{ '--i': i, '--d': `${(i % 6) * 0.4}s` }}>
                {Array.from({ length: 10 }).map((_, j) => (
                  <b key={j} style={{ '--j': j }}>{Math.random() > 0.5 ? '1' : '0'}</b>
                ))}
              </span>
            ))}
          </div>

          <div className="arena-gen-core">
            <div className="arena-gen-ring"><Cpu size={40} strokeWidth={1.4} /></div>
            <p className="arena-gen-eyebrow">MECHA-LOGIC v7.0 · GERANDO ARENA</p>
            <h2 className="arena-gen-theme">“{themeText.trim()}”</h2>
            <div className="arena-gen-status">
              <span className="arena-gen-cursor" />
              <span className="arena-gen-msg">[ {steps[stepIdx]} ]</span>
            </div>
            <div className="arena-gen-bar">
              <div className="arena-gen-fill" style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Tela de entrada (tema livre) ────────────────────────────────────────────
  return (
    <div className="theme-sel-overlay">
      <div className="theme-sel-card theme-sel-card-free">
        <div className="theme-sel-glow" />

        <div className="theme-sel-header">
          <Cpu size={22} strokeWidth={1.6} className="theme-sel-cpu" />
          <div>
            <p className="theme-sel-eyebrow">MECHA-LOGIC v7.0</p>
            <h2 className="theme-sel-title">DEFINA O CAMPO DE BATALHA</h2>
            <p className="theme-sel-sub">Digite QUALQUER tema. A IA forjará um duelo de 9 turnos sob medida.</p>
          </div>
        </div>

        <div className="theme-input-wrap">
          <Swords size={18} strokeWidth={2} className="theme-input-icon" />
          <input
            ref={inputRef}
            className="theme-input"
            type="text"
            value={themeText}
            maxLength={120}
            placeholder="ex: Pokémon, Futebol, Cinema, Filosofia Estoica..."
            onChange={(e) => setThemeText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') generate(); }}
          />
        </div>

        <div className="theme-suggest-row">
          {SUGGESTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button key={s.label} className="theme-suggest-chip" onClick={() => setThemeText(s.label)} type="button">
                <Icon size={13} strokeWidth={2} /> {s.label}
              </button>
            );
          })}
        </div>

        {errMsg && (
          <p className="theme-sel-error"><AlertTriangle size={13} strokeWidth={2.5} /> {errMsg}</p>
        )}

        <button
          className="theme-gen-btn"
          onClick={generate}
          disabled={themeText.trim().length < 2}
          type="button"
        >
          <Sparkles size={16} strokeWidth={2.2} /> GERAR ARENA DE DUELO
        </button>

        <p className="theme-sel-footer">
          <span className="theme-sel-dot" /> SISTEMA PRONTO · AGUARDANDO TEMA
        </p>
      </div>
    </div>
  );
}
