/**
 * Modèle « HTML personnalisé » : la LP est le HTML fourni par Zack (admin → Landing pages → Modèle « HTML »).
 * Ce script relie son formulaire au vrai système de commandes, comme OrderFormPublic :
 *  - formulaire = <form id="orderForm"> (ou data-hz-order) ; champs nom (fullName / customer_name),
 *    téléphone (phone / customer_phone), ville (city / customer_city)
 *  - quantité : #plus / #minus / #quantity (ou #q) ; prix affichés dans #subtotal / #total = offres de la LP (1, 2, 3 pièces…)
 *  - message dans #status (ou #result) ; Lead Meta / TikTok / Google envoyés seulement si la commande est enregistrée
 *  - animations au scroll : éléments avec la classe « hz-reveal » (apparaissent en glissant ; visibles sans JS)
 *  - compte à rebours : élément [data-hz-countdown] contenant <b data-k="d|h|m|s"> ; date de fin = réglage admin
 *    « fin RÉELLE de la promo » (ou valeur de l'attribut « YYYY-MM-DDTHH:mm » heure Maroc, ou « daily » = minuit Maroc chaque jour) ; caché si pas de date / date passée
 * Aucun script du HTML collé n'est exécuté (sécurité) : tout passe par ce pont.
 */
export type HtmlBridgeCfg = {
  slug: string;
  productId: string;
  productName: string;
  pixelId: string | null;
  tiktokPixelId: string | null;
  offers: { id: string; qty: number; price: number }[];
  cities?: string[];               // villes du transporteur (même liste que les autres formulaires)
  countdownEnd?: string;           // fin RÉELLE de la promo (heure Maroc « YYYY-MM-DDTHH:mm »), vide = attribut du HTML
};

/** Ville arabe → nom latin du transporteur (copie du dictionnaire de order-form-public). */
const CITY_AR: Record<string, string> = {
  "الدار البيضاء":"casablanca", "كازا":"casablanca", "كازابلانكا":"casablanca",
  "الرباط":"rabat", "مراكش":"marrakech", "فاس":"fes fez", "طنجة":"tanger tangier",
  "أكادير":"agadir", "مكناس":"meknes", "وجدة":"oujda", "القنيطرة":"kenitra",
  "تطوان":"tetouan", "سلا":"sale", "الجديدة":"jadida", "خريبكة":"khouribga",
  "بني ملال":"beni mellal", "تازة":"taza", "الناظور":"nador", "سطات":"settat",
  "آسفي":"safi", "العرائش":"larache", "الحسيمة":"hoceima", "الرشيدية":"rachidia errachidia",
  "ورزازات":"ouarzazate", "إفران":"ifrane", "زاكورة":"zagora", "طاطا":"tata",
  "العيون":"laayoune", "الداخلة":"dakhla", "برشيد":"berrechid", "الفقيه بن صالح":"fquih ben saleh",
  "تارودانت":"taroudant", "تيفلت":"tiflet", "بركان":"berkane", "الصويرة":"essaouira",
  "شفشاون":"chefchaouen", "ميدلت":"midelt", "قلعة السراغنة":"kelaa sraghna", "خنيفرة":"khenifra",
  "سيدي قاسم":"sidi kacem", "سيدي سليمان":"sidi slimane", "تاونات":"taounate",
};

