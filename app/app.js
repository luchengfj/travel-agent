/* 行旅 PWA —— 零依赖、零构建。
 * 行为规则不在前端：travel-agent.md 是唯一真值源，由 Worker 注入 system prompt。
 * 前端只负责：对话收发、极简 Markdown 渲染、历史、设置、Demo、离线外壳、错误处理。
 * 铁律：LLM 不可用/离线时，前端明确报错并保留历史，绝不编造一份像样的计划。
 */
(function () {
  "use strict";

  var LS = {
    CONVS: "xinglv.convs.v1",
    CURRENT: "xinglv.current.v1",
    WORKER: "xinglv.worker.v1",
    BRIDGE_TOKEN: "xinglv.bridge.v1",
  };

  // localStorage 在 file:// / 隐私模式 / 部分 standalone 下会抛 SecurityError，
  // 全部走带 try/catch 的包装，坏掉时退化为「本次会话内可用」而非整页崩。
  function getLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function delLS(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var $ = function (id) { return document.getElementById(id); };
  var chat = $("chat");
  var input = $("input");
  var form = $("composer-form");
  var sendBtn = $("btn-send");
  var modeBtn = $("btn-mode");
  var settingsStatus = $("settings-status");

  var convs = loadJSON(LS.CONVS, []);
  var currentId = getLS(LS.CURRENT) || null;
  var workerUrl = getLS(LS.WORKER) || "";
  var deferredInstall = null;
  var sending = false;

  /* ---------- 存储 ---------- */
  function loadJSON(key, fallback) {
    try { var v = JSON.parse(getLS(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function saveConvs() {
    setLS(LS.CONVS, JSON.stringify(convs));
  }
  function currentConv() {
    var c = convs.find(function (x) { return x.id === currentId; });
    if (!c) {
      c = { id: "c" + Date.now(), title: "新对话", updated: Date.now(), messages: [] };
      convs.unshift(c);
      currentId = c.id;
      setLS(LS.CURRENT, currentId);
      saveConvs();
    }
    return c;
  }
  function touch(c) { c.updated = Date.now(); saveConvs(); }

  /* ---------- 极简 Markdown 渲染 ---------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function inline(s) {
    // 输入已 escape 过；这里只加标签
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }
  function isTableSep(line) {
    var t = line.trim();
    if (t.indexOf("|") < 0 || t.indexOf("-") < 0) return false;
    return /^\|?[\s:\-|]+\|?$/.test(t);
  }
  function splitRow(line) {
    var t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return t.split("|").map(function (c) { return c.trim(); });
  }
  function renderMarkdown(src) {
    var lines = String(src || "").split(/\r?\n/);
    var out = [], i = 0;
    while (i < lines.length) {
      var line = lines[i];

      // 表格：当前行含 | 且下一行是分隔行
      if (line.indexOf("|") >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var head = splitRow(line);
        i += 2;
        var body = [];
        while (i < lines.length && lines[i].trim().indexOf("|") >= 0 && lines[i].trim() !== "") {
          body.push(splitRow(lines[i])); i++;
        }
        var h = "<div class=\"table-wrap\"><table><thead><tr>";
        head.forEach(function (c) { h += "<th>" + inline(esc(c)) + "</th>"; });
        h += "</tr></thead><tbody>";
        body.forEach(function (row) {
          h += "<tr>";
          // 缺列补齐，多列截断，避免表格错位
          for (var k = 0; k < head.length; k++) h += "<td>" + inline(esc(row[k] || "")) + "</td>";
          h += "</tr>";
        });
        h += "</tbody></table></div>";
        out.push(h);
        continue;
      }

      // 回答外壳：(当前：plan) 一句话结论：……
      if (/^\s*\(当前[：:]/.test(line)) {
        var m = line.match(/当前[：:]\s*([A-Za-z]+)/);
        var tag = m ? "<span class=\"mode-tag\">" + esc(m[1]) + "</span>" : "";
        var rest = esc(line.replace(/^\s*\(当前[：:][^)]*\)?\s*/, ""));
        out.push("<div class=\"shell\">" + tag + inline(rest) + "</div>");
        i++; continue;
      }

      // ⚠️ / > 引用（待核实清单等）
      if (/^\s*(⚠️|⚠|>)/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*(⚠️|⚠|>)/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*(>|\s*)/, "").replace(/^\s*(⚠️|⚠)\s*/, ""));
          i++;
        }
        out.push("<blockquote class=\"warn\">" + quote.map(function (q) { return inline(esc(q)); }).join("<br>") + "</blockquote>");
        continue;
      }

      // 标题
      var hm = line.match(/^(#{1,3})\s+(.*)$/);
      if (hm) { var lv = hm[1].length; out.push("<h" + lv + ">" + inline(esc(hm[2])) + "</h" + lv + ">"); i++; continue; }

      // 分隔线
      if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

      // 列表
      if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
        var ordered = /^\s*\d+[.)]\s+/.test(line);
        var items = [];
        while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*]|\d+[.)])\s+/, ""));
          i++;
        }
        out.push("<" + (ordered ? "ol" : "ul") + ">" + items.map(function (it) { return "<li>" + inline(esc(it)) + "</li>"; }).join("") + "</" + (ordered ? "ol" : "ul") + ">");
        continue;
      }

      // 空行
      if (line.trim() === "") { i++; continue; }

      // 普通段落：合并连续非空行
      var para = [];
      while (i < lines.length && lines[i].trim() !== "" &&
             !/^(#{1,3})\s/.test(lines[i]) && !/^\s*(⚠️|⚠|>)/.test(lines[i]) &&
             !/^\s*([-*]|\d+[.)])\s+/.test(lines[i]) &&
             !/^\s*(---+|\*\*\*+)\s*$/.test(lines[i]) &&
             !/^\s*\(当前[：:]/.test(lines[i]) &&
             !(lines[i].indexOf("|") >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
        para.push(lines[i]); i++;
      }
      if (para.length) out.push("<p>" + para.map(function (p) { return inline(esc(p)); }).join("<br>") + "</p>");
      else i++; // 防死循环
    }
    return out.join("\n");
  }

  /* ---------- 消息渲染 ---------- */
  function addBubble(role, rawOrHtml, opts) {
    opts = opts || {};
    var wrap = document.createElement("div");
    wrap.className = "msg " + role;
    var who = document.createElement("div");
    who.className = "who";
    who.textContent = role === "user" ? "你" : (role === "error" ? "出错" : (role === "system" ? "提示" : "行旅"));
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    if (opts.error) bubble.style.background = "#FBE9E4";
    var md = document.createElement("div");
    md.className = "md";
    if (opts.html) md.innerHTML = rawOrHtml;
    else md.innerHTML = renderMarkdown(rawOrHtml);
    bubble.appendChild(md);
    if (role === "assistant" && !opts.noCollapse) enableCollapse(bubble, md);
    wrap.appendChild(who); wrap.appendChild(bubble);
    chat.appendChild(wrap);
    scrollBottom();
    return wrap;
  }
  function enableCollapse(bubble, md) {
    // 长回复折叠：超过阈值才启用
    if (md.innerHTML.length < 1600) return;
    bubble.classList.add("collapsible", "collapsed");
    bubble.addEventListener("click", function (e) {
      if (e.target.classList.contains("btn-expand")) return;
      if (bubble.classList.contains("collapsed")) bubble.classList.remove("collapsed");
    });
    var btn = document.createElement("button");
    btn.className = "btn-expand"; btn.type = "button"; btn.textContent = "展开全文";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var on = bubble.classList.toggle("collapsed");
      btn.textContent = on ? "展开全文" : "收起";
    });
    md.parentNode.insertBefore(btn, md.nextSibling);
  }
  function scrollBottom() { chat.scrollTop = chat.scrollHeight; }

  function renderConversation() {
    chat.innerHTML = "";
    var c = currentConv();
    if (!c.messages.length) { showDemoIntro(false); return; }
    c.messages.forEach(function (m) {
      if (m.role === "assistant" && m.demo) { addBubble("assistant", m.content, { html: true }); }
      else addBubble(m.role, m.content);
    });
  }

  /* ---------- Demo 模式（静态已核实成品，非实时生成） ---------- */
  function demoIntroHtml(fromOffline) {
    // 注意：这条横幅必须和顶栏的模式芯片说同一件事。
    // 桥连通时还挂着「Demo 模式：没连 LLM」会自相矛盾（实测截图抓到过），
    // 所以 lead 也要按连接状态分流，只有真的没连才自称 Demo。
    var lead = bridge
      ? "本机桥已连接（当前模型 " + esc(bridge.model || "DSH 默认") + "）。下面这份是仓库里已核实的静态样例，先看格式用——直接发消息就会实时生成，不会再给样例。"
      : (pairNeeded
        ? "这台设备还没配对（隧道已通，但没拿会话令牌）。先在设置里输入电脑上显示的 6 位配对码——下面这份是静态样例，不是给本次输入生成的。"
        : (fromOffline
          ? "当前离线，未调用 LLM。下面是仓库里已核实的静态样例（非实时生成）："
          : "Demo 模式：没连 LLM，展示的是仓库里已核实、已上 CI 的静态成品（样例，非本次生成）。"));
    var howTo = bridge
      ? "本机桥已连接，直接发消息即可用当前模型。"
      : (pairNeeded
        ? "在 ⚙ 设置里输入配对码，配对后就能用 DSH 当前模型。"
        : (isLoopbackOrigin()
          ? "本机桥没起来（DSH 未运行或插件未装），可在 ⚙ 设置里填 Worker 地址。"
          : "要实时生成，请在 ⚙ 设置里填 Worker 地址；若在本机打开 http://127.0.0.1 的页面，则自动用当前模型。"));
    return "<blockquote class=\"warn\">" + esc(lead) + "</blockquote>" +
      "<div class=\"shell\"><span class=\"mode-tag\">plan</span>一句话结论：桂林阳朔 3 天 2 夜，2 人，总预算 ¥3000，走均衡档 2 人 ¥2,758 / 人均 ¥1,379，余 ¥242。</div>" +
      "<p>要点：<strong>三档骨架</strong>（省钱 ¥2,006 / 均衡 ¥2,758 / 深度 ¥3,660）、<strong>逐日表</strong>、<strong>⚠️ 待核实清单</strong>，每个数字可加总、查不到就如实标注。</p>" +
      "<p>点下面按钮看完整成品与图卡；" + esc(howTo) + "</p>";
  }
  function showDemoIntro(fromOffline) {
    addBubble("assistant", demoIntroHtml(fromOffline), { html: true, noCollapse: true });
    addSampleButton();
  }
  function addSampleButton() {
    var last = chat.lastElementChild;
    if (!last) return;
    var b = document.createElement("button");
    b.className = "btn-sample"; b.type = "button";
    b.textContent = "📄 查看完整样例成品 + 图卡（非本次生成）";
    b.addEventListener("click", openGallery);
    last.querySelector(".bubble").appendChild(b);
  }
  function demoAnswer(userText) {
    // 明确告知这是样例、不是针对本次输入的实时计划；绝不编造一份像样的计划。
    addBubble("assistant",
      "<blockquote class=\"warn\">Demo 模式没有连 LLM，因此<strong>不会</strong>针对「" + esc(userText.slice(0, 40)) + "」生成一份新计划——那样等于编数字。下面是已核实的静态样例（非本次生成）。</blockquote>" +
      "<p>要看完整样例请点下方按钮；要实时生成，请在 ⚙ 设置里填 Worker 地址并「连接并保存」，或从本机桥的 http://127.0.0.1 地址打开本页（会自动用当前模型）。</p>",
      { html: true, noCollapse: true });
    addSampleButton();
  }

  /* ---------- 样例画廊 ---------- */
  var galleryLoaded = false;
  function openGallery() {
    showPanel("gallery-panel", "gallery-mask");
    if (galleryLoaded) return;
    var body = $("gallery-body");
    body.innerHTML = "<p class=\"gallery-note\">正在载入静态样例…</p>";
    fetch("sample-plan.md").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (txt) {
      body.innerHTML = "<div class=\"md\">" + renderMarkdown(txt) + "</div>" +
        "<p class=\"gallery-note\">以下为已渲染的静态图卡（样例，非本次生成）：</p>" +
        "<img class=\"gallery-card\" src=\"sample-plan-card.png\" alt=\"桂林阳朔 3 天 2 夜行程图卡（样例）\">";
      galleryLoaded = true;
    }).catch(function (e) {
      body.innerHTML = "<p class=\"gallery-note\">样例载入失败：" + esc(e.message) + "（可离线回看已缓存内容）</p>";
    });
  }

  /* ---------- Live 模式 ----------
   * 两种后端，请求/响应形态不同，但前端只暴露一个 sendToBackend()：
   *   桥（bridge）：页面本身由 DSH 插件从 127.0.0.1 发出 → 同源，
   *                直接打 OpenAI 兼容 /v1/chat/completions，token 从
   *                同源 /bridge-info.json 取（跨源 JS 读不到，故安全）。
   *   Worker：GitHub Pages 上的页面 → 打 {workerUrl}/api/chat。
   * 桥必须自己发页面，因为 https 页面根本连不上 http 的 127.0.0.1。
   */
  var bridge = null; // { token, provider, model, paired } —— 探测到才非空
  var pairNeeded = false; // 公网打不开：需要输入配对码
  var BRIDGE_HOSTS = { "127.0.0.1": 1, "localhost": 1, "[::1]": 1 };

  function isLoopbackOrigin() {
    try { return !!BRIDGE_HOSTS[location.hostname]; } catch (e) { return false; }
  }

  /** 本机页面直接带 token；公网页面只能拿会话令牌，且要先配对。 */
  function probeBridge() {
    // 不按 hostname 猜：桥在自己同源伺服页面，Pages 上没有这个端点（404 → null）。
    return fetch("bridge-info.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (info) {
        if (!info || !info.ok) return null;
        var meta = { provider: info.provider || "", model: info.model || "" };

        if (typeof info.token === "string") {
          // 本机直连：主 token 只在 loopback 下发；配对码也只在 loopback 出现。
          bridge = {
            token: info.token,
            provider: meta.provider,
            model: meta.model,
            paired: false,
            pairCode: typeof info.pairCode === "string" ? info.pairCode : "",
          };
          pairNeeded = false;
          return bridge;
        }

        if (info.auth === "pair") {
          var saved = getLS(LS.BRIDGE_TOKEN);
          if (saved) {
            bridge = { token: saved, provider: meta.provider, model: meta.model, paired: true };
            pairNeeded = false;
            return bridge;
          }
          pairNeeded = true;
          return null;
        }

        return null;
      })
      .catch(function () { return null; });
  }

  /** 用配对码换会话令牌；成功则落 localStorage（重启浏览器仍可用）。 */
  function pairWithCode(code) {
    return fetch("pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code }),
    })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok || !data || typeof data.token !== "string") {
            var e = (data && data.error) || {};
            throw new Error(e.message || ("HTTP " + res.status));
          }
          setLS(LS.BRIDGE_TOKEN, data.token);
          return probeBridge();
        });
      });
  }

  /** 统一返回 Promise<{ text }> 或 reject(Error)。 */
  function sendToBackend(messages) {
    if (bridge) {
      return fetch("v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + bridge.token,
        },
        body: JSON.stringify({ messages: messages }),
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok) {
            var e = (data && data.error) || {};
            var code = e.code || e.type;
            throw new Error(code ? (code + "：" + (e.message || "本机模型调用失败")) : ("HTTP " + res.status));
          }
          var choice = data && data.choices && data.choices[0];
          var content = choice && choice.message && choice.message.content;
          if (typeof content !== "string" || !content) throw new Error("本机模型没有返回文本");
          return { text: content };
        });
      });
    }

    var url = (workerUrl || "").replace(/\/+$/, "") + "/api/chat";
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages }),
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok || !data || typeof data.reply !== "string") {
          throw new Error((data && data.error) ? data.error : ("HTTP " + res.status));
        }
        return { text: data.reply };
      });
    });
  }

  function historyForApi(c, uptoIndex) {
    return c.messages.slice(0, uptoIndex).map(function (m) {
      return { role: m.role === "user" ? "user" : "assistant", content: m.content };
    });
  }
  function typedMessage(text) {
    var c = currentConv();
    c.messages.push({ role: "user", content: text, ts: Date.now() });
    if (c.title === "新对话") c.title = text.slice(0, 18);
    touch(c);
    addBubble("user", text);
  }
  function typingBubble() {
    var w = document.createElement("div");
    w.className = "msg assistant";
    w.id = "typing-bubble";
    w.innerHTML = "<div class=\"who\">行旅</div><div class=\"bubble\"><span class=\"typing\"><i></i><i></i><i></i></span> 生成中…</div>";
    chat.appendChild(w); scrollBottom();
  }
  function removeTyping() { var t = $("typing-bubble"); if (t) t.remove(); }

  function sendLive(text) {
    var c = currentConv();
    var idx = c.messages.length; // 本次 user 消息的位置
    typedMessage(text);
    sending = true; sendBtn.disabled = true;
    typingBubble();
    var timeout = new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error("请求超时（60 秒）")); }, 60000);
    });
    var call = sendToBackend(historyForApi(c, idx + 1));
    Promise.race([call, timeout]).then(function (r) {
      removeTyping();
      var reply = r.text;
      c.messages.push({ role: "assistant", content: reply, ts: Date.now() });
      touch(c);
      addBubble("assistant", reply);
    }).catch(function (e) {
      removeTyping();
      var offline = !navigator.onLine;
      addBubble("error",
        "<p><strong>没能拿到实时计划</strong>：" + esc(e.message || "未知错误") + "</p>" +
        "<p>已保留你的输入和历史，<strong>没有编造</strong>一份计划。请检查：" +
        (bridge ? "本机模型是否可用（DSH 是否在运行、当前模型是否配置好）" : "Worker 地址是否正确、Key 是否有效、网络是否通") +
        "；也可切回 Demo 看静态样例。</p>" +
        (offline ? "<p>当前离线，可先看已缓存的静态样例。</p>" : ""),
        { html: true, error: true, noCollapse: true });
      if (offline) addSampleButton();
    }).finally(function () {
      sending = false; sendBtn.disabled = false; input.focus();
    });
  }

  /* ---------- 发送入口 ---------- */
  function handleSend(text) {
    text = (text || "").trim();
    if (!text || sending) return;
    input.value = ""; autoGrow();
    if (!navigator.onLine) {
      // 离线：保留输入，明示未调用 LLM，给静态样例
      typedMessage(text);
      addBubble("system", "当前离线，未调用 LLM。下面的内容是静态样例（非实时生成）。", { noCollapse: true });
      showDemoIntro(true);
      return;
    }
    if (!bridge && !workerUrl) {
      typedMessage(text);
      if (pairNeeded) {
        // 隧道通了但没配对：明确要配对码，别假装成 Demo 或在线。
        addBubble("system", "这台设备还没配对。请在设置里输入电脑上显示的 6 位配对码，配对后才能用 DSH 当前模型。", { noCollapse: true });
        return;
      }
      demoAnswer(text);
      return;
    }
    sendLive(text);
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); handleSend(input.value); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); handleSend(input.value); }
  });
  function autoGrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; }
  input.addEventListener("input", autoGrow);
  $("quick-row").addEventListener("click", function (e) {
    var b = e.target.closest(".quick"); if (b) handleSend(b.getAttribute("data-q"));
  });

  /* ---------- 面板 ---------- */
  function showPanel(panelId, maskId) {
    closePanels();
    $(panelId).hidden = false;
    if (maskId) $(maskId).hidden = false;
  }
  function closePanels() {
    ["settings-panel", "history-panel", "gallery-panel"].forEach(function (id) { $(id).hidden = true; });
    ["panel-mask", "gallery-mask"].forEach(function (id) { $(id).hidden = true; });
  }
  $("btn-settings").addEventListener("click", function () {
    $("worker-url").value = workerUrl;
    settingsStatus.textContent = "";
    $("btn-install").hidden = !deferredInstall;
    refreshPairBlock();
    showPanel("settings-panel", "panel-mask");
  });
  $("btn-settings-close").addEventListener("click", closePanels);
  $("btn-gallery-close").addEventListener("click", closePanels);
  $("panel-mask").addEventListener("click", closePanels);
  $("gallery-mask").addEventListener("click", closePanels);

  $("btn-save").addEventListener("click", function () {
    var v = $("worker-url").value.trim().replace(/\/+$/, "");
    if (v && !/^https:\/\//i.test(v)) { settingsStatus.textContent = "请用 https:// 开头的 Worker 地址（PWA 在 HTTPS 下才允许请求）。"; return; }
    workerUrl = v;
    setLS(LS.WORKER, v);
    updateMode();
    settingsStatus.textContent = v
      ? "已保存。接下来发的消息会经你的 Worker 转发到真实 LLM。"
      : (bridge ? "已清空 Worker 地址，仍在本机桥模式（用当前模型）。" : "已清空，切回 Demo 模式。");
    closePanels();
    chat.innerHTML = "";
    if (!currentConv().messages.length) showDemoIntro(false); else renderConversation();
  });
  $("btn-demo").addEventListener("click", function () {
    workerUrl = ""; setLS(LS.WORKER, "");
    $("worker-url").value = ""; updateMode();
    // 桥连通时清掉 Worker 也不该自称「切回 Demo」——那样顶栏写着本机、状态栏写着 Demo。
    settingsStatus.textContent = bridge
      ? "已清空 Worker 地址，仍在本机桥模式（用当前模型）。"
      : "已切回 Demo 模式（不联网）。";
  });
  modeBtn.addEventListener("click", function () { $("btn-settings").click(); });
  function updateMode() {
    // 三种态：本机桥 > Worker > Demo。桥优先，因为它是「用当前 LLM」的那条路。
    if (bridge) {
      modeBtn.textContent = "模式：本机 " + (bridge.model || "当前模型");
      modeBtn.classList.add("live");
      modeBtn.classList.remove("bridge-local");
      modeBtn.title = "经由 DSH 当前模型（" + (bridge.provider || "?") + "：" + (bridge.model || "?") + "）"
        + (bridge.paired ? "　· 已配对的手机" : "");
      return;
    }
    if (pairNeeded) {
      // 公网隧道打开了，但这台设备还没配对：别谎称在线，也别退化成 Demo。
      modeBtn.textContent = "模式：待配对";
      modeBtn.classList.remove("live");
      modeBtn.title = "这台设备还没配对：在设置里输入电脑上显示的 6 位配对码";
      return;
    }
    var live = !!workerUrl;
    modeBtn.textContent = live ? "模式：在线" : "模式：Demo";
    modeBtn.classList.toggle("live", live);
    modeBtn.removeAttribute("title");
  }

  /* ---------- 配对（手机经隧道访问时用） ---------- */
  function refreshPairBlock() {
    var pairForm = $("pair-block");
    // 手机：需要输入配对码时才显示表单。
    if (pairForm) pairForm.hidden = !pairNeeded || !!bridge;
    // 电脑：把这次运行的配对码显示出来，手机要照着输。
    var show = $("pair-code-show");
    if (show) {
      var code = bridge && !bridge.paired ? (bridge.pairCode || "") : "";
      show.hidden = !code;
      var value = $("pair-code-value");
      if (value) value.textContent = code || "------";
    }
  }
  var pairBtn = $("btn-pair");
  if (pairBtn) {
    pairBtn.addEventListener("click", function () {
      var codeInput = $("pair-code");
      var status = $("pair-status");
      var code = (codeInput.value || "").trim();
      if (!/^\d{6}$/.test(code)) { status.textContent = "请输入 6 位数字配对码。"; return; }
      status.textContent = "正在配对…";
      pairBtn.disabled = true;
      pairWithCode(code)
        .then(function (info) {
          pairBtn.disabled = false;
          if (info) {
            status.textContent = "配对成功，已记住这台设备。";
            codeInput.value = "";
            updateMode(); refreshPairBlock();
            closePanels();
            chat.innerHTML = ""; renderConversation();
          } else {
            status.textContent = "配对码正确但拿不到令牌，请重试。";
          }
        })
        .catch(function (err) {
          pairBtn.disabled = false;
          status.textContent = "配对失败：" + (err && err.message ? err.message : "未知错误");
        });
    });
  }

  /* ---------- 历史 ---------- */
  $("btn-history").addEventListener("click", function () {
    renderHistory(); showPanel("history-panel", "panel-mask");
  });
  $("btn-history-close").addEventListener("click", closePanels);
  function renderHistory() {
    var list = $("history-list");
    var sorted = convs.slice().sort(function (a, b) { return b.updated - a.updated; });
    if (!sorted.length) { list.innerHTML = "<div class=\"hist-empty\">还没有历史对话</div>"; return; }
    list.innerHTML = "";
    sorted.forEach(function (c) {
      var d = document.createElement("div");
      d.className = "hist-item";
      var t = document.createElement("span"); t.className = "t"; t.textContent = c.title || "新对话";
      var n = document.createElement("span"); n.className = "n"; n.textContent = c.messages.length + " 条";
      d.appendChild(t); d.appendChild(n);
      d.addEventListener("click", function () {
        currentId = c.id; setLS(LS.CURRENT, c.id);
        closePanels(); renderConversation();
      });
      list.appendChild(d);
    });
  }
  $("btn-new").addEventListener("click", function () {
    var c = { id: "c" + Date.now(), title: "新对话", updated: Date.now(), messages: [] };
    convs.unshift(c); currentId = c.id;
    setLS(LS.CURRENT, c.id); saveConvs();
    closePanels(); renderConversation(); input.focus();
  });
  $("btn-clear").addEventListener("click", function () {
    if (!confirm("清空全部历史对话？此操作不可撤销。")) return;
    convs = []; currentId = null;
    delLS(LS.CURRENT); saveConvs();
    closePanels(); renderConversation();
  });

  /* ---------- 安装到主屏幕 ---------- */
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferredInstall = e;
  });
  $("btn-install").addEventListener("click", function () {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.then(function () { deferredInstall = null; $("btn-install").hidden = true; });
  });

  /* ---------- Service Worker ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* 离线外壳不可用不影响主流程 */ });
    });
  }

  /* ---------- 启动 ---------- */
  updateMode();
  renderConversation();
  autoGrow();
  // 页面若由本机桥发出，探测一次即可拿到 token 并切到「本机模型」模式；
  // 探测失败（比如从 GitHub Pages 打开）就保持 Worker / Demo 逻辑不变。
  probeBridge().then(function (info) {
    updateMode();
    refreshPairBlock();
    if (info) {
      settingsStatus.textContent = info.paired
        ? "已用配对令牌连上 DSH 当前模型：" + (info.model || "") + "（手机经隧道访问）。"
        : "已连上本机 DSH 当前模型：" + (info.model || "") + "（无需 Worker、无需 API Key）。";
      renderConversation();
    } else if (pairNeeded) {
      // 隧道可用但缺令牌：直接把设置面板打开到配对区，省得用户找。
      settingsStatus.textContent = "这台设备还没配对，请在上方输入配对码。";
    }
  });
})();
