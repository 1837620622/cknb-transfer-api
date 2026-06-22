/* CKNB · AI API 中转站 - 前端交互逻辑 */
(function () {
  "use strict";

  // 服务地址：用页面 URL 推导，自动适配 nginx 前缀（页面在 /ai/app 下，相对路径 fetch 即可）
  // base = 去掉 /app 后的前缀，如 http://host/ai
  var here = window.location.href.split("#")[0].replace(/\/app\/?$/, "").replace(/\/$/, "");
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

  var DEFAULT_CLAUDE = "gateway-claude-opus-4-8";

  // ============ 模型列表 ============
  var statusEl = document.getElementById("modelsStatus");
  var tableEl = document.getElementById("modelsTable");
  var bodyEl = document.getElementById("modelsBody");
  var filterEl = document.getElementById("modelFilter");
  var onlyClaude = document.getElementById("onlyClaude");
  var onlyOpenAI = document.getElementById("onlyOpenAI");
  var onlyBTL = document.getElementById("onlyBTL");
  var onlyFree = document.getElementById("onlyFree");
  var allModels = [];

  function isClaude(id) {
    return /claude|anthropic/i.test(id);
  }

  // 供应商标签：显示模型来自哪个供应商/上游
  function upstreamLabel(m) {
    var up = (m.upstream || "").toLowerCase();
    if (up === "btl") return '<span class="pill btl">Bad Theory Labs</span>';
    return '<span class="pill raw">unlimited.surf</span>';
  }

  // 模型厂商标签：Anthropic / OpenAI / Google / DeepSeek / xAI
  function vendorLabel(m) {
    var p = (m.provider || "").toLowerCase();
    var id = (m.id || "").toLowerCase();
    if (p === "anthropic" || /claude/i.test(id)) return '<span class="pill anthropic">Anthropic</span>';
    if (p === "openai" || /gpt\b|o[1-4]/i.test(id)) return '<span class="pill openai">OpenAI</span>';
    if (p === "google" || /gemini/i.test(id)) return '<span class="pill google">Google</span>';
    if (p === "deepseek" || /deepseek/i.test(id)) return '<span class="pill deepseek">DeepSeek</span>';
    if (p === "xai" || /grok/i.test(id)) return '<span class="pill grok">xAI</span>';
    if (p === "btl") return '<span class="pill btl">Bad Theory Labs</span>';
    if (p === "alibaba") return '<span class="pill raw" style="color:#ff6a00;background:rgba(255,106,0,.1)">Alibaba</span>';
    if (p === "moonshot") return '<span class="pill raw" style="color:#6366f1;background:rgba(99,102,241,.1)">Moonshot</span>';
    return '<span class="pill raw">' + (m.provider_label || p || "其他") + "</span>";
  }

  function expiresHtml(m) {
    if (!m.expires || m.expires === "不定期") return '<span class="exp-none">不定期</span>';
    var now = new Date();
    var exp = new Date(m.expires);
    if (isNaN(exp.getTime())) return '<span class="exp-none">' + m.expires + "</span>";
    var days = Math.ceil((exp - now) / 86400000);
    var cls = "exp-ok";
    var text = m.expires;
    if (days < 0) { cls = "exp-past"; text += "（已到期）"; }
    else if (days <= 3) { cls = "exp-critical"; text += "（" + days + "天后到期）"; }
    else if (days <= 14) { cls = "exp-warn"; text += "（" + days + "天后到期）"; }
    else { text += "（剩余" + days + "天）"; }
    return '<span class="' + cls + '">' + text + "</span>";
  }

  function rowHtml(m) {
    var id = m.id || m.name || "";
    var isDef = id === DEFAULT_CLAUDE;
    var def = isDef ? ' <span class="badge def">默认</span>' : "";
    var up = upstreamLabel(m);
    var vendor = vendorLabel(m);
    var exp = expiresHtml(m);
    var pricing = m.pricing ? '<span class="pricing-badge">' + m.pricing + "</span>" : "";
    var copyBtn =
      '<button class="copy-btn" data-id="' + id.replace(/"/g,"&quot;") + '">复制</button>';
    return (
      '<tr><td><code>' + id + "</code>" + def + pricing + "</td><td>" +
      vendor + "</td><td>" +
      up + "</td><td>" +
      exp + "</td><td>" +
      copyBtn + "</td></tr>"
    );
  }

  function render() {
    var kw = (filterEl.value || "").trim().toLowerCase();
    var wantClaude = onlyClaude.checked,
      wantOpenAI = onlyOpenAI.checked,
      wantBTL = onlyBTL.checked,
      wantFree = onlyFree.checked;
    var list = allModels.filter(function (m) {
      var id = (m.id || "").toLowerCase();
      var provider = (m.provider || "").toLowerCase();
      var upstream = (m.upstream || "").toLowerCase();
      if (kw && id.indexOf(kw) < 0 && provider.indexOf(kw) < 0 && upstream.indexOf(kw) < 0) return false;
      var c = isClaude(m.id);
      if (wantClaude && !c) return false;
      if (wantOpenAI && c) return false;
      var isBTL = (m.upstream || "").toLowerCase() === "btl";
      if (wantBTL && !isBTL) return false;
      var hasFree = m.pricing && /免费|限免|当前免费/i.test(m.pricing);
      if (wantFree && !hasFree) return false;
      return true;
    });
    list.sort(function (a, b) {
      return (
        (b.id === DEFAULT_CLAUDE) - (a.id === DEFAULT_CLAUDE) ||
        String(a.id).localeCompare(String(b.id))
      );
    });
    bodyEl.innerHTML = list.map(rowHtml).join("");
    var btlCount = list.filter(function(m) { return (m.upstream || "").toLowerCase() === "btl"; }).length;
    var unlimitedCount = list.length - btlCount;
    statusEl.textContent =
      "共 " + allModels.length + " 个模型，当前显示 " + list.length +
      " 个（unlimited.surf " + unlimitedCount + " 个 · Bad Theory Labs " + btlCount + " 个）。默认模型：" + DEFAULT_CLAUDE;
    statusEl.className = "note ok";
    tableEl.style.display = list.length ? "table" : "none";
  }

  filterEl.addEventListener("input", render);
  onlyClaude.addEventListener("change", render);
  onlyOpenAI.addEventListener("change", render);
  onlyBTL.addEventListener("change", render);
  onlyFree.addEventListener("change", render);

  // 复制按钮事件委托（动态生成的按钮）
  function fallbackCopy(text, btn) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      btn.textContent = "已复制✓";
      setTimeout(function() { btn.textContent = "复制"; }, 1200);
    } catch (e) {}
    document.body.removeChild(ta);
  }

  bodyEl.addEventListener("click", function(e) {
    var btn = e.target.closest(".copy-btn");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    if (!id) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id).then(function() {
        btn.textContent = "已复制✓";
        setTimeout(function() { btn.textContent = "复制"; }, 1200);
      }).catch(function() { fallbackCopy(id, btn); });
    } else {
      fallbackCopy(id, btn);
    }
  });

  // ============ 在线体验 Playground ============
  var sel = document.getElementById("pgModel");
  var input = document.getElementById("pgInput");
  var output = document.getElementById("pgOutput");
  var sendBtn = document.getElementById("pgSend");
  var streamChk = document.getElementById("pgStream");

  // 动态加载模型到下拉框（复用 allModels）
  function populateDropdown() {
    var cur = sel.value || DEFAULT_CLAUDE;
    sel.innerHTML = allModels
      .map(function (m) {
        var id = m.id || m.name || "";
        var def = id === DEFAULT_CLAUDE ? "（默认）" : "";
        var up = (m.upstream || "").toLowerCase();
        var suffix = "[" + (up === "btl" ? "BTL" : "网关") + "]";
        return '<option value="' + id.replace(/"/g,"&quot;") + '">' + id + " " + suffix + def + "</option>";
      })
      .join("");
    var hasCur = Array.prototype.some.call(sel.options, function (o) {
      return o.value === cur;
    });
    if (hasCur) sel.value = cur;
  }

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
      populateDropdown();
    })
    .catch(function (e) {
      statusEl.textContent = "加载失败：" + e.message;
      statusEl.className = "note err";
    });

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
    // 通过模型元数据判断上游供应商，不依赖脆弱的正则匹配
    var modelMeta = allModels.find(function(m) { return m.id === model; });
    var isBTLModel = modelMeta && (modelMeta.upstream || "").toLowerCase() === "btl";
    var isAnthropicProtocol = isClaudeModel && !isBTLModel;
    var stream = streamChk.checked;
    try {
      if (isAnthropicProtocol) {
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
        if (!resp.ok) {
          var errBody = await resp.text();
          try { var errJson = JSON.parse(errBody); output.textContent = "[错误] " + (errJson.error && errJson.error.message || errJson.error || errBody); }
          catch(e) { output.textContent = "[错误] HTTP " + resp.status + ": " + errBody; }
          sendBtn.disabled = false; sendBtn.textContent = "发送"; return;
        }
        if (!stream) {
          var d = await resp.json();
          if (d.error) {
            output.textContent = "[错误] " + (d.error.message || JSON.stringify(d.error));
          } else {
            var text = (d.content || [])
              .map(function (b) {
                if (b.type === "thinking") return "[思考] " + b.thinking;
                if (b.type === "text") return b.text;
                return "";
              })
              .filter(Boolean)
              .join("\n");
            output.textContent = text || JSON.stringify(d, null, 2);
          }
        } else {
          var reader = resp.body.getReader();
          var dec = new TextDecoder();
          var buf = "",
            thinking = false,
            anthError = null;
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
                if (ev.type === "error" || ev.error) {
                  anthError = ev.error;
                  appendDelta("\n[错误] " + (anthError && anthError.message || anthError || "上游错误"));
                } else if (ev.type === "content_block_start" && ev.index !== undefined) {
                  thinking = ev.content_block && ev.content_block.type === "thinking";
                  if (thinking) appendDelta("[思考] ");
                } else if (ev.type === "content_block_delta") {
                  if (ev.delta && ev.delta.text) appendDelta(ev.delta.text);
                  if (ev.delta && ev.delta.thinking) appendDelta(ev.delta.thinking);
                }
              } catch (e) {}
            }
          }
          if (anthError && !output.textContent.trim()) {
            output.textContent = "[错误] " + (anthError.message || JSON.stringify(anthError));
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
        if (!resp2.ok) {
          var errBody2 = await resp2.text();
          try { var errJson2 = JSON.parse(errBody2); output.textContent = "[错误] " + (errJson2.error && errJson2.error.message || errJson2.error || errBody2); }
          catch(e) { output.textContent = "[错误] HTTP " + resp2.status + ": " + errBody2; }
          sendBtn.disabled = false; sendBtn.textContent = "发送"; return;
        }
        if (!stream) {
          var d2 = await resp2.json();
          if (d2.error) {
            output.textContent = "[错误] " + (d2.error.message || JSON.stringify(d2.error));
          } else {
            output.textContent =
              (d2.choices && d2.choices[0] && d2.choices[0].message && d2.choices[0].message.content) ||
              JSON.stringify(d2, null, 2);
          }
        } else {
          var reader2 = resp2.body.getReader();
          var dec2 = new TextDecoder();
          var buf2 = "";
          var error2 = null;
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
                if (ev2.error) {
                  error2 = ev2.error;
                  appendDelta("\n[错误] " + (error2.message || JSON.stringify(error2)));
                }
                var delta = ev2.choices && ev2.choices[0] && ev2.choices[0].delta && ev2.choices[0].delta.content;
                if (delta) appendDelta(delta);
              } catch (e) {}
            }
          }
          if (error2 && !output.textContent.trim()) {
            output.textContent = "[错误] " + (error2.message || JSON.stringify(error2));
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
