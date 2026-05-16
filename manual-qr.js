function setManualQrStatus(text,type="info"){
  if(typeof setBox==="function"){setBox("manualQrStatus",text,type);return;}
  const box=document.getElementById("manualQrStatus");
  if(!box)return;
  box.innerText=text;
  box.className="statusBox "+type;
}

function insertManualQrSection(){
  if(document.getElementById("manualQrSection"))return;
  const testButton=document.getElementById("testBagPdfButton");
  const anchor=testButton?testButton.closest(".adminSection"):null;
  const grid=document.querySelector("#adminPanel .adminGrid");
  if(!anchor&&!grid)return;

  const html=`
    <section class="adminSection fullWidth" id="manualQrSection">
      <div class="sectionHeader">
        <div>
          <h2>🔳 Generator dowolnego kodu QR PDF</h2>
          <div class="sectionHint">Wpisz własny tekst do zakodowania oraz podpis widoczny nad kodem QR.</div>
        </div>
      </div>
      <div class="sectionBody">
        <div class="actionStack">
          <div class="roleBox">
            <input id="manualQrLabelInput" placeholder="Podpis na górze, np. Shot Malina" autocomplete="off">
            <input id="manualQrCodeInput" placeholder="Co ma zawierać QR, np. SHOT/MALINA" autocomplete="off">
            <button id="manualQrPdfButton" class="darkBtn">🔳 Generuj PDF z QR</button>
          </div>
          <div class="adminTip">PDF zawiera logo, podpis, kod QR, informację stałą oraz zawartość kodu QR.</div>
          <p id="manualQrStatus" class="statusBox info">Status: wpisz podpis i zawartość QR, a następnie wygeneruj PDF.</p>
        </div>
      </div>
    </section>`;

  if(anchor)anchor.insertAdjacentHTML("afterend",html); else grid.insertAdjacentHTML("beforeend",html);

  const btn=document.getElementById("manualQrPdfButton");
  const label=document.getElementById("manualQrLabelInput");
  const code=document.getElementById("manualQrCodeInput");
  if(btn)btn.addEventListener("click",generateManualQrPdf);
  [label,code].forEach(input=>{
    if(!input)return;
    input.addEventListener("keydown",e=>{if(e.key==="Enter")generateManualQrPdf();});
  });
}

function loadImageAsDataUrl(src){
  return new Promise(resolve=>{
    const img=new Image();
    img.crossOrigin="anonymous";
    img.onload=()=>{
      try{
        const canvas=document.createElement("canvas");
        canvas.width=img.naturalWidth||img.width;
        canvas.height=img.naturalHeight||img.height;
        canvas.getContext("2d").drawImage(img,0,0);
        resolve(canvas.toDataURL("image/png"));
      }catch(e){resolve("");}
    };
    img.onerror=()=>resolve("");
    img.src=src;
  });
}

function pdfSafeText(value){
  return String(value||"")
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e").replace(/ł/g,"l").replace(/ń/g,"n").replace(/ó/g,"o").replace(/ś/g,"s").replace(/ź/g,"z").replace(/ż/g,"z")
    .replace(/Ą/g,"A").replace(/Ć/g,"C").replace(/Ę/g,"E").replace(/Ł/g,"L").replace(/Ń/g,"N").replace(/Ó/g,"O").replace(/Ś/g,"S").replace(/Ź/g,"Z").replace(/Ż/g,"Z")
    .replace(/[–—]/g,"-").replace(/[„”]/g,'"').replace(/[’]/g,"'");
}

function addCenteredText(doc,text,x,y,maxW,fontSize,bold=false,maxLines=99,lineHeight=null){
  doc.setFont("helvetica",bold?"bold":"normal");
  doc.setFontSize(fontSize);
  const lines=doc.splitTextToSize(pdfSafeText(text),maxW).slice(0,maxLines);
  const lh=lineHeight||Math.round(fontSize*1.2);
  lines.forEach((line,i)=>doc.text(line,x,y+i*lh,{align:"center"}));
  return y+Math.max(1,lines.length)*lh;
}

async function generateManualQrPdf(){
  const labelInput=document.getElementById("manualQrLabelInput");
  const codeInput=document.getElementById("manualQrCodeInput");
  const button=document.getElementById("manualQrPdfButton");
  const label=String(labelInput?.value||"").trim();
  const qrContent=String(codeInput?.value||"").trim();

  if(!label){setManualQrStatus("❌ Wpisz podpis, który ma być widoczny nad kodem QR.","bad");labelInput?.focus();return;}
  if(!qrContent){setManualQrStatus("❌ Wpisz tekst, który ma zawierać kod QR.","bad");codeInput?.focus();return;}
  if(!window.jspdf?.jsPDF){setManualQrStatus("❌ Biblioteka jsPDF nie wczytała się.","bad");return;}

  try{
    if(button){button.disabled=true;button.innerText="Generuję PDF...";}
    setManualQrStatus("⏳ Generuję PDF z kodem QR...","info");

    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:"portrait",unit:"px",format:[794,1123],hotfixes:["px_scaling"]});

    const pageW=794;
    const cardW=420;
    const cardH=610;
    const cardX=(pageW-cardW)/2;
    const cardY=58;
    const centerX=pageW/2;
    const logoSize=80;
    const qrSize=300;

    doc.setDrawColor(17,24,39);
    doc.setLineWidth(3);
    doc.roundedRect(cardX,cardY,cardW,cardH,22,22);

    const logo=await loadImageAsDataUrl("logo.png");
    if(logo)doc.addImage(logo,"PNG",centerX-logoSize/2,cardY+26,logoSize,logoSize);

    addCenteredText(doc,label,centerX,cardY+140,cardW-42,28,true,3,34);

    const qrUrl=makeQrDataUrl(qrContent,900);
    doc.addImage(qrUrl,"PNG",centerX-qrSize/2,cardY+200,qrSize,qrSize);

    addCenteredText(doc,"Tymczasowe rozwiazanie kodow QR, ktore nie istnieja na produktach lub tackach sprzedawanych na naszych stronach",centerX,cardY+530,cardW-44,13,false,3,17);

    doc.setDrawColor(220,220,220);
    doc.setLineWidth(1);
    doc.line(cardX+34,cardY+570,cardX+cardW-34,cardY+570);

    doc.setFont("helvetica","bold");
    doc.setFontSize(14);
    doc.text("Zawartosc kodu QR:",centerX,cardY+590,{align:"center"});
    addCenteredText(doc,qrContent,centerX,cardY+607,cardW-44,15,true,2,18);

    doc.save("kod_qr_"+safeFileName(label||qrContent)+".pdf");
    setManualQrStatus("✅ Wygenerowano PDF z kodem QR.\nPodpis: "+label+"\nZawartość QR: "+qrContent,"ok");
  }catch(err){
    setManualQrStatus("❌ Nie udało się wygenerować PDF: "+err.message,"bad");
  }finally{
    if(button){button.disabled=false;button.innerText="🔳 Generuj PDF z QR";}
  }
}

window.addEventListener("DOMContentLoaded",insertManualQrSection);
