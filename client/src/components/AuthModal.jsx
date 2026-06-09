import { useState } from 'react';
import { Zap, Loader2, User, X } from 'lucide-react';

const API = '';

export default function AuthModal({ onLogin }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) { setError('Digite um apelido para entrar.'); return; }
    if (name.length < 2) { setError('Apelido deve ter pelo menos 2 caracteres.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
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
        <div className="auth-header">
          <div className="auth-icon"><User size={32} strokeWidth={1.4} /></div>
          <h2 className="auth-title">IDENTIFICAÇÃO DE COMBATENTE</h2>
          <p className="auth-subtitle">Como quer ser chamado durante o duelo?</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <input
            type="text"
            placeholder="Seu apelido..."
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); }}
            autoFocus
            maxLength={30}
            required
          />
          {error && <p className="auth-error"><X size={12} /> {error}</p>}
          <button type="submit" className="btn-primary" disabled={loading || !username.trim()}>
            {loading
              ? <><Loader2 size={14} className="spin" /> Entrando...</>
              : <><Zap size={14} strokeWidth={2.2} /> ENTRAR NA ARENA</>}
          </button>
        </form>
      </div>
    </div>
  );
}
