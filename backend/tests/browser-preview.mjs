import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Optional real-browser checks against temporary integration users and real API data. */
export async function testBrowserPreviews({ tokens, submissions, enrollment, joinBody, legacyCor }) {
  const frontend = process.env.PREVIEW_FRONTEND_URL ?? "http://127.0.0.1:5174";
  const browser = process.env.PREVIEW_BROWSER_URL ?? "http://127.0.0.1:9223";
  const tab = await fetch(`${browser}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener("message", ({ data }) => {
    const payload = JSON.parse(data);
    if (payload.id) { const item = pending.get(payload.id); if (item) { clearTimeout(item.timer); payload.error ? item.reject(new Error(JSON.stringify(payload.error))) : item.resolve(payload.result); pending.delete(payload.id); } }
    if (payload.method === "Runtime.exceptionThrown") errors.push(payload.params.exceptionDetails.text + ": " + payload.params.exceptionDetails.exception?.description);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
  };
  const wait = async (expression, message) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`${message}; last page: ${await evaluate("document.body.innerText.slice(-1800)")}; browser errors: ${errors.join("\n")}`);
  };
  const visit = async (route, role = "teacher", width = 1440) => {
    await send("Network.setCookie", { name: "token", value: tokens[role], url: frontend, path: "/" });
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
    await send("Page.navigate", { url: `${frontend}${route}` });
    await send("Page.bringToFront");
    await wait("document.querySelector('.document-preview') !== null", `Preview missing at ${route}`);
  };
  const screenshot = async (name) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join("../.tmp/preview-verification", `${name}.png`), Buffer.from(result.data, "base64"));
  };
  const expandAndClose = async (selector) => {
    await evaluate("document.querySelector('[aria-label=\"Full screen document preview\"]').click()");
    await wait(`document.querySelector('.document-fullscreen ${selector}') !== null`, "Full-screen renderer missing");
    await evaluate("document.querySelector('.document-fullscreen [aria-label=\"Zoom in\"]').click()");
    assert.equal(await evaluate("document.querySelector('.document-fullscreen output').textContent"), "125%");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await wait("document.querySelector('.document-fullscreen') === null", "Escape did not close full screen");
    await wait(`document.querySelector('.document-preview ${selector}') !== null`, "Embedded preview did not return");
  };
  try {
    await mkdir("../.tmp/preview-verification", { recursive: true });
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('darkMode','false')" });
    for (const submission of submissions) {
      await visit(`/documents/submission/${submission.id}`);
      const selector = { essay: ".document-text-paper", txt: ".document-text-paper", code: ".cm-content", image: "img", docx: ".docx-preview-paper p", pdf: ".pdf-preview canvas" }[submission.format];
      await wait(`document.querySelector('.document-preview ${selector}') !== null`, `${submission.format} renderer failed`);
      if (submission.format === "pdf") {
        await wait("document.querySelector('.pdf-preview canvas')?.width > 0", "PDF canvas blank");
        assert.match(await evaluate("document.querySelector('.pdf-page-controls').textContent"), /of 2/);
        await evaluate("document.querySelector('[aria-label=\"Next page\"]').click()");
        await wait("document.querySelector('[data-pdf-page=\"2\"] canvas')?.width > 0", "Second PDF page failed");
      }
      if (submission.format === "docx") assert.match(await evaluate("document.querySelector('.docx-preview-paper').textContent"), /classroom project/);
      if (submission.format === "code") assert.equal(await evaluate("document.querySelector('.cm-content').getAttribute('contenteditable')"), "false");
      await expandAndClose(selector);
      await screenshot(submission.format);
      await visit(`/documents/submission/${submission.id}`, "student", 390);
      await wait(`document.querySelector('.document-preview ${selector}') !== null`, `Student ${submission.format} renderer failed`);
      assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `Mobile overflow: ${submission.format}`);
      console.log(`PASS: real ${submission.format} preview, full screen, zoom, Escape close, and student mobile view`);
    }
    const pdf = submissions.find((item) => item.format === "pdf");
    await visit(`/teacher/submissions/${pdf.id}`);
    await wait("[...document.querySelectorAll('summary')].some(el => el.textContent.includes('Advanced evidence: sentence occlusion'))", "Sentence occlusion evidence missing");
    assert.equal(await evaluate("document.body.innerText.includes('Content-level indicators')"), false);
    await evaluate("[...document.querySelectorAll('summary')].find(el => el.textContent.includes('Advanced evidence: sentence occlusion')).click()");
    await wait("document.querySelector('[aria-label=\"Sentence impact heatmap\"]') !== null", "Real PDF occlusion evidence missing");
    await evaluate("(() => { const input=document.querySelector('input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'83'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
    await expandAndClose(".pdf-preview canvas");
    await evaluate("document.querySelector('[aria-label=\"Switch to dark mode\"]').click()");
    assert.equal(await evaluate("document.querySelector('input[type=number]').value"), "83", "Fullscreen lost unsaved grade");
    await screenshot("pdf-review-and-heatmap");
    await visit(`/teacher/submissions/${pdf.id}`, "teacher", 390);
    await evaluate("document.querySelector('#review-analysis-tab').click()");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#review-preview')).display"), "none");
    await evaluate("document.querySelector('[aria-label=\"Switch to dark mode\"]').click()");
    assert.equal(await evaluate("document.documentElement.classList.contains('dark')"), true);
    await evaluate("[...document.querySelectorAll('summary')].find(el => el.textContent.includes('Advanced evidence: sentence occlusion')).click()");
    await evaluate("document.querySelector('[aria-label=\"Sentence impact heatmap\"]').scrollIntoView({block:'center'})");
    await screenshot("mobile-heatmap-dark");
    console.log("PASS: sentence occlusion, removed redundant heatmap, responsive analysis tabs, theme toggle, and unsaved grading retained");

    // Sanitizer and fallback checks use the real utility / component, not a replacement renderer.
    const safe = await evaluate(`(async () => { const {sanitizeDocumentHtml}=await import('/src/utils/docxPreview.ts'); return sanitizeDocumentHtml('<h1>Title</h1><table><tr><td>Cell</td></tr></table><script>window.previewAttack=1</script><img src="https://example.invalid/tracker" onerror="window.previewAttack=1"><a href="javascript:alert(1)">link</a>'); })()`);
    assert.match(safe, /<h1>Title<\/h1>/); assert.match(safe, /<td>Cell<\/td>/); assert.doesNotMatch(safe, /<script|onerror|https:|javascript:/);
    const txt = "A plain text preview.\nSecond line with <script>text only</script>.";
    await evaluate(`sessionStorage.setItem('truesight-draft-document:plain-test',JSON.stringify({id:'plain-test',kind:'draft',title:'Text fixture',fileName:'fixture.txt',fileType:'text/plain',dataUrl:'data:text/plain;base64,'+btoa(${JSON.stringify(txt)}),textContent:null}));`);
    await visit("/documents/draft/plain-test", "student");
    await wait("document.querySelector('.document-text-paper') !== null", "TXT renderer failed");
    assert.equal(await evaluate("document.querySelector('.document-text-paper').textContent"), txt);
    assert.equal(await evaluate("document.querySelector('.document-text-paper script') === null"), true);
    await screenshot("txt-preview");
    for (const [id, name, type, data] of [["unsupported-test", "fixture.doc", "application/msword", "legacy"], ["broken-test", "broken.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "not a zip"]]) {
      await evaluate(`sessionStorage.setItem('truesight-draft-document:${id}',JSON.stringify({id:'${id}',kind:'draft',title:'Fallback fixture',fileName:'${name}',fileType:'${type}',dataUrl:'data:${type};base64,'+btoa('${data}')}))`);
      await visit(`/documents/draft/${id}`, "student");
      await wait("document.querySelector('.document-preview [role=alert]') !== null", "Fallback did not render");
      assert.ok(await evaluate("!!document.querySelector('[aria-label=\"Download original file\"]')"));
    }
    console.log("PASS: HTML sanitization, TXT line breaks, literal code safety, unsupported DOC, and corrupt DOCX fallback");

    await send("Network.setCookie", { name: "token", value: tokens.teacher, url: frontend, path: "/" });
    await send("Page.navigate", { url: `${frontend}/teacher/teacher_screen/uploads` });
    await wait(`document.querySelector('[data-cor-id="${enrollment.id}"]') !== null`, "COR review button missing");
    await evaluate(`document.querySelector('[data-cor-id="${enrollment.id}"]').click()`);
    await wait("document.querySelector('[aria-labelledby=\"cor-preview-title\"] .document-preview img') !== null", "COR viewer missing");
    await expandAndClose("img");
    assert.ok(await evaluate("!!document.querySelector('[aria-labelledby=\"cor-preview-title\"]')"), "Closing nested full screen closed COR review");
    await screenshot("cor-review");
    console.log(`PASS: actual COR image review and nested fullscreen close (${enrollment.id}, ${joinBody.corFileName})`);
    await evaluate("document.querySelector('[aria-label=\"Close preview\"]').click()");
    await evaluate(`document.querySelector('[data-cor-id="${legacyCor.id}"]').click()`);
    await wait("document.querySelector('[aria-labelledby=\"cor-preview-title\"] .pdf-preview canvas')?.width > 0", "Legacy PDF COR failed");
    await evaluate("document.querySelector('[aria-label=\"Next page\"]').click()");
    await wait("document.querySelector('[data-pdf-page=\"2\"] canvas')?.width > 0", "Legacy PDF COR second page failed");
    await expandAndClose(".pdf-preview canvas");
    assert.ok(await evaluate("[...document.querySelectorAll('[aria-labelledby=\"cor-preview-title\"] button')].some(b=>b.textContent.includes('Accept'))"));
    await screenshot("cor-pdf-review");
    console.log("PASS: legacy PDF COR page controls, fullscreen, and preserved approval controls");
    assert.deepEqual(errors, [], "Unexpected browser runtime errors");
  } finally {
    socket.close();
    await fetch(`${browser}/json/close/${tab.id}`);
  }
}
