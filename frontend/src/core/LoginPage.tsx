import { useState, type FormEvent } from 'react';
import { BRANDING } from '../config/branding';
import { errorText } from './api';
import { useAuth } from './auth';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark big">{BRANDING.shortName}</div>
        <h1>{BRANDING.appName}</h1>
        <p className="muted">{BRANDING.company}</p>
        <label>Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn dark block" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}
