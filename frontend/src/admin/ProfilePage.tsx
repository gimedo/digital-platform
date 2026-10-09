import { useState, type FormEvent } from 'react';
import { api, errorText } from '../core/api';
import { useAuth } from '../core/auth';
import { useToast } from '../shared/feedback';
import { ErrorBox, PageHeader } from '../shared/ui';

export default function ProfilePage() {
  const { me } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [rep, setRep] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (nw !== rep) return setErr('Las contraseñas nuevas no coinciden.');
    try {
      await api.post('/auth/change-password', { current_password: cur, new_password: nw });
      toast.ok('Contraseña actualizada.');
      setCur(''); setNw(''); setRep('');
    } catch (ex) {
      setErr(errorText(ex));
    }
  };

  return (
    <div>
      <PageHeader title="Mi cuenta" subtitle={`${me?.user.name} · ${me?.user.email}`} />
      <form className="card form-grid narrow" onSubmit={submit}>
        <h3 className="full">Cambiar contraseña</h3>
        <label className="full">Contraseña actual<input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required /></label>
        <label>Nueva contraseña<input type="password" value={nw} onChange={(e) => setNw(e.target.value)} required minLength={8} /></label>
        <label>Repetir<input type="password" value={rep} onChange={(e) => setRep(e.target.value)} required /></label>
        {err && <div className="full"><ErrorBox text={err} /></div>}
        <div className="full"><button className="btn dark">Guardar</button></div>
      </form>
      <div className="card">
        <h3>Mis permisos ({me?.permissions.length ?? 0})</h3>
        <div className="chips">{me?.permissions.map((p) => <code key={p} className="perm">{p}</code>)}</div>
      </div>
    </div>
  );
}
