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
 *
 * ------------------------------------------------------
 * [추가된 기능] 본문해설강의 (문법설명 중심 본문 해설)
 * ------------------------------------------------------
 * "본문"(data-kind="본문") 폴더에 한해서, 기존 본문강의 파일
 * (full.html, 1.html, 2.html ...) 외에 앞에 "해설-"을 붙인 파일이
 * 있는지도 함께 확인합니다. index.html은 전혀 손댈 필요 없이,
 * 그 폴더에 아래 이름으로 파일만 올리면 자동으로 목록에 나타납니다.
 *
 *   해설-full.html   → "본문해설강의 (전체)"
 *   해설-1.html      → "본문해설강의 1"
 *   해설-2.html      → "본문해설강의 2"
 *   ... (data-max까지)
 *
 * 목록에서는 기존 본문강의 뒤에 이어서, 자주색(mauve) 태그로
 * 구분되어 표시됩니다.
 * ------------------------------------------------------
 */

(function () {
  var GRAMMAR_PREFIX = "해설-"; // 본문해설강의 파일명 접두사. 필요하면 이 값만 바꾸면 전체 반영됩니다.

  function labelFor(kind, n, isGrammar) {
    if (isGrammar) {
      if (n === "full") return { tag: "전체", txt: "본문해설강의 (전체)" };
      return { tag: String(n), txt: "본문해설강의 " + n };
    }
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

  function addRow(container, kind, fileName, n, isGrammar) {
    var info = labelFor(kind, n, isGrammar);
    var a = document.createElement("a");
    a.className = "unit-row";
    a.href = "./" + fileName;

    var tag = document.createElement("span");
    tag.className = "tag" + (isGrammar ? " key" : ""); // 본문해설강의는 자주색(key) 태그로 구분
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
    if (hasFull) checks.push({ file: "full.html", n: "full", grammar: false });
    for (var i = 1; i <= maxN; i++) checks.push({ file: i + ".html", n: i, grammar: false });

    // "본문" 폴더에 한해서 본문해설강의(해설- 접두사) 파일도 함께 확인
    if (kind === "본문") {
      if (hasFull) checks.push({ file: GRAMMAR_PREFIX + "full.html", n: "full", grammar: true });
      for (var j = 1; j <= maxN; j++) checks.push({ file: GRAMMAR_PREFIX + j + ".html", n: j, grammar: true });
    }

    // 존재 여부를 모두 확인한 뒤, 원래 순서대로(본문강의 → 본문해설강의) 표시
    Promise.all(
      checks.map(function (c) {
        return fileExists("./" + c.file).then(function (exists) {
          return exists ? c : null;
        });
      })
    ).then(function (results) {
      results.forEach(function (c) {
        if (c) addRow(container, kind, c.file, c.n, c.grammar);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var containers = document.querySelectorAll("[data-auto-list]");
    containers.forEach(buildList);
  });
})();
