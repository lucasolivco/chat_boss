// eslint-disable-next-line no-unused-vars -- `motion` é usado como motion.div (JSX member); no-unused-vars não rastreia JSX.
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Check } from 'lucide-react';
import { getFallacy } from '../lib/fallacies';

// Ficha de Falácia — modal central animado e divertido.
// `data`: { name, outcome: 'hit' | 'miss' | 'info', correct?: bool }
// outcome controla o tom: acerto (você pegou!), erro (era essa!), info (Fase 2).
export default function FallacyCard({ data, onClose }) {
  if (!data) return null;
  const f = getFallacy(data.name);
  if (!f) return null;
  const Icon = f.icon;

  const headline =
    data.outcome === 'hit'  ? 'FALÁCIA DESMASCARADA!' :
    data.outcome === 'miss' ? 'A FALÁCIA ERA ESTA…'  :
                              'FALÁCIA DETECTADA';

  return (
    <AnimatePresence>
      <motion.div
        className="fallacy-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      >
        <motion.div
          className={`fallacy-modal outcome-${data.outcome}`}
          style={{ '--fx-color': f.color, '--fx-glow': f.glow }}
          initial={{ scale: 0.78, opacity: 0, y: 26 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          onClick={e => e.stopPropagation()}
        >
          <span className="fallacy-modal-eyebrow">
            <Zap size={12} strokeWidth={2.5} /> {headline}
          </span>

          {/* Arte temática: ícone com micro-animação que combina com a falácia */}
          <div className="fallacy-art">
            <span className="fallacy-art-ring" />
            <span className={`fallacy-art-icon fx-${f.anim}`}>
              <Icon size={46} strokeWidth={1.7} />
            </span>
          </div>

          <h2 className="fallacy-modal-name">{f.name}</h2>
          <p className="fallacy-modal-quip">"{f.quip}"</p>
          <p className="fallacy-modal-how">{f.how}</p>

          <button className="fallacy-modal-btn" onClick={onClose}>
            <Check size={14} strokeWidth={2.5} /> ENTENDI
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
