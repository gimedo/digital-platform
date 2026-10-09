import type { ReactNode } from 'react';

export type FieldType = 'text' | 'email' | 'password' | 'textarea' | 'checkbox' | 'select' | 'date' | 'number' | 'color';
export type Option = { value: string | number; label: string };

export type FieldDef = {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: Option[];
  createOnly?: boolean;   // solo se muestra al crear (ej.: contraseña inicial)
  placeholder?: string;
  help?: string;
  full?: boolean;         // ocupa todo el ancho del formulario
};

type Values = Record<string, unknown>;

export function FormField({ f, values, onChange }: { f: FieldDef; values: Values; onChange: (name: string, v: unknown) => void }) {
  const type = f.type ?? 'text';
  const raw = values[f.name];
  let input: ReactNode;
  if (type === 'checkbox') {
    return (
      <label className={`check ${f.full ? 'full' : ''}`}>
        <input type="checkbox" checked={!!raw} onChange={(e) => onChange(f.name, e.target.checked)} />
        {f.label}
      </label>
    );
  }
  if (type === 'textarea') {
    input = <textarea value={String(raw ?? '')} required={f.required} placeholder={f.placeholder}
                      onChange={(e) => onChange(f.name, e.target.value)} rows={3} />;
  } else if (type === 'select') {
    input = (
      <select value={raw === null || raw === undefined ? '' : String(raw)} required={f.required}
              onChange={(e) => {
                const opt = f.options?.find((o) => String(o.value) === e.target.value);
                onChange(f.name, opt ? opt.value : null);
              }}>
        <option value="">{f.required ? 'Seleccionar…' : '— Ninguno —'}</option>
        {f.options?.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    );
  } else if (type === 'number') {
    input = <input type="number" value={raw === null || raw === undefined ? '' : String(raw)} required={f.required}
                   onChange={(e) => onChange(f.name, e.target.value === '' ? null : Number(e.target.value))} />;
  } else {
    input = <input type={type} value={String(raw ?? '')} required={f.required} placeholder={f.placeholder}
                   onChange={(e) => onChange(f.name, e.target.value)} />;
  }
  return (
    <label className={f.full ? 'full' : ''}>
      {f.label}{f.required && <span className="req">*</span>}
      {input}
      {f.help && <small className="muted">{f.help}</small>}
    </label>
  );
}
