(() => {
  const account = document.currentScript.dataset.account;
  const queueKey = "atlas-envios-" + account;
  const calendars = ["calendarPlans", "calendarDone", "studyHistory"];
  const defaults = {studied: false, stars: 0, pinned: false, pinnedAt: 0};
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const pending = () => JSON.parse(localStorage.getItem(queueKey) || "{}");
  const status = text => { document.getElementById("save-status").textContent = text; };
  let previous, snapshot, apply, busy = false;

  function fields(data) {
    const result = {};
    for (const [id, item] of Object.entries(data.items)) {
      for (const [name, value] of Object.entries(item)) {
        if (equal(value, defaults[name]) || value === "" || (Array.isArray(value) && !value.length)) continue;
        result[JSON.stringify(["items", id, name])] = value;
      }
    }
    for (const name of calendars) {
      for (const [date, ids] of Object.entries(data[name] || {})) {
        for (const id of ids) result[JSON.stringify([name, date, id])] = true;
      }
    }
    return result;
  }

  function restore(values) {
    const data = snapshot();
    for (const id of Object.keys(data.items)) data.items[id] = {...defaults};
    for (const name of calendars) data[name] = Object.create(null);
    for (const [key, value] of Object.entries(values)) {
      if (value === null) continue;
      const [name, id, field] = JSON.parse(key);
      if (name === "items" && Object.hasOwn(data.items, id) &&
          ["studied","stars","pinned","pinnedAt","notes","training"].includes(field)) {
        data.items[id][field] = value;
      } else if (calendars.includes(name)) {
        (data[name][id] ||= []).push(field);
      }
    }
    apply(data);
  }

  async function sync() {
    if (busy || !snapshot) return;
    busy = true;
    try {
      const sent = pending();
      const response = await fetch("/progresso", {method:"POST", headers:{
        "Content-Type":"application/json", "X-Atlas-Account":account
      }, body:JSON.stringify(sent)});
      if (response.status === 401) {
        status("Sessão encerrada. Atualize a página para entrar novamente.");
        return;
      }
      if (!response.ok) throw new Error();
      const remote = await response.json();
      const remaining = pending();
      for (const [key, value] of Object.entries(sent)) {
        if (equal(remaining[key], value)) delete remaining[key];
      }
      localStorage.setItem(queueKey, JSON.stringify(remaining));
      const merged = {...remote, ...remaining};
      for (const key of Object.keys(merged)) if (merged[key] === null) delete merged[key];
      if (Object.keys({...previous,...merged}).some(key => !equal(previous[key],merged[key]))) restore(merged);
      previous = merged;
      status(Object.keys(remaining).length ? "Aguardando sincronização" : "Sincronizado com sua conta");
    } catch {
      status("Sincronização pendente. Tentaremos novamente.");
    } finally { busy = false; }
  }

  window.atlasAccountSync = {
    account,
    changed(data) {
      if (!previous) return;
      const next = fields(data), edits = pending();
      for (const key of Object.keys({...previous,...next})) {
        if (!equal(previous[key],next[key])) edits[key] = next[key] ?? null;
      }
      previous = next;
      localStorage.setItem(queueKey, JSON.stringify(edits));
      queueMicrotask(sync);
    },
    start(key, guestKey, read, write) {
      snapshot = read;
      apply = write;
      previous = fields(read());
      const marker = guestKey + "-importado";
      if (!localStorage.getItem(marker) && localStorage.getItem(guestKey)) {
        const legacy = fields(JSON.parse(localStorage.getItem(guestKey)));
        if (Object.keys(legacy).length && confirm("Importar o progresso que já estava neste navegador para a conta atual?")) {
          localStorage.setItem(queueKey, JSON.stringify({...legacy,...pending()}));
          localStorage.setItem(marker, account);
        }
      }
      sync();
      setInterval(() => { if (!document.hidden) sync(); }, 3000);
      window.addEventListener("focus", sync);
      window.addEventListener("online", sync);
      window.addEventListener("storage", e => { if (e.key === key) previous = fields(read()); });
    }
  };
})();
