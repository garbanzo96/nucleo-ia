// Datos públicos de conexión de la sala. No son secretos: la clave anon solo da lo que permiten las políticas RLS,
// y sin la contraseña compartida no se ve nada. Nunca pongas aquí la service_role ni otra clave privada.
window.SALA_CONEXION = {
  url: '',    // https://<proyecto>.supabase.co
  anon: '',   // Project Settings → API → anon public
  email: '',  // correo fijo del usuario de la sala
};
