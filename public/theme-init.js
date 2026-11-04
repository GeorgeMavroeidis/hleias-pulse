// Runs before styles and React in both entry points. Keep in sync with theme.ts.
(function () {
  var preference = "system";
  try {
    var saved = localStorage.getItem("hp.color-scheme.v1");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch (_) {
    /* Storage may be disabled. */
  }
  var dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.style.backgroundColor = dark ? "#101c2a" : "#f6f0e6";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#101c2a" : "#f6f0e6");
})();
