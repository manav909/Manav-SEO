import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { detectTheme, themeToCSS, Theme, Mode } from "@/lib/theme-engine";

interface ThemeCtx {
  theme: Theme;
  mode: Mode;
  setMode: (m: Mode) => void;
  setProject: (p: any) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({} as ThemeCtx);
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode_] = useState<Mode>(() =>
    (localStorage.getItem("seosZmode") as Mode) || "dark"
  );
  const [project, setProject_] = useState<any>(null);
  const [theme, setTheme] = useState<Theme>(() => detectTheme(null, "dark"));

  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.style.cssText = themeToCSS(t);
    document.documentElement.setAttribute("data-theme", t.id);
    document.documentElement.setAttribute("data-mode", t.mode);
    document.body.style.background = t.bg;
    document.body.style.color = t.text;
    setTheme(t);
  }, []);

  useEffect(() => {
    const t = detectTheme(project, mode);
    applyTheme(t);
  }, [project, mode, applyTheme]);

  const setMode = (m: Mode) => {
    localStorage.setItem("seosZmode", m);
    setMode_(m);
  };

  const toggle = () => setMode(mode === "dark" ? "light" : "dark");

  return (
    <Ctx.Provider value={{ theme, mode, setMode, setProject: setProject_, toggle }}>
      {children}
    </Ctx.Provider>
  );
}