export function htmlBridgeJs(cfg: HtmlBridgeCfg): string {
  const c = JSON.stringify({ ...cfg, ar: CITY_AR }).replace(/</g, "\\u003c");
  return `(function(){var C=${c};
function lpf(t,f){try{window.dispatchEvent(new CustomEvent('lpf',{detail:{t:t,f:f}}))}catch(e){}}
function ck(n){var m=document.cookie.match('(?:^|; )'+n+'=([^;]*)');return m?decodeURIComponent(m[1]):null}
var Q=new URLSearchParams(location.search);
function cr(){var c=Q.get('cr');if(!c){var u=Q.get('utm_content');if(u&&/^V\\d+$/i.test(u))c=u}var ok=c&&/^[A-Za-z0-9_-]{1,20}$/.test(c)?c.toUpperCase():null;try{if(ok){sessionStorage.setItem('hz_cr',ok);return ok}return sessionStorage.getItem('hz_cr')}catch(e){return ok}}
cr();
function intl(p){var d=String(p).replace(/\\D/g,'');if(d.indexOf('00212')===0)d=d.slice(5);else if(d.indexOf('212')===0)d=d.slice(3);else if(d.charAt(0)==='0')d=d.slice(1);return '+212'+d}
function cityFix(t){var L=C.cities||[],x=String(t).trim(),lo=x.toLowerCase();for(var i=0;i<L.length;i++)if(L[i]===x||L[i].toLowerCase()===lo)return L[i];var tk=C.ar[x];if(tk){var ts=tk.split(' ');for(var j=0;j<L.length;j++){var n=L[j].toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');for(var k=0;k<ts.length;k++)if(n.indexOf(ts[k])>-1)return L[j]}}return x}
function go(){
var f=document.getElementById('orderForm')||document.querySelector('form[data-hz-order]');if(!f)return;
var $=function(id){return document.getElementById(id)};
var el=function(){for(var i=0;i<arguments.length;i++){var e=f.querySelector('[name="'+arguments[i]+'"]')||$(arguments[i]);if(e)return e}return null};
var nameEl=el('customer_name','fullName'),phoneEl=el('customer_phone','phone'),cityEl=el('customer_city','city');
var offers=(C.offers||[]).slice().sort(function(a,b){return a.qty-b.qty});
var maxQ=offers.length?offers[offers.length-1].qty:1;
var q=1;
function offer(){for(var i=0;i<offers.length;i++)if(offers[i].qty===q)return offers[i];return offers[0]||{id:'',qty:1,price:0}}
function show(){var o=offer();var qe=$('quantity')||$('q');if(qe)qe.textContent=q;var t=o.price+' درهم';if($('subtotal'))$('subtotal').textContent=t;if($('total'))$('total').textContent=t}
function step(n){var qs=offers.map(function(o){return o.qty});var i=qs.indexOf(q)+n;if(i<0)i=0;if(i>qs.length-1)i=qs.length-1;q=qs[i]||1;show()}
if($('plus'))$('plus').addEventListener('click',function(){step(1)});
if($('minus'))$('minus').addEventListener('click',function(){step(-1)});
show();
[[nameEl,'name'],[phoneEl,'phone'],[cityEl,'city']].forEach(function(p){if(p[0])p[0].addEventListener('focus',function(){lpf('f',p[1])},{once:true})});
var st=$('status')||$('result'),btn=f.querySelector('[type=submit]'),busy=false;
function msg(t,ok){if(!st){alert(t);return}st.textContent=t;st.style.background=ok?'#e8f6ec':'#fde8e8';st.style.color=ok?'#0b5a33':'#a1221c';st.hidden=false;st.classList.add('show');st.style.display='block'}
f.addEventListener('submit',function(e){e.preventDefault();if(busy)return;lpf('click');
var name=(nameEl&&nameEl.value||'').trim(),phone=(phoneEl&&phoneEl.value||'').replace(/[\\s.-]/g,''),city=(cityEl&&cityEl.value||'').trim();
var err=[];if(name.length<3)err.push('name');if(!/^(?:\\+212|00212|0)[5-8]\\d{8}$/.test(phone))err.push('phone');if(!city)err.push('city');
if(err.length){lpf('err',err.join(','));msg(err[0]==='name'?'دخل الاسم الكامل':err[0]==='phone'?'دخل رقم هاتف مغربي صحيح (06 أو 07)':'اختار المدينة');return}
var o=offer();busy=true;if(btn){btn.disabled=true;btn.dataset.t=btn.textContent;btn.textContent='جاري الإرسال…'}
var tr={};['gclid','gbraid','wbraid','utm_source','utm_campaign'].forEach(function(k){var v=Q.get(k);if(v)tr[k]=v.slice(0,200)});
var body={customer_name:name,customer_phone:phone,customer_city:cityFix(city),customer_address:'سيتم تأكيد العنوان عبر الهاتف',quantity:o.qty,offer_id:o.id,bundle_price:o.price,bumps:[],variants:[],product_id:C.productId,product_slug:C.slug,meta_pixel_id:C.pixelId,meta_fbp:ck('_fbp'),meta_fbc:ck('_fbc'),tiktok_pixel_id:C.tiktokPixelId,tiktok_ttp:ck('_ttp'),tiktok_ttclid:Q.get('ttclid'),creative_code:cr()};
if(Object.keys(tr).length)body.tracking=tr;
fetch('/api/public/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()}).then(function(d){
busy=false;if(btn){btn.disabled=false;btn.textContent=btn.dataset.t||btn.textContent}
if(d&&d.success){lpf('ok');var on=String(d.orderNumber||''),ph=intl(phone);
try{(C.pixelId||'').split(/[,\\s]+/).filter(Boolean).forEach(function(id){window.fbq&&fbq('init',id,{ph:ph.replace('+',''),fn:name.split(' ')[0]||'',ln:name.split(' ').slice(1).join(' '),ct:city,country:'ma'})});window.fbq&&fbq('track','Lead',{value:o.price,currency:'MAD',content_name:C.productName},{eventID:'lead_'+on})}catch(x){}
try{if(window.ttq){ttq.identify({phone_number:ph});ttq.track('SubmitForm',{value:o.price,currency:'MAD',content_id:C.productId,content_type:'product',content_name:C.productName},{event_id:'lead_'+on})}}catch(x){}
try{if(window.gtag&&window.__gadsSendTo){gtag('set','user_data',{phone_number:ph});gtag('event','conversion',{send_to:window.__gadsSendTo,value:o.price,currency:'MAD',transaction_id:on})}}catch(x){}
var box=document.createElement('div');box.style.cssText='text-align:center;padding:26px 14px;background:#e8f6ec;border:2px solid #b7e2c4;border-radius:16px';
box.innerHTML='<div style="font-size:44px">✅</div><h3 style="margin:6px 0;color:#0b5a33">تم استلام طلبك!</h3><p style="margin:0 0 8px;color:#16603b">غادي نتاصلو بيك قريب باش نأكدو الطلب ونحددو موعد التوصيل.</p><p style="font-size:24px;font-weight:900;margin:0;color:#0b5a33">'+o.price+' درهم</p><p style="font-size:13px;color:#4b6b58;margin:4px 0 0">الدفع عند الاستلام</p>';
f.parentNode.replaceChild(box,f);box.scrollIntoView({behavior:'smooth',block:'center'})}
else if(d&&d.errors){var k=Object.keys(d.errors);lpf('err','srv:'+k.join(','));if(d.errors.customer_phone){var dg=phone.replace(/\\D/g,'');lpf('err','ph:'+dg.length+':'+dg.slice(0,2))}msg(d.errors[k[0]]||'تحقق من المعلومات')}
else{lpf('err','srv');msg((d&&d.error)||'وقع خطأ، عاود المحاولة')}
}).catch(function(){busy=false;if(btn){btn.disabled=false;btn.textContent=btn.dataset.t||btn.textContent}lpf('err','net');msg('خطأ في الاتصال، عاود المحاولة')})});
}
function fx(){try{
var rv=function(){var R=document.querySelectorAll('.hz-reveal');if(R.length&&'IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion:reduce)').matches){var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('hz-in');io.unobserve(x.target)}})},{rootMargin:'0px 0px -8% 0px'});for(var i=0;i<R.length;i++){if(R[i].getBoundingClientRect().top>innerHeight){R[i].classList.add('hz-hide');io.observe(R[i])}}}};
// après la fin du chargement : le HTML peut encore être dans un bloc caché (streaming) au moment où le script tourne
if(document.readyState==='complete')setTimeout(rv,50);else addEventListener('load',function(){setTimeout(rv,50)});
}catch(e){}
try{var tm=function(v){var m=/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})/.exec(v||'');return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4]-1,+m[5]):0};
var D=document.querySelectorAll('[data-hz-countdown]');[].forEach.call(D,function(c){var dly=C.countdownEnd==='daily';var nx=function(){var n=Date.now()+36e5;return n-n%864e5+864e5-36e5};var e=dly?nx():(tm(C.countdownEnd)||tm(c.getAttribute('data-hz-countdown')));if(!e)return;var z=function(n){return(n<10?'0':'')+n};
function t(){var d=e-Date.now();if(d<=0&&dly){e=nx();d=e-Date.now()}if(d<=0){c.hidden=true;return false}c.hidden=false;var v={d:Math.floor(d/864e5),h:Math.floor(d/36e5)%24,m:Math.floor(d/6e4)%60,s:Math.floor(d/1e3)%60};[].forEach.call(c.querySelectorAll('[data-k]'),function(b){var k=b.getAttribute('data-k');b.textContent=z(v[k]);if(k==='d'&&b.parentNode!==c)b.parentNode.style.display=v.d?'':'none'});return true}
if(t()){var iv=setInterval(function(){if(!t())clearInterval(iv)},1000)}})}catch(e){}}
function boot(){fx();go()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();})();`;
}

/** Nettoie le HTML collé : garde <style> + contenu du <body>, retire scripts et attributs on*. */
export function cleanCustomHtml(raw: string): string {
  let h = String(raw || "");
  const styles = (h.match(/<style[\s\S]*?<\/style>/gi) ?? []).join("");
  const body = h.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  h = styles + (body ? body[1] : h.replace(/<\/?(?:html|head|body)[^>]*>|<!doctype[^>]*>|<meta[^>]*>|<title[\s\S]*?<\/title>|<link[^>]*>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, ""));
  return h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}
