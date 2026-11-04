var J_=Object.defineProperty;var K_=(s,t,e)=>t in s?J_(s,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):s[t]=e;var Ft=(s,t,e)=>K_(s,typeof t!="symbol"?t+"":t,e);function Yi(s){if(s===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return s}function ap(s,t){s.prototype=Object.create(t.prototype),s.prototype.constructor=s,s.__proto__=t}var Wn={autoSleep:120,force3D:"auto",nullTargetWarn:1,units:{lineHeight:""}},Jo={duration:.5,overwrite:!1,delay:0},Ch,_n,ke,fi=1e8,Pe=1/fi,yh=Math.PI*2,Q_=yh/4,j_=0,lp=Math.sqrt,t0=Math.cos,e0=Math.sin,cn=function(t){return typeof t=="string"},Ze=function(t){return typeof t=="function"},$i=function(t){return typeof t=="number"},cl=function(t){return typeof t>"u"},Ni=function(t){return typeof t=="object"},Gn=function(t){return t!==!1},Rh=function(){return typeof window<"u"},Qa=function(t){return Ze(t)||cn(t)},cp=typeof ArrayBuffer=="function"&&ArrayBuffer.isView||function(){},Sn=Array.isArray,n0=/random\([^)]+\)/g,i0=/,\s*/g,jd=/(?:-?\.?\d|\.)+/gi,Ph=/[-+=.]*\d+[.e\-+]*\d*[e\-+]*\d*/g,js=/[-+=.]*\d+[.e-]*\d*[a-z%]*/g,dh=/[-+=.]*\d+\.?\d*(?:e-|e\+)?\d*/gi,Ih=/[+-]=-?[.\d]+/,s0=/[^,'"\[\]\s]+/gi,r0=/^[+\-=e\s\d]*\d+[.\d]*([a-z]*|%)\s*$/i,Xe,Di,Mh,Lh,Qn={},nl={},hp,up=function(t){return(nl=Fr(t,Qn))&&bn},hl=function(t,e){return console.warn("Invalid property",t,"set to",e,"Missing plugin? gsap.registerPlugin()")},Ko=function(t,e){return!e&&console.warn(t)},fp=function(t,e){return t&&(Qn[t]=e)&&nl&&(nl[t]=e)||Qn},Qo=function(){return 0},o0={suppressEvents:!0,isStart:!0,kill:!1},ja={suppressEvents:!0,kill:!1},a0={suppressEvents:!0},Dh={},Ss=[],Sh={},dp,Hn={},ph={},tp=30,tl=[],Uh="",Nh=function(t){var e=t[0],n,i;if(Ni(e)||Ze(e)||(t=[t]),!(n=(e._gsap||{}).harness)){for(i=tl.length;i--&&!tl[i].targetTest(e););n=tl[i]}for(i=t.length;i--;)t[i]&&(t[i]._gsap||(t[i]._gsap=new kh(t[i],n)))||t.splice(i,1);return t},bs=function(t){return t._gsap||Nh(di(t))[0]._gsap},Oh=function(t,e,n){return(n=t[e])&&Ze(n)?t[e]():cl(n)&&t.getAttribute&&t.getAttribute(e)||n},Pn=function(t,e){return(t=t.split(",")).forEach(e)||t},$e=function(t){return Math.round(t*1e5)/1e5||0},We=function(t){return Math.round(t*1e7)/1e7||0},tr=function(t,e){var n=e.charAt(0),i=parseFloat(e.substr(2));return t=parseFloat(t),n==="+"?t+i:n==="-"?t-i:n==="*"?t*i:t/i},l0=function(t,e){for(var n=e.length,i=0;t.indexOf(e[i])<0&&++i<n;);return i<n},il=function(){var t=Ss.length,e=Ss.slice(0),n,i;for(Sh={},Ss.length=0,n=0;n<t;n++)i=e[n],i&&i._lazy&&(i.render(i._lazy[0],i._lazy[1],!0)._lazy=0)},Fh=function(t){return!!(t._initted||t._startAt||t.add)},pp=function(t,e,n,i){Ss.length&&!_n&&il(),t.render(e,n,i||!!(_n&&e<0&&Fh(t))),Ss.length&&!_n&&il()},mp=function(t){var e=parseFloat(t);return(e||e===0)&&(t+"").match(s0).length<2?e:cn(t)?t.trim():t},gp=function(t){return t},jn=function(t,e){for(var n in e)n in t||(t[n]=e[n]);return t},c0=function(t){return function(e,n){for(var i in n)i in e||i==="duration"&&t||i==="ease"||(e[i]=n[i])}},Fr=function(t,e){for(var n in e)t[n]=e[n];return t},ep=function s(t,e){for(var n in e)n!=="__proto__"&&n!=="constructor"&&n!=="prototype"&&(t[n]=Ni(e[n])?s(t[n]||(t[n]={}),e[n]):e[n]);return t},sl=function(t,e){var n={},i;for(i in t)i in e||(n[i]=t[i]);return n},Yo=function(t){var e=t.parent||Xe,n=t.keyframes?c0(Sn(t.keyframes)):jn;if(Gn(t.inherit))for(;e;)n(t,e.vars.defaults),e=e.parent||e._dp;return t},h0=function(t,e){for(var n=t.length,i=n===e.length;i&&n--&&t[n]===e[n];);return n<0},_p=function(t,e,n,i,r){n===void 0&&(n="_first"),i===void 0&&(i="_last");var o=t[i],a;if(r)for(a=e[r];o&&o[r]>a;)o=o._prev;return o?(e._next=o._next,o._next=e):(e._next=t[n],t[n]=e),e._next?e._next._prev=e:t[i]=e,e._prev=o,e.parent=e._dp=t,e},ul=function(t,e,n,i){n===void 0&&(n="_first"),i===void 0&&(i="_last");var r=e._prev,o=e._next;r?r._next=o:t[n]===e&&(t[n]=o),o?o._prev=r:t[i]===e&&(t[i]=r),e._next=e._prev=e.parent=null},ws=function(t,e){t.parent&&(!e||t.parent.autoRemoveChildren)&&t.parent.remove&&t.parent.remove(t),t._act=0},Js=function(t,e){if(t&&(!e||e._end>t._dur||e._start<0))for(var n=t;n;)n._dirty=1,n=n.parent;return t},u0=function(t){for(var e=t.parent;e&&e.parent;)e._dirty=1,e.totalDuration(),e=e.parent;return t},bh=function(t,e,n,i){return t._startAt&&(_n?t._startAt.revert(ja):t.vars.immediateRender&&!t.vars.autoRevert||t._startAt.render(e,!0,i))},f0=function s(t){return!t||t._ts&&s(t.parent)},np=function(t){return t._repeat?Br(t._tTime,t=t.duration()+t._rDelay)*t:0},Br=function(t,e){var n=Math.floor(t=We(t/e));return t&&n===t?n-1:n},rl=function(t,e){return(t-e._start)*e._ts+(e._ts>=0?0:e._dirty?e.totalDuration():e._tDur)},fl=function(t){return t._end=We(t._start+(t._tDur/Math.abs(t._ts||t._rts||Pe)||0))},dl=function(t,e){var n=t._dp;return n&&n.smoothChildTiming&&t._ts&&(t._start=We(n._time-(t._ts>0?e/t._ts:((t._dirty?t.totalDuration():t._tDur)-e)/-t._ts)),fl(t),n._dirty||Js(n,t)),t},xp=function(t,e){var n;if((e._time||!e._dur&&e._initted||e._start<t._time&&(e._dur||!e.add))&&(n=rl(t.rawTime(),e),(!e._dur||na(0,e.totalDuration(),n)-e._tTime>Pe)&&e.render(n,!0)),Js(t,e)._dp&&t._initted&&t._time>=t._dur&&t._ts){if(t._dur<t.duration())for(n=t;n._dp;)n.rawTime()>=0&&n.totalTime(n._tTime),n=n._dp;t._zTime=-Pe}},Ui=function(t,e,n,i){return e.parent&&ws(e),e._start=We(($i(n)?n:!n&&ol(e)&&(!t._last||t._last._start>=t._time)?t._last?t._last._start:t._time:n||t!==Xe?ui(t,n,e):t._time)+e._delay),e._end=We(e._start+(e.totalDuration()/Math.abs(e.timeScale())||0)),_p(t,e,"_first","_last",t._sort?"_start":0),ol(e)||(t._recent=e),i||xp(t,e),t._ts<0&&dl(t,t._tTime),t},vp=function(t,e){return(Qn.ScrollTrigger||hl("scrollTrigger",e))&&Qn.ScrollTrigger.create(e,t)},yp=function(t,e,n,i,r){if(Vh(t,e,r),!t._initted)return 1;if(!n&&t._pt&&!_n&&(t._dur&&t.vars.lazy!==!1||!t._dur&&t.vars.lazy)&&dp!==Vn.frame)return Ss.push(t),t._lazy=[r,i],1},d0=function s(t){var e=t.parent;return e&&e._ts&&e._initted&&!e._lock&&(e.rawTime()<0||s(e))},ol=function(t){var e=t.data;return e==="isFromStart"||e==="isStart"},p0=function(t,e,n,i){var r=t.ratio,o=e<0||!e&&(!t._start&&d0(t)&&!(!t._initted&&ol(t))||(t._ts<0||t._dp._ts<0)&&!ol(t))?0:1,a=t._rDelay,l=0,c,h,u;if(a&&t._repeat&&(l=na(0,t._tDur,e),h=Br(l,a),t._yoyo&&h&1&&(o=1-o),h!==Br(t._tTime,a)&&(r=1-o,t.vars.repeatRefresh&&t._initted&&t.invalidate())),o!==r||_n||i||t._zTime===Pe||!e&&t._zTime){if(!t._initted&&yp(t,e,i,n,l))return;for(u=t._zTime,t._zTime=e||(n?Pe:0),n||(n=e&&!u),t.ratio=o,t._from&&(o=1-o),t._time=0,t._tTime=l,c=t._pt;c;)c.r(o,c.d),c=c._next;e<0&&bh(t,e,n,!0),t._onUpdate&&!n&&Kn(t,"onUpdate"),l&&t._repeat&&!n&&t.parent&&Kn(t,"onRepeat"),(e>=t._tDur||e<0)&&t.ratio===o&&(o&&ws(t,1),!n&&!_n&&(Kn(t,o?"onComplete":"onReverseComplete",!0),t._prom&&t._prom()))}else t._zTime||(t._zTime=e)},m0=function(t,e,n){var i;if(n>e)for(i=t._first;i&&i._start<=n;){if(i.data==="isPause"&&i._start>e)return i;i=i._next}else for(i=t._last;i&&i._start>=n;){if(i.data==="isPause"&&i._start<e)return i;i=i._prev}},kr=function(t,e,n,i){var r=t._repeat,o=We(e)||0,a=t._tTime/t._tDur;return a&&!i&&(t._time*=o/t._dur),t._dur=o,t._tDur=r?r<0?1e10:We(o*(r+1)+t._rDelay*r):o,a>0&&!i&&dl(t,t._tTime=t._tDur*a),t.parent&&fl(t),n||Js(t.parent,t),t},ip=function(t){return t instanceof Mn?Js(t):kr(t,t._dur)},g0={_start:0,endTime:Qo,totalDuration:Qo},ui=function s(t,e,n){var i=t.labels,r=t._recent||g0,o=t.duration()>=fi?r.endTime(!1):t._dur,a,l,c;return cn(e)&&(isNaN(e)||e in i)?(l=e.charAt(0),c=e.substr(-1)==="%",a=e.indexOf("="),l==="<"||l===">"?(a>=0&&(e=e.replace(/=/,"")),(l==="<"?r._start:r.endTime(r._repeat>=0))+(parseFloat(e.substr(1))||0)*(c?(a<0?r:n).totalDuration()/100:1)):a<0?(e in i||(i[e]=o),i[e]):(l=parseFloat(e.charAt(a-1)+e.substr(a+1)),c&&n&&(l=l/100*(Sn(n)?n[0]:n).totalDuration()),a>1?s(t,e.substr(0,a-1),n)+l:o+l)):e==null?o:+e},Zo=function(t,e,n){var i=$i(e[1]),r=(i?2:1)+(t<2?0:1),o=e[r],a,l;if(i&&(o.duration=e[1]),o.parent=n,t){for(a=o,l=n;l&&!("immediateRender"in a);)a=l.vars.defaults||{},l=Gn(l.vars.inherit)&&l.parent;o.immediateRender=Gn(a.immediateRender),t<2?o.runBackwards=1:o.startAt=e[r-1]}return new tn(e[0],o,e[r+1])},Ts=function(t,e){return t||t===0?e(t):e},na=function(t,e,n){return n<t?t:n>e?e:n},xn=function(t,e){return!cn(t)||!(e=r0.exec(t))?"":e[1]},_0=function(t,e,n){return Ts(n,function(i){return na(t,e,i)})},wh=[].slice,Mp=function(t,e){return t&&Ni(t)&&"length"in t&&(!e&&!t.length||t.length-1 in t&&Ni(t[0]))&&!t.nodeType&&t!==Di},x0=function(t,e,n){return n===void 0&&(n=[]),t.forEach(function(i){var r;return cn(i)&&!e||Mp(i,1)?(r=n).push.apply(r,di(i)):n.push(i)})||n},di=function(t,e,n){return ke&&!e&&ke.selector?ke.selector(t):cn(t)&&!n&&(Mh||!zr())?wh.call((e||Lh).querySelectorAll(t),0):Sn(t)?x0(t,n):Mp(t)?wh.call(t,0):t?[t]:[]},Th=function(t){return t=di(t)[0]||Ko("Invalid scope")||{},function(e){var n=t.current||t.nativeElement||t;return di(e,n.querySelectorAll?n:n===t?Ko("Invalid scope")||Lh.createElement("div"):t)}},Sp=function(t){return t.sort(function(){return .5-Math.random()})},bp=function(t){if(Ze(t))return t;var e=Ni(t)?t:{each:t},n=Ks(e.ease),i=e.from||0,r=parseFloat(e.base)||0,o={},a=i>0&&i<1,l=isNaN(i)||a,c=e.axis,h=i,u=i;return cn(i)?h=u={center:.5,edges:.5,end:1}[i]||0:!a&&l&&(h=i[0],u=i[1]),function(f,d,_){var g=(_||e).length,m=o[g],p,S,M,x,A,E,T,R,y;if(!m){if(y=e.grid==="auto"?0:(e.grid||[1,fi])[1],!y){for(T=-fi;T<(T=_[y++].getBoundingClientRect().left)&&y<g;);y<g&&y--}for(m=o[g]=[],p=l?Math.min(y,g)*h-.5:i%y,S=y===fi?0:l?g*u/y-.5:i/y|0,T=0,R=fi,E=0;E<g;E++)M=E%y-p,x=S-(E/y|0),m[E]=A=c?Math.abs(c==="y"?x:M):lp(M*M+x*x),A>T&&(T=A),A<R&&(R=A);i==="random"&&Sp(m),m.max=T-R,m.min=R,m.v=g=(parseFloat(e.amount)||parseFloat(e.each)*(y>g?g-1:c?c==="y"?g/y:y:Math.max(y,g/y))||0)*(i==="edges"?-1:1),m.b=g<0?r-g:r,m.u=xn(e.amount||e.each)||0,n=n&&g<0?I0(n):n}return g=(m[f]-m.min)/m.max||0,We(m.b+(n?n(g):g)*m.v)+m.u}},Eh=function(t){var e=Math.pow(10,((t+"").split(".")[1]||"").length);return function(n){var i=We(Math.round(parseFloat(n)/t)*t*e);return(i-i%1)/e+($i(n)?0:xn(n))}},wp=function(t,e){var n=Sn(t),i,r;return!n&&Ni(t)&&(i=n=t.radius||fi,t.values?(t=di(t.values),(r=!$i(t[0]))&&(i*=i)):t=Eh(t.increment)),Ts(e,n?Ze(t)?function(o){return r=t(o),Math.abs(r-o)<=i?r:o}:function(o){for(var a=parseFloat(r?o.x:o),l=parseFloat(r?o.y:0),c=fi,h=0,u=t.length,f,d;u--;)r?(f=t[u].x-a,d=t[u].y-l,f=f*f+d*d):f=Math.abs(t[u]-a),f<c&&(c=f,h=u);return h=!i||c<=i?t[h]:o,r||h===o||$i(o)?h:h+xn(o)}:Eh(t))},Tp=function(t,e,n,i){return Ts(Sn(t)?!e:n===!0?!!(n=0):!i,function(){return Sn(t)?t[~~(Math.random()*t.length)]:(n=n||1e-5)&&(i=n<1?Math.pow(10,(n+"").length-2):1)&&Math.floor(Math.round((t-n/2+Math.random()*(e-t+n*.99))/n)*n*i)/i})},v0=function(){for(var t=arguments.length,e=new Array(t),n=0;n<t;n++)e[n]=arguments[n];return function(i){return e.reduce(function(r,o){return o(r)},i)}},y0=function(t,e){return function(n){return t(parseFloat(n))+(e||xn(n))}},M0=function(t,e,n){return Ap(t,e,0,1,n)},Ep=function(t,e,n){return Ts(n,function(i){return t[~~e(i)]})},S0=function s(t,e,n){var i=e-t;return Sn(t)?Ep(t,s(0,t.length),e):Ts(n,function(r){return(i+(r-t)%i)%i+t})},b0=function s(t,e,n){var i=e-t,r=i*2;return Sn(t)?Ep(t,s(0,t.length-1),e):Ts(n,function(o){return o=(r+(o-t)%r)%r||0,t+(o>i?r-o:o)})},Hr=function(t){return t.replace(n0,function(e){var n=e.indexOf("[")+1,i=e.substring(n||7,n?e.indexOf("]"):e.length-1).split(i0);return Tp(n?i:+i[0],n?0:+i[1],+i[2]||1e-5)})},Ap=function(t,e,n,i,r){var o=e-t,a=i-n;return Ts(r,function(l){return n+((l-t)/o*a||0)})},w0=function s(t,e,n,i){var r=isNaN(t+e)?0:function(d){return(1-d)*t+d*e};if(!r){var o=cn(t),a={},l,c,h,u,f;if(n===!0&&(i=1)&&(n=null),o)t={p:t},e={p:e};else if(Sn(t)&&!Sn(e)){for(h=[],u=t.length,f=u-2,c=1;c<u;c++)h.push(s(t[c-1],t[c]));u--,r=function(_){_*=u;var g=Math.min(f,~~_);return h[g](_-g)},n=e}else i||(t=Fr(Sn(t)?[]:{},t));if(!h){for(l in e)zh.call(a,t,l,"get",e[l]);r=function(_){return Xh(_,a)||(o?t.p:t)}}}return Ts(n,r)},sp=function(t,e,n){var i=t.labels,r=fi,o,a,l;for(o in i)a=i[o]-e,a<0==!!n&&a&&r>(a=Math.abs(a))&&(l=o,r=a);return l},Kn=function(t,e,n){var i=t.vars,r=i[e],o=ke,a=t._ctx,l,c,h;if(r)return l=i[e+"Params"],c=i.callbackScope||t,n&&Ss.length&&il(),a&&(ke=a),h=l?r.apply(c,l):r.call(c),ke=o,h},Xo=function(t){return ws(t),t.scrollTrigger&&t.scrollTrigger.kill(!!_n),t.progress()<1&&Kn(t,"onInterrupt"),t},Or,Cp=[],Rp=function(t){if(t)if(t=!t.name&&t.default||t,Rh()||t.headless){var e=t.name,n=Ze(t),i=e&&!n&&t.init?function(){this._props=[]}:t,r={init:Qo,render:Xh,add:zh,kill:H0,modifier:z0,rawVars:0},o={targetTest:0,get:0,getSetter:pl,aliases:{},register:0};if(zr(),t!==i){if(Hn[e])return;jn(i,jn(sl(t,r),o)),Fr(i.prototype,Fr(r,sl(t,o))),Hn[i.prop=e]=i,t.targetTest&&(tl.push(i),Dh[e]=1),e=(e==="css"?"CSS":e.charAt(0).toUpperCase()+e.substr(1))+"Plugin"}fp(e,i),t.register&&t.register(bn,i,In)}else Cp.push(t)},Ue=255,qo={aqua:[0,Ue,Ue],lime:[0,Ue,0],silver:[192,192,192],black:[0,0,0],maroon:[128,0,0],teal:[0,128,128],blue:[0,0,Ue],navy:[0,0,128],white:[Ue,Ue,Ue],olive:[128,128,0],yellow:[Ue,Ue,0],orange:[Ue,165,0],gray:[128,128,128],purple:[128,0,128],green:[0,128,0],red:[Ue,0,0],pink:[Ue,192,203],cyan:[0,Ue,Ue],transparent:[Ue,Ue,Ue,0]},mh=function(t,e,n){return t+=t<0?1:t>1?-1:0,(t*6<1?e+(n-e)*t*6:t<.5?n:t*3<2?e+(n-e)*(2/3-t)*6:e)*Ue+.5|0},Pp=function(t,e,n){var i=t?$i(t)?[t>>16,t>>8&Ue,t&Ue]:0:qo.black,r,o,a,l,c,h,u,f,d,_;if(!i){if(t.substr(-1)===","&&(t=t.substr(0,t.length-1)),qo[t])i=qo[t];else if(t.charAt(0)==="#"){if(t.length<6&&(r=t.charAt(1),o=t.charAt(2),a=t.charAt(3),t="#"+r+r+o+o+a+a+(t.length===5?t.charAt(4)+t.charAt(4):"")),t.length===9)return i=parseInt(t.substr(1,6),16),[i>>16,i>>8&Ue,i&Ue,parseInt(t.substr(7),16)/255];t=parseInt(t.substr(1),16),i=[t>>16,t>>8&Ue,t&Ue]}else if(t.substr(0,3)==="hsl"){if(i=_=t.match(jd),!e)l=+i[0]%360/360,c=+i[1]/100,h=+i[2]/100,o=h<=.5?h*(c+1):h+c-h*c,r=h*2-o,i.length>3&&(i[3]*=1),i[0]=mh(l+1/3,r,o),i[1]=mh(l,r,o),i[2]=mh(l-1/3,r,o);else if(~t.indexOf("="))return i=t.match(Ph),n&&i.length<4&&(i[3]=1),i}else i=t.match(jd)||qo.transparent;i=i.map(Number)}return e&&!_&&(r=i[0]/Ue,o=i[1]/Ue,a=i[2]/Ue,u=Math.max(r,o,a),f=Math.min(r,o,a),h=(u+f)/2,u===f?l=c=0:(d=u-f,c=h>.5?d/(2-u-f):d/(u+f),l=u===r?(o-a)/d+(o<a?6:0):u===o?(a-r)/d+2:(r-o)/d+4,l*=60),i[0]=~~(l+.5),i[1]=~~(c*100+.5),i[2]=~~(h*100+.5)),n&&i.length<4&&(i[3]=1),i},Ip=function(t){var e=[],n=[],i=-1;return t.split(Zi).forEach(function(r){var o=r.match(js)||[];e.push.apply(e,o),n.push(i+=o.length+1)}),e.c=n,e},rp=function(t,e,n){var i="",r=(t+i).match(Zi),o=e?"hsla(":"rgba(",a=0,l,c,h,u;if(!r)return t;if(r=r.map(function(f){return(f=Pp(f,e,1))&&o+(e?f[0]+","+f[1]+"%,"+f[2]+"%,"+f[3]:f.join(","))+")"}),n&&(h=Ip(t),l=n.c,l.join(i)!==h.c.join(i)))for(c=t.replace(Zi,"1").split(js),u=c.length-1;a<u;a++)i+=c[a]+(~l.indexOf(a)?r.shift()||o+"0,0,0,0)":(h.length?h:r.length?r:n).shift());if(!c)for(c=t.split(Zi),u=c.length-1;a<u;a++)i+=c[a]+r[a];return i+c[u]},Zi=function(){var s="(?:\\b(?:(?:rgb|rgba|hsl|hsla)\\(.+?\\))|\\B#(?:[0-9a-f]{3,4}){1,2}\\b",t;for(t in qo)s+="|"+t+"\\b";return new RegExp(s+")","gi")}(),T0=/hsl[a]?\(/,Bh=function(t){var e=t.join(" "),n;if(Zi.lastIndex=0,Zi.test(e))return n=T0.test(e),t[1]=rp(t[1],n),t[0]=rp(t[0],n,Ip(t[1])),!0},jo,Vn=function(){var s=Date.now,t=500,e=33,n=s(),i=n,r=1e3/240,o=r,a=[],l,c,h,u,f,d,_=function g(m){var p=s()-i,S=m===!0,M,x,A,E;if((p>t||p<0)&&(n+=p-e),i+=p,A=i-n,M=A-o,(M>0||S)&&(E=++u.frame,f=A-u.time*1e3,u.time=A=A/1e3,o+=M+(M>=r?0:r-M),x=1),S||(l=c(g)),x)for(d=0;d<a.length;d++)a[d](A,f,E,m)};return u={time:0,frame:0,tick:function(){_(!0)},deltaRatio:function(m){return f/(1e3/(m||60))},wake:function(){hp&&(!Mh&&Rh()&&(Di=Mh=window,Lh=Di.document||{},Qn.gsap=bn,(Di.gsapVersions||(Di.gsapVersions=[])).push(bn.version),up(nl||Di.GreenSockGlobals||!Di.gsap&&Di||{}),Cp.forEach(Rp)),h=typeof requestAnimationFrame<"u"&&requestAnimationFrame,l&&u.sleep(),c=h||function(m){return setTimeout(m,o-u.time*1e3+1|0)},jo=1,_(2))},sleep:function(){(h?cancelAnimationFrame:clearTimeout)(l),jo=0,c=Qo},lagSmoothing:function(m,p){t=m||1/0,e=Math.min(p||33,t)},fps:function(m){r=1e3/(m||240),o=u.time*1e3+r},add:function(m,p,S){var M=p?function(x,A,E,T){m(x,A,E,T),u.remove(M)}:m;return u.remove(m),a[S?"unshift":"push"](M),zr(),M},remove:function(m,p){~(p=a.indexOf(m))&&a.splice(p,1)&&d>=p&&d--},_listeners:a},u}(),zr=function(){return!jo&&Vn.wake()},ge={},E0=/^[\d.\-M][\d.\-,\s]/,A0=/["']/g,C0=function(t){for(var e={},n=t.substr(1,t.length-3).split(":"),i=n[0],r=1,o=n.length,a,l,c;r<o;r++)l=n[r],a=r!==o-1?l.lastIndexOf(","):l.length,c=l.substr(0,a),e[i]=isNaN(c)?c.replace(A0,"").trim():+c,i=l.substr(a+1).trim();return e},R0=function(t){var e=t.indexOf("(")+1,n=t.indexOf(")"),i=t.indexOf("(",e);return t.substring(e,~i&&i<n?t.indexOf(")",n+1):n)},P0=function(t){var e=(t+"").split("("),n=ge[e[0]];return n&&e.length>1&&n.config?n.config.apply(null,~t.indexOf("{")?[C0(e[1])]:R0(t).split(",").map(mp)):ge._CE&&E0.test(t)?ge._CE("",t):n},I0=function(t){return function(e){return 1-t(1-e)}},Ks=function(t,e){return t&&(Ze(t)?t:ge[t]||P0(t))||e},er=function(t,e,n,i){n===void 0&&(n=function(l){return 1-e(1-l)}),i===void 0&&(i=function(l){return l<.5?e(l*2)/2:1-e((1-l)*2)/2});var r={easeIn:e,easeOut:n,easeInOut:i},o;return Pn(t,function(a){ge[a]=Qn[a]=r,ge[o=a.toLowerCase()]=n;for(var l in r)ge[o+(l==="easeIn"?".in":l==="easeOut"?".out":".inOut")]=ge[a+"."+l]=r[l]}),r},Lp=function(t){return function(e){return e<.5?(1-t(1-e*2))/2:.5+t((e-.5)*2)/2}},gh=function s(t,e,n){var i=e>=1?e:1,r=(n||(t?.3:.45))/(e<1?e:1),o=r/yh*(Math.asin(1/i)||0),a=function(h){return h===1?1:i*Math.pow(2,-10*h)*e0((h-o)*r)+1},l=t==="out"?a:t==="in"?function(c){return 1-a(1-c)}:Lp(a);return r=yh/r,l.config=function(c,h){return s(t,c,h)},l},_h=function s(t,e){e===void 0&&(e=1.70158);var n=function(o){return o?--o*o*((e+1)*o+e)+1:0},i=t==="out"?n:t==="in"?function(r){return 1-n(1-r)}:Lp(n);return i.config=function(r){return s(t,r)},i};Pn("Linear,Quad,Cubic,Quart,Quint,Strong",function(s,t){var e=t<5?t+1:t;er(s+",Power"+(e-1),t?function(n){return Math.pow(n,e)}:function(n){return n},function(n){return 1-Math.pow(1-n,e)},function(n){return n<.5?Math.pow(n*2,e)/2:1-Math.pow((1-n)*2,e)/2})});ge.Linear.easeNone=ge.none=ge.Linear.easeIn;er("Elastic",gh("in"),gh("out"),gh());(function(s,t){var e=1/t,n=2*e,i=2.5*e,r=function(a){return a<e?s*a*a:a<n?s*Math.pow(a-1.5/t,2)+.75:a<i?s*(a-=2.25/t)*a+.9375:s*Math.pow(a-2.625/t,2)+.984375};er("Bounce",function(o){return 1-r(1-o)},r)})(7.5625,2.75);er("Expo",function(s){return Math.pow(2,10*(s-1))*s+s*s*s*s*s*s*(1-s)});er("Circ",function(s){return-(lp(1-s*s)-1)});er("Sine",function(s){return s===1?1:-t0(s*Q_)+1});er("Back",_h("in"),_h("out"),_h());ge.SteppedEase=ge.steps=Qn.SteppedEase={config:function(t,e){t===void 0&&(t=1);var n=1/t,i=t+(e?0:1),r=e?1:0,o=1-Pe;return function(a){return((i*na(0,o,a)|0)+r)*n}}};Jo.ease=ge["quad.out"];Pn("onComplete,onUpdate,onStart,onRepeat,onReverseComplete,onInterrupt",function(s){return Uh+=s+","+s+"Params,"});var kh=function(t,e){this.id=j_++,t._gsap=this,this.target=t,this.harness=e,this.get=e?e.get:Oh,this.set=e?e.getSetter:pl},ta=function(){function s(e){this.vars=e,this._delay=+e.delay||0,(this._repeat=e.repeat===1/0?-2:e.repeat||0)&&(this._rDelay=e.repeatDelay||0,this._yoyo=!!e.yoyo||!!e.yoyoEase),this._ts=1,kr(this,+e.duration,1,1),this.data=e.data,ke&&(this._ctx=ke,ke.data.push(this)),jo||Vn.wake()}var t=s.prototype;return t.delay=function(n){return n||n===0?(this.parent&&this.parent.smoothChildTiming&&this.startTime(this._start+n-this._delay),this._delay=n,this):this._delay},t.duration=function(n){return arguments.length?this.totalDuration(this._repeat>0?n+(n+this._rDelay)*this._repeat:n):this.totalDuration()&&this._dur},t.totalDuration=function(n){return arguments.length?(this._dirty=0,kr(this,this._repeat<0?n:(n-this._repeat*this._rDelay)/(this._repeat+1))):this._tDur},t.totalTime=function(n,i){if(zr(),!arguments.length)return this._tTime;var r=this._dp;if(r&&r.smoothChildTiming&&this._ts){for(dl(this,n),!r._dp||r.parent||xp(r,this);r&&r.parent;)r.parent._time!==r._start+(r._ts>=0?r._tTime/r._ts:(r.totalDuration()-r._tTime)/-r._ts)&&r.totalTime(r._tTime,!0),r=r.parent;!this.parent&&this._dp.autoRemoveChildren&&(this._ts>0&&n<this._tDur||this._ts<0&&n>0||!this._tDur&&!n)&&Ui(this._dp,this,this._start-this._delay)}return(this._tTime!==n||!this._dur&&!i||this._initted&&Math.abs(this._zTime)===Pe||!this._initted&&this._dur&&n||!n&&!this._initted&&(this.add||this._ptLookup))&&(this._ts||(this._pTime=n),pp(this,n,i)),this},t.time=function(n,i){return arguments.length?this.totalTime(Math.min(this.totalDuration(),n+np(this))%(this._dur+this._rDelay)||(n?this._dur:0),i):this._time},t.totalProgress=function(n,i){return arguments.length?this.totalTime(this.totalDuration()*n,i):this.totalDuration()?Math.min(1,this._tTime/this._tDur):this.rawTime()>=0&&this._initted?1:0},t.progress=function(n,i){return arguments.length?this.totalTime(this.duration()*(this._yoyo&&!(this.iteration()&1)?1-n:n)+np(this),i):this.duration()?Math.min(1,this._time/this._dur):this.rawTime()>0?1:0},t.iteration=function(n,i){var r=this.duration()+this._rDelay;return arguments.length?this.totalTime(this._time+(n-1)*r,i):this._repeat?Br(this._tTime,r)+1:1},t.timeScale=function(n,i){if(!arguments.length)return this._rts===-Pe?0:this._rts;if(this._rts===n)return this;var r=this.parent&&this._ts?rl(this.parent._time,this):this._tTime,o=this._rts<0;this._rts=+n||0,this._ts=this._ps||n===-Pe?0:this._rts;var a=this.totalDuration();return(o!==this._rts<0||r>0&&r<a)&&this.totalTime(na(-Math.abs(this._delay),a,r),i!==!1),fl(this),u0(this)},t.paused=function(n){if(!arguments.length)return this._ps;if(this._ps!==n)if(this._ps=n,n)this._pTime=this._tTime||Math.max(-this._delay,this.rawTime()),this._ts=this._act=0;else{zr(),this._ts=this._rts;var i=this.parent&&!this.parent.smoothChildTiming?this.rawTime():this._tTime||this._pTime,r=this.progress()===1&&Math.abs(this._zTime)!==Pe,o;if(r)for(this._tTime-=Pe,o=this._first;o;){if(!o._dur&&o._zTime<0&&o._ts&&o._start<=i+Pe){r=!1;break}o=o._next}this.totalTime(i,r)}return this},t.startTime=function(n){if(arguments.length){this._start=We(n);var i=this.parent||this._dp;return i&&(i._sort||!this.parent)&&Ui(i,this,this._start-this._delay),this}return this._start},t.endTime=function(n){return this._start+(Gn(n)?this.totalDuration():this.duration())/Math.abs(this._ts||1)},t.rawTime=function(n){var i=this.parent||this._dp;return i?n&&(!this._ts||this._repeat&&this._time&&this.totalProgress()<1)?this._tTime%(this._dur+this._rDelay):this._ts?rl(i.rawTime(n),this):this._tTime:this._tTime},t.revert=function(n){n===void 0&&(n=a0);var i=_n;return _n=n,Fh(this)&&(this.timeline&&this.timeline.revert(n),this.totalTime(-.01,n.suppressEvents)),this.data!=="nested"&&n.kill!==!1&&this.kill(),_n=i,this},t.globalTime=function(n){for(var i=this,r=arguments.length?n:i.rawTime();i;)r=i._start+r/(Math.abs(i._ts)||1),i=i._dp;return!this.parent&&this._sat?this._sat.globalTime(n):r},t.repeat=function(n){return arguments.length?(this._repeat=n===1/0?-2:n,ip(this)):this._repeat===-2?1/0:this._repeat},t.repeatDelay=function(n){if(arguments.length){var i=this._time;return this._rDelay=n,ip(this),i?this.time(i):this}return this._rDelay},t.yoyo=function(n){return arguments.length?(this._yoyo=n,this):this._yoyo},t.seek=function(n,i){return this.totalTime(ui(this,n),Gn(i))},t.restart=function(n,i){return this.play().totalTime(n?-this._delay:0,Gn(i)),this._dur||(this._zTime=-Pe),this},t.play=function(n,i){return n!=null&&this.seek(n,i),this.reversed(!1).paused(!1)},t.reverse=function(n,i){return n!=null&&this.seek(n||this.totalDuration(),i),this.reversed(!0).paused(!1)},t.pause=function(n,i){return n!=null&&this.seek(n,i),this.paused(!0)},t.resume=function(){return this.paused(!1)},t.reversed=function(n){return arguments.length?(!!n!==this.reversed()&&this.timeScale(-this._rts||(n?-Pe:0)),this):this._rts<0},t.invalidate=function(){return this._initted=this._act=0,this._zTime=-Pe,this},t.isActive=function(){var n=this.parent||this._dp,i=this._start,r;return!!(!n||this._ts&&this._initted&&n.isActive()&&(r=n.rawTime(!0))>=i&&r<this.endTime(!0)-Pe)},t.eventCallback=function(n,i,r){var o=this.vars;return arguments.length>1?(i?(o[n]=i,r&&(o[n+"Params"]=r),n==="onUpdate"&&(this._onUpdate=i)):delete o[n],this):o[n]},t.then=function(n){var i=this,r=i._prom;return new Promise(function(o){var a=Ze(n)?n:gp,l=function(){var h=i.then;i.then=null,r&&r(),Ze(a)&&(a=a(i))&&(a.then||a===i)&&(i.then=h),o(a),i.then=h};i._initted&&i.totalProgress()===1&&i._ts>=0||!i._tTime&&i._ts<0?l():i._prom=l})},t.kill=function(){Xo(this)},s}();jn(ta.prototype,{_time:0,_start:0,_end:0,_tTime:0,_tDur:0,_dirty:0,_repeat:0,_yoyo:!1,parent:null,_initted:!1,_rDelay:0,_ts:1,_dp:0,ratio:0,_zTime:-Pe,_prom:0,_ps:!1,_rts:1});var Mn=function(s){ap(t,s);function t(n,i){var r;return n===void 0&&(n={}),r=s.call(this,n)||this,r.labels={},r.smoothChildTiming=!!n.smoothChildTiming,r.autoRemoveChildren=!!n.autoRemoveChildren,r._sort=Gn(n.sortChildren),Xe&&Ui(n.parent||Xe,Yi(r),i),n.reversed&&r.reverse(),n.paused&&r.paused(!0),n.scrollTrigger&&vp(Yi(r),n.scrollTrigger),r}var e=t.prototype;return e.to=function(i,r,o){return Zo(0,arguments,this),this},e.from=function(i,r,o){return Zo(1,arguments,this),this},e.fromTo=function(i,r,o,a){return Zo(2,arguments,this),this},e.set=function(i,r,o){return r.duration=0,r.parent=this,Yo(r).repeatDelay||(r.repeat=0),r.immediateRender=!!r.immediateRender,new tn(i,r,ui(this,o),1),this},e.call=function(i,r,o){return Ui(this,tn.delayedCall(0,i,r),o)},e.staggerTo=function(i,r,o,a,l,c,h){return o.duration=r,o.stagger=o.stagger||a,o.onComplete=c,o.onCompleteParams=h,o.parent=this,new tn(i,o,ui(this,l)),this},e.staggerFrom=function(i,r,o,a,l,c,h){return o.runBackwards=1,Yo(o).immediateRender=Gn(o.immediateRender),this.staggerTo(i,r,o,a,l,c,h)},e.staggerFromTo=function(i,r,o,a,l,c,h,u){return a.startAt=o,Yo(a).immediateRender=Gn(a.immediateRender),this.staggerTo(i,r,a,l,c,h,u)},e.render=function(i,r,o){var a=this._time,l=this._dirty?this.totalDuration():this._tDur,c=this._dur,h=i<=0?0:We(i),u=this._zTime<0!=i<0&&(this._initted||!c),f,d,_,g,m,p,S,M,x,A,E,T;if(this!==Xe&&h>l&&i>=0&&(h=l),h!==this._tTime||o||u){if(a!==this._time&&c&&(h+=this._time-a,i+=this._time-a),f=h,x=this._start,M=this._ts,p=!M,u&&(c||(a=this._zTime),(i||!r)&&(this._zTime=i)),this._repeat){if(E=this._yoyo,m=c+this._rDelay,this._repeat<-1&&i<0)return this.totalTime(m*100+i,r,o);if(f=We(h%m),h===l?(g=this._repeat,f=c):(A=We(h/m),g=~~A,g&&g===A&&(f=c,g--),f>c&&(f=c)),A=Br(this._tTime,m),!a&&this._tTime&&A!==g&&this._tTime-A*m-this._dur<=0&&(A=g),E&&g&1&&(f=c-f,T=1),g!==A&&!this._lock){var R=E&&A&1,y=R===(E&&g&1);if(g<A&&(R=!R),a=R?0:h%c?c:h,this._lock=1,this.render(a||(T?0:We(g*m)),r,!c)._lock=0,this._tTime=h,!r&&this.parent&&Kn(this,"onRepeat"),this.vars.repeatRefresh&&!T&&(this.invalidate()._lock=1,A=g),a&&a!==this._time||p!==!this._ts||this.vars.onRepeat&&!this.parent&&!this._act)return this;if(c=this._dur,l=this._tDur,y&&(this._lock=2,a=R?c:-1e-4,this.render(a,!0),this.vars.repeatRefresh&&!T&&this.invalidate()),this._lock=0,!this._ts&&!p)return this}}if(this._hasPause&&!this._forcing&&this._lock<2&&(S=m0(this,We(a),We(f)),S&&(h-=f-(f=S._start))),this._tTime=h,this._time=f,this._act=!!M,this._initted||(this._onUpdate=this.vars.onUpdate,this._initted=1,this._zTime=i,a=0),!a&&h&&c&&!r&&!A&&(Kn(this,"onStart"),this._tTime!==h))return this;if(f>=a&&i>=0)for(d=this._first;d;){if(_=d._next,(d._act||f>=d._start)&&d._ts&&S!==d){if(d.parent!==this)return this.render(i,r,o);if(d.render(d._ts>0?(f-d._start)*d._ts:(d._dirty?d.totalDuration():d._tDur)+(f-d._start)*d._ts,r,o),f!==this._time||!this._ts&&!p){S=0,_&&(h+=this._zTime=-Pe);break}}d=_}else{d=this._last;for(var v=i<0?i:f;d;){if(_=d._prev,(d._act||v<=d._end)&&d._ts&&S!==d){if(d.parent!==this)return this.render(i,r,o);if(d.render(d._ts>0?(v-d._start)*d._ts:(d._dirty?d.totalDuration():d._tDur)+(v-d._start)*d._ts,r,o||_n&&Fh(d)),f!==this._time||!this._ts&&!p){S=0,_&&(h+=this._zTime=v?-Pe:Pe);break}}d=_}}if(S&&!r&&(this.pause(),S.render(f>=a?0:-Pe)._zTime=f>=a?1:-1,this._ts))return this._start=x,fl(this),this.render(i,r,o);this._onUpdate&&!r&&Kn(this,"onUpdate",!0),(h===l&&this._tTime>=this.totalDuration()||!h&&a)&&(x===this._start||Math.abs(M)!==Math.abs(this._ts))&&(this._lock||((i||!c)&&(h===l&&this._ts>0||!h&&this._ts<0)&&ws(this,1),!r&&!(i<0&&!a)&&(h||a||!l)&&(Kn(this,h===l&&i>=0?"onComplete":"onReverseComplete",!0),this._prom&&!(h<l&&this.timeScale()>0)&&this._prom())))}return this},e.add=function(i,r){var o=this;if($i(r)||(r=ui(this,r,i)),!(i instanceof ta)){if(Sn(i))return i.forEach(function(a){return o.add(a,r)}),this;if(cn(i))return this.addLabel(i,r);if(Ze(i))i=tn.delayedCall(0,i);else return this}return this!==i?Ui(this,i,r):this},e.getChildren=function(i,r,o,a){i===void 0&&(i=!0),r===void 0&&(r=!0),o===void 0&&(o=!0),a===void 0&&(a=-fi);for(var l=[],c=this._first;c;)c._start>=a&&(c instanceof tn?r&&l.push(c):(o&&l.push(c),i&&l.push.apply(l,c.getChildren(!0,r,o)))),c=c._next;return l},e.getById=function(i){for(var r=this.getChildren(1,1,1),o=r.length;o--;)if(r[o].vars.id===i)return r[o]},e.remove=function(i){return cn(i)?this.removeLabel(i):Ze(i)?this.killTweensOf(i):(i.parent===this&&ul(this,i),i===this._recent&&(this._recent=this._last),Js(this))},e.totalTime=function(i,r){return arguments.length?(this._forcing=1,!this._dp&&this._ts&&(this._start=We(Vn.time-(this._ts>0?i/this._ts:(this.totalDuration()-i)/-this._ts))),s.prototype.totalTime.call(this,i,r),this._forcing=0,this):this._tTime},e.addLabel=function(i,r){return this.labels[i]=ui(this,r),this},e.removeLabel=function(i){return delete this.labels[i],this},e.addPause=function(i,r,o){var a=tn.delayedCall(0,r||Qo,o);return a.data="isPause",this._hasPause=1,Ui(this,a,ui(this,i))},e.removePause=function(i){var r=this._first;for(i=ui(this,i);r;)r._start===i&&r.data==="isPause"&&ws(r),r=r._next},e.killTweensOf=function(i,r,o){for(var a=this.getTweensOf(i,o),l=a.length;l--;)Ms!==a[l]&&a[l].kill(i,r);return this},e.getTweensOf=function(i,r){for(var o=[],a=di(i),l=this._first,c=$i(r),h;l;)l instanceof tn?l0(l._targets,a)&&(c?(!Ms||l._initted&&l._ts)&&l.globalTime(0)<=r&&l.globalTime(l.totalDuration())>r:!r||l.isActive())&&o.push(l):(h=l.getTweensOf(a,r)).length&&o.push.apply(o,h),l=l._next;return o},e.tweenTo=function(i,r){r=r||{};var o=this,a=ui(o,i),l=r,c=l.startAt,h=l.onStart,u=l.onStartParams,f=l.immediateRender,d,_=tn.to(o,jn({ease:r.ease||"none",lazy:!1,immediateRender:!1,time:a,overwrite:"auto",duration:r.duration||Math.abs((a-(c&&"time"in c?c.time:o._time))/o.timeScale())||Pe,onStart:function(){if(o.pause(),!d){var m=r.duration||Math.abs((a-(c&&"time"in c?c.time:o._time))/o.timeScale());_._dur!==m&&kr(_,m,0,1).render(_._time,!0,!0),d=1}h&&h.apply(_,u||[])}},r));return f?_.render(0):_},e.tweenFromTo=function(i,r,o){return this.tweenTo(r,jn({startAt:{time:ui(this,i)}},o))},e.recent=function(){return this._recent},e.nextLabel=function(i){return i===void 0&&(i=this._time),sp(this,ui(this,i))},e.previousLabel=function(i){return i===void 0&&(i=this._time),sp(this,ui(this,i),1)},e.currentLabel=function(i){return arguments.length?this.seek(i,!0):this.previousLabel(this._time+Pe)},e.shiftChildren=function(i,r,o){o===void 0&&(o=0);var a=this._first,l=this.labels,c;for(i=We(i);a;)a._start>=o&&(a._start+=i,a._end+=i),a=a._next;if(r)for(c in l)l[c]>=o&&(l[c]+=i);return Js(this)},e.invalidate=function(i){var r=this._first;for(this._lock=0;r;)r.invalidate(i),r=r._next;return s.prototype.invalidate.call(this,i)},e.clear=function(i){i===void 0&&(i=!0);for(var r=this._first,o;r;)o=r._next,this.remove(r),r=o;return this._dp&&(this._time=this._tTime=this._pTime=0),i&&(this.labels={}),Js(this)},e.totalDuration=function(i){var r=0,o=this,a=o._last,l=fi,c,h,u;if(arguments.length)return o.timeScale((o._repeat<0?o.duration():o.totalDuration())/(o.reversed()?-i:i));if(o._dirty){for(u=o.parent;a;)c=a._prev,a._dirty&&a.totalDuration(),h=a._start,h>l&&o._sort&&a._ts&&!o._lock?(o._lock=1,Ui(o,a,h-a._delay,1)._lock=0):l=h,h<0&&a._ts&&(r-=h,(!u&&!o._dp||u&&u.smoothChildTiming)&&(o._start+=We(h/o._ts),o._time-=h,o._tTime-=h),o.shiftChildren(-h,!1,-1/0),l=0),a._end>r&&a._ts&&(r=a._end),a=c;kr(o,o===Xe&&o._time>r?o._time:r,1,1),o._dirty=0}return o._tDur},t.updateRoot=function(i){if(Xe._ts&&(pp(Xe,rl(i,Xe)),dp=Vn.frame),Vn.frame>=tp){tp+=Wn.autoSleep||120;var r=Xe._first;if((!r||!r._ts)&&Wn.autoSleep&&Vn._listeners.length<2){for(;r&&!r._ts;)r=r._next;r||Vn.sleep()}}},t}(ta);jn(Mn.prototype,{_lock:0,_hasPause:0,_forcing:0});var L0=function(t,e,n,i,r,o,a){var l=new In(this._pt,t,e,0,1,Wh,null,r),c=0,h=0,u,f,d,_,g,m,p,S;for(l.b=n,l.e=i,n+="",i+="",(p=~i.indexOf("random("))&&(i=Hr(i)),o&&(S=[n,i],o(S,t,e),n=S[0],i=S[1]),f=n.match(dh)||[];u=dh.exec(i);)_=u[0],g=i.substring(c,u.index),d?d=(d+1)%5:g.substr(-5)==="rgba("&&(d=1),_!==f[h++]&&(m=parseFloat(f[h-1])||0,l._pt={_next:l._pt,p:g||h===1?g:",",s:m,c:_.charAt(1)==="="?tr(m,_)-m:parseFloat(_)-m,m:d&&d<4?Math.round:0},c=dh.lastIndex);return l.c=c<i.length?i.substring(c,i.length):"",l.fp=a,(Ih.test(i)||p)&&(l.e=0),this._pt=l,l},zh=function(t,e,n,i,r,o,a,l,c,h){Ze(i)&&(i=i(r||0,t,o));var u=t[e],f=n!=="get"?n:Ze(u)?c?t[e.indexOf("set")||!Ze(t["get"+e.substr(3)])?e:"get"+e.substr(3)](c):t[e]():u,d=Ze(u)?c?F0:Up:Gh,_;if(cn(i)&&(~i.indexOf("random(")&&(i=Hr(i)),i.charAt(1)==="="&&(_=tr(f,i)+(xn(f)||0),(_||_===0)&&(i=_))),!h||f!==i||Ah)return!isNaN(f*i)&&i!==""?(_=new In(this._pt,t,e,+f||0,i-(f||0),typeof u=="boolean"?k0:Np,0,d),c&&(_.fp=c),a&&_.modifier(a,this,t),this._pt=_):(!u&&!(e in t)&&hl(e,i),L0.call(this,t,e,f,i,d,l||Wn.stringFilter,c))},D0=function(t,e,n,i,r){if(Ze(t)&&(t=$o(t,r,e,n,i)),!Ni(t)||t.style&&t.nodeType||Sn(t)||cp(t))return cn(t)?$o(t,r,e,n,i):t;var o={},a;for(a in t)o[a]=$o(t[a],r,e,n,i);return o},Hh=function(t,e,n,i,r,o){var a,l,c,h;if(Hn[t]&&(a=new Hn[t]).init(r,a.rawVars?e[t]:D0(e[t],i,r,o,n),n,i,o)!==!1&&(n._pt=l=new In(n._pt,r,t,0,1,a.render,a,0,a.priority),n!==Or))for(c=n._ptLookup[n._targets.indexOf(r)],h=a._props.length;h--;)c[a._props[h]]=l;return a},Ms,Ah,Vh=function s(t,e,n){var i=t.vars,r=i.ease,o=i.startAt,a=i.immediateRender,l=i.lazy,c=i.onUpdate,h=i.runBackwards,u=i.yoyoEase,f=i.keyframes,d=i.autoRevert,_=t._dur,g=t._startAt,m=t._targets,p=t.parent,S=p&&p.data==="nested"?p.vars.targets:m,M=t._overwrite==="auto"&&!Ch,x=t.timeline,A=i.easeReverse||u,E,T,R,y,v,P,U,z,V,$,X,Y,W;if(x&&(!f||!r)&&(r="none"),t._ease=Ks(r,Jo.ease),t._rEase=A&&(Ks(A)||t._ease),t._from=!x&&!!i.runBackwards,t._from&&(t.ratio=1),!x||f&&!i.stagger){if(z=m[0]?bs(m[0]).harness:0,Y=z&&i[z.prop],E=sl(i,Dh),g&&(g._zTime<0&&g.progress(1),e<0&&h&&a&&!d?g.render(-1,!0):g.revert(h&&_?ja:o0),g._lazy=0),o){if(ws(t._startAt=tn.set(m,jn({data:"isStart",overwrite:!1,parent:p,immediateRender:!0,lazy:!g&&Gn(l),startAt:null,delay:0,onUpdate:c&&function(){return Kn(t,"onUpdate")},stagger:0},o))),t._startAt._dp=0,t._startAt._sat=t,e<0&&(_n||!a&&!d)&&t._startAt.revert(ja),a&&_&&e<=0&&n<=0){e&&(t._zTime=e);return}}else if(h&&_&&!g){if(e&&(a=!1),R=jn({overwrite:!1,data:"isFromStart",lazy:a&&!g&&Gn(l),immediateRender:a,stagger:0,parent:p},E),Y&&(R[z.prop]=Y),ws(t._startAt=tn.set(m,R)),t._startAt._dp=0,t._startAt._sat=t,e<0&&(_n?t._startAt.revert(ja):t._startAt.render(-1,!0)),t._zTime=e,!a)s(t._startAt,Pe,Pe);else if(!e)return}for(t._pt=t._ptCache=0,l=_&&Gn(l)||l&&!_,T=0;T<m.length;T++){if(v=m[T],U=v._gsap||Nh(m)[T]._gsap,t._ptLookup[T]=$={},Sh[U.id]&&Ss.length&&il(),X=S===m?T:S.indexOf(v),z&&(V=new z).init(v,Y||E,t,X,S)!==!1&&(t._pt=y=new In(t._pt,v,V.name,0,1,V.render,V,0,V.priority),V._props.forEach(function(it){$[it]=y}),V.priority&&(P=1)),!z||Y)for(R in E)Hn[R]&&(V=Hh(R,E,t,X,v,S))?V.priority&&(P=1):$[R]=y=zh.call(t,v,R,"get",E[R],X,S,0,i.stringFilter);t._op&&t._op[T]&&t.kill(v,t._op[T]),M&&t._pt&&(Ms=t,Xe.killTweensOf(v,$,t.globalTime(e)),W=!t.parent,Ms=0),t._pt&&l&&(Sh[U.id]=1)}P&&qh(t),t._onInit&&t._onInit(t)}t._onUpdate=c,t._initted=(!t._op||t._pt)&&!W,f&&e<=0&&x.render(fi,!0,!0)},U0=function(t,e,n,i,r,o,a,l){var c=(t._pt&&t._ptCache||(t._ptCache={}))[e],h,u,f,d;if(!c)for(c=t._ptCache[e]=[],f=t._ptLookup,d=t._targets.length;d--;){if(h=f[d][e],h&&h.d&&h.d._pt)for(h=h.d._pt;h&&h.p!==e&&h.fp!==e;)h=h._next;if(!h)return Ah=1,t.vars[e]="+=0",Vh(t,a),Ah=0,l?Ko(e+" not eligible for reset. Try splitting into individual properties"):1;c.push(h)}for(d=c.length;d--;)u=c[d],h=u._pt||u,h.s=(i||i===0)&&!r?i:h.s+(i||0)+o*h.c,h.c=n-h.s,u.e&&(u.e=$e(n)+xn(u.e)),u.b&&(u.b=h.s+xn(u.b))},N0=function(t,e){var n=t[0]?bs(t[0]).harness:0,i=n&&n.aliases,r,o,a,l;if(!i)return e;r=Fr({},e);for(o in i)if(o in r)for(l=i[o].split(","),a=l.length;a--;)r[l[a]]=r[o];return r},O0=function(t,e,n,i){var r=e.ease||i||"power1.inOut",o,a;if(Sn(e))a=n[t]||(n[t]=[]),e.forEach(function(l,c){return a.push({t:c/(e.length-1)*100,v:l,e:r})});else for(o in e)a=n[o]||(n[o]=[]),o==="ease"||a.push({t:parseFloat(t),v:e[o],e:r})},$o=function(t,e,n,i,r){return Ze(t)?t.call(e,n,i,r):cn(t)&&~t.indexOf("random(")?Hr(t):t},al=Uh+"repeat,repeatDelay,yoyo,repeatRefresh,yoyoEase,easeReverse,autoRevert",Dp={};Pn(al+",id,stagger,delay,duration,paused,scrollTrigger",function(s){return Dp[s]=1});al=al.split(",");var tn=function(s){ap(t,s);function t(n,i,r,o){var a;typeof i=="number"&&(r.duration=i,i=r,r=null),a=s.call(this,o?i:Yo(i))||this;var l=a.vars,c=l.duration,h=l.delay,u=l.immediateRender,f=l.stagger,d=l.overwrite,_=l.keyframes,g=l.defaults,m=l.scrollTrigger,p=i.parent||Xe,S=(Sn(n)||cp(n)?$i(n[0]):"length"in i)?[n]:di(n),M,x,A,E,T,R,y,v;if(a._targets=S.length?Nh(S):Ko("GSAP target "+n+" not found. https://gsap.com",!Wn.nullTargetWarn)||[],a._ptLookup=[],a._overwrite=d,_||f||Qa(c)||Qa(h)){i=a.vars;var P=i.easeReverse||i.yoyoEase;if(M=a.timeline=new Mn({data:"nested",defaults:g||{},targets:p&&p.data==="nested"?p.vars.targets:S}),M.kill(),M.parent=M._dp=Yi(a),M._start=0,f||Qa(c)||Qa(h)){if(E=S.length,y=f&&bp(f),Ni(f))for(T in f)~al.indexOf(T)&&(v||(v={}),v[T]=f[T]);for(x=0;x<E;x++)A=sl(i,Dp),A.stagger=0,P&&(A.easeReverse=P),v&&Fr(A,v),R=S[x],A.duration=+$o(c,Yi(a),x,R,S),A.delay=(+$o(h,Yi(a),x,R,S)||0)-a._delay,!f&&E===1&&A.delay&&(a._delay=h=A.delay,a._start+=h,A.delay=0),M.to(R,A,y?y(x,R,S):0),M._ease=ge.none;M.duration()?c=h=0:a.timeline=0}else if(_){Yo(jn(M.vars.defaults,{ease:"none"})),M._ease=Ks(_.ease||i.ease||"none");var U=0,z,V,$;if(Sn(_))_.forEach(function(X){return M.to(S,X,">")}),M.duration();else{A={};for(T in _)T==="ease"||T==="easeEach"||O0(T,_[T],A,_.easeEach);for(T in A)for(z=A[T].sort(function(X,Y){return X.t-Y.t}),U=0,x=0;x<z.length;x++)V=z[x],$={ease:V.e,duration:(V.t-(x?z[x-1].t:0))/100*c},$[T]=V.v,M.to(S,$,U),U+=$.duration;M.duration()<c&&M.to({},{duration:c-M.duration()})}}c||a.duration(c=M.duration())}else a.timeline=0;return d===!0&&!Ch&&(Ms=Yi(a),Xe.killTweensOf(S),Ms=0),Ui(p,Yi(a),r),i.reversed&&a.reverse(),i.paused&&a.paused(!0),(u||!c&&!_&&a._start===We(p._time)&&Gn(u)&&f0(Yi(a))&&p.data!=="nested")&&(a._tTime=-Pe,a.render(Math.max(0,-h)||0)),m&&vp(Yi(a),m),a}var e=t.prototype;return e.render=function(i,r,o){var a=this._time,l=this._tDur,c=this._dur,h=i<0,u=i>l-Pe&&!h?l:i<Pe?0:i,f,d,_,g,m,p,S,M;if(!c)p0(this,i,r,o);else if(u!==this._tTime||!i||o||!this._initted&&this._tTime||this._startAt&&this._zTime<0!==h||this._lazy){if(f=u,M=this.timeline,this._repeat){if(g=c+this._rDelay,this._repeat<-1&&h)return this.totalTime(g*100+i,r,o);if(f=We(u%g),u===l?(_=this._repeat,f=c):(m=We(u/g),_=~~m,_&&_===m?(f=c,_--):f>c&&(f=c)),p=this._yoyo&&_&1,p&&(f=c-f),m=Br(this._tTime,g),f===a&&!o&&this._initted&&_===m)return this._tTime=u,this;_!==m&&this.vars.repeatRefresh&&!p&&!this._lock&&f!==g&&this._initted&&(this._lock=o=1,this.render(We(g*_),!0).invalidate()._lock=0)}if(!this._initted){if(yp(this,h?i:f,o,r,u))return this._tTime=0,this;if(a!==this._time&&!(o&&this.vars.repeatRefresh&&_!==m))return this;if(c!==this._dur)return this.render(i,r,o)}if(this._rEase){var x=f<a;if(x!==this._inv){var A=x?a:c-a;this._inv=x,this._from&&(this.ratio=1-this.ratio),this._invRatio=this.ratio,this._invTime=a,this._invRecip=A?(x?-1:1)/A:0,this._invScale=x?-this.ratio:1-this.ratio,this._invEase=x?this._rEase:this._ease}this.ratio=S=this._invRatio+this._invScale*this._invEase((f-this._invTime)*this._invRecip)}else this.ratio=S=this._ease(f/c);if(this._from&&(this.ratio=S=1-S),this._tTime=u,this._time=f,!this._act&&this._ts&&(this._act=1,this._lazy=0),!a&&u&&!r&&!m&&(Kn(this,"onStart"),this._tTime!==u))return this;for(d=this._pt;d;)d.r(S,d.d),d=d._next;M&&M.render(i<0?i:M._dur*M._ease(f/this._dur),r,o)||this._startAt&&(this._zTime=i),this._onUpdate&&!r&&(h&&bh(this,i,r,o),Kn(this,"onUpdate")),this._repeat&&_!==m&&this.vars.onRepeat&&!r&&this.parent&&Kn(this,"onRepeat"),(u===this._tDur||!u)&&this._tTime===u&&(h&&!this._onUpdate&&bh(this,i,!0,!0),(i||!c)&&(u===this._tDur&&this._ts>0||!u&&this._ts<0)&&ws(this,1),!r&&!(h&&!a)&&(u||a||p)&&(Kn(this,u===l?"onComplete":"onReverseComplete",!0),this._prom&&!(u<l&&this.timeScale()>0)&&this._prom()))}return this},e.targets=function(){return this._targets},e.invalidate=function(i){return(!i||!this.vars.runBackwards)&&(this._startAt=0),this._pt=this._op=this._onUpdate=this._lazy=this.ratio=0,this._ptLookup=[],this.timeline&&this.timeline.invalidate(i),s.prototype.invalidate.call(this,i)},e.resetTo=function(i,r,o,a,l){jo||Vn.wake(),this._ts||this.play();var c=Math.min(this._dur,(this._dp._time-this._start)*this._ts),h;return this._initted||Vh(this,c),h=this._ease(c/this._dur),U0(this,i,r,o,a,h,c,l)?this.resetTo(i,r,o,a,1):(dl(this,0),this.parent||_p(this._dp,this,"_first","_last",this._dp._sort?"_start":0),this.render(0))},e.kill=function(i,r){if(r===void 0&&(r="all"),!i&&(!r||r==="all"))return this._lazy=this._pt=0,this.parent?Xo(this):this.scrollTrigger&&this.scrollTrigger.kill(!!_n),this;if(this.timeline){var o=this.timeline.totalDuration();return this.timeline.killTweensOf(i,r,Ms&&Ms.vars.overwrite!==!0)._first||Xo(this),this.parent&&o!==this.timeline.totalDuration()&&kr(this,this._dur*this.timeline._tDur/o,0,1),this}var a=this._targets,l=i?di(i):a,c=this._ptLookup,h=this._pt,u,f,d,_,g,m,p;if((!r||r==="all")&&h0(a,l))return r==="all"&&(this._pt=0),Xo(this);for(u=this._op=this._op||[],r!=="all"&&(cn(r)&&(g={},Pn(r,function(S){return g[S]=1}),r=g),r=N0(a,r)),p=a.length;p--;)if(~l.indexOf(a[p])){f=c[p],r==="all"?(u[p]=r,_=f,d={}):(d=u[p]=u[p]||{},_=r);for(g in _)m=f&&f[g],m&&((!("kill"in m.d)||m.d.kill(g)===!0)&&ul(this,m,"_pt"),delete f[g]),d!=="all"&&(d[g]=1)}return this._initted&&!this._pt&&h&&Xo(this),this},t.to=function(i,r){return new t(i,r,arguments[2])},t.from=function(i,r){return Zo(1,arguments)},t.delayedCall=function(i,r,o,a){return new t(r,0,{immediateRender:!1,lazy:!1,overwrite:!1,delay:i,onComplete:r,onReverseComplete:r,onCompleteParams:o,onReverseCompleteParams:o,callbackScope:a})},t.fromTo=function(i,r,o){return Zo(2,arguments)},t.set=function(i,r){return r.duration=0,r.repeatDelay||(r.repeat=0),new t(i,r)},t.killTweensOf=function(i,r,o){return Xe.killTweensOf(i,r,o)},t}(ta);jn(tn.prototype,{_targets:[],_lazy:0,_startAt:0,_op:0,_onInit:0});Pn("staggerTo,staggerFrom,staggerFromTo",function(s){tn[s]=function(){var t=new Mn,e=wh.call(arguments,0);return e.splice(s==="staggerFromTo"?5:4,0,0),t[s].apply(t,e)}});var Gh=function(t,e,n){return t[e]=n},Up=function(t,e,n){return t[e](n)},F0=function(t,e,n,i){return t[e](i.fp,n)},B0=function(t,e,n){return t.setAttribute(e,n)},pl=function(t,e){return Ze(t[e])?Up:cl(t[e])&&t.setAttribute?B0:Gh},Np=function(t,e){return e.set(e.t,e.p,Math.round((e.s+e.c*t)*1e6)/1e6,e)},k0=function(t,e){return e.set(e.t,e.p,!!(e.s+e.c*t),e)},Wh=function(t,e){var n=e._pt,i="";if(!t&&e.b)i=e.b;else if(t===1&&e.e)i=e.e;else{for(;n;)i=n.p+(n.m?n.m(n.s+n.c*t):Math.round((n.s+n.c*t)*1e4)/1e4)+i,n=n._next;i+=e.c}e.set(e.t,e.p,i,e)},Xh=function(t,e){for(var n=e._pt;n;)n.r(t,n.d),n=n._next},z0=function(t,e,n,i){for(var r=this._pt,o;r;)o=r._next,r.p===i&&r.modifier(t,e,n),r=o},H0=function(t){for(var e=this._pt,n,i;e;)i=e._next,e.p===t&&!e.op||e.op===t?ul(this,e,"_pt"):e.dep||(n=1),e=i;return!n},V0=function(t,e,n,i){i.mSet(t,e,i.m.call(i.tween,n,i.mt),i)},qh=function(t){for(var e=t._pt,n,i,r,o;e;){for(n=e._next,i=r;i&&i.pr>e.pr;)i=i._next;(e._prev=i?i._prev:o)?e._prev._next=e:r=e,(e._next=i)?i._prev=e:o=e,e=n}t._pt=r},In=function(){function s(e,n,i,r,o,a,l,c,h){this.t=n,this.s=r,this.c=o,this.p=i,this.r=a||Np,this.d=l||this,this.set=c||Gh,this.pr=h||0,this._next=e,e&&(e._prev=this)}var t=s.prototype;return t.modifier=function(n,i,r){this.mSet=this.mSet||this.set,this.set=V0,this.m=n,this.mt=r,this.tween=i},s}();Pn(Uh+"parent,duration,ease,delay,overwrite,runBackwards,startAt,yoyo,immediateRender,repeat,repeatDelay,data,paused,reversed,lazy,callbackScope,stringFilter,id,yoyoEase,stagger,inherit,repeatRefresh,keyframes,autoRevert,scrollTrigger,easeReverse",function(s){return Dh[s]=1});Qn.TweenMax=Qn.TweenLite=tn;Qn.TimelineLite=Qn.TimelineMax=Mn;Xe=new Mn({sortChildren:!1,defaults:Jo,autoRemoveChildren:!0,id:"root",smoothChildTiming:!0});Wn.stringFilter=Bh;var Qs=[],el={},G0=[],op=0,W0=0,xh=function(t){return(el[t]||G0).map(function(e){return e()})},ea=function(){var t=Date.now(),e=[];t-op>2&&(xh("matchMediaInit"),Qs.forEach(function(n){var i=n.queries,r=n.conditions,o,a,l,c;for(a in i)o=Di.matchMedia(i[a]).matches,o&&(l=1),o!==r[a]&&(r[a]=o,c=1);c&&(n.revert(),l&&e.push(n))}),xh("matchMediaRevert"),e.forEach(function(n){return n.onMatch(n,function(i){return n.add(null,i)})}),op=t,xh("matchMedia"))},Op=function(){function s(e,n){this.selector=n&&Th(n),this.data=[],this._r=[],this.isReverted=!1,this.id=W0++,e&&this.add(e)}var t=s.prototype;return t.add=function(n,i,r){Ze(n)&&(r=i,i=n,n=Ze);var o=this,a=function(){var c=ke,h=o.selector,u;return c&&c!==o&&c.data.push(o),r&&(o.selector=Th(r)),ke=o,u=i.apply(o,arguments),Ze(u)&&o._r.push(u),ke=c,o.selector=h,o.isReverted=!1,u};return o.last=a,n===Ze?a(o,function(l){return o.add(null,l)}):n?o[n]=a:a},t.ignore=function(n){var i=ke;ke=null,n(this),ke=i},t.getTweens=function(){var n=[];return this.data.forEach(function(i){return i instanceof s?n.push.apply(n,i.getTweens()):i instanceof tn&&!(i.parent&&i.parent.data==="nested")&&n.push(i)}),n},t.clear=function(){this._r.length=this.data.length=0},t.kill=function(n,i){var r=this;if(n?function(){for(var a=r.getTweens(),l=r.data.length,c;l--;)c=r.data[l],c.data==="isFlip"&&(c.revert(),c.getChildren(!0,!0,!1).forEach(function(h){return a.splice(a.indexOf(h),1)}));for(a.map(function(h){return{g:h._dur||h._delay||h._sat&&!h._sat.vars.immediateRender?h.globalTime(0):-1/0,t:h}}).sort(function(h,u){return u.g-h.g||-1/0}).forEach(function(h){return h.t.revert(n)}),l=r.data.length;l--;)c=r.data[l],c instanceof Mn?c.data!=="nested"&&(c.scrollTrigger&&c.scrollTrigger.revert(),c.kill()):!(c instanceof tn)&&c.revert&&c.revert(n);r._r.forEach(function(h){return h(n,r)}),r.isReverted=!0}():this.data.forEach(function(a){return a.kill&&a.kill()}),this.clear(),i){for(var o=Qs.length;o--;)Qs[o].id===this.id&&Qs.splice(o,1);this._mqs&&this._mqs.forEach(function(a){return a.removeListener?a.removeListener(ea):a.removeEventListener("change",ea)}),this._mqs=null}},t.revert=function(n){this.kill(n||{})},s}(),X0=function(){function s(e){this.contexts=[],this.scope=e,ke&&ke.data.push(this)}var t=s.prototype;return t.add=function(n,i,r){Ni(n)||(n={matches:n});var o=new Op(0,r||this.scope),a=o.conditions={},l,c,h;ke&&!o.selector&&(o.selector=ke.selector),this.contexts.push(o),i=o.add("onMatch",i),o.queries=n;for(c in n)c==="all"?h=1:(l=Di.matchMedia(n[c]),l&&(Qs.indexOf(o)<0&&Qs.push(o),(a[c]=l.matches)&&(h=1),l.addListener?l.addListener(ea):l.addEventListener("change",ea),(o._mqs||(o._mqs=[])).push(l)));return h&&i(o,function(u){return o.add(null,u)}),this},t.revert=function(n){this.kill(n||{})},t.kill=function(n){this.contexts.forEach(function(i){return i.kill(n,!0)})},s}(),ll={registerPlugin:function(){for(var t=arguments.length,e=new Array(t),n=0;n<t;n++)e[n]=arguments[n];e.forEach(function(i){return Rp(i)})},timeline:function(t){return new Mn(t)},getTweensOf:function(t,e){return Xe.getTweensOf(t,e)},getProperty:function(t,e,n,i){cn(t)&&(t=di(t)[0]);var r=bs(t||{}).get,o=n?gp:mp;return n==="native"&&(n=""),t&&(e?o((Hn[e]&&Hn[e].get||r)(t,e,n,i)):function(a,l,c){return o((Hn[a]&&Hn[a].get||r)(t,a,l,c))})},quickSetter:function(t,e,n){if(t=di(t),t.length>1){var i=t.map(function(h){return bn.quickSetter(h,e,n)}),r=i.length;return function(h){for(var u=r;u--;)i[u](h)}}t=t[0]||{};var o=Hn[e],a=bs(t),l=a.harness&&(a.harness.aliases||{})[e]||e,c=o?function(h){var u=new o;Or._pt=0,u.init(t,n?h+n:h,Or,0,[t]),u.render(1,u),Or._pt&&Xh(1,Or)}:a.set(t,l);return o?c:function(h){return c(t,l,n?h+n:h,a,1)}},quickTo:function(t,e,n){var i,r=bn.to(t,jn((i={},i[e]="+=0.1",i.paused=!0,i.stagger=0,i),n||{})),o=function(l,c,h){return r.resetTo(e,l,c,h)};return o.tween=r,o},isTweening:function(t){return Xe.getTweensOf(t,!0).length>0},defaults:function(t){return t&&t.ease&&(t.ease=Ks(t.ease,Jo.ease)),ep(Jo,t||{})},config:function(t){return ep(Wn,t||{})},registerEffect:function(t){var e=t.name,n=t.effect,i=t.plugins,r=t.defaults,o=t.extendTimeline;(i||"").split(",").forEach(function(a){return a&&!Hn[a]&&!Qn[a]&&Ko(e+" effect requires "+a+" plugin.")}),ph[e]=function(a,l,c){return n(di(a),jn(l||{},r),c)},o&&(Mn.prototype[e]=function(a,l,c){return this.add(ph[e](a,Ni(l)?l:(c=l)&&{},this),c)})},registerEase:function(t,e){ge[t]=Ks(e)},parseEase:function(t,e){return arguments.length?Ks(t,e):ge},getById:function(t){return Xe.getById(t)},exportRoot:function(t,e){t===void 0&&(t={});var n=new Mn(t),i,r;for(n.smoothChildTiming=Gn(t.smoothChildTiming),Xe.remove(n),n._dp=0,n._time=n._tTime=Xe._time,i=Xe._first;i;)r=i._next,(e||!(!i._dur&&i instanceof tn&&i.vars.onComplete===i._targets[0]))&&Ui(n,i,i._start-i._delay),i=r;return Ui(Xe,n,0),n},context:function(t,e){return t?new Op(t,e):ke},matchMedia:function(t){return new X0(t)},matchMediaRefresh:function(){return Qs.forEach(function(t){var e=t.conditions,n,i;for(i in e)e[i]&&(e[i]=!1,n=1);n&&t.revert()})||ea()},addEventListener:function(t,e){var n=el[t]||(el[t]=[]);~n.indexOf(e)||n.push(e)},removeEventListener:function(t,e){var n=el[t],i=n&&n.indexOf(e);i>=0&&n.splice(i,1)},utils:{wrap:S0,wrapYoyo:b0,distribute:bp,random:Tp,snap:wp,normalize:M0,getUnit:xn,clamp:_0,splitColor:Pp,toArray:di,selector:Th,mapRange:Ap,pipe:v0,unitize:y0,interpolate:w0,shuffle:Sp},install:up,effects:ph,ticker:Vn,updateRoot:Mn.updateRoot,plugins:Hn,globalTimeline:Xe,core:{PropTween:In,globals:fp,Tween:tn,Timeline:Mn,Animation:ta,getCache:bs,_removeLinkedListItem:ul,reverting:function(){return _n},context:function(t){return t&&ke&&(ke.data.push(t),t._ctx=ke),ke},suppressOverwrites:function(t){return Ch=t}}};Pn("to,from,fromTo,delayedCall,set,killTweensOf",function(s){return ll[s]=tn[s]});Vn.add(Mn.updateRoot);Or=ll.to({},{duration:0});var q0=function(t,e){for(var n=t._pt;n&&n.p!==e&&n.op!==e&&n.fp!==e;)n=n._next;return n},Y0=function(t,e){var n=t._targets,i,r,o;for(i in e)for(r=n.length;r--;)o=t._ptLookup[r][i],o&&(o=o.d)&&(o._pt&&(o=q0(o,i)),o&&o.modifier&&o.modifier(e[i],t,n[r],i))},vh=function(t,e){return{name:t,headless:1,rawVars:1,init:function(i,r,o){o._onInit=function(a){var l,c;if(cn(r)&&(l={},Pn(r,function(h){return l[h]=1}),r=l),e){l={};for(c in r)l[c]=e(r[c]);r=l}Y0(a,r)}}}},bn=ll.registerPlugin({name:"attr",init:function(t,e,n,i,r){var o,a,l;this.tween=n;for(o in e)l=t.getAttribute(o)||"",a=this.add(t,"setAttribute",(l||0)+"",e[o],i,r,0,0,o),a.op=o,a.b=l,this._props.push(o)},render:function(t,e){for(var n=e._pt;n;)_n?n.set(n.t,n.p,n.b,n):n.r(t,n.d),n=n._next}},{name:"endArray",headless:1,init:function(t,e){for(var n=e.length;n--;)this.add(t,n,t[n]||0,e[n],0,0,0,0,0,1)}},vh("roundProps",Eh),vh("modifiers"),vh("snap",wp))||ll;tn.version=Mn.version=bn.version="3.15.1";hp=1;Rh()&&zr();var Z0=ge.Power0,$0=ge.Power1,J0=ge.Power2,K0=ge.Power3,Q0=ge.Power4,j0=ge.Linear,tx=ge.Quad,ex=ge.Cubic,nx=ge.Quart,ix=ge.Quint,sx=ge.Strong,rx=ge.Elastic,ox=ge.Back,ax=ge.SteppedEase,lx=ge.Bounce,cx=ge.Sine,hx=ge.Expo,ux=ge.Circ;var Fp,Es,Gr,Qh,rr,fx,Bp,jh,dx=function(){return typeof window<"u"},Ki={},sr=180/Math.PI,Wr=Math.PI/180,Vr=Math.atan2,kp=1e8,tu=/([A-Z])/g,px=/(left|right|width|margin|padding|x)/i,mx=/[\s,\(]\S/,Oi={autoAlpha:"opacity,visibility",scale:"scaleX,scaleY",alpha:"opacity"},Zh=function(t,e){return e.set(e.t,e.p,Math.round((e.s+e.c*t)*1e4)/1e4+e.u,e)},gx=function(t,e){return e.set(e.t,e.p,t===1?e.e:Math.round((e.s+e.c*t)*1e4)/1e4+e.u,e)},_x=function(t,e){return e.set(e.t,e.p,t?Math.round((e.s+e.c*t)*1e4)/1e4+e.u:e.b,e)},xx=function(t,e){return e.set(e.t,e.p,t===1?e.e:t?Math.round((e.s+e.c*t)*1e4)/1e4+e.u:e.b,e)},vx=function(t,e){var n=e.s+e.c*t;e.set(e.t,e.p,~~(n+(n<0?-.5:.5))+e.u,e)},Yp=function(t,e){return e.set(e.t,e.p,t?e.e:e.b,e)},Zp=function(t,e){return e.set(e.t,e.p,t!==1?e.b:e.e,e)},yx=function(t,e,n){return t.style[e]=n},Mx=function(t,e,n){return t.style.setProperty(e,n)},Sx=function(t,e,n){return t._gsap[e]=n},bx=function(t,e,n){return t._gsap.scaleX=t._gsap.scaleY=n},wx=function(t,e,n,i,r){var o=t._gsap;o.scaleX=o.scaleY=n,o.renderTransform(r,o)},Tx=function(t,e,n,i,r){var o=t._gsap;o[e]=n,o.renderTransform(r,o)},qe="transform",Xn=qe+"Origin",Ex=function s(t,e){var n=this,i=this.target,r=i.style,o=i._gsap;if(t in Ki&&r){if(this.tfm=this.tfm||{},t!=="transform")t=Oi[t]||t,~t.indexOf(",")?t.split(",").forEach(function(a){return n.tfm[a]=Ji(i,a)}):this.tfm[t]=o.x?o[t]:Ji(i,t),t===Xn&&(this.tfm.zOrigin=o.zOrigin);else return Oi.transform.split(",").forEach(function(a){return s.call(n,a,e)});if(this.props.indexOf(qe)>=0)return;o.svg&&(this.svgo=i.getAttribute("data-svg-origin"),this.props.push(Xn,e,"")),t=qe}(r||e)&&this.props.push(t,e,r[t])},$p=function(t){t.translate&&(t.removeProperty("translate"),t.removeProperty("scale"),t.removeProperty("rotate"))},Ax=function(){var t=this.props,e=this.target,n=e.style,i=e._gsap,r,o;for(r=0;r<t.length;r+=3)t[r+1]?t[r+1]===2?e[t[r]](t[r+2]):e[t[r]]=t[r+2]:t[r+2]?n[t[r]]=t[r+2]:n.removeProperty(t[r].substr(0,2)==="--"?t[r]:t[r].replace(tu,"-$1").toLowerCase());if(this.tfm){for(o in this.tfm)i[o]=this.tfm[o];i.svg&&(i.renderTransform(),e.setAttribute("data-svg-origin",this.svgo||"")),r=jh(),(!r||!r.isStart)&&!n[qe]&&($p(n),i.zOrigin&&n[Xn]&&(n[Xn]+=" "+i.zOrigin+"px",i.zOrigin=0,i.renderTransform()),i.uncache=1)}},Jp=function(t,e){var n={target:t,props:[],revert:Ax,save:Ex};return t._gsap||bn.core.getCache(t),e&&t.style&&t.nodeType&&e.split(",").forEach(function(i){return n.save(i)}),n},Kp,$h=function(t,e){var n=Es.createElementNS?Es.createElementNS((e||"http://www.w3.org/1999/xhtml").replace(/^https/,"http"),t):Es.createElement(t);return n&&n.style?n:Es.createElement(t)},ti=function s(t,e,n){var i=getComputedStyle(t);return i[e]||i.getPropertyValue(e.replace(tu,"-$1").toLowerCase())||i.getPropertyValue(e)||!n&&s(t,Xr(e)||e,1)||""},zp="O,Moz,ms,Ms,Webkit".split(","),Xr=function(t,e,n){var i=e||rr,r=i.style,o=5;if(t in r&&!n)return t;for(t=t.charAt(0).toUpperCase()+t.substr(1);o--&&!(zp[o]+t in r););return o<0?null:(o===3?"ms":o>=0?zp[o]:"")+t},Jh=function(){dx()&&window.document&&(Fp=window,Es=Fp.document,Gr=Es.documentElement,rr=$h("div")||{style:{}},fx=$h("div"),qe=Xr(qe),Xn=qe+"Origin",rr.style.cssText="border-width:0;line-height:0;position:absolute;padding:0",Kp=!!Xr("perspective"),jh=bn.core.reverting,Qh=1)},Hp=function(t){var e=t.ownerSVGElement,n=$h("svg",e&&e.getAttribute("xmlns")||"http://www.w3.org/2000/svg"),i=t.cloneNode(!0),r;i.style.display="block",n.appendChild(i),Gr.appendChild(n);try{r=i.getBBox()}catch{}return n.removeChild(i),Gr.removeChild(n),r},Vp=function(t,e){for(var n=e.length;n--;)if(t.hasAttribute(e[n]))return t.getAttribute(e[n])},Qp=function(t){var e,n;try{e=t.getBBox()}catch{e=Hp(t),n=1}return e&&(e.width||e.height)||n||(e=Hp(t)),e&&!e.width&&!e.x&&!e.y?{x:+Vp(t,["x","cx","x1"])||0,y:+Vp(t,["y","cy","y1"])||0,width:0,height:0}:e},jp=function(t){return!!(t.getCTM&&(!t.parentNode||t.ownerSVGElement)&&Qp(t))},Cs=function(t,e){if(e){var n=t.style,i;e in Ki&&e!==Xn&&(e=qe),n.removeProperty?(i=e.substr(0,2),(i==="ms"||e.substr(0,6)==="webkit")&&(e="-"+e),n.removeProperty(i==="--"?e:e.replace(tu,"-$1").toLowerCase())):n.removeAttribute(e)}},As=function(t,e,n,i,r,o){var a=new In(t._pt,e,n,0,1,o?Zp:Yp);return t._pt=a,a.b=i,a.e=r,t._props.push(n),a},Gp={deg:1,rad:1,turn:1},Cx={grid:1,flex:1},Rs=function s(t,e,n,i){var r=parseFloat(n)||0,o=(n+"").trim().substr((r+"").length)||"px",a=rr.style,l=px.test(e),c=t.tagName.toLowerCase()==="svg",h=(c?"client":"offset")+(l?"Width":"Height"),u=100,f=i==="px",d=i==="%",_,g,m,p;if(i===o||!r||Gp[i]||Gp[o])return r;if(o!=="px"&&!f&&(r=s(t,e,n,"px")),p=t.getCTM&&jp(t),(d||o==="%")&&(Ki[e]||~e.indexOf("adius")))return _=p?t.getBBox()[l?"width":"height"]:t[h],$e(d?r/_*u:r/100*_);if(a[l?"width":"height"]=u+(f?o:i),g=i!=="rem"&&~e.indexOf("adius")||i==="em"&&t.appendChild&&!c?t:t.parentNode,p&&(g=(t.ownerSVGElement||{}).parentNode),(!g||g===Es||!g.appendChild)&&(g=Es.body),m=g._gsap,m&&d&&m.width&&l&&m.time===Vn.time&&!m.uncache)return $e(r/m.width*u);if(d&&(e==="height"||e==="width")){var S=t.style[e];t.style[e]=u+i,_=t[h],S?t.style[e]=S:Cs(t,e)}else(d||o==="%")&&!Cx[ti(g,"display")]&&(a.position=ti(t,"position")),g===t&&(a.position="static"),g.appendChild(rr),_=rr[h],g.removeChild(rr),a.position="absolute";return l&&d&&(m=bs(g),m.time=Vn.time,m.width=g[h]),$e(f?_*r/u:_&&r?u/_*r:0)},Ji=function(t,e,n,i){var r;return Qh||Jh(),e in Oi&&e!=="transform"&&(e=Oi[e],~e.indexOf(",")&&(e=e.split(",")[0])),Ki[e]&&e!=="transform"?(r=ra(t,i),r=e!=="transformOrigin"?r[e]:r.svg?r.origin:gl(ti(t,Xn))+" "+r.zOrigin+"px"):(r=t.style[e],(!r||r==="auto"||i||~(r+"").indexOf("calc("))&&(r=ml[e]&&ml[e](t,e,n)||ti(t,e)||Oh(t,e)||(e==="opacity"?1:0))),n&&!~(r+"").trim().indexOf(" ")?Rs(t,e,r,n)+n:r},Rx=function(t,e,n,i){if(!n||n==="none"){var r=Xr(e,t,1),o=r&&ti(t,r,1);o&&o!==n?(e=r,n=o):e==="borderColor"&&(n=ti(t,"borderTopColor"))}var a=new In(this._pt,t.style,e,0,1,Wh),l=0,c=0,h,u,f,d,_,g,m,p,S,M,x,A;if(a.b=n,a.e=i,n+="",i+="",i.substring(0,6)==="var(--"&&(i=ti(t,i.substring(4,i.indexOf(")")))),i==="auto"&&(g=t.style[e],t.style[e]=i,i=ti(t,e)||i,g?t.style[e]=g:Cs(t,e)),h=[n,i],Bh(h),n=h[0],i=h[1],f=n.match(js)||[],A=i.match(js)||[],A.length){for(;u=js.exec(i);)m=u[0],S=i.substring(l,u.index),_?_=(_+1)%5:(S.substr(-5)==="rgba("||S.substr(-5)==="hsla(")&&(_=1),m!==(g=f[c++]||"")&&(d=parseFloat(g)||0,x=g.substr((d+"").length),m.charAt(1)==="="&&(m=tr(d,m)+x),p=parseFloat(m),M=m.substr((p+"").length),l=js.lastIndex-M.length,M||(M=M||Wn.units[e]||x,l===i.length&&(i+=M,a.e+=M)),x!==M&&(d=Rs(t,e,g,M)||0),a._pt={_next:a._pt,p:S||c===1?S:",",s:d,c:p-d,m:_&&_<4||e==="zIndex"?Math.round:0});a.c=l<i.length?i.substring(l,i.length):""}else a.r=e==="display"&&i==="none"?Zp:Yp;return Ih.test(i)&&(a.e=0),this._pt=a,a},Wp={top:"0%",bottom:"100%",left:"0%",right:"100%",center:"50%"},Px=function(t){var e=t.split(" "),n=e[0],i=e[1]||"50%";return(n==="top"||n==="bottom"||i==="left"||i==="right")&&(t=n,n=i,i=t),e[0]=Wp[n]||n,e[1]=Wp[i]||i,e.join(" ")},Ix=function(t,e){if(e.tween&&e.tween._time===e.tween._dur){var n=e.t,i=n.style,r=e.u,o=n._gsap,a,l,c;if(r==="all"||r===!0)i.cssText="",l=1;else for(r=r.split(","),c=r.length;--c>-1;)a=r[c],Ki[a]&&(l=1,a=a==="transformOrigin"?Xn:qe),Cs(n,a);l&&(Cs(n,qe),o&&(o.svg&&n.removeAttribute("transform"),i.scale=i.rotate=i.translate="none",ra(n,1),o.uncache=1,$p(i)))}},ml={clearProps:function(t,e,n,i,r){if(r.data!=="isFromStart"){var o=t._pt=new In(t._pt,e,n,0,0,Ix);return o.u=i,o.pr=-10,o.tween=r,t._props.push(n),1}}},sa=[1,0,0,1,0,0],tm={},em=function(t){return t==="matrix(1, 0, 0, 1, 0, 0)"||t==="none"||!t},Xp=function(t){var e=ti(t,qe);return em(e)?sa:e.substr(7).match(Ph).map($e)},eu=function(t,e){var n=t._gsap||bs(t),i=t.style,r=Xp(t),o,a,l,c;return n.svg&&t.getAttribute("transform")?(l=t.transform.baseVal.consolidate().matrix,r=[l.a,l.b,l.c,l.d,l.e,l.f],r.join(",")==="1,0,0,1,0,0"?sa:r):(r===sa&&!t.offsetParent&&t!==Gr&&!n.svg&&(l=i.display,i.display="block",o=t.parentNode,(!o||!t.offsetParent&&!t.getBoundingClientRect().width)&&(c=1,a=t.nextElementSibling,Gr.appendChild(t)),r=Xp(t),l?i.display=l:Cs(t,"display"),c&&(a?o.insertBefore(t,a):o?o.appendChild(t):Gr.removeChild(t))),e&&r.length>6?[r[0],r[1],r[4],r[5],r[12],r[13]]:r)},Kh=function(t,e,n,i,r,o){var a=t._gsap,l=r||eu(t,!0),c=a.xOrigin||0,h=a.yOrigin||0,u=a.xOffset||0,f=a.yOffset||0,d=l[0],_=l[1],g=l[2],m=l[3],p=l[4],S=l[5],M=e.split(" "),x=parseFloat(M[0])||0,A=parseFloat(M[1])||0,E,T,R,y;n?l!==sa&&(T=d*m-_*g)&&(R=x*(m/T)+A*(-g/T)+(g*S-m*p)/T,y=x*(-_/T)+A*(d/T)-(d*S-_*p)/T,x=R,A=y):(E=Qp(t),x=E.x+(~M[0].indexOf("%")?x/100*E.width:x),A=E.y+(~(M[1]||M[0]).indexOf("%")?A/100*E.height:A)),i||i!==!1&&a.smooth?(p=x-c,S=A-h,a.xOffset=u+(p*d+S*g)-p,a.yOffset=f+(p*_+S*m)-S):a.xOffset=a.yOffset=0,a.xOrigin=x,a.yOrigin=A,a.smooth=!!i,a.origin=e,a.originIsAbsolute=!!n,t.style[Xn]="0px 0px",o&&(As(o,a,"xOrigin",c,x),As(o,a,"yOrigin",h,A),As(o,a,"xOffset",u,a.xOffset),As(o,a,"yOffset",f,a.yOffset)),t.setAttribute("data-svg-origin",x+" "+A)},ra=function(t,e){var n=t._gsap||new kh(t);if("x"in n&&!e&&!n.uncache)return n;var i=t.style,r=n.scaleX<0,o="px",a="deg",l=getComputedStyle(t),c=ti(t,Xn)||"0",h,u,f,d,_,g,m,p,S,M,x,A,E,T,R,y,v,P,U,z,V,$,X,Y,W,it,I,ft,Wt,Ot,Z,nt;return h=u=f=g=m=p=S=M=x=0,d=_=1,n.svg=!!(t.getCTM&&jp(t)),l.translate&&((l.translate!=="none"||l.scale!=="none"||l.rotate!=="none")&&(i[qe]=(l.translate!=="none"?"translate3d("+(l.translate+" 0 0").split(" ").slice(0,3).join(", ")+") ":"")+(l.rotate!=="none"?"rotate("+l.rotate+") ":"")+(l.scale!=="none"?"scale("+l.scale.split(" ").join(",")+") ":"")+(l[qe]!=="none"?l[qe]:"")),i.scale=i.rotate=i.translate="none"),T=eu(t,n.svg),n.svg&&(n.uncache?(W=t.getBBox(),c=n.xOrigin-W.x+"px "+(n.yOrigin-W.y)+"px",Y=""):Y=!e&&t.getAttribute("data-svg-origin"),Kh(t,Y||c,!!Y||n.originIsAbsolute,n.smooth!==!1,T)),A=n.xOrigin||0,E=n.yOrigin||0,T!==sa&&(P=T[0],U=T[1],z=T[2],V=T[3],h=$=T[4],u=X=T[5],T.length===6?(d=Math.sqrt(P*P+U*U),_=Math.sqrt(V*V+z*z),g=P||U?Vr(U,P)*sr:0,S=z||V?Vr(z,V)*sr+g:0,S&&(_*=Math.abs(Math.cos(S*Wr))),n.svg&&(h-=A-(A*P+E*z),u-=E-(A*U+E*V))):(nt=T[6],Ot=T[7],I=T[8],ft=T[9],Wt=T[10],Z=T[11],h=T[12],u=T[13],f=T[14],R=Vr(nt,Wt),m=R*sr,R&&(y=Math.cos(-R),v=Math.sin(-R),Y=$*y+I*v,W=X*y+ft*v,it=nt*y+Wt*v,I=$*-v+I*y,ft=X*-v+ft*y,Wt=nt*-v+Wt*y,Z=Ot*-v+Z*y,$=Y,X=W,nt=it),R=Vr(-z,Wt),p=R*sr,R&&(y=Math.cos(-R),v=Math.sin(-R),Y=P*y-I*v,W=U*y-ft*v,it=z*y-Wt*v,Z=V*v+Z*y,P=Y,U=W,z=it),R=Vr(U,P),g=R*sr,R&&(y=Math.cos(R),v=Math.sin(R),Y=P*y+U*v,W=$*y+X*v,U=U*y-P*v,X=X*y-$*v,P=Y,$=W),m&&Math.abs(m)+Math.abs(g)>359.9&&(m=g=0,p=180-p),d=$e(Math.sqrt(P*P+U*U+z*z)),_=$e(Math.sqrt(X*X+nt*nt)),R=Vr($,X),S=Math.abs(R)>2e-4?R*sr:0,x=Z?1/(Z<0?-Z:Z):0),n.svg&&(Y=t.getAttribute("transform"),n.forceCSS=t.setAttribute("transform","")||!em(ti(t,qe)),Y&&t.setAttribute("transform",Y))),Math.abs(S)>90&&Math.abs(S)<270&&(r?(d*=-1,S+=g<=0?180:-180,g+=g<=0?180:-180):(_*=-1,S+=S<=0?180:-180)),e=e||n.uncache,n.x=h-((n.xPercent=h&&(!e&&n.xPercent||(Math.round(t.offsetWidth/2)===Math.round(-h)?-50:0)))?t.offsetWidth*n.xPercent/100:0)+o,n.y=u-((n.yPercent=u&&(!e&&n.yPercent||(Math.round(t.offsetHeight/2)===Math.round(-u)?-50:0)))?t.offsetHeight*n.yPercent/100:0)+o,n.z=f+o,n.scaleX=$e(d),n.scaleY=$e(_),n.rotation=$e(g)+a,n.rotationX=$e(m)+a,n.rotationY=$e(p)+a,n.skewX=S+a,n.skewY=M+a,n.transformPerspective=x+o,(n.zOrigin=parseFloat(c.split(" ")[2])||!e&&n.zOrigin||0)&&(i[Xn]=gl(c)),n.xOffset=n.yOffset=0,n.force3D=Wn.force3D,n.renderTransform=n.svg?Dx:Kp?nm:Lx,n.uncache=0,n},gl=function(t){return(t=t.split(" "))[0]+" "+t[1]},Yh=function(t,e,n){var i=xn(e);return $e(parseFloat(e)+parseFloat(Rs(t,"x",n+"px",i)))+i},Lx=function(t,e){e.z="0px",e.rotationY=e.rotationX="0deg",e.force3D=0,nm(t,e)},nr="0deg",ia="0px",ir=") ",nm=function(t,e){var n=e||this,i=n.xPercent,r=n.yPercent,o=n.x,a=n.y,l=n.z,c=n.rotation,h=n.rotationY,u=n.rotationX,f=n.skewX,d=n.skewY,_=n.scaleX,g=n.scaleY,m=n.transformPerspective,p=n.force3D,S=n.target,M=n.zOrigin,x="",A=p==="auto"&&t&&t!==1||p===!0;if(M&&(u!==nr||h!==nr)){var E=parseFloat(h)*Wr,T=Math.sin(E),R=Math.cos(E),y;E=parseFloat(u)*Wr,y=Math.cos(E),o=Yh(S,o,T*y*-M),a=Yh(S,a,-Math.sin(E)*-M),l=Yh(S,l,R*y*-M+M)}m!==ia&&(x+="perspective("+m+ir),(i||r)&&(x+="translate("+i+"%, "+r+"%) "),(A||o!==ia||a!==ia||l!==ia)&&(x+=l!==ia||A?"translate3d("+o+", "+a+", "+l+") ":"translate("+o+", "+a+ir),c!==nr&&(x+="rotate("+c+ir),h!==nr&&(x+="rotateY("+h+ir),u!==nr&&(x+="rotateX("+u+ir),(f!==nr||d!==nr)&&(x+="skew("+f+", "+d+ir),(_!==1||g!==1)&&(x+="scale("+_+", "+g+ir),S.style[qe]=x||"translate(0, 0)"},Dx=function(t,e){var n=e||this,i=n.xPercent,r=n.yPercent,o=n.x,a=n.y,l=n.rotation,c=n.skewX,h=n.skewY,u=n.scaleX,f=n.scaleY,d=n.target,_=n.xOrigin,g=n.yOrigin,m=n.xOffset,p=n.yOffset,S=n.forceCSS,M=parseFloat(o),x=parseFloat(a),A,E,T,R,y;l=parseFloat(l),c=parseFloat(c),h=parseFloat(h),h&&(h=parseFloat(h),c+=h,l+=h),l||c?(l*=Wr,c*=Wr,A=Math.cos(l)*u,E=Math.sin(l)*u,T=Math.sin(l-c)*-f,R=Math.cos(l-c)*f,c&&(h*=Wr,y=Math.tan(c-h),y=Math.sqrt(1+y*y),T*=y,R*=y,h&&(y=Math.tan(h),y=Math.sqrt(1+y*y),A*=y,E*=y)),A=$e(A),E=$e(E),T=$e(T),R=$e(R)):(A=u,R=f,E=T=0),(M&&!~(o+"").indexOf("px")||x&&!~(a+"").indexOf("px"))&&(M=Rs(d,"x",o,"px"),x=Rs(d,"y",a,"px")),(_||g||m||p)&&(M=$e(M+_-(_*A+g*T)+m),x=$e(x+g-(_*E+g*R)+p)),(i||r)&&(y=d.getBBox(),M=$e(M+i/100*y.width),x=$e(x+r/100*y.height)),y="matrix("+A+","+E+","+T+","+R+","+M+","+x+")",d.setAttribute("transform",y),S&&(d.style[qe]=y)},Ux=function(t,e,n,i,r){var o=360,a=cn(r),l=parseFloat(r)*(a&&~r.indexOf("rad")?sr:1),c=l-i,h=i+c+"deg",u,f;return a&&(u=r.split("_")[1],u==="short"&&(c%=o,c!==c%(o/2)&&(c+=c<0?o:-o)),u==="cw"&&c<0?c=(c+o*kp)%o-~~(c/o)*o:u==="ccw"&&c>0&&(c=(c-o*kp)%o-~~(c/o)*o)),t._pt=f=new In(t._pt,e,n,i,c,gx),f.e=h,f.u="deg",t._props.push(n),f},qp=function(t,e){for(var n in e)t[n]=e[n];return t},Nx=function(t,e,n){var i=qp({},n._gsap),r="perspective,force3D,transformOrigin,svgOrigin",o=n.style,a,l,c,h,u,f,d,_;i.svg?(c=n.getAttribute("transform"),n.setAttribute("transform",""),o[qe]=e,a=ra(n,1),Cs(n,qe),n.setAttribute("transform",c)):(c=getComputedStyle(n)[qe],o[qe]=e,a=ra(n,1),o[qe]=c);for(l in Ki)c=i[l],h=a[l],c!==h&&r.indexOf(l)<0&&(d=xn(c),_=xn(h),u=d!==_?Rs(n,l,c,_):parseFloat(c),f=parseFloat(h),t._pt=new In(t._pt,a,l,u,f-u,Zh),t._pt.u=_||0,t._props.push(l));qp(a,i)};Pn("padding,margin,Width,Radius",function(s,t){var e="Top",n="Right",i="Bottom",r="Left",o=(t<3?[e,n,i,r]:[e+r,e+n,i+n,i+r]).map(function(a){return t<2?s+a:"border"+a+s});ml[t>1?"border"+s:s]=function(a,l,c,h,u){var f,d;if(arguments.length<4)return f=o.map(function(_){return Ji(a,_,c)}),d=f.join(" "),d.split(f[0]).length===5?f[0]:d;f=(h+"").split(" "),d={},o.forEach(function(_,g){return d[_]=f[g]=f[g]||f[(g-1)/2|0]}),a.init(l,d,u)}});var nu={name:"css",register:Jh,targetTest:function(t){return t.style&&t.nodeType},init:function(t,e,n,i,r){var o=this._props,a=t.style,l=n.vars.startAt,c,h,u,f,d,_,g,m,p,S,M,x,A,E,T,R,y;Qh||Jh(),this.styles=this.styles||Jp(t),R=this.styles.props,this.tween=n;for(g in e)if(g!=="autoRound"&&(h=e[g],!(Hn[g]&&Hh(g,e,n,i,t,r)))){if(d=typeof h,_=ml[g],d==="function"&&(h=h.call(n,i,t,r),d=typeof h),d==="string"&&~h.indexOf("random(")&&(h=Hr(h)),_)_(this,t,g,h,n)&&(T=1);else if(g.substr(0,2)==="--")c=(getComputedStyle(t).getPropertyValue(g)+"").trim(),h+="",Zi.lastIndex=0,Zi.test(c)||(m=xn(c),p=xn(h),p?m!==p&&(c=Rs(t,g,c,p)+p):m&&(h+=m)),this.add(a,"setProperty",c,h,i,r,0,0,g),o.push(g),R.push(g,0,a[g]);else if(d!=="undefined"){if(l&&g in l?(c=typeof l[g]=="function"?l[g].call(n,i,t,r):l[g],cn(c)&&~c.indexOf("random(")&&(c=Hr(c)),xn(c+"")||c==="auto"||(c+=Wn.units[g]||xn(Ji(t,g))||""),(c+"").charAt(1)==="="&&(c=Ji(t,g))):c=Ji(t,g),f=parseFloat(c),S=d==="string"&&h.charAt(1)==="="&&h.substr(0,2),S&&(h=h.substr(2)),u=parseFloat(h),g in Oi&&(g==="autoAlpha"&&(f===1&&Ji(t,"visibility")==="hidden"&&u&&(f=0),R.push("visibility",0,a.visibility),As(this,a,"visibility",f?"inherit":"hidden",u?"inherit":"hidden",!u)),g!=="scale"&&g!=="transform"&&(g=Oi[g],~g.indexOf(",")&&(g=g.split(",")[0]))),M=g in Ki,M){if(this.styles.save(g),y=h,d==="string"&&h.substring(0,6)==="var(--"){if(h=ti(t,h.substring(4,h.indexOf(")"))),h.substring(0,5)==="calc("){var v=t.style.perspective;t.style.perspective=h,h=ti(t,"perspective"),v?t.style.perspective=v:Cs(t,"perspective")}u=parseFloat(h)}if(x||(A=t._gsap,A.renderTransform&&!e.parseTransform||ra(t,e.parseTransform),E=e.smoothOrigin!==!1&&A.smooth,x=this._pt=new In(this._pt,a,qe,0,1,A.renderTransform,A,0,-1),x.dep=1),g==="scale")this._pt=new In(this._pt,A,"scaleY",A.scaleY,(S?tr(A.scaleY,S+u):u)-A.scaleY||0,Zh),this._pt.u=0,o.push("scaleY",g),g+="X";else if(g==="transformOrigin"){R.push(Xn,0,a[Xn]),h=Px(h),A.svg?Kh(t,h,0,E,0,this):(p=parseFloat(h.split(" ")[2])||0,p!==A.zOrigin&&As(this,A,"zOrigin",A.zOrigin,p),As(this,a,g,gl(c),gl(h)));continue}else if(g==="svgOrigin"){Kh(t,h,1,E,0,this);continue}else if(g in tm){Ux(this,A,g,f,S?tr(f,S+h):h);continue}else if(g==="smoothOrigin"){As(this,A,"smooth",A.smooth,h);continue}else if(g==="force3D"){A[g]=h;continue}else if(g==="transform"){Nx(this,h,t);continue}}else g in a||(g=Xr(g)||g);if(M||(u||u===0)&&(f||f===0)&&!mx.test(h)&&g in a)m=(c+"").substr((f+"").length),u||(u=0),p=xn(h)||(g in Wn.units?Wn.units[g]:m),m!==p&&(f=Rs(t,g,c,p)),this._pt=new In(this._pt,M?A:a,g,f,(S?tr(f,S+u):u)-f,!M&&(p==="px"||g==="zIndex")&&e.autoRound!==!1?vx:Zh),this._pt.u=p||0,M&&y!==h?(this._pt.b=c,this._pt.e=y,this._pt.r=xx):m!==p&&p!=="%"&&(this._pt.b=c,this._pt.r=_x);else if(g in a)Rx.call(this,t,g,c,S?S+h:h);else if(g in t)this.add(t,g,c||t[g],S?S+h:h,i,r);else if(g!=="parseTransform"){hl(g,h);continue}M||(g in a?R.push(g,0,a[g]):typeof t[g]=="function"?R.push(g,2,t[g]()):R.push(g,1,c||t[g])),o.push(g)}}T&&qh(this)},render:function(t,e){if(e.tween._time||!jh())for(var n=e._pt;n;)n.r(t,n.d),n=n._next;else e.styles.revert()},get:Ji,aliases:Oi,getSetter:function(t,e,n){var i=Oi[e];return i&&i.indexOf(",")<0&&(e=i),e in Ki&&e!==Xn&&(t._gsap.x||Ji(t,"x"))?n&&Bp===n?e==="scale"?bx:Sx:(Bp=n||{})&&(e==="scale"?wx:Tx):t.style&&!cl(t.style[e])?yx:~e.indexOf("-")?Mx:pl(t,e)},core:{_removeProperty:Cs,_getMatrix:eu}};bn.utils.checkPrefix=Xr;bn.core.getStyleSaver=Jp;(function(s,t,e,n){var i=Pn(s+","+t+","+e,function(r){Ki[r]=1});Pn(t,function(r){Wn.units[r]="deg",tm[r]=1}),Oi[i[13]]=s+","+t,Pn(n,function(r){var o=r.split(":");Oi[o[1]]=i[o[0]]})})("x,y,z,scale,scaleX,scaleY,xPercent,yPercent","rotation,rotationX,rotationY,skewX,skewY","transform,transformOrigin,svgOrigin,force3D,smoothOrigin,transformPerspective","0:translateX,1:translateY,2:translateZ,8:rotate,8:rotationZ,8:rotateZ,9:rotateX,10:rotateY");Pn("x,y,z,top,right,bottom,left,width,height,fontSize,padding,margin,perspective",function(s){Wn.units[s]="px"});bn.registerPlugin(nu);var Je=bn.registerPlugin(nu)||bn,S1=Je.core.Tween;function im(s,t){for(var e=0;e<t.length;e++){var n=t[e];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(s,n.key,n)}}function Ox(s,t,e){return t&&im(s.prototype,t),e&&im(s,e),s}var vn,vl,Fx,qn,Ps,Is,Yr,rm,or,Zr,om,Qi,Mi,am,lm=function(){return vn||typeof window<"u"&&(vn=window.gsap)&&vn.registerPlugin&&vn},cm=1,qr=[],le=[],Si=[],aa=Date.now,iu=function(t,e){return e},Bx=function(){var t=Zr.core,e=t.bridge||{},n=t._scrollers,i=t._proxies;n.push.apply(n,le),i.push.apply(i,Si),le=n,Si=i,iu=function(o,a){return e[o](a)}},ts=function(t,e){return~Si.indexOf(t)&&Si[Si.indexOf(t)+1][e]},la=function(t){return!!~om.indexOf(t)},Dn=function(t,e,n,i,r){return t.addEventListener(e,n,{passive:i!==!1,capture:!!r})},Ln=function(t,e,n,i){return t.removeEventListener(e,n,!!i)},_l="scrollLeft",xl="scrollTop",su=function(){return Qi&&Qi.isPressed||le.cache++},yl=function(t,e){var n=function i(r){if(r||r===0){cm&&qn.history.scrollRestoration!=="manual"&&(qn.history.scrollRestoration="manual");var o=Qi&&Qi.isPressed;r=i.v=Math.round(r)||(Qi&&Qi.iOS?1:0),t(r),i.cacheID=le.cache,o&&iu("ss",r)}else(e||le.cache!==i.cacheID||iu("ref"))&&(i.cacheID=le.cache,i.v=t());return i.v+i.offset};return n.offset=0,t&&n},wn={s:_l,p:"left",p2:"Left",os:"right",os2:"Right",d:"width",d2:"Width",a:"x",sc:yl(function(s){return arguments.length?qn.scrollTo(s,nn.sc()):qn.pageXOffset||Ps[_l]||Is[_l]||Yr[_l]||0})},nn={s:xl,p:"top",p2:"Top",os:"bottom",os2:"Bottom",d:"height",d2:"Height",a:"y",op:wn,sc:yl(function(s){return arguments.length?qn.scrollTo(wn.sc(),s):qn.pageYOffset||Ps[xl]||Is[xl]||Yr[xl]||0})},Un=function(t,e){return(e&&e._ctx&&e._ctx.selector||vn.utils.toArray)(t)[0]||(typeof t=="string"&&vn.config().nullTargetWarn!==!1?console.warn("Element not found:",t):null)},kx=function(t,e){for(var n=e.length;n--;)if(e[n]===t||e[n].contains(t))return!0;return!1},ji=function(t,e){var n=e.s,i=e.sc;la(t)&&(t=Ps.scrollingElement||Is);var r=le.indexOf(t),o=i===nn.sc?1:2;!~r&&(r=le.push(t)-1),le[r+o]||Dn(t,"scroll",su);var a=le[r+o],l=a||(le[r+o]=yl(ts(t,n),!0)||(la(t)?i:yl(function(c){return arguments.length?t[n]=c:t[n]})));return l.target=t,a||(l.smooth=vn.getProperty(t,"scrollBehavior")==="smooth"),l},Ml=function(t,e,n){var i=t,r=t,o=aa(),a=o,l=e||50,c=Math.max(500,l*3),h=function(_,g){var m=aa();g||m-o>l?(r=i,i=_,a=o,o=m):n?i+=_:i=r+(_-r)/(m-a)*(o-a)},u=function(){r=i=n?0:i,a=o=0},f=function(_){var g=a,m=r,p=aa();return(_||_===0)&&_!==i&&h(_),o===a||p-a>c?0:(i+(n?m:-m))/((n?p:o)-g)*1e3};return{update:h,reset:u,getVelocity:f}},oa=function(t,e){return e&&!t._gsapAllow&&t.cancelable!==!1&&t.preventDefault(),t.changedTouches?t.changedTouches[0]:t},sm=function(t){var e=Math.max.apply(Math,t),n=Math.min.apply(Math,t);return Math.abs(e)>=Math.abs(n)?e:n},hm=function(){Zr=vn.core.globals().ScrollTrigger,Zr&&Zr.core&&Bx()},um=function(t){return vn=t||lm(),!vl&&vn&&typeof document<"u"&&document.body&&(qn=window,Ps=document,Is=Ps.documentElement,Yr=Ps.body,om=[qn,Ps,Is,Yr],Fx=vn.utils.clamp,am=vn.core.context||function(){},or="onpointerenter"in Yr?"pointer":"mouse",rm=Ke.isTouch=qn.matchMedia&&qn.matchMedia("(hover: none), (pointer: coarse)").matches?1:"ontouchstart"in qn||navigator.maxTouchPoints>0||navigator.msMaxTouchPoints>0?2:0,Mi=Ke.eventTypes=("ontouchstart"in Is?"touchstart,touchmove,touchcancel,touchend":"onpointerdown"in Is?"pointerdown,pointermove,pointercancel,pointerup":"mousedown,mousemove,mouseup,mouseup").split(","),setTimeout(function(){return cm=0},500),vl=1),Zr||hm(),vl};wn.op=nn;le.cache=0;var Ke=function(){function s(e){this.init(e)}var t=s.prototype;return t.init=function(n){vl||um(vn)||console.warn("Please gsap.registerPlugin(Observer)"),Zr||hm();var i=n.tolerance,r=n.dragMinimum,o=n.type,a=n.target,l=n.lineHeight,c=n.debounce,h=n.preventDefault,u=n.onStop,f=n.onStopDelay,d=n.ignore,_=n.wheelSpeed,g=n.event,m=n.onDragStart,p=n.onDragEnd,S=n.onDrag,M=n.onPress,x=n.onRelease,A=n.onRight,E=n.onLeft,T=n.onUp,R=n.onDown,y=n.onChangeX,v=n.onChangeY,P=n.onChange,U=n.onToggleX,z=n.onToggleY,V=n.onHover,$=n.onHoverEnd,X=n.onMove,Y=n.ignoreCheck,W=n.isNormalizer,it=n.onGestureStart,I=n.onGestureEnd,ft=n.onWheel,Wt=n.onEnable,Ot=n.onDisable,Z=n.onClick,nt=n.scrollSpeed,yt=n.capture,st=n.allowClicks,Ct=n.lockAxis,Ut=n.onLockAxis;this.target=a=Un(a)||Is,this.vars=n,d&&(d=vn.utils.toArray(d)),i=i||1e-9,r=r||0,_=_||1,nt=nt||1,o=o||"wheel,touch,pointer",c=c!==!1,l||(l=parseFloat(qn.getComputedStyle(Yr).lineHeight)||22);var Qt,se,Yt,kt,N,Me,Zt,H=this,Rt=0,fe=0,Nt=n.passive||!h&&n.passive!==!1,C=ji(a,wn),b=ji(a,nn),G=C(),tt=b(),Q=~o.indexOf("touch")&&!~o.indexOf("pointer")&&Mi[0]==="pointerdown",K=la(a),_t=a.ownerDocument||Ps,ht=[0,0,0],xt=[0,0,0],Jt=0,rt=function(){return Jt=aa()},ct=function(It,ee){return(H.event=It)&&d&&kx(It.target,d)||ee&&Q&&It.pointerType!=="touch"||Y&&Y(It,ee)},Vt=function(){H._vx.reset(),H._vy.reset(),se.pause(),u&&u(H)},Bt=function(){var It=H.deltaX=sm(ht),ee=H.deltaY=sm(xt),vt=Math.abs(It)>=i,Kt=Math.abs(ee)>=i;P&&(vt||Kt)&&P(H,It,ee,ht,xt),vt&&(A&&H.deltaX>0&&A(H),E&&H.deltaX<0&&E(H),y&&y(H),U&&H.deltaX<0!=Rt<0&&U(H),Rt=H.deltaX,ht[0]=ht[1]=ht[2]=0),Kt&&(R&&H.deltaY>0&&R(H),T&&H.deltaY<0&&T(H),v&&v(H),z&&H.deltaY<0!=fe<0&&z(H),fe=H.deltaY,xt[0]=xt[1]=xt[2]=0),(kt||Yt)&&(X&&X(H),Yt&&(m&&Yt===1&&m(H),S&&S(H),Yt=0),kt=!1),Me&&!(Me=!1)&&Ut&&Ut(H),N&&(ft(H),N=!1),Qt=0},wt=function(It,ee,vt){ht[vt]+=It,xt[vt]+=ee,H._vx.update(It),H._vy.update(ee),c?Qt||(Qt=requestAnimationFrame(Bt)):Bt()},te=function(It,ee){Ct&&!Zt&&(H.axis=Zt=Math.abs(It)>Math.abs(ee)?"x":"y",Me=!0),Zt!=="y"&&(ht[2]+=It,H._vx.update(It,!0)),Zt!=="x"&&(xt[2]+=ee,H._vy.update(ee,!0)),c?Qt||(Qt=requestAnimationFrame(Bt)):Bt()},zt=function(It){if(!ct(It,1)){It=oa(It,h);var ee=It.clientX,vt=It.clientY,Kt=ee-H.x,Tt=vt-H.y,$t=H.isDragging;H.x=ee,H.y=vt,($t||(Kt||Tt)&&(Math.abs(H.startX-ee)>=r||Math.abs(H.startY-vt)>=r))&&(Yt||(Yt=$t?2:1),$t||(H.isDragging=!0),te(Kt,Tt))}},de=H.onPress=function(pt){ct(pt,1)||pt&&pt.button||(H.axis=Zt=null,se.pause(),H.isPressed=!0,pt=oa(pt),Rt=fe=0,H.startX=H.x=pt.clientX,H.startY=H.y=pt.clientY,H._vx.reset(),H._vy.reset(),Dn(W?a:_t,Mi[1],zt,Nt,!0),H.deltaX=H.deltaY=0,M&&M(H))},L=H.onRelease=function(pt){if(!ct(pt,1)){Ln(W?a:_t,Mi[1],zt,!0);var It=!isNaN(H.y-H.startY),ee=H.isDragging,vt=ee&&(Math.abs(H.x-H.startX)>3||Math.abs(H.y-H.startY)>3),Kt=oa(pt);!vt&&It&&(H._vx.reset(),H._vy.reset(),h&&st&&vn.delayedCall(.08,function(){if(aa()-Jt>300&&!pt.defaultPrevented){if(pt.target.click)pt.target.click();else if(_t.createEvent){var Tt=_t.createEvent("MouseEvents");Tt.initMouseEvent("click",!0,!0,qn,1,Kt.screenX,Kt.screenY,Kt.clientX,Kt.clientY,!1,!1,!1,!1,0,null),pt.target.dispatchEvent(Tt)}}})),H.isDragging=H.isGesturing=H.isPressed=!1,u&&ee&&!W&&se.restart(!0),Yt&&Bt(),p&&ee&&p(H),x&&x(H,vt)}},dt=function(It){return It.touches&&It.touches.length>1&&(H.isGesturing=!0)&&it(It,H.isDragging)},q=function(){return(H.isGesturing=!1)||I(H)},j=function(It){if(!ct(It)){var ee=C(),vt=b();wt((ee-G)*nt,(vt-tt)*nt,1),G=ee,tt=vt,u&&se.restart(!0)}},ut=function(It){if(!ct(It)){It=oa(It,h),ft&&(N=!0);var ee=(It.deltaMode===1?l:It.deltaMode===2?qn.innerHeight:1)*_;wt(It.deltaX*ee,It.deltaY*ee,0),u&&!W&&se.restart(!0)}},gt=function(It){if(!ct(It)){var ee=It.clientX,vt=It.clientY,Kt=ee-H.x,Tt=vt-H.y;H.x=ee,H.y=vt,kt=!0,u&&se.restart(!0),(Kt||Tt)&&te(Kt,Tt)}},qt=function(It){H.event=It,V(H)},pe=function(It){H.event=It,$(H)},ve=function(It){return ct(It)||oa(It,h)&&Z(H)};se=H._dc=vn.delayedCall(f||.25,Vt).pause(),H.deltaX=H.deltaY=0,H._vx=Ml(0,50,!0),H._vy=Ml(0,50,!0),H.scrollX=C,H.scrollY=b,H.isDragging=H.isGesturing=H.isPressed=!1,am(this),H.enable=function(pt){return H.isEnabled||(Dn(K?_t:a,"scroll",su),o.indexOf("scroll")>=0&&Dn(K?_t:a,"scroll",j,Nt,yt),o.indexOf("wheel")>=0&&Dn(a,"wheel",ut,Nt,yt),(o.indexOf("touch")>=0&&rm||o.indexOf("pointer")>=0)&&(Dn(a,Mi[0],de,Nt,yt),Dn(_t,Mi[2],L),Dn(_t,Mi[3],L),st&&Dn(a,"click",rt,!0,!0),Z&&Dn(a,"click",ve),it&&Dn(_t,"gesturestart",dt),I&&Dn(_t,"gestureend",q),V&&Dn(a,or+"enter",qt),$&&Dn(a,or+"leave",pe),X&&Dn(a,or+"move",gt)),H.isEnabled=!0,H.isDragging=H.isGesturing=H.isPressed=kt=Yt=!1,H._vx.reset(),H._vy.reset(),G=C(),tt=b(),pt&&pt.type&&de(pt),Wt&&Wt(H)),H},H.disable=function(){H.isEnabled&&(qr.filter(function(pt){return pt!==H&&la(pt.target)}).length||Ln(K?_t:a,"scroll",su),H.isPressed&&(H._vx.reset(),H._vy.reset(),Ln(W?a:_t,Mi[1],zt,!0)),Ln(K?_t:a,"scroll",j,yt),Ln(a,"wheel",ut,yt),Ln(a,Mi[0],de,yt),Ln(_t,Mi[2],L),Ln(_t,Mi[3],L),Ln(a,"click",rt,!0),Ln(a,"click",ve),Ln(_t,"gesturestart",dt),Ln(_t,"gestureend",q),Ln(a,or+"enter",qt),Ln(a,or+"leave",pe),Ln(a,or+"move",gt),H.isEnabled=H.isPressed=H.isDragging=!1,Ot&&Ot(H))},H.kill=H.revert=function(){H.disable();var pt=qr.indexOf(H);pt>=0&&qr.splice(pt,1),Qi===H&&(Qi=0)},qr.push(H),W&&la(a)&&(Qi=H),H.enable(g)},Ox(s,[{key:"velocityX",get:function(){return this._vx.getVelocity()}},{key:"velocityY",get:function(){return this._vy.getVelocity()}}]),s}();Ke.version="3.15.1";Ke.create=function(s){return new Ke(s)};Ke.register=um;Ke.getAll=function(){return qr.slice()};Ke.getById=function(s){return qr.filter(function(t){return t.vars.id===s})[0]};lm()&&vn.registerPlugin(Ke);var Pt,Qr,ue,Ce,ii,Ee,xu,Fl,Ma,ma,ha,Sl,Tn,zl,uu,On,fm,dm,jr,Rm,ru,Pm,Nn,fu,Im,Lm,Ls,du,vu,to,yu,Ds,pu,ou,bl=1,En=Date.now,au=En(),gi=0,ua=0,pm=function(t,e,n){var i=ni(t)&&(t.substr(0,6)==="clamp("||t.indexOf("max")>-1);return n["_"+e+"Clamp"]=i,i?t.substr(6,t.length-7):t},mm=function(t,e){return e&&(!ni(t)||t.substr(0,6)!=="clamp(")?"clamp("+t+")":t},zx=function s(){return ua&&requestAnimationFrame(s)},gm=function(){return zl=1},_m=function(){return zl=0},Fi=function(t){return t},fa=function(t){return Math.round(t*1e5)/1e5||0},Dm=function(){return typeof window<"u"},Um=function(){return Pt||Dm()&&(Pt=window.gsap)&&Pt.registerPlugin&&Pt},fr=function(t){return!!~xu.indexOf(t)},Nm=function(t){return(t==="Height"?yu:ue["inner"+t])||ii["client"+t]||Ee["client"+t]},Om=function(t){return ts(t,"getBoundingClientRect")||(fr(t)?function(){return Ol.width=ue.innerWidth,Ol.height=yu,Ol}:function(){return es(t)})},Hx=function(t,e,n){var i=n.d,r=n.d2,o=n.a;return(o=ts(t,"getBoundingClientRect"))?function(){return o()[i]}:function(){return(e?Nm(r):t["client"+r])||0}},Vx=function(t,e){return!e||~Si.indexOf(t)?Om(t):function(){return Ol}},Bi=function(t,e){var n=e.s,i=e.d2,r=e.d,o=e.a;return Math.max(0,(n="scroll"+i)&&(o=ts(t,n))?o()-Om(t)()[r]:fr(t)?(ii[n]||Ee[n])-Nm(i):t[n]-t["offset"+i])},wl=function(t,e){for(var n=0;n<jr.length;n+=3)(!e||~e.indexOf(jr[n+1]))&&t(jr[n],jr[n+1],jr[n+2])},ni=function(t){return typeof t=="string"},An=function(t){return typeof t=="function"},da=function(t){return typeof t=="number"},ar=function(t){return typeof t=="object"},ca=function(t,e,n){return t&&t.progress(e?0:1)&&n&&t.pause()},$r=function(t,e,n){if(t.enabled){var i=t._ctx?t._ctx.add(function(){return e(t,n)}):e(t,n);i&&i.totalTime&&(t.callbackAnimation=i)}},Jr=Math.abs,Fm="left",Bm="top",Mu="right",Su="bottom",cr="width",hr="height",ga="Right",_a="Left",xa="Top",va="Bottom",sn="padding",pi="margin",no="Width",bu="Height",hn="px",mi=function(t){return ue.getComputedStyle(t.nodeType===Node.DOCUMENT_NODE?t.scrollingElement:t)},Gx=function(t){var e=mi(t).position;t.style.position=e==="absolute"||e==="fixed"?e:"relative"},xm=function(t,e){for(var n in e)n in t||(t[n]=e[n]);return t},es=function(t,e){var n=e&&mi(t)[uu]!=="matrix(1, 0, 0, 1, 0, 0)"&&Pt.to(t,{x:0,y:0,xPercent:0,yPercent:0,rotation:0,rotationX:0,rotationY:0,scale:1,skewX:0,skewY:0}).progress(1),i=t.getBoundingClientRect?t.getBoundingClientRect():t.scrollingElement.getBoundingClientRect();return n&&n.progress(0).kill(),i},Bl=function(t,e){var n=e.d2;return t["offset"+n]||t["client"+n]||0},km=function(t){var e=[],n=t.labels,i=t.duration(),r;for(r in n)e.push(n[r]/i);return e},Wx=function(t){return function(e){return Pt.utils.snap(km(t),e)}},wu=function(t){var e=Pt.utils.snap(t),n=Array.isArray(t)&&t.slice(0).sort(function(i,r){return i-r});return n?function(i,r,o){o===void 0&&(o=.001);var a;if(!r)return e(i);if(r>0){for(i-=o,a=0;a<n.length;a++)if(n[a]>=i)return n[a];return n[a-1]}else for(a=n.length,i+=o;a--;)if(n[a]<=i)return n[a];return n[0]}:function(i,r,o){o===void 0&&(o=.001);var a=e(i);return!r||Math.abs(a-i)<o||a-i<0==r<0?a:e(r<0?i-t:i+t)}},Xx=function(t){return function(e,n){return wu(km(t))(e,n.direction)}},Tl=function(t,e,n,i){return n.split(",").forEach(function(r){return t(e,r,i)})},pn=function(t,e,n,i,r){return t.addEventListener(e,n,{passive:!i,capture:!!r})},dn=function(t,e,n,i){return t.removeEventListener(e,n,!!i)},El=function(t,e,n){n=n&&n.wheelHandler,n&&(t(e,"wheel",n),t(e,"touchmove",n))},vm={startColor:"green",endColor:"red",indent:0,fontSize:"16px",fontWeight:"normal"},Al={toggleActions:"play",anticipatePin:0},kl={top:0,left:0,center:.5,bottom:1,right:1},Ll=function(t,e){if(ni(t)){var n=t.indexOf("="),i=~n?+(t.charAt(n-1)+1)*parseFloat(t.substr(n+1)):0;~n&&(t.indexOf("%")>n&&(i*=e/100),t=t.substr(0,n-1)),t=i+(t in kl?kl[t]*e:~t.indexOf("%")?parseFloat(t)*e/100:parseFloat(t)||0)}return t},Cl=function(t,e,n,i,r,o,a,l){var c=r.startColor,h=r.endColor,u=r.fontSize,f=r.indent,d=r.fontWeight,_=Ce.createElement("div"),g=fr(n)||ts(n,"pinType")==="fixed",m=t.indexOf("scroller")!==-1,p=g?Ee:n.tagName==="IFRAME"?n.contentDocument.body:n,S=t.indexOf("start")!==-1,M=S?c:h,x="border-color:"+M+";font-size:"+u+";color:"+M+";font-weight:"+d+";pointer-events:none;white-space:nowrap;font-family:sans-serif,Arial;z-index:1000;padding:4px 8px;border-width:0;border-style:solid;";return x+="position:"+((m||l)&&g?"fixed;":"absolute;"),(m||l||!g)&&(x+=(i===nn?Mu:Su)+":"+(o+parseFloat(f))+"px;"),a&&(x+="box-sizing:border-box;text-align:left;width:"+a.offsetWidth+"px;"),_._isStart=S,_.setAttribute("class","gsap-marker-"+t+(e?" marker-"+e:"")),_.style.cssText=x,_.innerText=e||e===0?t+"-"+e:t,p.children[0]?p.insertBefore(_,p.children[0]):p.appendChild(_),_._offset=_["offset"+i.op.d2],Dl(_,0,i,S),_},Dl=function(t,e,n,i){var r={display:"block"},o=n[i?"os2":"p2"],a=n[i?"p2":"os2"];t._isFlipped=i,r[n.a+"Percent"]=i?-100:0,r[n.a]=i?"1px":0,r["border"+o+no]=1,r["border"+a+no]=0,r[n.p]=e+"px",Pt.set(t,r)},he=[],mu={},Sa,ym=function(){return En()-gi>34&&(Sa||(Sa=requestAnimationFrame(ns)))},Kr=function(){(!Nn||!Nn.isPressed||Nn.startX>Ee.clientWidth)&&(le.cache++,Nn?Sa||(Sa=requestAnimationFrame(ns)):ns(),gi||pr("scrollStart"),gi=En())},lu=function(){Lm=ue.innerWidth,Im=ue.innerHeight},pa=function(t){le.cache++,(t===!0||!Tn&&!Pm&&!Ce.fullscreenElement&&!Ce.webkitFullscreenElement&&(!fu||Lm!==ue.innerWidth||Math.abs(ue.innerHeight-Im)>ue.innerHeight*.25))&&Fl.restart(!0)},dr={},qx=[],zm=function s(){return dn(ie,"scrollEnd",s)||lr(!0)},pr=function(t){return dr[t]&&dr[t].map(function(e){return e()})||qx},ei=[],Hm=function(t){for(var e=0;e<ei.length;e+=5)(!t||ei[e+4]&&ei[e+4].query===t)&&(ei[e].style.cssText=ei[e+1],ei[e].getBBox&&ei[e].setAttribute("transform",ei[e+2]||""),ei[e+3].uncache=1)},Vm=function(){le.cache++,le.forEach(function(t){return An(t)&&(t.rec=t())})},Tu=function(t,e){var n;for(On=0;On<he.length;On++)n=he[On],n&&(!e||n._ctx===e)&&(t?n.kill(1):n.revert(!0,!0));Ds=!0,e&&Hm(e),e||pr("revert")},Gm=function(t,e){le.cache++,(e||!Fn)&&le.forEach(function(n){return An(n)&&n.cacheID++&&(n.rec=0)}),ni(t)&&(vu=t,ue.history.scrollRestoration!==t&&(ue.history.scrollRestoration=t))},Fn,ur=0,Mm,Yx=function(){if(Mm!==ur){var t=Mm=ur;requestAnimationFrame(function(){return t===ur&&lr(!0)})}},Wm=function(){Ee.appendChild(to),yu=!Nn&&to.offsetHeight||ue.innerHeight,Ee.removeChild(to)},Sm=function(t){return Ma(".gsap-marker-start, .gsap-marker-end, .gsap-marker-scroller-start, .gsap-marker-scroller-end").forEach(function(e){return e.style.display=t?"none":"block"})},lr=function(t,e){if(ii=Ce.documentElement,Ee=Ce.body,xu=[ue,Ce,ii,Ee],gi&&!t&&!Ds){pn(ie,"scrollEnd",zm);return}Wm(),Fn=ie.isRefreshing=!0,Ds||Vm();var n=pr("refreshInit");Rm&&ie.sort(),e||Tu(),le.forEach(function(i){An(i)&&(i.smooth&&(i.target.style.scrollBehavior="auto"),i(0))}),he.slice(0).forEach(function(i){return i.refresh()}),Ds=!1,he.forEach(function(i){if(i._subPinOffset&&i.pin){var r=i.vars.horizontal?"offsetWidth":"offsetHeight",o=i.pin[r];i.revert(!0,1),i.adjustPinSpacing(i.pin[r]-o),i.refresh()}}),pu=1,Sm(!0),he.forEach(function(i){var r=Bi(i.scroller,i._dir),o=i.vars.end==="max"||i._endClamp&&i.end>r,a=i._startClamp&&i.start>=r;(o||a)&&i.setPositions(a?r-1:i.start,o?Math.max(a?r:i.start+1,r):i.end,!0)}),Sm(!1),pu=0,n.forEach(function(i){return i&&i.render&&i.render(-1)}),le.forEach(function(i){An(i)&&(i.smooth&&requestAnimationFrame(function(){return i.target.style.scrollBehavior="smooth"}),i.rec&&i(i.rec))}),Gm(vu,1),Fl.pause(),ur++,Fn=2,ns(2),he.forEach(function(i){return An(i.vars.onRefresh)&&i.vars.onRefresh(i)}),Fn=ie.isRefreshing=!1,pr("refresh")},gu=0,Ul=1,ya,ns=function(t){if(t===2||!Fn&&!Ds){ie.isUpdating=!0,ya&&ya.update(0);var e=he.length,n=En(),i=n-au>=50,r=e&&he[0].scroll();if(Ul=gu>r?-1:1,Fn||(gu=r),i&&(gi&&!zl&&n-gi>200&&(gi=0,pr("scrollEnd")),ha=au,au=n),Ul<0){for(On=e;On-- >0;)he[On]&&he[On].update(0,i);Ul=1}else for(On=0;On<e;On++)he[On]&&he[On].update(0,i);ie.isUpdating=!1}Sa=0},_u=[Fm,Bm,Su,Mu,pi+va,pi+ga,pi+xa,pi+_a,"display","flexShrink","float","zIndex","gridColumnStart","gridColumnEnd","gridRowStart","gridRowEnd","gridArea","justifySelf","alignSelf","placeSelf","order"],Nl=_u.concat([cr,hr,"boxSizing","max"+no,"max"+bu,"position",pi,sn,sn+xa,sn+ga,sn+va,sn+_a]),Zx=function(t,e,n){eo(n);var i=t._gsap;if(i.spacerIsNative)eo(i.spacerState);else if(t._gsap.swappedIn){var r=e.parentNode;r&&(r.insertBefore(t,e),r.removeChild(e))}t._gsap.swappedIn=!1},cu=function(t,e,n,i){if(!t._gsap.swappedIn){for(var r=_u.length,o=e.style,a=t.style,l;r--;)l=_u[r],o[l]=n[l];o.position=n.position==="absolute"?"absolute":"relative",n.display==="inline"&&(o.display="inline-block"),a[Su]=a[Mu]="auto",o.flexBasis=n.flexBasis||"auto",o.overflow="visible",o.boxSizing="border-box",o[cr]=Bl(t,wn)+hn,o[hr]=Bl(t,nn)+hn,o[sn]=a[pi]=a[Bm]=a[Fm]="0",eo(i),a[cr]=a["max"+no]=n[cr],a[hr]=a["max"+bu]=n[hr],a[sn]=n[sn],t.parentNode!==e&&(t.parentNode.insertBefore(e,t),e.appendChild(t)),t._gsap.swappedIn=!0}},$x=/([A-Z])/g,eo=function(t){if(t){var e=t.t.style,n=t.length,i=0,r,o;for((t.t._gsap||Pt.core.getCache(t.t)).uncache=1;i<n;i+=2)o=t[i+1],r=t[i],o?e[r]=o:e[r]&&e.removeProperty(r.replace($x,"-$1").toLowerCase())}},Rl=function(t){for(var e=Nl.length,n=t.style,i=[],r=0;r<e;r++)i.push(Nl[r],n[Nl[r]]);return i.t=t,i},Jx=function(t,e,n){for(var i=[],r=t.length,o=n?8:0,a;o<r;o+=2)a=t[o],i.push(a,a in e?e[a]:t[o+1]);return i.t=t.t,i},Ol={left:0,top:0},bm=function(t,e,n,i,r,o,a,l,c,h,u,f,d,_){An(t)&&(t=t(l)),ni(t)&&t.substr(0,3)==="max"&&(t=f+(t.charAt(4)==="="?Ll("0"+t.substr(3),n):0));var g=d?d.time():0,m,p,S;if(d&&d.seek(0),isNaN(t)||(t=+t),da(t))d&&(t=Pt.utils.mapRange(d.scrollTrigger.start,d.scrollTrigger.end,0,f,t)),a&&Dl(a,n,i,!0);else{An(e)&&(e=e(l));var M=(t||"0").split(" "),x,A,E,T;S=Un(e,l)||Ee,x=es(S)||{},(!x||!x.left&&!x.top)&&mi(S).display==="none"&&(T=S.style.display,S.style.display="block",x=es(S),T?S.style.display=T:S.style.removeProperty("display")),A=Ll(M[0],x[i.d]),E=Ll(M[1]||"0",n),t=x[i.p]-c[i.p]-h+A+r-E,a&&Dl(a,E,i,n-E<20||a._isStart&&E>20),n-=n-E}if(_&&(l[_]=t||-.001,t<0&&(t=0)),o){var R=t+n,y=o._isStart;m="scroll"+i.d2,Dl(o,R,i,y&&R>20||!y&&(u?Math.max(Ee[m],ii[m]):o.parentNode[m])<=R+1),u&&(c=es(a),u&&(o.style[i.op.p]=c[i.op.p]-i.op.m-o._offset+hn))}return d&&S&&(m=es(S),d.seek(f),p=es(S),d._caScrollDist=m[i.p]-p[i.p],t=t/d._caScrollDist*f),d&&d.seek(g),d?t:Math.round(t)},Kx=/(webkit|moz|length|cssText|inset)/i,wm=function(t,e,n,i){if(t.parentNode!==e){var r=t.style,o,a;if(e===Ee){t._stOrig=r.cssText,a=mi(t);for(o in a)!+o&&!Kx.test(o)&&a[o]&&typeof r[o]=="string"&&o!=="0"&&(r[o]=a[o]);r.top=n,r.left=i}else r.cssText=t._stOrig;Pt.core.getCache(t).uncache=1,e.appendChild(t)}},Xm=function(t,e,n){var i=e,r=i;return function(o){var a=Math.round(t());return a!==i&&a!==r&&Math.abs(a-i)>3&&Math.abs(a-r)>3&&(o=a,n&&n()),r=i,i=Math.round(o),i}},Pl=function(t,e,n){var i={};i[e.p]="+="+n,Pt.set(t,i)},Tm=function(t,e){var n=ji(t,e),i="_scroll"+e.p2,r=function o(a,l,c,h,u){var f=o.tween,d=l.onComplete,_={};c=c||n();var g=Xm(n,c,function(){f.kill(),o.tween=0});return u=h&&u||0,h=h||a-c,f&&f.kill(),l[i]=a,l.inherit=!1,l.modifiers=_,_[i]=function(){return g(c+h*f.ratio+u*f.ratio*f.ratio)},l.onUpdate=function(){le.cache++,o.tween&&ns()},l.onComplete=function(){o.tween=0,d&&d.call(f)},f=o.tween=Pt.to(t,l),f};return t[i]=n,n.wheelHandler=function(){return r.tween&&r.tween.kill()&&(r.tween=0)},pn(t,"wheel",n.wheelHandler),ie.isTouch&&pn(t,"touchmove",n.wheelHandler),r},ie=function(){function s(e,n){Qr||s.register(Pt)||console.warn("Please gsap.registerPlugin(ScrollTrigger)"),du(this),this.init(e,n)}var t=s.prototype;return t.init=function(n,i){if(this.progress=this.start=0,this.vars&&this.kill(!0,!0),!ua){this.update=this.refresh=this.kill=Fi;return}n=xm(ni(n)||da(n)||n.nodeType?{trigger:n}:n,Al);var r=n,o=r.onUpdate,a=r.toggleClass,l=r.id,c=r.onToggle,h=r.onRefresh,u=r.scrub,f=r.trigger,d=r.pin,_=r.pinSpacing,g=r.invalidateOnRefresh,m=r.anticipatePin,p=r.onScrubComplete,S=r.onSnapComplete,M=r.once,x=r.snap,A=r.pinReparent,E=r.pinSpacer,T=r.containerAnimation,R=r.fastScrollEnd,y=r.preventOverlaps,v=n.horizontal||n.containerAnimation&&n.horizontal!==!1?wn:nn,P=!u&&u!==0,U=Un(n.scroller||ue),z=Pt.core.getCache(U),V=fr(U),$=("pinType"in n?n.pinType:ts(U,"pinType")||V&&"fixed")==="fixed",X=[n.onEnter,n.onLeave,n.onEnterBack,n.onLeaveBack],Y=P&&n.toggleActions.split(" "),W="markers"in n?n.markers:Al.markers,it=V?0:parseFloat(mi(U)["border"+v.p2+no])||0,I=this,ft=n.onRefreshInit&&function(){return n.onRefreshInit(I)},Wt=Hx(U,V,v),Ot=Vx(U,V),Z=0,nt=0,yt=0,st=ji(U,v),Ct,Ut,Qt,se,Yt,kt,N,Me,Zt,H,Rt,fe,Nt,C,b,G,tt,Q,K,_t,ht,xt,Jt,rt,ct,Vt,Bt,wt,te,zt,de,L,dt,q,j,ut,gt,qt,pe;if(I._startClamp=I._endClamp=!1,I._dir=v,m*=45,I.scroller=U,I.scroll=T?T.time.bind(T):st,se=st(),Ds&&st.rec==null&&(st.rec=se),I.vars=n,i=i||n.animation,"refreshPriority"in n&&(Rm=1,n.refreshPriority===-9999&&(ya=I)),z.tweenScroll=z.tweenScroll||{top:Tm(U,nn),left:Tm(U,wn)},I.tweenTo=Ct=z.tweenScroll[v.p],I.scrubDuration=function(vt){dt=da(vt)&&vt,dt?L?L.duration(vt):L=Pt.to(i,{ease:"expo",totalProgress:"+=0",inherit:!1,duration:dt,paused:!0,onComplete:function(){return p&&p(I)}}):(L&&L.progress(1).kill(),L=0)},i&&(i.vars.lazy=!1,i._initted&&!I.isReverted||i.vars.immediateRender!==!1&&n.immediateRender!==!1&&i.duration()&&i.render(0,!0,!0),I.animation=i.pause(),i.scrollTrigger=I,I.scrubDuration(u),zt=0,l||(l=i.vars.id)),x&&((!ar(x)||x.push)&&(x={snapTo:x}),"scrollBehavior"in Ee.style&&Pt.set(V?[Ee,ii]:U,{scrollBehavior:"auto"}),le.forEach(function(vt){return An(vt)&&vt.target===(V?Ce.scrollingElement||ii:U)&&(vt.smooth=!1)}),Qt=An(x.snapTo)?x.snapTo:x.snapTo==="labels"?Wx(i):x.snapTo==="labelsDirectional"?Xx(i):x.directional!==!1?function(vt,Kt){return wu(x.snapTo)(vt,En()-nt<500?0:Kt.direction)}:Pt.utils.snap(x.snapTo),q=x.duration||{min:.1,max:2},q=ar(q)?ma(q.min,q.max):ma(q,q),j=Pt.delayedCall(x.delay||dt/2||.1,function(){var vt=st(),Kt=En()-nt<500,Tt=Ct.tween;if((Kt||Math.abs(I.getVelocity())<10)&&!Tt&&!zl&&Z!==vt){var $t=(vt-kt)/C,Ve=i&&!P?i.totalProgress():$t,re=Kt?0:(Ve-de)/(En()-ha)*1e3||0,Re=Pt.utils.clamp(-$t,1-$t,Jr(re/2)*re/.185),J=$t+(x.inertia===!1?0:Re),lt,et,St=x,me=St.onStart,At=St.onInterrupt,Se=St.onComplete;if(lt=Qt(J,I),da(lt)||(lt=J),et=Math.max(0,Math.round(kt+lt*C)),vt<=N&&vt>=kt&&et!==vt){if(Tt&&!Tt._initted&&Tt.data<=Jr(et-vt))return;x.inertia===!1&&(Re=lt-$t),Ct(et,{duration:q(Jr(Math.max(Jr(J-Ve),Jr(lt-Ve))*.185/re/.05||0)),ease:x.ease||"power3",data:Jr(et-vt),onInterrupt:function(){return j.restart(!0)&&At&&$r(I,At)},onComplete:function(){I.update(),Z=st(),i&&!P&&(L?L.resetTo("totalProgress",lt,i._tTime/i._tDur):i.progress(lt)),zt=de=i&&!P?i.totalProgress():I.progress,S&&S(I),Se&&$r(I,Se)}},vt,Re*C,et-vt-Re*C),me&&$r(I,me,Ct.tween)}}else I.isActive&&Z!==vt&&j.restart(!0)}).pause()),l&&(mu[l]=I),f=I.trigger=Un(f||d!==!0&&d),pe=f&&f._gsap&&f._gsap.stRevert,pe&&(pe=pe(I)),d=d===!0?f:Un(d),ni(a)&&(a={targets:f,className:a}),d&&(_===!1||_===pi||(_=!_&&d.parentNode&&d.parentNode.style&&mi(d.parentNode).display==="flex"?!1:sn),I.pin=d,Ut=Pt.core.getCache(d),Ut.spacer?b=Ut.pinState:(E&&(E=Un(E),E&&!E.nodeType&&(E=E.current||E.nativeElement),Ut.spacerIsNative=!!E,E&&(Ut.spacerState=Rl(E))),Ut.spacer=Q=E||Ce.createElement("div"),Q.classList.add("pin-spacer"),l&&Q.classList.add("pin-spacer-"+l),Ut.pinState=b=Rl(d)),n.force3D!==!1&&Pt.set(d,{force3D:!0}),I.spacer=Q=Ut.spacer,te=mi(d),rt=te[_+v.os2],_t=Pt.getProperty(d),ht=Pt.quickSetter(d,v.a,hn),cu(d,Q,te),tt=Rl(d)),W){fe=ar(W)?xm(W,vm):vm,H=Cl("scroller-start",l,U,v,fe,0),Rt=Cl("scroller-end",l,U,v,fe,0,H),K=H["offset"+v.op.d2];var ve=Un(ts(U,"content")||U);Me=this.markerStart=Cl("start",l,ve,v,fe,K,0,T),Zt=this.markerEnd=Cl("end",l,ve,v,fe,K,0,T),T&&(qt=Pt.quickSetter([Me,Zt],v.a,hn)),!$&&!(Si.length&&ts(U,"fixedMarkers")===!0)&&(Gx(V?Ee:U),Pt.set([H,Rt],{force3D:!0}),Vt=Pt.quickSetter(H,v.a,hn),wt=Pt.quickSetter(Rt,v.a,hn))}if(T){var pt=T.vars.onUpdate,It=T.vars.onUpdateParams;T.eventCallback("onUpdate",function(){I.update(0,0,1),pt&&pt.apply(T,It||[])})}if(I.previous=function(){return he[he.indexOf(I)-1]},I.next=function(){return he[he.indexOf(I)+1]},I.revert=function(vt,Kt){if(!Kt)return I.kill(!0);var Tt=vt!==!1||!I.enabled,$t=Tn;Tt!==I.isReverted&&(Tt&&(ut=Math.max(st(),I.scroll.rec||0),yt=I.progress,gt=i&&i.progress()),Me&&[Me,Zt,H,Rt].forEach(function(Ve){return Ve.style.display=Tt?"none":"block"}),Tt&&(Tn=I,I.update(Tt)),d&&(!A||!I.isActive)&&(Tt?Zx(d,Q,b):cu(d,Q,mi(d),ct)),Tt||I.update(Tt),Tn=$t,I.isReverted=Tt)},I.refresh=function(vt,Kt,Tt,$t){if(!((Tn||!I.enabled)&&!Kt)){if(d&&vt&&gi){pn(s,"scrollEnd",zm);return}!Fn&&ft&&ft(I),Tn=I,Ct.tween&&!Tt&&(Ct.tween.kill(),Ct.tween=0),L&&L.pause(),g&&i&&(i.revert({kill:!1}).invalidate(),i.getChildren?i.getChildren(!0,!0,!1).forEach(function(Ge){return Ge.vars.immediateRender&&Ge.render(0,!0,!0)}):i.vars.immediateRender&&i.render(0,!0,!0)),I.isReverted||I.revert(!0,!0),I._subPinOffset=!1;var Ve=Wt(),re=Ot(),Re=T?T.duration():Bi(U,v),J=C<=.01||!C,lt=0,et=$t||0,St=ar(Tt)?Tt.end:n.end,me=n.endTrigger||f,At=ar(Tt)?Tt.start:n.start||(n.start===0||!f?0:d?"0 0":"0 100%"),Se=I.pinnedContainer=n.pinnedContainer&&Un(n.pinnedContainer,I),w=f&&Math.max(0,he.indexOf(I))||0,D=w,F,k,B,ot,at,mt,Et,jt,ne,Lt,oe,ye,be;for(W&&ar(Tt)&&(ye=Pt.getProperty(H,v.p),be=Pt.getProperty(Rt,v.p));D-- >0;)mt=he[D],mt.end||mt.refresh(0,1)||(Tn=I),Et=mt.pin,Et&&(Et===f||Et===d||Et===Se)&&!mt.isReverted&&(Lt||(Lt=[]),Lt.unshift(mt),mt.revert(!0,!0)),mt!==he[D]&&(w--,D--);for(An(At)&&(At=At(I)),At=pm(At,"start",I),kt=bm(At,f,Ve,v,st(),Me,H,I,re,it,$,Re,T,I._startClamp&&"_startClamp")||(d?-.001:0),An(St)&&(St=St(I)),ni(St)&&!St.indexOf("+=")&&(~St.indexOf(" ")?St=(ni(At)?At.split(" ")[0]:"")+St:(lt=Ll(St.substr(2),Ve),St=ni(At)?At:(T?Pt.utils.mapRange(0,T.duration(),T.scrollTrigger.start,T.scrollTrigger.end,kt):kt)+lt,me=f)),St=pm(St,"end",I),N=Math.max(kt,bm(St||(me?"100% 0":Re),me,Ve,v,st()+lt,Zt,Rt,I,re,it,$,Re,T,I._endClamp&&"_endClamp"))||-.001,lt=0,D=w;D--;)mt=he[D]||{},Et=mt.pin,Et&&mt.start-mt._pinPush<=kt&&!T&&mt.end>0&&(F=mt.end-(I._startClamp?Math.max(0,mt.start):mt.start),(Et===f&&mt.start-mt._pinPush<kt||Et===Se)&&isNaN(At)&&(lt+=F*(1-mt.progress)),Et===d&&(et+=F));if(kt+=lt,N+=lt,I._startClamp&&(I._startClamp+=lt),I._endClamp&&!Fn&&(I._endClamp=N||-.001,N=Math.min(N,Bi(U,v))),C=N-kt||(kt-=.01)&&.001,J&&(yt=Pt.utils.clamp(0,1,Pt.utils.normalize(kt,N,ut))),I._pinPush=et,Me&&lt&&(F={},F[v.a]="+="+lt,Se&&(F[v.p]="-="+st()),Pt.set([Me,Zt],F)),d&&!(pu&&I.end>=Bi(U,v)))F=mi(d),ot=v===nn,B=st(),xt=parseFloat(_t(v.a))+et,!Re&&N>1&&(oe=(V?Ce.scrollingElement||ii:U).style,oe={style:oe,value:oe["overflow"+v.a.toUpperCase()]},V&&mi(Ee)["overflow"+v.a.toUpperCase()]!=="scroll"&&(oe.style["overflow"+v.a.toUpperCase()]="scroll")),cu(d,Q,F),tt=Rl(d),k=es(d,!0),jt=$&&ji(U,ot?wn:nn)(),_?(ct=[_+v.os2,C+et+hn],ct.t=Q,D=_===sn?Bl(d,v)+C+et:0,D&&(ct.push(v.d,D+hn),Q.style.flexBasis!=="auto"&&(Q.style.flexBasis=D+hn)),eo(ct),Se&&he.forEach(function(Ge){Ge.pin===Se&&Ge.vars.pinSpacing!==!1&&(Ge._subPinOffset=!0)}),$&&st(ut)):(D=Bl(d,v),D&&Q.style.flexBasis!=="auto"&&(Q.style.flexBasis=D+hn)),$&&(at={top:k.top+(ot?B-kt:jt)+hn,left:k.left+(ot?jt:B-kt)+hn,boxSizing:"border-box",position:"fixed"},at[cr]=at["max"+no]=Math.ceil(k.width)+hn,at[hr]=at["max"+bu]=Math.ceil(k.height)+hn,at[pi]=at[pi+xa]=at[pi+ga]=at[pi+va]=at[pi+_a]="0",at[sn]=F[sn],at[sn+xa]=F[sn+xa],at[sn+ga]=F[sn+ga],at[sn+va]=F[sn+va],at[sn+_a]=F[sn+_a],G=Jx(b,at,A),Fn&&st(0)),i?(ne=i._initted,ru(1),i.render(i.duration(),!0,!0),Jt=_t(v.a)-xt+C+et,Bt=Math.abs(C-Jt)>1,$&&Bt&&G.splice(G.length-2,2),i.render(0,!0,!0),ne||i.invalidate(!0),i.parent||i.totalTime(i.totalTime()),ru(0)):Jt=C,oe&&(oe.value?oe.style["overflow"+v.a.toUpperCase()]=oe.value:oe.style.removeProperty("overflow-"+v.a));else if(f&&st()&&!T)for(k=f.parentNode;k&&k!==Ee;)k._pinOffset&&(kt-=k._pinOffset,N-=k._pinOffset),k=k.parentNode;Lt&&Lt.forEach(function(Ge){return Ge.revert(!1,!0)}),I.start=kt,I.end=N,se=Yt=Fn?ut:st(),!T&&!Fn&&!Ds&&(se<ut&&st(ut),I.scroll.rec=0),I.revert(!1,!0),nt=En(),j&&(Z=-1,j.restart(!0)),Tn=0,i&&P&&(i._initted||gt)&&i.progress()!==gt&&i.progress(gt||0,!0).render(i.time(),!0,!0),(J||yt!==I.progress||T||g||i&&!i._initted)&&(i&&!P&&(i._initted||yt||i.vars.immediateRender!==!1)&&i.totalProgress(T&&kt<-.001&&!yt?Pt.utils.normalize(kt,N,0):yt,!0),I.progress=J||(se-kt)/C===yt?0:yt),d&&_&&(Q._pinOffset=Math.round(I.progress*Jt)),L&&L.invalidate(),isNaN(ye)||(ye-=Pt.getProperty(H,v.p),be-=Pt.getProperty(Rt,v.p),Pl(H,v,ye),Pl(Me,v,ye-($t||0)),Pl(Rt,v,be),Pl(Zt,v,be-($t||0))),J&&!Fn&&I.update(),h&&!Fn&&!Nt&&(Nt=!0,h(I),Nt=!1)}},I.getVelocity=function(){return(st()-Yt)/(En()-ha)*1e3||0},I.endAnimation=function(){ca(I.callbackAnimation),i&&(L?L.progress(1):i.paused()?P||ca(i,I.direction<0,1):ca(i,i.reversed()))},I.labelToScroll=function(vt){return i&&i.labels&&(kt||I.refresh()||kt)+i.labels[vt]/i.duration()*C||0},I.getTrailing=function(vt){var Kt=he.indexOf(I),Tt=I.direction>0?he.slice(0,Kt).reverse():he.slice(Kt+1);return(ni(vt)?Tt.filter(function($t){return $t.vars.preventOverlaps===vt}):Tt).filter(function($t){return I.direction>0?$t.end<=kt:$t.start>=N})},I.update=function(vt,Kt,Tt){if(!(T&&!Tt&&!vt)){var $t=Fn===!0?ut:I.scroll(),Ve=vt?0:($t-kt)/C,re=Ve<0?0:Ve>1?1:Ve||0,Re=I.progress,J,lt,et,St,me,At,Se,w;if(Kt&&(Yt=se,se=T?st():$t,x&&(de=zt,zt=i&&!P?i.totalProgress():re)),m&&d&&!Tn&&!bl&&gi&&(!re&&kt<$t+($t-Yt)/(En()-ha)*m?re=1e-4:re===1&&N>$t+($t-Yt)/(En()-ha)*m&&(re=.9999)),re!==Re&&I.enabled){if(J=I.isActive=!!re&&re<1,lt=!!Re&&Re<1,At=J!==lt,me=At||!!re!=!!Re,I.direction=re>Re?1:-1,I.progress=re,me&&!Tn&&(et=re&&!Re?0:re===1?1:Re===1?2:3,P&&(St=!At&&Y[et+1]!=="none"&&Y[et+1]||Y[et],w=i&&(St==="complete"||St==="reset"||St in i))),y&&(At||w)&&(w||u||!i)&&(An(y)?y(I):I.getTrailing(y).forEach(function(B){return B.endAnimation()})),P||(L&&!Tn&&!bl?(L._dp._time-L._start!==L._time&&L.render(L._dp._time-L._start),L.resetTo?L.resetTo("totalProgress",re,i._tTime/i._tDur):(L.vars.totalProgress=re,L.invalidate().restart())):i&&i.totalProgress(re,!!(Tn&&(nt||vt)))),d){if(vt&&_&&(Q.style[_+v.os2]=rt),!$)ht(fa(xt+Jt*re));else if(me){if(Se=!vt&&re>Re&&N+1>$t&&$t+1>=Bi(U,v),A)if(!vt&&(J||Se)){var D=es(d,!0),F=$t-kt;wm(d,Ee,D.top+(v===nn?F:0)+hn,D.left+(v===nn?0:F)+hn)}else wm(d,Q);eo(J||Se?G:tt),Bt&&re<1&&J||ht(xt+(re===1&&!Se?Jt:0))}}x&&!Ct.tween&&!Tn&&!bl&&j.restart(!0),a&&(At||M&&re&&(re<1||!ou))&&Ma(a.targets).forEach(function(B){return B.classList[J||M?"add":"remove"](a.className)}),o&&!P&&!vt&&o(I),me&&!Tn?(P&&(w&&(St==="complete"?i.pause().totalProgress(1):St==="reset"?i.restart(!0).pause():St==="restart"?i.restart(!0):i[St]()),o&&o(I)),(At||!ou)&&(c&&At&&$r(I,c),X[et]&&$r(I,X[et]),M&&(re===1?I.kill(!1,1):X[et]=0),At||(et=re===1?1:3,X[et]&&$r(I,X[et]))),R&&!J&&Math.abs(I.getVelocity())>(da(R)?R:2500)&&(ca(I.callbackAnimation),L?L.progress(1):ca(i,St==="reverse"?1:!re,1))):P&&o&&!Tn&&o(I)}if(wt){var k=T?$t/T.duration()*(T._caScrollDist||0):$t;Vt(k+(H._isFlipped?1:0)),wt(k)}qt&&qt(-$t/T.duration()*(T._caScrollDist||0))}},I.enable=function(vt,Kt){I.enabled||(I.enabled=!0,pn(U,"resize",pa),V||pn(U,"scroll",Kr),ft&&pn(s,"refreshInit",ft),vt!==!1&&(I.progress=yt=0,se=Yt=Z=st()),Kt!==!1&&I.refresh())},I.getTween=function(vt){return vt&&Ct?Ct.tween:L},I.setPositions=function(vt,Kt,Tt,$t){if(T){var Ve=T.scrollTrigger,re=T.duration(),Re=Ve.end-Ve.start;vt=Ve.start+Re*vt/re,Kt=Ve.start+Re*Kt/re}I.refresh(!1,!1,{start:mm(vt,Tt&&!!I._startClamp),end:mm(Kt,Tt&&!!I._endClamp)},$t),I.update()},I.adjustPinSpacing=function(vt){if(ct&&vt){var Kt=ct.indexOf(v.d)+1;ct[Kt]=parseFloat(ct[Kt])+vt+hn,ct[1]=parseFloat(ct[1])+vt+hn,eo(ct)}},I.disable=function(vt,Kt){if(vt!==!1&&I.revert(!0,!0),I.enabled&&(I.enabled=I.isActive=!1,Kt||L&&L.pause(),ut=0,Ut&&(Ut.uncache=1),ft&&dn(s,"refreshInit",ft),j&&(j.pause(),Ct.tween&&Ct.tween.kill()&&(Ct.tween=0)),!V)){for(var Tt=he.length;Tt--;)if(he[Tt].scroller===U&&he[Tt]!==I)return;dn(U,"resize",pa),V||dn(U,"scroll",Kr)}},I.kill=function(vt,Kt){I.disable(vt,Kt),L&&!Kt&&L.kill(),l&&delete mu[l];var Tt=he.indexOf(I);Tt>=0&&he.splice(Tt,1),Tt===On&&Ul>0&&On--,Tt=0,he.forEach(function($t){return $t.scroller===I.scroller&&(Tt=1)}),Tt||Fn||Ds||(I.scroll.rec=0),i&&(i.scrollTrigger=null,vt&&i.revert({kill:!1}),Kt||i.kill()),Me&&[Me,Zt,H,Rt].forEach(function($t){return $t.parentNode&&$t.parentNode.removeChild($t)}),ya===I&&(ya=0),d&&(Ut&&(Ut.uncache=1),Tt=0,he.forEach(function($t){return $t.pin===d&&Tt++}),Tt||(Ut.spacer=0)),n.onKill&&n.onKill(I)},he.push(I),I.enable(!1,!1),pe&&pe(I),i&&i.add&&!C){var ee=I.update;I.update=function(){I.update=ee,le.cache++,kt||N||I.refresh()},Pt.delayedCall(.01,I.update),C=.01,kt=N=0}else I.refresh();d&&Yx()},s.register=function(n){return Qr||(Pt=n||Um(),Dm()&&window.document&&s.enable(),Qr=ua),Qr},s.defaults=function(n){if(n)for(var i in n)Al[i]=n[i];return Al},s.disable=function(n,i){ua=0,he.forEach(function(o){return o[i?"kill":"disable"](n)}),dn(ue,"wheel",Kr),dn(Ce,"scroll",Kr),clearInterval(Sl),dn(Ce,"touchcancel",Fi),dn(Ee,"touchstart",Fi),Tl(dn,Ce,"pointerdown,touchstart,mousedown",gm),Tl(dn,Ce,"pointerup,touchend,mouseup",_m),Fl.kill(),wl(dn);for(var r=0;r<le.length;r+=3)El(dn,le[r],le[r+1]),El(dn,le[r],le[r+2])},s.enable=function(){if(ue=window,Ce=document,ii=Ce.documentElement,Ee=Ce.body,Pt){if(Ma=Pt.utils.toArray,ma=Pt.utils.clamp,du=Pt.core.context||Fi,ru=Pt.core.suppressOverwrites||Fi,vu=ue.history.scrollRestoration||"auto",gu=ue.pageYOffset||0,Pt.core.globals("ScrollTrigger",s),Ee){ua=1,to=document.createElement("div"),to.style.height="100vh",to.style.position="absolute",Wm(),zx(),Ke.register(Pt),s.isTouch=Ke.isTouch,Ls=Ke.isTouch&&/(iPad|iPhone|iPod|Mac)/g.test(navigator.userAgent),fu=Ke.isTouch===1,pn(ue,"wheel",Kr),xu=[ue,Ce,ii,Ee],Pt.matchMedia?(s.matchMedia=function(h){var u=Pt.matchMedia(),f;for(f in h)u.add(f,h[f]);return u},Pt.addEventListener("matchMediaInit",function(){Vm(),Tu()}),Pt.addEventListener("matchMediaRevert",function(){return Hm()}),Pt.addEventListener("matchMedia",function(){lr(0,1),pr("matchMedia")}),Pt.matchMedia().add("(orientation: portrait)",function(){return lu(),lu})):console.warn("Requires GSAP 3.11.0 or later"),lu(),pn(Ce,"scroll",Kr);var n=Ee.hasAttribute("style"),i=Ee.style,r=i.borderTopStyle,o=Pt.core.Animation.prototype,a,l;for(o.revert||Object.defineProperty(o,"revert",{value:function(){return this.time(-.01,!0)}}),i.borderTopStyle="solid",a=es(Ee),nn.m=Math.round(a.top+nn.sc())||0,wn.m=Math.round(a.left+wn.sc())||0,r?i.borderTopStyle=r:i.removeProperty("border-top-style"),n||(Ee.setAttribute("style",""),Ee.removeAttribute("style")),Sl=setInterval(ym,250),Pt.delayedCall(.5,function(){return bl=0}),pn(Ce,"touchcancel",Fi),pn(Ee,"touchstart",Fi),Tl(pn,Ce,"pointerdown,touchstart,mousedown",gm),Tl(pn,Ce,"pointerup,touchend,mouseup",_m),uu=Pt.utils.checkPrefix("transform"),Nl.push(uu),Qr=En(),Fl=Pt.delayedCall(.2,lr).pause(),jr=[Ce,"visibilitychange",function(){var h=ue.innerWidth,u=ue.innerHeight;Ce.hidden?(fm=h,dm=u):(fm!==h||dm!==u)&&pa()},Ce,"DOMContentLoaded",lr,ue,"load",lr,ue,"resize",pa],wl(pn),he.forEach(function(h){return h.enable(0,1)}),l=0;l<le.length;l+=3)El(dn,le[l],le[l+1]),El(dn,le[l],le[l+2])}else if(Ce){var c=function h(){s.enable(),Ce.removeEventListener("DOMContentLoaded",h)};Ce.addEventListener("DOMContentLoaded",c)}}},s.config=function(n){"limitCallbacks"in n&&(ou=!!n.limitCallbacks);var i=n.syncInterval;i&&clearInterval(Sl)||(Sl=i)&&setInterval(ym,i),"ignoreMobileResize"in n&&(fu=s.isTouch===1&&n.ignoreMobileResize),"autoRefreshEvents"in n&&(wl(dn)||wl(pn,n.autoRefreshEvents||"none"),Pm=(n.autoRefreshEvents+"").indexOf("resize")===-1)},s.scrollerProxy=function(n,i){var r=Un(n),o=le.indexOf(r),a=fr(r);~o&&le.splice(o,a?6:2),i&&(a?Si.unshift(ue,i,Ee,i,ii,i):Si.unshift(r,i))},s.clearMatchMedia=function(n){he.forEach(function(i){return i._ctx&&i._ctx.query===n&&i._ctx.kill(!0,!0)})},s.isInViewport=function(n,i,r){var o=(ni(n)?Un(n):n).getBoundingClientRect(),a=o[r?cr:hr]*i||0;return r?o.right-a>0&&o.left+a<ue.innerWidth:o.bottom-a>0&&o.top+a<ue.innerHeight},s.positionInViewport=function(n,i,r){ni(n)&&(n=Un(n));var o=n.getBoundingClientRect(),a=o[r?cr:hr],l=i==null?a/2:i in kl?kl[i]*a:~i.indexOf("%")?parseFloat(i)*a/100:parseFloat(i)||0;return r?(o.left+l)/ue.innerWidth:(o.top+l)/ue.innerHeight},s.killAll=function(n){if(he.slice(0).forEach(function(r){return r.vars.id!=="ScrollSmoother"&&r.kill()}),n!==!0){var i=dr.killAll||[];dr={},i.forEach(function(r){return r()})}},s}();ie.version="3.15.1";ie.saveStyles=function(s){return s?Ma(s).forEach(function(t){if(t&&t.style){var e=ei.indexOf(t);e>=0&&ei.splice(e,5),ei.push(t,t.style.cssText,t.getBBox&&t.getAttribute("transform"),Pt.core.getCache(t),du())}}):ei};ie.revert=function(s,t){return Tu(!s,t)};ie.create=function(s,t){return new ie(s,t)};ie.refresh=function(s){return s?pa(!0):(Qr||ie.register())&&lr(!0)};ie.update=function(s){return++le.cache&&ns(s===!0?2:0)};ie.clearScrollMemory=Gm;ie.maxScroll=function(s,t){return Bi(s,t?wn:nn)};ie.getScrollFunc=function(s,t){return ji(Un(s),t?wn:nn)};ie.getById=function(s){return mu[s]};ie.getAll=function(){return he.filter(function(s){return s.vars.id!=="ScrollSmoother"})};ie.isScrolling=function(){return!!gi};ie.snapDirectional=wu;ie.addEventListener=function(s,t){var e=dr[s]||(dr[s]=[]);~e.indexOf(t)||e.push(t)};ie.removeEventListener=function(s,t){var e=dr[s],n=e&&e.indexOf(t);n>=0&&e.splice(n,1)};ie.batch=function(s,t){var e=[],n={},i=t.interval||.016,r=t.batchMax||1e9,o=function(c,h){var u=[],f=[],d=Pt.delayedCall(i,function(){h(u,f),u=[],f=[]}).pause();return function(_){u.length||d.restart(!0),u.push(_.trigger),f.push(_),r<=u.length&&d.progress(1)}},a;for(a in t)n[a]=a.substr(0,2)==="on"&&An(t[a])&&a!=="onRefreshInit"?o(a,t[a]):t[a];return An(r)&&(r=r(),pn(ie,"refresh",function(){return r=t.batchMax()})),Ma(s).forEach(function(l){var c={};for(a in n)c[a]=n[a];c.trigger=l,e.push(ie.create(c))}),e};var Em=function(t,e,n,i){return e>i?t(i):e<0&&t(0),n>i?(i-e)/(n-e):n<0?e/(e-n):1},hu=function s(t,e){e===!0?t.style.removeProperty("touch-action"):t.style.touchAction=e===!0?"auto":e?"pan-"+e+(Ke.isTouch?" pinch-zoom":""):"none",t===ii&&s(Ee,e)},Il={auto:1,scroll:1},Qx=function(t){var e=t.event,n=t.target,i=t.axis,r=(e.changedTouches?e.changedTouches[0]:e).target,o=r._gsap||Pt.core.getCache(r),a=En(),l;if(!o._isScrollT||a-o._isScrollT>2e3){for(;r&&r!==Ee&&(r.scrollHeight<=r.clientHeight&&r.scrollWidth<=r.clientWidth||!(Il[(l=mi(r)).overflowY]||Il[l.overflowX]));)r=r.parentNode;o._isScroll=r&&r!==n&&!fr(r)&&(Il[(l=mi(r)).overflowY]||Il[l.overflowX]),o._isScrollT=a}(o._isScroll||i==="x")&&(e.stopPropagation(),e._gsapAllow=!0)},qm=function(t,e,n,i){return Ke.create({target:t,capture:!0,debounce:!1,lockAxis:!0,type:e,onWheel:i=i&&Qx,onPress:i,onDrag:i,onScroll:i,onEnable:function(){return n&&pn(Ce,Ke.eventTypes[0],Cm,!1,!0)},onDisable:function(){return dn(Ce,Ke.eventTypes[0],Cm,!0)}})},jx=/(input|label|select|textarea)/i,Am,Cm=function(t){var e=jx.test(t.target.tagName);(e||Am)&&(t._gsapAllow=!0,Am=e)},tv=function(t){ar(t)||(t={}),t.preventDefault=t.isNormalizer=t.allowClicks=!0,t.type||(t.type="wheel,touch"),t.debounce=!!t.debounce,t.id=t.id||"normalizer";var e=t,n=e.normalizeScrollX,i=e.momentum,r=e.allowNestedScroll,o=e.onRelease,a,l,c=Un(t.target)||ii,h=Pt.core.globals().ScrollSmoother,u=h&&h.get(),f=Ls&&(t.content&&Un(t.content)||u&&t.content!==!1&&!u.smooth()&&u.content()),d=ji(c,nn),_=ji(c,wn),g=1,m=(Ke.isTouch&&ue.visualViewport?ue.visualViewport.scale*ue.visualViewport.width:ue.outerWidth)/ue.innerWidth,p=0,S=An(i)?function(){return i(a)}:function(){return i||2.8},M,x,A=qm(c,t.type,!0,r),E=function(){return x=!1},T=Fi,R=Fi,y=function(){l=Bi(c,nn),R=ma(Ls?1:0,l),n&&(T=ma(0,Bi(c,wn))),M=ur},v=function(){f._gsap.y=fa(parseFloat(f._gsap.y)+d.offset)+"px",f.style.transform="matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, "+parseFloat(f._gsap.y)+", 0, 1)",d.offset=d.cacheID=0},P=function(){if(x){requestAnimationFrame(E);var W=fa(a.deltaY/2),it=R(d.v-W);if(f&&it!==d.v+d.offset){d.offset=it-d.v;var I=fa((parseFloat(f&&f._gsap.y)||0)-d.offset);f.style.transform="matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, "+I+", 0, 1)",f._gsap.y=I+"px",d.cacheID=le.cache,ns()}return!0}d.offset&&v(),x=!0},U,z,V,$,X=function(){y(),U.isActive()&&U.vars.scrollY>l&&(d()>l?U.progress(1)&&d(l):U.resetTo("scrollY",l))};return f&&Pt.set(f,{y:"+=0"}),t.ignoreCheck=function(Y){return Ls&&Y.type==="touchmove"&&P(Y)||g>1.05&&Y.type!=="touchstart"||a.isGesturing||Y.touches&&Y.touches.length>1},t.onPress=function(){x=!1;var Y=g;g=fa((ue.visualViewport&&ue.visualViewport.scale||1)/m),U.pause(),Y!==g&&hu(c,g>1.01?!0:n?!1:"x"),z=_(),V=d(),y(),M=ur},t.onRelease=t.onGestureStart=function(Y,W){if(d.offset&&v(),!W)$.restart(!0);else{le.cache++;var it=S(),I,ft;n&&(I=_(),ft=I+it*.05*-Y.velocityX/.227,it*=Em(_,I,ft,Bi(c,wn)),U.vars.scrollX=T(ft)),I=d(),ft=I+it*.05*-Y.velocityY/.227,it*=Em(d,I,ft,Bi(c,nn)),U.vars.scrollY=R(ft),U.invalidate().duration(it).play(.01),(Ls&&U.vars.scrollY>=l||I>=l-1)&&Pt.to({},{onUpdate:X,duration:it})}o&&o(Y)},t.onWheel=function(){U._ts&&U.pause(),En()-p>1e3&&(M=0,p=En())},t.onChange=function(Y,W,it,I,ft){if(ur!==M&&y(),W&&n&&_(T(I[2]===W?z+(Y.startX-Y.x):_()+W-I[1])),it){d.offset&&v();var Wt=ft[2]===it,Ot=Wt?V+Y.startY-Y.y:d()+it-ft[1],Z=R(Ot);Wt&&Ot!==Z&&(V+=Z-Ot),d(Z)}(it||W)&&ns()},t.onEnable=function(){hu(c,n?!1:"x"),ie.addEventListener("refresh",X),pn(ue,"resize",X),d.smooth&&(d.target.style.scrollBehavior="auto",d.smooth=_.smooth=!1),A.enable()},t.onDisable=function(){hu(c,!0),dn(ue,"resize",X),ie.removeEventListener("refresh",X),A.kill()},t.lockAxis=t.lockAxis!==!1,a=new Ke(t),a.iOS=Ls,Ls&&!d()&&d(1),Ls&&Pt.ticker.add(Fi),$=a._dc,U=Pt.to(a,{ease:"power4",paused:!0,inherit:!1,scrollX:n?"+=0.1":"+=0",scrollY:"+=0.1",modifiers:{scrollY:Xm(d,d(),function(){return U.pause()})},onUpdate:ns,onComplete:$.vars.onComplete}),a};ie.sort=function(s){if(An(s))return he.sort(s);var t=ue.pageYOffset||0;return ie.getAll().forEach(function(e){return e._sortY=e.trigger?t+e.trigger.getBoundingClientRect().top:e.start+ue.innerHeight}),he.sort(s||function(e,n){return(e.vars.refreshPriority||0)*-1e6+(e.vars.containerAnimation?1e6:e._sortY)-((n.vars.containerAnimation?1e6:n._sortY)+(n.vars.refreshPriority||0)*-1e6)})};ie.observe=function(s){return new Ke(s)};ie.normalizeScroll=function(s){if(typeof s>"u")return Nn;if(s===!0&&Nn)return Nn.enable();if(s===!1){Nn&&Nn.kill(),Nn=s;return}var t=s instanceof Ke?s:tv(s);return Nn&&Nn.target===t.target&&Nn.kill(),fr(t.target)&&(Nn=t),t};ie.core={_getVelocityProp:Ml,_inputObserver:qm,_scrollers:le,_proxies:Si,bridge:{ss:function(){gi||pr("scrollStart"),gi=En()},ref:function(){return Tn}}};Um()&&Pt.registerPlugin(ie);var Ym="1.3.27";function Jm(s,t,e){return Math.max(s,Math.min(t,e))}function ev(s,t,e){return(1-e)*s+e*t}function nv(s,t,e,n){return ev(s,t,1-Math.exp(-e*n))}function iv(s,t){return(s%t+t)%t}var sv=class{constructor(){Ft(this,"isRunning",!1);Ft(this,"value",0);Ft(this,"from",0);Ft(this,"to",0);Ft(this,"currentTime",0);Ft(this,"lerp");Ft(this,"duration");Ft(this,"easing");Ft(this,"onUpdate")}advance(s){if(!this.isRunning)return;let t=!1;if(this.duration&&this.easing){this.currentTime+=s;let e=Jm(0,this.currentTime/this.duration,1);t=e>=1;let n=t?1:this.easing(e);this.value=this.from+(this.to-this.from)*n}else this.lerp?(this.value=nv(this.value,this.to,this.lerp*60,s),Math.round(this.value)===Math.round(this.to)&&(this.value=this.to,t=!0)):(this.value=this.to,t=!0);t&&this.stop(),this.onUpdate?.(this.value,t)}stop(){this.isRunning=!1}fromTo(s,t,{lerp:e,duration:n,easing:i,onStart:r,onUpdate:o}){this.from=this.value=s,this.to=t,this.lerp=e,this.duration=n,this.easing=i,this.currentTime=0,this.isRunning=!0,r?.(),this.onUpdate=o}};function rv(s,t){let e;return function(...n){clearTimeout(e),e=setTimeout(()=>{e=void 0,s.apply(this,n)},t)}}var ov=class{constructor(s,t,{autoResize:e=!0,debounce:n=250}={}){Ft(this,"width",0);Ft(this,"height",0);Ft(this,"scrollHeight",0);Ft(this,"scrollWidth",0);Ft(this,"debouncedResize");Ft(this,"wrapperResizeObserver");Ft(this,"contentResizeObserver");Ft(this,"resize",()=>{this.onWrapperResize(),this.onContentResize()});Ft(this,"onWrapperResize",()=>{this.wrapper instanceof Window?(this.width=window.innerWidth,this.height=window.innerHeight):(this.width=this.wrapper.clientWidth,this.height=this.wrapper.clientHeight)});Ft(this,"onContentResize",()=>{this.wrapper instanceof Window?(this.scrollHeight=this.content.scrollHeight,this.scrollWidth=this.content.scrollWidth):(this.scrollHeight=this.wrapper.scrollHeight,this.scrollWidth=this.wrapper.scrollWidth)});this.wrapper=s,this.content=t,e&&(this.debouncedResize=rv(this.resize,n),this.wrapper instanceof Window?window.addEventListener("resize",this.debouncedResize):(this.wrapperResizeObserver=new ResizeObserver(this.debouncedResize),this.wrapperResizeObserver.observe(this.wrapper)),this.contentResizeObserver=new ResizeObserver(this.debouncedResize),this.contentResizeObserver.observe(this.content)),this.resize()}destroy(){this.wrapperResizeObserver?.disconnect(),this.contentResizeObserver?.disconnect(),this.wrapper===window&&this.debouncedResize&&window.removeEventListener("resize",this.debouncedResize)}get limit(){return{x:this.scrollWidth-this.width,y:this.scrollHeight-this.height}}},Km=class{constructor(){Ft(this,"events",{})}emit(s,...t){let e=this.events[s]||[];for(let n=0,i=e.length;n<i;n++)e[n]?.(...t)}on(s,t){return this.events[s]?this.events[s].push(t):this.events[s]=[t],()=>{this.events[s]=this.events[s]?.filter(e=>t!==e)}}off(s,t){this.events[s]=this.events[s]?.filter(e=>t!==e)}destroy(){this.events={}}},av=100/6,Us={passive:!1};function Zm(s,t){return s===1?av:s===2?t:1}var lv=class{constructor(s,t={wheelMultiplier:1,touchMultiplier:1}){Ft(this,"touchStart",{x:0,y:0});Ft(this,"lastDelta",{x:0,y:0});Ft(this,"window",{width:0,height:0});Ft(this,"emitter",new Km);Ft(this,"onTouchStart",s=>{let{clientX:t,clientY:e}=s.targetTouches?s.targetTouches[0]:s;this.touchStart.x=t,this.touchStart.y=e,this.lastDelta={x:0,y:0},this.emitter.emit("scroll",{deltaX:0,deltaY:0,event:s})});Ft(this,"onTouchMove",s=>{let{clientX:t,clientY:e}=s.targetTouches?s.targetTouches[0]:s,n=-(t-this.touchStart.x)*this.options.touchMultiplier,i=-(e-this.touchStart.y)*this.options.touchMultiplier;this.touchStart.x=t,this.touchStart.y=e,this.lastDelta={x:n,y:i},this.emitter.emit("scroll",{deltaX:n,deltaY:i,event:s})});Ft(this,"onTouchEnd",s=>{this.emitter.emit("scroll",{deltaX:this.lastDelta.x,deltaY:this.lastDelta.y,event:s})});Ft(this,"onWheel",s=>{let{deltaX:t,deltaY:e,deltaMode:n}=s,i=Zm(n,this.window.width),r=Zm(n,this.window.height);t*=i,e*=r,t*=this.options.wheelMultiplier,e*=this.options.wheelMultiplier,this.emitter.emit("scroll",{deltaX:t,deltaY:e,event:s})});Ft(this,"onWindowResize",()=>{this.window={width:window.innerWidth,height:window.innerHeight}});this.element=s,this.options=t,window.addEventListener("resize",this.onWindowResize),this.onWindowResize(),this.element.addEventListener("wheel",this.onWheel,Us),this.element.addEventListener("touchstart",this.onTouchStart,Us),this.element.addEventListener("touchmove",this.onTouchMove,Us),this.element.addEventListener("touchend",this.onTouchEnd,Us)}on(s,t){return this.emitter.on(s,t)}destroy(){this.emitter.destroy(),window.removeEventListener("resize",this.onWindowResize),this.element.removeEventListener("wheel",this.onWheel,Us),this.element.removeEventListener("touchstart",this.onTouchStart,Us),this.element.removeEventListener("touchmove",this.onTouchMove,Us),this.element.removeEventListener("touchend",this.onTouchEnd,Us)}},$m=s=>Math.min(1,1.001-2**(-10*s)),Qm=class{constructor({wrapper:s=window,content:t=document.documentElement,eventsTarget:e=s,smoothWheel:n=!0,syncTouch:i=!1,syncTouchLerp:r=.075,touchInertiaExponent:o=1.7,duration:a,easing:l,lerp:c=.1,infinite:h=!1,orientation:u="vertical",gestureOrientation:f=u==="horizontal"?"both":"vertical",touchMultiplier:d=1,wheelMultiplier:_=1,autoResize:g=!0,prevent:m,virtualScroll:p,overscroll:S=!0,autoRaf:M=!1,anchors:x=!1,autoToggle:A=!1,allowNestedScroll:E=!1,__experimental__naiveDimensions:T=!1,naiveDimensions:R=T,stopInertiaOnNavigate:y=!1,respectReducedMotion:v=!0}={}){Ft(this,"_isScrolling",!1);Ft(this,"_isStopped",!1);Ft(this,"_isLocked",!1);Ft(this,"_preventNextNativeScrollEvent",!1);Ft(this,"_resetVelocityTimeout",null);Ft(this,"_rafId",null);Ft(this,"_isDraggingSelection",!1);Ft(this,"reducedMotionMediaQuery",window.matchMedia("(prefers-reduced-motion: reduce)"));Ft(this,"isTouching");Ft(this,"isIos");Ft(this,"time",0);Ft(this,"userData",{});Ft(this,"lastVelocity",0);Ft(this,"velocity",0);Ft(this,"direction",0);Ft(this,"options");Ft(this,"targetScroll");Ft(this,"animatedScroll");Ft(this,"animate",new sv);Ft(this,"emitter",new Km);Ft(this,"dimensions");Ft(this,"virtualScroll");Ft(this,"onScrollEnd",s=>{s instanceof CustomEvent||(this.isScrolling==="smooth"||this.isScrolling===!1)&&s.stopPropagation()});Ft(this,"dispatchScrollendEvent",()=>{this.options.wrapper.dispatchEvent(new CustomEvent("scrollend",{bubbles:this.options.wrapper===window,detail:{lenisScrollEnd:!0}}))});Ft(this,"onTransitionEnd",s=>{s.propertyName?.includes("overflow")&&s.target===this.rootElement&&this.checkOverflow()});Ft(this,"onClick",s=>{let t=s.composedPath().filter(n=>n instanceof HTMLAnchorElement&&n.href).map(n=>new URL(n.href)),e=new URL(window.location.href);if(this.options.anchors){let n=t.find(i=>e.host===i.host&&e.pathname===i.pathname&&i.hash);if(n){let i=typeof this.options.anchors=="object"&&this.options.anchors?this.options.anchors:void 0,r=decodeURIComponent(n.hash);this.scrollTo(r,i);return}}if(this.options.stopInertiaOnNavigate&&t.some(n=>e.host===n.host&&e.pathname!==n.pathname)){this.reset();return}});Ft(this,"onPointerDown",s=>{s.button===1&&this.reset()});Ft(this,"onVirtualScroll",s=>{if(typeof this.options.virtualScroll=="function"&&this.options.virtualScroll(s)===!1)return;let{deltaX:t,deltaY:e,event:n}=s;if(this.emitter.emit("virtual-scroll",{deltaX:t,deltaY:e,event:n}),n.ctrlKey||n.lenisStopPropagation)return;let i=n.type.includes("touch"),r=n.type.includes("wheel");if(i&&this.isIos&&(n.type==="touchstart"&&(this._isDraggingSelection=this.isTouchOnSelectionHandle(n)),this._isDraggingSelection)){n.type==="touchend"&&(this._isDraggingSelection=!1);return}this.isTouching=n.type==="touchstart"||n.type==="touchmove";let o=t===0&&e===0;if(this.options.syncTouch&&i&&n.type==="touchstart"&&o&&!this.isStopped&&!this.isLocked){this.reset();return}let a=this.options.gestureOrientation==="vertical"&&e===0||this.options.gestureOrientation==="horizontal"&&t===0;if(o||a)return;let l=n.composedPath();l=l.slice(0,l.indexOf(this.rootElement));let c=this.options.prevent,h=Math.abs(t)>=Math.abs(e)?"horizontal":"vertical";if(l.find(_=>_ instanceof HTMLElement&&(typeof c=="function"&&c?.(_)||_.hasAttribute?.("data-lenis-prevent")||h==="vertical"&&_.hasAttribute?.("data-lenis-prevent-vertical")||h==="horizontal"&&_.hasAttribute?.("data-lenis-prevent-horizontal")||i&&_.hasAttribute?.("data-lenis-prevent-touch")||r&&_.hasAttribute?.("data-lenis-prevent-wheel")||this.options.allowNestedScroll&&this.hasNestedScroll(_,{deltaX:t,deltaY:e}))))return;if(this.isStopped||this.isLocked){n.cancelable&&n.preventDefault();return}if(!(this.options.syncTouch&&i||this.options.smoothWheel&&r)){this.isScrolling="native",this.animate.stop(),n.lenisStopPropagation=!0;return}let u=e;this.options.gestureOrientation==="both"?u=Math.abs(e)>Math.abs(t)?e:t:this.options.gestureOrientation==="horizontal"&&(u=t),(!this.options.overscroll||this.options.infinite||this.options.wrapper!==window&&this.limit>0&&(this.animatedScroll>0&&this.animatedScroll<this.limit||this.animatedScroll===0&&e>0||this.animatedScroll===this.limit&&e<0))&&(n.lenisStopPropagation=!0),n.cancelable&&n.preventDefault();let f=i&&this.options.syncTouch,d=i&&n.type==="touchend";d&&(u=Math.sign(u)*Math.abs(this.velocity)**this.options.touchInertiaExponent),this.scrollTo(this.targetScroll+u,{programmatic:!1,...f?{lerp:d?this.options.syncTouchLerp:1}:{lerp:this.options.lerp,duration:this.options.duration,easing:this.options.easing}})});Ft(this,"onNativeScroll",()=>{if(this._resetVelocityTimeout!==null&&(clearTimeout(this._resetVelocityTimeout),this._resetVelocityTimeout=null),this._preventNextNativeScrollEvent){this._preventNextNativeScrollEvent=!1;return}if(this.isScrolling===!1||this.isScrolling==="native"){let s=this.animatedScroll;this.animatedScroll=this.targetScroll=this.actualScroll,this.lastVelocity=this.velocity,this.velocity=this.animatedScroll-s,this.direction=Math.sign(this.animatedScroll-s),this.isStopped||(this.isScrolling="native"),this.emit(),this.velocity!==0&&(this._resetVelocityTimeout=setTimeout(()=>{this.lastVelocity=this.velocity,this.velocity=0,this.isScrolling=!1,this.emit()},400))}});Ft(this,"raf",s=>{let t=s-(this.time||s);this.time=s,this.animate.advance(t*.001),this.options.autoRaf&&(this._rafId=requestAnimationFrame(this.raf))});window.lenisVersion=Ym,window.lenis||(window.lenis={}),window.lenis.version=Ym,u==="horizontal"&&(window.lenis.horizontal=!0),i===!0&&(window.lenis.touch=!0),this.isIos=/(iPad|iPhone|iPod)/g.test(navigator.userAgent),(!s||s===document.documentElement)&&(s=window),typeof a=="number"&&typeof l!="function"?l=$m:typeof l=="function"&&typeof a!="number"&&(a=1),this.options={wrapper:s,content:t,eventsTarget:e,smoothWheel:n,syncTouch:i,syncTouchLerp:r,touchInertiaExponent:o,duration:a,easing:l,lerp:c,infinite:h,gestureOrientation:f,orientation:u,touchMultiplier:d,wheelMultiplier:_,autoResize:g,prevent:m,virtualScroll:p,overscroll:S,autoRaf:M,anchors:x,autoToggle:A,allowNestedScroll:E,naiveDimensions:R,stopInertiaOnNavigate:y,respectReducedMotion:v},this.dimensions=new ov(s,t,{autoResize:g}),this.updateClassName(),this.targetScroll=this.animatedScroll=this.actualScroll,this.options.wrapper.addEventListener("scroll",this.onNativeScroll),this.options.wrapper.addEventListener("scrollend",this.onScrollEnd,{capture:!0}),(this.options.anchors||this.options.stopInertiaOnNavigate)&&this.options.wrapper.addEventListener("click",this.onClick),this.options.wrapper.addEventListener("pointerdown",this.onPointerDown),this.virtualScroll=new lv(e,{touchMultiplier:d,wheelMultiplier:_}),this.virtualScroll.on("scroll",this.onVirtualScroll),this.options.autoToggle&&(this.checkOverflow(),this.rootElement.addEventListener("transitionend",this.onTransitionEnd)),this.options.autoRaf&&(this._rafId=requestAnimationFrame(this.raf))}destroy(){this.emitter.destroy(),this._resetVelocityTimeout!==null&&(clearTimeout(this._resetVelocityTimeout),this._resetVelocityTimeout=null),this.options.wrapper.removeEventListener("scroll",this.onNativeScroll),this.options.wrapper.removeEventListener("scrollend",this.onScrollEnd,{capture:!0}),this.options.wrapper.removeEventListener("pointerdown",this.onPointerDown),(this.options.anchors||this.options.stopInertiaOnNavigate)&&this.options.wrapper.removeEventListener("click",this.onClick),this.virtualScroll.destroy(),this.dimensions.destroy(),this.cleanUpClassName(),this._rafId&&cancelAnimationFrame(this._rafId)}on(s,t){return this.emitter.on(s,t)}off(s,t){return this.emitter.off(s,t)}get overflow(){let s=this.isHorizontal?"overflow-x":"overflow-y";return getComputedStyle(this.rootElement)[s]}checkOverflow(){["hidden","clip"].includes(this.overflow)?this.internalStop():this.internalStart()}setScroll(s){this.isHorizontal?this.options.wrapper.scrollTo({left:s,behavior:"instant"}):this.options.wrapper.scrollTo({top:s,behavior:"instant"})}isTouchOnSelectionHandle(s){let t=window.getSelection();if(!t||t.isCollapsed||t.rangeCount===0)return!1;let e=s.targetTouches[0]??s.changedTouches[0];if(!e)return!1;let n=t.getRangeAt(0).getClientRects();if(n.length===0)return!1;let i=n[0],r=n[n.length-1],o=40,a=Math.hypot(e.clientX-i.left,e.clientY-i.top)<=o,l=Math.hypot(e.clientX-r.right,e.clientY-r.bottom)<=o;return a||l}resize(){this.dimensions.resize(),this.animatedScroll=this.targetScroll=this.actualScroll,this.emit()}emit(){this.emitter.emit("scroll",this)}reset(){this.isLocked=!1,this.isScrolling=!1,this.animatedScroll=this.targetScroll=this.actualScroll,this.lastVelocity=this.velocity=0,this.animate.stop()}start(){if(this.isStopped){if(this.options.autoToggle){this.rootElement.style.removeProperty("overflow");return}this.internalStart()}}internalStart(){this.isStopped&&(this.reset(),this.isStopped=!1,this.emit())}stop(){if(!this.isStopped){if(this.options.autoToggle){this.rootElement.style.setProperty("overflow","clip");return}this.internalStop()}}internalStop(){this.isStopped||(this.reset(),this.isStopped=!0,this.emit())}scrollTo(s,{offset:t=0,immediate:e=!1,lock:n=!1,programmatic:i=!0,lerp:r=i?this.options.lerp:void 0,duration:o=i?this.options.duration:void 0,easing:a=i?this.options.easing:void 0,onStart:l,onComplete:c,force:h=!1,userData:u}={}){if(this.prefersReducedMotion&&(i?e=!0:(r=1,o=void 0,a=void 0)),(this.isStopped||this.isLocked)&&!h)return;let f=s,d=t;if(typeof f=="string"&&["top","left","start","#"].includes(f))f=0;else if(typeof f=="string"&&["bottom","right","end"].includes(f))f=this.limit;else{let _=null;if(typeof f=="string"?(_=f.startsWith("#")?document.getElementById(f.slice(1)):document.querySelector(f),_||(f==="#top"?f=0:console.warn("Lenis: Target not found",f))):f instanceof Element&&(_=f),_){if(this.options.wrapper!==window){let x=this.rootElement.getBoundingClientRect();d-=this.isHorizontal?x.left:x.top}let g=_.getBoundingClientRect(),m=getComputedStyle(_),p=this.isHorizontal?Number.parseFloat(m.scrollMarginLeft):Number.parseFloat(m.scrollMarginTop),S=getComputedStyle(this.rootElement),M=this.isHorizontal?Number.parseFloat(S.scrollPaddingLeft):Number.parseFloat(S.scrollPaddingTop);f=(this.isHorizontal?g.left:g.top)+this.animatedScroll-(Number.isNaN(p)?0:p)-(Number.isNaN(M)?0:M)}}if(typeof f=="number"){if(f+=d,this.options.infinite){if(i){this.targetScroll=this.animatedScroll=this.scroll;let _=f-this.animatedScroll;_>this.limit/2?f-=this.limit:_<-this.limit/2&&(f+=this.limit)}}else f=Jm(0,f,this.limit);if(f===this.targetScroll){l?.(this),c?.(this);return}if(this.userData=u??{},e){this.animatedScroll=this.targetScroll=f,this.setScroll(this.scroll),this.reset(),this.preventNextNativeScrollEvent(),this.emit(),c?.(this),this.userData={},requestAnimationFrame(()=>{this.dispatchScrollendEvent()});return}i||(this.targetScroll=f),typeof o=="number"&&typeof a!="function"?a=$m:typeof a=="function"&&typeof o!="number"&&(o=1),this.animate.fromTo(this.animatedScroll,f,{duration:o,easing:a,lerp:r,onStart:()=>{n&&(this.isLocked=!0),this.isScrolling="smooth",l?.(this)},onUpdate:(_,g)=>{this.isScrolling="smooth",this.lastVelocity=this.velocity,this.velocity=_-this.animatedScroll,this.direction=Math.sign(this.velocity),this.animatedScroll=_,this.setScroll(this.scroll),i&&(this.targetScroll=_),g||this.emit(),g&&(this.reset(),this.emit(),c?.(this),this.userData={},requestAnimationFrame(()=>{this.dispatchScrollendEvent()}),this.preventNextNativeScrollEvent())}})}}preventNextNativeScrollEvent(){this._preventNextNativeScrollEvent=!0,requestAnimationFrame(()=>{this._preventNextNativeScrollEvent=!1})}hasNestedScroll(s,{deltaX:t,deltaY:e}){let n=Date.now();s._lenis||(s._lenis={});let i=s._lenis,r,o,a,l,c,h,u,f,d,_;if(n-(i.time??0)>2e3){i.time=Date.now();let E=window.getComputedStyle(s);if(i.computedStyle=E,r=["auto","overlay","scroll"].includes(E.overflowX),o=["auto","overlay","scroll"].includes(E.overflowY),c=["auto"].includes(E.overscrollBehaviorX),h=["auto"].includes(E.overscrollBehaviorY),i.hasOverflowX=r,i.hasOverflowY=o,!(r||o))return!1;u=s.scrollWidth,f=s.scrollHeight,d=s.clientWidth,_=s.clientHeight,a=u>d,l=f>_,i.isScrollableX=a,i.isScrollableY=l,i.scrollWidth=u,i.scrollHeight=f,i.clientWidth=d,i.clientHeight=_,i.hasOverscrollBehaviorX=c,i.hasOverscrollBehaviorY=h}else a=i.isScrollableX,l=i.isScrollableY,r=i.hasOverflowX,o=i.hasOverflowY,u=i.scrollWidth,f=i.scrollHeight,d=i.clientWidth,_=i.clientHeight,c=i.hasOverscrollBehaviorX,h=i.hasOverscrollBehaviorY;if(!(r&&a||o&&l))return!1;let g=Math.abs(t)>=Math.abs(e)?"horizontal":"vertical",m,p,S,M,x,A;if(g==="horizontal")m=Math.round(s.scrollLeft),p=u-d,S=t,M=r,x=a,A=c;else if(g==="vertical")m=Math.round(s.scrollTop),p=f-_,S=e,M=o,x=l,A=h;else return!1;return!A&&(m>=p||m<=0)?!0:(S>0?m<p:m>0)&&M&&x}get rootElement(){return this.options.wrapper===window?document.documentElement:this.options.wrapper}get limit(){return this.options.naiveDimensions?this.isHorizontal?this.rootElement.scrollWidth-this.rootElement.clientWidth:this.rootElement.scrollHeight-this.rootElement.clientHeight:this.dimensions.limit[this.isHorizontal?"x":"y"]}get isHorizontal(){return this.options.orientation==="horizontal"}get actualScroll(){let s=this.options.wrapper;return this.isHorizontal?s.scrollX??s.scrollLeft:s.scrollY??s.scrollTop}get scroll(){return this.options.infinite?iv(this.animatedScroll,this.limit):this.animatedScroll}get progress(){return this.limit===0?1:this.scroll/this.limit}get isScrolling(){return this._isScrolling}set isScrolling(s){this._isScrolling!==s&&(this._isScrolling=s,this.updateClassName())}get isStopped(){return this._isStopped}set isStopped(s){this._isStopped!==s&&(this._isStopped=s,this.updateClassName())}get isLocked(){return this._isLocked}set isLocked(s){this._isLocked!==s&&(this._isLocked=s,this.updateClassName())}get isSmooth(){return this.isScrolling==="smooth"}get prefersReducedMotion(){return this.options.respectReducedMotion&&this.reducedMotionMediaQuery.matches}get className(){let s="lenis";return this.options.autoToggle&&(s+=" lenis-autoToggle"),this.isStopped&&(s+=" lenis-stopped"),this.isLocked&&(s+=" lenis-locked"),this.isScrolling&&(s+=" lenis-scrolling"),this.isScrolling==="smooth"&&(s+=" lenis-smooth"),s}updateClassName(){this.cleanUpClassName(),this.className.split(" ").forEach(s=>{this.rootElement.classList.add(s)})}cleanUpClassName(){for(let s of Array.from(this.rootElement.classList))(s==="lenis"||s.startsWith("lenis-"))&&this.rootElement.classList.remove(s)}};var Ed="170";var cv=0,jm=1,hv=2;var c_=1,uv=2,ls=3,Ws=0,$n=1,oi=2,Vi=0,bo=1,xi=2,tg=3,eg=4,fv=5,Sr=100,dv=101,pv=102,mv=103,gv=104,_v=200,xv=201,vv=202,yv=203,af=204,lf=205,Mv=206,Sv=207,bv=208,wv=209,Tv=210,Ev=211,Av=212,Cv=213,Rv=214,cf=0,hf=1,uf=2,Ao=3,ff=4,df=5,pf=6,mf=7,h_=0,Pv=1,Iv=2,Vs=0,Ad=1,Cd=2,Rd=3,Ga=4,Lv=5,Pd=6,Id=7;var u_=300,Co=301,Ro=302,gf=303,_f=304,nh=306,xf=1e3,wr=1001,vf=1002,Ci=1003,Dv=1004;var Hl=1005;var Hi=1006,Eu=1007;var Tr=1008;var ps=1009,f_=1010,d_=1011,Na=1012,Ld=1013,Er=1014,us=1015,Pi=1016,Dd=1017,Ud=1018,Po=1020,p_=35902,m_=1021,g_=1022,Ei=1023,__=1024,x_=1025,wo=1026,Io=1027,v_=1028,Nd=1029,y_=1030,Od=1031;var Fd=1033,vc=33776,yc=33777,Mc=33778,Sc=33779,yf=35840,Mf=35841,Sf=35842,bf=35843,wf=36196,Tf=37492,Ef=37496,Af=37808,Cf=37809,Rf=37810,Pf=37811,If=37812,Lf=37813,Df=37814,Uf=37815,Nf=37816,Of=37817,Ff=37818,Bf=37819,kf=37820,zf=37821,bc=36492,Hf=36494,Vf=36495,M_=36283,Gf=36284,Wf=36285,Xf=36286;var Tc=2300,qf=2301,Au=2302,ng=2400,ig=2401,sg=2402;var Uv=3200,Nv=3201;var S_=0,Ov=1,Hs="",Yn="srgb",ko="srgb-linear",ih="linear",Ae="srgb";var io=7680;var rg=519,Fv=512,Bv=513,kv=514,b_=515,zv=516,Hv=517,Vv=518,Gv=519,Yf=35044;var og="300 es",fs=2e3,Ec=2001,Xs=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){if(this._listeners===void 0)return!1;let n=this._listeners;return n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){if(this._listeners===void 0)return;let i=this._listeners[t];if(i!==void 0){let r=i.indexOf(e);r!==-1&&i.splice(r,1)}}dispatchEvent(t){if(this._listeners===void 0)return;let n=this._listeners[t.type];if(n!==void 0){t.target=this;let i=n.slice(0);for(let r=0,o=i.length;r<o;r++)i[r].call(this,t);t.target=null}}},Cn=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];var wc=Math.PI/180,Ac=180/Math.PI;function Gs(){let s=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Cn[s&255]+Cn[s>>8&255]+Cn[s>>16&255]+Cn[s>>24&255]+"-"+Cn[t&255]+Cn[t>>8&255]+"-"+Cn[t>>16&15|64]+Cn[t>>24&255]+"-"+Cn[e&63|128]+Cn[e>>8&255]+"-"+Cn[e>>16&255]+Cn[e>>24&255]+Cn[n&255]+Cn[n>>8&255]+Cn[n>>16&255]+Cn[n>>24&255]).toLowerCase()}function Zn(s,t,e){return Math.max(t,Math.min(e,s))}function Wv(s,t){return(s%t+t)%t}function Cu(s,t,e){return(1-e)*s+e*t}function zi(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("Invalid component type.")}}function Ie(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("Invalid component type.")}}var Xt=class s{constructor(t=0,e=0){s.prototype.isVector2=!0,this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,i=t.elements;return this.x=i[0]*e+i[3]*n+i[6],this.y=i[1]*e+i[4]*n+i[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Zn(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),i=Math.sin(e),r=this.x-t.x,o=this.y-t.y;return this.x=r*n-o*i+t.x,this.y=r*i+o*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},ae=class s{constructor(t,e,n,i,r,o,a,l,c){s.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,o,a,l,c)}set(t,e,n,i,r,o,a,l,c){let h=this.elements;return h[0]=t,h[1]=i,h[2]=a,h[3]=e,h[4]=r,h[5]=l,h[6]=n,h[7]=o,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[3],l=n[6],c=n[1],h=n[4],u=n[7],f=n[2],d=n[5],_=n[8],g=i[0],m=i[3],p=i[6],S=i[1],M=i[4],x=i[7],A=i[2],E=i[5],T=i[8];return r[0]=o*g+a*S+l*A,r[3]=o*m+a*M+l*E,r[6]=o*p+a*x+l*T,r[1]=c*g+h*S+u*A,r[4]=c*m+h*M+u*E,r[7]=c*p+h*x+u*T,r[2]=f*g+d*S+_*A,r[5]=f*m+d*M+_*E,r[8]=f*p+d*x+_*T,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8];return e*o*h-e*a*c-n*r*h+n*a*l+i*r*c-i*o*l}invert(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],u=h*o-a*c,f=a*l-h*r,d=c*r-o*l,_=e*u+n*f+i*d;if(_===0)return this.set(0,0,0,0,0,0,0,0,0);let g=1/_;return t[0]=u*g,t[1]=(i*c-h*n)*g,t[2]=(a*n-i*o)*g,t[3]=f*g,t[4]=(h*e-i*l)*g,t[5]=(i*r-a*e)*g,t[6]=d*g,t[7]=(n*l-c*e)*g,t[8]=(o*e-n*r)*g,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,i,r,o,a){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*o+c*a)+o+t,-i*c,i*l,-i*(-c*o+l*a)+a+e,0,0,1),this}scale(t,e){return this.premultiply(Ru.makeScale(t,e)),this}rotate(t){return this.premultiply(Ru.makeRotation(-t)),this}translate(t,e){return this.premultiply(Ru.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<9;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}},Ru=new ae;function w_(s){for(let t=s.length-1;t>=0;--t)if(s[t]>=65535)return!0;return!1}function Cc(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function Xv(){let s=Cc("canvas");return s.style.display="block",s}var ag={};function La(s){s in ag||(ag[s]=!0,console.warn(s))}function qv(s,t,e){return new Promise(function(n,i){function r(){switch(s.clientWaitSync(t,s.SYNC_FLUSH_COMMANDS_BIT,0)){case s.WAIT_FAILED:i();break;case s.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}function Yv(s){let t=s.elements;t[2]=.5*t[2]+.5*t[3],t[6]=.5*t[6]+.5*t[7],t[10]=.5*t[10]+.5*t[11],t[14]=.5*t[14]+.5*t[15]}function Zv(s){let t=s.elements;t[11]===-1?(t[10]=-t[10]-1,t[14]=-t[14]):(t[10]=-t[10],t[14]=-t[14]+1)}var _e={enabled:!0,workingColorSpace:ko,spaces:{},convert:function(s,t,e){return this.enabled===!1||t===e||!t||!e||(this.spaces[t].transfer===Ae&&(s.r=ds(s.r),s.g=ds(s.g),s.b=ds(s.b)),this.spaces[t].primaries!==this.spaces[e].primaries&&(s.applyMatrix3(this.spaces[t].toXYZ),s.applyMatrix3(this.spaces[e].fromXYZ)),this.spaces[e].transfer===Ae&&(s.r=To(s.r),s.g=To(s.g),s.b=To(s.b))),s},fromWorkingColorSpace:function(s,t){return this.convert(s,this.workingColorSpace,t)},toWorkingColorSpace:function(s,t){return this.convert(s,t,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===Hs?ih:this.spaces[s].transfer},getLuminanceCoefficients:function(s,t=this.workingColorSpace){return s.fromArray(this.spaces[t].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,t,e){return s.copy(this.spaces[t].toXYZ).multiply(this.spaces[e].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace}};function ds(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function To(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}var lg=[.64,.33,.3,.6,.15,.06],cg=[.2126,.7152,.0722],hg=[.3127,.329],ug=new ae().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),fg=new ae().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);_e.define({[ko]:{primaries:lg,whitePoint:hg,transfer:ih,toXYZ:ug,fromXYZ:fg,luminanceCoefficients:cg,workingColorSpaceConfig:{unpackColorSpace:Yn},outputColorSpaceConfig:{drawingBufferColorSpace:Yn}},[Yn]:{primaries:lg,whitePoint:hg,transfer:Ae,toXYZ:ug,fromXYZ:fg,luminanceCoefficients:cg,outputColorSpaceConfig:{drawingBufferColorSpace:Yn}}});var so,Zf=class{static getDataURL(t){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let e;if(t instanceof HTMLCanvasElement)e=t;else{so===void 0&&(so=Cc("canvas")),so.width=t.width,so.height=t.height;let n=so.getContext("2d");t instanceof ImageData?n.putImageData(t,0,0):n.drawImage(t,0,0,t.width,t.height),e=so}return e.width>2048||e.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",t),e.toDataURL("image/jpeg",.6)):e.toDataURL("image/png")}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=Cc("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let i=n.getImageData(0,0,t.width,t.height),r=i.data;for(let o=0;o<r.length;o++)r[o]=ds(r[o]/255)*255;return n.putImageData(i,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(ds(e[n]/255)*255):e[n]=ds(e[n]);return{data:e,width:t.width,height:t.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},$v=0,Rc=class{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:$v++}),this.uuid=Gs(),this.data=t,this.dataReady=!0,this.version=0}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let o=0,a=i.length;o<a;o++)i[o].isDataTexture?r.push(Pu(i[o].image)):r.push(Pu(i[o]))}else r=Pu(i);n.url=r}return e||(t.images[this.uuid]=n),n}};function Pu(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?Zf.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}var Jv=0,ai=class s extends Xs{constructor(t=s.DEFAULT_IMAGE,e=s.DEFAULT_MAPPING,n=wr,i=wr,r=Hi,o=Tr,a=Ei,l=ps,c=s.DEFAULT_ANISOTROPY,h=Hs){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Jv++}),this.uuid=Gs(),this.name="",this.source=new Rc(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=o,this.anisotropy=c,this.format=a,this.internalFormat=null,this.type=l,this.offset=new Xt(0,0),this.repeat=new Xt(1,1),this.center=new Xt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new ae,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.pmremVersion=0}get image(){return this.source.data}set image(t=null){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==u_)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case xf:t.x=t.x-Math.floor(t.x);break;case wr:t.x=t.x<0?0:1;break;case vf:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case xf:t.y=t.y-Math.floor(t.y);break;case wr:t.y=t.y<0?0:1;break;case vf:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};ai.DEFAULT_IMAGE=null;ai.DEFAULT_MAPPING=u_;ai.DEFAULT_ANISOTROPY=1;var Le=class s{constructor(t=0,e=0,n=0,i=1){s.prototype.isVector4=!0,this.x=t,this.y=e,this.z=n,this.w=i}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,i){return this.x=t,this.y=e,this.z=n,this.w=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,i=this.z,r=this.w,o=t.elements;return this.x=o[0]*e+o[4]*n+o[8]*i+o[12]*r,this.y=o[1]*e+o[5]*n+o[9]*i+o[13]*r,this.z=o[2]*e+o[6]*n+o[10]*i+o[14]*r,this.w=o[3]*e+o[7]*n+o[11]*i+o[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,i,r,l=t.elements,c=l[0],h=l[4],u=l[8],f=l[1],d=l[5],_=l[9],g=l[2],m=l[6],p=l[10];if(Math.abs(h-f)<.01&&Math.abs(u-g)<.01&&Math.abs(_-m)<.01){if(Math.abs(h+f)<.1&&Math.abs(u+g)<.1&&Math.abs(_+m)<.1&&Math.abs(c+d+p-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let M=(c+1)/2,x=(d+1)/2,A=(p+1)/2,E=(h+f)/4,T=(u+g)/4,R=(_+m)/4;return M>x&&M>A?M<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(M),i=E/n,r=T/n):x>A?x<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(x),n=E/i,r=R/i):A<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(A),n=T/r,i=R/r),this.set(n,i,r,e),this}let S=Math.sqrt((m-_)*(m-_)+(u-g)*(u-g)+(f-h)*(f-h));return Math.abs(S)<.001&&(S=1),this.x=(m-_)/S,this.y=(u-g)/S,this.z=(f-h)/S,this.w=Math.acos((c+d+p-1)/2),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this.z=Math.max(t.z,Math.min(e.z,this.z)),this.w=Math.max(t.w,Math.min(e.w,this.w)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this.z=Math.max(t,Math.min(e,this.z)),this.w=Math.max(t,Math.min(e,this.w)),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},$f=class extends Xs{constructor(t=1,e=1,n={}){super(),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=1,this.scissor=new Le(0,0,t,e),this.scissorTest=!1,this.viewport=new Le(0,0,t,e);let i={width:t,height:e,depth:1};n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Hi,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1},n);let r=new ai(i,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace);r.flipY=!1,r.generateMipmaps=n.generateMipmaps,r.internalFormat=n.internalFormat,this.textures=[];let o=n.count;for(let a=0;a<o;a++)this.textures[a]=r.clone(),this.textures[a].isRenderTargetTexture=!0;this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.depthTexture=n.depthTexture,this.samples=n.samples}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)this.textures[i].image.width=t,this.textures[i].image.height=e,this.textures[i].image.depth=n;this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let n=0,i=t.textures.length;n<i;n++)this.textures[n]=t.textures[n].clone(),this.textures[n].isRenderTargetTexture=!0;let e=Object.assign({},t.texture.image);return this.texture.source=new Rc(e),this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},zn=class extends $f{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}},Pc=class extends ai{constructor(t=null,e=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Ci,this.minFilter=Ci,this.wrapR=wr,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}};var Jf=class extends ai{constructor(t=null,e=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Ci,this.minFilter=Ci,this.wrapR=wr,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var qs=class{constructor(t=0,e=0,n=0,i=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=i}static slerpFlat(t,e,n,i,r,o,a){let l=n[i+0],c=n[i+1],h=n[i+2],u=n[i+3],f=r[o+0],d=r[o+1],_=r[o+2],g=r[o+3];if(a===0){t[e+0]=l,t[e+1]=c,t[e+2]=h,t[e+3]=u;return}if(a===1){t[e+0]=f,t[e+1]=d,t[e+2]=_,t[e+3]=g;return}if(u!==g||l!==f||c!==d||h!==_){let m=1-a,p=l*f+c*d+h*_+u*g,S=p>=0?1:-1,M=1-p*p;if(M>Number.EPSILON){let A=Math.sqrt(M),E=Math.atan2(A,p*S);m=Math.sin(m*E)/A,a=Math.sin(a*E)/A}let x=a*S;if(l=l*m+f*x,c=c*m+d*x,h=h*m+_*x,u=u*m+g*x,m===1-a){let A=1/Math.sqrt(l*l+c*c+h*h+u*u);l*=A,c*=A,h*=A,u*=A}}t[e]=l,t[e+1]=c,t[e+2]=h,t[e+3]=u}static multiplyQuaternionsFlat(t,e,n,i,r,o){let a=n[i],l=n[i+1],c=n[i+2],h=n[i+3],u=r[o],f=r[o+1],d=r[o+2],_=r[o+3];return t[e]=a*_+h*u+l*d-c*f,t[e+1]=l*_+h*f+c*u-a*d,t[e+2]=c*_+h*d+a*f-l*u,t[e+3]=h*_-a*u-l*f-c*d,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,i){return this._x=t,this._y=e,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,i=t._y,r=t._z,o=t._order,a=Math.cos,l=Math.sin,c=a(n/2),h=a(i/2),u=a(r/2),f=l(n/2),d=l(i/2),_=l(r/2);switch(o){case"XYZ":this._x=f*h*u+c*d*_,this._y=c*d*u-f*h*_,this._z=c*h*_+f*d*u,this._w=c*h*u-f*d*_;break;case"YXZ":this._x=f*h*u+c*d*_,this._y=c*d*u-f*h*_,this._z=c*h*_-f*d*u,this._w=c*h*u+f*d*_;break;case"ZXY":this._x=f*h*u-c*d*_,this._y=c*d*u+f*h*_,this._z=c*h*_+f*d*u,this._w=c*h*u-f*d*_;break;case"ZYX":this._x=f*h*u-c*d*_,this._y=c*d*u+f*h*_,this._z=c*h*_-f*d*u,this._w=c*h*u+f*d*_;break;case"YZX":this._x=f*h*u+c*d*_,this._y=c*d*u+f*h*_,this._z=c*h*_-f*d*u,this._w=c*h*u-f*d*_;break;case"XZY":this._x=f*h*u-c*d*_,this._y=c*d*u-f*h*_,this._z=c*h*_+f*d*u,this._w=c*h*u+f*d*_;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,i=Math.sin(n);return this._x=t.x*i,this._y=t.y*i,this._z=t.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],i=e[4],r=e[8],o=e[1],a=e[5],l=e[9],c=e[2],h=e[6],u=e[10],f=n+a+u;if(f>0){let d=.5/Math.sqrt(f+1);this._w=.25/d,this._x=(h-l)*d,this._y=(r-c)*d,this._z=(o-i)*d}else if(n>a&&n>u){let d=2*Math.sqrt(1+n-a-u);this._w=(h-l)/d,this._x=.25*d,this._y=(i+o)/d,this._z=(r+c)/d}else if(a>u){let d=2*Math.sqrt(1+a-n-u);this._w=(r-c)/d,this._x=(i+o)/d,this._y=.25*d,this._z=(l+h)/d}else{let d=2*Math.sqrt(1+u-n-a);this._w=(o-i)/d,this._x=(r+c)/d,this._y=(l+h)/d,this._z=.25*d}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<Number.EPSILON?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(Zn(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let i=Math.min(1,e/n);return this.slerp(t,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,i=t._y,r=t._z,o=t._w,a=e._x,l=e._y,c=e._z,h=e._w;return this._x=n*h+o*a+i*c-r*l,this._y=i*h+o*l+r*a-n*c,this._z=r*h+o*c+n*l-i*a,this._w=o*h-n*a-i*l-r*c,this._onChangeCallback(),this}slerp(t,e){if(e===0)return this;if(e===1)return this.copy(t);let n=this._x,i=this._y,r=this._z,o=this._w,a=o*t._w+n*t._x+i*t._y+r*t._z;if(a<0?(this._w=-t._w,this._x=-t._x,this._y=-t._y,this._z=-t._z,a=-a):this.copy(t),a>=1)return this._w=o,this._x=n,this._y=i,this._z=r,this;let l=1-a*a;if(l<=Number.EPSILON){let d=1-e;return this._w=d*o+e*this._w,this._x=d*n+e*this._x,this._y=d*i+e*this._y,this._z=d*r+e*this._z,this.normalize(),this}let c=Math.sqrt(l),h=Math.atan2(c,a),u=Math.sin((1-e)*h)/c,f=Math.sin(e*h)/c;return this._w=o*u+this._w*f,this._x=n*u+this._x*f,this._y=i*u+this._y*f,this._z=r*u+this._z*f,this._onChangeCallback(),this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(t),i*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},O=class s{constructor(t=0,e=0,n=0){s.prototype.isVector3=!0,this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(dg.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(dg.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*i,this.y=r[1]*e+r[4]*n+r[7]*i,this.z=r[2]*e+r[5]*n+r[8]*i,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,i=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*i+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*i+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*i+r[14])*o,this}applyQuaternion(t){let e=this.x,n=this.y,i=this.z,r=t.x,o=t.y,a=t.z,l=t.w,c=2*(o*i-a*n),h=2*(a*e-r*i),u=2*(r*n-o*e);return this.x=e+l*c+o*u-a*h,this.y=n+l*h+a*c-r*u,this.z=i+l*u+r*h-o*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*i,this.y=r[1]*e+r[5]*n+r[9]*i,this.z=r[2]*e+r[6]*n+r[10]*i,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this.z=Math.max(t.z,Math.min(e.z,this.z)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this.z=Math.max(t,Math.min(e,this.z)),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,i=t.y,r=t.z,o=e.x,a=e.y,l=e.z;return this.x=i*l-r*a,this.y=r*o-n*l,this.z=n*a-i*o,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return Iu.copy(this).projectOnVector(t),this.sub(Iu)}reflect(t){return this.sub(Iu.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Zn(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return e*e+n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let i=Math.sin(e)*t;return this.x=i*Math.sin(n),this.y=Math.cos(e)*t,this.z=i*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),i=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=i,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Iu=new O,dg=new qs,Ar=class{constructor(t=new O(1/0,1/0,1/0),e=new O(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(bi.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(bi.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=bi.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)t.isMesh===!0?t.getVertexPosition(o,bi):bi.fromBufferAttribute(r,o),bi.applyMatrix4(t.matrixWorld),this.expandByPoint(bi);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),Vl.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Vl.copy(n.boundingBox)),Vl.applyMatrix4(t.matrixWorld),this.union(Vl)}let i=t.children;for(let r=0,o=i.length;r<o;r++)this.expandByObject(i[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,bi),bi.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(ba),Gl.subVectors(this.max,ba),ro.subVectors(t.a,ba),oo.subVectors(t.b,ba),ao.subVectors(t.c,ba),Ns.subVectors(oo,ro),Os.subVectors(ao,oo),mr.subVectors(ro,ao);let e=[0,-Ns.z,Ns.y,0,-Os.z,Os.y,0,-mr.z,mr.y,Ns.z,0,-Ns.x,Os.z,0,-Os.x,mr.z,0,-mr.x,-Ns.y,Ns.x,0,-Os.y,Os.x,0,-mr.y,mr.x,0];return!Lu(e,ro,oo,ao,Gl)||(e=[1,0,0,0,1,0,0,0,1],!Lu(e,ro,oo,ao,Gl))?!1:(Wl.crossVectors(Ns,Os),e=[Wl.x,Wl.y,Wl.z],Lu(e,ro,oo,ao,Gl))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,bi).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(bi).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(is[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),is[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),is[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),is[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),is[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),is[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),is[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),is[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(is),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}},is=[new O,new O,new O,new O,new O,new O,new O,new O],bi=new O,Vl=new Ar,ro=new O,oo=new O,ao=new O,Ns=new O,Os=new O,mr=new O,ba=new O,Gl=new O,Wl=new O,gr=new O;function Lu(s,t,e,n,i){for(let r=0,o=s.length-3;r<=o;r+=3){gr.fromArray(s,r);let a=i.x*Math.abs(gr.x)+i.y*Math.abs(gr.y)+i.z*Math.abs(gr.z),l=t.dot(gr),c=e.dot(gr),h=n.dot(gr);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>a)return!1}return!0}var Kv=new Ar,wa=new O,Du=new O,Cr=class{constructor(t=new O,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):Kv.setFromPoints(t).getCenter(n);let i=0;for(let r=0,o=t.length;r<o;r++)i=Math.max(i,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(i),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;wa.subVectors(t,this.center);let e=wa.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),i=(n-this.radius)*.5;this.center.addScaledVector(wa,i/n),this.radius+=i}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(Du.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(wa.copy(t.center).add(Du)),this.expandByPoint(wa.copy(t.center).sub(Du))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}},ss=new O,Uu=new O,Xl=new O,Fs=new O,Nu=new O,ql=new O,Ou=new O,Oa=class{constructor(t=new O,e=new O(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,ss)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=ss.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(ss.copy(this.origin).addScaledVector(this.direction,e),ss.distanceToSquared(t))}distanceSqToSegment(t,e,n,i){Uu.copy(t).add(e).multiplyScalar(.5),Xl.copy(e).sub(t).normalize(),Fs.copy(this.origin).sub(Uu);let r=t.distanceTo(e)*.5,o=-this.direction.dot(Xl),a=Fs.dot(this.direction),l=-Fs.dot(Xl),c=Fs.lengthSq(),h=Math.abs(1-o*o),u,f,d,_;if(h>0)if(u=o*l-a,f=o*a-l,_=r*h,u>=0)if(f>=-_)if(f<=_){let g=1/h;u*=g,f*=g,d=u*(u+o*f+2*a)+f*(o*u+f+2*l)+c}else f=r,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*l)+c;else f=-r,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*l)+c;else f<=-_?(u=Math.max(0,-(-o*r+a)),f=u>0?-r:Math.min(Math.max(-r,-l),r),d=-u*u+f*(f+2*l)+c):f<=_?(u=0,f=Math.min(Math.max(-r,-l),r),d=f*(f+2*l)+c):(u=Math.max(0,-(o*r+a)),f=u>0?r:Math.min(Math.max(-r,-l),r),d=-u*u+f*(f+2*l)+c);else f=o>0?-r:r,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),i&&i.copy(Uu).addScaledVector(Xl,f),d}intersectSphere(t,e){ss.subVectors(t.center,this.origin);let n=ss.dot(this.direction),i=ss.dot(ss)-n*n,r=t.radius*t.radius;if(i>r)return null;let o=Math.sqrt(r-i),a=n-o,l=n+o;return l<0?null:a<0?this.at(l,e):this.at(a,e)}intersectsSphere(t){return this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,i,r,o,a,l,c=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,f=this.origin;return c>=0?(n=(t.min.x-f.x)*c,i=(t.max.x-f.x)*c):(n=(t.max.x-f.x)*c,i=(t.min.x-f.x)*c),h>=0?(r=(t.min.y-f.y)*h,o=(t.max.y-f.y)*h):(r=(t.max.y-f.y)*h,o=(t.min.y-f.y)*h),n>o||r>i||((r>n||isNaN(n))&&(n=r),(o<i||isNaN(i))&&(i=o),u>=0?(a=(t.min.z-f.z)*u,l=(t.max.z-f.z)*u):(a=(t.max.z-f.z)*u,l=(t.min.z-f.z)*u),n>l||a>i)||((a>n||n!==n)&&(n=a),(l<i||i!==i)&&(i=l),i<0)?null:this.at(n>=0?n:i,e)}intersectsBox(t){return this.intersectBox(t,ss)!==null}intersectTriangle(t,e,n,i,r){Nu.subVectors(e,t),ql.subVectors(n,t),Ou.crossVectors(Nu,ql);let o=this.direction.dot(Ou),a;if(o>0){if(i)return null;a=1}else if(o<0)a=-1,o=-o;else return null;Fs.subVectors(this.origin,t);let l=a*this.direction.dot(ql.crossVectors(Fs,ql));if(l<0)return null;let c=a*this.direction.dot(Nu.cross(Fs));if(c<0||l+c>o)return null;let h=-a*Fs.dot(Ou);return h<0?null:this.at(h/o,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Be=class s{constructor(t,e,n,i,r,o,a,l,c,h,u,f,d,_,g,m){s.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,o,a,l,c,h,u,f,d,_,g,m)}set(t,e,n,i,r,o,a,l,c,h,u,f,d,_,g,m){let p=this.elements;return p[0]=t,p[4]=e,p[8]=n,p[12]=i,p[1]=r,p[5]=o,p[9]=a,p[13]=l,p[2]=c,p[6]=h,p[10]=u,p[14]=f,p[3]=d,p[7]=_,p[11]=g,p[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new s().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){let e=this.elements,n=t.elements,i=1/lo.setFromMatrixColumn(t,0).length(),r=1/lo.setFromMatrixColumn(t,1).length(),o=1/lo.setFromMatrixColumn(t,2).length();return e[0]=n[0]*i,e[1]=n[1]*i,e[2]=n[2]*i,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*o,e[9]=n[9]*o,e[10]=n[10]*o,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,i=t.y,r=t.z,o=Math.cos(n),a=Math.sin(n),l=Math.cos(i),c=Math.sin(i),h=Math.cos(r),u=Math.sin(r);if(t.order==="XYZ"){let f=o*h,d=o*u,_=a*h,g=a*u;e[0]=l*h,e[4]=-l*u,e[8]=c,e[1]=d+_*c,e[5]=f-g*c,e[9]=-a*l,e[2]=g-f*c,e[6]=_+d*c,e[10]=o*l}else if(t.order==="YXZ"){let f=l*h,d=l*u,_=c*h,g=c*u;e[0]=f+g*a,e[4]=_*a-d,e[8]=o*c,e[1]=o*u,e[5]=o*h,e[9]=-a,e[2]=d*a-_,e[6]=g+f*a,e[10]=o*l}else if(t.order==="ZXY"){let f=l*h,d=l*u,_=c*h,g=c*u;e[0]=f-g*a,e[4]=-o*u,e[8]=_+d*a,e[1]=d+_*a,e[5]=o*h,e[9]=g-f*a,e[2]=-o*c,e[6]=a,e[10]=o*l}else if(t.order==="ZYX"){let f=o*h,d=o*u,_=a*h,g=a*u;e[0]=l*h,e[4]=_*c-d,e[8]=f*c+g,e[1]=l*u,e[5]=g*c+f,e[9]=d*c-_,e[2]=-c,e[6]=a*l,e[10]=o*l}else if(t.order==="YZX"){let f=o*l,d=o*c,_=a*l,g=a*c;e[0]=l*h,e[4]=g-f*u,e[8]=_*u+d,e[1]=u,e[5]=o*h,e[9]=-a*h,e[2]=-c*h,e[6]=d*u+_,e[10]=f-g*u}else if(t.order==="XZY"){let f=o*l,d=o*c,_=a*l,g=a*c;e[0]=l*h,e[4]=-u,e[8]=c*h,e[1]=f*u+g,e[5]=o*h,e[9]=d*u-_,e[2]=_*u-d,e[6]=a*h,e[10]=g*u+f}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(Qv,t,jv)}lookAt(t,e,n){let i=this.elements;return si.subVectors(t,e),si.lengthSq()===0&&(si.z=1),si.normalize(),Bs.crossVectors(n,si),Bs.lengthSq()===0&&(Math.abs(n.z)===1?si.x+=1e-4:si.z+=1e-4,si.normalize(),Bs.crossVectors(n,si)),Bs.normalize(),Yl.crossVectors(si,Bs),i[0]=Bs.x,i[4]=Yl.x,i[8]=si.x,i[1]=Bs.y,i[5]=Yl.y,i[9]=si.y,i[2]=Bs.z,i[6]=Yl.z,i[10]=si.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[4],l=n[8],c=n[12],h=n[1],u=n[5],f=n[9],d=n[13],_=n[2],g=n[6],m=n[10],p=n[14],S=n[3],M=n[7],x=n[11],A=n[15],E=i[0],T=i[4],R=i[8],y=i[12],v=i[1],P=i[5],U=i[9],z=i[13],V=i[2],$=i[6],X=i[10],Y=i[14],W=i[3],it=i[7],I=i[11],ft=i[15];return r[0]=o*E+a*v+l*V+c*W,r[4]=o*T+a*P+l*$+c*it,r[8]=o*R+a*U+l*X+c*I,r[12]=o*y+a*z+l*Y+c*ft,r[1]=h*E+u*v+f*V+d*W,r[5]=h*T+u*P+f*$+d*it,r[9]=h*R+u*U+f*X+d*I,r[13]=h*y+u*z+f*Y+d*ft,r[2]=_*E+g*v+m*V+p*W,r[6]=_*T+g*P+m*$+p*it,r[10]=_*R+g*U+m*X+p*I,r[14]=_*y+g*z+m*Y+p*ft,r[3]=S*E+M*v+x*V+A*W,r[7]=S*T+M*P+x*$+A*it,r[11]=S*R+M*U+x*X+A*I,r[15]=S*y+M*z+x*Y+A*ft,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],i=t[8],r=t[12],o=t[1],a=t[5],l=t[9],c=t[13],h=t[2],u=t[6],f=t[10],d=t[14],_=t[3],g=t[7],m=t[11],p=t[15];return _*(+r*l*u-i*c*u-r*a*f+n*c*f+i*a*d-n*l*d)+g*(+e*l*d-e*c*f+r*o*f-i*o*d+i*c*h-r*l*h)+m*(+e*c*u-e*a*d-r*o*u+n*o*d+r*a*h-n*c*h)+p*(-i*a*h-e*l*u+e*a*f+i*o*u-n*o*f+n*l*h)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let i=this.elements;return t.isVector3?(i[12]=t.x,i[13]=t.y,i[14]=t.z):(i[12]=t,i[13]=e,i[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],u=t[9],f=t[10],d=t[11],_=t[12],g=t[13],m=t[14],p=t[15],S=u*m*c-g*f*c+g*l*d-a*m*d-u*l*p+a*f*p,M=_*f*c-h*m*c-_*l*d+o*m*d+h*l*p-o*f*p,x=h*g*c-_*u*c+_*a*d-o*g*d-h*a*p+o*u*p,A=_*u*l-h*g*l-_*a*f+o*g*f+h*a*m-o*u*m,E=e*S+n*M+i*x+r*A;if(E===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let T=1/E;return t[0]=S*T,t[1]=(g*f*r-u*m*r-g*i*d+n*m*d+u*i*p-n*f*p)*T,t[2]=(a*m*r-g*l*r+g*i*c-n*m*c-a*i*p+n*l*p)*T,t[3]=(u*l*r-a*f*r-u*i*c+n*f*c+a*i*d-n*l*d)*T,t[4]=M*T,t[5]=(h*m*r-_*f*r+_*i*d-e*m*d-h*i*p+e*f*p)*T,t[6]=(_*l*r-o*m*r-_*i*c+e*m*c+o*i*p-e*l*p)*T,t[7]=(o*f*r-h*l*r+h*i*c-e*f*c-o*i*d+e*l*d)*T,t[8]=x*T,t[9]=(_*u*r-h*g*r-_*n*d+e*g*d+h*n*p-e*u*p)*T,t[10]=(o*g*r-_*a*r+_*n*c-e*g*c-o*n*p+e*a*p)*T,t[11]=(h*a*r-o*u*r-h*n*c+e*u*c+o*n*d-e*a*d)*T,t[12]=A*T,t[13]=(h*g*i-_*u*i+_*n*f-e*g*f-h*n*m+e*u*m)*T,t[14]=(_*a*i-o*g*i-_*n*l+e*g*l+o*n*m-e*a*m)*T,t[15]=(o*u*i-h*a*i+h*n*l-e*u*l-o*n*f+e*a*f)*T,this}scale(t){let e=this.elements,n=t.x,i=t.y,r=t.z;return e[0]*=n,e[4]*=i,e[8]*=r,e[1]*=n,e[5]*=i,e[9]*=r,e[2]*=n,e[6]*=i,e[10]*=r,e[3]*=n,e[7]*=i,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],i=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,i))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),i=Math.sin(e),r=1-n,o=t.x,a=t.y,l=t.z,c=r*o,h=r*a;return this.set(c*o+n,c*a-i*l,c*l+i*a,0,c*a+i*l,h*a+n,h*l-i*o,0,c*l-i*a,h*l+i*o,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,i,r,o){return this.set(1,n,r,0,t,1,o,0,e,i,1,0,0,0,0,1),this}compose(t,e,n){let i=this.elements,r=e._x,o=e._y,a=e._z,l=e._w,c=r+r,h=o+o,u=a+a,f=r*c,d=r*h,_=r*u,g=o*h,m=o*u,p=a*u,S=l*c,M=l*h,x=l*u,A=n.x,E=n.y,T=n.z;return i[0]=(1-(g+p))*A,i[1]=(d+x)*A,i[2]=(_-M)*A,i[3]=0,i[4]=(d-x)*E,i[5]=(1-(f+p))*E,i[6]=(m+S)*E,i[7]=0,i[8]=(_+M)*T,i[9]=(m-S)*T,i[10]=(1-(f+g))*T,i[11]=0,i[12]=t.x,i[13]=t.y,i[14]=t.z,i[15]=1,this}decompose(t,e,n){let i=this.elements,r=lo.set(i[0],i[1],i[2]).length(),o=lo.set(i[4],i[5],i[6]).length(),a=lo.set(i[8],i[9],i[10]).length();this.determinant()<0&&(r=-r),t.x=i[12],t.y=i[13],t.z=i[14],wi.copy(this);let c=1/r,h=1/o,u=1/a;return wi.elements[0]*=c,wi.elements[1]*=c,wi.elements[2]*=c,wi.elements[4]*=h,wi.elements[5]*=h,wi.elements[6]*=h,wi.elements[8]*=u,wi.elements[9]*=u,wi.elements[10]*=u,e.setFromRotationMatrix(wi),n.x=r,n.y=o,n.z=a,this}makePerspective(t,e,n,i,r,o,a=fs){let l=this.elements,c=2*r/(e-t),h=2*r/(n-i),u=(e+t)/(e-t),f=(n+i)/(n-i),d,_;if(a===fs)d=-(o+r)/(o-r),_=-2*o*r/(o-r);else if(a===Ec)d=-o/(o-r),_=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return l[0]=c,l[4]=0,l[8]=u,l[12]=0,l[1]=0,l[5]=h,l[9]=f,l[13]=0,l[2]=0,l[6]=0,l[10]=d,l[14]=_,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(t,e,n,i,r,o,a=fs){let l=this.elements,c=1/(e-t),h=1/(n-i),u=1/(o-r),f=(e+t)*c,d=(n+i)*h,_,g;if(a===fs)_=(o+r)*u,g=-2*u;else if(a===Ec)_=r*u,g=-1*u;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return l[0]=2*c,l[4]=0,l[8]=0,l[12]=-f,l[1]=0,l[5]=2*h,l[9]=0,l[13]=-d,l[2]=0,l[6]=0,l[10]=g,l[14]=-_,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<16;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}},lo=new O,wi=new Be,Qv=new O(0,0,0),jv=new O(1,1,1),Bs=new O,Yl=new O,si=new O,pg=new Be,mg=new qs,Gi=class s{constructor(t=0,e=0,n=0,i=s.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=i}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,i=this._order){return this._x=t,this._y=e,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let i=t.elements,r=i[0],o=i[4],a=i[8],l=i[1],c=i[5],h=i[9],u=i[2],f=i[6],d=i[10];switch(e){case"XYZ":this._y=Math.asin(Zn(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,d),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(f,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Zn(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,d),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(Zn(f,-1,1)),Math.abs(f)<.9999999?(this._y=Math.atan2(-u,d),this._z=Math.atan2(-o,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-Zn(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(f,d),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-o,c));break;case"YZX":this._z=Math.asin(Zn(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(a,d));break;case"XZY":this._z=Math.asin(-Zn(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(f,c),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,d),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return pg.makeRotationFromQuaternion(t),this.setFromRotationMatrix(pg,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return mg.setFromEuler(this),this.setFromQuaternion(mg,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Gi.DEFAULT_ORDER="XYZ";var Ic=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},ty=0,gg=new O,co=new qs,rs=new Be,Zl=new O,Ta=new O,ey=new O,ny=new qs,_g=new O(1,0,0),xg=new O(0,1,0),vg=new O(0,0,1),yg={type:"added"},iy={type:"removed"},ho={type:"childadded",child:null},Fu={type:"childremoved",child:null},on=class s extends Xs{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:ty++}),this.uuid=Gs(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=s.DEFAULT_UP.clone();let t=new O,e=new Gi,n=new qs,i=new O(1,1,1);function r(){n.setFromEuler(e,!1)}function o(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Be},normalMatrix:{value:new ae}}),this.matrix=new Be,this.matrixWorld=new Be,this.matrixAutoUpdate=s.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=s.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Ic,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return co.setFromAxisAngle(t,e),this.quaternion.multiply(co),this}rotateOnWorldAxis(t,e){return co.setFromAxisAngle(t,e),this.quaternion.premultiply(co),this}rotateX(t){return this.rotateOnAxis(_g,t)}rotateY(t){return this.rotateOnAxis(xg,t)}rotateZ(t){return this.rotateOnAxis(vg,t)}translateOnAxis(t,e){return gg.copy(t).applyQuaternion(this.quaternion),this.position.add(gg.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(_g,t)}translateY(t){return this.translateOnAxis(xg,t)}translateZ(t){return this.translateOnAxis(vg,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(rs.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?Zl.copy(t):Zl.set(t,e,n);let i=this.parent;this.updateWorldMatrix(!0,!1),Ta.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?rs.lookAt(Ta,Zl,this.up):rs.lookAt(Zl,Ta,this.up),this.quaternion.setFromRotationMatrix(rs),i&&(rs.extractRotation(i.matrixWorld),co.setFromRotationMatrix(rs),this.quaternion.premultiply(co.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(yg),ho.child=t,this.dispatchEvent(ho),ho.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(iy),Fu.child=t,this.dispatchEvent(Fu),Fu.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),rs.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),rs.multiply(t.parent.matrixWorld)),t.applyMatrix4(rs),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(yg),ho.child=t,this.dispatchEvent(ho),ho.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,i=this.children.length;n<i;n++){let o=this.children[n].getObjectByProperty(t,e);if(o!==void 0)return o}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ta,t,ey),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ta,ny,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e){let n=this.parent;if(t===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),e===!0){let i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].updateWorldMatrix(!1,!0)}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});let i={};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.visibility=this._visibility,i.active=this._active,i.bounds=this._bounds.map(a=>({boxInitialized:a.boxInitialized,boxMin:a.box.min.toArray(),boxMax:a.box.max.toArray(),sphereInitialized:a.sphereInitialized,sphereRadius:a.sphere.radius,sphereCenter:a.sphere.center.toArray()})),i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.geometryCount=this._geometryCount,i.matricesTexture=this._matricesTexture.toJSON(t),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(i.boundingSphere={center:i.boundingSphere.center.toArray(),radius:i.boundingSphere.radius}),this.boundingBox!==null&&(i.boundingBox={min:i.boundingBox.min.toArray(),max:i.boundingBox.max.toArray()}));function r(a,l){return a[l.uuid]===void 0&&(a[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(t.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let l=a.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let u=l[c];r(t.shapes,u)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let l=0,c=this.material.length;l<c;l++)a.push(r(t.materials,this.material[l]));i.material=a}else i.material=r(t.materials,this.material);if(this.children.length>0){i.children=[];for(let a=0;a<this.children.length;a++)i.children.push(this.children[a].toJSON(t).object)}if(this.animations.length>0){i.animations=[];for(let a=0;a<this.animations.length;a++){let l=this.animations[a];i.animations.push(r(t.animations,l))}}if(e){let a=o(t.geometries),l=o(t.materials),c=o(t.textures),h=o(t.images),u=o(t.shapes),f=o(t.skeletons),d=o(t.animations),_=o(t.nodes);a.length>0&&(n.geometries=a),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),u.length>0&&(n.shapes=u),f.length>0&&(n.skeletons=f),d.length>0&&(n.animations=d),_.length>0&&(n.nodes=_)}return n.object=i,n;function o(a){let l=[];for(let c in a){let h=a[c];delete h.metadata,l.push(h)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let i=t.children[n];this.add(i.clone())}return this}};on.DEFAULT_UP=new O(0,1,0);on.DEFAULT_MATRIX_AUTO_UPDATE=!0;on.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Ti=new O,os=new O,Bu=new O,as=new O,uo=new O,fo=new O,Mg=new O,ku=new O,zu=new O,Hu=new O,Vu=new Le,Gu=new Le,Wu=new Le,hs=class s{constructor(t=new O,e=new O,n=new O){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,i){i.subVectors(n,e),Ti.subVectors(t,e),i.cross(Ti);let r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(t,e,n,i,r){Ti.subVectors(i,e),os.subVectors(n,e),Bu.subVectors(t,e);let o=Ti.dot(Ti),a=Ti.dot(os),l=Ti.dot(Bu),c=os.dot(os),h=os.dot(Bu),u=o*c-a*a;if(u===0)return r.set(0,0,0),null;let f=1/u,d=(c*l-a*h)*f,_=(o*h-a*l)*f;return r.set(1-d-_,_,d)}static containsPoint(t,e,n,i){return this.getBarycoord(t,e,n,i,as)===null?!1:as.x>=0&&as.y>=0&&as.x+as.y<=1}static getInterpolation(t,e,n,i,r,o,a,l){return this.getBarycoord(t,e,n,i,as)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,as.x),l.addScaledVector(o,as.y),l.addScaledVector(a,as.z),l)}static getInterpolatedAttribute(t,e,n,i,r,o){return Vu.setScalar(0),Gu.setScalar(0),Wu.setScalar(0),Vu.fromBufferAttribute(t,e),Gu.fromBufferAttribute(t,n),Wu.fromBufferAttribute(t,i),o.setScalar(0),o.addScaledVector(Vu,r.x),o.addScaledVector(Gu,r.y),o.addScaledVector(Wu,r.z),o}static isFrontFacing(t,e,n,i){return Ti.subVectors(n,e),os.subVectors(t,e),Ti.cross(os).dot(i)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,i){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[i]),this}setFromAttributeAndIndices(t,e,n,i){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,i),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Ti.subVectors(this.c,this.b),os.subVectors(this.a,this.b),Ti.cross(os).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return s.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return s.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,i,r){return s.getInterpolation(t,this.a,this.b,this.c,e,n,i,r)}containsPoint(t){return s.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return s.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,i=this.b,r=this.c,o,a;uo.subVectors(i,n),fo.subVectors(r,n),ku.subVectors(t,n);let l=uo.dot(ku),c=fo.dot(ku);if(l<=0&&c<=0)return e.copy(n);zu.subVectors(t,i);let h=uo.dot(zu),u=fo.dot(zu);if(h>=0&&u<=h)return e.copy(i);let f=l*u-h*c;if(f<=0&&l>=0&&h<=0)return o=l/(l-h),e.copy(n).addScaledVector(uo,o);Hu.subVectors(t,r);let d=uo.dot(Hu),_=fo.dot(Hu);if(_>=0&&d<=_)return e.copy(r);let g=d*c-l*_;if(g<=0&&c>=0&&_<=0)return a=c/(c-_),e.copy(n).addScaledVector(fo,a);let m=h*_-d*u;if(m<=0&&u-h>=0&&d-_>=0)return Mg.subVectors(r,i),a=(u-h)/(u-h+(d-_)),e.copy(i).addScaledVector(Mg,a);let p=1/(m+g+f);return o=g*p,a=f*p,e.copy(n).addScaledVector(uo,o).addScaledVector(fo,a)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},T_={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},ks={h:0,s:0,l:0},$l={h:0,s:0,l:0};function Xu(s,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?s+(t-s)*6*e:e<1/2?t:e<2/3?s+(t-s)*6*(2/3-e):s}var Dt=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let i=t;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=Yn){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,_e.toWorkingColorSpace(this,e),this}setRGB(t,e,n,i=_e.workingColorSpace){return this.r=t,this.g=e,this.b=n,_e.toWorkingColorSpace(this,i),this}setHSL(t,e,n,i=_e.workingColorSpace){if(t=Wv(t,1),e=Zn(e,0,1),n=Zn(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,o=2*n-r;this.r=Xu(o,r,t+1/3),this.g=Xu(o,r,t),this.b=Xu(o,r,t-1/3)}return _e.toWorkingColorSpace(this,i),this}setStyle(t,e=Yn){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+t+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,o=i[1],a=i[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:console.warn("THREE.Color: Unknown color model "+t)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=i[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(o===6)return this.setHex(parseInt(r,16),e);console.warn("THREE.Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=Yn){let n=T_[t.toLowerCase()];return n!==void 0?this.setHex(n,e):console.warn("THREE.Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=ds(t.r),this.g=ds(t.g),this.b=ds(t.b),this}copyLinearToSRGB(t){return this.r=To(t.r),this.g=To(t.g),this.b=To(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=Yn){return _e.fromWorkingColorSpace(Rn.copy(this),t),Math.round(Zn(Rn.r*255,0,255))*65536+Math.round(Zn(Rn.g*255,0,255))*256+Math.round(Zn(Rn.b*255,0,255))}getHexString(t=Yn){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=_e.workingColorSpace){_e.fromWorkingColorSpace(Rn.copy(this),e);let n=Rn.r,i=Rn.g,r=Rn.b,o=Math.max(n,i,r),a=Math.min(n,i,r),l,c,h=(a+o)/2;if(a===o)l=0,c=0;else{let u=o-a;switch(c=h<=.5?u/(o+a):u/(2-o-a),o){case n:l=(i-r)/u+(i<r?6:0);break;case i:l=(r-n)/u+2;break;case r:l=(n-i)/u+4;break}l/=6}return t.h=l,t.s=c,t.l=h,t}getRGB(t,e=_e.workingColorSpace){return _e.fromWorkingColorSpace(Rn.copy(this),e),t.r=Rn.r,t.g=Rn.g,t.b=Rn.b,t}getStyle(t=Yn){_e.fromWorkingColorSpace(Rn.copy(this),t);let e=Rn.r,n=Rn.g,i=Rn.b;return t!==Yn?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(t,e,n){return this.getHSL(ks),this.setHSL(ks.h+t,ks.s+e,ks.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(ks),t.getHSL($l);let n=Cu(ks.h,$l.h,e),i=Cu(ks.s,$l.s,e),r=Cu(ks.l,$l.l,e);return this.setHSL(n,i,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,i=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*i,this.g=r[1]*e+r[4]*n+r[7]*i,this.b=r[2]*e+r[5]*n+r[8]*i,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Rn=new Dt;Dt.NAMES=T_;var sy=0,Wi=class extends Xs{static get type(){return"Material"}get type(){return this.constructor.type}set type(t){}constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:sy++}),this.uuid=Gs(),this.name="",this.blending=bo,this.side=Ws,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=af,this.blendDst=lf,this.blendEquation=Sr,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Dt(0,0,0),this.blendAlpha=0,this.depthFunc=Ao,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=rg,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=io,this.stencilZFail=io,this.stencilZPass=io,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){console.warn(`THREE.Material: parameter '${e}' has value of undefined.`);continue}let i=this[e];if(i===void 0){console.warn(`THREE.Material: '${e}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==bo&&(n.blending=this.blending),this.side!==Ws&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==af&&(n.blendSrc=this.blendSrc),this.blendDst!==lf&&(n.blendDst=this.blendDst),this.blendEquation!==Sr&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Ao&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==rg&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==io&&(n.stencilFail=this.stencilFail),this.stencilZFail!==io&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==io&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){let o=[];for(let a in r){let l=r[a];delete l.metadata,o.push(l)}return o}if(e){let r=i(t.textures),o=i(t.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let i=e.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}onBuild(){console.warn("Material: onBuild() has been removed.")}},De=class extends Wi{static get type(){return"MeshBasicMaterial"}constructor(t){super(),this.isMeshBasicMaterial=!0,this.color=new Dt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Gi,this.combine=h_,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}};var rn=new O,Jl=new Xt,gn=class{constructor(t,e,n=!1){if(Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=Yf,this.updateRanges=[],this.gpuType=us,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[t+i]=e.array[n+i];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)Jl.fromBufferAttribute(this,e),Jl.applyMatrix3(t),this.setXY(e,Jl.x,Jl.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)rn.fromBufferAttribute(this,e),rn.applyMatrix3(t),this.setXYZ(e,rn.x,rn.y,rn.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)rn.fromBufferAttribute(this,e),rn.applyMatrix4(t),this.setXYZ(e,rn.x,rn.y,rn.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)rn.fromBufferAttribute(this,e),rn.applyNormalMatrix(t),this.setXYZ(e,rn.x,rn.y,rn.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)rn.fromBufferAttribute(this,e),rn.transformDirection(t),this.setXYZ(e,rn.x,rn.y,rn.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=zi(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=Ie(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=zi(e,this.array)),e}setX(t,e){return this.normalized&&(e=Ie(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=zi(e,this.array)),e}setY(t,e){return this.normalized&&(e=Ie(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=zi(e,this.array)),e}setZ(t,e){return this.normalized&&(e=Ie(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=zi(e,this.array)),e}setW(t,e){return this.normalized&&(e=Ie(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=Ie(e,this.array),n=Ie(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,i){return t*=this.itemSize,this.normalized&&(e=Ie(e,this.array),n=Ie(n,this.array),i=Ie(i,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t*=this.itemSize,this.normalized&&(e=Ie(e,this.array),n=Ie(n,this.array),i=Ie(i,this.array),r=Ie(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==Yf&&(t.usage=this.usage),t}};var Lc=class extends gn{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var Dc=class extends gn{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var Ne=class extends gn{constructor(t,e,n){super(new Float32Array(t),e,n)}},ry=0,_i=new Be,qu=new on,po=new O,ri=new Ar,Ea=new Ar,mn=new O,an=class s extends Xs{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:ry++}),this.uuid=Gs(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(w_(t)?Dc:Lc)(t,1):this.index=t,this}setIndirect(t){return this.indirect=t,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new ae().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(t),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(t){return _i.makeRotationFromQuaternion(t),this.applyMatrix4(_i),this}rotateX(t){return _i.makeRotationX(t),this.applyMatrix4(_i),this}rotateY(t){return _i.makeRotationY(t),this.applyMatrix4(_i),this}rotateZ(t){return _i.makeRotationZ(t),this.applyMatrix4(_i),this}translate(t,e,n){return _i.makeTranslation(t,e,n),this.applyMatrix4(_i),this}scale(t,e,n){return _i.makeScale(t,e,n),this.applyMatrix4(_i),this}lookAt(t){return qu.lookAt(t),qu.updateMatrix(),this.applyMatrix4(qu.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(po).negate(),this.translate(po.x,po.y,po.z),this}setFromPoints(t){let e=this.getAttribute("position");if(e===void 0){let n=[];for(let i=0,r=t.length;i<r;i++){let o=t[i];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new Ne(n,3))}else{for(let n=0,i=e.count;n<i;n++){let r=t[n];e.setXYZ(n,r.x,r.y,r.z||0)}t.length>e.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Ar);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new O(-1/0,-1/0,-1/0),new O(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,i=e.length;n<i;n++){let r=e[n];ri.setFromBufferAttribute(r),this.morphTargetsRelative?(mn.addVectors(this.boundingBox.min,ri.min),this.boundingBox.expandByPoint(mn),mn.addVectors(this.boundingBox.max,ri.max),this.boundingBox.expandByPoint(mn)):(this.boundingBox.expandByPoint(ri.min),this.boundingBox.expandByPoint(ri.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Cr);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new O,1/0);return}if(t){let n=this.boundingSphere.center;if(ri.setFromBufferAttribute(t),e)for(let r=0,o=e.length;r<o;r++){let a=e[r];Ea.setFromBufferAttribute(a),this.morphTargetsRelative?(mn.addVectors(ri.min,Ea.min),ri.expandByPoint(mn),mn.addVectors(ri.max,Ea.max),ri.expandByPoint(mn)):(ri.expandByPoint(Ea.min),ri.expandByPoint(Ea.max))}ri.getCenter(n);let i=0;for(let r=0,o=t.count;r<o;r++)mn.fromBufferAttribute(t,r),i=Math.max(i,n.distanceToSquared(mn));if(e)for(let r=0,o=e.length;r<o;r++){let a=e[r],l=this.morphTargetsRelative;for(let c=0,h=a.count;c<h;c++)mn.fromBufferAttribute(a,c),l&&(po.fromBufferAttribute(t,c),mn.add(po)),i=Math.max(i,n.distanceToSquared(mn))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.position,i=e.normal,r=e.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new gn(new Float32Array(4*n.count),4));let o=this.getAttribute("tangent"),a=[],l=[];for(let R=0;R<n.count;R++)a[R]=new O,l[R]=new O;let c=new O,h=new O,u=new O,f=new Xt,d=new Xt,_=new Xt,g=new O,m=new O;function p(R,y,v){c.fromBufferAttribute(n,R),h.fromBufferAttribute(n,y),u.fromBufferAttribute(n,v),f.fromBufferAttribute(r,R),d.fromBufferAttribute(r,y),_.fromBufferAttribute(r,v),h.sub(c),u.sub(c),d.sub(f),_.sub(f);let P=1/(d.x*_.y-_.x*d.y);isFinite(P)&&(g.copy(h).multiplyScalar(_.y).addScaledVector(u,-d.y).multiplyScalar(P),m.copy(u).multiplyScalar(d.x).addScaledVector(h,-_.x).multiplyScalar(P),a[R].add(g),a[y].add(g),a[v].add(g),l[R].add(m),l[y].add(m),l[v].add(m))}let S=this.groups;S.length===0&&(S=[{start:0,count:t.count}]);for(let R=0,y=S.length;R<y;++R){let v=S[R],P=v.start,U=v.count;for(let z=P,V=P+U;z<V;z+=3)p(t.getX(z+0),t.getX(z+1),t.getX(z+2))}let M=new O,x=new O,A=new O,E=new O;function T(R){A.fromBufferAttribute(i,R),E.copy(A);let y=a[R];M.copy(y),M.sub(A.multiplyScalar(A.dot(y))).normalize(),x.crossVectors(E,y);let P=x.dot(l[R])<0?-1:1;o.setXYZW(R,M.x,M.y,M.z,P)}for(let R=0,y=S.length;R<y;++R){let v=S[R],P=v.start,U=v.count;for(let z=P,V=P+U;z<V;z+=3)T(t.getX(z+0)),T(t.getX(z+1)),T(t.getX(z+2))}}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new gn(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let f=0,d=n.count;f<d;f++)n.setXYZ(f,0,0,0);let i=new O,r=new O,o=new O,a=new O,l=new O,c=new O,h=new O,u=new O;if(t)for(let f=0,d=t.count;f<d;f+=3){let _=t.getX(f+0),g=t.getX(f+1),m=t.getX(f+2);i.fromBufferAttribute(e,_),r.fromBufferAttribute(e,g),o.fromBufferAttribute(e,m),h.subVectors(o,r),u.subVectors(i,r),h.cross(u),a.fromBufferAttribute(n,_),l.fromBufferAttribute(n,g),c.fromBufferAttribute(n,m),a.add(h),l.add(h),c.add(h),n.setXYZ(_,a.x,a.y,a.z),n.setXYZ(g,l.x,l.y,l.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let f=0,d=e.count;f<d;f+=3)i.fromBufferAttribute(e,f+0),r.fromBufferAttribute(e,f+1),o.fromBufferAttribute(e,f+2),h.subVectors(o,r),u.subVectors(i,r),h.cross(u),n.setXYZ(f+0,h.x,h.y,h.z),n.setXYZ(f+1,h.x,h.y,h.z),n.setXYZ(f+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)mn.fromBufferAttribute(t,e),mn.normalize(),t.setXYZ(e,mn.x,mn.y,mn.z)}toNonIndexed(){function t(a,l){let c=a.array,h=a.itemSize,u=a.normalized,f=new c.constructor(l.length*h),d=0,_=0;for(let g=0,m=l.length;g<m;g++){a.isInterleavedBufferAttribute?d=l[g]*a.data.stride+a.offset:d=l[g]*h;for(let p=0;p<h;p++)f[_++]=c[d++]}return new gn(f,h,u)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new s,n=this.index.array,i=this.attributes;for(let a in i){let l=i[a],c=t(l,n);e.setAttribute(a,c)}let r=this.morphAttributes;for(let a in r){let l=[],c=r[a];for(let h=0,u=c.length;h<u;h++){let f=c[h],d=t(f,n);l.push(d)}e.morphAttributes[a]=l}e.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,l=o.length;a<l;a++){let c=o[a];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){let t={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let l in n){let c=n[l];t.data.attributes[l]=c.toJSON(t.data)}let i={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let u=0,f=c.length;u<f;u++){let d=c[u];h.push(d.toJSON(t.data))}h.length>0&&(i[l]=h,r=!0)}r&&(t.data.morphAttributes=i,t.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(t.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(t.data.boundingSphere={center:a.center.toArray(),radius:a.radius}),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone(e));let i=t.attributes;for(let c in i){let h=i[c];this.setAttribute(c,h.clone(e))}let r=t.morphAttributes;for(let c in r){let h=[],u=r[c];for(let f=0,d=u.length;f<d;f++)h.push(u[f].clone(e));this.morphAttributes[c]=h}this.morphTargetsRelative=t.morphTargetsRelative;let o=t.groups;for(let c=0,h=o.length;c<h;c++){let u=o[c];this.addGroup(u.start,u.count,u.materialIndex)}let a=t.boundingBox;a!==null&&(this.boundingBox=a.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},Sg=new Be,_r=new Oa,Kl=new Cr,bg=new O,Ql=new O,jl=new O,tc=new O,Yu=new O,ec=new O,wg=new O,nc=new O,Ht=class extends on{constructor(t=new an,e=new De){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(t,e){let n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;e.fromBufferAttribute(i,t);let a=this.morphTargetInfluences;if(r&&a){ec.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let h=a[l],u=r[l];h!==0&&(Yu.fromBufferAttribute(u,t),o?ec.addScaledVector(Yu,h):ec.addScaledVector(Yu.sub(e),h))}e.add(ec)}return e}raycast(t,e){let n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Kl.copy(n.boundingSphere),Kl.applyMatrix4(r),_r.copy(t.ray).recast(t.near),!(Kl.containsPoint(_r.origin)===!1&&(_r.intersectSphere(Kl,bg)===null||_r.origin.distanceToSquared(bg)>(t.far-t.near)**2))&&(Sg.copy(r).invert(),_r.copy(t.ray).applyMatrix4(Sg),!(n.boundingBox!==null&&_r.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,_r)))}_computeIntersections(t,e,n){let i,r=this.geometry,o=this.material,a=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,u=r.attributes.normal,f=r.groups,d=r.drawRange;if(a!==null)if(Array.isArray(o))for(let _=0,g=f.length;_<g;_++){let m=f[_],p=o[m.materialIndex],S=Math.max(m.start,d.start),M=Math.min(a.count,Math.min(m.start+m.count,d.start+d.count));for(let x=S,A=M;x<A;x+=3){let E=a.getX(x),T=a.getX(x+1),R=a.getX(x+2);i=ic(this,p,t,n,c,h,u,E,T,R),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{let _=Math.max(0,d.start),g=Math.min(a.count,d.start+d.count);for(let m=_,p=g;m<p;m+=3){let S=a.getX(m),M=a.getX(m+1),x=a.getX(m+2);i=ic(this,o,t,n,c,h,u,S,M,x),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}else if(l!==void 0)if(Array.isArray(o))for(let _=0,g=f.length;_<g;_++){let m=f[_],p=o[m.materialIndex],S=Math.max(m.start,d.start),M=Math.min(l.count,Math.min(m.start+m.count,d.start+d.count));for(let x=S,A=M;x<A;x+=3){let E=x,T=x+1,R=x+2;i=ic(this,p,t,n,c,h,u,E,T,R),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{let _=Math.max(0,d.start),g=Math.min(l.count,d.start+d.count);for(let m=_,p=g;m<p;m+=3){let S=m,M=m+1,x=m+2;i=ic(this,o,t,n,c,h,u,S,M,x),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}}};function oy(s,t,e,n,i,r,o,a){let l;if(t.side===$n?l=n.intersectTriangle(o,r,i,!0,a):l=n.intersectTriangle(i,r,o,t.side===Ws,a),l===null)return null;nc.copy(a),nc.applyMatrix4(s.matrixWorld);let c=e.ray.origin.distanceTo(nc);return c<e.near||c>e.far?null:{distance:c,point:nc.clone(),object:s}}function ic(s,t,e,n,i,r,o,a,l,c){s.getVertexPosition(a,Ql),s.getVertexPosition(l,jl),s.getVertexPosition(c,tc);let h=oy(s,t,e,n,Ql,jl,tc,wg);if(h){let u=new O;hs.getBarycoord(wg,Ql,jl,tc,u),i&&(h.uv=hs.getInterpolatedAttribute(i,a,l,c,u,new Xt)),r&&(h.uv1=hs.getInterpolatedAttribute(r,a,l,c,u,new Xt)),o&&(h.normal=hs.getInterpolatedAttribute(o,a,l,c,u,new O),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let f={a,b:l,c,normal:new O,materialIndex:0};hs.getNormal(Ql,jl,tc,f.normal),h.face=f,h.barycoord=u}return h}var Ye=class s extends an{constructor(t=1,e=1,n=1,i=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:i,heightSegments:r,depthSegments:o};let a=this;i=Math.floor(i),r=Math.floor(r),o=Math.floor(o);let l=[],c=[],h=[],u=[],f=0,d=0;_("z","y","x",-1,-1,n,e,t,o,r,0),_("z","y","x",1,-1,n,e,-t,o,r,1),_("x","z","y",1,1,t,n,e,i,o,2),_("x","z","y",1,-1,t,n,-e,i,o,3),_("x","y","z",1,-1,t,e,n,i,r,4),_("x","y","z",-1,-1,t,e,-n,i,r,5),this.setIndex(l),this.setAttribute("position",new Ne(c,3)),this.setAttribute("normal",new Ne(h,3)),this.setAttribute("uv",new Ne(u,2));function _(g,m,p,S,M,x,A,E,T,R,y){let v=x/T,P=A/R,U=x/2,z=A/2,V=E/2,$=T+1,X=R+1,Y=0,W=0,it=new O;for(let I=0;I<X;I++){let ft=I*P-z;for(let Wt=0;Wt<$;Wt++){let Ot=Wt*v-U;it[g]=Ot*S,it[m]=ft*M,it[p]=V,c.push(it.x,it.y,it.z),it[g]=0,it[m]=0,it[p]=E>0?1:-1,h.push(it.x,it.y,it.z),u.push(Wt/T),u.push(1-I/R),Y+=1}}for(let I=0;I<R;I++)for(let ft=0;ft<T;ft++){let Wt=f+ft+$*I,Ot=f+ft+$*(I+1),Z=f+(ft+1)+$*(I+1),nt=f+(ft+1)+$*I;l.push(Wt,Ot,nt),l.push(Ot,Z,nt),W+=6}a.addGroup(d,W,y),d+=W,f+=Y}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}};function Lo(s){let t={};for(let e in s){t[e]={};for(let n in s[e]){let i=s[e][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=i.clone():Array.isArray(i)?t[e][n]=i.slice():t[e][n]=i}}return t}function kn(s){let t={};for(let e=0;e<s.length;e++){let n=Lo(s[e]);for(let i in n)t[i]=n[i]}return t}function ay(s){let t=[];for(let e=0;e<s.length;e++)t.push(s[e].clone());return t}function E_(s){let t=s.getRenderTarget();return t===null?s.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:_e.workingColorSpace}var Ys={clone:Lo,merge:kn},ly=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,cy=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,en=class extends Wi{static get type(){return"ShaderMaterial"}constructor(t){super(),this.isShaderMaterial=!0,this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=ly,this.fragmentShader=cy,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=Lo(t.uniforms),this.uniformsGroups=ay(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this}toJSON(t){let e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(let i in this.uniforms){let o=this.uniforms[i].value;o&&o.isTexture?e.uniforms[i]={type:"t",value:o.toJSON(t).uuid}:o&&o.isColor?e.uniforms[i]={type:"c",value:o.getHex()}:o&&o.isVector2?e.uniforms[i]={type:"v2",value:o.toArray()}:o&&o.isVector3?e.uniforms[i]={type:"v3",value:o.toArray()}:o&&o.isVector4?e.uniforms[i]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?e.uniforms[i]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?e.uniforms[i]={type:"m4",value:o.toArray()}:e.uniforms[i]={value:o}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;let n={};for(let i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}},Uc=class extends on{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Be,this.projectionMatrix=new Be,this.projectionMatrixInverse=new Be,this.coordinateSystem=fs}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(t,e){super.updateWorldMatrix(t,e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},zs=new O,Tg=new Xt,Eg=new Xt,yn=class extends Uc{constructor(t=50,e=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let e=.5*this.getFilmHeight()/t;this.fov=Ac*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(wc*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Ac*2*Math.atan(Math.tan(wc*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){zs.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(zs.x,zs.y).multiplyScalar(-t/zs.z),zs.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(zs.x,zs.y).multiplyScalar(-t/zs.z)}getViewSize(t,e){return this.getViewBounds(t,Tg,Eg),e.subVectors(Eg,Tg)}setViewOffset(t,e,n,i,r,o){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,e=t*Math.tan(wc*.5*this.fov)/this.zoom,n=2*e,i=this.aspect*n,r=-.5*i,o=this.view;if(this.view!==null&&this.view.enabled){let l=o.fullWidth,c=o.fullHeight;r+=o.offsetX*i/l,e-=o.offsetY*n/c,i*=o.width/l,n*=o.height/c}let a=this.filmOffset;a!==0&&(r+=t*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,e,e-n,t,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}},mo=-90,go=1,Kf=class extends on{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let i=new yn(mo,go,t,e);i.layers=this.layers,this.add(i);let r=new yn(mo,go,t,e);r.layers=this.layers,this.add(r);let o=new yn(mo,go,t,e);o.layers=this.layers,this.add(o);let a=new yn(mo,go,t,e);a.layers=this.layers,this.add(a);let l=new yn(mo,go,t,e);l.layers=this.layers,this.add(l);let c=new yn(mo,go,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let t=this.coordinateSystem,e=this.children.concat(),[n,i,r,o,a,l]=e;for(let c of e)this.remove(c);if(t===fs)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===Ec)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[r,o,a,l,c,h]=this.children,u=t.getRenderTarget(),f=t.getActiveCubeFace(),d=t.getActiveMipmapLevel(),_=t.xr.enabled;t.xr.enabled=!1;let g=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,t.setRenderTarget(n,0,i),t.render(e,r),t.setRenderTarget(n,1,i),t.render(e,o),t.setRenderTarget(n,2,i),t.render(e,a),t.setRenderTarget(n,3,i),t.render(e,l),t.setRenderTarget(n,4,i),t.render(e,c),n.texture.generateMipmaps=g,t.setRenderTarget(n,5,i),t.render(e,h),t.setRenderTarget(u,f,d),t.xr.enabled=_,n.texture.needsPMREMUpdate=!0}},Nc=class extends ai{constructor(t,e,n,i,r,o,a,l,c,h){t=t!==void 0?t:[],e=e!==void 0?e:Co,super(t,e,n,i,r,o,a,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}},Qf=class extends zn{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;let n={width:t,height:t,depth:1},i=[n,n,n,n,n,n];this.texture=new Nc(i,e.mapping,e.wrapS,e.wrapT,e.magFilter,e.minFilter,e.format,e.type,e.anisotropy,e.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=e.generateMipmaps!==void 0?e.generateMipmaps:!1,this.texture.minFilter=e.minFilter!==void 0?e.minFilter:Hi}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new Ye(5,5,5),r=new en({name:"CubemapFromEquirect",uniforms:Lo(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:$n,blending:Vi});r.uniforms.tEquirect.value=e;let o=new Ht(i,r),a=e.minFilter;return e.minFilter===Tr&&(e.minFilter=Hi),new Kf(1,10,this).update(t,o),e.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(t,e,n,i){let r=t.getRenderTarget();for(let o=0;o<6;o++)t.setRenderTarget(this,o),t.clear(e,n,i);t.setRenderTarget(r)}},Zu=new O,hy=new O,uy=new ae,cs=class{constructor(t=new O(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,i){return this.normal.set(t,e,n),this.constant=i,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let i=Zu.subVectors(n,e).cross(hy.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(i,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e){let n=t.delta(Zu),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let r=-(t.start.dot(this.normal)+this.constant)/i;return r<0||r>1?null:e.copy(t.start).addScaledVector(n,r)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||uy.getNormalMatrix(t),i=this.coplanarPoint(Zu).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}},xr=new Cr,sc=new O,Fa=class{constructor(t=new cs,e=new cs,n=new cs,i=new cs,r=new cs,o=new cs){this.planes=[t,e,n,i,r,o]}set(t,e,n,i,r,o){let a=this.planes;return a[0].copy(t),a[1].copy(e),a[2].copy(n),a[3].copy(i),a[4].copy(r),a[5].copy(o),this}copy(t){let e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=fs){let n=this.planes,i=t.elements,r=i[0],o=i[1],a=i[2],l=i[3],c=i[4],h=i[5],u=i[6],f=i[7],d=i[8],_=i[9],g=i[10],m=i[11],p=i[12],S=i[13],M=i[14],x=i[15];if(n[0].setComponents(l-r,f-c,m-d,x-p).normalize(),n[1].setComponents(l+r,f+c,m+d,x+p).normalize(),n[2].setComponents(l+o,f+h,m+_,x+S).normalize(),n[3].setComponents(l-o,f-h,m-_,x-S).normalize(),n[4].setComponents(l-a,f-u,m-g,x-M).normalize(),e===fs)n[5].setComponents(l+a,f+u,m+g,x+M).normalize();else if(e===Ec)n[5].setComponents(a,u,g,M).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),xr.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),xr.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(xr)}intersectsSprite(t){return xr.center.set(0,0,0),xr.radius=.7071067811865476,xr.applyMatrix4(t.matrixWorld),this.intersectsSphere(xr)}intersectsSphere(t){let e=this.planes,n=t.center,i=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(t){let e=this.planes;for(let n=0;n<6;n++){let i=e[n];if(sc.x=i.normal.x>0?t.max.x:t.min.x,sc.y=i.normal.y>0?t.max.y:t.min.y,sc.z=i.normal.z>0?t.max.z:t.min.z,i.distanceToPoint(sc)<0)return!1}return!0}containsPoint(t){let e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};function A_(){let s=null,t=!1,e=null,n=null;function i(r,o){e(r,o),n=s.requestAnimationFrame(i)}return{start:function(){t!==!0&&e!==null&&(n=s.requestAnimationFrame(i),t=!0)},stop:function(){s.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){s=r}}}function fy(s){let t=new WeakMap;function e(a,l){let c=a.array,h=a.usage,u=c.byteLength,f=s.createBuffer();s.bindBuffer(l,f),s.bufferData(l,c,h),a.onUploadCallback();let d;if(c instanceof Float32Array)d=s.FLOAT;else if(c instanceof Uint16Array)a.isFloat16BufferAttribute?d=s.HALF_FLOAT:d=s.UNSIGNED_SHORT;else if(c instanceof Int16Array)d=s.SHORT;else if(c instanceof Uint32Array)d=s.UNSIGNED_INT;else if(c instanceof Int32Array)d=s.INT;else if(c instanceof Int8Array)d=s.BYTE;else if(c instanceof Uint8Array)d=s.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)d=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:f,type:d,bytesPerElement:c.BYTES_PER_ELEMENT,version:a.version,size:u}}function n(a,l,c){let h=l.array,u=l.updateRanges;if(s.bindBuffer(c,a),u.length===0)s.bufferSubData(c,0,h);else{u.sort((d,_)=>d.start-_.start);let f=0;for(let d=1;d<u.length;d++){let _=u[f],g=u[d];g.start<=_.start+_.count+1?_.count=Math.max(_.count,g.start+g.count-_.start):(++f,u[f]=g)}u.length=f+1;for(let d=0,_=u.length;d<_;d++){let g=u[d];s.bufferSubData(c,g.start*h.BYTES_PER_ELEMENT,h,g.start,g.count)}l.clearUpdateRanges()}l.onUploadCallback()}function i(a){return a.isInterleavedBufferAttribute&&(a=a.data),t.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);let l=t.get(a);l&&(s.deleteBuffer(l.buffer),t.delete(a))}function o(a,l){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){let h=t.get(a);(!h||h.version<a.version)&&t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let c=t.get(a);if(c===void 0)t.set(a,e(a,l));else if(c.version<a.version){if(c.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,a,l),c.version=a.version}}return{get:i,remove:r,update:o}}var He=class s extends an{constructor(t=1,e=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:i};let r=t/2,o=e/2,a=Math.floor(n),l=Math.floor(i),c=a+1,h=l+1,u=t/a,f=e/l,d=[],_=[],g=[],m=[];for(let p=0;p<h;p++){let S=p*f-o;for(let M=0;M<c;M++){let x=M*u-r;_.push(x,-S,0),g.push(0,0,1),m.push(M/a),m.push(1-p/l)}}for(let p=0;p<l;p++)for(let S=0;S<a;S++){let M=S+c*p,x=S+c*(p+1),A=S+1+c*(p+1),E=S+1+c*p;d.push(M,x,E),d.push(x,A,E)}this.setIndex(d),this.setAttribute("position",new Ne(_,3)),this.setAttribute("normal",new Ne(g,3)),this.setAttribute("uv",new Ne(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.width,t.height,t.widthSegments,t.heightSegments)}},dy=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,py=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,my=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,gy=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,_y=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,xy=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,vy=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,yy=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,My=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,Sy=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,by=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,wy=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Ty=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,Ey=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Ay=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,Cy=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,Ry=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Py=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Iy=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Ly=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,Dy=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,Uy=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,Ny=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,Oy=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Fy=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,By=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,ky=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,zy=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Hy=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Vy=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Gy="gl_FragColor = linearToOutputTexel( gl_FragColor );",Wy=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Xy=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,qy=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,Yy=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Zy=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,$y=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Jy=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Ky=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Qy=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,jy=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,tM=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,eM=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,nM=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,iM=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,sM=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,rM=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,oM=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,aM=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lM=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,cM=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,hM=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,uM=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,fM=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,dM=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,pM=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,mM=`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,gM=`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,_M=`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,xM=`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,vM=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,yM=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,MM=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,SM=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,bM=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,wM=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,TM=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,EM=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,AM=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,CM=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,RM=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,PM=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,IM=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,LM=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,DM=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,UM=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,NM=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,OM=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,FM=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,BM=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,kM=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,zM=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,HM=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,VM=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,GM=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,WM=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,XM=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,qM=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,YM=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,ZM=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,$M=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,JM=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,KM=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,QM=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,jM=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,tS=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,eS=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,nS=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,iS=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,sS=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,rS=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,oS=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,aS=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
		
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
		
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		
		#else
		
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,lS=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,cS=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,hS=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,uS=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,fS=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,dS=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,pS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,mS=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,gS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,_S=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,xS=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,vS=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,yS=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,MS=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,SS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,bS=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,wS=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,TS=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,ES=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,AS=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,CS=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,RS=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,PS=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,IS=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,LS=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,DS=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,US=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,NS=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,OS=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,FS=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,BS=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,kS=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,zS=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,HS=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,VS=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,GS=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,WS=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,XS=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,ce={alphahash_fragment:dy,alphahash_pars_fragment:py,alphamap_fragment:my,alphamap_pars_fragment:gy,alphatest_fragment:_y,alphatest_pars_fragment:xy,aomap_fragment:vy,aomap_pars_fragment:yy,batching_pars_vertex:My,batching_vertex:Sy,begin_vertex:by,beginnormal_vertex:wy,bsdfs:Ty,iridescence_fragment:Ey,bumpmap_pars_fragment:Ay,clipping_planes_fragment:Cy,clipping_planes_pars_fragment:Ry,clipping_planes_pars_vertex:Py,clipping_planes_vertex:Iy,color_fragment:Ly,color_pars_fragment:Dy,color_pars_vertex:Uy,color_vertex:Ny,common:Oy,cube_uv_reflection_fragment:Fy,defaultnormal_vertex:By,displacementmap_pars_vertex:ky,displacementmap_vertex:zy,emissivemap_fragment:Hy,emissivemap_pars_fragment:Vy,colorspace_fragment:Gy,colorspace_pars_fragment:Wy,envmap_fragment:Xy,envmap_common_pars_fragment:qy,envmap_pars_fragment:Yy,envmap_pars_vertex:Zy,envmap_physical_pars_fragment:rM,envmap_vertex:$y,fog_vertex:Jy,fog_pars_vertex:Ky,fog_fragment:Qy,fog_pars_fragment:jy,gradientmap_pars_fragment:tM,lightmap_pars_fragment:eM,lights_lambert_fragment:nM,lights_lambert_pars_fragment:iM,lights_pars_begin:sM,lights_toon_fragment:oM,lights_toon_pars_fragment:aM,lights_phong_fragment:lM,lights_phong_pars_fragment:cM,lights_physical_fragment:hM,lights_physical_pars_fragment:uM,lights_fragment_begin:fM,lights_fragment_maps:dM,lights_fragment_end:pM,logdepthbuf_fragment:mM,logdepthbuf_pars_fragment:gM,logdepthbuf_pars_vertex:_M,logdepthbuf_vertex:xM,map_fragment:vM,map_pars_fragment:yM,map_particle_fragment:MM,map_particle_pars_fragment:SM,metalnessmap_fragment:bM,metalnessmap_pars_fragment:wM,morphinstance_vertex:TM,morphcolor_vertex:EM,morphnormal_vertex:AM,morphtarget_pars_vertex:CM,morphtarget_vertex:RM,normal_fragment_begin:PM,normal_fragment_maps:IM,normal_pars_fragment:LM,normal_pars_vertex:DM,normal_vertex:UM,normalmap_pars_fragment:NM,clearcoat_normal_fragment_begin:OM,clearcoat_normal_fragment_maps:FM,clearcoat_pars_fragment:BM,iridescence_pars_fragment:kM,opaque_fragment:zM,packing:HM,premultiplied_alpha_fragment:VM,project_vertex:GM,dithering_fragment:WM,dithering_pars_fragment:XM,roughnessmap_fragment:qM,roughnessmap_pars_fragment:YM,shadowmap_pars_fragment:ZM,shadowmap_pars_vertex:$M,shadowmap_vertex:JM,shadowmask_pars_fragment:KM,skinbase_vertex:QM,skinning_pars_vertex:jM,skinning_vertex:tS,skinnormal_vertex:eS,specularmap_fragment:nS,specularmap_pars_fragment:iS,tonemapping_fragment:sS,tonemapping_pars_fragment:rS,transmission_fragment:oS,transmission_pars_fragment:aS,uv_pars_fragment:lS,uv_pars_vertex:cS,uv_vertex:hS,worldpos_vertex:uS,background_vert:fS,background_frag:dS,backgroundCube_vert:pS,backgroundCube_frag:mS,cube_vert:gS,cube_frag:_S,depth_vert:xS,depth_frag:vS,distanceRGBA_vert:yS,distanceRGBA_frag:MS,equirect_vert:SS,equirect_frag:bS,linedashed_vert:wS,linedashed_frag:TS,meshbasic_vert:ES,meshbasic_frag:AS,meshlambert_vert:CS,meshlambert_frag:RS,meshmatcap_vert:PS,meshmatcap_frag:IS,meshnormal_vert:LS,meshnormal_frag:DS,meshphong_vert:US,meshphong_frag:NS,meshphysical_vert:OS,meshphysical_frag:FS,meshtoon_vert:BS,meshtoon_frag:kS,points_vert:zS,points_frag:HS,shadow_vert:VS,shadow_frag:GS,sprite_vert:WS,sprite_frag:XS},bt={common:{diffuse:{value:new Dt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new ae},alphaMap:{value:null},alphaMapTransform:{value:new ae},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new ae}},envmap:{envMap:{value:null},envMapRotation:{value:new ae},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new ae}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new ae}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new ae},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new ae},normalScale:{value:new Xt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new ae},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new ae}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new ae}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new ae}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Dt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Dt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new ae},alphaTest:{value:0},uvTransform:{value:new ae}},sprite:{diffuse:{value:new Dt(16777215)},opacity:{value:1},center:{value:new Xt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new ae},alphaMap:{value:null},alphaMapTransform:{value:new ae},alphaTest:{value:0}}},ki={basic:{uniforms:kn([bt.common,bt.specularmap,bt.envmap,bt.aomap,bt.lightmap,bt.fog]),vertexShader:ce.meshbasic_vert,fragmentShader:ce.meshbasic_frag},lambert:{uniforms:kn([bt.common,bt.specularmap,bt.envmap,bt.aomap,bt.lightmap,bt.emissivemap,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.fog,bt.lights,{emissive:{value:new Dt(0)}}]),vertexShader:ce.meshlambert_vert,fragmentShader:ce.meshlambert_frag},phong:{uniforms:kn([bt.common,bt.specularmap,bt.envmap,bt.aomap,bt.lightmap,bt.emissivemap,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.fog,bt.lights,{emissive:{value:new Dt(0)},specular:{value:new Dt(1118481)},shininess:{value:30}}]),vertexShader:ce.meshphong_vert,fragmentShader:ce.meshphong_frag},standard:{uniforms:kn([bt.common,bt.envmap,bt.aomap,bt.lightmap,bt.emissivemap,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.roughnessmap,bt.metalnessmap,bt.fog,bt.lights,{emissive:{value:new Dt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:ce.meshphysical_vert,fragmentShader:ce.meshphysical_frag},toon:{uniforms:kn([bt.common,bt.aomap,bt.lightmap,bt.emissivemap,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.gradientmap,bt.fog,bt.lights,{emissive:{value:new Dt(0)}}]),vertexShader:ce.meshtoon_vert,fragmentShader:ce.meshtoon_frag},matcap:{uniforms:kn([bt.common,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.fog,{matcap:{value:null}}]),vertexShader:ce.meshmatcap_vert,fragmentShader:ce.meshmatcap_frag},points:{uniforms:kn([bt.points,bt.fog]),vertexShader:ce.points_vert,fragmentShader:ce.points_frag},dashed:{uniforms:kn([bt.common,bt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:ce.linedashed_vert,fragmentShader:ce.linedashed_frag},depth:{uniforms:kn([bt.common,bt.displacementmap]),vertexShader:ce.depth_vert,fragmentShader:ce.depth_frag},normal:{uniforms:kn([bt.common,bt.bumpmap,bt.normalmap,bt.displacementmap,{opacity:{value:1}}]),vertexShader:ce.meshnormal_vert,fragmentShader:ce.meshnormal_frag},sprite:{uniforms:kn([bt.sprite,bt.fog]),vertexShader:ce.sprite_vert,fragmentShader:ce.sprite_frag},background:{uniforms:{uvTransform:{value:new ae},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:ce.background_vert,fragmentShader:ce.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new ae}},vertexShader:ce.backgroundCube_vert,fragmentShader:ce.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:ce.cube_vert,fragmentShader:ce.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:ce.equirect_vert,fragmentShader:ce.equirect_frag},distanceRGBA:{uniforms:kn([bt.common,bt.displacementmap,{referencePosition:{value:new O},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:ce.distanceRGBA_vert,fragmentShader:ce.distanceRGBA_frag},shadow:{uniforms:kn([bt.lights,bt.fog,{color:{value:new Dt(0)},opacity:{value:1}}]),vertexShader:ce.shadow_vert,fragmentShader:ce.shadow_frag}};ki.physical={uniforms:kn([ki.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new ae},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new ae},clearcoatNormalScale:{value:new Xt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new ae},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new ae},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new ae},sheen:{value:0},sheenColor:{value:new Dt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new ae},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new ae},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new ae},transmissionSamplerSize:{value:new Xt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new ae},attenuationDistance:{value:0},attenuationColor:{value:new Dt(0)},specularColor:{value:new Dt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new ae},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new ae},anisotropyVector:{value:new Xt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new ae}}]),vertexShader:ce.meshphysical_vert,fragmentShader:ce.meshphysical_frag};var rc={r:0,b:0,g:0},vr=new Gi,qS=new Be;function YS(s,t,e,n,i,r,o){let a=new Dt(0),l=r===!0?0:1,c,h,u=null,f=0,d=null;function _(S){let M=S.isScene===!0?S.background:null;return M&&M.isTexture&&(M=(S.backgroundBlurriness>0?e:t).get(M)),M}function g(S){let M=!1,x=_(S);x===null?p(a,l):x&&x.isColor&&(p(x,1),M=!0);let A=s.xr.getEnvironmentBlendMode();A==="additive"?n.buffers.color.setClear(0,0,0,1,o):A==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,o),(s.autoClear||M)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil))}function m(S,M){let x=_(M);x&&(x.isCubeTexture||x.mapping===nh)?(h===void 0&&(h=new Ht(new Ye(1,1,1),new en({name:"BackgroundCubeMaterial",uniforms:Lo(ki.backgroundCube.uniforms),vertexShader:ki.backgroundCube.vertexShader,fragmentShader:ki.backgroundCube.fragmentShader,side:$n,depthTest:!1,depthWrite:!1,fog:!1})),h.geometry.deleteAttribute("normal"),h.geometry.deleteAttribute("uv"),h.onBeforeRender=function(A,E,T){this.matrixWorld.copyPosition(T.matrixWorld)},Object.defineProperty(h.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(h)),vr.copy(M.backgroundRotation),vr.x*=-1,vr.y*=-1,vr.z*=-1,x.isCubeTexture&&x.isRenderTargetTexture===!1&&(vr.y*=-1,vr.z*=-1),h.material.uniforms.envMap.value=x,h.material.uniforms.flipEnvMap.value=x.isCubeTexture&&x.isRenderTargetTexture===!1?-1:1,h.material.uniforms.backgroundBlurriness.value=M.backgroundBlurriness,h.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,h.material.uniforms.backgroundRotation.value.setFromMatrix4(qS.makeRotationFromEuler(vr)),h.material.toneMapped=_e.getTransfer(x.colorSpace)!==Ae,(u!==x||f!==x.version||d!==s.toneMapping)&&(h.material.needsUpdate=!0,u=x,f=x.version,d=s.toneMapping),h.layers.enableAll(),S.unshift(h,h.geometry,h.material,0,0,null)):x&&x.isTexture&&(c===void 0&&(c=new Ht(new He(2,2),new en({name:"BackgroundMaterial",uniforms:Lo(ki.background.uniforms),vertexShader:ki.background.vertexShader,fragmentShader:ki.background.fragmentShader,side:Ws,depthTest:!1,depthWrite:!1,fog:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(c)),c.material.uniforms.t2D.value=x,c.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,c.material.toneMapped=_e.getTransfer(x.colorSpace)!==Ae,x.matrixAutoUpdate===!0&&x.updateMatrix(),c.material.uniforms.uvTransform.value.copy(x.matrix),(u!==x||f!==x.version||d!==s.toneMapping)&&(c.material.needsUpdate=!0,u=x,f=x.version,d=s.toneMapping),c.layers.enableAll(),S.unshift(c,c.geometry,c.material,0,0,null))}function p(S,M){S.getRGB(rc,E_(s)),n.buffers.color.setClear(rc.r,rc.g,rc.b,M,o)}return{getClearColor:function(){return a},setClearColor:function(S,M=1){a.set(S),l=M,p(a,l)},getClearAlpha:function(){return l},setClearAlpha:function(S){l=S,p(a,l)},render:g,addToRenderList:m}}function ZS(s,t){let e=s.getParameter(s.MAX_VERTEX_ATTRIBS),n={},i=f(null),r=i,o=!1;function a(v,P,U,z,V){let $=!1,X=u(z,U,P);r!==X&&(r=X,c(r.object)),$=d(v,z,U,V),$&&_(v,z,U,V),V!==null&&t.update(V,s.ELEMENT_ARRAY_BUFFER),($||o)&&(o=!1,x(v,P,U,z),V!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,t.get(V).buffer))}function l(){return s.createVertexArray()}function c(v){return s.bindVertexArray(v)}function h(v){return s.deleteVertexArray(v)}function u(v,P,U){let z=U.wireframe===!0,V=n[v.id];V===void 0&&(V={},n[v.id]=V);let $=V[P.id];$===void 0&&($={},V[P.id]=$);let X=$[z];return X===void 0&&(X=f(l()),$[z]=X),X}function f(v){let P=[],U=[],z=[];for(let V=0;V<e;V++)P[V]=0,U[V]=0,z[V]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:P,enabledAttributes:U,attributeDivisors:z,object:v,attributes:{},index:null}}function d(v,P,U,z){let V=r.attributes,$=P.attributes,X=0,Y=U.getAttributes();for(let W in Y)if(Y[W].location>=0){let I=V[W],ft=$[W];if(ft===void 0&&(W==="instanceMatrix"&&v.instanceMatrix&&(ft=v.instanceMatrix),W==="instanceColor"&&v.instanceColor&&(ft=v.instanceColor)),I===void 0||I.attribute!==ft||ft&&I.data!==ft.data)return!0;X++}return r.attributesNum!==X||r.index!==z}function _(v,P,U,z){let V={},$=P.attributes,X=0,Y=U.getAttributes();for(let W in Y)if(Y[W].location>=0){let I=$[W];I===void 0&&(W==="instanceMatrix"&&v.instanceMatrix&&(I=v.instanceMatrix),W==="instanceColor"&&v.instanceColor&&(I=v.instanceColor));let ft={};ft.attribute=I,I&&I.data&&(ft.data=I.data),V[W]=ft,X++}r.attributes=V,r.attributesNum=X,r.index=z}function g(){let v=r.newAttributes;for(let P=0,U=v.length;P<U;P++)v[P]=0}function m(v){p(v,0)}function p(v,P){let U=r.newAttributes,z=r.enabledAttributes,V=r.attributeDivisors;U[v]=1,z[v]===0&&(s.enableVertexAttribArray(v),z[v]=1),V[v]!==P&&(s.vertexAttribDivisor(v,P),V[v]=P)}function S(){let v=r.newAttributes,P=r.enabledAttributes;for(let U=0,z=P.length;U<z;U++)P[U]!==v[U]&&(s.disableVertexAttribArray(U),P[U]=0)}function M(v,P,U,z,V,$,X){X===!0?s.vertexAttribIPointer(v,P,U,V,$):s.vertexAttribPointer(v,P,U,z,V,$)}function x(v,P,U,z){g();let V=z.attributes,$=U.getAttributes(),X=P.defaultAttributeValues;for(let Y in $){let W=$[Y];if(W.location>=0){let it=V[Y];if(it===void 0&&(Y==="instanceMatrix"&&v.instanceMatrix&&(it=v.instanceMatrix),Y==="instanceColor"&&v.instanceColor&&(it=v.instanceColor)),it!==void 0){let I=it.normalized,ft=it.itemSize,Wt=t.get(it);if(Wt===void 0)continue;let Ot=Wt.buffer,Z=Wt.type,nt=Wt.bytesPerElement,yt=Z===s.INT||Z===s.UNSIGNED_INT||it.gpuType===Ld;if(it.isInterleavedBufferAttribute){let st=it.data,Ct=st.stride,Ut=it.offset;if(st.isInstancedInterleavedBuffer){for(let Qt=0;Qt<W.locationSize;Qt++)p(W.location+Qt,st.meshPerAttribute);v.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=st.meshPerAttribute*st.count)}else for(let Qt=0;Qt<W.locationSize;Qt++)m(W.location+Qt);s.bindBuffer(s.ARRAY_BUFFER,Ot);for(let Qt=0;Qt<W.locationSize;Qt++)M(W.location+Qt,ft/W.locationSize,Z,I,Ct*nt,(Ut+ft/W.locationSize*Qt)*nt,yt)}else{if(it.isInstancedBufferAttribute){for(let st=0;st<W.locationSize;st++)p(W.location+st,it.meshPerAttribute);v.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=it.meshPerAttribute*it.count)}else for(let st=0;st<W.locationSize;st++)m(W.location+st);s.bindBuffer(s.ARRAY_BUFFER,Ot);for(let st=0;st<W.locationSize;st++)M(W.location+st,ft/W.locationSize,Z,I,ft*nt,ft/W.locationSize*st*nt,yt)}}else if(X!==void 0){let I=X[Y];if(I!==void 0)switch(I.length){case 2:s.vertexAttrib2fv(W.location,I);break;case 3:s.vertexAttrib3fv(W.location,I);break;case 4:s.vertexAttrib4fv(W.location,I);break;default:s.vertexAttrib1fv(W.location,I)}}}}S()}function A(){R();for(let v in n){let P=n[v];for(let U in P){let z=P[U];for(let V in z)h(z[V].object),delete z[V];delete P[U]}delete n[v]}}function E(v){if(n[v.id]===void 0)return;let P=n[v.id];for(let U in P){let z=P[U];for(let V in z)h(z[V].object),delete z[V];delete P[U]}delete n[v.id]}function T(v){for(let P in n){let U=n[P];if(U[v.id]===void 0)continue;let z=U[v.id];for(let V in z)h(z[V].object),delete z[V];delete U[v.id]}}function R(){y(),o=!0,r!==i&&(r=i,c(r.object))}function y(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:a,reset:R,resetDefaultState:y,dispose:A,releaseStatesOfGeometry:E,releaseStatesOfProgram:T,initAttributes:g,enableAttribute:m,disableUnusedAttributes:S}}function $S(s,t,e){let n;function i(c){n=c}function r(c,h){s.drawArrays(n,c,h),e.update(h,n,1)}function o(c,h,u){u!==0&&(s.drawArraysInstanced(n,c,h,u),e.update(h,n,u))}function a(c,h,u){if(u===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,c,0,h,0,u);let d=0;for(let _=0;_<u;_++)d+=h[_];e.update(d,n,1)}function l(c,h,u,f){if(u===0)return;let d=t.get("WEBGL_multi_draw");if(d===null)for(let _=0;_<c.length;_++)o(c[_],h[_],f[_]);else{d.multiDrawArraysInstancedWEBGL(n,c,0,h,0,f,0,u);let _=0;for(let g=0;g<u;g++)_+=h[g]*f[g];e.update(_,n,1)}}this.setMode=i,this.render=r,this.renderInstances=o,this.renderMultiDraw=a,this.renderMultiDrawInstances=l}function JS(s,t,e,n){let i;function r(){if(i!==void 0)return i;if(t.has("EXT_texture_filter_anisotropic")===!0){let T=t.get("EXT_texture_filter_anisotropic");i=s.getParameter(T.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(T){return!(T!==Ei&&n.convert(T)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(T){let R=T===Pi&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(T!==ps&&n.convert(T)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_TYPE)&&T!==us&&!R)}function l(T){if(T==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";T="mediump"}return T==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp",h=l(c);h!==c&&(console.warn("THREE.WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);let u=e.logarithmicDepthBuffer===!0,f=e.reverseDepthBuffer===!0&&t.has("EXT_clip_control"),d=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),_=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),g=s.getParameter(s.MAX_TEXTURE_SIZE),m=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),p=s.getParameter(s.MAX_VERTEX_ATTRIBS),S=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),M=s.getParameter(s.MAX_VARYING_VECTORS),x=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),A=_>0,E=s.getParameter(s.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:o,textureTypeReadable:a,precision:c,logarithmicDepthBuffer:u,reverseDepthBuffer:f,maxTextures:d,maxVertexTextures:_,maxTextureSize:g,maxCubemapSize:m,maxAttributes:p,maxVertexUniforms:S,maxVaryings:M,maxFragmentUniforms:x,vertexTextures:A,maxSamples:E}}function KS(s){let t=this,e=null,n=0,i=!1,r=!1,o=new cs,a=new ae,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(u,f){let d=u.length!==0||f||n!==0||i;return i=f,n=u.length,d},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(u,f){e=h(u,f,0)},this.setState=function(u,f,d){let _=u.clippingPlanes,g=u.clipIntersection,m=u.clipShadows,p=s.get(u);if(!i||_===null||_.length===0||r&&!m)r?h(null):c();else{let S=r?0:n,M=S*4,x=p.clippingState||null;l.value=x,x=h(_,f,M,d);for(let A=0;A!==M;++A)x[A]=e[A];p.clippingState=x,this.numIntersection=g?this.numPlanes:0,this.numPlanes+=S}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(u,f,d,_){let g=u!==null?u.length:0,m=null;if(g!==0){if(m=l.value,_!==!0||m===null){let p=d+g*4,S=f.matrixWorldInverse;a.getNormalMatrix(S),(m===null||m.length<p)&&(m=new Float32Array(p));for(let M=0,x=d;M!==g;++M,x+=4)o.copy(u[M]).applyMatrix4(S,a),o.normal.toArray(m,x),m[x+3]=o.constant}l.value=m,l.needsUpdate=!0}return t.numPlanes=g,t.numIntersection=0,m}}function QS(s){let t=new WeakMap;function e(o,a){return a===gf?o.mapping=Co:a===_f&&(o.mapping=Ro),o}function n(o){if(o&&o.isTexture){let a=o.mapping;if(a===gf||a===_f)if(t.has(o)){let l=t.get(o).texture;return e(l,o.mapping)}else{let l=o.image;if(l&&l.height>0){let c=new Qf(l.height);return c.fromEquirectangularTexture(s,o),t.set(o,c),o.addEventListener("dispose",i),e(c.texture,o.mapping)}else return null}}return o}function i(o){let a=o.target;a.removeEventListener("dispose",i);let l=t.get(a);l!==void 0&&(t.delete(a),l.dispose())}function r(){t=new WeakMap}return{get:n,dispose:r}}var Do=class extends Uc{constructor(t=-1,e=1,n=1,i=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=i,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,i,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,r=n-t,o=n+t,a=i+e,l=i-e;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,o=r+c*this.view.width,a-=h*this.view.offsetY,l=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,l,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}},So=4,Ag=[.125,.215,.35,.446,.526,.582],br=20,$u=new Do,Cg=new Dt,Ju=null,Ku=0,Qu=0,ju=!1,Mr=(1+Math.sqrt(5))/2,_o=1/Mr,Rg=[new O(-Mr,_o,0),new O(Mr,_o,0),new O(-_o,0,Mr),new O(_o,0,Mr),new O(0,Mr,-_o),new O(0,Mr,_o),new O(-1,1,-1),new O(1,1,-1),new O(-1,1,1),new O(1,1,1)],Oc=class{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(t,e=0,n=.1,i=100){Ju=this._renderer.getRenderTarget(),Ku=this._renderer.getActiveCubeFace(),Qu=this._renderer.getActiveMipmapLevel(),ju=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(256);let r=this._allocateTargets();return r.depthBuffer=!0,this._sceneToCubeUV(t,n,i,r),e>0&&this._blur(r,0,0,e),this._applyPMREM(r),this._cleanup(r),r}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Lg(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Ig(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodPlanes.length;t++)this._lodPlanes[t].dispose()}_cleanup(t){this._renderer.setRenderTarget(Ju,Ku,Qu),this._renderer.xr.enabled=ju,t.scissorTest=!1,oc(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===Co||t.mapping===Ro?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),Ju=this._renderer.getRenderTarget(),Ku=this._renderer.getActiveCubeFace(),Qu=this._renderer.getActiveMipmapLevel(),ju=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:Hi,minFilter:Hi,generateMipmaps:!1,type:Pi,format:Ei,colorSpace:ko,depthBuffer:!1},i=Pg(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Pg(t,e,n);let{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=jS(r)),this._blurMaterial=tb(r,t,e)}return i}_compileMaterial(t){let e=new Ht(this._lodPlanes[0],t);this._renderer.compile(e,$u)}_sceneToCubeUV(t,e,n,i){let a=new yn(90,1,e,n),l=[1,-1,1,1,1,1],c=[1,1,1,-1,-1,-1],h=this._renderer,u=h.autoClear,f=h.toneMapping;h.getClearColor(Cg),h.toneMapping=Vs,h.autoClear=!1;let d=new De({name:"PMREM.Background",side:$n,depthWrite:!1,depthTest:!1}),_=new Ht(new Ye,d),g=!1,m=t.background;m?m.isColor&&(d.color.copy(m),t.background=null,g=!0):(d.color.copy(Cg),g=!0);for(let p=0;p<6;p++){let S=p%3;S===0?(a.up.set(0,l[p],0),a.lookAt(c[p],0,0)):S===1?(a.up.set(0,0,l[p]),a.lookAt(0,c[p],0)):(a.up.set(0,l[p],0),a.lookAt(0,0,c[p]));let M=this._cubeSize;oc(i,S*M,p>2?M:0,M,M),h.setRenderTarget(i),g&&h.render(_,a),h.render(t,a)}_.geometry.dispose(),_.material.dispose(),h.toneMapping=f,h.autoClear=u,t.background=m}_textureToCubeUV(t,e){let n=this._renderer,i=t.mapping===Co||t.mapping===Ro;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=Lg()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Ig());let r=i?this._cubemapMaterial:this._equirectMaterial,o=new Ht(this._lodPlanes[0],r),a=r.uniforms;a.envMap.value=t;let l=this._cubeSize;oc(e,0,0,3*l,2*l),n.setRenderTarget(e),n.render(o,$u)}_applyPMREM(t){let e=this._renderer,n=e.autoClear;e.autoClear=!1;let i=this._lodPlanes.length;for(let r=1;r<i;r++){let o=Math.sqrt(this._sigmas[r]*this._sigmas[r]-this._sigmas[r-1]*this._sigmas[r-1]),a=Rg[(i-r-1)%Rg.length];this._blur(t,r-1,r,o,a)}e.autoClear=n}_blur(t,e,n,i,r){let o=this._pingPongRenderTarget;this._halfBlur(t,o,e,n,i,"latitudinal",r),this._halfBlur(o,t,n,n,i,"longitudinal",r)}_halfBlur(t,e,n,i,r,o,a){let l=this._renderer,c=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=3,u=new Ht(this._lodPlanes[i],c),f=c.uniforms,d=this._sizeLods[n]-1,_=isFinite(r)?Math.PI/(2*d):2*Math.PI/(2*br-1),g=r/_,m=isFinite(r)?1+Math.floor(h*g):br;m>br&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${br}`);let p=[],S=0;for(let T=0;T<br;++T){let R=T/g,y=Math.exp(-R*R/2);p.push(y),T===0?S+=y:T<m&&(S+=2*y)}for(let T=0;T<p.length;T++)p[T]=p[T]/S;f.envMap.value=t.texture,f.samples.value=m,f.weights.value=p,f.latitudinal.value=o==="latitudinal",a&&(f.poleAxis.value=a);let{_lodMax:M}=this;f.dTheta.value=_,f.mipInt.value=M-n;let x=this._sizeLods[i],A=3*x*(i>M-So?i-M+So:0),E=4*(this._cubeSize-x);oc(e,A,E,3*x,2*x),l.setRenderTarget(e),l.render(u,$u)}};function jS(s){let t=[],e=[],n=[],i=s,r=s-So+1+Ag.length;for(let o=0;o<r;o++){let a=Math.pow(2,i);e.push(a);let l=1/a;o>s-So?l=Ag[o-s+So-1]:o===0&&(l=0),n.push(l);let c=1/(a-2),h=-c,u=1+c,f=[h,h,u,h,u,u,h,h,u,u,h,u],d=6,_=6,g=3,m=2,p=1,S=new Float32Array(g*_*d),M=new Float32Array(m*_*d),x=new Float32Array(p*_*d);for(let E=0;E<d;E++){let T=E%3*2/3-1,R=E>2?0:-1,y=[T,R,0,T+2/3,R,0,T+2/3,R+1,0,T,R,0,T+2/3,R+1,0,T,R+1,0];S.set(y,g*_*E),M.set(f,m*_*E);let v=[E,E,E,E,E,E];x.set(v,p*_*E)}let A=new an;A.setAttribute("position",new gn(S,g)),A.setAttribute("uv",new gn(M,m)),A.setAttribute("faceIndex",new gn(x,p)),t.push(A),i>So&&i--}return{lodPlanes:t,sizeLods:e,sigmas:n}}function Pg(s,t,e){let n=new zn(s,t,e);return n.texture.mapping=nh,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function oc(s,t,e,n,i){s.viewport.set(t,e,n,i),s.scissor.set(t,e,n,i)}function tb(s,t,e){let n=new Float32Array(br),i=new O(0,1,0);return new en({name:"SphericalGaussianBlur",defines:{n:br,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:Bd(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:Vi,depthTest:!1,depthWrite:!1})}function Ig(){return new en({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Bd(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Vi,depthTest:!1,depthWrite:!1})}function Lg(){return new en({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Bd(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Vi,depthTest:!1,depthWrite:!1})}function Bd(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function eb(s){let t=new WeakMap,e=null;function n(a){if(a&&a.isTexture){let l=a.mapping,c=l===gf||l===_f,h=l===Co||l===Ro;if(c||h){let u=t.get(a),f=u!==void 0?u.texture.pmremVersion:0;if(a.isRenderTargetTexture&&a.pmremVersion!==f)return e===null&&(e=new Oc(s)),u=c?e.fromEquirectangular(a,u):e.fromCubemap(a,u),u.texture.pmremVersion=a.pmremVersion,t.set(a,u),u.texture;if(u!==void 0)return u.texture;{let d=a.image;return c&&d&&d.height>0||h&&d&&i(d)?(e===null&&(e=new Oc(s)),u=c?e.fromEquirectangular(a):e.fromCubemap(a),u.texture.pmremVersion=a.pmremVersion,t.set(a,u),a.addEventListener("dispose",r),u.texture):null}}}return a}function i(a){let l=0,c=6;for(let h=0;h<c;h++)a[h]!==void 0&&l++;return l===c}function r(a){let l=a.target;l.removeEventListener("dispose",r);let c=t.get(l);c!==void 0&&(t.delete(l),c.dispose())}function o(){t=new WeakMap,e!==null&&(e.dispose(),e=null)}return{get:n,dispose:o}}function nb(s){let t={};function e(n){if(t[n]!==void 0)return t[n];let i;switch(n){case"WEBGL_depth_texture":i=s.getExtension("WEBGL_depth_texture")||s.getExtension("MOZ_WEBGL_depth_texture")||s.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":i=s.getExtension("EXT_texture_filter_anisotropic")||s.getExtension("MOZ_EXT_texture_filter_anisotropic")||s.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":i=s.getExtension("WEBGL_compressed_texture_s3tc")||s.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":i=s.getExtension("WEBGL_compressed_texture_pvrtc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:i=s.getExtension(n)}return t[n]=i,i}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){let i=e(n);return i===null&&La("THREE.WebGLRenderer: "+n+" extension not supported."),i}}}function ib(s,t,e,n){let i={},r=new WeakMap;function o(u){let f=u.target;f.index!==null&&t.remove(f.index);for(let _ in f.attributes)t.remove(f.attributes[_]);for(let _ in f.morphAttributes){let g=f.morphAttributes[_];for(let m=0,p=g.length;m<p;m++)t.remove(g[m])}f.removeEventListener("dispose",o),delete i[f.id];let d=r.get(f);d&&(t.remove(d),r.delete(f)),n.releaseStatesOfGeometry(f),f.isInstancedBufferGeometry===!0&&delete f._maxInstanceCount,e.memory.geometries--}function a(u,f){return i[f.id]===!0||(f.addEventListener("dispose",o),i[f.id]=!0,e.memory.geometries++),f}function l(u){let f=u.attributes;for(let _ in f)t.update(f[_],s.ARRAY_BUFFER);let d=u.morphAttributes;for(let _ in d){let g=d[_];for(let m=0,p=g.length;m<p;m++)t.update(g[m],s.ARRAY_BUFFER)}}function c(u){let f=[],d=u.index,_=u.attributes.position,g=0;if(d!==null){let S=d.array;g=d.version;for(let M=0,x=S.length;M<x;M+=3){let A=S[M+0],E=S[M+1],T=S[M+2];f.push(A,E,E,T,T,A)}}else if(_!==void 0){let S=_.array;g=_.version;for(let M=0,x=S.length/3-1;M<x;M+=3){let A=M+0,E=M+1,T=M+2;f.push(A,E,E,T,T,A)}}else return;let m=new(w_(f)?Dc:Lc)(f,1);m.version=g;let p=r.get(u);p&&t.remove(p),r.set(u,m)}function h(u){let f=r.get(u);if(f){let d=u.index;d!==null&&f.version<d.version&&c(u)}else c(u);return r.get(u)}return{get:a,update:l,getWireframeAttribute:h}}function sb(s,t,e){let n;function i(f){n=f}let r,o;function a(f){r=f.type,o=f.bytesPerElement}function l(f,d){s.drawElements(n,d,r,f*o),e.update(d,n,1)}function c(f,d,_){_!==0&&(s.drawElementsInstanced(n,d,r,f*o,_),e.update(d,n,_))}function h(f,d,_){if(_===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,d,0,r,f,0,_);let m=0;for(let p=0;p<_;p++)m+=d[p];e.update(m,n,1)}function u(f,d,_,g){if(_===0)return;let m=t.get("WEBGL_multi_draw");if(m===null)for(let p=0;p<f.length;p++)c(f[p]/o,d[p],g[p]);else{m.multiDrawElementsInstancedWEBGL(n,d,0,r,f,0,g,0,_);let p=0;for(let S=0;S<_;S++)p+=d[S]*g[S];e.update(p,n,1)}}this.setMode=i,this.setIndex=a,this.render=l,this.renderInstances=c,this.renderMultiDraw=h,this.renderMultiDrawInstances=u}function rb(s){let t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(e.calls++,o){case s.TRIANGLES:e.triangles+=a*(r/3);break;case s.LINES:e.lines+=a*(r/2);break;case s.LINE_STRIP:e.lines+=a*(r-1);break;case s.LINE_LOOP:e.lines+=a*r;break;case s.POINTS:e.points+=a*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function i(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:i,update:n}}function ob(s,t,e){let n=new WeakMap,i=new Le;function r(o,a,l){let c=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,u=h!==void 0?h.length:0,f=n.get(a);if(f===void 0||f.count!==u){let y=function(){T.dispose(),n.delete(a),a.removeEventListener("dispose",y)};f!==void 0&&f.texture.dispose();let d=a.morphAttributes.position!==void 0,_=a.morphAttributes.normal!==void 0,g=a.morphAttributes.color!==void 0,m=a.morphAttributes.position||[],p=a.morphAttributes.normal||[],S=a.morphAttributes.color||[],M=0;d===!0&&(M=1),_===!0&&(M=2),g===!0&&(M=3);let x=a.attributes.position.count*M,A=1;x>t.maxTextureSize&&(A=Math.ceil(x/t.maxTextureSize),x=t.maxTextureSize);let E=new Float32Array(x*A*4*u),T=new Pc(E,x,A,u);T.type=us,T.needsUpdate=!0;let R=M*4;for(let v=0;v<u;v++){let P=m[v],U=p[v],z=S[v],V=x*A*4*v;for(let $=0;$<P.count;$++){let X=$*R;d===!0&&(i.fromBufferAttribute(P,$),E[V+X+0]=i.x,E[V+X+1]=i.y,E[V+X+2]=i.z,E[V+X+3]=0),_===!0&&(i.fromBufferAttribute(U,$),E[V+X+4]=i.x,E[V+X+5]=i.y,E[V+X+6]=i.z,E[V+X+7]=0),g===!0&&(i.fromBufferAttribute(z,$),E[V+X+8]=i.x,E[V+X+9]=i.y,E[V+X+10]=i.z,E[V+X+11]=z.itemSize===4?i.w:1)}}f={count:u,texture:T,size:new Xt(x,A)},n.set(a,f),a.addEventListener("dispose",y)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)l.getUniforms().setValue(s,"morphTexture",o.morphTexture,e);else{let d=0;for(let g=0;g<c.length;g++)d+=c[g];let _=a.morphTargetsRelative?1:1-d;l.getUniforms().setValue(s,"morphTargetBaseInfluence",_),l.getUniforms().setValue(s,"morphTargetInfluences",c)}l.getUniforms().setValue(s,"morphTargetsTexture",f.texture,e),l.getUniforms().setValue(s,"morphTargetsTextureSize",f.size)}return{update:r}}function ab(s,t,e,n){let i=new WeakMap;function r(l){let c=n.render.frame,h=l.geometry,u=t.get(l,h);if(i.get(u)!==c&&(t.update(u),i.set(u,c)),l.isInstancedMesh&&(l.hasEventListener("dispose",a)===!1&&l.addEventListener("dispose",a),i.get(l)!==c&&(e.update(l.instanceMatrix,s.ARRAY_BUFFER),l.instanceColor!==null&&e.update(l.instanceColor,s.ARRAY_BUFFER),i.set(l,c))),l.isSkinnedMesh){let f=l.skeleton;i.get(f)!==c&&(f.update(),i.set(f,c))}return u}function o(){i=new WeakMap}function a(l){let c=l.target;c.removeEventListener("dispose",a),e.remove(c.instanceMatrix),c.instanceColor!==null&&e.remove(c.instanceColor)}return{update:r,dispose:o}}var Fc=class extends ai{constructor(t,e,n,i,r,o,a,l,c,h=wo){if(h!==wo&&h!==Io)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&h===wo&&(n=Er),n===void 0&&h===Io&&(n=Po),super(null,i,r,o,a,l,h,n,c),this.isDepthTexture=!0,this.image={width:t,height:e},this.magFilter=a!==void 0?a:Ci,this.minFilter=l!==void 0?l:Ci,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.compareFunction=t.compareFunction,this}toJSON(t){let e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}},C_=new ai,Dg=new Fc(1,1),R_=new Pc,P_=new Jf,I_=new Nc,Ug=[],Ng=[],Og=new Float32Array(16),Fg=new Float32Array(9),Bg=new Float32Array(4);function zo(s,t,e){let n=s[0];if(n<=0||n>0)return s;let i=t*e,r=Ug[i];if(r===void 0&&(r=new Float32Array(i),Ug[i]=r),t!==0){n.toArray(r,0);for(let o=1,a=0;o!==t;++o)a+=e,s[o].toArray(r,a)}return r}function un(s,t){if(s.length!==t.length)return!1;for(let e=0,n=s.length;e<n;e++)if(s[e]!==t[e])return!1;return!0}function fn(s,t){for(let e=0,n=t.length;e<n;e++)s[e]=t[e]}function sh(s,t){let e=Ng[t];e===void 0&&(e=new Int32Array(t),Ng[t]=e);for(let n=0;n!==t;++n)e[n]=s.allocateTextureUnit();return e}function lb(s,t){let e=this.cache;e[0]!==t&&(s.uniform1f(this.addr,t),e[0]=t)}function cb(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(un(e,t))return;s.uniform2fv(this.addr,t),fn(e,t)}}function hb(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(s.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(un(e,t))return;s.uniform3fv(this.addr,t),fn(e,t)}}function ub(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(un(e,t))return;s.uniform4fv(this.addr,t),fn(e,t)}}function fb(s,t){let e=this.cache,n=t.elements;if(n===void 0){if(un(e,t))return;s.uniformMatrix2fv(this.addr,!1,t),fn(e,t)}else{if(un(e,n))return;Bg.set(n),s.uniformMatrix2fv(this.addr,!1,Bg),fn(e,n)}}function db(s,t){let e=this.cache,n=t.elements;if(n===void 0){if(un(e,t))return;s.uniformMatrix3fv(this.addr,!1,t),fn(e,t)}else{if(un(e,n))return;Fg.set(n),s.uniformMatrix3fv(this.addr,!1,Fg),fn(e,n)}}function pb(s,t){let e=this.cache,n=t.elements;if(n===void 0){if(un(e,t))return;s.uniformMatrix4fv(this.addr,!1,t),fn(e,t)}else{if(un(e,n))return;Og.set(n),s.uniformMatrix4fv(this.addr,!1,Og),fn(e,n)}}function mb(s,t){let e=this.cache;e[0]!==t&&(s.uniform1i(this.addr,t),e[0]=t)}function gb(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(un(e,t))return;s.uniform2iv(this.addr,t),fn(e,t)}}function _b(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(un(e,t))return;s.uniform3iv(this.addr,t),fn(e,t)}}function xb(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(un(e,t))return;s.uniform4iv(this.addr,t),fn(e,t)}}function vb(s,t){let e=this.cache;e[0]!==t&&(s.uniform1ui(this.addr,t),e[0]=t)}function yb(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(un(e,t))return;s.uniform2uiv(this.addr,t),fn(e,t)}}function Mb(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(un(e,t))return;s.uniform3uiv(this.addr,t),fn(e,t)}}function Sb(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(un(e,t))return;s.uniform4uiv(this.addr,t),fn(e,t)}}function bb(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i);let r;this.type===s.SAMPLER_2D_SHADOW?(Dg.compareFunction=b_,r=Dg):r=C_,e.setTexture2D(t||r,i)}function wb(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture3D(t||P_,i)}function Tb(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTextureCube(t||I_,i)}function Eb(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture2DArray(t||R_,i)}function Ab(s){switch(s){case 5126:return lb;case 35664:return cb;case 35665:return hb;case 35666:return ub;case 35674:return fb;case 35675:return db;case 35676:return pb;case 5124:case 35670:return mb;case 35667:case 35671:return gb;case 35668:case 35672:return _b;case 35669:case 35673:return xb;case 5125:return vb;case 36294:return yb;case 36295:return Mb;case 36296:return Sb;case 35678:case 36198:case 36298:case 36306:case 35682:return bb;case 35679:case 36299:case 36307:return wb;case 35680:case 36300:case 36308:case 36293:return Tb;case 36289:case 36303:case 36311:case 36292:return Eb}}function Cb(s,t){s.uniform1fv(this.addr,t)}function Rb(s,t){let e=zo(t,this.size,2);s.uniform2fv(this.addr,e)}function Pb(s,t){let e=zo(t,this.size,3);s.uniform3fv(this.addr,e)}function Ib(s,t){let e=zo(t,this.size,4);s.uniform4fv(this.addr,e)}function Lb(s,t){let e=zo(t,this.size,4);s.uniformMatrix2fv(this.addr,!1,e)}function Db(s,t){let e=zo(t,this.size,9);s.uniformMatrix3fv(this.addr,!1,e)}function Ub(s,t){let e=zo(t,this.size,16);s.uniformMatrix4fv(this.addr,!1,e)}function Nb(s,t){s.uniform1iv(this.addr,t)}function Ob(s,t){s.uniform2iv(this.addr,t)}function Fb(s,t){s.uniform3iv(this.addr,t)}function Bb(s,t){s.uniform4iv(this.addr,t)}function kb(s,t){s.uniform1uiv(this.addr,t)}function zb(s,t){s.uniform2uiv(this.addr,t)}function Hb(s,t){s.uniform3uiv(this.addr,t)}function Vb(s,t){s.uniform4uiv(this.addr,t)}function Gb(s,t,e){let n=this.cache,i=t.length,r=sh(e,i);un(n,r)||(s.uniform1iv(this.addr,r),fn(n,r));for(let o=0;o!==i;++o)e.setTexture2D(t[o]||C_,r[o])}function Wb(s,t,e){let n=this.cache,i=t.length,r=sh(e,i);un(n,r)||(s.uniform1iv(this.addr,r),fn(n,r));for(let o=0;o!==i;++o)e.setTexture3D(t[o]||P_,r[o])}function Xb(s,t,e){let n=this.cache,i=t.length,r=sh(e,i);un(n,r)||(s.uniform1iv(this.addr,r),fn(n,r));for(let o=0;o!==i;++o)e.setTextureCube(t[o]||I_,r[o])}function qb(s,t,e){let n=this.cache,i=t.length,r=sh(e,i);un(n,r)||(s.uniform1iv(this.addr,r),fn(n,r));for(let o=0;o!==i;++o)e.setTexture2DArray(t[o]||R_,r[o])}function Yb(s){switch(s){case 5126:return Cb;case 35664:return Rb;case 35665:return Pb;case 35666:return Ib;case 35674:return Lb;case 35675:return Db;case 35676:return Ub;case 5124:case 35670:return Nb;case 35667:case 35671:return Ob;case 35668:case 35672:return Fb;case 35669:case 35673:return Bb;case 5125:return kb;case 36294:return zb;case 36295:return Hb;case 36296:return Vb;case 35678:case 36198:case 36298:case 36306:case 35682:return Gb;case 35679:case 36299:case 36307:return Wb;case 35680:case 36300:case 36308:case 36293:return Xb;case 36289:case 36303:case 36311:case 36292:return qb}}var jf=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=Ab(e.type)}},td=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=Yb(e.type)}},ed=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){let i=this.seq;for(let r=0,o=i.length;r!==o;++r){let a=i[r];a.setValue(t,e[a.id],n)}}},tf=/(\w+)(\])?(\[|\.)?/g;function kg(s,t){s.seq.push(t),s.map[t.id]=t}function Zb(s,t,e){let n=s.name,i=n.length;for(tf.lastIndex=0;;){let r=tf.exec(n),o=tf.lastIndex,a=r[1],l=r[2]==="]",c=r[3];if(l&&(a=a|0),c===void 0||c==="["&&o+2===i){kg(e,c===void 0?new jf(a,s,t):new td(a,s,t));break}else{let u=e.map[a];u===void 0&&(u=new ed(a),kg(e,u)),e=u}}}var Eo=class{constructor(t,e){this.seq=[],this.map={};let n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let i=0;i<n;++i){let r=t.getActiveUniform(e,i),o=t.getUniformLocation(e,r.name);Zb(r,o,this)}}setValue(t,e,n,i){let r=this.map[e];r!==void 0&&r.setValue(t,n,i)}setOptional(t,e,n){let i=e[n];i!==void 0&&this.setValue(t,n,i)}static upload(t,e,n,i){for(let r=0,o=e.length;r!==o;++r){let a=e[r],l=n[a.id];l.needsUpdate!==!1&&a.setValue(t,l.value,i)}}static seqWithValue(t,e){let n=[];for(let i=0,r=t.length;i!==r;++i){let o=t[i];o.id in e&&n.push(o)}return n}};function zg(s,t,e){let n=s.createShader(t);return s.shaderSource(n,e),s.compileShader(n),n}var $b=37297,Jb=0;function Kb(s,t){let e=s.split(`
`),n=[],i=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let o=i;o<r;o++){let a=o+1;n.push(`${a===t?">":" "} ${a}: ${e[o]}`)}return n.join(`
`)}var Hg=new ae;function Qb(s){_e._getMatrix(Hg,_e.workingColorSpace,s);let t=`mat3( ${Hg.elements.map(e=>e.toFixed(4))} )`;switch(_e.getTransfer(s)){case ih:return[t,"LinearTransferOETF"];case Ae:return[t,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",s),[t,"LinearTransferOETF"]}}function Vg(s,t,e){let n=s.getShaderParameter(t,s.COMPILE_STATUS),i=s.getShaderInfoLog(t).trim();if(n&&i==="")return"";let r=/ERROR: 0:(\d+)/.exec(i);if(r){let o=parseInt(r[1]);return e.toUpperCase()+`

`+i+`

`+Kb(s.getShaderSource(t),o)}else return i}function jb(s,t){let e=Qb(t);return[`vec4 ${s}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}function tw(s,t){let e;switch(t){case Ad:e="Linear";break;case Cd:e="Reinhard";break;case Rd:e="Cineon";break;case Ga:e="ACESFilmic";break;case Pd:e="AgX";break;case Id:e="Neutral";break;case Lv:e="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",t),e="Linear"}return"vec3 "+s+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}var ac=new O;function ew(){_e.getLuminanceCoefficients(ac);let s=ac.x.toFixed(4),t=ac.y.toFixed(4),e=ac.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${s}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function nw(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",s.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Da).join(`
`)}function iw(s){let t=[];for(let e in s){let n=s[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function sw(s,t){let e={},n=s.getProgramParameter(t,s.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){let r=s.getActiveAttrib(t,i),o=r.name,a=1;r.type===s.FLOAT_MAT2&&(a=2),r.type===s.FLOAT_MAT3&&(a=3),r.type===s.FLOAT_MAT4&&(a=4),e[o]={type:r.type,location:s.getAttribLocation(t,o),locationSize:a}}return e}function Da(s){return s!==""}function Gg(s,t){let e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return s.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Wg(s,t){return s.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var rw=/^[ \t]*#include +<([\w\d./]+)>/gm;function nd(s){return s.replace(rw,aw)}var ow=new Map;function aw(s,t){let e=ce[t];if(e===void 0){let n=ow.get(t);if(n!==void 0)e=ce[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("Can not resolve #include <"+t+">")}return nd(e)}var lw=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Xg(s){return s.replace(lw,cw)}function cw(s,t,e,n){let i="";for(let r=parseInt(t);r<parseInt(e);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function qg(s){let t=`precision ${s.precision} float;
	precision ${s.precision} int;
	precision ${s.precision} sampler2D;
	precision ${s.precision} samplerCube;
	precision ${s.precision} sampler3D;
	precision ${s.precision} sampler2DArray;
	precision ${s.precision} sampler2DShadow;
	precision ${s.precision} samplerCubeShadow;
	precision ${s.precision} sampler2DArrayShadow;
	precision ${s.precision} isampler2D;
	precision ${s.precision} isampler3D;
	precision ${s.precision} isamplerCube;
	precision ${s.precision} isampler2DArray;
	precision ${s.precision} usampler2D;
	precision ${s.precision} usampler3D;
	precision ${s.precision} usamplerCube;
	precision ${s.precision} usampler2DArray;
	`;return s.precision==="highp"?t+=`
#define HIGH_PRECISION`:s.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}function hw(s){let t="SHADOWMAP_TYPE_BASIC";return s.shadowMapType===c_?t="SHADOWMAP_TYPE_PCF":s.shadowMapType===uv?t="SHADOWMAP_TYPE_PCF_SOFT":s.shadowMapType===ls&&(t="SHADOWMAP_TYPE_VSM"),t}function uw(s){let t="ENVMAP_TYPE_CUBE";if(s.envMap)switch(s.envMapMode){case Co:case Ro:t="ENVMAP_TYPE_CUBE";break;case nh:t="ENVMAP_TYPE_CUBE_UV";break}return t}function fw(s){let t="ENVMAP_MODE_REFLECTION";if(s.envMap)switch(s.envMapMode){case Ro:t="ENVMAP_MODE_REFRACTION";break}return t}function dw(s){let t="ENVMAP_BLENDING_NONE";if(s.envMap)switch(s.combine){case h_:t="ENVMAP_BLENDING_MULTIPLY";break;case Pv:t="ENVMAP_BLENDING_MIX";break;case Iv:t="ENVMAP_BLENDING_ADD";break}return t}function pw(s){let t=s.envMapCubeUVHeight;if(t===null)return null;let e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),7*16)),texelHeight:n,maxMip:e}}function mw(s,t,e,n){let i=s.getContext(),r=e.defines,o=e.vertexShader,a=e.fragmentShader,l=hw(e),c=uw(e),h=fw(e),u=dw(e),f=pw(e),d=nw(e),_=iw(r),g=i.createProgram(),m,p,S=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(m=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,_].filter(Da).join(`
`),m.length>0&&(m+=`
`),p=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,_].filter(Da).join(`
`),p.length>0&&(p+=`
`)):(m=[qg(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,_,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",e.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Da).join(`
`),p=[qg(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,_,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+h:"",e.envMap?"#define "+u:"",f?"#define CUBEUV_TEXEL_WIDTH "+f.texelWidth:"",f?"#define CUBEUV_TEXEL_HEIGHT "+f.texelHeight:"",f?"#define CUBEUV_MAX_MIP "+f.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor||e.batchingColor?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",e.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==Vs?"#define TONE_MAPPING":"",e.toneMapping!==Vs?ce.tonemapping_pars_fragment:"",e.toneMapping!==Vs?tw("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",ce.colorspace_pars_fragment,jb("linearToOutputTexel",e.outputColorSpace),ew(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Da).join(`
`)),o=nd(o),o=Gg(o,e),o=Wg(o,e),a=nd(a),a=Gg(a,e),a=Wg(a,e),o=Xg(o),a=Xg(a),e.isRawShaderMaterial!==!0&&(S=`#version 300 es
`,m=[d,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,p=["#define varying in",e.glslVersion===og?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===og?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);let M=S+m+o,x=S+p+a,A=zg(i,i.VERTEX_SHADER,M),E=zg(i,i.FRAGMENT_SHADER,x);i.attachShader(g,A),i.attachShader(g,E),e.index0AttributeName!==void 0?i.bindAttribLocation(g,0,e.index0AttributeName):e.morphTargets===!0&&i.bindAttribLocation(g,0,"position"),i.linkProgram(g);function T(P){if(s.debug.checkShaderErrors){let U=i.getProgramInfoLog(g).trim(),z=i.getShaderInfoLog(A).trim(),V=i.getShaderInfoLog(E).trim(),$=!0,X=!0;if(i.getProgramParameter(g,i.LINK_STATUS)===!1)if($=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,g,A,E);else{let Y=Vg(i,A,"vertex"),W=Vg(i,E,"fragment");console.error("THREE.WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(g,i.VALIDATE_STATUS)+`

Material Name: `+P.name+`
Material Type: `+P.type+`

Program Info Log: `+U+`
`+Y+`
`+W)}else U!==""?console.warn("THREE.WebGLProgram: Program Info Log:",U):(z===""||V==="")&&(X=!1);X&&(P.diagnostics={runnable:$,programLog:U,vertexShader:{log:z,prefix:m},fragmentShader:{log:V,prefix:p}})}i.deleteShader(A),i.deleteShader(E),R=new Eo(i,g),y=sw(i,g)}let R;this.getUniforms=function(){return R===void 0&&T(this),R};let y;this.getAttributes=function(){return y===void 0&&T(this),y};let v=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return v===!1&&(v=i.getProgramParameter(g,$b)),v},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(g),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=Jb++,this.cacheKey=t,this.usedTimes=1,this.program=g,this.vertexShader=A,this.fragmentShader=E,this}var gw=0,id=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t){let e=t.vertexShader,n=t.fragmentShader,i=this._getShaderStage(e),r=this._getShaderStage(n),o=this._getShaderCacheForMaterial(t);return o.has(i)===!1&&(o.add(i),i.usedTimes++),o.has(r)===!1&&(o.add(r),r.usedTimes++),this}remove(t){let e=this.materialCache.get(t);for(let n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderID(t){return this._getShaderStage(t.vertexShader).id}getFragmentShaderID(t){return this._getShaderStage(t.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let e=this.materialCache,n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){let e=this.shaderCache,n=e.get(t);return n===void 0&&(n=new sd(t),e.set(t,n)),n}},sd=class{constructor(t){this.id=gw++,this.code=t,this.usedTimes=0}};function _w(s,t,e,n,i,r,o){let a=new Ic,l=new id,c=new Set,h=[],u=i.logarithmicDepthBuffer,f=i.vertexTextures,d=i.precision,_={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function g(y){return c.add(y),y===0?"uv":`uv${y}`}function m(y,v,P,U,z){let V=U.fog,$=z.geometry,X=y.isMeshStandardMaterial?U.environment:null,Y=(y.isMeshStandardMaterial?e:t).get(y.envMap||X),W=Y&&Y.mapping===nh?Y.image.height:null,it=_[y.type];y.precision!==null&&(d=i.getMaxPrecision(y.precision),d!==y.precision&&console.warn("THREE.WebGLProgram.getParameters:",y.precision,"not supported, using",d,"instead."));let I=$.morphAttributes.position||$.morphAttributes.normal||$.morphAttributes.color,ft=I!==void 0?I.length:0,Wt=0;$.morphAttributes.position!==void 0&&(Wt=1),$.morphAttributes.normal!==void 0&&(Wt=2),$.morphAttributes.color!==void 0&&(Wt=3);let Ot,Z,nt,yt;if(it){let pt=ki[it];Ot=pt.vertexShader,Z=pt.fragmentShader}else Ot=y.vertexShader,Z=y.fragmentShader,l.update(y),nt=l.getVertexShaderID(y),yt=l.getFragmentShaderID(y);let st=s.getRenderTarget(),Ct=s.state.buffers.depth.getReversed(),Ut=z.isInstancedMesh===!0,Qt=z.isBatchedMesh===!0,se=!!y.map,Yt=!!y.matcap,kt=!!Y,N=!!y.aoMap,Me=!!y.lightMap,Zt=!!y.bumpMap,H=!!y.normalMap,Rt=!!y.displacementMap,fe=!!y.emissiveMap,Nt=!!y.metalnessMap,C=!!y.roughnessMap,b=y.anisotropy>0,G=y.clearcoat>0,tt=y.dispersion>0,Q=y.iridescence>0,K=y.sheen>0,_t=y.transmission>0,ht=b&&!!y.anisotropyMap,xt=G&&!!y.clearcoatMap,Jt=G&&!!y.clearcoatNormalMap,rt=G&&!!y.clearcoatRoughnessMap,ct=Q&&!!y.iridescenceMap,Vt=Q&&!!y.iridescenceThicknessMap,Bt=K&&!!y.sheenColorMap,wt=K&&!!y.sheenRoughnessMap,te=!!y.specularMap,zt=!!y.specularColorMap,de=!!y.specularIntensityMap,L=_t&&!!y.transmissionMap,dt=_t&&!!y.thicknessMap,q=!!y.gradientMap,j=!!y.alphaMap,ut=y.alphaTest>0,gt=!!y.alphaHash,qt=!!y.extensions,pe=Vs;y.toneMapped&&(st===null||st.isXRRenderTarget===!0)&&(pe=s.toneMapping);let ve={shaderID:it,shaderType:y.type,shaderName:y.name,vertexShader:Ot,fragmentShader:Z,defines:y.defines,customVertexShaderID:nt,customFragmentShaderID:yt,isRawShaderMaterial:y.isRawShaderMaterial===!0,glslVersion:y.glslVersion,precision:d,batching:Qt,batchingColor:Qt&&z._colorsTexture!==null,instancing:Ut,instancingColor:Ut&&z.instanceColor!==null,instancingMorph:Ut&&z.morphTexture!==null,supportsVertexTextures:f,outputColorSpace:st===null?s.outputColorSpace:st.isXRRenderTarget===!0?st.texture.colorSpace:ko,alphaToCoverage:!!y.alphaToCoverage,map:se,matcap:Yt,envMap:kt,envMapMode:kt&&Y.mapping,envMapCubeUVHeight:W,aoMap:N,lightMap:Me,bumpMap:Zt,normalMap:H,displacementMap:f&&Rt,emissiveMap:fe,normalMapObjectSpace:H&&y.normalMapType===Ov,normalMapTangentSpace:H&&y.normalMapType===S_,metalnessMap:Nt,roughnessMap:C,anisotropy:b,anisotropyMap:ht,clearcoat:G,clearcoatMap:xt,clearcoatNormalMap:Jt,clearcoatRoughnessMap:rt,dispersion:tt,iridescence:Q,iridescenceMap:ct,iridescenceThicknessMap:Vt,sheen:K,sheenColorMap:Bt,sheenRoughnessMap:wt,specularMap:te,specularColorMap:zt,specularIntensityMap:de,transmission:_t,transmissionMap:L,thicknessMap:dt,gradientMap:q,opaque:y.transparent===!1&&y.blending===bo&&y.alphaToCoverage===!1,alphaMap:j,alphaTest:ut,alphaHash:gt,combine:y.combine,mapUv:se&&g(y.map.channel),aoMapUv:N&&g(y.aoMap.channel),lightMapUv:Me&&g(y.lightMap.channel),bumpMapUv:Zt&&g(y.bumpMap.channel),normalMapUv:H&&g(y.normalMap.channel),displacementMapUv:Rt&&g(y.displacementMap.channel),emissiveMapUv:fe&&g(y.emissiveMap.channel),metalnessMapUv:Nt&&g(y.metalnessMap.channel),roughnessMapUv:C&&g(y.roughnessMap.channel),anisotropyMapUv:ht&&g(y.anisotropyMap.channel),clearcoatMapUv:xt&&g(y.clearcoatMap.channel),clearcoatNormalMapUv:Jt&&g(y.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:rt&&g(y.clearcoatRoughnessMap.channel),iridescenceMapUv:ct&&g(y.iridescenceMap.channel),iridescenceThicknessMapUv:Vt&&g(y.iridescenceThicknessMap.channel),sheenColorMapUv:Bt&&g(y.sheenColorMap.channel),sheenRoughnessMapUv:wt&&g(y.sheenRoughnessMap.channel),specularMapUv:te&&g(y.specularMap.channel),specularColorMapUv:zt&&g(y.specularColorMap.channel),specularIntensityMapUv:de&&g(y.specularIntensityMap.channel),transmissionMapUv:L&&g(y.transmissionMap.channel),thicknessMapUv:dt&&g(y.thicknessMap.channel),alphaMapUv:j&&g(y.alphaMap.channel),vertexTangents:!!$.attributes.tangent&&(H||b),vertexColors:y.vertexColors,vertexAlphas:y.vertexColors===!0&&!!$.attributes.color&&$.attributes.color.itemSize===4,pointsUvs:z.isPoints===!0&&!!$.attributes.uv&&(se||j),fog:!!V,useFog:y.fog===!0,fogExp2:!!V&&V.isFogExp2,flatShading:y.flatShading===!0,sizeAttenuation:y.sizeAttenuation===!0,logarithmicDepthBuffer:u,reverseDepthBuffer:Ct,skinning:z.isSkinnedMesh===!0,morphTargets:$.morphAttributes.position!==void 0,morphNormals:$.morphAttributes.normal!==void 0,morphColors:$.morphAttributes.color!==void 0,morphTargetsCount:ft,morphTextureStride:Wt,numDirLights:v.directional.length,numPointLights:v.point.length,numSpotLights:v.spot.length,numSpotLightMaps:v.spotLightMap.length,numRectAreaLights:v.rectArea.length,numHemiLights:v.hemi.length,numDirLightShadows:v.directionalShadowMap.length,numPointLightShadows:v.pointShadowMap.length,numSpotLightShadows:v.spotShadowMap.length,numSpotLightShadowsWithMaps:v.numSpotLightShadowsWithMaps,numLightProbes:v.numLightProbes,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:y.dithering,shadowMapEnabled:s.shadowMap.enabled&&P.length>0,shadowMapType:s.shadowMap.type,toneMapping:pe,decodeVideoTexture:se&&y.map.isVideoTexture===!0&&_e.getTransfer(y.map.colorSpace)===Ae,decodeVideoTextureEmissive:fe&&y.emissiveMap.isVideoTexture===!0&&_e.getTransfer(y.emissiveMap.colorSpace)===Ae,premultipliedAlpha:y.premultipliedAlpha,doubleSided:y.side===oi,flipSided:y.side===$n,useDepthPacking:y.depthPacking>=0,depthPacking:y.depthPacking||0,index0AttributeName:y.index0AttributeName,extensionClipCullDistance:qt&&y.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(qt&&y.extensions.multiDraw===!0||Qt)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:y.customProgramCacheKey()};return ve.vertexUv1s=c.has(1),ve.vertexUv2s=c.has(2),ve.vertexUv3s=c.has(3),c.clear(),ve}function p(y){let v=[];if(y.shaderID?v.push(y.shaderID):(v.push(y.customVertexShaderID),v.push(y.customFragmentShaderID)),y.defines!==void 0)for(let P in y.defines)v.push(P),v.push(y.defines[P]);return y.isRawShaderMaterial===!1&&(S(v,y),M(v,y),v.push(s.outputColorSpace)),v.push(y.customProgramCacheKey),v.join()}function S(y,v){y.push(v.precision),y.push(v.outputColorSpace),y.push(v.envMapMode),y.push(v.envMapCubeUVHeight),y.push(v.mapUv),y.push(v.alphaMapUv),y.push(v.lightMapUv),y.push(v.aoMapUv),y.push(v.bumpMapUv),y.push(v.normalMapUv),y.push(v.displacementMapUv),y.push(v.emissiveMapUv),y.push(v.metalnessMapUv),y.push(v.roughnessMapUv),y.push(v.anisotropyMapUv),y.push(v.clearcoatMapUv),y.push(v.clearcoatNormalMapUv),y.push(v.clearcoatRoughnessMapUv),y.push(v.iridescenceMapUv),y.push(v.iridescenceThicknessMapUv),y.push(v.sheenColorMapUv),y.push(v.sheenRoughnessMapUv),y.push(v.specularMapUv),y.push(v.specularColorMapUv),y.push(v.specularIntensityMapUv),y.push(v.transmissionMapUv),y.push(v.thicknessMapUv),y.push(v.combine),y.push(v.fogExp2),y.push(v.sizeAttenuation),y.push(v.morphTargetsCount),y.push(v.morphAttributeCount),y.push(v.numDirLights),y.push(v.numPointLights),y.push(v.numSpotLights),y.push(v.numSpotLightMaps),y.push(v.numHemiLights),y.push(v.numRectAreaLights),y.push(v.numDirLightShadows),y.push(v.numPointLightShadows),y.push(v.numSpotLightShadows),y.push(v.numSpotLightShadowsWithMaps),y.push(v.numLightProbes),y.push(v.shadowMapType),y.push(v.toneMapping),y.push(v.numClippingPlanes),y.push(v.numClipIntersection),y.push(v.depthPacking)}function M(y,v){a.disableAll(),v.supportsVertexTextures&&a.enable(0),v.instancing&&a.enable(1),v.instancingColor&&a.enable(2),v.instancingMorph&&a.enable(3),v.matcap&&a.enable(4),v.envMap&&a.enable(5),v.normalMapObjectSpace&&a.enable(6),v.normalMapTangentSpace&&a.enable(7),v.clearcoat&&a.enable(8),v.iridescence&&a.enable(9),v.alphaTest&&a.enable(10),v.vertexColors&&a.enable(11),v.vertexAlphas&&a.enable(12),v.vertexUv1s&&a.enable(13),v.vertexUv2s&&a.enable(14),v.vertexUv3s&&a.enable(15),v.vertexTangents&&a.enable(16),v.anisotropy&&a.enable(17),v.alphaHash&&a.enable(18),v.batching&&a.enable(19),v.dispersion&&a.enable(20),v.batchingColor&&a.enable(21),y.push(a.mask),a.disableAll(),v.fog&&a.enable(0),v.useFog&&a.enable(1),v.flatShading&&a.enable(2),v.logarithmicDepthBuffer&&a.enable(3),v.reverseDepthBuffer&&a.enable(4),v.skinning&&a.enable(5),v.morphTargets&&a.enable(6),v.morphNormals&&a.enable(7),v.morphColors&&a.enable(8),v.premultipliedAlpha&&a.enable(9),v.shadowMapEnabled&&a.enable(10),v.doubleSided&&a.enable(11),v.flipSided&&a.enable(12),v.useDepthPacking&&a.enable(13),v.dithering&&a.enable(14),v.transmission&&a.enable(15),v.sheen&&a.enable(16),v.opaque&&a.enable(17),v.pointsUvs&&a.enable(18),v.decodeVideoTexture&&a.enable(19),v.decodeVideoTextureEmissive&&a.enable(20),v.alphaToCoverage&&a.enable(21),y.push(a.mask)}function x(y){let v=_[y.type],P;if(v){let U=ki[v];P=Ys.clone(U.uniforms)}else P=y.uniforms;return P}function A(y,v){let P;for(let U=0,z=h.length;U<z;U++){let V=h[U];if(V.cacheKey===v){P=V,++P.usedTimes;break}}return P===void 0&&(P=new mw(s,v,y,r),h.push(P)),P}function E(y){if(--y.usedTimes===0){let v=h.indexOf(y);h[v]=h[h.length-1],h.pop(),y.destroy()}}function T(y){l.remove(y)}function R(){l.dispose()}return{getParameters:m,getProgramCacheKey:p,getUniforms:x,acquireProgram:A,releaseProgram:E,releaseShaderCache:T,programs:h,dispose:R}}function xw(){let s=new WeakMap;function t(o){return s.has(o)}function e(o){let a=s.get(o);return a===void 0&&(a={},s.set(o,a)),a}function n(o){s.delete(o)}function i(o,a,l){s.get(o)[a]=l}function r(){s=new WeakMap}return{has:t,get:e,remove:n,update:i,dispose:r}}function vw(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.material.id!==t.material.id?s.material.id-t.material.id:s.z!==t.z?s.z-t.z:s.id-t.id}function Yg(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.z!==t.z?t.z-s.z:s.id-t.id}function Zg(){let s=[],t=0,e=[],n=[],i=[];function r(){t=0,e.length=0,n.length=0,i.length=0}function o(u,f,d,_,g,m){let p=s[t];return p===void 0?(p={id:u.id,object:u,geometry:f,material:d,groupOrder:_,renderOrder:u.renderOrder,z:g,group:m},s[t]=p):(p.id=u.id,p.object=u,p.geometry=f,p.material=d,p.groupOrder=_,p.renderOrder=u.renderOrder,p.z=g,p.group=m),t++,p}function a(u,f,d,_,g,m){let p=o(u,f,d,_,g,m);d.transmission>0?n.push(p):d.transparent===!0?i.push(p):e.push(p)}function l(u,f,d,_,g,m){let p=o(u,f,d,_,g,m);d.transmission>0?n.unshift(p):d.transparent===!0?i.unshift(p):e.unshift(p)}function c(u,f){e.length>1&&e.sort(u||vw),n.length>1&&n.sort(f||Yg),i.length>1&&i.sort(f||Yg)}function h(){for(let u=t,f=s.length;u<f;u++){let d=s[u];if(d.id===null)break;d.id=null,d.object=null,d.geometry=null,d.material=null,d.group=null}}return{opaque:e,transmissive:n,transparent:i,init:r,push:a,unshift:l,finish:h,sort:c}}function yw(){let s=new WeakMap;function t(n,i){let r=s.get(n),o;return r===void 0?(o=new Zg,s.set(n,[o])):i>=r.length?(o=new Zg,r.push(o)):o=r[i],o}function e(){s=new WeakMap}return{get:t,dispose:e}}function Mw(){let s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new O,color:new Dt};break;case"SpotLight":e={position:new O,direction:new O,color:new Dt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new O,color:new Dt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new O,skyColor:new Dt,groundColor:new Dt};break;case"RectAreaLight":e={color:new Dt,position:new O,halfWidth:new O,halfHeight:new O};break}return s[t.id]=e,e}}}function Sw(){let s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Xt};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Xt};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Xt,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[t.id]=e,e}}}var bw=0;function ww(s,t){return(t.castShadow?2:0)-(s.castShadow?2:0)+(t.map?1:0)-(s.map?1:0)}function Tw(s){let t=new Mw,e=Sw(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new O);let i=new O,r=new Be,o=new Be;function a(c){let h=0,u=0,f=0;for(let y=0;y<9;y++)n.probe[y].set(0,0,0);let d=0,_=0,g=0,m=0,p=0,S=0,M=0,x=0,A=0,E=0,T=0;c.sort(ww);for(let y=0,v=c.length;y<v;y++){let P=c[y],U=P.color,z=P.intensity,V=P.distance,$=P.shadow&&P.shadow.map?P.shadow.map.texture:null;if(P.isAmbientLight)h+=U.r*z,u+=U.g*z,f+=U.b*z;else if(P.isLightProbe){for(let X=0;X<9;X++)n.probe[X].addScaledVector(P.sh.coefficients[X],z);T++}else if(P.isDirectionalLight){let X=t.get(P);if(X.color.copy(P.color).multiplyScalar(P.intensity),P.castShadow){let Y=P.shadow,W=e.get(P);W.shadowIntensity=Y.intensity,W.shadowBias=Y.bias,W.shadowNormalBias=Y.normalBias,W.shadowRadius=Y.radius,W.shadowMapSize=Y.mapSize,n.directionalShadow[d]=W,n.directionalShadowMap[d]=$,n.directionalShadowMatrix[d]=P.shadow.matrix,S++}n.directional[d]=X,d++}else if(P.isSpotLight){let X=t.get(P);X.position.setFromMatrixPosition(P.matrixWorld),X.color.copy(U).multiplyScalar(z),X.distance=V,X.coneCos=Math.cos(P.angle),X.penumbraCos=Math.cos(P.angle*(1-P.penumbra)),X.decay=P.decay,n.spot[g]=X;let Y=P.shadow;if(P.map&&(n.spotLightMap[A]=P.map,A++,Y.updateMatrices(P),P.castShadow&&E++),n.spotLightMatrix[g]=Y.matrix,P.castShadow){let W=e.get(P);W.shadowIntensity=Y.intensity,W.shadowBias=Y.bias,W.shadowNormalBias=Y.normalBias,W.shadowRadius=Y.radius,W.shadowMapSize=Y.mapSize,n.spotShadow[g]=W,n.spotShadowMap[g]=$,x++}g++}else if(P.isRectAreaLight){let X=t.get(P);X.color.copy(U).multiplyScalar(z),X.halfWidth.set(P.width*.5,0,0),X.halfHeight.set(0,P.height*.5,0),n.rectArea[m]=X,m++}else if(P.isPointLight){let X=t.get(P);if(X.color.copy(P.color).multiplyScalar(P.intensity),X.distance=P.distance,X.decay=P.decay,P.castShadow){let Y=P.shadow,W=e.get(P);W.shadowIntensity=Y.intensity,W.shadowBias=Y.bias,W.shadowNormalBias=Y.normalBias,W.shadowRadius=Y.radius,W.shadowMapSize=Y.mapSize,W.shadowCameraNear=Y.camera.near,W.shadowCameraFar=Y.camera.far,n.pointShadow[_]=W,n.pointShadowMap[_]=$,n.pointShadowMatrix[_]=P.shadow.matrix,M++}n.point[_]=X,_++}else if(P.isHemisphereLight){let X=t.get(P);X.skyColor.copy(P.color).multiplyScalar(z),X.groundColor.copy(P.groundColor).multiplyScalar(z),n.hemi[p]=X,p++}}m>0&&(s.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=bt.LTC_FLOAT_1,n.rectAreaLTC2=bt.LTC_FLOAT_2):(n.rectAreaLTC1=bt.LTC_HALF_1,n.rectAreaLTC2=bt.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=u,n.ambient[2]=f;let R=n.hash;(R.directionalLength!==d||R.pointLength!==_||R.spotLength!==g||R.rectAreaLength!==m||R.hemiLength!==p||R.numDirectionalShadows!==S||R.numPointShadows!==M||R.numSpotShadows!==x||R.numSpotMaps!==A||R.numLightProbes!==T)&&(n.directional.length=d,n.spot.length=g,n.rectArea.length=m,n.point.length=_,n.hemi.length=p,n.directionalShadow.length=S,n.directionalShadowMap.length=S,n.pointShadow.length=M,n.pointShadowMap.length=M,n.spotShadow.length=x,n.spotShadowMap.length=x,n.directionalShadowMatrix.length=S,n.pointShadowMatrix.length=M,n.spotLightMatrix.length=x+A-E,n.spotLightMap.length=A,n.numSpotLightShadowsWithMaps=E,n.numLightProbes=T,R.directionalLength=d,R.pointLength=_,R.spotLength=g,R.rectAreaLength=m,R.hemiLength=p,R.numDirectionalShadows=S,R.numPointShadows=M,R.numSpotShadows=x,R.numSpotMaps=A,R.numLightProbes=T,n.version=bw++)}function l(c,h){let u=0,f=0,d=0,_=0,g=0,m=h.matrixWorldInverse;for(let p=0,S=c.length;p<S;p++){let M=c[p];if(M.isDirectionalLight){let x=n.directional[u];x.direction.setFromMatrixPosition(M.matrixWorld),i.setFromMatrixPosition(M.target.matrixWorld),x.direction.sub(i),x.direction.transformDirection(m),u++}else if(M.isSpotLight){let x=n.spot[d];x.position.setFromMatrixPosition(M.matrixWorld),x.position.applyMatrix4(m),x.direction.setFromMatrixPosition(M.matrixWorld),i.setFromMatrixPosition(M.target.matrixWorld),x.direction.sub(i),x.direction.transformDirection(m),d++}else if(M.isRectAreaLight){let x=n.rectArea[_];x.position.setFromMatrixPosition(M.matrixWorld),x.position.applyMatrix4(m),o.identity(),r.copy(M.matrixWorld),r.premultiply(m),o.extractRotation(r),x.halfWidth.set(M.width*.5,0,0),x.halfHeight.set(0,M.height*.5,0),x.halfWidth.applyMatrix4(o),x.halfHeight.applyMatrix4(o),_++}else if(M.isPointLight){let x=n.point[f];x.position.setFromMatrixPosition(M.matrixWorld),x.position.applyMatrix4(m),f++}else if(M.isHemisphereLight){let x=n.hemi[g];x.direction.setFromMatrixPosition(M.matrixWorld),x.direction.transformDirection(m),g++}}}return{setup:a,setupView:l,state:n}}function $g(s){let t=new Tw(s),e=[],n=[];function i(h){c.camera=h,e.length=0,n.length=0}function r(h){e.push(h)}function o(h){n.push(h)}function a(){t.setup(e)}function l(h){t.setupView(e,h)}let c={lightsArray:e,shadowsArray:n,camera:null,lights:t,transmissionRenderTarget:{}};return{init:i,state:c,setupLights:a,setupLightsView:l,pushLight:r,pushShadow:o}}function Ew(s){let t=new WeakMap;function e(i,r=0){let o=t.get(i),a;return o===void 0?(a=new $g(s),t.set(i,[a])):r>=o.length?(a=new $g(s),o.push(a)):a=o[r],a}function n(){t=new WeakMap}return{get:e,dispose:n}}var rd=class extends Wi{static get type(){return"MeshDepthMaterial"}constructor(t){super(),this.isMeshDepthMaterial=!0,this.depthPacking=Uv,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},od=class extends Wi{static get type(){return"MeshDistanceMaterial"}constructor(t){super(),this.isMeshDistanceMaterial=!0,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}},Aw=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Cw=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function Rw(s,t,e){let n=new Fa,i=new Xt,r=new Xt,o=new Le,a=new rd({depthPacking:Nv}),l=new od,c={},h=e.maxTextureSize,u={[Ws]:$n,[$n]:Ws,[oi]:oi},f=new en({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Xt},radius:{value:4}},vertexShader:Aw,fragmentShader:Cw}),d=f.clone();d.defines.HORIZONTAL_PASS=1;let _=new an;_.setAttribute("position",new gn(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let g=new Ht(_,f),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=c_;let p=this.type;this.render=function(E,T,R){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||E.length===0)return;let y=s.getRenderTarget(),v=s.getActiveCubeFace(),P=s.getActiveMipmapLevel(),U=s.state;U.setBlending(Vi),U.buffers.color.setClear(1,1,1,1),U.buffers.depth.setTest(!0),U.setScissorTest(!1);let z=p!==ls&&this.type===ls,V=p===ls&&this.type!==ls;for(let $=0,X=E.length;$<X;$++){let Y=E[$],W=Y.shadow;if(W===void 0){console.warn("THREE.WebGLShadowMap:",Y,"has no shadow.");continue}if(W.autoUpdate===!1&&W.needsUpdate===!1)continue;i.copy(W.mapSize);let it=W.getFrameExtents();if(i.multiply(it),r.copy(W.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/it.x),i.x=r.x*it.x,W.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/it.y),i.y=r.y*it.y,W.mapSize.y=r.y)),W.map===null||z===!0||V===!0){let ft=this.type!==ls?{minFilter:Ci,magFilter:Ci}:{};W.map!==null&&W.map.dispose(),W.map=new zn(i.x,i.y,ft),W.map.texture.name=Y.name+".shadowMap",W.camera.updateProjectionMatrix()}s.setRenderTarget(W.map),s.clear();let I=W.getViewportCount();for(let ft=0;ft<I;ft++){let Wt=W.getViewport(ft);o.set(r.x*Wt.x,r.y*Wt.y,r.x*Wt.z,r.y*Wt.w),U.viewport(o),W.updateMatrices(Y,ft),n=W.getFrustum(),x(T,R,W.camera,Y,this.type)}W.isPointLightShadow!==!0&&this.type===ls&&S(W,R),W.needsUpdate=!1}p=this.type,m.needsUpdate=!1,s.setRenderTarget(y,v,P)};function S(E,T){let R=t.update(g);f.defines.VSM_SAMPLES!==E.blurSamples&&(f.defines.VSM_SAMPLES=E.blurSamples,d.defines.VSM_SAMPLES=E.blurSamples,f.needsUpdate=!0,d.needsUpdate=!0),E.mapPass===null&&(E.mapPass=new zn(i.x,i.y)),f.uniforms.shadow_pass.value=E.map.texture,f.uniforms.resolution.value=E.mapSize,f.uniforms.radius.value=E.radius,s.setRenderTarget(E.mapPass),s.clear(),s.renderBufferDirect(T,null,R,f,g,null),d.uniforms.shadow_pass.value=E.mapPass.texture,d.uniforms.resolution.value=E.mapSize,d.uniforms.radius.value=E.radius,s.setRenderTarget(E.map),s.clear(),s.renderBufferDirect(T,null,R,d,g,null)}function M(E,T,R,y){let v=null,P=R.isPointLight===!0?E.customDistanceMaterial:E.customDepthMaterial;if(P!==void 0)v=P;else if(v=R.isPointLight===!0?l:a,s.localClippingEnabled&&T.clipShadows===!0&&Array.isArray(T.clippingPlanes)&&T.clippingPlanes.length!==0||T.displacementMap&&T.displacementScale!==0||T.alphaMap&&T.alphaTest>0||T.map&&T.alphaTest>0){let U=v.uuid,z=T.uuid,V=c[U];V===void 0&&(V={},c[U]=V);let $=V[z];$===void 0&&($=v.clone(),V[z]=$,T.addEventListener("dispose",A)),v=$}if(v.visible=T.visible,v.wireframe=T.wireframe,y===ls?v.side=T.shadowSide!==null?T.shadowSide:T.side:v.side=T.shadowSide!==null?T.shadowSide:u[T.side],v.alphaMap=T.alphaMap,v.alphaTest=T.alphaTest,v.map=T.map,v.clipShadows=T.clipShadows,v.clippingPlanes=T.clippingPlanes,v.clipIntersection=T.clipIntersection,v.displacementMap=T.displacementMap,v.displacementScale=T.displacementScale,v.displacementBias=T.displacementBias,v.wireframeLinewidth=T.wireframeLinewidth,v.linewidth=T.linewidth,R.isPointLight===!0&&v.isMeshDistanceMaterial===!0){let U=s.properties.get(v);U.light=R}return v}function x(E,T,R,y,v){if(E.visible===!1)return;if(E.layers.test(T.layers)&&(E.isMesh||E.isLine||E.isPoints)&&(E.castShadow||E.receiveShadow&&v===ls)&&(!E.frustumCulled||n.intersectsObject(E))){E.modelViewMatrix.multiplyMatrices(R.matrixWorldInverse,E.matrixWorld);let z=t.update(E),V=E.material;if(Array.isArray(V)){let $=z.groups;for(let X=0,Y=$.length;X<Y;X++){let W=$[X],it=V[W.materialIndex];if(it&&it.visible){let I=M(E,it,y,v);E.onBeforeShadow(s,E,T,R,z,I,W),s.renderBufferDirect(R,null,z,I,E,W),E.onAfterShadow(s,E,T,R,z,I,W)}}}else if(V.visible){let $=M(E,V,y,v);E.onBeforeShadow(s,E,T,R,z,$,null),s.renderBufferDirect(R,null,z,$,E,null),E.onAfterShadow(s,E,T,R,z,$,null)}}let U=E.children;for(let z=0,V=U.length;z<V;z++)x(U[z],T,R,y,v)}function A(E){E.target.removeEventListener("dispose",A);for(let R in c){let y=c[R],v=E.target.uuid;v in y&&(y[v].dispose(),delete y[v])}}}var Pw={[cf]:hf,[uf]:pf,[ff]:mf,[Ao]:df,[hf]:cf,[pf]:uf,[mf]:ff,[df]:Ao};function Iw(s,t){function e(){let L=!1,dt=new Le,q=null,j=new Le(0,0,0,0);return{setMask:function(ut){q!==ut&&!L&&(s.colorMask(ut,ut,ut,ut),q=ut)},setLocked:function(ut){L=ut},setClear:function(ut,gt,qt,pe,ve){ve===!0&&(ut*=pe,gt*=pe,qt*=pe),dt.set(ut,gt,qt,pe),j.equals(dt)===!1&&(s.clearColor(ut,gt,qt,pe),j.copy(dt))},reset:function(){L=!1,q=null,j.set(-1,0,0,0)}}}function n(){let L=!1,dt=!1,q=null,j=null,ut=null;return{setReversed:function(gt){if(dt!==gt){let qt=t.get("EXT_clip_control");dt?qt.clipControlEXT(qt.LOWER_LEFT_EXT,qt.ZERO_TO_ONE_EXT):qt.clipControlEXT(qt.LOWER_LEFT_EXT,qt.NEGATIVE_ONE_TO_ONE_EXT);let pe=ut;ut=null,this.setClear(pe)}dt=gt},getReversed:function(){return dt},setTest:function(gt){gt?st(s.DEPTH_TEST):Ct(s.DEPTH_TEST)},setMask:function(gt){q!==gt&&!L&&(s.depthMask(gt),q=gt)},setFunc:function(gt){if(dt&&(gt=Pw[gt]),j!==gt){switch(gt){case cf:s.depthFunc(s.NEVER);break;case hf:s.depthFunc(s.ALWAYS);break;case uf:s.depthFunc(s.LESS);break;case Ao:s.depthFunc(s.LEQUAL);break;case ff:s.depthFunc(s.EQUAL);break;case df:s.depthFunc(s.GEQUAL);break;case pf:s.depthFunc(s.GREATER);break;case mf:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}j=gt}},setLocked:function(gt){L=gt},setClear:function(gt){ut!==gt&&(dt&&(gt=1-gt),s.clearDepth(gt),ut=gt)},reset:function(){L=!1,q=null,j=null,ut=null,dt=!1}}}function i(){let L=!1,dt=null,q=null,j=null,ut=null,gt=null,qt=null,pe=null,ve=null;return{setTest:function(pt){L||(pt?st(s.STENCIL_TEST):Ct(s.STENCIL_TEST))},setMask:function(pt){dt!==pt&&!L&&(s.stencilMask(pt),dt=pt)},setFunc:function(pt,It,ee){(q!==pt||j!==It||ut!==ee)&&(s.stencilFunc(pt,It,ee),q=pt,j=It,ut=ee)},setOp:function(pt,It,ee){(gt!==pt||qt!==It||pe!==ee)&&(s.stencilOp(pt,It,ee),gt=pt,qt=It,pe=ee)},setLocked:function(pt){L=pt},setClear:function(pt){ve!==pt&&(s.clearStencil(pt),ve=pt)},reset:function(){L=!1,dt=null,q=null,j=null,ut=null,gt=null,qt=null,pe=null,ve=null}}}let r=new e,o=new n,a=new i,l=new WeakMap,c=new WeakMap,h={},u={},f=new WeakMap,d=[],_=null,g=!1,m=null,p=null,S=null,M=null,x=null,A=null,E=null,T=new Dt(0,0,0),R=0,y=!1,v=null,P=null,U=null,z=null,V=null,$=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS),X=!1,Y=0,W=s.getParameter(s.VERSION);W.indexOf("WebGL")!==-1?(Y=parseFloat(/^WebGL (\d)/.exec(W)[1]),X=Y>=1):W.indexOf("OpenGL ES")!==-1&&(Y=parseFloat(/^OpenGL ES (\d)/.exec(W)[1]),X=Y>=2);let it=null,I={},ft=s.getParameter(s.SCISSOR_BOX),Wt=s.getParameter(s.VIEWPORT),Ot=new Le().fromArray(ft),Z=new Le().fromArray(Wt);function nt(L,dt,q,j){let ut=new Uint8Array(4),gt=s.createTexture();s.bindTexture(L,gt),s.texParameteri(L,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(L,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let qt=0;qt<q;qt++)L===s.TEXTURE_3D||L===s.TEXTURE_2D_ARRAY?s.texImage3D(dt,0,s.RGBA,1,1,j,0,s.RGBA,s.UNSIGNED_BYTE,ut):s.texImage2D(dt+qt,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,ut);return gt}let yt={};yt[s.TEXTURE_2D]=nt(s.TEXTURE_2D,s.TEXTURE_2D,1),yt[s.TEXTURE_CUBE_MAP]=nt(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),yt[s.TEXTURE_2D_ARRAY]=nt(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),yt[s.TEXTURE_3D]=nt(s.TEXTURE_3D,s.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),st(s.DEPTH_TEST),o.setFunc(Ao),Zt(!1),H(jm),st(s.CULL_FACE),N(Vi);function st(L){h[L]!==!0&&(s.enable(L),h[L]=!0)}function Ct(L){h[L]!==!1&&(s.disable(L),h[L]=!1)}function Ut(L,dt){return u[L]!==dt?(s.bindFramebuffer(L,dt),u[L]=dt,L===s.DRAW_FRAMEBUFFER&&(u[s.FRAMEBUFFER]=dt),L===s.FRAMEBUFFER&&(u[s.DRAW_FRAMEBUFFER]=dt),!0):!1}function Qt(L,dt){let q=d,j=!1;if(L){q=f.get(dt),q===void 0&&(q=[],f.set(dt,q));let ut=L.textures;if(q.length!==ut.length||q[0]!==s.COLOR_ATTACHMENT0){for(let gt=0,qt=ut.length;gt<qt;gt++)q[gt]=s.COLOR_ATTACHMENT0+gt;q.length=ut.length,j=!0}}else q[0]!==s.BACK&&(q[0]=s.BACK,j=!0);j&&s.drawBuffers(q)}function se(L){return _!==L?(s.useProgram(L),_=L,!0):!1}let Yt={[Sr]:s.FUNC_ADD,[dv]:s.FUNC_SUBTRACT,[pv]:s.FUNC_REVERSE_SUBTRACT};Yt[mv]=s.MIN,Yt[gv]=s.MAX;let kt={[_v]:s.ZERO,[xv]:s.ONE,[vv]:s.SRC_COLOR,[af]:s.SRC_ALPHA,[Tv]:s.SRC_ALPHA_SATURATE,[bv]:s.DST_COLOR,[Mv]:s.DST_ALPHA,[yv]:s.ONE_MINUS_SRC_COLOR,[lf]:s.ONE_MINUS_SRC_ALPHA,[wv]:s.ONE_MINUS_DST_COLOR,[Sv]:s.ONE_MINUS_DST_ALPHA,[Ev]:s.CONSTANT_COLOR,[Av]:s.ONE_MINUS_CONSTANT_COLOR,[Cv]:s.CONSTANT_ALPHA,[Rv]:s.ONE_MINUS_CONSTANT_ALPHA};function N(L,dt,q,j,ut,gt,qt,pe,ve,pt){if(L===Vi){g===!0&&(Ct(s.BLEND),g=!1);return}if(g===!1&&(st(s.BLEND),g=!0),L!==fv){if(L!==m||pt!==y){if((p!==Sr||x!==Sr)&&(s.blendEquation(s.FUNC_ADD),p=Sr,x=Sr),pt)switch(L){case bo:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case xi:s.blendFunc(s.ONE,s.ONE);break;case tg:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case eg:s.blendFuncSeparate(s.ZERO,s.SRC_COLOR,s.ZERO,s.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",L);break}else switch(L){case bo:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case xi:s.blendFunc(s.SRC_ALPHA,s.ONE);break;case tg:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case eg:s.blendFunc(s.ZERO,s.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",L);break}S=null,M=null,A=null,E=null,T.set(0,0,0),R=0,m=L,y=pt}return}ut=ut||dt,gt=gt||q,qt=qt||j,(dt!==p||ut!==x)&&(s.blendEquationSeparate(Yt[dt],Yt[ut]),p=dt,x=ut),(q!==S||j!==M||gt!==A||qt!==E)&&(s.blendFuncSeparate(kt[q],kt[j],kt[gt],kt[qt]),S=q,M=j,A=gt,E=qt),(pe.equals(T)===!1||ve!==R)&&(s.blendColor(pe.r,pe.g,pe.b,ve),T.copy(pe),R=ve),m=L,y=!1}function Me(L,dt){L.side===oi?Ct(s.CULL_FACE):st(s.CULL_FACE);let q=L.side===$n;dt&&(q=!q),Zt(q),L.blending===bo&&L.transparent===!1?N(Vi):N(L.blending,L.blendEquation,L.blendSrc,L.blendDst,L.blendEquationAlpha,L.blendSrcAlpha,L.blendDstAlpha,L.blendColor,L.blendAlpha,L.premultipliedAlpha),o.setFunc(L.depthFunc),o.setTest(L.depthTest),o.setMask(L.depthWrite),r.setMask(L.colorWrite);let j=L.stencilWrite;a.setTest(j),j&&(a.setMask(L.stencilWriteMask),a.setFunc(L.stencilFunc,L.stencilRef,L.stencilFuncMask),a.setOp(L.stencilFail,L.stencilZFail,L.stencilZPass)),fe(L.polygonOffset,L.polygonOffsetFactor,L.polygonOffsetUnits),L.alphaToCoverage===!0?st(s.SAMPLE_ALPHA_TO_COVERAGE):Ct(s.SAMPLE_ALPHA_TO_COVERAGE)}function Zt(L){v!==L&&(L?s.frontFace(s.CW):s.frontFace(s.CCW),v=L)}function H(L){L!==cv?(st(s.CULL_FACE),L!==P&&(L===jm?s.cullFace(s.BACK):L===hv?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):Ct(s.CULL_FACE),P=L}function Rt(L){L!==U&&(X&&s.lineWidth(L),U=L)}function fe(L,dt,q){L?(st(s.POLYGON_OFFSET_FILL),(z!==dt||V!==q)&&(s.polygonOffset(dt,q),z=dt,V=q)):Ct(s.POLYGON_OFFSET_FILL)}function Nt(L){L?st(s.SCISSOR_TEST):Ct(s.SCISSOR_TEST)}function C(L){L===void 0&&(L=s.TEXTURE0+$-1),it!==L&&(s.activeTexture(L),it=L)}function b(L,dt,q){q===void 0&&(it===null?q=s.TEXTURE0+$-1:q=it);let j=I[q];j===void 0&&(j={type:void 0,texture:void 0},I[q]=j),(j.type!==L||j.texture!==dt)&&(it!==q&&(s.activeTexture(q),it=q),s.bindTexture(L,dt||yt[L]),j.type=L,j.texture=dt)}function G(){let L=I[it];L!==void 0&&L.type!==void 0&&(s.bindTexture(L.type,null),L.type=void 0,L.texture=void 0)}function tt(){try{s.compressedTexImage2D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function Q(){try{s.compressedTexImage3D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function K(){try{s.texSubImage2D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function _t(){try{s.texSubImage3D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function ht(){try{s.compressedTexSubImage2D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function xt(){try{s.compressedTexSubImage3D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function Jt(){try{s.texStorage2D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function rt(){try{s.texStorage3D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function ct(){try{s.texImage2D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function Vt(){try{s.texImage3D.apply(s,arguments)}catch(L){console.error("THREE.WebGLState:",L)}}function Bt(L){Ot.equals(L)===!1&&(s.scissor(L.x,L.y,L.z,L.w),Ot.copy(L))}function wt(L){Z.equals(L)===!1&&(s.viewport(L.x,L.y,L.z,L.w),Z.copy(L))}function te(L,dt){let q=c.get(dt);q===void 0&&(q=new WeakMap,c.set(dt,q));let j=q.get(L);j===void 0&&(j=s.getUniformBlockIndex(dt,L.name),q.set(L,j))}function zt(L,dt){let j=c.get(dt).get(L);l.get(dt)!==j&&(s.uniformBlockBinding(dt,j,L.__bindingPointIndex),l.set(dt,j))}function de(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),o.setReversed(!1),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),h={},it=null,I={},u={},f=new WeakMap,d=[],_=null,g=!1,m=null,p=null,S=null,M=null,x=null,A=null,E=null,T=new Dt(0,0,0),R=0,y=!1,v=null,P=null,U=null,z=null,V=null,Ot.set(0,0,s.canvas.width,s.canvas.height),Z.set(0,0,s.canvas.width,s.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:st,disable:Ct,bindFramebuffer:Ut,drawBuffers:Qt,useProgram:se,setBlending:N,setMaterial:Me,setFlipSided:Zt,setCullFace:H,setLineWidth:Rt,setPolygonOffset:fe,setScissorTest:Nt,activeTexture:C,bindTexture:b,unbindTexture:G,compressedTexImage2D:tt,compressedTexImage3D:Q,texImage2D:ct,texImage3D:Vt,updateUBOMapping:te,uniformBlockBinding:zt,texStorage2D:Jt,texStorage3D:rt,texSubImage2D:K,texSubImage3D:_t,compressedTexSubImage2D:ht,compressedTexSubImage3D:xt,scissor:Bt,viewport:wt,reset:de}}function Jg(s,t,e,n){let i=Lw(n);switch(e){case m_:return s*t;case __:return s*t;case x_:return s*t*2;case v_:return s*t/i.components*i.byteLength;case Nd:return s*t/i.components*i.byteLength;case y_:return s*t*2/i.components*i.byteLength;case Od:return s*t*2/i.components*i.byteLength;case g_:return s*t*3/i.components*i.byteLength;case Ei:return s*t*4/i.components*i.byteLength;case Fd:return s*t*4/i.components*i.byteLength;case vc:case yc:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case Mc:case Sc:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case Mf:case bf:return Math.max(s,16)*Math.max(t,8)/4;case yf:case Sf:return Math.max(s,8)*Math.max(t,8)/2;case wf:case Tf:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case Ef:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case Af:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case Cf:return Math.floor((s+4)/5)*Math.floor((t+3)/4)*16;case Rf:return Math.floor((s+4)/5)*Math.floor((t+4)/5)*16;case Pf:return Math.floor((s+5)/6)*Math.floor((t+4)/5)*16;case If:return Math.floor((s+5)/6)*Math.floor((t+5)/6)*16;case Lf:return Math.floor((s+7)/8)*Math.floor((t+4)/5)*16;case Df:return Math.floor((s+7)/8)*Math.floor((t+5)/6)*16;case Uf:return Math.floor((s+7)/8)*Math.floor((t+7)/8)*16;case Nf:return Math.floor((s+9)/10)*Math.floor((t+4)/5)*16;case Of:return Math.floor((s+9)/10)*Math.floor((t+5)/6)*16;case Ff:return Math.floor((s+9)/10)*Math.floor((t+7)/8)*16;case Bf:return Math.floor((s+9)/10)*Math.floor((t+9)/10)*16;case kf:return Math.floor((s+11)/12)*Math.floor((t+9)/10)*16;case zf:return Math.floor((s+11)/12)*Math.floor((t+11)/12)*16;case bc:case Hf:case Vf:return Math.ceil(s/4)*Math.ceil(t/4)*16;case M_:case Gf:return Math.ceil(s/4)*Math.ceil(t/4)*8;case Wf:case Xf:return Math.ceil(s/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function Lw(s){switch(s){case ps:case f_:return{byteLength:1,components:1};case Na:case d_:case Pi:return{byteLength:2,components:1};case Dd:case Ud:return{byteLength:2,components:4};case Er:case Ld:case us:return{byteLength:4,components:1};case p_:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${s}.`)}function Dw(s,t,e,n,i,r,o){let a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Xt,h=new WeakMap,u,f=new WeakMap,d=!1;try{d=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function _(C,b){return d?new OffscreenCanvas(C,b):Cc("canvas")}function g(C,b,G){let tt=1,Q=Nt(C);if((Q.width>G||Q.height>G)&&(tt=G/Math.max(Q.width,Q.height)),tt<1)if(typeof HTMLImageElement<"u"&&C instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&C instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&C instanceof ImageBitmap||typeof VideoFrame<"u"&&C instanceof VideoFrame){let K=Math.floor(tt*Q.width),_t=Math.floor(tt*Q.height);u===void 0&&(u=_(K,_t));let ht=b?_(K,_t):u;return ht.width=K,ht.height=_t,ht.getContext("2d").drawImage(C,0,0,K,_t),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+Q.width+"x"+Q.height+") to ("+K+"x"+_t+")."),ht}else return"data"in C&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+Q.width+"x"+Q.height+")."),C;return C}function m(C){return C.generateMipmaps}function p(C){s.generateMipmap(C)}function S(C){return C.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:C.isWebGL3DRenderTarget?s.TEXTURE_3D:C.isWebGLArrayRenderTarget||C.isCompressedArrayTexture?s.TEXTURE_2D_ARRAY:s.TEXTURE_2D}function M(C,b,G,tt,Q=!1){if(C!==null){if(s[C]!==void 0)return s[C];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+C+"'")}let K=b;if(b===s.RED&&(G===s.FLOAT&&(K=s.R32F),G===s.HALF_FLOAT&&(K=s.R16F),G===s.UNSIGNED_BYTE&&(K=s.R8)),b===s.RED_INTEGER&&(G===s.UNSIGNED_BYTE&&(K=s.R8UI),G===s.UNSIGNED_SHORT&&(K=s.R16UI),G===s.UNSIGNED_INT&&(K=s.R32UI),G===s.BYTE&&(K=s.R8I),G===s.SHORT&&(K=s.R16I),G===s.INT&&(K=s.R32I)),b===s.RG&&(G===s.FLOAT&&(K=s.RG32F),G===s.HALF_FLOAT&&(K=s.RG16F),G===s.UNSIGNED_BYTE&&(K=s.RG8)),b===s.RG_INTEGER&&(G===s.UNSIGNED_BYTE&&(K=s.RG8UI),G===s.UNSIGNED_SHORT&&(K=s.RG16UI),G===s.UNSIGNED_INT&&(K=s.RG32UI),G===s.BYTE&&(K=s.RG8I),G===s.SHORT&&(K=s.RG16I),G===s.INT&&(K=s.RG32I)),b===s.RGB_INTEGER&&(G===s.UNSIGNED_BYTE&&(K=s.RGB8UI),G===s.UNSIGNED_SHORT&&(K=s.RGB16UI),G===s.UNSIGNED_INT&&(K=s.RGB32UI),G===s.BYTE&&(K=s.RGB8I),G===s.SHORT&&(K=s.RGB16I),G===s.INT&&(K=s.RGB32I)),b===s.RGBA_INTEGER&&(G===s.UNSIGNED_BYTE&&(K=s.RGBA8UI),G===s.UNSIGNED_SHORT&&(K=s.RGBA16UI),G===s.UNSIGNED_INT&&(K=s.RGBA32UI),G===s.BYTE&&(K=s.RGBA8I),G===s.SHORT&&(K=s.RGBA16I),G===s.INT&&(K=s.RGBA32I)),b===s.RGB&&G===s.UNSIGNED_INT_5_9_9_9_REV&&(K=s.RGB9_E5),b===s.RGBA){let _t=Q?ih:_e.getTransfer(tt);G===s.FLOAT&&(K=s.RGBA32F),G===s.HALF_FLOAT&&(K=s.RGBA16F),G===s.UNSIGNED_BYTE&&(K=_t===Ae?s.SRGB8_ALPHA8:s.RGBA8),G===s.UNSIGNED_SHORT_4_4_4_4&&(K=s.RGBA4),G===s.UNSIGNED_SHORT_5_5_5_1&&(K=s.RGB5_A1)}return(K===s.R16F||K===s.R32F||K===s.RG16F||K===s.RG32F||K===s.RGBA16F||K===s.RGBA32F)&&t.get("EXT_color_buffer_float"),K}function x(C,b){let G;return C?b===null||b===Er||b===Po?G=s.DEPTH24_STENCIL8:b===us?G=s.DEPTH32F_STENCIL8:b===Na&&(G=s.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):b===null||b===Er||b===Po?G=s.DEPTH_COMPONENT24:b===us?G=s.DEPTH_COMPONENT32F:b===Na&&(G=s.DEPTH_COMPONENT16),G}function A(C,b){return m(C)===!0||C.isFramebufferTexture&&C.minFilter!==Ci&&C.minFilter!==Hi?Math.log2(Math.max(b.width,b.height))+1:C.mipmaps!==void 0&&C.mipmaps.length>0?C.mipmaps.length:C.isCompressedTexture&&Array.isArray(C.image)?b.mipmaps.length:1}function E(C){let b=C.target;b.removeEventListener("dispose",E),R(b),b.isVideoTexture&&h.delete(b)}function T(C){let b=C.target;b.removeEventListener("dispose",T),v(b)}function R(C){let b=n.get(C);if(b.__webglInit===void 0)return;let G=C.source,tt=f.get(G);if(tt){let Q=tt[b.__cacheKey];Q.usedTimes--,Q.usedTimes===0&&y(C),Object.keys(tt).length===0&&f.delete(G)}n.remove(C)}function y(C){let b=n.get(C);s.deleteTexture(b.__webglTexture);let G=C.source,tt=f.get(G);delete tt[b.__cacheKey],o.memory.textures--}function v(C){let b=n.get(C);if(C.depthTexture&&(C.depthTexture.dispose(),n.remove(C.depthTexture)),C.isWebGLCubeRenderTarget)for(let tt=0;tt<6;tt++){if(Array.isArray(b.__webglFramebuffer[tt]))for(let Q=0;Q<b.__webglFramebuffer[tt].length;Q++)s.deleteFramebuffer(b.__webglFramebuffer[tt][Q]);else s.deleteFramebuffer(b.__webglFramebuffer[tt]);b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer[tt])}else{if(Array.isArray(b.__webglFramebuffer))for(let tt=0;tt<b.__webglFramebuffer.length;tt++)s.deleteFramebuffer(b.__webglFramebuffer[tt]);else s.deleteFramebuffer(b.__webglFramebuffer);if(b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer),b.__webglMultisampledFramebuffer&&s.deleteFramebuffer(b.__webglMultisampledFramebuffer),b.__webglColorRenderbuffer)for(let tt=0;tt<b.__webglColorRenderbuffer.length;tt++)b.__webglColorRenderbuffer[tt]&&s.deleteRenderbuffer(b.__webglColorRenderbuffer[tt]);b.__webglDepthRenderbuffer&&s.deleteRenderbuffer(b.__webglDepthRenderbuffer)}let G=C.textures;for(let tt=0,Q=G.length;tt<Q;tt++){let K=n.get(G[tt]);K.__webglTexture&&(s.deleteTexture(K.__webglTexture),o.memory.textures--),n.remove(G[tt])}n.remove(C)}let P=0;function U(){P=0}function z(){let C=P;return C>=i.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+C+" texture units while this GPU supports only "+i.maxTextures),P+=1,C}function V(C){let b=[];return b.push(C.wrapS),b.push(C.wrapT),b.push(C.wrapR||0),b.push(C.magFilter),b.push(C.minFilter),b.push(C.anisotropy),b.push(C.internalFormat),b.push(C.format),b.push(C.type),b.push(C.generateMipmaps),b.push(C.premultiplyAlpha),b.push(C.flipY),b.push(C.unpackAlignment),b.push(C.colorSpace),b.join()}function $(C,b){let G=n.get(C);if(C.isVideoTexture&&Rt(C),C.isRenderTargetTexture===!1&&C.version>0&&G.__version!==C.version){let tt=C.image;if(tt===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(tt.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{Z(G,C,b);return}}e.bindTexture(s.TEXTURE_2D,G.__webglTexture,s.TEXTURE0+b)}function X(C,b){let G=n.get(C);if(C.version>0&&G.__version!==C.version){Z(G,C,b);return}e.bindTexture(s.TEXTURE_2D_ARRAY,G.__webglTexture,s.TEXTURE0+b)}function Y(C,b){let G=n.get(C);if(C.version>0&&G.__version!==C.version){Z(G,C,b);return}e.bindTexture(s.TEXTURE_3D,G.__webglTexture,s.TEXTURE0+b)}function W(C,b){let G=n.get(C);if(C.version>0&&G.__version!==C.version){nt(G,C,b);return}e.bindTexture(s.TEXTURE_CUBE_MAP,G.__webglTexture,s.TEXTURE0+b)}let it={[xf]:s.REPEAT,[wr]:s.CLAMP_TO_EDGE,[vf]:s.MIRRORED_REPEAT},I={[Ci]:s.NEAREST,[Dv]:s.NEAREST_MIPMAP_NEAREST,[Hl]:s.NEAREST_MIPMAP_LINEAR,[Hi]:s.LINEAR,[Eu]:s.LINEAR_MIPMAP_NEAREST,[Tr]:s.LINEAR_MIPMAP_LINEAR},ft={[Fv]:s.NEVER,[Gv]:s.ALWAYS,[Bv]:s.LESS,[b_]:s.LEQUAL,[kv]:s.EQUAL,[Vv]:s.GEQUAL,[zv]:s.GREATER,[Hv]:s.NOTEQUAL};function Wt(C,b){if(b.type===us&&t.has("OES_texture_float_linear")===!1&&(b.magFilter===Hi||b.magFilter===Eu||b.magFilter===Hl||b.magFilter===Tr||b.minFilter===Hi||b.minFilter===Eu||b.minFilter===Hl||b.minFilter===Tr)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),s.texParameteri(C,s.TEXTURE_WRAP_S,it[b.wrapS]),s.texParameteri(C,s.TEXTURE_WRAP_T,it[b.wrapT]),(C===s.TEXTURE_3D||C===s.TEXTURE_2D_ARRAY)&&s.texParameteri(C,s.TEXTURE_WRAP_R,it[b.wrapR]),s.texParameteri(C,s.TEXTURE_MAG_FILTER,I[b.magFilter]),s.texParameteri(C,s.TEXTURE_MIN_FILTER,I[b.minFilter]),b.compareFunction&&(s.texParameteri(C,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(C,s.TEXTURE_COMPARE_FUNC,ft[b.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(b.magFilter===Ci||b.minFilter!==Hl&&b.minFilter!==Tr||b.type===us&&t.has("OES_texture_float_linear")===!1)return;if(b.anisotropy>1||n.get(b).__currentAnisotropy){let G=t.get("EXT_texture_filter_anisotropic");s.texParameterf(C,G.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(b.anisotropy,i.getMaxAnisotropy())),n.get(b).__currentAnisotropy=b.anisotropy}}}function Ot(C,b){let G=!1;C.__webglInit===void 0&&(C.__webglInit=!0,b.addEventListener("dispose",E));let tt=b.source,Q=f.get(tt);Q===void 0&&(Q={},f.set(tt,Q));let K=V(b);if(K!==C.__cacheKey){Q[K]===void 0&&(Q[K]={texture:s.createTexture(),usedTimes:0},o.memory.textures++,G=!0),Q[K].usedTimes++;let _t=Q[C.__cacheKey];_t!==void 0&&(Q[C.__cacheKey].usedTimes--,_t.usedTimes===0&&y(b)),C.__cacheKey=K,C.__webglTexture=Q[K].texture}return G}function Z(C,b,G){let tt=s.TEXTURE_2D;(b.isDataArrayTexture||b.isCompressedArrayTexture)&&(tt=s.TEXTURE_2D_ARRAY),b.isData3DTexture&&(tt=s.TEXTURE_3D);let Q=Ot(C,b),K=b.source;e.bindTexture(tt,C.__webglTexture,s.TEXTURE0+G);let _t=n.get(K);if(K.version!==_t.__version||Q===!0){e.activeTexture(s.TEXTURE0+G);let ht=_e.getPrimaries(_e.workingColorSpace),xt=b.colorSpace===Hs?null:_e.getPrimaries(b.colorSpace),Jt=b.colorSpace===Hs||ht===xt?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,Jt);let rt=g(b.image,!1,i.maxTextureSize);rt=fe(b,rt);let ct=r.convert(b.format,b.colorSpace),Vt=r.convert(b.type),Bt=M(b.internalFormat,ct,Vt,b.colorSpace,b.isVideoTexture);Wt(tt,b);let wt,te=b.mipmaps,zt=b.isVideoTexture!==!0,de=_t.__version===void 0||Q===!0,L=K.dataReady,dt=A(b,rt);if(b.isDepthTexture)Bt=x(b.format===Io,b.type),de&&(zt?e.texStorage2D(s.TEXTURE_2D,1,Bt,rt.width,rt.height):e.texImage2D(s.TEXTURE_2D,0,Bt,rt.width,rt.height,0,ct,Vt,null));else if(b.isDataTexture)if(te.length>0){zt&&de&&e.texStorage2D(s.TEXTURE_2D,dt,Bt,te[0].width,te[0].height);for(let q=0,j=te.length;q<j;q++)wt=te[q],zt?L&&e.texSubImage2D(s.TEXTURE_2D,q,0,0,wt.width,wt.height,ct,Vt,wt.data):e.texImage2D(s.TEXTURE_2D,q,Bt,wt.width,wt.height,0,ct,Vt,wt.data);b.generateMipmaps=!1}else zt?(de&&e.texStorage2D(s.TEXTURE_2D,dt,Bt,rt.width,rt.height),L&&e.texSubImage2D(s.TEXTURE_2D,0,0,0,rt.width,rt.height,ct,Vt,rt.data)):e.texImage2D(s.TEXTURE_2D,0,Bt,rt.width,rt.height,0,ct,Vt,rt.data);else if(b.isCompressedTexture)if(b.isCompressedArrayTexture){zt&&de&&e.texStorage3D(s.TEXTURE_2D_ARRAY,dt,Bt,te[0].width,te[0].height,rt.depth);for(let q=0,j=te.length;q<j;q++)if(wt=te[q],b.format!==Ei)if(ct!==null)if(zt){if(L)if(b.layerUpdates.size>0){let ut=Jg(wt.width,wt.height,b.format,b.type);for(let gt of b.layerUpdates){let qt=wt.data.subarray(gt*ut/wt.data.BYTES_PER_ELEMENT,(gt+1)*ut/wt.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,q,0,0,gt,wt.width,wt.height,1,ct,qt)}b.clearLayerUpdates()}else e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,q,0,0,0,wt.width,wt.height,rt.depth,ct,wt.data)}else e.compressedTexImage3D(s.TEXTURE_2D_ARRAY,q,Bt,wt.width,wt.height,rt.depth,0,wt.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else zt?L&&e.texSubImage3D(s.TEXTURE_2D_ARRAY,q,0,0,0,wt.width,wt.height,rt.depth,ct,Vt,wt.data):e.texImage3D(s.TEXTURE_2D_ARRAY,q,Bt,wt.width,wt.height,rt.depth,0,ct,Vt,wt.data)}else{zt&&de&&e.texStorage2D(s.TEXTURE_2D,dt,Bt,te[0].width,te[0].height);for(let q=0,j=te.length;q<j;q++)wt=te[q],b.format!==Ei?ct!==null?zt?L&&e.compressedTexSubImage2D(s.TEXTURE_2D,q,0,0,wt.width,wt.height,ct,wt.data):e.compressedTexImage2D(s.TEXTURE_2D,q,Bt,wt.width,wt.height,0,wt.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):zt?L&&e.texSubImage2D(s.TEXTURE_2D,q,0,0,wt.width,wt.height,ct,Vt,wt.data):e.texImage2D(s.TEXTURE_2D,q,Bt,wt.width,wt.height,0,ct,Vt,wt.data)}else if(b.isDataArrayTexture)if(zt){if(de&&e.texStorage3D(s.TEXTURE_2D_ARRAY,dt,Bt,rt.width,rt.height,rt.depth),L)if(b.layerUpdates.size>0){let q=Jg(rt.width,rt.height,b.format,b.type);for(let j of b.layerUpdates){let ut=rt.data.subarray(j*q/rt.data.BYTES_PER_ELEMENT,(j+1)*q/rt.data.BYTES_PER_ELEMENT);e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,j,rt.width,rt.height,1,ct,Vt,ut)}b.clearLayerUpdates()}else e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,rt.width,rt.height,rt.depth,ct,Vt,rt.data)}else e.texImage3D(s.TEXTURE_2D_ARRAY,0,Bt,rt.width,rt.height,rt.depth,0,ct,Vt,rt.data);else if(b.isData3DTexture)zt?(de&&e.texStorage3D(s.TEXTURE_3D,dt,Bt,rt.width,rt.height,rt.depth),L&&e.texSubImage3D(s.TEXTURE_3D,0,0,0,0,rt.width,rt.height,rt.depth,ct,Vt,rt.data)):e.texImage3D(s.TEXTURE_3D,0,Bt,rt.width,rt.height,rt.depth,0,ct,Vt,rt.data);else if(b.isFramebufferTexture){if(de)if(zt)e.texStorage2D(s.TEXTURE_2D,dt,Bt,rt.width,rt.height);else{let q=rt.width,j=rt.height;for(let ut=0;ut<dt;ut++)e.texImage2D(s.TEXTURE_2D,ut,Bt,q,j,0,ct,Vt,null),q>>=1,j>>=1}}else if(te.length>0){if(zt&&de){let q=Nt(te[0]);e.texStorage2D(s.TEXTURE_2D,dt,Bt,q.width,q.height)}for(let q=0,j=te.length;q<j;q++)wt=te[q],zt?L&&e.texSubImage2D(s.TEXTURE_2D,q,0,0,ct,Vt,wt):e.texImage2D(s.TEXTURE_2D,q,Bt,ct,Vt,wt);b.generateMipmaps=!1}else if(zt){if(de){let q=Nt(rt);e.texStorage2D(s.TEXTURE_2D,dt,Bt,q.width,q.height)}L&&e.texSubImage2D(s.TEXTURE_2D,0,0,0,ct,Vt,rt)}else e.texImage2D(s.TEXTURE_2D,0,Bt,ct,Vt,rt);m(b)&&p(tt),_t.__version=K.version,b.onUpdate&&b.onUpdate(b)}C.__version=b.version}function nt(C,b,G){if(b.image.length!==6)return;let tt=Ot(C,b),Q=b.source;e.bindTexture(s.TEXTURE_CUBE_MAP,C.__webglTexture,s.TEXTURE0+G);let K=n.get(Q);if(Q.version!==K.__version||tt===!0){e.activeTexture(s.TEXTURE0+G);let _t=_e.getPrimaries(_e.workingColorSpace),ht=b.colorSpace===Hs?null:_e.getPrimaries(b.colorSpace),xt=b.colorSpace===Hs||_t===ht?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,xt);let Jt=b.isCompressedTexture||b.image[0].isCompressedTexture,rt=b.image[0]&&b.image[0].isDataTexture,ct=[];for(let j=0;j<6;j++)!Jt&&!rt?ct[j]=g(b.image[j],!0,i.maxCubemapSize):ct[j]=rt?b.image[j].image:b.image[j],ct[j]=fe(b,ct[j]);let Vt=ct[0],Bt=r.convert(b.format,b.colorSpace),wt=r.convert(b.type),te=M(b.internalFormat,Bt,wt,b.colorSpace),zt=b.isVideoTexture!==!0,de=K.__version===void 0||tt===!0,L=Q.dataReady,dt=A(b,Vt);Wt(s.TEXTURE_CUBE_MAP,b);let q;if(Jt){zt&&de&&e.texStorage2D(s.TEXTURE_CUBE_MAP,dt,te,Vt.width,Vt.height);for(let j=0;j<6;j++){q=ct[j].mipmaps;for(let ut=0;ut<q.length;ut++){let gt=q[ut];b.format!==Ei?Bt!==null?zt?L&&e.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,ut,0,0,gt.width,gt.height,Bt,gt.data):e.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,ut,te,gt.width,gt.height,0,gt.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):zt?L&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,ut,0,0,gt.width,gt.height,Bt,wt,gt.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,ut,te,gt.width,gt.height,0,Bt,wt,gt.data)}}}else{if(q=b.mipmaps,zt&&de){q.length>0&&dt++;let j=Nt(ct[0]);e.texStorage2D(s.TEXTURE_CUBE_MAP,dt,te,j.width,j.height)}for(let j=0;j<6;j++)if(rt){zt?L&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,0,0,0,ct[j].width,ct[j].height,Bt,wt,ct[j].data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,0,te,ct[j].width,ct[j].height,0,Bt,wt,ct[j].data);for(let ut=0;ut<q.length;ut++){let qt=q[ut].image[j].image;zt?L&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,ut+1,0,0,qt.width,qt.height,Bt,wt,qt.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,ut+1,te,qt.width,qt.height,0,Bt,wt,qt.data)}}else{zt?L&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,0,0,0,Bt,wt,ct[j]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,0,te,Bt,wt,ct[j]);for(let ut=0;ut<q.length;ut++){let gt=q[ut];zt?L&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,ut+1,0,0,Bt,wt,gt.image[j]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+j,ut+1,te,Bt,wt,gt.image[j])}}}m(b)&&p(s.TEXTURE_CUBE_MAP),K.__version=Q.version,b.onUpdate&&b.onUpdate(b)}C.__version=b.version}function yt(C,b,G,tt,Q,K){let _t=r.convert(G.format,G.colorSpace),ht=r.convert(G.type),xt=M(G.internalFormat,_t,ht,G.colorSpace),Jt=n.get(b),rt=n.get(G);if(rt.__renderTarget=b,!Jt.__hasExternalTextures){let ct=Math.max(1,b.width>>K),Vt=Math.max(1,b.height>>K);Q===s.TEXTURE_3D||Q===s.TEXTURE_2D_ARRAY?e.texImage3D(Q,K,xt,ct,Vt,b.depth,0,_t,ht,null):e.texImage2D(Q,K,xt,ct,Vt,0,_t,ht,null)}e.bindFramebuffer(s.FRAMEBUFFER,C),H(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,tt,Q,rt.__webglTexture,0,Zt(b)):(Q===s.TEXTURE_2D||Q>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&Q<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,tt,Q,rt.__webglTexture,K),e.bindFramebuffer(s.FRAMEBUFFER,null)}function st(C,b,G){if(s.bindRenderbuffer(s.RENDERBUFFER,C),b.depthBuffer){let tt=b.depthTexture,Q=tt&&tt.isDepthTexture?tt.type:null,K=x(b.stencilBuffer,Q),_t=b.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,ht=Zt(b);H(b)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,ht,K,b.width,b.height):G?s.renderbufferStorageMultisample(s.RENDERBUFFER,ht,K,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,K,b.width,b.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,_t,s.RENDERBUFFER,C)}else{let tt=b.textures;for(let Q=0;Q<tt.length;Q++){let K=tt[Q],_t=r.convert(K.format,K.colorSpace),ht=r.convert(K.type),xt=M(K.internalFormat,_t,ht,K.colorSpace),Jt=Zt(b);G&&H(b)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,Jt,xt,b.width,b.height):H(b)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,Jt,xt,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,xt,b.width,b.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function Ct(C,b){if(b&&b.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(e.bindFramebuffer(s.FRAMEBUFFER,C),!(b.depthTexture&&b.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");let tt=n.get(b.depthTexture);tt.__renderTarget=b,(!tt.__webglTexture||b.depthTexture.image.width!==b.width||b.depthTexture.image.height!==b.height)&&(b.depthTexture.image.width=b.width,b.depthTexture.image.height=b.height,b.depthTexture.needsUpdate=!0),$(b.depthTexture,0);let Q=tt.__webglTexture,K=Zt(b);if(b.depthTexture.format===wo)H(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,Q,0,K):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,Q,0);else if(b.depthTexture.format===Io)H(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,Q,0,K):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,Q,0);else throw new Error("Unknown depthTexture format")}function Ut(C){let b=n.get(C),G=C.isWebGLCubeRenderTarget===!0;if(b.__boundDepthTexture!==C.depthTexture){let tt=C.depthTexture;if(b.__depthDisposeCallback&&b.__depthDisposeCallback(),tt){let Q=()=>{delete b.__boundDepthTexture,delete b.__depthDisposeCallback,tt.removeEventListener("dispose",Q)};tt.addEventListener("dispose",Q),b.__depthDisposeCallback=Q}b.__boundDepthTexture=tt}if(C.depthTexture&&!b.__autoAllocateDepthBuffer){if(G)throw new Error("target.depthTexture not supported in Cube render targets");Ct(b.__webglFramebuffer,C)}else if(G){b.__webglDepthbuffer=[];for(let tt=0;tt<6;tt++)if(e.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer[tt]),b.__webglDepthbuffer[tt]===void 0)b.__webglDepthbuffer[tt]=s.createRenderbuffer(),st(b.__webglDepthbuffer[tt],C,!1);else{let Q=C.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,K=b.__webglDepthbuffer[tt];s.bindRenderbuffer(s.RENDERBUFFER,K),s.framebufferRenderbuffer(s.FRAMEBUFFER,Q,s.RENDERBUFFER,K)}}else if(e.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer),b.__webglDepthbuffer===void 0)b.__webglDepthbuffer=s.createRenderbuffer(),st(b.__webglDepthbuffer,C,!1);else{let tt=C.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,Q=b.__webglDepthbuffer;s.bindRenderbuffer(s.RENDERBUFFER,Q),s.framebufferRenderbuffer(s.FRAMEBUFFER,tt,s.RENDERBUFFER,Q)}e.bindFramebuffer(s.FRAMEBUFFER,null)}function Qt(C,b,G){let tt=n.get(C);b!==void 0&&yt(tt.__webglFramebuffer,C,C.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),G!==void 0&&Ut(C)}function se(C){let b=C.texture,G=n.get(C),tt=n.get(b);C.addEventListener("dispose",T);let Q=C.textures,K=C.isWebGLCubeRenderTarget===!0,_t=Q.length>1;if(_t||(tt.__webglTexture===void 0&&(tt.__webglTexture=s.createTexture()),tt.__version=b.version,o.memory.textures++),K){G.__webglFramebuffer=[];for(let ht=0;ht<6;ht++)if(b.mipmaps&&b.mipmaps.length>0){G.__webglFramebuffer[ht]=[];for(let xt=0;xt<b.mipmaps.length;xt++)G.__webglFramebuffer[ht][xt]=s.createFramebuffer()}else G.__webglFramebuffer[ht]=s.createFramebuffer()}else{if(b.mipmaps&&b.mipmaps.length>0){G.__webglFramebuffer=[];for(let ht=0;ht<b.mipmaps.length;ht++)G.__webglFramebuffer[ht]=s.createFramebuffer()}else G.__webglFramebuffer=s.createFramebuffer();if(_t)for(let ht=0,xt=Q.length;ht<xt;ht++){let Jt=n.get(Q[ht]);Jt.__webglTexture===void 0&&(Jt.__webglTexture=s.createTexture(),o.memory.textures++)}if(C.samples>0&&H(C)===!1){G.__webglMultisampledFramebuffer=s.createFramebuffer(),G.__webglColorRenderbuffer=[],e.bindFramebuffer(s.FRAMEBUFFER,G.__webglMultisampledFramebuffer);for(let ht=0;ht<Q.length;ht++){let xt=Q[ht];G.__webglColorRenderbuffer[ht]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,G.__webglColorRenderbuffer[ht]);let Jt=r.convert(xt.format,xt.colorSpace),rt=r.convert(xt.type),ct=M(xt.internalFormat,Jt,rt,xt.colorSpace,C.isXRRenderTarget===!0),Vt=Zt(C);s.renderbufferStorageMultisample(s.RENDERBUFFER,Vt,ct,C.width,C.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+ht,s.RENDERBUFFER,G.__webglColorRenderbuffer[ht])}s.bindRenderbuffer(s.RENDERBUFFER,null),C.depthBuffer&&(G.__webglDepthRenderbuffer=s.createRenderbuffer(),st(G.__webglDepthRenderbuffer,C,!0)),e.bindFramebuffer(s.FRAMEBUFFER,null)}}if(K){e.bindTexture(s.TEXTURE_CUBE_MAP,tt.__webglTexture),Wt(s.TEXTURE_CUBE_MAP,b);for(let ht=0;ht<6;ht++)if(b.mipmaps&&b.mipmaps.length>0)for(let xt=0;xt<b.mipmaps.length;xt++)yt(G.__webglFramebuffer[ht][xt],C,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+ht,xt);else yt(G.__webglFramebuffer[ht],C,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+ht,0);m(b)&&p(s.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(_t){for(let ht=0,xt=Q.length;ht<xt;ht++){let Jt=Q[ht],rt=n.get(Jt);e.bindTexture(s.TEXTURE_2D,rt.__webglTexture),Wt(s.TEXTURE_2D,Jt),yt(G.__webglFramebuffer,C,Jt,s.COLOR_ATTACHMENT0+ht,s.TEXTURE_2D,0),m(Jt)&&p(s.TEXTURE_2D)}e.unbindTexture()}else{let ht=s.TEXTURE_2D;if((C.isWebGL3DRenderTarget||C.isWebGLArrayRenderTarget)&&(ht=C.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),e.bindTexture(ht,tt.__webglTexture),Wt(ht,b),b.mipmaps&&b.mipmaps.length>0)for(let xt=0;xt<b.mipmaps.length;xt++)yt(G.__webglFramebuffer[xt],C,b,s.COLOR_ATTACHMENT0,ht,xt);else yt(G.__webglFramebuffer,C,b,s.COLOR_ATTACHMENT0,ht,0);m(b)&&p(ht),e.unbindTexture()}C.depthBuffer&&Ut(C)}function Yt(C){let b=C.textures;for(let G=0,tt=b.length;G<tt;G++){let Q=b[G];if(m(Q)){let K=S(C),_t=n.get(Q).__webglTexture;e.bindTexture(K,_t),p(K),e.unbindTexture()}}}let kt=[],N=[];function Me(C){if(C.samples>0){if(H(C)===!1){let b=C.textures,G=C.width,tt=C.height,Q=s.COLOR_BUFFER_BIT,K=C.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,_t=n.get(C),ht=b.length>1;if(ht)for(let xt=0;xt<b.length;xt++)e.bindFramebuffer(s.FRAMEBUFFER,_t.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+xt,s.RENDERBUFFER,null),e.bindFramebuffer(s.FRAMEBUFFER,_t.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+xt,s.TEXTURE_2D,null,0);e.bindFramebuffer(s.READ_FRAMEBUFFER,_t.__webglMultisampledFramebuffer),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,_t.__webglFramebuffer);for(let xt=0;xt<b.length;xt++){if(C.resolveDepthBuffer&&(C.depthBuffer&&(Q|=s.DEPTH_BUFFER_BIT),C.stencilBuffer&&C.resolveStencilBuffer&&(Q|=s.STENCIL_BUFFER_BIT)),ht){s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,_t.__webglColorRenderbuffer[xt]);let Jt=n.get(b[xt]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,Jt,0)}s.blitFramebuffer(0,0,G,tt,0,0,G,tt,Q,s.NEAREST),l===!0&&(kt.length=0,N.length=0,kt.push(s.COLOR_ATTACHMENT0+xt),C.depthBuffer&&C.resolveDepthBuffer===!1&&(kt.push(K),N.push(K),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,N)),s.invalidateFramebuffer(s.READ_FRAMEBUFFER,kt))}if(e.bindFramebuffer(s.READ_FRAMEBUFFER,null),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),ht)for(let xt=0;xt<b.length;xt++){e.bindFramebuffer(s.FRAMEBUFFER,_t.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+xt,s.RENDERBUFFER,_t.__webglColorRenderbuffer[xt]);let Jt=n.get(b[xt]).__webglTexture;e.bindFramebuffer(s.FRAMEBUFFER,_t.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+xt,s.TEXTURE_2D,Jt,0)}e.bindFramebuffer(s.DRAW_FRAMEBUFFER,_t.__webglMultisampledFramebuffer)}else if(C.depthBuffer&&C.resolveDepthBuffer===!1&&l){let b=C.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[b])}}}function Zt(C){return Math.min(i.maxSamples,C.samples)}function H(C){let b=n.get(C);return C.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&b.__useRenderToTexture!==!1}function Rt(C){let b=o.render.frame;h.get(C)!==b&&(h.set(C,b),C.update())}function fe(C,b){let G=C.colorSpace,tt=C.format,Q=C.type;return C.isCompressedTexture===!0||C.isVideoTexture===!0||G!==ko&&G!==Hs&&(_e.getTransfer(G)===Ae?(tt!==Ei||Q!==ps)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",G)),b}function Nt(C){return typeof HTMLImageElement<"u"&&C instanceof HTMLImageElement?(c.width=C.naturalWidth||C.width,c.height=C.naturalHeight||C.height):typeof VideoFrame<"u"&&C instanceof VideoFrame?(c.width=C.displayWidth,c.height=C.displayHeight):(c.width=C.width,c.height=C.height),c}this.allocateTextureUnit=z,this.resetTextureUnits=U,this.setTexture2D=$,this.setTexture2DArray=X,this.setTexture3D=Y,this.setTextureCube=W,this.rebindTextures=Qt,this.setupRenderTarget=se,this.updateRenderTargetMipmap=Yt,this.updateMultisampleRenderTarget=Me,this.setupDepthRenderbuffer=Ut,this.setupFrameBufferTexture=yt,this.useMultisampledRTT=H}function Uw(s,t){function e(n,i=Hs){let r,o=_e.getTransfer(i);if(n===ps)return s.UNSIGNED_BYTE;if(n===Dd)return s.UNSIGNED_SHORT_4_4_4_4;if(n===Ud)return s.UNSIGNED_SHORT_5_5_5_1;if(n===p_)return s.UNSIGNED_INT_5_9_9_9_REV;if(n===f_)return s.BYTE;if(n===d_)return s.SHORT;if(n===Na)return s.UNSIGNED_SHORT;if(n===Ld)return s.INT;if(n===Er)return s.UNSIGNED_INT;if(n===us)return s.FLOAT;if(n===Pi)return s.HALF_FLOAT;if(n===m_)return s.ALPHA;if(n===g_)return s.RGB;if(n===Ei)return s.RGBA;if(n===__)return s.LUMINANCE;if(n===x_)return s.LUMINANCE_ALPHA;if(n===wo)return s.DEPTH_COMPONENT;if(n===Io)return s.DEPTH_STENCIL;if(n===v_)return s.RED;if(n===Nd)return s.RED_INTEGER;if(n===y_)return s.RG;if(n===Od)return s.RG_INTEGER;if(n===Fd)return s.RGBA_INTEGER;if(n===vc||n===yc||n===Mc||n===Sc)if(o===Ae)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===vc)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===yc)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Mc)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Sc)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===vc)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===yc)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Mc)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Sc)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===yf||n===Mf||n===Sf||n===bf)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===yf)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Mf)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Sf)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===bf)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===wf||n===Tf||n===Ef)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===wf||n===Tf)return o===Ae?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===Ef)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(n===Af||n===Cf||n===Rf||n===Pf||n===If||n===Lf||n===Df||n===Uf||n===Nf||n===Of||n===Ff||n===Bf||n===kf||n===zf)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===Af)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===Cf)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Rf)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===Pf)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===If)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Lf)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Df)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Uf)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===Nf)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===Of)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Ff)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===Bf)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===kf)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===zf)return o===Ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===bc||n===Hf||n===Vf)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===bc)return o===Ae?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Hf)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Vf)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===M_||n===Gf||n===Wf||n===Xf)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===bc)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Gf)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Wf)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Xf)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Po?s.UNSIGNED_INT_24_8:s[n]!==void 0?s[n]:null}return{convert:e}}var ad=class extends yn{constructor(t=[]){super(),this.isArrayCamera=!0,this.cameras=t}},Ai=class extends on{constructor(){super(),this.isGroup=!0,this.type="Group"}},Nw={type:"move"},Ua=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Ai,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Ai,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new O,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new O),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Ai,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new O,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new O),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let e=this._hand;if(e)for(let n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let i=null,r=null,o=null,a=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){o=!0;for(let g of t.hand.values()){let m=e.getJointPose(g,n),p=this._getHandJoint(c,g);m!==null&&(p.matrix.fromArray(m.transform.matrix),p.matrix.decompose(p.position,p.rotation,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=m.radius),p.visible=m!==null}let h=c.joints["index-finger-tip"],u=c.joints["thumb-tip"],f=h.position.distanceTo(u.position),d=.02,_=.005;c.inputState.pinching&&f>d+_?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&f<=d-_&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1));a!==null&&(i=e.getPose(t.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(a.matrix.fromArray(i.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,i.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(i.linearVelocity)):a.hasLinearVelocity=!1,i.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(i.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(Nw)))}return a!==null&&(a.visible=i!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=o!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){let n=new Ai;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}},Ow=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Fw=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,ld=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e,n){if(this.texture===null){let i=new ai,r=t.properties.get(i);r.__webglTexture=e.texture,(e.depthNear!=n.depthNear||e.depthFar!=n.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=i}}getMesh(t){if(this.texture!==null&&this.mesh===null){let e=t.cameras[0].viewport,n=new en({vertexShader:Ow,fragmentShader:Fw,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new Ht(new He(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},cd=class extends Xs{constructor(t,e){super();let n=this,i=null,r=1,o=null,a="local-floor",l=1,c=null,h=null,u=null,f=null,d=null,_=null,g=new ld,m=e.getContextAttributes(),p=null,S=null,M=[],x=[],A=new Xt,E=null,T=new yn;T.viewport=new Le;let R=new yn;R.viewport=new Le;let y=[T,R],v=new ad,P=null,U=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(Z){let nt=M[Z];return nt===void 0&&(nt=new Ua,M[Z]=nt),nt.getTargetRaySpace()},this.getControllerGrip=function(Z){let nt=M[Z];return nt===void 0&&(nt=new Ua,M[Z]=nt),nt.getGripSpace()},this.getHand=function(Z){let nt=M[Z];return nt===void 0&&(nt=new Ua,M[Z]=nt),nt.getHandSpace()};function z(Z){let nt=x.indexOf(Z.inputSource);if(nt===-1)return;let yt=M[nt];yt!==void 0&&(yt.update(Z.inputSource,Z.frame,c||o),yt.dispatchEvent({type:Z.type,data:Z.inputSource}))}function V(){i.removeEventListener("select",z),i.removeEventListener("selectstart",z),i.removeEventListener("selectend",z),i.removeEventListener("squeeze",z),i.removeEventListener("squeezestart",z),i.removeEventListener("squeezeend",z),i.removeEventListener("end",V),i.removeEventListener("inputsourceschange",$);for(let Z=0;Z<M.length;Z++){let nt=x[Z];nt!==null&&(x[Z]=null,M[Z].disconnect(nt))}P=null,U=null,g.reset(),t.setRenderTarget(p),d=null,f=null,u=null,i=null,S=null,Ot.stop(),n.isPresenting=!1,t.setPixelRatio(E),t.setSize(A.width,A.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(Z){r=Z,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(Z){a=Z,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||o},this.setReferenceSpace=function(Z){c=Z},this.getBaseLayer=function(){return f!==null?f:d},this.getBinding=function(){return u},this.getFrame=function(){return _},this.getSession=function(){return i},this.setSession=async function(Z){if(i=Z,i!==null){if(p=t.getRenderTarget(),i.addEventListener("select",z),i.addEventListener("selectstart",z),i.addEventListener("selectend",z),i.addEventListener("squeeze",z),i.addEventListener("squeezestart",z),i.addEventListener("squeezeend",z),i.addEventListener("end",V),i.addEventListener("inputsourceschange",$),m.xrCompatible!==!0&&await e.makeXRCompatible(),E=t.getPixelRatio(),t.getSize(A),i.renderState.layers===void 0){let nt={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:r};d=new XRWebGLLayer(i,e,nt),i.updateRenderState({baseLayer:d}),t.setPixelRatio(1),t.setSize(d.framebufferWidth,d.framebufferHeight,!1),S=new zn(d.framebufferWidth,d.framebufferHeight,{format:Ei,type:ps,colorSpace:t.outputColorSpace,stencilBuffer:m.stencil})}else{let nt=null,yt=null,st=null;m.depth&&(st=m.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,nt=m.stencil?Io:wo,yt=m.stencil?Po:Er);let Ct={colorFormat:e.RGBA8,depthFormat:st,scaleFactor:r};u=new XRWebGLBinding(i,e),f=u.createProjectionLayer(Ct),i.updateRenderState({layers:[f]}),t.setPixelRatio(1),t.setSize(f.textureWidth,f.textureHeight,!1),S=new zn(f.textureWidth,f.textureHeight,{format:Ei,type:ps,depthTexture:new Fc(f.textureWidth,f.textureHeight,yt,void 0,void 0,void 0,void 0,void 0,void 0,nt),stencilBuffer:m.stencil,colorSpace:t.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:f.ignoreDepthValues===!1})}S.isXRRenderTarget=!0,this.setFoveation(l),c=null,o=await i.requestReferenceSpace(a),Ot.setContext(i),Ot.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return g.getDepthTexture()};function $(Z){for(let nt=0;nt<Z.removed.length;nt++){let yt=Z.removed[nt],st=x.indexOf(yt);st>=0&&(x[st]=null,M[st].disconnect(yt))}for(let nt=0;nt<Z.added.length;nt++){let yt=Z.added[nt],st=x.indexOf(yt);if(st===-1){for(let Ut=0;Ut<M.length;Ut++)if(Ut>=x.length){x.push(yt),st=Ut;break}else if(x[Ut]===null){x[Ut]=yt,st=Ut;break}if(st===-1)break}let Ct=M[st];Ct&&Ct.connect(yt)}}let X=new O,Y=new O;function W(Z,nt,yt){X.setFromMatrixPosition(nt.matrixWorld),Y.setFromMatrixPosition(yt.matrixWorld);let st=X.distanceTo(Y),Ct=nt.projectionMatrix.elements,Ut=yt.projectionMatrix.elements,Qt=Ct[14]/(Ct[10]-1),se=Ct[14]/(Ct[10]+1),Yt=(Ct[9]+1)/Ct[5],kt=(Ct[9]-1)/Ct[5],N=(Ct[8]-1)/Ct[0],Me=(Ut[8]+1)/Ut[0],Zt=Qt*N,H=Qt*Me,Rt=st/(-N+Me),fe=Rt*-N;if(nt.matrixWorld.decompose(Z.position,Z.quaternion,Z.scale),Z.translateX(fe),Z.translateZ(Rt),Z.matrixWorld.compose(Z.position,Z.quaternion,Z.scale),Z.matrixWorldInverse.copy(Z.matrixWorld).invert(),Ct[10]===-1)Z.projectionMatrix.copy(nt.projectionMatrix),Z.projectionMatrixInverse.copy(nt.projectionMatrixInverse);else{let Nt=Qt+Rt,C=se+Rt,b=Zt-fe,G=H+(st-fe),tt=Yt*se/C*Nt,Q=kt*se/C*Nt;Z.projectionMatrix.makePerspective(b,G,tt,Q,Nt,C),Z.projectionMatrixInverse.copy(Z.projectionMatrix).invert()}}function it(Z,nt){nt===null?Z.matrixWorld.copy(Z.matrix):Z.matrixWorld.multiplyMatrices(nt.matrixWorld,Z.matrix),Z.matrixWorldInverse.copy(Z.matrixWorld).invert()}this.updateCamera=function(Z){if(i===null)return;let nt=Z.near,yt=Z.far;g.texture!==null&&(g.depthNear>0&&(nt=g.depthNear),g.depthFar>0&&(yt=g.depthFar)),v.near=R.near=T.near=nt,v.far=R.far=T.far=yt,(P!==v.near||U!==v.far)&&(i.updateRenderState({depthNear:v.near,depthFar:v.far}),P=v.near,U=v.far),T.layers.mask=Z.layers.mask|2,R.layers.mask=Z.layers.mask|4,v.layers.mask=T.layers.mask|R.layers.mask;let st=Z.parent,Ct=v.cameras;it(v,st);for(let Ut=0;Ut<Ct.length;Ut++)it(Ct[Ut],st);Ct.length===2?W(v,T,R):v.projectionMatrix.copy(T.projectionMatrix),I(Z,v,st)};function I(Z,nt,yt){yt===null?Z.matrix.copy(nt.matrixWorld):(Z.matrix.copy(yt.matrixWorld),Z.matrix.invert(),Z.matrix.multiply(nt.matrixWorld)),Z.matrix.decompose(Z.position,Z.quaternion,Z.scale),Z.updateMatrixWorld(!0),Z.projectionMatrix.copy(nt.projectionMatrix),Z.projectionMatrixInverse.copy(nt.projectionMatrixInverse),Z.isPerspectiveCamera&&(Z.fov=Ac*2*Math.atan(1/Z.projectionMatrix.elements[5]),Z.zoom=1)}this.getCamera=function(){return v},this.getFoveation=function(){if(!(f===null&&d===null))return l},this.setFoveation=function(Z){l=Z,f!==null&&(f.fixedFoveation=Z),d!==null&&d.fixedFoveation!==void 0&&(d.fixedFoveation=Z)},this.hasDepthSensing=function(){return g.texture!==null},this.getDepthSensingMesh=function(){return g.getMesh(v)};let ft=null;function Wt(Z,nt){if(h=nt.getViewerPose(c||o),_=nt,h!==null){let yt=h.views;d!==null&&(t.setRenderTargetFramebuffer(S,d.framebuffer),t.setRenderTarget(S));let st=!1;yt.length!==v.cameras.length&&(v.cameras.length=0,st=!0);for(let Ut=0;Ut<yt.length;Ut++){let Qt=yt[Ut],se=null;if(d!==null)se=d.getViewport(Qt);else{let kt=u.getViewSubImage(f,Qt);se=kt.viewport,Ut===0&&(t.setRenderTargetTextures(S,kt.colorTexture,f.ignoreDepthValues?void 0:kt.depthStencilTexture),t.setRenderTarget(S))}let Yt=y[Ut];Yt===void 0&&(Yt=new yn,Yt.layers.enable(Ut),Yt.viewport=new Le,y[Ut]=Yt),Yt.matrix.fromArray(Qt.transform.matrix),Yt.matrix.decompose(Yt.position,Yt.quaternion,Yt.scale),Yt.projectionMatrix.fromArray(Qt.projectionMatrix),Yt.projectionMatrixInverse.copy(Yt.projectionMatrix).invert(),Yt.viewport.set(se.x,se.y,se.width,se.height),Ut===0&&(v.matrix.copy(Yt.matrix),v.matrix.decompose(v.position,v.quaternion,v.scale)),st===!0&&v.cameras.push(Yt)}let Ct=i.enabledFeatures;if(Ct&&Ct.includes("depth-sensing")){let Ut=u.getDepthInformation(yt[0]);Ut&&Ut.isValid&&Ut.texture&&g.init(t,Ut,i.renderState)}}for(let yt=0;yt<M.length;yt++){let st=x[yt],Ct=M[yt];st!==null&&Ct!==void 0&&Ct.update(st,nt,c||o)}ft&&ft(Z,nt),nt.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:nt}),_=null}let Ot=new A_;Ot.setAnimationLoop(Wt),this.setAnimationLoop=function(Z){ft=Z},this.dispose=function(){}}},yr=new Gi,Bw=new Be;function kw(s,t){function e(m,p){m.matrixAutoUpdate===!0&&m.updateMatrix(),p.value.copy(m.matrix)}function n(m,p){p.color.getRGB(m.fogColor.value,E_(s)),p.isFog?(m.fogNear.value=p.near,m.fogFar.value=p.far):p.isFogExp2&&(m.fogDensity.value=p.density)}function i(m,p,S,M,x){p.isMeshBasicMaterial||p.isMeshLambertMaterial?r(m,p):p.isMeshToonMaterial?(r(m,p),u(m,p)):p.isMeshPhongMaterial?(r(m,p),h(m,p)):p.isMeshStandardMaterial?(r(m,p),f(m,p),p.isMeshPhysicalMaterial&&d(m,p,x)):p.isMeshMatcapMaterial?(r(m,p),_(m,p)):p.isMeshDepthMaterial?r(m,p):p.isMeshDistanceMaterial?(r(m,p),g(m,p)):p.isMeshNormalMaterial?r(m,p):p.isLineBasicMaterial?(o(m,p),p.isLineDashedMaterial&&a(m,p)):p.isPointsMaterial?l(m,p,S,M):p.isSpriteMaterial?c(m,p):p.isShadowMaterial?(m.color.value.copy(p.color),m.opacity.value=p.opacity):p.isShaderMaterial&&(p.uniformsNeedUpdate=!1)}function r(m,p){m.opacity.value=p.opacity,p.color&&m.diffuse.value.copy(p.color),p.emissive&&m.emissive.value.copy(p.emissive).multiplyScalar(p.emissiveIntensity),p.map&&(m.map.value=p.map,e(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,e(p.alphaMap,m.alphaMapTransform)),p.bumpMap&&(m.bumpMap.value=p.bumpMap,e(p.bumpMap,m.bumpMapTransform),m.bumpScale.value=p.bumpScale,p.side===$n&&(m.bumpScale.value*=-1)),p.normalMap&&(m.normalMap.value=p.normalMap,e(p.normalMap,m.normalMapTransform),m.normalScale.value.copy(p.normalScale),p.side===$n&&m.normalScale.value.negate()),p.displacementMap&&(m.displacementMap.value=p.displacementMap,e(p.displacementMap,m.displacementMapTransform),m.displacementScale.value=p.displacementScale,m.displacementBias.value=p.displacementBias),p.emissiveMap&&(m.emissiveMap.value=p.emissiveMap,e(p.emissiveMap,m.emissiveMapTransform)),p.specularMap&&(m.specularMap.value=p.specularMap,e(p.specularMap,m.specularMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest);let S=t.get(p),M=S.envMap,x=S.envMapRotation;M&&(m.envMap.value=M,yr.copy(x),yr.x*=-1,yr.y*=-1,yr.z*=-1,M.isCubeTexture&&M.isRenderTargetTexture===!1&&(yr.y*=-1,yr.z*=-1),m.envMapRotation.value.setFromMatrix4(Bw.makeRotationFromEuler(yr)),m.flipEnvMap.value=M.isCubeTexture&&M.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=p.reflectivity,m.ior.value=p.ior,m.refractionRatio.value=p.refractionRatio),p.lightMap&&(m.lightMap.value=p.lightMap,m.lightMapIntensity.value=p.lightMapIntensity,e(p.lightMap,m.lightMapTransform)),p.aoMap&&(m.aoMap.value=p.aoMap,m.aoMapIntensity.value=p.aoMapIntensity,e(p.aoMap,m.aoMapTransform))}function o(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,p.map&&(m.map.value=p.map,e(p.map,m.mapTransform))}function a(m,p){m.dashSize.value=p.dashSize,m.totalSize.value=p.dashSize+p.gapSize,m.scale.value=p.scale}function l(m,p,S,M){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.size.value=p.size*S,m.scale.value=M*.5,p.map&&(m.map.value=p.map,e(p.map,m.uvTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,e(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function c(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.rotation.value=p.rotation,p.map&&(m.map.value=p.map,e(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,e(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function h(m,p){m.specular.value.copy(p.specular),m.shininess.value=Math.max(p.shininess,1e-4)}function u(m,p){p.gradientMap&&(m.gradientMap.value=p.gradientMap)}function f(m,p){m.metalness.value=p.metalness,p.metalnessMap&&(m.metalnessMap.value=p.metalnessMap,e(p.metalnessMap,m.metalnessMapTransform)),m.roughness.value=p.roughness,p.roughnessMap&&(m.roughnessMap.value=p.roughnessMap,e(p.roughnessMap,m.roughnessMapTransform)),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)}function d(m,p,S){m.ior.value=p.ior,p.sheen>0&&(m.sheenColor.value.copy(p.sheenColor).multiplyScalar(p.sheen),m.sheenRoughness.value=p.sheenRoughness,p.sheenColorMap&&(m.sheenColorMap.value=p.sheenColorMap,e(p.sheenColorMap,m.sheenColorMapTransform)),p.sheenRoughnessMap&&(m.sheenRoughnessMap.value=p.sheenRoughnessMap,e(p.sheenRoughnessMap,m.sheenRoughnessMapTransform))),p.clearcoat>0&&(m.clearcoat.value=p.clearcoat,m.clearcoatRoughness.value=p.clearcoatRoughness,p.clearcoatMap&&(m.clearcoatMap.value=p.clearcoatMap,e(p.clearcoatMap,m.clearcoatMapTransform)),p.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=p.clearcoatRoughnessMap,e(p.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),p.clearcoatNormalMap&&(m.clearcoatNormalMap.value=p.clearcoatNormalMap,e(p.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(p.clearcoatNormalScale),p.side===$n&&m.clearcoatNormalScale.value.negate())),p.dispersion>0&&(m.dispersion.value=p.dispersion),p.iridescence>0&&(m.iridescence.value=p.iridescence,m.iridescenceIOR.value=p.iridescenceIOR,m.iridescenceThicknessMinimum.value=p.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=p.iridescenceThicknessRange[1],p.iridescenceMap&&(m.iridescenceMap.value=p.iridescenceMap,e(p.iridescenceMap,m.iridescenceMapTransform)),p.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=p.iridescenceThicknessMap,e(p.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),p.transmission>0&&(m.transmission.value=p.transmission,m.transmissionSamplerMap.value=S.texture,m.transmissionSamplerSize.value.set(S.width,S.height),p.transmissionMap&&(m.transmissionMap.value=p.transmissionMap,e(p.transmissionMap,m.transmissionMapTransform)),m.thickness.value=p.thickness,p.thicknessMap&&(m.thicknessMap.value=p.thicknessMap,e(p.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=p.attenuationDistance,m.attenuationColor.value.copy(p.attenuationColor)),p.anisotropy>0&&(m.anisotropyVector.value.set(p.anisotropy*Math.cos(p.anisotropyRotation),p.anisotropy*Math.sin(p.anisotropyRotation)),p.anisotropyMap&&(m.anisotropyMap.value=p.anisotropyMap,e(p.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=p.specularIntensity,m.specularColor.value.copy(p.specularColor),p.specularColorMap&&(m.specularColorMap.value=p.specularColorMap,e(p.specularColorMap,m.specularColorMapTransform)),p.specularIntensityMap&&(m.specularIntensityMap.value=p.specularIntensityMap,e(p.specularIntensityMap,m.specularIntensityMapTransform))}function _(m,p){p.matcap&&(m.matcap.value=p.matcap)}function g(m,p){let S=t.get(p).light;m.referencePosition.value.setFromMatrixPosition(S.matrixWorld),m.nearDistance.value=S.shadow.camera.near,m.farDistance.value=S.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function zw(s,t,e,n){let i={},r={},o=[],a=s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS);function l(S,M){let x=M.program;n.uniformBlockBinding(S,x)}function c(S,M){let x=i[S.id];x===void 0&&(_(S),x=h(S),i[S.id]=x,S.addEventListener("dispose",m));let A=M.program;n.updateUBOMapping(S,A);let E=t.render.frame;r[S.id]!==E&&(f(S),r[S.id]=E)}function h(S){let M=u();S.__bindingPointIndex=M;let x=s.createBuffer(),A=S.__size,E=S.usage;return s.bindBuffer(s.UNIFORM_BUFFER,x),s.bufferData(s.UNIFORM_BUFFER,A,E),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,M,x),x}function u(){for(let S=0;S<a;S++)if(o.indexOf(S)===-1)return o.push(S),S;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function f(S){let M=i[S.id],x=S.uniforms,A=S.__cache;s.bindBuffer(s.UNIFORM_BUFFER,M);for(let E=0,T=x.length;E<T;E++){let R=Array.isArray(x[E])?x[E]:[x[E]];for(let y=0,v=R.length;y<v;y++){let P=R[y];if(d(P,E,y,A)===!0){let U=P.__offset,z=Array.isArray(P.value)?P.value:[P.value],V=0;for(let $=0;$<z.length;$++){let X=z[$],Y=g(X);typeof X=="number"||typeof X=="boolean"?(P.__data[0]=X,s.bufferSubData(s.UNIFORM_BUFFER,U+V,P.__data)):X.isMatrix3?(P.__data[0]=X.elements[0],P.__data[1]=X.elements[1],P.__data[2]=X.elements[2],P.__data[3]=0,P.__data[4]=X.elements[3],P.__data[5]=X.elements[4],P.__data[6]=X.elements[5],P.__data[7]=0,P.__data[8]=X.elements[6],P.__data[9]=X.elements[7],P.__data[10]=X.elements[8],P.__data[11]=0):(X.toArray(P.__data,V),V+=Y.storage/Float32Array.BYTES_PER_ELEMENT)}s.bufferSubData(s.UNIFORM_BUFFER,U,P.__data)}}}s.bindBuffer(s.UNIFORM_BUFFER,null)}function d(S,M,x,A){let E=S.value,T=M+"_"+x;if(A[T]===void 0)return typeof E=="number"||typeof E=="boolean"?A[T]=E:A[T]=E.clone(),!0;{let R=A[T];if(typeof E=="number"||typeof E=="boolean"){if(R!==E)return A[T]=E,!0}else if(R.equals(E)===!1)return R.copy(E),!0}return!1}function _(S){let M=S.uniforms,x=0,A=16;for(let T=0,R=M.length;T<R;T++){let y=Array.isArray(M[T])?M[T]:[M[T]];for(let v=0,P=y.length;v<P;v++){let U=y[v],z=Array.isArray(U.value)?U.value:[U.value];for(let V=0,$=z.length;V<$;V++){let X=z[V],Y=g(X),W=x%A,it=W%Y.boundary,I=W+it;x+=it,I!==0&&A-I<Y.storage&&(x+=A-I),U.__data=new Float32Array(Y.storage/Float32Array.BYTES_PER_ELEMENT),U.__offset=x,x+=Y.storage}}}let E=x%A;return E>0&&(x+=A-E),S.__size=x,S.__cache={},this}function g(S){let M={boundary:0,storage:0};return typeof S=="number"||typeof S=="boolean"?(M.boundary=4,M.storage=4):S.isVector2?(M.boundary=8,M.storage=8):S.isVector3||S.isColor?(M.boundary=16,M.storage=12):S.isVector4?(M.boundary=16,M.storage=16):S.isMatrix3?(M.boundary=48,M.storage=48):S.isMatrix4?(M.boundary=64,M.storage=64):S.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",S),M}function m(S){let M=S.target;M.removeEventListener("dispose",m);let x=o.indexOf(M.__bindingPointIndex);o.splice(x,1),s.deleteBuffer(i[M.id]),delete i[M.id],delete r[M.id]}function p(){for(let S in i)s.deleteBuffer(i[S]);o=[],i={},r={}}return{bind:l,update:c,dispose:p}}var Bc=class{constructor(t={}){let{canvas:e=Xv(),context:n=null,depth:i=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1,reverseDepthBuffer:f=!1}=t;this.isWebGLRenderer=!0;let d;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");d=n.getContextAttributes().alpha}else d=o;let _=new Uint32Array(4),g=new Int32Array(4),m=null,p=null,S=[],M=[];this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=Yn,this.toneMapping=Vs,this.toneMappingExposure=1;let x=this,A=!1,E=0,T=0,R=null,y=-1,v=null,P=new Le,U=new Le,z=null,V=new Dt(0),$=0,X=e.width,Y=e.height,W=1,it=null,I=null,ft=new Le(0,0,X,Y),Wt=new Le(0,0,X,Y),Ot=!1,Z=new Fa,nt=!1,yt=!1,st=new Be,Ct=new Be,Ut=new O,Qt=new Le,se={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Yt=!1;function kt(){return R===null?W:1}let N=n;function Me(w,D){return e.getContext(w,D)}try{let w={alpha:!0,depth:i,stencil:r,antialias:a,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${Ed}`),e.addEventListener("webglcontextlost",j,!1),e.addEventListener("webglcontextrestored",ut,!1),e.addEventListener("webglcontextcreationerror",gt,!1),N===null){let D="webgl2";if(N=Me(D,w),N===null)throw Me(D)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(w){throw console.error("THREE.WebGLRenderer: "+w.message),w}let Zt,H,Rt,fe,Nt,C,b,G,tt,Q,K,_t,ht,xt,Jt,rt,ct,Vt,Bt,wt,te,zt,de,L;function dt(){Zt=new nb(N),Zt.init(),zt=new Uw(N,Zt),H=new JS(N,Zt,t,zt),Rt=new Iw(N,Zt),H.reverseDepthBuffer&&f&&Rt.buffers.depth.setReversed(!0),fe=new rb(N),Nt=new xw,C=new Dw(N,Zt,Rt,Nt,H,zt,fe),b=new QS(x),G=new eb(x),tt=new fy(N),de=new ZS(N,tt),Q=new ib(N,tt,fe,de),K=new ab(N,Q,tt,fe),Bt=new ob(N,H,C),rt=new KS(Nt),_t=new _w(x,b,G,Zt,H,de,rt),ht=new kw(x,Nt),xt=new yw,Jt=new Ew(Zt),Vt=new YS(x,b,G,Rt,K,d,l),ct=new Rw(x,K,H),L=new zw(N,fe,H,Rt),wt=new $S(N,Zt,fe),te=new sb(N,Zt,fe),fe.programs=_t.programs,x.capabilities=H,x.extensions=Zt,x.properties=Nt,x.renderLists=xt,x.shadowMap=ct,x.state=Rt,x.info=fe}dt();let q=new cd(x,N);this.xr=q,this.getContext=function(){return N},this.getContextAttributes=function(){return N.getContextAttributes()},this.forceContextLoss=function(){let w=Zt.get("WEBGL_lose_context");w&&w.loseContext()},this.forceContextRestore=function(){let w=Zt.get("WEBGL_lose_context");w&&w.restoreContext()},this.getPixelRatio=function(){return W},this.setPixelRatio=function(w){w!==void 0&&(W=w,this.setSize(X,Y,!1))},this.getSize=function(w){return w.set(X,Y)},this.setSize=function(w,D,F=!0){if(q.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}X=w,Y=D,e.width=Math.floor(w*W),e.height=Math.floor(D*W),F===!0&&(e.style.width=w+"px",e.style.height=D+"px"),this.setViewport(0,0,w,D)},this.getDrawingBufferSize=function(w){return w.set(X*W,Y*W).floor()},this.setDrawingBufferSize=function(w,D,F){X=w,Y=D,W=F,e.width=Math.floor(w*F),e.height=Math.floor(D*F),this.setViewport(0,0,w,D)},this.getCurrentViewport=function(w){return w.copy(P)},this.getViewport=function(w){return w.copy(ft)},this.setViewport=function(w,D,F,k){w.isVector4?ft.set(w.x,w.y,w.z,w.w):ft.set(w,D,F,k),Rt.viewport(P.copy(ft).multiplyScalar(W).round())},this.getScissor=function(w){return w.copy(Wt)},this.setScissor=function(w,D,F,k){w.isVector4?Wt.set(w.x,w.y,w.z,w.w):Wt.set(w,D,F,k),Rt.scissor(U.copy(Wt).multiplyScalar(W).round())},this.getScissorTest=function(){return Ot},this.setScissorTest=function(w){Rt.setScissorTest(Ot=w)},this.setOpaqueSort=function(w){it=w},this.setTransparentSort=function(w){I=w},this.getClearColor=function(w){return w.copy(Vt.getClearColor())},this.setClearColor=function(){Vt.setClearColor.apply(Vt,arguments)},this.getClearAlpha=function(){return Vt.getClearAlpha()},this.setClearAlpha=function(){Vt.setClearAlpha.apply(Vt,arguments)},this.clear=function(w=!0,D=!0,F=!0){let k=0;if(w){let B=!1;if(R!==null){let ot=R.texture.format;B=ot===Fd||ot===Od||ot===Nd}if(B){let ot=R.texture.type,at=ot===ps||ot===Er||ot===Na||ot===Po||ot===Dd||ot===Ud,mt=Vt.getClearColor(),Et=Vt.getClearAlpha(),jt=mt.r,ne=mt.g,Lt=mt.b;at?(_[0]=jt,_[1]=ne,_[2]=Lt,_[3]=Et,N.clearBufferuiv(N.COLOR,0,_)):(g[0]=jt,g[1]=ne,g[2]=Lt,g[3]=Et,N.clearBufferiv(N.COLOR,0,g))}else k|=N.COLOR_BUFFER_BIT}D&&(k|=N.DEPTH_BUFFER_BIT),F&&(k|=N.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),N.clear(k)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){e.removeEventListener("webglcontextlost",j,!1),e.removeEventListener("webglcontextrestored",ut,!1),e.removeEventListener("webglcontextcreationerror",gt,!1),xt.dispose(),Jt.dispose(),Nt.dispose(),b.dispose(),G.dispose(),K.dispose(),de.dispose(),L.dispose(),_t.dispose(),q.dispose(),q.removeEventListener("sessionstart",vt),q.removeEventListener("sessionend",Kt),Tt.stop()};function j(w){w.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),A=!0}function ut(){console.log("THREE.WebGLRenderer: Context Restored."),A=!1;let w=fe.autoReset,D=ct.enabled,F=ct.autoUpdate,k=ct.needsUpdate,B=ct.type;dt(),fe.autoReset=w,ct.enabled=D,ct.autoUpdate=F,ct.needsUpdate=k,ct.type=B}function gt(w){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",w.statusMessage)}function qt(w){let D=w.target;D.removeEventListener("dispose",qt),pe(D)}function pe(w){ve(w),Nt.remove(w)}function ve(w){let D=Nt.get(w).programs;D!==void 0&&(D.forEach(function(F){_t.releaseProgram(F)}),w.isShaderMaterial&&_t.releaseShaderCache(w))}this.renderBufferDirect=function(w,D,F,k,B,ot){D===null&&(D=se);let at=B.isMesh&&B.matrixWorld.determinant()<0,mt=me(w,D,F,k,B);Rt.setMaterial(k,at);let Et=F.index,jt=1;if(k.wireframe===!0){if(Et=Q.getWireframeAttribute(F),Et===void 0)return;jt=2}let ne=F.drawRange,Lt=F.attributes.position,oe=ne.start*jt,ye=(ne.start+ne.count)*jt;ot!==null&&(oe=Math.max(oe,ot.start*jt),ye=Math.min(ye,(ot.start+ot.count)*jt)),Et!==null?(oe=Math.max(oe,0),ye=Math.min(ye,Et.count)):Lt!=null&&(oe=Math.max(oe,0),ye=Math.min(ye,Lt.count));let be=ye-oe;if(be<0||be===1/0)return;de.setup(B,k,mt,F,Et);let Ge,we=wt;if(Et!==null&&(Ge=tt.get(Et),we=te,we.setIndex(Ge)),B.isMesh)k.wireframe===!0?(Rt.setLineWidth(k.wireframeLinewidth*kt()),we.setMode(N.LINES)):we.setMode(N.TRIANGLES);else if(B.isLine){let Gt=k.linewidth;Gt===void 0&&(Gt=1),Rt.setLineWidth(Gt*kt()),B.isLineSegments?we.setMode(N.LINES):B.isLineLoop?we.setMode(N.LINE_LOOP):we.setMode(N.LINE_STRIP)}else B.isPoints?we.setMode(N.POINTS):B.isSprite&&we.setMode(N.TRIANGLES);if(B.isBatchedMesh)if(B._multiDrawInstances!==null)we.renderMultiDrawInstances(B._multiDrawStarts,B._multiDrawCounts,B._multiDrawCount,B._multiDrawInstances);else if(Zt.get("WEBGL_multi_draw"))we.renderMultiDraw(B._multiDrawStarts,B._multiDrawCounts,B._multiDrawCount);else{let Gt=B._multiDrawStarts,qi=B._multiDrawCounts,Te=B._multiDrawCount,yi=Et?tt.get(Et).bytesPerElement:1,Nr=Nt.get(k).currentProgram.getUniforms();for(let Jn=0;Jn<Te;Jn++)Nr.setValue(N,"_gl_DrawID",Jn),we.render(Gt[Jn]/yi,qi[Jn])}else if(B.isInstancedMesh)we.renderInstances(oe,be,B.count);else if(F.isInstancedBufferGeometry){let Gt=F._maxInstanceCount!==void 0?F._maxInstanceCount:1/0,qi=Math.min(F.instanceCount,Gt);we.renderInstances(oe,be,qi)}else we.render(oe,be)};function pt(w,D,F){w.transparent===!0&&w.side===oi&&w.forceSinglePass===!1?(w.side=$n,w.needsUpdate=!0,lt(w,D,F),w.side=Ws,w.needsUpdate=!0,lt(w,D,F),w.side=oi):lt(w,D,F)}this.compile=function(w,D,F=null){F===null&&(F=w),p=Jt.get(F),p.init(D),M.push(p),F.traverseVisible(function(B){B.isLight&&B.layers.test(D.layers)&&(p.pushLight(B),B.castShadow&&p.pushShadow(B))}),w!==F&&w.traverseVisible(function(B){B.isLight&&B.layers.test(D.layers)&&(p.pushLight(B),B.castShadow&&p.pushShadow(B))}),p.setupLights();let k=new Set;return w.traverse(function(B){if(!(B.isMesh||B.isPoints||B.isLine||B.isSprite))return;let ot=B.material;if(ot)if(Array.isArray(ot))for(let at=0;at<ot.length;at++){let mt=ot[at];pt(mt,F,B),k.add(mt)}else pt(ot,F,B),k.add(ot)}),M.pop(),p=null,k},this.compileAsync=function(w,D,F=null){let k=this.compile(w,D,F);return new Promise(B=>{function ot(){if(k.forEach(function(at){Nt.get(at).currentProgram.isReady()&&k.delete(at)}),k.size===0){B(w);return}setTimeout(ot,10)}Zt.get("KHR_parallel_shader_compile")!==null?ot():setTimeout(ot,10)})};let It=null;function ee(w){It&&It(w)}function vt(){Tt.stop()}function Kt(){Tt.start()}let Tt=new A_;Tt.setAnimationLoop(ee),typeof self<"u"&&Tt.setContext(self),this.setAnimationLoop=function(w){It=w,q.setAnimationLoop(w),w===null?Tt.stop():Tt.start()},q.addEventListener("sessionstart",vt),q.addEventListener("sessionend",Kt),this.render=function(w,D){if(D!==void 0&&D.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(A===!0)return;if(w.matrixWorldAutoUpdate===!0&&w.updateMatrixWorld(),D.parent===null&&D.matrixWorldAutoUpdate===!0&&D.updateMatrixWorld(),q.enabled===!0&&q.isPresenting===!0&&(q.cameraAutoUpdate===!0&&q.updateCamera(D),D=q.getCamera()),w.isScene===!0&&w.onBeforeRender(x,w,D,R),p=Jt.get(w,M.length),p.init(D),M.push(p),Ct.multiplyMatrices(D.projectionMatrix,D.matrixWorldInverse),Z.setFromProjectionMatrix(Ct),yt=this.localClippingEnabled,nt=rt.init(this.clippingPlanes,yt),m=xt.get(w,S.length),m.init(),S.push(m),q.enabled===!0&&q.isPresenting===!0){let ot=x.xr.getDepthSensingMesh();ot!==null&&$t(ot,D,-1/0,x.sortObjects)}$t(w,D,0,x.sortObjects),m.finish(),x.sortObjects===!0&&m.sort(it,I),Yt=q.enabled===!1||q.isPresenting===!1||q.hasDepthSensing()===!1,Yt&&Vt.addToRenderList(m,w),this.info.render.frame++,nt===!0&&rt.beginShadows();let F=p.state.shadowsArray;ct.render(F,w,D),nt===!0&&rt.endShadows(),this.info.autoReset===!0&&this.info.reset();let k=m.opaque,B=m.transmissive;if(p.setupLights(),D.isArrayCamera){let ot=D.cameras;if(B.length>0)for(let at=0,mt=ot.length;at<mt;at++){let Et=ot[at];re(k,B,w,Et)}Yt&&Vt.render(w);for(let at=0,mt=ot.length;at<mt;at++){let Et=ot[at];Ve(m,w,Et,Et.viewport)}}else B.length>0&&re(k,B,w,D),Yt&&Vt.render(w),Ve(m,w,D);R!==null&&(C.updateMultisampleRenderTarget(R),C.updateRenderTargetMipmap(R)),w.isScene===!0&&w.onAfterRender(x,w,D),de.resetDefaultState(),y=-1,v=null,M.pop(),M.length>0?(p=M[M.length-1],nt===!0&&rt.setGlobalState(x.clippingPlanes,p.state.camera)):p=null,S.pop(),S.length>0?m=S[S.length-1]:m=null};function $t(w,D,F,k){if(w.visible===!1)return;if(w.layers.test(D.layers)){if(w.isGroup)F=w.renderOrder;else if(w.isLOD)w.autoUpdate===!0&&w.update(D);else if(w.isLight)p.pushLight(w),w.castShadow&&p.pushShadow(w);else if(w.isSprite){if(!w.frustumCulled||Z.intersectsSprite(w)){k&&Qt.setFromMatrixPosition(w.matrixWorld).applyMatrix4(Ct);let at=K.update(w),mt=w.material;mt.visible&&m.push(w,at,mt,F,Qt.z,null)}}else if((w.isMesh||w.isLine||w.isPoints)&&(!w.frustumCulled||Z.intersectsObject(w))){let at=K.update(w),mt=w.material;if(k&&(w.boundingSphere!==void 0?(w.boundingSphere===null&&w.computeBoundingSphere(),Qt.copy(w.boundingSphere.center)):(at.boundingSphere===null&&at.computeBoundingSphere(),Qt.copy(at.boundingSphere.center)),Qt.applyMatrix4(w.matrixWorld).applyMatrix4(Ct)),Array.isArray(mt)){let Et=at.groups;for(let jt=0,ne=Et.length;jt<ne;jt++){let Lt=Et[jt],oe=mt[Lt.materialIndex];oe&&oe.visible&&m.push(w,at,oe,F,Qt.z,Lt)}}else mt.visible&&m.push(w,at,mt,F,Qt.z,null)}}let ot=w.children;for(let at=0,mt=ot.length;at<mt;at++)$t(ot[at],D,F,k)}function Ve(w,D,F,k){let B=w.opaque,ot=w.transmissive,at=w.transparent;p.setupLightsView(F),nt===!0&&rt.setGlobalState(x.clippingPlanes,F),k&&Rt.viewport(P.copy(k)),B.length>0&&Re(B,D,F),ot.length>0&&Re(ot,D,F),at.length>0&&Re(at,D,F),Rt.buffers.depth.setTest(!0),Rt.buffers.depth.setMask(!0),Rt.buffers.color.setMask(!0),Rt.setPolygonOffset(!1)}function re(w,D,F,k){if((F.isScene===!0?F.overrideMaterial:null)!==null)return;p.state.transmissionRenderTarget[k.id]===void 0&&(p.state.transmissionRenderTarget[k.id]=new zn(1,1,{generateMipmaps:!0,type:Zt.has("EXT_color_buffer_half_float")||Zt.has("EXT_color_buffer_float")?Pi:ps,minFilter:Tr,samples:4,stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:_e.workingColorSpace}));let ot=p.state.transmissionRenderTarget[k.id],at=k.viewport||P;ot.setSize(at.z,at.w);let mt=x.getRenderTarget();x.setRenderTarget(ot),x.getClearColor(V),$=x.getClearAlpha(),$<1&&x.setClearColor(16777215,.5),x.clear(),Yt&&Vt.render(F);let Et=x.toneMapping;x.toneMapping=Vs;let jt=k.viewport;if(k.viewport!==void 0&&(k.viewport=void 0),p.setupLightsView(k),nt===!0&&rt.setGlobalState(x.clippingPlanes,k),Re(w,F,k),C.updateMultisampleRenderTarget(ot),C.updateRenderTargetMipmap(ot),Zt.has("WEBGL_multisampled_render_to_texture")===!1){let ne=!1;for(let Lt=0,oe=D.length;Lt<oe;Lt++){let ye=D[Lt],be=ye.object,Ge=ye.geometry,we=ye.material,Gt=ye.group;if(we.side===oi&&be.layers.test(k.layers)){let qi=we.side;we.side=$n,we.needsUpdate=!0,J(be,F,k,Ge,we,Gt),we.side=qi,we.needsUpdate=!0,ne=!0}}ne===!0&&(C.updateMultisampleRenderTarget(ot),C.updateRenderTargetMipmap(ot))}x.setRenderTarget(mt),x.setClearColor(V,$),jt!==void 0&&(k.viewport=jt),x.toneMapping=Et}function Re(w,D,F){let k=D.isScene===!0?D.overrideMaterial:null;for(let B=0,ot=w.length;B<ot;B++){let at=w[B],mt=at.object,Et=at.geometry,jt=k===null?at.material:k,ne=at.group;mt.layers.test(F.layers)&&J(mt,D,F,Et,jt,ne)}}function J(w,D,F,k,B,ot){w.onBeforeRender(x,D,F,k,B,ot),w.modelViewMatrix.multiplyMatrices(F.matrixWorldInverse,w.matrixWorld),w.normalMatrix.getNormalMatrix(w.modelViewMatrix),B.onBeforeRender(x,D,F,k,w,ot),B.transparent===!0&&B.side===oi&&B.forceSinglePass===!1?(B.side=$n,B.needsUpdate=!0,x.renderBufferDirect(F,D,k,B,w,ot),B.side=Ws,B.needsUpdate=!0,x.renderBufferDirect(F,D,k,B,w,ot),B.side=oi):x.renderBufferDirect(F,D,k,B,w,ot),w.onAfterRender(x,D,F,k,B,ot)}function lt(w,D,F){D.isScene!==!0&&(D=se);let k=Nt.get(w),B=p.state.lights,ot=p.state.shadowsArray,at=B.state.version,mt=_t.getParameters(w,B.state,ot,D,F),Et=_t.getProgramCacheKey(mt),jt=k.programs;k.environment=w.isMeshStandardMaterial?D.environment:null,k.fog=D.fog,k.envMap=(w.isMeshStandardMaterial?G:b).get(w.envMap||k.environment),k.envMapRotation=k.environment!==null&&w.envMap===null?D.environmentRotation:w.envMapRotation,jt===void 0&&(w.addEventListener("dispose",qt),jt=new Map,k.programs=jt);let ne=jt.get(Et);if(ne!==void 0){if(k.currentProgram===ne&&k.lightsStateVersion===at)return St(w,mt),ne}else mt.uniforms=_t.getUniforms(w),w.onBeforeCompile(mt,x),ne=_t.acquireProgram(mt,Et),jt.set(Et,ne),k.uniforms=mt.uniforms;let Lt=k.uniforms;return(!w.isShaderMaterial&&!w.isRawShaderMaterial||w.clipping===!0)&&(Lt.clippingPlanes=rt.uniform),St(w,mt),k.needsLights=Se(w),k.lightsStateVersion=at,k.needsLights&&(Lt.ambientLightColor.value=B.state.ambient,Lt.lightProbe.value=B.state.probe,Lt.directionalLights.value=B.state.directional,Lt.directionalLightShadows.value=B.state.directionalShadow,Lt.spotLights.value=B.state.spot,Lt.spotLightShadows.value=B.state.spotShadow,Lt.rectAreaLights.value=B.state.rectArea,Lt.ltc_1.value=B.state.rectAreaLTC1,Lt.ltc_2.value=B.state.rectAreaLTC2,Lt.pointLights.value=B.state.point,Lt.pointLightShadows.value=B.state.pointShadow,Lt.hemisphereLights.value=B.state.hemi,Lt.directionalShadowMap.value=B.state.directionalShadowMap,Lt.directionalShadowMatrix.value=B.state.directionalShadowMatrix,Lt.spotShadowMap.value=B.state.spotShadowMap,Lt.spotLightMatrix.value=B.state.spotLightMatrix,Lt.spotLightMap.value=B.state.spotLightMap,Lt.pointShadowMap.value=B.state.pointShadowMap,Lt.pointShadowMatrix.value=B.state.pointShadowMatrix),k.currentProgram=ne,k.uniformsList=null,ne}function et(w){if(w.uniformsList===null){let D=w.currentProgram.getUniforms();w.uniformsList=Eo.seqWithValue(D.seq,w.uniforms)}return w.uniformsList}function St(w,D){let F=Nt.get(w);F.outputColorSpace=D.outputColorSpace,F.batching=D.batching,F.batchingColor=D.batchingColor,F.instancing=D.instancing,F.instancingColor=D.instancingColor,F.instancingMorph=D.instancingMorph,F.skinning=D.skinning,F.morphTargets=D.morphTargets,F.morphNormals=D.morphNormals,F.morphColors=D.morphColors,F.morphTargetsCount=D.morphTargetsCount,F.numClippingPlanes=D.numClippingPlanes,F.numIntersection=D.numClipIntersection,F.vertexAlphas=D.vertexAlphas,F.vertexTangents=D.vertexTangents,F.toneMapping=D.toneMapping}function me(w,D,F,k,B){D.isScene!==!0&&(D=se),C.resetTextureUnits();let ot=D.fog,at=k.isMeshStandardMaterial?D.environment:null,mt=R===null?x.outputColorSpace:R.isXRRenderTarget===!0?R.texture.colorSpace:ko,Et=(k.isMeshStandardMaterial?G:b).get(k.envMap||at),jt=k.vertexColors===!0&&!!F.attributes.color&&F.attributes.color.itemSize===4,ne=!!F.attributes.tangent&&(!!k.normalMap||k.anisotropy>0),Lt=!!F.morphAttributes.position,oe=!!F.morphAttributes.normal,ye=!!F.morphAttributes.color,be=Vs;k.toneMapped&&(R===null||R.isXRRenderTarget===!0)&&(be=x.toneMapping);let Ge=F.morphAttributes.position||F.morphAttributes.normal||F.morphAttributes.color,we=Ge!==void 0?Ge.length:0,Gt=Nt.get(k),qi=p.state.lights;if(nt===!0&&(yt===!0||w!==v)){let hi=w===v&&k.id===y;rt.setState(k,w,hi)}let Te=!1;k.version===Gt.__version?(Gt.needsLights&&Gt.lightsStateVersion!==qi.state.version||Gt.outputColorSpace!==mt||B.isBatchedMesh&&Gt.batching===!1||!B.isBatchedMesh&&Gt.batching===!0||B.isBatchedMesh&&Gt.batchingColor===!0&&B.colorTexture===null||B.isBatchedMesh&&Gt.batchingColor===!1&&B.colorTexture!==null||B.isInstancedMesh&&Gt.instancing===!1||!B.isInstancedMesh&&Gt.instancing===!0||B.isSkinnedMesh&&Gt.skinning===!1||!B.isSkinnedMesh&&Gt.skinning===!0||B.isInstancedMesh&&Gt.instancingColor===!0&&B.instanceColor===null||B.isInstancedMesh&&Gt.instancingColor===!1&&B.instanceColor!==null||B.isInstancedMesh&&Gt.instancingMorph===!0&&B.morphTexture===null||B.isInstancedMesh&&Gt.instancingMorph===!1&&B.morphTexture!==null||Gt.envMap!==Et||k.fog===!0&&Gt.fog!==ot||Gt.numClippingPlanes!==void 0&&(Gt.numClippingPlanes!==rt.numPlanes||Gt.numIntersection!==rt.numIntersection)||Gt.vertexAlphas!==jt||Gt.vertexTangents!==ne||Gt.morphTargets!==Lt||Gt.morphNormals!==oe||Gt.morphColors!==ye||Gt.toneMapping!==be||Gt.morphTargetsCount!==we)&&(Te=!0):(Te=!0,Gt.__version=k.version);let yi=Gt.currentProgram;Te===!0&&(yi=lt(k,D,B));let Nr=!1,Jn=!1,Go=!1,Fe=yi.getUniforms(),Li=Gt.uniforms;if(Rt.useProgram(yi.program)&&(Nr=!0,Jn=!0,Go=!0),k.id!==y&&(y=k.id,Jn=!0),Nr||v!==w){Rt.buffers.depth.getReversed()?(st.copy(w.projectionMatrix),Yv(st),Zv(st),Fe.setValue(N,"projectionMatrix",st)):Fe.setValue(N,"projectionMatrix",w.projectionMatrix),Fe.setValue(N,"viewMatrix",w.matrixWorldInverse);let vs=Fe.map.cameraPosition;vs!==void 0&&vs.setValue(N,Ut.setFromMatrixPosition(w.matrixWorld)),H.logarithmicDepthBuffer&&Fe.setValue(N,"logDepthBufFC",2/(Math.log(w.far+1)/Math.LN2)),(k.isMeshPhongMaterial||k.isMeshToonMaterial||k.isMeshLambertMaterial||k.isMeshBasicMaterial||k.isMeshStandardMaterial||k.isShaderMaterial)&&Fe.setValue(N,"isOrthographic",w.isOrthographicCamera===!0),v!==w&&(v=w,Jn=!0,Go=!0)}if(B.isSkinnedMesh){Fe.setOptional(N,B,"bindMatrix"),Fe.setOptional(N,B,"bindMatrixInverse");let hi=B.skeleton;hi&&(hi.boneTexture===null&&hi.computeBoneTexture(),Fe.setValue(N,"boneTexture",hi.boneTexture,C))}B.isBatchedMesh&&(Fe.setOptional(N,B,"batchingTexture"),Fe.setValue(N,"batchingTexture",B._matricesTexture,C),Fe.setOptional(N,B,"batchingIdTexture"),Fe.setValue(N,"batchingIdTexture",B._indirectTexture,C),Fe.setOptional(N,B,"batchingColorTexture"),B._colorsTexture!==null&&Fe.setValue(N,"batchingColorTexture",B._colorsTexture,C));let Wo=F.morphAttributes;if((Wo.position!==void 0||Wo.normal!==void 0||Wo.color!==void 0)&&Bt.update(B,F,yi),(Jn||Gt.receiveShadow!==B.receiveShadow)&&(Gt.receiveShadow=B.receiveShadow,Fe.setValue(N,"receiveShadow",B.receiveShadow)),k.isMeshGouraudMaterial&&k.envMap!==null&&(Li.envMap.value=Et,Li.flipEnvMap.value=Et.isCubeTexture&&Et.isRenderTargetTexture===!1?-1:1),k.isMeshStandardMaterial&&k.envMap===null&&D.environment!==null&&(Li.envMapIntensity.value=D.environmentIntensity),Jn&&(Fe.setValue(N,"toneMappingExposure",x.toneMappingExposure),Gt.needsLights&&At(Li,Go),ot&&k.fog===!0&&ht.refreshFogUniforms(Li,ot),ht.refreshMaterialUniforms(Li,k,W,Y,p.state.transmissionRenderTarget[w.id]),Eo.upload(N,et(Gt),Li,C)),k.isShaderMaterial&&k.uniformsNeedUpdate===!0&&(Eo.upload(N,et(Gt),Li,C),k.uniformsNeedUpdate=!1),k.isSpriteMaterial&&Fe.setValue(N,"center",B.center),Fe.setValue(N,"modelViewMatrix",B.modelViewMatrix),Fe.setValue(N,"normalMatrix",B.normalMatrix),Fe.setValue(N,"modelMatrix",B.matrixWorld),k.isShaderMaterial||k.isRawShaderMaterial){let hi=k.uniformsGroups;for(let vs=0,ys=hi.length;vs<ys;vs++){let Qd=hi[vs];L.update(Qd,yi),L.bind(Qd,yi)}}return yi}function At(w,D){w.ambientLightColor.needsUpdate=D,w.lightProbe.needsUpdate=D,w.directionalLights.needsUpdate=D,w.directionalLightShadows.needsUpdate=D,w.pointLights.needsUpdate=D,w.pointLightShadows.needsUpdate=D,w.spotLights.needsUpdate=D,w.spotLightShadows.needsUpdate=D,w.rectAreaLights.needsUpdate=D,w.hemisphereLights.needsUpdate=D}function Se(w){return w.isMeshLambertMaterial||w.isMeshToonMaterial||w.isMeshPhongMaterial||w.isMeshStandardMaterial||w.isShadowMaterial||w.isShaderMaterial&&w.lights===!0}this.getActiveCubeFace=function(){return E},this.getActiveMipmapLevel=function(){return T},this.getRenderTarget=function(){return R},this.setRenderTargetTextures=function(w,D,F){Nt.get(w.texture).__webglTexture=D,Nt.get(w.depthTexture).__webglTexture=F;let k=Nt.get(w);k.__hasExternalTextures=!0,k.__autoAllocateDepthBuffer=F===void 0,k.__autoAllocateDepthBuffer||Zt.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),k.__useRenderToTexture=!1)},this.setRenderTargetFramebuffer=function(w,D){let F=Nt.get(w);F.__webglFramebuffer=D,F.__useDefaultFramebuffer=D===void 0},this.setRenderTarget=function(w,D=0,F=0){R=w,E=D,T=F;let k=!0,B=null,ot=!1,at=!1;if(w){let Et=Nt.get(w);if(Et.__useDefaultFramebuffer!==void 0)Rt.bindFramebuffer(N.FRAMEBUFFER,null),k=!1;else if(Et.__webglFramebuffer===void 0)C.setupRenderTarget(w);else if(Et.__hasExternalTextures)C.rebindTextures(w,Nt.get(w.texture).__webglTexture,Nt.get(w.depthTexture).__webglTexture);else if(w.depthBuffer){let Lt=w.depthTexture;if(Et.__boundDepthTexture!==Lt){if(Lt!==null&&Nt.has(Lt)&&(w.width!==Lt.image.width||w.height!==Lt.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");C.setupDepthRenderbuffer(w)}}let jt=w.texture;(jt.isData3DTexture||jt.isDataArrayTexture||jt.isCompressedArrayTexture)&&(at=!0);let ne=Nt.get(w).__webglFramebuffer;w.isWebGLCubeRenderTarget?(Array.isArray(ne[D])?B=ne[D][F]:B=ne[D],ot=!0):w.samples>0&&C.useMultisampledRTT(w)===!1?B=Nt.get(w).__webglMultisampledFramebuffer:Array.isArray(ne)?B=ne[F]:B=ne,P.copy(w.viewport),U.copy(w.scissor),z=w.scissorTest}else P.copy(ft).multiplyScalar(W).floor(),U.copy(Wt).multiplyScalar(W).floor(),z=Ot;if(Rt.bindFramebuffer(N.FRAMEBUFFER,B)&&k&&Rt.drawBuffers(w,B),Rt.viewport(P),Rt.scissor(U),Rt.setScissorTest(z),ot){let Et=Nt.get(w.texture);N.framebufferTexture2D(N.FRAMEBUFFER,N.COLOR_ATTACHMENT0,N.TEXTURE_CUBE_MAP_POSITIVE_X+D,Et.__webglTexture,F)}else if(at){let Et=Nt.get(w.texture),jt=D||0;N.framebufferTextureLayer(N.FRAMEBUFFER,N.COLOR_ATTACHMENT0,Et.__webglTexture,F||0,jt)}y=-1},this.readRenderTargetPixels=function(w,D,F,k,B,ot,at){if(!(w&&w.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let mt=Nt.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&at!==void 0&&(mt=mt[at]),mt){Rt.bindFramebuffer(N.FRAMEBUFFER,mt);try{let Et=w.texture,jt=Et.format,ne=Et.type;if(!H.textureFormatReadable(jt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!H.textureTypeReadable(ne)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}D>=0&&D<=w.width-k&&F>=0&&F<=w.height-B&&N.readPixels(D,F,k,B,zt.convert(jt),zt.convert(ne),ot)}finally{let Et=R!==null?Nt.get(R).__webglFramebuffer:null;Rt.bindFramebuffer(N.FRAMEBUFFER,Et)}}},this.readRenderTargetPixelsAsync=async function(w,D,F,k,B,ot,at){if(!(w&&w.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let mt=Nt.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&at!==void 0&&(mt=mt[at]),mt){let Et=w.texture,jt=Et.format,ne=Et.type;if(!H.textureFormatReadable(jt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!H.textureTypeReadable(ne))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");if(D>=0&&D<=w.width-k&&F>=0&&F<=w.height-B){Rt.bindFramebuffer(N.FRAMEBUFFER,mt);let Lt=N.createBuffer();N.bindBuffer(N.PIXEL_PACK_BUFFER,Lt),N.bufferData(N.PIXEL_PACK_BUFFER,ot.byteLength,N.STREAM_READ),N.readPixels(D,F,k,B,zt.convert(jt),zt.convert(ne),0);let oe=R!==null?Nt.get(R).__webglFramebuffer:null;Rt.bindFramebuffer(N.FRAMEBUFFER,oe);let ye=N.fenceSync(N.SYNC_GPU_COMMANDS_COMPLETE,0);return N.flush(),await qv(N,ye,4),N.bindBuffer(N.PIXEL_PACK_BUFFER,Lt),N.getBufferSubData(N.PIXEL_PACK_BUFFER,0,ot),N.deleteBuffer(Lt),N.deleteSync(ye),ot}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}},this.copyFramebufferToTexture=function(w,D=null,F=0){w.isTexture!==!0&&(La("WebGLRenderer: copyFramebufferToTexture function signature has changed."),D=arguments[0]||null,w=arguments[1]);let k=Math.pow(2,-F),B=Math.floor(w.image.width*k),ot=Math.floor(w.image.height*k),at=D!==null?D.x:0,mt=D!==null?D.y:0;C.setTexture2D(w,0),N.copyTexSubImage2D(N.TEXTURE_2D,F,0,0,at,mt,B,ot),Rt.unbindTexture()},this.copyTextureToTexture=function(w,D,F=null,k=null,B=0){w.isTexture!==!0&&(La("WebGLRenderer: copyTextureToTexture function signature has changed."),k=arguments[0]||null,w=arguments[1],D=arguments[2],B=arguments[3]||0,F=null);let ot,at,mt,Et,jt,ne,Lt,oe,ye,be=w.isCompressedTexture?w.mipmaps[B]:w.image;F!==null?(ot=F.max.x-F.min.x,at=F.max.y-F.min.y,mt=F.isBox3?F.max.z-F.min.z:1,Et=F.min.x,jt=F.min.y,ne=F.isBox3?F.min.z:0):(ot=be.width,at=be.height,mt=be.depth||1,Et=0,jt=0,ne=0),k!==null?(Lt=k.x,oe=k.y,ye=k.z):(Lt=0,oe=0,ye=0);let Ge=zt.convert(D.format),we=zt.convert(D.type),Gt;D.isData3DTexture?(C.setTexture3D(D,0),Gt=N.TEXTURE_3D):D.isDataArrayTexture||D.isCompressedArrayTexture?(C.setTexture2DArray(D,0),Gt=N.TEXTURE_2D_ARRAY):(C.setTexture2D(D,0),Gt=N.TEXTURE_2D),N.pixelStorei(N.UNPACK_FLIP_Y_WEBGL,D.flipY),N.pixelStorei(N.UNPACK_PREMULTIPLY_ALPHA_WEBGL,D.premultiplyAlpha),N.pixelStorei(N.UNPACK_ALIGNMENT,D.unpackAlignment);let qi=N.getParameter(N.UNPACK_ROW_LENGTH),Te=N.getParameter(N.UNPACK_IMAGE_HEIGHT),yi=N.getParameter(N.UNPACK_SKIP_PIXELS),Nr=N.getParameter(N.UNPACK_SKIP_ROWS),Jn=N.getParameter(N.UNPACK_SKIP_IMAGES);N.pixelStorei(N.UNPACK_ROW_LENGTH,be.width),N.pixelStorei(N.UNPACK_IMAGE_HEIGHT,be.height),N.pixelStorei(N.UNPACK_SKIP_PIXELS,Et),N.pixelStorei(N.UNPACK_SKIP_ROWS,jt),N.pixelStorei(N.UNPACK_SKIP_IMAGES,ne);let Go=w.isDataArrayTexture||w.isData3DTexture,Fe=D.isDataArrayTexture||D.isData3DTexture;if(w.isRenderTargetTexture||w.isDepthTexture){let Li=Nt.get(w),Wo=Nt.get(D),hi=Nt.get(Li.__renderTarget),vs=Nt.get(Wo.__renderTarget);Rt.bindFramebuffer(N.READ_FRAMEBUFFER,hi.__webglFramebuffer),Rt.bindFramebuffer(N.DRAW_FRAMEBUFFER,vs.__webglFramebuffer);for(let ys=0;ys<mt;ys++)Go&&N.framebufferTextureLayer(N.READ_FRAMEBUFFER,N.COLOR_ATTACHMENT0,Nt.get(w).__webglTexture,B,ne+ys),w.isDepthTexture?(Fe&&N.framebufferTextureLayer(N.DRAW_FRAMEBUFFER,N.COLOR_ATTACHMENT0,Nt.get(D).__webglTexture,B,ye+ys),N.blitFramebuffer(Et,jt,ot,at,Lt,oe,ot,at,N.DEPTH_BUFFER_BIT,N.NEAREST)):Fe?N.copyTexSubImage3D(Gt,B,Lt,oe,ye+ys,Et,jt,ot,at):N.copyTexSubImage2D(Gt,B,Lt,oe,ye+ys,Et,jt,ot,at);Rt.bindFramebuffer(N.READ_FRAMEBUFFER,null),Rt.bindFramebuffer(N.DRAW_FRAMEBUFFER,null)}else Fe?w.isDataTexture||w.isData3DTexture?N.texSubImage3D(Gt,B,Lt,oe,ye,ot,at,mt,Ge,we,be.data):D.isCompressedArrayTexture?N.compressedTexSubImage3D(Gt,B,Lt,oe,ye,ot,at,mt,Ge,be.data):N.texSubImage3D(Gt,B,Lt,oe,ye,ot,at,mt,Ge,we,be):w.isDataTexture?N.texSubImage2D(N.TEXTURE_2D,B,Lt,oe,ot,at,Ge,we,be.data):w.isCompressedTexture?N.compressedTexSubImage2D(N.TEXTURE_2D,B,Lt,oe,be.width,be.height,Ge,be.data):N.texSubImage2D(N.TEXTURE_2D,B,Lt,oe,ot,at,Ge,we,be);N.pixelStorei(N.UNPACK_ROW_LENGTH,qi),N.pixelStorei(N.UNPACK_IMAGE_HEIGHT,Te),N.pixelStorei(N.UNPACK_SKIP_PIXELS,yi),N.pixelStorei(N.UNPACK_SKIP_ROWS,Nr),N.pixelStorei(N.UNPACK_SKIP_IMAGES,Jn),B===0&&D.generateMipmaps&&N.generateMipmap(Gt),Rt.unbindTexture()},this.copyTextureToTexture3D=function(w,D,F=null,k=null,B=0){return w.isTexture!==!0&&(La("WebGLRenderer: copyTextureToTexture3D function signature has changed."),F=arguments[0]||null,k=arguments[1]||null,w=arguments[2],D=arguments[3],B=arguments[4]||0),La('WebGLRenderer: copyTextureToTexture3D function has been deprecated. Use "copyTextureToTexture" instead.'),this.copyTextureToTexture(w,D,F,k,B)},this.initRenderTarget=function(w){Nt.get(w).__webglFramebuffer===void 0&&C.setupRenderTarget(w)},this.initTexture=function(w){w.isCubeTexture?C.setTextureCube(w,0):w.isData3DTexture?C.setTexture3D(w,0):w.isDataArrayTexture||w.isCompressedArrayTexture?C.setTexture2DArray(w,0):C.setTexture2D(w,0),Rt.unbindTexture()},this.resetState=function(){E=0,T=0,R=null,Rt.reset(),de.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return fs}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let e=this.getContext();e.drawingBufferColorspace=_e._getDrawingBufferColorSpace(t),e.unpackColorSpace=_e._getUnpackColorSpace()}},kc=class s{constructor(t,e=25e-5){this.isFogExp2=!0,this.name="",this.color=new Dt(t),this.density=e}clone(){return new s(this.color,this.density)}toJSON(){return{type:"FogExp2",name:this.name,color:this.color.getHex(),density:this.density}}};var zc=class extends on{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Gi,this.environmentIntensity=1,this.environmentRotation=new Gi,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}},hd=class{constructor(t,e){this.isInterleavedBuffer=!0,this.array=t,this.stride=e,this.count=t!==void 0?t.length/e:0,this.usage=Yf,this.updateRanges=[],this.version=0,this.uuid=Gs()}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.array=new t.array.constructor(t.array),this.count=t.count,this.stride=t.stride,this.usage=t.usage,this}copyAt(t,e,n){t*=this.stride,n*=e.stride;for(let i=0,r=this.stride;i<r;i++)this.array[t+i]=e.array[n+i];return this}set(t,e=0){return this.array.set(t,e),this}clone(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Gs()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let e=new this.array.constructor(t.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(e,this.stride);return n.setUsage(this.usage),n}onUpload(t){return this.onUploadCallback=t,this}toJSON(t){return t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Gs()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},Bn=new O,Hc=class s{constructor(t,e,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=t,this.itemSize=e,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(t){this.data.needsUpdate=t}applyMatrix4(t){for(let e=0,n=this.data.count;e<n;e++)Bn.fromBufferAttribute(this,e),Bn.applyMatrix4(t),this.setXYZ(e,Bn.x,Bn.y,Bn.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)Bn.fromBufferAttribute(this,e),Bn.applyNormalMatrix(t),this.setXYZ(e,Bn.x,Bn.y,Bn.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)Bn.fromBufferAttribute(this,e),Bn.transformDirection(t),this.setXYZ(e,Bn.x,Bn.y,Bn.z);return this}getComponent(t,e){let n=this.array[t*this.data.stride+this.offset+e];return this.normalized&&(n=zi(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=Ie(n,this.array)),this.data.array[t*this.data.stride+this.offset+e]=n,this}setX(t,e){return this.normalized&&(e=Ie(e,this.array)),this.data.array[t*this.data.stride+this.offset]=e,this}setY(t,e){return this.normalized&&(e=Ie(e,this.array)),this.data.array[t*this.data.stride+this.offset+1]=e,this}setZ(t,e){return this.normalized&&(e=Ie(e,this.array)),this.data.array[t*this.data.stride+this.offset+2]=e,this}setW(t,e){return this.normalized&&(e=Ie(e,this.array)),this.data.array[t*this.data.stride+this.offset+3]=e,this}getX(t){let e=this.data.array[t*this.data.stride+this.offset];return this.normalized&&(e=zi(e,this.array)),e}getY(t){let e=this.data.array[t*this.data.stride+this.offset+1];return this.normalized&&(e=zi(e,this.array)),e}getZ(t){let e=this.data.array[t*this.data.stride+this.offset+2];return this.normalized&&(e=zi(e,this.array)),e}getW(t){let e=this.data.array[t*this.data.stride+this.offset+3];return this.normalized&&(e=zi(e,this.array)),e}setXY(t,e,n){return t=t*this.data.stride+this.offset,this.normalized&&(e=Ie(e,this.array),n=Ie(n,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this}setXYZ(t,e,n,i){return t=t*this.data.stride+this.offset,this.normalized&&(e=Ie(e,this.array),n=Ie(n,this.array),i=Ie(i,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t=t*this.data.stride+this.offset,this.normalized&&(e=Ie(e,this.array),n=Ie(n,this.array),i=Ie(i,this.array),r=Ie(r,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this.data.array[t+3]=r,this}clone(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let e=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return new gn(new this.array.constructor(e),this.itemSize,this.normalized)}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new s(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let e=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.toJSON(t)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},Rr=class extends Wi{static get type(){return"SpriteMaterial"}constructor(t){super(),this.isSpriteMaterial=!0,this.color=new Dt(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.rotation=t.rotation,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}},xo,Aa=new O,vo=new O,yo=new O,Mo=new Xt,Ca=new Xt,L_=new Be,lc=new O,Ra=new O,cc=new O,Kg=new Xt,ef=new Xt,Qg=new Xt,Uo=class extends on{constructor(t=new Rr){if(super(),this.isSprite=!0,this.type="Sprite",xo===void 0){xo=new an;let e=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new hd(e,5);xo.setIndex([0,1,2,0,2,3]),xo.setAttribute("position",new Hc(n,3,0,!1)),xo.setAttribute("uv",new Hc(n,2,3,!1))}this.geometry=xo,this.material=t,this.center=new Xt(.5,.5)}raycast(t,e){t.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),vo.setFromMatrixScale(this.matrixWorld),L_.copy(t.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(t.camera.matrixWorldInverse,this.matrixWorld),yo.setFromMatrixPosition(this.modelViewMatrix),t.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&vo.multiplyScalar(-yo.z);let n=this.material.rotation,i,r;n!==0&&(r=Math.cos(n),i=Math.sin(n));let o=this.center;hc(lc.set(-.5,-.5,0),yo,o,vo,i,r),hc(Ra.set(.5,-.5,0),yo,o,vo,i,r),hc(cc.set(.5,.5,0),yo,o,vo,i,r),Kg.set(0,0),ef.set(1,0),Qg.set(1,1);let a=t.ray.intersectTriangle(lc,Ra,cc,!1,Aa);if(a===null&&(hc(Ra.set(-.5,.5,0),yo,o,vo,i,r),ef.set(0,1),a=t.ray.intersectTriangle(lc,cc,Ra,!1,Aa),a===null))return;let l=t.ray.origin.distanceTo(Aa);l<t.near||l>t.far||e.push({distance:l,point:Aa.clone(),uv:hs.getInterpolation(Aa,lc,Ra,cc,Kg,ef,Qg,new Xt),face:null,object:this})}copy(t,e){return super.copy(t,e),t.center!==void 0&&this.center.copy(t.center),this.material=t.material,this}};function hc(s,t,e,n,i,r){Mo.subVectors(s,e).addScalar(.5).multiply(n),i!==void 0?(Ca.x=r*Mo.x-i*Mo.y,Ca.y=i*Mo.x+r*Mo.y):Ca.copy(Mo),s.copy(t),s.x+=Ca.x,s.y+=Ca.y,s.applyMatrix4(L_)}var Ba=class extends Wi{static get type(){return"LineBasicMaterial"}constructor(t){super(),this.isLineBasicMaterial=!0,this.color=new Dt(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}},Vc=new O,Gc=new O,jg=new Be,Pa=new Oa,uc=new Cr,nf=new O,t_=new O,ud=class extends on{constructor(t=new an,e=new Ba){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[0];for(let i=1,r=e.count;i<r;i++)Vc.fromBufferAttribute(e,i-1),Gc.fromBufferAttribute(e,i),n[i]=n[i-1],n[i]+=Vc.distanceTo(Gc);t.setAttribute("lineDistance",new Ne(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(t,e){let n=this.geometry,i=this.matrixWorld,r=t.params.Line.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),uc.copy(n.boundingSphere),uc.applyMatrix4(i),uc.radius+=r,t.ray.intersectsSphere(uc)===!1)return;jg.copy(i).invert(),Pa.copy(t.ray).applyMatrix4(jg);let a=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=a*a,c=this.isLineSegments?2:1,h=n.index,f=n.attributes.position;if(h!==null){let d=Math.max(0,o.start),_=Math.min(h.count,o.start+o.count);for(let g=d,m=_-1;g<m;g+=c){let p=h.getX(g),S=h.getX(g+1),M=fc(this,t,Pa,l,p,S);M&&e.push(M)}if(this.isLineLoop){let g=h.getX(_-1),m=h.getX(d),p=fc(this,t,Pa,l,g,m);p&&e.push(p)}}else{let d=Math.max(0,o.start),_=Math.min(f.count,o.start+o.count);for(let g=d,m=_-1;g<m;g+=c){let p=fc(this,t,Pa,l,g,g+1);p&&e.push(p)}if(this.isLineLoop){let g=fc(this,t,Pa,l,_-1,d);g&&e.push(g)}}}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}};function fc(s,t,e,n,i,r){let o=s.geometry.attributes.position;if(Vc.fromBufferAttribute(o,i),Gc.fromBufferAttribute(o,r),e.distanceSqToSegment(Vc,Gc,nf,t_)>n)return;nf.applyMatrix4(s.matrixWorld);let l=t.ray.origin.distanceTo(nf);if(!(l<t.near||l>t.far))return{distance:l,point:t_.clone().applyMatrix4(s.matrixWorld),index:i,face:null,faceIndex:null,barycoord:null,object:s}}var e_=new O,n_=new O,Wc=class extends ud{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[];for(let i=0,r=e.count;i<r;i+=2)e_.fromBufferAttribute(e,i),n_.fromBufferAttribute(e,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+e_.distanceTo(n_);t.setAttribute("lineDistance",new Ne(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}};var ka=class extends Wi{static get type(){return"PointsMaterial"}constructor(t){super(),this.isPointsMaterial=!0,this.color=new Dt(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.size=t.size,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}},i_=new Be,fd=new Oa,dc=new Cr,pc=new O,za=class extends on{constructor(t=new an,e=new ka){super(),this.isPoints=!0,this.type="Points",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}raycast(t,e){let n=this.geometry,i=this.matrixWorld,r=t.params.Points.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),dc.copy(n.boundingSphere),dc.applyMatrix4(i),dc.radius+=r,t.ray.intersectsSphere(dc)===!1)return;i_.copy(i).invert(),fd.copy(t.ray).applyMatrix4(i_);let a=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=a*a,c=n.index,u=n.attributes.position;if(c!==null){let f=Math.max(0,o.start),d=Math.min(c.count,o.start+o.count);for(let _=f,g=d;_<g;_++){let m=c.getX(_);pc.fromBufferAttribute(u,m),s_(pc,m,l,i,t,e,this)}}else{let f=Math.max(0,o.start),d=Math.min(u.count,o.start+o.count);for(let _=f,g=d;_<g;_++)pc.fromBufferAttribute(u,_),s_(pc,_,l,i,t,e,this)}}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}};function s_(s,t,e,n,i,r,o){let a=fd.distanceSqToPoint(s);if(a<e){let l=new O;fd.closestPointToPoint(s,l),l.applyMatrix4(n);let c=i.ray.origin.distanceTo(l);if(c<i.near||c>i.far)return;r.push({distance:c,distanceToRay:Math.sqrt(a),point:l,index:t,face:null,faceIndex:null,barycoord:null,object:o})}}var Xc=class extends ai{constructor(t,e,n,i,r,o,a,l,c){super(t,e,n,i,r,o,a,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}};var qc=class s extends an{constructor(t=1,e=32,n=0,i=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:t,segments:e,thetaStart:n,thetaLength:i},e=Math.max(3,e);let r=[],o=[],a=[],l=[],c=new O,h=new Xt;o.push(0,0,0),a.push(0,0,1),l.push(.5,.5);for(let u=0,f=3;u<=e;u++,f+=3){let d=n+u/e*i;c.x=t*Math.cos(d),c.y=t*Math.sin(d),o.push(c.x,c.y,c.z),a.push(0,0,1),h.x=(o[f]/t+1)/2,h.y=(o[f+1]/t+1)/2,l.push(h.x,h.y)}for(let u=1;u<=e;u++)r.push(u,u+1,0);this.setIndex(r),this.setAttribute("position",new Ne(o,3)),this.setAttribute("normal",new Ne(a,3)),this.setAttribute("uv",new Ne(l,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.radius,t.segments,t.thetaStart,t.thetaLength)}},No=class s extends an{constructor(t=1,e=1,n=1,i=32,r=1,o=!1,a=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:i,heightSegments:r,openEnded:o,thetaStart:a,thetaLength:l};let c=this;i=Math.floor(i),r=Math.floor(r);let h=[],u=[],f=[],d=[],_=0,g=[],m=n/2,p=0;S(),o===!1&&(t>0&&M(!0),e>0&&M(!1)),this.setIndex(h),this.setAttribute("position",new Ne(u,3)),this.setAttribute("normal",new Ne(f,3)),this.setAttribute("uv",new Ne(d,2));function S(){let x=new O,A=new O,E=0,T=(e-t)/n;for(let R=0;R<=r;R++){let y=[],v=R/r,P=v*(e-t)+t;for(let U=0;U<=i;U++){let z=U/i,V=z*l+a,$=Math.sin(V),X=Math.cos(V);A.x=P*$,A.y=-v*n+m,A.z=P*X,u.push(A.x,A.y,A.z),x.set($,T,X).normalize(),f.push(x.x,x.y,x.z),d.push(z,1-v),y.push(_++)}g.push(y)}for(let R=0;R<i;R++)for(let y=0;y<r;y++){let v=g[y][R],P=g[y+1][R],U=g[y+1][R+1],z=g[y][R+1];(t>0||y!==0)&&(h.push(v,P,z),E+=3),(e>0||y!==r-1)&&(h.push(P,U,z),E+=3)}c.addGroup(p,E,0),p+=E}function M(x){let A=_,E=new Xt,T=new O,R=0,y=x===!0?t:e,v=x===!0?1:-1;for(let U=1;U<=i;U++)u.push(0,m*v,0),f.push(0,v,0),d.push(.5,.5),_++;let P=_;for(let U=0;U<=i;U++){let V=U/i*l+a,$=Math.cos(V),X=Math.sin(V);T.x=y*X,T.y=m*v,T.z=y*$,u.push(T.x,T.y,T.z),f.push(0,v,0),E.x=$*.5+.5,E.y=X*.5*v+.5,d.push(E.x,E.y),_++}for(let U=0;U<i;U++){let z=A+U,V=P+U;x===!0?h.push(V,V+1,z):h.push(V+1,V,z),R+=3}c.addGroup(p,R,x===!0?1:2),p+=R}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Yc=class s extends No{constructor(t=1,e=1,n=32,i=1,r=!1,o=0,a=Math.PI*2){super(0,t,e,n,i,r,o,a),this.type="ConeGeometry",this.parameters={radius:t,height:e,radialSegments:n,heightSegments:i,openEnded:r,thetaStart:o,thetaLength:a}}static fromJSON(t){return new s(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}};var mc=new O,gc=new O,sf=new O,_c=new hs,Zc=class extends an{constructor(t=null,e=1){if(super(),this.type="EdgesGeometry",this.parameters={geometry:t,thresholdAngle:e},t!==null){let i=Math.pow(10,4),r=Math.cos(wc*e),o=t.getIndex(),a=t.getAttribute("position"),l=o?o.count:a.count,c=[0,0,0],h=["a","b","c"],u=new Array(3),f={},d=[];for(let _=0;_<l;_+=3){o?(c[0]=o.getX(_),c[1]=o.getX(_+1),c[2]=o.getX(_+2)):(c[0]=_,c[1]=_+1,c[2]=_+2);let{a:g,b:m,c:p}=_c;if(g.fromBufferAttribute(a,c[0]),m.fromBufferAttribute(a,c[1]),p.fromBufferAttribute(a,c[2]),_c.getNormal(sf),u[0]=`${Math.round(g.x*i)},${Math.round(g.y*i)},${Math.round(g.z*i)}`,u[1]=`${Math.round(m.x*i)},${Math.round(m.y*i)},${Math.round(m.z*i)}`,u[2]=`${Math.round(p.x*i)},${Math.round(p.y*i)},${Math.round(p.z*i)}`,!(u[0]===u[1]||u[1]===u[2]||u[2]===u[0]))for(let S=0;S<3;S++){let M=(S+1)%3,x=u[S],A=u[M],E=_c[h[S]],T=_c[h[M]],R=`${x}_${A}`,y=`${A}_${x}`;y in f&&f[y]?(sf.dot(f[y].normal)<=r&&(d.push(E.x,E.y,E.z),d.push(T.x,T.y,T.z)),f[y]=null):R in f||(f[R]={index0:c[S],index1:c[M],normal:sf.clone()})}}for(let _ in f)if(f[_]){let{index0:g,index1:m}=f[_];mc.fromBufferAttribute(a,g),gc.fromBufferAttribute(a,m),d.push(mc.x,mc.y,mc.z),d.push(gc.x,gc.y,gc.z)}this.setAttribute("position",new Ne(d,3))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}};var $c=class s extends an{constructor(t=.5,e=1,n=32,i=1,r=0,o=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:t,outerRadius:e,thetaSegments:n,phiSegments:i,thetaStart:r,thetaLength:o},n=Math.max(3,n),i=Math.max(1,i);let a=[],l=[],c=[],h=[],u=t,f=(e-t)/i,d=new O,_=new Xt;for(let g=0;g<=i;g++){for(let m=0;m<=n;m++){let p=r+m/n*o;d.x=u*Math.cos(p),d.y=u*Math.sin(p),l.push(d.x,d.y,d.z),c.push(0,0,1),_.x=(d.x/e+1)/2,_.y=(d.y/e+1)/2,h.push(_.x,_.y)}u+=f}for(let g=0;g<i;g++){let m=g*(n+1);for(let p=0;p<n;p++){let S=p+m,M=S,x=S+n+1,A=S+n+2,E=S+1;a.push(M,x,E),a.push(x,A,E)}}this.setIndex(a),this.setAttribute("position",new Ne(l,3)),this.setAttribute("normal",new Ne(c,3)),this.setAttribute("uv",new Ne(h,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}};var Oo=class s extends an{constructor(t=1,e=32,n=16,i=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:i,phiLength:r,thetaStart:o,thetaLength:a},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));let l=Math.min(o+a,Math.PI),c=0,h=[],u=new O,f=new O,d=[],_=[],g=[],m=[];for(let p=0;p<=n;p++){let S=[],M=p/n,x=0;p===0&&o===0?x=.5/e:p===n&&l===Math.PI&&(x=-.5/e);for(let A=0;A<=e;A++){let E=A/e;u.x=-t*Math.cos(i+E*r)*Math.sin(o+M*a),u.y=t*Math.cos(o+M*a),u.z=t*Math.sin(i+E*r)*Math.sin(o+M*a),_.push(u.x,u.y,u.z),f.copy(u).normalize(),g.push(f.x,f.y,f.z),m.push(E+x,1-M),S.push(c++)}h.push(S)}for(let p=0;p<n;p++)for(let S=0;S<e;S++){let M=h[p][S+1],x=h[p][S],A=h[p+1][S],E=h[p+1][S+1];(p!==0||o>0)&&d.push(M,x,E),(p!==n-1||l<Math.PI)&&d.push(x,A,E)}this.setIndex(d),this.setAttribute("position",new Ne(_,3)),this.setAttribute("normal",new Ne(g,3)),this.setAttribute("uv",new Ne(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}};var Jc=class extends en{static get type(){return"RawShaderMaterial"}constructor(t){super(t),this.isRawShaderMaterial=!0}},Qe=class extends Wi{static get type(){return"MeshStandardMaterial"}constructor(t){super(),this.isMeshStandardMaterial=!0,this.defines={STANDARD:""},this.color=new Dt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Dt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=S_,this.normalScale=new Xt(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Gi,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}};function xc(s,t,e){return!s||!e&&s.constructor===t?s:typeof t.BYTES_PER_ELEMENT=="number"?new t(s):Array.prototype.slice.call(s)}function Hw(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)}var Fo=class{constructor(t,e,n,i){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,i=e[n],r=e[n-1];n:{t:{let o;e:{i:if(!(t<i)){for(let a=n+2;;){if(i===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=i,i=e[++n],t<i)break t}o=e.length;break e}if(!(t>=r)){let a=e[1];t<a&&(n=2,r=a);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(i=r,r=e[--n-1],t>=r)break t}o=n,n=0;break e}break n}for(;n<o;){let a=n+o>>>1;t<e[a]?o=a:n=a+1}if(i=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,t,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=t*i;for(let o=0;o!==i;++o)e[o]=n[r+o];return e}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},dd=class extends Fo{constructor(t,e,n,i){super(t,e,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:ng,endingEnd:ng}}intervalChanged_(t,e,n){let i=this.parameterPositions,r=t-2,o=t+1,a=i[r],l=i[o];if(a===void 0)switch(this.getSettings_().endingStart){case ig:r=t,a=2*e-n;break;case sg:r=i.length-2,a=e+i[r]-i[r+1];break;default:r=t,a=n}if(l===void 0)switch(this.getSettings_().endingEnd){case ig:o=t,l=2*n-e;break;case sg:o=1,l=n+i[1]-i[0];break;default:o=t-1,l=e}let c=(n-e)*.5,h=this.valueSize;this._weightPrev=c/(e-a),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(t,e,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=this._offsetPrev,u=this._offsetNext,f=this._weightPrev,d=this._weightNext,_=(n-e)/(i-e),g=_*_,m=g*_,p=-f*m+2*f*g-f*_,S=(1+f)*m+(-1.5-2*f)*g+(-.5+f)*_+1,M=(-1-d)*m+(1.5+d)*g+.5*_,x=d*m-d*g;for(let A=0;A!==a;++A)r[A]=p*o[h+A]+S*o[c+A]+M*o[l+A]+x*o[u+A];return r}},pd=class extends Fo{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=(n-e)/(i-e),u=1-h;for(let f=0;f!==a;++f)r[f]=o[c+f]*u+o[l+f]*h;return r}},md=class extends Fo{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t){return this.copySampleValue_(t-1)}},Ri=class{constructor(t,e,n,i){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=xc(e,this.TimeBufferType),this.values=xc(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:xc(t.times,Array),values:xc(t.values,Array)};let i=t.getInterpolation();i!==t.DefaultInterpolation&&(n.interpolation=i)}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new md(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new pd(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new dd(this.times,this.values,this.getValueSize(),t)}setInterpolation(t){let e;switch(t){case Tc:e=this.InterpolantFactoryMethodDiscrete;break;case qf:e=this.InterpolantFactoryMethodLinear;break;case Au:e=this.InterpolantFactoryMethodSmooth;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Tc;case this.InterpolantFactoryMethodLinear:return qf;case this.InterpolantFactoryMethodSmooth:return Au}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]+=t}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]*=t}return this}trim(t,e){let n=this.times,i=n.length,r=0,o=i-1;for(;r!==i&&n[r]<t;)++r;for(;o!==-1&&n[o]>e;)--o;if(++o,r!==0||o!==i){r>=o&&(o=Math.max(o,1),r=o-1);let a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,i=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),t=!1);let o=null;for(let a=0;a!==r;a++){let l=n[a];if(typeof l=="number"&&isNaN(l)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,a,l),t=!1;break}if(o!==null&&o>l){console.error("THREE.KeyframeTrack: Out of order keys.",this,a,l,o),t=!1;break}o=l}if(i!==void 0&&Hw(i))for(let a=0,l=i.length;a!==l;++a){let c=i[a];if(isNaN(c)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,a,c),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===Au,r=t.length-1,o=1;for(let a=1;a<r;++a){let l=!1,c=t[a],h=t[a+1];if(c!==h&&(a!==1||c!==t[0]))if(i)l=!0;else{let u=a*n,f=u-n,d=u+n;for(let _=0;_!==n;++_){let g=e[u+_];if(g!==e[f+_]||g!==e[d+_]){l=!0;break}}}if(l){if(a!==o){t[o]=t[a];let u=a*n,f=o*n;for(let d=0;d!==n;++d)e[f+d]=e[u+d]}++o}}if(r>0){t[o]=t[r];for(let a=r*n,l=o*n,c=0;c!==n;++c)e[l+c]=e[a+c];++o}return o!==t.length?(this.times=t.slice(0,o),this.values=e.slice(0,o*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,i=new n(this.name,t,e);return i.createInterpolant=this.createInterpolant,i}};Ri.prototype.TimeBufferType=Float32Array;Ri.prototype.ValueBufferType=Float32Array;Ri.prototype.DefaultInterpolation=qf;var Pr=class extends Ri{constructor(t,e,n){super(t,e,n)}};Pr.prototype.ValueTypeName="bool";Pr.prototype.ValueBufferType=Array;Pr.prototype.DefaultInterpolation=Tc;Pr.prototype.InterpolantFactoryMethodLinear=void 0;Pr.prototype.InterpolantFactoryMethodSmooth=void 0;var gd=class extends Ri{};gd.prototype.ValueTypeName="color";var _d=class extends Ri{};_d.prototype.ValueTypeName="number";var xd=class extends Fo{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=(n-e)/(i-e),c=t*a;for(let h=c+a;c!==h;c+=4)qs.slerpFlat(r,0,o,c-a,o,c,l);return r}},Kc=class extends Ri{InterpolantFactoryMethodLinear(t){return new xd(this.times,this.values,this.getValueSize(),t)}};Kc.prototype.ValueTypeName="quaternion";Kc.prototype.InterpolantFactoryMethodSmooth=void 0;var Ir=class extends Ri{constructor(t,e,n){super(t,e,n)}};Ir.prototype.ValueTypeName="string";Ir.prototype.ValueBufferType=Array;Ir.prototype.DefaultInterpolation=Tc;Ir.prototype.InterpolantFactoryMethodLinear=void 0;Ir.prototype.InterpolantFactoryMethodSmooth=void 0;var vd=class extends Ri{};vd.prototype.ValueTypeName="vector";var yd=class{constructor(t,e,n){let i=this,r=!1,o=0,a=0,l,c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this.itemStart=function(h){a++,r===!1&&i.onStart!==void 0&&i.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,i.onProgress!==void 0&&i.onProgress(h,o,a),o===a&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,u){return c.push(h,u),this},this.removeHandler=function(h){let u=c.indexOf(h);return u!==-1&&c.splice(u,2),this},this.getHandler=function(h){for(let u=0,f=c.length;u<f;u+=2){let d=c[u],_=c[u+1];if(d.global&&(d.lastIndex=0),d.test(h))return _}return null}}},Vw=new yd,Md=class{constructor(t){this.manager=t!==void 0?t:Vw,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(t,e){let n=this;return new Promise(function(i,r){n.load(t,i,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}};Md.DEFAULT_MATERIAL_NAME="__DEFAULT";var Bo=class extends on{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new Dt(t),this.intensity=e}dispose(){}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){let e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,this.groundColor!==void 0&&(e.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(e.object.distance=this.distance),this.angle!==void 0&&(e.object.angle=this.angle),this.decay!==void 0&&(e.object.decay=this.decay),this.penumbra!==void 0&&(e.object.penumbra=this.penumbra),this.shadow!==void 0&&(e.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(e.object.target=this.target.uuid),e}},Qc=class extends Bo{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(on.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Dt(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}},rf=new Be,r_=new O,o_=new O,Ha=class{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Xt(512,512),this.map=null,this.mapPass=null,this.matrix=new Be,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Fa,this._frameExtents=new Xt(1,1),this._viewportCount=1,this._viewports=[new Le(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){let e=this.camera,n=this.matrix;r_.setFromMatrixPosition(t.matrixWorld),e.position.copy(r_),o_.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(o_),e.updateMatrixWorld(),rf.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(rf),n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(rf)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.mapSize.copy(t.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){let t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}},Sd=class extends Ha{constructor(){super(new yn(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1}updateMatrices(t){let e=this.camera,n=Ac*2*t.angle*this.focus,i=this.mapSize.width/this.mapSize.height,r=t.distance||e.far;(n!==e.fov||i!==e.aspect||r!==e.far)&&(e.fov=n,e.aspect=i,e.far=r,e.updateProjectionMatrix()),super.updateMatrices(t)}copy(t){return super.copy(t),this.focus=t.focus,this}},jc=class extends Bo{constructor(t,e,n=0,i=Math.PI/3,r=0,o=2){super(t,e),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(on.DEFAULT_UP),this.updateMatrix(),this.target=new on,this.distance=n,this.angle=i,this.penumbra=r,this.decay=o,this.map=null,this.shadow=new Sd}get power(){return this.intensity*Math.PI}set power(t){this.intensity=t/Math.PI}dispose(){this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.angle=t.angle,this.penumbra=t.penumbra,this.decay=t.decay,this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}},a_=new Be,Ia=new O,of=new O,bd=class extends Ha{constructor(){super(new yn(90,1,.5,500)),this.isPointLightShadow=!0,this._frameExtents=new Xt(4,2),this._viewportCount=6,this._viewports=[new Le(2,1,1,1),new Le(0,1,1,1),new Le(3,1,1,1),new Le(1,1,1,1),new Le(3,0,1,1),new Le(1,0,1,1)],this._cubeDirections=[new O(1,0,0),new O(-1,0,0),new O(0,0,1),new O(0,0,-1),new O(0,1,0),new O(0,-1,0)],this._cubeUps=[new O(0,1,0),new O(0,1,0),new O(0,1,0),new O(0,1,0),new O(0,0,1),new O(0,0,-1)]}updateMatrices(t,e=0){let n=this.camera,i=this.matrix,r=t.distance||n.far;r!==n.far&&(n.far=r,n.updateProjectionMatrix()),Ia.setFromMatrixPosition(t.matrixWorld),n.position.copy(Ia),of.copy(n.position),of.add(this._cubeDirections[e]),n.up.copy(this._cubeUps[e]),n.lookAt(of),n.updateMatrixWorld(),i.makeTranslation(-Ia.x,-Ia.y,-Ia.z),a_.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),this._frustum.setFromProjectionMatrix(a_)}},Va=class extends Bo{constructor(t,e,n=0,i=2){super(t,e),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new bd}get power(){return this.intensity*4*Math.PI}set power(t){this.intensity=t/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.decay=t.decay,this.shadow=t.shadow.clone(),this}},wd=class extends Ha{constructor(){super(new Do(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},th=class extends Bo{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(on.DEFAULT_UP),this.updateMatrix(),this.target=new on,this.shadow=new wd}dispose(){this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}};var eh=class{constructor(t=!0){this.autoStart=t,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1}start(){this.startTime=l_(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let t=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){let e=l_();t=(e-this.oldTime)/1e3,this.oldTime=e,this.elapsedTime+=t}return t}};function l_(){return performance.now()}var kd="\\[\\]\\.:\\/",Gw=new RegExp("["+kd+"]","g"),zd="[^"+kd+"]",Ww="[^"+kd.replace("\\.","")+"]",Xw=/((?:WC+[\/:])*)/.source.replace("WC",zd),qw=/(WCOD+)?/.source.replace("WCOD",Ww),Yw=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",zd),Zw=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",zd),$w=new RegExp("^"+Xw+qw+Yw+Zw+"$"),Jw=["material","materials","bones","map"],Td=class{constructor(t,e,n){let i=n||ze.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,i)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},ze=class s{constructor(t,e,n){this.path=e,this.parsedPath=n||s.parseTrackName(e),this.node=s.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new s.Composite(t,e,n):new s(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(Gw,"")}static parseTrackName(t){let e=$w.exec(t);if(e===null)throw new Error("PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);Jw.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let o=0;o<r.length;o++){let a=r[o];if(a.name===e||a.uuid===e)return a;let l=n(a.children);if(l)return l}return null},i=n(t.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)t[e++]=n[i]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,i=e.propertyName,r=e.propertyIndex;if(t||(t=s.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=e.objectIndex;switch(n){case"materials":if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===c){c=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(c!==void 0){if(t[c]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}let o=t[i];if(o===void 0){let c=e.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+c+"."+i+" but it wasn't found.",t);return}let a=this.Versioning.None;this.targetObject=t,t.needsUpdate!==void 0?a=this.Versioning.NeedsUpdate:t.matrixWorldNeedsUpdate!==void 0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!t.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(l=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};ze.Composite=Td;ze.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};ze.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};ze.prototype.GetterByBindingType=[ze.prototype._getValue_direct,ze.prototype._getValue_array,ze.prototype._getValue_arrayElement,ze.prototype._getValue_toArray];ze.prototype.SetterByBindingTypeAndVersioning=[[ze.prototype._setValue_direct,ze.prototype._setValue_direct_setNeedsUpdate,ze.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[ze.prototype._setValue_array,ze.prototype._setValue_array_setNeedsUpdate,ze.prototype._setValue_array_setMatrixWorldNeedsUpdate],[ze.prototype._setValue_arrayElement,ze.prototype._setValue_arrayElement_setNeedsUpdate,ze.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[ze.prototype._setValue_fromArray,ze.prototype._setValue_fromArray_setNeedsUpdate,ze.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var U1=new Float32Array(1);typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Ed}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Ed);var rh={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};var li=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},Qw=new Do(-1,1,1,-1,0,1),Hd=class extends an{constructor(){super(),this.setAttribute("position",new Ne([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new Ne([0,2,0,0,2,0],2))}},jw=new Hd,Zs=class{constructor(t){this._mesh=new Ht(jw,t)}dispose(){this._mesh.geometry.dispose()}render(t){t.render(this._mesh,Qw)}get material(){return this._mesh.material}set material(t){this._mesh.material=t}};var oh=class extends li{constructor(t,e){super(),this.textureID=e!==void 0?e:"tDiffuse",t instanceof en?(this.uniforms=t.uniforms,this.material=t):t&&(this.uniforms=Ys.clone(t.uniforms),this.material=new en({name:t.name!==void 0?t.name:"unspecified",defines:Object.assign({},t.defines),uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader})),this.fsQuad=new Zs(this.material)}render(t,e,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this.fsQuad.material=this.material,this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(e),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this.fsQuad.render(t))}dispose(){this.material.dispose(),this.fsQuad.dispose()}};var Wa=class extends li{constructor(t,e){super(),this.scene=t,this.camera=e,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(t,e,n){let i=t.getContext(),r=t.state;r.buffers.color.setMask(!1),r.buffers.depth.setMask(!1),r.buffers.color.setLocked(!0),r.buffers.depth.setLocked(!0);let o,a;this.inverse?(o=0,a=1):(o=1,a=0),r.buffers.stencil.setTest(!0),r.buffers.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),r.buffers.stencil.setFunc(i.ALWAYS,o,4294967295),r.buffers.stencil.setClear(a),r.buffers.stencil.setLocked(!0),t.setRenderTarget(n),this.clear&&t.clear(),t.render(this.scene,this.camera),t.setRenderTarget(e),this.clear&&t.clear(),t.render(this.scene,this.camera),r.buffers.color.setLocked(!1),r.buffers.depth.setLocked(!1),r.buffers.color.setMask(!0),r.buffers.depth.setMask(!0),r.buffers.stencil.setLocked(!1),r.buffers.stencil.setFunc(i.EQUAL,1,4294967295),r.buffers.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),r.buffers.stencil.setLocked(!0)}},ah=class extends li{constructor(){super(),this.needsSwap=!1}render(t){t.state.buffers.stencil.setLocked(!1),t.state.buffers.stencil.setTest(!1)}};var lh=class{constructor(t,e){if(this.renderer=t,this._pixelRatio=t.getPixelRatio(),e===void 0){let n=t.getSize(new Xt);this._width=n.width,this._height=n.height,e=new zn(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:Pi}),e.texture.name="EffectComposer.rt1"}else this._width=e.width,this._height=e.height;this.renderTarget1=e,this.renderTarget2=e.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new oh(rh),this.copyPass.material.blending=Vi,this.clock=new eh}swapBuffers(){let t=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=t}addPass(t){this.passes.push(t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(t,e){this.passes.splice(e,0,t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(t){let e=this.passes.indexOf(t);e!==-1&&this.passes.splice(e,1)}isLastEnabledPass(t){for(let e=t+1;e<this.passes.length;e++)if(this.passes[e].enabled)return!1;return!0}render(t){t===void 0&&(t=this.clock.getDelta());let e=this.renderer.getRenderTarget(),n=!1;for(let i=0,r=this.passes.length;i<r;i++){let o=this.passes[i];if(o.enabled!==!1){if(o.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(i),o.render(this.renderer,this.writeBuffer,this.readBuffer,t,n),o.needsSwap){if(n){let a=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(a.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,t),l.setFunc(a.EQUAL,1,4294967295)}this.swapBuffers()}Wa!==void 0&&(o instanceof Wa?n=!0:o instanceof ah&&(n=!1))}}this.renderer.setRenderTarget(e)}reset(t){if(t===void 0){let e=this.renderer.getSize(new Xt);this._pixelRatio=this.renderer.getPixelRatio(),this._width=e.width,this._height=e.height,t=this.renderTarget1.clone(),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=t,this.renderTarget2=t.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(t,e){this._width=t,this._height=e;let n=this._width*this._pixelRatio,i=this._height*this._pixelRatio;this.renderTarget1.setSize(n,i),this.renderTarget2.setSize(n,i);for(let r=0;r<this.passes.length;r++)this.passes[r].setSize(n,i)}setPixelRatio(t){this._pixelRatio=t,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}};var ch=class extends li{constructor(t,e,n=null,i=null,r=null){super(),this.scene=t,this.camera=e,this.overrideMaterial=n,this.clearColor=i,this.clearAlpha=r,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this._oldClearColor=new Dt}render(t,e,n){let i=t.autoClear;t.autoClear=!1;let r,o;this.overrideMaterial!==null&&(o=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(t.getClearColor(this._oldClearColor),t.setClearColor(this.clearColor,t.getClearAlpha())),this.clearAlpha!==null&&(r=t.getClearAlpha(),t.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&t.clearDepth(),t.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),t.render(this.scene,this.camera),this.clearColor!==null&&t.setClearColor(this._oldClearColor),this.clearAlpha!==null&&t.setClearAlpha(r),this.overrideMaterial!==null&&(this.scene.overrideMaterial=o),t.autoClear=i}};var D_={name:"LuminosityHighPassShader",shaderID:"luminosityHighPass",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new Dt(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};var Ho=class s extends li{constructor(t,e,n,i){super(),this.strength=e!==void 0?e:1,this.radius=n,this.threshold=i,this.resolution=t!==void 0?new Xt(t.x,t.y):new Xt(256,256),this.clearColor=new Dt(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let r=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);this.renderTargetBright=new zn(r,o,{type:Pi}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let u=0;u<this.nMips;u++){let f=new zn(r,o,{type:Pi});f.texture.name="UnrealBloomPass.h"+u,f.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(f);let d=new zn(r,o,{type:Pi});d.texture.name="UnrealBloomPass.v"+u,d.texture.generateMipmaps=!1,this.renderTargetsVertical.push(d),r=Math.round(r/2),o=Math.round(o/2)}let a=D_;this.highPassUniforms=Ys.clone(a.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new en({uniforms:this.highPassUniforms,vertexShader:a.vertexShader,fragmentShader:a.fragmentShader}),this.separableBlurMaterials=[];let l=[3,5,7,9,11];r=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);for(let u=0;u<this.nMips;u++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(l[u])),this.separableBlurMaterials[u].uniforms.invSize.value=new Xt(1/r,1/o),r=Math.round(r/2),o=Math.round(o/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=e,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new O(1,1,1),new O(1,1,1),new O(1,1,1),new O(1,1,1),new O(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;let h=rh;this.copyUniforms=Ys.clone(h.uniforms),this.blendMaterial=new en({uniforms:this.copyUniforms,vertexShader:h.vertexShader,fragmentShader:h.fragmentShader,blending:xi,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new Dt,this.oldClearAlpha=1,this.basic=new De,this.fsQuad=new Zs(null)}dispose(){for(let t=0;t<this.renderTargetsHorizontal.length;t++)this.renderTargetsHorizontal[t].dispose();for(let t=0;t<this.renderTargetsVertical.length;t++)this.renderTargetsVertical[t].dispose();this.renderTargetBright.dispose();for(let t=0;t<this.separableBlurMaterials.length;t++)this.separableBlurMaterials[t].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(t,e){let n=Math.round(t/2),i=Math.round(e/2);this.renderTargetBright.setSize(n,i);for(let r=0;r<this.nMips;r++)this.renderTargetsHorizontal[r].setSize(n,i),this.renderTargetsVertical[r].setSize(n,i),this.separableBlurMaterials[r].uniforms.invSize.value=new Xt(1/n,1/i),n=Math.round(n/2),i=Math.round(i/2)}render(t,e,n,i,r){t.getClearColor(this._oldClearColor),this.oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),r&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=n.texture,t.setRenderTarget(null),t.clear(),this.fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=n.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this.fsQuad.render(t);let a=this.renderTargetBright;for(let l=0;l<this.nMips;l++)this.fsQuad.material=this.separableBlurMaterials[l],this.separableBlurMaterials[l].uniforms.colorTexture.value=a.texture,this.separableBlurMaterials[l].uniforms.direction.value=s.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[l]),t.clear(),this.fsQuad.render(t),this.separableBlurMaterials[l].uniforms.colorTexture.value=this.renderTargetsHorizontal[l].texture,this.separableBlurMaterials[l].uniforms.direction.value=s.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[l]),t.clear(),this.fsQuad.render(t),a=this.renderTargetsVertical[l];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this.fsQuad.render(t),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,r&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(n),this.fsQuad.render(t)),t.setClearColor(this._oldClearColor,this.oldClearAlpha),t.autoClear=o}getSeperableBlurMaterial(t){let e=[];for(let n=0;n<t;n++)e.push(.39894*Math.exp(-.5*n*n/(t*t))/t);return new en({defines:{KERNEL_RADIUS:t},uniforms:{colorTexture:{value:null},invSize:{value:new Xt(.5,.5)},direction:{value:new Xt(.5,.5)},gaussianCoefficients:{value:e}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`})}getCompositeMaterial(t){return new en({defines:{NUM_MIPS:t},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`})}};Ho.BlurDirectionX=new Xt(1,0);Ho.BlurDirectionY=new Xt(0,1);var U_={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`
	
		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};var hh=class extends li{constructor(){super();let t=U_;this.uniforms=Ys.clone(t.uniforms),this.material=new Jc({name:t.name,uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader}),this.fsQuad=new Zs(this.material),this._outputColorSpace=null,this._toneMapping=null}render(t,e,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=t.toneMappingExposure,(this._outputColorSpace!==t.outputColorSpace||this._toneMapping!==t.toneMapping)&&(this._outputColorSpace=t.outputColorSpace,this._toneMapping=t.toneMapping,this.material.defines={},_e.getTransfer(this._outputColorSpace)===Ae&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===Ad?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===Cd?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===Rd?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===Ga?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===Pd?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===Id&&(this.material.defines.NEUTRAL_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(e),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this.fsQuad.render(t))}dispose(){this.material.dispose(),this.fsQuad.dispose()}};var je=(()=>{let s=7;return()=>(s=s*16807%2147483647)/2147483647})();var t1=(s,t,e)=>Math.max(t,Math.min(e,s)),e1=s=>s*s*(3-2*s);function ms(s,t){let e=document.createElement("canvas");return e.width=s,e.height=t,[e,e.getContext("2d")]}function gs(s,t=!0){let e=new Xc(s);return t&&(e.colorSpace=Yn),e.anisotropy=8,e}function n1(){let[s,t]=ms(128,128),e=t.createRadialGradient(64,64,0,64,64,64);return e.addColorStop(0,"rgba(255,255,255,1)"),e.addColorStop(.25,"rgba(255,255,255,.55)"),e.addColorStop(1,"rgba(255,255,255,0)"),t.fillStyle=e,t.fillRect(0,0,128,128),gs(s)}function i1(){let[s,t]=ms(64,256);for(let e=0;e<256;e++){let n=Math.pow(1-e/256,1.6),i=t.createLinearGradient(0,0,64,0);i.addColorStop(0,"rgba(255,255,255,0)"),i.addColorStop(.5,`rgba(255,255,255,${n})`),i.addColorStop(1,"rgba(255,255,255,0)"),t.fillStyle=i,t.fillRect(0,e,64,1)}return gs(s)}function Vd({w:s,h:t,base:e,litRatio:n,ground:i=3.8,ppm:r=40}){let o=Math.round(s*r),a=Math.round(t*r),[l,c]=ms(o,a),[h,u]=ms(o,a),f=c.createLinearGradient(0,0,0,a);f.addColorStop(0,e[0]),f.addColorStop(1,e[1]),c.fillStyle=f,c.fillRect(0,0,o,a),u.fillStyle="#000",u.fillRect(0,0,o,a);for(let g=0;g<o*a/900;g++)c.fillStyle=`rgba(255,255,255,${je()*.025})`,c.fillRect(je()*o,je()*a,2,2);c.fillStyle="rgba(0,0,0,.35)";for(let g=i;g<t;g+=3.3)c.fillRect(0,a-g*r,o,3);let d=Math.max(2,Math.round(s/2.1)),_=(s-1.2)/d;for(let g=i+.9;g+1.9<t-.4;g+=3.3)for(let m=0;m<d;m++){let p=.6+m*_+_*.18,S=_*.64,M=1.9,x=p*r,A=a-(g+M)*r,E=S*r,T=M*r;if(je()<n){let R=je()<.78,y=u.createLinearGradient(0,A,0,A+T);y.addColorStop(0,R?"#ffd98a":"#cfe6ff"),y.addColorStop(1,R?"#f39a2c":"#6aa6e8"),u.globalAlpha=.55+je()*.45,u.fillStyle=y,u.fillRect(x,A,E,T),u.globalAlpha=1,u.fillStyle="rgba(0,0,0,.35)",u.fillRect(x+E*.48,A,2,T),c.fillStyle="#2a2418",c.fillRect(x,A,E,T)}else{let R=c.createLinearGradient(0,A,0,A+T);R.addColorStop(0,"#1b2442"),R.addColorStop(1,"#0a0e1c"),c.fillStyle=R,c.fillRect(x,A,E,T)}c.strokeStyle="rgba(255,255,255,.06)",c.lineWidth=2,c.strokeRect(x,A,E,T)}return c.fillStyle="#07090f",c.fillRect(0,a-i*r,o,i*r),{map:gs(l),emissiveMap:gs(h)}}function s1(s,t,e=800){let[n,i]=ms(1024,256);i.font=`${e} 150px "Inter Tight", "Poppins", system-ui, sans-serif`,i.textAlign="center",i.textBaseline="middle";let r=Math.min(1,940/i.measureText(s).width);return i.font=`${e} ${Math.round(150*r)}px "Inter Tight", "Poppins", system-ui, sans-serif`,i.shadowColor=t,i.shadowBlur=30,i.fillStyle=t,i.fillText(s,512,132),i.shadowBlur=0,i.fillStyle="rgba(255,255,255,.85)",i.fillText(s,512,132),gs(n)}function N_(s,t){let e=new Bc({canvas:s,antialias:!0,powerPreference:"high-performance"}),n=matchMedia("(max-width: 760px)").matches;e.setPixelRatio(Math.min(devicePixelRatio||1,n?1.35:1.75)),e.toneMapping=Ga,e.toneMappingExposure=1.05;let i=new zc;i.background=new Dt("#050812"),i.fog=new kc("#0a1024",.0105);let r=new yn(38,1,.1,400),o=n1(),a=i1();{let[J,lt]=ms(8,512),et=lt.createLinearGradient(0,0,0,512);et.addColorStop(0,"#02030a"),et.addColorStop(.55,"#0a1130"),et.addColorStop(.85,"#1b2350"),et.addColorStop(1,"#2a2a55"),lt.fillStyle=et,lt.fillRect(0,0,8,512);let St=new Ht(new He(600,160),new De({map:gs(J),fog:!1,depthWrite:!1}));St.position.set(0,60,-120),i.add(St)}let l=new Uo(new Rr({map:o,color:"#f7f1d6",fog:!1,transparent:!0,depthWrite:!1}));l.scale.set(16,16,1),l.position.set(48,62,-110),i.add(l);let c=new Ht(new qc(3.2,48),new De({color:new Dt("#fff8e0").multiplyScalar(1.4),fog:!1,toneMapped:!1}));c.position.set(48,62,-109.9),i.add(c);{let lt=new Float32Array(2100);for(let St=0;St<700;St++)lt[St*3]=(je()-.5)*520,lt[St*3+1]=20+je()*110,lt[St*3+2]=-118;let et=new an;et.setAttribute("position",new gn(lt,3)),i.add(new za(et,new ka({color:"#cdd8ff",size:1.4,sizeAttenuation:!1,fog:!1,transparent:!0,opacity:.8})))}i.add(new Qc("#33407a","#05060a",.55));let h=new th("#7f95d8",.35);h.position.set(30,50,20),i.add(h);let u=new Ht(new Ye(160,.3,4.4),new Qe({color:"#161b2a",roughness:.55,metalness:.2}));u.position.set(0,.15,2.2),i.add(u);let f=new Ht(new Ye(160,.32,.25),new Qe({color:"#2b3350",roughness:.6}));f.position.set(0,.16,4.45),i.add(f);let d=new Ht(new He(160,80),new Qe({color:"#06070d",roughness:.18,metalness:.65}));d.rotation.x=-Math.PI/2,d.position.set(0,0,44),i.add(d);for(let J=-76;J<76;J+=6){let lt=new Ht(new He(2.6,.16),new De({color:"#3a4060",transparent:!0,opacity:.55}));lt.rotation.x=-Math.PI/2,lt.position.set(J,.01,12),i.add(lt)}let _=[];function g(J,lt,et,St,me=9){let At=new Ht(new He(lt,me),new De({map:a,color:et,transparent:!0,opacity:St,blending:xi,depthWrite:!1}));return At.rotation.x=-Math.PI/2,At.position.set(J,.02,4.6+me/2),i.add(At),_.push(At),At}function m(J,lt,et,St,me){let At=new Ht(new He(et,et*.6),new De({map:o,color:St,transparent:!0,opacity:me,blending:xi,depthWrite:!1}));return At.rotation.x=-Math.PI/2,At.position.set(J,.32,lt),i.add(At),At}let p=[],S=[{x:-38,w:10,h:17,base:["#151a2c","#0e1220"],lit:.5},{x:-27,w:9.5,h:12.5,base:["#1a1f33","#10131f"],lit:.55,sign:"PIZZA",c:"#ff6a4d",glass:"#ffb35c"},{x:-17,w:8.6,h:9.6,base:["#1c2238","#121625"],lit:.45,sign:"DENTAL",c:"#5fd3ff",glass:"#bfe8ff"},{x:-8.6,w:7,h:14,base:["#171c2e","#0f1220"],lit:.4},{x:8.8,w:7.4,h:10.5,base:["#1b2136","#111523"],lit:.5,sign:"AUTO SHOP",c:"#8cff7a",glass:"#d8ffc9"},{x:17.6,w:8.6,h:14.5,base:["#181d30","#0f1220"],lit:.55,sign:"BAKERY",c:"#ff9fdc",glass:"#ffd6a0"},{x:27.2,w:9.2,h:11,base:["#1a2034","#10131f"],lit:.5,sign:"CAFE",c:"#ffd36b",glass:"#ffc27a"},{x:38,w:10,h:16,base:["#151a2c","#0e1220"],lit:.45}],M=new Qe({color:"#0b0e18",roughness:.9});for(let J of S){let lt=Vd({w:J.w,h:J.h,base:J.base,litRatio:J.lit}),et=new Qe({map:lt.map,emissiveMap:lt.emissiveMap,emissive:"#ffffff",emissiveIntensity:1.6,roughness:.85}),St=new Ht(new Ye(J.w,J.h,7),[M,M,M,M,et,M]);St.position.set(J.x,J.h/2,-3.5),i.add(St);let me=new Ht(new Ye(J.w+.5,.45,7.4),new Qe({color:"#232a44",roughness:.8}));if(me.position.set(J.x,J.h+.2,-3.5),i.add(me),J.sign){let At=J.w-1.6,Se=new Ht(new He(At,2.6),new De({color:new Dt(J.glass).multiplyScalar(.62),toneMapped:!1}));Se.position.set(J.x,1.65,.02),i.add(Se);for(let F=-1;F<=1;F+=2){let k=new Ht(new Ye(.12,2.6,.08),M);k.position.set(J.x+F*At/6,1.65,.06),i.add(k)}let w=new Ht(new Ye(J.w-.6,.14,1.5),new Qe({color:J.c,roughness:.7,emissive:J.c,emissiveIntensity:.08}));w.position.set(J.x,3.25,.65),w.rotation.x=.28,i.add(w);let D=new Ht(new He(J.w-1.2,(J.w-1.2)/4),new De({map:s1(J.sign,J.c),transparent:!0,toneMapped:!1,color:new Dt("#ffffff").multiplyScalar(1.15),depthWrite:!1}));D.position.set(J.x,4.5,.05),i.add(D),g(J.x,At*.9,J.glass,.22),g(J.x,J.w*.5,J.c,.2,12),m(J.x,2.4,At*1.3,J.glass,.18),p.push(new O(J.x,1.6,.3))}}for(let J=0;J<26;J++){let lt=7+je()*10,et=16+je()*34,St=-110+J*8.6+je()*3,me=-26-je()*22,At=Vd({w:lt,h:et,base:["#10142a","#0b0e1c"],litRatio:.22,ground:0,ppm:14}),Se=new Ht(new Ye(lt,et,6),[M,M,M,M,new Qe({map:At.map,emissiveMap:At.emissiveMap,emissive:"#ffffff",emissiveIntensity:1.1,roughness:.9}),M]);Se.position.set(St,et/2,me),i.add(Se)}for(let J of[-21.8,-4.9,4.9,22.4,-33,33]){let lt=new Ht(new No(.09,.12,6.2,12),new Qe({color:"#2b3150",metalness:.6,roughness:.4}));lt.position.set(J,3.1,3.7),i.add(lt);let et=new Ht(new Ye(.9,.18,.5),new Qe({color:"#39405f",metalness:.5,roughness:.4}));et.position.set(J,6.2,3.7),i.add(et);let St=new Ht(new He(.7,.3),new De({color:new Dt("#ffe3a3").multiplyScalar(3),toneMapped:!1,side:oi}));St.rotation.x=Math.PI/2,St.position.set(J,6.1,3.7),i.add(St);let me=new Uo(new Rr({map:o,color:"#ffd98f",transparent:!0,opacity:.55,depthWrite:!1,blending:xi}));if(me.scale.set(4,4,1),me.position.set(J,6.05,3.7),i.add(me),Math.abs(J)<30){let At=new Va("#ffcf7a",34,15,2);At.position.set(J,5.9,3.8),i.add(At)}m(J,4.2,7,"#ffcf7a",.14),g(J,1.4,"#ffd98f",.3,14)}let x=new Ai;i.add(x);let A=9.2,E=11.5;{let J=Vd({w:A,h:E,base:["#1d2338","#121626"],litRatio:0}),lt=new Qe({map:J.map,roughness:.8}),et=new Ht(new Ye(A,E,7),[M,M,M,M,lt,M]);et.position.set(0,E/2,-3.5),x.add(et);let St=new Ht(new Ye(A+.6,.5,7.4),new Qe({color:"#262e4a",roughness:.8}));St.position.set(0,E+.22,-3.5),x.add(St)}let T=[],R=4,y=(A-1.2)/R;for(let J=0;J<2;J++)for(let lt=0;lt<R;lt++){let et=new Ht(new He(y*.64,1.9),new De({color:"#141a2e",toneMapped:!1}));et.position.set(-A/2+.6+lt*y+y/2,3.8+.9+J*3.3+.95,.03),x.add(et),T.push({m:et,k:(J*R+lt)/8})}let v=new Dt("#141a2e"),P=new Dt("#ffc35a").multiplyScalar(.95),U=new De({color:"#10141f",toneMapped:!1}),z=new Ht(new He(3.3,2.6),U);z.position.set(-2.65,1.65,.03),x.add(z);let V=new Ht(new He(3.3,2.6),U);V.position.set(2.65,1.65,.03),x.add(V);let $=new Dt("#10141f"),X=new Dt("#ffd27a").multiplyScalar(.85),Y=new Ht(new He(1.5,2.7),new De({color:new Dt("#ffe2a0").multiplyScalar(1.1),toneMapped:!1,transparent:!0,opacity:0}));Y.position.set(0,1.65,.01),x.add(Y);let W=new Ai;W.position.set(-.75,0,.06),x.add(W);let it=new Ht(new Ye(1.5,2.7,.08),new Qe({color:"#2a3150",roughness:.5,metalness:.3}));it.position.set(.75,1.65,0),W.add(it);let I=new Ht(new Oo(.06,12,12),new Qe({color:"#FDB913",metalness:.8,roughness:.3}));I.position.set(1.3,1.6,.06),W.add(I);for(let J of[-4.4,-.9,.9,4.4]){let lt=new Ht(new Ye(.18,3,.15),M);lt.position.set(J,1.65,.08),x.add(lt)}{let[J,lt]=ms(512,64);for(let St=0;St<16;St++)lt.fillStyle=St%2?"#e0a312":"#b5800c",lt.fillRect(St*32,0,32,64);let et=new Ht(new Ye(A-.4,.14,1.6),new Qe({map:gs(J),roughness:.7,emissive:"#FDB913",emissiveIntensity:0}));et.position.set(0,3.3,.7),et.rotation.x=.28,x.add(et),t._awning=et}let ft=new Ht(new Ye(7.6,1.45,.3),new Qe({color:"#0d1120",roughness:.5,metalness:.4}));ft.position.set(0,4.55,.1),x.add(ft);let[Wt,Ot]=ms(1536,288),Z=gs(Wt),nt=new De({map:Z,transparent:!0,toneMapped:!1,depthWrite:!1}),yt=new Ht(new He(7.3,7.3*288/1536),nt);yt.position.set(0,4.55,.27),x.add(yt);let st="YOUR BUSINESS",Ct=-1,Ut=-1;function Qt(J,lt){Ot.clearRect(0,0,1536,288);let et=st.slice(0,J);Ot.textAlign="center",Ot.textBaseline="middle";let St=150;Ot.font=`800 ${St}px "Inter Tight", "Poppins", system-ui, sans-serif`;let me=Ot.measureText(st).width;me>1420&&(St=Math.floor(St*1420/me),Ot.font=`800 ${St}px "Inter Tight", "Poppins", system-ui, sans-serif`);let At=768-Ot.measureText(st).width/2;if(Ot.textAlign="left",lt>0&&(Ot.shadowColor="#FDB913",Ot.shadowBlur=40*lt),Ot.fillStyle=lt>0?"#FDB913":"#3a4466",Ot.fillText(et,At,150),lt>0&&(Ot.shadowBlur=0,Ot.fillStyle=`rgba(255,248,220,${.75*lt})`,Ot.fillText(et,At,150)),J>0&&J<st.length){let Se=At+Ot.measureText(et).width+10;Ot.fillStyle="#FDB913",Ot.fillRect(Se,150-St*.42,12,St*.84)}J===0&&lt===0&&(Ot.fillStyle="#2c3352",Ot.fillText(st,At,150)),Z.needsUpdate=!0}let se=new De({color:new Dt("#4ee6ff").multiplyScalar(3),toneMapped:!1,transparent:!0,opacity:0,depthWrite:!1}),Yt=new Ht(new He(A+1.2,.07),se);Yt.position.set(0,E,.4),x.add(Yt);let kt=new De({map:o,color:"#36d6ff",transparent:!0,opacity:0,blending:xi,depthWrite:!1}),N=new Ht(new He(A+3,2.2),kt);N.position.set(0,E,.35),x.add(N);let Me=new Wc(new Zc(new Ye(A+.05,E+.05,7.05)),new Ba({color:new Dt("#4ee6ff").multiplyScalar(2),transparent:!0,opacity:0,toneMapped:!1}));Me.position.set(0,E/2,-3.5),x.add(Me);let Zt=new Ht(new He(A,E,12,14),new De({color:"#4ee6ff",wireframe:!0,transparent:!0,opacity:0,toneMapped:!1,depthWrite:!1}));Zt.position.set(0,E/2,.2),x.add(Zt);function H(J){let[lt,et]=ms(128,128);return et.beginPath(),et.arc(64,64,46,0,Math.PI*2),et.fillStyle=J?"#13c97a":"#ff3b55",et.fill(),et.lineWidth=8,et.strokeStyle="rgba(255,255,255,.9)",et.stroke(),et.strokeStyle="#fff",et.lineWidth=12,et.lineCap="round",et.beginPath(),J?(et.moveTo(42,66),et.lineTo(58,82),et.lineTo(88,48)):(et.moveTo(64,38),et.lineTo(64,70),et.moveTo(64,90),et.lineTo(64,91)),et.stroke(),gs(lt)}let Rt=H(!1),fe=H(!0),Nt=[[-3.1,9.6],[2.4,6.3],[-1.2,7.6],[3.4,10.4],[-2.6,2.2],[1.9,1.3],[0,4.6]].map(([J,lt])=>{let et=new Uo(new Rr({map:Rt,transparent:!0,opacity:0,depthWrite:!1,toneMapped:!1}));return et.scale.set(.85,.85,1),et.position.set(J,lt,.7),x.add(et),{s:et,y:lt}}),C=new Ai;x.add(C);{let J=new Qe({color:"#ff2d4a",emissive:"#ff2d4a",emissiveIntensity:.9,roughness:.35,metalness:.2}),lt=new Ht(new Oo(1.15,40,32),J);lt.position.y=1.9,C.add(lt);let et=new Ht(new Yc(1,2.2,40),J);et.rotation.x=Math.PI,et.position.y=.55,C.add(et);let St=new Ht(new Oo(.45,24,24),new De({color:new Dt("#ffffff").multiplyScalar(1.6),toneMapped:!1}));St.position.set(0,1.95,.85),C.add(St)}let b=new Ht(new No(.12,.5,12,24,1,!0),new De({color:"#ff4d63",transparent:!0,opacity:0,blending:xi,depthWrite:!1,side:oi}));b.position.set(0,E+6,-1.5),x.add(b);let G=new Ht(new $c(.9,1.1,96),new De({color:new Dt("#ff4d63").multiplyScalar(2),transparent:!0,opacity:0,toneMapped:!1,side:oi,depthWrite:!1}));G.rotation.x=-Math.PI/2,G.position.set(0,.34,2.4),x.add(G);let tt=G.clone();tt.material=G.material.clone(),x.add(tt);let Q=new jc("#ffc96b",0,16,.95,.6,1.6);Q.position.set(0,3.2,1.5),Q.target.position.set(0,0,4),x.add(Q,Q.target);let K=new Va("#ffcf7a",0,10,2);K.position.set(0,2.2,1.2),x.add(K);let _t=m(0,2.6,12,"#ffcf6a",0),ht=g(0,7,"#ffcf6a",0,12),xt=g(0,6,"#FDB913",0,14),Jt=n?70:120,rt=new Float32Array(Jt*3),ct=new Float32Array(Jt*3),Vt=new Float32Array(Jt),Bt=[],wt=new O(0,1.5,.4);function te(J,lt){J.a=new O((je()-.5)*64,.6+je()*.6,5+je()*12),J.comp=p[Math.floor(je()*p.length)].clone().add(new O((je()-.5)*3,je()*.8,0)),J.h=2.5+je()*6,J.t=lt??0,J.sp=.1+je()*.12}for(let J=0;J<Jt;J++){let lt={r:je()};te(lt,je()),Bt.push(lt)}let zt=new an;zt.setAttribute("position",new gn(rt,3)),zt.setAttribute("color",new gn(ct,3)),zt.setAttribute("alpha",new gn(Vt,1));let de=new en({transparent:!0,depthWrite:!1,blending:xi,toneMapped:!1,uniforms:{uSize:{value:n?40:52},uPx:{value:e.getPixelRatio()}},vertexShader:`attribute vec3 color; attribute float alpha; varying vec3 vC; varying float vA; uniform float uSize; uniform float uPx;
      void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=uSize*uPx/(-mv.z); gl_Position=projectionMatrix*mv; }`,fragmentShader:"varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); a=a*a; gl_FragColor=vec4(vC*2.4, a*vA); }"});i.add(new za(zt,de));let L=new Dt("#8fe6ff"),dt=new Dt("#ffd24a"),q=new O,j=new O,ut=[];function gt(J,lt,et,St,me){let At=new Ai,Se=new Ht(new Ye(4.2,.9,1.9),new Qe({color:J,metalness:.7,roughness:.3}));Se.position.y=.75,At.add(Se);let w=new Ht(new Ye(2.3,.7,1.7),new Qe({color:"#0b0f1c",metalness:.8,roughness:.2}));w.position.set(-.2,1.5,0),At.add(w);let D=new Ht(new He(.5,.2),new De({color:new Dt("#fff6d6").multiplyScalar(4),toneMapped:!1}));D.position.set(2.11,.85,.6),D.rotation.y=Math.PI/2,At.add(D);let F=D.clone();F.position.z=-.6,At.add(F);let k=new Ht(new He(.4,.16),new De({color:new Dt("#ff2a3a").multiplyScalar(3),toneMapped:!1}));k.position.set(-2.11,.9,.6),k.rotation.y=-Math.PI/2,At.add(k);let B=k.clone();B.position.z=-.6,At.add(B);let ot=new Ht(new He(9,2.6),new De({map:o,color:"#fff1c4",transparent:!0,opacity:.35,blending:xi,depthWrite:!1}));ot.rotation.x=-Math.PI/2,ot.position.set(6.4,.03,0),At.add(ot),et<0&&(At.rotation.y=Math.PI),At.position.set(0,0,lt),i.add(At),ut.push({g:At,dir:et,speed:St,off:me})}gt("#3a4a86",9.5,1,9,0),gt("#7a2f44",14.5,-1,7,40);let qt=new lh(e);qt.addPass(new ch(i,r));let pe=new Ho(new Xt(256,256),.72,.5,.72);qt.addPass(pe),qt.addPass(new hh);let ve=1,pt=1,It=0,ee=0;function vt(){ve=s.clientWidth,pt=s.clientHeight,e.setSize(ve,pt,!1),qt.setSize(ve,pt),pe.resolution.set(ve/2,pt/2),r.aspect=ve/pt,r.fov=r.aspect<.8?58:r.aspect<1.2?48:36;let J=ve>760;It=J?-ve*.17:0,ee=J?0:pt*.06,r.setViewOffset(ve,pt,It,ee,ve,pt),r.updateProjectionMatrix(),de.uniforms.uPx.value=e.getPixelRatio()}vt();let Kt=new O,Tt={x:0,y:0,tx:0,ty:0};addEventListener("pointermove",J=>{Tt.tx=J.clientX/innerWidth-.5,Tt.ty=J.clientY/innerHeight-.5},{passive:!0});let $t=performance.now();function Ve(J){let lt=Math.min(.05,(J-$t)/1e3);$t=J;let et=J/1e3;Tt.x+=(Tt.tx-Tt.x)*.04,Tt.y+=(Tt.ty-Tt.y)*.04,r.position.set(t.cx+Tt.x*1.2,t.cy-Tt.y*.6,t.cz),Kt.set(t.lx,t.ly,t.lz),r.lookAt(Kt);let St=E+.6-t.scan*(E+1.2);Yt.position.y=St,N.position.y=St;let me=t.scan>.001&&t.scan<.999?1:0;se.opacity=me,kt.opacity=.55*me,Me.material.opacity=t.wire*.9,Zt.material.opacity=t.wire*.16;for(let F of Nt){let k=St<F.y;F.s.material.map=k?fe:Rt,F.s.material.opacity=t.wire*(k?1-t.fixed:1),F.s.scale.setScalar(.85+(k?.15:Math.sin(et*6+F.y)*.06))}U.color.copy($).lerp(X,t.fixed);let At=Math.round(t.sign*st.length),Se=Math.round(t.signLit*20)/20;(At!==Ct||Se!==Ut)&&(Ct=At,Ut=Se,Qt(At,Se)),t._awning.material.emissiveIntensity=.25*t.signLit,C.position.set(0,E+1.4+(1-t.pin)*30+Math.sin(et*2)*.12*t.pin,-1.5),C.rotation.y=et*.8,C.visible=t.pin>.01,b.material.opacity=.35*t.ring;let w=t.ring,D=et*.45%1;G.scale.setScalar(1+w*9),G.material.opacity=(1-w)*(t.pin>.99?1:0),tt.scale.setScalar(1+D*7),tt.material.opacity=(1-D)*.3*t.ring*(1-t.door*.7),W.rotation.y=-1.35*e1(t.door),Y.material.opacity=t.door,Q.intensity=26*t.door,K.intensity=10*t.door,_t.material.opacity=.1*t.fixed+.32*t.door,ht.material.opacity=.14*t.fixed+.3*t.door,xt.material.opacity=.28*t.signLit;for(let F of T){let k=t1((t.lit-F.k*.8)*4,0,1);F.m.material.color.copy(v).lerp(P,k)}for(let F=0;F<Jt;F++){let k=Bt[F];k.t+=lt*k.sp,k.t>=1&&te(k,0);let B=k.r<t.attract,ot=B?wt:k.comp,at=k.t;q.copy(k.a).lerp(ot,.5),q.y+=k.h,j.copy(k.a).multiplyScalar((1-at)*(1-at)).addScaledVector(q,2*at*(1-at)).addScaledVector(ot,at*at),rt[F*3]=j.x,rt[F*3+1]=j.y,rt[F*3+2]=j.z;let mt=B?dt:L;ct[F*3]=mt.r,ct[F*3+1]=mt.g,ct[F*3+2]=mt.b,Vt[F]=Math.sin(Math.PI*at)*t.sig}zt.attributes.position.needsUpdate=!0,zt.attributes.color.needsUpdate=!0,zt.attributes.alpha.needsUpdate=!0;for(let F of ut){let k=(et*F.speed+F.off)%140-70;F.g.position.x=F.dir>0?k:-k}qt.render()}let re=new O;function Re(J,lt,et){return re.set(J,lt,et).project(r),[(re.x+1)/2*ve,(1-re.y)/2*pt,re.z<1]}return{render:Ve,resize:vt,project:Re,setSign(J){st=J,Ct=-1},anchors:{stores:p,sign:[0,4.55,.3],pin:[0,E+3.6,-1.5],door:[0,2.2,.4],street:()=>Bt.slice(0,12).map(J=>J.a)},renderer:e}}Je.registerPlugin(ie);var qa={whatsapp:"917009775189",email:"seo@businesssanta.com",metaPixelId:"28943176985310116"},Mt=s=>document.querySelector(s),ln=s=>[...document.querySelectorAll(s)],Yd=matchMedia("(prefers-reduced-motion: reduce)").matches,Ii=()=>innerWidth<=760,_s=s=>String(s).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t]),V_=(s,t,e)=>Math.max(t,Math.min(e,s));Mt("#yr").textContent=new Date().getFullYear();(function(s,t,e,n,i,r,o){s.fbq||(i=s.fbq=function(){i.callMethod?i.callMethod.apply(i,arguments):i.queue.push(arguments)},s._fbq||(s._fbq=i),i.push=i,i.loaded=!0,i.version="2.0",i.queue=[],r=t.createElement(e),r.async=!0,r.src=n,o=t.getElementsByTagName(e)[0],o.parentNode.insertBefore(r,o))})(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");fbq("init",qa.metaPixelId);fbq("track","PageView");var Zd=(s,t)=>{try{window.fbq&&fbq("track",s,t||{})}catch{}},$a=(s,t)=>{try{window.fbq&&fbq("trackCustom",s,t||{})}catch{}},Ja={plumbing:{worth:350,l:"Plumbing",pn:"Rivera Plumbing",pw:"riveraplumbing.com",sign:"YOUR PLUMBING CO.",n:"Your Plumbing Co.",q:"plumber near me",svc:"Plumber",qs:["plumber near me","emergency plumber open now","water heater repair","who fixes leaky pipes"],c:["Mike's Plumbing","FastFlow Pipe Co.","City Rooter Pros"],a:"plumber",why:'"plumber near me"',book:"Water heater check, tomorrow 10 AM"},restaurant:{worth:60,l:"Restaurant",pn:"Rosa's Kitchen",pw:"rosaskitchen.com",sign:"YOUR RESTAURANT",n:"Your Restaurant",q:"best restaurant near me",svc:"Restaurant",qs:["best restaurant near me","dinner open late","takeout near me","good spot for date night"],c:["Tony's Grill","Main Street Diner","The Corner Kitchen"],a:"restaurant",why:'"dinner near me"',book:"Table for 4, Friday 7 PM"},dental:{worth:300,l:"Dental",pn:"Lakeside Dental",pw:"lakesidedental.com",sign:"YOUR DENTAL OFFICE",n:"Your Dental Office",q:"dentist near me",svc:"Dentist",qs:["dentist near me","emergency dentist today","teeth cleaning near me","dentist taking new patients"],c:["Bright Smile Dental","Family Dental Care","Downtown Dentistry"],a:"dentist",why:'"dentist near me"',book:"New patient cleaning, Monday 9 AM"},roofing:{worth:1500,l:"Roofing",pn:"Summit Roofing",pw:"summitroofing.com",sign:"YOUR ROOFING CO.",n:"Your Roofing Co.",q:"roofer near me",svc:"Roofer",qs:["roofer near me","roof leak repair","storm damage roof","new roof cost"],c:["Top Notch Roofing","Peak Roof Pros","All Weather Roofing"],a:"roofer",why:'"roof leak repair"',book:"Free roof estimate, Thursday 2 PM"},salon:{worth:80,l:"Salon or spa",pn:"Bella Hair Studio",pw:"bellahairstudio.com",sign:"YOUR SALON",n:"Your Salon",q:"hair salon near me",svc:"Hair salon",qs:["hair salon near me","haircut open now","nail salon walk in","best massage nearby"],c:["Glow Studio","Main Street Cuts","Luxe Hair Bar"],a:"salon",why:'"haircut near me"',book:"Cut and color, Saturday 11 AM"},law:{worth:1500,l:"Law office",pn:"Carter Law Firm",pw:"carterlawfirm.com",sign:"YOUR LAW OFFICE",n:"Your Law Office",q:"lawyer near me",svc:"Lawyer",qs:["lawyer near me","car accident lawyer","free consultation attorney","family lawyer near me"],c:["Smith and Cole Law","Justice Legal Group","Parker Law Office"],a:"lawyer",why:'"lawyer near me"',book:"Free consultation, Wednesday 3 PM"},store:{worth:50,l:"Shop or store",pn:"Willow Gift Shop",pw:"willowgiftshop.com",sign:"YOUR STORE",n:"Your Store",q:"gift shop near me",svc:"Gift shop",qs:["gift shop near me","store open Sunday","local boutique","unique gifts nearby"],c:["The Gift Box","Maple and Co.","Corner Boutique"],a:"shop",why:'"gift shop near me"',book:"Order pickup, today 5 PM"},other:{worth:150,l:"Something else",pn:"Rivera and Sons",pw:"riveraandsons.com",sign:"YOUR BUSINESS",n:"Your Business",q:"best service near me",svc:"Local business",qs:["best service near me","open now near me","top rated near me","who can help with this"],c:["Main Street Pros","Hometown Experts","City Service Co."],a:"local business",why:'"near me"',book:"Appointment, tomorrow 10 AM"}},Ka="plumbing",ci=null,Xi={sam:-1,sak:-1,ai:-1,chat:-1},Ya=Mt("#fType"),r1=Mt("#chips");for(let[s,t]of Object.entries(Ja)){let e=document.createElement("button");e.type="button",e.textContent=t.l,e.dataset.k=s,e.setAttribute("aria-pressed",s===Ka),e.addEventListener("click",()=>{$d(s),$a("ChoseBusinessType",{type:t.l})}),r1.appendChild(e);let n=document.createElement("option");n.value=s,n.textContent=t.l,Ya.appendChild(n)}Ya.addEventListener("change",()=>$d(Ya.value));var G_=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"");function $s(s,t,e,n){return`<div class="res${n?" me":""}"><div class="u">${G_(s)}.com</div><div class="t">${_s(s)}</div><div class="st">\u2605\u2605\u2605\u2605\u2605 ${t} <span>(${e}) \xB7 Open now</span></div></div>`}var Xa="",W_="",Wd="";function $d(s){Ka=s;let t=Ja[s];ln("#chips button").forEach(e=>e.setAttribute("aria-pressed",e.dataset.k===s)),Ya.value=s,Mt("#fName").placeholder=t.pn,Mt("#fSite").placeholder=t.pw,Mt("#eMail").placeholder="maria@"+t.pw,ln(".qtxt").forEach(e=>e.textContent=t.q),Mt("#resBefore").innerHTML=t.c.map((e,n)=>$s(e,(4.6+n*.1).toFixed(1),120+n*47,!1)).join(""),Mt("#resAfter").innerHTML=$s(t.n,"4.9",86,!0)+$s(t.c[0],"4.7",164,!1)+$s(t.c[1],"4.6",97,!1)+$s(t.c[2],"4.5",71,!1),Mt("#bResults").innerHTML=$s(t.n,"4.9",86,!0)+$s(t.c[0],"4.7",164,!1)+$s(t.c[1],"4.6",97,!1),ln(".bName").forEach(e=>e.textContent=t.n),Mt("#mapName").textContent=t.n,Mt("#aiQ").textContent=`Who's a good ${t.a} near me?`,Wd=`A great option nearby is <b>${_s(t.n)}</b>, and people mention fast replies, fair prices and friendly service.`,Mt("#bAiQ").textContent=`Who's a good ${t.a} near me?`,Mt("#bAiA").innerHTML=`A great option nearby is <b>${_s(t.n)}</b>, and customers mention:<ul><li>Fast replies</li><li>Fair, upfront prices</li><li>Friendly service</li></ul>`,Mt("#bBook").textContent=t.book,Mt("#sakWhy").textContent=`People type ${t.why}, not fancy business words.`,Mt("#sakUrl").textContent=G_(t.n)+".com",Xa=`${t.n} | ${t.svc} in Your Town`,W_=`Open now. Fast, friendly ${t.a} service with upfront prices. Call today or book online.`,ci&&ci.setSign(t.sign),Mt("#wVal").value=t.worth,typeof qd=="function"&&qd(),Xi.sak=-1,Xi.ai=-1}var Oe={cx:0,cy:4.6,cz:36,lx:0,ly:5.6,lz:0,scan:0,wire:0,fixed:0,sign:0,signLit:0,pin:0,ring:0,attract:0,door:0,lit:0,sig:1,kw:0,ai:0,chat:0,samv:0};try{ci=N_(Mt("#gl"),Oe)}catch(s){console.warn("WebGL unavailable",s),document.documentElement.classList.add("no-gl")}$d(Ka);addEventListener("resize",()=>{ci&&ci.resize(),ie.refresh()});var xs=null;Yd||(xs=new Qm({duration:1.15,easing:s=>Math.min(1,1.001-Math.pow(2,-10*s)),smoothWheel:!0}),xs.on("scroll",ie.update),Je.ticker.add(s=>xs.raf(s*1e3)),Je.ticker.lagSmoothing(0));var X_=s=>{xs?xs.scrollTo(s,{offset:-20,duration:1.6}):s.scrollIntoView()},vi={hero:[0,4.6,36,0,5.6,0],prob:[-9,3.4,24,-6,4.2,0],sam:[5.5,5.2,17,0,5.6,0],sak:[-3,5,11,0,4.6,0],man:[0,10,28,0,8.4,0],jyo:[3.2,2.6,13.5,0,2.6,0],res:[0,8.5,40,0,5.2,0],cta:[0,6.5,35,0,5.6,0]};Ii()&&Object.assign(vi,{hero:[0,4.2,40,0,6.4,0],prob:[-6,3.6,30,-4,5.4,0],sam:[3,5.4,24,0,6.6,0],sak:[-1.5,5,17,0,5.4,0],man:[0,8,34,0,10.8,0],jyo:[2.4,3,17,0,3.4,0],res:[0,8,46,0,7,0],cta:[0,6.5,40,0,7,0]});var xe=Je.timeline({defaults:{ease:"none"},paused:!0}),Lr=(s,t,e=.8,n="power2.inOut")=>xe.to(Oe,{cx:vi[s][0],cy:vi[s][1],cz:vi[s][2],lx:vi[s][3],ly:vi[s][4],lz:vi[s][5],duration:e,ease:n},t),Dr=(s,t,e=.3)=>xe.fromTo(s,{autoAlpha:0,y:40},{autoAlpha:1,y:0,duration:e,ease:"power3.out"},t),Ur=(s,t,e=.25)=>xe.to(s,{autoAlpha:0,y:-30,duration:e,ease:"power2.in"},t);function fh(s,t,e){let n=Mt(s);xe.fromTo(n,{autoAlpha:0,x:Ii()?0:-60,y:Ii()?80:0,clipPath:"inset(0% 100% 0% 0% round 28px)"},{autoAlpha:1,x:0,y:0,clipPath:"inset(0% 0% 0% 0% round 28px)",duration:.35,ease:"power3.out"},t),xe.fromTo(n.querySelectorAll(".kick,h2,p"),{y:28,autoAlpha:0},{y:0,autoAlpha:1,duration:.22,stagger:.06,ease:"power3.out"},t+.1),xe.fromTo(n.querySelector(".get"),{y:20,autoAlpha:0,scale:.96},{y:0,autoAlpha:1,scale:1,duration:.22,ease:"back.out(2)"},t+.3),xe.fromTo(n.querySelector(".by"),{x:-20,autoAlpha:0},{x:0,autoAlpha:1,duration:.2,ease:"power3.out"},t+.38),xe.to(n,{autoAlpha:0,x:Ii()?0:-40,y:Ii()?60:0,duration:.25,ease:"power2.in"},e)}xe.set("#pHero",{autoAlpha:1,y:0},0);Ur("#pHero",.55);Lr("prob",.5,.9);Dr("#pProblem",.95);xe.fromTo("#hPhone",{autoAlpha:0,y:80,rotate:4},{autoAlpha:1,y:0,rotate:0,duration:.35,ease:"power3.out"},1);Ur("#pProblem",1.85);xe.to("#hPhone",{autoAlpha:0,y:60,duration:.25},1.85);Lr("sam",1.95,.8);fh("#cSam",2.15,3.35);Dr("#hSam",2.35);xe.to(Oe,{wire:1,duration:.2},2.35);xe.to(Oe,{scan:1,samv:1,duration:.6,ease:"power1.inOut"},2.5);xe.to(Oe,{fixed:1,duration:.25},2.95);xe.to(Oe,{wire:0,duration:.2},3.2);Ur("#hSam",3.35);Lr("sak",3.3,.8);fh("#cSak",3.5,4.7);Dr("#hSak",3.7);xe.to(Oe,{sign:1,kw:1,duration:.55},3.75);xe.to(Oe,{signLit:1,duration:.2,ease:"power2.out"},4.3);Ur("#hSak",4.7);Lr("man",4.65,.8);fh("#cMan",4.85,6.05);xe.to(Oe,{pin:1,duration:.4,ease:"bounce.out"},5);xe.to(Oe,{ring:1,duration:.45,ease:"power2.out"},5.4);xe.to(Oe,{attract:.55,duration:.6},5.4);Dr("#hMan",5.4);xe.to(Oe,{ai:1,duration:.4},5.5);Ur("#hMan",6.05);Lr("jyo",6,.8);fh("#cJyo",6.2,7.45);xe.to(Oe,{door:1,duration:.4,ease:"power2.inOut"},6.4);xe.to(Oe,{lit:1,duration:.6},6.7);Dr("#hJyo",6.55);xe.to(Oe,{chat:1,duration:.6},6.65);Ur("#hJyo",7.45);Lr("res",7.4,1,"power2.inOut");xe.to(Oe,{attract:.95,duration:.8},7.5);Dr("#pResult",7.85);xe.fromTo("#hPhone",{autoAlpha:0,y:80},{autoAlpha:1,y:0,duration:.35,ease:"power3.out"},7.9);xe.set("#svBefore",{opacity:0},7.9);xe.set("#svAfter",{opacity:1},7.9);xe.to("#call",{opacity:1,duration:.15},8.35);Ur("#pResult",8.85);xe.to("#hPhone",{autoAlpha:0,y:60,duration:.25},8.85);Lr("cta",8.9,.7);Dr("#pCta",9.1);xe.to({},{duration:.4},9.4);var Za=xe.duration(),q_=[["The problem",0,1.9],["Get seen",1.9,3.35],["Get chosen",3.35,4.7],["Get recommended",4.7,6.05],["Stay in the loop",6.05,7.45],["Get calls",7.45,Za]];Mt("#prog").innerHTML=q_.map(s=>`<span>${s[0]}</span><i><b></b></i>`).join("").replace(/<i><b><\/b><\/i>$/,"");var o1=ln("#prog span"),O_=ln("#prog i b"),F_=ie.create({trigger:"#stage",start:"top top",end:()=>"+="+Math.round(innerHeight*(Ii()?8:7)),pin:!0,scrub:Yd?!0:1.1,animation:xe,onUpdate:s=>{let t=s.progress*Za;q_.forEach((e,n)=>{o1[n].classList.toggle("on",t>=e[1]&&t<e[2]),O_[n]&&(O_[n].style.transform=`scaleX(${V_((t-e[1])/(e[2]-e[1]),0,1)})`)}),Mt("#hint").style.opacity=s.progress>.01?0:1}}),Y_=Mt("#labels"),a1=[0,1,2].map(()=>{let s=document.createElement("div");return s.className="kw",Y_.appendChild(s),s});function l1(){let s=Ja[Ka],t=Math.round(54+42*Oe.samv);if(t!==Xi.sam){Xi.sam=t,Mt("#samNum").textContent=t;let o=Mt("#samRing");o.style.setProperty("--v",t),o.style.setProperty("--c",t<70?"#ff5d6c":t<88?"#FDB913":"#2fd58a"),Mt("#samLbl").textContent=t<70?"Needs work":t<88?"Getting better":"Healthy",Mt("#samTxt").textContent=t<70?"Google has trouble reading this site.":t<88?"Problems are being fixed.":"Google can read and trust this site.",ln("#samTicks li").forEach((a,l)=>a.classList.toggle("on",Oe.samv>.3+l*.25))}let e=Math.round(Oe.sign*Xa.length);e!==Xi.sak&&(Xi.sak=e,Mt("#sakTitle").innerHTML=_s(Xa.slice(0,e))+(e<Xa.length?'<span class="caret"></span>':""),Mt("#sakDesc").textContent=e>=Xa.length?W_:"");let n=Wd.replace(/<[^>]+>/g,""),i=Math.round(Oe.ai*n.length);i!==Xi.ai&&(Xi.ai=i,Mt("#aiA").innerHTML=i>=n.length?Wd:_s(n.slice(0,i))+'<span class="caret" style="background:#151826"></span>');let r=Math.floor(Oe.chat*4.2);if(r!==Xi.chat&&(Xi.chat=r,["#m1","#m2","#m3","#m4"].forEach((o,a)=>Mt(o).classList.toggle("on",a<r))),ci){let o=ci.anchors.sign;a1.forEach((a,l)=>{let c=V_(Oe.kw*1.6-l*.3,0,1),h=Oe.kw>0&&Oe.kw<1&&c>0&&c<1;if(a.style.opacity=h?Math.sin(Math.PI*c):0,!h)return;a.textContent=s.qs[l];let u=[-7,0,7][l],f=o[0]+(l-1)*1.6,d=u+(f-u)*c,_=1.4+(o[1]-1.4)*c+Math.sin(Math.PI*c)*2.2,g=6*(1-c)+o[2]*c,[m,p]=ci.project(d,_,g);a.style.transform=`translate(${m}px,${p}px) translate(-50%,-50%) scale(${.8+.4*(1-c)})`})}}var uh=0;function c1(){if(!ci||!Jd||xe.time()>1.9)return;let s=Ja[Ka],t=ci.anchors.street();for(let e=0;e<6;e++){let n=t[(uh+e)%t.length],[i,r,o]=ci.project(n.x,n.y+1.6,n.z),a=Ii()?130:innerWidth*.5;if(o&&i>a&&i<innerWidth-(Ii()?130:80)&&r>(Ii()?innerHeight*.5:120)&&r<innerHeight-60){uh+=e+1;let l=document.createElement("div");l.className="pill",l.textContent=s.qs[uh%s.qs.length],l.style.left=i+"px",l.style.top=r+"px",Y_.appendChild(l),requestAnimationFrame(()=>requestAnimationFrame(()=>l.classList.add("show"))),setTimeout(()=>{l.classList.remove("show"),setTimeout(()=>l.remove(),500)},2200);return}}uh++}Yd||setInterval(c1,1100);var Jd=!0;new IntersectionObserver(s=>s.forEach(t=>Jd=t.isIntersecting),{threshold:0}).observe(Mt("#stage"));Je.ticker.add(()=>{ci&&!document.hidden&&ci.render(performance.now()),Jd&&l1()});Je.timeline({scrollTrigger:{trigger:"#stories",start:"top bottom",endTrigger:"#final",end:"bottom bottom",scrub:1.6}}).fromTo("#dim",{opacity:0},{opacity:.8,duration:.08,ease:"none",immediateRender:!1},0).fromTo(Oe,{cx:vi.cta[0],cy:vi.cta[1],cz:vi.cta[2],lx:vi.cta[3],ly:vi.cta[4],lz:0},{cx:-16,cy:3.6,cz:22,lx:-8,ly:4.6,lz:0,duration:.35,ease:"sine.inOut",immediateRender:!1},0).to(Oe,{cx:14,cy:4.4,cz:20,lx:6,ly:5,duration:.35,ease:"sine.inOut"},.35).to(Oe,{cx:0,cy:5.4,cz:Ii()?34:27,lx:0,ly:Ii()?7:5.8,duration:.3,ease:"power2.inOut"},.7);Je.fromTo("#dim",{opacity:.8},{opacity:.12,ease:"none",immediateRender:!1,scrollTrigger:{trigger:"#final",start:"top 75%",end:"center center",scrub:1}});var Gd=[0,1.45,3.15,4.5,5.9,7.25,8.6,Za],B_=null;function h1(s){let t=xs.scroll,e=F_.start,n=F_.end;if(t<e-2||t>n+2)return;let i=(t-e)/(n-e)*Za;if(Gd.some(o=>Math.abs(o-i)<.06))return;let r=s>=0?Gd.find(o=>o>=i):[...Gd].reverse().find(o=>o<=i);r!=null&&xs.scrollTo(e+r/Za*(n-e),{duration:1.1,easing:o=>1-Math.pow(1-o,3)})}xs&&xs.on("scroll",s=>{clearTimeout(B_);let t=s.direction;B_=setTimeout(()=>h1(t),170)});ln(".split").forEach(s=>{s.innerHTML=s.textContent.split(" ").map(t=>`<span class="w"><span>${_s(t)}</span></span>`).join(" ")});ln(".split").forEach(s=>Je.to(s.querySelectorAll(".w>span"),{y:0,duration:1,ease:"power4.out",stagger:.045,scrollTrigger:{trigger:s,start:"top 85%"}}));ln(".rv").forEach(s=>Je.to(s,{opacity:1,y:0,duration:1.1,ease:"power3.out",scrollTrigger:{trigger:s,start:"top 88%",onEnter:()=>s.classList.add("in")}}));Je.utils.toArray(".bento .tile").forEach((s,t)=>Je.fromTo(s,{y:70,opacity:0},{y:0,opacity:1,duration:1.1,ease:"power3.out",delay:t%2*.12,scrollTrigger:{trigger:s,start:"top 88%",onEnter:()=>s.classList.add("in")}}));Je.to("#under span",{opacity:1,y:0,ease:"power2.out",stagger:.06,scrollTrigger:{trigger:".berg",start:"top 75%",end:"bottom 60%",scrub:1}});Je.to(".office img",{scale:1,ease:"none",scrollTrigger:{trigger:".office",start:"top bottom",end:"bottom top",scrub:!0}});Je.fromTo(".final .bgp img",{yPercent:-10},{yPercent:6,ease:"none",scrollTrigger:{trigger:".final",start:"top bottom",end:"bottom top",scrub:!0}});ln(".tile").forEach(s=>s.addEventListener("pointermove",t=>{let e=s.getBoundingClientRect();s.style.setProperty("--mx",t.clientX-e.left+"px"),s.style.setProperty("--my",t.clientY-e.top+"px")}));new IntersectionObserver((s,t)=>s.forEach(e=>{e.isIntersecting&&(t.disconnect(),ln(".num b").forEach(n=>{let i=+n.dataset.n,r=+(n.dataset.d||0),o=n.dataset.s||"",a={v:0};Je.to(a,{v:i,duration:1.6,ease:"power3.out",onUpdate:()=>n.textContent=(r?a.v.toFixed(r):Math.round(a.v).toLocaleString("en-US"))+o})}))}),{threshold:.3}).observe(Mt(".nums"));ie.create({start:40,onUpdate:s=>Mt("#hd").classList.toggle("solid",s.scroll()>40)});ie.create({trigger:"#get",start:"top 80%",onToggle:s=>Mt("#bar").classList.toggle("on",s.isActive||s.progress>0),end:"max"});var Xd=[{u:"thecini07",svc:"Technical fixes",d:7,q:"I'm not a website or technology person at all, so having someone who takes the time to explain things and answer my questions means a lot to me."},{u:"metablazetoken",svc:"Online store SEO",d:4,q:"The team was professional, polite, well-spoken, and highly knowledgeable."},{u:"jahlisa",svc:"Online store SEO",d:6,q:"They provided a very detailed report that went above and beyond what we were expecting."},{u:"concord79",svc:"Full SEO package",d:4,q:"Working with Manav was one of the best decisions I made during the launch of my business."},{u:"vkannan09",svc:"Technical fixes",d:3,q:"Manav and team were exceptional."},{u:"lightcommittee",svc:"Google-readable pages",d:3,q:"Hired to fix my schema across main service pages and blog pages."}],u1='<svg class="flag" viewBox="0 0 19 10" aria-hidden="true"><rect width="19" height="10" fill="#B22234"/><g fill="#fff"><rect y=".77" width="19" height=".77"/><rect y="2.31" width="19" height=".77"/><rect y="3.85" width="19" height=".77"/><rect y="5.38" width="19" height=".77"/><rect y="6.92" width="19" height=".77"/><rect y="8.46" width="19" height=".77"/></g><rect width="7.6" height="5.4" fill="#3C3B6E"/></svg>',k_=s=>`<article class="job"><div class="top"><span class="svc">${_s(s.svc)}</span><span class="s5" aria-label="5 out of 5 stars">\u2605\u2605\u2605\u2605\u2605</span></div><blockquote>\u201C${_s(s.q)}\u201D</blockquote><div class="meta"><span>${u1} United States</span><span>Done in ${s.d} days</span><span>${_s(s.u)}</span></div></article>`;Mt("#track").innerHTML=Xd.map(k_).join("")+Xd.map(k_).join("");ln("#track .job").slice(Xd.length).forEach(s=>s.setAttribute("aria-hidden","true"));ln('[data-go="check"]').forEach(s=>s.addEventListener("click",t=>{t.preventDefault(),X_(Mt("#check")),setTimeout(()=>Mt("#fName").focus({preventScroll:!0}),1500),$a("OpenedFreeCheck")}));ln('a[href="#get"]').forEach(s=>s.addEventListener("click",t=>{t.preventDefault(),X_(Mt("#get"))}));ln("[data-hand]").forEach(s=>s.addEventListener("click",()=>$a("WentToServices")));function z_(s){if(s.dataset.played)return;s.dataset.played=1;let t=s.querySelector(".scn"),e=s.querySelectorAll(".did li");e.forEach((i,r)=>setTimeout(()=>i.classList.add("on"),250+r*260));let n=250+e.length*260+150;setTimeout(()=>{t.classList.remove("before"),s.classList.add("go"),s.querySelectorAll(".cnt").forEach(r=>{let o={v:+r.dataset.a};Je.to(o,{v:+r.dataset.b,duration:2.2,ease:"power2.out",onUpdate:()=>r.textContent=Math.round(o.v)})});let i=s.dataset.k;if(i==="shop"){let r=s.querySelector(".feed");[["#2041","$86","Linen wrap dress"],["#2042","$142","2 items"],["#2043","$64","Silk scarf"],["#2044","$210","3 items"],["#2045","$98","Summer blouse"]].forEach((a,l)=>setTimeout(()=>{r.insertAdjacentHTML("afterbegin",`<div><i>$</i><span><b>New order ${a[0]} &middot; ${a[1]}</b><span>${a[2]}</span></span></div>`),r.children.length>4&&r.lastElementChild.remove()},l*520)),Je.to(s.querySelectorAll(".boxes i"),{opacity:1,y:0,duration:.5,ease:"bounce.out",stagger:{each:.35,from:"end"},delay:.4})}if(i==="plum"&&s.querySelectorAll(".cal .j").forEach((r,o)=>setTimeout(()=>r.classList.add("on"),o*90)),i==="bake"){let r=s.querySelector(".line");for(let o=0;o<14;o++)r.insertAdjacentHTML("beforeend","<i></i>");Je.to(r.children,{opacity:1,y:0,duration:.4,stagger:.12,ease:"back.out(2)",delay:.3})}},n)}ln(".cal .d").forEach((s,t)=>{for(let e=0;e<4;e++)s.insertAdjacentHTML("beforeend",`<div class="j${(t*4+e)%7===0?" on":""}">${["Leak repair","Water heater","Drain clean","Pipe fix"][e]}</div>`)});var H_=Mt("#strack");if(innerWidth>900){let s=()=>H_.scrollWidth-innerWidth,t=Je.to(H_,{x:()=>-s(),ease:"none",scrollTrigger:{trigger:"#stories",start:"top top",end:()=>"+="+s(),pin:".spin",scrub:1,invalidateOnRefresh:!0}});ln(".sto[data-k]").forEach(e=>ie.create({trigger:e,containerAnimation:t,start:"left 70%",onEnter:()=>z_(e)}))}else{let s=new IntersectionObserver(t=>t.forEach(e=>{e.isIntersecting&&z_(e.target)}),{root:null,threshold:.55});ln(".sto[data-k]").forEach(t=>s.observe(t))}var Kd={second:["Picture cutting the ribbon on your second location.","It starts with more people finding the first one.","Open a second location"],weekends:["Picture a Saturday with your family while the bookings keep coming in.","When customers find you on their own, you stop chasing them.","Take weekends off again"],hire:["Picture handing the keys to your first employee.","Steady customers make that hire possible.","Hire my first people"],legacy:["Picture your kids proud of the business you built.","A business people can find is a business that lasts.","Build something my kids can take over"],pay:["Picture paying yourself what you are worth, every single month.","More customers from people who are already searching.","Finally pay myself properly"],vacation:["Picture a real vacation, with the phone still ringing back home.","Your website and listings keep working while you rest.","Take my family on a real vacation"],slow:["Picture a calendar with no slow months.","Search brings customers in every season.","No more slow months"]},Vo="";ln("#dchips button").forEach(s=>s.addEventListener("click",()=>{Vo=s.dataset.d;let t=Kd[Vo];ln("#dchips button").forEach(e=>e.setAttribute("aria-pressed",e===s)),Je.timeline().to("#dout",{opacity:0,y:10,duration:.2}).add(()=>{Mt("#dBig").textContent=t[0],Mt("#dSmall").textContent=t[1],Mt("#fEyb").textContent="Your goal: "+t[2]}).to("#dout",{opacity:1,y:0,duration:.5,ease:"power3.out"}),$a("ChoseDream",{dream:t[2]})}));function qd(){let s=+Mt("#wVal").value,t=+Mt("#wNum").value,e=n=>"$"+Math.round(n).toLocaleString("en-US");Mt("#wValO").textContent=e(s),Mt("#wNumO").textContent=t,Mt("#wMo").textContent=e(s*t),Mt("#wYr").textContent=e(s*t*12)}["#wVal","#wNum"].forEach(s=>Mt(s).addEventListener("input",()=>{qd()}));Mt("#wNum").addEventListener("change",()=>$a("UsedCalculator"));var Z_=s=>`https://wa.me/${qa.whatsapp}?text=${encodeURIComponent(s)}`,f1=()=>({type:Ja[Ya.value].l,name:Mt("#fName").value.trim(),site:Mt("#fSite").value.trim(),city:Mt("#fCity").value.trim()}),d1=s=>`Hi Business Santa! I'd like my free check.

Business type: ${s.type}
Business name: ${s.name}
Website: ${s.site||"No website yet"}
City: ${s.city}`+(Vo?`
My goal: ${Kd[Vo][2]}`:"");function $_(s){let t=f1(),e="";return t.name?t.city||(e="Add your city and state, so we can check your local competition."):e="Add your business name so we know who you are.",s.textContent=e,e?(Mt(t.name?"#fCity":"#fName").focus(),null):t}["#fName","#fCity"].forEach(s=>Mt(s).addEventListener("input",()=>{Mt("#fErr").textContent="",Mt("#eErr").textContent=""}));Mt("#ckForm").addEventListener("submit",s=>{s.preventDefault();let t=$_(Mt("#fErr"));t&&(Zd("Lead",{content_name:"Free check",method:"WhatsApp",business_type:t.type}),window.open(Z_(d1(t)),"_blank","noopener"))});Mt("#barWa").addEventListener("click",s=>{s.preventDefault(),Zd("Lead",{content_name:"WhatsApp bar",method:"WhatsApp"}),window.open(Z_("Hi Business Santa! I'd like a free check of my business."),"_blank","noopener")});Mt("#altBtn").addEventListener("click",()=>{Mt("#emBox").classList.add("on"),Mt("#altBtn").style.display="none",Mt("#eName").focus()});Mt("#emSend").addEventListener("click",async()=>{let s=$_(Mt("#eErr"));if(!s)return;let t=Mt("#eName").value.trim(),e=Mt("#eMail").value.trim(),n=Mt("#ePhone").value.trim();if(!t){Mt("#eErr").textContent="Add your name so we know who to reply to.",Mt("#eName").focus();return}if(!/^\S+@\S+\.\S+$/.test(e)){Mt("#eErr").textContent="Add an email address we can reply to, like name@yourbusiness.com.",Mt("#eMail").focus();return}let i=Mt("#emSend");i.disabled=!0,i.textContent="Sending\u2026";try{let r=await fetch("https://formsubmit.co/ajax/"+encodeURIComponent(qa.email),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({_subject:`Free check request: ${s.name} (${s.city})`,_template:"box",_captcha:"false",_replyto:e,name:t,email:e,phone:n||"Not given",business_type:s.type,business_name:s.name,website:s.site||"No website yet",city:s.city,goal:Vo?Kd[Vo][2]:"Not chosen",page:location.href})}),o=await r.json().catch(()=>({}));if(!r.ok||String(o.success)==="false")throw new Error("send");Zd("Lead",{content_name:"Free check",method:"Email",business_type:s.type}),Mt("#ckForm").style.display="none",Mt("#done").classList.add("on")}catch{i.disabled=!1,i.textContent="Send my request",Mt("#eErr").innerHTML=`That didn't go through. Try again, or email us at <a href="mailto:`+qa.email+'">'+qa.email+"</a>."}});
