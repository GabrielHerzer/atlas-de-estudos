"""Confere o padrão de branches e mensagens de commit do Atlas."""

import argparse
import re
import subprocess
from pathlib import Path


MENSAGEM = re.compile(r"(?:feat|fix|docs|chore): \S.*")
BRANCH = re.compile(r"(?:feature|fix|docs|refactor|test|chore|hotfix)/[a-z0-9]+(?:-[a-z0-9]+)*")


def conferir_mensagem(texto):
    titulo = next((linha.strip() for linha in texto.splitlines()
                   if linha.strip() and not linha.lstrip().startswith("#")), "")
    if MENSAGEM.fullmatch(titulo):
        return True
    print(f"Mensagem inválida: {titulo!r}. Use feat:, fix:, docs: ou chore: com uma descrição.")
    print("Exemplo: feat: adiciona opção de reagendar")
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modos = parser.add_subparsers(dest="modo", required=True)
    local = modos.add_parser("mensagem")
    local.add_argument("arquivo", type=Path)
    revisao = modos.add_parser("pr")
    revisao.add_argument("base")
    revisao.add_argument("head")
    revisao.add_argument("branch")
    revisao.add_argument("destino", choices=("main", "develop"))
    args = parser.parse_args()

    if args.modo == "mensagem":
        return 0 if conferir_mensagem(args.arquivo.read_text(encoding="utf-8-sig")) else 1

    if args.destino == "main":
        branch_valida = args.branch == "develop" or (
            args.branch.startswith("hotfix/") and BRANCH.fullmatch(args.branch)
        )
        exemplo = "develop ou hotfix/descricao-curta"
    else:
        branch_valida = BRANCH.fullmatch(args.branch)
        exemplo = "feature/descricao-curta ou fix/descricao-curta"

    if not branch_valida:
        print(f"Branch inválida para {args.destino}: {args.branch!r}. Use {exemplo}.")

    titulos = subprocess.check_output(
        ["git", "log", "--no-merges", "--format=%s", f"{args.base}..{args.head}", "--"],
        text=True,
        encoding="utf-8",
    ).splitlines()
    resultados = [conferir_mensagem(titulo) for titulo in titulos]
    return 0 if branch_valida and all(resultados) else 1


if __name__ == "__main__":
    raise SystemExit(main())
