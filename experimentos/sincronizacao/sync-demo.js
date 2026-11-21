(() => {
  const device = new URLSearchParams(location.search).get("dispositivo") === "celular"
    ? "celular"
    : "computador";
  const prefix = "atlas-sync-demo-" + device + "-";
  const banner = document.createElement("section");
  banner.className = "calendar-banner";
  const title = document.createElement("strong");
  title.textContent = "Teste de sincronização · " + device;
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  const connection = document.createElement("button");
  connection.type = "button";
  connection.className = "btn";
  connection.textContent = "Simular sem conexão";
  const other = document.createElement("a");
  other.href = "?dispositivo=" + (device === "celular" ? "computador" : "celular");
  other.target = "_blank";
  other.rel = "noopener";
  other.textContent = "Abrir outro dispositivo";
  const info = document.createElement("div");
  info.append(title, status);
  banner.append(info, connection, other);
  document.querySelector(".page-nav").after(banner);

  let offline = false;
  let sending = false;
  let cursor = 0;
  let apply;

  function pending() {
    return Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .map((key) => JSON.parse(localStorage.getItem(key)))
      .filter(Boolean)
      .sort((first, second) => first.created - second.created);
  }

  async function sync() {
    if (!apply || sending) return;
    const batch = pending().slice(0, 100);
    if (offline || !navigator.onLine) {
      status.textContent = batch.length ? "Salvo neste dispositivo · aguardando sincronização" : "Sem conexão";
      return;
    }
    sending = true;
    try {
      const response = await fetch("/api/sync?desde=" + cursor, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Sincronização indisponível");
      const changes = await response.json();
      if (changes.length) {
        const acknowledged = new Set(batch.map(({ operation }) => operation));
        // Alterações locais feitas durante o envio continuam visíveis até seu próprio envio.
        const remaining = pending().filter(({ operation }) => !acknowledged.has(operation));
        apply([...changes, ...remaining]);
        cursor = changes.at(-1).seq;
      }
      for (const { operation } of batch) localStorage.removeItem(prefix + operation);
      status.textContent = pending().length ? "Aguardando sincronização" : "Sincronizado";
    } catch {
      status.textContent = "Sincronização indisponível · tente novamente ao voltar a conexão";
    } finally {
      sending = false;
    }
  }

  connection.addEventListener("click", () => {
    offline = !offline;
    connection.textContent = offline ? "Religar conexão" : "Simular sem conexão";
    connection.setAttribute("aria-pressed", String(offline));
    sync();
  });
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  window.atlasSyncDemo = {
    device,
    enqueue(change) {
      const operation = crypto.randomUUID();
      try {
        localStorage.setItem(prefix + operation, JSON.stringify({
          ...change, operation, created: Date.now(),
        }));
        sync();
      } catch {
        status.textContent = "Não foi possível guardar a alteração para sincronizar.";
      }
    },
    start(applyChanges) {
      apply = applyChanges;
      sync();
      setInterval(sync, 1500);
    },
  };
})();
