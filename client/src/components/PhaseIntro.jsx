import { Swords, BookOpen, Flame, Eye, AlertTriangle } from 'lucide-react';
import { getToulminExample, getExampleThemeLabel, TOULMIN_COLORS } from '../lib/phase3Data';

const PHASE_DATA = {
  1: {
    label: 'FASE 1',
    name: 'O BOSS ATACA',
    icon: BookOpen,
    color: 'var(--ice)',
    desc: 'MECHA-LOGIC lança falácias. Sua missão: identificar o erro lógico.',
    hint: 'Analise o ataque do Boss e selecione a falácia correta nas opções abaixo.',
  },
  2: {
    label: 'FASE 2',
    name: 'CONSTRUTOR DE ARGUMENTO',
    icon: Swords,
    color: 'var(--acid)',
    desc: 'O Boss faz afirmações. Você escolhe a réplica lógica mais afiada no Modal Flash.',
    hint: 'Jogue uma carta, leia as 3 opções e clique no contra-argumento superior.',
  },
  3: {
    label: 'FASE 3',
    name: 'SOBRECARGA SOCRÁTICA',
    icon: Flame,
    color: 'var(--crimson)',
    desc: 'Sem cartas. Você monta o argumento final com o Construtor de Sentenças.',
    hint: 'Estude o Esquema de Injeção Lógica abaixo antes de enfrentar o Boss Final.',
  },
};

// ─── Bloco colorido de Toulmin (Holo-Guia) ───────────────────────────────────
// Reutilizado aqui e no Popover dentro da arena (LogicCards Fase 3).
export function ToulminBlock({ part, text }) {
  const c = TOULMIN_COLORS[part];
  return (
    <div className="toulmin-block">
      <span className="toulmin-tag" style={{ color: c.hex }}>{`[ ${c.label} ]`}</span>
      <p
        className="toulmin-text"
        style={{ color: c.hex, textShadow: `0 0 8px ${c.glow}` }}
      >
        {text}
      </p>
      <span className="toulmin-subtag">{c.tag}</span>
    </div>
  );
}

// Painel completo do Esquema de Injeção Lógica — exportado p/ reuso na arena.
export function HoloGuide({ themeId, compact = false }) {
  const ex = getToulminExample(themeId);
  const exampleLabel = getExampleThemeLabel(themeId);
  return (
    <div className={`holo-guide ${compact ? 'holo-guide-compact' : ''}`}>
      {/* Blindagem visual: deixa explícito que é só um exemplo didático */}
      <div className="holo-warning-badge">
        <AlertTriangle size={11} strokeWidth={2.5} />
        MAPA CONCEITUAL: APENAS EXEMPLO DIDÁTICO INTERNACIONAL
      </div>
      <div className="holo-guide-head">
        <Eye size={14} strokeWidth={2} />
        <span>ESQUEMA DE INJEÇÃO LÓGICA · MODELO DE TOULMIN (1958)</span>
      </div>
      <ToulminBlock part="claim"   text={ex.claim} />
      <ToulminBlock part="data"    text={ex.data} />
      <ToulminBlock part="warrant" text={ex.warrant} />
      <p className="holo-warning-note">
        Este argumento sobre <strong>{exampleLabel}</strong> serve apenas para demonstrar a estrutura
        de Stephen Toulmin. <strong>Não tente utilizá-lo contra o debate atual do MECHA-LOGIC.</strong>
        Crie sua própria lógica baseada no método demonstrado.
      </p>
      <p className="holo-guide-foot">
        Um argumento sólido encadeia <strong>Alegação → Evidência → Conexão Lógica</strong>.
        Construa o seu seguindo esta estrutura.
      </p>
    </div>
  );
}

export default function PhaseIntro({ phase, onContinue, theme }) {
  const isFinal = phase === 3;
  // NENHUMA fase auto-avança: a tela espera o jogador clicar para continuar.
  const data = PHASE_DATA[phase] || PHASE_DATA[1];
  const Icon = data.icon;

  return (
    <div className="phase-intro-overlay">
      <div
        className={`phase-intro-card ${isFinal ? 'phase-intro-card-final' : ''}`}
        style={{ '--phase-color': data.color }}
      >
        <div className="phase-intro-label">{data.label}</div>
        <div className="phase-intro-icon"><Icon size={isFinal ? 38 : 48} strokeWidth={1.2} /></div>
        <h2 className="phase-intro-name">{data.name}</h2>
        <p className="phase-intro-desc">{data.desc}</p>

        {/* Holo-Guia: exemplo trabalhado de Toulmin, só na Fase 3 */}
        {isFinal && <HoloGuide themeId={theme?.id} />}

        {!isFinal && <p className="phase-intro-hint">{data.hint}</p>}

        <div className="phase-intro-footer">
          <button className="phase-intro-btn" onClick={onContinue}>
            {isFinal
              ? <>ENTENDI O ESQUEMA — INICIAR DUELO FINAL <span className="phase-intro-count">→</span></>
              : <>INICIAR {data.label} <span className="phase-intro-count">→</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
