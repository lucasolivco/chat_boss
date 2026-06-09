import { useState } from 'react';
// eslint-disable-next-line no-unused-vars -- `motion` é usado como motion.div/button/aside (JSX member); o no-unused-vars base não rastreia JSX.
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Database, Swords, Send, Sparkles, Eye, X, Zap, Terminal,
} from 'lucide-react';
import { HoloGuide } from './PhaseIntro';

// ─── Descrições das falácias (Fase 1) ─────────────────────────────────────────
const FALLACY_DESCRIPTIONS = {
  'Generalização Apressada':      'Conclui regra geral a partir de poucos casos',
  'Ataque Pessoal':               'Ataca quem fala, não o que foi dito',
  'Bola de Neve':                 'Encadeia consequências improváveis sem prova',
  'Apelo à Autoridade Indevida':  'Cita especialista fora da sua área',
  'Falsa Dicotomia':              'Apresenta só duas opções quando existem mais',
  'Raciocínio Circular':          'A conclusão já está escondida na premissa',
  'Apelo à Emoção':               'Usa sentimento no lugar de lógica',
  'Espantalho':                   'Distorce o argumento do oponente para atacar',
  'Causa Falsa':                  'Confunde coincidência com causalidade',
};

// Metadados das cartas da Fase 2 (Modal Flash).
const CARD_META = {
  fallacy: { name: 'Apontar Falácia', icon: AlertTriangle, color: 'var(--crimson)' },
  data:    { name: 'Exigir Dados',    icon: Database,      color: 'var(--ice)' },
  counter: { name: 'Contraponto',     icon: Swords,        color: 'var(--acid)' },
};
const CARDS_PHASE2 = ['fallacy', 'data', 'counter'];

