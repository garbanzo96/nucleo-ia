#!/usr/bin/env python3
"""Sala de redacción de Núcleo IA en modo CLI.

La sala pone el arnés (prompts maestros, fuentes, reglas y validaciones); el modelo corre en tu
computador con tu propia suscripción, usando Claude Code (`claude`) o Codex (`codex`).

Uso:
  python3 nucleo.py temas                 lista los temas nuevos del radar
  python3 nucleo.py evaluar               puntúa los temas nuevos con tu IA
  python3 nucleo.py redactar TEMA_O_URL   redacta un borrador y lo guarda en la sala
  python3 nucleo.py opciones              muestra formatos y tipos de gancho

Opciones: --ia claude|codex (por defecto, el que encuentre), --modelo NOMBRE,
--formato TEXTO, --gancho TEXTO. La contraseña de la sala se pide al empezar
(o se lee de la variable NUCLEO_SALA_CLAVE). No usa claves de API.
"""
import argparse
import getpass
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.error import HTTPError
from urllib.request import Request, urlopen

CONEXION = 'https://garbanzo96.github.io/nucleo-ia/sala/conexion.js'
SISTEMA_EXTRA = ('\nTrabajas sin herramientas: no abras archivos, no navegues ni ejecutes comandos. '
                 'Responde solo con el JSON pedido, sin texto antes ni después.')


def leer_conexion(texto):
    """Saca url, anon y email de conexion.js (valores públicos)."""
    datos = {k: (re.search(rf"\b{k}:\s*'([^']*)'", texto) or [None, ''])[1] for k in ('url', 'anon', 'email')}
    if not re.fullmatch(r'https://[a-z0-9]+\.supabase\.co', datos['url']) or not datos['anon'] or not datos['email']:
        raise SystemExit('conexion.js no tiene la URL, la clave pública o el correo de la sala.')
    return datos


def conexion():
    local = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'conexion.js')
    if os.path.exists(local):
        with open(local, encoding='utf-8') as f:
            return leer_conexion(f.read())
    with urlopen(CONEXION, timeout=20) as r:
        return leer_conexion(r.read(20000).decode())


class Sala:
    def __init__(self, cx, clave):
        self.cx = cx
        r = self._pedir('POST', '/auth/v1/token?grant_type=password', {'email': cx['email'], 'password': clave}, token=cx['anon'])
        self.token = r['access_token']

    def _pedir(self, metodo, ruta, cuerpo=None, token=None):
        req = Request(self.cx['url'] + ruta, method=metodo, data=None if cuerpo is None else json.dumps(cuerpo).encode(),
                      headers={'apikey': self.cx['anon'], 'Authorization': 'Bearer ' + (token or self.token), 'Content-Type': 'application/json'})
        try:
            with urlopen(req, timeout=150) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except HTTPError as e:
            try:
                detalle = json.loads(e.read()).get('error') or ''
            except (ValueError, AttributeError):
                detalle = ''
            if ruta.startswith('/auth/'):
                raise SystemExit('No se pudo entrar a la sala: revisa la contraseña.') from None
            raise SystemExit(f'La sala respondió {e.code}: {detalle or "error sin detalle"}') from None

    def funcion(self, nombre, cuerpo):
        return self._pedir('POST', '/functions/v1/' + nombre, cuerpo)

    def tabla(self, consulta):
        return self._pedir('GET', '/rest/v1/' + consulta)


def comando_ia(ia, modelo, sistema, salida):
    """Arma el comando sin herramientas ni sesión persistente. El prompt va por stdin."""
    if ia == 'claude':
        cmd = ['claude', '-p', '--output-format', 'text', '--tools', '', '--no-session-persistence',
               '--strict-mcp-config', '--system-prompt', sistema + SISTEMA_EXTRA]
    else:
        cmd = ['codex', 'exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-o', salida, '-']
    if modelo:
        cmd[2:2] = ['--model', modelo] if ia == 'claude' else ['-m', modelo]
    return cmd


def correr_ia(ia, modelo, paso):
    """Ejecuta un paso del arnés en el CLI del miembro y devuelve el texto (la sala lo valida)."""
    datos = json.dumps(paso['datos'], ensure_ascii=False)
    with tempfile.TemporaryDirectory() as tmp:
        salida = os.path.join(tmp, 'respuesta.txt')
        cmd = comando_ia(ia, modelo, paso['sistema'], salida)
        entrada = datos if ia == 'claude' else f"INSTRUCCIONES DE SISTEMA:\n{paso['sistema']}{SISTEMA_EXTRA}\n\nDATOS:\n{datos}"
        r = subprocess.run(cmd, input=entrada, capture_output=True, text=True, timeout=600, cwd=tmp)
        if r.returncode != 0:
            raise SystemExit(f'{ia} terminó con error: {(r.stderr or r.stdout).strip()[-500:]}')
        if ia == 'codex':
            with open(salida, encoding='utf-8') as f:
                return f.read()
        return r.stdout


def elegir_ia(pedida):
    if pedida:
        if not shutil.which(pedida):
            raise SystemExit(f'No encontré `{pedida}` instalado.')
        return pedida
    for ia in ('claude', 'codex'):
        if shutil.which(ia):
            return ia
    raise SystemExit('Instala Claude Code (`claude`) o Codex (`codex`) e inicia sesión con tu cuenta.')


