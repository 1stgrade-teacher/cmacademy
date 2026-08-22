/**
 * auto-status.js
 * ------------------------------------------------------
 * "준비중"으로 표시된 모든 강의 링크를 자동으로 검사해서,
 * 실제로 해당 파일이 서버에 업로드되어 있으면 "GO"로 바꿔주는 스크립트.
 *
 * 사용법:
 *   1) 이 파일을 저장소(cmacademy)의 가장 바깥쪽(최상위) 폴더에 둡니다.
 *   2) 모든 index.html 파일의 </body> 바로 위에 아래 한 줄을 추가합니다.
 *      <script src="/auto-status.js" defer></script>
 *
 * 새 reading 파일을 업로드할 때마다 index.html을 다시 고칠 필요가 없습니다.
 * ------------------------------------------------------
 */

(function () {
  // 완료 표시로 바꿀 단어 (원하시면 이 부분만 바꾸면 전체 사이트에 반영됩니다)
  var GO_LABEL = "GO";
  var PENDING_LABEL = "준비중";

  function markAsReady(pillEl) {
    pillEl.textContent = GO_LABEL;
    pillEl.style.background = "var(--sage, #7a9b7e)";
    pillEl.style.color = "#fff";
    pillEl.style.fontWeight = "600";
  }

  function checkAndUpdate(rowEl) {
    var pillEl = rowEl.querySelector(".pill");
    if (!pillEl) return;
    if (pillEl.textContent.trim() !== PENDING_LABEL) return; // 이미 처리된 항목은 건너뜀

    var href = rowEl.getAttribute("href");
    if (!href) return;

    fetch(href, { method: "HEAD", cache: "no-store" })
      .then(function (res) {
        if (res.ok) markAsReady(pillEl);
      })
      .catch(function () {
        // 네트워크 오류 시 그대로 "준비중" 유지 (안전하게 아무 것도 안 함)
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var rows = document.querySelectorAll("a.unit-row");
    rows.forEach(checkAndUpdate);
  });
})();
