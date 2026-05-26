import { useState } from 'react';
import {
  X, BookOpen, Swords, Zap, HeartCrack, Trophy, Target, BarChart3, Link2,
  Landmark, Scale, Shield, User, Wheat, GraduationCap, Mountain, Columns2,
  RotateCcw, Hash, Heart, AlertTriangle, CheckCircle2,
} from 'lucide-react';

const TABS = [
  { id: 0, label: 'Como Jogar',     icon: Swords },
  { id: 1, label: 'Modelo Toulmin', icon: BarChart3 },
  { id: 2, label: 'Falácias',       icon: AlertTriangle },
];

const TOULMIN = [
  { Icon: Target, name: 'Claim (Tese)', desc: 'Sua posição clara e delimitada. O que você defende?',
    good: '"A automação reduz empregos de baixa qualificação a longo prazo."', bad: '"A automação é ruim."' },
  { Icon: BarChart3, name: 'Data (Dado)', desc: 'Evidência empírica ou estatística que apoia sua tese.',
    good: '"Segundo estudo da Oxford (2013), 47% dos empregos dos EUA estão em risco de automação."', bad: '"Todo mundo sabe que robôs tiram empregos."' },
  { Icon: Link2, name: 'Warrant (Garantia)', desc: 'A lógica que conecta seu dado à sua tese.',
    good: '"Se empregos de rotina são automatizáveis, e automação é mais barata que salários, empresas racionais irão automatizar."', bad: '"Portanto, automação é ruim."' },
  { Icon: Landmark, name: 'Backing (Suporte)', desc: 'Fundamentação da garantia: teorias, princípios, consenso científico.',
    good: '"A teoria econômica neoclássica prevê que firmas minimizam custos."', bad: '(ausente)' },
  { Icon: Scale, name: 'Qualifier (Qualificador)', desc: 'Force da afirmação: evite generalizações absolutas.',
    good: '"Geralmente, no médio prazo..."', bad: '"Sempre", "nunca", "todo mundo"' },
  { Icon: Shield, name: 'Rebuttal (Refutação)', desc: 'Reconheça exceções — isso fortalece, não enfraquece seu argumento.',
    good: '"Exceto em setores que demandam criatividade ou empatia."', bad: '(ignorar contraexemplos)' },
];

const FALLACIES = [
  { Icon: User, name: 'Ad Hominem', desc: 'Atacar a pessoa em vez do argumento.', ex: '"Você não pode falar de economia, nunca trabalhou."' },
  { Icon: Wheat, name: 'Espantalho (Straw Man)', desc: 'Distorcer o argumento do oponente para facilitar o ataque.', ex: '"Você quer regular a IA? Então quer proibir toda tecnologia!"' },
  { Icon: GraduationCap, name: 'Apelo à Autoridade Indevida', desc: 'Citar uma autoridade fora da área de especialização.', ex: '"O ator X disse que vacinas causam autismo."' },
  { Icon: Mountain, name: 'Slippery Slope', desc: 'Encadear consequências improváveis sem justificativa.', ex: '"Se legalizarmos X, em 10 anos teremos o caos total."' },
  { Icon: Columns2, name: 'Falsa Dicotomia', desc: 'Apresentar apenas duas opções quando existem mais.', ex: '"Ou você é a favor, ou é contra a democracia."' },
  { Icon: RotateCcw, name: 'Raciocínio Circular', desc: 'A conclusão já está pressuposta na premissa.', ex: '"X é verdadeiro porque Y diz, e Y é confiável porque X diz."' },
  { Icon: Hash, name: 'Generalização Apressada', desc: 'Concluir uma regra geral de poucos casos.', ex: '"Conheço dois imigrantes criminosos, logo imigrantes são perigosos."' },
  { Icon: Heart, name: 'Apelo à Emoção', desc: 'Usar emoção no lugar de lógica para convencer.', ex: '"Pense nas crianças! Como você pode ser contra isso?"' },
];

export default function HowToPlay({ onClose }) {
  const [tab, setTab] = useState(0);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box howtoplay">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h2 className="modal-title"><BookOpen size={16} strokeWidth={2} /> Manual do Debatedor</h2>

        <div className="tabs">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                <Icon size={13} strokeWidth={2} /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="tab-content">
          {tab === 0 && (
            <div className="howtoplay-section">
              <p className="howtoplay-intro">
                ChatBoss é um <strong>duelo de lógica</strong> contra MECHA-LOGIC, uma IA que avalia seus argumentos com critérios científicos reais.
              </p>
              <div className="howtoplay-rules">
                <div className="rule-card">
                  <span className="rule-icon"><Swords size={20} strokeWidth={1.6} /></span>
                  <div>
                    <strong>Como atacar</strong>
                    <p>Digite um argumento bem fundamentado. A IA avalia tese, dados e lógica pelo Modelo de Toulmin.</p>
                  </div>
                </div>
                <div className="rule-card">
                  <span className="rule-icon rule-icon-acid"><Zap size={20} strokeWidth={1.6} /></span>
                  <div>
                    <strong>Dano ao Boss (você acerta)</strong>
                    <p>Argumento sólido: <span className="dmg-green">20–30 HP</span> · Argumento razoável: <span className="dmg-green">10–15 HP</span></p>
                  </div>
                </div>
                <div className="rule-card">
                  <span className="rule-icon rule-icon-crim"><HeartCrack size={20} strokeWidth={1.6} /></span>
                  <div>
                    <strong>Dano a você (você erra)</strong>
                    <p>Falácia: <span className="dmg-red">15–20 HP</span> · Fato falso: <span className="dmg-red">25 HP</span> · Opinião rasa: <span className="dmg-red">10 HP</span></p>
                  </div>
                </div>
                <div className="rule-card">
                  <span className="rule-icon rule-icon-gold"><Trophy size={20} strokeWidth={1.6} /></span>
                  <div>
                    <strong>Vitória &amp; Títulos</strong>
                    <p>Reduza o HP do boss a 0 para vencer. Acumule vitórias para desbloquear títulos e subir no ranking.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 1 && (
            <div className="toulmin-section">
              <p className="howtoplay-intro">
                O <strong>Modelo de Toulmin</strong> (Stephen Toulmin, 1958) é a estrutura científica mais usada para avaliar argumentos. A IA analisa suas 6 dimensões.
              </p>
              <div className="toulmin-cards">
                {TOULMIN.map((t) => (
                  <div key={t.name} className="toulmin-card">
                    <div className="toulmin-header">
                      <span className="toulmin-icon"><t.Icon size={18} strokeWidth={1.6} /></span>
                      <strong>{t.name}</strong>
                    </div>
                    <p className="toulmin-desc">{t.desc}</p>
                    <div className="toulmin-examples">
                      <div className="ex-good"><CheckCircle2 size={12} /> {t.good}</div>
                      <div className="ex-bad"><X size={12} /> {t.bad}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 2 && (
            <div className="fallacies-section">
              <p className="howtoplay-intro">
                <strong>Falácias lógicas</strong> são erros de raciocínio que invalidam um argumento. A IA detecta as mais comuns — evite-as.
              </p>
              <div className="fallacies-grid">
                {FALLACIES.map((f) => (
                  <div key={f.name} className="fallacy-card">
                    <div className="fallacy-icon"><f.Icon size={18} strokeWidth={1.6} /></div>
                    <strong className="fallacy-name">{f.name}</strong>
                    <p className="fallacy-desc">{f.desc}</p>
                    <p className="fallacy-ex">"{f.ex}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
