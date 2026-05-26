import { useEffect, useState } from 'react';

const API = '';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Ranking({ currentUserId, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/ranking`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setError('Não foi possível carregar o ranking.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box ranking-modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">🏆 Ranking Global</h2>
        <p className="ranking-sub">Top 10 por dano total ao boss</p>

        {loading && <p className="ranking-loading">Carregando...</p>}
        {error && <p className="auth-error">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="ranking-empty">Nenhuma batalha registrada ainda. Seja o primeiro!</p>
        )}

        {!loading && rows.length > 0 && (
          <table className="ranking-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                <th>Título</th>
                <th>Batalhas</th>
                <th>Win %</th>
                <th>Dano Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.username} className={row.user_id === currentUserId ? 'current-user' : ''}>
                  <td className="rank-pos">{MEDALS[i] || `#${i + 1}`}</td>
                  <td className="rank-name">{row.username}</td>
                  <td className="rank-title">{row.title}</td>
                  <td>{row.total_battles}</td>
                  <td>{row.win_rate}%</td>
                  <td className="rank-dmg">{row.total_boss_damage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button className="btn-secondary" style={{ marginTop: '1.5rem' }} onClick={onClose}>
          ← Voltar ao Duelo
        </button>
      </div>
    </div>
  );
}
