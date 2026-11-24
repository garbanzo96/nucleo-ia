export function validarFondo(raw){
  const path=raw.imagen_privada??null, encuadre=raw.encuadre??50, oscurecimiento=raw.oscurecimiento??20;
  if(path!==null&&(typeof path!=='string'||!/^fondos\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(path)))throw Error('Imagen privada inválida');
  if(!Number.isInteger(encuadre)||encuadre<0||encuadre>100||!Number.isInteger(oscurecimiento)||oscurecimiento<0||oscurecimiento>85)throw Error('Ajustes de imagen inválidos');
  return {imagen_privada:path,encuadre,oscurecimiento};
}
// Foto propia de una lámina: mismas reglas que la general. sin_foto: no muestra ni la general.
export function fondoLamina(l){
  if(l.sin_foto===true)return {sin_foto:true};
  if(!l.imagen)return {};
  const {imagen_privada,encuadre,oscurecimiento}=validarFondo({imagen_privada:l.imagen,encuadre:l.encuadre,oscurecimiento:l.oscurecimiento});
  return {imagen:imagen_privada,encuadre,oscurecimiento};
}
export function preservarFondo(raw,actual){
  const result={...raw};
  for(const key of ['imagen_privada','encuadre','oscurecimiento'])
    if(!Object.prototype.hasOwnProperty.call(raw,key)&&actual[key]!==undefined)result[key]=actual[key];
  return result;
}
