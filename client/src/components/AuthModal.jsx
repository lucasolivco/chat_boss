import { useState } from 'react';
import { Zap, UserPlus, BookOpen, Loader2, LogIn, X } from 'lucide-react';

const API = '';

export default function AuthModal({ onLogin, onGuest, onHowToPlay }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro desconhecido.'); return; }
      onLogin(data);
    } catch {
      setError('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box auth-modal">
        <h2 className="modal-title">
          {mode === 'login'
            ? <><LogIn size={16} strokeWidth={2} /> Entrar na Arena</>
            : <><UserPlus size={16} strokeWidth={2} /> Criar Conta</>}
        </h2>

        <div className="auth-toggle">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Login</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Criar conta</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            maxLength={50}
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          {error && <p className="auth-error"><X size={12} /> {error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? <><Loader2 size={14} className="spin" /> Processando...</>
              : mode === 'login'
                ? <><Zap size={14} strokeWidth={2.2} /> Entrar</>
                : <><UserPlus size={14} strokeWidth={2.2} /> Criar conta</>}
          </button>
        </form>

        <div className="auth-divider">ou</div>

        <button className="btn-ghost" onClick={onGuest}>
          Jogar sem conta <span className="ghost-note">(progresso não salvo)</span>
        </button>

        <button className="btn-link" onClick={onHowToPlay}>
          <BookOpen size={12} /> Como funciona o jogo?
        </button>
      </div>
    </div>
  );
}
