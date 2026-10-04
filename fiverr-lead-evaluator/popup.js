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

const authEl = document.getElementById("auth");
chrome.runtime.sendMessage({ type: "getSession" }, (resp) => {
  const s = resp && resp.session;
  if (s && s.accessToken && s.expiresAt > Date.now()) {
    authEl.textContent = "Signed in" + (s.email ? " as " + s.email : "") + ".";
    authEl.style.color = "#34d399";
  } else {
    authEl.textContent = "Not signed in. Open seoseason.com in a tab and log in — the extension picks it up automatically.";
    authEl.style.color = "#fbbf24";
  }
});
