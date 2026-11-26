"""Protótipo local de autenticação do Atlas. Execute com Python 3.11+."""
import hashlib
import hmac
import html
import mimetypes
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.getenv("ATLAS_DATA", Path.home() / ".atlas-login"))
PORT = int(os.getenv("ATLAS_PORT", "8080"))
ORIGIN = os.getenv("ATLAS_ORIGIN", f"http://127.0.0.1:{PORT}").rstrip("/")
MAIL = ThreadPoolExecutor(max_workers=2)
YEAR = 365 * 86400
ASSETS = {"/estilos.css", "/aplicativo.js", "/simbolo.svg", "/dados/conteudos.js", "/dados/vestibulares.js"}


def initialize(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY, salt BLOB, password BLOB);
        CREATE TABLE IF NOT EXISTS sessions(token BLOB PRIMARY KEY, email TEXT, expires INTEGER);
        CREATE TABLE IF NOT EXISTS resets(email TEXT PRIMARY KEY, digest BLOB, expires INTEGER, tries INTEGER);
        CREATE TABLE IF NOT EXISTS limits(action TEXT, subject TEXT, count INTEGER, expires INTEGER,
                                         PRIMARY KEY(action,subject));
        CREATE TABLE IF NOT EXISTS settings(name TEXT PRIMARY KEY, value BLOB);
    """)
    db.execute("INSERT OR IGNORE INTO settings VALUES ('key',?)", (secrets.token_bytes(32),))
    db.commit()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=2**15, r=8, p=3, maxmem=64*1024**2)


def token_hash(token):
    return hashlib.sha256(token.encode()).digest()


def code_hash(db, email, code):
    key = db.execute("SELECT value FROM settings WHERE name='key'").fetchone()[0]
    return hmac.digest(key, (email + "|" + code).encode(), "sha256")


def limited(db, action, subject, maximum):
    now = int(time.time())
    db.execute("DELETE FROM limits WHERE expires<=?", (now,))
    db.execute("""INSERT INTO limits VALUES(?,?,1,?) ON CONFLICT(action,subject)
                  DO UPDATE SET count=count+1""", (action, subject, now+600))
    return db.execute("SELECT count FROM limits WHERE action=? AND subject=?", (action,subject)).fetchone()[0] > maximum


def send_code(email, code):
    msg = EmailMessage()
    msg["From"] = os.getenv("ATLAS_MAIL_FROM", "atlas@localhost")
    msg["To"] = email
    msg["Subject"] = "Recuperação de senha do Atlas"
    msg.set_content(f"Seu código é {code}. Ele vale por 10 minutos e pode ser usado uma vez.")
    host = os.getenv("ATLAS_SMTP_HOST")
    if not host:
        inbox = DATA / "emails"
        inbox.mkdir(exist_ok=True)
        (inbox / (secrets.token_hex(12) + ".eml")).write_bytes(msg.as_bytes())
        return
    with smtplib.SMTP(host, int(os.getenv("ATLAS_SMTP_PORT", "587")), timeout=10) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if os.getenv("ATLAS_SMTP_USER"):
            smtp.login(os.environ["ATLAS_SMTP_USER"], os.environ["ATLAS_SMTP_PASSWORD"])
        smtp.send_message(msg)


def deliver(email, code):
    try:
        send_code(email, code)
    except Exception as exc:
        print("Falha ao entregar e-mail:", type(exc).__name__, flush=True)


def field(name, title, kind, autocomplete, extra=""):
    return f'<label>{title}<input name="{name}" type="{kind}" autocomplete="{autocomplete}" {extra} required></label>'


EMAIL = field("email", "E-mail", "email", "email", 'maxlength="254"')
PASSWORD = field("password", "Senha", "password", "current-password")
NEW = field("password", "Senha (mínimo de 12 caracteres)", "password", "new-password", 'minlength="12" maxlength="128"')
CODE = field("code", "Código de 8 dígitos", "text", "one-time-code", 'inputmode="numeric" pattern="[0-9]{8}"')
PAGES = {
    "/conta": ("Entrar", EMAIL + PASSWORD, "Entrar", '<a href="/cadastro">Criar conta</a><a href="/recuperar">Esqueci a senha</a>'),
    "/cadastro": ("Criar conta", EMAIL + NEW, "Cadastrar e entrar", '<a href="/conta">Já tenho conta</a>'),
    "/recuperar": ("Recuperar senha", EMAIL, "Enviar código", '<a href="/redefinir">Já tenho um código</a>'),
    "/redefinir": ("Redefinir senha", EMAIL + CODE + NEW, "Salvar nova senha", '<a href="/recuperar">Pedir outro código</a>'),
}
TEMPLATE = Path(__file__).with_name("conta.html").read_text(encoding="utf-8")


class Atlas(BaseHTTPRequestHandler):
    def reply(self, body="", status=200, mime="text/html; charset=utf-8", headers=()):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(status)
        for name, value in headers:
            self.send_header(name, value)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def redirect(self, path, cookie=None):
        headers = [("Location", path)]
        if cookie:
            headers.append(("Set-Cookie", cookie))
        self.reply(status=303, headers=headers)

    def cookie(self, value, age):
        secure = "; Secure" if ORIGIN.startswith("https://") else ""
        return f"atlas_session={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}{secure}"

    def session(self, db):
        jar = SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie", ""))
        except CookieError:
            pass
        token = jar["atlas_session"].value if "atlas_session" in jar else ""
        digest = token_hash(token)
        row = db.execute("SELECT email FROM sessions WHERE token=? AND expires>?", (digest,time.time())).fetchone()
        return digest, row[0] if row else None

    def page(self, path, notice="", email=None):
        if path == "/conta" and email:
            title, fields, button, links = "Minha conta", "", "Sair", ""
            path = "/sair"
            notice = f"Você entrou como {email}."
        else:
            title, fields, button, links = PAGES[path]
        body = TEMPLATE.replace("{title}", title).replace("{action}", path).replace("{fields}", fields)
        self.reply(body.replace("{button}", button).replace("{links}", links).replace("{notice}", html.escape(notice)))

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ASSETS:
            mime = "text/javascript" if path.endswith(".js") else mimetypes.guess_type(path)[0]
            return self.reply((ROOT / path[1:]).read_bytes(), mime=mime)
        if path not in {"/", "/index.html", *PAGES}:
            return self.send_error(404)
        with closing(sqlite3.connect(DATA / "atlas.sqlite3")) as db:
            _, email = self.session(db)
        if path in PAGES:
            return self.page(path, email=email)
        body = (ROOT / "index.html").read_text(encoding="utf-8")
        button = 'id="sidebar-login" type="button">Login'
        label = "Minha conta" if email else "Login"
        self.reply(body.replace(button, f'id="sidebar-login" data-conta="/conta" type="button">{label}'))

    def do_POST(self):
        if self.headers.get("Origin") != ORIGIN:
            return self.send_error(403, "Origem incorreta")
        if self.path not in {*PAGES, "/sair"}:
            return self.send_error(404)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 <= size <= 4096:
                return self.send_error(413)
            form = parse_qs(self.rfile.read(size).decode(), max_num_fields=5)
        except (ValueError, UnicodeError):
            return self.send_error(400)
        with closing(sqlite3.connect(DATA / "atlas.sqlite3")) as db, db:
            self.submit(db, form)

    def submit(self, db, form):
        path = self.path
        digest, _ = self.session(db)
        if path == "/sair":
            db.execute("DELETE FROM sessions WHERE token=?", (digest,))
            return self.redirect("/", self.cookie("", 0))
        email = form.get("email", [""])[0].strip().lower()
        password = form.get("password", [""])[0]
        if len(email)>254 or not re.fullmatch(r"[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+", email):
            return self.page(path, "Informe um e-mail válido.")
        if limited(db, path, "ip:"+self.client_address[0], 60):
            return self.page(path, "Muitas tentativas. Tente novamente em 10 minutos.")
        if path in {"/cadastro", "/redefinir"} and not 12 <= len(password) <= 128:
            return self.page(path, "Escolha uma senha entre 12 e 128 caracteres.")
        user = db.execute("SELECT salt,password FROM users WHERE email=?", (email,)).fetchone()
        if path == "/recuperar":
            frequent = limited(db, path, email, 3)
            if user and not frequent:
                code = f"{secrets.randbelow(10**8):08d}"
                db.execute("INSERT OR REPLACE INTO resets VALUES(?,?,?,5)", (email,code_hash(db,email,code),time.time()+600))
                db.commit()
                MAIL.submit(deliver, email, code)
            return self.page("/redefinir", "Se houver uma conta para esse e-mail, você receberá um código.")
        if path == "/redefinir":
            code = form.get("code", [""])[0]
            record = db.execute("SELECT digest FROM resets WHERE email=? AND expires>? AND tries>0", (email,time.time())).fetchone()
            if not record or not hmac.compare_digest(record[0], code_hash(db,email,code)):
                db.execute("UPDATE resets SET tries=MAX(tries-1,0) WHERE email=?", (email,))
                return self.page(path, "Código inválido ou expirado.")
            salt = secrets.token_bytes(16)
            db.execute("UPDATE users SET salt=?,password=? WHERE email=?", (salt,password_hash(password,salt),email))
            db.execute("DELETE FROM resets WHERE email=?", (email,))
            db.execute("DELETE FROM sessions WHERE email=?", (email,))
            return self.page("/conta", "Senha alterada. Entre com a nova senha.")
        if path == "/cadastro":
            if user:
                return self.page(path, "Não foi possível cadastrar esse e-mail. Tente entrar ou recuperar sua senha.")
            salt = secrets.token_bytes(16)
            db.execute("INSERT INTO users VALUES(?,?,?)", (email,salt,password_hash(password,salt)))
        else:
            if limited(db, path, email, 10):
                return self.page(path, "Muitas tentativas. Tente novamente em 10 minutos.")
            check = password_hash(password, user[0] if user else bytes(16))
            if not user or not hmac.compare_digest(check,user[1]):
                return self.page(path, "E-mail ou senha incorretos.")
        token = secrets.token_urlsafe(32)
        db.execute("DELETE FROM sessions WHERE token=? OR expires<=?", (digest,time.time()))
        db.execute("INSERT INTO sessions VALUES(?,?,?)", (token_hash(token),email,time.time()+YEAR))
        db.commit()
        self.redirect("/", self.cookie(token, YEAR))


if __name__ == "__main__":
    DATA.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DATA / "atlas.sqlite3")) as connection:
        initialize(connection)
    print(f"Atlas em {ORIGIN} | Dados em {DATA}", flush=True)
    HTTPServer((os.getenv("ATLAS_BIND", "127.0.0.1"), PORT), Atlas).serve_forever()
