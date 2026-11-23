/** Papel de `PasswordInput`: apresenta e coleta dados em um componente reutilizável, recebendo estado e ações da página que o utiliza.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

import { useId, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id?: string
  label: string
}

export function PasswordInput({ className, id, label, ...inputProps }: PasswordInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-input-field">
      <label htmlFor={inputId}>{label}</label>
      <span className="password-input">
        <input
          {...inputProps}
          className={className}
          id={inputId}
          type={visible ? 'text' : 'password'}
        />
        <button
          aria-controls={inputId}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className="password-visibility-toggle"
          onClick={() => setVisible((current) => !current)}
          onMouseDown={(event) => event.preventDefault()}
          title={visible ? 'Ocultar senha' : 'Mostrar senha'}
          type="button"
        >
          {visible
            ? <EyeOff aria-hidden="true" size={18} />
            : <Eye aria-hidden="true" size={18} />}
        </button>
      </span>
    </div>
  )
}