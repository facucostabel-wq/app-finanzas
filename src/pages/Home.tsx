import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Home() {
  const { session } = useAuth()
  const [nombre, setNombre] = useState<string | null>(null)

  useEffect(() => {
    // Lee el perfil propio: la política RLS impide leer el de cualquier otro usuario.
    supabase
      .from('perfiles')
      .select('nombre')
      .single()
      .then(({ data }) => setNombre(data?.nombre ?? null))
  }, [])

  return (
    <main className="screen">
      <header className="topbar">
        <h1>Hola{nombre ? `, ${nombre}` : ''}</h1>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          Salir
        </button>
      </header>

      <section className="card">
        <h2>Etapa 1 lista</h2>
        <p className="muted">
          Estás logueado como {session?.user.email}. En la próxima etapa acá van a aparecer el alta rápida de
          movimientos y el resumen del mes.
        </p>
      </section>
    </main>
  )
}
