const baseEl = document.getElementById("base");
const okEl = document.getElementById("ok");

chrome.storage.sync.get({ apiBase: "https://seoseason.com" }, (s) => {
  baseEl.value = s.apiBase || "https://seoseason.com";
});

document.getElementById("save").addEventListener("click", () => {
  let v = (baseEl.value || "").trim().replace(/\/+$/, "");
  if (v && !/^https?:\/\//.test(v)) v = "https://" + v;
  chrome.storage.sync.set({ apiBase: v || "https://seoseason.com" }, () => {
    okEl.textContent = "Saved.";
    setTimeout(() => (okEl.textContent = ""), 1500);
  });
});
