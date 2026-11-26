// Atlas de Estudos — comportamento da página.
// HTML define a estrutura. CSS define o visual. Este arquivo responde às ações.
(() => {
  "use strict";
  const curriculum = window.atlasDados.conteudos;

  // Os arquivos da pasta dados são carregados antes deste arquivo.
  const exams = window.atlasDados.vestibulares;

  // Matérias disponíveis no guia e nos recortes de vestibulares.
  const hiddenSubjects = new Set([
    "arte",
    "espanhol",
    "educacao-fisica",
    "redacao",
    "redacao-e-producao-textual",
    "temas-transversais-e-complementares",
  ]);
  const guideAliases = {
    "portugues-leitura-e-discurso": "portugues-interpretacao-e-generos-textuais",
    "portugues-interpretacao": "portugues-interpretacao-e-generos-textuais",
    "interpretacao-de-textos": "portugues-interpretacao-e-generos-textuais",
    "portugues-gramatica-e-usos": "portugues-gramatica-e-analise-linguistica",
    "portugues-gramatica": "portugues-gramatica-e-analise-linguistica",
    gramatica: "portugues-gramatica-e-analise-linguistica",
    "portugues-literatura": "literatura",
  };
  function isVisibleSubject(section) {
    const subjectId = section.exam ? section.id.split("--")[1] : section.id;
    return !hiddenSubjects.has(subjectId) || (section.exam === "enem" && subjectId === "espanhol");
  }
  const allSections = [...curriculum, ...Object.values(exams).flatMap((e) => e.subjects)];
  let selectedExam = "enem",
    pendingScope = "general";

  // Chave usada para guardar o progresso neste navegador.
  const syncDemo = window.atlasSyncDemo;
  const KEY = "atlas-estudos-checklist-v1" + (syncDemo ? "-" + syncDemo.device : "");
  const $ = (id) => document.getElementById(id);
  const records = new Map(),
    views = new Map(),
    subjects = [];
  const normal = (s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  for (const s of allSections) {
    records.set(s.id, { kind: "subject", title: s.title });
    for (const t of s.topics) {
      records.set(t.id, { kind: "topic", title: t.title });
      for (const c of t.contents || [])
        records.set(c.id, { kind: "content", title: c.title, parent: t.id });
    }
  }
  const items = Object.create(null);
  for (const id of records.keys())
    items[id] = { studied: false, stars: 0, pinned: false, pinnedAt: 0 };
  let currentPage = location.hash === "#pendentes" ? "pending" : "subjects";

  // O planejamento usa tópicos. Planos antigos de matérias inteiras também são aceitos.
  const plannable = new Map();
  for (const subject of curriculum.filter(isVisibleSubject)) {
    // Preserve whole-subject entries saved by the previous calendar.
    plannable.set(subject.id, { subject, title: subject.title });
    for (const topic of subject.topics)
      plannable.set(topic.id, { subject, topic, title: topic.title });
  }
  let calendarPlans = Object.create(null);
  let calendarDone = Object.create(null);
  let studyHistory = Object.create(null);
  const studyEntries = new Map(plannable);
  for (const subject of allSections.filter(isVisibleSubject)) {
    studyEntries.set(subject.id, { subject, title: subject.title });
    for (const topic of subject.topics) {
      studyEntries.set(topic.id, { subject, topic, title: topic.title });
    }
  }

  // Datas do calendário usam o horário local do aparelho.
  function dateKey(date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part, i) => String(part).padStart(i ? 2 : 4, "0"))
      .join("-");
  }
  function calendarDate(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key || "")) return null;
    const date = new Date(key + "T12:00:00");
    return Number.isFinite(+date) && dateKey(date) === key ? date : null;
  }

  // Confere os dados antes de recuperar um planejamento salvo.
  function readCalendarPlans(value, plans, entries = plannable) {
    const result = Object.create(null);
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;
    for (const [key, ids] of Object.entries(value)) {
      if (!calendarDate(key) || !Array.isArray(ids)) continue;
      const valid = [
        ...new Set(ids.filter((id) => (plans ? plans[key]?.includes(id) : entries.has(id)))),
      ];
      if (valid.length) result[key] = valid;
    }
    return result;
  }
  let storageOK = true,
    toastTimer,
    pendingRestore = null,
    lastSaved = null;
  function validTraining(entry) {
    return (
      entry &&
      Number.isInteger(entry.attempted) &&
      entry.attempted >= 1 &&
      entry.attempted <= 10000 &&
      Number.isInteger(entry.correct) &&
      entry.correct >= 0 &&
      entry.correct <= entry.attempted &&
      typeof entry.date === "string" &&
      Number.isFinite(Date.parse(entry.date))
    );
  }
  function validItem(v) {
    return (
      v &&
      typeof v === "object" &&
      typeof v.studied === "boolean" &&
      Number.isInteger(v.stars) &&
      v.stars >= 0 &&
      v.stars <= 5 &&
      (v.pinned === undefined || typeof v.pinned === "boolean") &&
      (v.pinnedAt === undefined || (Number.isSafeInteger(v.pinnedAt) && v.pinnedAt >= 0)) &&
      (v.training === undefined ||
        (Array.isArray(v.training) && v.training.every(validTraining))) &&
      (v.notes === undefined || (typeof v.notes === "string" && v.notes.length <= 20000))
    );
  }
  function normalizeItem(v) {
    return {
      studied: v.studied,
      stars: v.stars,
      pinned: v.pinned === true,
      pinnedAt: v.pinned === true ? v.pinnedAt || 0 : 0,
      ...(v.training ? { training: v.training } : {}),
      ...(v.notes !== undefined ? { notes: v.notes } : {}),
    };
  }
  function notice(text, isError = false) {
    $("notice").textContent = text;
    $("notice").className = "notice show" + (isError ? " error" : "");
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.schema !== 1 || saved.app !== "atlas-checklist" || !saved.items)
        throw new Error("Formato local incompatível");
      for (const id of records.keys())
        if (validItem(saved.items[id])) items[id] = normalizeItem(saved.items[id]);
      calendarPlans = readCalendarPlans(saved.calendarPlans);
      calendarDone = readCalendarPlans(saved.calendarDone, calendarPlans);
      studyHistory = readCalendarPlans(saved.studyHistory, null, studyEntries);
      lastSaved = saved.updatedAt;
    }
  } catch (e) {
    storageOK = false;
    notice(
      "Não foi possível recuperar o salvamento local. Você pode usar o checklist nesta sessão e salvar um backup antes de fechar.",
    );
  }

  // Reúne o progresso e a agenda para salvamento local e backup.
  function snapshot() {
    return {
      app: "atlas-checklist",
      schema: 1,
      updatedAt: new Date().toISOString(),
      calendarPlans,
      calendarDone,
      studyHistory,
      items: Object.fromEntries(Object.entries(items).map(([id, v]) => [id, { ...v }])),
    };
  }

  // Salva os dados sem precisar de internet.
  function save() {
    const data = snapshot();
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      storageOK = true;
      lastSaved = data.updatedAt;
      $("save-status").textContent =
        "Salvo neste navegador às " +
        new Date(lastSaved).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      storageOK = false;
      $("save-status").textContent = "Sem salvamento local — salve um backup";
      notice(
        "Seu navegador não permitiu salvar as marcações. Use “Salvar backup” antes de fechar para não perder seu progresso.",
      );
    }
  }
  function toast(t) {
    clearTimeout(toastTimer);
    $("toast").textContent = t;
    toastTimer = setTimeout(() => ($("toast").textContent = ""), 3800);
  }
  function node(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Cria o checkbox de estudo de uma matéria, tópico ou conteúdo.
  function studiedControl(id, label, subject = false) {
    const wrap = node("label", "check-wrap" + (subject ? " subject-check" : ""));
    const input = node("input");
    input.type = "checkbox";
    input.dataset.check = id;
    input.id = "check-" + id;
    input.setAttribute("aria-label", "Já estudei: " + records.get(id).title);
    wrap.append(input);
    const span = node("span", subject ? "sr-only" : "", label);
    wrap.append(span);
    return { wrap, input };
  }

  // Cria o conjunto de cinco estrelas para a autoavaliação.
  function ratingControl(id, group = "rating") {
    const outer = node("div", "mastery"),
      label = node("div", "mastery-label");
    label.append(node("span", "", "Meu domínio"));
    const count = node("span", "", "Não avaliado");
    label.append(count);
    outer.append(label);
    const row = node("div", "rating");
    const field = node("fieldset", "stars");
    field.append(node("legend", "sr-only", "Domínio de " + records.get(id).title));
    const radios = [],
      labels = [];
    for (let v = 1; v <= 5; v++) {
      const l = node("label", "star-label"),
        input = node("input");
      input.type = "radio";
      input.name = group + "-" + id;
      input.value = String(v);
      input.dataset.rating = id;
      input.setAttribute("aria-label", v + (v === 1 ? " estrela" : " estrelas"));
      const star = node("span", "", "★");
      star.setAttribute("aria-hidden", "true");
      l.append(input, star);
      l.title = v + " de 5 estrelas";
      field.append(l);
      radios.push(input);
      labels.push(l);
    }
    const clear = node("button", "clear-rating", "×");
    clear.type = "button";
    clear.dataset.clear = id;
    clear.setAttribute("aria-label", "Limpar avaliação de " + records.get(id).title);
    clear.title = "Remover as estrelas";
    row.append(field, clear);
    outer.append(row);
    return { outer, count, radios, labels, clear };
  }
  function scope() {
    return currentPage === "exams"
      ? selectedExam
      : currentPage === "pending"
        ? pendingScope
        : "general";
  }
  function currentSections() {
    const key = scope();
    const directSpanish =
      currentPage === "subjects" && location.hash.startsWith("#materias/espanhol/");
    return (key === "general" ? curriculum : exams[key].subjects).filter(
      (section) => isVisibleSubject(section) || (directSpanish && section.id === "espanhol"),
    );
  }
  function activeSubjects() {
    const ids = new Set(currentSections().map((section) => section.id));
    return subjects.filter((view) => ids.has(view.s.id));
  }
  function insignia(rank) {
    const mark = node("span", "insignia");
    mark.dataset.incidence = String(rank);
    mark.setAttribute("aria-label", rank + " setas de incidência");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 28");
    svg.setAttribute("aria-hidden", "true");
    for (let i = 0; i < rank; i++) {
      const path = document.createElementNS(svg.namespaceURI, "path");
      const y = 3 + i * 8;
      path.setAttribute("d", `M2 ${y + 5} L10 ${y} L18 ${y + 5}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "2.2");
      svg.append(path);
    }
    mark.append(
      svg,
      node(
        "span",
        "",
        rank === 3 ? "Top 3 da disciplina" : rank === 2 ? "Incidência alta" : "Assunto observado",
      ),
    );
    return mark;
  }

  // Desenha o gráfico de incidência a partir das contagens de cada assunto.
  function chartDetails(s) {
    const details = node("details", "chart-details"),
      summary = node("summary", "", "Ver gráfico de incidência e fonte"),
      layout = node("div", "chart-layout");
    details.append(summary, layout);
    const ns = "http://www.w3.org/2000/svg",
      svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 280 280");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Distribuição dos " + s.total + " itens de " + s.title + " em " + exams[s.exam].name,
    );
    svg.classList.add("incidence-chart");
    const title = document.createElementNS(ns, "title");
    title.textContent = "Incidência por assunto: " + s.title;
    svg.append(title);
    const palette = [
      "#2363D9",
      "#C68800",
      "#009480",
      "#8A5BCD",
      "#D65378",
      "#6D9F20",
      "#157EA9",
      "#BE6E29",
      "#737F91",
      "#A445A0",
      "#24705A",
      "#796F2B",
      "#B94743",
      "#566AA1",
      "#477E94",
      "#9D6B78",
    ];
    let start = -Math.PI / 2;
    const table = node("table", "chart-table"),
      head = node("tr");
    for (const label of ["Assunto", "Questões", "%"]) head.append(node("th", "", label));
    const thead = node("thead");
    thead.append(head);
    const body = node("tbody");
    table.append(thead, body);
    for (const [i, t] of s.topics.entries()) {
      const angle = (2 * Math.PI * t.count) / s.total,
        end = start + angle,
        color = palette[i % palette.length],
        x = (a) => 140 + 116 * Math.cos(a),
        y = (a) => 140 + 116 * Math.sin(a);
      const path = document.createElementNS(ns, angle >= 2 * Math.PI - 0.00001 ? "circle" : "path");
      if (angle >= 2 * Math.PI - 0.00001) {
        path.setAttribute("cx", "140");
        path.setAttribute("cy", "140");
        path.setAttribute("r", "116");
      } else
        path.setAttribute(
          "d",
          `M140 140 L${x(start)} ${y(start)} A116 116 0 ${angle > Math.PI ? 1 : 0} 1 ${x(end)} ${y(end)} Z`,
        );
      path.setAttribute("fill", color);
      path.setAttribute("stroke", "white");
      path.setAttribute("stroke-width", "1.2");
      const tip = document.createElementNS(ns, "title");
      tip.textContent =
        t.title +
        ": " +
        t.count +
        " (" +
        ((100 * t.count) / s.total).toFixed(1).replace(".", ",") +
        "%)";
      path.append(tip);
      svg.append(path);
      start = end;
      const tr = node("tr"),
        label = node("td"),
        swatch = node("span", "chart-swatch");
      swatch.style.backgroundColor = color;
      label.append(swatch, document.createTextNode(t.title));
      tr.append(
        label,
        node("td", "", String(t.count)),
        node("td", "", ((100 * t.count) / s.total).toFixed(1).replace(".", ",") + "%"),
      );
      body.append(tr);
    }
    const chart = node("div", "chart-figure");
    chart.append(svg, node("p", "", s.total + " questões na disciplina"));
    layout.append(chart, table);
    const source = node("p", "chart-source");
    source.append(
      document.createTextNode(
        "Base: " +
          exams[s.exam].period +
          ". " +
          (s.exam === "enem"
            ? "Contagens e classificação: De Questões. "
            : s.exam === "tjsp"
              ? "Classificação preliminar e não oficial. "
              : "Classificação própria do levantamento anterior. "),
      ),
    );
    const a = node("a", "", s.exam === "enem" ? "Fonte por disciplina" : "Acervo de provas");
    a.href = s.source || exams[s.exam].source;
    a.target = "_blank";
    a.rel = "noopener";
    source.append(a);
    details.append(source);
    return details;
  }

  const names = { 1: "N1 · Base", 2: "N2 · Intermediário", 3: "N3 · Avançado" };
  const generalOrder = [0, 1, 2, 3, 4, 5, 12, 13, 6, 7, 8, 10].map((i) => curriculum[i].id);
  function pinControl(id) {
    const b = node("button", "pin");
    b.type = "button";
    b.dataset.pin = id;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 3h8l-1 6 4 4v2h-6v6l-1 1-1-1v-6H5v-2l4-4z"/></svg><span>Priorizar</span>';
    b.setAttribute("aria-label", "Priorizar: " + records.get(id).title);
    b.title = "Dar prioridade e mover para o topo desta lista";
    return b;
  }
  let attachmentsDatabase;
  function openAttachmentsDatabase() {
    return (attachmentsDatabase ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("atlas-estudos-anexos", 1);
      request.onupgradeneeded = () => {
        const files = request.result.createObjectStore("files", {
          keyPath: "id",
          autoIncrement: true,
        });
        files.createIndex("subject", "subject");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      attachmentsDatabase = undefined;
      throw error;
    }));
  }
  async function attachmentOperation(mode, operation) {
    const db = await openAttachmentsDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("files", mode);
      const request = operation(transaction.objectStore("files"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  function subjectAttachments(subject, details) {
    const section = node("section", "study-attachments");
    section.append(node("h3", "", "PDFs e imagens"));
    const input = node("input");
    input.type = "file";
    input.multiple = true;
    const imageTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/bmp",
      "image/avif",
    ]);
    input.accept = ["application/pdf", ".pdf", ...imageTypes].join(",");
    input.setAttribute("aria-label", "Anexar PDFs ou imagens a " + records.get(subject).title);
    const status = node("p", "attachment-status");
    status.setAttribute("role", "status");
    const list = node("ul", "attachment-list");
    section.append(
      input,
      node(
        "p",
        "attachment-note",
        "Escolha um arquivo ou cole um print (Ctrl+V) no campo de resumo. Até 25 MB por arquivo. Use Baixar para guardar uma cópia.",
      ),
      status,
      list,
    );
    const urls = [];
    let renderVersion = 0;
    async function refresh() {
      const version = ++renderVersion;
      try {
        const files = await attachmentOperation("readonly", (store) =>
          store.index("subject").getAll(subject),
        );
        if (version !== renderVersion || !details.open) return;
        for (const url of urls.splice(0)) URL.revokeObjectURL(url);
        list.replaceChildren();
        for (const entry of files) {
          const row = node("li"),
            link = node("a", "", entry.file.name),
            remove = node("button", "btn", "Remover");
          const url = URL.createObjectURL(entry.file);
          urls.push(url);
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener";
          const download = node("a", "", "Baixar");
          download.href = url;
          download.download = entry.file.name;
          remove.type = "button";
          remove.setAttribute("aria-label", "Remover " + entry.file.name);
          remove.addEventListener("click", async () => {
            try {
              await attachmentOperation("readwrite", (store) => store.delete(entry.id));
              status.textContent = "Anexo removido.";
              await refresh();
            } catch {
              status.textContent = "Não foi possível remover o arquivo.";
            }
          });
          row.append(link, download, remove);
          list.append(row);
        }
      } catch {
        status.textContent = "Não foi possível abrir o armazenamento de anexos neste navegador.";
      }
    }
    details.addEventListener("toggle", () => {
      if (details.open) refresh();
      else {
        renderVersion++;
        for (const url of urls.splice(0)) URL.revokeObjectURL(url);
        list.replaceChildren();
      }
    });
    async function saveFiles(files) {
      if (!files.length || input.disabled) return;
      if (
        files.some(
          (file) =>
            !file.size ||
            file.size > 25 * 1024 * 1024 ||
            !(file.type === "application/pdf" || imageTypes.has(file.type)),
        )
      ) {
        status.textContent = "Escolha PDFs ou imagens de até 25 MB cada.";
        return;
      }
      input.disabled = true;
      let saved = 0;
      try {
        for (const file of files) {
          await attachmentOperation("readwrite", (store) => store.add({ subject, file }));
          saved++;
        }
        status.textContent = saved === 1 ? "Anexo salvo." : saved + " anexos salvos.";
      } catch {
        status.textContent =
          saved +
          " de " +
          files.length +
          " arquivos salvos. Não foi possível guardar os demais neste navegador.";
      } finally {
        input.disabled = false;
        await refresh();
      }
    }
    input.addEventListener("change", () => {
      const files = [...input.files];
      input.value = "";
      saveFiles(files);
    });
    details.addEventListener("paste", (event) => {
      const files = [...(event.clipboardData?.files || [])].filter((file) =>
        imageTypes.has(file.type),
      );
      if (!files.length) return;
      event.preventDefault();
      saveFiles(files);
    });
    return section;
  }
  function studyNotes(id) {
    const details = node("details", "study-notes");
    const summary = node("summary", "", "Meu resumo e anexos");
    const textarea = node("textarea");
    textarea.maxLength = 20000;
    textarea.placeholder = "Escreva ou cole seu resumo aqui.";
    textarea.setAttribute("aria-label", "Resumo de " + records.get(id).title);
    const saveButton = node("button", "btn", "Salvar resumo");
    saveButton.type = "button";
    saveButton.addEventListener("click", () => {
      items[id].notes = textarea.value;
      changed(id);
      toast("Resumo salvo.");
    });
    details.append(summary, subjectAttachments(id, details), textarea, saveButton);
    return { details, summary, textarea };
  }
  const guideTopicsById = new Map(curriculum.flatMap((s) => s.topics.map((t) => [t.id, t])));

  // Botão de livro reutilizado nos panoramas de matérias e conteúdos.
  function bookButton(title, open) {
    const button = node("button", "subject-overview");
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", open);
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v15M12 6C9 4 6 4 3 5v14c3-1 6-1 9 2 3-3 6-3 9-2V5c-3-1-6-1-9 1Z"/></svg>';
    return button;
  }

  // Monta os cartões de matérias e tópicos na página.
  for (const s of allSections) {
    const article = node("article", "subject");
    article.id = "section-" + s.id;
    const head = node("div", "subject-head"),
      check = studiedControl(s.id, "Já estudei a matéria", true),
      toggle = node("button", "subject-toggle");
    toggle.type = "button";
    toggle.dataset.toggle = s.id;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "body-" + s.id);
    const chev = node("span", "chevron", "›");
    chev.setAttribute("aria-hidden", "true");
    const titles = node("div"),
      title = node("h2", "", s.title),
      sub = node("div", "subline");
    titles.append(title, sub);
    toggle.append(chev, titles);
    const rating = ratingControl(s.id);
    const nameTools = node("div", "subject-name-tools");
    const overview = bookButton("Ver panorama de " + s.title, () =>
      openOverview(s.title, s.topics, "tópicos"),
    );
    nameTools.append(toggle, overview);
    head.append(check.wrap, nameTools, rating.outer);
    const body = node("div", "subject-body");
    body.id = "body-" + s.id;
    body.hidden = true;
    const preface = node("div", "body-preface");
    body.append(preface);
    const pin = pinControl(s.id);
    head.append(pin);
    const sv = { s, article, body, toggle, sub, open: false, topics: [] };
    subjects.push(sv);
    views.set(s.id, { root: article, check: check.input, rating, pin });
    for (const t of s.topics) {
      const row = node("section", "topic"),
        info = node("div", "topic-info"),
        titleline = node("div", "topic-title");
      titleline.append(node("h3", "", t.title));
      if (t.rank) {
        row.dataset.rank = String(t.rank);
        titleline.append(insignia(t.rank));
        info.append(
          node(
            "p",
            "incidence-data",
            t.count +
              " / " +
              t.total +
              " questões · " +
              ((100 * t.count) / t.total).toFixed(1).replace(".", ",") +
              "% da disciplina",
          ),
        );
      } else titleline.append(node("span", "badge n" + t.level, names[t.level]));
      const details = node("details", t.contents ? "content-details" : ""),
        summary = node("summary", "", t.rank ? "Sobre a contagem" : "Ver conteúdos");
      details.append(summary);
      if (!t.contents) details.append(node("p", "", t.text));
      if (t.questions) {
        summary.textContent = "Ver questões classificadas";
        const list = node("ul", "question-references");
        for (const question of t.questions) {
          const paper = exams[s.exam].papers?.find((p) => p.edicao === question.edicao);
          const label = question.rotulo || question.edicao;
          const entry = node("li"),
            link = node("a", "", label + " · questão " + String(question.questao).padStart(2, "0"));
          link.href = question.fonte || paper.prova;
          link.target = "_blank";
          link.rel = "noopener";
          entry.append(link);
          if (question.recorte) entry.append(document.createTextNode(" · " + question.recorte));
          if (question.anulada) entry.append(document.createTextNode(" (anulada)"));
          list.append(entry);
        }
        details.append(list);
      }
      const tc = studiedControl(t.id, "Já estudei");
      info.prepend(titleline);
      info.append(tc.wrap);
      const tr = ratingControl(t.id);
      row.append(info, tr.outer);
      if (t.contents) {
        const book = bookButton("Ver panorama dos conteúdos de " + t.title, () =>
          openOverview(t.title, t.contents, "conteúdos"),
        );
        book.classList.add("topic-content-book");
        titleline.prepend(book);
        row.append(details);
      } else info.append(details);
      if (plannable.get(t.id)?.topic) {
        const add = node("button", "btn calendar-add", "+");
        add.type = "button";
        add.hidden = true;
        add.dataset.planTopic = t.id;
        add.addEventListener("click", () => toggleCalendarItem(t.id));
        titleline.append(add);
      }
      if (t.guideTopics?.length) {
        const guide = guideTopicsById.get(t.guideTopics[0]);
        const contents = t.guideTopics.flatMap((id) => guideTopicsById.get(id)?.contents || []);
        if (guide && contents.length) {
          const book = bookButton("Ver conteúdos de " + t.title, () => {
            openOverview(
              t.title,
              contents,
              "conteúdos",
              "#materias/" + guide.id.split("--")[0] + "/" + t.guideTopics.join(","),
            );
          });
          info.append(book);
        }
      }
      body.append(row);
      views.set(t.id, { root: row, check: tc.input, rating: tr });
      const tv = {
        t,
        row,
        details,
        summary,
        children: [],
        rendered: false,
        search: normal(s.title + " " + t.title + " " + t.text),
      };
      sv.topics.push(tv);
      if (t.contents) {
        details.addEventListener("toggle", () => {
          if (details.open) {
            ensureContents(tv);
            filterContents(tv);
          }
        });
      }
    }
    const notes = studyNotes(s.id);
    views.get(s.id).notes = notes;
    preface.append(notes.details);
    article.append(head, body);
    $("subjects").append(article);
    if (s.exam) {
      const examSubjectId = s.id.split("--")[1];
      const guideId = guideAliases[examSubjectId] || examSubjectId;
      const guideSubject = curriculum.find(
        (subject) => subject.id === guideId && isVisibleSubject(subject),
      );
      if (guideSubject) {
        const link = node("a", "btn guide-link", "Ver tópicos em Minhas matérias");
        link.href = "#materias/" + guideSubject.id;
        preface.append(link);
      }
      preface.append(chartDetails(s));
    }
  }
  for (const sv of subjects)
    for (const tv of sv.topics) {
      const id = tv.t.id,
        info = tv.row.querySelector(".topic-info"),
        view = views.get(id);
      view.pin = pinControl(id);
      view.notes = studyNotes(id);
      tv.row.append(view.notes.details);
      const training = node("div", "training"),
        button = node("button", "btn", "Registrar treino");
      button.type = "button";
      button.dataset.training = id;
      button.setAttribute("aria-label", "Registrar treino de " + tv.t.title);
      view.trainingSummary = node("div", "training-summary");
      view.trainingSummary.hidden = true;
      training.append(button, view.trainingSummary);
      info.append(view.pin, training);
    }

  const overviewDialog = $("overview-dialog");
  let overviewSubject;

  // Abre o panorama em tela cheia ao clicar no livrinho.
  function openOverview(title, topics, label, guideHref) {
    overviewSubject = { title, topics, label };
    const guide = $("overview-guide");
    guide.hidden = !guideHref;
    if (guideHref) guide.href = guideHref;
    renderOverview();
    overviewDialog.showModal();
  }
  function renderOverview() {
    const { title, topics, label } = overviewSubject;
    $("overview-title").textContent = title;
    const done = topics.filter((t) => items[t.id].studied).length;
    const rated = topics.filter((t) => items[t.id].stars > 0).length;
    $("overview-summary").textContent =
      done +
      " de " +
      topics.length +
      " " +
      label +
      " estudados · " +
      rated +
      " com domínio avaliado";
    const list = $("overview-list");
    list.replaceChildren();
    for (const t of topics) {
      const value = items[t.id];
      const row = node("li");
      const status = node(
        "span",
        "overview-status" + (value.studied ? " is-done" : ""),
        value.studied ? "✓ Estudado" : "Pendente",
      );
      const rating = node("span", "overview-rating");
      const stars = node("span", "overview-stars");
      stars.setAttribute("aria-hidden", "true");
      stars.append(
        node("strong", "", "★".repeat(value.stars)),
        document.createTextNode("★".repeat(5 - value.stars)),
      );
      rating.append(stars, node("span", "", value.stars ? value.stars + " / 5" : "Não avaliado"));
      row.append(node("strong", "", t.title), status, rating);
      list.append(row);
    }
  }
  $("overview-guide").addEventListener("click", () => overviewDialog.close());
  const trainingDialog = $("training-dialog");
  const trainingForm = $("training-form");
  let trainingTopicId;
  const trainingDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
  function trainingScore(entry) {
    const percent = Math.round((100 * entry.correct) / entry.attempted);
    return entry.correct + " de " + entry.attempted + " acertos (" + percent + "%)";
  }
  function paintTraining(id, summary) {
    const latest = items[id].training?.at(-1);
    summary.hidden = !latest;
    summary.replaceChildren();
    if (latest)
      summary.append(
        node("strong", "", trainingScore(latest)),
        node("small", "", "Último treino · registro pessoal não oficial"),
      );
  }
  function renderTrainingHistory() {
    const entries = items[trainingTopicId].training || [];
    const list = $("training-history");
    list.replaceChildren();
    $("training-no-history").hidden = entries.length > 0;
    for (const [index, entry] of entries.entries()) {
      const row = node("li");
      const remove = node("button", "btn", "Remover");
      remove.type = "button";
      remove.setAttribute(
        "aria-label",
        "Remover treino de " +
          trainingDate.format(new Date(entry.date)) +
          " · " +
          trainingScore(entry),
      );
      remove.addEventListener("click", () => {
        if (!window.confirm("Remover este treino do histórico?")) return;
        items[trainingTopicId].training.splice(index, 1);
        changed(trainingTopicId);
        renderTrainingHistory();
      });
      row.append(
        node("span", "", trainingDate.format(new Date(entry.date)) + " · " + trainingScore(entry)),
        remove,
      );
      list.prepend(row);
    }
  }
  $("subjects").addEventListener("click", (event) => {
    const button = event.target.closest("[data-training]");
    if (!button) return;
    trainingTopicId = button.dataset.training;
    $("training-topic").textContent = records.get(trainingTopicId).title;
    trainingForm.reset();
    $("training-error").hidden = true;
    renderTrainingHistory();
    trainingDialog.showModal();
  });
  $("training-close").addEventListener("click", () => trainingDialog.close());
  trainingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = {
      attempted: $("training-attempted").valueAsNumber,
      correct: $("training-correct").valueAsNumber,
      date: new Date().toISOString(),
    };
    if (!validTraining(entry)) {
      $("training-error").textContent =
        "Informe de 1 a 10.000 questões feitas e um total de acertos entre zero e esse número.";
      $("training-error").hidden = false;
      $("training-correct").focus();
      return;
    }
    (items[trainingTopicId].training ??= []).push(entry);
    changed(trainingTopicId);
    trainingDialog.close();
    toast("Treino salvo no seu histórico.");
  });
  function paint(id) {
    const v = items[id],
      view = views.get(id);
    if (!view) return;
    if (view.notes) {
      const savedNotes = v.notes || "";
      if (view.notes.textarea.defaultValue !== savedNotes) {
        view.notes.textarea.defaultValue = savedNotes;
        view.notes.textarea.value = savedNotes;
      }
      view.notes.summary.textContent = v.notes
        ? "Meu resumo e anexos · texto salvo"
        : "Meu resumo e anexos";
    }
    if (view.trainingSummary) paintTraining(id, view.trainingSummary);
    view.root.classList.toggle("studied", v.studied);
    view.check.checked = v.studied;
    view.rating.count.textContent = v.stars ? v.stars + " / 5" : "Não avaliado";
    view.rating.radios.forEach((r, i) => {
      r.checked = v.stars === i + 1;
      view.rating.labels[i].classList.toggle("on", i < v.stars);
    });
    view.rating.clear.disabled = v.stars === 0;
    view.pin.setAttribute("aria-pressed", String(v.pinned));
    view.pin.querySelector("span").textContent = v.pinned ? "Priorizado" : "Priorizar";
    view.pin.setAttribute(
      "aria-label",
      (v.pinned ? "Remover prioridade: " : "Priorizar: ") + records.get(id).title,
    );
    view.pin.title = v.pinned
      ? "Clique para desafixar e voltar à ordem original"
      : "Dar prioridade e mover para o topo desta lista";
    view.root.classList.toggle("pinned", v.pinned);
  }

  // Monta os conteúdos detalhados somente quando eles forem abertos.
  function ensureContents(tv) {
    if (tv.rendered || !tv.t.contents) return;
    tv.rendered = true;
    const list = node("div", "content-list");
    tv.list = list;
    tv.details.append(list);
    for (const c of tv.t.contents) {
      const row = node("section", "content-item"),
        info = node("div", "content-info"),
        title = node("h4", "", c.title),
        controls = node("div", "content-actions"),
        check = studiedControl(c.id, "Já estudei"),
        pin = pinControl(c.id),
        rating = ratingControl(c.id);
      row.dataset.content = c.id;
      controls.append(check.wrap, pin);
      info.append(title, controls);
      row.append(info, rating.outer);
      list.append(row);
      views.set(c.id, { root: row, check: check.input, pin, rating });
      tv.children.push({ c, row });
      paint(c.id);
    }
  }
  function comparePins(a, b) {
    return (
      Number(items[b].pinned) - Number(items[a].pinned) ||
      (items[b].pinnedAt || 0) - (items[a].pinnedAt || 0)
    );
  }
  function filterContents(tv) {
    if (!tv.rendered) return;
    for (const cv of tv.children)
      cv.row.hidden = tv.contentMatch ? !tv.contentMatch.has(cv.c.id) : false;
    const ordered = [...tv.children].sort((a, b) => comparePins(a.c.id, b.c.id));
    reorder(
      tv.list,
      ordered.map((c) => c.row),
    );
  }
  function contentStats() {
    let total = 0,
      studied = 0,
      rated = 0,
      sum = 0;
    for (const sv of subjects)
      for (const tv of sv.topics)
        if (tv.t.contents && isVisibleSubject(sv.s)) {
          const children = tv.t.contents,
            done = children.filter((c) => items[c.id].studied).length,
            ratings = children.filter((c) => items[c.id].stars > 0),
            pins = children.filter((c) => items[c.id].pinned).length;
          total += children.length;
          studied += done;
          rated += ratings.length;
          sum += ratings.reduce((n, c) => n + items[c.id].stars, 0);
          tv.summary.textContent =
            "Ver conteúdos · " +
            done +
            " / " +
            children.length +
            " estudados" +
            (ratings.length
              ? " · " + ratings.length + (ratings.length === 1 ? " avaliado" : " avaliados")
              : "") +
            (pins ? " · " + pins + " prioridade" + (pins === 1 ? "" : "s") : "");
        }
    $("content-overview").hidden = scope() !== "general";
    $("content-overview-count").textContent = studied + " / " + total;
    $("content-overview-rating").textContent = rated
      ? (sum / rated).toFixed(1).replace(".", ",") +
        " / 5 · " +
        rated +
        (rated === 1 ? " conteúdo avaliado" : " conteúdos avaliados")
      : "Nenhum conteúdo avaliado ainda";
  }
  let dashboardExam = "";
  const dashboardPicker = $("dashboard-picker");
  const dashboardOptions = $("dashboard-options");
  for (const [key, exam] of Object.entries(exams)) {
    const button = node("button", "btn", exam.name);
    button.type = "button";
    button.addEventListener("click", () => {
      dashboardExam = key;
      dashboardPicker.close();
      updateDashboard();
      $("dashboard-change").focus();
    });
    dashboardOptions.append(button);
  }
  for (const id of ["dashboard-empty", "dashboard-change"]) {
    $(id).addEventListener("click", () => dashboardPicker.showModal());
  }
  function dashboardProgress(sections) {
    const topics = sections.filter(isVisibleSubject).flatMap((subject) => subject.topics);
    const studied = topics.filter((topic) => items[topic.id].studied).length;
    const priorities = topics.filter(
      (topic) => items[topic.id].pinned && !items[topic.id].studied,
    ).length;
    return {
      percent: Math.round((100 * studied) / topics.length) + "%",
      count: studied + " de " + topics.length + " tópicos estudados",
      priorities:
        priorities === 1
          ? "1 tópico priorizado pendente"
          : priorities + " tópicos priorizados pendentes",
    };
  }
  function updateDashboard() {
    const general = dashboardProgress(curriculum);
    $("hero-percent").textContent = general.percent;
    $("hero-ring").style.setProperty("--done", general.percent);
    $("hero-progress-copy").textContent = general.count;
    $("hero-priorities").textContent = general.priorities;

    const exam = exams[dashboardExam];
    $("dashboard-empty").hidden = Boolean(exam);
    $("dashboard-change").hidden = !exam;
    $("dashboard-result").hidden = !exam;
    if (!exam) return;
    const progress = dashboardProgress(exam.subjects);
    $("dashboard-title").textContent = exam.name;
    $("dashboard-count").textContent = progress.count;
    $("dashboard-priorities").textContent = progress.priorities;
    $("dashboard-percent").textContent = progress.percent;
    $("dashboard-ring").style.setProperty("--done", progress.percent);
  }
  const reviewKey = KEY + "-review-exam";
  let reviewExam = "";
  try {
    const savedReview = localStorage.getItem(reviewKey);
    if (Object.hasOwn(exams, savedReview)) reviewExam = savedReview;
  } catch {}
  function selectReview(key) {
    reviewExam = key;
    try {
      localStorage.setItem(reviewKey, key);
    } catch {}
  }
  function reviewCounts(sections) {
    const visible = sections.filter(isVisibleSubject);
    const topics = visible.flatMap((subject) => subject.topics);
    const studied = topics.filter((topic) => items[topic.id].studied).length;
    const pending = visible
      .filter((subject) => !items[subject.id].studied)
      .flatMap((subject) => subject.topics)
      .filter((topic) => !items[topic.id].studied).length;
    return studied + " de " + topics.length + " tópicos estudados · " + pending + " pendentes";
  }
  function updateReviewCards() {
    if (currentPage !== "pending") return;
    const exam = exams[reviewExam];
    const isExam = pendingScope !== "general";
    $("review-general").setAttribute("aria-pressed", String(!isExam));
    $("review-general-count").textContent = reviewCounts(curriculum);
    $("review-add").hidden = Boolean(exam);
    $("review-exam").hidden = !exam;
    $("review-change").hidden = !exam;
    $("review-exam-card").classList.toggle("is-current", isExam);
    $("review-exam").setAttribute("aria-pressed", String(isExam));
    if (exam) {
      $("review-exam-name").textContent = exam.name;
      $("review-exam-count").textContent = reviewCounts(exam.subjects);
    }
    $("review-heading").textContent = isExam
      ? "Revisão · " + exams[pendingScope].name
      : "Pendências do guia completo";
  }
  const reviewPicker = $("review-picker");
  $("review-general").addEventListener("click", () => {
    location.hash = "pendentes";
  });
  $("review-exam").addEventListener("click", () => {
    location.hash = "pendentes/" + reviewExam;
  });
  for (const id of ["review-add", "review-change"]) {
    $(id).addEventListener("click", () => reviewPicker.showModal());
  }
  for (const [key, exam] of Object.entries(exams)) {
    const button = node("button", "btn", exam.name);
    button.type = "button";
    button.addEventListener("click", () => {
      selectReview(key);
      reviewPicker.close();
      location.hash = "pendentes/" + key;
    });
    $("review-options").append(button);
  }
  function stats() {
    updateReviewCards();
    updateDashboard();
    contentStats();
    if (currentPage === "overview") renderSubjectCards();
    if (currentSubjectSpace) renderSubjectSpace(currentSubjectSpace);
    const sectionList = currentSections();
    let sc = 0,
      tc = 0,
      total = 0,
      ratings = 0,
      sum = 0;
    for (const s of sectionList) {
      if (items[s.id].studied) sc++;
      if (items[s.id].stars) {
        ratings++;
        sum += items[s.id].stars;
      }
      for (const t of s.topics) {
        total++;
        if (items[t.id].studied) tc++;
      }
    }

    $("subject-count").textContent = sc + " / " + sectionList.length;
    $("topic-count").textContent = tc + " / " + total;
    $("mastery-average").textContent = ratings
      ? (sum / ratings).toFixed(1).replace(".", ",") + " / 5"
      : "—";
    $("mastery-count").textContent = ratings
      ? ratings + " de " + sectionList.length + " matérias avaliadas"
      : "Nenhuma matéria avaliada ainda";
    for (const [id, value, max] of [
      ["subject-progress", sc, sectionList.length],
      ["topic-progress", tc, total],
    ]) {
      $(id).setAttribute("aria-valuenow", String(value));
      $(id).setAttribute("aria-valuemax", String(max));
      $(id).firstElementChild.style.width = (100 * value) / max + "%";
    }
    for (const sv of subjects) {
      const n = sv.s.topics.filter((t) => items[t.id].studied).length;
      sv.sub.textContent =
        n +
        " / " +
        sv.s.topics.length +
        " tópicos estudados · " +
        (items[sv.s.id].studied ? "Matéria marcada como estudada" : "Matéria ainda não marcada") +
        (sv.s.exam ? " · Base: " + sv.s.total + " questões" : "");
    }
  }
  function setOpen(sv, open, remember = true) {
    if (remember) {
      if (!sv.openByPage) sv.openByPage = { subjects: false, pending: true };
      sv.openByPage[currentPage] = open;
    }
    sv.article.classList.toggle("open", open);
    sv.toggle.setAttribute("aria-expanded", String(open));
    sv.body.hidden = !open;
  }
  function reorder(parent, desired, skip = 0) {
    const old = [...parent.children].slice(skip);
    if (old.length !== desired.length || desired.some((n, i) => old[i] !== n))
      for (const n of desired) parent.append(n);
  }
  function filter() {
    const query = normal($("search").value.trim()),
      mode = $("filter").value,
      active = !!query || mode !== "all",
      pending = currentPage === "pending",
      only = pending && $("only-pinned").checked;
    let matched = 0,
      count = 0,
      contentMatched = 0;
    const activeSubjectsList = activeSubjects();
    for (const sv of subjects) if (!activeSubjectsList.includes(sv)) sv.article.remove();
    for (const sv of activeSubjectsList) {
      if (pending && items[sv.s.id].studied) {
        sv.article.hidden = true;
        continue;
      }
      let found = 0;
      for (const tv of sv.topics) {
        const v = items[tv.t.id],
          inheritedPin = items[sv.s.id].pinned || v.pinned;
        if (pending && v.studied) {
          tv.row.hidden = true;
          continue;
        }
        const match =
          (!query || tv.search.includes(query)) &&
          (!pending || !v.studied) &&
          (!only || inheritedPin) &&
          (mode === "all" ||
            (mode === "todo" && !v.studied) ||
            (mode === "review" && v.stars >= 1 && v.stars <= 2));
        const parentMatches = !query || normal(sv.s.title + " " + tv.t.title).includes(query);
        tv.contentMatch = new Set(
          (tv.t.contents || [])
            .filter((c) => {
              const cv = items[c.id];
              return (
                (parentMatches || normal(c.title).includes(query)) &&
                (!pending || !cv.studied) &&
                (!only || inheritedPin || cv.pinned) &&
                (mode === "all" ||
                  (mode === "todo" && !cv.studied) ||
                  (mode === "review" && cv.stars >= 1 && cv.stars <= 2))
              );
            })
            .map((c) => c.id),
        );
        const childMatch = tv.contentMatch.size > 0;
        tv.row.hidden = !match && !childMatch;
        if (!tv.row.hidden) {
          found++;
          contentMatched += tv.contentMatch.size;
        }
        filterContents(tv);
        const forceOpen = childMatch && (active || (pending && only));
        if (forceOpen) {
          if (!tv.forcedOpen) {
            tv.beforeForced = tv.details.open;
            tv.forcedOpen = true;
          }
          ensureContents(tv);
          filterContents(tv);
          tv.details.open = true;
        } else if (tv.forcedOpen) {
          tv.details.open = tv.beforeForced;
          tv.forcedOpen = false;
        }
      }
      const ownPending =
        pending &&
        !items[sv.s.id].studied &&
        (!query || normal(sv.s.title).includes(query)) &&
        (!only || items[sv.s.id].pinned) &&
        mode === "all";
      sv.article.hidden = found === 0 && !ownPending;
      if (!sv.article.hidden) {
        matched += found;
        count++;
      }
      setOpen(sv, active ? found > 0 : (sv.openByPage?.[currentPage] ?? pending), false);
      const topicPriority = (tv) =>
        Number(items[tv.t.id].pinned && !items[tv.t.id].studied) * 2 +
        Number((tv.t.contents || []).some((c) => items[c.id].pinned && !items[c.id].studied));
      const ordered = [...sv.topics].sort(
        (a, b) =>
          (pending ? topicPriority(b) - topicPriority(a) : 0) || comparePins(a.t.id, b.t.id),
      );
      reorder(
        sv.body,
        ordered.map((t) => t.row),
        1,
      );
    }
    const priority = (sv) =>
      Number(items[sv.s.id].pinned && !items[sv.s.id].studied) * 2 +
      Number(
        sv.topics.some(
          ({ t }) =>
            (items[t.id].pinned && !items[t.id].studied) ||
            (t.contents || []).some((c) => items[c.id].pinned && !items[c.id].studied),
        ),
      );
    const orderedSubjects = [...activeSubjectsList].sort(
      (a, b) =>
        (pending ? priority(b) - priority(a) : 0) ||
        comparePins(a.s.id, b.s.id) ||
        (currentPage === "subjects"
          ? generalOrder.indexOf(a.s.id) - generalOrder.indexOf(b.s.id)
          : 0),
    );
    reorder(
      $("subjects"),
      orderedSubjects.map((s) => s.article),
    );
    $("result-count").textContent =
      count +
      (count === 1 ? " matéria/eixo · " : " matérias e eixos · ") +
      matched +
      (pending ? " tópicos com pendências" : " tópicos") +
      (scope() === "general" ? " · " + contentMatched + " conteúdos detalhados" : "");
    $("empty").hidden = count !== 0;
    $("empty").querySelector("h2").textContent = pending
      ? $("only-pinned").checked
        ? "Nenhuma prioridade pendente"
        : "Tudo marcado por aqui!"
      : "Nenhum conteúdo encontrado";
    $("empty").querySelector("p").textContent = pending
      ? "Ajuste os filtros ou volte para Minhas matérias para consultar e priorizar conteúdos."
      : "Tente outra palavra ou escolha “Todos os conteúdos”.";
    const pendingSubjects = currentSections().filter((s) => !items[s.id].studied);
    const pendingTopics = pendingSubjects
      .flatMap((s) => s.topics)
      .filter((t) => !items[t.id].studied);
    const pendingContents = pendingTopics
      .flatMap((t) => t.contents || [])
      .filter((c) => !items[c.id].studied);
    const priorityCount = [...pendingSubjects, ...pendingTopics, ...pendingContents].filter(
      (item) => items[item.id].pinned,
    ).length;
    $("pending-summary").textContent =
      pendingSubjects.length +
      " matérias não marcadas · " +
      pendingTopics.length +
      " tópicos pendentes" +
      (scope() === "general" ? " · " + pendingContents.length + " conteúdos pendentes" : "") +
      " · " +
      priorityCount +
      " prioridades pendentes";
  }

  const dayFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" });
  const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  const planButtons = [...document.querySelectorAll("[data-plan-topic]")];
  let selectedCalendarDay = dateKey(new Date());
  let planTarget = null;
  function monthOf(date) {
    const month = new Date(date);
    month.setDate(1);
    return month;
  }
  let calendarMonth = monthOf(calendarDate(selectedCalendarDay));
  function selectCalendarDay(key) {
    const date = calendarDate(key);
    if (!date) return;
    selectedCalendarDay = key;
    calendarMonth = monthOf(date);
    history.replaceState(null, "", "#planejamento/" + key);
    renderCalendar();
  }

  // Desenha o mês e a lista de tópicos do dia selecionado.
  function renderCalendar() {
    const grid = $("calendar-grid");
    const today = dateKey(new Date());
    const month = calendarMonth.getMonth();
    $("calendar-month").textContent = monthFormat.format(calendarMonth);
    grid.replaceChildren();
    for (const label of ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]) {
      grid.append(node("span", "calendar-weekday", label));
    }
    for (let i = 0; i < calendarMonth.getDay(); i++) grid.append(node("span"));
    for (
      const date = new Date(calendarMonth);
      date.getMonth() === month;
      date.setDate(date.getDate() + 1)
    ) {
      const key = dateKey(date);
      const entries = agendaEntries(key);
      const count = new Set(entries.map((id) => studyEntries.get(id).subject.id)).size;
      const day = node(
        "button",
        "calendar-day" + (count ? " has-plan" : ""),
        String(date.getDate()),
      );
      day.type = "button";
      day.dataset.day = key;
      day.setAttribute(
        "aria-label",
        dayFormat.format(date) +
          (count
            ? ", " + count + " " + (count === 1 ? "matéria na agenda" : "matérias na agenda")
            : ""),
      );
      if (count) {
        const marks = node("span", "calendar-subject-marks");
        marks.setAttribute("aria-hidden", "true");
        for (let i = 0; i < Math.min(count, 4); i++) marks.append(node("i"));
        if (count > 4) marks.append(node("span", "", "+" + (count - 4)));
        day.append(marks);
        day.title = entries
          .map((id) => {
            const { subject, topic } = studyEntries.get(id);
            const status = studyHistory[key]?.includes(id) ? " · Estudado" : "";
            return studyGroup(subject) + (topic ? " — " + topic.title : "") + status;
          })
          .join("\n");
      }
      day.setAttribute("aria-pressed", String(key === selectedCalendarDay));
      if (key === today) day.setAttribute("aria-current", "date");
      day.addEventListener("click", () => {
        selectCalendarDay(key);
        grid.querySelector('[data-day="' + key + '"]').focus({ preventScroll: true });
      });
      grid.append(day);
    }
    $("calendar-day-title").textContent = dayFormat.format(calendarDate(selectedCalendarDay));
    const key = selectedCalendarDay;
    const list = $("calendar-list");
    const ids = agendaEntries(key);
    list.replaceChildren();
    $("calendar-empty").hidden = ids.length > 0;
    for (const id of ids) {
      const row = node("li");
      const { subject, topic, title } = studyEntries.get(id);
      const recorded = studyHistory[key]?.includes(id);
      const link = node("a", "", title);
      const section = subject.exam ? "#vestibulares/" + subject.exam : "#materias";
      link.href = section + "/" + subject.id + (topic ? "/" + topic.id : "");
      const details = node("small");
      const group = topic || subject.exam ? studyGroup(subject) : "Matéria inteira";
      link.append(details);
      if (recorded) {
        row.classList.add("is-done");
        details.textContent = group + " · Estudado";
        row.append(link);
        list.append(row);
        continue;
      }
      const check = node("input");
      check.type = "checkbox";
      check.setAttribute("aria-label", "Estudei nesta data: " + title);
      check.checked = calendarDone[key]?.includes(id) || false;
      function updateStatus() {
        const overdue = key < dateKey(new Date()) && !check.checked;
        row.classList.toggle("is-overdue", overdue);
        row.classList.toggle("is-done", check.checked);
        details.textContent =
          group + (check.checked ? " · Estudado" : overdue ? " · Não estudado" : " · A estudar");
      }
      updateStatus();
      check.addEventListener("change", () => {
        const completed = calendarDone[key] || [];
        const next = check.checked ? [...completed, id] : completed.filter((entry) => entry !== id);
        if (next.length) calendarDone[key] = next;
        else delete calendarDone[key];
        updateStatus();
        save();
      });
      const label = node("label", "agenda-check");
      label.append(check);
      const entry = node("div", "agenda-entry");
      entry.append(label, link);
      const remove = node("button", "btn", "Remover");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remover " + title + " deste dia");
      remove.addEventListener("click", () => {
        toggleCalendarItem(id, selectedCalendarDay);
        $("calendar-plan").focus({ preventScroll: true });
      });
      row.append(entry, remove);
      list.append(row);
    }
  }

  function agendaEntries(key) {
    return [...new Set([...(calendarPlans[key] || []), ...(studyHistory[key] || [])])];
  }

  function studyGroup(subject) {
    return subject.exam ? exams[subject.exam].name + " · " + subject.title : subject.title;
  }

  function recordStudy(id, day, studied) {
    const previous = studyHistory[day] || [];
    const next = studied ? [...new Set([...previous, id])] : previous.filter((entry) => entry !== id);
    if (next.length) studyHistory[day] = next;
    else delete studyHistory[day];
  }

  // Mostra os botões + enquanto um dia está sendo planejado.
  function renderPlanButtons() {
    const planned = new Set(calendarPlans[planTarget] || []);
    if (planTarget) {
      $("calendar-target").textContent = "Planejando " + dayFormat.format(calendarDate(planTarget));
      $("calendar-count").textContent =
        [...planned].filter((id) => plannable.get(id).topic).length +
        " no dia · Abra uma matéria e use + nos tópicos";
    }
    for (const button of planButtons) {
      const id = button.dataset.planTopic,
        added = planned.has(id);
      button.hidden = !planTarget;
      button.textContent = added ? "✓" : "+";
      button.setAttribute("aria-pressed", String(added));
      button.setAttribute(
        "aria-label",
        (added ? "Remover " : "Adicionar ") +
          plannable.get(id).title +
          (added ? " deste dia" : " ao dia"),
      );
    }
  }
  function refreshCalendar() {
    if (currentPage === "calendar") renderCalendar();
    renderPlanButtons();
  }

  // Adiciona ou remove um tópico do planejamento de uma data.
  function toggleCalendarItem(id, key = planTarget) {
    if (!key) return;
    const previous = calendarPlans[key] || [];
    const next = previous.includes(id)
      ? previous.filter((entry) => entry !== id)
      : [...previous, id];
    if (next.length) calendarPlans[key] = next;
    else delete calendarPlans[key];
    if (previous.includes(id) && calendarDone[key]) {
      const done = calendarDone[key].filter((entry) => entry !== id);
      if (done.length) calendarDone[key] = done;
      else delete calendarDone[key];
    }
    save();
    refreshCalendar();
  }
  function stepCalendarMonth(offset) {
    const next = new Date(calendarMonth);
    next.setMonth(next.getMonth() + offset);
    selectCalendarDay(dateKey(next));
  }
  $("nav-calendar").addEventListener("click", () => {
    location.hash = "planejamento/" + (planTarget || selectedCalendarDay);
  });
  $("calendar-prev").addEventListener("click", () => stepCalendarMonth(-1));
  $("calendar-next").addEventListener("click", () => stepCalendarMonth(1));
  $("calendar-today").addEventListener("click", () => selectCalendarDay(dateKey(new Date())));
  $("calendar-plan").addEventListener("click", () => {
    location.hash = "materias/planejar/" + selectedCalendarDay;
  });
  $("calendar-finish").addEventListener("click", () => {
    location.hash = "planejamento/" + planTarget;
  });

  const themeSwitch = $("theme-switch");
  themeSwitch.setAttribute("aria-checked", String(document.documentElement.dataset.theme === "dark"));
  themeSwitch.addEventListener("click", () => {
    const dark = themeSwitch.getAttribute("aria-checked") !== "true";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    themeSwitch.setAttribute("aria-checked", String(dark));
    try { localStorage.setItem("atlas-theme", document.documentElement.dataset.theme); } catch {}
  });

  const sidebar = $("atlas-sidebar");
  const sidebarTrigger = $("open-sidebar");
  function setSidebarOpen(open) {
    sidebar.inert = !open;
    document.body.classList.toggle("atlas-menu-open", open);
    sidebarTrigger.setAttribute("aria-expanded", String(open));
    sidebarTrigger.setAttribute("aria-label", open ? "Fechar menu lateral" : "Abrir menu lateral");
    sidebarTrigger.firstElementChild.textContent = open ? "\u2039" : "\u203a";
    $("sidebar-brand").setAttribute("aria-expanded", String(open));
    $("sidebar-brand").setAttribute("aria-label", "Atlas de Estudos, " + (open ? "fechar" : "abrir") + " menu lateral");
    if (open) $("sidebar-study").focus({ preventScroll: true });
    else sidebarTrigger.focus({ preventScroll: true });
  }
  $("sidebar-brand").addEventListener("click", () => setSidebarOpen(sidebar.inert));
  sidebarTrigger.addEventListener("click", () => setSidebarOpen(sidebar.inert));
  $("sidebar-scrim").addEventListener("click", () => setSidebarOpen(false));
  sidebar.querySelectorAll(".sidebar-nav a").forEach((link) => {
    link.addEventListener("click", () => {
      if (matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sidebar.inert && !document.querySelector("dialog[open]")) {
      setSidebarOpen(false);
    }
  });
  $("sidebar-login").addEventListener("click", () => {
    const destino = $("sidebar-login").dataset.conta;
    if (destino) {
      window.location.assign(destino);
    } else {
      $("sidebar-login-status").textContent = "Para testar o login, inicie o servidor do protótipo.";
    }
  });

  const overviewSubjects = new Map(
    curriculum.filter(isVisibleSubject).map((subject) => [subject.id, subject]),
  );
  const subjectIcons = {
    matematica: "∑",
    fisica: "⚛︎",
    quimica: "⚗︎",
    biologia: "☘︎",
    geografia: "◎",
    historia: "◷",
    "portugues-gramatica-e-analise-linguistica": "Aa",
    literatura: "❧",
    "portugues-interpretacao-e-generos-textuais": "¶",
    ingles: "EN",
    filosofia: "◈",
    sociologia: "⁙",
  };
  let currentSubjectSpace = null;

  // Ilustrações em uma grade de 64 × 64 para manter a escala consistente entre os cards.
  const subjectCardArt = {
    matematica: ["#e5efd2", "#315d3b", "M46 15H19l13 17-13 17h27M46 15v7m0 20v7"],
    fisica: ["#daeaf0", "#21556b", "M54 32a22 9 0 1 0-44 0 22 9 0 1 0 44 0M43 51a22 9 60 1 0-22-38 22 9 60 1 0 22 38M21 51a22 9 -60 1 0 22-38 22 9 -60 1 0-22 38M34 32a2 2 0 1 0-4 0 2 2 0 1 0 4 0"],
    quimica: ["#eee2f3", "#624478", "M24 11h16m-13 0v15L13 48q-3 6 4 6h30q7 0 4-6L37 26V11M20 40h24m-17 6h1m10 3h1"],
    biologia: ["#dbeddb", "#24644b", "M14 50c2-24 16-40 39-39-1 25-15 42-36 35M14 50l28-28M23 40v-9m7 2h11"],
    geografia: ["#dbece6", "#28685e", "M53 32a21 21 0 1 0-42 0 21 21 0 1 0 42 0M32 11c-13 10-13 32 0 42m0-42c13 10 13 32 0 42M11 32h42M17 20c9 5 21 5 30 0M17 44c9-5 21-5 30 0"],
    historia: ["#f2e5cf", "#805928", "M13 24l19-12 19 12H13Zm4 28h30M13 56h38M19 29v19m9-19v19m8-19v19m9-19v19"],
    "portugues-gramatica-e-analise-linguistica": ["#f1e6c4", "#715620", "M10 48l11-29 11 29m-18-9h14m27-10v19m0-9a9 9 0 1 0-18 0 9 9 0 1 0 18 0"],
    literatura: ["#f0dde5", "#87496a", "M32 53c-7-5-14-7-23-5V16c8-2 15 0 23 6 8-6 15-8 23-6v32c-9-2-16 0-23 5Zm0-31v31M15 24c4 0 7 1 11 3m-11 6c4 0 7 1 11 3m12-9c4-2 7-3 11-3m-11 12c4-2 7-3 11-3"],
    "portugues-interpretacao-e-generos-textuais": ["#e5e7f5", "#505888", "M14 12h27l9 9v28H14V12Zm26 0v10h10M21 26h13m-13 8h22m-22 8h17"],
    ingles: ["#dcecf6", "#2e5c7c", "M11 15h42v29H31L20 53v-9h-9V15Zm14 10h-7v10h7m-7-5h5m8 5V25l8 10V25m7 10h1"],
    filosofia: ["#efe1d4", "#814c32", "M24 48h16m-12 6h8m-12-11v-4a16 16 0 1 1 16 0v4M32 9V5M13 17l-4-4m42 4 4-4M12 29H6m46 0h6M26 28l6 7 6-7m-6 7v8"],
    sociologia: ["#e0ebdc", "#47694a", "M39 21a7 7 0 1 0-14 0 7 7 0 1 0 14 0M19 47v-6a13 13 0 0 1 26 0v6H19Zm1-26a5 5 0 1 0-5 5m34 0a5 5 0 1 0-5-5M8 44v-6a9 9 0 0 1 9-9m39 15v-6a9 9 0 0 0-9-9"],
  };

  // Pranchas de caderno: cada camada tem desenho e movimento independentes.
  const plates = {
    matematica: ["M8 47H54M18 55V9M13 15Q31 76 51 15", "M10 49L49 12v37ZM27 43l16-16v16Z", "f(x)", "π"],
    fisica: ["M9 12h45M19 12l14 29m-14-29v28M38 45a6 6 0 1 0-12 0 6 6 0 1 0 12 0", "M4 34q7-29 14 0t14 0t14 0t14 0", "λ", "Δt"],
    quimica: ["M8 24l12-7 12 7v15l-12 7-12-7Zm24 0 12-7 12 7v15l-12 7-12-7M13 27v9m31-14 8 5", "M18 9l-4 40q0 12 10 8l6-48m-14 28h10M16 9h17", "OH", "H₂O"],
    biologia: ["M15 6c0 22 34 28 34 52M49 6c0 22-34 28-34 52M18 14h28M24 21h16m-14 22h12m-19 8h26", "M6 48q20-42 52-39Q49 45 6 48Zm0 0 39-29m-23 19 2-14m6 9 14-2", "DNA", "5′"],
    geografia: ["M3 51l18-28 9 12 10-23 21 39ZM15 32l6 2 4-4m9-5 7 2 4-5", "M32 5l8 22 18 5-22 8-4 19-7-23-19-4 22-7Z", "N", "23° S"],
    historia: ["M10 49h44M14 43h36M18 38h28M22 33h20M26 28h12M8 50l23-36 25 36", "M13 12q5-7 10 0v36q-5 9-10 0Zm10 1h28v34H23m7-24h14m-14 9h11", "XIV", "a.C."],
    literatura: ["M8 55q14-32 47-47-2 26-35 36m-12 11 36-36m-18 20 0-9", "M11 48q11-6 21 1 10-7 22-1V18q-12-4-22 4-10-8-21-4Zm21-26v27", "«", "»"],
    ingles: ["M8 11h47v28H29L16 50V39H8Z", "M12 18h36v24H36l-3 9-8-9H12Z", "Hi!", "Hey"],
    filosofia: ["M10 50h44M32 12v38m-23-29 46-6M14 21l-8 16h16Zm35-4-8 16h16Z", "M20 52v-8q-13-8-8-24 7-21 28-12 10 4 10 17l6 10h-8v9H33v8", "?", "∴"],
    sociologia: ["M11 18l21 12 21-16M32 30l14 20m-14-20L12 49m-1-31 1 31 34 1 7-36", "M7 50V37h10v13m6 0V25h10v25m6 0V12h10v38M4 54h52", "n", "%"],
    "portugues-gramatica-e-analise-linguistica": ["M32 9v13M10 35V23h44v12M5 42h12m9 0h12m10 0h12m-28-19v12", "M8 46l28-28 9 9-28 28-12 3Zm28-28 6-7 10 10-7 6", "Aa", "V"],
    "portugues-interpretacao-e-generos-textuais": ["M9 12h44v36H29l-13 9v-9H9Zm7 11h29m-29 9h19", "M36 29a13 13 0 1 0-26 0 13 13 0 1 0 26 0m-4 10 17 17", "¶", "“”"]
  };

  // Uma semente por matéria mantém a composição estável entre visitas.
  function illustrateSubject(host, subject, backdrop = false) {
    let seed = Array.from(subject.id).reduce((n, ch) => Math.imul(n, 31) + ch.charCodeAt(0) | 0, backdrop ? 73 : 11);
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const [paper, ink, main] = subjectCardArt[subject.id];
    const [left, right, a, b] = plates[subject.id];
    const motifs = [main, left, right, a, b];
    const count = backdrop ? 44 : 5 + Math.floor(random() * 4);
    const points = [];
    host.style.setProperty("--card-paper", paper);
    host.style.setProperty("--card-ink", ink);
    for (let i = 0; i < count; i++) {
      // Escolhe entre posições livres para espalhar os traços sem formar uma grade.
      let point, best = -1;
      for (let attempt = 0; attempt < 16; attempt++) {
        const x = i === 0 && !backdrop ? 30 + random() * 40 : 4 + random() * 92;
        const y = i === 0 && !backdrop ? 35 + random() * 26 : 6 + random() * 86;
        const distance = points.reduce((min, p) => Math.min(min, Math.hypot((x-p.x)*1.65, y-p.y)), Infinity);
        if (distance > best) { point = {x, y}; best = distance; }
      }
      points.push(point);
      const kind = i < 5 ? i : Math.floor(random() * motifs.length);
      const glyph = node("canvas", "atlas-glyph");
      glyph.width = glyph.height = 192;
      const ctx = glyph.getContext("2d");
      ctx.scale(3, 3);
      ctx.strokeStyle = ctx.fillStyle = ink;
      ctx.lineWidth = i === 0 ? 2.6 : 2;
      ctx.lineCap = ctx.lineJoin = "round";
      if (kind < 3) {
        ctx.stroke(new Path2D(motifs[kind]));
      } else {
        ctx.font = "italic bold 28px Georgia";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(motifs[kind], 32, 32, 61);
      }
      glyph.style.left = point.x + "%";
      glyph.style.top = point.y + "%";
      glyph.style.width = backdrop ? (24 + random()*105) + "px" : (i === 0 ? 38 : 10 + random()*15) + "%";
      glyph.style.setProperty("--angle", (random()*52-26) + "deg");
      glyph.style.setProperty("--spin", (random() > .5 ? 1 : -1)*(12+random()*30) + "deg");
      glyph.style.setProperty("--pace", (1.4+random()*1.3) + "s");
      glyph.style.opacity = backdrop ? .13 + random()*.22 : i === 0 ? 1 : .56 + random()*.4;
      if (backdrop && i % 3 === 0) {
        glyph.classList.add("ambient-glyph");
        glyph.style.setProperty("--drift-x", ((random() < .5 ? -1 : 1) * (15 + random() * 15)) + "px");
        glyph.style.setProperty("--drift-y", ((random() < .5 ? -1 : 1) * (9 + random() * 13)) + "px");
        glyph.style.setProperty("--drift-time", (7 + random() * 4) + "s");
        glyph.style.setProperty("--drift-delay", (-random() * 10) + "s");
      }
      host.append(glyph);
    }
  }
  function subjectIcon(subject) {
    const icon = node("span", "subject-space-icon", subjectIcons[subject.id] || subject.title[0]);
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function subjectProgress(subject) {
    const studied = subject.topics.filter((topic) => items[topic.id].studied).length;
    const total = subject.topics.length;
    const percent = total ? Math.round((100 * studied) / total) : 0;
    return { studied, total, percent };
  }

  function renderSubjectCards() {
    const grid = $("overview-grid");
    grid.replaceChildren();
    for (const subject of overviewSubjects.values()) {
      const { studied, total } = subjectProgress(subject);
      const card = node("a", "overview-card");
      card.href = "#visao-geral/" + subject.id;
      const colors = subjectCardArt[subject.id];
      const art = node("div", "overview-card-art");
      art.setAttribute("aria-hidden", "true");
      if (colors) {
        const [paper, ink] = colors;
        card.style.setProperty("--card-paper", paper);
        card.style.setProperty("--card-ink", ink);
        illustrateSubject(art, subject);
      } else {
        art.append(subjectIcon(subject));
      }
      card.append(art, node("h3", "", subject.title));
      if (total > 0 && studied === total) {
        const check = node("span", "overview-card-done", "✓");
        check.setAttribute("aria-hidden", "true");
        card.append(check, node("span", "sr-only", "Concluída"));
      }
      grid.append(card);
    }
  }

  function renderSubjectSpace(subject) {
    const space = $("subject-space");
    space.replaceChildren();
    if (plates[subject.id]) {
      const border = node("div", "subject-illustrated-border");
      border.setAttribute("aria-hidden", "true");
      illustrateSubject(border, subject, true);
      space.append(border);
    }
    const { studied, total, percent } = subjectProgress(subject);
    const back = node("a", "subject-space-back", "‹ Visão geral");
    back.href = "#visao-geral";
    const open = node("a", "btn subject-space-open", "Abrir no espaço de estudo");
    open.href = "#materias/" + subject.id;
    const actions = node("div", "subject-space-actions");
    actions.append(back, open);

    const ring = $("subject-space-ring");
    ring.textContent = percent + "%";
    ring.style.setProperty("--study-percent", percent + "%");
    $("subject-space-count").textContent = studied + " de " + total + " tópicos estudados";

    const grid = node("div", "subject-topic-grid");
    for (const topic of subject.topics) {
      const card = node("button", "subject-topic-card");
      const status = items[topic.id];
      card.type = "button";
      card.dataset.topic = topic.id;
      card.setAttribute("aria-haspopup", "dialog");
      card.append(node("span", "", topic.title));
      if (status.studied) {
        const check = node("span", "subject-topic-check", "✓");
        check.setAttribute("aria-hidden", "true");
        card.append(check, node("span", "sr-only", "Estudado"));
      }
      card.addEventListener("click", () => showSubjectTopic(subject, topic));
      grid.append(card);
    }
    space.append(actions, grid);

    const recent = subject.topics.flatMap((topic) =>
      (items[topic.id].training || []).map((entry) => ({ topic, entry })),
    ).sort((a, b) => Date.parse(b.entry.date) - Date.parse(a.entry.date)).slice(0, 7).reverse();
    if (recent.length) {
      const chart = node("details", "subject-space-chart");
      chart.append(node("summary", "", "Desempenho nos treinos"));
      const bars = node("div", "subject-training-bars");
      const result = node("p", "subject-training-result");
      result.setAttribute("aria-live", "polite");
      function selectTraining(index) {
        for (const [position, button] of [...bars.children].entries()) {
          button.setAttribute("aria-pressed", String(index === position));
        }
        const { topic, entry } = recent[index];
        result.textContent = topic.title + " · " + trainingDate.format(new Date(entry.date)) + " · " + trainingScore(entry);
      }
      for (const [index, { topic, entry }] of recent.entries()) {
        const score = Math.round((100 * entry.correct) / entry.attempted);
        const button = node("button", "subject-training-bar");
        button.type = "button";
        button.setAttribute("aria-label", topic.title + " · " + trainingScore(entry));
        const bar = node("span", "subject-training-fill");
        bar.style.setProperty("--score", score + "%");
        button.append(bar, node("span", "subject-training-label", score + "%"));
        button.addEventListener("click", () => selectTraining(index));
        bars.append(button);
      }
      chart.append(bars, result);
      selectTraining(recent.length - 1);
      space.append(chart);
    }
  }

  const subjectTopicDialog = $("subject-topic-dialog");
  const incidenceFormat = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  });

  function compactStars(value) {
    const rating = node("span", "subject-topic-stars");
    rating.setAttribute("role", "img");
    rating.setAttribute("aria-label", value ? value + " de 5 estrelas" : "Ainda sem avaliação");
    const filled = node("strong", "", "★".repeat(value));
    const empty = node("span", "", "☆".repeat(5 - value));
    rating.append(filled, empty);
    return rating;
  }

  function rankTopicIncidence(topicId) {
    const ranking = [];
    for (const [key, exam] of Object.entries(exams)) {
      // O TJSP ocupa uma seção separada no guia de estudos.
      if (key === "tjsp") continue;
      let count = 0;
      let total = 0;
      let primary = null;
      for (const subject of exam.subjects) {
        const matches = subject.topics.filter((topic) => topic.guideTopics?.includes(topicId));
        if (!matches.length || !subject.total) continue;
        total += subject.total;
        for (const topic of matches) {
          count += topic.count;
          if (!primary || topic.count > primary.topic.count) primary = { subject, topic };
        }
      }
      const share = count > 0 && total > 0 ? count / total : null;
      ranking.push({ key, name: exam.name, count, total, primary, share });
    }
    return ranking.sort(
      (a, b) => (b.share ?? -1) - (a.share ?? -1) || a.name.localeCompare(b.name, "pt-BR"),
    );
  }

  function showSubjectTopic(subject, topic) {
    const entry = items[topic.id];
    $("subject-topic-title").textContent = topic.title;
    $("subject-topic-status").textContent = entry.studied ? "Estudado" : "A estudar";
    $("subject-topic-mastery").replaceChildren(compactStars(entry.stars));
    $("subject-topic-level").textContent = names[topic.level];
    const contents = $("subject-topic-contents");
    contents.replaceChildren();
    for (const content of topic.contents || []) {
      const row = node("li");
      const rating = ratingControl(content.id, "overview-rating");
      const field = rating.radios[0].closest("fieldset");
      function displayRating() {
        const stars = items[content.id].stars;
        rating.radios.forEach((radio, i) => {
          radio.checked = stars === i + 1;
          rating.labels[i].classList.toggle("on", i < stars);
        });
      }
      field.addEventListener("change", event => {
        items[content.id].stars = Number(event.target.value);
        displayRating();
        changed(content.id);
      });
      displayRating();
      row.append(node("span", "", content.title), field);
      contents.append(row);
    }

    const ranking = rankTopicIncidence(topic.id);
    const highlights = $("subject-topic-highlights");
    highlights.textContent = ranking.filter(result => result.share !== null).slice(0, 3)
      .map(result => result.name + " " + incidenceFormat.format(result.share)).join(" \u00b7 ");
    highlights.hidden = !highlights.textContent;
    const list = $("subject-topic-ranking");
    list.replaceChildren();
    for (const result of ranking) {
      const row = node("li");
      if (result.share === null) {
        row.append(
          node("span", "", result.name),
          node("small", "", "Sem registro de incidência"),
        );
        list.append(row);
        continue;
      }
      const link = node("a", "", result.name);
      const { subject: examSubject, topic: examTopic } = result.primary;
      link.href = "#vestibulares/" + result.key + "/" + examSubject.id + "/" + examTopic.id;
      const percent = node("strong", "", incidenceFormat.format(result.share));
      const count = node("small", "", result.count + " de " + result.total + " questões");
      row.append(link, percent, count);
      list.append(row);
    }
    $("subject-topic-ranking-note").textContent =
      "Estimativa por disciplina na base de cada prova. Uma categoria pode cobrir vários tópicos.";
    $("subject-topic-open").href = "#materias/" + subject.id + "/" + topic.id;
    subjectTopicDialog.showModal();
  }
  $("subject-topic-open").addEventListener("click", () => subjectTopicDialog.close());
  $("subject-topic-ranking").addEventListener("click", (event) => {
    if (event.target.closest("a")) subjectTopicDialog.close();
  });

  // Troca a seção exibida conforme o endereço depois de #.
  function changePage() {
    const [page, chosen, guideTopics, examTopic] = location.hash.slice(1).split("/");
    const subjectSpace = page === "visao-geral" ? overviewSubjects.get(chosen) : null;
    currentSubjectSpace = subjectSpace;
    currentPage =
      page === "visao-geral"
        ? (subjectSpace ? "subject-space" : "overview")
        : page === "planejamento"
        ? "calendar"
        : page === "pendentes"
          ? "pending"
          : page === "vestibulares"
            ? "exams"
            : "subjects";
    if (currentPage === "exams" && exams[chosen]) selectedExam = chosen;
    if (currentPage === "pending") {
      pendingScope = Object.hasOwn(exams, chosen) ? chosen : "general";
      if (pendingScope !== "general" && pendingScope !== reviewExam) selectReview(pendingScope);
    }
    const pending = currentPage === "pending",
      examView = currentPage === "exams",
      calendarView = currentPage === "calendar",
      overviewView = currentPage === "overview";
    planTarget =
      page === "materias" && chosen === "planejar" && calendarDate(guideTopics)
        ? guideTopics
        : null;
    document.body.classList.toggle("plan-page", calendarView);
    document.body.classList.toggle("atlas-overview-page", overviewView || Boolean(subjectSpace));
    document.body.classList.toggle("atlas-subject-page", Boolean(subjectSpace));
    $("overview-subjects").hidden = !overviewView;
    $("subject-space").hidden = !subjectSpace;
    $("subject-space-ring").hidden = !subjectSpace;
    $("subject-space-count").hidden = !subjectSpace;
    if (subjectTopicDialog.open) subjectTopicDialog.close();
    const activeLink = overviewView || subjectSpace ? "sidebar-overview" : "sidebar-study";
    for (const id of ["sidebar-study", "sidebar-overview"]) {
      if (id === activeLink) $(id).setAttribute("aria-current", "page");
      else $(id).removeAttribute("aria-current");
    }
    $("calendar-panel").hidden = !calendarView;
    $("calendar-banner").hidden = !planTarget;
    if (calendarView) {
      selectedCalendarDay = calendarDate(chosen) ? chosen : selectedCalendarDay;
      calendarMonth = monthOf(calendarDate(selectedCalendarDay));
      renderCalendar();
    }
    renderPlanButtons();
    document.body.classList.toggle("pending-page", pending);
    document.body.classList.toggle("exam-view", examView);
    for (const [id, on] of [
      ["nav-subjects", currentPage === "subjects"],
      ["nav-pending", pending],
      ["nav-exams", examView],
      ["nav-calendar", calendarView],
    ]) {
      if (on) $(id).setAttribute("aria-current", "page");
      else $(id).removeAttribute("aria-current");
    }
    $("page-title").textContent = subjectSpace
      ? "Espaço de " + subjectSpace.title
      : overviewView
      ? "Visão geral"
      : calendarView
      ? "Planejamento"
      : pending
        ? "Pendentes"
        : examView
          ? "Estude por vestibular"
          : "Minhas matérias";
    $("plan-options").hidden = !pending;
    $("pending-scope-wrap").hidden = !pending;
    $("exam-section").hidden = !examView;
    if (examView) {
      const e = exams[selectedExam];
      $("exam-heading").textContent =
        e.name + " · " + e.subjects.filter(isVisibleSubject).length + " disciplinas exibidas";
      $("exam-period").textContent =
        e.period + " · " + e.total.toLocaleString("pt-BR") + " questões/itens na base original";
      $("exam-method").textContent = e.note;
      const papers = $("exam-papers");
      papers.replaceChildren();
      papers.hidden = !e.papers;
      for (const paper of e.papers || []) {
        const entry = node("li");
        const links = [
          ["Prova " + paper.edicao, paper.prova],
          ["gabarito definitivo", paper.gabarito],
          ["arquivo oficial", paper.oficial],
        ];
        for (const [label, url] of links) {
          if (!url) continue;
          if (entry.childNodes.length) entry.append(document.createTextNode(" · "));
          const link = node("a", "", label);
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener";
          entry.append(link);
        }
        if (paper.redacao)
          entry.append(
            document.createTextNode(
              " · Redação sobre " + paper.redacao.toLocaleLowerCase("pt-BR") + ".",
            ),
          );
        papers.append(entry);
      }
      $("exam-source").href = e.source;
      for (const button of document.querySelectorAll("[data-exam]"))
        button.setAttribute("aria-pressed", String(button.dataset.exam === selectedExam));
    }
    $("search").value = "";
    $("filter").value = "all";
    stats();
    filter();
    if (calendarView || overviewView || subjectSpace || planTarget) {
      $("page-title").focus();
    }
    if (examView && guideTopics) {
      const subject = activeSubjects().find((view) => view.s.id === guideTopics);
      if (subject) {
        setOpen(subject, true);
        const topic = subject.topics.find((view) => view.t.id === examTopic);
        (topic?.row || subject.article).scrollIntoView({ block: "start" });
      }
    }
    if (page === "materias" && chosen && !planTarget) {
      const subject = activeSubjects().find((view) => view.s.id === chosen);
      if (subject) {
        setOpen(subject, true);
        const destinations = (guideTopics || "")
          .split(",")
          .map((id) => subject.topics.find((view) => view.t.id === id && view.t.contents))
          .filter(Boolean);
        for (const topic of destinations) {
          ensureContents(topic);
          filterContents(topic);
          topic.details.open = true;
        }
        const first = destinations[0];
        (first?.summary || subject.toggle).focus({ preventScroll: true });
        (first?.row || subject.article).scrollIntoView({ block: "start" });
      }
    }
  }

  // Atualiza a tela e salva após uma marcação do estudante.
  function changed(id) {
    const focused = document.activeElement;
    paint(id);
    stats();
    save();
    filter();
    if (focused?.isConnected && focused.getClientRects().length)
      focused.focus({ preventScroll: true });
    else if (records.get(id).kind === "content") {
      const parent = records.get(id).parent,
        tv = subjects.flatMap((s) => s.topics).find((t) => t.t.id === parent);
      if (tv && !tv.row.hidden) {
        tv.summary.focus({ preventScroll: true });
      } else $("page-title").focus({ preventScroll: true });
    }
  }
  $("subjects").addEventListener("change", (e) => {
    const target = e.target;
    if (target.dataset.check) {
      const id = target.dataset.check;
      items[id].studied = target.checked;
      if (studyEntries.has(id)) {
        const today = dateKey(new Date());
        recordStudy(id, today, target.checked);
        syncDemo?.enqueue({ id, day: today, studied: target.checked });
      }
      changed(id);
    } else if (target.dataset.rating) {
      const id = target.dataset.rating;
      items[id].stars = Number(target.value);
      changed(id);
    }
  });
  $("subjects").addEventListener("click", (e) => {
    const pin = e.target.closest("button[data-pin]");
    if (pin) {
      const id = pin.dataset.pin;
      items[id].pinned = !items[id].pinned;
      items[id].pinnedAt = items[id].pinned
        ? Math.max(Date.now(), ...Object.values(items).map((v) => (v.pinnedAt || 0) + 1))
        : 0;
      changed(id);
      if (items[id].pinned) {
        const target = views.get(id).pin;
        if (target.getClientRects().length)
          target.scrollIntoView({
            block: "nearest",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          });
      }
      toast(items[id].pinned ? "Prioridade no topo da lista." : "Prioridade removida.");
      return;
    }
    const clear = e.target.closest("button[data-clear]");
    if (clear) {
      const id = clear.dataset.clear;
      items[id].stars = 0;
      changed(id);
      const first = views.get(id).rating.radios[0];
      first.focus();
      return;
    }
    const toggle = e.target.closest("button[data-toggle]");
    if (toggle) {
      const sv = subjects.find((s) => s.s.id === toggle.dataset.toggle);
      const current = toggle.getAttribute("aria-expanded") === "true";
      setOpen(sv, !current);
    }
  });
  $("nav-subjects").addEventListener("click", () => {
    location.hash = "materias";
  });
  $("nav-pending").addEventListener("click", () => {
    const k = scope();
    location.hash = "pendentes" + (k === "general" ? "" : "/" + k);
  });
  $("nav-exams").addEventListener("click", () => {
    location.hash = "vestibulares/" + selectedExam;
  });
  $("exam-section").addEventListener("click", (e) => {
    const b = e.target.closest("[data-exam]");
    if (b) location.hash = "vestibulares/" + b.dataset.exam;
  });
  window.addEventListener("hashchange", changePage);
  $("only-pinned").addEventListener("change", filter);
  $("search").addEventListener("input", filter);
  $("filter").addEventListener("change", filter);
  $("expand").addEventListener("click", () =>
    activeSubjects()
      .filter((s) => !s.article.hidden)
      .forEach((s) => setOpen(s, true)),
  );
  $("collapse").addEventListener("click", () => activeSubjects().forEach((s) => setOpen(s, false)));

  // Exportação e restauração do progresso em arquivos de backup.
  $("export").addEventListener("click", () => {
    const data = snapshot(),
      blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a"),
      date = new Date();
    a.href = url;
    a.download =
      "meu-progresso-" +
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0") +
      ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Backup baixado. Guarde esse arquivo para restaurar suas marcações.");
  });
  $("import").addEventListener("click", () => {
    $("backup-file").value = "";
    $("backup-file").click();
  });
  $("backup-file").addEventListener("change", async () => {
    const file = $("backup-file").files[0];
    if (!file) return;
    try {
      if (file.size > 12_000_000)
        throw new Error("O arquivo é muito grande para ser um backup deste checklist.");
      const data = JSON.parse(await file.text());
      if (
        data.app !== "atlas-checklist" ||
        data.schema !== 1 ||
        !data.items ||
        typeof data.items !== "object"
      )
        throw new Error("Este arquivo não é um backup válido do checklist.");
      const accepted = Object.create(null);
      for (const id of records.keys()) {
        if (Object.prototype.hasOwnProperty.call(data.items, id)) {
          if (!validItem(data.items[id]))
            throw new Error("O backup contém uma marcação inválida. Nenhum dado foi alterado.");
          accepted[id] = normalizeItem(data.items[id]);
        }
      }
      const values = Object.values(accepted);
      if (!values.length)
        throw new Error("O backup não tem conteúdos reconhecidos neste checklist.");
      pendingRestore = {
        items: accepted,
        calendarPlans: Object.hasOwn(data, "calendarPlans")
          ? readCalendarPlans(data.calendarPlans)
          : null,
      };
      pendingRestore.calendarDone = readCalendarPlans(
        data.calendarDone,
        pendingRestore.calendarPlans || {},
      );
      if (Object.hasOwn(data, "studyHistory")) {
        pendingRestore.studyHistory = readCalendarPlans(data.studyHistory, null, studyEntries);
      }
      const checked = values.filter((v) => v.studied).length,
        rated = values.filter((v) => v.stars > 0).length;
      $("restore-summary").textContent =
        "Backup com " +
        values.length +
        " registros reconhecidos: " +
        checked +
        " marcados como estudados e " +
        rated +
        " com estrelas. " +
        (pendingRestore.calendarPlans
          ? "O calendário deste backup também substituirá o calendário atual. "
          : "") +
        "Você quer restaurar este backup?";
      $("restore-dialog").showModal();
    } catch (e) {
      notice(
        e instanceof SyntaxError
          ? "Não foi possível ler o arquivo. Escolha um backup .json criado por este checklist."
          : e.message,
        true,
      );
    }
  });
  $("cancel-restore").addEventListener("click", () => {
    pendingRestore = null;
    $("restore-dialog").close();
  });
  $("restore-dialog").addEventListener("cancel", () => (pendingRestore = null));
  $("confirm-restore").addEventListener("click", () => {
    if (!pendingRestore) return;
    for (const [id, v] of Object.entries(pendingRestore.items)) items[id] = { ...items[id], ...v };
    if (pendingRestore.calendarPlans) {
      calendarPlans = pendingRestore.calendarPlans;
      calendarDone = pendingRestore.calendarDone;
    }
    if (pendingRestore.studyHistory) studyHistory = pendingRestore.studyHistory;
    refreshCalendar();
    pendingRestore = null;
    $("restore-dialog").close();
    for (const id of records.keys()) paint(id);
    stats();
    save();
    filter();
    toast("Seu progresso foi restaurado.");
  });
  $("print").addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", () => {
    for (const sv of activeSubjects())
      if (!sv.article.hidden)
        for (const tv of sv.topics)
          if (!tv.row.hidden) {
            ensureContents(tv);
            filterContents(tv);
          }
  });

  // Atualiza a página quando outra aba salva uma alteração.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const data = JSON.parse(e.newValue);
      if (data.app !== "atlas-checklist" || data.schema !== 1 || !data.items) return;
      for (const id of records.keys())
        if (validItem(data.items[id])) items[id] = normalizeItem(data.items[id]);
      for (const id of records.keys()) paint(id);
      calendarPlans = readCalendarPlans(data.calendarPlans);
      calendarDone = readCalendarPlans(data.calendarDone, calendarPlans);
      studyHistory = readCalendarPlans(data.studyHistory, null, studyEntries);
      refreshCalendar();
      if (trainingDialog.open) renderTrainingHistory();
      if (overviewDialog.open) renderOverview();
      stats();
      filter();
      $("save-status").textContent = "Progresso atualizado de outra aba";
    } catch {}
  });
  for (const id of records.keys()) paint(id);
  stats();
  changePage();
  if (lastSaved) $("save-status").textContent = "Progresso recuperado deste navegador";
  if (!storageOK) $("save-status").textContent = "Salve um backup antes de fechar";
  syncDemo?.start((changes) => {
    for (const { id, day, studied } of changes) {
      if (!studyEntries.has(id) || !calendarDate(day) || typeof studied !== "boolean") continue;
      items[id].studied = studied;
      recordStudy(id, day, studied);
      paint(id);
    }
    save();
    stats();
    filter();
    refreshCalendar();
  });
  // O trilho acompanha os painéis mesmo quando eles passam a ocupar duas linhas.
  const hero = document.querySelector("header.hero");
  const sky = hero.querySelector(".atlas-sky");
  const dashboard = hero.querySelector(".exam-dashboard");
  const legend = hero.querySelector(".legend");
  function positionSky() {
    const bounds = hero.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const panel = dashboard.getBoundingClientRect();
    const note = legend.getBoundingClientRect();
    const points = [
      [Math.max(9, note.left - bounds.left - 20), Math.min(bounds.height - 9, note.bottom - bounds.top + 8)],
      [bounds.width * .43, Math.max(16, bounds.height * .075)],
      [panel.left - bounds.left + 18, panel.bottom - bounds.top - 12],
      [Math.min(panel.right - bounds.left, bounds.width - 39), Math.max(38, panel.top - bounds.top - 30)],
    ];
    sky.setAttribute("viewBox", [0, 0, bounds.width, bounds.height].join(" "));
    sky.querySelectorAll(".sky-line").forEach((line, i) => {
      line.setAttribute("d", "M" + points[i].join(" ") + " L" + points[i + 1].join(" "));
    });
    sky.querySelector(".sky-destination").setAttribute("transform", "translate(" + points[3].join(" ") + ")");
  }
  positionSky();
  const skyObserver = new ResizeObserver(positionSky);
  [hero, dashboard, legend].forEach(element => skyObserver.observe(element));})();
