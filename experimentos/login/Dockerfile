FROM python:3.13-slim
WORKDIR /app
COPY index.html estilos.css aplicativo.js simbolo.svg ./
COPY dados/ dados/
COPY experimentos/login/servidor.py experimentos/login/conta.html experimentos/login/
ENV ATLAS_BIND=0.0.0.0 ATLAS_DATA=/dados PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "experimentos/login/servidor.py"]
