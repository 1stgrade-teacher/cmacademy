/**
 * auto-list.js
 * ------------------------------------------------------
 * 본문/문법/듣기 index.html 안의 목록을, 실제로 서버에 업로드된 파일만
 * 자동으로 찾아서 보여주는 스크립트.
 *
 * 사용법: index.html의 unit-list 자리에 아래처럼 딱 한 줄만 넣으면 됩니다.
 *
 *   본문:  <div class="unit-list compact" data-auto-list data-kind="본문" data-full="true" data-max="6"></div>
 *   문법:  <div class="unit-list compact" data-auto-list data-kind="문법" data-full="false" data-max="4"></div>
 *   듣기:  <div class="unit-list compact" data-auto-list data-kind="듣기" data-full="false" data-max="6"></div>
 *
 * data-max는 "혹시 몰라 넉넉하게 몇 번까지 확인해볼지"를 뜻해요.
 * 실제로 그 번호의 파일이 없으면 그냥 조용히 건너뜁니다.
 * ------------------------------------------------------
 */

(function () {
  function labelFor(kind, n) {
    if (n === "full") return { tag: "전체", txt: "전체 통합본" };
    if (kind === "본문") return { tag: String(n), txt: "소단락 " + n };
    if (kind === "문법") return { tag: String(n), txt: "문법 포인트 " + n };
    if (kind === "듣기") return { tag: String(n), txt: "스크립트 " + n };
    return { tag: String(n), txt: String(n) };
  }

  function fileExists(url) {
    return fetch(url, { method: "HEAD", cache: "no-store" })
      .then(function (res) { return res.ok; })
      .catch(function () { return false; });
  }

  function addRow(container, kind, fileName, n) {
    var info = labelFor(kind, n);
    var a = document.createElement("a");
    a.className = "unit-row";
    a.href = "./" + fileName;

    var tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = info.tag;

    var txt = document.createElement("span");
    txt.className = "txt";
    txt.textContent = info.txt;

    var pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = "GO";
    pill.style.background = "var(--sage, #7a9b7e)";
    pill.style.color = "#fff";
    pill.style.fontWeight = "600";

    a.appendChild(tag);
    a.appendChild(txt);
    a.appendChild(pill);
    container.appendChild(a);
  }

  function buildList(container) {
    var kind = container.getAttribute("data-kind") || "";
    var hasFull = container.getAttribute("data-full") === "true";
    var maxN = parseInt(container.getAttribute("data-max") || "6", 10);

    var checks = [];
    if (hasFull) checks.push({ file: "full.html", n: "full" });
    for (var i = 1; i <= maxN; i++) checks.push({ file: i + ".html", n: i });

    checks.forEach(function (c) {
      fileExists("./" + c.file).then(function (exists) {
        if (!exists) return;
        addRow(container, kind, c.file, c.n);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var containers = document.querySelectorAll("[data-auto-list]");
    containers.forEach(buildList);
  });
})();
