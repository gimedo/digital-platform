import { useState, type FormEvent } from 'react';
import { api, errorText } from '../core/api';
import { CrudPage } from '../shared/CrudPage';
import { useToast } from '../shared/feedback';
import { fmtDateTime } from '../shared/hooks';
import { Modal } from '../shared/Modal';
import { Badge, ErrorBox } from '../shared/ui';

type User = { id: number; name: string; email: string; is_active: boolean; last_login_at: string | null };

export default function UsersPage() {
  const [resetFor, setResetFor] = useState<User | null>(null);
  return (
    <>
      <CrudPage<User>
        title="Usuarios"
        subtitle="Alta y datos de usuarios. Los roles se asignan aparte, en «Roles por usuario»."
        endpoint="/seguridad/usuarios"
        entityLabel="usuario"
        editPermission="seguridad.usuarios.editar"
        searchKeys={['name', 'email']}
        columns={[
          { key: 'name', label: 'Nombre' },
          { key: 'email', label: 'Correo' },
          { key: 'is_active', label: 'Estado', render: (u) => u.is_active ? <Badge kind="ok">Activo</Badge> : <Badge kind="off">Inactivo</Badge> },
          { key: 'last_login_at', label: 'Último ingreso', render: (u) => fmtDateTime(u.last_login_at) },
        ]}
        fields={[
          { name: 'name', label: 'Nombre completo', required: true, full: true },
          { name: 'email', label: 'Correo', type: 'email', required: true, full: true },
          { name: 'password', label: 'Contraseña inicial', type: 'password', required: true, createOnly: true, help: 'Mínimo 8 caracteres.', full: true },
          { name: 'is_active', label: 'Usuario activo', type: 'checkbox', full: true },
        ]}
        emptyValues={{ name: '', email: '', password: '', is_active: true }}
        toForm={(u) => ({ name: u.name, email: u.email, is_active: u.is_active })}
        toPayload={(v, isNew) => isNew ? v : { name: v.name, email: v.email, is_active: v.is_active }}
        rowActions={[{ label: 'Clave', onClick: (u) => setResetFor(u) }]}
      />
      {resetFor && <ResetPassword user={resetFor} onClose={() => setResetFor(null)} />}
    </>
  );
}

function ResetPassword({ user, onClose }: { user: User; onClose: () => void }) {
  const toast = useToast();
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/seguridad/usuarios/${user.id}/reset-password`, { password: pwd });
      toast.ok(`Contraseña restablecida para ${user.name}.`);
      onClose();
    } catch (ex) {
      setErr(errorText(ex));
    }
  };
  return (
    <Modal title={`Restablecer contraseña · ${user.name}`} onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn dark" form="reset-form">Guardar</button></>}>
      <form id="reset-form" className="form-grid" onSubmit={submit}>
        <label className="full">Nueva contraseña<input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} autoFocus /></label>
        {err && <div className="full"><ErrorBox text={err} /></div>}
      </form>
    </Modal>
  );
}
