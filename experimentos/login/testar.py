"""Teste de ponta a ponta com HTTP, banco e caixa de e-mail temporários."""
import http.cookiejar
import os
import re
import shutil
import uuid
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.parse
import urllib.request
from email import policy
from email.parser import BytesParser
from pathlib import Path


class LoginTest(unittest.TestCase):
    def setUp(self):
        self.data = Path(tempfile.gettempdir()) / ("atlas-test-" + uuid.uuid4().hex)
        self.data.mkdir()
        self.addCleanup(shutil.rmtree, self.data)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        self.url = f"http://127.0.0.1:{port}"
        self.env = dict(os.environ, ATLAS_DATA=str(self.data), ATLAS_PORT=str(port),
                        ATLAS_ORIGIN=self.url, ATLAS_BIND="127.0.0.1", ATLAS_SMTP_HOST="")
        self.email = "aluno@example.test"
        self.password = "senha-inicial-123"
        self.jar = http.cookiejar.MozillaCookieJar(str(self.data / "cookies.txt"))
        self.browser()
        self.start_server()
        self.addCleanup(self.stop_server)

    def browser(self):
        self.client = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                                  urllib.request.HTTPCookieProcessor(self.jar))

    def start_server(self):
        script = Path(__file__).with_name("servidor.py")
        self.proc = subprocess.Popen([sys.executable, str(script)], env=self.env, stdout=subprocess.DEVNULL)
        for _ in range(100):
            try:
                self.request("/conta")
                return
            except OSError:
                if self.proc.poll() is not None:
                    self.fail("O processo do servidor encerrou durante a inicialização")
                time.sleep(.05)
        self.fail("O servidor não iniciou")

    def stop_server(self):
        self.proc.terminate()
        self.proc.wait(timeout=10)

    def request(self, path, **fields):
        data = urllib.parse.urlencode(fields).encode() if fields else None
        req = urllib.request.Request(self.url+path, data=data, headers={"Origin": self.url})
        with self.client.open(req, timeout=10) as response:
            return response.read().decode()

    def test_conta(self):
        self.assertIn('data-conta="/conta"', self.request("/"))
        self.assertIn("Minha conta", self.request("/cadastro", email=self.email, password=self.password))
        self.jar.save()
        self.stop_server()
        self.jar.clear()
        self.jar.load()
        self.browser()
        self.start_server()
        self.assertIn(self.email, self.request("/conta"))
        self.assertIn("receberá um código", self.request("/recuperar", email=self.email))
        for _ in range(100):
            messages = list((self.data/"emails").glob("*.eml"))
            if messages:
                break
            time.sleep(.05)
        self.assertEqual(len(messages), 1)
        msg = BytesParser(policy=policy.default).parsebytes(messages[0].read_bytes())
        self.assertEqual(msg["To"], self.email)
        code = re.search(r"\b\d{8}\b", msg.get_content())[0]
        new = "nova-senha-do-aluno"
        self.assertIn("inválido", self.request("/redefinir", email=self.email, code="errado", password=new))
        self.assertIn("Senha alterada", self.request("/redefinir", email=self.email, code=code, password=new))
        self.assertNotIn(self.email, self.request("/conta"))
        self.assertIn("inválido", self.request("/redefinir", email=self.email, code=code, password=new))
        self.assertIn("incorretos", self.request("/conta", email=self.email, password=self.password))
        self.assertIn("Minha conta", self.request("/conta", email=self.email, password=new))
        self.request("/sair", sair="1")
        self.assertNotIn(self.email, self.request("/conta"))


if __name__ == "__main__":
    unittest.main()

