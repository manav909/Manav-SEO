
import React,{createContext,useContext,useState,useEffect,useCallback} from "react";
import {THEMES,DEFAULT_THEME,detectTheme,applyTheme,type Theme,type Mode,type ThemeId} from "@/lib/theme-engine";

interface ThemeCtx {
  theme: Theme;
  mode: Mode;
  themeId: ThemeId;
  setMode: (m:Mode)=>void;
  setThemeId: (id:ThemeId)=>void;
  setProject: (p:any)=>void;
  toggle: ()=>void;
  allThemes: typeof THEMES;
}

const Ctx = createContext<ThemeCtx>({} as ThemeCtx);
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({children}:{children:React.ReactNode}){
  const[mode,setMode_]=useState<Mode>(()=>(localStorage.getItem("seosZ_mode") as Mode)||"dark");
  const[themeId,setId_]=useState<ThemeId>(()=>(localStorage.getItem("seosZ_theme") as ThemeId)||"void");
  const[project,setProject_]=useState<any>(null);

  const apply=useCallback(()=>{
    // If user has manually picked a theme, use it. Otherwise auto-detect.
    const key=`${themeId}_${mode}`;
    const t=THEMES[key]||detectTheme(project,mode);
    applyTheme(t);
    return t;
  },[mode,themeId,project]);

  const[theme,setTheme]=useState<Theme>(()=>THEMES[`${themeId}_${mode}`]||DEFAULT_THEME);

  useEffect(()=>{
    const t=apply();
    setTheme(t);
  },[apply]);

  const setMode=(m:Mode)=>{localStorage.setItem("seosZ_mode",m);setMode_(m);};
  const setThemeId=(id:ThemeId)=>{localStorage.setItem("seosZ_theme",id);setId_(id);};
  const setProject=(p:any)=>{setProject_(p);};
  const toggle=()=>setMode(mode==="dark"?"light":"dark");

  return(
    <Ctx.Provider value={{theme,mode,themeId,setMode,setThemeId,setProject,toggle,allThemes:THEMES}}>
      {children}
    </Ctx.Provider>
  );
}
