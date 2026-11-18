// Datos públicos de conexión de la sala. No son secretos: la clave anon solo da lo que permiten las políticas RLS,
// y sin la contraseña compartida no se ve nada. Nunca pongas aquí la service_role ni otra clave privada.
window.SALA_CONEXION = {
  url: 'https://mntbswehkqcndbbmnwmn.supabase.co',    // https://<proyecto>.supabase.co
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udGJzd2Voa3FjbmRiYm1ud21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMzU5MjUsImV4cCI6MjExMDYxMTkyNX0.ZlVZyb7ayTkYg2feKIsYVpKqtCT5vfRSo-4Ww9tWavo',   // Project Settings → API → anon public
  email: 'sala@nucleo-ia.cl',  // usuario compartido de la sala (Authentication → Users)
};
