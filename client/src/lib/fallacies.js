// ─── Catálogo das 9 falácias (pt-br) ──────────────────────────────────────────
// Cada entrada alimenta o FallacyCard: ícone temático (lucide), cor neon, frase
// curta e divertida ("como ela ataca") e uma classe de micro-animação CSS que
// combina com o conceito. UI/UX: leitura instantânea + personalidade visual.
//
// `anim` mapeia para uma classe `.fx-<anim>` definida no App.css.

import {
  Snowflake, User, Scale, RefreshCw, HeartCrack,
  Sparkles, Wheat, BadgeCheck, Link2,
} from 'lucide-react';

export const FALLACIES = {
  'Bola de Neve': {
    icon: Snowflake,
    color: '#7fdfff',
    glow: 'rgba(127,223,255,0.55)',
    anim: 'roll',
    quip: 'Empurra um errinho morro abaixo até virar o apocalipse.',
    how: 'Encadeia consequências cada vez mais catastróficas — sem nenhuma prova de que uma leva à outra.',
  },
  'Ataque Pessoal': {
    icon: User,
    color: '#ff5d6c',
    glow: 'rgba(255,93,108,0.55)',
    anim: 'punch',
    quip: 'Não rebate a ideia — soca quem falou.',
    how: 'Desqualifica a pessoa em vez de responder ao argumento dela.',
  },
  'Falsa Dicotomia': {
    icon: Scale,
    color: '#c8ff00',
    glow: 'rgba(200,255,0,0.5)',
    anim: 'tilt',
    quip: 'Te dá só duas portas... e esconde o resto do corredor.',
    how: 'Reduz tudo a "8 ou 80" quando existem várias opções no meio.',
  },
  'Raciocínio Circular': {
    icon: RefreshCw,
    color: '#a64dff',
    glow: 'rgba(166,77,255,0.55)',
    anim: 'spin',
    quip: 'Prova a conclusão... usando a própria conclusão. Roda viva.',
    how: 'A premissa já contém a conclusão — o argumento gira em torno de si mesmo.',
  },
  'Apelo à Emoção': {
    icon: HeartCrack,
    color: '#ff7ac8',
    glow: 'rgba(255,122,200,0.55)',
    anim: 'beat',
    quip: 'Troca a lógica por um aperto no coração.',
    how: 'Usa medo, pena ou raiva no lugar de evidência para te convencer.',
  },
  'Generalização Apressada': {
    icon: Sparkles,
    color: '#ffd24d',
    glow: 'rgba(255,210,77,0.55)',
    anim: 'scatter',
    quip: 'Viu dois casos? Pronto, virou "regra universal".',
    how: 'Tira uma conclusão geral a partir de pouquíssimos exemplos.',
  },
  'Espantalho': {
    icon: Wheat,
    color: '#e6a157',
    glow: 'rgba(230,161,87,0.55)',
    anim: 'sway',
    quip: 'Inventa uma versão fraca de você e bate nela.',
    how: 'Distorce o seu argumento numa caricatura fácil de atacar.',
  },
  'Apelo à Autoridade Indevida': {
    icon: BadgeCheck,
    color: '#00d4ff',
    glow: 'rgba(0,212,255,0.55)',
    anim: 'stamp',
    quip: '"Um expert disse!" — pena que de outra área totalmente.',
    how: 'Cita uma autoridade fora da especialidade dela como se fosse prova.',
  },
  'Causa Falsa': {
    icon: Link2,
    color: '#39ff8b',
    glow: 'rgba(57,255,139,0.55)',
    anim: 'snap',
    quip: 'Aconteceu junto, logo um causou o outro. Será?',
    how: 'Confunde coincidência ou ordem no tempo com relação de causa.',
  },
};

// Fallback para nomes desconhecidos / fora do catálogo.
export const DEFAULT_FALLACY = {
  icon: Sparkles,
  color: '#9fb0c8',
  glow: 'rgba(159,176,200,0.5)',
  anim: 'beat',
  quip: 'Um truque retórico se infiltrou no argumento.',
  how: 'O raciocínio parece convincente, mas a estrutura lógica não se sustenta.',
};

// Normaliza acentos/caixa para casar variações vindas do backend/LLM.
const DIACRITICS = /[̀-ͯ]/g;
function norm(s) {
  return (s || '')
    .normalize('NFD').replace(DIACRITICS, '')
    .trim().toLowerCase();
}

export function getFallacy(name) {
  if (!name) return null;
  const target = norm(name);
  const key = Object.keys(FALLACIES).find(k => norm(k) === target);
  return key ? { name: key, ...FALLACIES[key] } : { name, ...DEFAULT_FALLACY };
}