// ════════════════════════════════════════════════════════════════════════════
// FASE 1 — Grid de múltipla escolha
// ════════════════════════════════════════════════════════════════════════════
function FallacyChoiceGrid({ options, onChoose, disabled }) {
  return (
    <div className="logic-cards">
      <div className="logic-cards-head">
        <AlertTriangle size={13} strokeWidth={2} />
        <span>IDENTIFIQUE A FALÁCIA</span>
        <span className="logic-cards-hint">clique no erro lógico presente no ataque do Boss</span>
      </div>
      <div className="fallacy-choice-grid">
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className="fallacy-choice-btn"
            onClick={() => !disabled && onChoose(opt)}
            disabled={disabled}
          >
            <AlertTriangle size={14} strokeWidth={2} className="fallacy-choice-icon" />
            <span className="fallacy-choice-content">
              <span className="fallacy-choice-name">{opt}</span>
              {FALLACY_DESCRIPTIONS[opt] && (
                <span className="fallacy-choice-desc">{FALLACY_DESCRIPTIONS[opt]}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — Baralho + Modal Flash com 3 opções
// ════════════════════════════════════════════════════════════════════════════
function FlashModal({ options, onPick, onClose, disabled }) {
  return (
    <AnimatePresence>
      <motion.div
        className="flash-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      >
        <motion.div
          className="flash-modal"
          initial={{ scale: 0.8, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flash-modal-head">
            <span><Zap size={14} strokeWidth={2.5} /> ESCOLHA A RÉPLICA SUPERIOR</span>
            <button className="flash-close" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
          </div>
          <div className="flash-options">
            {options.map((opt, i) => {
              const meta = CARD_META[opt.card_type_bound] || CARD_META.counter;
              const Icon = meta.icon;
              return (
                <motion.button
                  key={opt.option_id}
                  type="button"
                  className="flash-option"
                  style={{ '--opt-color': meta.color }}
                  onClick={() => !disabled && onPick(opt)}
                  disabled={disabled}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i + 0.08 }}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="flash-option-icon"><Icon size={16} strokeWidth={2} /></span>
                  <span className="flash-option-text">{opt.text_content}</span>
                </motion.button>
              );
            })}
          </div>
          <p className="flash-modal-foot">Leia com atenção — só uma desmonta o argumento sem cometer nova falácia.</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Phase2Deck({ options, onPlay, disabled }) {
  const [modalOpen, setModalOpen] = useState(false);
  const hasOptions = Array.isArray(options) && options.length > 0;

  const handlePick = (opt) => {
    setModalOpen(false);
    onPlay({
      cardType: opt.card_type_bound,
      selected_option_id: opt.option_id,
      // Texto legível para o log do chat (autoria fica a cargo do servidor/feedback).
      text: opt.text_content,
    });
  };

  return (
    <div className="logic-cards">
      <div className="logic-cards-head">
        <Sparkles size={13} strokeWidth={2} />
        <span>BARALHO LÓGICO</span>
        <span className="logic-cards-hint">jogue uma carta para revelar as réplicas possíveis</span>
      </div>

      <div className="logic-cards-row">
        {CARDS_PHASE2.map(type => {
          const meta = CARD_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              type="button"
              className="logic-card"
              style={{ '--card-color': meta.color }}
              onClick={() => hasOptions && !disabled && setModalOpen(true)}
              disabled={disabled || !hasOptions}
            >
              <span className="logic-card-icon"><Icon size={18} strokeWidth={2} /></span>
              <span className="logic-card-name">{meta.name}</span>
            </button>
          );
        })}
      </div>

      {modalOpen && hasOptions && (
        <FlashModal
          options={options}
          onPick={handlePick}
          onClose={() => setModalOpen(false)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 3 — Postura Lógica + fechamento autoral (Holo-Guia flutuante)
// ════════════════════════════════════════════════════════════════════════════
const MAX_AUTHOR = 140;

// 3 Posturas de Ataque Lógico. Cada uma gera um andaime FIXO e gramaticalmente
// perfeito; o aluno só digita o desfecho. Sem combinação de tokens (evita frases
// sem sentido). `scaffold` termina exatamente no ponto em que a autoria entra.
const POSTURES = [
  {
    id: 'contra-evidencia',
    name: 'Contra-Evidência',
    icon: Database,
    color: 'var(--ice)',
    desc: 'Ataca com dados empíricos.',
    scaffold: 'Contradigo sua afirmação pois existem dados empíricos sólidos que provam o oposto, especificamente que',
  },
  {
    id: 'quebra-de-nexo',
    name: 'Quebra de Nexo',
    icon: Swords,
    color: 'var(--acid)',
    desc: 'Ataca a garantia lógica.',
    scaffold: 'Sua conclusão é logicamente inválida porque a justificativa apresentada não se conecta com o fato, dado que',
  },
  {
    id: 'falso-efeito',
    name: 'Falso Efeito',
    icon: AlertTriangle,
    color: 'var(--violet)',
    desc: 'Ataca a consequência assumida.',
    scaffold: 'A linha de impacto do seu argumento assume um cenário causal irreal, visto que',
  },
];

function Phase3Builder({ themeId, onPlay, disabled }) {
  const [posture, setPosture] = useState(null);     // postura única selecionada
  const [author, setAuthor]   = useState('');       // desfecho autoral (≤140)
  const [guideOpen, setGuideOpen] = useState(false);

  const ready = !!posture && author.trim().length >= 8;

  const choosePosture = (p) => {
    if (disabled) return;
    setPosture(prev => (prev?.id === p.id ? null : p));
  };

  const fire = () => {
    if (!ready || disabled) return;
    // Concatena o andaime fixo da postura com o desfecho digitado pelo aluno.
    const unified = `${posture.scaffold} ${author.trim()}`;
    onPlay({ cardType: null, text: unified });
    setPosture(null);
    setAuthor('');
  };

  return (
    <div className="builder">
      {/* Botão flutuante do Holo-Guia */}
      <button
        type="button"
        className="holo-fab"
        onClick={() => setGuideOpen(o => !o)}
      >
        <Eye size={14} strokeWidth={2} /> Ver Holo-Guia
      </button>

      {/* Gaveta lateral com o esquema de Toulmin (não re-renderiza a autoria) */}
      <AnimatePresence>
        {guideOpen && (
          <motion.aside
            className="holo-drawer"
            initial={{ x: '100%', opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.4 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="holo-drawer-head">
              <span><Eye size={14} /> HOLO-GUIA TÁTICO</span>
              <button className="flash-close" onClick={() => setGuideOpen(false)} aria-label="Fechar"><X size={16} /></button>
            </div>
            <HoloGuide themeId={themeId} compact />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Passo 1 — Postura de Ataque Lógico (seleção única) */}
      <div className="builder-step">
        <span className="builder-step-label">1 · ESCOLHA SUA POSTURA DE ATAQUE</span>
        <div className="posture-grid">
          {POSTURES.map(p => {
            const Icon = p.icon;
            const on = posture?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`posture-chip ${on ? 'posture-chip-on' : ''}`}
                style={{ '--posture-color': p.color }}
                onClick={() => choosePosture(p)}
                disabled={disabled}
              >
                <span className="posture-chip-icon"><Icon size={16} strokeWidth={2} /></span>
                <span className="posture-chip-name">{p.name}</span>
                <span className="posture-chip-desc">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Passo 2 — Andaime fixo + Passo 3 autoria */}
      {posture && (
        <motion.div
          className="builder-step"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="builder-step-label">
            <Terminal size={11} strokeWidth={2.5} /> 2 · FECHE O ARGUMENTO ({author.length}/{MAX_AUTHOR})
          </span>
          <p className="scaffold-text">
            {posture.scaffold} <span className="scaffold-blank">[ digite abaixo ]</span>
          </p>
          <textarea
            className="author-input"
            value={author}
            onChange={e => setAuthor(e.target.value.slice(0, MAX_AUTHOR))}
            placeholder="...digite o desfecho do seu raciocínio."
            disabled={disabled}
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && ready) { e.preventDefault(); fire(); } }}
          />
          <button
            type="button"
            className="builder-fire"
            onClick={fire}
            disabled={!ready || disabled}
          >
            <Send size={13} strokeWidth={2.5} /> DESFERIR GOLPE FINAL
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Componente principal
// ════════════════════════════════════════════════════════════════════════════
export default function LogicCards({ onPlay, disabled, phase, fallacyOptions, correctFallacy, options, themeId }) {
  // Fase 1 — grid direto
  if (phase === 1) {
    if (!Array.isArray(fallacyOptions) || fallacyOptions.length === 0) return null;
    return (
      <FallacyChoiceGrid
        options={fallacyOptions}
        disabled={disabled}
        onChoose={(chosen) => {
          onPlay({
            cardType: 'fallacy-choice',
            text: `Identifico a falácia de ${chosen} nesse argumento. Esse erro lógico invalida sua conclusão.`,
            selected_logic: chosen,
            correct_fallacy: correctFallacy ?? null,
          });
        }}
      />
    );
  }

  // Fase 2 — Modal Flash
  if (phase === 2) {
    return <Phase2Deck options={options} onPlay={onPlay} disabled={disabled} />;
  }

  // Fase 3 — Construtor de Sentenças (renderizado pelo App via input-zone)
  if (phase === 3) {
    return <Phase3Builder themeId={themeId} onPlay={onPlay} disabled={disabled} />;
  }

  return null;
}
