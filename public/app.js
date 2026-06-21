/* CKNB · AI API 中转站 - 前端交互逻辑 */
(function () {
  "use strict";

  // 服务地址：用页面 URL 推导，自动适配 nginx 前缀（页面在 /ai/app 下，相对路径 fetch 即可）
  // base = 去掉 /app 后的前缀，如 http://host/ai
  var here = window.location.href.replace(/\/app\/?$/, "").replace(/\/$/, "");
  var base = here || window.location.origin;
  var openaiBase = base + "/v1";

  // 填充服务地址统计卡
  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  setText("statBase", base);
  setText("statOpenai", openaiBase);
  setText("statAnthropic", base);
  setText("statHealth", base + "/health");
  setText("statModels", base + "/v1/models");

  // 填充各示例代码里的 Base URL
  setText("anthBase", base);
  setText("anthBasePs", base);
  setText("anthBaseJson", base);
  setText("anthBaseCurl", base);
  setText("toolsBase", base);
  setText("toolsBaseOai", openaiBase);
  setText("thinkBase", base);

  var DEFAULT_CLAUDE = "claude-opus-4-8-20260101";

  // ============ 模型列表 ============
  var statusEl = document.getElementById("modelsStatus");
  var tableEl = document.getElementById("modelsTable");
  var bodyEl = document.getElementById("modelsBody");
  var filterEl = document.getElementById("modelFilter");
  var onlyClaude = document.getElementById("onlyClaude");
  var onlyOpenAI = document.getElementById("onlyOpenAI");
  var allModels = [];

  function isClaude(id) {
    return /claude|anthropic/i.test(id);
  }

  function rowHtml(m) {
    var id = m.id || m.name || "";
    var isDef = id === DEFAULT_CLAUDE;
    var claude = isClaude(id);
    var pill = claude
      ? '<span class="pill anthropic">Anthropic</span>'
      : '<span class="pill openai">OpenAI</span>';
    var def = isDef ? ' <span class="badge def">默认</span>' : "";
    var copyBtn =
      '<button class="copy-btn" onclick="navigator.clipboard.writeText(\'' +
      id +
      "').then(()=>{this.textContent='已复制✓';setTimeout(()=>this.textContent='复制',1200)})\">复制</button>";
    return (
      '<tr><td><code>' +
      id +
      "</code>" +
      def +
      "</td><td>" +
      pill +
      '</td><td style="color:var(--muted)">' +
      (m.name || id) +
      "</td><td>" +
      copyBtn +
      "</td></tr>"
    );
  }

  function render() {
    var kw = (filterEl.value || "").trim().toLowerCase();
    var wantClaude = onlyClaude.checked,
      wantOpenAI = onlyOpenAI.checked;
    var list = allModels.filter(function (m) {
      var id = (m.id || "").toLowerCase();
      if (kw && id.indexOf(kw) < 0) return false;
      var c = isClaude(m.id);
      if (wantClaude && !c) return false;
      if (wantOpenAI && c) return false;
      return true;
    });
    list.sort(function (a, b) {
      return (
        (b.id === DEFAULT_CLAUDE) - (a.id === DEFAULT_CLAUDE) ||
        String(a.id).localeCompare(String(b.id))
      );
    });
    bodyEl.innerHTML = list.map(rowHtml).join("");
    statusEl.textContent =
      "共 " +
      allModels.length +
      " 个模型，当前显示 " +
      list.length +
      " 个。默认模型：" +
      DEFAULT_CLAUDE;
    statusEl.className = "note ok";
    tableEl.style.display = list.length ? "table" : "none";
  }

  filterEl.addEventListener("input", render);
  onlyClaude.addEventListener("change", render);
  onlyOpenAI.addEventListener("change", render);

  // 加载模型列表（相对路径，自动带 nginx 前缀）
  fetch("v1/models")
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      allModels = Array.isArray(d && d.data) ? d.data : Array.isArray(d) ? d : [];
      if (!allModels.length) {
        statusEl.textContent = "未获取到模型";
        statusEl.className = "note err";
        return;
      }
      render();
    })
    .catch(function (e) {
      statusEl.textContent = "加载失败：" + e.message;
      statusEl.className = "note err";
    });

  // ============ 在线体验 Playground ============
  var sel = document.getElementById("pgModel");
  var input = document.getElementById("pgInput");
  var output = document.getElementById("pgOutput");
  var sendBtn = document.getElementById("pgSend");
  var streamChk = document.getElementById("pgStream");

  // 动态加载模型到下拉框
  fetch("v1/models")
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      var list = Array.isArray(d && d.data) ? d.data : Array.isArray(d) ? d : [];
      var cur = sel.value;
      sel.innerHTML = list
        .map(function (m) {
          var id = m.id || m.name || "";
          var def = id === DEFAULT_CLAUDE ? "（默认）" : "";
          return '<option value="' + id + '">' + id + def + "</option>";
        })
        .join("");
      var hasCur = Array.prototype.some.call(sel.options, function (o) {
        return o.value === cur;
      });
      if (hasCur) sel.value = cur;
    })
    .catch(function () {});

  function appendDelta(text) {
    output.textContent += text;
  }

  async function run() {
    var model = sel.value;
    var msg = input.value.trim();
    if (!msg) {
      output.textContent = "请输入消息";
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = "生成中…";
    output.textContent = "";
    var isClaudeModel = /claude|anthropic/i.test(model);
    var stream = streamChk.checked;
    try {
      if (isClaudeModel) {
        // Anthropic 协议
        var resp = await fetch("v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": "any-key" },
          body: JSON.stringify({
            model: model,
            max_tokens: 1024,
            stream: stream,
            messages: [{ role: "user", content: msg }],
          }),
        });
        if (!stream) {
          var d = await resp.json();
          var text = (d.content || [])
            .map(function (b) {
              if (b.type === "thinking") return "[思考] " + b.thinking;
              if (b.type === "text") return b.text;
              return "";
            })
            .filter(Boolean)
            .join("\n");
          output.textContent = text || JSON.stringify(d, null, 2);
        } else {
          var reader = resp.body.getReader();
          var dec = new TextDecoder();
          var buf = "",
            thinking = false;
          while (true) {
            var r = await reader.read();
            if (r.done) break;
            buf += dec.decode(r.value, { stream: true });
            var lines = buf.split("\n");
            buf = lines.pop();
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i];
              if (line.indexOf("data:") !== 0) continue;
              try {
                var ev = JSON.parse(line.slice(5).trim());
                if (ev.type === "content_block_start" && ev.index !== undefined) {
                  thinking = ev.content_block && ev.content_block.type === "thinking";
                  if (thinking) appendDelta("[思考] ");
                } else if (ev.type === "content_block_delta") {
                  if (ev.delta && ev.delta.text) appendDelta(ev.delta.text);
                  if (ev.delta && ev.delta.thinking) appendDelta(ev.delta.thinking);
                }
              } catch (e) {}
            }
          }
        }
      } else {
        // OpenAI 协议
        var resp2 = await fetch("v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer any-key" },
          body: JSON.stringify({
            model: model,
            stream: stream,
            messages: [{ role: "user", content: msg }],
          }),
        });
        if (!stream) {
          var d2 = await resp2.json();
          output.textContent =
            (d2.choices && d2.choices[0] && d2.choices[0].message && d2.choices[0].message.content) ||
            JSON.stringify(d2, null, 2);
        } else {
          var reader2 = resp2.body.getReader();
          var dec2 = new TextDecoder();
          var buf2 = "";
          while (true) {
            var r2 = await reader2.read();
            if (r2.done) break;
            buf2 += dec2.decode(r2.value, { stream: true });
            var lines2 = buf2.split("\n");
            buf2 = lines2.pop();
            for (var j = 0; j < lines2.length; j++) {
              var line2 = lines2[j];
              if (line2.indexOf("data:") !== 0) continue;
              var payload = line2.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                var ev2 = JSON.parse(payload);
                var delta = ev2.choices && ev2.choices[0] && ev2.choices[0].delta && ev2.choices[0].delta.content;
                if (delta) appendDelta(delta);
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {
      output.textContent = "请求失败：" + e.message;
    }
    sendBtn.disabled = false;
    sendBtn.textContent = "发送";
  }

  sendBtn.addEventListener("click", run);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run();
    }
  });
})();
