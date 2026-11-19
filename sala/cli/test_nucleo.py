"""Pruebas del modo CLI: python3 -m unittest sala/cli/test_nucleo.py"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import nucleo  # noqa: E402

JS = """window.SALA_CONEXION = {
  url: 'https://abcd.supabase.co',    // comentario
  anon: 'eyJpublica',
  email: 'sala@nucleo-ia.cl',
};"""


class Pruebas(unittest.TestCase):
    def test_lee_conexion(self):
        self.assertEqual(nucleo.leer_conexion(JS), {'url': 'https://abcd.supabase.co', 'anon': 'eyJpublica', 'email': 'sala@nucleo-ia.cl'})
        with self.assertRaises(SystemExit):
            nucleo.leer_conexion(JS.replace('https://abcd.supabase.co', 'http://evil.example'))

    def test_comando_claude_sin_herramientas(self):
        cmd = nucleo.comando_ia('claude', 'claude-opus-5-5', 'SIS', '/tmp/x')
        self.assertEqual(cmd[:4], ['claude', '-p', '--model', 'claude-opus-5-5'])
        self.assertEqual(cmd[cmd.index('--tools') + 1], '')
        self.assertIn('--no-session-persistence', cmd)
        self.assertTrue(cmd[-1].startswith('SIS'))

    def test_comando_codex_solo_lectura(self):
        cmd = nucleo.comando_ia('codex', 'gpt-x', 'SIS', '/tmp/x')
        self.assertEqual(cmd[:4], ['codex', 'exec', '-m', 'gpt-x'])
        self.assertEqual(cmd[cmd.index('-s') + 1], 'read-only')
        self.assertEqual(cmd[-1], '-')
        self.assertNotIn('SIS', cmd)  # en codex el sistema va por stdin

    def test_correr_ia_pasa_datos_por_stdin(self):
        paso = {'sistema': 'S', 'datos': {'a': 1}}
        with mock.patch.object(nucleo.subprocess, 'run', return_value=mock.Mock(returncode=0, stdout='{"ok":1}', stderr='')) as run:
            self.assertEqual(nucleo.correr_ia('claude', None, paso), '{"ok":1}')
        self.assertEqual(run.call_args.kwargs['input'], '{"a": 1}')
        with mock.patch.object(nucleo.subprocess, 'run', return_value=mock.Mock(returncode=1, stdout='', stderr='sin sesión')):
            with self.assertRaises(SystemExit):
                nucleo.correr_ia('claude', None, paso)


if __name__ == '__main__':
    unittest.main()
