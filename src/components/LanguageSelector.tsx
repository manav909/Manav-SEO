import React from "react";
const LANGS = [
  {code:"en",label:"English",flag:"🇬🇧"},
  {code:"ar",label:"العربية",flag:"🇦🇪"},
  {code:"hi",label:"हिन्दी",flag:"🇮🇳"},
  {code:"pt",label:"Português",flag:"🇧🇷"},
  {code:"fr",label:"Français",flag:"🇫🇷"},
  {code:"es",label:"Español",flag:"🇲🇽"},
  {code:"zh",label:"中文",flag:"🇨🇳"},
  {code:"de",label:"Deutsch",flag:"🇩🇪"},
  {code:"ja",label:"日本語",flag:"🇯🇵"},
];
export default function LanguageSelector({value,onChange,disabled}:{value:string,onChange:(c:string)=>void,disabled?:boolean}) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}
      style={{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:8,
              color:"#f0f0ff",padding:"6px 12px",fontSize:13,cursor:"pointer"}}>
      {LANGS.map(l=><option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
    </select>
  );
}