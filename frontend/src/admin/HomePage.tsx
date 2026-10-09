import { useAuth } from '../core/auth';
import { Link } from '../core/router';
import { Badge, PageHeader } from '../shared/ui';

export default function HomePage() {
  const { me, menu } = useAuth();
  const groups = menu.map((g) => ({ ...g, items: g.items.filter((i) => i.path !== '/') })).filter((g) => g.items.length);
  return (
    <div>
      <PageHeader title={`Hola, ${me?.user.name.split(' ')[0] ?? ''}`} subtitle="Accesos disponibles según tus roles." />
      <div className="chips">
        {me?.roles.length ? me.roles.map((r) => <Badge key={r} kind="dark">{r}</Badge>) : <Badge kind="warn">Sin roles asignados: pedí acceso al administrador.</Badge>}
      </div>
      {groups.map((g) => (
        <section key={g.group} className="home-group">
          <h3>{g.group}</h3>
          <div className="tiles">
            {g.items.map((it) => (
              <Link key={it.code} to={it.path} className="tile">
                <span className="tile-ico">{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