def temas(sala):
    filas = sala.tabla('candidatos?select=id,titulo,puntaje,fuente_primaria&estado=eq.nuevo&order=puntaje.desc.nullslast,creado_en.desc&limit=40') or []
    for c in filas:
        p = '–' if c['puntaje'] is None else c['puntaje']
        print(f"{c['id'][:8]}  [{p}]  {c['titulo'][:90]}{'' if c['fuente_primaria'] else '  (sin fuente primaria)'}")
    if not filas:
        print('No hay temas nuevos. Aprieta «Buscar temas nuevos» en la sala.')


def evaluar(sala, ia, modelo):
    plan = sala.funcion('arnes', {'tarea': 'evaluar', 'paso': 'lotes'})
    total = 0
    for i, lote in enumerate(plan['lotes'], 1):
        print(f'Lote {i}/{len(plan["lotes"])}: evaluando con {ia}…', flush=True)
        total += sala.funcion('arnes', {'tarea': 'evaluar', 'paso': 'guardar', 'ids': lote['ids'],
                                        'respuesta': correr_ia(ia, modelo, lote)})['evaluados']
    print(f'Evaluados {total} de {plan["pendientes"]} temas.' if plan['pendientes'] else 'No hay temas sin evaluar.')


def fuente_de(sala, tema):
    if tema.startswith('https://'):
        return tema, None
    if not re.fullmatch(r'[0-9a-f]{8}(-[0-9a-f-]{27})?', tema):
        raise SystemExit('Indica la URL de la fuente primaria o el código del tema que muestra `temas`.')
    filas = sala.tabla(f'candidatos?select=id,fuente_primaria&id=gte.{tema}&limit=1&order=id') if len(tema) == 8 else sala.tabla(f'candidatos?select=id,fuente_primaria&id=eq.{tema}')
    filas = [c for c in (filas or []) if c['id'].startswith(tema)]
    if not filas or not filas[0]['fuente_primaria']:
        raise SystemExit('Ese tema no existe o no tiene fuente primaria.')
    return filas[0]['fuente_primaria'], filas[0]['id']


def redactar(sala, ia, modelo, tema, formato, gancho):
    opciones = sala.funcion('arnes', {'tarea': 'opciones'})
    formato = formato or opciones['formatos'][0]
    gancho = gancho or opciones['ganchos'][0]
    url, candidato = fuente_de(sala, tema)
    base = {'tarea': 'redactar', 'fuente_primaria': url, 'formato': formato, 'tipo_gancho': gancho}
    inicio = sala.funcion('arnes', {**base, 'paso': 'borrador'})
    base.update(formato=inicio['formato'], tipo_gancho=inicio['tipo_gancho'])  # la sala puede cambiarlos por rotación
    print(f"Borrador ({base['formato']}, gancho: {base['tipo_gancho']}) con {ia}…", flush=True)
    borrador = correr_ia(ia, modelo, inicio['paso'])
    for intento in range(3):
        revision = sala.funcion('arnes', {**base, 'paso': 'revisar', 'borrador': borrador})
        if not revision['paso']:
            break
        if intento == 2:
            raise SystemExit('El borrador no cumplió las reglas: ' + '; '.join(revision['problemas'][:3]))
        print(f"Corrigiendo {len(revision['problemas'])} problema(s)…", flush=True)
        borrador = correr_ia(ia, modelo, revision['paso'])
    print('Verificando contra la fuente…', flush=True)
    informe = correr_ia(ia, modelo, sala.funcion('arnes', {**base, 'paso': 'verificar', 'borrador': borrador})['paso'])
    final = sala.funcion('arnes', {**base, 'paso': 'cerrar', 'borrador': borrador, 'informe': informe})
    formato, gancho = base['formato'], base['tipo_gancho']
    b = final['borrador']
    post = {'formato': formato, 'tipo_gancho': gancho, 'fuente_primaria': url, 'candidato_id': candidato,
            'laminas': b['laminas'], 'descripcion': b.get('descripcion', ''), 'ganchos': b.get('ganchos', []),
            'sugerencia_imagen': b.get('sugerencia_imagen', {}), 'credito_imagen': '', 'imagen_privada': None,
            'encuadre': 50, 'oscurecimiento': 20, 'checklist': {}}
    guardado = sala.funcion('guardar_post', post)
    print(f"Borrador guardado (revisión {guardado['revision']}). Ábrelo en la sala: Editor → Borradores guardados.")
    for alerta in final.get('alertas', []):
        print('Revisar · ' + alerta)
    print(final['advertencia'])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('accion', choices=['temas', 'evaluar', 'redactar', 'opciones'])
    ap.add_argument('tema', nargs='?')
    ap.add_argument('--ia', choices=['claude', 'codex'])
    ap.add_argument('--modelo')
    ap.add_argument('--formato')
    ap.add_argument('--gancho')
    a = ap.parse_args(argv)
    if a.accion == 'redactar' and not a.tema:
        ap.error('redactar necesita el código del tema o la URL de la fuente primaria')
    sala = Sala(conexion(), os.environ.get('NUCLEO_SALA_CLAVE') or getpass.getpass('Contraseña de la sala: '))
    if a.accion == 'temas':
        temas(sala)
    elif a.accion == 'opciones':
        o = sala.funcion('arnes', {'tarea': 'opciones'})
        print('Formatos: ' + ' | '.join(o['formatos']))
        print('Ganchos: ' + ' | '.join(o['ganchos']))
    elif a.accion == 'evaluar':
        evaluar(sala, elegir_ia(a.ia), a.modelo)
    else:
        redactar(sala, elegir_ia(a.ia), a.modelo, a.tema, a.formato, a.gancho)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
