"""Atlas de Estudos: registre sessões e consulte seu tempo de estudo."""

import argparse
from contextlib import closing
from pathlib import Path
import sqlite3


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--banco", type=Path, default=Path.home() / ".atlas-de-estudos.sqlite3")
    commands = parser.add_subparsers(dest="comando", required=True)

    register = commands.add_parser("registrar", help="Registra uma sessão de estudo.")
    register.add_argument("materia")
    register.add_argument("minutos", type=int)
    commands.add_parser("resumo", help="Mostra o total de minutos por matéria.")
    args = parser.parse_args()

    if args.comando == "registrar":
        materia = args.materia.strip()
        if not materia or args.minutos <= 0:
            parser.error("Informe uma matéria e uma duração positiva em minutos.")

    try:
        with closing(sqlite3.connect(args.banco)) as db, db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS sessoes (
                    materia TEXT NOT NULL,
                    minutos INTEGER NOT NULL CHECK (minutos > 0)
                )
            """)
            if args.comando == "registrar":
                db.execute(
                    "INSERT INTO sessoes (materia, minutos) VALUES (?, ?)",
                    (materia, args.minutos),
                )
            else:
                totais = db.execute("""
                    SELECT materia, SUM(minutos) AS total
                    FROM sessoes
                    GROUP BY materia
                    ORDER BY total DESC, materia
                """).fetchall()
    except (sqlite3.Error, OverflowError) as error:
        parser.exit(1, f"Não foi possível acessar ou atualizar o banco: {error}\n")

    if args.comando == "registrar":
        print(f"Sessão registrada. {materia} — {args.minutos} min")
    elif totais:
        for materia, minutos in totais:
            print(f"{materia} — {minutos} min")
    else:
        print("Nenhuma sessão registrada.")


if __name__ == "__main__":
    main()
